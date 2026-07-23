#!/usr/bin/env python3
"""Task #162 — kill the "flies up while standing" defect (root-motion float).

THE DEFECT CLASS
----------------
ChampionView.tryUpgradeToGlb grounds every imported rig ONCE, in bind/rest
pose: it scales the model to TARGET_HEIGHT, measures the skinned bounding box,
and shifts `glbRoot.y = -min.y` so the lowest vertex sits on the arena floor
(y=0). THEN it plays the idle clip (looping). Grounding therefore assumes the
idle pose ≈ the bind pose. If the idle/stand clip carries a root-bone
TRANSLATION whose Y rises above the bind value, the whole skinned figure lifts
off the floor the instant the clip starts — the model "站立時飛上天".

黑崎一護 (imported.heroichigo) is the reported case. Its skeleton root joint is
`bone_waist` (node 39, directly under `Armature`, parent of the legs, chest,
arms and head — it rigidly carries the entire body). Bind translation is
(-0.0763, +1.1460, -0.0026). The four STAND-POSE clips, however, pin bone_waist
to a single corrupt keyframe (+1.3553, +6.3865, -0.0026):

    idle → "stand"  (and hurt → "stand")   ... the clipMap-played one
    "stand 2", "stand alternate", "stand alternate 2"  ... the same corruption

That +6.3865 vs bind +1.1460 is a +5.2404 native-unit lift; at the model's
height-normalise scale (1.8 / 1.946 ≈ 0.925) it floats ≈ +4.85 WORLD units up —
the hero shoots into the sky. The keyframe's X is ALSO garbage (+1.3553 vs bind
-0.0763, a +1.43-unit lateral shove); only Z already matches bind. A roster-wide
sweep (float_sweep_162.py) found heroichigo is the ONLY champion with this
defect — every other rig's idle-clip root-Y drift is ≤ 0.06 world units.

THE FIX (surgical, byte-minimal — NOT a full re-import)
------------------------------------------------------
Each target clip's bone_waist translation is a SINGLE constant keyframe living
in its own dedicated 12-byte bufferView (unshared). There is no horizontal
MOTION to preserve — just a corrupt constant offset — so the faithful grounded
value is the node's BIND translation. We overwrite those 3 floats in-place with
the bind translation, which zeroes BOTH the +5.24 vertical float and the +1.43
lateral shove and makes "stand" a clean, grounded, centred idle pose that
matches the bind pose grounding measured. Every other byte of the GLB — the
skeleton, the mesh, all 19 animations incl. the untouched "stand ready" idle and
the "dissipate" death-poof — is left BYTE-IDENTICAL. Idempotent: re-running on an
already-fixed glb is a no-op.

General policy (for any future job): a defective root track that is a single
constant keyframe is flattened to the node's bind translation (all axes, since
the horizontal value is a corrupt constant, not motion). A MULTI-keyframe track
would instead have only its Y flattened to the grounded value, preserving the
authored horizontal motion — but no such case exists in the current roster.

Run:  python3 flatten_root_float.py            # apply every job
      python3 flatten_root_float.py --check     # report only, write nothing
"""
from __future__ import annotations

import json
import os
import struct
import sys

GLB_DIR = "/Users/Takuro/GGD/content/assets/models/imported"

# glb stem -> {root: node index of the skeleton-root joint,
#              clips: [clip names whose root translation lifts the figure]}
# The root node's BIND translation is the grounded value we flatten to.
JOBS: dict[str, dict] = {
    "heroichigo": {
        "root": 39,  # bone_waist
        "clips": ["stand", "stand 2", "stand alternate", "stand alternate 2"],
    },
}

_MAGIC = 0x46546C67
_JSON = 0x4E4F534A
_BIN = 0x004E4942


def parse_glb(buf: bytes):
    """Return (json_dict, json_start, json_len, bin_start, bin_len)."""
    magic, ver, length = struct.unpack_from("<III", buf, 0)
    assert magic == _MAGIC, "not a GLB"
    off = 12
    js = None
    json_start = json_len = bin_start = bin_len = None
    while off < length:
        clen, ctype = struct.unpack_from("<II", buf, off)
        off += 8
        if ctype == _JSON:
            js = json.loads(buf[off : off + clen].decode("utf-8"))
            json_start, json_len = off, clen
        elif ctype == _BIN:
            bin_start, bin_len = off, clen
        off += clen
    return js, json_start, json_len, bin_start, bin_len


def process(stem: str, spec: dict, check: bool) -> bool:
    path = os.path.join(GLB_DIR, stem + ".glb")
    with open(path, "rb") as f:
        buf = bytearray(f.read())
    js, _js0, _jsl, bin_start, _binl = parse_glb(bytes(buf))
    nodes = js["nodes"]
    root = spec["root"]
    bind = nodes[root].get("translation", [0.0, 0.0, 0.0])
    bx, by, bz = float(bind[0]), float(bind[1]), float(bind[2])
    rname = nodes[root].get("name", f"node{root}")
    print(f"\n{stem}.glb — root joint '{rname}' (node {root}) "
          f"bind T=({bx:+.4f},{by:+.4f},{bz:+.4f})")

    by_name = {a.get("name"): a for a in js.get("animations", [])}
    changed = False
    for clip in spec["clips"]:
        anim = by_name.get(clip)
        if anim is None:
            print(f"  ! clip '{clip}' not found — skipped")
            continue
        # find the translation channel targeting the root node
        chan = None
        for ch in anim["channels"]:
            t = ch["target"]
            if t.get("path") == "translation" and t["node"] == root:
                chan = ch
                break
        if chan is None:
            print(f"  · clip '{clip}': no root translation track (already grounded)")
            continue
        samp = anim["samplers"][chan["sampler"]]
        acc = js["accessors"][samp["output"]]
        assert acc["type"] == "VEC3" and acc["componentType"] == 5126, "expect VEC3 float"
        bv = js["bufferViews"][acc["bufferView"]]
        base = bin_start + bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
        stride = bv.get("byteStride") or 12
        n = acc["count"]
        multi = n > 1
        clip_changed = False
        oldY = None
        for i in range(n):
            o = base + i * stride
            x, y, z = struct.unpack_from("<fff", buf, o)
            if oldY is None:
                oldY = y
            if multi:
                # preserve authored horizontal motion; flatten only the vertical
                nx, ny, nz = x, by, z
            else:
                # single constant corrupt pose → restore the grounded bind value
                nx, ny, nz = bx, by, bz
            # compare at STORED float32 precision (pack both), so an already-fixed
            # model is a true byte-level no-op — bind is float64 in the JSON.
            new = struct.pack("<fff", nx, ny, nz)
            if new != buf[o : o + 12]:
                buf[o : o + 12] = new
                clip_changed = True
        if clip_changed:
            changed = True
            print(f"  ✓ clip '{clip}': flattened root Y {oldY:+.4f}→{by:+.4f} "
                  f"({'Y-only, motion kept' if multi else 'full→bind'}, {n} key(s))")
        else:
            print(f"  = clip '{clip}': already grounded (no change)")

    if changed and not check:
        # byte length is unchanged (same accessor count/type) → chunks stay valid
        assert len(buf) == os.path.getsize(path)
        with open(path, "wb") as f:
            f.write(buf)
        # re-validate header/chunks after write
        js2, *_ = parse_glb(bytes(buf))
        assert len(js2["nodes"]) == len(nodes)
        assert len(js2.get("animations", [])) == len(js.get("animations", []))
        print(f"  → wrote {path} ({len(buf)} bytes, GLB re-validated)")
    elif changed:
        print("  (--check: not written)")
    else:
        print("  nothing to do — byte-identical")
    return changed


def main(argv):
    check = "--check" in argv
    only = [a for a in argv[1:] if not a.startswith("--")]
    jobs = {k: v for k, v in JOBS.items() if not only or k in only}
    any_changed = False
    for stem, spec in jobs.items():
        any_changed |= process(stem, spec, check)
    print("\nDone." + ("" if any_changed else " (no changes)"))


if __name__ == "__main__":
    main(sys.argv)
