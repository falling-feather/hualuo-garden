import bpy,json,math
from pathlib import Path
import numpy as np

root=Path(__file__).resolve().parents[1]
plan=json.loads((root/'art/garden-plan.json').read_text(encoding='utf-8'))
failures=[];libraries=[]
for spec in plan['landmarks']:
    file=root/'art/landmarks'/(spec['id']+'.blend')
    with bpy.data.libraries.load(str(file),link=False) as (available,_):
        names=list(available.collections)
    matching=[name for name in names if name.startswith(spec['id']+' | ')]
    if len(matching)!=1:failures.append(spec['id']+' 集合资产不完整')
    libraries.append({'id':spec['id'],'collections':matching})
meshes=[obj for obj in bpy.context.scene.objects if obj.type=='MESH']
triangles=0
for obj in meshes:
    coords=np.empty(len(obj.data.vertices)*3,dtype=np.float32)
    obj.data.vertices.foreach_get('co',coords)
    if not np.isfinite(coords).all():failures.append(obj.name+' 坐标无效')
    triangles+=sum(len(face.vertices)-2 for face in obj.data.polygons)
for spec in plan['landmarks']:
    if not any(collection.name.startswith(spec['id']+' | ') for collection in bpy.context.scene.collection.children):failures.append(spec['id']+' 缺失于主场景')
images=[image for image in bpy.data.images if image.source=='FILE']
if any(not image.packed_file for image in images):failures.append('主场景有未打包贴图')
report={'passed':not failures,'blender':bpy.app.version_string,'nativeScene':bpy.context.scene.name,'objects':len(bpy.context.scene.objects),'meshes':len(meshes),'triangles':triangles,'packedImages':len(images),'libraries':libraries,'failures':failures}
(root/'output/qa/blender.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('BLENDER_INSPECTION',json.dumps({**report,'libraries':len(libraries)},ensure_ascii=False),flush=True)
if failures:raise RuntimeError('原生模型检查未通过')
