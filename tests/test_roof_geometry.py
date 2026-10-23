"""Run with Blender, without creating a scene, rendering or exporting any asset.

blender --background --factory-startup --python-exit-code 1 --python tests/test_roof_geometry.py
"""
import math
from pathlib import Path
import sys
import unittest
from collections import Counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "art" / "blender"))
from geometry import MeshBuilder
from mathutils import Vector
from roofs import RoofClip, _RoofSurface, _cover_edge, _eave_end, _tile, roof, roof_join


class Capture(MeshBuilder):
    def __init__(self):
        super().__init__("roof-regression")
        self.calls = []

    def add(self, vertices, faces, material, role="structure", smooth=False, uvs=None):
        self.calls.append((vertices, faces, material, role))
        super().add(vertices, faces, material, role, smooth, uvs)


NORTH = dict(cx=0, cy=1, w=13, d=7, eave=3.10, rise=1.25, style="tile")
SOUTH = dict(cx=0, cy=-3.3, w=13, d=3.55, eave=3.18, rise=.85, style="juanpeng")


class RoofGeometryTests(unittest.TestCase):
    def test_upper_storey_opening_cuts_every_component(self):
        builder = MeshBuilder("opening")
        roof(builder, 2, -1, 15, 9, 4, 2.1, opening=(8.3, 4.6))
        for (_, role, _), bucket in builder.buckets.items():
            self.assertFalse(any(abs(x - 2) < 4.15 - 1e-6 and abs(y + 1) < 2.3 - 1e-6
                                 for x, y, z in bucket["v"]), role)

    def test_join_roofs_have_disjoint_cut_footprints(self):
        for spec, boundary, keep in [(NORTH, -1.325, "positive"), (SOUTH, -1.725, "negative")]:
            builder = MeshBuilder("cut")
            roof(builder, **spec, clip=RoofClip("y", boundary, keep))
            roles = {role for _, role, _ in builder.buckets}
            self.assertTrue({"roof_shell", "roof_tiles", "rafters", "roof_purlins", "eave_ends"} <= roles)
            sign = 1 if keep == "positive" else -1
            for (_, role, _), bucket in builder.buckets.items():
                self.assertTrue(all(sign * (v[1] - boundary) >= -1e-6 for v in bucket["v"]), role)
                self.assertTrue(all(math.isfinite(c) for v in bucket["v"] for c in v), role)

    def test_join_uses_source_roof_heights_at_both_edges(self):
        builder = Capture()
        result = roof_join(builder, NORTH, SOUTH, seam=-1.525, width=.40)
        self.assertAlmostEqual(result["north_boundary"], -1.325)
        self.assertAlmostEqual(result["south_boundary"], -1.725)
        top = next(v for v, f, material, role in builder.calls if role == "roof_shell" and material == "tile_dark")
        for spec, y in [(NORTH, result["north_boundary"]), (SOUTH, result["south_boundary"])]:
            shape = _RoofSurface(**spec)
            edge = [(x, yy, z) for x, yy, z in top if abs(yy - y) < 1e-7]
            self.assertGreater(len(edge), 30)
            for x, yy, z in edge:
                self.assertAlmostEqual(z, shape.height(x, yy) + .010, places=6)
        self.assertLess(min(p[1] for p in top), result["south_boundary"])
        self.assertGreater(max(p[1] for p in top), result["north_boundary"])

    def test_tile_necks_connect_actual_cover_edges_to_disk(self):
        shape = _RoofSurface(0, 0, 15, 9, 4, 2.1)
        for side, outward in [(0, (0, -1)), (1, (0, 1)), (2, (-1, 0)), (3, (1, 0))]:
            surface = lambda s, v: shape.sample(side, s, v)[0]
            normal = lambda s, v: shape.sample(side, s, v)[1]
            builder = Capture()
            _eave_end(builder, surface, normal, 0, outward)
            disk, neck = builder.calls[0], builder.calls[1]
            points, faces = neck[0], neck[1]
            expected = _cover_edge(surface, normal, 0)
            for a, b in zip(points[:7], expected):
                self.assertLess(math.dist(a, b), 1e-8)
            for point in points[7:]:
                self.assertLess(min(math.dist(point, p) for p in disk[0][:12]), 1e-6)
            # A ceramic neck must be closed with consistent shared-edge orientation.
            directed = Counter((a, b) for face in faces for a, b in zip(face, face[1:] + face[:1]))
            for (a, b), count in directed.items():
                self.assertEqual(count, directed[(b, a)], (side, a, b))
            tile = Capture()
            start, spread, run = shape.dimensions(side)
            _tile(tile, surface, normal, -.082, .082, .9, 1.007, start, spread, "tile", None)
            tile_vertices = [p for v, f, material, role in tile.calls for p in v]
            for point in expected:
                self.assertLess(min(math.dist(point, p) for p in tile_vertices), 1e-7)

    def test_height_field_agrees_with_all_four_slope_boundaries(self):
        shape = _RoofSurface(**NORTH)
        for side in range(4):
            start, spread, run = shape.dimensions(side)
            for sign in [-1, 1]:
                for i in range(31):
                    v = i / 30
                    x, y, z = shape.sample(side, sign * (start + spread * v), v)[0]
                    self.assertAlmostEqual(z, shape.height(x, y), places=6)

    def test_thatch_has_a_thick_irregular_eave(self):
        builder = MeshBuilder("thatch")
        roof(builder, 0, 0, 15, 9, 4, 2.1, style="thatch")
        fringe = [v for (_, role, _), b in builder.buckets.items() if role == "thatch_fibres"
                  for v in b["v"] if abs(v[1]) > 4.53]
        self.assertGreater(len(fringe), 100)
        self.assertGreater(max(v[2] for v in fringe) - min(v[2] for v in fringe), .20)
        self.assertGreater(max(abs(v[1]) for v in fringe) - min(abs(v[1]) for v in fringe), .08)
        for (_, role, _), bucket in builder.buckets.items():
            if role != "thatch_fibres":
                continue
            for face in bucket["f"]:
                points = [Vector(bucket["v"][i]) for i in face]
                center = sum(points, Vector((0, 0, 0))) / len(points)
                normal = (points[1] - points[0]).cross(points[2] - points[0])
                if abs(center.y) > 4.53 and abs(normal.z) < 1e-8:
                    self.assertGreater(normal.y * center.y, 0)

    def test_thatch_detail_uses_straw_scale_relief_without_wide_course_lips(self):
        builder = MeshBuilder("thatch-detail")
        roof(builder, 0, 0, 15, 9, 4, 2.1, style="thatch")
        triangles = 0
        for (_, role, _), bucket in builder.buckets.items():
            triangles += sum(len(face) - 2 for face in bucket["f"])
            for face in bucket["f"]:
                points = [Vector(bucket["v"][i]) for i in face]
                width = max(p.x for p in points) - min(p.x for p in points)
                if role == "roof_tiles":
                    # At close range the surface must break into narrow stalks,
                    # not the former 10cm facets of broad cardboard shingles.
                    self.assertLess(width, .04)
                if role == "thatch_fibres":
                    center = sum(points, Vector((0, 0, 0))) / len(points)
                    normal = (points[1] - points[0]).cross(points[2] - points[0])
                    if .50 < abs(center.y) < 4.45 and abs(normal.z) < 1e-8:
                        self.assertLess(width, .04, "Wide vertical course end inside the roof")
        self.assertLessEqual(triangles, 120000, "Thatch relief must fit the close-model budget")


if __name__ == "__main__":
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(RoofGeometryTests))
    if not result.wasSuccessful():
        raise RuntimeError("Roof geometry regression failed")
