#!/usr/bin/env python3
"""Task #267 — re-bake ONE champion glb with its object-data sphere attachment.

Why this exists (and why it is not `import_w3x.py`)
---------------------------------------------------
孫悟空's head is not in `goku.mdx`. It is `Gokuhead.mdx`, hung on the body by
the WC3 "Sphere" (`Asph`) ability `A0MI` whose object-data art field (`atat`)
names the file and whose `targetAttach0` names the attach point. `models.py`
only ever read the body's own MDX `ATCH` nodes, and across all 129 recovered
mdx there are ZERO ATCH nodes with a Path — so the merge branch had never run
on this map even once. Task #73 was supposed to sweep exactly this class and
instead re-read "sphere attachment" as "stray round billboard to delete".
`w3xlib/models.py` now reads that object-data table, so a FULL re-import would
produce the head — but a full re-import is not available to us:

    108 of the 129 shipped glbs are no longer byte-identical to
    tools/w3x-import/out/GoDieEX22s/glb/, and the shipped set carries the
    results of #17 / #32 / #59 / #68 / #73 / #162 / #168. Re-running
    import_w3x.py rewrites all 129 and would roll those back.

So this script converts exactly ONE mdx through the real pipeline (same
w3xlib, same two-pass hero-height rule) and then PROVES the new file is the
old file plus the attachment, before it overwrites anything:

  * every pre-existing primitive keeps its vertex/triangle count, its material
    name and its texture bytes, and its positions differ from the shipped file
    by ONE uniform factor (the #150 re-normalisation) and nothing else;
  * the node list is identical name-for-name (so #68's clip fixes, #162/#168's
    root flattening and every attach point still address the same joints);
  * every animation keeps its name, its channel set and its ROTATION keys
    BIT-FOR-BIT (rotations do not scale) — that is the #68 no-regression proof;
  * translation keys differ by the same single factor;
  * no material may be named `TeamGlow*` (the #73 guard) and no primitive may
    reappear that the shipped file had dropped (#17/#59).

Any violation aborts with a diff and writes nothing.

Usage:
    python3 tools/w3x-import/merge_sphere_attachments.py --check   # report only
    python3 tools/w3x-import/merge_sphere_attachments.py --write   # overwrite
    python3 tools/w3x-import/merge_sphere_attachments.py --write --only goku.mdx
"""

from __future__ import annotations

import argparse
import json
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)

from w3xlib import models as M                      # noqa: E402
from w3xlib.gltf import convert                     # noqa: E402
from w3xlib.mdx import parse_mdx                    # noqa: E402

RAW_DIR = os.path.join(HERE, "out", "GoDieEX22s", "raw")
GLB_DIR = os.path.join(REPO, "content", "assets", "models", "imported")

# body mdx -> shipped glb basename. Only bodies with an ENABLED row in
# models.SPHERE_BAKE_ALLOW are rebuilt; the rest are reported.
TARGETS = {"goku.mdx": "goku.glb"}

# The re-normalisation is expected and intended: the shipped goku.glb was
# scaled so a HEADLESS body filled the 1.7u hero height (#150), which made the
# torso ~29% oversized. With the head merged the same rule measures the real
# silhouette, so the body shrinks and the FULL height barely moves
# (1.745 -> 1.700). Anything outside this window means something else changed.
SCALE_WINDOW = (0.60, 1.05)


# ---------------------------------------------------------------------------
# glb container (same framing as strip_geoset_prims.py / fix_clip_orientation.py)
# ---------------------------------------------------------------------------

def read_glb(path: str) -> tuple[dict, bytes]:
    with open(path, "rb") as fh:
        data = fh.read()
    magic, _ver, _len = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67:
        raise ValueError(f"{path}: not a glb")
    off, gltf, binary = 12, None, b""
    while off < len(data):
        clen, ctype = struct.unpack_from("<II", data, off)
        off += 8
        chunk = data[off:off + clen]
        off += clen
        if ctype == 0x4E4F534A:
            gltf = json.loads(chunk.decode("utf-8"))
        elif ctype == 0x004E4942:
            binary = chunk
    if gltf is None:
        raise ValueError(f"{path}: no JSON chunk")
    return gltf, binary


def parse_glb_bytes(blob: bytes) -> tuple[dict, bytes]:
    off, gltf, binary = 12, None, b""
    while off < len(blob):
        clen, ctype = struct.unpack_from("<II", blob, off)
        off += 8
        chunk = blob[off:off + clen]
        off += clen
        if ctype == 0x4E4F534A:
            gltf = json.loads(chunk.decode("utf-8"))
        elif ctype == 0x004E4942:
            binary = chunk
    return gltf, binary


def _bv(g: dict, b: bytes, i: int) -> bytes:
    v = g["bufferViews"][i]
    o = v.get("byteOffset", 0)
    return b[o:o + v["byteLength"]]


def acc_floats(g: dict, b: bytes, ai: int) -> list[float]:
    acc = g["accessors"][ai]
    blob = _bv(g, b, acc["bufferView"])[acc.get("byteOffset", 0):]
    ncomp = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[acc["type"]]
    n = acc["count"] * ncomp
    return list(struct.unpack_from("<%df" % n, blob, 0))


def acc_raw(g: dict, b: bytes, ai: int) -> bytes:
    acc = g["accessors"][ai]
    blob = _bv(g, b, acc["bufferView"])[acc.get("byteOffset", 0):]
    ncomp = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[acc["type"]]
    size = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}[acc["componentType"]]
    return blob[:acc["count"] * ncomp * size]


def prim_sig(g: dict, b: bytes, prim: dict) -> dict:
    pos = g["accessors"][prim["attributes"]["POSITION"]]
    return {
        "verts": pos["count"],
        "tris": g["accessors"][prim["indices"]]["count"] // 3,
        "material": (g.get("materials") or [{}])[prim.get("material", 0)].get("name"),
        "min": pos.get("min"), "max": pos.get("max"),
    }


# ---------------------------------------------------------------------------
# conversion
# ---------------------------------------------------------------------------

def rebuild(source: str) -> tuple[bytes, dict]:
    """Convert `source` through the real pipeline (with sphere attachments)."""
    path = None
    for cand in os.listdir(RAW_DIR):
        if cand.lower() == source.lower():
            path = os.path.join(RAW_DIR, cand)
            break
    if path is None:
        raise SystemExit(f"{source}: not found under {RAW_DIR}")
    model = parse_mdx(open(path, "rb").read())
    entry: dict = {"source": source}
    kind = M.classify(model)
    table = M.default_sphere_table(RAW_DIR)
    baked, skipped = M.bake_attachments(model, RAW_DIR, entry,
                                        sphere_table=table, source=source)
    if not baked:
        raise SystemExit(f"{source}: nothing baked (skipped={skipped}) — "
                         f"is there an enabled SPHERE_BAKE_ALLOW row?")
    textures_png: dict[int, bytes] = {}
    tex_alpha: dict[int, str] = {}
    for i, tex in enumerate(model.textures):
        if tex.replaceable_id or not tex.path:
            continue
        got = M._find_texture_png(RAW_DIR, tex.path)
        if got is not None:
            textures_png[i], tex_alpha[i] = got
    probe = convert(model, {}, 1.0, source)
    raw_h = probe.height
    scale = (M.HERO_TARGET_HEIGHT / raw_h
             if kind == "hero" and 10 < raw_h < 500 else M.DEFAULT_SCALE)
    res = convert(model, textures_png, scale, source, tex_alpha)
    entry.update({"kind": kind, "raw_height": round(raw_h, 3),
                  "scale_factor": scale, "height": round(res.height, 4),
                  "baked": baked, "skipped": skipped,
                  "dropped_effect_geosets": res.dropped_effect_geosets})
    return res.glb, entry


# ---------------------------------------------------------------------------
# no-regression verification
# ---------------------------------------------------------------------------

def verify(old_path: str, new_blob: bytes, expect_added: int) -> tuple[list, dict]:
    """Return (problems, facts). Empty problems == safe to write."""
    og, ob = read_glb(old_path)
    ng, nb = parse_glb_bytes(new_blob)
    bad: list[str] = []
    facts: dict = {}

    op = og["meshes"][0]["primitives"]
    np_ = ng["meshes"][0]["primitives"]
    facts["prims"] = [len(op), len(np_)]
    if len(np_) != len(op) + expect_added:
        bad.append(f"primitive count {len(op)} -> {len(np_)}, expected "
                   f"+{expect_added}")
        return bad, facts

    # --- uniform scale factor, derived from prim 0 and then checked everywhere
    o0 = acc_floats(og, ob, op[0]["attributes"]["POSITION"])
    n0 = acc_floats(ng, nb, np_[0]["attributes"]["POSITION"])
    if len(o0) != len(n0):
        bad.append("prim0 vertex count changed")
        return bad, facts
    ratios = [n / o for o, n in zip(o0, n0) if abs(o) > 1e-4]
    k = sum(ratios) / len(ratios)
    facts["scaleFactor"] = k
    if not (SCALE_WINDOW[0] <= k <= SCALE_WINDOW[1]):
        bad.append(f"uniform scale {k:.5f} outside expected window {SCALE_WINDOW}")
    spread = max(abs(r - k) for r in ratios)
    facts["scaleSpread"] = spread
    if spread > 2e-4:
        bad.append(f"prim0 is not a UNIFORM rescale (max deviation {spread:.2e}) "
                   f"— geometry was edited, not just re-normalised")

    # --- every pre-existing primitive: same counts/material/uv/joints, scaled pos
    for i, (o, n) in enumerate(zip(op, np_)):
        os_, ns_ = prim_sig(og, ob, o), prim_sig(ng, nb, n)
        if (os_["verts"], os_["tris"], os_["material"]) != \
           (ns_["verts"], ns_["tris"], ns_["material"]):
            bad.append(f"prim{i} changed: {os_} -> {ns_}")
            continue
        for attr in ("TEXCOORD_0", "JOINTS_0", "WEIGHTS_0"):
            if acc_raw(og, ob, o["attributes"][attr]) != \
               acc_raw(ng, nb, n["attributes"][attr]):
                bad.append(f"prim{i} {attr} changed")
        if acc_raw(og, ob, o["indices"]) != acc_raw(ng, nb, n["indices"]):
            bad.append(f"prim{i} index buffer changed")
        ov = acc_floats(og, ob, o["attributes"]["POSITION"])
        nv = acc_floats(ng, nb, n["attributes"]["POSITION"])
        dev = max((abs(nn - oo * k) for oo, nn in zip(ov, nv)), default=0.0)
        if dev > 1e-4:
            bad.append(f"prim{i} positions deviate from a uniform {k:.5f} "
                       f"rescale by {dev:.2e}")

    # --- #73 guard + #17/#59: no team-glow material, no resurrected effect prim
    for m in ng.get("materials", []):
        if str(m.get("name", "")).lower().startswith("teamglow"):
            bad.append(f"material {m['name']} would re-add a TeamGlow billboard (#73)")

    # --- skeleton: identical node names in identical order
    on = [x.get("name") for x in og["nodes"]]
    nn = [x.get("name") for x in ng["nodes"]]
    facts["nodes"] = [len(on), len(nn)]
    if on != nn:
        bad.append(f"node list changed: {len(on)} -> {len(nn)}")
    else:
        for i, (a, b_) in enumerate(zip(og["nodes"], ng["nodes"])):
            ta, tb = a.get("translation"), b_.get("translation")
            if (ta is None) != (tb is None):
                bad.append(f"node {on[i]} translation presence changed")
            elif ta is not None:
                d = max(abs(y - x * k) for x, y in zip(ta, tb))
                if d > 1e-6:
                    bad.append(f"node {on[i]} translation off uniform rescale by {d:.2e}")

    # --- animations: names + channels identical; ROTATIONS bit-identical (#68)
    oa = {a.get("name"): a for a in og.get("animations", [])}
    na = {a.get("name"): a for a in ng.get("animations", [])}
    facts["animations"] = [len(oa), len(na)]
    if sorted(oa) != sorted(na):
        bad.append(f"animation set changed: {sorted(oa)} -> {sorted(na)}")
    rot_checked = trans_checked = 0
    for name in sorted(set(oa) & set(na)):
        def chans(g, b, anim):
            out = {}
            for c in anim["channels"]:
                s = anim["samplers"][c["sampler"]]
                key = (g["nodes"][c["target"]["node"]].get("name"), c["target"]["path"])
                out[key] = (s.get("interpolation", "LINEAR"),
                            acc_raw(g, b, s["input"]), s["output"])
            return out
        oc, nc = chans(og, ob, oa[name]), chans(ng, nb, na[name])
        if sorted(oc) != sorted(nc):
            bad.append(f"clip '{name}' channel set changed")
            continue
        for key in oc:
            (oi, otime, oout), (ni, ntime, nout) = oc[key], nc[key]
            if oi != ni or otime != ntime:
                bad.append(f"clip '{name}' {key} interpolation/timing changed")
                continue
            ov = acc_floats(og, ob, oout)
            nv = acc_floats(ng, nb, nout)
            if key[1] in ("rotation", "scale"):
                if acc_raw(og, ob, oout) != acc_raw(ng, nb, nout):
                    bad.append(f"clip '{name}' {key} values changed (#68 regression?)")
                rot_checked += 1
            else:
                d = max((abs(y - x * k) for x, y in zip(ov, nv)), default=0.0)
                if d > 1e-6:
                    bad.append(f"clip '{name}' {key} off uniform rescale by {d:.2e}")
                trans_checked += 1
    facts["rotationScaleChannelsBitIdentical"] = rot_checked
    facts["translationChannelsRescaled"] = trans_checked

    # --- the new geometry actually arrived
    added = np_[len(op):]
    facts["added"] = [prim_sig(ng, nb, p) for p in added]
    for p in added:
        if g_tris(ng, p) <= 0:
            bad.append("the added primitive has no triangles")

    def bbox_top(g, b, prims):
        return max(g["accessors"][p["attributes"]["POSITION"]]["max"][1] for p in prims)
    facts["topY"] = [bbox_top(og, ob, op), bbox_top(ng, nb, np_)]
    if facts["topY"][1] <= facts["topY"][0] * k + 1e-6:
        bad.append("the merged model is no taller than the rescaled body — "
                   "the attachment did not land above it")
    return bad, facts


def g_tris(g: dict, prim: dict) -> int:
    return g["accessors"][prim["indices"]]["count"] // 3


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="overwrite the shipped glb")
    ap.add_argument("--check", action="store_true", help="report only (default)")
    ap.add_argument("--only", help="restrict to one body mdx")
    args = ap.parse_args()

    table = M.default_sphere_table(RAW_DIR)
    enabled = {body for body, _aid in M.SPHERE_BAKE_ALLOW}
    print(f"object-data sphere census: {sum(len(v) for v in table.values())} rows on "
          f"{len(table)} bodies; {len(M.SPHERE_BAKE_ALLOW)} enabled for baking\n")

    rc = 0
    for source, glb in sorted(TARGETS.items()):
        if args.only and args.only.lower() != source.lower():
            continue
        if source not in enabled:
            print(f"{source}: no enabled row — skipped")
            continue
        blob, entry = rebuild(source)
        out = os.path.join(GLB_DIR, glb)
        added = sum(b["geosets"] for b in entry["baked"])
        bad, facts = verify(out, blob, added)
        print(f"== {source} -> {glb}")
        print(f"   baked      : " + ", ".join(
            f"{b['path']} ({b['verts']}v) @ {b['node']} bound to {b['bind']}"
            for b in entry["baked"]))
        print(f"   raw height : {entry['raw_height']}  scale {entry['scale_factor']:.8f}"
              f"  -> body {entry['height']}")
        print(f"   prims      : {facts.get('prims')}   nodes {facts.get('nodes')}"
              f"   anims {facts.get('animations')}")
        print(f"   uniform k  : {facts.get('scaleFactor'):.6f} "
              f"(max deviation {facts.get('scaleSpread', 0):.2e})")
        print(f"   rot/scale channels bit-identical: "
              f"{facts.get('rotationScaleChannelsBitIdentical')}; "
              f"translation channels rescaled: "
              f"{facts.get('translationChannelsRescaled')}")
        print(f"   bbox top Y : {facts['topY'][0]:.4f} -> {facts['topY'][1]:.4f}")
        print(f"   added prims: {facts.get('added')}")
        if entry["skipped"]:
            print(f"   skipped    : {entry['skipped']}")
        if bad:
            rc = 1
            print("   !! REFUSING TO WRITE:")
            for b in bad:
                print(f"      - {b}")
            continue
        print("   OK — new file is the old file, uniformly re-normalised, plus "
              "the attachment")
        if args.write:
            with open(out, "wb") as fh:
                fh.write(blob)
            print(f"   wrote {out} ({len(blob)} bytes)")
        else:
            print("   (dry run; pass --write to overwrite)")
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
