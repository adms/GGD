#!/usr/bin/env python3
"""Verify and extract the pinned RPCS3 macOS package for the J-Stars capture lane."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
import os
from pathlib import Path
from typing import Any


PACKAGE_BYTES = 40_231_415
PACKAGE_SHA256 = "bb789a07dd60353d8cbf3806f0eef4c7c5440c1cbe89f198b6856803068ead9f"
SEVEN_ZIP_CANDIDATES = (
    Path("/Applications/Keka.app/Contents/MacOS/keka7zz"),
    Path("/Applications/Parallels Desktop.app/Contents/MacOS/7z"),
    Path("/opt/homebrew/bin/7z"),
    Path("/usr/local/bin/7z"),
)


def repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def sha256_path(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def find_7z() -> Path:
    rejected: list[str] = []
    for path in SEVEN_ZIP_CANDIDATES:
        if not path.is_file():
            continue
        probe = subprocess.run([str(path), "i"], text=True, capture_output=True, check=False, timeout=15)
        if probe.returncode == 0:
            return path
        rejected.append(f"{path} (return code {probe.returncode})")
    command = shutil.which("7z")
    if command:
        path = Path(command)
        probe = subprocess.run([str(path), "i"], text=True, capture_output=True, check=False, timeout=15)
        if probe.returncode == 0:
            return path
        rejected.append(f"{path} (return code {probe.returncode})")
    raise FileNotFoundError("no working local 7z executable found; rejected: " + ", ".join(rejected))


def record(path: Path) -> dict[str, Any]:
    return {"absolutePath": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha256_path(path)}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    workspace = repo_root().parent
    tool_root = workspace / "GGD-Asset-Library/tools/rpcs3-macos-arm64"
    parser.add_argument("--archive", type=Path, default=tool_root / "rpcs3-v0.0.42-20023-f4a74819_macos.7z")
    parser.add_argument("--output", type=Path, default=tool_root / "build-f4a74819d385f8638c3b09c1c0ad9e3a5eb53ce0")
    parser.add_argument("--receipt", type=Path, default=tool_root / "setup-receipt.json")
    parser.add_argument("--refresh-receipt", action="store_true", help="re-probe a previously receipted exact output without re-extracting")
    args = parser.parse_args(argv)
    archive, output, receipt = args.archive.resolve(), args.output.resolve(), args.receipt.resolve()
    if not archive.is_file():
        raise FileNotFoundError(archive)
    package = record(archive)
    if package["bytes"] != PACKAGE_BYTES or package["sha256"] != PACKAGE_SHA256:
        raise ValueError(f"RPCS3 package is incomplete or mismatched: {package}")
    seven_zip = find_7z()
    resumed_after_probe_failure = False
    if output.exists():
        if receipt.exists() and not args.refresh_receipt:
            raise FileExistsError(f"refusing to overwrite existing RPCS3 output with receipt: {output}")
        applications = sorted(output.rglob("RPCS3.app"))
        if len(applications) != 1 or not (applications[0] / "Contents/MacOS/rpcs3").is_file():
            raise FileExistsError(f"existing unreceipted RPCS3 output is incomplete and requires review: {output}")
        resumed_after_probe_failure = True
    else:
        output.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="jstars-rpcs3-", dir=output.parent) as temporary_text:
            temporary = Path(temporary_text)
            completed = subprocess.run([str(seven_zip), "x", "-y", f"-o{temporary}", str(archive)], text=True, capture_output=True, check=False)
            if completed.returncode != 0:
                raise RuntimeError(f"7z extraction failed ({completed.returncode}): {completed.stderr[-2000:]}")
            applications = sorted(temporary.rglob("RPCS3.app"))
            if len(applications) != 1:
                raise ValueError(f"expected one RPCS3.app, found {len(applications)}")
            temporary.rename(output)
    app = next(output.rglob("RPCS3.app"))
    executable = app / "Contents/MacOS/rpcs3"
    if not executable.is_file():
        raise FileNotFoundError(f"RPCS3 executable missing after extraction: {executable}")
    executable_mode_fix_applied = not executable.stat().st_mode & 0o111
    if executable_mode_fix_applied:
        executable.chmod(executable.stat().st_mode | 0o755)
    version = subprocess.run([str(executable), "--version"], text=True, capture_output=True, check=False, timeout=30)
    help_probe = subprocess.run([str(executable), "--help"], text=True, capture_output=True, check=False, timeout=30)
    preserved_root = workspace / "GGD-Asset-Library/intake/owner-jstars-victory-vs-plus-20260917/boot-inputs"
    firmware = preserved_root / "PS3_UPDATE/PS3UPDAT.PUP"
    mounted_eboot = Path("/Volumes/PS3VOLUME/PS3_GAME/USRDIR/EBOOT.BIN")
    pine_socket = Path(os.environ.get("TMPDIR", "/tmp")) / "rpcs3.sock"
    files = sorted(path for path in output.rglob("*") if path.is_file())
    value = {
        "schema": "ggd.jstars-rpcs3-tool-setup@1",
        "package": package,
        "expectedPackage": {"bytes": PACKAGE_BYTES, "sha256": PACKAGE_SHA256},
        "sevenZip": record(seven_zip),
        "output": str(output),
        "application": str(app),
        "executable": str(executable),
        "executableModeFixApplied": executable_mode_fix_applied,
        "resumedAfterProbeFailure": resumed_after_probe_failure,
        "receiptRefreshed": args.refresh_receipt,
        "fileCount": len(files),
        "fileBytes": sum(path.stat().st_size for path in files),
        "versionProbe": {"returnCode": version.returncode, "stdout": version.stdout.strip(), "stderr": version.stderr.strip()},
        "helpProbe": {"returnCode": help_probe.returncode, "stdout": help_probe.stdout.strip(), "stderr": help_probe.stderr.strip()},
        "commands": {
            "installFirmware": [str(executable), "--installfw", str(firmware.resolve())],
            "launchGame": [str(executable), "--no-gui", str(mounted_eboot)],
        },
        "headlessFirmwareInstallSupportedByHelp": "--headless" in help_probe.stdout and "--installfw" in help_probe.stdout,
        "headlessFirmwareInstallRecommended": False,
        "pine": {"configuredPort": 28012, "macosUnixSocket": str(pine_socket)},
        "firmwareInstalled": False,
        "gameBootVerified": False,
    }
    receipt.parent.mkdir(parents=True, exist_ok=True)
    receipt.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"receipt": str(receipt), "fileCount": len(files), "version": version.stdout.strip()}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
