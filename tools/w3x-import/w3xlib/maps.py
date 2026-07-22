"""Stage 5 — war3map.wpm (pathing) + war3map.doo (doodads) → arena draft.

The GGD arena format is two circular duel zones; a WC3 map is a big square.
Approximation (documented): find the two largest open discs in the pathing
grid, map each disc onto one zone circle (radius 24), turn unwalkable cell
clusters inside the disc into circle obstacles, and re-place nearby doodads
as decor using imported prop models (KayKit stand-ins otherwise).
"""

from __future__ import annotations

import math
import struct
from collections import deque

CELL = 32.0  # world units per pathing cell
NO_WALK = 0x02


def parse_wpm(data: bytes):
    if data[:4] != b"MP3W":
        raise ValueError("bad wpm magic")
    _ver, w, h = struct.unpack_from("<iII", data, 4)
    grid = data[16 : 16 + w * h]
    return w, h, grid


def parse_doo(data: bytes):
    if data[:4] != b"W3do":
        raise ValueError("bad doo magic")
    version, _sub, count = struct.unpack_from("<III", data, 4)
    pos = 16
    out = []
    for _ in range(count):
        type_id = data[pos : pos + 4].decode("latin-1")
        x, y, z, angle, sx, sy, sz = struct.unpack_from("<7f", data, pos + 8)
        pos += 36
        pos += 2  # flags + life
        if version >= 8:
            _item_table, n_sets = struct.unpack_from("<ii", data, pos)
            pos += 8
            for _ in range(max(0, n_sets)):
                n_items = struct.unpack_from("<i", data, pos)[0]
                pos += 4 + n_items * 8
        pos += 4  # editor id
        out.append({"type": type_id, "x": x, "y": y, "angle": angle, "scale": sx})
    return out


def _distance_field(w: int, h: int, grid: bytes) -> list[int]:
    """BFS cell distance to the nearest unwalkable cell (4-neighborhood)."""
    INF = 1 << 30
    dist = [INF] * (w * h)
    dq = deque()
    for i, flags in enumerate(grid):
        if flags & NO_WALK:
            dist[i] = 0
            dq.append(i)
    # map borders count as walls
    for x in range(w):
        for i in (x, (h - 1) * w + x):
            if dist[i] != 0:
                dist[i] = 0
                dq.append(i)
    for y in range(h):
        for i in (y * w, y * w + w - 1):
            if dist[i] != 0:
                dist[i] = 0
                dq.append(i)
    while dq:
        i = dq.popleft()
        d = dist[i] + 1
        x, y = i % w, i // w
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h:
                j = ny * w + nx
                if dist[j] > d:
                    dist[j] = d
                    dq.append(j)
    return dist


def find_open_discs(w: int, h: int, grid: bytes, count: int = 2):
    """Largest open discs (center cell, radius in cells), min separation."""
    dist = _distance_field(w, h, grid)
    order = sorted(range(w * h), key=lambda i: -dist[i])
    picks = []
    for i in order[: 200000]:
        if dist[i] < 6:
            break
        x, y = i % w, i // w
        ok = True
        for (px, py, pr) in picks:
            if math.hypot(x - px, y - py) < (pr + dist[i]) * 1.5:
                ok = False
                break
        if ok:
            picks.append((x, y, dist[i]))
            if len(picks) >= count:
                break
    return picks


def clusters_in_disc(w, h, grid, cx, cy, r):
    """Connected unwalkable clusters within the disc -> (cx, cy, radius)."""
    seen = set()
    out = []
    r2 = r * r
    for yy in range(max(0, cy - r), min(h, cy + r + 1)):
        for xx in range(max(0, cx - r), min(w, cx + r + 1)):
            if (xx - cx) ** 2 + (yy - cy) ** 2 > r2:
                continue
            i = yy * w + xx
            if i in seen or not (grid[i] & NO_WALK):
                continue
            # flood fill
            comp = []
            dq = deque([i])
            seen.add(i)
            while dq:
                j = dq.popleft()
                comp.append(j)
                jx, jy = j % w, j // w
                for nx, ny in ((jx-1, jy), (jx+1, jy), (jx, jy-1), (jx, jy+1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        k = ny * w + nx
                        if k not in seen and (grid[k] & NO_WALK) and \
                           (nx - cx) ** 2 + (ny - cy) ** 2 <= r2:
                            seen.add(k)
                            dq.append(k)
            mx = sum(j % w for j in comp) / len(comp)
            my = sum(j // w for j in comp) / len(comp)
            rad = max(1.0, math.sqrt(len(comp) / math.pi))
            out.append((mx, my, rad, len(comp)))
    return out


def build_arena(wpm_data: bytes, doo_data: bytes | None, decor_models: dict,
                arena_id: str, name: str) -> tuple[dict, dict]:
    """decor_models: wc3 doodad type prefix -> glb asset path (may be empty).
    Returns (arena_doc, report)."""
    w, h, grid = parse_wpm(wpm_data)
    discs = find_open_discs(w, h, grid, 2)
    report = {"grid": [w, h], "discs": discs, "zones": []}

    zone_centers = [(-40.0, 0.0), (40.0, 0.0)]
    BR = 24.0
    zones = []
    all_decor = []

    doodads = []
    if doo_data:
        try:
            doodads = parse_doo(doo_data)
        except Exception as exc:
            report["doo_error"] = str(exc)

    for zi, (cx, cy, r) in enumerate(discs[:2]):
        zcx, zcz = zone_centers[zi]
        scale = (BR * 0.9) / r  # our-units per cell
        obstacles = []
        for (mx, my, rad, area) in sorted(
            clusters_in_disc(w, h, grid, cx, cy, r), key=lambda c: -c[3]
        )[:8]:
            ox = zcx + (mx - cx) * scale
            oz = zcz + (my - cy) * scale
            orad = max(0.8, min(6.0, rad * scale))
            # keep spawn lanes clear
            if abs(oz) < 5 and abs(abs(ox - zcx) - (BR - 6)) < 5:
                continue
            obstacles.append({
                "kind": "circle",
                "center": {"x": round(ox, 1), "z": round(oz, 1)},
                "radius": round(orad, 2),
            })
        spawns = [
            [{"x": round(zcx - BR + 8, 1), "z": zz} for zz in (-4.0, 0.0, 4.0)],
            [{"x": round(zcx + BR - 8, 1), "z": zz} for zz in (-4.0, 0.0, 4.0)],
        ]
        zones.append({
            "id": f"zone-{zi}",
            "center": {"x": zcx, "z": zcz},
            "boundaryRadius": BR,
            "obstacles": obstacles,
            "spawns": spawns,
        })
        report["zones"].append({
            "disc_cells": [cx, cy, r], "scale": round(scale, 4),
            "obstacles": len(obstacles),
        })

        # decor from doodads inside this disc (wc3 world coords)
        # wpm cell (0,0) is the map's lower-left corner; world origin ~center
        wx0, wy0 = -w * CELL / 2, -h * CELL / 2
        placed = 0
        for d in doodads:
            gx = (d["x"] - wx0) / CELL
            gy = (d["y"] - wy0) / CELL
            if (gx - cx) ** 2 + (gy - cy) ** 2 > r * r:
                continue
            model = decor_models.get(d["type"]) or decor_models.get(d["type"][0])
            if not model:
                continue
            dx = zcx + (gx - cx) * scale
            dz = zcz + (gy - cy) * scale
            if math.hypot(dx - zcx, dz - zcz) > BR - 1.5:
                continue
            all_decor.append({
                "model": model,
                "x": round(dx, 1), "z": round(dz, 1),
                "rotQuarter": int(d["angle"] / (math.pi / 2)) % 4,
                "scale": round(max(0.5, min(2.5, d["scale"])), 2),
            })
            placed += 1
            if placed >= 25:
                break

    doc = {
        "id": arena_id,
        "schema": "arena@1",
        "name": name,
        "zones": zones,
        "decor": all_decor,
        "groundStyle": "dirt",
    }
    report["decor_count"] = len(all_decor)
    report["doodad_total"] = len(doodads)
    return doc, report
