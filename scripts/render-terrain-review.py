"""Render the saved master, including cameras shared with the browser performance tour."""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--only',default='')
parser.add_argument('--samples',type=int,default=40)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
manifest=json.loads((ROOT/'public/garden.manifest.json').read_text(encoding='utf-8'))
specs={item['id']:item for item in manifest['landmarks']}
scene=bpy.context.scene
source_hash=hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest()
scene.render.engine='CYCLES'
scene.cycles.samples=args.samples
scene.cycles.use_denoising=True
scene.render.use_persistent_data=True
prefs=bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type='OPTIX';prefs.get_devices()
for device in prefs.devices:device.use=device.type=='OPTIX'
scene.cycles.device='GPU' if any(d.use for d in prefs.devices) else 'CPU'
scene.render.resolution_x=1440;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='AgX';scene.view_settings.exposure=-.35
hour=9.5;hour_angle=(hour-12)*math.pi/12
light_direction=Vector((-math.sin(hour_angle),-math.cos(hour_angle)*.5,math.cos(hour_angle)*math.sin(math.pi/3)))
for obj in scene.objects:
    if obj.type=='LIGHT' and obj.data.type=='SUN':
        obj.rotation_euler=(-light_direction).to_track_quat('-Z','Y').to_euler()
for node in scene.world.node_tree.nodes:
    if node.type=='TEX_SKY':
        node.sun_elevation=math.asin(light_direction.z)
        node.sun_rotation=math.atan2(light_direction.y,light_direction.x)

def world(local,spec):
    c,s=math.cos(spec['rotation']),math.sin(spec['rotation'])
    return (spec['position'][0]+local[0]*c-local[1]*s,spec['position'][1]+local[0]*s+local[1]*c,spec['position'][2]+local[2])

shots=[('overview',(139,-161,116),(0,4,3)),
       ('entry-relief',(25,-82,10),(-2,-63,2.1)),
       ('western-relief',(-67,-19,17),(-56,25,3.1)),
       ('mountain-water',(84,-7,18),(55,25,4.2))]
for name in ['xiaoxiang','cubi']:
    spec=specs[name];w,d=spec['size']
    shots.append((name,world((w*.95,-d*1.20,max(w,d)*.85+4),spec),world(spec['views']['look'],spec)))
selected=set(args.only.split(',')) if args.only else None
out=ROOT/'output/terrain-web';out.mkdir(exist_ok=True)
records=[]
for name,eye,target in shots:
    if selected and name not in selected:continue
    scene.camera.location=eye
    scene.camera.rotation_euler=(Vector(target)-Vector(eye)).to_track_quat('-Z','Y').to_euler()
    scene.camera.data.type='PERSP';scene.camera.data.sensor_fit='VERTICAL';scene.camera.data.sensor_height=24
    scene.camera.data.lens=12/math.tan(math.radians(47)/2)
    scene.camera.data.clip_start=.12;scene.camera.data.clip_end=1600;scene.camera.data.dof.use_dof=False
    name='native-'+name
    scene.render.filepath=str(out/(name+'.png'))
    bpy.ops.render.render(write_still=True)
    records.append({'id':name,'file':'output/terrain-web/'+name+'.png','eye':eye,'target':target,'verticalFov':47,'resolution':[1440,1000],'hour':hour,'lightDirection':list(light_direction),'exposure':-.35,'samples':args.samples,'sourceSha256':source_hash})
    print('TERRAIN_RENDER',name,flush=True)
report=ROOT/'output/qa/terrain-views.json'
existing=json.loads(report.read_text(encoding='utf-8'))['views'] if report.exists() else []
views=[v for v in existing if v['id'] not in {r['id'] for r in records}]+records
report.write_text(json.dumps({'source':'art/scenes/daguanyuan.blend','hiddenObjects':False,'views':views},ensure_ascii=False,indent=2),encoding='utf-8')
