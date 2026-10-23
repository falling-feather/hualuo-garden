"""Connected procedural plants and sculpted stone, retaining seasonal roles."""
import math
import random
from mathutils import Vector


def _curve(a, control, b, steps=6):
    a,control,b=Vector(a),Vector(control),Vector(b)
    return [(1-t)**2*a+2*t*(1-t)*control+t*t*b for t in (i/steps for i in range(steps+1))]


def _point(points,t):
    position=max(0,min(1,t))*(len(points)-1)
    index=min(len(points)-2,int(position))
    return Vector(points[index]).lerp(Vector(points[index+1]),position-index)


def _frame(direction):
    forward=Vector(direction).normalized()
    side=Vector((-forward.y,forward.x,0))
    if side.length<1e-5:side=Vector((1,0,0))
    side.normalize()
    return forward,side,forward.cross(side).normalized()


def _blade(m,base,direction,length,width,mat,role,camber=.04,twist=0):
    """Curved lamina whose base lies on the supporting shoot."""
    base=Vector(base)
    forward,side,normal=_frame(direction)
    vertices=[tuple(base)];uvs=[(.5,0)];centers=[base]
    for i in range(1,6):
        t=i/6
        breadth=width*math.sin(math.pi*t)**.78*(1-.20*t)
        mid=base+forward*(length*t)+normal*(camber*math.sin(math.pi*t)-camber*.20*t*t)
        centers.append(mid)
        for s in [-1,0,1]:
            p=mid+side*(breadth*s)+normal*(-breadth*.20*abs(s)+twist*s*math.sin(math.pi*t))
            vertices.append(tuple(p));uvs.append(((s+1)/2,t))
    tip=base+forward*length-normal*(camber*.20)
    centers.append(tip);vertices.append(tuple(tip));uvs.append((.5,1))
    faces=[(0,1,2),(0,2,3)]
    for i in range(4):
        a=1+i*3;b=a+3
        faces.extend([(a,b,b+1,a+1),(a+1,b+1,b+2,a+2)])
    faces.extend([(13,16,14),(14,16,15)])
    m.add(vertices,faces,mat,role,True,uvs=uvs)
    # The raised midrib keeps the leaf's role, so it vanishes in winter too.
    vein=[];vein_uv=[];vein_width=min(.006,width*.055)
    for i,p in enumerate(centers):
        w=vein_width*(1-.87*i/(len(centers)-1))
        for sign in [-1,1]:
            vein.append(tuple(p+normal*.002+side*(sign*w)))
            vein_uv.append(((sign+1)/2,i/(len(centers)-1)))
    vein_mat="leaf_light" if mat in ["leaf","leaf_dark"] else ("leaf" if mat=="leaf_light" else mat)
    m.add(vein,[(2*i,2*i+2,2*i+3,2*i+1) for i in range(len(centers)-1)],vein_mat,role,True,uvs=vein_uv)


def leaf(m,center,length,width,angle,mat="leaf",tilt=.2,role="foliage"):
    _blade(m,center,(math.cos(angle),math.sin(angle),0),length,width,mat,role,tilt)


def _petal(m,center,angle,length,width,lift,mat,role,phase):
    center=Vector(center);forward=Vector((math.cos(angle),math.sin(angle),0));side=Vector((-forward.y,forward.x,0))
    vertices=[tuple(center)];uvs=[(.5,0)]
    for j in range(1,6):
        t=j/6;breadth=width*math.sin(math.pi*t)**.55
        mid=center+forward*(length*t)
        mid.z+=lift*(t*t-.30*math.sin(math.pi*t))
        for s in [-1,0,1]:
            p=mid+side*(breadth*s)
            p.z+=lift*.24*abs(s)*math.sin(math.pi*t)+length*.018*math.sin(phase+t*5)*s
            vertices.append(tuple(p));uvs.append(((s+1)/2,t))
    tip=center+forward*length;tip.z+=lift
    vertices.append(tuple(tip));uvs.append((.5,1))
    faces=[(0,1,2),(0,2,3)]
    for j in range(4):
        a=1+j*3;b=a+3
        faces.extend([(a,b,b+1,a+1),(a+1,b+1,b+2,a+2)])
    faces.extend([(13,16,14),(14,16,15)])
    m.add(vertices,faces,mat,role,True,uvs=uvs)


def flower(m,center,radius,color="flower_pink",seed=0,role="blossom"):
    x,y,z=center;phase=seed*.618;lotus=role=="lotus_flower"
    layers=[(8,1.0,.35),(6,.70,.75)] if lotus else [(5,1.0,.22)]
    for layer,(count,scale,lift) in enumerate(layers):
        for j in range(count):
            a=math.tau*j/count+phase+layer*.43
            _petal(m,(x,y,z+layer*radius*.06),a,radius*scale,radius*scale*(.40 if lotus else .46),radius*lift,color,role,a)
    m.sphere((x,y,z+radius*.045),(radius*.16,radius*.16,radius*.09),"flower_gold",role,8,4)
    # Filament and anther ribbons are enough at this scale; hundreds of spheres
    # per tree would increase cost without improving its outline.
    verts=[];faces=[]
    for j in range(7 if lotus else 6):
        a=j*math.tau/(7 if lotus else 6)+phase
        radial=Vector((math.cos(a),math.sin(a),0));side=Vector((-radial.y,radial.x,0))
        base=Vector((x,y,z+radius*.06))+radial*radius*.08
        tip=Vector((x,y,z+radius*(.27+.04*math.sin(j))))+radial*radius*.24
        w=radius*.013;n=len(verts)
        verts.extend([tuple(base-side*w),tuple(base+side*w),tuple(tip+side*w),tuple(tip-side*w),tuple(tip-side*w*2.5),tuple(tip+Vector((0,0,w*2.5))),tuple(tip+side*w*2.5),tuple(tip-Vector((0,0,w*2.5)))])
        faces.extend([(n,n+1,n+2,n+3),(n+4,n+5,n+6,n+7)])
    m.add(verts,faces,"flower_gold",role,True)


def chrysanthemum(m,center,radius=.13,color="flower_white",seed=0,role="cut_flower"):
    """Layered narrow ray florets for the chrysanthemums in Hengwu's vase."""
    if radius<=0 or not math.isfinite(radius):
        raise ValueError("A chrysanthemum needs a positive finite radius")
    x,y,z=center;rng=random.Random(seed);phase=seed*.618
    # Outer rays turn slightly down; shorter inner layers curl upward.  The
    # staggered narrow florets intentionally differ from the five broad petals
    # used for the plum, apricot and other simplified spring blossom forms.
    layers=[(24,1.0,.085,-.10),(20,.79,.085,.10),(16,.56,.078,.30),(12,.33,.065,.44)]
    for layer,(count,length,width,lift) in enumerate(layers):
        base=(x,y,z+radius*(.02+layer*.035))
        for j in range(count):
            angle=phase+math.tau*j/count+layer*.31+rng.uniform(-.025,.025)
            _petal(m,base,angle,radius*length*rng.uniform(.96,1.04),radius*width,
                   radius*lift*rng.uniform(.94,1.06),color,role,angle+layer)
    m.sphere((x,y,z+radius*.13),(radius*.10,radius*.10,radius*.055),"flower_gold",role,8,4)


def _limb(m,points,radius,seed,taper=.2,sides=9,mat="bark",role="tree_structure"):
    """Continuous taper with restrained longitudinal bark relief."""
    points=[Vector(p) for p in points];verts=[];uvs=[];previous_side=None;distance=0
    # The photographic bark covers one physical metre. Duplicate the UV seam:
    # interpolating from U≈1 to U=0 across its last face smears the whole image.
    stride=sides+1;offset=(seed*.137)%1
    for j,p in enumerate(points):
        if j:distance+=(p-points[j-1]).length
        t=j/(len(points)-1)
        tangent=points[min(j+1,len(points)-1)]-points[max(0,j-1)]
        forward,side,normal=_frame(tangent)
        if previous_side is not None:
            transported=previous_side-forward*previous_side.dot(forward)
            if transported.length>1e-5:
                side=transported.normalized();normal=forward.cross(side).normalized()
        previous_side=side
        rr=radius*((1-t)+t*taper)
        for k in range(stride):
            a=math.tau*k/sides
            relief=1+.065*math.sin(a*3+seed)+.035*math.sin(t*8+a*5+seed*.3)
            verts.append(tuple(p+(side*math.cos(a)+normal*math.sin(a))*rr*relief))
            uvs.append((offset+k/sides*math.tau*radius,distance+(seed*.317)%1))
    faces=[tuple(reversed(range(sides)))]
    for j in range(len(points)-1):
        for k in range(sides):
            a=j*stride+k;b=a+1
            faces.append((a,b,b+stride,a+stride))
    faces.append(tuple(range((len(points)-1)*stride,(len(points)-1)*stride+sides)))
    m.add(verts,faces,mat,role,True,uvs=uvs)


def _trunk(m,x,y,z,height,rng,seed,gnarled=False):
    turn=rng.random()*math.tau;sway=height*(.065 if gnarled else .035)
    trunk=[]
    for j in range(7):
        t=j/6
        trunk.append(Vector((x+sway*math.sin(t*4+turn)*t,y+sway*math.cos(t*3+turn)*t,z+height*.78*t)))
    _limb(m,trunk,height*(.037 if gnarled else .029),seed,.20,16)
    for j in range(rng.randint(4,6)):
        a=turn+j*2.399963+rng.uniform(-.35,.35);reach=height*rng.uniform(.045,.078)
        end=Vector((x+math.cos(a)*reach,y+math.sin(a)*reach,z-.045))
        start=trunk[0]+Vector((0,0,height*rng.uniform(.019,.032)))
        control=start.lerp(end,.50);control.z=z+.018
        _limb(m,_curve(start,control,end,4),height*rng.uniform(.010,.016),seed+j,.035,8)
    return trunk


def woodland_leaf(m,base,direction,length,width,mat="leaf",role="grove_foliage",roll=0):
    """Six open triangles: a curved lamina, with no opaque crown proxy."""
    base=Vector(base);forward,side,normal=_frame(direction)
    side,normal=side*math.cos(roll)+normal*math.sin(roll),normal*math.cos(roll)-side*math.sin(roll)
    outline=[(0,0),(.28,-.90),(.71,-.74),(1,0),(.71,.74),(.28,.90),(.49,0)]
    vertices=[];uv=[]
    for t,s in outline:
        p=base+forward*(length*t)+side*(width*s)
        p+=normal*(length*.08*math.sin(math.pi*t)-length*.10*t*t-width*.24*abs(s))
        vertices.append(tuple(p));uv.append((.5+s*.5,t))
    m.add(vertices,[(6,j,(j+1)%6) for j in range(6)],mat,role,True,uvs=uv)


def _grove_tree(m,x,y,z,height,seed):
    """Asymmetric branch hierarchy with leaves at measured, independent scales."""
    rng=random.Random(seed);trunk=_trunk(m,x,y,z,height,rng,seed)
    count=rng.randint(8,10);phase=rng.random()*math.tau
    for j in range(count):
        level=j/(count-1);angle=phase+j*2.399963+rng.uniform(-.35,.35)
        start=_point(trunk,.30+.64*level)
        reach=height*(.19+.13*math.sin(math.pi*level))*rng.uniform(.82,1.14)
        tip=Vector((x+math.cos(angle)*reach,y+math.sin(angle)*reach,z+height*(.48+.48*level+rng.uniform(-.055,.055))))
        branch=_curve(start,start.lerp(tip,.55)+Vector((0,0,height*.055)),tip,6)
        _limb(m,branch,height*.012*(1-.48*level),seed+j,.11,8)
        for k in range(5):
            t=.27+k*.17;base=_point(branch,t)
            a=angle+(-1 if k%2 else 1)*rng.uniform(.48,1.25)
            reach=height*rng.uniform(.095,.17)
            end=base+Vector((math.cos(a)*reach,math.sin(a)*reach,height*rng.uniform(-.055,.075)))
            secondary=_curve(base,base.lerp(end,.5)+Vector((0,0,height*.018)),end,4)
            _limb(m,secondary,height*.0037,seed+j*11+k,.12,6)
            for q in range(5):
                base=_point(secondary,.24+q*.18);aa=a+(-1 if q%2 else 1)*rng.uniform(.65,1.45)
                reach=rng.uniform(.36,.67)*height/6
                end=base+Vector((math.cos(aa)*reach,math.sin(aa)*reach,reach*rng.uniform(-.48,.60)))
                shoot=_curve(base,base.lerp(end,.52)+Vector((0,0,.04)),end,3)
                _limb(m,shoot,.0038,seed+q,.08,4)
                for leaf_index in range(16):
                    t=.12+.87*leaf_index/15;base=_point(shoot,t)
                    leaf_angle=aa+(-1 if leaf_index%2 else 1)*rng.uniform(.75,1.35)
                    length=rng.uniform(.105,.195)*(1-.16*t)
                    direction=(math.cos(leaf_angle),math.sin(leaf_angle),rng.uniform(-.40,.60))
                    woodland_leaf(m,base,direction,length,length*rng.uniform(.25,.34),
                                  rng.choices(['leaf','leaf_light','leaf_dark'],[6,2,2])[0],roll=rng.uniform(-.70,.70))


def _leaf_shoot(m,points,height,angle,rng,flower_color,kind,seed):
    leaf_count=7 if kind not in ["plum","apricot"] else 5
    for j in range(leaf_count):
        t=.16+.80*j/max(1,leaf_count-1);base=_point(points,t)
        aa=angle+(-1 if j%2 else 1)*(1.0+rng.random()*.35)
        tangent=(_point(points,min(1,t+.08))-_point(points,max(0,t-.08))).normalized()
        direction=Vector((math.cos(aa),math.sin(aa),rng.uniform(-.45,.55)+tangent.z*.65))
        length=height*rng.uniform(.045,.063);petiole=base+direction.normalized()*(length*.13)
        _limb(m,[base,petiole],height*.0007,seed+j,.60,4,mat="leaf_dark",role="tree_leaves")
        _blade(m,petiole,direction,length,length*(.25 if kind=="pear" else .30),rng.choice(["leaf","leaf","leaf_dark","leaf_light"]),"tree_leaves",length*.065,rng.uniform(-.009,.009))
    if flower_color:
        for j in range(2 if kind=="plum" else 1):
            t=.46+j*.36 if kind=="plum" else .80;base=_point(points,t);a=angle+(j-.5)*1.1
            tip=base+Vector((math.cos(a)*height*.018,math.sin(a)*height*.018,height*.012))
            _limb(m,[base,tip],height*.0011,seed,.35,4)
            flower(m,tip,height*(.020 if kind=="plum" else .0185),flower_color,seed+j)


def _broadleaf_tree(m,x,y,z,height,kind,seed,flower_color):
    rng=random.Random(seed);trunk=_trunk(m,x,y,z,height,rng,seed,kind=="plum")
    count=7 if kind!="plum" else 6;phase=rng.random()*math.tau
    umbrella=kind=="crabapple"
    spread=.34 if umbrella else (.20 if kind=="pear" else (.28 if kind=="plum" else .25))
    for j in range(count):
        level=j/max(1,count-1)
        angle=phase+j*2.399963+rng.uniform(-.25,.25)
        start=_point(trunk,(.48+.42*level) if umbrella else (.38+.58*level))
        if umbrella:
            radial=height*spread*rng.uniform(.82,1.18)
            end_height=.63+.19*level+rng.uniform(-.025,.025)
        else:
            # Lower and upper limbs approach the trunk; middle limbs spread.
            # This puts the existing shoots through a crown volume instead of
            # lifting every last twig onto the same shallow, umbrella plane.
            profile=.56+.44*math.sin(math.pi*level)
            radial=height*spread*profile*rng.uniform(.84,1.17)
            end_height=.52+.49*level+rng.uniform(-.065,.065)
            if kind=="pear":end_height+=.035*level
            elif kind=="plum":end_height+=rng.uniform(-.055,.055)
        drift=height*.035*math.sin(phase+level*2.1)
        end=Vector((x+math.cos(angle)*radial+math.cos(phase)*drift,
                    y+math.sin(angle)*radial+math.sin(phase)*drift,z+height*end_height))
        control=start.lerp(end,.48)+Vector((0,0,height*(.10 if kind=="plum" else .045)))
        limb=_curve(start,control,end,7);_limb(m,limb,height*.018*(1-j*.035),seed+j,.18,9)
        for k in range(3):
            base=_point(limb,(.45+.25*k) if umbrella else (.30+.30*k))
            a=angle+(k-1)*.73+rng.uniform(-.19,.19)
            reach=height*rng.uniform(.11,.17) if umbrella else height*rng.uniform(.095,.145)
            rise=rng.uniform(.025,.085) if umbrella else rng.uniform(-.065,.09)
            tip=base+Vector((math.cos(a)*reach,math.sin(a)*reach,height*rise))
            secondary=_curve(base,base.lerp(tip,.5)+Vector((0,0,height*.025)),tip,5)
            _limb(m,secondary,height*.0075,seed+j*11+k,.16,7)
            for q in range(3):
                base=_point(secondary,.35+.30*q);aa=a+(q-1)*.85+rng.uniform(-.18,.18)
                rise=rng.uniform(.015,.055) if umbrella else rng.uniform(-.045,.07)
                shoot_tip=base+Vector((math.cos(aa)*height*.095,math.sin(aa)*height*.095,height*rise))
                shoot=_curve(base,base.lerp(shoot_tip,.5)+Vector((0,0,height*.012)),shoot_tip,3)
                _limb(m,shoot,height*.0027,seed+q,.12,5)
                _leaf_shoot(m,shoot,height,aa,rng,flower_color,kind,seed+j*100+k*10+q)


def _willow(m,x,y,z,height,seed):
    rng=random.Random(seed);trunk=_trunk(m,x,y,z,height,rng,seed);phase=rng.random()*math.tau
    for j in range(8):
        a=phase+j*math.tau/8+rng.uniform(-.18,.18);base=_point(trunk,.57+.35*(j%3)/2);reach=height*rng.uniform(.27,.39)
        tip=Vector((x+math.cos(a)*reach,y+math.sin(a)*reach,z+height*rng.uniform(.75,.94)))
        main=_curve(base,base.lerp(tip,.48)+Vector((0,0,height*.16)),tip,7);_limb(m,main,height*.016,seed+j,.12,8)
        for k in range(4):
            p=_point(main,.46+.17*k);aa=a+(k-1.5)*.43
            bough=p+Vector((math.cos(aa)*height*.09,math.sin(aa)*height*.09,-height*rng.uniform(.30,.47)))
            hanging=_curve(p,p+Vector((math.cos(aa)*height*.12,math.sin(aa)*height*.12,-height*.075)),bough,9)
            _limb(m,hanging,height*.0020,seed+k,.10,5)
            for q in range(12):
                p=_point(hanging,.08+q*.078);sign=-1 if q%2 else 1;leaf_angle=aa+sign*.85
                _blade(m,p,(math.cos(leaf_angle)*.65,math.sin(leaf_angle)*.65,-.85),height*rng.uniform(.047,.065),height*.0065,"leaf" if q%3 else "leaf_light","tree_leaves",height*.005)


def _pine(m,x,y,z,height,seed):
    rng=random.Random(seed);trunk=_trunk(m,x,y,z,height,rng,seed);phase=rng.random()*math.tau
    for tier in range(5):
        t=tier/4;center=_point(trunk,.45+t*.55)
        for arm in range(3):
            a=phase+tier*.91+arm*math.tau/3+rng.uniform(-.12,.12);reach=height*(.32-.15*t)*rng.uniform(.84,1.1)
            tip=center+Vector((math.cos(a)*reach,math.sin(a)*reach,height*.045))
            branch=_curve(center,center.lerp(tip,.48)-Vector((0,0,height*.055)),tip,7)
            _limb(m,branch,height*(.015-.006*t),seed+arm,.15,8)
            for j in range(4):
                base=_point(branch,.38+j*.19);aa=a+(-1 if j%2 else 1)*.55
                shoot_tip=base+Vector((math.cos(aa)*height*.10,math.sin(aa)*height*.10,height*.025))
                shoot=_curve(base,base.lerp(shoot_tip,.6),shoot_tip,3);_limb(m,shoot,height*.0033,seed+j,.12,5)
                verts=[];uv=[];faces=[]
                for k in range(9):
                    p=_point(shoot,.12+k*.10)
                    for sign in [-1,1]:
                        for fan in [-1,0,1]:
                            theta=aa+sign*(.65+.28*rng.random())+fan*.14;length=height*rng.uniform(.042,.062)
                            direction=Vector((math.cos(theta),math.sin(theta),rng.uniform(.18,.55)+fan*.12)).normalized()
                            side=Vector((-math.sin(theta),math.cos(theta),0))*height*.00115
                            mid=p+direction*length*.60+Vector((0,0,length*.045));end=p+direction*length;n=len(verts)
                            verts.extend([tuple(p-side*.4),tuple(p+side*.4),tuple(mid+side),tuple(end),tuple(mid-side)])
                            uv.extend([(0,0),(1,0),(1,.6),(.5,1),(0,.6)]);faces.extend([(n+4,n+2,n+1,n),(n+3,n+2,n+4)])
                m.add(verts,faces,"leaf_dark" if (j+arm)%3 else "leaf","evergreen",True,uvs=uv)


def tree(m,x,y,z,height=6,kind="deciduous",seed=1,flower_color=None):
    if kind=="willow":_willow(m,x,y,z,height,seed)
    elif kind=="pine":_pine(m,x,y,z,height,seed)
    elif kind=="grove":_grove_tree(m,x,y,z,height,seed)
    else:_broadleaf_tree(m,x,y,z,height,kind,seed,flower_color)


def bamboo(m,x,y,z,height=5,seed=1):
    rng=random.Random(seed);lean=Vector((rng.uniform(-.38,.38),rng.uniform(-.38,.38),0))
    base=Vector((x,y,z));segments=max(5,round(height/.46))
    def culm(t):return base+lean*(t*t)+Vector((0,0,height*t))
    points=[culm(j/segments) for j in range(segments+1)]
    _limb(m,points,.048,seed,.48,10,mat="bamboo",role="bamboo_stem")
    for j in range(1,segments):
        t=j/segments;p=culm(t);direction=(culm(min(1,t+.01))-culm(max(0,t-.01))).normalized()
        # Collars share the culm's tangent, closing the leaning stem.
        _limb(m,[p-direction*.018,p,p+direction*.018],.054*(1-.48*t),seed,1,10,mat="bamboo_ring",role="bamboo_stem")
        if t<.40 or j%2:continue
        angle=seed*.713+j*2.40
        for side in [-1,1]:
            a=angle+side*.30;reach=.56+(1-t)*.48
            end=p+Vector((math.cos(a)*reach,math.sin(a)*reach,.12+height*.025))
            branch=_curve(p,p.lerp(end,.55)+Vector((0,0,.12)),end,5)
            _limb(m,branch,.012,seed+j,.12,5,mat="bamboo",role="bamboo_stem")
            for q in range(7):
                node=_point(branch,.25+.115*q);aa=a+(-1 if q%2 else 1)*.65
                tip=node+Vector((math.cos(aa)*.16,math.sin(aa)*.16,-.015))
                _limb(m,[node,tip],.0032,seed+q,.2,4,mat="bamboo",role="bamboo_stem")
                _blade(m,tip,(math.cos(aa),math.sin(aa),-.22),rng.uniform(.30,.43),.034,"leaf_dark" if q%3==0 else "leaf","evergreen",.025)
    top=points[-1];a=seed*2.4;tip=top+Vector((math.cos(a)*.24,math.sin(a)*.24,.20))
    _limb(m,[points[-2],top,tip],.014,seed,.05,6,mat="bamboo",role="bamboo_stem")
    for j in range(4):
        p=top.lerp(tip,j/4);aa=a+(-1 if j%2 else 1)*.65
        _blade(m,p,(math.cos(aa),math.sin(aa),-.12),.29,.026,"leaf","evergreen",.035)


def banana(m,x,y,z,height=3,seed=1):
    rng=random.Random(seed)
    m.lathe((x,y,z),[(.15,0),(.16,height*.12),(.13,height*.42),(.085,height*.65),(.035,height*.75)],"bamboo","banana_stem",16)
    for j in range(7):
        a=j*2.399963+rng.uniform(-.14,.14)
        direction=Vector((math.cos(a),math.sin(a),0));side=Vector((-direction.y,direction.x,0))
        attachment=Vector((x,y,z+height*(.37+j*.035)))
        start=attachment+direction*height*.17+Vector((0,0,height*.21))
        petiole=_curve(attachment,attachment+Vector((0,0,height*.20)),start,6)
        _limb(m,petiole,height*.018,seed+j,.50,7,mat="bamboo",role="banana_stem")
        length=height*rng.uniform(.59,.78);width=height*rng.uniform(.12,.16);stations=16
        centers=[];edge_rows=[]
        for k in range(stations+1):
            t=k/stations;p=start+direction*length*t
            p.z+=height*.28*math.sin(t*math.pi*.95)-height*.22*t*t;centers.append(p)
            breadth=width*math.sin(math.pi*t)**.65;row=[]
            for s in [-1,0,1]:
                q=p+side*(breadth*s);q.z-=breadth*.21*abs(s);q.z+=height*.015*math.sin(t*8+seed+j)*s;row.append(q)
            edge_rows.append(row)
        verts=[];uvs=[];faces=[]
        for k in range(stations):
            for s in [0,1]:
                n=len(verts)
                quad=[edge_rows[k][s].copy(),edge_rows[k+1][s].copy(),edge_rows[k+1][s+1].copy(),edge_rows[k][s+1].copy()]
                # A few natural tears open only the margins; the midrib stays
                # continuous, so no independent rectangular leaf tiles float.
                if k in [6+j%3,11+j%2] and j<5:
                    for index in ([0,1] if s==0 else [2,3]):
                        quad[index]-=direction*(length*.012);quad[index].z-=height*.018
                verts.extend(tuple(p) for p in quad)
                uvs.extend([(s/2,k/stations),(s/2,(k+1)/stations),((s+1)/2,(k+1)/stations),((s+1)/2,k/stations)])
                faces.append((n,n+1,n+2) if k==0 else ((n,n+1,n+3) if k==stations-1 else (n,n+1,n+2,n+3)))
        m.add(verts,faces,"leaf_light" if j%3==0 else "leaf","banana_leaves",True,uvs=uvs)
        _limb(m,centers,height*.006,seed+j,.12,5,mat="leaf_light",role="banana_leaves")
        for k in range(2,stations-1,2):
            for sign in [-1,1]:
                mid=centers[k]+Vector((0,0,.003));edge=edge_rows[k+1][0 if sign<0 else 2]+Vector((0,0,.003));delta=direction*.003
                m.add([tuple(mid-delta),tuple(mid+delta),tuple(edge+delta*.5),tuple(edge-delta*.5)],[(0,1,2,3)],"leaf_light","banana_leaves",True,uvs=[(0,0),(1,0),(1,1),(0,1)])
    a=seed*.8;direction=Vector((math.cos(a),math.sin(a),0));base=Vector((x,y,z+height*.62))
    _limb(m,[base,base+direction*.07+Vector((0,0,height*.26)),base+direction*.14+Vector((0,0,height*.45))],height*.023,seed,.05,10,mat="leaf_light",role="banana_leaves")


def reeds(m,x,y,z,count=28,seed=1):
    rng=random.Random(seed)
    for j in range(count):
        a=rng.random()*math.tau;r=math.sqrt(rng.random())*1.02;base=Vector((x+math.cos(a)*r,y+math.sin(a)*r,z))
        h=rng.uniform(.8,1.8);a=rng.random()*math.tau;tip=base+Vector((math.cos(a)*.24,math.sin(a)*.24,h))
        stem=_curve(base,base.lerp(tip,.5)-Vector((math.cos(a)*.12,math.sin(a)*.12,0)),tip,7)
        _limb(m,stem,.008,seed+j,.40,5,mat="reed",role="reeds")
        for k in range(3):
            p=_point(stem,.27+k*.17);aa=a+k*2.4
            _blade(m,p,(math.cos(aa),math.sin(aa),.13),.43,.026,"leaf","reeds",.075)
        # Open panicles replace the solid elongated capsules.
        for k in range(6):
            p=tip+Vector((0,0,k*.026));aa=a+k*2.4
            end=p+Vector((math.cos(aa)*(.10-k*.009),math.sin(aa)*(.10-k*.009),.11))
            _limb(m,[p,end],.005,seed+k,.25,4,mat="reed",role="reeds")
            for sign in [-1,1]:_blade(m,end,(math.cos(aa+sign*.5),math.sin(aa+sign*.5),.75),.055,.009,"reed","reeds",.007)


def lotus_leaf(m,x,y,z,radius=.35,seed=1,role="lotus"):
    """Peltate leaf with a shallow cup, radial veins and an undulating rim."""
    segments=32;rings=4;vertices=[(x,y,z-.018)];uvs=[(.5,.5)]
    for ring in range(1,rings+1):
        t=ring/rings
        for j in range(segments):
            a=math.tau*j/segments;edge=1+.035*math.sin(a*7+seed)+.018*math.sin(a*13+seed*.4);rr=radius*t*edge
            h=z+radius*(.09*t*t+.028*math.sin(a*5+seed)*t*t)-.018*(1-t)
            vertices.append((x+rr*math.cos(a),y+rr*math.sin(a),h));uvs.append((.5+.5*t*math.cos(a),.5+.5*t*math.sin(a)))
    faces=[(0,1+j,1+(j+1)%segments) for j in range(segments)]
    for ring in range(rings-1):
        start=1+ring*segments
        for j in range(segments):
            a=start+j;b=start+(j+1)%segments;faces.append((a,a+segments,b+segments,b))
    m.add(vertices,faces,"leaf",role,True,uvs=uvs)
    for j in range(0,segments,4):
        points=[Vector(vertices[0])]+[Vector(vertices[1+(ring-1)*segments+j]) for ring in range(1,rings+1)]
        side=Vector((-math.sin(math.tau*j/segments),math.cos(math.tau*j/segments),0));vein=[]
        for k,p in enumerate(points):
            for sign in [-1,1]:vein.append(tuple(p+side*sign*.0023*(1-k*.16)+Vector((0,0,.002))))
        m.add(vein,[(2*k,2*k+2,2*k+3,2*k+1) for k in range(rings)],"leaf_light",role,True)


def rock(m,x,y,z,scale=(1,1,1),seed=1,role="rocks"):
    """Closed weathered boulder with coherent strata and softened erosion."""
    segments=28;rings=19;phase=seed*.713
    vertices=[(x+scale[0]*.035,y,z+scale[2]*1.65)];uvs=[(.5,0)]
    hollows=[(phase+.4,1.06,.16,.42,.29),(phase+2.15,1.63,.13,.35,.38),
             (phase+4.3,2.02,.10,.47,.28)]
    for j in range(1,rings):
        theta=math.pi*j/rings;ct=math.cos(theta);st=math.sin(theta)
        for i in range(segments):
            phi=math.tau*i/segments
            # Quadratic polar damping keeps the first ring below the cap;
            # linear damping produced a visible star-shaped dip at every pole.
            ridge=st*st*(.11*math.sin(phi*3+theta*4+phase)+.055*math.cos(phi*5-theta*3+phase*.7))
            erosion=st*st*.035*math.sin(phi*9+theta*11+phase)*math.sin(theta*7-phi*4)
            hollow=0
            for azimuth,elevation,depth,span,falloff in hollows:
                arc=math.atan2(math.sin(phi-azimuth),math.cos(phi-azimuth))
                hollow+=depth*math.exp(-(arc/span)**2-((theta-elevation)/falloff)**2)
            groove=.045*math.exp(-((ct-.14*math.sin(phi*2+phase))/.095)**2)
            f=1+ridge+erosion-groove-st*st*hollow
            vertices.append((x+scale[0]*(st*math.cos(phi)*f+.035*ct),y+scale[1]*st*math.sin(phi)*f,z+scale[2]*max(-.10,ct*f+.65)))
            uvs.append((i/segments,j/rings))
    vertices.append((x,y,z-scale[2]*.10));uvs.append((.5,1))
    faces=[(0,1+i,1+(i+1)%segments) for i in range(segments)]
    for j in range(rings-2):
        for i in range(segments):
            a=1+j*segments+i;b=1+j*segments+(i+1)%segments;faces.append((a,a+segments,b+segments,b))
    bottom=len(vertices)-1;start=1+(rings-2)*segments
    faces.extend((start+i,bottom,start+(i+1)%segments) for i in range(segments))
    m.add(vertices,faces,"rock_stone" if seed%3 else "dark_stone",role,True,uvs=uvs)


def rock_arch(m,points,radius=1.1,seed=22,role="grotto"):
    """Weathered continuous arch following the supplied opening skeleton.

    Coordinate-monotone Hermite spans retain the original knots and crown
    height.  A transported, non-circular cross section adds broken strata and
    shallow erosion while limiting inward growth into the opening.
    """
    points=[Vector(p) for p in points]
    if len(points)<2 or radius<=0 or not math.isfinite(radius):
        raise ValueError("A rock arch needs two or more points and a positive radius")
    if not all(math.isfinite(v) for p in points for v in p):
        raise ValueError("Rock arch coordinates must be finite")
    if any((b-a).length<1e-6 for a,b in zip(points,points[1:])):
        raise ValueError("Rock arch skeleton contains coincident points")
    tangents=[]
    for j,p in enumerate(points):
        if j==0:tangent=points[1]-p
        elif j==len(points)-1:tangent=p-points[j-1]
        else:
            before=p-points[j-1];after=points[j+1]-p;values=[]
            for a,b in zip(before,after):
                values.append(0 if a*b<=0 else math.copysign(min((abs(a)+abs(b))*.5,3*min(abs(a),abs(b))),a))
            tangent=Vector(values)
        tangents.append(tangent)
    centers=[]
    for j,(a,b) in enumerate(zip(points,points[1:])):
        count=max(4,math.ceil((b-a).length/.22))
        for k in range(count):
            t=k/count
            centers.append((2*t**3-3*t*t+1)*a+(t**3-2*t*t+t)*tangents[j]
                           +(-2*t**3+3*t*t)*b+(t**3-t*t)*tangents[j+1])
    centers.append(points[-1])
    distances=[0]
    for a,b in zip(centers,centers[1:]):distances.append(distances[-1]+(b-a).length)
    vertices=[];uvs=[];sides=32;previous_side=None;phase=seed*.713
    hollows=[(.24,math.pi-.28,.16,.07,.42),(.53,math.pi+.45,.12,.09,.38),
             (.78,math.pi-.43,.15,.065,.48)]
    for j,p in enumerate(centers):
        u=distances[j]/distances[-1]
        tangent=centers[min(j+1,len(centers)-1)]-centers[max(0,j-1)]
        forward,side,normal=_frame(tangent)
        if previous_side is not None:
            transported=previous_side-forward*previous_side.dot(forward)
            if transported.length>1e-5:
                side=transported.normalized();normal=forward.cross(side).normalized()
        previous_side=side
        for k in range(sides):
            phi=math.tau*k/sides;cs=math.cos(phi);sn=math.sin(phi)
            exponent=.72+.055*math.sin(u*7+phase)
            across=math.copysign(abs(cs)**exponent,cs)
            outward=math.copysign(abs(sn)**exponent,sn)
            surface_z=p.z+normal.z*radius*outward
            strata=.040*math.sin(surface_z*6.2+phase*.4)+.018*math.sin(surface_z*15.5+u*4)
            hollow=0
            for position,azimuth,depth,span,arc_span in hollows:
                arc=math.atan2(math.sin(phi-azimuth),math.cos(phi-azimuth))
                hollow+=depth*math.exp(-((u-position)/span)**2-(arc/arc_span)**2)
            relief=.98+.075*math.sin(u*9+phase)*math.sin(math.pi*u)**2+strata-hollow
            # Interior relief recedes into the body; it cannot hang down and
            # narrow the already established portal.  Outer shoulders can bulge.
            radial=max(.78,min(.94 if sn<0 else 1.12,relief))
            depth=max(.73,min(1.08,.91+.075*math.sin(u*12+phase)+strata-hollow))
            vertices.append(tuple(p+side*(radius*depth*across)+normal*(radius*radial*outward)))
            uvs.append((k/sides,distances[j]/(math.tau*radius)))
    faces=[tuple(reversed(range(sides)))]
    for j in range(len(centers)-1):
        for k in range(sides):
            a=j*sides+k;b=j*sides+(k+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.append(tuple(range((len(centers)-1)*sides,len(centers)*sides)))
    m.add(vertices,faces,"rock_stone",role,True,uvs=uvs)


def _scholar_surface(seed):
    """A single surface surrounding real eroded openings, without booleans.

    Marching tetrahedra shares each grid-edge vertex across cells.  Its compact
    implicit solid replaces the old three tubes and crossbars; the two openings
    have continuous inner walls rather than painted dark disks.
    """
    phase=seed*.713;lean=.035*math.sin(phase)
    shape=[(0,0,.10,.31,.23,.16),(-.12,.015,.36,.19,.18,.30),(.12,-.015,.53,.19,.18,.36),(-.10,.015,.70,.20,.185,.27),(.06,0,.91,.22,.14,.17)]
    lobes=[shape[0]]+[(cx+.012*math.sin(phase+j),cy+.012*math.cos(phase+j*1.7),cz+.014*math.sin(phase+j*2.3),rx*(1+.07*math.cos(phase+j)),ry*(1+.05*math.sin(phase+j)),rz) for j,(cx,cy,cz,rx,ry,rz) in enumerate(shape[1:],1)]
    openings=[(-.065+.025*math.sin(phase),.36+.02*math.cos(phase),.080*(1+.12*math.sin(phase+1)),.115),
              (.045+.025*math.cos(phase),.67+.02*math.sin(phase),.077*(1+.12*math.cos(phase+2)),.105)]
    def field(px,py,pz):
        xx=px-lean*pz
        values=[1-math.sqrt(((xx-cx)/rx)**2+((py-cy)/ry)**2+((pz-cz)/rz)**2) for cx,cy,cz,rx,ry,rz in lobes]
        body=values[0]
        for value in values[1:]:
            h=max(.10-abs(body-value),0)/.10;body=max(body,value)+h*h*.025
        body+=.012*math.sin(xx*39+pz*26+phase)*math.sin(py*31-pz*14)+.008*math.sin(pz*62+xx*19+phase)
        for cx,cz,rx,rz in openings:
            angle=math.atan2((pz-cz)/rz,(xx-cx)/rx)
            cavity=1-math.sqrt(((xx-cx)/rx)**2+((pz-cz)/rz)**2)
            cavity+=.09*math.sin(angle*3+phase)+.035*math.sin(angle*7+py*13);body=min(body,-cavity)
        for cx,cy,cz,rx,ry,rz in [(-.17,-.17,.56,.055,.065,.085),(.17,-.15,.86,.055,.055,.065),(.14,.15,.24,.05,.06,.065)]:
            pocket=1-math.sqrt(((xx-cx)/rx)**2+((py-cy)/ry)**2+((pz-cz)/rz)**2);body=min(body,-pocket)
        return body
    nx,ny,nz=28,18,38;grid=[];values=[]
    for k in range(nz+1):
        for j in range(ny+1):
            for i in range(nx+1):
                p=(-.37+i*.74/nx,-.27+j*.54/ny,-.08+k*1.20/nz)
                sample=field(*p)
                # Preserve each sample's sign but keep intersections away from
                # exact grid corners, where float32 Blender vectors can collapse
                # an otherwise valid tiny triangle.  This is below mesh scale.
                if abs(sample)<.0001:sample=math.copysign(.0001,sample)
                grid.append(Vector(p));values.append(sample)
    vertices=[];faces=[];edge_cache={}
    def index(i,j,k):return (k*(ny+1)+j)*(nx+1)+i
    def edge(a,b):
        key=(min(a,b),max(a,b))
        if key not in edge_cache:
            t=values[a]/(values[a]-values[b]);edge_cache[key]=len(vertices);vertices.append(grid[a].lerp(grid[b],t))
        return edge_cache[key]
    tetrahedra=[(0,1,2,6),(0,2,3,6),(0,3,7,6),(0,7,4,6),(0,4,5,6),(0,5,1,6)]
    for k in range(nz):
        for j in range(ny):
            for i in range(nx):
                cube=[index(i,j,k),index(i+1,j,k),index(i+1,j+1,k),index(i,j+1,k),index(i,j,k+1),index(i+1,j,k+1),index(i+1,j+1,k+1),index(i,j+1,k+1)]
                if all(values[p]<=0 for p in cube) or all(values[p]>0 for p in cube):continue
                for tetra in tetrahedra:
                    ids=[cube[t] for t in tetra];inside=[p for p in ids if values[p]>0];outside=[p for p in ids if values[p]<=0]
                    if not inside or not outside:continue
                    polygon=[edge(a,b) for a in inside for b in outside]
                    center=sum((vertices[p] for p in polygon),Vector())/len(polygon)
                    normal=(sum((grid[p] for p in outside),Vector())/len(outside)-sum((grid[p] for p in inside),Vector())/len(inside)).normalized()
                    axis=(vertices[polygon[0]]-center).normalized();up=normal.cross(axis)
                    polygon.sort(key=lambda p:math.atan2((vertices[p]-center).dot(up),(vertices[p]-center).dot(axis)))
                    for q in range(1,len(polygon)-1):faces.append((polygon[0],polygon[q],polygon[q+1]))
    return vertices,faces


def scholar_rock(m,x,y,z,height=4,seed=1):
    vertices,faces=_scholar_surface(seed);angle=seed*.37;cs=math.cos(angle);sn=math.sin(angle)
    world=[(x+height*(p.x*cs-p.y*sn),y+height*(p.x*sn+p.y*cs),z+height*p.z) for p in vertices]
    m.add(world,faces,"scholar_stone","scholar_stone",True,uvs=[(p.x*2,p.z*2) for p in vertices])
