#!/usr/bin/env python3
"""Decode the KOF XIV 1P base-colour DDS subset to review-only 256px PNGs."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import struct
import subprocess
import tempfile
from pathlib import Path


PATTERNS = {
    "MAI": "MAI_COL_*_1P.dds",
    "IOR": "IOR_COL_*_1P.dds",
    "KYO": "KYO_COL_*_1P.dds",
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
    return {"width": width, "height": height, "channels": channels}


def dds_format(path: Path) -> dict[str, object]:
    raw = path.read_bytes()[:132]
    if raw[:4] != b"DDS ":
        raise ValueError(f"not DDS: {path}")
    fourcc = raw[84:88].decode("latin1")
    return {"fourCC": fourcc, "dxgiFormat": int.from_bytes(raw[128:132], "little") if fourcc == "DX10" else None}


def convert(source: Path, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as directory:
        first = Path(directory) / "first.png"
        second = Path(directory) / "second.png"
        for candidate in (first, second):
            proc = subprocess.run(["sips", "-Z", "256", "-s", "format", "png", str(source), "--out", str(candidate)], text=True, capture_output=True)
            if proc.returncode != 0 or not candidate.is_file():
                raise RuntimeError(f"sips failed for {source}: {proc.stdout}{proc.stderr}")
        if sha256(first) != sha256(second):
            raise RuntimeError(f"non-deterministic sips output: {source}")
        shutil.copyfile(first, output)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    workspace = args.workspace.resolve()
    repo = args.repo.resolve()
    root = workspace / "GGD-Asset-Library/intake/windows-readonly-20260913/kof-xiv-priority-mai-ior-kyo-v1/extracted/Chara"
    out_root = workspace / "GGD-Asset-Library/conversions/kof-xiv-priority-textures-20260914-v1"
    rows = []
    for cid, pattern in PATTERNS.items():
        sources = sorted((root / cid).glob(pattern))
        if not sources:
            raise FileNotFoundError(f"no textures matched {cid}/{pattern}")
        for source in sources:
            output = out_root / cid / (source.stem + ".png")
            if not args.check:
                convert(source, output)
            if not output.is_file():
                raise FileNotFoundError(output)
            metrics = png_metrics(output)
            if max(metrics["width"], metrics["height"]) > 256:
                raise ValueError(f"texture exceeds 256px: {output}")
            rows.append({
                "nativeCharacterId": cid,
                "sourceAbsolutePath": str(source.resolve()),
                "sourceBytes": source.stat().st_size,
                "sourceSha256": sha256(source),
                "sourceFormat": dds_format(source),
                "outputAbsolutePath": str(output.resolve()),
                "outputBytes": output.stat().st_size,
                "outputSha256": sha256(output),
                **metrics,
                "state": "decoded-review-candidate-not-material-bound",
            })
    manifest = {
        "schema": "ggd.kof-xiv-texture-candidates@1",
        "sourceId": "steam-kofxiv-priority-mai-ior-kyo-build-local-v126",
        "conversionId": "kof-xiv-priority-textures-20260914-v1",
        "selection": "Only root-level 1P COL textures; effects, alternate colours, normal/specular/emissive maps remain preserved but unconverted.",
        "tool": "macOS sips (determinism checked by two independent conversions per input)",
        "outputRoot": str(out_root.resolve()),
        "files": rows,
        "summary": {"files": len(rows), "bytes": sum(row["outputBytes"] for row in rows), "maxEdge": max(max(row["width"], row["height"]) for row in rows)},
        "readiness": "decoded-review-candidates; model/material mapping and visual validation blocked by native model converter",
        "runtimeReady": False,
        "backendSelectionVerified": False,
    }
    receipt_path = workspace / "GGD-Asset-Library/backups/kof-xiv-priority-textures-20260914-v1/latest-receipt.json"
    if receipt_path.is_file():
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        if not all(receipt.get(key) is True for key in ("fullGetVerified", "allMemberSha256Verified", "localUnchanged")):
            raise ValueError("texture backup receipt is not fully verified")
        manifest["backup"] = {
            "s3Uri": receipt["s3Uri"], "manifestUri": receipt["manifestUri"],
            "archiveSha256": receipt["archiveSha256"], "archiveBytes": receipt["archiveBytes"],
            "fileCount": receipt["fileCount"], "fullGetVerified": True,
            "allMemberSha256Verified": True, "localUnchanged": True,
        }
    rendered = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    tracked = repo / "materials/hero-model-library/source-inventories/kof-3d-sources-v1/texture-candidates.json"
    if args.check:
        if not tracked.is_file() or tracked.read_text(encoding="utf-8") != rendered:
            raise SystemExit("texture candidate manifest is stale")
    else:
        tracked.write_text(rendered, encoding="utf-8")
        local_manifest = dict(manifest)
        local_manifest.pop("backup", None)
        (out_root / "manifest.json").write_text(json.dumps(local_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
