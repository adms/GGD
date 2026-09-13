#!/usr/bin/env python3
"""Freeze hashes and structural evidence for the extracted JUMP FORCE Dai scope."""

from __future__ import annotations

import argparse
import collections
import gzip
import hashlib
import io
import json
from pathlib import Path


SOURCE_ID = "steam-jump-force-priority-original-assets-build-8523149"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def frozen_files(root: Path) -> list[dict[str, object]]:
    rows = []
    for path in sorted((item for item in root.rglob("*") if item.is_file()), key=lambda item: item.relative_to(root).as_posix()):
        rows.append({
            "path": path.relative_to(root).as_posix(),
            "absolutePath": str(path.resolve()),
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        })
    return rows


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_gzip_jsonl(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as raw:
        with gzip.GzipFile(filename="", fileobj=raw, mode="wb", mtime=0) as compressed:
            with io.TextIOWrapper(compressed, encoding="utf-8", newline="\n") as text:
                for row in rows:
                    text.write(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")


def inspect_gltf(rows: list[dict[str, object]], root: Path) -> dict[str, object]:
    models = []
    for row in rows:
        if not str(row["path"]).endswith(".gltf"):
            continue
        data = json.loads((root / str(row["path"])).read_text(encoding="utf-8"))
        primitives = [primitive for mesh in data.get("meshes", []) for primitive in mesh.get("primitives", [])]
        joints = [len(skin.get("joints", [])) for skin in data.get("skins", [])]
        models.append({
            "path": row["path"],
            "bytes": row["bytes"],
            "sha256": row["sha256"],
            "sceneCount": len(data.get("scenes", [])),
            "nodeCount": len(data.get("nodes", [])),
            "meshCount": len(data.get("meshes", [])),
            "primitiveCount": len(primitives),
            "skinCount": len(data.get("skins", [])),
            "jointCounts": joints,
            "animationCount": len(data.get("animations", [])),
            "materialCount": len(data.get("materials", [])),
        })
    return {
        "modelCount": len(models),
        "allSkinned": bool(models) and all(row["skinCount"] > 0 for row in models),
        "jointCounts": sorted({count for row in models for count in row["jointCounts"]}),
        "totalAnimationCount": sum(int(row["animationCount"]) for row in models),
        "models": models,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--git-evidence-dir", type=Path, required=True)
    parser.add_argument("--expected-native-count", type=int, default=1942)
    parser.add_argument("--expected-model-count", type=int, default=11)
    parser.add_argument("--expected-texture-count", type=int, default=36)
    args = parser.parse_args()
    root = args.root.resolve()
    native = root / "native-packages"
    models = root / "umodel-character-export-v2"
    textures = root / "umodel-texture-export-fixed-v1"
    for path in (native, models, textures):
        if not path.is_dir():
            raise ValueError(f"missing extracted scope: {path}")

    native_rows = frozen_files(native)
    model_rows = frozen_files(models)
    texture_rows = frozen_files(textures)
    gltf = inspect_gltf(model_rows, models)
    texture_pngs = [row for row in texture_rows if str(row["path"]).lower().endswith(".png")]
    if len(native_rows) != args.expected_native_count:
        raise ValueError(f"native package count changed: {len(native_rows)}")
    if gltf["modelCount"] != args.expected_model_count:
        raise ValueError(f"glTF model count changed: {gltf['modelCount']}")
    if len(texture_pngs) != args.expected_texture_count:
        raise ValueError(f"texture PNG count changed: {len(texture_pngs)}")
    if not gltf["allSkinned"] or gltf["jointCounts"] != [159]:
        raise ValueError(f"unexpected skin structure: {gltf['jointCounts']}")

    combined = []
    for role, rows in (("native-package", native_rows), ("umodel-character-export", model_rows), ("umodel-texture-export", texture_rows)):
        combined.extend({**row, "role": role} for row in rows)
    files_index = root / "files.jsonl.gz"
    write_gzip_jsonl(files_index, combined)
    manifest = {
        "schema": "ggd-jump-force-dai-extraction@1",
        "sourceId": SOURCE_ID,
        "sourceGame": "JUMP FORCE",
        "platform": "Windows (Steam)",
        "nativeCharacterId": "chr0430",
        "characterNameZh": "小呆／達伊",
        "originalName": "Dai",
        "heroIds": ["godie-nbbc", "godie-n01c"],
        "root": str(root),
        "counts": {
            "nativePackages": len(native_rows),
            "modelGltf": gltf["modelCount"],
            "modelFiles": len(model_rows),
            "texturePng": len(texture_pngs),
            "textureFiles": len(texture_rows),
            "allFrozenFiles": len(combined),
        },
        "bytes": {
            "nativePackages": sum(int(row["bytes"]) for row in native_rows),
            "modelExports": sum(int(row["bytes"]) for row in model_rows),
            "textureExports": sum(int(row["bytes"]) for row in texture_rows),
            "allFrozenFiles": sum(int(row["bytes"]) for row in combined),
        },
        "extensions": dict(sorted(collections.Counter(Path(str(row["path"])).suffix.lower() for row in native_rows).items())),
        "modelEvidence": gltf,
        "filesIndex": {
            "path": str(files_index),
            "bytes": files_index.stat().st_size,
            "sha256": sha256(files_index),
        },
        "states": {
            "sourceFound": True,
            "downloaded": True,
            "extracted": True,
            "gameConfigurationPathsIndexed": True,
            "gameConfigurationPackagesExtracted": False,
            "gameConfigurationPackagesParsed": False,
            "convertedToGgd": False,
            "visuallyAccepted": False,
            "registered": False,
            "backendSelectable": False,
            "productionDeployed": False,
        },
        "gaps": [
            "GGD GLB composition and material binding are not complete.",
            "No native animation clips are present in the current model export.",
            "Character and skill configuration paths are indexed separately, but their 40 patch-selected files are absent from this frozen extraction.",
            "VFX and audio packages are extracted but not decoded or event-bound.",
            "Backend registration and production switch verification are pending.",
        ],
    }
    local_manifest = root / "source-manifest.json"
    write_json(local_manifest, manifest)
    args.git_evidence_dir.mkdir(parents=True, exist_ok=True)
    write_json(args.git_evidence_dir / "source-manifest.json", manifest)
    (args.git_evidence_dir / "files.jsonl.gz").write_bytes(files_index.read_bytes())
    print(json.dumps({
        "manifest": str(local_manifest),
        "manifestSha256": sha256(local_manifest),
        "filesIndex": str(files_index),
        "filesIndexSha256": sha256(files_index),
        "counts": manifest["counts"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"error: {error}")
        raise SystemExit(1)
