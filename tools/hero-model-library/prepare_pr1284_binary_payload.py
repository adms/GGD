#!/usr/bin/env python3
"""Stage the bounded PR #1284 review binaries for S3 preparation.

The fixed list is the audited union of files added versus origin/main and the
untracked review evidence present on 2026-09-17.  Sources are never moved or
deleted.  The payload mirrors repository paths so Main can restore each file
from the eventual S3 manifest without guessing its destination.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import tempfile
from pathlib import Path


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
OUTPUT = REPO.parent / "GGD-Asset-Library/conversions/pr1284-preparation-final-v1"
SELECTED = (
    "materials/hero-model-library/priority-evidence/approved-derivative-azazel-wings-v1/azazel-wings-ab.jpg",
    "materials/hero-model-library/priority-evidence/approved-derivative-azazel-wings-v2/azazel-face-v1-v2-ab.jpg",
    "materials/hero-model-library/priority-evidence/approved-derivatives-v1/approved11-contact-sheet.jpg",
    "materials/hero-model-library/priority-evidence/approved-derivatives-v1/mai-decimation-ab.jpg",
    "materials/hero-model-library/priority-evidence/jump-force-gon-audio-v1/files.jsonl.gz",
    "materials/hero-model-library/source-inventories/bojji-crown-v1/bojji-crown-ab.png",
    "materials/hero-model-library/source-inventories/bojji-crown-v2/bojji-crown-v2-ab.png",
    "materials/hero-model-library/source-inventories/bojji-crown-v2/owner-reference.png",
)
ALLOWED_SUFFIXES = (".png", ".jpg", ".jpeg", ".webp", ".jsonl.gz")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_copy(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=destination.parent, prefix=f".{destination.name}.", delete=False) as temporary:
        temporary_path = Path(temporary.name)
    try:
        shutil.copy2(source, temporary_path)
        os.replace(temporary_path, destination)
    finally:
        temporary_path.unlink(missing_ok=True)


def render_manifest() -> str:
    files = []
    for repo_path in SELECTED:
        assert repo_path.startswith("materials/hero-model-library/")
        assert repo_path.lower().endswith(ALLOWED_SUFFIXES)
        assert "/palworld-approved-runtime-v1/audio/" not in repo_path
        assert repo_path != "materials/hero-model-library/voice-files.jsonl.gz"
        source = REPO / repo_path
        if not source.is_file():
            raise FileNotFoundError(source)
        files.append({"repoPath": repo_path, "sha256": sha256(source)})
    return json.dumps({"schema": "ggd.pr1284-binary-selection@1", "files": files}, ensure_ascii=False, indent=2) + "\n"


def run(check: bool) -> None:
    manifest = render_manifest()
    manifest_path = OUTPUT / "binary-selection.json"
    if check:
        if not manifest_path.is_file() or manifest_path.read_text() != manifest:
            raise ValueError("binary-selection.json is missing or stale")
        for row in json.loads(manifest)["files"]:
            payload = OUTPUT / "payload" / row["repoPath"]
            if not payload.is_file() or sha256(payload) != row["sha256"]:
                raise ValueError(f"payload missing or stale: {row['repoPath']}")
    else:
        for repo_path in SELECTED:
            atomic_copy(REPO / repo_path, OUTPUT / "payload" / repo_path)
        OUTPUT.mkdir(parents=True, exist_ok=True)
        temporary = OUTPUT / ".binary-selection.json.tmp"
        temporary.write_text(manifest)
        os.replace(temporary, manifest_path)
    print(json.dumps({"check": check, "files": len(SELECTED), "manifest": str(manifest_path.resolve())}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    run(parser.parse_args().check)
