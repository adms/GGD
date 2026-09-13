#!/usr/bin/env python3
"""Collect every Popp PN020/00 conversion stage into one immutable delivery tree."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil


STAGES = (
    ("failed-attempts/mesh-material-context-v1", "popp-pn020-00-mesh-material-context-v1"),
    ("mesh-material-context-v2", "popp-pn020-00-mesh-material-context-v2"),
    ("mesh-psk-v1", "popp-pn020-00-mesh-psk-v1"),
    ("textures-v1", "popp-pn020-00-textures-v1"),
    ("native-animations-v1", "popp-pn020-00-native-animations-v1"),
    ("assembly-v1", "animated-candidates-psk-blender-popp-v1/popp-pn020-00"),
    ("normalized-v1", "normalized-animated-candidates-psk-blender-popp-v1/popp-pn020-00"),
    ("runtime-v1", "runtime-candidates-v1/popp-pn020-00"),
    ("failed-attempts/webgl-review-v1", "runtime-webgl-review-v1/popp-pn020-00"),
    ("webgl-review-v2", "runtime-webgl-review-v2/popp-pn020-00"),
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--conversion-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    root = args.conversion_root.resolve()
    output = args.output.resolve()
    if not root.is_dir() or root.is_symlink():
        raise ValueError(f"Conversion root must be an ordinary directory: {root}")
    if output.exists() or output.is_symlink():
        raise ValueError(f"Preserve existing delivery tree: {output}")

    missing = [relative for _, relative in STAGES if not (root / relative).is_dir()]
    if missing:
        raise FileNotFoundError("Missing required Popp stages: " + ", ".join(missing))

    rows: list[dict[str, object]] = []
    output.mkdir(parents=True)
    for delivery_relative, source_relative in STAGES:
        source = root / source_relative
        destination = output / delivery_relative
        for path in sorted(source.rglob("*")):
            if path.is_symlink():
                raise ValueError(f"Stage contains a symlink: {path}")
            if not path.is_file():
                continue
            source_member = path.relative_to(source)
            copied = destination / source_member
            copied.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, copied)
            source_hash = sha256(path)
            copied_hash = sha256(copied)
            if copied_hash != source_hash or copied.stat().st_size != path.stat().st_size:
                raise ValueError(f"Copied file differs from source: {path}")
            rows.append(
                {
                    "path": copied.relative_to(output).as_posix(),
                    "bytes": copied.stat().st_size,
                    "sha256": copied_hash,
                    "sourceAbsolutePath": str(path),
                    "sourceStage": source_relative,
                }
            )

    manifest = {
        "schema": "ggd-popp-conversion-delivery@1",
        "sourceId": "steam-infinity-strash-popp-priority-audio-build-local-20240328",
        "characterId": "PN020/00",
        "characterName": "何布／波普",
        "sourceGame": "Infinity Strash: Dragon Quest The Adventure of Dai",
        "sourcePlatform": "Windows (Steam)",
        "conversionRoot": str(root),
        "outputRoot": str(output),
        "stageCount": len(STAGES),
        "fileCount": len(rows),
        "fileBytes": sum(int(row["bytes"]) for row in rows),
        "stages": [
            {"path": delivery_relative, "sourceRelativePath": source_relative}
            for delivery_relative, source_relative in STAGES
        ],
        "files": rows,
        "localPreserved": True,
        "limitations": [
            "PN020 staff/weapon attachment remains pending.",
            "Effects remain package-extracted and pending conversion/binding.",
            "No distinct native death animation was found; hurt and death reuse native down.",
            "Exact source toon-shader reproduction remains pending.",
            "Decoded audio remains pending listening review and event/speaker binding.",
        ],
    }
    manifest_path = output / "collection-manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(
        json.dumps(
            {
                "output": str(output),
                "stageCount": manifest["stageCount"],
                "fileCount": manifest["fileCount"],
                "fileBytes": manifest["fileBytes"],
                "manifestSha256": sha256(manifest_path),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
