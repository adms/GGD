#!/usr/bin/env python3
"""Build the macOS Infinity Strash UModel with StaticMesh section support."""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import shutil
import subprocess
import tarfile
import tempfile
from datetime import datetime, timezone


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ref(path: pathlib.Path, root: pathlib.Path | None = None) -> dict[str, object]:
    result: dict[str, object] = {
        "absolutePath": str(path.resolve()),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }
    if root:
        result["path"] = path.resolve().relative_to(root.resolve()).as_posix()
    return result


def safe_extract(archive: pathlib.Path, destination: pathlib.Path) -> pathlib.Path:
    with tarfile.open(archive, "r:gz") as tar:
        members = tar.getmembers()
        for member in members:
            target = (destination / member.name).resolve()
            try:
                target.relative_to(destination.resolve())
            except ValueError as error:
                raise RuntimeError(f"archive member escapes destination: {member.name}") from error
        tar.extractall(destination, members=members)
    roots = [path for path in destination.iterdir() if path.is_dir()]
    if len(roots) != 1 or not (roots[0] / "build.sh").is_file():
        raise RuntimeError("source archive must contain one UEViewer root")
    return roots[0]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-archive", type=pathlib.Path, required=True)
    parser.add_argument("--patch", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    args = parser.parse_args()
    source = args.source_archive.resolve()
    patch = args.patch.resolve()
    output = args.output.resolve()
    if output.exists():
        raise FileExistsError(f"refusing to overwrite output: {output}")
    output.mkdir(parents=True)
    with tempfile.TemporaryDirectory(prefix="ggd-strash-staticmesh-") as temp:
        root = safe_extract(source, pathlib.Path(temp))
        applied = subprocess.run(
            ["patch", "--batch", "--forward", "-p1", "-i", str(patch)],
            cwd=root,
            capture_output=True,
            text=True,
        )
        (output / "patch.log").write_text(applied.stdout + applied.stderr, encoding="utf-8")
        if applied.returncode:
            raise RuntimeError("StaticMesh patch did not apply cleanly")
        built = subprocess.run(["./build.sh"], cwd=root, capture_output=True, text=True)
        (output / "build.log").write_text(built.stdout + built.stderr, encoding="utf-8")
        binary = root / "umodel"
        if built.returncode or not binary.is_file():
            raise RuntimeError("UModel build failed; inspect build.log")
        shutil.copy2(binary, output / "umodel")
    binary = output / "umodel"
    binary.chmod(binary.stat().st_mode | 0o111)
    manifest = {
        "schema": "ggd.infinity-strash-staticmesh-umodel-build@1",
        "sourceId": "infinity-strash-umodel-macos-v2-staticmesh-export",
        "platform": "macOS-x86_64",
        "sourceArchive": ref(source),
        "patch": ref(patch),
        "output": ref(binary, output),
        "logs": [ref(output / "patch.log", output), ref(output / "build.log", output)],
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    (output / "tool-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({"output": str(binary), "sha256": manifest["output"]["sha256"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
