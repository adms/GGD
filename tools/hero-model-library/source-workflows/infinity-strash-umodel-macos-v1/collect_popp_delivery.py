#!/usr/bin/env python3
"""Collect every Popp PN020/00 conversion stage into one immutable delivery tree."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil


V1_STAGES = (
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

MAGIKARU_V2_STAGES = (
    ("weapon/material-context-v1", "popp-pn020-weapon-magikaru-material-context-v1"),
    ("weapon/mesh-psk-v1", "popp-pn020-weapon-magikaru-mesh-psk-v1"),
    ("weapon/textures-v1", "popp-pn020-weapon-magikaru-textures-v1"),
    ("failed-attempts/missing-texture-name", "failed-attempts/animated-candidates-psk-blender-popp-magikaru-v2-missing-texture-name/popp-pn020-00"),
    ("failed-attempts/missing-source-config-path", "failed-attempts/animated-candidates-psk-blender-popp-magikaru-v2-missing-source-config-path/popp-pn020-00"),
    ("failed-attempts/unskinned-attachment", "failed-attempts/popp-magikaru-v2-unskinned-attachment"),
    ("failed-attempts/render-sandbox-bind", "failed-attempts/popp-magikaru-v4-render-sandbox-bind"),
    ("assembly-v3", "animated-candidates-psk-blender-popp-magikaru-v3/popp-pn020-00"),
    ("normalized-v3", "normalized-animated-candidates-psk-blender-popp-magikaru-v3/popp-pn020-00"),
    ("runtime-v4", "runtime-candidates-v4/popp-pn020-00"),
    ("webgl-review-v5", "runtime-webgl-review-popp-magikaru-v5/popp-pn020-00"),
)

PROFILES = {
    "v1": {
        "deliveryId": "infinity-strash-popp-pn020-00-delivery-v1",
        "baseDeliveryId": None,
        "stages": V1_STAGES,
        "limitations": [
            "PN020 staff/weapon attachment remains pending.",
            "Effects remain package-extracted and pending conversion/binding.",
            "No distinct native death animation was found; hurt and death reuse native down.",
            "Exact source toon-shader reproduction remains pending.",
            "Decoded audio remains pending listening review and event/speaker binding.",
        ],
    },
    "magikaru-v2": {
        "deliveryId": "infinity-strash-popp-pn020-00-magikaru-delivery-v2",
        "baseDeliveryId": "infinity-strash-popp-pn020-00-delivery-v1",
        "stages": MAGIKARU_V2_STAGES,
        "limitations": [
            "This is an append-only delta over the fully verified v1 Popp delivery.",
            "Magikaru is attached and accepted; Mahouno and Kagayaki alternate staff conversion remains pending.",
            "Effects remain package-extracted and pending conversion/binding.",
            "No distinct native death animation was found; hurt and death reuse native down.",
            "Exact source toon-shader reproduction remains pending.",
            "Decoded audio remains pending listening review and event/speaker binding.",
        ],
    },
}


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
    parser.add_argument("--profile", choices=sorted(PROFILES), default="v1")
    args = parser.parse_args()

    root = args.conversion_root.resolve()
    output = args.output.resolve()
    profile = PROFILES[args.profile]
    stages = profile["stages"]
    if not root.is_dir() or root.is_symlink():
        raise ValueError(f"Conversion root must be an ordinary directory: {root}")
    if output.exists() or output.is_symlink():
        raise ValueError(f"Preserve existing delivery tree: {output}")

    missing = [relative for _, relative in stages if not (root / relative).is_dir()]
    if missing:
        raise FileNotFoundError("Missing required Popp stages: " + ", ".join(missing))

    rows: list[dict[str, object]] = []
    output.mkdir(parents=True)
    for delivery_relative, source_relative in stages:
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
        "deliveryId": profile["deliveryId"],
        "baseDeliveryId": profile["baseDeliveryId"],
        "profile": args.profile,
        "characterId": "PN020/00",
        "characterName": "何布／波普",
        "sourceGame": "Infinity Strash: Dragon Quest The Adventure of Dai",
        "sourcePlatform": "Windows (Steam)",
        "conversionRoot": str(root),
        "outputRoot": str(output),
        "stageCount": len(stages),
        "fileCount": len(rows),
        "fileBytes": sum(int(row["bytes"]) for row in rows),
        "stages": [
            {"path": delivery_relative, "sourceRelativePath": source_relative}
            for delivery_relative, source_relative in stages
        ],
        "files": rows,
        "localPreserved": True,
        "limitations": profile["limitations"],
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
