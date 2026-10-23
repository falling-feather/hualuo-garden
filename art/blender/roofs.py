import math
import random
from mathutils import Vector


def oriented(vertices, faces):
    """Give roof skins upward normals and remove collapsed apex cells."""
    out = []
    for face in faces:
        a = Vector(vertices[face[0]][:3])
        normal = Vector((0, 0, 0))
        for i in range(1, len(face) - 1):
            normal += (Vector(vertices[face[i]][:3]) - a).cross(Vector(vertices[face[i + 1]][:3]) - a)
        if normal.length_squared > 1e-14:
            out.append(tuple(reversed(face)) if normal.z < 0 else face)
    return out


def _clip(poly, axis, edge, sign):
    result = []
    for a, b in zip(poly, poly[1:] + poly[:1]):
        da, db = (a[axis] - edge) * sign, (b[axis] - edge) * sign
        if da >= -1e-9:
            result.append(a)
        if (da >= 0) != (db >= 0):
            t = da / (da - db)
            result.append(tuple(a[k] + (b[k] - a[k]) * t for k in range(len(a))))
    return result


def _outside_rectangle(poly, opening):
    if not opening:
        return [poly]
    cx, cy, w, d = opening
    fragments, remainder = [], poly
    for axis, edge, sign in [(0, cx - w / 2, -1), (0, cx + w / 2, 1),
                             (1, cy - d / 2, -1), (1, cy + d / 2, 1)]:
        if len(remainder) < 3:
            break
        outside = _clip(remainder, axis, edge, sign)
        if len(outside) >= 3:
            fragments.append(outside)
        remainder = _clip(remainder, axis, edge, -sign)
    return fragments


def _mesh(vertices, faces, opening=None, uvs=None):
    """Clip faces and interpolate their UVs; centre-point filtering leaves crossing tiles."""
    result, polygons, texcoords, indices = [], [], [], {}
    for face in faces:
        poly = [tuple(vertices[i]) + tuple(uvs[i] if uvs else (vertices[i][0] * .45, vertices[i][1] * .45)) for i in face]
        for part in _outside_rectangle(poly, opening):
            clean = []
            for p in part:
                if not clean or math.dist(p[:3], clean[-1][:3]) > 1e-8:
                    clean.append(p)
            if len(clean) > 1 and math.dist(clean[0][:3], clean[-1][:3]) < 1e-8:
                clean.pop()
            if len(clean) < 3:
                continue
            a = Vector(clean[0][:3])
            area = sum(((Vector(clean[i][:3]) - a).cross(Vector(clean[i + 1][:3]) - a).length
                        for i in range(1, len(clean) - 1)), 0)
            if area < 1e-10:
                continue
            ids = []
            for p in clean:
                key = tuple(round(v, 8) for v in p)
                if key not in indices:
                    indices[key] = len(result)
                    result.append(p[:3])
                    texcoords.append(p[3:])
                ids.append(indices[key])
            polygons.append(tuple(ids))
    return result, polygons, texcoords


def _add(m, vertices, faces, mat, role, opening=None, smooth=False, uvs=None):
    vertices, faces, uvs = _mesh(vertices, faces, opening, uvs)
    if faces:
        m.add(vertices, faces, mat, role, smooth, uvs=uvs)


def _shell(m, vertices, faces, thickness, mat, opening=None, eave_boundary=None, uvs=None):
    vertices, faces, uvs = _mesh(vertices, oriented(vertices, faces), opening, uvs)
    if not faces:
        return
    m.add(vertices, faces, mat, "roof_shell", True, uvs=uvs)
    underside = [(x, y, z - thickness) for x, y, z in vertices]
    # The interior skin also participates in the existing weather shelter pipeline.
    m.add(underside, [tuple(reversed(f)) for f in faces], "wood_light", "roof_shell", True, uvs=uvs)
    edges = {}
    for face in faces:
        for a, b in zip(face, face[1:] + face[:1]):
            key = tuple(sorted((a, b)))
            edges[key] = None if key in edges else (a, b)
    walls, side_faces = [], []
    for edge in edges.values():
        if edge is not None:
            a, b = edge
            if eave_boundary:
                origin, outward = eave_boundary
                on_eave = all(abs(sum((vertices[i][k] - origin[k]) * outward[k] for k in range(2))) < 1e-6 for i in [a, b])
                on_cut = opening and any(all(abs(vertices[i][axis] - boundary) < 1e-6 for i in [a, b])
                                         for axis, boundary in [(0, opening[0] - opening[2] / 2), (0, opening[0] + opening[2] / 2),
                                                                (1, opening[1] - opening[3] / 2), (1, opening[1] + opening[3] / 2)])
                # Adjacent slopes already share these hips. Closing both would add
                # coincident internal webs along every ridge and corner.
                if not on_eave and not on_cut:
                    continue
            start = len(walls)
            walls.extend([vertices[a], underside[a], underside[b], vertices[b]])
            side_faces.append(tuple(range(start, start + 4)))
    if walls:
        m.add(walls, side_faces, "thatch" if mat == "thatch" else "wood_dark", "roof_shell")


def _outside_paths(points, opening, margin=0):
    """Split crossing timbers rather than connecting across removed middle samples."""
    if not opening:
        return [points]
    cx, cy, w, d = opening
    bounds = [(cx - w / 2 - margin, cx + w / 2 + margin),
              (cy - d / 2 - margin, cy + d / 2 + margin)]
    paths, current = [], []
    for a, b in zip(points, points[1:]):
        enter, leave = 0.0, 1.0
        for axis, (low, high) in enumerate(bounds):
            delta = b[axis] - a[axis]
            if abs(delta) < 1e-10:
                if not low < a[axis] < high:
                    enter, leave = 1, 0
                    break
            else:
                t0, t1 = (low - a[axis]) / delta, (high - a[axis]) / delta
                enter, leave = max(enter, min(t0, t1)), min(leave, max(t0, t1))
        spans = [(0, 1)] if enter >= leave else [(0, max(0, enter)), (min(1, leave), 1)]
        for start, end in spans:
            if end - start < 1e-8:
                continue
            p = tuple(a[k] + (b[k] - a[k]) * start for k in range(3))
            q = tuple(a[k] + (b[k] - a[k]) * end for k in range(3))
            if current and math.dist(current[-1], p) < 1e-7:
                current.append(q)
            else:
                if len(current) > 1:
                    paths.append(current)
                current = [p, q]
    if len(current) > 1:
        paths.append(current)
    return paths


def _tube(m, points, radius, mat, role, opening=None, sides=8):
    for path in _outside_paths(points, opening, radius):
        m.tube(path, radius, mat, role, sides)


def _board(m, points, width, height, mat, role, opening=None):
    """Sweep a timber board with a flat face and longitudinal grain."""
    vertices, lengths = [], [0]
    for i, p in enumerate(points):
        tangent = Vector(points[min(len(points) - 1, i + 1)]) - Vector(points[max(0, i - 1)])
        across = Vector((-tangent.y, tangent.x, 0)).normalized()
        for side, drop in [(-1, 0), (-1, -height), (1, -height), (1, 0)]:
            vertices.append(tuple(Vector(p) + across * (width * side / 2) + Vector((0, 0, drop))))
        if i:
            lengths.append(lengths[-1] + math.dist(points[i - 1], p))
    faces = [tuple(reversed(range(4))), tuple(range(len(vertices) - 4, len(vertices)))]
    for j in range(len(points) - 1):
        for i in range(4):
            a, b = j * 4 + i, j * 4 + (i + 1) % 4
            faces.append((a, b, b + 4, a + 4))
    uvs = [(lengths[j] * .4, i * .12) for j in range(len(points)) for i in range(4)]
    _add(m, vertices, faces, mat, role, opening, False, uvs)


def _domain_clip(poly, start, spread):
    # s is measured across a slope in metres, with a linearly expanding hip boundary.
    for sign in [-1, 1]:
        result = []
        for a, b in zip(poly, poly[1:] + poly[:1]):
            da, db = start + spread * a[1] - sign * a[0], start + spread * b[1] - sign * b[0]
            if da >= -1e-9:
                result.append(a)
            if (da >= 0) != (db >= 0):
                t = da / (da - db)
                result.append(tuple(a[k] + (b[k] - a[k]) * t for k in range(2)))
        poly = result
        if len(poly) < 3:
            return []
    return poly


def _tile(m, surface, normal, s0, s1, v0, v1, start, spread, mat, opening, pan=False):
    # Six curved faces per cover tile; two for the shallow pan between the covers.
    steps = 2 if pan else 6
    vertices, faces, uvs = [], [], []
    for i in range(steps):
        poly = [(s0 + (s1 - s0) * u, v) for u, v in
                [(i / steps, v0), ((i + 1) / steps, v0), ((i + 1) / steps, v1), (i / steps, v1)]]
        poly = _domain_clip(poly, start, spread)
        if len(poly) < 3:
            continue
        face = []
        for s, v in poly:
            u, t = (s - s0) / (s1 - s0), (v - v0) / (v1 - v0)
            # Lower tile lips sit above the next course to produce readable joints.
            point = Vector(surface(s, v)) + Vector(normal(s, v)) * _tile_lift(u, t, pan)
            face.append(len(vertices))
            vertices.append(tuple(point))
            uvs.append((s * 1.7, v * 3.3))
        faces.append(tuple(face))
    _add(m, vertices, oriented(vertices, faces), mat, "roof_tiles", opening, True, uvs)


def _tile_lift(u, t, pan=False):
    return (.014 + .031 * (2 * u - 1) ** 2 if pan else .038 + .066 * math.sin(math.pi * u)) + .012 * t


def _cover_edge(surface, normal, s, v=1.007):
    return [tuple(Vector(surface(s + (i / 6 - .5) * .164, v))
                  + Vector(normal(s + (i / 6 - .5) * .164, v)) * _tile_lift(i / 6, 1))
            for i in range(7)]


def _eave_end(m, surface, normal, s, outward, ornate=False):
    """A moulded ring around a recessed tile face, replacing the former ball."""
    outward = Vector((*outward, 0)).normalized()
    across = Vector((-outward.y, outward.x, 0))
    p = surface(s, 1.007)
    center = Vector(p) + outward * .035 + Vector((0, 0, .035))
    segments = 12
    profile = [(.071, 0), (.073, .023), (.055, .018)]
    vertices = [tuple(center + across * (r * math.cos(math.tau * i / segments))
                      + Vector((0, 0, r * math.sin(math.tau * i / segments))) + outward * depth)
                for r, depth in profile for i in range(segments)]
    faces = []
    for j in range(len(profile) - 1):
        for i in range(segments):
            a, b = j * segments + i, j * segments + (i + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    faces.append(tuple(range(2 * segments, 3 * segments)))
    m.add(vertices, faces, "tile_dark", "eave_ends", True)
    # The rear ring matches the actual offset cover-tile edge. A horizontal
    # decorative disk alone leaves a visible hole behind it on an upturned eave.
    rear = _cover_edge(surface, normal, s)
    direction = (Vector(surface(s + .01, 1.007)) - Vector(surface(s - .01, 1.007))).normalized()
    front = [tuple(center + direction * (-.071 * math.cos(math.pi * i / 6))
                   + Vector((0, 0, .071 * math.sin(math.pi * i / 6)))) for i in range(7)]
    neck = rear + front
    neck_faces = oriented(neck, [(i, i + 7, i + 8, i + 1) for i in range(6)])
    # Complete the sides, underside and end faces of the small ceramic neck.
    # The curved upper patch has one boundary loop; its three remaining surfaces
    # close against the rear tile edge and the tile-end disk.
    neck_faces.extend([tuple(reversed(range(7))), tuple(range(7, 14)), (0, 6, 13, 7)])
    center_of_neck = sum((Vector(p) for p in neck), Vector((0, 0, 0))) / len(neck)
    for i, face in enumerate(neck_faces):
        a = Vector(neck[face[0]])
        direction = sum(((Vector(neck[face[j]]) - a).cross(Vector(neck[face[j + 1]]) - a)
                         for j in range(1, len(face) - 1)), Vector((0, 0, 0)))
        midpoint = sum((Vector(neck[j]) for j in face), Vector((0, 0, 0))) / len(face)
        if direction.dot(midpoint - center_of_neck) < 0:
            neck_faces[i] = tuple(reversed(face))
    m.add(neck, neck_faces, "tile", "eave_ends", True)
    if ornate:
        relief = [tuple(center + outward * .024)]
        for i in range(20):
            angle = math.tau * i / 20
            r = .028 + .008 * math.cos(angle * 5)
            relief.append(tuple(center + across * (r * math.cos(angle))
                                + Vector((0, 0, r * math.sin(angle))) + outward * .024))
        m.add(relief, [(0, 1 + i, 1 + (i + 1) % 20) for i in range(20)], "tile", "eave_ends")


def _drip(m, p, outward):
    outward = Vector((*outward, 0)).normalized()
    across = Vector((-outward.y, outward.x, 0))
    center = Vector(p) + outward * .030
    outline = [(-.094, .026), (.094, .026), (.085, -.035), (.048, -.075),
               (0, -.112), (-.048, -.075), (-.085, -.035)]
    n = len(outline)
    vertices = [tuple(center + across * x + Vector((0, 0, z)) + outward * depth)
                for depth in [0, .023] for x, z in outline]
    faces = [tuple(range(n)), tuple(reversed(range(n, 2 * n)))]
    faces.extend((i, i + n, (i + 1) % n + n, (i + 1) % n) for i in range(n))
    m.add(vertices, faces, "tile", "eave_ends")


def _slope(m, surface, normal, start, spread, slope_run, eave_out, opening, ornate, rng, thatch=False):
    half_width = start + spread
    nu, nv = max(12, math.ceil(half_width * 1.6)), max(12, math.ceil(slope_run * 2.5))
    vertices = [surface((2 * i / nu - 1) * (start + spread * j / nv), j / nv)
                for j in range(nv + 1) for i in range(nu + 1)]
    faces = [(j * (nu + 1) + i, j * (nu + 1) + i + 1,
              (j + 1) * (nu + 1) + i + 1, (j + 1) * (nu + 1) + i)
             for j in range(nv) for i in range(nu)]
    boundary = None if thatch else (surface(0, 1), eave_out)
    _shell(m, vertices, faces, .23 if thatch else .13, "thatch" if thatch else "tile_dark", opening, boundary)
    perimeter = [surface((2 * i / nu - 1) * half_width, 1) for i in range(nu + 1)]
    _board(m, [(x, y, z - .025) for x, y, z in perimeter], .13, .14, "wood_dark", "fascia", opening)
    _board(m, [(x, y, z - .15) for x, y, z in perimeter], .15, .045, "wood", "fascia", opening)
    rafters = max(6, round(2 * half_width / .48))
    for i in range(1, rafters):
        u = i / rafters
        points = [surface((2 * u - 1) * (start + spread * v), v) for v in [.12 + .88 * j / 10 for j in range(11)]]
        _tube(m, [(x, y, z - (.29 if thatch else .19)) for x, y, z in points], .058, "wood_light", "rafters", opening)
    for v in [.24, .62, .86]:
        points = [surface((2 * i / nu - 1) * (start + spread * v), v) for i in range(nu + 1)]
        _tube(m, [(x, y, z - (.40 if thatch else .30)) for x, y, z in points], .080, "wood", "roof_purlins", opening)
    if thatch:
        _thatch(m, surface, half_width, slope_run, rng)
        return
    columns = max(3, round(2 * half_width / .30))
    pitch = 2 * half_width / columns
    rows = max(4, math.ceil(slope_run / .46))
    materials = ["tile"] * 13 + ["tile_light", "tile_dark"]
    for i in range(columns + 1):
        s = -half_width + i * pitch
        for j in range(rows):
            v0, v1 = max(0, j / rows - .010), min(1.010, (j + 1) / rows + .007)
            _tile(m, surface, normal, s - .082, s + .082, v0, v1, start, spread,
                  rng.choice(materials), opening)
            if i < columns:
                _tile(m, surface, normal, s + .030, s + pitch - .030, v0, v1, start, spread,
                      rng.choice(materials), opening, pan=True)
        if .15 < i * pitch < 2 * half_width - .15:
            _eave_end(m, surface, normal, s, eave_out, ornate)
        if i < columns:
            _drip(m, surface(s + pitch / 2, 1.007), eave_out)


def _thatch(m, surface, half_width, slope_run, rng):
    """Fine longitudinal ridges with staggered ends, rather than broad shingle plates."""
    rows = max(5, math.ceil(slope_run / .68))
    outward = Vector(surface(0, 1)) - Vector(surface(0, .95))
    outward.z = 0
    outward.normalize()

    def facing_out(vertices, faces):
        for i, face in enumerate(faces):
            a, b, c = (Vector(vertices[j]) for j in face[:3])
            if (b - a).cross(c - a).dot(outward) < 0:
                faces[i] = tuple(reversed(face))
        return faces

    for j in range(rows):
        v0 = max(0, j / rows - .10 / slope_run)
        s0 = -half_width
        while s0 < half_width - 1e-6:
            s1 = min(half_width, s0 + rng.uniform(.024, .032))
            width = s1 - s0
            end = (j + 1) / rows + rng.uniform(.025, .115) / slope_run
            crest = rng.uniform(.009, .020)
            # Metric end offsets vary independently for each narrow ridge. This
            # breaks a course into straw teeth without a solid upright front.
            end_variation = [rng.uniform(-.009, .009) / slope_run for _ in range(3)]
            drift = rng.uniform(-.003, .003)
            vertices, uvs = [], []
            for t in [0, .52, 1]:
                for k in range(3):
                    s = min(half_width, max(-half_width, s0 + width * k / 2 + drift * t))
                    v = v0 + (end + end_variation[k] - v0) * t
                    x, y, z = surface(s, v)
                    z += .004 + .018 * t + (crest * (.45 + .55 * t) if k == 1 else 0)
                    vertices.append((x, y, z))
                    uvs.append((s * 2.2, v * slope_run * 1.7))
            faces = [(r * 3 + k, r * 3 + k + 1, (r + 1) * 3 + k + 1, (r + 1) * 3 + k)
                     for r in range(2) for k in range(2)]
            m.add(vertices, oriented(vertices, faces), "thatch", "roof_tiles", False, uvs=uvs)
            if j < rows - 1:
                tip = vertices[6:9]
                m.add(tip, facing_out(tip, [(0, 1, 2)]), "thatch", "thatch_fibres", uvs=uvs[6:9])
            if j == rows - 1:
                # The deep eave is a field of narrow folded ends, each with an
                # independent depth and lean; there is no broad cardboard skirt.
                depth, lean = rng.uniform(.18, .28), rng.uniform(.006, .052)
                skirt, skirt_uvs = list(vertices[6:9]), list(uvs[6:9])
                for t in [.48, 1]:
                    for k, point in enumerate(vertices[6:9]):
                        p = Vector(point) + outward * (lean * t + (.006 if k == 1 else 0))
                        p.z -= depth * t + rng.uniform(-.009, .009) * t
                        skirt.append(tuple(p))
                        skirt_uvs.append((uvs[6 + k][0], uvs[6 + k][1] + depth * t * 1.7))
                m.add(skirt, facing_out(skirt, list(faces)), "thatch", "thatch_fibres", uvs=skirt_uvs)
            if rng.random() < (.18 if j == rows - 1 else .045):
                s = (s0 + s1) / 2
                va = max(v0, end - rng.uniform(.12, .25) / slope_run)
                a = Vector(surface(s, va)) + Vector((0, 0, .040))
                b = Vector(surface(s + rng.uniform(-.012, .012), end + .02 / slope_run))
                b.z += rng.uniform(-.13, -.03) if j == rows - 1 else rng.uniform(.012, .028)
                # A tapered triangular section catches light without multiplying
                # thousands of cylindrical fibres or leaving flat paper strips.
                m.tube([tuple(a), tuple(b)], rng.uniform(.0020, .0035), "thatch", "thatch_fibres", 3, taper=.35)
            s0 = s1


def _ridge(m, points, width=.25, height=.17, opening=None):
    lengths = [0.0]
    for a, b in zip(points, points[1:]):
        lengths.append(lengths[-1] + math.dist(a, b))
    total = lengths[-1]
    if total < 1e-6:
        return
    def at(distance):
        distance = min(total, max(0, distance))
        j = next((j for j in range(len(lengths) - 1) if lengths[j + 1] >= distance), len(lengths) - 2)
        t = (distance - lengths[j]) / max(1e-8, lengths[j + 1] - lengths[j])
        return tuple(points[j][k] + (points[j + 1][k] - points[j][k]) * t for k in range(3))
    pieces = max(1, math.ceil(total / .44))
    profile = [(-.5, 0), (-.5, .32), (-.37, .72), (0, 1), (.37, .72), (.5, .32), (.5, 0)]
    for j in range(pieces):
        distances = [max(0, j * total / pieces - .007), min(total, (j + 1) * total / pieces + .007)]
        vertices, uvs = [], []
        for distance in distances:
            p = Vector(at(distance))
            direction = Vector(at(min(total, distance + .01))) - Vector(at(max(0, distance - .01)))
            across = Vector((-direction.y, direction.x, 0)).normalized()
            for x, z in profile:
                vertices.append(tuple(p + across * (x * width) + Vector((0, 0, z * height + .025))))
                uvs.append((distance * 1.3, (x + .5) * .5))
        n = len(profile)
        faces = [tuple(range(n)), tuple(reversed(range(n, 2 * n)))]
        faces.extend((i, i + n, (i + 1) % n + n, (i + 1) % n) for i in range(n))
        # Flat joints avoid the swollen pillow shading caused by smoothing the ends.
        _add(m, vertices, faces[:2], "tile_dark", "ridge", opening, False, uvs)
        _add(m, vertices, faces[2:], "tile_dark", "ridge", opening, True, uvs)


def _ridge_end(m, x, y, z, sign, ornate):
    # A restrained ceramic scroll seated in the cap, without unrelated metal spheres.
    scale = 1.0 if ornate else .72
    profile = [(-.23, 0), (.11, 0), (.24, .10), (.34, .25), (.35, .43),
               (.29, .55), (.19, .60), (.12, .56), (.13, .49), (.20, .47),
               (.24, .40), (.23, .31), (.17, .24), (.06, .20), (-.16, .20)]
    vertices = [(x + sign * px * scale, y + depth, z + pz * scale)
                for depth in [-.085, .085] for px, pz in profile]
    n = len(profile)
    faces = [tuple(range(n)), tuple(reversed(range(n, n * 2)))]
    faces.extend((i, i + n, (i + 1) % n + n, (i + 1) % n) for i in range(n))
    if sign < 0:
        faces = [tuple(reversed(f)) for f in faces]
    m.add(vertices, faces, "tile_dark", "ridge_finials")
    for side in [-1, 1]:
        points = [(x + sign * px * scale, y + side * .087, z + pz * scale)
                  for px, pz in [(-.12, .08), (.08, .09), (.20, .18), (.27, .30), (.27, .41), (.22, .48)]]
        m.tube(points, .014, "tile", "ridge_finials", 6)


class _RoofSurface:
    """Authoritative analytical surface shared by roofs and joining components."""
    def __init__(self, cx, cy, w, d, eave, rise, style="tile"):
        self.cx, self.cy, self.a, self.b = cx, cy, w / 2, d / 2
        self.eave, self.rise, self.style = eave, rise, style
        self.thatch, self.rolling = style == "thatch", style == "juanpeng"
        self.ridge = self.a if self.thatch else min(self.a - .15, max(.35, self.a - self.b * .72))
        self.lift = .045 if self.thatch else min(.29, .08 + self.b * .04)
        self.corner = .025 if self.thatch else min(.31, .07 + min(self.a, self.b) * .045)

    def profile(self, v):
        if self.rolling:
            q = max(0, math.cos(v * math.pi / 2))
            return q ** 1.35, -1.35 * math.pi / 2 * math.sin(v * math.pi / 2) * q ** .35
        power = 1.12 if self.thatch else 1.65
        return max(0, 1 - v) ** power, -power * max(0, 1 - v) ** (power - 1)

    def dimensions(self, side):
        return (self.ridge, self.a - self.ridge, self.b) if side < 2 else (0, self.b, self.a - self.ridge)

    def sample(self, side, s, v):
        start, spread, run = self.dimensions(side)
        sign = -1 if side in [0, 2] else 1
        width = start + spread * v
        ratio = abs(s) / max(width, 1e-8)
        crown, derivative = self.profile(v)
        z = self.eave + self.rise * crown + self.lift * v ** 7 + self.corner * ratio ** 7 * v ** 4
        dzds = self.corner * 7 * ratio ** 6 * (1 if s >= 0 else -1) / max(width, 1e-8) * v ** 4
        dzdv = self.rise * derivative + 7 * self.lift * v ** 6 + self.corner * ratio ** 7 * (4 * v ** 3 - 7 * v ** 4 * spread / max(width, 1e-8))
        if side < 2:
            p, normal = (self.cx + s, self.cy + sign * self.b * v, z), (-dzds, -dzdv / (sign * run), 1)
        else:
            p, normal = (self.cx + sign * (self.ridge + run * v), self.cy + s, z), (-dzdv / (sign * run), -dzds, 1)
        return p, tuple(Vector(normal).normalized())

    def height(self, x, y):
        dx, dy = x - self.cx, y - self.cy
        if abs(dx) > self.a + 1e-7 or abs(dy) > self.b + 1e-7:
            raise ValueError("Roof join sample lies outside the source roof")
        front_v = abs(dy) / self.b
        hip_v = 0 if self.thatch else max(0, (abs(dx) - self.ridge) / (self.a - self.ridge))
        if front_v >= hip_v:
            return self.sample(0 if dy < 0 else 1, dx, front_v)[0][2]
        return self.sample(2 if dx < 0 else 3, dy, hip_v)[0][2]


class RoofClip:
    """Keep one half-plane in the roof call's LOCAL coordinates.

    axis is 'x' or 'y'; keep is 'positive' (coordinate >= boundary) or
    'negative' (coordinate <= boundary). Apply any corridor translation or
    rotation to the boundary before passing this object to roof().
    All resulting geometry, including timbers and tile-end pieces, is cut.
    """
    def __init__(self, axis, boundary, keep):
        if axis not in ("x", "y") or keep not in ("positive", "negative"):
            raise ValueError("RoofClip requires axis x/y and keep positive/negative")
        self.axis = 0 if axis == "x" else 1
        self.boundary = float(boundary)
        self.sign = 1 if keep == "positive" else -1

    def apply(self, source, target):
        for (_, role, material), bucket in source.buckets.items():
            # Retain sharp end faces instead of smoothing them with the curved skins.
            for smooth in (False, True):
                for explicit_uv in (False, True):
                    vertices, faces, uvs = [], [], []
                    for face, is_smooth in zip(bucket["f"], bucket["s"]):
                        has_uv = all(bucket["uv"][i] is not None for i in face)
                        if is_smooth != smooth or has_uv != explicit_uv:
                            continue
                        poly = [tuple(bucket["v"][i]) + (tuple(bucket["uv"][i]) if has_uv else ()) for i in face]
                        poly = _clip(poly, self.axis, self.boundary, self.sign)
                        if len(poly) < 3:
                            continue
                        start = len(vertices)
                        vertices.extend(p[:3] for p in poly)
                        uvs.extend(p[3:] for p in poly)
                        faces.append(tuple(range(start, start + len(poly))))
                    vertices, faces, uvs = _mesh(vertices, faces, uvs=uvs if explicit_uv else None)
                    if faces:
                        # Leave automatic projection to MeshBuilder.emit; its per-face
                        # mapping is the authority for timber and unwrapped end pieces.
                        target.add(vertices, faces, material, role, smooth, uvs=uvs if explicit_uv else None)


def roof_join(m, north_spec, south_spec, seam, width=.40):
    """Join two trimmed roofs across a y-oriented seam in ONE common local frame.

    Both dictionaries contain cx, cy, w, d, eave, rise and style. Their coordinates
    are relative to m's current transform, not Blender world coordinates.
    Build the north roof with RoofClip('y', seam + width/2, 'positive') and
    the south roof with RoofClip('y', seam - width/2, 'negative'); translate
    those planes into each roof call's local frame when using a corridor.

    This function fills the removed width with a thick ceramic channel, short
    underlaps beneath the cut tile ends, and a supporting timber. Its two sides
    sample the SAME analytical surfaces used to build the roofs. It does not
    cover an untrimmed intersection. The caller must supply both RoofClips.
    """
    if width < .20:
        raise ValueError("A roof joint needs at least .20m for its two cut edges")
    north, south = _RoofSurface(**north_spec), _RoofSurface(**south_spec)
    if north.cy <= south.cy:
        raise ValueError("north_spec must be north of south_spec in the common frame")
    x0, x1 = max(north.cx - north.a, south.cx - south.a), min(north.cx + north.a, south.cx + south.a)
    if x1 <= x0:
        raise ValueError("Roofs have no overlapping width")
    yn, ys = seam + width / 2, seam - width / 2
    columns = max(8, math.ceil((x1 - x0) / .16))
    vertices, uvs, supports = [], [], []
    apron = .045
    ysamples = [ys - apron, ys, seam - width * .15, seam + width * .15, yn, yn + apron]
    for i in range(columns + 1):
        x = x0 + (x1 - x0) * i / columns
        south_height, north_height = south.height(x, ys), north.height(x, yn)
        bottom = min(south_height, north_height) - .045
        heights = [south.height(x, ys - apron) + .008, south_height + .010,
                   bottom, bottom, north_height + .010, north.height(x, yn + apron) + .008]
        vertices.extend((x, y, z) for y, z in zip(ysamples, heights))
        uvs.extend(((x - x0) * .9, (y - seam) * 1.6) for y in ysamples)
        supports.append((x, seam, bottom - .08))
    faces = [(i * 6 + k, (i + 1) * 6 + k, (i + 1) * 6 + k + 1, i * 6 + k + 1)
             for i in range(columns) for k in range(5)]
    _shell(m, vertices, faces, .065, "tile_dark", uvs=uvs)
    _board(m, supports, width * .72, .14, "wood_dark", "roof_purlins")
    return {"north_boundary": yn, "south_boundary": ys, "x_range": [x0, x1], "width": width}


def roof(m, cx, cy, w, d, eave, rise, style="tile", ornate=False, seed=1, opening=None, clip=None):
    """Build a roof; optional RoofClip cuts every component in this local frame."""
    if clip is None:
        return _build_roof(m, cx, cy, w, d, eave, rise, style, ornate, seed, opening)
    from geometry import MeshBuilder
    temporary = MeshBuilder("roof_cut_source")
    _build_roof(temporary, cx, cy, w, d, eave, rise, style, ornate, seed, opening)
    clip.apply(temporary, m)


def _build_roof(m, cx, cy, w, d, eave, rise, style, ornate, seed, opening):
    rng = random.Random(seed)
    shape = _RoofSurface(cx, cy, w, d, eave, rise, style)
    a, b, ridge = shape.a, shape.b, shape.ridge
    thatch, rolling = shape.thatch, shape.rolling
    cut = (cx, cy, opening[0], opening[1]) if opening else None
    slopes = []
    for side in range(2 if thatch else 4):
        start, spread, run = shape.dimensions(side)
        sign = -1 if side in [0, 2] else 1
        surface = lambda s, v, side=side: shape.sample(side, s, v)[0]
        normal = lambda s, v, side=side: shape.sample(side, s, v)[1]
        slopes.append((surface, start, spread))
        outward = (0, sign) if side < 2 else (sign, 0)
        length = sum(math.dist(surface(0, j / 24), surface(0, (j + 1) / 24)) for j in range(24))
        _slope(m, surface, normal, start, spread, length, outward, cut, ornate, rng, thatch)
    if thatch:
        # Folded straw bundles bridge the crown; a thick cylindrical cap would
        # make this agricultural roof read as tiled or corrugated construction.
        x0 = cx - a
        while x0 < cx + a - 1e-6:
            x1 = min(cx + a, x0 + rng.uniform(.024, .032))
            end_south, end_north = rng.uniform(.40, .47), rng.uniform(.40, .47)
            vertices, uvs = [], []
            crest = rng.uniform(.008, .016)
            for yy in [-end_south, -.29, -.14, 0, .14, .29, end_north]:
                for k, x in enumerate([x0, (x0 + x1) / 2, x1]):
                    z = shape.height(x, cy + yy) + .035 + .035 * (1 - abs(yy) / .50)
                    vertices.append((x, cy + yy, z + (crest if k == 1 else 0)))
                    uvs.append((x * 2.2, yy * 1.7))
            faces = [(j * 3 + k, j * 3 + k + 1, (j + 1) * 3 + k + 1, (j + 1) * 3 + k)
                     for j in range(6) for k in range(2)]
            m.add(vertices, oriented(vertices, faces), "thatch", "ridge", False, uvs=uvs)
            x0 = x1
        for j in range(max(2, round(w / 1.2))):
            x = cx - a + .22 + j * (w - .44) / max(1, round(w / 1.2) - 1)
            points = []
            for k in range(9):
                yy = -.43 + .86 * k / 8
                points.append((x, cy + yy, shape.height(x, cy + yy) + .080 + .045 * (1 - abs(yy) / .43)))
            m.tube(points, .013, "thatch", "thatch_fibres", 6)
        inset = min(.95, a * .2, b * .35)
        for sign in [-1, 1]:
            gx = cx + sign * (a - inset)
            points = [(gx, cy - b + inset, eave - .20), (gx, cy + b - inset, eave - .20)]
            for j in range(33):
                yy = b - inset - 2 * (b - inset) * j / 32
                side = 1 if yy >= 0 else 0
                z = slopes[side][0](sign * (a - inset), abs(yy) / b)[2] - .23
                points.append((gx, cy + yy, z))
            face = tuple(range(len(points)))
            m.add(points, [tuple(reversed(face)) if sign < 0 else face], "earthwall", "gable")
        return
    for side in [0, 1]:
        surface, start, spread = slopes[side]
        for sign in [-1, 1]:
            points = [surface(sign * (start + spread * v), v) for v in [.035 + .965 * j / 24 for j in range(25)]]
            _ridge(m, points, .235, .145, cut)
    if not rolling:
        points = [(cx - ridge, cy, eave + rise), (cx + ridge, cy, eave + rise)]
        _board(m, [(x, y, z + .035) for x, y, z in points], .26, .045, "tile_dark", "ridge", cut)
        _ridge(m, points, .29, .17, cut)
        if not cut:
            for sign in [-1, 1]:
                _ridge_end(m, cx + sign * ridge, cy, eave + rise + .07, sign, ornate)


def pavilion_roof(m, cx, cy, radius, eave, rise, sides=6, ornate=False):
    """Polygonal roof with seated radial hips and individually laid tile waterways."""
    rng = random.Random(round(radius * 101) + sides)
    half = radius * math.sin(math.pi / sides)
    apothem = radius * math.cos(math.pi / sides)
    lift, corner = min(.33, .10 + radius * .045), min(.30, .08 + radius * .04)
    for sector in range(sides):
        angle = math.tau * (sector + .5) / sides
        out = Vector((math.cos(angle), math.sin(angle), 0))
        across = Vector((-math.sin(angle), math.cos(angle), 0))
        def sample(s, v, out=out, across=across):
            width = half * v
            ratio = abs(s) / max(width, 1e-8)
            z = eave + rise * max(0, 1 - v) ** 1.5 + lift * v ** 7 + corner * ratio ** 7 * v ** 4
            dzds = corner * 7 * ratio ** 6 * (1 if s >= 0 else -1) / max(width, 1e-8) * v ** 4
            dzdv = -rise * 1.5 * max(0, 1 - v) ** .5 + 7 * lift * v ** 6 - 3 * corner * ratio ** 7 * v ** 3
            p = Vector((cx, cy, z)) + out * (apothem * v) + across * s
            normal = (Vector((0, 0, 1)) - across * dzds - out * (dzdv / apothem)).normalized()
            return tuple(p), tuple(normal)
        surface = lambda s, v, sample=sample: sample(s, v)[0]
        normal = lambda s, v, sample=sample: sample(s, v)[1]
        length = sum(math.dist(surface(0, j / 24), surface(0, (j + 1) / 24)) for j in range(24))
        _slope(m, surface, normal, 0, half, length, (out.x, out.y), None, ornate, rng)
        points = [surface(-half * v, v) for v in [.045 + .955 * j / 24 for j in range(25)]]
        _ridge(m, points, .235, .145)
    profile = [(.26, 0), (.27, .035), (.27, .08), (.23, .105), (.21, .13), (.22, .18),
               (.25, .22), (.25, .25), (.21, .28), (.17, .31), (.12, .37), (.105, .43)]
    for i in range(13):
        angle = -math.pi / 2 + math.pi * i / 12
        profile.append((max(.009, .13 * math.cos(angle)), .56 + .13 * math.sin(angle)))
    profile.extend([(.025, .71), (.012, .77), (.003, .80)])
    m.lathe((cx, cy, eave + rise - .035), profile, "bronze" if ornate else "tile_dark", "finial", 32)
