"""
decimate — quadric-error-metric (QEM) half-edge collapse, pure stdlib.

WHY QEM AND NOT VERTEX CLUSTERING. Clustering (snap vertices to a grid) is ten
lines and O(n), but it merges across UV seams and shatters a character's texture
mapping. These are skinned characters carrying JOINTS_0/WEIGHTS_0 — a LOD that
mangles the atlas or invents a bone weight is worse than no LOD.

The collapse is a HALF-edge collapse: the survivor is always one of the two
original vertices, never a new averaged point. That is what makes it safe for
arbitrary attributes — normals, tangents, UVs, joints and weights are INHERITED
from a real vertex, so nothing is ever interpolated into a value the rig never
had (an averaged JOINTS_0 is a different bone entirely).

TWO VERTEX SPACES, and why both are needed. A .glb splits one geometric vertex
into several index-space copies wherever an attribute is discontinuous — a UV
seam, a hard shading edge. Running the collapse in raw index space therefore
sees a mesh made almost entirely of "boundaries" and barely reduces: measured on
KayKit `mage.glb`, a 28% target only reached 67%. So:

  * TOPOLOGY runs on POSITION-WELDED vertices, where the character is a proper
    closed manifold and edges genuinely have two faces. Only a real silhouette
    border is a boundary, and only it is pinned.
  * ATTRIBUTES stay in raw index space. When welded group D collapses into group
    S, each raw copy in D is re-pointed at the copy of S whose UV is nearest, so
    a seam lands on the matching side of the seam it merges into rather than
    teleporting across the atlas.

Normal-flip rejection keeps the collapse from turning a limb inside out.
"""

from __future__ import annotations

import heapq
from collections import defaultdict

WELD_EPS = 1e-5


def _plane_quadric(p0, p1, p2):
    """Fundamental error quadric (10 upper-triangle floats) of a triangle plane."""
    ux, uy, uz = p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]
    vx, vy, vz = p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]
    a = uy * vz - uz * vy
    b = uz * vx - ux * vz
    c = ux * vy - uy * vx
    length = (a * a + b * b + c * c) ** 0.5
    if length < 1e-12:
        return None
    a, b, c = a / length, b / length, c / length
    d = -(a * p0[0] + b * p0[1] + c * p0[2])
    return (a * a, a * b, a * c, a * d, b * b, b * c, b * d, c * c, c * d, d * d)


def _quadric_error(q, p) -> float:
    x, y, z = p
    return (
        q[0] * x * x
        + 2 * q[1] * x * y
        + 2 * q[2] * x * z
        + 2 * q[3] * x
        + q[4] * y * y
        + 2 * q[5] * y * z
        + 2 * q[6] * y
        + q[7] * z * z
        + 2 * q[8] * z
        + q[9]
    )


def _normal(p0, p1, p2):
    ux, uy, uz = p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]
    vx, vy, vz = p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]
    return (uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)


def decimate(positions, indices, target_ratio: float, uvs=None):
    """
    positions: flat [x,y,z,...] in RAW index space
    indices:   flat triangle list in RAW index space
    uvs:       optional flat [u,v,...] used only to pick the seam-side survivor
    returns:   new flat index list in RAW index space (caller compacts)
    """
    vcount = len(positions) // 3
    if vcount == 0 or len(indices) < 3:
        return list(indices)
    pos = [(positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]) for i in range(vcount)]

    # --- weld ---------------------------------------------------------------
    group_of = [0] * vcount
    key_to_group: dict[tuple, int] = {}
    group_members: list[list[int]] = []
    group_pos: list[tuple] = []
    quant = 1.0 / WELD_EPS
    for i, p in enumerate(pos):
        key = (round(p[0] * quant), round(p[1] * quant), round(p[2] * quant))
        g = key_to_group.get(key)
        if g is None:
            g = len(group_members)
            key_to_group[key] = g
            group_members.append([])
            group_pos.append(p)
        group_of[i] = g
        group_members[g].append(i)
    gcount = len(group_members)

    raw_tris = [
        (indices[i], indices[i + 1], indices[i + 2]) for i in range(0, len(indices) - 2, 3)
    ]
    tris = []          # welded triangles, index-aligned with raw_tris
    kept_raw = []
    for a, b, c in raw_tris:
        ga, gb, gc = group_of[a], group_of[b], group_of[c]
        if ga == gb or gb == gc or ga == gc:
            continue  # already degenerate in the source
        tris.append([ga, gb, gc])
        kept_raw.append([a, b, c])
    if not tris:
        return list(indices)

    # --- quadrics + adjacency ------------------------------------------------
    quadrics = [(0.0,) * 10 for _ in range(gcount)]
    vert_tris = defaultdict(set)
    edge_faces = defaultdict(int)
    for ti, (a, b, c) in enumerate(tris):
        q = _plane_quadric(group_pos[a], group_pos[b], group_pos[c])
        if q is not None:
            for v in (a, b, c):
                quadrics[v] = tuple(x + y for x, y in zip(quadrics[v], q))
        for v in (a, b, c):
            vert_tris[v].add(ti)
        for u, v in ((a, b), (b, c), (c, a)):
            edge_faces[(u, v) if u < v else (v, u)] += 1

    boundary = set()
    for (u, v), n in edge_faces.items():
        if n != 2:
            boundary.add(u)
            boundary.add(v)

    alive = [True] * gcount

    def cost(u: int, v: int):
        if u in boundary or v in boundary:
            return None
        merged = tuple(x + y for x, y in zip(quadrics[u], quadrics[v]))
        cu = _quadric_error(merged, group_pos[u])
        cv = _quadric_error(merged, group_pos[v])
        return (cu, v, u) if cu <= cv else (cv, u, v)  # (error, dying, surviving)

    heap = []
    for (u, v) in edge_faces:
        c = cost(u, v)
        if c is not None:
            heapq.heappush(heap, (c[0], c[1], c[2], 0))

    version = defaultdict(int)
    live_tris = len(tris)
    target_tris = max(4, int(live_tris * target_ratio))
    dead = [False] * len(tris)

    def flips(dying: int, surviving: int) -> bool:
        for ti in vert_tris[dying]:
            if dead[ti]:
                continue
            a, b, c = tris[ti]
            if surviving in (a, b, c):
                continue  # this triangle collapses away
            before = _normal(group_pos[a], group_pos[b], group_pos[c])
            na = surviving if a == dying else a
            nb = surviving if b == dying else b
            nc = surviving if c == dying else c
            after = _normal(group_pos[na], group_pos[nb], group_pos[nc])
            if before[0] * after[0] + before[1] * after[1] + before[2] * after[2] <= 0:
                return True
        return False

    def uv_of(raw: int):
        if uvs is None or 2 * raw + 1 >= len(uvs):
            return None
        return (uvs[2 * raw], uvs[2 * raw + 1])

    raw_remap = list(range(vcount))

    def pick_survivor_copy(raw: int, surviving_group: int) -> int:
        """The copy of `surviving_group` whose UV is closest to `raw`'s."""
        members = group_members[surviving_group]
        if len(members) == 1:
            return members[0]
        here = uv_of(raw)
        if here is None:
            return members[0]
        best = members[0]
        best_d = None
        for m in members:
            there = uv_of(m)
            if there is None:
                continue
            d = (here[0] - there[0]) ** 2 + (here[1] - there[1]) ** 2
            if best_d is None or d < best_d:
                best_d, best = d, m
        return best

    while heap and live_tris > target_tris:
        _err, dying, surviving, ver = heapq.heappop(heap)
        if not alive[dying] or not alive[surviving] or ver != version[dying]:
            continue
        if flips(dying, surviving):
            continue

        for raw in group_members[dying]:
            raw_remap[raw] = pick_survivor_copy(raw, surviving)

        for ti in list(vert_tris[dying]):
            if dead[ti]:
                continue
            tri = tris[ti]
            if surviving in tri:
                dead[ti] = True
                live_tris -= 1
                for v in tri:
                    vert_tris[v].discard(ti)
                continue
            tris[ti] = [surviving if v == dying else v for v in tri]
            vert_tris[surviving].add(ti)
        vert_tris[dying].clear()

        alive[dying] = False
        group_members[surviving] = group_members[surviving] + group_members[dying]
        quadrics[surviving] = tuple(x + y for x, y in zip(quadrics[surviving], quadrics[dying]))
        version[surviving] += 1

        neighbours = set()
        for ti in vert_tris[surviving]:
            if not dead[ti]:
                neighbours.update(tris[ti])
        neighbours.discard(surviving)
        for other in neighbours:
            if not alive[other]:
                continue
            c = cost(surviving, other)
            if c is not None:
                heapq.heappush(heap, (c[0], c[1], c[2], version[c[1]]))

    # resolve chained collapses (raw a → raw b → raw c)
    for i in range(vcount):
        root = i
        seen = 0
        while raw_remap[root] != root and seen < vcount:
            root = raw_remap[root]
            seen += 1
        raw_remap[i] = root

    out: list[int] = []
    for ti, raw in enumerate(kept_raw):
        if dead[ti]:
            continue
        a, b, c = (raw_remap[v] for v in raw)
        if a == b or b == c or a == c:
            continue
        out.extend((a, b, c))
    return out
