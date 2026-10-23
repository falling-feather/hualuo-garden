"""Native regressions for the window reveal and bedroom-screen defects.

Run with Blender --background --factory-startup --python-exit-code 1
--python tests/test_architecture_geometry.py. No scene or exported asset is written.
"""
import json
import sys
import unittest
from pathlib import Path

from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "art" / "blender"))
from geometry import MeshBuilder
from architecture import facade, landmark


def surface_tree(builder, component=None, roles=None):
    vertices, faces = [], []
    for (owner, role, _), bucket in builder.buckets.items():
        if component is not None and owner != component:
            continue
        if roles is not None and role not in roles:continue
        start = len(vertices)
        vertices.extend(bucket["v"])
        faces.extend(tuple(start + i for i in face) for face in bucket["f"])
    if not faces:
        raise ValueError("The requested architectural part has no geometry")
    return BVHTree.FromPolygons(vertices, faces)


class ArchitectureGeometryTests(unittest.TestCase):
    def test_qiushuang_desk_vase_does_not_intersect_the_books(self):
        plan=json.loads((ROOT/'art/garden-plan.json').read_text(encoding='utf-8'))
        spec=next(s for s in plan['landmarks'] if s['id']=='qiushuang')
        builder=MeshBuilder('qiushuang');landmark(builder,spec)
        vase=surface_tree(builder,component='desk-vase',roles={'objects','vase_rims'})
        books=surface_tree(builder,roles={'book_covers','book_pages','books'})
        self.assertEqual(len(vase.overlap(books)),0)

    def test_window_reveals_have_no_open_strip_between_frame_and_column(self):
        for height in [2.35, 3.2, 4.3]:
            with self.subTest(height=height):
                builder = MeshBuilder("window-reveal")
                facade(builder, 0, 0, 10.8, height, .62, 3,
                       "wood", "plaster", "diamond")
                surface = surface_tree(builder)
                # These are the visible jamb strips, outside the paper and lattice.
                for side in [-1, 1]:
                    for offset in [1.62, 1.645]:
                        x = -3.6 + side * offset
                        for z in [.50, 1.05, 1.5, height - .47]:
                            for direction in [-1, 1]:
                                hit = surface.ray_cast(Vector((x, direction, .62 + z)),
                                                       Vector((0, -direction, 0)), 2)[0]
                                self.assertIsNotNone(hit, "Window-to-column reveal is open")

    def test_window_head_closes_to_the_lintel_but_the_door_stays_open(self):
        builder = MeshBuilder("window-head")
        facade(builder, 0, 0, 10.8, 4.3, .62, 3,
               "wood", "plaster", "diamond")
        surface = surface_tree(builder)
        self.assertIsNotNone(surface.ray_cast(Vector((-3.6, -1, .62 + 3.10)),
                                              Vector((0, 1, 0)), 2)[0])
        self.assertIsNone(surface.ray_cast(Vector((0, -1, .62 + 1.30)),
                                          Vector((0, 1, 0)), 2)[0])
        self.assertEqual(len(builder.colliders), 6)

    def test_yihong_screens_clear_the_bed_and_leave_a_bedside_entry(self):
        plan = json.loads((ROOT / "art" / "garden-plan.json").read_text(encoding="utf-8"))
        spec = next(item for item in plan["landmarks"] if item["id"] == "yihong")
        builder = MeshBuilder("yihong")
        landmark(builder, spec)
        screens = surface_tree(builder, "interior-screens")
        sleeping = surface_tree(builder, "bedchamber")
        self.assertEqual(len(screens.overlap(sleeping)), 0,
                         "A screen passes through the bed, curtain or timber frame")
        main_y = spec["size"][1] / 2 - 8.3
        for offset in [-.25, 0, .25]:
            hit = screens.ray_cast(Vector((-1.8, main_y + .10 + offset, 1.8)),
                                   Vector((-1, 0, 0)), 1.5)[0]
            self.assertIsNone(hit, "The intended bedside entry is blocked by a screen")


if __name__ == "__main__":
    result = unittest.TextTestRunner(verbosity=2).run(
        unittest.defaultTestLoader.loadTestsFromTestCase(ArchitectureGeometryTests))
    if not result.wasSuccessful():
        raise RuntimeError("Architectural geometry regression failed")
