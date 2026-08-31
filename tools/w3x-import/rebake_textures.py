#!/usr/bin/env python3
"""Task #33 — re-bake shipped .glb files that embed the 8x8 grey placeholder.

`w3xlib.models._find_texture_png` now falls back to the retail MPQs at the repo
root, so materials skinned with STOCK Blizzard art (Textures\\Flame4.blp,
ReplaceableTextures\\Weather\\Clouds8x8.blp, ...) resolve instead of getting the
exporter's grey placeholder. The shipped glbs predate that fallback; this script
re-bakes them in place.

It mirrors `w3xlib.models.convert_all` for one model, so the two-pass hero
normalization (and therefore the baked geometry) is reproduced EXACTLY as
shipped — only the embedded images change. That invariant is checked: a re-bake
whose POSITION bounds or primitive count drift from the shipped file is reported
and, unless --allow-geometry-change is passed, not written. Model docs
(scale/attachPoints/clipMap) are therefore left alone.

Held back on purpose (run reports them as ** GEOMETRY CHANGED **):
  - the five hero glbs that also predate the #17 effect-geoset guard — gumdam,
    linkstik, negi, pika, hero-turtle — go through rebake_stripped.py instead,
    which refreshes the model doc's scale/attachPoints alongside the glb.
  - bladestorm-swordeffect and meteor are PURE VFX models. The guard reads them
    as "a body with stray effect geosets towering above it" and would drop 3 of
    4 / 3 of 7 geosets — for a sword-slash arc and a meteor trail, the towering
    geometry IS the model. They keep their placeholder materials until the guard
    learns to leave non-character models alone.

Run:  python3 rebake_textures.py --list          # what would change
      python3 rebake_textures.py --dry-run       # re-bake in memory, report
      python3 rebake_textures.py                 # re-bake every affected glb
      python3 rebake_textures.py wuqi windmissle # ...or just these
"""
from __future__ import annotations

import argparse
import io
import json
import os
import struct
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
from PIL import Image

RAW = os.path.join(HERE, "out/GoDieEX22s/raw")
REPORT = os.path.join(HERE, "out/GoDieEX22s/models_report.json")
GLB_DIR = os.path.join(os.path.normpath(os.path.join(HERE, "..", "..")),
                       "content", "assets", "models", "imported")
PLACEHOLDER_MAX = 8  # the exporter's fallback is an 8x8 solid grey PNG


# ---- glb introspection (GLB container + JSON chunk, no Babylon needed) -------
def glb_facts(data: bytes) -> dict:
    jlen = struct.unpack_from("<I", data, 12)[0]
    j = json.loads(data[20:20 + jlen])
    bin_off = 20 + jlen + 8
    views = j.get("bufferViews", [])
    images = []
    for im in j.get("images", []):
        bv = views[im["bufferView"]]
        at = bin_off + bv.get("byteOffset", 0)
        # PNG: 8B signature + 4B length + "IHDR", then width/height big-endian
        images.append((struct.unpack_from(">I", data, at + 16)[0],
                       struct.unpack_from(">I", data, at + 20)[0]))
    bounds = []
    for mesh in j.get("meshes", []):
        for prim in mesh["primitives"]:
            acc = j["accessors"][prim["attributes"]["POSITION"]]
            bounds.append((acc.get("count"), tuple(acc["min"]), tuple(acc["max"])))
    return {"images": images, "bounds": bounds,
            "materials": len(j.get("materials", [])),
            "animations": len(j.get("animations", []))}


def placeholders(facts: dict) -> int:
    return sum(1 for w, h in facts["images"]
               if w <= PLACEHOLDER_MAX and h <= PLACEHOLDER_MAX)


def geometry_key(facts: dict) -> tuple:
    return (tuple(facts["bounds"]), facts["materials"], facts["animations"])


def sanitize_existing_additive_backdrops(data: bytes) -> tuple[bytes, int]:
    """Clear bright RGB below alpha=0 while preserving every non-image byte.

    This is the safe fallback for an old GLB whose current importer would also
    change geometry.  Future full rebuilds get the same rule from
    `gltf_texture_additive`; the shipped file is patched through its own glTF
    material graph so no model-name exemption or hand-edited binary is needed.
    """
    jlen = struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20:20 + jlen])
    bin_start = 20 + jlen + 8
    blob = data[bin_start:]
    views = doc.get("bufferViews", [])
    textures = doc.get("textures", [])
    images = doc.get("images", [])
    image_indices: set[int] = set()
    for material in doc.get("materials", []):
        if max(material.get("emissiveFactor", [0])) <= 0:
            continue
        ti = material.get("pbrMetallicRoughness", {}).get(
            "baseColorTexture", {}).get("index")
        if isinstance(ti, int) and ti < len(textures):
            si = textures[ti].get("source")
            if isinstance(si, int):
                image_indices.add(si)

    replacements: dict[int, bytes] = {}
    cleared = 0
    for image_index in image_indices:
        if image_index >= len(images):
            continue
        vi = images[image_index].get("bufferView")
        if not isinstance(vi, int) or vi >= len(views):
            continue
        view = views[vi]
        at = view.get("byteOffset", 0)
        raw = blob[at:at + view["byteLength"]]
        image = Image.open(io.BytesIO(raw)).convert("RGBA")
        pixels = list(image.getdata())
        changed = False
        for i, (r, g, b, a) in enumerate(pixels):
            if a <= 5 and (r != 0 or g != 0 or b != 0):
                pixels[i] = (0, 0, 0, a)
                cleared += 1
                changed = True
        if not changed:
            continue
        image.putdata(pixels)
        out = io.BytesIO()
        image.save(out, "PNG")
        replacements[vi] = out.getvalue()

    if not replacements:
        return data, 0

    parts: list[bytes] = []
    offset = 0
    new_views = []
    for i, view in enumerate(views):
        at = view.get("byteOffset", 0)
        chunk = replacements.get(i, blob[at:at + view["byteLength"]])
        new_views.append({**view, "byteOffset": offset, "byteLength": len(chunk)})
        parts.append(chunk)
        offset += len(chunk)
        pad = (-offset) % 4
        if pad:
            parts.append(b"\0" * pad)
            offset += pad
    out_doc = {**doc, "bufferViews": new_views,
               "buffers": [{"byteLength": offset}]}
    json_raw = json.dumps(out_doc, separators=(",", ":")).encode("utf8")
    json_raw += b" " * ((-len(json_raw)) % 4)
    bin_raw = b"".join(parts)
    bin_raw += b"\0" * ((-len(bin_raw)) % 4)
    total = 12 + 8 + len(json_raw) + 8 + len(bin_raw)
    head = struct.pack("<III", 0x46546C67, 2, total)
    return (head + struct.pack("<II", len(json_raw), 0x4E4F534A) + json_raw
            + struct.pack("<II", len(bin_raw), 0x004E4942) + bin_raw), cleared


# ---- re-bake ----------------------------------------------------------------
def source_map() -> dict[str, str]:
    """shipped glb stem -> source .mdx filename, from the importer report."""
    out = {}
    for e in json.load(open(REPORT)):
        if e.get("status") == "ok" and e.get("name"):
            out[e["name"]] = e["source"]
    return out


def rebake_one(stem: str, mdx_name: str) -> tuple[bytes, list[str]]:
    """Return (glb bytes, still-unresolved texture paths) for one model."""
    model = parse_mdx(open(os.path.join(RAW, mdx_name), "rb").read())
    kind = classify(model)
    bake_attachments(model, RAW, {})

    textures_png: dict[int, bytes] = {}
    tex_alpha: dict[int, str] = {}
    missing: list[str] = []
    for i, tex in enumerate(model.textures):
        if tex.replaceable_id or not tex.path:
            continue
        got = _find_texture_png(RAW, tex.path)
        if got is None:
            missing.append(tex.path)
            continue
        textures_png[i], tex_alpha[i] = got

    # identical two-pass scale policy to models.convert_all
    raw_h = convert(model, {}, 1.0, mdx_name).height
    scale = (HERO_TARGET_HEIGHT / raw_h
             if kind == "hero" and 10 < raw_h < 500 else DEFAULT_SCALE)
    return convert(model, textures_png, scale, mdx_name, tex_alpha).glb, missing


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("models", nargs="*", help="glb stems (default: all affected)")
    ap.add_argument("--list", action="store_true", help="only list affected glbs")
    ap.add_argument("--dry-run", action="store_true", help="re-bake but do not write")
    ap.add_argument("--allow-geometry-change", action="store_true",
                    help="write even if the baked geometry drifts from the "
                         "shipped file (then refresh the model doc + fixtures)")
    args = ap.parse_args()

    srcs = source_map()
    stems = args.models or sorted(
        f[:-4] for f in os.listdir(GLB_DIR)
        if f.endswith(".glb")
        and placeholders(glb_facts(open(os.path.join(GLB_DIR, f), "rb").read()))
    )
    if args.list:
        for s in stems:
            print(s, "->", srcs.get(s, "?? no source mdx"))
        print(f"{len(stems)} affected")
        return 0

    fixed = drift = skipped = 0
    for stem in stems:
        path = os.path.join(GLB_DIR, stem + ".glb")
        if stem not in srcs:
            print(f"  SKIP {stem}: no source mdx in models_report.json")
            skipped += 1
            continue
        old = open(path, "rb").read()
        old_f = glb_facts(old)
        try:
            new, missing = rebake_one(stem, srcs[stem])
        except Exception as exc:
            print(f"  FAIL {stem}: {exc}")
            skipped += 1
            continue
        new_f = glb_facts(new)
        moved = geometry_key(old_f) != geometry_key(new_f)
        before, after = placeholders(old_f), placeholders(new_f)

        note = f"{before} -> {after} placeholders"
        if moved:
            note += "  ** GEOMETRY CHANGED **"
        if missing:
            note += f"  unresolved={missing}"
        if new == old:
            print(f"  same {stem:34s} {note}  byte-identical")
            skipped += 1
            continue
        if moved and not args.allow_geometry_change:
            safe, cleared = sanitize_existing_additive_backdrops(old)
            if cleared > 0:
                if not args.dry_run:
                    with open(path, "wb") as f:
                        f.write(safe)
                print(f"  {'would-sanitize' if args.dry_run else 'sanitized'} "
                      f"{stem:25s} {note}  geometry held · "
                      f"{cleared} transparent-bright texels cleared")
                fixed += 1
                continue
            print(f"  HOLD {stem:34s} {note}")
            drift += 1
            continue
        if not args.dry_run:
            with open(path, "wb") as f:
                f.write(new)
        print(f"  {'would' if args.dry_run else 'baked'} {stem:34s} {note}  "
              f"{len(old)} -> {len(new)} bytes")
        fixed += 1

    print(f"\n{fixed} re-baked, {drift} held for geometry drift, {skipped} skipped"
          + ("  (dry run — nothing written)" if args.dry_run else ""))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    finally:
        close_stock_archives()
