#!/usr/bin/env python3
"""Extract and freeze KOF XIV MAI/IOR/KYO assets from the read-only Steam WAD."""

from __future__ import annotations

import argparse
from collections import Counter
import gzip
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import subprocess


SOURCE_ID = "steam-kofxiv-priority-mai-ior-kyo-build-local-v126"
WAD_BYTES = 17_873_349_716
WAD_SHA256 = "96a14e2b0bd5a4de829e7b468b43909cc96a72d2ae3babcc3ef5d5d6249091f0"
QUICKBMS_SHA256 = "53f7a42ce35a68acf21a247b291032abe29b07246188f73df8eed776abca0af7"
SCRIPT_SHA256 = "ede3b47205d8fd92caceb9bcb96450ac7a03139359564dadfd8529c2d1b5bd13"
CHARACTERS = {
    "IOR": {"nameZh": "八神庵", "originalName": "Iori Yagami", "heroIds": ["community-review-02-20260907"]},
    "KYO": {"nameZh": "草薙京", "originalName": "Kyo Kusanagi", "heroIds": []},
    "MAI": {"nameZh": "不知火舞", "originalName": "Mai Shiranui", "heroIds": ["community-review-03-20260907"]},
}
EXPECTED_COUNTS = {"IOR": 365, "KYO": 354, "MAI": 369}
LIST_ROW = re.compile(r"^  ([0-9a-fA-F]{16}) +(\d+) +(.*)$")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def classify(path: str) -> str:
    suffix = PurePosixPath(path).suffix.lower()
    if suffix in {".dds", ".png"}:
        return "texture"
    if suffix == ".obac":
        return "model"
    if suffix in {".omir", ".osec"}:
        return "skeleton"
    if suffix in {".otra", ".oar"}:
        return "animation"
    if suffix in {".eff", ".ceff", ".leff", ".frag", ".vert"}:
        return "vfx"
    if suffix == ".ogg":
        return "audio"
    if suffix in {".sbnk", ".sgrp", ".slst"}:
        return "audio-metadata"
    return "configuration"


def parse_listing(text: str) -> list[dict]:
    rows = []
    for line in text.splitlines():
        match = LIST_ROW.match(line)
        if not match:
            continue
        path = match.group(3)
        posix = PurePosixPath(path)
        if posix.is_absolute() or ".." in posix.parts:
            raise ValueError("unsafe path in WAD index: " + path)
        if len(posix.parts) >= 3 and posix.parts[0] == "Chara" and posix.parts[1] in CHARACTERS:
            rows.append({"offset": int(match.group(1), 16), "bytes": int(match.group(2)), "path": path})
    return rows


def write_gzip_jsonl(path: Path, rows: list[dict]) -> None:
    with path.open("wb") as raw:
        with gzip.GzipFile(filename="", fileobj=raw, mode="wb", mtime=0) as compressed:
            with io.TextIOWrapper(compressed, encoding="utf-8", newline="\n") as text:
                for row in rows:
                    text.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--wad", type=Path, required=True)
    parser.add_argument("--quickbms", type=Path, required=True)
    parser.add_argument("--script", type=Path, required=True)
    parser.add_argument(
        "--local-root",
        default="GGD-Asset-Library/intake/windows-readonly-20260913/kof-xiv-priority-mai-ior-kyo-v1",
    )
    parser.add_argument("--reuse-extracted", action="store_true")
    args = parser.parse_args()
    workspace = args.workspace.resolve()
    local_root = (workspace / args.local_root).resolve()
    if not local_root.is_relative_to(workspace):
        raise ValueError("local output must remain inside the workspace")
    wad = args.wad.resolve()
    quickbms = args.quickbms.resolve()
    script = args.script.resolve()
    if sha256(quickbms) != QUICKBMS_SHA256 or sha256(script) != SCRIPT_SHA256:
        raise ValueError("QuickBMS executable or KOF XIV script differs from the pinned decoder")
    if wad.stat().st_size != WAD_BYTES or sha256(wad) != WAD_SHA256:
        raise ValueError("mounted assets.wad differs from the verified KOF XIV source")

    logs = local_root / "logs"
    extracted = local_root / "extracted"
    logs.mkdir(parents=True, exist_ok=True)
    extracted.mkdir(parents=True, exist_ok=True)
    list_log = logs / "quickbms-list.log"
    if not list_log.exists():
        result = subprocess.run([str(quickbms), "-l", str(script), str(wad)], check=True, capture_output=True, text=True)
        list_log.write_text(result.stdout, encoding="utf-8")
    selected = parse_listing(list_log.read_text(encoding="utf-8", errors="strict"))
    counts = Counter(PurePosixPath(row["path"]).parts[1] for row in selected)
    if dict(counts) != EXPECTED_COUNTS or len(selected) != 1088:
        raise ValueError(f"priority WAD scope changed: {dict(counts)}")

    if not args.reuse_extracted:
        result = subprocess.run(
            [str(quickbms), "-o", "-f", "Chara/MAI/{};Chara/IOR/{};Chara/KYO/{}", str(script), str(wad), str(extracted)],
            check=True,
            capture_output=True,
            text=True,
        )
        (logs / "quickbms-extract.log").write_text(result.stdout, encoding="utf-8")

    expected_paths = {row["path"] for row in selected}
    actual_paths = {path.relative_to(extracted).as_posix() for path in extracted.rglob("*") if path.is_file()}
    if actual_paths != expected_paths:
        missing = sorted(expected_paths - actual_paths)[:5]
        extra = sorted(actual_paths - expected_paths)[:5]
        raise ValueError(f"extracted path set differs: missing={missing}, extra={extra}")

    frozen = []
    for row in sorted(selected, key=lambda item: item["path"]):
        path = extracted / row["path"]
        if path.stat().st_size != row["bytes"]:
            raise ValueError("extracted byte count differs: " + row["path"])
        native_id = PurePosixPath(row["path"]).parts[1]
        frozen.append({
            **row,
            "sha256": sha256(path),
            "absolutePath": str(path),
            "nativeCharacterId": native_id,
            "characterNameZh": CHARACTERS[native_id]["nameZh"],
            "assetKind": classify(row["path"]),
        })
    write_gzip_jsonl(local_root / "files.jsonl.gz", frozen)
    audio = [row for row in frozen if row["assetKind"] == "audio"]
    write_gzip_jsonl(local_root / "audio-files.jsonl.gz", audio)

    audio_groups = []
    for native_id, identity in CHARACTERS.items():
        audio_groups.append({
            "id": f"kofxiv-{native_id.lower()}-native-audio",
            "name": identity["nameZh"],
            "characterName": identity["nameZh"],
            "nativeCharacterId": native_id,
            "heroIds": identity["heroIds"],
            "pathPrefixes": [f"extracted/Chara/{native_id}/Sound/"],
            "classification": "native-character-directory-audio-pending-listening-review",
            "languageReviewed": False,
            "speakerReviewed": False,
            "eventReviewed": False,
            "synthesisReady": False,
        })
    audio_index = {
        "schema": "ggd.audio-file-index.intake@1",
        "sourceId": SOURCE_ID,
        "sourceGame": "THE KING OF FIGHTERS XIV",
        "sourcePlatform": "Windows (Steam)",
        "audioGroups": audio_groups,
        "files": [
            {
                "path": "extracted/" + row["path"],
                "absolutePath": row["absolutePath"],
                "bytes": row["bytes"],
                "sha256": row["sha256"],
                "nativeCharacterId": row["nativeCharacterId"],
                "role": "unclassified-audio",
                "language": None,
                "speakerReviewed": False,
                "eventReviewed": False,
            }
            for row in audio
        ],
        "fileCount": len(audio),
        "totalBytes": sum(row["bytes"] for row in audio),
        "validation": "Every OGG file is an exact QuickBMS extraction with byte count and SHA-256. Directory identity is known; language, speaker, dialogue/SFX and skill event remain pending listening review.",
    }
    audio_index_path = local_root / "audio-file-index.json"
    audio_index_path.write_text(json.dumps(audio_index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    characters = []
    for native_id, identity in CHARACTERS.items():
        rows = [row for row in frozen if row["nativeCharacterId"] == native_id]
        kinds = Counter(row["assetKind"] for row in rows)
        characters.append({
            "nativeCharacterId": native_id,
            **identity,
            "fileCount": len(rows),
            "bytes": sum(row["bytes"] for row in rows),
            "assetKindCounts": dict(sorted(kinds.items())),
            "designStatus": "existing-ggd-hero-definition" if identity["heroIds"] else "acquired-model-awaiting-hero-design",
            "identityConfidence": "native-character-directory-exact",
        })
    extensions = Counter(PurePosixPath(row["path"]).suffix.lower() or "[no-extension]" for row in frozen)
    manifest = {
        "schema": "ggd-kofxiv-priority-extraction@1",
        "sourceId": SOURCE_ID,
        "sourceGame": "THE KING OF FIGHTERS XIV",
        "platform": "Windows (Steam)",
        "installedReleaseMarker": "Release_ver_1.26.txt present",
        "source": {"absolutePath": str(wad), "bytes": WAD_BYTES, "sha256": WAD_SHA256, "access": "read-only SMB"},
        "decoder": {
            "name": "QuickBMS 0.12.0 64-bit test binary under Rosetta",
            "executablePath": str(quickbms),
            "executableSha256": QUICKBMS_SHA256,
            "scriptPath": str(script),
            "scriptSha256": SCRIPT_SHA256,
            "scriptVersion": "kofxiv.bms 0.2",
        },
        "wadIndex": {"totalEntries": 39889, "pathSafetyVerified": True, "priorityEntries": len(frozen)},
        "characters": characters,
        "extensionCounts": dict(sorted(extensions.items())),
        "totalExtractedBytes": sum(row["bytes"] for row in frozen),
        "filesIndex": {"path": "files.jsonl.gz", "sha256": sha256(local_root / "files.jsonl.gz")},
        "audioFilesIndex": {"path": "audio-files.jsonl.gz", "sha256": sha256(local_root / "audio-files.jsonl.gz"), "fileCount": len(audio)},
        "audioFileIndex": {"path": "audio-file-index.json", "sha256": sha256(audio_index_path), "fileCount": len(audio)},
        "states": {
            "sourceFound": True,
            "sourceRead": True,
            "extracted": True,
            "hashed": True,
            "converted": False,
            "visuallyAccepted": False,
            "registeredAsBackendOption": False,
            "backendSelectable": False,
            "deployed": False,
        },
        "limitations": [
            "OBAC/OMIR/OSEC/OTRA and native effect records remain proprietary KOF XIV formats and are not yet converted to GGD runtime formats.",
            "OGG files are extracted and hashed, but speaker, dialogue/SFX role, language and skill-event binding remain pending listening review.",
            "MAI, IOR and KYO directory identity is exact; individual alternate costume/form semantics remain unreviewed.",
            "This extraction is source preservation and does not establish a backend model option or deployment.",
        ],
    }
    manifest_path = local_root / "source-manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"sourceId": SOURCE_ID, "files": len(frozen), "audio": len(audio), "bytes": manifest["totalExtractedBytes"], "manifest": str(manifest_path)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
