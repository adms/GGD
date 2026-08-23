#!/usr/bin/env python3
"""GH#649 — re-convert the shipped effect .glbs that draw ZERO pixels.

28 of the 239 shipped `content/assets/models/imported/*.glb` could not put a
single pixel on screen. Two distinct causes, one converter run fixes both:

  A. additive-glow soft delete — `gltf.py`'s `fm >= 3` branch turned every
     alpha-less glow material into baseColorFactor [0,0,0,0] + BLEND.  The
     textures were reported "missing" at import time (the stock-MPQ fallback
     landed later); they all resolve today, and the branch now LUMA-KEYS an
     alpha-less glow instead of dropping it.                (15 models)
  B. emitter-only models — the MDX has 0 geosets (pure particle emitters);
     the mesh exporter shipped an EMPTY .glb (0 primitives).
     `bake_emitter_quads()` now bakes placeholder glow quads per emitter.
                                                            (10 models)

  Not fixable: `collision.glb` (+ its -mid/-small LOD tiers). Measured, not
  assumed: `collision.mdx` is 1,188 bytes of pure skeleton — 0 geosets,
  0 vertices, 0 PRE2 emitters, 0 textures, 1 sequence. BOTH repair paths need
  something to key off (A needs a material, B needs an emitter) and neither
  exists, so there is nothing to draw and nothing to invent; baking a quad out
  of thin air would be a made-up mesh, not a conversion. It is also correct
  that it draws nothing: `collision.mdx` is WC3's invisible collision-volume
  helper. Left as shipped and reported as such.

Usage:
    python3 tools/w3x-import/reconvert_zero_pixel.py [--dry-run]

Writes the rebuilt .glbs straight into content/assets/models/imported/ (the
shipped copies are git-tracked and clean — git is the backup), and a report
to tools/w3x-import/out/GoDieEX22s/reconvert-zero-pixel.json.  Refuses to
overwrite any file whose rebuild does not reach >= 1 drawable primitive or
loses animations relative to the baseline.

⚠️ The baseline is read from **git HEAD**, never from the file on disk: this
script INSTALLS over the file it would otherwise compare against, so a second
run would read its own output back and cheerfully report "shipped: 1/1 visible
prims" for a model that shipped at 0/1. The report has to stay true across
re-runs, so `git show HEAD:<path>` is the only honest baseline.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from w3xlib.models import convert_all  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "out", "GoDieEX22s", "raw")
SHIP = os.path.normpath(os.path.join(
    HERE, "..", "..", "content", "assets", "models", "imported"))
REPORT = os.path.join(HERE, "out", "GoDieEX22s", "reconvert-zero-pixel.json")

# the 28-file zero-pixel census minus collision(+2 LOD tiers, derived) —
# collision.mdx has no geosets, no emitters and no textures: nothing to draw.
# 25 targets = 15 luma-key (cause A, had geometry) + 10 emitter-bake (cause B).
TARGETS = [
    "awing", "babyface", "blackhole", "boomnl", "bwing",
    "darkbreathdamage", "deathwave", "demonfilth", "divinering", "enchant",
    "fireblast", "flash", "gx", "gxhuge", "heroluffeattack",
    "heronarutos4effect", "lasercannonfinalred", "lavabreathdamage",
    "lightningnova", "love2", "midchildernanohaaura", "netherstrike",
    "oblivionaura", "sonicbreathstream", "supershinythingy",
]
UNFIXABLE = {
    "collision": "MEASURED: collision.mdx is 1188 bytes of pure skeleton — "
                 "0 geosets, 0 vertices, 0 PRE2 emitters, 0 textures, "
                 "1 sequence. Cause-A repair needs a material and cause-B "
                 "repair needs an emitter; neither exists, so there is "
                 "nothing to convert and a baked quad would be invented "
                 "geometry, not a conversion. Drawing nothing is also "
                 "CORRECT here: this is WC3's invisible collision-volume "
                 "helper, and no spawnModelFx node points at it.",
    "collision-mid": "LOD tier derived from collision.mdx (same empty source)",
    "collision-small": "LOD tier derived from collision.mdx (same empty "
                       "source)"}


def head_bytes(path: str) -> bytes | None:
    """The git-HEAD copy of a tracked file — the only baseline that survives
    this script having already installed over `path` (see module docstring)."""
    rel = os.path.relpath(path, os.path.normpath(os.path.join(HERE, "..", "..")))
    r = subprocess.run(["git", "show", f"HEAD:{rel}"],
                       cwd=os.path.join(HERE, "..", ".."),
                       capture_output=True)
    return r.stdout if r.returncode == 0 else None


def gltf_json_bytes(b: bytes) -> dict:
    off = 12
    while off + 8 <= len(b):
        ln, ty = struct.unpack_from("<II", b, off)
        off += 8
        if ty == 0x4E4F534A:
            return json.loads(b[off:off + ln].decode("utf8"))
        off += ln
    return {}


def gltf_json(path: str) -> dict:
    return gltf_json_bytes(open(path, "rb").read())


def visible_prims(g: dict) -> tuple[int, int]:
    """Mirror of modelFxStagingContract ⑥'s visiblePrimitives()."""
    lit = set()
    for i, m in enumerate(g.get("materials", [])):
        pbr = m.get("pbrMetallicRoughness", {})
        if "baseColorTexture" in pbr or "baseColorFactor" not in pbr:
            lit.add(i)
        elif (pbr["baseColorFactor"][3] if len(pbr["baseColorFactor"]) > 3
              else 1) > 0:
            lit.add(i)
    vis = tot = 0
    for mesh in g.get("meshes", []):
        for p in mesh.get("primitives", []):
            tot += 1
            if "material" not in p or p["material"] in lit:
                vis += 1
    return vis, tot


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    tmp = tempfile.mkdtemp(prefix="ggd-reconvert-")
    glb_dir = os.path.join(tmp, "glb")
    tex_dir = os.path.join(tmp, "tex")
    print(f"[1/3] converting {len(TARGETS)} models …")
    report = convert_all(RAW, glb_dir, tex_dir, only=set(TARGETS))
    by_name = {e.get("name"): e for e in report if e.get("name")}

    print("[2/3] verifying …")
    out: list[dict] = []
    failed: list[str] = []
    for name in TARGETS:
        row: dict = {"name": name}
        entry = by_name.get(name)
        new_p = os.path.join(glb_dir, name + ".glb")
        old_p = os.path.join(SHIP, name + ".glb")
        if entry is None or entry.get("status") != "ok" \
                or not os.path.exists(new_p):
            row["verdict"] = "convert-failed"
            row["error"] = (entry or {}).get("error", "no output")
            failed.append(name)
            out.append(row)
            continue
        hb = head_bytes(old_p)
        if hb is None:
            row["verdict"] = "no-baseline"
            row["error"] = "not in git HEAD — refusing to overwrite blind"
            failed.append(name)
            out.append(row)
            continue
        old_g, new_g = gltf_json_bytes(hb), gltf_json(new_p)
        ov, ot = visible_prims(old_g)
        nv, nt = visible_prims(new_g)
        oa = [a.get("name") for a in old_g.get("animations", [])]
        na = [a.get("name") for a in new_g.get("animations", [])]
        row.update({
            "cause": "B: emitter-bake" if ot == 0 else "A: luma-key",
            "baseline@HEAD": f"{ov}/{ot} visible prims, {len(oa)} anims",
            "rebuilt": f"{nv}/{nt} visible prims, {len(na)} anims",
            "glb_size": entry.get("glb_size"),
            "emitter_quads": len(entry.get("emitter_quads", [])),
            "missing_textures": entry.get("missing_textures", []),
        })
        if nv < 1:
            row["verdict"] = "still-zero-pixel"
            failed.append(name)
        elif ov > 0:
            row["verdict"] = "not-zero-pixel-at-HEAD"
            failed.append(name)
        elif len(na) < len(oa):
            row["verdict"] = "lost-animations"
            failed.append(name)
        else:
            row["verdict"] = "fixed"
        out.append(row)

    fixed = [r for r in out if r["verdict"] == "fixed"]
    print(f"      fixed {len(fixed)}/{len(TARGETS)}"
          + (f", FAILED: {failed}" if failed else ""))

    if args.dry_run:
        print("[3/3] dry-run: nothing copied")
    else:
        print(f"[3/3] installing {len(fixed)} .glb → {SHIP}")
        for r in fixed:
            shutil.copy2(os.path.join(glb_dir, r["name"] + ".glb"),
                         os.path.join(SHIP, r["name"] + ".glb"))
    doc = {"baselineFrom": "git HEAD (see module docstring)",
           "targets": out,
           "unfixable": [{"name": k, "reason": v}
                         for k, v in sorted(UNFIXABLE.items())]}
    os.makedirs(os.path.dirname(REPORT), exist_ok=True)
    with open(REPORT, "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=1, ensure_ascii=False)
    print(f"      report → {REPORT}")
    shutil.rmtree(tmp, ignore_errors=True)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
