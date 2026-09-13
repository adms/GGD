#!/usr/bin/env python3
"""Export selected Infinity Strash cooked assets with the patched UModel."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("kind", choices=("mesh", "mesh-psk", "animation", "texture"))
    parser.add_argument("--umodel", type=Path, required=True)
    parser.add_argument("--asset-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--asset", action="append", required=True, help="path relative to asset root")
    parser.add_argument("--with-textures", action="store_true", help="allow UModel to export referenced textures")
    args = parser.parse_args()

    umodel = args.umodel.resolve()
    root = args.asset_root.resolve()
    output = args.output.resolve()
    if output.exists() and any(output.iterdir()):
        raise SystemExit(f"refusing to mix with non-empty output: {output}")
    output.mkdir(parents=True, exist_ok=True)

    commands = []
    for relative in args.asset:
        asset = (root / relative).resolve()
        if root not in asset.parents or not asset.is_file():
            raise SystemExit(f"asset is missing or outside root: {relative}")
        command = [str(umodel), "-game=strash", "-export", f"-out={output}"]
        if args.kind == "mesh":
            command.extend(["-gltf", "-noanim"])
            if not args.with_textures:
                command.append("-notex")
        elif args.kind == "mesh-psk":
            command.append("-noanim")
            if not args.with_textures:
                command.append("-notex")
        elif args.kind == "texture":
            command.append("-png")
        command.append(str(asset))
        before = {path: (path.stat().st_size, path.stat().st_mtime_ns) for path in output.rglob("*") if path.is_file()}
        proc = subprocess.run(command, text=True, capture_output=True)
        log_name = relative.replace("/", "__") + ".log"
        (output / log_name).write_text(proc.stdout + proc.stderr, encoding="utf-8")
        after = {path: (path.stat().st_size, path.stat().st_mtime_ns) for path in output.rglob("*") if path.is_file()}
        produced = sorted(
            path.relative_to(output).as_posix()
            for path, signature in after.items()
            if path.name != log_name and before.get(path) != signature
        )
        expected_suffix = {"mesh": ".gltf", "mesh-psk": ".psk", "animation": ".psa", "texture": ".png"}[args.kind]
        outcome = "exported" if any(path.lower().endswith(expected_suffix) for path in produced) else "no-exportable-output"
        commands.append({
            "asset": relative,
            "command": command,
            "returnCode": proc.returncode,
            "outcome": outcome,
            "producedFiles": produced,
            "log": log_name,
        })
        if proc.returncode:
            raise SystemExit(f"UModel failed for {relative}; see {output / log_name}")
        if outcome != "exported":
            raise SystemExit(f"UModel returned success without {expected_suffix} output for {relative}; see {output / log_name}")

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
        "kind": args.kind,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "assetRoot": str(root),
        "outputRoot": str(output),
        "commands": commands,
        "files": files,
        "readiness": "converted-component",
        "notEvidenceOf": ["multipart-merge", "visual-acceptance", "registered-option", "deployed"],
    }
    manifest_path = output / "export-manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
