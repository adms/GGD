#!/usr/bin/env python3
"""Record whether the pinned local SourceIO/Blender conversion toolchain starts.

This probe never imports a model, modifies Blender preferences, installs an
addon into Blender, or treats an executable version string as a successful
conversion.  The SourceIO checkout remains in the asset-library tool cache;
the resulting small receipt is committed with the JUMP source audit so the
next conversion run has an exact, reproducible prerequisite record.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
OUT = REPO / "materials/hero-model-library/source-inventories/jump-force-dai-l4d2-vpk-v1/sourceio-preflight.json"
EXPECTED_SOURCEIO_COMMIT = "25b3978e366aeed1b4bdcf078394751b2d376c7a"
DEFAULT_BLENDER = Path("/Applications/Blender.app/Contents/MacOS/Blender")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def run(arguments: list[str], *, timeout: int = 30) -> subprocess.CompletedProcess[str]:
    return subprocess.run(arguments, text=True, capture_output=True, check=False, timeout=timeout)


def build(workspace: Path, blender: Path, sourceio: Path) -> dict:
    if not blender.is_file():
        raise FileNotFoundError(f"Blender executable does not exist: {blender}")
    if not sourceio.is_dir():
        raise FileNotFoundError(f"Pinned SourceIO checkout does not exist: {sourceio}")
    commit = run(["git", "-C", str(sourceio), "rev-parse", "HEAD"])
    status = run(["git", "-C", str(sourceio), "status", "--porcelain"])
    if commit.returncode or status.returncode:
        raise RuntimeError("Unable to inspect SourceIO checkout")
    sourceio_commit = commit.stdout.strip()
    if sourceio_commit != EXPECTED_SOURCEIO_COMMIT:
        raise ValueError(f"Unexpected SourceIO commit: {sourceio_commit}")
    if status.stdout.strip():
        raise ValueError("Pinned SourceIO checkout has local modifications")
    version = run([str(blender), "--version"])
    if version.returncode:
        raise RuntimeError("Blender --version failed")
    startup = run([str(blender), "--background", "--factory-startup", "--python-expr", "print('GGD_BLENDER_HEADLESS_OK')"])
    version_lines = [line.strip() for line in version.stdout.splitlines() if line.strip()]
    blender_version = next((line for line in version_lines if line.startswith("Blender ")), version_lines[0])
    return {
        "schema": "ggd.jump-force-sourceio-preflight@1",
        "toolchain": {
            "blender": {
                "absolutePath": str(blender.resolve()),
                "sha256": sha256(blender),
                "version": blender_version,
                "backgroundStartupExitCode": startup.returncode,
                "backgroundStartupSignal": (-startup.returncode if startup.returncode < 0 else None),
                "backgroundStartupSucceeded": startup.returncode == 0 and "GGD_BLENDER_HEADLESS_OK" in startup.stdout,
            },
            "sourceio": {
                "absolutePath": str(sourceio.resolve()),
                "gitRemote": "https://github.com/REDxEYE/SourceIO.git",
                "gitCommit": sourceio_commit,
                "release": "5.5.4",
                "workingTreeClean": True,
            },
        },
        "status": {
            "mdlImportAttempted": False,
            "mdlImportSucceeded": False,
            "standardizationReady": startup.returncode == 0 and "GGD_BLENDER_HEADLESS_OK" in startup.stdout,
        },
        "blocker": (None if startup.returncode == 0 and "GGD_BLENDER_HEADLESS_OK" in startup.stdout else
                    "Blender background startup failed before any SourceIO or model import code ran; repair the Blender headless environment before conversion."),
        "reproduction": {
            "write": "python3 tools/hero-model-library/source-workflows/jump-force-dai-l4d2-vpk-v1/probe_sourceio.py --workspace ..",
            "check": "python3 tools/hero-model-library/source-workflows/jump-force-dai-l4d2-vpk-v1/probe_sourceio.py --workspace .. --check",
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, default=REPO.parent)
    parser.add_argument("--blender", type=Path, default=DEFAULT_BLENDER)
    parser.add_argument("--sourceio", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    sourceio = args.sourceio or args.workspace.resolve() / "GGD-Asset-Library/source-tools/SourceIO-5.5.4"
    content = (json.dumps(build(args.workspace.resolve(), args.blender.resolve(), sourceio.resolve()), ensure_ascii=False, indent=2) + "\n").encode()
    if args.check:
        if not OUT.is_file() or OUT.read_bytes() != content:
            raise SystemExit(f"Stale SourceIO preflight receipt: {OUT}")
    else:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_bytes(content)
    print(json.dumps({"output": str(OUT.relative_to(REPO)), "check": args.check}, ensure_ascii=False))


if __name__ == "__main__":
    main()
