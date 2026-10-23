"""Pure-math terrain design for the garden's shared model/navigation height field.

The entrance screen, mountain-embraced farm, Hengwu's mountain relationship and
the high Cubi / low Aojing pair are literary constraints (reference document 11).
These ridge lines, widths and metre elevations are explicit artistic completion.
No random noise is used to manufacture relief.
"""
import math


def smooth(value):
    value=max(0.0,min(1.0,value))
    return value*value*(3-2*value)


class Ridge:
    """A broad, curving landform with varying crest height and shoulder width."""
    def __init__(self,name,knots):
        self.name=name
        samples=[]
        for j,(a,b) in enumerate(zip(knots,knots[1:])):
            before=knots[max(0,j-1)];after=knots[min(len(knots)-1,j+2)]
            count=max(2,math.ceil(math.dist(a[:2],b[:2])/5))
            for k in range(count):
                t=k/count;point=[]
                for axis in [0,1]:
                    p0,p1,p2,p3=before[axis],a[axis],b[axis],after[axis]
                    point.append(.5*(2*p1+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t**3))
                point.extend([a[2]+(b[2]-a[2])*smooth(t),a[3]+(b[3]-a[3])*smooth(t)])
                samples.append(point)
        samples.append(list(knots[-1]))
        self.segments=[]
        for a,b in zip(samples,samples[1:]):
            dx,dy=b[0]-a[0],b[1]-a[1];radius=max(a[3],b[3])
            self.segments.append((a[0],a[1],dx,dy,dx*dx+dy*dy,a[2],b[2]-a[2],a[3],b[3]-a[3],
                                  min(a[0],b[0])-radius,min(a[1],b[1])-radius,max(a[0],b[0])+radius,max(a[1],b[1])+radius))
        self.bounds=(min(s[9] for s in self.segments),min(s[10] for s in self.segments),
                     max(s[11] for s in self.segments),max(s[12] for s in self.segments))

    def height(self,x,y,base):
        if not(self.bounds[0]<=x<=self.bounds[2] and self.bounds[1]<=y<=self.bounds[3]):return base
        result=base
        for ax,ay,dx,dy,length2,peak,dh,radius,dr,x0,y0,x1,y1 in self.segments:
            if not(x0<=x<=x1 and y0<=y<=y1):continue
            t=max(0,min(1,((x-ax)*dx+(y-ay)*dy)/length2))
            distance=math.hypot(x-ax-dx*t,y-ay-dy*t);width=radius+dr*t
            if distance>=width:continue
            profile=smooth(1-distance/width)
            result=max(result,base+(peak+dh*t-base)*profile)
        return result


class GardenTerrain:
    """Continuous ridge/valley relief, water toes and protected building pads."""
    def __init__(self,plan,extra_pads=()):
        self.water_level=plan["water"]["level"]
        sites={site["id"]:site for site in plan["landmarks"]}
        sx,sy,_=sites["screen"]["position"]
        cx,cy,cz=sites["cubi"]["position"]
        tx,ty,tz=sites["longcui"]["position"]
        # The entrance ridge stays behind/right of the inscription and the
        # western winding path; its rock group is not buried by a central mound.
        self.ridges=[
            Ridge("entry-screen",[(sx+10,sy-6,1.25,7),(sx+13,sy,2.35,10),
                                  (sx+9,sy+8,2.65,10),(sx+2,sy+12,1.15,9)]),
            Ridge("western-mountain-embrace",[(-74,-42,1.15,20),(-77,-18,2.35,26),
                    (-73,10,3.95,28),(-68,30,4.55,30),(-65,54,4.10,28),(-55,73,3.30,27)]),
            Ridge("northern-spine",[(-62,73,3.35,25),(-37,82,3.50,25),(-10,85,2.65,23),
                    (17,84,3.25,24),(42,83,3.75,25),(65,77,3.80,25)]),
            Ridge("eastern-main-spine",[(65,78,3.80,25),(74,61,4.00,26),(72,44,6.20,29),
                    (cx,cy,cz,32),(69,20,4.75,27),(78,1,2.20,23),(79,-20,1.05,19)]),
            Ridge("temple-branch",[(cx,cy,cz,27),(50,38,4.80,23),(tx,ty,tz,23),(31,51,1.60,18)]),
        ]
        excluded={"water_pavilion","small_water_pavilion","bridge_pavilion","sluice","grotto","rockery"}
        pads=[{"position":[s["position"][0],s["position"][1],s["position"][2]-.1],
               "size":[s["size"][0]+2,s["size"][1]+2],"rotation":s["rotation"],"blend":3,"priority":0}
              for s in plan["landmarks"] if s["kind"] not in excluded]
        pads.extend({**pad,"priority":1} for pad in extra_pads)
        self.pads=[]
        for pad in pads:
            z=pad["position"][2]
            # Widen the shoulders, while preserving the exact original core and
            # its priority.  Abrupt 3 m collars around high pads formed cutouts.
            blend=max(pad["blend"],7+max(0,z)*.5)
            self.pads.append({**pad,"blend":blend,"cos":math.cos(pad["rotation"]),"sin":math.sin(pad["rotation"])})

    def raw_height(self,x,y):
        base=.22+.27*smooth((y+65)/145)+.10*smooth((x+85)/175)
        return max([base]+[ridge.height(x,y,base) for ridge in self.ridges])

    def shore_height(self,height,water_distance):
        if water_distance<=0:
            return self.water_level-.025-.735*smooth(-water_distance/2.8)
        # A narrow wet toe meets the water mesh; a broad shoulder rises into the
        # existing landform.  This keeps mountain streams in coherent valleys.
        toe=self.water_level-.025+.15*smooth(water_distance/.85)
        return toe+(height-toe)*smooth(water_distance/12.5)

    def height(self,x,y,water_distance):
        height=self.shore_height(self.raw_height(x,y),water_distance)
        core=[];weights=[]
        for pad in self.pads:
            cx,cy,z=pad["position"];dx,dy=x-cx,y-cy
            xx=dx*pad["cos"]+dy*pad["sin"];yy=-dx*pad["sin"]+dy*pad["cos"]
            distance=math.hypot(max(0,abs(xx)-pad["size"][0]/2),max(0,abs(yy)-pad["size"][1]/2))
            if distance<1e-7:core.append((pad["priority"],-pad["size"][0]*pad["size"][1],z))
            if distance<pad["blend"]:weights.append((smooth(1-distance/pad["blend"]),z))
        if core:return max(core)[2]
        if weights:
            influence=1-math.prod(1-weight for weight,z in weights)
            targets=[((weight/(1-weight+.0001))**2,z) for weight,z in weights]
            target=sum(weight*z for weight,z in targets)/sum(weight for weight,z in targets)
            height=height*(1-influence)+target*influence
        return height


def wall_sections(a,b,height_at,max_span=2.4,width=.44,embed=.18):
    """Short level wall runs with foundations that follow both terrain faces."""
    dx,dy=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dy)
    if length<1e-7:raise ValueError("A boundary wall segment must have length")
    count=math.ceil(length/max_span);side=(-dy/length,dx/length);sections=[]
    for j in range(count):
        start=(a[0]+dx*j/count,a[1]+dy*j/count)
        end=(a[0]+dx*(j+1)/count,a[1]+dy*(j+1)/count)
        samples=max(2,math.ceil(length/count/.35));lower=[];heights=[]
        for k in range(samples+1):
            t=k/samples;x=start[0]+(end[0]-start[0])*t;y=start[1]+(end[1]-start[1])*t
            pair=[]
            for sign in [-1,1]:
                xx,yy=x+side[0]*width*.5*sign,y+side[1]*width*.5*sign
                h=height_at(xx,yy);heights.append(h);pair.append((xx,yy,h-embed))
            heights.append(height_at(x,y));lower.append(pair)
        sections.append({"start":start,"end":end,"length":length/count,"yaw":math.atan2(dy,dx),
                         "center":((start[0]+end[0])/2,(start[1]+end[1])/2),
                         "base":max(heights),"minimum":min(heights)-embed,"lower":lower,"width":width})
    return sections


def foundation_mesh(section):
    """Closed foundation mesh; its lower edges are embedded on front and back."""
    vertices=[];top=section["base"]+.08
    for left,right in section["lower"]:
        vertices.extend([left,right,(left[0],left[1],top),(right[0],right[1],top)])
    faces=[(0,2,3,1)]
    for j in range(len(section["lower"])-1):
        a=4*j;b=a+4
        faces.extend([(a,b,b+2,a+2),(a+1,a+3,b+3,b+1),(a+2,b+2,b+3,a+3),(a,a+1,b+1,b)])
    last=4*(len(section["lower"])-1);faces.append((last,last+1,last+3,last+2))
    return vertices,faces
