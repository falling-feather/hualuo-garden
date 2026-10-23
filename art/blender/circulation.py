"""One owner for garden paths and access bridges, including their walking surfaces."""
import math
import random
from route_geometry import arc_lengths,station,resample,rounded_path,offset_edges,slice_path,convex_hull,unit,lerp

def smooth(value):
    value=max(0,min(1,value));return value*value*(3-2*value)

def compile_routes(plan,ports,ground):
    nodes={key:{**value,'id':key,'kind':'port'} for key,value in ports.items()}
    for item in plan['circulation']['nodes']:
        x,y=item['position']
        nodes[item['id']]={'id':item['id'],'kind':'junction','position':[x,y,ground.height(x,y)+.065]}
    incident={key:[] for key in nodes};routes=[]
    for spec in plan['circulation']['routes']:
        start,end=nodes[spec['from']],nodes[spec['to']]
        distance=math.dist(start['position'][:2],end['position'][:2])
        if distance<.1:raise ValueError('连接口重合：'+spec['id'])
        points=[tuple(start['position'])]
        lead=min(spec['width']*1.45,distance*.40)
        internal=':' in spec['from'] and spec['from'].split(':')[0]==spec['to'].split(':')[0]
        sign=-1 if internal else 1
        if start['kind']=='port':points.append((points[0][0]+sign*start['direction'][0]*lead,points[0][1]+sign*start['direction'][1]*lead,points[0][2]))
        points.extend((x,y,ground.height(x,y)+.065) for x,y in spec['via'])
        if end['kind']=='port':points.append((end['position'][0]+sign*end['direction'][0]*lead,end['position'][1]+sign*end['direction'][1]*lead,end['position'][2]))
        points.append(tuple(end['position']))
        if start['kind']=='port' and spec['width']>start['width']+.01:raise ValueError('桥路宽于入口：'+spec['id'])
        if end['kind']=='port' and spec['width']>end['width']+.01:raise ValueError('桥路宽于入口：'+spec['id'])
        points=resample(rounded_path(points,spec['width']*1.65),.26)
        route={**spec,'covered':bool(spec.get('covered',False)),'controlPoints':points,'length':arc_lengths(points)[-1]}
        routes.append(route);incident[spec['from']].append(route);incident[spec['to']].append(route)
    junction_points={key:[] for key,value in nodes.items() if value['kind']=='junction' and len(incident[key])>1}
    trims={}
    for key in junction_points:
        branches=[]
        for route in incident[key]:
            points=route['controlPoints']
            a,b=(points[0],points[1]) if route['from']==key else (points[-1],points[-2])
            branches.append((route,unit((b[0]-a[0],b[1]-a[1]))))
        for route,direction in branches:
            distance=route['width']*.70
            for other,vector in branches:
                if other is route:continue
                angle=math.acos(max(-1,min(1,direction[0]*vector[0]+direction[1]*vector[1])))
                distance=max(distance,max(route['width'],other['width'])*.5/max(.20,math.tan(angle/2))+.20)
            trims[(key,route['id'])]=min(distance,route['length']*.40)
    for route in routes:
        first,last=nodes[route['from']],nodes[route['to']]
        begin=trims.get((first['id'],route['id']),0)
        finish=trims.get((last['id'],route['id']),0)
        points=resample(slice_path(route['controlPoints'],begin,route['length']-finish),.26)
        terrain_left,terrain_right=offset_edges(points,route['width'])
        lengths=arc_lengths(points);total=lengths[-1]
        wet=[ground.water_distance(x,y)<.2 and ground.height(x,y)<plan['water']['level']+.15 for x,y,_ in points]
        wet_stations=[s for s,is_wet in zip(lengths,wet) if is_wet]
        bridge=[];profile=[]
        for i,(x,y,_) in enumerate(points):
            s=lengths[i];base=ground.height(x,y)+.065
            if route['surface']!='ground':base=first['position'][2]+(last['position'][2]-first['position'][2])*s/total
            else:
                for distance,target in [(s,first['position'][2]),(total-s,last['position'][2])]:
                    weight=1-smooth(distance/2.5)
                    base=base*(1-weight)+target*weight
            near_water=min((abs(s-station) for station in wet_stations),default=999)
            base=max(base,ground.height(x,y)+.065,ground.height(*terrain_left[i][:2])+.04,ground.height(*terrain_right[i][:2])+.04)
            if wet[i]:
                clearance=.25 if route['surface']!='ground' else .62
                target=min(plan['water']['level']+clearance,first['position'][2]+.40*s,last['position'][2]+.40*(total-s))
                base=max(base,plan['water']['level']+.25,target)
            if route['surface']!='ground':base+=route.get('arch',0)*math.sin(math.pi*s/total)**2
            profile.append((x,y,base))
            bridge.append(route['surface']!='ground' or near_water<2.0)
        route.update(points=profile,bridge=bridge,length=total)
        del route['controlPoints']
    # Raise approaches into continuous ramps; fixed building decks are never moved.
    # Junction elevations participate in the same network constraints as bridge ends.
    for iteration in range(len(nodes)+1):
        changed=False
        for route in routes:
            points=route['points'];heights=[p[2] for p in points]
            for key,index in [(route['from'],0),(route['to'],-1)]:
                node=nodes[key]
                heights[index]=node['position'][2] if node['kind']=='port' else max(heights[index],node['position'][2])
            for indices in [range(1,len(points)),range(len(points)-2,-1,-1)]:
                forward=indices.step>0
                for i in indices:
                    neighbor=i-1 if forward else i+1
                    heights[i]=max(heights[i],heights[neighbor]-.52*math.dist(points[i][:2],points[neighbor][:2]))
            for key,index in [(route['from'],0),(route['to'],-1)]:
                node=nodes[key]
                if node['kind']=='port' and heights[index]>node['position'][2]+.025:
                    raise ValueError('路径无法在允许坡度内接入建筑：'+route['id']+' / '+key+' / '+str(round(heights[index]-node['position'][2],3)))
                if node['kind']=='junction' and heights[index]>node['position'][2]+1e-6:
                    node['position'][2]=heights[index];changed=True
            route['points']=[(p[0],p[1],z) for p,z in zip(points,heights)]
        if not changed:break
    else:raise ValueError('连接网络的高度约束未收敛')
    for route in routes:
        left,right=offset_edges(route['points'],route['width'])
        route.update(left=left,right=right,navigation=[nodes[route['from']]['position']]+route['points']+[nodes[route['to']]['position']])
        for key,index in [(route['from'],0),(route['to'],-1)]:
            if key in junction_points:junction_points[key].extend([left[index][:2],right[index][:2]])
    junctions=[]
    for key,vertices in junction_points.items():
        node=nodes[key];radius=max(route['width'] for route in incident[key])*.5
        vertices.extend((node['position'][0]+math.cos(j*math.pi/4)*radius,node['position'][1]+math.sin(j*math.pi/4)*radius) for j in range(8))
        polygon=convex_hull(vertices)
        if len(polygon)>2:junctions.append({'id':key,'vertices':[(x,y,nodes[key]['position'][2]) for x,y in polygon]})
    return nodes,routes,junctions

def deck_slab(m,quad,material,role,thickness=.16,gap=.008):
    a,b,c,d=quad
    p=[lerp(a,b,gap),lerp(b,a,gap),lerp(c,d,gap),lerp(d,c,gap)]
    lower=[(x,y,z-thickness) for x,y,z in p]
    verts=p+lower
    m.add(verts,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],material,role)

def edge_rail(m,points,material,ground,water_level):
    lengths=arc_lengths(points);length=lengths[-1]
    if length<.50:return
    count=max(1,math.ceil(length/1.25));posts=[station(points,lengths,length*j/count) for j in range(count+1)]
    bamboo=material=='bamboo';stone=material=='white_stone'
    for x,y,z in posts:
        if bamboo:
            m.cylinder((x,y,z+.44),.065,.88,material,'bridge_posts',12)
            for h in [.12,.38,.66,.86]:m.cylinder((x,y,z+h),.075,.025,'bamboo_ring','bamboo_joints',12)
        else:
            m.box((x,y,z+.42),(.16,.16,.84),material,'bridge_posts',bevel=.025)
            m.lathe((x,y,z+.84),[(.10,0),(.115,.04),(.10,.10),(.035,.14)],material,'bridge_caps',16)
    for height,radius in [(.85,.055),(.35,.035)]:
        m.tube([(x,y,z+height) for x,y,z in points],radius,material,'bridge_handrails',10)
    for a,b in zip(posts,posts[1:]):
        for t in [.25,.5,.75]:
            x,y,z=lerp(a,b,t)
            m.beam((x,y,z+.35),(x,y,z+.85),.035,mat=material,role='bridge_infill')
    for a,b in zip(points,points[1:]):
        length=math.dist(a[:2],b[:2]);yaw=math.atan2(b[1]-a[1],b[0]-a[0])
        m.collider(((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2+.45),(length+.02,.14,.9),yaw,kind='railing')

def covered_gallery(m,route,nodes):
    from architecture import lantern
    p=route['points'];lengths=arc_lengths(p);length=lengths[-1]
    start=nodes[route['from']].get('canopy',0);end=nodes[route['to']].get('canopy',0)
    center=resample(slice_path(p,start,length-end),.30)
    left,right=offset_edges(center,route['width']+.50)
    sections=10;verts=[]
    for a,b in zip(right,left):
        for j in range(sections+1):
            t=j/sections;point=lerp(a,b,t);u=abs(2*t-1)
            verts.append((point[0],point[1],point[2]+2.5+.55*(1-u)**1.5+.10*u**6))
    faces=[(i*(sections+1)+j,(i+1)*(sections+1)+j,(i+1)*(sections+1)+j+1,i*(sections+1)+j+1) for i in range(len(center)-1) for j in range(sections)]
    m.add(verts,faces,'tile_dark','roof_shell',True)
    for i in range(len(center)):
        for begin,finish in [(0,5),(5,10)]:
            m.tube([(x,y,z+.025) for x,y,z in verts[i*(sections+1)+begin:i*(sections+1)+finish+1]],.047,'tile','roof_tiles',8)
    for j in [0,2,5,8,10]:
        points=[verts[i*(sections+1)+j] for i in range(len(center))]
        m.tube(points,.055 if j in [0,10] else .025,'wood_dark' if j in [0,10] else 'tile_dark','gallery_roof_edges',8)
    # Keep each stone plinth wholly on the decking and over the bearer ends.
    frame_left,frame_right=offset_edges(p,route['width']-.32)
    for edge in [frame_left,frame_right]:m.tube([(x,y,z+2.42) for x,y,z in edge],.07,'wood_dark','gallery_beams',8)
    count=max(2,math.ceil(length/3.0))
    for i in range(count+1):
        s=length*i/count
        a=station(frame_left,lengths,s)
        b=station(frame_right,lengths,s)
        for x,y,z in [a,b]:
            m.lathe((x,y,z),[(.14,0),(.14,.08),(.11,.14)],'white_stone','column_bases',16)
            m.cylinder((x,y,z+1.32),.075,2.36,'wood','gallery_columns',16)
            m.collider((x,y,z+1.25),(.17,.17,2.5))
        m.beam((a[0],a[1],a[2]+2.40),(b[0],b[1],b[2]+2.40),.13,.18,'wood','gallery_crossbeams')
        if 0<i<count and i%3==0:
            x,y,z=station(p,lengths,s);lantern(m,x,y,z+2.05)

def build_circulation(m,plan,ports,ground):
    nodes,routes,junctions=compile_routes(plan,ports,ground)
    for junction in junctions:
        with m.component('junction.'+junction['id']):
            vertices=junction['vertices']
            m.add(vertices,[tuple(range(len(vertices)))],'paving','junction_floor')
            for a,b in zip(vertices,vertices[1:]+vertices[:1]):
                bottom_a=(a[0],a[1],ground.height(*a[:2])-.06);bottom_b=(b[0],b[1],ground.height(*b[:2])-.06)
                m.add([a,b,bottom_b,bottom_a],[(0,1,2,3)],'stone','junction_foundation')
            for i in range(1,len(vertices)-1):m.walk_quad([vertices[0],vertices[i],vertices[i+1],vertices[0]],junction['id'])
            node=nodes[junction['id']]
            for a,b in zip(vertices,vertices[1:]+vertices[:1]):
                midpoint=lerp(a,b,.5)
                if midpoint[2]-ground.height(*midpoint[:2])<.75:continue
                opening=False
                for route in routes:
                    if junction['id'] not in [route['from'],route['to']]:continue
                    end=route['points'][0] if route['from']==junction['id'] else route['points'][-1]
                    direction=unit((end[0]-node['position'][0],end[1]-node['position'][1]))
                    for t in [0,.25,.5,.75,1]:
                        point=lerp(a,b,t);dx,dy=point[0]-node['position'][0],point[1]-node['position'][1]
                        if dx*direction[0]+dy*direction[1]>0 and abs(dx*direction[1]-dy*direction[0])<route['width']/2+.1:opening=True
                if not opening:edge_rail(m,[a,b],'white_stone',ground,plan['water']['level'])
    for route in routes:
        with m.component('route.'+route['id']):
            if route['covered']:covered_gallery(m,route,nodes)
            p,left,right,bridges=route['points'],route['left'],route['right'],route['bridge']
            rng=random.Random(sum((i+1)*ord(char) for i,char in enumerate(route['id'])))
            flags=[bridges[i] or bridges[i+1] for i in range(len(p)-1)]
            for i,bridge in enumerate(flags):
                quad=[right[i],right[i+1],left[i+1],left[i]]
                grade=abs(p[i+1][2]-p[i][2])/math.dist(p[i][:2],p[i+1][:2])
                if not bridge and grade>.28:quad=[(x,y,max(p[i][2],p[i+1][2])) for x,y,z in quad]
                m.walk_quad(quad,route['id'])
                if bridge:
                    material=rng.choice(['wood','deck_wood','deck_wood','wood_light']) if route['surface']!='stone' else rng.choice(['white_stone','stone'])
                    deck_slab(m,quad,material,'bridge_deck',.19)
                else:
                    depth=max(.065,max(z-ground.height(x,y)+.08 for x,y,z in quad))
                    deck_slab(m,quad,'dark_stone','path_bedding',depth,0)
                    columns=max(2,round(route['width']/.58))
                    for j in range(columns):
                        u0=(j+.012)/columns;u1=(j+.988)/columns
                        tile=[lerp(quad[0],quad[3],u0),lerp(quad[1],quad[2],u0),lerp(quad[1],quad[2],u1),lerp(quad[0],quad[3],u1)]
                        tile=[(x,y,z+.012) for x,y,z in tile]
                        deck_slab(m,tile,rng.choice(['paving','paving','paving_light']),'path_stones',.025,.014)
            elevated=[not flag and max(p[i][2]-ground.height(*left[i][:2]),p[i][2]-ground.height(*right[i][:2]))>.70 for i,flag in enumerate(flags)]
            start=None
            for i,flag in enumerate(elevated+[False]):
                if flag and start is None:start=i
                if not flag and start is not None:
                    edge_rail(m,left[start:i+1],'white_stone',ground,plan['water']['level'])
                    edge_rail(m,right[start:i+1],'white_stone',ground,plan['water']['level'])
                    start=None
            runs=[];start=None
            for i,flag in enumerate(flags+[False]):
                if flag and start is None:start=i
                if not flag and start is not None:runs.append((start,i));start=None
            for start,end in runs:
                railmat='white_stone' if route['surface']=='stone' else 'bamboo'
                edge_rail(m,left[start:end+1],railmat,ground,plan['water']['level'])
                edge_rail(m,right[start:end+1],railmat,ground,plan['water']['level'])
                segment=p[start:end+1];lengths=arc_lengths(segment);span=lengths[-1]
                for index in range(max(2,math.ceil(span/3.0))+1):
                    t=index/max(2,math.ceil(span/3.0));s=t*span
                    center=station(segment,lengths,s)
                    near=station(segment,lengths,min(span,s+.15)) if s<span else station(segment,lengths,max(0,s-.15))
                    dx,dy=unit((near[0]-center[0],near[1]-center[1]));nx,ny=-dy,dx
                    x,y,z=center
                    a=(x+nx*route['width']*.39,y+ny*route['width']*.39,z-.21)
                    b=(x-nx*route['width']*.39,y-ny*route['width']*.39,z-.21)
                    m.beam(a,b,.14,.20,'wood_dark','bridge_joists')
                    for xx,yy,zz in [a,b]:
                        bottom=min(ground.height(xx,yy)-.12,plan['water']['level']-.45)
                        m.box((xx,yy,bottom+.12),(.38,.38,.24),'dark_stone','bridge_footings',bevel=.025)
                        m.beam((xx,yy,bottom+.20),(xx,yy,zz),.15,mat='wood_dark',role='bridge_piers')
                        m.beam((xx,yy,zz-.50),(x,y,zz-.04),.09,mat='wood_dark',role='bridge_braces')
                for i in range(start,end,4):
                    for edge in [left[i],right[i]]:
                        xx,yy,zz=lerp(edge,p[i],.16)
                        m.cylinder((xx,yy,zz+.007),.014,.012,'bronze','bridge_fasteners',8)
    return nodes,routes
