#!/usr/bin/env python3
"""Freeze reproducible KOF XIV native-format and KOF XV Ash gate evidence."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
NATIVE_FILES = {
    cid: [f"{cid}.obac", f"{cid}.omir", f"{cid}.osec", f"{cid}.otra", "CMN.otra", f"{cid}_FCE.otra"]
    for cid in ("MAI", "IOR", "KYO")
}
MAGIC = {
    ".obac": "534642fc",
    ".omir": "4f4d",
    ".osec": "4f53",
    ".otra": "534d70",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def version(command: list[str]) -> str:
    proc = subprocess.run(command, text=True, capture_output=True, check=False)
    text = (proc.stdout + "\n" + proc.stderr).strip()
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if command[0] == "assimp":
        return next((line for line in lines if line.startswith("Version ")), "unavailable")
    return next(iter(lines), "unavailable")


def blender_background_probe() -> dict[str, Any]:
    command = [
        "/Applications/Blender.app/Contents/MacOS/Blender", "--background", "--factory-startup",
        "--python-expr", "import bpy; print('KOF_BLENDER_READY=' + bpy.app.version_string)",
    ]
    proc = subprocess.run(command, text=True, capture_output=True, check=False)
    output = proc.stdout + proc.stderr
    return {
        "exitCode": proc.returncode,
        "initialized": proc.returncode == 0 and "KOF_BLENDER_READY=" in output,
        "result": "ready" if proc.returncode == 0 else "background-process-crashed-before-importer-probe",
        "archWarningObserved": "ARCH_CACHE_LINE_SIZE" in output,
    }


def assimp_probe(path: Path) -> dict[str, Any]:
    proc = subprocess.run(["assimp", "info", str(path)], text=True, capture_output=True, check=False)
    output = proc.stdout + proc.stderr
    return {
        "exitCode": proc.returncode,
        "readerAccepted": proc.returncode == 0,
        "reason": "no-suitable-reader" if "No suitable reader found" in output else "unexpected-result",
    }


def parse_guard_output(text: str) -> dict[str, Any]:
    match = re.search(r'\{\s*"tool"\s*:\s*"model-budget/guard"', text)
    if not match:
        raise ValueError("model-budget guard JSON was not found")
    decoder = json.JSONDecoder()
    value, _ = decoder.raw_decode(text[match.start():])
    return value


def build(repo: Path, workspace: Path, guard_receipt: Path) -> dict[str, Any]:
    native_root = workspace / "GGD-Asset-Library/intake/windows-readonly-20260913/kof-xiv-priority-mai-ior-kyo-v1/extracted/Chara"
    files = []
    for cid, names in NATIVE_FILES.items():
        for name in names:
            path = native_root / cid / name
            if not path.is_file():
                raise FileNotFoundError(path)
            head = path.read_bytes()[:32].hex()
            expected = MAGIC[path.suffix.lower()]
            files.append({
                "nativeCharacterId": cid,
                "kind": path.suffix.lower()[1:],
                "absolutePath": str(path.resolve()),
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
                "first32BytesHex": head,
                "expectedMagicHex": expected,
                "magicVerified": head.startswith(expected),
                "assimp": assimp_probe(path),
            })
    guard = parse_guard_output(guard_receipt.read_text(encoding="utf-8"))
    policy_paths = [
        repo / "packages/shared/src/content/modelUpload/adoptionPolicy.json",
        repo / "packages/shared/src/content/modelUpload/budget.ts",
        repo / "tools/model-budget/guard.ts",
    ]
    return {
        "schema": "ggd.kof-3d-conversion-probe@1",
        "sourceId": "kof-3d-conversion-probe-20260914-v1",
        "tools": {
            "blender": version(["/Applications/Blender.app/Contents/MacOS/Blender", "--version"]),
            "assimp": version(["assimp", "version"]),
            "ffmpeg": version(["ffmpeg", "-version"]),
        },
        "kofXiv": {
            "nativeFiles": files,
            "allMagicVerified": all(row["magicVerified"] for row in files),
            "assimpAcceptedFiles": sum(row["assimp"]["readerAccepted"] for row in files),
            "blenderBackgroundProbe": blender_background_probe(),
            "conversionState": {
                "modelAndSkeleton": "blocked-proprietary-obac-omir-osec-no-reader",
                "nativeAnimation": "blocked-proprietary-otra-no-reader",
                "vfx": "blocked-proprietary-eff-obac-runtime-reconstruction",
            },
            "nextStep": "Resolve the Blender 5.2.1 background-process crash on this host and add or pin an audited OBAC/OMIR/OSEC/OTRA parser; then export a reversible intermediate with bone names, weights, bind matrices, material slots and clip timing before GLB conversion.",
        },
        "kofXvAsh": {
            "guardExitCode": 1,
            "guard": guard,
            "policyFiles": [{"path": str(path.relative_to(repo)), "sha256": sha256(path)} for path in policy_paths],
            "result": "hard-policy-failed-draw-calls",
            "runtimeReady": False,
            "backendSelectionVerified": False,
            "nativeGameplayAnimationClips": 0,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--workspace", type=Path)
    parser.add_argument("--guard-receipt", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    repo = args.repo.resolve()
    workspace = args.workspace.resolve() if args.workspace else repo.parent
    output = args.output or repo / "materials/hero-model-library/source-inventories/kof-3d-sources-v1/conversion-probe.json"
    data = build(repo, workspace, args.guard_receipt.resolve())
    rendered = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if not output.is_file() or output.read_text(encoding="utf-8") != rendered:
            raise SystemExit("conversion probe is stale")
    else:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(rendered, encoding="utf-8")
    print(json.dumps({"output": str(output), "nativeFiles": len(data["kofXiv"]["nativeFiles"]), "ashResults": len(data["kofXvAsh"]["guard"]["results"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
