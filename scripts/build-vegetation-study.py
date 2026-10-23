"""A local material/geometry specimen, exported through the production GLB path."""
import json
import math
import random
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'art/blender'))
import bpy
from geometry import MeshBuilder
from materials import build_materials
from plants import tree
from undergrowth import sward_density,grass_tuft,tree_litter

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
out=ROOT/'tmp/vegetation-study';out.mkdir(exist_ok=True)
materials=build_materials(ROOT/'art/textures')
m=MeshBuilder('garden');rng=random.Random(1732)
def ground(x,y):return .035*math.sin(x*.7)*math.cos(y*.5)
n=81;vertices=[(-20+i*.5,-20+j*.5,ground(-20+i*.5,-20+j*.5)) for j in range(n) for i in range(n)]
faces=[(j*n+i,j*n+i+1,(j+1)*n+i+1,(j+1)*n+i) for j in range(n-1) for i in range(n-1)]
m.add(vertices,faces,'terrain','terrain',True,uvs=[(x*.5,y*.5) for x,y,z in vertices],colors=[(.88,.92,.84,1)]*len(vertices))
# Keep the production viewer's single water-plane contract; it is below the
# specimen's continuous soil surface and therefore out of view.
m.add([(-20,-20,-2),(20,-20,-2),(20,20,-2),(-20,20,-2)],[(0,1,2,3)],'water','water')
trees=[(0,1,6,8),(-4,6,5.2,11),(4.2,7,6.8,27),(-6,13,6.4,32),(1,13,7.4,82),(8,14,6.6,49)]
for x,y,h,seed in trees:
    tree(m,x,y,ground(x,y)-.045,h,'grove',seed)
    tree_litter(m,x,y,h,ground,rng)
for j in range(76):
    for i in range(76):
        x,y=-19+i*.5+rng.uniform(-.2,.2),-19+j*.5+rng.uniform(-.2,.2)
        density=sward_density(x,y)
        if rng.random()<density*.65:grass_tuft(m,x,y,ground,rng,density)
col=bpy.data.collections.new('Vegetation study');bpy.context.scene.collection.children.link(col)
root=bpy.data.objects.new('garden',None);col.objects.link(root)
m.emit(col,materials,root)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(out/'garden.glb'),export_format='GLB',use_selection=True,export_apply=True,
    export_extras=True,export_yup=True,export_animations=False,export_lights=False,export_cameras=False,
    export_draco_mesh_compression_enable=False,export_vertex_color='ACTIVE',export_all_vertex_colors=False,
    export_active_vertex_color_when_no_material=False,export_image_format='WEBP',export_image_quality=90)
manifest={'schema':1,'name':'林下近景样片','bounds':[-20,-20,20,20],'worldUrl':'','worldChunks':[],
          'landmarks':[],'colliders':[],'surfaces':[],'paths':[],
          'circulation':{'nodes':[],'routes':[]},'water':{'level':-2,'lake':[],'rivers':[]},
          'terrain':{'size':n,'bounds':[-20,-20,20,20],'heights':[p[2] for p in vertices]}}
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False),encoding='utf-8')
print('VEGETATION_STUDY',json.dumps({'trees':len(trees),'triangles':sum(len(f)-2 for b in m.buckets.values() for f in b['f'])}))
