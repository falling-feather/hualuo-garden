"""Garden planting clearances; pure geometry shared by native layout checks."""
import math
import random

BOUNDARY=[(-83,-82),(-13,-82),(13,-82),(82,-82),(90,-22),(79,70),(40,88),(-55,85),(-86,44),(-83,-82)]

def inside(x,y,points=BOUNDARY):
    result=False
    for i,a in enumerate(points):
        b=points[(i+1)%len(points)]
        if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:result=not result
    return result

def segment_distance(x,y,a,b):
    dx,dy=b[0]-a[0],b[1]-a[1]
    t=max(0,min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy or 1)))
    return math.hypot(x-a[0]-dx*t,y-a[1]-dy*t)

def clear_ground(x,y,sites,routes,water,margin=.65,enclosed=True):
    if water<.45 or (enclosed and not inside(x,y)):return False
    for site in sites:
        px,py,_=site['position'];theta=site['rotation'];c,s=math.cos(theta),math.sin(theta)
        lx,ly=(x-px)*c+(y-py)*s,-(x-px)*s+(y-py)*c
        if abs(lx)<site['size'][0]/2+margin and abs(ly)<site['size'][1]/2+margin:return False
    for route in routes:
        if any(segment_distance(x,y,a,b)<route['width']/2+margin for a,b in zip(route['points'],route['points'][1:])):return False
    return True

def boundary_trees(seed):
    rng=random.Random(seed+9827);points=[]
    for a,b in zip(BOUNDARY,BOUNDARY[1:]):
        dx,dy=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dy);steps=math.ceil(length/5)
        for j in range(steps):
            for row in range(2):
                t=(j+.25+.37*row+rng.uniform(-.13,.13))/steps
                offset=3.4+row*4.0+rng.uniform(-.8,.8)
                x=a[0]+dx*t+dy/length*offset;y=a[1]+dy*t-dx/length*offset
                if abs(x)>94 or abs(y)>94 or (abs(x)<18 and y<-74):continue
                points.append((x,y,rng.uniform(5.0,8.8),'pine' if (j+row)%3==0 else 'deciduous'))
    return points
