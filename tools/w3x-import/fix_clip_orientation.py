#!/usr/bin/env python3
"""Task #68 — re-ground per-CLIP baked root rotation so no clip renders tilted.

Why this exists
---------------
A subset of the WC3-imported champion .glbs bake a root-bone rotation that
DIFFERS between animation clips: heropikachu's "Stand"/"Walk" hold the root
bone ~99.7 deg off-vertical while "Attack"/"Spell"/"Death" hold it upright
(0 deg). Because the tilt lives INSIDE the skeleton (on the root bone, per
clip), no single scene-graph transform can correct it — a static counter-
rotation that fixes idle breaks attack (docs/todo/intermission.md #111/#68).

The model's BIND pose is upright (every affected root bone's rest rotation is
identity, and the attack/death clips confirm 0 deg == upright). This tool
therefore RE-GROUNDS each defective clip: for the clip's root-bone rotation
channel it left-multiplies every keyframe by inverse(frame0), so frame 0
becomes identity (upright) and any intra-clip motion (walk sway) is preserved
RELATIVE to upright. Only idle / run / hurt clips that start >= 45 deg off
vertical are touched — a face-down resting or walking pose is unambiguously
wrong. Attack/cast/death leans and mild (<45 deg) stances are left alone.

Only ANIMATION sampler outputs are rewritten (a fresh, appended accessor per
channel — shared accessors are never mutated in place). Geometry, nodes,
skins, materials, bind pose and attach points are untouched, so the bind-pose
bbox/scale fixtures (packages/shared) stay valid.

Usage:
    python3 fix_clip_orientation.py [--dry-run] [--only <glb-name>]
"""
from __future__ import annotations

import json
import math
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
GLB_DIR = os.path.join(REPO, "content", "assets", "models", "imported")

# Defect set derived from the #61 headless audit (model_audit_61.mjs):
# idle/run/hurt clips whose frame-0 root-bone rotation is >= 45 deg off the
# model's own upright reference. clip names are the .glb AnimationGroup names.
# Two waves, both re-grounded the same way (frame0 -> upright):
#   A) idle/run/hurt clips >= 45 deg off upright — a face-down resting or
#      walking pose (the champion spends ~all its time here).
#   B) attack/cast clips >= 90 deg off upright — a CONSTANT inverted/face-down
#      pose held for the whole swing/cast (all keys=2). Attacks and casts fire
#      constantly in combat, so an upside-down basic attack is as wrong as a
#      face-down idle. death is deliberately excluded (it legitimately falls).
JOBS: dict[str, list[str]] = {
    # A — idle/run/hurt
    "herobuu.glb": ["Walk"],                        # run 74.6 (cast 74.6 left: borderline lean)
    "heroichigo.glb": ["Walk"],                     # run 54.7 (root bone_waist)
    "heropikachu.glb": ["Stand - 1", "Walk"],       # idle/run/hurt 99.7 (#111)
    "herosasuke.glb": ["Stand", "Walk"],            # idle/run/hurt 90.0
    "linkstik.glb": ["Stand Hit"],                  # hurt 121.3
    "ma.glb": ["Stand -1", "Walk"],                 # idle/run/hurt 50.0
    "pika.glb": ["Stand - 1"],                       # idle/hurt 56.0
    "sd2.glb": ["Stand - 1", "Walk"],               # idle/run/hurt 55.1/46.6
    # A+B — idle/run + inverted attack/cast
    "herooichi.glb": ["Walk", "Attack", "Spell"],   # run 167; attack 167; cast 176
    "kikyou.glb": ["walk", "attack - 1"],            # run 167; attack 167
    # B — inverted attack/cast only (idle/run already upright)
    "herofate.glb": ["Spell"],                      # cast 117.5
    "herohanzouhattori.glb": ["Attack"],            # attack 117.5
    "herolight.glb": ["Spell"],                     # cast 117.5
    "herorider.glb": ["Attack"],                    # attack 117.6
    "herosaber.glb": ["Spell"],                     # cast 117.5
    "heroshana.glb": ["Spell"],                     # cast 117.5
    "lubu.glb": ["Spell"],                          # cast 117.5
    "niya.glb": ["Spell"],                          # cast 117.5
    "renaryugu2.glb": ["Spell"],                    # cast 117.5
}

TILT_THRESHOLD_DEG = 45.0

# ---------------------------------------------------------------------------
# glb container (same framing as strip_geoset_prims.py)
# ---------------------------------------------------------------------------

def read_glb(path):
    with open(path, "rb") as fh:
        data = fh.read()
    magic, _v, _l = struct.unpack_from("<III", data, 0)
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


def write_glb(path, gltf, binary):
    js = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    js += b" " * (-len(js) % 4)
    bn = binary + b"\0" * (-len(binary) % 4)
    total = 12 + 8 + len(js) + (8 + len(bn) if bn else 0)
    out = bytearray()
    out += struct.pack("<III", 0x46546C67, 2, total)
    out += struct.pack("<II", len(js), 0x4E4F534A) + js
    if bn:
        out += struct.pack("<II", len(bn), 0x004E4942) + bn
    with open(path, "wb") as fh:
        fh.write(bytes(out))
    return total


# ---------------------------------------------------------------------------
# quaternion helpers ([x, y, z, w])
# ---------------------------------------------------------------------------

def q_mul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return (
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    )


def q_inv(q):  # conjugate (unit quat)
    x, y, z, w = q
    return (-x, -y, -z, w)


def q_angle_deg(q):
    return math.degrees(2 * math.acos(min(1.0, abs(q[3]))))


def q_norm(q):
    x, y, z, w = q
    n = math.sqrt(x * x + y * y + z * z + w * w) or 1.0
    return (x / n, y / n, z / n, w / n)


# ---------------------------------------------------------------------------
# node depth (to auto-pick the shallowest rotation-animated node == root bone)
# ---------------------------------------------------------------------------

def node_depths(gltf):
    nodes = gltf.get("nodes", [])
    depth = [None] * len(nodes)

    def walk(i, d):
        depth[i] = d
        for c in nodes[i].get("children", []):
            walk(c, d + 1)

    roots = set(range(len(nodes)))
    for n in nodes:
        for c in n.get("children", []):
            roots.discard(c)
    for r in sorted(roots):
        walk(r, 0)
    return depth


def read_vec4_accessor(gltf, binary, acc_idx):
    acc = gltf["accessors"][acc_idx]
    assert acc["type"] == "VEC4" and acc["componentType"] == 5126, "expected VEC4 float"
    bv = gltf["bufferViews"][acc["bufferView"]]
    base = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    count = acc["count"]
    out = []
    for i in range(count):
        out.append(struct.unpack_from("<4f", binary, base + i * 16))
    return out


def append_vec4_accessor(gltf, binary, quats):
    """Append a tightly-packed VEC4 float accessor; return (new_binary, acc_idx)."""
    data = bytearray()
    for q in quats:
        data += struct.pack("<4f", *q)
    binary = binary + b"\0" * (-len(binary) % 4)  # align current end to 4
    byte_offset = len(binary)
    binary = binary + bytes(data)
    bv_idx = len(gltf.setdefault("bufferViews", []))
    gltf["bufferViews"].append({
        "buffer": 0,
        "byteOffset": byte_offset,
        "byteLength": len(data),
    })
    acc_idx = len(gltf.setdefault("accessors", []))
    gltf["accessors"].append({
        "bufferView": bv_idx,
        "componentType": 5126,
        "count": len(quats),
        "type": "VEC4",
    })
    # keep the single buffer's byteLength in sync (glb buffer has no uri)
    gltf["buffers"][0]["byteLength"] = len(binary)
    return binary, acc_idx


def process(path, clip_names, dry):
    gltf, binary = read_glb(path)
    animations = gltf.get("animations", [])
    depth = node_depths(gltf)
    log = []
    changed = False
    for clip in clip_names:
        anim = next((a for a in animations if a.get("name") == clip), None)
        if anim is None:
            log.append(f"  !! clip '{clip}' not found")
            continue
        # shallowest node with a rotation channel == root bone
        rot_channels = [c for c in anim["channels"] if c["target"]["path"] == "rotation"]
        if not rot_channels:
            log.append(f"  !! clip '{clip}' has no rotation channel")
            continue
        root_ch = min(rot_channels, key=lambda c: depth[c["target"]["node"]])
        node_i = root_ch["target"]["node"]
        node_name = gltf["nodes"][node_i].get("name", f"node{node_i}")
        smp = anim["samplers"][root_ch["sampler"]]
        quats = read_vec4_accessor(gltf, binary, smp["output"])
        q0 = q_norm(quats[0])
        off = q_angle_deg(q0)
        if off < TILT_THRESHOLD_DEG:
            log.append(f"  -- clip '{clip}' root {node_name} only {off:.1f}deg off — skip")
            continue
        D = q_inv(q0)
        new_quats = [q_norm(q_mul(D, q_norm(q))) for q in quats]
        end_off = q_angle_deg(new_quats[0])
        if not dry:
            binary, new_acc = append_vec4_accessor(gltf, binary, new_quats)
            smp["output"] = new_acc
        changed = True
        log.append(
            f"  == clip '{clip}' root {node_name}: frame0 {off:.1f}deg -> {end_off:.1f}deg "
            f"({len(quats)} keys re-grounded)"
        )
    if changed and not dry:
        write_glb(path, gltf, binary)
    return log, changed


def main():
    dry = "--dry-run" in sys.argv
    only = None
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1]
    n = 0
    for file, clips in JOBS.items():
        if only and only not in file:
            continue
        path = os.path.join(GLB_DIR, file)
        if not os.path.exists(path):
            print(f"!! {file}: not found")
            continue
        log, changed = process(path, clips, dry)
        print(f"{file}{'  [DRY]' if dry else ''}")
        for line in log:
            print(line)
        if changed:
            n += 1
    print(f"\n{'would fix' if dry else 'fixed'} {n} model(s)")


if __name__ == "__main__":
    main()
