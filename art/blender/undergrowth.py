"""Small, grounded details shared by the garden and the near-view specimen."""
import math
from plants import woodland_leaf


def sward_density(x,y):
    # Overlapping scales make patches and gaps; never a uniform jittered lawn.
    return max(.05,min(.92,.46+.27*math.sin(x*.48+math.sin(y*.31))*math.cos(y*.53)
                       +.15*math.sin(x*1.31+y*.77)))


def grass_tuft(m,x,y,height_at,rng,density=.5):
    vertices=[];faces=[];uvs=[];colors=[]
    for _ in range(rng.randint(24,38)):
        angle=rng.random()*math.tau;length=rng.uniform(.055,.18)*(.65+density*.6)
        width=rng.uniform(.0015,.0038);lean=length*rng.uniform(.35,.85)
        bx,by=x+rng.uniform(-.22,.22),y+rng.uniform(-.22,.22);z=height_at(bx,by)-.009
        dx,dy=math.cos(angle),math.sin(angle);sx,sy=-dy,dx;base=len(vertices)
        shade=rng.uniform(.70,1.0)
        for t in [0,.38,.73]:
            bend=lean*t*t
            for sign in [-1,1]:
                w=width*(1-t*.65)*sign
                vertices.append((bx+dx*bend+sx*w,by+dy*bend+sy*w,z+length*(t-.16*t*t)))
                uvs.append(((sign+1)/2,t));colors.append((shade,shade,shade,1))
        vertices.append((bx+dx*lean,by+dy*lean,z+length*.84));uvs.append((.5,1));colors.append((shade,shade,shade,1))
        faces.extend([(base,base+1,base+3,base+2),(base+2,base+3,base+5,base+4),(base+4,base+5,base+6)])
    m.add(vertices,faces,'grass_blade','grass',True,uvs=uvs,colors=colors)


def tree_litter(m,x,y,height,height_at,rng,allowed=lambda x,y:True):
    """Small curled fallen leaves, each seated on the same walkable ground."""
    for _ in range(rng.randint(65,110)):
        angle=rng.random()*math.tau;radius=(rng.random()**.62)*height*.24
        px,py=x+math.cos(angle)*radius,y+math.sin(angle)*radius
        if not allowed(px,py):continue
        direction=rng.random()*math.tau;length=rng.uniform(.055,.12)
        dx,dy=math.cos(direction),math.sin(direction)
        start=height_at(px,py);end=height_at(px+dx*length,py+dy*length)
        woodland_leaf(m,(px,py,start+.014),(dx,dy,(end-start)/length),length,length*.32,
                      'fallen_leaf','leaf_litter',rng.uniform(-.15,.15))
