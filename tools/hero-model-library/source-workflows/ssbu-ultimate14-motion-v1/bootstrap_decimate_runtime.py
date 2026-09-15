#!/usr/bin/env python3
"""Install the pinned glTF decimation runtime outside Git-tracked outputs."""
from __future__ import annotations

import argparse
import hashlib
import shutil
import subprocess
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
ASSETS = REPO.parent / "GGD-Asset-Library"
PINNED = Path(__file__).with_name("decimate-runtime")
RUNTIME = ASSETS / "dependencies/ggd-gltf-decimate-v1"
WORKER = REPO / "tools/model-budget/optimize/decimate.mjs"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def copy_pinned(source: Path, target: Path) -> None:
    if target.exists() and sha(target) != sha(source):
        raise ValueError(f"Refusing to overwrite mismatched pinned runtime file: {target}")
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--install",
        action="store_true",
        help="Run npm ci in the dedicated local dependency directory after copying pins.",
    )
    args = parser.parse_args()
    copy_pinned(PINNED / "package.json", RUNTIME / "package.json")
    copy_pinned(PINNED / "package-lock.json", RUNTIME / "package-lock.json")
    copy_pinned(WORKER, RUNTIME / "decimate.mjs")
    if args.install:
        subprocess.run(["npm", "ci", "--prefix", str(RUNTIME)], cwd=REPO, check=True)
    print(RUNTIME)


if __name__ == "__main__":
    main()
