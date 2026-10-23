import sys,json,math
from pathlib import Path
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'art/blender'))
from geometry import MeshBuilder
from architecture import landmark
from landscape import Ground
from circulation import build_circulation
from route_geometry import transform_port

class LayoutBuilder(MeshBuilder):
    def ignore(self,*args,**kwargs):pass
    add=box=beam=cylinder=lathe=sphere=tube=quad=disk=plaque=ignore

plan=json.loads((root/'art/garden-plan.json').read_text(encoding='utf-8'))
ports={};pads=[];colliders=[]
for spec in plan['landmarks']:
    builder=LayoutBuilder(spec['id']);landmark(builder,spec)
    ports.update({spec['id']+':'+name:transform_port(port,spec) for name,port in builder.ports.items()})
    for pad in builder.terrain_pads:
        point=transform_port({'position':pad['position'],'direction':[1,0]},spec)['position']
        pads.append({**pad,'position':point,'rotation':pad['rotation']+spec['rotation']})
    for box in builder.colliders:
        point=transform_port({'position':box['center'],'direction':[1,0]},spec)['position']
        colliders.append({**box,'center':point,'rotation':box['rotation']+spec['rotation'],'landmarkId':spec['id']})
ground=Ground(plan,pads);ground.bake();garden=LayoutBuilder('garden')
nodes,routes=build_circulation(garden,plan,ports,ground)
all_colliders=colliders+garden.colliders
cells={}
for box in all_colliders:
    c,s=abs(math.cos(box['rotation'])),abs(math.sin(box['rotation']))
    dx=(box['size'][0]*c+box['size'][1]*s)/2+.4;dy=(box['size'][0]*s+box['size'][1]*c)/2+.4
    for x in range(math.floor((box['center'][0]-dx)/8),math.floor((box['center'][0]+dx)/8)+1):
        for y in range(math.floor((box['center'][1]-dy)/8),math.floor((box['center'][1]+dy)/8)+1):cells.setdefault((x,y),[]).append(box)
blocked=[];buried=[];steep=[]
for route in routes:
    hits={};underground=[];slope=0
    for i,(x,y,z) in enumerate(route['points']):
        penetration=max(ground.height(x,y),ground.height(*route['left'][i][:2]),ground.height(*route['right'][i][:2]))-z
        if penetration>.10:underground.append(round(penetration,3))
        if i:slope=max(slope,abs(z-route['points'][i-1][2])/math.dist(route['points'][i-1][:2],(x,y)))
        for box in cells.get((math.floor(x/8),math.floor(y/8)),[]):
            if box['center'][2]+box['size'][2]/2<z+.20 or box['center'][2]-box['size'][2]/2>z+1.65:continue
            dx,dy=x-box['center'][0],y-box['center'][1];c,s=math.cos(box['rotation']),math.sin(box['rotation'])
            if abs(dx*c+dy*s)<box['size'][0]/2+.24 and abs(-dx*s+dy*c)<box['size'][1]/2+.24:
                key=box.get('landmarkId',box.get('componentId','route-railing'))
                hit=hits.setdefault(key,{'count':0,'point':[round(x,2),round(y,2),round(z,2)]});hit['count']+=1
    if hits:blocked.append({'id':route['id'],'hits':hits})
    if underground:buried.append({'id':route['id'],'count':len(underground),'maximum':max(underground)})
    if slope>.75:steep.append({'id':route['id'],'maximumGrade':round(slope,2)})
water_nodes=[key for key,node in nodes.items() if node['kind']=='junction' and ground.height(*node['position'][:2])<plan['water']['level']-.05]
unused_ports=[key for key in ports if not any(key in [route['from'],route['to']] for route in routes)]
crossings={};segment_cells={}
def cross(a,b):return a[0]*b[1]-a[1]*b[0]
for route in routes:
    for a,b in zip(route['points'],route['points'][1:]):
        entry=(route,a,b);candidates={}
        keys=[(x,y) for x in range(math.floor(min(a[0],b[0])/6),math.floor(max(a[0],b[0])/6)+1) for y in range(math.floor(min(a[1],b[1])/6),math.floor(max(a[1],b[1])/6)+1)]
        for key in keys:
            for other,c,d in segment_cells.get(key,[]):
                if other['id']==route['id'] or set([other['from'],other['to']])&set([route['from'],route['to']]):continue
                candidates[(other['id'],c,d)]=other
        for (other_id,c,d),other in candidates.items():
            r=(b[0]-a[0],b[1]-a[1]);s=(d[0]-c[0],d[1]-c[1]);den=cross(r,s)
            if abs(den)<1e-8:continue
            v=(c[0]-a[0],c[1]-a[1]);t=cross(v,s)/den;u=cross(v,r)/den
            if 0<t<1 and 0<u<1:
                dz=abs(a[2]+(b[2]-a[2])*t-c[2]-(d[2]-c[2])*u)
                if dz<2.0:crossings[tuple(sorted([route['id'],other_id]))]=[round(a[0]+r[0]*t,2),round(a[1]+r[1]*t,2)]
        for key in keys:segment_cells.setdefault(key,[]).append(entry)
core_conflicts=[key for key,port in ports.items() if ground.height(*port['position'][:2])>port['position'][2]+.04]
folds=[]
edge_clashes=[]
for route in routes:
    count=0
    for a,b,c,d in zip(route['right'],route['right'][1:],route['left'][1:],route['left']):
        ab=(b[0]-a[0],b[1]-a[1]);ac=(c[0]-a[0],c[1]-a[1]);ad=(d[0]-a[0],d[1]-a[1])
        if cross(ab,ac)<=1e-7 or cross(ac,ad)<=1e-7:count+=1
    if count:folds.append({'id':route['id'],'invertedPanels':count})
    hits=set()
    for x,y,z in route['left']+route['right']:
        for box in cells.get((math.floor(x/8),math.floor(y/8)),[]):
            if 'landmarkId' not in box:continue
            if box['center'][2]+box['size'][2]/2<z+.20 or box['center'][2]-box['size'][2]/2>z+1.65:continue
            dx,dy=x-box['center'][0],y-box['center'][1];c,s=math.cos(box['rotation']),math.sin(box['rotation'])
            if abs(dx*c+dy*s)<box['size'][0]/2+.015 and abs(-dx*s+dy*c)<box['size'][1]/2+.015:hits.add(box['landmarkId'])
    if hits:edge_clashes.append({'id':route['id'],'landmarks':sorted(hits)})
crossings=[{'routes':list(key),'point':value} for key,value in crossings.items()]
report={'passed':not(blocked or buried or steep or water_nodes or unused_ports or crossings or core_conflicts or folds or edge_clashes),'routes':len(routes),'ports':len(ports),'routeQuads':len(garden.surfaces),'blocked':blocked,'buried':buried,'steep':steep,'waterNodes':water_nodes,'unusedPorts':unused_ports,'unplannedCrossings':crossings,'terrainAtEntries':core_conflicts,'foldedPanels':folds,'pathEdgesThroughBuildings':edge_clashes}
(root/'output/qa/route-layout.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
(root/'tmp/route-layout.json').write_text(json.dumps({'nodes':list(nodes.values()),'routes':routes,'landmarks':plan['landmarks'],'water':{'lake':ground.lake,'rivers':[{'points':points,'width':width} for points,width in ground.rivers]}},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print('ROUTE_LAYOUT',json.dumps(report,ensure_ascii=False),flush=True)
if '--strict' in sys.argv and not report['passed']:raise RuntimeError('桥路布局检查未通过')
