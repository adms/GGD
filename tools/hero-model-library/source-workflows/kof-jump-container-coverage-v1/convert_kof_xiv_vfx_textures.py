#!/usr/bin/env python3
"""Decode acquired KOF XIV effect DDS files to 256px review PNGs."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import struct
import subprocess
import tempfile
from pathlib import Path


CHARACTERS = {
    "MAI": {"nameZh": "不知火舞", "heroIds": ["community-review-03-20260907"]},
    "IOR": {"nameZh": "八神庵", "heroIds": ["community-review-02-20260907"]},
    "KYO": {"nameZh": "草薙京", "heroIds": []},
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def png_metrics(path: Path) -> dict[str, int]:
    raw = path.read_bytes()[:26]
    if not raw.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError(f"not PNG: {path}")
    width, height = struct.unpack_from(">II", raw, 16)
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}.get(raw[25], 0)
    if channels == 0:
        raise ValueError(f"unsupported PNG colour type: {path}")
    return {"width": width, "height": height, "channels": channels}


def dds_metrics(path: Path) -> dict[str, object]:
    raw = path.read_bytes()[:132]
    if len(raw) < 128 or raw[:4] != b"DDS ":
        raise ValueError(f"not DDS: {path}")
    height, width = struct.unpack_from("<II", raw, 12)
    fourcc = raw[84:88].decode("latin1")
    return {
        "width": width,
        "height": height,
        "fourCC": fourcc,
        "dxgiFormat": int.from_bytes(raw[128:132], "little") if fourcc == "DX10" and len(raw) >= 132 else None,
    }


def convert(source: Path, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="ggd-kofxiv-vfx-") as directory:
        first = Path(directory) / "first.png"
        second = Path(directory) / "second.png"
        for candidate in (first, second):
            proc = subprocess.run(
                ["sips", "-Z", "256", "-s", "format", "png", str(source), "--out", str(candidate)],
                text=True,
                capture_output=True,
            )
            if proc.returncode != 0 or not candidate.is_file():
                raise RuntimeError(f"sips failed for {source}: {proc.stdout}{proc.stderr}")
        if sha256(first) != sha256(second):
            raise RuntimeError(f"non-deterministic sips output: {source}")
        shutil.copyfile(first, output)


def build(repo: Path, workspace: Path, check: bool) -> dict[str, object]:
    source_root = workspace / "GGD-Asset-Library/intake/windows-readonly-20260913/kof-xiv-priority-mai-ior-kyo-v1/extracted/Chara"
    output_root = workspace / "GGD-Asset-Library/conversions/kof-xiv-priority-vfx-textures-20260914-v1"
    rows = []
    per_character = {}
    for native_id, identity in CHARACTERS.items():
        sources = sorted((source_root / native_id / "Effect").glob("*.dds"))
        if not sources:
            raise FileNotFoundError(f"no acquired effect DDS files for {native_id}")
        character_rows = []
        for source in sources:
            output = output_root / native_id / (source.stem + ".png")
            if not check:
                convert(source, output)
            if not output.is_file():
                raise FileNotFoundError(output)
            source_info = dds_metrics(source)
            output_info = png_metrics(output)
            if max(output_info["width"], output_info["height"]) > 256:
                raise ValueError(f"converted texture exceeds 256px: {output}")
            row = {
                "nativeCharacterId": native_id,
                "characterNameZh": identity["nameZh"],
                "heroIds": identity["heroIds"],
                "sourceAbsolutePath": str(source.resolve()),
                "sourceBytes": source.stat().st_size,
                "sourceSha256": sha256(source),
                "sourceFormat": source_info,
                "outputAbsolutePath": str(output.resolve()),
                "outputBytes": output.stat().st_size,
                "outputSha256": sha256(output),
                "outputFormat": output_info,
                "acquisition": "extracted-and-sha256-verified",
                "extraction": "native-dds-present",
                "conversion": "decoded-256px-png",
                "readiness": "review-candidate-not-bound-to-vfx-runtime",
            }
            rows.append(row)
            character_rows.append(row)
        per_character[native_id] = {
            "characterNameZh": identity["nameZh"],
            "sourceFiles": len(character_rows),
            "outputFiles": len(character_rows),
            "outputBytes": sum(row["outputBytes"] for row in character_rows),
        }
    manifest = {
        "schema": "ggd.kof-xiv-vfx-texture-candidates@1",
        "sourceId": "steam-kofxiv-priority-mai-ior-kyo-build-local-v126",
        "conversionId": "kof-xiv-priority-vfx-textures-20260914-v1",
        "sourceGame": "THE KING OF FIGHTERS XIV",
        "platform": "Windows (Steam)",
        "tool": "macOS sips; every DDS converted twice and byte-compared",
        "selection": "All acquired DDS files directly under MAI/IOR/KYO Effect directories; existing PNGs and proprietary EFF/OBAC/ONC containers remain separate.",
        "outputRoot": str(output_root.resolve()),
        "summary": {
            "characters": len(per_character),
            "sourceDdsFiles": len(rows),
            "convertedPngFiles": len(rows),
            "outputBytes": sum(row["outputBytes"] for row in rows),
            "maxOutputEdge": max(max(row["outputFormat"]["width"], row["outputFormat"]["height"]) for row in rows),
            "overTextureLimit": sum(max(row["outputFormat"]["width"], row["outputFormat"]["height"]) > 256 for row in rows),
        },
        "perCharacter": per_character,
        "files": rows,
        "automaticEventBindings": 0,
        "runtimeVfxDocuments": 0,
        "backendSelectable": False,
        "productionDeploymentVerified": False,
        "backup": {
            "state": "pending-local-conversion-archive-and-s3-readback",
            "s3Uri": None,
            "readbackVerified": False,
        },
        "blockers": [
            "proprietary EFF/OBAC/ONC relationships are not decoded",
            "texture role, blend mode, timing and attachment point are not validated",
            "no GGD VFX document or skill binding has been generated",
            "visual review has not been performed",
        ],
    }
    tracked = repo / "materials/hero-model-library/source-inventories/kof-jump-container-coverage-v1/vfx-texture-candidates.json"
    encoded = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    if check:
        if not tracked.is_file() or tracked.read_text(encoding="utf-8") != encoded:
            raise SystemExit(f"stale generated file: {tracked}")
    else:
        tracked.parent.mkdir(parents=True, exist_ok=True)
        tracked.write_text(encoded, encoding="utf-8")
        output_root.mkdir(parents=True, exist_ok=True)
        (output_root / "manifest.json").write_text(encoded, encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    manifest = build(args.repo.resolve(), args.workspace.resolve(), args.check)
    print(json.dumps(manifest["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
