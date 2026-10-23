"""Plant geometry regressions; run with Blender, without loading or rendering assets.

blender --background --factory-startup --python-exit-code 1 --python tests/test_plant_geometry.py
These checks cover mesh validity and the reported pole/crown defects, not visual acceptance.
"""
import math
import statistics
import sys
import unittest
from collections import Counter
from pathlib import Path

from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"art"/"blender"))
from geometry import MeshBuilder
import plants


def make(name, build):
    builder=MeshBuilder(name)
    build(builder)
    return builder


def triangle_area(vertices, face):
    origin=Vector(vertices[face[0]])
    return sum((Vector(vertices[face[j]])-origin).cross(Vector(vertices[face[j+1]])-origin).length
               for j in range(1,len(face)-1))*.5


def crown_ratio(kind,seed):
    m=make(kind,lambda m:plants.tree(m,0,0,0,6,kind,seed))
    vertices=[p for (_,role,_),b in m.buckets.items() if role=="tree_leaves" for p in b["v"]]
    heights=sorted(p[2] for p in vertices)
    depth=heights[int(len(heights)*.9)]-heights[int(len(heights)*.1)]
    width=max(max(p[i] for p in vertices)-min(p[i] for p in vertices) for i in [0,1])
    return depth/width


class PlantGeometryTests(unittest.TestCase):
    def test_grove_crown_is_open_small_leaves_not_closed_masses(self):
        m=make('grove',lambda m:plants.tree(m,0,0,0,6,'grove',8))
        buckets=[b for (_,role,_),b in m.buckets.items() if role=='grove_foliage']
        self.assertTrue(buckets,'Grove leaves need their own whole-leaf LOD role')
        count=0
        for b in buckets:
            adjacency={i:set() for i in range(len(b['v']))};edges=Counter()
            for face in b['f']:
                for a,c in zip(face,face[1:]+face[:1]):
                    adjacency[a].add(c);adjacency[c].add(a);edges[tuple(sorted((a,c)))]+=1
            pending=set(adjacency)
            while pending:
                first=pending.pop();seen={first};stack=[first]
                while stack:
                    for i in adjacency[stack.pop()]:
                        if i not in seen:seen.add(i);pending.discard(i);stack.append(i)
                points=[Vector(b['v'][i]) for i in seen]
                diameter=max((a-c).length for a in points for c in points)
                self.assertGreater(diameter,.065)
                self.assertLess(diameter,.25,'A near-view leaf cannot be a giant polygon or crown shell')
                self.assertTrue(any(edges[tuple(sorted((i,j)))]==1 for i in seen for j in adjacency[i]),'Each leaf must be an open lamina')
                count+=1
        self.assertGreater(count,2000)
        self.assertFalse(any(role=='tree_leaves' for _,role,_ in m.buckets),'Do not retain the old solid mass alongside the new leaves')

    def test_bark_uv_has_a_seam_and_metric_scale(self):
        m=make('limb',lambda m:plants._limb(m,[(0,0,0),(0,0,1),(0,0,2)],.2,8,1,12))
        b=next(iter(m.buckets.values()))
        self.assertAlmostEqual(max(uv[0] for uv in b['uv'])-min(uv[0] for uv in b['uv']),math.tau*.2,places=5)
        self.assertAlmostEqual(max(uv[1] for uv in b['uv'])-min(uv[1] for uv in b['uv']),2,places=5)
        for face in b['f']:
            if len(face)!=4:continue
            self.assertLess(max(b['uv'][i][0] for i in face)-min(b['uv'][i][0] for i in face),.12,'Wrapped UVs must not smear an entire texture into one seam face')

    def test_woodland_lamina_faces_up_with_no_raised_geometry_detached_from_leaf(self):
        m=make('lamina',lambda m:plants.woodland_leaf(m,(0,0,0),(1,0,.15),.15,.04))
        self.assertEqual(len(m.buckets),1)
        b=next(iter(m.buckets.values()))
        for a,c,d in b['f']:
            normal=(Vector(b['v'][c])-Vector(b['v'][a])).cross(Vector(b['v'][d])-Vector(b['v'][a]))
            self.assertGreater(normal.z,0)

    def test_public_generators_make_valid_bounded_meshes(self):
        cases=[(kind,lambda m,kind=kind:plants.tree(m,0,0,0,6,kind,8,"flower_pink"))
               for kind in ["deciduous","grove","pear","crabapple","apricot","plum","willow","pine"]]
        cases.extend([
            ("bamboo",lambda m:plants.bamboo(m,0,0,0,5,8)),
            ("banana",lambda m:plants.banana(m,0,0,0,3,8)),
            ("reeds",lambda m:plants.reeds(m,0,0,0,12,8)),
            ("lotus_leaf",lambda m:plants.lotus_leaf(m,0,0,0,.35,8)),
            ("rock",lambda m:plants.rock(m,0,0,0,(1.2,.9,1.4),8)),
        ])
        for name,build in cases:
            with self.subTest(name=name):
                m=make(name,build)
                triangles=0
                for b in m.buckets.values():
                    self.assertEqual(len(b["uv"]),len(b["v"]))
                    self.assertTrue(all(uv is None or (len(uv)==2 and all(math.isfinite(n) for n in uv))
                                        for uv in b["uv"]))
                    self.assertTrue(all(math.isfinite(n) for p in b["v"] for n in p))
                    for face in b["f"]:
                        self.assertTrue(all(0<=i<len(b["v"]) for i in face))
                        self.assertGreater(triangle_area(b["v"],face),5e-13)
                        triangles+=len(face)-2
                self.assertLess(triangles,60000,"A single plant must stay within the near-view geometry budget")

    def test_rock_pole_has_no_inverted_height_or_uv_jump(self):
        for seed in [0,1,8,13,22,63]:
            with self.subTest(seed=seed):
                m=make("rock",lambda m:plants.rock(m,0,0,0,(1,1,1),seed))
                b=next(iter(m.buckets.values()))
                # The upper pole's actual one-ring neighbourhood is used here,
                # so this catches the star-shaped dip without a fixed ring count.
                neighbours=set()
                for face in b["f"]:
                    if 0 in face:neighbours.update(i for i in face if i!=0)
                self.assertGreaterEqual(b["v"][0][2],max(b["v"][i][2] for i in neighbours))
                self.assertLess(max(abs(b["uv"][i][1]-b["uv"][0][1]) for i in neighbours),.15)

    def test_rock_has_consistent_outward_winding_and_positive_volume(self):
        for seed in [0,1,8,22]:
            with self.subTest(seed=seed):
                m=make("rock",lambda m:plants.rock(m,0,0,0,(1.2,.9,1.4),seed))
                b=next(iter(m.buckets.values()));vertices=b["v"]
                edges=Counter();winding=Counter();volume=0
                for face in b["f"]:
                    for a,c in zip(face,face[1:]+face[:1]):
                        edge=tuple(sorted((a,c)));edges[edge]+=1;winding[edge]+=1 if a<c else -1
                    for j in range(1,len(face)-1):
                        volume+=Vector(vertices[face[0]]).dot(Vector(vertices[face[j]]).cross(Vector(vertices[face[j+1]])))/6
                self.assertTrue(all(n==2 for n in edges.values()))
                self.assertTrue(all(n==0 for n in winding.values()),"Cap and wall faces must agree along their shared ring")
                self.assertGreater(volume,0,"A closed surface wound entirely inward is still invalid")

    def test_lotus_lamina_faces_up_and_shared_edges_agree(self):
        m=make("lotus",lambda m:plants.lotus_leaf(m,0,0,0,.35,8))
        b=m.buckets[("","lotus","leaf")];edges=Counter();winding=Counter()
        for face in b["f"]:
            for a,c in zip(face,face[1:]+face[:1]):
                edge=tuple(sorted((a,c)));edges[edge]+=1;winding[edge]+=1 if a<c else -1
        self.assertTrue(all(n in [1,2] for n in edges.values()))
        self.assertTrue(all(winding[edge]==0 for edge,count in edges.items() if count==2))
        for bucket in m.buckets.values():
            for face in bucket["f"]:
                origin=Vector(bucket["v"][face[0]])
                normal=sum(((Vector(bucket["v"][face[j]])-origin).cross(Vector(bucket["v"][face[j+1]])-origin)
                            for j in range(1,len(face)-1)),Vector())
                self.assertGreater(normal.z,0)

    def test_chrysanthemum_is_a_bounded_layered_cut_flower(self):
        m=make("chrysanthemum",lambda m:plants.chrysanthemum(m,(0,0,0),.13,"flower_white",8))
        self.assertEqual({role for _,role,_ in m.buckets},{"cut_flower"})
        vertices=[p for b in m.buckets.values() for p in b["v"]]
        self.assertTrue(all(math.isfinite(n) for p in vertices for n in p))
        self.assertLess(max(math.hypot(p[0],p[1]) for p in vertices),.145)
        self.assertGreater(max(p[2] for p in vertices)-min(p[2] for p in vertices),.05)
        triangles=0
        for b in m.buckets.values():
            self.assertEqual(len(b["uv"]),len(b["v"]))
            self.assertTrue(all(uv is None or all(math.isfinite(n) for n in uv) for uv in b["uv"]))
            for face in b["f"]:
                self.assertGreater(triangle_area(b["v"],face),5e-13)
                triangles+=len(face)-2
        self.assertLess(triangles,2000)

    def test_tree_crowns_have_depth_while_crabapple_keeps_umbrella(self):
        # This numerical guard rejects the previously near-planar repeat crown;
        # it is not a substitute for judging a rendered tree.
        ratios={kind:statistics.median(crown_ratio(kind,seed) for seed in [3,8,18])
                for kind in ["deciduous","pear","crabapple"]}
        self.assertGreater(ratios["deciduous"],.32)
        self.assertGreater(ratios["pear"],.38)
        self.assertLess(ratios["crabapple"],.32)
        self.assertLess(ratios["crabapple"],ratios["deciduous"])

    def test_leaf_top_faces_and_seasonal_veins(self):
        m=make("leaf",lambda m:plants.leaf(m,(0,0,0),.4,.12,0,role="tree_leaves"))
        self.assertEqual({role for _,role,_ in m.buckets},{"tree_leaves"})
        for b in m.buckets.values():
            for face in b["f"]:
                origin=Vector(b["v"][face[0]])
                normal=sum(((Vector(b["v"][face[j]])-origin).cross(Vector(b["v"][face[j+1]])-origin)
                            for j in range(1,len(face)-1)),Vector())
                self.assertGreater(normal.z,0)

    def test_stone_materials_are_separate_from_architectural_white_stone(self):
        ordinary=make("rock",lambda m:plants.rock(m,0,0,0,seed=8))
        self.assertEqual({mat for _,_,mat in ordinary.buckets},{"rock_stone"})
        stone=make("scholar",lambda m:plants.scholar_rock(m,0,0,0,4,8))
        self.assertEqual({mat for _,_,mat in stone.buckets},{"scholar_stone"})

    def test_scholar_stone_remains_one_closed_surface_with_two_openings(self):
        for seed in [0,8,13,63]:
            with self.subTest(seed=seed):
                vertices,faces=plants._scholar_surface(seed)
                edges=Counter();winding=Counter();adj={i:set() for i in range(len(vertices))}
                for face in faces:
                    self.assertGreater(triangle_area(vertices,face),5e-13)
                    for a,b in zip(face,face[1:]+face[:1]):
                        edge=tuple(sorted((a,b)));edges[edge]+=1;winding[edge]+=1 if a<b else -1
                        adj[a].add(b);adj[b].add(a)
                seen={0};stack=[0]
                while stack:
                    for i in adj[stack.pop()]:
                        if i not in seen:seen.add(i);stack.append(i)
                self.assertEqual(len(seen),len(vertices))
                self.assertTrue(all(n==2 for n in edges.values()))
                self.assertTrue(all(n==0 for n in winding.values()))
                self.assertEqual(len(vertices)-len(edges)+len(faces),-2)

    def test_rock_arch_is_closed_and_keeps_the_opening_clear(self):
        points=[(-5,0,-.1),(-4,0,3),(-1,0,4.3),(2.5,0,3.8),(5,0,0)]
        m=make("arch",lambda m:plants.rock_arch(m,points,1.1,22))
        self.assertEqual(set(m.buckets),{("","grotto","rock_stone")})
        b=next(iter(m.buckets.values()));vertices=b["v"];faces=b["f"]
        self.assertTrue(all(math.isfinite(n) for p in vertices for n in p))
        self.assertEqual(len(b["uv"]),len(vertices))
        self.assertTrue(all(all(math.isfinite(n) for n in uv) for uv in b["uv"]))
        edges=Counter();winding=Counter()
        for face in faces:
            self.assertGreater(triangle_area(vertices,face),5e-13)
            for a,c in zip(face,face[1:]+face[:1]):
                key=tuple(sorted((a,c)));edges[key]+=1;winding[key]+=1 if a<c else -1
        self.assertTrue(all(n==2 for n in edges.values()))
        self.assertTrue(all(n==0 for n in winding.values()))
        self.assertEqual(len(vertices)-len(edges)+len(faces),2)
        self.assertGreaterEqual(min(p[0] for p in vertices),-6.4)
        self.assertLessEqual(max(p[0] for p in vertices),6.4)
        self.assertLessEqual(max(p[2] for p in vertices),5.65)
        self.assertLessEqual(max(abs(p[1]) for p in vertices),1.4)
        bvh=BVHTree.FromPolygons(vertices,faces)
        # Rays traverse the arch's aperture, excluding the independent background
        # stones.  A decorative ridge must never close the existing opening.
        for x in [-2.3,-1.2,0,1.2,2.3]:
            for z in [.3,1.5,2.4]:
                hit=bvh.ray_cast(Vector((x,-3,z)),Vector((0,1,0)),6)[0]
                self.assertIsNone(hit,f"The arch intrudes into the opening at x={x}, z={z}")


if __name__=="__main__":
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(PlantGeometryTests)
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    if not result.wasSuccessful():raise RuntimeError("Plant geometry regression checks failed")
