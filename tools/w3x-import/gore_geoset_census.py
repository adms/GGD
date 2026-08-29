#!/usr/bin/env python3
"""Census: WC3 GORE geosets + stray second skeletons baked into champion .glb files.

WHY THIS EXISTS
---------------
owner 2026-08-02: 「初號機跟拳四郎一樣 3d model 連著屍體一起」.

Warcraft III unit models carry a ``gutz*`` geoset — the pool of blood/entrails a
corpse leaves behind. WC3 keeps it invisible until the decay sequence by
animating the geoset's alpha (GEOA/KGAO). Task #59 established that the mdx→glb
converter DROPS geoset visibility animation, so every one of those geosets lands
in the .glb as a primitive that is permanently drawable. Measured here:
``E00R.glb`` (初號機) carries a flat slab spanning x −0.03…1.64 at y 0.12…0.26 on
a body ~1.7u tall — a corpse-sized splat lying on the floor beside the champion.

WHY THE EXISTING TOOLS ARE GREEN ON IT
--------------------------------------
Two blind spots, both real:

  * ``strip_geoset_prims.py`` hardcodes ``GLB_DIR = content/assets/models/imported``
    (line 35). ``data/blizzard-overlay/models/`` — where 40 of the 40 extracted
    Warcraft III unit models live — was never in range.
  * ``invisible_prim_census.py`` DOES scan the overlay tree, but it selects on
    ``baseColorFactor[3] == 0``. Gore primitives have no ``baseColorFactor`` at
    all, so that census is green on them by construction.

This tool selects on the SKIN instead: which joints a primitive's vertices are
actually weighted to. That is the property the defect has.

WHAT IT REPORTS, PER .glb
-------------------------
  * ``gorePrimitives`` — primitives with ≥50% of their vertex weight on a joint
    whose name matches ``gutz`` (case-insensitive).
  * ``bodyRoots`` — every skeleton root (a skin joint whose parent is not itself
    a joint) that owns drawable geometry, with its vertex count and how many of
    its joints any animation channel drives. A model with TWO animated roots
    that both own real geometry is rendering two bodies: ``Umal.glb`` (拳四郎)
    has ``Bone_Root`` (303 verts) AND ``Bone_Root01`` (107 verts, standing ~1.2u
    away in +Z), and all 13 clips drive both — the second one walks, attacks and
    dies alongside you.

⚠️ A SECOND ROOT IS NOT AUTOMATICALLY A DEFECT — READ THE VERTEX COUNTS.
``H021.glb`` and ``Hblm.glb`` (賈修) have exactly one skeleton and it is NAMED
``Bone_Root01`` (there is no ``Bone_Root``). Hiding "the ``Bone_Root01`` subtree"
on those two would delete the whole champion. That is why this tool emits
per-root vertex counts and animation coverage rather than a verdict, and why the
content field it feeds is a PRIMITIVE INDEX list: the primitive is the drawable,
so an index cannot silently mean something different than what you looked at.

OUTPUT
------
    python3 gore_geoset_census.py                # human-readable table
    python3 gore_geoset_census.py --fixture PATH # write the committed fixture

The fixture is what makes the guard runnable on CI: ``data/blizzard-overlay/`` is
gitignored, so a test that only ran "when the file is present" would be a silent
no-op everywhere it matters. ``apps/client/src/render/views/hiddenPrimitives.test.ts``
compares the committed fingerprint against ``content/models/*.json`` ALWAYS, and
re-derives it from the real bytes whenever the tree happens to be there.

No deps; reads the glTF JSON + BIN chunks directly.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))

# Both corpora a champion can resolve to. The overlay tree is gitignored runtime
# state (task #10/#177) — scanned when present, reported as absent otherwise.
GLB_ROOTS = [
    os.path.join(REPO, "content", "assets", "models"),
    os.path.join(REPO, "data", "blizzard-overlay", "models"),
]

#: Joint-name marker for Warcraft III's blood/entrails geoset.
GORE_JOINT_MARKER = "gutz"

#: A primitive counts as gore when this much of its skin weight sits on gore joints.
GORE_WEIGHT_SHARE = 0.5

_COMPONENT = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2),
              5125: ("I", 4), 5126: ("f", 4)}
_NUM_COMPONENTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}



def _min_y(gltf, prim_indices):
    """這幾個圖元在 Y 軸上最低到哪裡（⭐ 讀 accessor 的 `min`,⛔ 不解 buffer）。

    ⚠️ 圖元索引是**跨 mesh 連號**的（與 `gorePrimitives.primitive` 同一套）。
    量不到就回 `None` —— ⭐ 消費端要能分辨「沒有量到」與「量到 0」。
    """
    if not prim_indices:
        return None
    want = set(prim_indices)
    seen = 0
    lows = []
    for mesh in gltf.get("meshes", []):
        for prim in mesh.get("primitives", []):
            if seen in want:
                acc = gltf["accessors"][prim["attributes"]["POSITION"]]
                mn = acc.get("min")
                if isinstance(mn, list) and len(mn) >= 2:
                    lows.append(float(mn[1]))
            seen += 1
    return min(lows) if lows else None


def read_glb(path: str):
    """(gltf-json, bin-chunk) from a binary .glb."""
    with open(path, "rb") as fh:
        data = fh.read()
    magic, _ver, total = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67:
        raise ValueError(f"not a .glb: {path}")
    off, gltf, binc = 12, None, None
    while off < total:
        clen, ctype = struct.unpack_from("<II", data, off)
        off += 8
        chunk = data[off:off + clen]
        off += clen
        if ctype == 0x4E4F534A:
            gltf = json.loads(chunk.decode("utf-8"))
        elif ctype == 0x004E4942:
            binc = chunk
    if gltf is None:
        raise ValueError(f"no JSON chunk: {path}")
    return gltf, binc


def read_accessor(gltf, binc, index):
    acc = gltf["accessors"][index]
    ncomp = _NUM_COMPONENTS[acc["type"]]
    fmt, size = _COMPONENT[acc["componentType"]]
    view = gltf["bufferViews"][acc["bufferView"]]
    base = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    stride = view.get("byteStride") or (ncomp * size)
    return [struct.unpack_from("<" + fmt * ncomp, binc, base + i * stride)
            for i in range(acc["count"])]


def census_one(path: str) -> dict:
    gltf, binc = read_glb(path)
    nodes = gltf.get("nodes", [])
    names = [n.get("name", "") for n in nodes]
    parent = {}
    for i, node in enumerate(nodes):
        for child in node.get("children", []):
            parent[child] = i

    out = {"file": os.path.basename(path), "gorePrimitives": [], "bodyRoots": [],
           "primitiveCount": 0}
    skins = gltf.get("skins", [])
    if not skins:
        return out
    joints = skins[0]["joints"]
    joint_set = set(joints)

    def root_of(j):
        cur = j
        while parent.get(cur) in joint_set:
            cur = parent[cur]
        return cur

    joint_root = {j: root_of(j) for j in joints}

    driven = set()
    for anim in gltf.get("animations", []):
        for ch in anim.get("channels", []):
            t = ch.get("target", {}).get("node")
            if t is not None:
                driven.add(t)

    root_verts, root_prims = {}, {}
    for ni, node in enumerate(nodes):
        if "mesh" not in node or node.get("skin") is None:
            continue
        mesh = gltf["meshes"][node["mesh"]]
        jl = skins[node["skin"]]["joints"]
        out["primitiveCount"] = max(out["primitiveCount"], len(mesh.get("primitives", [])))
        for pi, prim in enumerate(mesh.get("primitives", [])):
            attrs = prim["attributes"]
            if "JOINTS_0" not in attrs or "WEIGHTS_0" not in attrs:
                continue
            vcount = gltf["accessors"][attrs["POSITION"]]["count"]
            J = read_accessor(gltf, binc, attrs["JOINTS_0"])
            W = read_accessor(gltf, binc, attrs["WEIGHTS_0"])
            wnorm = {5121: 255.0, 5123: 65535.0}.get(
                gltf["accessors"][attrs["WEIGHTS_0"]]["componentType"], 1.0)
            by_root, gore_w, total_w = {}, 0.0, 0.0
            for jv, wv in zip(J, W):
                for k in range(4):
                    w = wv[k] / wnorm
                    if w <= 1e-4:
                        continue
                    gj = jl[jv[k]]
                    total_w += w
                    if GORE_JOINT_MARKER in names[gj].lower():
                        gore_w += w
                    rn = names[joint_root[gj]]
                    by_root[rn] = by_root.get(rn, 0.0) + w
            if total_w <= 0:
                continue
            if gore_w / total_w >= GORE_WEIGHT_SHARE:
                out["gorePrimitives"].append({
                    "mesh": node["mesh"], "primitive": pi, "vertices": vcount,
                    "goreWeightShare": round(gore_w / total_w, 4),
                    "joints": sorted({names[jl[jv[k]]] for jv in J for k in range(4)
                                      if GORE_JOINT_MARKER in names[jl[jv[k]]].lower()}),
                })
            top = max(by_root, key=by_root.get)
            root_verts[top] = root_verts.get(top, 0) + vcount
            root_prims.setdefault(top, []).append(pi)

    for r in joints:
        if joint_root[r] != r:
            continue
        name = names[r]
        if root_verts.get(name, 0) <= 0:
            continue
        prims_here = sorted(root_prims.get(name, []))
        out["bodyRoots"].append({
            "joint": name,
            "vertices": root_verts[name],
            "primitives": prims_here,
            "animatedJoints": sum(1 for j in joints if joint_root[j] == r and j in driven),
            "subtreeJoints": sum(1 for j in joints if joint_root[j] == r),
            # ⭐ **量到的**幾何（GH#558②）：這個 root 的圖元在 Y 軸上最低到哪裡。
            #
            # ⚠️ 為什麼需要它：消費端 `hiddenPrimitives.test.ts` 原本只用
            #   `vertices >= 100` 當「這是不是第二具身體」的**代理值** ——
            #   而 E00S（白木老樹精）的兩顆浮空球各只有 **25 頂點**，
            #   ⭐ 正好落在門檻的另一邊 ⇒ 閘對這一整類**結構上失明**
            #   （CLAUDE.md 失敗形態⑩：一個極端值落在門檻另一邊）。
            #
            # ⭐ 有了 `minY`，消費端問得出「它是不是**浮在本體之上**」——
            #   ⛔ 那是量到的事實，不是頂點數這個代理。
            "minY": _min_y(gltf, prims_here),
        })
    out["bodyRoots"].sort(key=lambda e: -e["vertices"])
    return out


def scan() -> list[dict]:
    seen, rows = set(), []
    for root in GLB_ROOTS:
        if not os.path.isdir(root):
            print(f"# absent (skipped): {root}", file=sys.stderr)
            continue
        for p in sorted(glob.glob(os.path.join(root, "**", "*.glb"), recursive=True)):
            key = os.path.basename(p)
            if key in seen:
                continue
            seen.add(key)
            try:
                row = census_one(p)
            except Exception as exc:  # noqa: BLE001 — report, never abort the sweep
                row = {"file": key, "error": str(exc)}
            row["path"] = os.path.relpath(p, REPO)
            rows.append(row)
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixture", help="write the committed census fixture here")
    args = ap.parse_args()

    rows = scan()
    gore = [r for r in rows if r.get("gorePrimitives")]
    multi = [r for r in rows if len([b for b in r.get("bodyRoots", []) if b["vertices"] >= 40
                                     and b["animatedJoints"] > 0]) > 1]

    print(f"scanned {len(rows)} .glb")
    print(f"\n== {len(gore)} with GORE geometry ==")
    for r in gore:
        for g in r["gorePrimitives"]:
            print(f"  {r['file']:16s} mesh{g['mesh']}/prim{g['primitive']:<2d} "
                  f"{g['vertices']:4d}v  share={g['goreWeightShare']}  {g['joints']}")
    print(f"\n== {len(multi)} with >1 animated body root ==")
    for r in multi:
        roots = [b for b in r["bodyRoots"] if b["vertices"] >= 40 and b["animatedJoints"] > 0]
        print(f"  {r['file']:16s} " + "  ".join(
            f"{b['joint']}({b['vertices']}v prims={b['primitives']})" for b in roots))

    if args.fixture:
        # ONLY the gitignored overlay tree goes in the fixture. `content/assets/`
        # is git-tracked, so the guard re-derives that half from the real bytes
        # on every run — freezing it would be failure form ⑤ (被測的不是出貨的
        # 那個). The overlay half cannot be re-derived on CI at all, which is
        # exactly why it needs a committed fingerprint instead of a
        # "skip when the file is missing" that silently passes everywhere.
        overlay = [r for r in rows if r["path"].startswith("data" + os.sep)]
        if not overlay:
            print("\n✖ overlay tree absent — refusing to write an empty fixture", file=sys.stderr)
            return 1
        payload = {
            "note": "generated by tools/w3x-import/gore_geoset_census.py — do not hand-edit",
            "source": "data/blizzard-overlay/models (gitignored; see task #10/#177)",
            "goreJointMarker": GORE_JOINT_MARKER,
            "goreWeightShare": GORE_WEIGHT_SHARE,
            "models": {r["file"]: {k: v for k, v in r.items() if k not in ("file", "path")}
                       for r in overlay},
        }
        rows = overlay
        with open(args.fixture, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=2, sort_keys=True)
            fh.write("\n")
        print(f"\nfixture → {args.fixture} ({len(rows)} models)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
