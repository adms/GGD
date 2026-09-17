#!/usr/bin/env python3
"""Build the pinned Infinity Strash UEViewer fork without mutating its source."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path

PINNED_COMMIT = "a0bfb468d42be831b126632fd8a0ae6b3614f981"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(command: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, check=True, text=True, **kwargs)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True, help="local UEViewer Git checkout")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    source = args.source.resolve()
    output = args.output.resolve()
    patch = Path(__file__).with_name("ueviewer-infinity-strash.patch").resolve()
    actual = run(["git", "rev-parse", PINNED_COMMIT + "^{commit}"], cwd=source, capture_output=True).stdout.strip()
    if actual != PINNED_COMMIT:
        raise SystemExit(f"pinned UEViewer commit unavailable: {PINNED_COMMIT}")
    if output.exists():
        raise SystemExit(f"refusing to overwrite existing output: {output}")

    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="strash-umodel-build-") as temp_name:
        temp = Path(temp_name)
        source_tar = temp / "ueviewer-source.tar"
        with source_tar.open("wb") as handle:
            subprocess.run(
                ["git", "archive", "--format=tar", PINNED_COMMIT],
                cwd=source,
                check=True,
                stdout=handle,
            )
        build_tree = temp / "source"
        build_tree.mkdir()
        with tarfile.open(source_tar, "r") as archive:
            for member in archive.getmembers():
                member_path = Path(member.name)
                if member_path.is_absolute() or ".." in member_path.parts:
                    raise SystemExit(f"unsafe path in git archive: {member.name}")
            archive.extractall(build_tree)
        run(["git", "apply", "--whitespace=nowarn", str(patch)], cwd=build_tree)

        build_log = temp / "build.log"
        env = os.environ.copy()
        with build_log.open("w", encoding="utf-8") as log:
            proc = subprocess.run(
                ["./build.sh"],
                cwd=build_tree,
                env=env,
                text=True,
                stdout=log,
                stderr=subprocess.STDOUT,
            )
        if proc.returncode:
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            failure_log = output.parent / f"{output.name}.failed-build-{stamp}.log"
            shutil.copy2(build_log, failure_log)
            raise SystemExit(f"UEViewer build failed; log: {failure_log}")

        binary = build_tree / "umodel"
        if not binary.is_file():
            raise SystemExit("build succeeded without producing umodel")

        output.mkdir()
        shutil.copy2(binary, output / "umodel")
        shutil.copy2(patch, output / patch.name)
        shutil.copy2(build_log, output / "build.log")
        source_gz = output / f"ueviewer-{PINNED_COMMIT}.tar.gz"
        with tarfile.open(source_gz, "w:gz", format=tarfile.PAX_FORMAT) as archive:
            for path in sorted(build_tree.rglob("*")):
                if path.is_file() and path.name != "umodel":
                    archive.add(path, arcname=Path("UEViewer") / path.relative_to(build_tree))

    files = []
    for path in sorted(p for p in output.rglob("*") if p.is_file()):
        files.append({
            "path": path.relative_to(output).as_posix(),
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        })
    manifest = {
        "schemaVersion": 1,
        "sourceId": "infinity-strash-umodel-macos-v1",
        "upstreamCommit": PINNED_COMMIT,
        "builtAt": datetime.now(timezone.utc).isoformat(),
        "platform": "macOS-x86_64",
        "files": files,
    }
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
