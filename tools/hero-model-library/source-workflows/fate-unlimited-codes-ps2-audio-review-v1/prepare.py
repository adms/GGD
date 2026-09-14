#!/usr/bin/env python3
"""Freeze the 653 verified Fate/unlimited codes PS2 WAVs into a review-only manifest.

The central voice manifest is authoritative.  Package labels identify source
groups only; they do not classify an individual clip's language, speaker,
dialogue/cry/SFX role, or game event.  This program never writes an audio
conversion, runtime binding, backend option, or deployment setting.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from pathlib import Path
import wave
from typing import Any


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
CONVERSION_ID = "fate-unlimited-codes-ps2-audio-review-v1"
GROUPS = {
    "spritedatabase-fate-ps2-archer:archer-character-audio": ("spritedatabase-fate-ps2-archer", 180),
    "spritedatabase-fate-ps2-shirou:shirou-character-audio": ("spritedatabase-fate-ps2-shirou", 222),
    "spritedatabase-fate-ps2-saber:saber-character-audio": ("spritedatabase-fate-ps2-saber", 251),
}
VOICE_INDEX = ROOT / "materials/hero-model-library/voice-index.json"
VOICE_FILES = ROOT / "materials/hero-model-library/voice-files.jsonl.gz"
EVIDENCE = ROOT / "materials/hero-model-library/priority-evidence" / CONVERSION_ID
RECEIPT = EVIDENCE / "receipt.json"
FILES = EVIDENCE / "files.jsonl.gz"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def pin(path: Path) -> dict[str, Any]:
    return {
        "gitPath": path.relative_to(ROOT).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object: {path}")
    return value


def safe_relative(value: str) -> Path:
    path = Path(value)
    if path.is_absolute() or ".." in path.parts:
        raise ValueError(f"unsafe voice-manifest path: {value}")
    return path


def source_rows(workspace: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    index = read_json(VOICE_INDEX)
    if index.get("schema") != "ggd-character-voice-index@1":
        raise ValueError("unexpected voice index schema")
    if index.get("localWorkspace") != str(workspace):
        raise ValueError("voice index workspace differs from explicit workspace")
    groups = {str(row.get("id")): row for row in index.get("groups", []) if isinstance(row, dict)}
    selected_groups: dict[str, dict[str, Any]] = {}
    for group_id, (source_id, expected_count) in GROUPS.items():
        group = groups.get(group_id)
        if not group:
            raise ValueError(f"missing PS2 audio group: {group_id}")
        if group.get("sourceId") != source_id or group.get("fileCount") != expected_count:
            raise ValueError(f"PS2 audio group contract drift: {group_id}")
        if group.get("language") != "unreviewed" or group.get("speakerVerified") is not False:
            raise ValueError(f"PS2 audio review state drift: {group_id}")
        selected_groups[group_id] = group

    rows: list[dict[str, Any]] = []
    with gzip.open(VOICE_FILES, "rt", encoding="utf-8") as stream:
        for line in stream:
            row = json.loads(line)
            if row.get("groupId") not in GROUPS:
                continue
            relative = safe_relative(str(row.get("path", "")))
            if relative.suffix.lower() != ".wav":
                raise ValueError(f"PS2 review candidate is not WAV: {relative}")
            if row.get("localSizeVerified") is not True or row.get("category") != "unclassified":
                raise ValueError(f"PS2 audio source has non-pending state: {relative}")
            source = workspace / relative
            if not source.is_file():
                raise FileNotFoundError(f"missing locally verified WAV: {source}")
            if source.stat().st_size != int(row["bytes"]) or sha256(source) != row["sha256"]:
                raise ValueError(f"WAV differs from central SHA-256 manifest: {relative}")
            try:
                with wave.open(str(source), "rb") as wav:
                    measured = {
                        "sampleRate": wav.getframerate(),
                        "channels": wav.getnchannels(),
                        "frames": wav.getnframes(),
                        "sampleWidthBytes": wav.getsampwidth(),
                    }
            except wave.Error as error:
                raise ValueError(f"WAV parse failed: {relative}: {error}") from error
            for key in ("sampleRate", "channels", "frames"):
                if measured[key] != row.get(key):
                    raise ValueError(f"WAV {key} differs from central manifest: {relative}")
            group_id = str(row["groupId"])
            source_id, _ = GROUPS[group_id]
            record_fingerprint = hashlib.sha256((source_id + "\0" + relative.as_posix()).encode("utf-8")).hexdigest()[:16]
            rows.append({
                "candidateId": f"fuc-ps2:{source_id}:{record_fingerprint}",
                "sourceId": source_id,
                "groupId": group_id,
                "sourcePackageLabel": selected_groups[group_id]["name"],
                "sourceRelativePath": relative.as_posix(),
                "sourceAbsolutePath": str(source.resolve()),
                "archiveMember": row.get("archiveMember"),
                "sourceBytes": int(row["bytes"]),
                "sourceSha256": row["sha256"],
                "sampleRate": measured["sampleRate"],
                "channels": measured["channels"],
                "frames": measured["frames"],
                "sampleWidthBytes": measured["sampleWidthBytes"],
                "seconds": row["seconds"],
                "category": "unclassified-audio",
                "reportedLanguage": "pending-confirmation",
                "speaker": "pending-confirmation",
                "event": "pending-confirmation",
                "runtimeBindingAuthorized": False,
                "runtimeSelectable": False,
                "productionDeployed": False,
            })
    rows.sort(key=lambda row: (row["sourceId"], row["sourceRelativePath"]))
    if len(rows) != sum(count for _, count in GROUPS.values()):
        raise ValueError(f"expected 653 PS2 WAV rows, got {len(rows)}")
    if len({row["candidateId"] for row in rows}) != len(rows):
        raise ValueError("PS2 review candidate ids are not unique")
    for group_id, (_, expected_count) in GROUPS.items():
        if sum(row["groupId"] == group_id for row in rows) != expected_count:
            raise ValueError(f"PS2 group count differs: {group_id}")
    return index, rows


def render(workspace: Path) -> tuple[bytes, bytes]:
    index, rows = source_rows(workspace)
    raw_rows = b"".join(
        json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8") + b"\n"
        for row in rows
    )
    compressed = gzip.compress(raw_rows, mtime=0)
    receipt = {
        "schema": "ggd.fate-unlimited-codes-ps2-audio-review-conversion@1",
        "conversionId": CONVERSION_ID,
        "sourceGame": "Fate/unlimited codes",
        "platform": "PS2 (Sprite Database public supplemental WAV collections; not a PS2 disc image)",
        "scope": "Archer 180 + Shirou 222 + Saber 251 = 653 original WAV files; no transcoding was necessary for local browser review.",
        "sourceInputs": [pin(VOICE_INDEX), pin(VOICE_FILES)],
        "voiceIndexWorkspace": index["localWorkspace"],
        "fileManifest": {
            "gitPath": FILES.relative_to(ROOT).as_posix(),
            "sha256": hashlib.sha256(compressed).hexdigest(),
            "uncompressedSha256": hashlib.sha256(raw_rows).hexdigest(),
            "encoding": "gzip-jsonl",
        },
        "summary": {
            "sourceWavFiles": len(rows),
            "archerWavFiles": sum(row["sourceId"] == "spritedatabase-fate-ps2-archer" for row in rows),
            "shirouWavFiles": sum(row["sourceId"] == "spritedatabase-fate-ps2-shirou" for row in rows),
            "saberWavFiles": sum(row["sourceId"] == "spritedatabase-fate-ps2-saber" for row in rows),
            "sourceBytes": sum(row["sourceBytes"] for row in rows),
            "wavHeadersVerified": len(rows),
            "perClipLanguageConfirmed": 0,
            "perClipSpeakerConfirmed": 0,
            "perClipCategoryConfirmed": 0,
            "perClipEventConfirmed": 0,
            "runtimeBindingsCreated": 0,
            "backendSelectableAssets": 0,
            "productionDeployments": 0,
        },
        "status": "verified-original-wavs-review-queue-pending-listening-and-classification",
        "limitations": [
            "Source package labels identify a collection; they do not confirm an individual file's speaker.",
            "Language, speaker, dialogue/cry/SFX category and GGD event are pending confirmation for every file.",
            "This review manifest is not a runtime registration, backend option, or production deployment.",
        ],
    }
    return json.dumps(receipt, ensure_ascii=False, indent=2).encode("utf-8") + b"\n", compressed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True, help="ABxVFX_EDIT root recorded by voice-index.json")
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.write == args.check:
        raise SystemExit("choose exactly one of --write or --check")
    receipt, files = render(args.workspace.resolve())
    if args.check:
        if not RECEIPT.is_file() or RECEIPT.read_bytes() != receipt:
            raise SystemExit("Fate PS2 review receipt is stale")
        if not FILES.is_file() or FILES.read_bytes() != files:
            raise SystemExit("Fate PS2 review file index is stale")
    else:
        EVIDENCE.mkdir(parents=True, exist_ok=True)
        RECEIPT.write_bytes(receipt)
        FILES.write_bytes(files)
    print(json.dumps({"conversionId": CONVERSION_ID, "reviewWavFiles": 653, "runtimeBindings": 0}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
