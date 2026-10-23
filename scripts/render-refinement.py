"""Repeatable, unhidden-scene cameras for every landmark and key craft details."""
import argparse
import json
import math
import sys
import hashlib
from pathlib import Path
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--only',default='')
parser.add_argument('--baseline',action='store_true')
parser.add_argument('--samples',type=int,default=48)
parser.add_argument('--width',type=int,default=1400)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
plan=json.loads((ROOT/'art/garden-plan.json').read_text(encoding='utf-8'))
specs={s['id']:s for s in plan['landmarks']}
scene=bpy.context.scene
with open(bpy.data.filepath,'rb') as source:
    source_hash=hashlib.file_digest(source,'sha256').hexdigest()
scene.render.engine='CYCLES';scene.cycles.samples=args.samples;scene.cycles.use_denoising=True
scene.render.use_persistent_data=True
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for device in prefs.devices:device.use=device.type=='OPTIX'
scene.cycles.device='GPU' if any(d.type=='OPTIX' for d in prefs.devices) else 'CPU'
scene.render.resolution_x=args.width;scene.render.resolution_y=round(args.width*.72);scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
shots=[]
for spec in plan['landmarks']:
    w,d=spec['size'];high=spec['kind'] in ['tower','side_tower']
    eye=(w*.70,-max(12,d*1.05),max(7,w*.52,14 if high else 0))
    if spec['id']=='sluice':eye=(0,-12,14)
    shots.append((spec['id'],spec['id'],eye,(0,0,4 if high else 2.2),43))
# Local coordinates deliberately inspect geometry at visitor height. They are
# not text-only turntables: trees, walls and adjacent buildings remain present.
shots.extend([
    ('xiaoxiang-entry','xiaoxiang',(2.8,-19,2.3),(0,-12.6,3),48),
    ('xiaoxiang-study','xiaoxiang',(-4.8,1.1,2.05),(-3.1,5.9,1.55),35),
    ('yihong-cage','yihong',(-10,-8.8,2.05),(-12.5,-6,2.2),46),
    ('yihong-interior','yihong',(1.6,2,2.1),(-2.5,6.1,1.65),32),
    ('hengwu-interior','hengwu',(3.2,.8,2.05),(-2.1,4.8,1.55),35),
    ('qiushuang-interior','qiushuang',(-2.3,-.6,2.05),(2.1,3.3,1.6),35),
    ('qiushuang-objects','qiushuang',(-3.2,0,2.5),(-.8,2.3,1.95),35),
    ('nuanxiang-painting','nuanxiang',(-2.8,-.9,2),(.2,2,1.4),38),
    ('nuanxiang-curtain','nuanxiang',(3,-5.8,2.3),(0,-1.6,2.2),43),
    ('daoxiang-craft','daoxiang',(.5,2.1,1.8),(4.4,5.2,1),38),
    ('longcui-tea','longcui',(4.5,-5.8,1.9),(7,-4.72,1.2),36),
    ('aojing-plaque','aojing',(4.5,-10,2),(0,-4.85,2.65),43),
    ('luxue-hearth','luxue',(2.4,-1.6,1.8),(-2.5,.7,1.1),35),
    ('qinfang-eaves','qinfang',(6,-8,4.8),(0,-2.5,3.8),48),
    ('hengwu-rock','hengwu',(5,-8,2.4),(-1,-3,2.1),42),
    ('ouxiang-joinery','ouxiang',(8,-9,3.1),(3,-2.3,2.1),43),
    ('longcui-plaque','longcui',(1.5,-4.72,1.75),(4.65,-4.72,2.77),43),
    ('luxue-plaque','luxue',(3,-9,1.75),(0,-4.02,2.52),43),
])
for view in json.loads((ROOT/'art/inscription-views.json').read_text(encoding='utf-8'))['views']:
    shots.append((view['id'],view['landmark'],view['eye'],view['target'],view['lens']))
interiors={'xiaoxiang-study','yihong-interior','hengwu-interior','qiushuang-interior','qiushuang-objects','nuanxiang-painting','daoxiang-craft','longcui-tea','luxue-hearth'}
selected=set(args.only.split(',')) if args.only else None
out=ROOT/'output/refinement';out.mkdir(exist_ok=True)
records=[]
for name,landmark,position,target,lens in shots:
    if selected and name not in selected:continue
    spec=specs[landmark];c,s=math.cos(spec['rotation']),math.sin(spec['rotation'])
    def world(p):return Vector((spec['position'][0]+p[0]*c-p[1]*s,spec['position'][1]+p[0]*s+p[1]*c,spec['position'][2]+p[2]))
    eye,look=world(position),world(target)
    scene.camera.location=eye;scene.camera.rotation_euler=(look-eye).to_track_quat('-Z','Y').to_euler()
    scene.camera.data.lens=lens;scene.camera.data.clip_start=.04;scene.camera.data.dof.use_dof=False
    # A documented camera exposure adjustment models the eye's adaptation on
    # entering the room. Geometry and lights remain the actual saved scene.
    scene.view_settings.exposure=1.65 if name in interiors else -.35
    filename=('before-' if args.baseline else '')+name+'.png'
    scene.render.filepath=str(out/filename)
    bpy.ops.render.render(write_still=True)
    records.append({'id':name,'landmark':landmark,'file':'output/refinement/'+filename,'eye':list(eye),'target':list(look),'lens':lens,'exposure':scene.view_settings.exposure,'samples':args.samples,'sourceSha256':source_hash})
    print('DETAIL_RENDER',name,flush=True)
report=ROOT/'output/qa'/('refinement-before-views.json' if args.baseline else 'refinement-views.json')
if report.exists():
    existing=json.loads(report.read_text(encoding='utf-8'))
    kept=[item for item in existing['views'] if item['id'] not in {r['id'] for r in records}]
else:kept=[]
all_views=kept+records
hashes={v.get('sourceSha256') for v in all_views}
report.write_text(json.dumps({'source':'art/scenes/daguanyuan.blend','hiddenObjects':False,'uniformSource':len(hashes)==1 and None not in hashes,'views':all_views},ensure_ascii=False,indent=2),encoding='utf-8')
