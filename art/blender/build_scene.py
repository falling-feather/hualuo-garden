"""Build editable Blender landmarks, portable GLBs, and the authoritative web manifest."""
import sys
import json
import math
import time
import argparse
import uuid
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(Path(__file__).parent))
import bpy
from mathutils import Vector
from geometry import MeshBuilder
from materials import build_materials
from architecture import landmark
from landscape import build_landscape
from route_geometry import transform_port

parser=argparse.ArgumentParser()
parser.add_argument("--only")
parser.add_argument("--render",action="store_true")
parser.add_argument("--no-export",action="store_true")
parser.add_argument("--preview-only",action="store_true",help="With --only, render a component without replacing the master, libraries, GLBs or manifest")
parser.add_argument("--build-id",default=str(uuid.uuid4()),help="Identity of this export, checked by the offline optimization pipeline")
args=parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
if args.preview_only and not args.only:parser.error('--preview-only requires --only LANDMARK_ID')
if args.only and args.no_export and not args.preview_only:parser.error('--only and --no-export produce no web assets; use --preview-only to inspect a single model')
RAW=ROOT/"tmp/raw-models"
RAW.mkdir(parents=True,exist_ok=True)
exported_files=[]
plan=json.loads((ROOT/"art/garden-plan.json").read_text(encoding="utf-8"))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
materials=build_materials(ROOT/"art/textures")
font=bpy.data.fonts.load("C:/Windows/Fonts/simkai.ttf")
manifest={"schema":1,"name":plan["title"],"bounds":plan["bounds"],"water":plan["water"],"paths":[],"landmarks":[],"colliders":[],"surfaces":[]}
world_ports={}
terrain_pads=[]

def export_raw(file):
    result=bpy.ops.export_scene.gltf(filepath=str(file),export_format="GLB",use_selection=True,export_apply=True,
        export_extras=True,export_yup=True,export_animations=False,export_lights=False,export_cameras=False,
        # Intermediate geometry stays exact; the offline pipeline compresses once,
        # with a shared quantization grid for adjoining terrain surfaces.
        export_draco_mesh_compression_enable=False,
        export_vertex_color="ACTIVE",export_all_vertex_colors=False,export_active_vertex_color_when_no_material=False,
        export_image_format="WEBP",export_image_quality=90)
    if "FINISHED" not in result or not file.is_file() or file.stat().st_size<20:
        raise RuntimeError("Raw GLB export failed: "+str(file))
    exported_files.append(file.name)

def make_texts(builder,collection,root):
    for index,item in enumerate(builder.plaques):
        text=bpy.data.curves.new(builder.name+".inscription."+str(index),"FONT")
        text.body=item["text"]
        text.font=font
        text.size=item["size"]
        text.align_x="CENTER"
        text.align_y="CENTER"
        text.extrude=.008
        text.bevel_depth=.0018
        text.bevel_resolution=1
        obj=bpy.data.objects.new(text.name,text)
        collection.objects.link(obj)
        obj.location=item["position"]
        obj.rotation_euler=(math.pi/2,0,item["yaw"])
        obj.parent=root
        obj.data.materials.append(materials[item["material"]])
        obj["landmarkId"]=builder.name
        obj["gardenRole"]="inscription"
        obj["inscriptionText"]=item["text"]
        obj["inscriptionSize"]=item["size"]
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active=obj
        bpy.ops.object.convert(target="MESH")

def scene_lighting(scene):
    world=bpy.data.worlds.new("Garden daylight")
    world.use_nodes=True
    nodes=world.node_tree.nodes
    sky=nodes.new("ShaderNodeTexSky")
    sky.sky_type="MULTIPLE_SCATTERING"
    sky.sun_elevation=math.radians(28)
    sky.sun_rotation=math.radians(135)
    sky.altitude=150
    sky.air_density=1.15
    sky.aerosol_density=.8
    world.node_tree.links.new(sky.outputs["Color"],nodes.get("Background").inputs["Color"])
    nodes.get("Background").inputs["Strength"].default_value=.24
    scene.world=world
    light=bpy.data.lights.new("Morning sun","SUN")
    light.energy=1.5
    light.angle=math.radians(2.5)
    sun=bpy.data.objects.new("Morning sun",light)
    scene.collection.objects.link(sun)
    sun.rotation_euler=(math.radians(32),math.radians(-22),math.radians(-32))
    scene.view_settings.view_transform="AgX"
    scene.view_settings.exposure=-.35

def setup_camera(scene,position,target,name="Overview"):
    data=bpy.data.cameras.new(name)
    cam=bpy.data.objects.new(name,data)
    scene.collection.objects.link(cam)
    cam.location=position
    cam.rotation_euler=(Vector(target)-cam.location).to_track_quat("-Z","Y").to_euler()
    data.lens=43
    data.clip_end=1200
    scene.camera=cam
    return cam

def configure_render(scene):
    scene.render.engine="CYCLES"
    scene.cycles.samples=48
    scene.cycles.use_denoising=True
    scene.cycles.diffuse_bounces=6
    prefs=bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type="OPTIX"
    prefs.get_devices()
    gpu=[device for device in prefs.devices if device.type=="OPTIX"]
    for device in prefs.devices:device.use=device in gpu
    scene.cycles.device="GPU" if gpu else "CPU"
    scene.render.resolution_x=1600
    scene.render.resolution_y=1100
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format="PNG"
    scene.render.film_transparent=False
    print("RENDER_DEVICE",scene.cycles.device,[device.name for device in gpu],flush=True)

def export_asset(spec,collection,root,builder,views):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.all_objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=root
    root.location=(0,0,0)
    root.rotation_euler=(0,0,0)
    file=RAW/(spec["id"]+".glb")
    if not args.no_export:
        export_raw(file)
        detail_roles={"rafters","books","writing","lantern_tassel","leaf_veins","paifang_carving","brackets",
            "thatch_fibres","window_mouldings","panel_mouldings","door_hinges","door_handles","plaque_fasteners","plaque_inlay",
            "book_covers","book_stitching","book_labels","book_pages","written_marks","brushes","brush_tips","resting_brush","brush_rest",
            "painting_brushwork","paint_pigment","birdcage_cups","citron_fingers","chime_relief","well_masonry","bucket_bands",
            "sluice_fasteners","bridge_fasteners","heated_bed_joints","couch_weave"}
        for obj in collection.all_objects:
            obj.select_set(obj.type=="MESH" and obj.get("gardenRole") not in detail_roles)
        lod_file=file.with_name(spec["id"]+".lod.glb")
        simplification=[]
        outline_roles={"roof_shell","ridge","ridge_finials","finial","fascia"}
        plant_roles={"foliage","tree_leaves","evergreen","banana_leaves","blossom","tree_structure","bamboo_stem","herbs","reeds","groundcover","lotus","lotus_flower"}
        for obj in collection.all_objects:
            if obj.type!="MESH" or not obj.select_get() or len(obj.data.polygons)<100:continue
            role=obj.get("gardenRole")
            if role in outline_roles:continue
            modifier=obj.modifiers.new("Web distance detail","DECIMATE")
            modifier.ratio=.10 if role in plant_roles else .18 if role in {"roof_tiles","eave_ends"} else .28 if role=="lattice" else .32
            modifier.use_collapse_triangulate=True
            simplification.append((obj,modifier))
        try:
            export_raw(lod_file)
        finally:
            for obj,modifier in simplification:obj.modifiers.remove(modifier)
    root.location=spec["position"]
    root.rotation_euler.z=spec["rotation"]
    collection.asset_mark()
    collection.asset_data.description=spec["description"]
    bpy.data.libraries.write(str(ROOT/"art/landmarks"/(spec["id"]+".blend")),{collection},fake_user=True,compress=True)
    tris=sum(len(p.vertices)-2 for obj in collection.all_objects if obj.type=="MESH" for p in obj.data.polygons)
    ports={key:transform_port(port,spec) for key,port in builder.ports.items()}
    world_ports.update({spec['id']+':'+key:value for key,value in ports.items()})
    for pad in builder.terrain_pads:
        point=transform_port({'position':pad['position'],'direction':[1,0]},spec)['position']
        terrain_pads.append({**pad,'position':point,'rotation':pad['rotation']+spec['rotation']})
    item={**spec,"url":"/models/"+file.name,"lodUrl":"/models/"+spec["id"]+".lod.glb","bytes":file.stat().st_size if file.name in exported_files else 0,"triangles":tris,"views":views,"ports":ports}
    manifest["landmarks"].append(item)
    cx,cy,cz=spec["position"]
    theta=spec["rotation"]
    for collider in builder.colliders:
        x,y,z=collider["center"]
        manifest["colliders"].append({**collider,"landmarkId":spec["id"],"center":[cx+x*math.cos(theta)-y*math.sin(theta),cy+x*math.sin(theta)+y*math.cos(theta),cz+z],"rotation":theta+collider["rotation"]})
    for surface in builder.surfaces:
        if surface.get('kind')=='quad':
            vertices=[transform_port({'position':point,'direction':[1,0]},spec)['position'] for point in surface['vertices']]
            manifest['surfaces'].append({**surface,'landmarkId':spec['id'],'vertices':vertices})
            continue
        x,y=surface["center"]
        manifest["surfaces"].append({**surface,"landmarkId":spec['id'],"center":[cx+x*math.cos(theta)-y*math.sin(theta),cy+x*math.sin(theta)+y*math.cos(theta)],"height":cz+surface["height"],"rotation":theta+surface["rotation"]})
    print("ASSET",json.dumps({"id":spec["id"],"triangles":tris,"bytes":item["bytes"],"objects":len(collection.all_objects)},ensure_ascii=False),flush=True)

scene=bpy.context.scene
scene.name="Daguanyuan"
scene_lighting(scene)
started=time.time()
selected=[s for s in plan["landmarks"] if not args.only or s["id"]==args.only]
if not selected:parser.error('Unknown landmark: '+str(args.only))
for spec in selected:
    collection=bpy.data.collections.new(spec["id"]+" | "+spec["name"])
    scene.collection.children.link(collection)
    root=bpy.data.objects.new(spec["id"],None)
    collection.objects.link(root)
    root["landmarkId"]=spec["id"]
    root["title"]=spec["name"]
    root["sourceChapter"]=spec["chapter"]
    root["evidence"]=spec["evidence"]
    builder=MeshBuilder(spec["id"])
    views=landmark(builder,spec)
    views.update(spec.get("viewOverrides",{}))
    views.setdefault("interiorLook",views["look"])
    builder.emit(collection,materials,root)
    make_texts(builder,collection,root)
    bpy.ops.file.pack_all()
    if args.preview_only:
        root.location=spec['position'];root.rotation_euler.z=spec['rotation']
    else:
        export_asset(spec,collection,root,builder,views)

if args.only:
    spec=selected[0]
    center=Vector(spec["position"])
    # Neutral garden stage used only for inspecting the single-asset render.
    stage=MeshBuilder("inspection_ground")
    stage.box((center.x,center.y,center.z-.20),(95,95,.25),"grass","ground")
    stage_collection=bpy.data.collections.new("Inspection ground")
    scene.collection.children.link(stage_collection)
    stage_root=bpy.data.objects.new("Inspection ground",None)
    stage_collection.objects.link(stage_root)
    stage.emit(stage_collection,materials,stage_root)
    width,depth=spec['size']
    setup_camera(scene,center+Vector((width*.8,-max(12,depth*1.15),max(7,width*.55))),center+Vector((0,1,2)))
    blend_path=ROOT/"art/scenes"/(args.only+"-inspection.blend")
else:
    landscape,terrain,ground,network_nodes,network_routes=build_landscape(plan,world_ports,terrain_pads)
    col=bpy.data.collections.new("garden | 山水与植被")
    scene.collection.children.link(col)
    world_root=bpy.data.objects.new("garden",None)
    col.objects.link(world_root)
    landscape.emit(col,materials,world_root)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in col.all_objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=world_root
    world_simplification=[]
    # Grove laminae, litter and narrow turf blades are already economical open
    # surfaces. Native collapse would destroy their outlines before the near
    # tier even reaches the browser; only the far tier may reduce those roles.
    world_plants={"foliage","tree_leaves","evergreen","banana_leaves","blossom","lotus_flower","tree_structure","reeds","groundcover","grass_flower"}
    for obj in col.all_objects:
        if obj.type=="MESH" and obj.get("gardenRole") in world_plants|{"wall_tiles","bridge_rails","rail_posts","rail_caps"}:
            modifier=obj.modifiers.new("Web landscape detail","DECIMATE")
            modifier.ratio=.42 if obj.get("gardenRole") in world_plants else .24
            modifier.use_collapse_triangulate=True
            world_simplification.append((obj,modifier))
    try:
        export_raw(RAW/"garden.glb")
    finally:
        for obj,modifier in world_simplification:obj.modifiers.remove(modifier)
    manifest["terrain"]=terrain
    manifest["colliders"].extend(landscape.colliders)
    manifest["surfaces"].extend(landscape.surfaces)
    manifest["worldUrl"]="/models/garden.glb"
    manifest['paths']=[[[p[0],p[1]] for p in route['points']] for route in network_routes]
    manifest['circulation']={'nodes':list(network_nodes.values()),'routes':[{key:route[key] for key in ['id','from','to','width','surface','covered','points','navigation','bridge']} for route in network_routes]}
    manifest['water']={**plan['water'],'lake':ground.lake,'rivers':[{'width':width,'points':[[p[0],p[1]] for p in points]} for points,width in ground.rivers]}
    setup_camera(scene,(160,-190,145),(0,5,0))
    blend_path=ROOT/"art/scenes/daguanyuan.blend"

configure_render(scene)
scene.unit_settings.system="METRIC"
scene.unit_settings.scale_length=1
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=="VIEW_3D":
            area.spaces.active.clip_end=1500
            area.spaces.active.region_3d.view_distance=260 if not args.only else 40
            area.spaces.active.region_3d.view_location=Vector((0,4,0)) if not args.only else Vector(selected[0]["position"])
            area.spaces.active.region_3d.view_rotation=scene.camera.rotation_euler.to_quaternion()
            area.spaces.active.shading.type="SOLID"
            area.spaces.active.shading.color_type="MATERIAL"
            area.spaces.active.shading.show_cavity=True
            area.spaces.active.overlay.show_floor=False
            area.spaces.active.overlay.show_axis_x=False
            area.spaces.active.overlay.show_axis_y=False
            area.spaces.active.overlay.show_extras=False
bpy.ops.object.select_all(action="DESELECT")
if not args.preview_only:bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
if not args.preview_only:
    (RAW/"garden.manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    receipt={"buildId":args.build_id,"only":args.only,"worldOnly":args.no_export,"files":exported_files,"manifest":"garden.manifest.json"}
    (RAW/"build-receipt.json").write_text(json.dumps(receipt,ensure_ascii=False),encoding="utf-8")
if args.render or args.preview_only:
    scene.render.filepath=str(ROOT/"output/previews"/((args.only or "garden")+("-component.png" if args.preview_only else "-overview.png")))
    bpy.ops.render.render(write_still=True)
print("BUILD_COMPLETE",json.dumps({"seconds":round(time.time()-started,1),"landmarks":len(selected),"blend":None if args.preview_only else str(blend_path),"previewOnly":args.preview_only},ensure_ascii=False),flush=True)
