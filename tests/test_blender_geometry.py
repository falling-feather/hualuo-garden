"""Small native-mesh regressions; run with Blender --background --python."""
import sys
import json
import struct
import unittest
from collections import Counter
from pathlib import Path
import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'art/blender'))
from geometry import MeshBuilder
from materials import build_materials

class MeshContracts(unittest.TestCase):
    def test_sphere_side_normals_agree_with_both_poles(self):
        m=MeshBuilder('sphere-test');m.sphere((0,0,0),(1.2,.8,1.1),segments=12,rings=8)
        b=next(iter(m.buckets.values()));directed=Counter()
        for face in b['f']:
            p=[Vector(b['v'][i]) for i in face]
            self.assertGreater((p[1]-p[0]).cross(p[2]-p[0]).dot(sum(p,Vector())),0)
            directed.update(zip(face,face[1:]+face[:1]))
        self.assertTrue(all(directed[(b,a)]==count for (a,b),count in directed.items()))

    def test_chamfer_is_closed_and_outward(self):
        m=MeshBuilder('box-test');m.box((0,0,0),(2,3,4),bevel=.1)
        bucket=next(iter(m.buckets.values()));v=bucket['v'];faces=bucket['f']
        edges=Counter(tuple(sorted((a,b))) for face in faces for a,b in zip(face,face[1:]+face[:1]))
        self.assertEqual(set(edges.values()), {2})
        self.assertEqual(len(faces),26)
        self.assertEqual([max(p[i] for p in v)-min(p[i] for p in v) for i in range(3)],[2,3,4])
        for face in faces:
            p=[Vector(v[i]) for i in face]
            self.assertGreater((p[1]-p[0]).cross(p[2]-p[0]).dot(sum(p,Vector())),0)

    def test_explicit_uv_survives_object_transform(self):
        m=MeshBuilder('uv-test');wanted=[(0,0),(1,0),(1,1),(0,1)]
        with m.transform((8,10,12),.7):
            m.quad([(0,0,0),(1,0,0),(1,1,0),(0,1,0)],'test',uv=wanted)
        collection=bpy.data.collections.new('UV test');root=bpy.data.objects.new('root',None)
        material=bpy.data.materials.new('test');objects=m.emit(collection,{'test':material},root)
        uv=objects[0].data.uv_layers.active
        for loop in objects[0].data.loops:
            self.assertEqual(tuple(uv.data[loop.index].uv),wanted[loop.vertex_index])

    def test_cylinder_caps_are_flat(self):
        m=MeshBuilder('cap-test');m.cylinder((0,0,0),1,2,sides=12)
        smoothing=next(iter(m.buckets.values()))['s']
        self.assertEqual(smoothing[:2],[False,False]);self.assertTrue(all(smoothing[2:]))

    def test_linear_point_colors_do_not_add_color_to_plain_meshes(self):
        colors=[(.05,.20,.70,1),(.15,.30,.50,1),(.25,.40,.30,1),(.35,.50,.10,1)]
        m=MeshBuilder('color-test')
        with m.transform((8,10,12),.7):
            m.add([(0,0,0),(1,0,0),(1,1,0),(0,1,0)],[(0,1,2,3)],'test','colored',colors=colors)
        m.add([(0,0,0),(1,0,0),(0,1,0)],[(0,1,2)],'test','plain')
        collection=bpy.data.collections.new('Color test');root=bpy.data.objects.new('color root',None)
        objects=m.emit(collection,{'test':bpy.data.materials.new('color test')},root)
        colored=next(obj for obj in objects if obj['gardenRole']=='colored').data
        plain=next(obj for obj in objects if obj['gardenRole']=='plain').data
        attribute=colored.color_attributes['GardenColor']
        self.assertEqual((attribute.domain,attribute.data_type),('POINT','FLOAT_COLOR'))
        self.assertEqual(colored.color_attributes.active_color.name,'GardenColor')
        self.assertEqual(colored.color_attributes[colored.color_attributes.render_color_index].name,'GardenColor')
        for actual,wanted in zip(attribute.data,colors):
            for value,expected in zip(actual.color,wanted):self.assertAlmostEqual(value,expected,places=6)
        self.assertEqual(len(plain.color_attributes),0)

    def test_terrain_material_and_color_zero_export_contract(self):
        project=Path(__file__).resolve().parents[1]
        materials=build_materials(project/'art/textures')
        material=materials['terrain'];bsdf=material.node_tree.nodes.get('Principled BSDF')
        vertex=next(node for node in material.node_tree.nodes if node.bl_idname=='ShaderNodeVertexColor')
        self.assertEqual(vertex.layer_name,'GardenColor')
        self.assertAlmostEqual(bsdf.inputs['Roughness'].default_value,.98,places=6)
        self.assertFalse(bsdf.inputs['Roughness'].is_linked)
        self.assertEqual(tuple(bsdf.inputs['Base Color'].default_value),(1,1,1,1))
        colors=[(.05,.20,.70,1),(.15,.30,.50,1),(.25,.40,.30,1),(.35,.50,.10,1)]
        builder=MeshBuilder('terrain-color-export')
        builder.add([(0,0,0),(1,0,0),(1,1,0),(0,1,0)],[(0,1,2,3)],'terrain','terrain',colors=colors)
        builder.add([(2,0,0),(3,0,0),(2,1,0)],[(0,1,2)],'wood','plain')
        collection=bpy.data.collections.new('Color export fixture');bpy.context.scene.collection.children.link(collection)
        root=bpy.data.objects.new('Color export fixture root',None);collection.objects.link(root)
        objects=builder.emit(collection,materials,root)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        output=project/'tmp/vertex-color-contract.glb';output.parent.mkdir(exist_ok=True)
        bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_extras=True,
            export_image_format='WEBP',export_image_quality=90,export_draco_mesh_compression_enable=False,
            export_vertex_color='ACTIVE',export_all_vertex_colors=False,export_active_vertex_color_when_no_material=False)
        data=output.read_bytes();json_length=struct.unpack_from('<I',data,12)[0]
        gltf=json.loads(data[20:20+json_length]);binary=memoryview(data)[28+json_length:]
        for node in gltf['nodes']:
            if 'mesh' not in node:continue
            primitive=gltf['meshes'][node['mesh']]['primitives'][0]
            if node.get('extras',{}).get('gardenRole')=='plain':
                self.assertNotIn('COLOR_0',primitive['attributes'])
                continue
            accessor=gltf['accessors'][primitive['attributes']['COLOR_0']]
            self.assertIn(accessor['componentType'],[5123,5126])
            self.assertEqual(accessor['type'],'VEC4')
            view=gltf['bufferViews'][accessor['bufferView']]
            integer=accessor['componentType']==5123
            if integer:self.assertTrue(accessor.get('normalized'))
            offset=view.get('byteOffset',0)+accessor.get('byteOffset',0);stride=view.get('byteStride',8 if integer else 16)
            actual=[struct.unpack_from('<4H' if integer else '<4f',binary,offset+i*stride) for i in range(accessor['count'])]
            actual=[tuple(value/(65535 if integer else 1) for value in rgba) for rgba in actual]
            for wanted in colors:self.assertLessEqual(min(max(abs(a-b) for a,b in zip(rgba,wanted)) for rgba in actual),1/65535)
            pbr=gltf['materials'][primitive['material']]['pbrMetallicRoughness']
            self.assertEqual(pbr.get('baseColorFactor',[1,1,1,1]),[1,1,1,1])
            self.assertIn('baseColorTexture',pbr)
            self.assertAlmostEqual(pbr['roughnessFactor'],.98,places=6)

suite=unittest.defaultTestLoader.loadTestsFromTestCase(MeshContracts)
result=unittest.TextTestRunner(verbosity=2).run(suite)
if not result.wasSuccessful():raise RuntimeError('Native geometry regression failed')
