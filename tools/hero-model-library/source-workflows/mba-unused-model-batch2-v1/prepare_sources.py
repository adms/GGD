#!/usr/bin/env python3
"""Prepare the second four-body MBA reserve batch for GGD.

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
    ("nowel", "CharacterDefinitions/Chara02_O.chr", "ノウェル・ディアスタシス", "models/Model/Chara02_O/Nowel.glb", "7236780dfb38d380c483e5cec72fbf1af75c125462f336841371b20eac70caf9", ["wait", "F-Move", "attack_01", "maryokuwaza_01", "Damage-1", "D-Down"]),
    ("kukuri", "CharacterDefinitions/Chara07_02.chr", "ククリ", "models/Model/Chara07/KukuriMigMig.glb", "bc98efe10be27cc65943a8897e7d3c498c69777e09ede50820ea5443ec13ecb1", ["wait", "F-Move", "attack_01_01", "sp01", "Damage-1", "D-Down"]),
    ("naga", "CharacterDefinitions/Chara08.chr", "白蛇のナーガ", "models/Model/Chara08/Naga.glb", "eeeaccdd0fdff24be7c27f09c04fdd3dc9f00030c4a3aeae15780b2a438a1d9d", ["wait", "F-Move", "attack_01", "sp01_01", "Damage-1", "D-Down"]),
    ("gajet1", "CharacterDefinitions/Chara09.chr", "ガジェットドローンⅠ型", "models/Model/Chara09/Gajet1.glb", "89066fee1031928d45eba7dad942923b876575bd593b29c391a9e6ad0deea909", ["wait", "F-Move", "attack_01", "sp01_01", "Damage-1", "D-Down"]),
]


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
    for slug, definition, name, relative, expected_sha, clip_names in ITEMS:
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
        for clip_name in clip_names:
            matches = [index for index, candidate in enumerate(original_clips) if candidate == clip_name]
            if len(matches) != 1:
                raise ValueError(f"{slug}: expected exactly one native clip named {clip_name}")
            selected_clips.append({"name": clip_name, "originalIndex": matches[0]})
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
                "workflow": "tools/hero-model-library/source-workflows/mba-unused-model-batch2-v1/prepare_sources.py",
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
