#!/usr/bin/env python3
"""Task #73 — sweep champion glbs for stray TEAM-GLOW ground billboards + orbs.

The #73 audit (model_audit_61.mjs / DUMMY_ORB) swept EVERY champion model and
found the un-merged "sphere/orb attachment" family the 孫悟空 case belonged to
is dominated by ONE pervasive stray: a WC3 "team colour" ground-glow billboard
baked into the champion mesh as a low, wide, alpha-blended quad
(material name ``TeamGlow*``). 36 of the 51 champion models carry one.

It is pure stray attachment geometry: the client already draws its OWN team
read (ChampionView's team-coloured ring + blob shadow), so the baked billboard
is at best redundant and at worst tints a neutral WC3 colour under the feet
that does not match the assigned team. It belongs in the VFX/ring channel, not
the champion mesh — exactly what strip_effect_meshes.mjs / strip_geoset_prims.py
did for the individually-flagged effect geosets, generalised to the whole
roster by material name.

Because these quads are LOW and WIDE they never define a model's full-bbox
top/bottom, so the frozen packages/shared bbox+scale fixtures (which read
stored fullHeight, not the live glb) stay valid. Only alpha-blended
``TeamGlow*`` primitives are removed; opaque body/equipment geometry and any
in-silhouette glow are untouched.

Usage:
    python3 strip_teamglow.py [--dry-run] [--only <glb-name>]
"""
from __future__ import annotations

import glob
import json
import os
import sys

from strip_geoset_prims import read_glb, write_glb, strip, GLB_DIR

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
CH_DIR = os.path.join(REPO, "content", "champions")
MODELS_DIR = os.path.join(REPO, "content", "models")


def champion_model_glbs() -> list[tuple[str, str]]:
    """(modelKey, glb-filename) for every imported.* model a champion uses."""
    used = set()
    for f in glob.glob(os.path.join(CH_DIR, "*.json")):
        if os.path.basename(f).startswith("_"):
            continue
        try:
            d = json.load(open(f))
        except Exception:
            continue
        if d.get("schema") == "champion@1" and str(d.get("modelKey", "")).startswith("imported."):
            used.add(d["modelKey"])
    out = []
    for mk in sorted(used):
        doc = json.load(open(os.path.join(MODELS_DIR, f"{mk}.json")))
        out.append((mk, os.path.basename(doc["glbPath"])))
    return out


def teamglow_drops(gltf: dict) -> dict[int, str]:
    """primitive index -> reason, for every alpha-blended TeamGlow* primitive."""
    meshes = gltf.get("meshes", [])
    if len(meshes) != 1:
        return {}
    mats = gltf.get("materials", [])
    drop: dict[int, str] = {}
    for i, prim in enumerate(meshes[0].get("primitives", [])):
        mi = prim.get("material")
        if mi is None or mi >= len(mats):
            continue
        name = mats[mi].get("name", "")
        if name.lower().startswith("teamglow"):
            drop[i] = f"WC3 team-glow ground billboard ({name}) — team read is ChampionView's ring"
    return drop


def main() -> int:
    dry = "--dry-run" in sys.argv
    only = None
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1]
    total = 0
    for mk, name in champion_model_glbs():
        if only and only not in name:
            continue
        path = os.path.join(GLB_DIR, name)
        if not os.path.exists(path):
            print(f"!! {name}: not found")
            continue
        gltf, binary = read_glb(path)
        drop = teamglow_drops(gltf)
        if not drop:
            continue
        before = os.path.getsize(path)
        if dry:
            print(f"[dry] {mk} ({name}): would remove {len(drop)} prim(s) {sorted(drop)}")
            continue
        gltf, new_bin, removed = strip(gltf, binary, drop)
        after = write_glb(path, gltf, new_bin)
        total += 1
        print(f"== {mk} ({name}): removed {len(removed)} team-glow prim(s) | {before} -> {after} bytes")
    print(f"\n{'would strip' if dry else 'stripped'} team-glow from {total if not dry else '(dry)'} model(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
