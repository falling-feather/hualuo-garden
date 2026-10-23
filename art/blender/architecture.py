import math
import random
from mathutils import Vector
from geometry import MeshBuilder,ribbon,curve_points
from roofs import roof,pavilion_roof,RoofClip,roof_join
from plants import tree,bamboo,banana,rock,scholar_rock,reeds,leaf,flower,rock_arch,chrysanthemum

def step_count(height):return max(3,round(height/.155))
def hall_entry(m,x,y,d,height,name="entry"):
    run=.36+(step_count(height)-1)*.34+.40
    m.port(name,(x,y-d/2-run,.06),(0,-1),2.7)
    m.ground_pad(x,y-d/2-run*.6,5.2,run+2,-.1,2.0)
def reverse_steps(m,x,y,height):
    with m.transform((x,y,0),math.pi):
        count=step_count(height)
        for j in range(count):
            h=height*(j+1)/count;yy=-.36-(count-1-j)*.34
            m.box((0,yy,h/2),(2.7,.38,h),"stone","stairs",bevel=.025)
            m.walk_surface(0,yy,2.7,.4,h)
    m.port("rear",(x,y+.36+(step_count(height)-1)*.34+.40,.06),(0,1),2.7)

def column(m,x,y,z,height,wood="wood",radius=.15,ornate=False):
    # Square plinth, rounded plinth mouldings and tapered shaft remain legible at eye level.
    m.box((x,y,z+.035),(radius*3.15,radius*3.15,.07),"stone","column_bases",bevel=.018)
    m.lathe((x,y,z+.06),[(radius*1.48,0),(radius*1.52,.035),(radius*1.52,.075),
        (radius*1.35,.095),(radius*1.25,.125),(radius*1.25,.165),(radius*1.39,.19),
        (radius*1.37,.23),(radius*1.16,.25),(radius*1.1,.29)],"white_stone","column_bases",32)
    m.cylinder((x,y,z+.35+(height-.35)/2),radius,height-.35,wood,"columns",24,top_radius=radius*.88)
    m.lathe((x,y,z+.34),[(radius*1.04,0),(radius*1.08,.018),(radius*1.04,.035)],wood,"column_collars",24)
    m.box((x,y,z+height-.05),(radius*2.75,radius*2.75,.16),wood,"capital",bevel=.025)
    m.box((x,y,z+height+.035),(radius*3.2,radius*3.2,.065),wood,"capital",bevel=.018)
    m.collider((x,y,z+height/2),(.32,.32,height))
    if ornate:
        for j in range(3):
            m.box((x,y,z+height+.1+j*.13),(.62-j*.13,.18,.13),"greenwood","brackets",bevel=.018)
            m.box((x,y,z+height+.1+j*.13),(.18,.62-j*.13,.13),wood,"brackets",bevel=.018)

def platform(m,x,y,w,d,z=0,height=.62,stairs=True):
    m.box((x,y,z+height*.30),(w+.65,d+.65,height*.60),"dark_stone","foundation",bevel=.05)
    m.box((x,y,z+height*.72),(w+.38,d+.38,height*.24),"stone","foundation",bevel=.045)
    m.box((x,y,z+height-.045),(w+.65,d+.65,.09),"white_stone","foundation",bevel=.03)
    m.walk_surface(x,y,w+.6,d+.6,z+height)
    if stairs:
        count=step_count(height)
        for j in range(count):
            h=height*(j+1)/count
            yy=y-d/2-.36-(count-1-j)*.34
            m.box((x,yy,z+h/2),(2.7,.38,h),"stone","stairs",bevel=.025)
            m.walk_surface(x,yy,2.7,.40,z+h)
    return z+height

def railing(m,a,b,z,material="white_stone",height=.88,ornate=False):
    dx,dy=b[0]-a[0],b[1]-a[1]
    length=math.hypot(dx,dy)
    n=max(1,round(length/1.25))
    for i in range(n+1):
        x,y=a[0]+dx*i/n,a[1]+dy*i/n
        m.box((x,y,z+height/2),(.15,.15,height),material,"rail_posts",bevel=.02)
        if material=="bamboo":
            m.lathe((x,y,z+height-.06),[(.088,0),(.095,.018),(.095,.055),(.078,.07),(.078,.12),(.055,.135)],material,"rail_caps",16)
        else:
            m.box((x,y,z+height-.025),(.205,.205,.07),material,"rail_caps",bevel=.025)
            m.lathe((x,y,z+height),[(.094,0),(.108,.035),(.108,.07),(.086,.105),(.048,.15),(.026,.17)],material,"rail_caps",24)
    for level in [.18,height*.78]:
        m.beam((a[0],a[1],z+level),(b[0],b[1],z+level),.09,.11,material,"rails")
    for i in range(n):
        x0,y0=a[0]+dx*i/n,a[1]+dy*i/n
        x1,y1=a[0]+dx*(i+1)/n,a[1]+dy*(i+1)/n
        for t in [.22,.5,.78]:
            x,y=x0+(x1-x0)*t,y0+(y1-y0)*t
            m.beam((x,y,z+.21),(x,y,z+height*.75),.055,.065,material,"rail_infill")
        if ornate:
            for low,high in [(.30,height*.63)]:
                for t0,t1 in [(.12,.38),(.62,.88)]:
                    p=(x0+(x1-x0)*t0,y0+(y1-y0)*t0)
                    q=(x0+(x1-x0)*t1,y0+(y1-y0)*t1)
                    m.beam((*p,z+low),(*q,z+low),.038,.045,material,"rail_infill")
                    m.beam((*p,z+high),(*q,z+high),.038,.045,material,"rail_infill")
            m.beam((x0,y0,z+height-.04),(x1,y1,z+height-.04),.115,.10,material,"rail_handrails")
    m.collider(((a[0]+b[0])/2,(a[1]+b[1])/2,z+height/2),(length,.18,height),math.atan2(dy,dx))

def lattice(m,x,y,z,w,h,wood="wood",pattern="diamond",paper=True):
    for xx in [-w/2,w/2]:m.box((x+xx,y,z),(.085,.12,h+.12),wood,"window_frames",bevel=.012)
    for zz in [-h/2,h/2]:m.box((x,y,z+zz),(w+.12,.12,.085),wood,"window_frames",bevel=.012)
    for xx in [-w/2+.07,w/2-.07]:m.box((x+xx,y-.067,z),(.022,.025,h-.10),wood,"window_mouldings",bevel=.004)
    for zz in [-h/2+.07,h/2-.07]:m.box((x,y-.067,z+zz),(w-.10,.025,.022),wood,"window_mouldings",bevel=.004)
    if paper:m.box((x,y+.035,z),(w,.015,h),"paper","window_paper")
    if pattern=="diamond":
        step=.32
        # Diagonals clipped against the rectangular frame.
        for sign in [-1,1]:
            for k in range(-int((w+h)/step)-1,int((w+h)/step)+2):
                c=k*step
                pts=[]
                for xx in [-w/2,w/2]:
                    zz=sign*xx+c
                    if -h/2<=zz<=h/2:pts.append((xx,zz))
                for zz in [-h/2,h/2]:
                    xx=(zz-c)/sign
                    if -w/2<=xx<=w/2:pts.append((xx,zz))
                if len(pts)>=2:
                    m.beam((x+pts[0][0],y-.045,z+pts[0][1]),(x+pts[1][0],y-.045,z+pts[1][1]),.035,.052,wood,"lattice")
    else:
        nx,ny=max(3,round(w/.25)),max(3,round(h/.30))
        for i in range(1,nx):m.box((x-w/2+i*w/nx,y-.045,z),(.03,.05,h),wood,"lattice")
        for j in range(1,ny):m.box((x,y-.045,z-h/2+j*h/ny),(w,.05,.03),wood,"lattice")
        if pattern=="rich":
            for i in [-.3,.3]:
                for j in [-.3,.3]:
                    m.box((x+i*w,y-.08,z+j*h),(w*.28,.06,.035),wood,"lattice")
                    m.box((x+i*w-w*.14,y-.08,z+j*h+.12),(.035,.06,.24),wood,"lattice")
            for side in [-1,1]:
                points=[]
                for i in range(25):
                    angle=i/24*math.pi*2.0
                    radius=.20*(1-i/35)
                    points.append((x+side*w*.26+radius*math.cos(angle),y-.09,z+h*.27+radius*math.sin(angle)))
                m.tube(points,.022,"wood_light","carved_clouds",5)

def panel_frame(m,x,y,z,w,h,wood="wood",inset="wood_dark",role="door_panels"):
    """A floating inset panel with rails and stiles, facing local negative Y."""
    rail=min(.085,h*.12,w*.16)
    m.box((x,y+.018,z),(w-rail*1.5,.045,h-rail*1.5),inset,role,bevel=.018)
    for sx in [-1,1]:m.box((x+sx*(w-rail)/2,y,z),(rail,.105,h),wood,role,bevel=.012)
    for sz in [-1,1]:m.box((x,y,z+sz*(h-rail)/2),(w-2*rail,.105,rail),wood,role,bevel=.012)
    for sx in [-1,1]:m.box((x+sx*(w/2-rail-.014),y-.035,z),(.021,.028,h-2*rail),wood,"panel_mouldings",bevel=.004)
    for sz in [-1,1]:m.box((x,y-.035,z+sz*(h/2-rail-.014)),(w-2*rail,.028,.021),wood,"panel_mouldings",bevel=.004)

def signboard(m,text,x,y,z,width=None,height=.70,wood="wood_dark",letter="gold_letter",rich=False):
    """Front mounting plane is independent from the beam; the inscription clears the raised frame."""
    width=width or max(2.25,len(text)*.58+.42)
    m.box((x,y,z),(width,.13,height),wood,"inscriptions",bevel=.035)
    frame=.064
    for sx in [-1,1]:m.box((x+sx*(width-frame)/2,y-.073,z),(frame,.055,height),wood,"plaque_frames",bevel=.015)
    for sz in [-1,1]:m.box((x,y-.073,z+sz*(height-frame)/2),(width-frame*2,.055,frame),wood,"plaque_frames",bevel=.015)
    trim="gold_letter" if rich else "wood_light"
    for sz in [-1,1]:m.box((x,y-.105,z+sz*(height/2-.092)),(width-.18,.015,.014),trim,"plaque_inlay")
    for sx in [-1,1]:
        for sz in [-1,1]:m.sphere((x+sx*(width/2-.095),y-.105,z+sz*(height/2-.095)),(.018,.009,.018),"bronze","plaque_fasteners",10,6)
    size=min(height*.62,(width-.28)/max(1,len(text))*.86)
    m.plaque(text,(x,y-.120,z-.012),size,letter)

def knee_brace(m,x,y,z,direction,wood="wood",reach=.42):
    # Curved haunch under the end of a tie beam, not an arbitrary ornament floating in the bay.
    dx,dy=direction
    pts=[(x,y,z-.46),(x+dx*reach*.20,y+dy*reach*.20,z-.31),
         (x+dx*reach*.55,y+dy*reach*.55,z-.18),(x+dx*reach,y+dy*reach,z-.08)]
    m.tube(pts,.045,wood,"beam_haunches",8)

def lantern(m,x,y,z):
    m.tube([(x,y,z+.36),(x,y,z+.74)],.023,"wood_dark","lantern_frame",8)
    profile=[(.08,-.34),(.20,-.25),(.25,-.05),(.25,.12),(.18,.3),(.07,.34)]
    m.lathe((x,y,z),profile,"lantern","lantern_glow",12)
    for j in range(8):
        a=math.tau*j/8
        m.tube([(x+r*math.cos(a),y+r*math.sin(a),z+h) for r,h in profile],.014,"wood_dark","lantern_frame",5)
    for zz in [-.31,.31]:m.cylinder((x,y,z+zz),.115,.055,"bronze","lantern_frame",16)
    for j in range(5):m.beam((x+(j-2)*.022,y,z-.35),(x+(j-2)*.035,y,z-.62),.009,mat="vermilion_silk",role="lantern_tassel")

def facade(m,x,y,width,height,z,bays,wood,wall,pattern,open_front=False):
    spacing=width/bays
    for i in range(bays+1):column(m,x-width/2+i*spacing,y,z,height,wood,.15)
    for i in range(bays):
        xx=x-width/2+(i+.5)*spacing
        opening=spacing-.34
        central=i==bays//2
        if open_front or central:
            m.box((xx,y,z+height-.20),(opening,.18,.40),wood,"lintels",bevel=.02)
            m.box((xx,y-.035,z+height-.41),(opening+.08,.21,.055),wood,"lintel_mouldings",bevel=.012)
            if central and not open_front:
                door_h=min(2.45,height-.58)
                door_w=min(.75,(opening-.12)/2)
                for sign in [-1,1]:
                    hinge=xx+sign*opening/2
                    with m.transform((hinge,y,z+.12),sign*math.radians(63)):
                        center=-sign*door_w/2
                        panel_h=door_h*.35
                        panel_frame(m,center,0,panel_h/2,door_w,panel_h,wood,wood)
                        lattice(m,center,0,panel_h+(door_h-panel_h)/2,door_w,door_h-panel_h,wood,"rich",False)
                        # Visible hinge leaves and a suspended pull ring replace the spherical handle.
                        for zz in [.22,door_h-.22]:
                            m.box((-sign*.055,-.075,zz),(.09,.025,.115),"bronze","door_hinges",bevel=.01)
                            m.cylinder((0,0,zz),.031,.15,"bronze","door_hinges",12)
                        hx=-sign*(door_w-.12)
                        m.box((hx,-.076,door_h*.45),(.075,.025,.095),"bronze","door_handles",bevel=.012)
                        pts=[(hx+.049*math.cos(math.tau*j/24),-.10,door_h*.45-.035+.060*math.sin(math.tau*j/24)) for j in range(25)]
                        m.tube(pts,.009,"bronze","door_handles",6)
        else:
            m.box((xx,y,z+.43),(spacing-.28,.26,.86),wall,"walls",bevel=.025)
            window_bottom=.92
            window_h=min(1.90,height-.49-window_bottom)
            window_top=window_bottom+window_h
            m.box((xx,y,z+(height+window_top)/2),(opening,.26,height-window_top),wall,"walls")
            # Continuous jambs bridge the frame-to-column reveal on both faces.
            for side in [-1,1]:
                m.box((xx+side*(opening/2-.02),y,z+(.86+height)/2),(.14,.26,height-.86),wood,"window_jambs",bevel=.012)
            lattice(m,xx,y-.05,z+window_bottom+window_h/2,opening-.20,window_h,wood,pattern)
            m.box((xx,y-.075,z+.875),(opening+.06,.35,.09),"stone" if wall!="earthwall" else wood,"window_sills",bevel=.02)
            m.collider((xx,y,z+height/2),(opening,.3,height))
    m.beam((x-width/2-.25,y,z+height),(x+width/2+.25,y,z+height),.23,.30,wood,"beams")
    m.beam((x-width/2-.22,y,z+height-.35),(x+width/2+.22,y,z+height-.35),.14,.18,wood,"beams")
    for i in range(bays):
        for sign in [-1,1]:
            knee_brace(m,x-width/2+(i+(1 if sign<0 else 0))*spacing,y,z+height, (sign,0),wood,min(.42,spacing*.16))

def hall(m,x,y,w,d,name="",bays=3,wood="wood",wall="plaster",height=3.25,style="tile",open_hall=False,ornate=False,floor=.62,stairs=True,rise=None,roof_opening=None,sign_projection=.23,roof_clip=None):
    top=platform(m,x,y,w,d,height=floor,stairs=stairs)
    facade(m,x,y-d/2,w,height,top,bays,wood,wall,"rich" if ornate else "diamond",open_hall)
    with m.transform((x,y+d/2,0),math.pi):
        facade(m,0,0,w,height,top,bays,wood,wall,"grid",open_hall)
    for sign in [-1,1]:
        with m.transform((x+sign*w/2,y,0),sign*math.pi/2):
            facade(m,0,0,d,height,top,max(1,round(d/3)),wood,wall,"grid",open_hall)
    for i in range(bays+1):
        xx=x-w/2+i*w/bays
        m.beam((xx,y-d/2,top+height-.15),(xx,y+d/2,top+height-.15),.19,.26,wood,"ceiling_beams")
        if ornate:
            for yy in [y-d/2,y+d/2]:
                for j in range(3):
                    m.box((xx,yy,top+height+j*.14),(.65-j*.12,.19,.14),"greenwood","brackets")
                    m.box((xx,yy,top+height+j*.14),(.19,.65-j*.12,.14),wood,"brackets")
        for side in [-1,1]:knee_brace(m,xx,y+side*d/2,top+height, (0,-side),wood,.42)
    roof(m,x,y,w+2.0,d+2.0,top+height+.20,rise if rise is not None else (2.2 if w>13 else 1.75),style,ornate,seed=int(w*12+d*7),opening=roof_opening,clip=roof_clip)
    if name:
        # Maintain headroom above the actual floor, including the short upper halls and cottage.
        sign_h=min(.66,max(.32,height-2.02))
        sign_z=top+max(height-.72,2.02+sign_h/2)
        signboard(m,name,x,y-d/2-sign_projection,sign_z,height=sign_h,
                  wood="wood_dark" if wood!="wood_light" else wood,letter="gold_letter" if wood!="wood_light" else "ink",rich=ornate)
        # Two concealed blocks carry the board forward of the lintel; nothing crosses the text face.
        extension=sign_projection-.23
        for sx in [-1,1]:m.box((x+sx*.75,y-d/2-.11-extension/2,sign_z+.05),(.12,.20+extension,.25),wood,"plaque_mounts",bevel=.012)
    for xx in [x-w/2+.5,x+w/2-.5]:
        lantern(m,xx,y-d/2-.45,top+height-.8)
        m.beam((xx,y-d/2,top+height-.06),(xx,y-d/2-.45,top+height-.06),.055,.065,wood,"lantern_brackets")
    return top

def corridor(m,x,y,length,width=2.0,rotation=0,wood="wood",style="tile",roof_clip=None):
    with m.transform((x,y,0),rotation):
        m.box((0,0,.25),(length,width,.5),"paving","corridor_floor",bevel=.035)
        m.walk_surface(0,0,length,width,.5)
        count=max(2,round(length/2.7))
        for i in range(count+1):
            xx=-length/2+i*length/count
            for yy in [-width/2+.10,width/2-.10]:
                column(m,xx,yy,.5,2.65,wood,.095)
            m.beam((xx,-width/2,.5+2.55),(xx,width/2,.5+2.55),.14,.18,wood,"corridor_beams")
        for yy in [-width/2+.1,width/2-.1]:
            m.beam((-length/2,yy,3.08),(length/2,yy,3.08),.14,.22,wood,"corridor_beams")
        roof(m,0,0,length+1,width+.85,3.18,.85,style=style,seed=int(length*10),clip=roof_clip)

def moon_wall(m,x,y,length,height=2.75,radius=1.25,rotation=0,wall="plaster"):
    with m.transform((x,y,0),rotation):
        center_z=radius+.03
        n=64
        verts=[]
        for depth in [-.16,.16]:
            for i in range(n):
                a=math.tau*i/n
                dx,dz=math.cos(a),math.sin(a)
                t_x=(length/2)/max(abs(dx),1e-8)
                t_z=(height-center_z)/max(dz,1e-8) if dz>=0 else center_z/max(-dz,1e-8)
                extent=min(t_x,t_z)
                verts.extend([(radius*dx,depth,center_z+radius*dz),(extent*dx,depth,center_z+extent*dz)])
        faces=[]
        for i in range(n):
            a,b=2*i,2*((i+1)%n)
            faces.extend([(a,a+1,b+1,b),(a+2*n,b+2*n,b+1+2*n,a+1+2*n),(a,b,b+2*n,a+2*n)])
        m.add(verts,faces,wall,"garden_walls")
        ring=[(radius*math.cos(math.tau*i/64),-.2,center_z+radius*math.sin(math.tau*i/64)) for i in range(65)]
        m.tube(ring,.085,"white_stone","moon_gate_frame",8)
        m.box((0,0,height+.02),(length,.48,.13),"dark_stone","wall_coping")
        for xx in [-length/2+.13+i*.26 for i in range(max(1,int(length/.26)))]:
            m.beam((xx,-.32,height+.16),(xx,.32,height+.16),.18,.14,"tile","wall_tiles")
        side=(length-2*radius)/2
        for sign in [-1,1]:m.collider((sign*(radius+side/2),0,height/2),(side,.35,height))

def garden_wall(m,x,y,length,rotation=0,height=2.75,wall="plaster"):
    with m.transform((x,y,0),rotation):
        m.box((0,0,height/2),(length,.32,height),wall,"garden_walls",bevel=.025)
        m.box((0,0,.23),(length,.40,.46),"brick","wall_base")
        m.box((0,0,height+.04),(length,.48,.14),"dark_stone","wall_coping")
        for xx in [-length/2+.13+i*.26 for i in range(max(1,int(length/.26)))]:
            m.beam((xx,-.32,height+.15),(xx,.32,height+.15),.18,.14,"tile","wall_tiles")
        m.collider((0,0,height/2),(length,.36,height))

def vase(m,x,y,z,color="porcelain",flowers=False,chrysanthemums=False):
    m.lathe((x,y,z),[(.12,0),(.145,.025),(.16,.055),(.20,.10),(.235,.16),(.25,.24),(.245,.34),(.22,.43),(.17,.50),(.13,.56),(.12,.65),(.13,.69),(.15,.71),(.15,.735),(.125,.735),(.108,.69),(.104,.56),(.15,.50),(.20,.43),(.225,.34),(.23,.24),(.21,.16),(.17,.11),(.115,.07)],color,"objects",48)
    m.lathe((x,y,z+.69),[(.133,0),(.155,.012),(.154,.025),(.132,.028)],color,'vase_rims',48)
    if flowers:
        for j in range(5):
            a=j*2.4
            tip=(x+math.cos(a)*.25,y+math.sin(a)*.25,z+1.05+j*.025)
            m.beam((x,y,z+.6),tip,.011,mat="bamboo",role="flower_stems")
            if chrysanthemums:chrysanthemum(m,tip,.13,"flower_white",j,role="cut_flower")
            else:flower(m,tip,.13,"flower_white",j,role="cut_flower")

def bound_book(m,x,y,z,w=.47,d=.32,h=.055,color="greenwood",rotation=0):
    with m.transform((x,y,z),rotation):
        m.box((0,0,h/2),(w-.025,d-.025,h-.014),"paper","books",bevel=.007)
        for zz in [.004,h-.004]:m.box((0,0,zz),(w,d,.008),color,"book_covers",bevel=.007)
        for j in range(4):
            yy=-d*.32+j*d*.21
            m.tube([(-w/2+.028,yy,.007),(-w/2+.028,yy,h-.006),(-w/2+.060,yy,h+.003)],.0035,"paper","book_stitching",5)
        m.box((w*.24,0,h+.002),(w*.16,d*.55,.004),"paper","book_labels",bevel=.004)
        for j in range(2):m.box((w*.24,(-.13+j*.26)*d,h+.005),(w*.085,.004,.003),"ink","book_labels")
        for j in range(1,4):m.box((.006,-d/2+.011,h*j/4),(w-.05,.006,.002),"thatch","book_pages")

def tea_service(m,x,y,z,scale=1,mat="porcelain",cups=3):
    with m.transform((x,y,z)):
        s=scale
        m.lathe((0,0,0),[(.44*s,0),(.46*s,.018*s),(.46*s,.040*s),(.42*s,.056*s),(.40*s,.045*s)],"wood","tea_tray",40)
        px,py=-.13*s,.07*s
        m.lathe((px,py,.045*s),[(.09*s,0),(.145*s,.08*s),(.15*s,.16*s),(.12*s,.22*s),(.075*s,.25*s),(.075*s,.27*s)],mat,"teapot",40)
        m.lathe((px,py,.300*s),[(.09*s,0),(.10*s,.012*s),(.07*s,.035*s),(.025*s,.045*s),(.025*s,.067*s)],mat,"teapot_lid",32)
        m.tube([(px+.10*s,py,.16*s),(px+.19*s,py,.18*s),(px+.26*s,py,.26*s)],.035*s,mat,"teapot_spout",12,taper=.58)
        m.tube([(px-.10*s,py,.10*s),(px-.22*s,py,.11*s),(px-.25*s,py,.22*s),(px-.17*s,py,.28*s),(px-.10*s,py,.24*s)],.018*s,mat,"teapot_handle",10)
        for j in range(cups):
            a=-math.pi*.1+j*math.pi*.55
            xx,yy=.30*s*math.cos(a),-.10*s+.23*s*math.sin(a)
            m.lathe((xx,yy,.045*s),[(.052*s,0),(.055*s,.016*s),(.078*s,.082*s),(.080*s,.10*s),(.067*s,.10*s),(.048*s,.027*s)],mat,"teacups",32)
            m.disk((xx,yy,.085*s),.057*s,"wood_dark","tea",24)

def brush_stroke(m,points,width=.009,mat="ink",role="painting_brushwork",normal=(0,0,1),phase=0):
    """Flat pressure-shaped ink on a sheet, with no cylindrical body above the paper."""
    if len(points)<2:return
    path=[Vector(p) for p in curve_points(points,4)]
    normal=Vector(normal).normalized();verts=[]
    for i,p in enumerate(path):
        tangent=path[min(i+1,len(path)-1)]-path[max(0,i-1)]
        across=normal.cross(tangent).normalized();t=i/(len(path)-1)
        pressure=(.075+.925*math.sin(math.pi*t)**.62)*(.85+.15*math.cos(math.pi*t))
        pressure*=1+.08*math.sin(phase+t*15)
        for side in [-1,1]:verts.append(tuple(p+across*(side*width*pressure/2)))
    m.add(verts,[(i*2,i*2+2,i*2+3,i*2+1) for i in range(len(path)-1)],mat,role)

def writing_set(m,x,y,z,w):
    m.box((x-.25,y-.07,z+.008),(min(.85,w*.36),.56,.012),"paper","writing",bevel=.008)
    # Unattributed brush practice: varied marks rather than a fabricated literary quotation.
    strokes=(
        ((-.026,.018),(-.006,.021),(.025,.013)),
        ((.007,.026),(.004,.009),(.001,-.017),(-.008,-.022)),
        ((.003,.010),(-.012,-.004),(-.026,-.016)),
        ((-.001,-.002),(.014,-.014),(.030,-.020)),
        ((-.023,.002),(.001,.006),(.023,.002),(.016,-.012)),
    )
    for column in range(4):
        for row in range(5):
            seed=column*5+row;rng=random.Random(1700+seed)
            cx=x-.10-column*.105+rng.uniform(-.003,.003)
            cy=y+.10-row*.073+rng.uniform(-.003,.003)
            angle=rng.uniform(-.12,.12);scale=rng.uniform(.84,1.07)
            for j in range(2+seed%2):
                path=strokes[(seed+j*2)%len(strokes)]
                points=[(cx+scale*(px*math.cos(angle)-py*math.sin(angle)),cy+scale*(px*math.sin(angle)+py*math.cos(angle)),z+.0147) for px,py in path]
                brush_stroke(m,points,rng.uniform(.005,.0085),role="written_marks",phase=seed*.7+j)
    m.box((x+.37,y-.08,z+.026),(.29,.19,.052),"dark_stone","inkstone",bevel=.04)
    m.box((x+.37,y-.10,z+.054),(.18,.105,.012),"ink","inkstone",bevel=.025)
    m.lathe((x+.68,y+.15,z+.012),[(.09,0),(.10,.025),(.10,.21),(.095,.23),(.078,.23),(.078,.045)],"ceramic","brush_pot",32)
    for j in range(5):
        a=j*2.35
        tip=(x+.68+.08*math.cos(a),y+.15+.07*math.sin(a),z+.49+(j%2)*.07)
        start=(x+.68+.04*math.cos(a),y+.15+.04*math.sin(a),z+.11)
        m.tube([start,tip],.008,"bamboo","brushes",8)
        m.tube([tip,(tip[0]+.008,tip[1],tip[2]+.06)],.012,"ink","brush_tips",8,taper=.05)
    m.tube([(x-.01,y+.20,z+.025),(x+.35,y+.20,z+.025)],.012,"bamboo","resting_brush",8)
    for sx in [-.08,.08]:m.lathe((x+.17+sx,y+.20,z),[(.018,0),(.020,.025),(.014,.04)],"ceramic","brush_rest",16)
    for j in range(3):bound_book(m,x-w*.32,y+.09,z+j*.064,.48,.34,.058,"greenwood" if j%2 else "wood_light",rotation=.025*(j-1))

def table(m,x,y,z,w=2.4,d=1.2,study=True,wood="wood_dark",top_material=None):
    h=.85
    m.box((x,y,z+h-.012),(w,d,.086),wood,"furniture",bevel=.025)
    m.box((x,y,z+h+.042),(w-.10,d-.10,.022),top_material or wood,"table_inset_tops",bevel=.012)
    # Framed floating top: the narrow moulding and recessed apron reveal the joinery.
    for sy in [-1,1]:m.box((x,y+sy*(d/2-.025),z+h+.043),(w-.05,.025,.020),wood,"table_mouldings",bevel=.006)
    for sx in [-1,1]:m.box((x+sx*(w/2-.025),y,z+h+.043),(.025,d-.05,.020),wood,"table_mouldings",bevel=.006)
    for sx in [-1,1]:
        for sy in [-1,1]:
            xx,yy=x+sx*(w/2-.15),y+sy*(d/2-.13)
            m.box((xx,yy,z+h/2),(.10,.10,h),wood,"furniture",bevel=.016)
            m.box((xx,yy,z+.055),(.13,.13,.08),wood,'furniture_feet',bevel=.02)
            for direction in [-1,1]:
                m.beam((xx,yy,z+h-.22),(xx-sx*.18,yy+direction*.015,z+h-.07),.045,mat=wood,role='table_brackets')
    for sy in [-1,1]:
        m.box((x,y+sy*(d/2-.12),z+h-.14),(w-.22,.065,.15),wood,"table_aprons",bevel=.018)
        m.box((x,y+sy*(d/2-.13),z+h-.22),(w-.34,.06,.027),wood,"table_mouldings",bevel=.008)
    for sx in [-1,1]:m.box((x+sx*(w/2-.14),y,z+h-.14),(.065,d-.25,.15),wood,"table_aprons",bevel=.015)
    for sy in [-1,1]:
        m.beam((x-w/2+.15,y+sy*(d/2-.13),z+.24),(x+w/2-.15,y+sy*(d/2-.13),z+.24),.045,.065,wood,'table_stretchers')
    if study:
        writing_set(m,x,y,z+h+.057,w)
    return z+h+.057

def stool(m,x,y,z,mat="wood"):
    m.lathe((x,y,z+.43),[(.27,0),(.285,.025),(.285,.055),(.27,.075)],mat,"stool_seats",40)
    m.disk((x,y,z+.507),.235,"thatch","stool_woven_seats",32)
    for sx in [-1,1]:
        for sy in [-1,1]:
            xx,yy=x+sx*.165,y+sy*.165
            m.tube([(xx+sx*.025,yy+sy*.025,z+.02),(xx,yy,z+.22),(xx,yy,z+.44)],.035,mat,"stool_legs",10,taper=.86)
        m.beam((x+sx*.17,y-.17,z+.18),(x+sx*.17,y+.17,z+.18),.028,mat=mat,role="stool_stretchers")
        m.beam((x-.17,y+sx*.17,z+.22),(x+.17,y+sx*.17,z+.22),.028,mat=mat,role="stool_stretchers")

def chair(m,x,y,z,rotation=0,wood="wood_dark"):
    with m.transform((x,y,z),rotation):
        m.box((0,0,.48),(.57,.54,.075),wood,"chair_seats",bevel=.035)
        m.box((0,0,.522),(.46,.42,.012),"thatch","chair_woven_seats",bevel=.015)
        for sx in [-1,1]:
            for sy in [-1,1]:m.tube([(sx*.255,sy*.24,.03),(sx*.235,sy*.225,.49)],.031,wood,"chair_legs",10)
            m.tube([(sx*.235,.225,.49),(sx*.24,.26,.91),(sx*.23,.28,1.11)],.029,wood,"chair_back",10)
            m.beam((sx*.23,-.22,.22),(sx*.23,.23,.22),.026,mat=wood,role="chair_stretchers")
        m.tube([(-.32,.25,1.10),(-.22,.29,1.13),(0,.32,1.15),(.22,.29,1.13),(.32,.25,1.10)],.033,wood,"chair_back",12)
        m.tube([(0,.24,.55),(0,.29,.70),(0,.32,.94),(0,.30,1.10)],.065,wood,"chair_splat",12)
        for zz in [.18,.40]:m.beam((-.235,-.225,zz),(.235,-.225,zz),.025,mat=wood,role="chair_stretchers")

def bed(m,x,y,z,silk="jade_silk"):
    # Open timber frame, joined rails and gathered textile replace the solid block/canopy.
    for sx in [-1,1]:m.box((x+sx*1.02,y,z+.43),(.14,2.94,.24),"wood_dark","bed_rails",bevel=.025)
    for sy in [-1,1]:m.box((x,y+sy*1.42,z+.43),(2.02,.14,.24),"wood_dark","bed_rails",bevel=.025)
    for j in range(12):m.box((x,y-1.30+j*.235,z+.51),(1.99,.18,.045),"wood_light","bed_slats",bevel=.006)
    m.box((x,y,z+.59),(2.02,2.76,.15),"paper","bed_mattress",bevel=.06)
    for sx in [-1,1]:
        for sy in [-1,1]:
            xx,yy=x+sx*1.03,y+sy*1.42
            m.box((xx,yy,z+.24),(.15,.15,.48),"wood_dark","bed_feet",bevel=.025)
            m.cylinder((xx,yy,z+1.60),.047,2.25,"wood","bed_frame",16)
            m.lathe((xx,yy,z+2.71),[(.06,0),(.065,.025),(.045,.06),(.025,.085)],"wood_dark","bed_finials",20)
    for sx in [-1,1]:m.box((x+sx*1.03,y,z+2.70),(.10,2.94,.12),"wood_dark","bed_frame",bevel=.025)
    for sy in [-1,1]:
        m.box((x,y+sy*1.42,z+2.70),(2.16,.10,.12),"wood_dark","bed_frame",bevel=.025)
        panel_frame(m,x,y+sy*1.42,z+.91,1.99,.47,"wood","wood_dark","bed_panels")
    # The blanket has a soft top and dropped selvages rather than a second rigid slab.
    verts=[];nx,ny=20,26
    for j in range(ny+1):
        v=j/ny
        for i in range(nx+1):
            u=i/nx;edge=min(u,1-u)
            zz=z+.695+.012*math.sin(v*17+u*5)+.007*math.sin(u*45+v*11)-.085*max(0,1-edge/.10)**2
            verts.append((x+(u-.5)*2.09,y-1.31+v*2.34,zz))
    m.add(verts,[(j*(nx+1)+i,j*(nx+1)+i+1,(j+1)*(nx+1)+i+1,(j+1)*(nx+1)+i) for j in range(ny) for i in range(nx)],silk,"bed_coverlet",True)
    for sx in [-1,1]:
        verts=[];nx,ny=64,36
        for j in range(ny+1):
            t=j/ny;tie=math.exp(-((t-.55)/.19)**2)
            gather=.90-.58*tie
            amplitude=(.023+.068*math.sin(math.pi*t)**.8)*(1-.48*tie)
            for i in range(nx+1):
                u=i/nx;phase=math.tau*(6*u+.055*math.sin(t*4))
                pleat=math.sin(phase)+.24*math.sin(2*phase+.4)
                envelope=math.sin(math.pi*u)**.35
                xx=x+sx*(1.02+amplitude*pleat*envelope)
                yy=y+.12+(u-.5)*2.72*gather+.012*math.sin(phase)*math.sin(math.pi*t)
                zz=z+.74+1.91*t+.024*(1-t)**4*(.3+.7*math.cos(phase))
                verts.append((xx,yy,zz))
        faces=[(j*(nx+1)+i,j*(nx+1)+i+1,(j+1)*(nx+1)+i+1,(j+1)*(nx+1)+i) for j in range(ny) for i in range(nx)]
        if sx<0:faces=[tuple(reversed(face)) for face in faces]
        count=len(verts)
        verts.extend((xx-sx*.004,yy,zz) for xx,yy,zz in verts[:])
        faces.extend(tuple(index+count for index in reversed(face)) for face in faces[:])
        perimeter=(list(range(nx+1))+[j*(nx+1)+nx for j in range(1,ny+1)]+
                   [ny*(nx+1)+i for i in range(nx-1,-1,-1)]+[j*(nx+1) for j in range(ny-1,0,-1)])
        if sx<0:perimeter.reverse()
        faces.extend((a,a+count,b+count,b) for a,b in zip(perimeter,perimeter[1:]+perimeter[:1]))
        m.add(verts,faces,silk,"curtains",True)
        tie_points=[(x+sx*(1.02+.09*math.cos(math.tau*i/40)),y+.12+.48*math.sin(math.tau*i/40),z+1.80+.008*math.sin(math.tau*i/20)) for i in range(41)]
        m.tube(tie_points,.012,"paper","curtain_ties",8)
    m.box((x,y+.94,z+.78),(1.16,.46,.19),"paper","bed_pillows",bevel=.09)
    for sx in [-1,1]:m.box((x+sx*.48,y+.94,z+.785),(.045,.45,.19),silk,"pillow_bands",bevel=.018)

def bookcase(m,x,y,z):
    m.box((x,y+.235,z+1.13),(1.9,.045,2.17),"wood","bookcase_back",bevel=.012)
    for sx in [-1,1]:
        m.box((x+sx*.91,y,z+1.1),(.10,.55,2.2),"wood_dark","bookcase_frame",bevel=.018)
        for sy in [-1,1]:m.box((x+sx*.91,y+sy*.23,z+.10),(.13,.13,.20),"wood_dark","bookcase_feet",bevel=.02)
    for zz in [.18,2.20]:m.box((x,y,z+zz),(1.98,.58,.09),"wood_dark","bookcase_frame",bevel=.02)
    for shelf in range(4):
        zz=z+.28+shelf*.48
        m.box((x,y,zz),(1.74,.52,.045),"wood","bookcase_shelves",bevel=.008)
        for stack in range(3):
            for j in range(3+(shelf+stack)%2):
                bound_book(m,x-.57+stack*.56,y-.025,zz+.025+j*.067,.46,.37,.061,
                           "greenwood" if (j+shelf)%3 else "wood_light",rotation=.015*((j+stack)%3-1))

def birdcage(m,x,y,z):
    m.lathe((x,y,z),[(.26,0),(.29,.03),(.29,.08),(.26,.11)],"wood","birdcage_base",40)
    profile=[(.26,.09),(.27,.24),(.27,.49),(.23,.67),(.13,.79),(.045,.83)]
    for j in range(24):
        a=math.tau*j/24
        m.tube([(x+r*math.cos(a),y+r*math.sin(a),z+zz) for r,zz in profile],.007,"bamboo","birdcage_bars",6)
    for r,zz in [(.27,.22),(.27,.50),(.20,.71)]:
        m.tube([(x+r*math.cos(math.tau*j/48),y+r*math.sin(math.tau*j/48),z+zz) for j in range(49)],.013,"bamboo","birdcage_rings",8)
    m.beam((x-.23,y,z+.30),(x+.23,y,z+.30),.025,mat="wood_light",role="birdcage_perch")
    for sx in [-1,1]:m.lathe((x+sx*.19,y-.10,z+.12),[(.045,0),(.06,.045),(.06,.07),(.045,.07),(.035,.025)],"porcelain","birdcage_cups",20)
    m.lathe((x,y,z+.80),[(.065,0),(.065,.05),(.032,.08)],"bronze","birdcage_hook",20)
    m.tube([(x,y,z+.88),(x,y,z+.98),(x+.04,y,z+1.02),(x+.08,y,z+.99),(x+.07,y,z+.95)],.012,"bronze","birdcage_hook",8)
    m.beam((x,y,z+1.0),(x,y,3.08),.014,mat="bronze",role="birdcage_hanger")
    m.beam((x-.80,y,3.08),(x+.80,y,3.08),.06,.07,"wood","birdcage_hanger_beam")

def low_couch(m,x,y,z,w=2.5,d=1.2,mat="wood_light"):
    m.box((x,y,z+.49),(w,d,.10),mat,"couch_frame",bevel=.035)
    for sx in [-1,1]:
        for sy in [-1,1]:m.box((x+sx*(w/2-.12),y+sy*(d/2-.12),z+.25),(.12,.12,.50),mat,"couch_feet",bevel=.022)
        m.box((x+sx*(w/2-.06),y,z+.67),(.08,d,.28),mat,"couch_sides",bevel=.025)
    m.box((x,y,z+.555),(w-.18,d-.15,.035),"thatch","couch_mat",bevel=.018)
    for sy in [-1,1]:m.box((x,y+sy*(d/2-.12),z+.36),(w-.20,.08,.15),mat,"couch_apron",bevel=.02)
    for j in range(max(3,int(w/.075))):m.box((x-w/2+.12+j*.075,y,z+.575),(.012,d-.18,.005),"bamboo_ring","couch_weave")

def cloth_curtain(m,x,y,z,w,h,mat="vermilion_silk"):
    # Gathered open sides keep the doorway readable and physically open in every weather.
    for side in [-1,1]:
        verts=[];nx,ny=12,20
        for j in range(ny+1):
            v=j/ny
            gather=.22+.45*abs(v-.45)
            for i in range(nx+1):
                u=i/nx
                xx=x+side*(w/2-u*w*gather*.46)
                yy=y+.035*math.sin(u*math.tau*4)+.025*math.sin(v*math.pi)
                verts.append((xx,yy,z+v*h+.014*math.sin(u*math.tau*3)*(1-v)))
        m.add(verts,[(j*(nx+1)+i,j*(nx+1)+i+1,(j+1)*(nx+1)+i+1,(j+1)*(nx+1)+i) for j in range(ny) for i in range(nx)],mat,"door_curtains",True)
        m.tube([(x+side*w*.31,y-.04,z+h*.44),(x+side*w*.49,y-.035,z+h*.46)],.018,"paper","curtain_ties",8)
    m.beam((x-w/2-.08,y,z+h+.04),(x+w/2+.08,y,z+h+.04),.04,mat="wood_dark",role="curtain_rods")

def citron(m,x,y,z,seed):
    # Ribbed rind and tapering, curved fingers give the fruit its recognisable silhouette.
    phase=seed*.73;verts=[(x,y,z+.12)];sides=24;rings=12
    for j in range(1,rings):
        a=math.pi*j/rings
        for i in range(sides):
            t=math.tau*i/sides;r=.115*math.sin(a)*(1+.055*math.cos(t*8+phase))
            verts.append((x+r*math.cos(t),y+r*.78*math.sin(t),z+.12*math.cos(a)))
    verts.append((x,y,z-.12))
    faces=[(0,1+i,1+(i+1)%sides) for i in range(sides)]
    faces.extend((1+j*sides+i,1+j*sides+(i+1)%sides,1+(j+1)*sides+(i+1)%sides,1+(j+1)*sides+i) for j in range(rings-2) for i in range(sides))
    last=1+(rings-2)*sides
    faces.extend((len(verts)-1,last+(i+1)%sides,last+i) for i in range(sides))
    m.add(verts,faces,"flower_gold","buddha_hand",True)
    for j in range(6):
        sx=(j-2.5)*.031;length=.14+.035*math.sin(j*.8+phase)
        m.tube([(x+sx,y+.04,z+.05),(x+sx*1.25,y+.12,z+.07),(x+sx*1.40,y+.12+length*.55,z+.05),(x+sx*1.30,y+.12+length,z+.02)],.022,"flower_gold","citron_fingers",10,taper=.42)

def fish_chime(m,x,y,z,flip=1):
    contour=[(-.30,-.10),(-.19,-.055)]
    contour.extend((.04+.25*math.cos(-math.pi*.82+j*math.pi*1.64/24),.105*math.sin(-math.pi*.82+j*math.pi*1.64/24)) for j in range(25))
    contour.extend([(-.19,.055),(-.30,.10),(-.265,0)])
    verts=[(x+flip*xx,y+depth,z+zz) for depth in [-.035,.035] for xx,zz in contour];n=len(contour)
    faces=[tuple(range(n)),tuple(reversed(range(n,2*n)))]
    faces.extend((i,i+n,(i+1)%n+n,(i+1)%n) for i in range(n))
    if flip<0:faces=[tuple(reversed(f)) for f in faces]
    m.add(verts,faces,"white_stone","chime",True)
    m.sphere((x+flip*.19,y-.038,z+.022),(.014,.006,.014),"stone","chime_relief",12,8)
    m.tube([(x+flip*.13,y-.040,z-.055),(x+flip*.10,y-.045,z),(x+flip*.13,y-.040,z+.055)],.005,"stone","chime_relief",5)

def bamboo_seat(m,x,y,z):
    for r,zz in [(.26,.05),(.23,.26),(.27,.49)]:
        m.tube([(x+r*math.cos(math.tau*j/40),y+r*math.sin(math.tau*j/40),z+zz) for j in range(41)],.018,"bamboo_ring","bamboo_seat_bands",8)
    for j in range(18):
        a=math.tau*j/18
        m.tube([(x+.25*math.cos(a),y+.25*math.sin(a),z+.05),(x+.22*math.cos(a),y+.22*math.sin(a),z+.26),(x+.26*math.cos(a),y+.26*math.sin(a),z+.48)],.024,"bamboo","bamboo_seat_slats",8)
        for zz in [.14,.35]:m.sphere((x+.235*math.cos(a),y+.235*math.sin(a),z+zz),(.023,.023,.012),"bamboo_ring","bamboo_seat_nodes",8,5)
    m.lathe((x,y,z+.48),[(.26,0),(.28,.022),(.28,.045),(.25,.065)],"bamboo","bamboo_seat_top",40)
    m.disk((x,y,z+.546),.247,"thatch","bamboo_seat_weave",40)

def gate_drum(m,x,y):
    for zz,ww,dd,hh in [(.08,1.10,1.36,.16),(.30,.92,1.20,.28),(.51,1.03,1.29,.14),(.66,.76,1.08,.18)]:
        m.box((x,y,zz),(ww,dd,hh),"white_stone","gate_stone_plinths",bevel=.045)
    profile=[(-.45,.40),(-.41,.48),(-.34,.50),(.34,.50),(.41,.48),(.45,.40)]
    sides=48;verts=[(x+r*math.cos(math.tau*j/sides),y+depth,1.24+r*math.sin(math.tau*j/sides)) for depth,r in profile for j in range(sides)]
    faces=[tuple(range(sides)),tuple(reversed(range((len(profile)-1)*sides,len(profile)*sides)))]
    faces.extend((k*sides+j,(k+1)*sides+j,(k+1)*sides+(j+1)%sides,k*sides+(j+1)%sides) for k in range(len(profile)-1) for j in range(sides))
    m.add(verts,faces,"white_stone","gate_drums",True)
    for side in [-1,1]:
        yy=y+side*.458
        m.tube([(x+.33*math.cos(math.tau*j/64),yy,1.24+.33*math.sin(math.tau*j/64)) for j in range(65)],.018,"stone","gate_drum_relief",8)
        for petal in range(6):
            a=math.tau*petal/6;points=[]
            for j in range(25):
                t=math.tau*j/24;r=.09+.10*math.sin(t/2)
                points.append((x+r*math.cos(a)+.052*math.cos(t)*math.sin(a),yy+side*.008,1.24+r*math.sin(a)-.052*math.cos(t)*math.cos(a)))
            m.tube(points,.012,"stone","gate_drum_relief",6)

def bridge(m,x,y,length=10,width=2.4,z=.5,rotation=0,material="white_stone",arch=False):
    with m.transform((x,y,0),rotation):
        n=24 if arch else 12
        for j in range(n):
            xx=-length/2+(j+.5)*length/n
            lift=.75*math.sin(math.pi*(j+.5)/n) if arch else 0
            m.box((xx,0,z+lift-.12),(length/n+.015,width,.25),material,"bridge_deck",bevel=.02)
            m.walk_surface(xx,0,length/n+.02,width,z+lift+.005)
            if j%3==0:
                for yy in [-width/2,width/2]:
                    m.box((xx,yy,z+lift+.44),(.13,.13,.88),material,"bridge_rails",bevel=.02)
                    m.lathe((xx,yy,z+lift+.87),[(.09,0),(.10,.03),(.10,.07),(.07,.12),(.02,.15)],material,"bridge_caps",24)
                    m.box((xx,yy,z+lift+.10),(.19,.19,.13),material,"bridge_rail_feet",bevel=.025)
        for sign in [-1,1]:
            points=[(-length/2+j*length/n,sign*width/2,z+.76+(.75*math.sin(math.pi*j/n) if arch else 0)) for j in range(n+1)]
            m.tube(points,.06,material,"bridge_rails",7)
            points2=[(xx,yy,zz-.5) for xx,yy,zz in points]
            m.tube(points2,.045,material,"bridge_rails",6)
            for a,b in zip(points,points[1:]):
                m.collider(((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2-.31),(math.dist(a[:2],b[:2])+.02,.14,.9),math.atan2(b[1]-a[1],b[0]-a[0]),kind='railing')
        for xx in [-length*.36,length*.36]:
            for yy in [-width*.35,width*.35]:m.box((xx,yy,z/2-.35),(.32,.35,z+.7),"dark_stone","bridge_piers")
        for sign in [-1,1]:
            edge=[(-length/2+j*length/n,sign*(width/2-.09),z-.13+(.75*math.sin(math.pi*j/n) if arch else 0)) for j in range(n+1)]
            m.tube(edge,.055,material,"bridge_fascia",10)
        if material=="redwood":
            for j in range(n):
                xx=-length/2+(j+.5)*length/n
                for sy in [-1,1]:m.cylinder((xx,sy*(width/2-.15),z+.011),.018,.008,"bronze","bridge_fasteners",10)

def pavilion(m,x,y,w=7,d=6,name="",paper=False,access=("west","east")):
    top=platform(m,x,y,w,d,height=.75,stairs=False)
    for xx in [-w/2+.22,-w/6,w/6,w/2-.22]:
        for yy in [-d/2+.25,d/2-.25]:column(m,x+xx,y+yy,top,2.65,"redwood",.14)
    for xx in [-w/2+.25,w/2-.25]:
        for yy in [-d/2+.25,d/2-.25]:
            m.lathe((x+xx,y+yy,-1.0),[(.28,0),(.28,.28),(.20,.36),(.20,1.5)],"dark_stone","water_piers",20)
    for yy in [-d/2,d/2]:m.beam((x-w/2,y+yy,3.36),(x+w/2,y+yy,3.36),.18,.26,"wood","beams")
    roof(m,x,y,w+2,d+2,3.6,1.75,seed=31)
    faces=[("south",(x,y-d/2),0,w,(0,-1)),("north",(x,y+d/2),math.pi,w,(0,1)),("west",(x-w/2,y),-math.pi/2,d,(-1,0)),("east",(x+w/2,y),math.pi/2,d,(1,0))]
    for side,(xx,yy),angle,length,direction in faces:
        gap=2.5 if side in access else 0
        with m.transform((xx,yy,0),angle):
            ranges=[(-length/2,-gap/2),(gap/2,length/2)] if gap else [(-length/2,length/2)]
            for begin,end in ranges:
                if end-begin>.15:railing(m,(begin,0),(end,0),top,"wood",.78)
            if paper or name=="藕香榭":
                for cx in [-length*.36,length*.36]:
                    lattice(m,cx,0,top+1.75,length*.23,1.45,"wood","diamond",paper)
        if gap:m.port(side,(xx+direction[0]*.325,yy+direction[1]*.325,top),direction,gap,canopy=.675)
    tabletop=table(m,x+w*.22,y+d*.22,top,1.4,1.1,False)
    tea_service(m,x+w*.22,y+d*.22,tabletop,.78,cups=2)
    for xx in [x+w*.22-1.1,x+w*.22+1.1]:stool(m,xx,y+d*.22,top)
    if name:
        signboard(m,name,x,y-d/2-.24,2.90,height=.64)
    return top

def courtyard(m,spec):
    kind=spec["kind"]
    W,D=spec["size"]
    timber="redwood" if kind=="yihong" else ("greenwood" if kind=="hengwu" else "wood")
    garden_wall(m,0,D/2,W)
    garden_wall(m,-W/2,0,D,math.pi/2)
    garden_wall(m,W/2,0,D,math.pi/2)
    moon_wall(m,0,-D/2,W)
    m.port("entry",(0,-D/2,.11 if kind=="xiaoxiang" else .18),(0,-1),2.3)
    main_w=15 if kind in ["hengwu","yihong"] else (12.8 if kind=="qiushuang" else 10.8)
    main_d=6.8
    main_y=D/2-8.3
    bays=5 if kind in ["hengwu","yihong"] else 3
    title={"xiaoxiang":"有凤来仪","yihong":"怡红快绿","hengwu":"蘅芷清芬","yingchun":""}.get(kind,spec["name"])
    level=hall(m,0,main_y,main_w,main_d,title,bays,timber,height=3.2,style="juanpeng" if kind=="hengwu" else "tile",ornate=kind=="yihong",roof_opening=(8.3,4.6) if kind=="yingchun" else None)
    if kind in ["xiaoxiang","yihong","hengwu"]:
        signboard(m,spec["name"],0,-D/2-.42,2.94,width=2.7,height=.64,rich=kind=="yihong")
        for sx in [-1,1]:m.box((sx*.88,-D/2-.27,2.98),(.12,.36,.25),"wood_dark","plaque_mounts",bevel=.018)
        couplets={"xiaoxiang":("宝鼎茶闲烟尚绿","幽窗棋罢指犹凉"),"hengwu":("吟成豆蔻才犹艳","睡足荼蘼梦也香")}.get(kind)
        if couplets:
            for side,text in [(1,couplets[0]),(-1,couplets[1])]:
                xx=side*(main_w/bays/2+.06)
                m.box((xx,main_y-main_d/2-.18,level+1.73),(.40,.10,2.55),"wood_dark","couplet_boards",bevel=.018)
                for j,char in enumerate(text):m.plaque(char,(xx,main_y-main_d/2-.25,level+2.74-j*.34),.27)
    corridor(m,-W/2+1.35,-1,D-6.8,1.8,math.pi/2,timber)
    corridor(m,W/2-1.35,-1,D-6.8,1.8,math.pi/2,timber)
    if kind=="xiaoxiang":
        points=ribbon(m,[(0,-D/2,.11),(-.8,-9,.11),(-1.4,-6,.11),(-.8,-3,.11),(0,main_y-main_d/2-1.0,.11)],1.35,"paving","courtyard_paths")
        for index,p in enumerate(points):
            if index%2==0:
                for side in [-1,1]:rock(m,p[0]+side*.80,p[1],.035,(.13,.18,.055),index)
    else:
        m.box((0,-4,.09),(2.4,D-6,.18),"paving","courtyard_paths",bevel=.025)
        m.walk_surface(0,-4,2.4,D-6,.18)
        for side in [-1,1]:
            for j in range(8):m.box((side*1.32,-D/2+.8+j*1.5,.08),(.16,1.43,.16),"brick","path_edges")
    for side in [-1,1]:
        lantern(m,side*(W/2-1.35),-D/2+3,2.35)
    if kind=="xiaoxiang":
        # One bright central bay and two side rooms, with a passage towards the rear garden.
        for xx in [-main_w/6,main_w/6]:
            m.box((xx,main_y+.25,level+1.35),(.14,main_d-1,2.7),"wood","partitions")
        table(m,-main_w*.29,main_y-.8,level,2.1,1.0)
        chair(m,-main_w*.29,main_y+.20,level)
        bookcase(m,-main_w*.29,main_y+2.3,level)
        bed(m,main_w*.30,main_y+.3,level,"rose_silk")
        # Reserve the full crown beyond the 1 m eave and its 0.10 m tile detail,
        # with another 0.15 m gap; no individual culm needs a placement exception.
        front_eave=main_y-main_d/2-1.10
        bamboo_y_max=front_eave-1.55-.15
        for j in range(80):
            r=random.Random(150+j)
            side=-1 if j<44 else 1
            x,y,h=side*r.uniform(2.9,8.9),r.uniform(-10.5,bamboo_y_max),r.uniform(3.4,6.4)
            bamboo(m,x,y,.05,h,j)
        tree(m,-2.4,D/2-2.0,0,5.0,kind="pear",seed=18,flower_color="flower_white")
        banana(m,2.3,D/2-2.0,0,2.8,4)
        for xx in [-5.2,5.2]:
            hall(m,xx,D/2-1,3.4,2.0,"",1,timber,height=2.25,floor=.3)
        # A narrow independent rill around the steps; its main river connection remains a design supplement.
        for xx in [-2.0,2.0]:
            m.box((xx,-3,-.04),(.35,15,.12),"water","water")
            for s in [-1,1]:m.box((xx+s*.24,-3,.04),(.12,15,.16),"dark_stone","rill_edges")
    elif kind=="yihong":
        tree(m,-5.7,-3.7,0,5.2,kind="crabapple",seed=3,flower_color="flower_pink")
        for j in range(3):banana(m,5+j*.65,-4+j*.5,0,3.0+j*.15,j)
        with m.component("interior-screens"):
            # Bedchamber screens stand outside the bed: a front screen and two
            # side panels leave a one-metre opening along the bedside passage.
            lattice(m,-4.6,main_y-1.70,level+1.4,2.1,2.6,timber,"rich",False)
            for yy in [main_y-1.05,main_y+1.30]:
                with m.transform((-2.70,yy,0),math.pi/2):
                    lattice(m,0,0,level+1.4,1.35,2.6,timber,"rich",False)
            for j in range(3):lattice(m,4,main_y-1.4+j*1.3,level+1.4,2.5,2.6,timber,"rich",False)
        panel_frame(m,3.5,main_y+2.40,level+1.4,1.86,2.46,"wood_dark","mirror","mirror_frame")
        m.box((-2.8,main_y+2.9,level+1.45),(.34,.10,1.90),"wood_dark","wall_curios",bevel=.09)
        for j in range(7):m.beam((-2.91+j*.035,main_y+2.83,level+.6),(-2.91+j*.035,main_y+2.83,level+2.3),.004,mat="bronze",role="qin_strings")
        m.box((-3.55,main_y+2.91,level+1.5),(.075,.08,1.55),"mirror","wall_curios",bevel=.01)
        m.box((-3.55,main_y+2.87,level+.88),(.34,.12,.07),"bronze","wall_curios")
        with m.component("bedchamber"):
            bed(m,-4.5,main_y+.25,level,"jade_silk")
        table(m,0,main_y,level,2.7,1.2)
        chair(m,0,main_y+1.10,level,wood="redwood")
        bookcase(m,0,main_y+2.7,level)
        for j in range(6):
            x=-7.5+j*3
            m.box((x,D/2-2.0,1.7),(.11,.11,3.4),"wood","flower_frame")
        for y in [D/2-2.6,D/2-1.5]:
            m.beam((-8,y,3.2),(8,y,3.2),.12,.12,"wood","flower_frame")
        for j in range(35):flower(m,(-7.5+(j%15),D/2-2.4+(j%3)*.3,3.25),.17,"flower_pink",j)
        for j in range(3):
            x=-W/2+1.35
            yy=-7+j*3
            birdcage(m,x,yy,1.72)
    elif kind=="hengwu":
        scholar_rock(m,0,-4.8,0,4.8,8)
        for j in range(9):
            a=j*2.4
            rock(m,math.cos(a)*3.4,-4.8+math.sin(a)*2.6,0,(1.2,.9,1.4),j)
        for j in range(130):
            r=random.Random(j+212)
            x,y=r.uniform(-7.8,7.8),r.uniform(-9,1)
            if abs(x)<1.3:continue
            m.tube([(x,y,.025),(x+.015,y,.12),(x,y,.18)],.009,"leaf_dark","herb_stems",6)
            for k in range(3):leaf(m,(x,y,.18),r.uniform(.4,.8),.10,r.random()*math.tau,"leaf_dark",.3,role="herbs")
        tabletop=table(m,0,main_y+.5,level,2.4,1.1,False)
        vase(m,-.75,main_y+.55,tabletop,"ceramic",True,chrysanthemums=True)
        for j in range(2):bound_book(m,.50,main_y+.55,tabletop+j*.065,color="wood_light")
        tea_service(m,.10,main_y+.20,tabletop,.60,mat="ceramic",cups=2)
        chair(m,0,main_y+1.55,level)
        bed(m,-4.4,main_y+.4,level,"jade_silk")
    elif kind=="qiushuang":
        tabletop=table(m,0,main_y,level,4.3,1.5,True,top_material="white_stone")
        chair(m,0,main_y+1.20,level)
        with m.component('desk-vase'):
            vase(m,-1.82,main_y+.45,tabletop,"ceramic",True,chrysanthemums=True)
        low_couch(m,4.1,main_y+.7,level,2.1,2.5,mat="wood_dark")
        bookcase(m,-4.1,main_y+2.25,level)
        tray_top=table(m,-4.8,main_y-.7,level,.85,.65,False)
        m.lathe((-4.8,main_y-.7,tray_top+.03),[(.34,0),(.39,.04),(.37,.09),(.34,.09),(.30,.025)],"porcelain","objects",40)
        for j in range(4):
            fx=-5.0+(j%2)*.32
            fy=main_y-.84+(j//2)*.28
            citron(m,fx,fy,tray_top+.175,j)
        for xx in [2.8,4.2]:m.box((xx,main_y-1.4,level+1),(.07,.07,2),"wood_dark","chime_frame")
        m.beam((2.7,main_y-1.4,level+2),(4.3,main_y-1.4,level+2),.08,mat="wood_dark",role="chime_frame")
        for j in [-1,1]:
            fish_chime(m,3.5+j*.21,main_y-1.4,level+1.47,j)
            m.beam((3.5+j*.20,main_y-1.4,level+1.55),(3.5+j*.20,main_y-1.4,level+2),.01,mat="vermilion_silk",role="chime")
        m.box((-main_w/2+.2,main_y,level+2),(.025,2.5,1.4),"paper","painting")
        for zz in [level+1.28,level+2.72]:m.tube([(-main_w/2+.19,main_y-1.34,zz),(-main_w/2+.19,main_y+1.34,zz)],.035,"wood_dark","painting_scrolls",12)
        for j in range(5):
            points=[(-main_w/2+.2132,main_y-1.12+k*.12,level+1.55+.09*j+.19*math.sin(k*.50+j*.9)+.05*math.sin(k*1.9)) for k in range(20)]
            brush_stroke(m,points,.010+j*.0012,normal=(1,0,0),phase=j*.8)
        banana(m,5,-5,0,3.3,4)
        tree(m,-5,-5,0,6,"deciduous",44)
        for j in range(3):stool(m,-1.5+j*1.5,main_y-1.5,level)
    else:
        tabletop=table(m,0,main_y,level,3.0,1.4,False)
        bed(m,3.3,main_y+.3,level,"vermilion_silk" if kind=="nuanxiang" else "jade_silk")
        if kind=="nuanxiang":
            cloth_curtain(m,0,main_y-main_d/2-.20,level+.12,2.75,2.35)
            m.box((-.35,main_y,tabletop+.009),(1.75,1.04,.018),"paper","painting",bevel=.012)
            for j in range(6):
                pts=[(-1.10+i*.08,main_y-.32+.12*j+.065*math.sin(i*.67+j),tabletop+.0187) for i in range(19)]
                brush_stroke(m,pts,.010+j*.0008,"ink" if j%2 else "greenwood",phase=j*.9)
            for j in range(4):
                xx=-.95+j*.38;yy=main_y-.22+(j%2)*.29
                brush_stroke(m,[(xx-.10,yy,tabletop+.0189),(xx,yy+.08,tabletop+.0189),(xx+.13,yy,tabletop+.0189)],.008,phase=j)
                brush_stroke(m,[(xx-.08,yy,tabletop+.0189),(xx-.08,yy+.14,tabletop+.0189),(xx+.10,yy+.14,tabletop+.0189),(xx+.10,yy,tabletop+.0189)],.006,phase=j+.5)
            for j in range(3):
                xx=.78+(j%2)*.30;yy=main_y-.28+j*.20
                m.lathe((xx,yy,tabletop),[(.06,0),(.09,.015),(.09,.045),(.06,.025)],"porcelain","paint_dishes",24)
                m.disk((xx,yy,tabletop+.026),.059,"greenwood" if j%2 else "ink","paint_pigment",20)
            for j in range(3):m.tube([(.65,main_y+.38+j*.07,tabletop+.015),(1.20,main_y+.38+j*.07,tabletop+.025)],.009,"bamboo","painting_brushes",8)
            m.tube([(-1.30,main_y-.50,tabletop+.05),(-1.30,main_y+.50,tabletop+.05)],.045,"paper","painting_scrolls",16)
            chair(m,0,main_y+1.13,level)
            for side in [-1,1]:
                with m.transform((side*(W/2+.25),-D/2-2.7,0),side*math.pi/2):
                    hall(m,0,0,2.5,1.25,"穿云" if side<0 else "",1,"wood",height=2.35,floor=.15,stairs=False,rise=.65)
                    label='west' if side<0 else 'east'
                    m.port('passage-'+label+'-outer',(0,-.95,.15),(0,-1),2.05)
                    m.port('passage-'+label+'-inner',(0,.95,.15),(0,1),2.05)
                    if side<0:
                        with m.transform((0,0,0),math.pi):
                            signboard(m,"度月",0,-.82,2.335,width=2.0,height=.33)
        else:
            with m.transform((0,main_y,4.75)):
                hall(m,0,0,8.3,4.6,"缀锦楼",3,"wood",height=2.6,floor=.20,stairs=False,rise=1.25)
                # A narrow upper gallery clears the lower curved roof.
                m.box((0,0,.10),(9.7,6.2,.20),"wood","gallery")
                m.walk_surface(0,0,9.7,6.2,.20)
                for side in [-1,1]:railing(m,(-4.8,side*3.0),(4.8,side*3.0),.20,"wood",.75)
            # Access stair is a design completion, not a dimension specified by the novel.
            wooden_stair(m,6.8,main_y-7.0,7.8,1.35,.18,4.95)
            m.box((5.65,main_y+.35,4.86),(3.6,1.5,.18),"wood","gallery")
            m.walk_surface(5.65,main_y+.35,3.6,1.5,4.95)
            m.box((0,main_y,level+.93),(.85,.85,.035),"wood_light","chess")
            for j in range(13):
                for axis in [0,1]:
                    if axis==0:m.box((-.39+j*.065,main_y,level+.952),(.006,.78,.005),"ink","chess")
                    else:m.box((0,main_y-.39+j*.065,level+.952),(.78,.006,.005),"ink","chess")
            for j in range(17):m.sphere((-.35+(j*7%12)*.065,main_y-.35+(j*5%12)*.065,level+.98),(.027,.027,.014),"ink" if j%2 else "white_stone","chess",7,4)
        tree(m,-4.7,-5,0,5.2,seed=61,flower_color="flower_white")
        tree(m,4.7,-4.5,0,4.6,seed=39)
    return {"courtyard":[0,-4,2.2],"interior":[0,main_y-1,level+1.6],"look":[0,main_y+1,level+1.5]}

def farm(m,spec):
    W,D=spec["size"]
    m.port("entry",(0,-D/2,.10),(0,-1),3.0)
    for side in [-1,1]:
        m.box((side*W/2,0,.68),(.26,D,1.36),"earthwall","garden_walls",bevel=.06)
        for j in range(int(D/.13)):
            yy=-D/2+j*.13
            m.beam((side*W/2-.27,yy,1.36),(side*W/2+.27,yy,1.38),.055,mat="thatch",role="straw_coping")
        for j in range(15):
            xx=side*(2+j*.70)
            m.cylinder((xx,-D/2,.55),.035,1.1,"bamboo","fence",7)
        for level in [.35,.72]:
            m.beam((side*2,-D/2,level),(side*W/2,-D/2,level),.035,mat="bamboo",role="fence")
    level=hall(m,0,5,14,6.5,"",5,"wood_light","earthwall",2.55,"thatch",floor=.35,rise=1.75)
    table(m,-3,5,level,2.4,1.1,False,wood="wood_light")
    for xx in [-3.8,-2.2]:stool(m,xx,3.9,level,"wood_light")
    low_couch(m,4.4,5.2,level,3.0,1.45)
    low_couch(m,0,7.0,level,2.4,.58)
    # Stone inscription and a restrained village wine banner.
    m.box((-8,-8.6,.93),(2.4,.55,1.85),"stone","inscriptions",bevel=.12)
    m.plaque("稻香村",(-8,-8.9,1.18),.50,"ink")
    m.cylinder((-9,-7,1.8),.065,3.6,"bamboo","banner",9)
    m.beam((-9,-7,3.4),(-6.4,-7,3.4),.07,mat="bamboo",role="banner")
    m.box((-7.7,-7,2.85),(2.4,.025,.9),"paper","banner")
    m.plaque("杏帘在望",(-7.7,-7.04,2.85),.37,"ink")
    for row in range(5):
        yy=-7+row*1.3
        for side in [-1,1]:
            xx=side*5.3
            m.box((xx,yy,.14),(5.2,1.03,.25),"soil","vegetable_beds",bevel=.06)
            for j in range(9):
                for k in range(3):leaf(m,(xx-2.2+j*.53,yy,.29),.36,.12,j+k*2.3,"leaf" if j%2 else "leaf_light",.16,role="vegetables")
    for j in range(9):
        a=j*2.3
        tree(m,math.cos(a)*10.2,5+math.sin(a)*5.8,0,4.1+(j%3)*.4,kind="apricot",seed=j+66,flower_color="flower_pink")
    m.lathe((8.8,1,0),[(.83,0),(.83,.55),(.87,.58),(.87,.67),(.82,.70),(.59,.70),(.56,.65),(.59,.08)],"brick","well",48)
    for row in range(3):
        for j in range(14):
            a=math.tau*(j+row*.5)/14
            m.tube([(8.8+.836*math.cos(a),1+.836*math.sin(a),row*.18+.02),(8.8+.836*math.cos(a),1+.836*math.sin(a),row*.18+.17)],.007,"dark_stone","well_masonry",5)
    m.disk((8.8,1,.10),.56,"water","water")
    m.beam((7.7,1,0),(7.7,1,2.7),.16,mat="wood_light",role="well")
    m.box((7.7,1,2.56),(.34,.26,.19),"wood_dark","well_pivot",bevel=.025)
    m.beam((7.7,.78,2.58),(7.7,1.22,2.58),.07,mat="bronze",role="well_pivot")
    m.beam((6.0,1,2.05),(10.8,1,3.4),.12,mat="wood",role="well")
    m.beam((10.5,1,3.32),(10.5,1,1.0),.018,mat="wood_dark",role="well")
    m.lathe((10.5,1,.45),[(.20,0),(.25,.48),(.21,.48),(.17,.05)],"wood","well_bucket",32)
    for zz,rr in [(.56,.213),(.82,.241)]:
        m.tube([(10.5+rr*math.cos(math.tau*j/32),1+rr*math.sin(math.tau*j/32),zz) for j in range(33)],.014,"bronze","bucket_bands",6)
    m.tube([(10.27,1,.89),(10.29,1,1.10),(10.5,1,1.18),(10.71,1,1.10),(10.73,1,.89)],.018,"wood_dark","bucket_handle",8)
    return {"courtyard":[0,-7,2],"interior":[0,3.0,level+1.6],"look":[0,5.6,level+1.4]}

def temple(m,spec):
    W,D=spec["size"]
    m.port("entry",(0,-D/2,.10),(0,-1),2.0)
    garden_wall(m,0,D/2,W,height=2.55)
    garden_wall(m,-W/2,0,D,math.pi/2,height=2.55)
    garden_wall(m,W/2,0,D,math.pi/2,height=2.55)
    moon_wall(m,0,-D/2,W,height=2.65,radius=1.18)
    # Separate the complete eave details, not only the nominal roof rectangles.
    # The east hall faces into the court; its stairs remain inside the garden wall.
    main_y=4.42
    level=hall(m,-1,main_y,12.2,5.7,"栊翠庵",3,"wood_dark",height=3.1)
    with m.transform((7,-4.72,0),-math.pi/2):
        hall(m,0,0,7.8,4.0,"东禅堂",3,"wood",height=2.65,floor=.45)
        top=table(m,0,0,.45,2.5,1.1,False)
        tea_service(m,0,0,top,1.1,mat="ceramic",cups=3)
        for j in [-1,1]:m.lathe((j,-1,.45),[(.33,0),(.34,.13),(.28,.22)],"thatch","meditation",20)
    altar_top=table(m,0,main_y,level,3.6,1.1,False)
    for x in [-1.1,1.1]:vase(m,x,main_y,altar_top,"bronze",True)
    m.lathe((0,main_y,altar_top+.10),[(.16,0),(.23,.08),(.25,.19),(.21,.29),(.25,.32),(.25,.35),(.20,.35),(.18,.27)],"bronze","censer",40)
    for j in range(3):
        a=math.tau*j/3
        m.tube([(.15*math.cos(a),main_y+.15*math.sin(a),altar_top+.13),(.18*math.cos(a),main_y+.18*math.sin(a),altar_top+.025)],.027,"bronze","censer_feet",10)
    for sx in [-1,1]:m.tube([(sx*.21,main_y,altar_top+.28),(sx*.33,main_y,altar_top+.31),(sx*.34,main_y,altar_top+.41),(sx*.23,main_y,altar_top+.40)],.018,"bronze","censer_handles",10)
    # A western plum grove and an eastern rear-garden pair leave both entrances
    # and the complete roof envelopes clear while retaining a layered garden edge.
    plum_anchors=(
        (-7.9,-7.4),(-5.8,-7.7),(-3.9,-7.2),
        (-8.2,-5.5),(-6.2,-5.7),(-4.1,-5.2),
        (-7.8,-3.9),(-5.8,-3.8),(-3.8,-3.2),
        (-8.3,-2.1),(-6.3,-2.3),(-4.4,-1.9),
        (8.5,4.1),(8.8,8.0),
    )
    for j,(x,y) in enumerate(plum_anchors):
        r=random.Random(800+j)
        # Height is the third seeded draw, independent of the authored planting positions.
        r.random();r.random()
        tree(m,x,y,0,r.uniform(3.5,4.8),kind="plum",seed=100+j,flower_color="flower_red")
    return {"courtyard":[0,-5.5,2.2],"interior":[0,main_y-1.4,level+1.6],"look":[0,main_y+.5,level+1.5]}

def wooden_stair(m,x,y,length,width,start,end):
    count=max(3,math.ceil((end-start)/.18))
    depth=length/count
    for j in range(count):
        yy=y+(j+.5)*depth;zz=start+(end-start)*(j+1)/count
        m.box((x,yy,zz-.055),(width,depth+.035,.11),"wood","stairs",bevel=.012)
        m.walk_surface(x,yy,width,depth+.04,zz)
    for side in [-1,1]:
        xx=x+side*(width/2-.07)
        m.beam((xx,y,start-.10),(xx,y+length,end-.10),.13,.22,"wood_dark","stair_strings")
        m.beam((xx,y,start+.85),(xx,y+length,end+.85),.055,mat="wood",role="stair_rails")
        for j in range(0,count+1,3):
            t=j/count;zz=start+(end-start)*t
            m.beam((xx,y+length*t,zz),(xx,y+length*t,zz+.85),.045,mat="wood",role="stair_rails")

def tower(m,spec):
    w,d=spec["size"]
    grand=spec["kind"]=="tower"
    uw,ud=w*.67,d*.68
    level=hall(m,0,0,w,d,spec["name"],5 if grand else 3,"redwood",height=3.8 if grand else 3.2,ornate=True,floor=.9,rise=2.3 if grand else 1.65,roof_opening=(uw,ud))
    hall_entry(m,0,0,d,.9)
    upper_z=6.5 if grand else 5.65
    with m.transform((0,0,upper_z)):
        hall(m,0,0,uw,ud,"",3,"redwood",height=3.1,ornate=True,floor=.25,stairs=False,rise=2.05 if grand else 1.45)
        for side in [-1,1]:
            railing(m,(-uw/2-1,side*(ud/2+1)),(uw/2+1,side*(ud/2+1)),.20,"white_stone",.83,True)
        for side in [-1,1]:
            for begin,end in [(-ud/2-1,-1.30),(1.30,ud/2+1)]:
                railing(m,(side*(uw/2+1),begin),(side*(uw/2+1),end),.20,"white_stone",.83,True)
        m.box((0,0,.06),(uw+2.3,ud+2.3,.20),"wood","gallery")
        m.walk_surface(0,0,uw+2.3,ud+2.3,.16)
    # Side access keeps the front ceremonial axis open and the upper storey usable.
    sx=w/2+1.85
    wooden_stair(m,sx,-d-1.0,d+1.0,1.4,.15,upper_z+.16)
    m.box(((sx+uw/2)/2,0,upper_z+.06),(sx-uw/2+1.5,1.6,.20),"wood","gallery")
    m.walk_surface((sx+uw/2)/2,0,sx-uw/2+1.5,1.6,upper_z+.16)
    for side in [-1,1]:
        tabletop=table(m,side*w*.25,.5,level,2.7,1.3,False)
        vase(m,side*w*.25-.70,.5,tabletop,"ceramic",True)
        tea_service(m,side*w*.25+.30,.5,tabletop,.85,cups=2)
        chair(m,side*w*.25,1.65,level,wood="redwood")
    return {"courtyard":[0,-d/2-5,2.8],"interior":[0,-d/2+1.5,level+1.6],"look":[0,1,2.3]}

def ceremony(m,spec):
    w,d=spec["size"]
    level=hall(m,0,0,w,d,"顾恩思义",5,"redwood",height=4.3,ornate=True,floor=1.05,rise=2.7)
    front=-d/2-8.5;back=-d/2-2.2
    m.box((0,(front+back)/2,.02),(10.6,back-front,.20),"paving","forecourt",bevel=.035)
    m.walk_surface(0,(front+back)/2,10.6,back-front,.12)
    m.ground_pad(0,(front+back)/2,11,back-front+1,-.1,5)
    m.port("entry",(5.3,front+4.4,.12),(1,0),2.4)
    m.port("west",(-5.3,(front+back)/2,.12),(-1,0),2.5)
    for side in [-1,1]:
        railing(m,(side*2.0,-d/2-.40),(side*(w/2+.30),-d/2-.40),level,"white_stone",.95,True)
    # Carved stone memorial arch, independently named and kept apart from the hall.
    yy=-d/2-6.5
    for xx in [-5,-2.3,2.3,5]:
        column(m,xx,yy,0,4.9 if abs(xx)<3 else 4.1,"white_stone",.23)
        m.box((xx,yy,.12),(.85,1.2,.24),"stone","paifang",bevel=.08)
    m.box((0,yy,4.15),(10.8,.48,.46),"white_stone","paifang",bevel=.06)
    m.box((0,yy,5.0),(5.4,.60,.95),"white_stone","paifang",bevel=.07)
    for zz in [4.59,5.41]:m.box((0,yy-.33,zz),(5.18,.065,.055),"stone","paifang_frames",bevel=.015)
    for xx in [-2.60,2.60]:m.box((xx,yy-.33,5),(.055,.065,.83),"stone","paifang_frames",bevel=.015)
    m.plaque("省亲别墅",(0,yy-.38,4.98),.62,"ink")
    for xx,ww,zz in [(0,5.70,5.55),(-3.9,2.55,4.91),(3.9,2.55,4.91)]:
        m.box((xx,yy,zz),(ww,.76,.15),"white_stone","paifang_cornice",bevel=.04)
        m.box((xx,yy,zz+.11),(ww-.16,.64,.08),"stone","paifang_cornice",bevel=.028)
    for xx in [-3.9,3.9]:m.box((xx,yy,4.6),(2.3,.54,.45),"white_stone","paifang",bevel=.06)
    for i in range(15):
        x=-4.9+i*.7
        for direction in [-1,1]:
            points=[]
            for j in range(22):
                t=j/21;ang=t*math.tau*1.20;r=.13*(1-t*.65)
                points.append((x+direction*(.10+r*math.cos(ang)),yy-.265,4.15+r*math.sin(ang)))
            m.tube(points,.018,"stone","paifang_carving",6)
    for side in [-1,1]:
        tree(m,side*14,-5,0,7.2,"pine",33+side)
        scholar_rock(m,side*14,3,0,3.5,side+7)
    return {"courtyard":[7.5,front+4.4,1.77],"interior":[0,-d/2+2,level+1.65],"look":[0,0,2.7]}

def landmark(m,spec):
    kind=spec["kind"]
    if kind in ["xiaoxiang","yihong","hengwu","qiushuang","nuanxiang","yingchun"]:return courtyard(m,spec)
    if kind=="daoxiang":return farm(m,spec)
    if kind=="temple":return temple(m,spec)
    if kind in ["tower","side_tower"]:return tower(m,spec)
    if kind=="ceremony":return ceremony(m,spec)
    if kind=="gate":
        level=hall(m,0,0,19,5.8,"大观园",5,"wood_light",height=3.8,floor=.55,ornate=False,rise=2.2)
        hall_entry(m,0,0,5.8,.55)
        reverse_steps(m,0,5.8/2,.55)
        for side in [-1,1]:
            gate_drum(m,side*10.3,-3.3)
            garden_wall(m,side*13.5,0,7.0,height=3.1)
        return {"courtyard":[0,-10,2.1],"interior":[0,-1,2.0],"look":[0,5,2.1]}
    if kind=="rockery":
        m.port("entry",(-10,-6.5,.06),(0,-1),2.2)
        m.port("rear",(-10,6.5,.06),(0,1),2.2)
        for j,(x,y,s) in enumerate([(3,0,3.3),(1,3,4.1),(-3,4,2.7),(6,4,2.8),(-6,1,2.2)]):
            rock(m,x,y,0,(s*.7,s*.6,s),j+40)
            scholar_rock(m,x,y,s*.3,s*.9,j+60)
        rock(m,2,-1.60,.85,(2.25,.70,1.30),231)
        m.box((2,-2.36,2.1),(4.1,.35,1.1),"white_stone","inscriptions",bevel=.12)
        m.plaque("曲径通幽处",(2,-2.56,2.1),.54,"ink")
        for j,(xx,yy,hh) in enumerate([(-6,1,2.2),(-3,4,2.7),(1,3,4.1),(3,0,3.3),(6,4,2.8)]):
            pts=[(xx-.35+math.sin(k*.8+j)*.18,yy+.15+k*.055,.10+k*hh*.085) for k in range(11)]
            m.tube(pts,.018,"bark","climbing_vines",7,taper=.45)
            for k,p in enumerate(pts[2::2]):
                a=j*1.9+k*2.2
                leaf(m,p,.48,.14,a,"leaf_dark",.15,role="climbers")
        return {"courtyard":[-7,-7,2.2],"interior":[-4,0,1.8],"look":[0,2,2.6]}
    if kind=="grotto":
        rock_arch(m,[(-5,0,-.1),(-4,0,3),(-1,0,4.3),(2.5,0,3.8),(5,0,0)],radius=1.1,seed=22,role='grotto')
        for j in range(9):rock(m,-5+j*1.25,1.1,-.15,(1.2,.8,1.7+(j%3)*.5),j+22)
        bridge(m,0,-3,12,2.2,.55,0,"redwood")
        m.port("west",(-6,-3,.555),(-1,0),2.2)
        m.port("east",(6,-3,.555),(1,0),2.2)
        for j in range(6):tree(m,-7+j*2.7,3,0,4.5,seed=j+3,flower_color="flower_white")
        return {"courtyard":[0,-9,2.1],"interior":[0,-2.5,1.9],"look":[0,0,2]}
    if kind in ["bridge_pavilion","water_pavilion","small_water_pavilion"]:
        small=kind=="small_water_pavilion"
        width=6 if small else (9.5 if kind=="water_pavilion" else 7.2)
        depth=5.2 if small else (7.3 if kind=="water_pavilion" else 5.5)
        access=("west","east","north") if kind=="water_pavilion" else ("west","east")
        level=pavilion(m,0,0,width,depth,spec["name"],paper=small,access=access)
        return {"courtyard":[-width/2-.325-1.1,0,level+1.65],"interior":[-width/2+1,-.9,level+1.65],"look":[0,0,level+1.1]}
    if kind=="sluice":
        bridge(m,0,0,13,3,.8,0,"white_stone",True)
        m.port("west",(-6.5,0,.805),(-1,0),3.0)
        m.port("east",(6.5,0,.805),(1,0),3.0)
        for side in [-1,1]:
            m.box((side*3.3,0,.30),(1.4,5,1.9),"dark_stone","sluice_piers",bevel=.04)
        for j in range(12):m.box((-2.34+j*.425,1.8,.10),(.412,.25,1.5),"wood_dark","sluice_gate_planks",bevel=.014)
        for zz in [-.37,.56]:
            m.box((0,1.65,zz),(4.98,.045,.085),"bronze","sluice_straps",bevel=.012)
            for j in range(12):m.sphere((-2.34+j*.425,1.617,zz),(.022,.012,.022),"bronze","sluice_fasteners",10,6)
        m.beam((-3,1.8,2.7),(3,1.8,2.7),.32,mat="wood",role="sluice_gear")
        for x in [-2.4,2.4]:m.beam((x,1.8,1.4),(x,1.8,3.0),.16,mat="wood",role="sluice_gear")
        # Rope, winding drum, bearings and hand wheel explain how the timber gate can move.
        sides=32;verts=[(xx,1.8+.22*math.cos(math.tau*j/sides),2.7+.22*math.sin(math.tau*j/sides)) for xx in [-.72,.72] for j in range(sides)]
        m.add(verts,[(j,(j+1)%sides,(j+1)%sides+sides,j+sides) for j in range(sides)],"wood_dark","sluice_winch",True)
        for j in range(18):
            xx=-.62+j*.073
            m.tube([(xx,1.8+.23*math.cos(math.tau*k/32),2.7+.23*math.sin(math.tau*k/32)) for k in range(33)],.017,"thatch","sluice_rope",6)
        for x in [-.55,.55]:m.tube([(x,1.57,.76),(x,1.57,2.70)],.018,"thatch","sluice_rope",8)
        for xx in [-2.40,2.40]:m.box((xx,1.8,2.70),(.24,.48,.48),"wood_dark","sluice_bearings",bevel=.06)
        m.tube([(3.12,1.8+.46*math.cos(math.tau*j/48),2.7+.46*math.sin(math.tau*j/48)) for j in range(49)],.045,"wood_dark","sluice_wheel",10)
        for j in range(6):
            a=math.tau*j/6
            m.beam((3.12,1.8,2.7),(3.12,1.8+.44*math.cos(a),2.7+.44*math.sin(a)),.045,mat="wood",role="sluice_wheel")
        m.beam((3.08,2.16,2.97),(3.39,2.16,2.97),.065,mat="wood",role="sluice_crank")
        return {"courtyard":[0,-8,2.1],"interior":[0,0,2.3],"look":[0,3,.5]}
    if kind=="hill_hall":
        level=hall(m,0,0,15,9,"凸碧山庄",5,"wood",height=3.3,open_hall=True,floor=.65,rise=1.8)
        m.box((0,-8,.20),(19,6,.4),"stone","viewing_platform",bevel=.06)
        m.walk_surface(0,-8,19,6,.4)
        for a,b in [(-9.5,-1.4),(1.4,9.5)]:railing(m,(a,-11),(b,-11),.4,"white_stone",.85)
        for j in range(3):
            h=(j+1)*.4/3;yy=-11.35-(2-j)*.34
            m.box((0,yy,h/2),(2.7,.38,h),"stone","stairs",bevel=.025)
            m.walk_surface(0,yy,2.7,.4,h)
        m.port("entry",(0,-12.45,.06),(0,-1),2.7)
        m.ground_pad(0,-2.5,22,21,-.1,6)
        for side in [-1,1]:railing(m,(side*9.5,-11),(side*9.5,-5),.4,"white_stone",.85)
        for x in [-4,0,4]:
            tabletop=table(m,x,-1,level,1.8,1.5,False)
            tea_service(m,x,-1,tabletop,.85,cups=3)
            for yy in [-2.4,.4]:stool(m,x,yy,level)
        return {"courtyard":[0,-9,2.1],"interior":[0,-2,level+1.6],"look":[0,1,2]}
    if kind=="waterside":
        level=hall(m,0,1.0,11,5,"",3,"wood",height=2.45,floor=.45,rise=1.25,roof_clip=RoofClip('y',-1.325,'positive'))
        corridor(m,0,-3.3,12,2.7,style="juanpeng",roof_clip=RoofClip('y',1.575,'negative'))
        roof_join(m,dict(cx=0,cy=1,w=13,d=7,eave=3.10,rise=1.25,style='tile'),
                  dict(cx=0,cy=-3.3,w=13,d=3.55,eave=3.18,rise=.85,style='juanpeng'),seam=-1.525,width=.40)
        signboard(m,"凹晶溪馆",0,-4.91,2.72,width=2.80,height=.59)
        for sx in [-1,1]:m.box((sx*.85,-4.70,2.90),(.10,.32,.24),"wood","plaque_mounts",bevel=.012)
        m.port("west",(-6,-3.3,.5),(-1,0),2.05,canopy=.5)
        m.port("east",(6,-3.3,.5),(1,0),2.05,canopy=.5)
        for x in [-2.0,2.0]:bamboo_seat(m,x,-3.2,.5)
        railing(m,(-6,-4.9),(6,-4.9),.45,"bamboo",.82)
        return {"courtyard":[0,-3.4,2.1],"interior":[0,0,2.0],"look":[0,-15,1.0]}
    if kind=="reed_hut":
        # The low thatched roof carries deep purlins and exposed rafters; hang the entire board beyond their ends.
        level=hall(m,0,0,13,5.4,"芦雪广",3,"wood_light","earthwall",2.3,"thatch",floor=.35,rise=1.5,sign_projection=1.20)
        m.box((0,-5.2,.005),(4.8,4.5,.11),'paving','shore_apron',bevel=.025)
        m.walk_surface(0,-5.2,4.8,4.5,.06)
        m.ground_pad(0,-5.2,5.6,4.7,-.1,2)
        m.port('entry',(0,-7.45,.06),(0,-1),2.7)
        m.port('west',(-2.4,-5.2,.06),(-1,0),2.2)
        m.box((-3,1,level+.3),(3.7,2.1,.6),"brick","heated_bed",bevel=.04)
        m.box((-3,1,level+.62),(3.6,2.0,.08),"thatch","heated_bed_mat",bevel=.03)
        m.box((-3.6,1.65,level+.73),(1.05,.42,.15),"paper","heated_bed_pillow",bevel=.07)
        for row in range(3):
            zz=level+.08+row*.18
            m.box((-3,-.059,zz),(3.57,.008,.012),"dark_stone","heated_bed_joints")
            for j in range(8):m.box((-4.66+j*.45+(row%2)*.20,-.059,zz+.08),(.012,.008,.15),"dark_stone","heated_bed_joints")
        panel_frame(m,-3,-.075,level+.24,.38,.30,"wood_dark","ink","heated_bed_firebox")
        tabletop=table(m,2,0,level,2.8,1.2)
        stool(m,2,-1.08,level,"wood_light")
        # A small supported brazier, with separate rim, grate and charcoal, serves the poetry scene.
        m.lathe((.2,1.2,level+.16),[(.24,0),(.33,.10),(.35,.27),(.37,.29),(.37,.33),(.31,.33),(.29,.12)],"bronze","brazier",40)
        for j in range(3):
            a=math.tau*j/3
            m.beam((.2+.22*math.cos(a),1.2+.22*math.sin(a),level+.22),(.2+.27*math.cos(a),1.2+.27*math.sin(a),level+.02),.055,mat="bronze",role="brazier_feet")
        for j in range(5):m.box((.2+(j-2)*.10,1.2,level+.39),(.028,.52,.028),"wood_dark","brazier_grate",bevel=.01)
        for j in range(5):m.box((.03+(j%3)*.13,1.08+(j//3)*.20,level+.41),(.10,.14,.07),"ink","brazier_coals",rotation=j*.4,bevel=.025)
        for j in range(7):reeds(m,-7+j*2.2,-4.1,0,15,j+18)
        return {"courtyard":[0,-7,2],"interior":[0,-.7,level+1.5],"look":[0,1.4,1.6]}
    raise ValueError("Unknown landmark kind: "+kind)
