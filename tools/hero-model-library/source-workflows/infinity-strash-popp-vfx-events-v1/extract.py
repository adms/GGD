#!/usr/bin/env python3
"""Extract the direct package pairs for Popp's 17 retained VFX references."""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import subprocess
from pathlib import Path


def sha256(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def selected_members(dependency_index: dict) -> list[str]:
    references = [
        reference
        for reference in dependency_index["externalPackageDependencies"]
        if reference.startswith("/Game/Strash/VFX/")
    ]
    members = []
    for reference in references:
        stem = "strash/Content/" + reference.removeprefix("/Game/")
        members.extend([stem + ".uasset", stem + ".uexp"])
    return members


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dependency-index", type=Path, required=True)
    parser.add_argument("--pak-source-manifest", type=Path, required=True)
    parser.add_argument("--pak", type=Path, required=True)
    parser.add_argument("--extractor", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    if output.exists() and any(output.iterdir()):
        raise SystemExit(f"refusing to mix with non-empty output: {output}")
    output.mkdir(parents=True, exist_ok=True)
    dependency_index = json.loads(args.dependency_index.read_text())
    pak_source = json.loads(args.pak_source_manifest.read_text())
    expected = next(row for row in pak_source["files"] if Path(row["path"]).name == args.pak.name)
    if args.pak.stat().st_size != expected["bytes"]:
        raise ValueError("source PAK byte count differs from the verified mirror manifest")
    if sha256(args.pak) != expected["sha256"]:
        raise ValueError("source PAK SHA-256 differs from the verified mirror manifest")
    members = selected_members(dependency_index)
    if len(members) != 34:
        raise ValueError(f"expected 34 members for 17 package pairs, got {len(members)}")
    selected = output / "selected-paths.txt"
    selected.write_text("\n".join(members) + "\n")
    raw = output / "raw"
    subprocess.run([str(args.extractor.resolve()), str(args.pak.resolve()), str(selected), str(raw)], check=True)
    files = []
    for member in members:
        path = raw / member
        if not path.is_file():
            raise ValueError(f"extractor did not produce {member}")
        files.append(
            {
                "path": path.relative_to(output).as_posix(),
                "absolutePath": str(path),
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
            }
        )
    manifest = {
        "schema": "ggd.infinity-strash-popp-vfx-direct-packages@1",
        "sourceId": "steam-infinity-strash-popp-vfx-direct-packages-build-local-20240328",
        "parentSourceId": pak_source["sourceId"],
        "sourcePak": expected,
        "selection": {
            "referenceCount": len(members) // 2,
            "memberCount": len(members),
            "selectedPaths": {
                "path": selected.name,
                "absolutePath": str(selected),
                "bytes": selected.stat().st_size,
                "sha256": sha256(selected),
            },
        },
        "extractor": {
            "invokedBinary": {
                "absolutePath": str(args.extractor.resolve()),
                "bytes": args.extractor.stat().st_size,
                "sha256": sha256(args.extractor),
            },
            "sourceGitPath": "tools/hero-model-library/source-workflows/infinity-strash-priority-raw-v2/src/main.rs",
        },
        "files": files,
        "totalBytes": sum(row["bytes"] for row in files),
        "states": {
            "directPackagePairsAcquired": True,
            "dependencyClosureExtracted": False,
            "ggdVfxConverted": False,
            "visualAcceptancePassed": False,
            "runtimeSelectable": False,
            "deployed": False,
        },
        "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    (output / "source-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"output": str(output), "files": len(files), "bytes": manifest["totalBytes"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
