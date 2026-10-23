import sys,unittest,math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'art/blender'))
from route_geometry import resample,rounded_path,offset_edges,slice_path,arc_lengths,transform_port

class RouteGeometryTests(unittest.TestCase):
    def test_rotated_port_keeps_the_actual_deck_height_and_outward_direction(self):
        result=transform_port({'position':[5,0,.75],'direction':[1,0],'width':2.4},{'position':[16,6,.15],'rotation':math.pi/2})
        self.assertAlmostEqual(result['position'][0],16)
        self.assertAlmostEqual(result['position'][1],11)
        self.assertAlmostEqual(result['position'][2],.9)
        self.assertAlmostEqual(result['direction'][1],1)
    def test_sampling_preserves_both_connection_endpoints(self):
        points=resample([(0,0,0),(3,0,0),(3,4,1)],.3)
        self.assertEqual(points[0],(0,0,0));self.assertEqual(points[-1],(3,4,1))
        self.assertTrue(all(math.dist(a,b)<.34 for a,b in zip(points,points[1:])))
    def test_rounded_corner_stays_inside_its_control_polygon(self):
        points=rounded_path([(0,0,0),(5,0,0),(5,5,0)],1.2)
        self.assertEqual(points[0],(0,0,0));self.assertEqual(points[-1],(5,5,0))
        self.assertTrue(all(0<=p[0]<=5 and 0<=p[1]<=5 for p in points))
    def test_turns_have_one_shared_miter_and_no_inverted_side(self):
        left,right=offset_edges([(0,0,0),(5,0,0),(5,5,0)],2)
        self.assertEqual(left[1],(4,1,0));self.assertEqual(right[1],(6,-1,0))
        self.assertTrue(all(math.dist(a,b)<3 for a,b in zip(left,right)))
    def test_trimming_produces_exact_station_connections(self):
        points=slice_path([(0,0,0),(4,0,0),(4,4,0)],1.5,6.5)
        self.assertEqual(points[0],(1.5,0,0));self.assertEqual(points[-1],(4,2.5,0))
        self.assertAlmostEqual(arc_lengths(points)[-1],5)

if __name__=='__main__':unittest.main()
