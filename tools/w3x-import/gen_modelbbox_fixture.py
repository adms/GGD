#!/usr/bin/env python3
"""Task #17 — generate packages/shared/src/content/modelBbox.fixture.json.

The validation guard (modelBbox.test.ts) asserts every ACTIVE champion model's
TRUE full-bbox height (not the body-only height the #1 modelScale guard used)
renders within a sane cap, so a future stray effect/beam mesh baked into a glb
(the niya regression) fails loudly. Measuring real .glb geometry in vitest is
heavy, so the true full bbox is precomputed here from the Babylon NullEngine
MESH_AUDIT.json (the client's load path) and multiplied by the LIVE doc scale in
the test — a stale fixture or hand-edited scale is caught.

Champion roster + families come from the existing modelScale.fixture.json so the
two guards agree on the set of champion models.
"""
from __future__ import annotations

import json
import os

ROOT = "/Users/Takuro/GGD"
AUDIT = os.path.join(ROOT, "tools/w3x-import/out/GoDieEX22s-src/MESH_AUDIT.json")
MODELSCALE_FX = os.path.join(ROOT, "packages/shared/src/content/modelScale.fixture.json")
OUT = os.path.join(ROOT, "packages/shared/src/content/modelBbox.fixture.json")

# Legit tall silhouettes — OPAQUE body geometry (no stray effect), documented:
#   heropika  = tall ears + headgear cluster (opaque)
# These may exceed the standard cap but must still stay under the hard ceiling.
# imported.bulbasaur left the allowlist in #32, imported.linkstik in #33: both
# glbs predated the union-basis normalization, so the geometry above the largest
# geoset (bulbasaur's leaves, Link's cap + hair) rode outside the silhouette and
# made them 3.13u / 2.78u. The re-bakes (rebake_stripped.py) put the WHOLE
# silhouette at 1.70u, so neither needs an exemption any more.
ALLOWLIST = ["imported.heropika"]
STANDARD_CAP = 2.5   # a normal champion silhouette, incl. hats/weapons
HARD_CEILING = 3.5   # nothing renders taller than this (giant-beam tripwire)


def main():
    audit = json.load(open(AUDIT))
    by_glb = {os.path.basename(r["glb"])[:-4]: r for r in audit}
    ms = json.load(open(MODELSCALE_FX))

    champs = []
    for c in ms["champions"]:
        mk = c["modelKey"]
        glb = c["glbPath"]
        bn = os.path.basename(glb)[:-4]
        rec = by_glb.get(bn)
        doc = json.load(open(os.path.join(ROOT, "content/models", f"{mk}.json")))
        scale = doc["scale"]
        full_h = round(rec["fullH"], 4) if rec and rec.get("ok") else 0.0
        ok = bool(rec and rec.get("ok"))
        anim = rec["animGroups"] if rec else 0
        champs.append({
            "modelKey": mk,
            "glbPath": glb,
            "family": c["family"],
            "empty": bool(c.get("empty")) or not ok,
            "fullHeight": full_h,
            "scale": scale,
            "renderedFull": round(full_h * scale, 4),
            "animGroups": anim,
            "allowlisted": mk in ALLOWLIST,
        })

    champs.sort(key=lambda x: -x["renderedFull"])
    out = {
        "generatedBy": "tools/w3x-import/gen_modelbbox_fixture.py — full-bbox height "
        "via Babylon NullEngine (MESH_AUDIT.json), the client's load path",
        "note": "renderedFull = fullHeight (true bbox, all meshes) * live doc scale. "
        "Guards against a stray effect/beam mesh baked into a champion glb (#17).",
        "standardCap": STANDARD_CAP,
        "hardCeiling": HARD_CEILING,
        "allowlist": ALLOWLIST,
        "champions": champs,
    }
    with open(OUT, "w") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
        f.write("\n")

    real = [c for c in champs if not c["empty"]]
    print(f"wrote {OUT}  ({len(champs)} champion models, {len(real)} non-empty)")
    print("tallest rendered:")
    for c in champs[:8]:
        tag = " [allow]" if c["allowlisted"] else ""
        print(f"  {c['renderedFull']:>7.3f}  {c['modelKey']:28} full={c['fullHeight']:.3f} x{c['scale']}{tag}")
    over = [c for c in real if c["renderedFull"] > STANDARD_CAP and not c["allowlisted"]]
    print(f"non-allowlisted over standard cap {STANDARD_CAP}: {[c['modelKey'] for c in over]}")
    over_ceiling = [c for c in real if c["renderedFull"] > HARD_CEILING]
    print(f"over hard ceiling {HARD_CEILING}: {[c['modelKey'] for c in over_ceiling]}")


if __name__ == "__main__":
    main()
