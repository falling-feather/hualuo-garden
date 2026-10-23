"""Shared, Blender-independent centerline math for surfaces, rails and navigation."""
import math

def lerp(a,b,t):return tuple(x+(y-x)*t for x,y in zip(a,b))
def unit(a):
    length=math.hypot(*a)
    if length<1e-8:raise ValueError('连接路径包含零长度方向')
    return (a[0]/length,a[1]/length)
def arc_lengths(points):
    values=[0.0]
    for a,b in zip(points,points[1:]):values.append(values[-1]+math.dist(a[:2],b[:2]))
    return values
def station(points,lengths,distance):
    if distance<=0:return tuple(points[0])
    if distance>=lengths[-1]:return tuple(points[-1])
    for i,end in enumerate(lengths[1:]):
        if end>=distance:return lerp(points[i],points[i+1],(distance-lengths[i])/(end-lengths[i]))
    raise ValueError('路径站点超出范围')
def resample(points,spacing=.28):
    if len(points)<2:raise ValueError('路径至少需要两个端点')
    lengths=arc_lengths(points)
    if any(b-a<1e-7 for a,b in zip(lengths,lengths[1:])):raise ValueError('路径存在重复控制点')
    count=max(1,math.ceil(lengths[-1]/spacing))
    return [station(points,lengths,lengths[-1]*j/count) for j in range(count+1)]
def slice_path(points,start,end):
    lengths=arc_lengths(points)
    if start>=end:raise ValueError('路径修剪后没有有效长度')
    return [station(points,lengths,start)]+[tuple(p) for p,s in zip(points,lengths) if start+1e-7<s<end-1e-7]+[station(points,lengths,end)]
def rounded_path(points,radius=1.4):
    result=[tuple(points[0])]
    for previous,point,nxt in zip(points,points[1:],points[2:]):
        before=math.dist(previous[:2],point[:2]);after=math.dist(point[:2],nxt[:2])
        distance=min(radius,before*.45,after*.45)
        a=lerp(point,previous,distance/before);b=lerp(point,nxt,distance/after)
        if math.dist(result[-1],a)>1e-6:result.append(a)
        for j in range(1,9):
            t=j/8
            result.append(lerp(lerp(a,point,t),lerp(point,b,t),t))
    if math.dist(result[-1],points[-1])>1e-6:result.append(tuple(points[-1]))
    return result
def offset_edges(points,width):
    directions=[unit((b[0]-a[0],b[1]-a[1])) for a,b in zip(points,points[1:])]
    left=[];right=[];half=width/2
    for i,p in enumerate(points):
        a=directions[max(0,i-1)];b=directions[min(i,len(directions)-1)]
        nx,ny=unit((-a[1]-b[1],a[0]+b[0]))
        dot=nx*(-b[1])+ny*b[0]
        scale=min(half/max(.1,dot),half*1.8)
        left.append((p[0]+nx*scale,p[1]+ny*scale,p[2]))
        right.append((p[0]-nx*scale,p[1]-ny*scale,p[2]))
    return left,right
def transform_port(port,spec):
    c,s=math.cos(spec['rotation']),math.sin(spec['rotation'])
    x,y,z=port['position'];dx,dy=port['direction'];cx,cy,cz=spec['position']
    return {**port,'position':[cx+x*c-y*s,cy+x*s+y*c,cz+z],'direction':[dx*c-dy*s,dx*s+dy*c]}
def convex_hull(points):
    pts=sorted(set(tuple(p) for p in points))
    def cross(o,a,b):return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
    lower=[];upper=[]
    for p in pts:
        while len(lower)>1 and cross(lower[-2],lower[-1],p)<=0:lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper)>1 and cross(upper[-2],upper[-1],p)<=0:upper.pop()
        upper.append(p)
    return lower[:-1]+upper[:-1]
