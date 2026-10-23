import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'art/blender'))
from ecology import clear_ground,boundary_trees,inside

class EcologyTests(unittest.TestCase):
    def test_open_and_closed_polygons_have_the_same_containment(self):
        polygon=[(-1,-1),(1,-1),(0,1)]
        self.assertFalse(inside(-2,0,polygon))
        self.assertTrue(inside(0,0,polygon))
        for point in [(-2,0),(0,0),(2,2)]:self.assertEqual(inside(*point,polygon),inside(*point,polygon+[polygon[0]]))
    def test_grass_respects_rotated_buildings_actual_path_width_and_water(self):
        sites=[{'position':[0,0,0],'size':[8,2],'rotation':1.5707963267948966}]
        routes=[{'width':4,'points':[(8,-10,0),(8,10,0)]}]
        self.assertFalse(clear_ground(0,3,sites,routes,10))
        self.assertTrue(clear_ground(4,0,sites,routes,10))
        self.assertFalse(clear_ground(9.8,0,sites,routes,10))
        self.assertFalse(clear_ground(15,0,sites,routes,.1))
        self.assertFalse(clear_ground(100,0,[],[],10))
    def test_forest_belt_keeps_entrance_open_and_stays_on_exported_ground(self):
        points=boundary_trees(1723)
        self.assertGreater(len(points),120)
        self.assertEqual(points,boundary_trees(1723))
        for x,y,_,_ in points:
            self.assertLessEqual(abs(x),94)
            self.assertLessEqual(abs(y),94)
            self.assertFalse(abs(x)<18 and y<-74)

if __name__=='__main__':unittest.main()
