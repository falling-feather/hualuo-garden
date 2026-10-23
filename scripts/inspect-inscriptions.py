"""Sample real raised-letter faces against the saved Blender scene.

The three inspection viewpoints describe a readable approach, not visibility
from every possible garden position. No objects are hidden for this check.
"""
import argparse
import json
import math
import sys
from collections import Counter
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--baseline', action='store_true')
parser.add_argument('--strict', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
scene = bpy.context.scene
authored=json.loads((ROOT/'art/inscription-views.json').read_text(encoding='utf-8'))['views'] if not args.baseline else []
scene.view_layers[0].update()
depsgraph = bpy.context.evaluated_depsgraph_get()
report = []
for obj in sorted(scene.objects, key=lambda item: item.name):
    if obj.type != 'MESH' or obj.get('gardenRole') != 'inscription':
        continue
    normal = (obj.matrix_world.to_quaternion() @ Vector((0, 0, 1))).normalized()
    right = obj.matrix_world.to_quaternion() @ Vector((1, 0, 0))
    mesh = obj.data
    mesh.calc_loop_triangles()
    # Front-facing letter triangles alone; empty space between glyphs is not ink.
    front = [tri for tri in mesh.loop_triangles if tri.normal.z > .7]
    stride = max(1, len(front) // 96)
    points = [obj.matrix_world @ (sum((mesh.vertices[i].co for i in tri.vertices), Vector()) / 3)
              for tri in front[::stride]][:128]
    if not points:
        raise ValueError('无可采样文字正面：' + obj.name)
    corners = [obj.matrix_world @ Vector(v) for v in obj.bound_box]
    center = sum(corners, Vector()) / 8
    width = max((v-center).dot(right) for v in corners) - min((v-center).dot(right) for v in corners)
    distance = max(3.2, width * 1.7)
    # Lower to human eye level for ordinary signs; high-storey signs are
    # inspected from a corresponding raised gallery, documented as such.
    root_z = obj.parent.matrix_world.translation.z if obj.parent else 0
    eye_z = max(root_z + 1.75, center.z - 1.45)
    views = []
    candidates=[]
    for angle in [0, -15, 15]:
        a = math.radians(angle)
        eye = center + normal * (distance * math.cos(a)) + right * (distance * math.sin(a))
        eye.z = eye_z
        candidates.append((str(angle),eye))
    for view in authored:
        if view['landmark']!=obj.get('landmarkId'):continue
        body=obj.get('inscriptionText','')
        if view.get('text')!=body and not (view.get('singleCharacter') and len(body)==1):continue
        candidates.append((view['id'],obj.parent.matrix_world@Vector(view['eye'])))
    for angle,eye in candidates:
        blockers = Counter()
        visible = 0
        for p in points:
            target = p + normal * .003
            direction = target-eye
            hit, location, _, _, obstacle, _ = scene.ray_cast(depsgraph, eye, direction.normalized(), distance=direction.length-.006)
            if hit and obstacle.original != obj:
                blockers[obstacle.get('gardenRole', obstacle.name)] += 1
            else:
                visible += 1
        views.append({'angle': angle, 'eye': [round(v, 4) for v in eye],
                      'visible': round(visible/len(points), 4), 'blockers': dict(blockers)})
    # A near-normal construction clearance test also catches boards embedded
    # in their supporting rock/beam independently of approach-camera choices.
    embedded = Counter()
    for p in points:
        eye = p+normal*.25
        hit, _, _, _, obstacle, _ = scene.ray_cast(depsgraph, eye, -normal, distance=.244)
        if hit and obstacle.original != obj:
            embedded[obstacle.get('gardenRole', obstacle.name)] += 1
    best = max(views, key=lambda v: v['visible'])
    report.append({'object': obj.name, 'landmark': obj.get('landmarkId'),
                   'text': obj.get('inscriptionText', ''), 'samples': len(points),
                   'center': [round(v, 4) for v in center], 'normal': list(normal),
                   'bestVisibility': best['visible'], 'views': views,
                   'embeddedSamples': sum(embedded.values()), 'embeddedBy': dict(embedded),
                   'passed': best['visible'] >= .98 and not embedded})
result = {'passed': all(item['passed'] for item in report), 'count': len(report),
          'failed': sum(not item['passed'] for item in report), 'inscriptions': report,
          'scope': 'Letter-face ray samples from normal and +/-15 degree approaches and explicitly recorded courtyard reading views, plus 0.25m front clearance. Not all-angle or full-pixel visibility.'}
file = ROOT / 'output/qa' / ('inscriptions-before.json' if args.baseline else 'inscriptions.json')
file.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print('INSCRIPTION_AUDIT', json.dumps({k:v for k,v in result.items() if k != 'inscriptions'}, ensure_ascii=False), flush=True)
for item in report:
    if not item['passed']:
        print('INSCRIPTION_ISSUE', json.dumps({k:item[k] for k in ['object','landmark','text','bestVisibility','embeddedBy']}, ensure_ascii=False), flush=True)
if args.strict and not result['passed']:
    raise RuntimeError('牌匾可读性检查未通过')
