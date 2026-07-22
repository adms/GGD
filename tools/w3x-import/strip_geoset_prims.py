#!/usr/bin/env python3
"""Task #59 — remove GEOA-hidden effect PRIMITIVES from an imported .glb.

Why this exists
---------------
WC3 MDX animates per-geoset visibility with GEOSET ANIMATION alpha tracks
(``GEOA``/``KGAO``). glTF has **no visibility animation channel**, so the
importer skips GEOA entirely (every models_report entry says
``skipped MDX chunks: ...GEOA...``). A geoset that WC3 showed for one
sequence therefore ships as permanently-on geometry — Zoro's whirlwind.

Task #17's ``strip_effect_meshes.mjs`` did the same job with
@gltf-transform, but that dependency is not installed in this repo. This is
the stdlib equivalent: drop primitives, then mark-and-sweep every resource
(accessors, bufferViews, materials, textures, images, samplers) that nothing
references any more and rebuild the BIN chunk.

Deliberately NOT touched: nodes, skins, animations, attach points. The
``whirlWindDummy`` node stays — the VFX layer re-attaches a real, rotating,
state-gated whirlwind there (apps/client/src/vfx/WhirlwindFx.ts).

Usage:
    python3 strip_geoset_prims.py [--dry-run] [--only <glb-name>]
"""

from __future__ import annotations

import json
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
GLB_DIR = os.path.join(REPO, "content", "assets", "models", "imported")

# glb file -> {primitive index (== MDX geoset order among SHIPPED prims): why}
#
# Each entry was verified against the source MDX's GEOA/KGAO track: the geoset
# is alpha-0 in every sequence the clipMap can reach. See the task #59 scan
# (tools/w3x-import/geoset_alpha_report.py) for the full census.
JOBS: dict[str, dict[int, str]] = {
    # 三刀流劍士 索隆 — Textures\Tornado2b.blp, 20v/10tri, half-width 223 WC3u
    # (~5.2u across a 1.7u hero). KGAO alpha is 1.0 ONLY inside the
    # "Attack Walk Stand Spin" sequence, which the clipMap never plays.
    # Re-added as a real rotating VFX at the model's `whirlWindDummy` node.
    "heromusashimiyamoto.glb": {
        3: "Tornado2b whirlwind — WC3 showed it only in 'Attack Walk Stand Spin'",
    },
}


# ---------------------------------------------------------------------------
# glb container
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


def write_glb(path: str, gltf: dict, binary: bytes) -> int:
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
# mark & sweep
# ---------------------------------------------------------------------------

def _texture_refs(obj, out: set[int]) -> None:
    """Collect every textureInfo `index` reachable from a material subtree."""
    if isinstance(obj, dict):
        for key, val in obj.items():
            if key == "index" and isinstance(val, int):
                out.add(val)
            else:
                _texture_refs(val, out)
    elif isinstance(obj, list):
        for item in obj:
            _texture_refs(item, out)


def strip(gltf: dict, binary: bytes, drop: dict[int, str]) -> tuple[dict, bytes, list[str]]:
    meshes = gltf.get("meshes", [])
    if len(meshes) != 1:
        raise ValueError(f"expected exactly 1 mesh, found {len(meshes)}")
    prims = meshes[0].get("primitives", [])
    removed: list[str] = []
    kept = []
    for i, prim in enumerate(prims):
        if i in drop:
            acc = gltf["accessors"][prim["attributes"]["POSITION"]]
            removed.append(
                f"prim[{i}] {acc['count']}v mat={prim.get('material')} — {drop[i]}"
            )
            continue
        kept.append(prim)
    if len(removed) != len(drop):
        raise ValueError(f"drop indices {sorted(drop)} out of range (nprims={len(prims)})")
    meshes[0]["primitives"] = kept

    # --- reachable accessors + materials -----------------------------------
    live_acc: set[int] = set()
    live_mat: set[int] = set()
    for mesh in meshes:
        for prim in mesh["primitives"]:
            live_acc.update(prim["attributes"].values())
            if "indices" in prim:
                live_acc.add(prim["indices"])
            for tgt in prim.get("targets", []):
                live_acc.update(tgt.values())
            if "material" in prim:
                live_mat.add(prim["material"])
    for skin in gltf.get("skins", []):
        if "inverseBindMatrices" in skin:
            live_acc.add(skin["inverseBindMatrices"])
    for anim in gltf.get("animations", []):
        for smp in anim.get("samplers", []):
            live_acc.add(smp["input"])
            live_acc.add(smp["output"])

    # --- reachable textures / images / samplers ----------------------------
    live_tex: set[int] = set()
    for mi in live_mat:
        _texture_refs(gltf["materials"][mi], live_tex)
    live_img: set[int] = set()
    live_smp: set[int] = set()
    for ti in live_tex:
        tex = gltf["textures"][ti]
        if "source" in tex:
            live_img.add(tex["source"])
        if "sampler" in tex:
            live_smp.add(tex["sampler"])

    # --- reachable bufferViews --------------------------------------------
    live_bv: set[int] = set()
    for ai in live_acc:
        acc = gltf["accessors"][ai]
        if "bufferView" in acc:
            live_bv.add(acc["bufferView"])
        sparse = acc.get("sparse")
        if sparse:
            live_bv.add(sparse["indices"]["bufferView"])
            live_bv.add(sparse["values"]["bufferView"])
    for ii in live_img:
        img = gltf["images"][ii]
        if "bufferView" in img:
            live_bv.add(img["bufferView"])

    # --- compact + remap ---------------------------------------------------
    def remap(live: set[int], n: int) -> dict[int, int]:
        return {old: new for new, old in enumerate(sorted(live)) if old < n}

    bv_map = remap(live_bv, len(gltf.get("bufferViews", [])))
    acc_map = remap(live_acc, len(gltf.get("accessors", [])))
    mat_map = remap(live_mat, len(gltf.get("materials", [])))
    tex_map = remap(live_tex, len(gltf.get("textures", [])))
    img_map = remap(live_img, len(gltf.get("images", [])))
    smp_map = remap(live_smp, len(gltf.get("samplers", [])))

    # rebuild BIN from the surviving bufferViews, 4-byte aligned
    new_bin = bytearray()
    new_bvs = []
    for old in sorted(live_bv):
        bv = dict(gltf["bufferViews"][old])
        start = bv.get("byteOffset", 0)
        blob = binary[start:start + bv["byteLength"]]
        new_bin += b"\0" * (-len(new_bin) % 4)
        bv["byteOffset"] = len(new_bin)
        bv["buffer"] = 0
        new_bin += blob
        new_bvs.append(bv)
    gltf["bufferViews"] = new_bvs

    gltf["accessors"] = [
        {**gltf["accessors"][o], "bufferView": bv_map[gltf["accessors"][o]["bufferView"]]}
        if "bufferView" in gltf["accessors"][o] else dict(gltf["accessors"][o])
        for o in sorted(live_acc)
    ]
    gltf["materials"] = [gltf["materials"][o] for o in sorted(live_mat)]
    gltf["textures"] = [gltf["textures"][o] for o in sorted(live_tex)]
    gltf["images"] = [gltf["images"][o] for o in sorted(live_img)]
    if live_smp or "samplers" in gltf:
        gltf["samplers"] = [gltf["samplers"][o] for o in sorted(live_smp)]
        if not gltf["samplers"]:
            del gltf["samplers"]
    if not gltf["images"]:
        del gltf["images"]
    if not gltf["textures"]:
        del gltf["textures"]

    # re-point every index that moved
    for tex in gltf.get("textures", []):
        if "source" in tex:
            tex["source"] = img_map[tex["source"]]
        if "sampler" in tex:
            tex["sampler"] = smp_map[tex["sampler"]]
    def repoint_textures(obj):
        """Deep-copy a material subtree, remapping every textureInfo `index`."""
        if isinstance(obj, dict):
            return {
                k: (tex_map[v] if k == "index" and isinstance(v, int) else repoint_textures(v))
                for k, v in obj.items()
            }
        if isinstance(obj, list):
            return [repoint_textures(x) for x in obj]
        return obj

    gltf["materials"] = [repoint_textures(m) for m in gltf["materials"]]
    for img in gltf.get("images", []):
        if "bufferView" in img:
            img["bufferView"] = bv_map[img["bufferView"]]
    for mesh in gltf["meshes"]:
        for prim in mesh["primitives"]:
            prim["attributes"] = {k: acc_map[v] for k, v in prim["attributes"].items()}
            if "indices" in prim:
                prim["indices"] = acc_map[prim["indices"]]
            if "material" in prim:
                prim["material"] = mat_map[prim["material"]]
            if "targets" in prim:
                prim["targets"] = [{k: acc_map[v] for k, v in t.items()}
                                   for t in prim["targets"]]
    for skin in gltf.get("skins", []):
        if "inverseBindMatrices" in skin:
            skin["inverseBindMatrices"] = acc_map[skin["inverseBindMatrices"]]
    for anim in gltf.get("animations", []):
        for smp in anim.get("samplers", []):
            smp["input"] = acc_map[smp["input"]]
            smp["output"] = acc_map[smp["output"]]

    gltf["buffers"] = [{"byteLength": len(new_bin)}]
    return gltf, bytes(new_bin), removed


def main() -> int:
    dry = "--dry-run" in sys.argv
    only = None
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1]
    for name, drop in JOBS.items():
        if only and name != only:
            continue
        path = os.path.join(GLB_DIR, name)
        before = os.path.getsize(path)
        gltf, binary = read_glb(path)
        gltf, new_bin, removed = strip(gltf, binary, drop)
        if dry:
            print(f"[dry] {name}: would remove {len(removed)} prim(s)")
            for line in removed:
                print(f"        {line}")
            continue
        after = write_glb(path, gltf, new_bin)
        print(f"== {name}: {before} -> {after} bytes "
              f"({len(gltf['meshes'][0]['primitives'])} prims, "
              f"{len(gltf['materials'])} materials, "
              f"{len(gltf.get('images', []))} images)")
        for line in removed:
            print(f"     removed {line}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
