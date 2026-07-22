#!/usr/bin/env python3
"""Task #17 / #32 — re-bake a champion .glb through the effect-geoset guard.

Used for imported.niya, whose body was mis-scaled: the max-vertex "body"
heuristic picked a wide 745-vert cape geoset (mesh_primitive4) as the height
reference, so the whole character was normalized to ~10u tall with an invisible
14.5u team-glow beam on top. The guard (w3xlib.gltf.classify_geosets) now drops
the stray effect geosets AND measures body height from the union of the kept
body geosets, so the two-pass hero normalization produces a correct ~1.7u model
with scale 1.0 baked in. This mirrors w3xlib.models.convert_all for one model.

Task #32 (妙蛙種子 / imported.bulbasaur) needed the same treatment for BOTH of
its defects:
  - SIZE: its shipped .glb predates the guard, so it was normalized on the
    387-vert trunk geoset only — the leaves above it pushed the real silhouette
    to 3.13u (1.84x every other champion). The union basis re-bakes it to 1.70u.
  - TEXTURES: this model skins itself with STOCK Blizzard textures
    (textures\\FelwoodNatural.blp, textures\\citynatural.blp, textures\\star2.blp),
    which live in the retail MPQs and NOT in the map archive. That fallback now
    lives in w3xlib.models._find_texture_png, so every importer path gets it.

Task #33 adds the five remaining champion/hero glbs that still predate the
guard — gumdam, linkstik, negi, pika, hero-turtle. Each was normalized on its
largest single geoset, so the parts above it (Link's cap, negi's hair, the
gundam beam) rode outside the 1.7u silhouette; gumdam and pika additionally
carry a stray effect geoset the guard drops (a body-spanning additive beam and
a team-glow ground ring). They all come back at a true 1.70u full silhouette
with the stock BLPs resolved. After running these, refresh MESH_AUDIT.json
(mesh_audit.mts) and regenerate modelBbox.fixture.json.

Sibling script: rebake_textures.py bulk-refreshes the glbs that need ONLY the
stock-texture fix (geometry provably unchanged, so no doc/fixture churn).

Run:  python3 rebake_stripped.py niya
      python3 rebake_stripped.py bulbasaur
      python3 rebake_stripped.py            # every job
"""
from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from w3xlib.gltf import convert  # noqa: E402
from w3xlib.mdx import parse_mdx  # noqa: E402
from w3xlib.models import (  # noqa: E402
    DEFAULT_SCALE,
    HERO_TARGET_HEIGHT,
    _find_texture_png,
    bake_attachments,
    classify,
    close_stock_archives,
)

RAW = os.path.join(HERE, "out/GoDieEX22s/raw")
GLB_DIR = "/Users/Takuro/GGD/content/assets/models/imported"
MODELS_DIR = "/Users/Takuro/GGD/content/models"

# glb stem -> (source mdx, model doc id, force scale instead of measuring?).
# The curated clipMap in the doc is always kept; scale/attachPoints are refreshed.
JOBS = {
    "niya": {"mdx": "niya.mdx", "model_id": "imported.niya", "force_scale": None},
    "bulbasaur": {"mdx": "Bulbasaur.mdx", "model_id": "imported.bulbasaur",
                  "force_scale": None},
    "gumdam": {"mdx": "gumdam.mdx", "model_id": "imported.gumdam",
               "force_scale": None},
    "linkstik": {"mdx": "linkstik.mdx", "model_id": "imported.linkstik",
                 "force_scale": None},
    "negi": {"mdx": "negi.mdx", "model_id": "imported.negi", "force_scale": None},
    "pika": {"mdx": "pika.mdx", "model_id": "imported.pika", "force_scale": None},
    "hero-turtle": {"mdx": "Hero_Turtle.mdx", "model_id": "imported.hero-turtle",
                    "force_scale": None},
}


def load_textures(model):
    textures_png: dict[int, bytes] = {}
    tex_alpha: dict[int, str] = {}
    missing: list[str] = []
    for i, tex in enumerate(model.textures):
        if tex.replaceable_id or not tex.path:
            continue
        got = _find_texture_png(RAW, tex.path)
        if got is not None:
            png, hint = got
            textures_png[i] = png
            tex_alpha[i] = hint
        else:
            missing.append(tex.path)
    if missing:
        print(f"  WARNING unresolved textures (grey placeholder): {missing}")
    return textures_png, tex_alpha


def rebake(job_key: str):
    job = JOBS[job_key]
    mdx_path = os.path.join(RAW, job["mdx"])
    model = parse_mdx(open(mdx_path, "rb").read())
    kind = classify(model)
    entry: dict = {}
    bake_attachments(model, RAW, entry)
    textures_png, tex_alpha = load_textures(model)

    if job["force_scale"] is not None:
        scale = job["force_scale"]
        raw_h = None
    else:
        probe = convert(model, {}, 1.0, job["mdx"])
        raw_h = probe.height
        if kind == "hero" and 10 < raw_h < 500:
            scale = HERO_TARGET_HEIGHT / raw_h
        else:
            scale = DEFAULT_SCALE

    res = convert(model, textures_png, scale, job["mdx"], tex_alpha)

    out_glb = os.path.join(GLB_DIR, f"{job_key}.glb")
    old_size = os.path.getsize(out_glb) if os.path.exists(out_glb) else 0
    with open(out_glb, "wb") as f:
        f.write(res.glb)

    print(f"== {job['model_id']} ==")
    print(f"  kind={kind} union_body_raw_h={raw_h} scale={scale:.6f}")
    print(f"  baked body height (glTF u) = {res.height:.4f}")
    print(f"  dropped effect geosets: {res.dropped_effect_geosets}")
    print(f"  anim clips: {len(res.anim_names)}  glb {old_size} -> {len(res.glb)} bytes")

    # --- update the model doc: keep scale/clipMap, refresh attachPoints -------
    doc_path = os.path.join(MODELS_DIR, f"{job['model_id']}.json")
    doc = json.load(open(doc_path))
    old_scale = doc.get("scale")
    doc["scale"] = 1.0  # body is now ~1.7u baked in
    if res.attach_points:
        doc["attachPoints"] = {
            k: {"x": v["x"], "y": v["y"], "z": v["z"]}
            for k, v in res.attach_points.items()
        }
    with open(doc_path, "w") as f:
        json.dump(doc, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"  doc scale {old_scale} -> {doc['scale']}, attachPoints refreshed "
          f"({len(res.attach_points)} points)")
    print(f"  Head attach y now = {res.attach_points.get('Head', {}).get('y')}")


if __name__ == "__main__":
    keys = sys.argv[1:] or list(JOBS)
    try:
        for k in keys:
            rebake(k)
    finally:
        close_stock_archives()
