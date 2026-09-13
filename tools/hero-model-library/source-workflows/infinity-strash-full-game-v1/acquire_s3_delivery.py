#!/usr/bin/env python3
"""Fetch one user-provided Infinity Strash delivery from the approved S3 prefix.

The script deliberately accepts neither another bucket nor another AWS profile.
It fetches only the two primary WindowsClient PAKs, their direct sidecars and an
optional MANIFEST.sha256, preserves the object identity and byte count, then
runs the local, non-extracting delivery gate.  It does not upload, delete,
unpack or otherwise alter the user-provided objects.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


BUCKET = "ggd-390630837668-ap-east-2-an"
PREFIX = "legacy/user-provided/infinity-strash/paks/"
PROFILE = "vibe-coding"
REGION = "ap-east-2"
PRIMARY = {"pakchunk0-WindowsClient.pak", "pakchunk1-WindowsClient.pak"}
ALLOWED = PRIMARY | {
    "MANIFEST.sha256",
    "pakchunk0-WindowsClient.utoc", "pakchunk0-WindowsClient.ucas", "pakchunk0-WindowsClient.sig",
    "pakchunk1-WindowsClient.utoc", "pakchunk1-WindowsClient.ucas", "pakchunk1-WindowsClient.sig",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def select_objects(contents: list[dict[str, object]] | None) -> list[dict[str, object]]:
    """Validate the exact direct-object contract before any local write."""
    selected: dict[str, dict[str, object]] = {}
    for row in contents or []:
        key = row.get("Key")
        if not isinstance(key, str) or not key.startswith(PREFIX):
            raise ValueError("unexpected S3 object key")
        name = key.removeprefix(PREFIX)
        if "/" in name or name not in ALLOWED:
            raise ValueError("unrecognized object under delivery prefix: " + key)
        if name in selected:
            raise ValueError("duplicate S3 object name: " + name)
        size = row.get("Size")
        if not isinstance(size, int) or size < 0:
            raise ValueError("missing or invalid S3 object size: " + key)
        selected[name] = row
    missing = sorted(PRIMARY - selected.keys())
    if missing:
        raise ValueError("required S3 objects are absent: " + ", ".join(missing))
    return [selected[name] for name in sorted(selected)]


def aws(arguments: list[str]) -> str:
    env = dict(os.environ, AWS_PROFILE=PROFILE, AWS_REGION=REGION, AWS_PAGER="")
    process = subprocess.run(["aws", *arguments, "--profile", PROFILE, "--region", REGION, "--no-cli-pager"],
                             env=env, text=True, capture_output=True)
    if process.returncode:
        resource = f"s3://{BUCKET}/{PREFIX}" if arguments[:2] == ["s3api", "list-objects-v2"] else "configured AWS profile"
        raise RuntimeError(f"AWS command failed ({arguments[0]} {arguments[1]}) on {resource}: {process.stderr.strip()}")
    return process.stdout


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="New local intake directory; originals are written to output/original.")
    args = parser.parse_args()
    output = args.output.resolve()
    if output.exists() or output.is_symlink():
        raise ValueError("output must be a new, non-symlink directory")
    if not output.parent.is_dir():
        raise ValueError("output parent must already exist")

    arn = aws(["sts", "get-caller-identity", "--query", "Arn", "--output", "text"]).strip()
    if "assumed-role/vibe-coding-s3-role/" not in arn:
        raise RuntimeError("STOP: configured profile identity mismatch: " + arn)
    listed = json.loads(aws(["s3api", "list-objects-v2", "--bucket", BUCKET, "--prefix", PREFIX, "--output", "json"]))
    objects = select_objects(listed.get("Contents"))

    with tempfile.TemporaryDirectory(prefix="infinity-strash-download-", dir=output.parent) as temporary:
        stage = Path(temporary)
        original = stage / "original"
        original.mkdir()
        rows = []
        for object_row in objects:
            key = object_row["Key"]
            assert isinstance(key, str)
            name = key.removeprefix(PREFIX)
            destination = original / name
            aws(["s3", "cp", f"s3://{BUCKET}/{key}", str(destination), "--only-show-errors"])
            size = object_row["Size"]
            assert isinstance(size, int)
            if destination.stat().st_size != size:
                raise RuntimeError("downloaded byte count differs from S3 listing: " + name)
            rows.append({"name": name, "s3Uri": f"s3://{BUCKET}/{key}", "bytes": size,
                         "etag": object_row.get("ETag"), "lastModified": object_row.get("LastModified"),
                         "sha256": sha256(destination)})
        inspection_dir = stage / "inspection"
        inspector = Path(__file__).with_name("inspect_delivery.py")
        subprocess.run([sys.executable, str(inspector), str(original), str(inspection_dir)], check=True)
        inspection = inspection_dir / "delivery-inspection.json"
        receipt = {
            "schema": "ggd-infinity-strash-user-s3-acquisition@1",
            "sourceWork": "Infinity Strash: DRAGON QUEST The Adventure of Dai",
            "sourcePlatform": "Windows game installation; user-provided original containers",
            "s3": {"bucket": BUCKET, "prefix": PREFIX, "profile": PROFILE, "region": REGION, "callerArn": arn},
            "downloadedAt": datetime.now(timezone.utc).isoformat(),
            "objects": rows,
            "inspection": {"path": "inspection/delivery-inspection.json", "sha256": sha256(inspection)},
            "extractionState": "not-attempted",
            "localPreserved": True,
            "nextStep": "Choose an extractor only after the recorded PAK/IoStore evidence establishes a compatible format.",
        }
        (stage / "acquisition.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        shutil.move(str(stage), str(output))
    print(json.dumps({"output": str(output), "objects": len(rows), "primaryContainers": sorted(PRIMARY),
                      "inspectionSha256": receipt["inspection"]["sha256"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError, json.JSONDecodeError) as error:
        raise SystemExit("error: " + str(error))
