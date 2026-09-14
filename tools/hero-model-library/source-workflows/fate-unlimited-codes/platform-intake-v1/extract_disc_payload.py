#!/usr/bin/env python3
"""Safely inventory or extract a supplied FUC ZIP/ISO into a new directory."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import stat
import subprocess
import tempfile
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any


MAX_MEMBERS = 200_000
MAX_EXTRACTED_BYTES = 64 * 1024 * 1024 * 1024
RESOURCE_KINDS = {
    ".zip": "nested-archive-candidate",
    ".iso": "disc-image-candidate",
    ".fpk": "fuc-container-candidate",
    ".gmo": "psp-model-animation-candidate",
    ".gim": "psp-texture-candidate",
    ".at3": "psp-audio-candidate",
    ".adx": "audio-candidate",
    ".aix": "audio-candidate",
    ".afs": "audio-container-candidate",
    ".awb": "audio-container-candidate",
    ".wav": "decoded-audio-candidate",
    ".ogg": "decoded-audio-candidate",
    ".pmf": "psp-video-candidate",
}

POSSIBLE_ASSET_KINDS = {
    ".zip": ["container"],
    ".iso": ["container"],
    ".fpk": ["container", "model", "texture", "skeleton", "motion", "vfx", "audio", "voice"],
    ".gmo": ["model", "skeleton", "motion", "texture"],
    ".gim": ["texture"],
    ".at3": ["audio", "voice-pending-listening"],
    ".adx": ["audio", "voice-pending-listening"],
    ".aix": ["audio", "voice-pending-listening"],
    ".afs": ["audio-container", "voice-pending-listening"],
    ".awb": ["audio-container", "voice-pending-listening"],
    ".wav": ["audio", "voice-pending-listening"],
    ".ogg": ["audio", "voice-pending-listening"],
    ".pmf": ["video", "audio"],
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_name(raw: str) -> str:
    normalized = raw.replace("\\", "/")
    path = PurePosixPath(normalized)
    if not normalized or path.is_absolute() or ".." in path.parts or "\x00" in normalized:
        raise ValueError("Unsafe archive member path: " + repr(raw))
    return normalized


def zip_members(source: Path) -> list[dict[str, Any]]:
    rows = []
    with zipfile.ZipFile(source) as archive:
        infos = archive.infolist()
        if len(infos) > MAX_MEMBERS:
            raise ValueError("Archive member limit exceeded")
        seen: set[str] = set()
        total_bytes = 0
        for info in infos:
            name = safe_name(info.filename)
            folded = name.casefold()
            if folded in seen:
                raise ValueError("Case-colliding archive member: " + name)
            seen.add(folded)
            if info.flag_bits & 1:
                raise ValueError("Encrypted ZIP member is not accepted: " + name)
            total_bytes += info.file_size
            if total_bytes > MAX_EXTRACTED_BYTES:
                raise ValueError("Archive expanded byte limit exceeded")
            rows.append({
                "path": name,
                "bytes": info.file_size,
                "compressedBytes": info.compress_size,
                "crc32": f"{info.CRC:08x}",
                "isDirectory": info.is_dir(),
            })
    return rows


def bsdtar_members(source: Path) -> list[dict[str, Any]]:
    executable = shutil.which("bsdtar")
    if not executable:
        raise RuntimeError("bsdtar is required to read ISO images")
    result = subprocess.run([executable, "-tf", str(source)], capture_output=True, text=True)
    if result.returncode:
        raise ValueError("bsdtar could not inventory the image: " + result.stderr.strip())
    names = [line for line in result.stdout.splitlines() if line]
    if len(names) > MAX_MEMBERS:
        raise ValueError("Image member limit exceeded")
    seen: set[str] = set()
    rows = []
    for raw in names:
        name = safe_name(raw)
        folded = name.casefold()
        if folded in seen:
            raise ValueError("Case-colliding image member: " + name)
        seen.add(folded)
        rows.append({"path": name, "bytes": None, "isDirectory": name.endswith("/")})
    return rows


def inventory(source: Path) -> dict[str, Any]:
    if not source.is_file():
        raise FileNotFoundError(source)
    suffix = source.suffix.casefold()
    if suffix == ".zip":
        members = zip_members(source)
        container = "ZIP"
    elif suffix == ".iso":
        members = bsdtar_members(source)
        container = "ISO"
    else:
        raise ValueError("Only .zip and .iso inputs are accepted")
    candidates = []
    extension_counts: dict[str, int] = {}
    for row in members:
        extension = Path(row["path"]).suffix.casefold()
        if extension:
            extension_counts[extension] = extension_counts.get(extension, 0) + 1
        kind = RESOURCE_KINDS.get(extension)
        if kind:
            candidates.append({
                "path": row["path"],
                "bytes": row.get("bytes"),
                "extension": extension,
                "kind": kind,
                "possibleAssetKinds": POSSIBLE_ASSET_KINDS[extension],
                "identityStatus": "pending-format-and-character-inspection",
            })
    candidate_counts: dict[str, int] = {}
    for row in candidates:
        candidate_counts[row["kind"]] = candidate_counts.get(row["kind"], 0) + 1
    return {
        "schema": "ggd-fuc-disc-payload-inventory@1",
        "source": str(source.resolve()),
        "sourceBytes": source.stat().st_size,
        "sourceSha256": sha256(source),
        "container": container,
        "memberCount": len(members),
        "members": members,
        "resourceCandidates": candidates,
        "extensionCounts": dict(sorted(extension_counts.items())),
        "resourceCandidateCounts": dict(sorted(candidate_counts.items())),
        "assetReadiness": {
            kind: {
                "candidateCount": sum(kind in row["possibleAssetKinds"] for row in candidates),
                "identityStatus": "pending-format-and-character-inspection",
                "conversionStatus": "not-started",
                "validationStatus": "not-started",
            }
            for kind in ("model", "texture", "skeleton", "motion", "vfx", "audio")
        },
        "voiceReadiness": {
            "candidateCount": sum("voice-pending-listening" in row["possibleAssetKinds"] for row in candidates),
            "speakerLanguageEventStatus": "pending-listening-review",
            "conversionStatus": "not-started",
        },
        "contentIdentityStatus": "container-inventoried-resource-identity-pending",
        "conversionStatus": "not-started",
    }


def hash_tree(root: Path) -> list[dict[str, Any]]:
    rows = []
    total_bytes = 0
    for current, directories, files in os.walk(root, topdown=True, followlinks=False):
        for name in directories:
            if (Path(current) / name).is_symlink():
                raise ValueError("Extracted symbolic-link directory is not accepted: " + name)
        for name in files:
            path = Path(current) / name
            mode = path.lstat().st_mode
            if not stat.S_ISREG(mode):
                raise ValueError("Extracted non-regular file is not accepted: " + str(path))
            relative = path.relative_to(root).as_posix()
            total_bytes += path.stat().st_size
            if total_bytes > MAX_EXTRACTED_BYTES:
                raise ValueError("Extracted byte limit exceeded")
            rows.append({
                "path": relative,
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
                "kind": RESOURCE_KINDS.get(path.suffix.casefold(), "unclassified"),
            })
    rows.sort(key=lambda row: row["path"])
    return rows


def extract(source: Path, destination: Path) -> dict[str, Any]:
    if destination.exists():
        raise FileExistsError("Output must not already exist: " + str(destination))
    report = inventory(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=destination.name + ".tmp-", dir=destination.parent))
    try:
        if report["container"] == "ZIP":
            with zipfile.ZipFile(source) as archive:
                archive.extractall(temporary)
                bad = archive.testzip()
                if bad is not None:
                    raise ValueError("ZIP CRC failed: " + bad)
        else:
            executable = shutil.which("bsdtar")
            result = subprocess.run([executable, "-xf", str(source), "-C", str(temporary)], capture_output=True, text=True)
            if result.returncode:
                raise ValueError("bsdtar extraction failed: " + result.stderr.strip())
        files = hash_tree(temporary)
        report.update({
            "schema": "ggd-fuc-disc-payload-extraction@1",
            "destination": str(destination.resolve()),
            "extractedFileCount": len(files),
            "extractedBytes": sum(row["bytes"] for row in files),
            "files": files,
            "extractionStatus": "extracted-hashed-resource-classification-pending",
        })
        (temporary / "disc-extraction.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        temporary.rename(destination)
    except Exception:
        shutil.rmtree(temporary, ignore_errors=True)
        raise
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--extract-to", type=Path)
    args = parser.parse_args()
    report = extract(args.source, args.extract_to) if args.extract_to else inventory(args.source)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
