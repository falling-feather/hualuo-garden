import math
import random
from mathutils import Vector
from mathutils.geometry import tessellate_polygon
from geometry import MeshBuilder,curve_points,ribbon
from plants import tree,rock,reeds,leaf,flower,bamboo,lotus_leaf
from architecture import garden_wall,railing
from roofs import roof
from circulation import build_circulation
from route_geometry import offset_edges
from terrain import GardenTerrain,wall_sections,foundation_mesh,smooth
from ecology import BOUNDARY,clear_ground,boundary_trees,segment_distance as distance_segment,inside as inside_polygon
from undergrowth import sward_density,grass_tuft,tree_litter


def _linear_color(rgb):
    return tuple(value/12.92 if value<=.04045 else ((value+.055)/1.055)**2.4 for value in rgb)+(1.0,)


def _mix_color(first,second,weight):
    return tuple(a*(1-weight)+b*weight for a,b in zip(first,second))


def _terrain_colors(heights,water_distances,n,step_x,step_y,water_level):
    """Continuous linear RGBA from slope and moisture, with no material cutoffs."""
    # Full-colour scanned turf supplies its own hue. These are restrained
    # modifiers, not a second green colour multiplied into the photograph.
    grass=_linear_color((.96,.98,.92))
    earth=_linear_color((.92,.87,.76))
    wet_bank=_linear_color((.76,.80,.66))
    stone=_linear_color((.92,.92,.85))
    colors=[]
    for j in range(n):
        j0,j1=max(0,j-1),min(n-1,j+1)
        for i in range(n):
            i0,i1=max(0,i-1),min(n-1,i+1);index=j*n+i
            gx=(heights[j*n+i1]-heights[j*n+i0])/((i1-i0)*step_x)
            gy=(heights[j1*n+i]-heights[j0*n+i])/((j1-j0)*step_y)
            slope=math.hypot(gx,gy)
            raised=smooth((heights[index]-water_level-.35)/.8)
            earth_weight=.72*raised*smooth((slope-.10)/.38)
            stone_weight=.65*raised*smooth((slope-.32)/.55)
            moisture=.55*(1-smooth((water_distances[index]+.1)/4.6))
            moisture*=.8+.2*smooth(-gy/.20)
            color=_mix_color(grass,earth,earth_weight)
            color=_mix_color(color,stone,stone_weight)
            color=_mix_color(color,wet_bank,moisture)
            variation=.91+.09*sward_density(i*step_x,j*step_y)
            colors.append(tuple(c*variation if channel<3 else c for channel,c in enumerate(color)))
    return colors


class Ground:
    def __init__(self,plan,extra_pads=()):
        self.plan=plan
        lake=plan["water"]["lake"]
        loop=[lake[-1]]+lake+lake[:2]
        self.lake=[point[:2] for point in curve_points([(x,y,0) for x,y in loop],8)[8:-8]]
        if math.dist(self.lake[0],self.lake[-1])<1e-5:self.lake.pop()
        self.rivers=[(curve_points([(x,y,plan['water']['level']) for x,y in river["points"]],8),river["width"]) for river in plan["water"]["rivers"]]
        self.relief=GardenTerrain(plan,extra_pads)
        self.pads=self.relief.pads
        self.grid=None

    def water_distance(self,x,y):
        edge=min(distance_segment(x,y,p,self.lake[(i+1)%len(self.lake)]) for i,p in enumerate(self.lake))
        lake_distance=-edge if inside_polygon(x,y,self.lake) else edge
        distance=lake_distance
        for points,width in self.rivers:
            d=min(distance_segment(x,y,points[i],points[i+1]) for i in range(len(points)-1))-width/2
            distance=min(distance,d)
        return distance

    def height(self,x,y):
        if self.grid is None:return self.analytic_height(x,y)
        n=self.grid_size;x0,y0,x1,y1=self.plan['bounds']
        u=max(0,min(n-1.000001,(x-x0)/(x1-x0)*(n-1)));v=max(0,min(n-1.000001,(y-y0)/(y1-y0)*(n-1)))
        i,j=math.floor(u),math.floor(v);a,b=u-i,v-j;h=self.grid
        return (h[j*n+i]*(1-a)+h[j*n+i+1]*a)*(1-b)+(h[(j+1)*n+i]*(1-a)+h[(j+1)*n+i+1]*a)*b

    def bake(self,n=257):
        x0,y0,x1,y1=self.plan['bounds'];self.grid_size=n
        self.grid=[];self.water_grid=[]
        for j in range(n):
            y=y0+(y1-y0)*j/(n-1)
            for i in range(n):
                x=x0+(x1-x0)*i/(n-1);water=self.water_distance(x,y)
                self.water_grid.append(water)
                self.grid.append(round(self.relief.height(x,y,water),4))
        return self.grid

    def analytic_height(self,x,y):
        return self.relief.height(x,y,self.water_distance(x,y))

def build_landscape(plan,ports,extra_pads=()):
    m=MeshBuilder("garden")
    g=Ground(plan,extra_pads)
    lo_x,lo_y,hi_x,hi_y=plan["bounds"]
    n=257
    values=g.bake(n)
    vertices=[]
    for j in range(n):
        y=lo_y+(hi_y-lo_y)*j/(n-1)
        for i in range(n):
            x=lo_x+(hi_x-lo_x)*i/(n-1)
            h=values[j*n+i]
            vertices.append((x,y,h))
    # One shared-vertex mesh keeps normals continuous across grass, soil and
    # stone tones.  Vertex colors interpolate between the ecological bands.
    step_x=(hi_x-lo_x)/(n-1);step_y=(hi_y-lo_y)/(n-1)
    colors=_terrain_colors(values,g.water_grid,n,step_x,step_y,plan["water"]["level"])
    faces=[(j*n+i,j*n+i+1,(j+1)*n+i+1,(j+1)*n+i) for j in range(n-1) for i in range(n-1)]
    m.add(vertices,faces,"terrain","terrain",True,uvs=[(x*.5,y*.5) for x,y,z in vertices],colors=colors)
    # A low-density apron shares the exact outer terrain rim, then relaxes into
    # broad low ground.  Its independent role lets the viewer disable distant
    # shadow-map acne without disabling garden terrain shadows.
    rim=list(range(n-1))+[j*n+n-1 for j in range(n-1)]+[(n-1)*n+i for i in range(n-1,0,-1)]+[j*n for j in range(n-1,0,-1)]
    center_x,center_y=(lo_x+hi_x)/2,(lo_y+hi_y)/2
    apron=[];apron_uv=[];apron_colors=[];rings=[0,18,72,420]
    far_color=_linear_color((.84,.87,.78))
    for distance in rings:
        for index in rim:
            x,y,z=vertices[index];dx,dy=x-center_x,y-center_y;length=math.hypot(dx,dy)
            xx,yy=x+dx/length*distance,y+dy/length*distance
            if distance:
                far=-.22+.25*smooth((yy+220)/500)
                weight=smooth(distance/110)
                z=g.analytic_height(xx,yy)*(1-weight)+far*weight
            apron.append((xx,yy,z));apron_uv.append((xx*.5,yy*.5))
            apron_colors.append(_mix_color(colors[index],far_color,smooth(distance/160)))
    count=len(rim)
    apron_faces=[(j*count+i,(j+1)*count+i,(j+1)*count+(i+1)%count,j*count+(i+1)%count)
                 for j in range(len(rings)-1) for i in range(count)]
    m.add(apron,apron_faces,"terrain","surroundings",True,uvs=apron_uv,colors=apron_colors)
    # All water polygons lie at the same level for a single planar reflection pass in the viewer.
    lake=[Vector((x,y,plan["water"]["level"])) for x,y in g.lake]
    triangles=tessellate_polygon([lake])
    water_vertices=[]
    water_faces=[]
    for tri in triangles:
        start=len(water_vertices)
        water_vertices.extend(tuple(lake[index]) for index in tri)
        water_faces.append((start,start+1,start+2))
    m.add(water_vertices,water_faces,"water","water")
    for points,width in g.rivers:
        left,right=offset_edges(points,width)
        vertices=[point for pair in zip(right,left) for point in pair]
        m.add(vertices,[(2*i,2*i+2,2*i+3,2*i+1) for i in range(len(points)-1)],'water','water')

    network_nodes,network_routes=build_circulation(m,plan,ports,g)
    paths=[route['points'] for route in network_routes]

    # Two elevated galleries connect the ceremonial towers. Their span and structure
    # are a design completion of the novel's aerial passageways, not surveyed facts.
    by_id={spec["id"]:spec for spec in plan["landmarks"]}
    central=by_id["daguanlou"]
    for side_id,sign in [("hanfang",-1),("zhuijinge",1)]:
        side=by_id[side_id]
        a=Vector((central["position"][0]+sign*7.55,central["position"][1],central["position"][2]+6.66))
        local=-sign*4.65
        b=Vector((side["position"][0]+local*math.cos(side["rotation"]),side["position"][1]+local*math.sin(side["rotation"]),side["position"][2]+5.81))
        length=math.hypot(b.x-a.x,b.y-a.y);yaw=math.atan2(b.y-a.y,b.x-a.x)
        with m.transform(((a.x+b.x)/2,(a.y+b.y)/2,0),yaw):
            segments=24;ceiling=max(a.z,b.z)+2.45
            for j in range(segments):
                t=(j+.5)/segments;x=-length/2+length*t;z=a.z+(b.z-a.z)*t
                m.box((x,0,z-.09),(length/segments+.02,2.3,.18),"wood","skywalk_floor")
                m.walk_surface(x,0,length/segments+.03,2.3,z)
            for yy in [-1.12,1.12]:
                m.beam((-length/2,yy,a.z+.82),(length/2,yy,b.z+.82),.11,mat="white_stone",role="skywalk_rails")
                m.beam((-length/2,yy,a.z+.36),(length/2,yy,b.z+.36),.08,mat="white_stone",role="skywalk_rails")
                for j in range(7):
                    t=j/6;x=-length/2+length*t;z=a.z+(b.z-a.z)*t
                    m.beam((x,yy,z),(x,yy,z+.88),.14,mat="white_stone",role="skywalk_posts")
                for j in range(4):
                    t=j/3;x=-length/2+length*t;z=a.z+(b.z-a.z)*t
                    m.beam((x,yy,z),(x,yy,ceiling),.15,mat="redwood",role="skywalk_columns")
                    m.beam((x,yy,.8),(x,yy,z-.15),.24,mat="redwood",role="skywalk_supports")
            roof(m,0,0,length+1.1,3.3,ceiling+.15,.85,seed=157)

    # Irregular enclosing wall; the south gap joins the five-bay entrance.
    wall=BOUNDARY
    for i in range(len(wall)-1):
        if i==1:continue
        a,b=wall[i],wall[i+1]
        with m.component("boundary-wall"):
            for section in wall_sections(a,b,g.height):
                footing_vertices,footing_faces=foundation_mesh(section)
                m.add(footing_vertices,footing_faces,"rock_stone","wall_foundations",True)
                x,y=section["center"]
                with m.transform((x,y,section["base"])):
                    garden_wall(m,0,0,section["length"]+.018,section["yaw"],height=2.85)
                bottom=section["minimum"];top=section["base"]+.08
                m.collider((x,y,(bottom+top)/2),(section["length"]+.018,section["width"],top-bottom),section["yaw"])

    rng=random.Random(plan["seed"])
    placed=0;tree_positions=[]
    for attempt in range(1800):
        if placed>=185:break
        x,y=rng.uniform(-78,78),rng.uniform(-74,79)
        if any(abs(x-s["position"][0])<s["size"][0]/2+3.4 and abs(y-s["position"][1])<s["size"][1]/2+3.4 for s in plan["landmarks"]):continue
        if any(min(distance_segment(x,y,p,path[i+1]) for i,p in enumerate(path[:-1]))<2.3 for path in paths):continue
        water=g.water_distance(x,y)
        if water<.9:continue
        kind="willow" if water<6 else ("pine" if y>45 and placed%3==0 else "deciduous")
        h=rng.uniform(4.2,7.7)
        bloom=("flower_pink" if placed%3==0 else "flower_white") if kind=="deciduous" and placed%4!=1 else None
        # Root flares span a footprint, not just the trunk point.  Seat them at
        # its lowest sampled height so a slope cannot leave the downhill roots
        # floating; the uphill side naturally disappears into the soil.
        root_radius=h*.075
        root_height=min([g.height(x,y)]+[g.height(x+math.cos(k*math.tau/16)*root_radius,y+math.sin(k*math.tau/16)*root_radius) for k in range(16)])-.06
        tree(m,x,y,root_height,h,'grove' if kind=='deciduous' else kind,placed+500,bloom)
        tree_positions.append((x,y,h))
        placed+=1
    # Two staggered groves soften the view beyond the enclosing wall.  The
    # entrance stays open; planting is still on the shared exported ground.
    for j,(x,y,h,kind) in enumerate(boundary_trees(plan['seed'])):
        if not clear_ground(x,y,plan['landmarks'],network_routes,g.water_distance(x,y),margin=2.1,enclosed=False):continue
        radius=h*.075
        z=min(g.height(x+math.cos(k*math.tau/12)*radius,y+math.sin(k*math.tau/12)*radius) for k in range(12))-.07
        tree(m,x,y,z,h,'grove' if kind=='deciduous' else kind,j+6100,None)
        tree_positions.append((x,y,h))
    for j in range(95):
        angle=rng.random()*math.tau
        x,y=17+math.cos(angle)*rng.uniform(18,25),10+math.sin(angle)*rng.uniform(17,25)
        d=g.water_distance(x,y)
        if .05<d<2.8:
            rock(m,x,y,g.height(x,y),(.35+rng.random()*.5,.30+rng.random()*.4,.2+rng.random()*.35),j+12)
            if j%3==0:reeds(m,x,y,g.height(x,y),12,j)
    # Ground-cover clusters retain low silhouettes so architecture remains legible.
    for j in range(480):
        x,y=rng.uniform(-77,77),rng.uniform(-72,76)
        if g.water_distance(x,y)<.3:continue
        if any(min(distance_segment(x,y,p,path[i+1]) for i,p in enumerate(path[:-1]))<1.5 for path in paths):continue
        if any(abs(x-s["position"][0])<s["size"][0]/2+1 and abs(y-s["position"][1])<s["size"][1]/2+1 for s in plan["landmarks"]):continue
        z=g.height(x,y)
        for k in range(4):leaf(m,(x,y,z+.03),rng.uniform(.25,.55),.025,k*2.4+j,"leaf_dark",.18,"groundcover")
    # Lotus leaves on a sheltered corner of the lake.
    # Low sward is laid across actual soil, with a generous clear edge along
    # every route and rotated building footprint.  Separate RNG keeps existing
    # architectural and tree placements deterministic.
    grass_rng=random.Random(plan['seed']+7301)
    for gy in range(-80,87):
        for gx in range(-86,89):
            x,y=gx+grass_rng.uniform(-.40,.40),gy+grass_rng.uniform(-.40,.40)
            if not clear_ground(x,y,plan['landmarks'],network_routes,g.water_distance(x,y)):continue
            density=sward_density(x,y)
            if grass_rng.random()>density:continue
            grass_tuft(m,x,y,g.height,grass_rng,density)
            if grass_rng.random()<.012:
                for k in range(3):
                    cx,cy=x+grass_rng.uniform(-.24,.24),y+grass_rng.uniform(-.24,.24)
                    cz=g.height(cx,cy)+.18
                    m.beam((cx,cy,cz-.18),(cx,cy,cz),.006,mat='leaf_dark',role='grass')
                    flower(m,(cx,cy,cz),.035,'flower_gold' if k%2 else 'flower_white',gx*11+gy+k,role='grass_flower')
    litter_rng=random.Random(plan['seed']+2801)
    for x,y,h in tree_positions:
        tree_litter(m,x,y,h,g.height,litter_rng,lambda px,py:clear_ground(px,py,plan['landmarks'],network_routes,g.water_distance(px,py),margin=.30,enclosed=False))
    for j in range(65):
        x,y=rng.uniform(7,29),rng.uniform(9,23)
        if g.water_distance(x,y)>-1:continue
        lotus_leaf(m,x,y,.08+rng.random()*.02,rng.uniform(.17,.38),j)
        if j%7==0:
            m.beam((x,y,.05),(x,y,.50),.018,mat="bamboo",role="lotus")
            flower(m,(x,y,.52),.22,"flower_pink",j,role="lotus_flower")
    return m,{"size":n,"bounds":plan["bounds"],"heights":values},g,network_nodes,network_routes
