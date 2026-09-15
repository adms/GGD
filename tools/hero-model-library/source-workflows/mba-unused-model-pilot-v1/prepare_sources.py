#!/usr/bin/env python3
"""Prepare four MBA bodies for GGD without changing the preserved source GLBs.

This reuses the established MBA atlas/skin preparation routine, then applies
the current 256px texture cap to its one generated atlas.  Geometry, native
joint indices, animation timing, and the original character identity mapping
stay pinned in the adjacent receipt.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import sys
from pathlib import Path

import PIL
from PIL import Image


ITEMS = [
    ("ruru", "CharacterDefinitions/Chara01_O.chr", "ルル・ジェラード", "models/Model/Chara01_O/Ruru.glb", "c3aa6e901a46f8b2c974520790549747681e9f6cce7a9194492cc7b49f6df5e7"),
    ("kirara", "CharacterDefinitions/Chara05.chr", "星空きらら", "models/Model/Chara05/Kirara.glb", "445b4cee62703096c16b0593f0064028706fb256c05a08ee37fffcb45bcdc0d0"),
    ("sarara", "CharacterDefinitions/Chara06.chr", "星空さらら", "models/Model/Chara06/Sarara.glb", "2dbb0fac2373a64a84ebdc36d740fc08808a81a9aa075aa03d6625cd3dd2f524"),
    ("vita", "CharacterDefinitions/Chara11.chr", "ヴィータ", "models/Model/Chara11/Vita.glb", "02814a9992181579ece78b5b993fe87edbc8dc1093fd3f10af4f259bd36c57de"),
]

CLIP_NAMES = ["wait", "F-Move", "attack_01", "sp01_01", "Damage-1", "D-Down"]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def replace_atlas(doc: dict, binary: bytes, target: int = 256) -> tuple[dict, bytes, dict]:
    if len(doc.get("images", [])) != 1 or doc["images"][0].get("bufferView") is None:
        raise ValueError("Expected exactly one embedded prepared atlas")
    image_view = doc["images"][0]["bufferView"]
    old = doc["bufferViews"][image_view]
    at = old.get("byteOffset", 0)
    payload = binary[at:at + old["byteLength"]]
    with Image.open(io.BytesIO(payload)) as image:
        before = list(image.size)
        if max(image.size) > target:
            scale = target / max(image.size)
            size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
            image = image.convert("RGBA").resize(size, Image.Resampling.LANCZOS)
        output = io.BytesIO()
        image.save(output, format="PNG", compress_level=9)
        replacement = output.getvalue()
        after = list(image.size)

    chunks = []
    cursor = 0
    views = []
    for index, view in enumerate(doc["bufferViews"]):
        cursor += -cursor % 4
        start = view.get("byteOffset", 0)
        data = replacement if index == image_view else binary[start:start + view["byteLength"]]
        next_view = dict(view, byteOffset=cursor, byteLength=len(data))
        views.append(next_view)
        chunks.append((cursor, data))
        cursor += len(data)
    result = bytearray(cursor)
    for start, data in chunks:
        result[start:start + len(data)] = data
    doc["bufferViews"] = views
    return doc, bytes(result), {
        "sourceAtlasDimensions": before,
        "outputAtlasDimensions": after,
        "outputAtlasSha256": sha256(replacement),
        "maxEdge": target,
        "resampler": "Pillow Image.Resampling.LANCZOS",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    workspace = args.workspace.resolve()
    output = args.output.resolve()
    mba = workspace / "outputs/game-asset-library-20260907/magical-battle-arena"
    candidates = json.loads((mba / "character-candidates.json").read_text())
    by_definition = {row["definition"]: row for row in candidates}

    forge = workspace / "GGD-300-mba-unused-assets-batch/tools/community-hero-forge"
    sys.path.insert(0, str(forge))
    from prepare_mba_body import encode_glb, prepare, read_glb

    records = []
    for slug, definition, name, relative, expected_sha in ITEMS:
        identity = by_definition.get(definition)
        if not identity or identity["name"] != name or identity["glb"] != relative:
            raise ValueError(f"Identity mapping changed for {slug}")
        source = mba / relative
        raw = source.read_bytes()
        if sha256(raw) != expected_sha:
            raise ValueError(f"Pinned source changed for {slug}")
        doc, binary = read_glb(raw)
        original_clips = [clip.get("name", "") for clip in doc.get("animations", [])]
        selected_clips = []
        for name in CLIP_NAMES:
            matches = [index for index, candidate in enumerate(original_clips) if candidate == name]
            if len(matches) != 1:
                raise ValueError(f"{slug}: expected exactly one native clip named {name}")
            selected_clips.append({"name": name, "originalIndex": matches[0]})
        # The backend upload parser caps the GLB JSON chunk at 4 MiB.  MBA's
        # full 68-95 clip libraries exceed that limit, so make a component
        # candidate containing only the six exact native clips requested for
        # gameplay review.  The complete source GLB remains byte-for-byte in
        # the asset library, and its full clip inventory remains in the receipt.
        doc["animations"] = [doc["animations"][row["originalIndex"]] for row in selected_clips]
        prepared_doc, prepared_binary, preparation = prepare(doc, binary)
        prepared_doc, prepared_binary, atlas = replace_atlas(prepared_doc, prepared_binary)
        prepared = encode_glb(prepared_doc, prepared_binary)
        directory = output / slug
        directory.mkdir(parents=True, exist_ok=True)
        body = directory / "body-prepared.glb"
        receipt = directory / "preparation.json"
        body.write_bytes(prepared)
        record = {
            "schema": "ggd-mba-source-preparation@1",
            "slug": slug,
            "sourceId": "magical-battle-arena-complete-form-1.60-plus",
            "sourceVersion": "Complete Form 1.60+",
            "sourcePlatform": "Windows PC",
            "selectionClass": "mba",
            "identity": {
                "sourceCharacterId": "mba:" + Path(definition).stem,
                "definition": definition,
                "characterNative": name,
                "nativeModel": identity["native_model"],
                "convertedGlb": identity["glb"],
                "relationship": "direct-character-definition",
            },
            "source": {"absolutePath": str(source), "bytes": len(raw), "sha256": expected_sha},
            "preparation": preparation,
            "toolchain": {
                "python": sys.version.split()[0],
                "pillow": PIL.__version__,
                "sourcePreparation": "tools/community-hero-forge/prepare_mba_body.py",
                "workflow": "tools/hero-model-library/source-workflows/mba-unused-model-pilot-v1/prepare_sources.py",
            },
            "nativeClips": {
                "originalCount": len(original_clips),
                "originalNames": original_clips,
                "selected": selected_clips,
                "selectionReason": "Retain exact same-character native clips for idle/run/attack/cast/hurt/death-surrogate review and satisfy the 4 MiB backend JSON limit",
            },
            "atlas": atlas,
            "output": {"absolutePath": str(body), "bytes": len(prepared), "sha256": sha256(prepared)},
            "sourcePreserved": sha256(source.read_bytes()) == expected_sha,
            "limitations": [
                "The atlas adaptation replaces original Assimp specular materials with one portable unlit diffuse atlas.",
                "The 256px atlas is a derived texture and still needs final WebGL visual review.",
                "No hero binding, default selection, backend registration or deployment is performed.",
            ],
        }
        receipt.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
        records.append(record)
    (output / "preparation-batch.json").write_text(json.dumps({
        "schema": "ggd-mba-source-preparation-batch@1",
        "records": [{"slug": row["slug"], "source": row["source"], "output": row["output"]} for row in records],
    }, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"output": str(output), "prepared": len(records)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
