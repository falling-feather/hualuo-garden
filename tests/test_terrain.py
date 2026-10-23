"""Pure Python checks for designed relief, protected pads and slope-following walls."""
import json
import math
import sys
import unittest
from collections import Counter
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"art"/"blender"))
from terrain import GardenTerrain,wall_sections,foundation_mesh


def signed_volume(vertices,faces):
    volume=0
    for face in faces:
        a=vertices[face[0]]
        for j in range(1,len(face)-1):
            b,c=vertices[face[j]],vertices[face[j+1]]
            cross=(b[1]*c[2]-b[2]*c[1],b[2]*c[0]-b[0]*c[2],b[0]*c[1]-b[1]*c[0])
            volume+=sum(a[k]*cross[k] for k in range(3))/6
    return volume


class TerrainTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plan=json.loads((ROOT/"art/garden-plan.json").read_text(encoding="utf-8"))
        cls.terrain=GardenTerrain(cls.plan)

    def test_courtyard_cores_and_high_low_hierarchy_are_preserved(self):
        sites={site["id"]:site for site in self.plan["landmarks"]}
        for name in ["gate","xiaoxiang","daoxiang","hengwu","longcui","cubi","aojing","yihong"]:
            with self.subTest(name=name):
                x,y,z=sites[name]["position"]
                self.assertAlmostEqual(self.terrain.height(x,y,100),z-.1,places=8)
        self.assertGreater(self.terrain.height(61,31,100),self.terrain.height(37,44,100)+3)
        self.assertGreater(self.terrain.height(37,44,100),self.terrain.height(45,12,100)+2)

    def test_ridges_raise_multiple_regions_without_random_spikes(self):
        for point in [(-73,10),(-68,30),(-37,82),(72,44)]:
            with self.subTest(point=point):self.assertGreater(self.terrain.height(*point,100),2.4)
        for x in range(-95,97,4):
            for y in range(-91,97,4):
                height=self.terrain.height(x,y,100)
                self.assertTrue(math.isfinite(height))
                self.assertGreaterEqual(height,0)
                self.assertLessEqual(height,8.0)
                self.assertAlmostEqual(height,self.terrain.height(x,y,100),places=12)

    def test_pad_edges_have_a_continuous_shoulder(self):
        site=next(s for s in self.plan["landmarks"] if s["id"]=="xiaoxiang")
        cx,cy,z=site["position"];r=site["rotation"];edge=(site["size"][0]+2)/2
        samples=[self.terrain.height(cx+math.cos(r)*distance,cy+math.sin(r)*distance,100)
                 for distance in [edge-.01,edge,edge+.01,edge+.1]]
        self.assertAlmostEqual(samples[0],z-.1,places=8)
        self.assertLess(abs(samples[2]-samples[0]),.002)
        self.assertLess(abs(samples[3]-samples[0]),.02)

    def test_water_has_a_shallow_contact_and_a_monotone_bank(self):
        distances=[-8,-3,-1,0,.2,.5,1,3,7,11,20]
        heights=[self.terrain.shore_height(4,d) for d in distances]
        self.assertTrue(all(a<=b for a,b in zip(heights,heights[1:])))
        self.assertLess(heights[0],self.plan["water"]["level"]-.6)
        self.assertAlmostEqual(self.terrain.shore_height(4,0),self.plan["water"]["level"]-.025)
        self.assertEqual(heights[-1],4)

    def test_extra_approach_pad_keeps_priority(self):
        pad={"position":[-43,-32,.61],"size":[3,4],"rotation":.07,"blend":2}
        terrain=GardenTerrain(self.plan,[pad])
        self.assertAlmostEqual(terrain.height(-43,-32,100),.61)

    def test_foundation_is_embedded_on_front_and_back(self):
        def ground(x,y):return .17*x+.035*y+.15*math.sin(x*.3)
        sections=wall_sections((0,0),(30,12),ground)
        for section in sections:
            for pair in section["lower"]:
                for x,y,z in pair:self.assertLessEqual(z,ground(x,y)-.17)
            for before,after in zip(section["lower"],section["lower"][1:]):
                for edge in range(2):
                    x,y,z=[(before[edge][i]+after[edge][i])/2 for i in range(3)]
                    self.assertLess(z,ground(x,y)-.15)
            vertices,faces=foundation_mesh(section);edges=Counter();winding=Counter()
            for face in faces:
                for a,b in zip(face,face[1:]+face[:1]):
                    key=tuple(sorted((a,b)));edges[key]+=1;winding[key]+=1 if a<b else -1
            self.assertTrue(all(n==2 for n in edges.values()))
            self.assertTrue(all(n==0 for n in winding.values()))
            self.assertGreater(signed_volume(vertices,faces),0)
            self.assertLessEqual(section["length"],2.4)


if __name__=="__main__":unittest.main()
