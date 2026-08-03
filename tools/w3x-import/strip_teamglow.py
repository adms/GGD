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

⚠️ GH#233 (2026-08-04) —— 這支掃描器的「全 roster」以前不是全 roster。

`champion_model_glbs()` 只讀 `content/champions/*.json` 的 `modelKey`，所以任何
**不是**由英雄文件直接指名的出貨身體都不在它的視野裡。而 `content/skins/*.json`
(`skin@1`) 就是這樣的東西:它為**同一個英雄**指定**另一具身體**,玩家換上皮膚
之後場上跑的就是那顆 glb。量到的(直接讀 glb 位元組):

    skin.godie-u00l.heropika  -> imported.heropika  -> heropika.glb  TeamGlow1 @ prim 1
    skin.godie-e008.heroshanawingsmall -> heroshanawingsmall.glb     (乾淨)
    skin.godie-h02v.horsehead          -> horsehead.glb              (乾淨)

三個皮膚身體全部在掃描集合外,其中一個真的還帶著 TeamGlow。於是
`--dry-run` 印「would strip team-glow from (dry) model(s)」**一行都沒有**,
而 `tools/w3x-import/test/champion-model-guard.test.ts` 的
「no champion model ships a stray TeamGlow ground billboard (#73)」也是綠的 ——
兩邊都在對**比出貨集合小的集合**下判斷(CLAUDE.md 失敗形態 ⑤:被測的不是出貨的
那個)。所以枚舉器現在同時讀 champions 與 skins,守衛比對的也是這個枚舉器真的
吐出來的集合(`--list-models`),不是掃原始碼字串。

Usage:
    python3 strip_teamglow.py [--dry-run] [--only <glb-name>]
    python3 strip_teamglow.py --list-models   # modelKey<TAB>glb, one per line
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
SKIN_DIR = os.path.join(REPO, "content", "skins")

# Every content collection that can put a DIFFERENT body glb on a champion.
# (directory, schema tag) — a doc's `modelKey` is the body it selects.
BODY_SOURCES = ((CH_DIR, "champion@1"), (SKIN_DIR, "skin@1"))


def champion_body_model_keys() -> set[str]:
    """Every imported.* modelKey that ships as a CHAMPION BODY.

    Reads champions AND skins: a `skin@1` doc names another `modelKey` for the
    same champion, and that glb is what the player's figure is built from once
    the skin is equipped. Leaving skins out is what made the #73 sweep and its
    guard both report "clean" while `heropika.glb` still carried TeamGlow1.
    """
    used: set[str] = set()
    for directory, schema in BODY_SOURCES:
        for f in glob.glob(os.path.join(directory, "*.json")):
            if os.path.basename(f).startswith("_"):
                continue
            try:
                d = json.load(open(f))
            except Exception:
                continue
            if d.get("schema") == schema and str(d.get("modelKey", "")).startswith("imported."):
                used.add(d["modelKey"])
    return used


def champion_model_glbs() -> list[tuple[str, str]]:
    """(modelKey, glb-filename) for every imported.* champion BODY (incl. skins)."""
    used = champion_body_model_keys()
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
    if "--list-models" in sys.argv:
        # The set this sweep actually judges, as DATA. The guard reads this
        # rather than grepping the source (CLAUDE.md 失敗形態 ⑥).
        for mk, name in champion_model_glbs():
            print(f"{mk}\t{name}")
        return 0
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
