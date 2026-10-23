import math
from contextlib import contextmanager
import bpy
from mathutils import Vector, Matrix

TAU=math.tau

class MeshBuilder:
    """Batch construction by semantic component and material, retaining edit groups."""
    def __init__(self,name):
        self.name=name
        self.buckets={}
        self.colliders=[]
        self.surfaces=[]
        self.plaques=[]
        self.ports={}
        self.terrain_pads=[]
        self.component_id=""
        self.matrix=Matrix.Identity(4)
        self.yaw=0

    @contextmanager
    def transform(self,center=(0,0,0),yaw=0):
        before,angle=self.matrix,self.yaw
        self.matrix=self.matrix@Matrix.Translation(Vector(center))@Matrix.Rotation(yaw,4,"Z")
        self.yaw+=yaw
        try:yield self
        finally:self.matrix,self.yaw=before,angle

    def add(self,verts,faces,mat,role="structure",smooth=False,uvs=None,colors=None):
        if colors is not None:
            if len(colors)!=len(verts) or any(len(color)!=4 or any(not math.isfinite(value) or not 0<=value<=1 for value in color) for color in colors):
                raise ValueError("Vertex colors require one finite linear RGBA value in [0,1] per vertex")
        key=(self.component_id,role,mat)
        if key not in self.buckets:self.buckets[key]={"v":[],"f":[],"s":[],"uv":[],"colors":None if colors is None else []}
        b=self.buckets[key]
        if (b["colors"] is None)!=(colors is None):
            raise ValueError("Colored and uncolored geometry need distinct component/role/material buckets")
        start=len(b["v"])
        b["v"].extend(tuple(self.matrix@Vector(v)) for v in verts)
        b["f"].extend(tuple(start+i for i in face) for face in faces)
        b["s"].extend(smooth if isinstance(smooth,list) else [smooth]*len(faces))
        b["uv"].extend(uvs if uvs is not None else [None]*len(verts))
        if colors is not None:b["colors"].extend(tuple(color) for color in colors)

    def box(self,center,size,mat="wood",role="structure",rotation=0,bevel=0):
        x,y,z=center
        a,b,c=[v/2 for v in size]
        if min(size)<=0:return
        if bevel>0:
            bevel=min(bevel,a*.45,b*.45,c*.45)
            # Six flat faces, twelve chamfers and eight corner triangles. The
            # previous XY-only octagon left every horizontal edge razor sharp.
            extents=(a,b,c);raw=[];faces=[];lookup={}
            def face(points):
                normal=(Vector(points[1])-Vector(points[0])).cross(Vector(points[2])-Vector(points[0]))
                if normal.dot(sum((Vector(p) for p in points),Vector()))<0:points=list(reversed(points))
                indices=[]
                for point in points:
                    key=tuple(round(v,9) for v in point)
                    if key not in lookup:lookup[key]=len(raw);raw.append(point)
                    indices.append(lookup[key])
                faces.append(tuple(indices))
            for axis in range(3):
                others=[i for i in range(3) if i!=axis]
                for sign in [-1,1]:
                    points=[]
                    for sa,sb in [(-1,-1),(1,-1),(1,1),(-1,1)]:
                        p=[0.,0.,0.];p[axis]=sign*extents[axis]
                        p[others[0]]=sa*(extents[others[0]]-bevel);p[others[1]]=sb*(extents[others[1]]-bevel)
                        points.append(p)
                    face(points)
            for axis_a,axis_b in [(0,1),(0,2),(1,2)]:
                third=3-axis_a-axis_b
                for sa in [-1,1]:
                    for sb in [-1,1]:
                        points=[]
                        for end,outer in [(-1,axis_a),(-1,axis_b),(1,axis_b),(1,axis_a)]:
                            p=[0.,0.,0.];p[third]=end*(extents[third]-bevel)
                            p[axis_a]=sa*(extents[axis_a]-(0 if outer==axis_a else bevel))
                            p[axis_b]=sb*(extents[axis_b]-(0 if outer==axis_b else bevel))
                            points.append(p)
                        face(points)
            for sx in [-1,1]:
                for sy in [-1,1]:
                    for sz in [-1,1]:
                        signs=(sx,sy,sz)
                        face([[signs[i]*(extents[i]-(0 if i==outer else bevel)) for i in range(3)] for outer in range(3)])
            cs,sn=math.cos(rotation),math.sin(rotation)
            verts=[(x+px*cs-py*sn,y+px*sn+py*cs,z+pz) for px,py,pz in raw]
            self.add(verts,faces,mat,role)
            return
        points=[(-a,-b),(a,-b),(a,b),(-a,b)]
        n=len(points)
        cs,sn=math.cos(rotation),math.sin(rotation)
        verts=[(x+px*cs-py*sn,y+px*sn+py*cs,z+zz) for zz in [-c,c] for px,py in points]
        faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
        faces.extend((i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n))
        self.add(verts,faces,mat,role)

    def beam(self,a,b,width,depth=None,mat="wood",role="timber"):
        a,b=Vector(a),Vector(b)
        axis=b-a
        if axis.length<1e-6:return
        depth=depth or width
        q=axis.to_track_quat("Z","Y")
        verts=[tuple((a+b)/2+q@Vector((x*width/2,y*depth/2,z*axis.length/2))) for z in [-1,1] for y in [-1,1] for x in [-1,1]]
        self.add(verts,[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)],mat,role)

    def cylinder(self,center,radius,height,mat="wood",role="columns",sides=16,top_radius=None):
        top_radius=radius if top_radius is None else top_radius
        x,y,z=center
        verts=[(x+math.cos(TAU*i/sides)*r,y+math.sin(TAU*i/sides)*r,z+dz) for dz,r in [(-height/2,radius),(height/2,top_radius)] for i in range(sides)]
        faces=[tuple(reversed(range(sides))),tuple(range(sides,2*sides))]
        faces.extend((i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides))
        self.add(verts,faces,mat,role,[False,False]+[True]*sides)

    def lathe(self,center,profile,mat="stone",role="details",sides=20):
        x,y,z=center
        verts=[(x+r*math.cos(TAU*i/sides),y+r*math.sin(TAU*i/sides),z+h) for r,h in profile for i in range(sides)]
        faces=[]
        for j in range(len(profile)-1):
            for i in range(sides):
                a=j*sides+i
                b=j*sides+(i+1)%sides
                faces.append((a,b,b+sides,a+sides))
        faces.append(tuple(reversed(range(sides))))
        faces.append(tuple(range((len(profile)-1)*sides,len(profile)*sides)))
        self.add(verts,faces,mat,role,[True]*(len(faces)-2)+[False,False])

    def sphere(self,center,radii,mat="leaf",role="foliage",segments=10,rings=7):
        x,y,z=center
        if isinstance(radii,(float,int)):radii=(radii,radii,radii)
        rx,ry,rz=radii
        verts=[(x,y,z+rz)]
        for j in range(1,rings):
            theta=math.pi*j/rings
            for i in range(segments):
                phi=TAU*i/segments
                verts.append((x+rx*math.sin(theta)*math.cos(phi),y+ry*math.sin(theta)*math.sin(phi),z+rz*math.cos(theta)))
        verts.append((x,y,z-rz))
        faces=[(0,1+i,1+(i+1)%segments) for i in range(segments)]
        for j in range(rings-2):
            for i in range(segments):
                a=1+j*segments+i
                b=1+j*segments+(i+1)%segments
                faces.append((a,a+segments,b+segments,b))
        last=len(verts)-1
        start=last-segments
        faces.extend((start+i,last,start+(i+1)%segments) for i in range(segments))
        self.add(verts,faces,mat,role,True)

    def tube(self,points,radius,mat="wood",role="details",sides=8,taper=1):
        if role=="scholar_stone":points=curve_points(points,4)
        points=[Vector(p) for p in points]
        if len(points)<2:return
        verts=[];uvs=[];length=0
        for j,p in enumerate(points):
            if j:length+=(p-points[j-1]).length
            tangent=points[min(len(points)-1,j+1)]-points[max(0,j-1)]
            q=tangent.to_track_quat("Z","Y")
            r=radius*(1-(1-taper)*j/(len(points)-1))
            for i in range(sides):
                rr=r*(1+.10*math.sin(j*1.7+i*2.1)) if role=="scholar_stone" else r
                v=q@Vector((rr*math.cos(TAU*i/sides),rr*math.sin(TAU*i/sides),0))
                verts.append(tuple(p+v))
                uvs.append((TAU*radius*i/sides*.45,length*.45))
        faces=[]
        for j in range(len(points)-1):
            for i in range(sides):
                a=j*sides+i
                b=j*sides+(i+1)%sides
                faces.append((a,b,b+sides,a+sides))
        faces.extend([tuple(reversed(range(sides))),tuple(range((len(points)-1)*sides,len(points)*sides))])
        self.add(verts,faces,mat,role,[True]*(len(faces)-2)+[False,False],uvs)

    def quad(self,points,mat,role="details",uv=None):
        self.add(points,[(0,1,2,3)],mat,role,False,uv)

    def disk(self,center,radius,mat,role="details",sides=24):
        x,y,z=center
        self.add([(x,y,z)]+[(x+radius*math.cos(TAU*i/sides),y+radius*math.sin(TAU*i/sides),z) for i in range(sides)],
                 [(0,1+i,1+(i+1)%sides) for i in range(sides)],mat,role)

    def collider(self,center,size,rotation=0,kind="solid"):
        self.colliders.append({"center":list(self.matrix@Vector(center)),"size":list(size),"rotation":rotation+self.yaw,"kind":kind,"componentId":self.component_id})

    def walk_surface(self,x,y,w,d,z,rotation=0):
        point=self.matrix@Vector((x,y,z))
        self.surfaces.append({"kind":"rect","center":[point.x,point.y],"size":[w,d],"height":point.z,"rotation":rotation+self.yaw})

    def walk_quad(self,points,route_id):
        self.surfaces.append({"kind":"quad","vertices":[list(self.matrix@Vector(p)) for p in points],"routeId":route_id})

    def port(self,name,position,direction,width,canopy=0):
        if name in self.ports:raise ValueError('重复建筑连接口：'+self.name+':'+name)
        dx,dy=direction;c,s=math.cos(self.yaw),math.sin(self.yaw)
        self.ports[name]={"position":list(self.matrix@Vector(position)),"direction":[dx*c-dy*s,dx*s+dy*c],"width":width,"canopy":canopy}

    def ground_pad(self,x,y,w,d,z=-.1,blend=3):
        self.terrain_pads.append({"position":list(self.matrix@Vector((x,y,z))),"size":[w,d],"rotation":self.yaw,"blend":blend})

    @contextmanager
    def component(self,identifier):
        previous=self.component_id;self.component_id=identifier
        try:yield self
        finally:self.component_id=previous

    def plaque(self,text,position,size=.52,material="gold_letter"):
        point=self.matrix@Vector(position)
        self.plaques.append({"text":text,"position":list(point),"size":size,"yaw":self.yaw,"material":material})

    def emit(self,collection,materials,root):
        objects=[]
        components={}
        for (component,role,mat_name),b in self.buckets.items():
            if not b["v"]:continue
            mesh=bpy.data.meshes.new('.'.join(filter(None,[self.name,component,role,mat_name])))
            mesh.from_pydata(b["v"],[],b["f"])
            mesh.materials.append(materials[mat_name])
            if b["colors"] is not None:
                color=mesh.color_attributes.new(name="GardenColor",type="FLOAT_COLOR",domain="POINT")
                color.data.foreach_set("color",[value for rgba in b["colors"] for value in rgba])
                index=mesh.color_attributes.find("GardenColor")
                mesh.color_attributes.active_color_index=index
                mesh.color_attributes.render_color_index=index
            uv=mesh.uv_layers.new(name="UVMap")
            for polygon,smooth in zip(mesh.polygons,b["s"]):
                polygon.use_smooth=smooth
                axis=max(range(3),key=lambda axis:abs(polygon.normal[axis]))
                for index in polygon.loop_indices:
                    vertex=mesh.loops[index].vertex_index
                    if b["uv"][vertex] is not None:
                        uv.data[index].uv=b["uv"][vertex]
                        continue
                    point=mesh.vertices[vertex].co
                    pair=(point.x,point.y) if axis==2 else ((point.x,point.z) if axis==1 else (point.y,point.z))
                    uv.data[index].uv=(pair[0]*.45,pair[1]*.45)
            mesh.update()
            obj=bpy.data.objects.new(mesh.name,mesh)
            target=collection
            if component:
                if component not in components:
                    components[component]=bpy.data.collections.new(component)
                    collection.children.link(components[component])
                target=components[component]
                obj["componentId"]=component
            target.objects.link(obj)
            obj.parent=root
            obj["landmarkId"]=self.name
            obj["gardenRole"]=role
            obj["materialId"]=mat_name
            objects.append(obj)
        return objects

def curve_points(points,steps=10):
    result=[]
    points=[Vector(p) for p in points]
    for j in range(len(points)-1):
        p0,p1,p2,p3=points[max(0,j-1)],points[j],points[j+1],points[min(len(points)-1,j+2)]
        for k in range(steps):
            t=k/steps
            result.append(tuple(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t)))
    result.append(tuple(points[-1]))
    return result

def ribbon(builder,points,width,mat,role="paths",height_func=None):
    points=curve_points(points,8)
    verts=[]
    for i,p in enumerate(points):
        prev,nxt=points[max(0,i-1)],points[min(len(points)-1,i+1)]
        dx,dy=nxt[0]-prev[0],nxt[1]-prev[1]
        norm=math.hypot(dx,dy) or 1
        for side in [-1,1]:
            x=p[0]-dy/norm*width*.5*side
            y=p[1]+dx/norm*width*.5*side
            z=height_func(x,y) if height_func else p[2]
            verts.append((x,y,z))
    builder.add(verts,[(i*2+1,i*2,i*2+2,i*2+3) for i in range(len(points)-1)],mat,role)
    return points
