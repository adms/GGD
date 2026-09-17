#!/usr/bin/env python3
"""Export reconstructable assets from Popp's verified VFX dependency closure.

The Niagara systems themselves are not converted by this workflow.  It runs the
preserved project-specific UModel binary against every acquired dependency
package and records exactly which textures or other support files were emitted.
"""

from __future__ import annotations

import argparse
import collections
import datetime
import hashlib
import json
import re
import subprocess
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
LIBRARY = REPO.parent / "GGD-Asset-Library"
RECEIPT = REPO / "materials/hero-model-library/priority-evidence/infinity-strash-popp-vfx-events-v1/dependency-closure-receipt.json"
RAW = LIBRARY / "intake/windows-readonly-20260914/infinity-strash-popp-vfx-dependency-closure-v1/raw"
UMODEL = LIBRARY / "tools/UEViewer/specific-infinity-strash-macos-v1-texture-export-fix/umodel"
OUTPUT = LIBRARY / "conversions/infinity-strash-popp-vfx-dependency-export-v1"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def file_proof(path: Path, relative_to: Path | None = None) -> dict:
    row = {
        "absolutePath": str(path.resolve()),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }
    if relative_to is not None:
        row["path"] = path.relative_to(relative_to).as_posix()
    return row


def package_asset(raw: Path, row: dict) -> Path:
    return raw / f"{row['pakStem']}.uasset"


def expected_package_files(raw: Path, row: dict) -> list[Path]:
    stem = raw / row["pakStem"]
    return [stem.with_suffix(suffix) for suffix in (".uasset", ".uexp", ".ubulk") if stem.with_suffix(suffix).is_file()]


def validate_receipt_inputs(receipt_path: Path, raw: Path, receipt: dict) -> None:
    if receipt.get("schema") != "ggd.infinity-strash-popp-vfx-dependency-closure@1":
        raise ValueError("unexpected dependency-closure receipt schema")
    packages = receipt.get("packages", [])
    if len(packages) != receipt.get("summary", {}).get("referencesAcquired"):
        raise ValueError("dependency-closure package count differs from receipt summary")
    if receipt.get("missingReferences"):
        raise ValueError("dependency-closure receipt still has missing references")

    indexed = {Path(row["absolutePath"]).resolve(): row for row in receipt.get("files", [])}
    expected: set[Path] = set()
    for row in packages:
        files = expected_package_files(raw, row)
        if not files or not package_asset(raw, row).is_file():
            raise ValueError(f"missing acquired package input: {row['reference']}")
        expected.update(path.resolve() for path in files)
    if set(indexed) != expected:
        raise ValueError("dependency-closure receipt does not enumerate the exact package files")
    for path, row in indexed.items():
        if path.stat().st_size != row["bytes"] or sha256(path) != row["sha256"]:
            raise ValueError(f"dependency-closure input hash drift: {path}")
    if not receipt_path.is_file():
        raise ValueError(f"missing receipt: {receipt_path}")


def exported_files(root: Path) -> list[Path]:
    return sorted(path for path in root.rglob("*") if path.is_file())


def run_export(receipt_path: Path, raw: Path, umodel: Path, output: Path, timeout_sec: int) -> dict:
    receipt = json.loads(receipt_path.read_text())
    validate_receipt_inputs(receipt_path, raw, receipt)
    if not umodel.is_file():
        raise ValueError(f"missing preserved UModel binary: {umodel}")
    if output.exists() and any(output.iterdir()):
        raise ValueError(f"refusing to mix with non-empty output: {output}")
    output.mkdir(parents=True, exist_ok=True)
    export_root = output / "exported"
    export_root.mkdir()

    rows = []
    all_files = []
    for index, package in enumerate(receipt["packages"]):
        reference = package["reference"]
        asset = package_asset(raw, package)
        package_dir = export_root / f"{index:03d}-{hashlib.sha256(reference.encode()).hexdigest()[:12]}"
        package_dir.mkdir()
        try:
            process = subprocess.run(
                [str(umodel), "-game=strash", "-export", f"-out={package_dir}", str(asset)],
                text=True,
                capture_output=True,
                timeout=timeout_sec,
            )
            log = process.stdout + process.stderr
            return_code = process.returncode
            timed_out = False
        except subprocess.TimeoutExpired as error:
            stdout = error.stdout.decode(errors="replace") if isinstance(error.stdout, bytes) else (error.stdout or "")
            stderr = error.stderr.decode(errors="replace") if isinstance(error.stderr, bytes) else (error.stderr or "")
            log = stdout + stderr
            return_code = None
            timed_out = True

        produced = exported_files(package_dir)
        match = re.search(r"Exported\s+(\d+)/(\d+)\s+objects", log)
        proofs = [file_proof(path, output) for path in produced]
        all_files.extend(proofs)
        if timed_out:
            status = "converter-timeout"
        elif return_code != 0:
            status = "converter-failed"
        elif produced:
            status = "exported-support-assets"
        else:
            status = "no-exportable-output"
        rows.append(
            {
                "reference": reference,
                "pakStem": package["pakStem"],
                "input": [file_proof(path) for path in expected_package_files(raw, package)],
                "status": status,
                "returnCode": return_code,
                "timedOut": timed_out,
                "reportedExportedObjects": int(match.group(1)) if match else None,
                "reportedExportableObjects": int(match.group(2)) if match else None,
                "producedFiles": proofs,
                "logSha256": hashlib.sha256(log.encode()).hexdigest(),
                "logTail": log[-2000:],
            }
        )

    status_counts = collections.Counter(row["status"] for row in rows)
    extension_counts = collections.Counter(Path(row["path"]).suffix.lower() or "<none>" for row in all_files)
    manifest = {
        "schema": "ggd.infinity-strash-popp-vfx-dependency-export@1",
        "sourceId": "steam-infinity-strash-popp-vfx-dependency-export-build-local-20240328",
        "parentSourceId": receipt["sourceId"],
        "inputReceipt": file_proof(receipt_path),
        "rawRoot": str(raw.resolve()),
        "tool": file_proof(umodel),
        "summary": {
            "packagesAttempted": len(rows),
            "packagesExported": status_counts["exported-support-assets"],
            "packagesWithoutExportableOutput": status_counts["no-exportable-output"],
            "packagesFailed": status_counts["converter-failed"],
            "packagesTimedOut": status_counts["converter-timeout"],
            "filesExported": len(all_files),
            "bytesExported": sum(row["bytes"] for row in all_files),
            "extensionCounts": dict(sorted(extension_counts.items())),
        },
        "rows": rows,
        "files": all_files,
        "states": {
            "dependencySupportAssetsExported": bool(all_files),
            "niagaraSystemsConverted": False,
            "ggdVfxConverted": False,
            "visualAcceptancePassed": False,
            "runtimeSelectable": False,
            "deployed": False,
        },
        "claim": "This manifest proves only the byte-pinned export of reconstructable dependency support assets. It does not prove Niagara conversion, GGD VFX reconstruction, visual equivalence, skill binding, runtime selection, or deployment.",
        "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    manifest_path = output / "source-manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return manifest


def check_export(receipt_path: Path, raw: Path, umodel: Path, output: Path) -> dict:
    manifest_path = output / "source-manifest.json"
    if not manifest_path.is_file():
        raise ValueError(f"missing export manifest: {manifest_path}")
    manifest = json.loads(manifest_path.read_text())
    receipt = json.loads(receipt_path.read_text())
    validate_receipt_inputs(receipt_path, raw, receipt)
    if manifest.get("schema") != "ggd.infinity-strash-popp-vfx-dependency-export@1":
        raise ValueError("unexpected dependency-export manifest schema")
    for label, current, recorded in (
        ("input receipt", file_proof(receipt_path), manifest["inputReceipt"]),
        ("UModel", file_proof(umodel), manifest["tool"]),
    ):
        if any(current[key] != recorded[key] for key in ("bytes", "sha256")):
            raise ValueError(f"{label} hash drift")
    if len(manifest.get("rows", [])) != len(receipt["packages"]):
        raise ValueError("export manifest package count drift")
    listed = {row["path"]: row for row in manifest.get("files", [])}
    actual = {path.relative_to(output).as_posix(): path for path in exported_files(output / "exported")}
    if set(listed) != set(actual):
        raise ValueError("exported file inventory drift")
    for relative, path in actual.items():
        row = listed[relative]
        if path.stat().st_size != row["bytes"] or sha256(path) != row["sha256"]:
            raise ValueError(f"exported file hash drift: {path}")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--receipt", type=Path, default=RECEIPT)
    parser.add_argument("--raw", type=Path, default=RAW)
    parser.add_argument("--umodel", type=Path, default=UMODEL)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--timeout-sec", type=int, default=30)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    receipt = args.receipt.resolve()
    raw = args.raw.resolve()
    umodel = args.umodel.resolve()
    output = args.output.resolve()
    if args.check:
        result = check_export(receipt, raw, umodel, output)
        print(json.dumps({"status": "current", **result["summary"]}, ensure_ascii=False))
        return 0
    if args.timeout_sec < 1:
        raise ValueError("--timeout-sec must be positive")
    result = run_export(receipt, raw, umodel, output, args.timeout_sec)
    print(json.dumps({"output": str(output), **result["summary"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
