#!/usr/bin/env python3
"""Validate KOF XIV OGG payloads and preserve source-directory roles.

The WAD extraction already proves byte identity.  This stage adds playable
audio evidence without turning a directory label into a listening claim:
``Sound/voice`` remains ``voice-source-label-unreviewed`` and ``Sound/se`` is
classified as sound effect.  Language, speaker, transcript and skill-event
mapping remain unreviewed.
"""

from __future__ import annotations

import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import subprocess


SOURCE_ID = "steam-kofxiv-priority-mai-ior-kyo-build-local-v126"
EXPECTED_FILES = 474
CHARACTERS = {
    "IOR": {"nameZh": "八神庵", "heroIds": ["community-review-02-20260907"]},
    "KYO": {"nameZh": "草薙京", "heroIds": []},
    "MAI": {"nameZh": "不知火舞", "heroIds": ["community-review-03-20260907"]},
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def source_category(path: str) -> str:
    normalized = "/" + path.replace("\\", "/").strip("/") + "/"
    if "/Sound/voice/" in normalized:
        return "voice"
    if "/Sound/se/" in normalized:
        return "sfx"
    return "unclassified"


def tool_record(executable: Path) -> dict[str, object]:
    resolved = executable.resolve()
    first_line = subprocess.check_output([str(resolved), "-version"], text=True).splitlines()[0]
    return {
        "path": str(resolved),
        "bytes": resolved.stat().st_size,
        "sha256": sha256(resolved),
        "version": first_line,
    }


def inspect_file(row: dict[str, object], root: Path, ffprobe: Path, ffmpeg: Path) -> dict[str, object]:
    relative = str(row["path"])
    path = (root / relative).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise ValueError("unsafe or missing audio path: " + relative)
    if path.stat().st_size != row["bytes"] or sha256(path) != row["sha256"]:
        raise ValueError("KOF XIV audio payload changed: " + relative)

    probe = subprocess.run(
        [
            str(ffprobe), "-v", "error", "-select_streams", "a:0",
            "-show_entries", "stream=codec_name,sample_rate,channels,duration_ts,time_base",
            "-of", "json", str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    streams = json.loads(probe.stdout).get("streams", [])
    if len(streams) != 1:
        raise ValueError("expected one audio stream: " + relative)
    stream = streams[0]
    sample_rate = int(stream["sample_rate"])
    frames = int(stream["duration_ts"])
    if stream.get("codec_name") != "vorbis" or stream.get("time_base") != f"1/{sample_rate}":
        raise ValueError("unexpected OGG stream layout: " + relative)
    subprocess.run(
        [str(ffmpeg), "-v", "error", "-i", str(path), "-f", "null", "-"],
        check=True,
        capture_output=True,
    )
    category = source_category(relative)
    return {
        **row,
        "role": "sound-effect" if category == "sfx" else "voice-source-label-unreviewed",
        "codec": "vorbis",
        "sampleRate": sample_rate,
        "channels": int(stream["channels"]),
        "frames": frames,
        "durationSeconds": frames / sample_rate,
        "sourceCategory": category,
        "sourceLabelCategory": category,
        "language": None,
        "languageReviewed": False,
        "speakerReviewed": False,
        "speakerVerified": False,
        "transcriptReviewed": False,
        "eventReviewed": False,
        "synthesisReady": False,
        "decodeToNullPassed": True,
    }


def build_report(root: Path, ffprobe: Path, ffmpeg: Path, jobs: int) -> dict[str, object]:
    baseline_path = root / "audio-file-index.json"
    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    if baseline.get("sourceId") != SOURCE_ID or baseline.get("fileCount") != EXPECTED_FILES:
        raise ValueError("unexpected KOF XIV baseline audio index")
    rows = baseline["files"]
    if len({str(row["path"]) for row in rows}) != EXPECTED_FILES:
        raise ValueError("KOF XIV audio paths are missing or duplicated")
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        inspected = list(pool.map(lambda row: inspect_file(row, root, ffprobe, ffmpeg), rows))
    inspected.sort(key=lambda row: str(row["path"]))

    group_rows = []
    for native_id, identity in CHARACTERS.items():
        selected = [row for row in inspected if row["nativeCharacterId"] == native_id]
        group_rows.append({
            "id": f"kofxiv-{native_id.lower()}-native-audio",
            "name": identity["nameZh"],
            "characterName": identity["nameZh"],
            "nativeCharacterId": native_id,
            "heroIds": identity["heroIds"],
            "pathPrefixes": [f"extracted/Chara/{native_id}/Sound/"],
            "classification": "native-directory-voice-and-sfx-labels-decoded-listening-pending",
            "languageReviewed": False,
            "speakerReviewed": False,
            "eventReviewed": False,
            "synthesisReady": False,
            "fileCount": len(selected),
            "totalBytes": sum(int(row["bytes"]) for row in selected),
            "totalDurationSeconds": sum(float(row["durationSeconds"]) for row in selected),
            "sourceCategoryCounts": dict(sorted(Counter(str(row["sourceCategory"]) for row in selected).items())),
        })
    return {
        "schema": "ggd-kofxiv-audio-analysis@2",
        "sourceId": SOURCE_ID,
        "sourceGame": "THE KING OF FIGHTERS XIV",
        "sourcePlatform": "Windows (Steam, Release 1.26 marker)",
        "inputs": {
            "baselineAudioIndex": {
                "path": str(baseline_path),
                "bytes": baseline_path.stat().st_size,
                "sha256": sha256(baseline_path),
            }
        },
        "tools": {"ffprobe": tool_record(ffprobe), "ffmpeg": tool_record(ffmpeg)},
        "audioGroups": group_rows,
        "files": inspected,
        "fileCount": len(inspected),
        "totalBytes": sum(int(row["bytes"]) for row in inspected),
        "totalDurationSeconds": sum(float(row["durationSeconds"]) for row in inspected),
        "sourceCategoryCounts": dict(sorted(Counter(str(row["sourceCategory"]) for row in inspected).items())),
        "decodeToNullPassed": all(row["decodeToNullPassed"] is True for row in inspected),
        "classificationEvidence": (
            "Sound/voice and Sound/se are native WAD directory labels. Voice-labelled files remain unreviewed "
            "for language, speaker, transcript and event; no filename-only listening claim is made."
        ),
    }


def updated_manifest(root: Path, report_path: Path, report: dict[str, object]) -> dict[str, object]:
    manifest_path = root / "source-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("sourceId") != SOURCE_ID:
        raise ValueError("unexpected KOF XIV source manifest")
    manifest["audioFileIndex"] = {
        "path": report_path.name,
        "sha256": sha256(report_path),
        "fileCount": report["fileCount"],
    }
    manifest["audioValidation"] = {
        "decodedFiles": report["fileCount"],
        "totalDurationSeconds": report["totalDurationSeconds"],
        "sourceCategoryCounts": report["sourceCategoryCounts"],
        "decodeToNullPassed": report["decodeToNullPassed"],
        "languageReviewed": False,
        "speakerReviewed": False,
        "eventReviewed": False,
    }
    manifest["states"]["audioDecodeVerified"] = True
    old = "OGG files are extracted and hashed, but speaker, dialogue/SFX role, language and skill-event binding remain pending listening review."
    new = (
        "All OGG files are extracted, hashed and FFmpeg-decoded. Native Sound/voice versus Sound/se directory roles are retained; "
        "language, speaker, transcript and skill-event binding remain pending listening review."
    )
    manifest["limitations"] = [new if item == old else item for item in manifest["limitations"]]
    return manifest


def encoded(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--ffprobe", type=Path, default=Path("/usr/local/bin/ffprobe"))
    parser.add_argument("--ffmpeg", type=Path, default=Path("/usr/local/bin/ffmpeg"))
    parser.add_argument("--jobs", type=int, default=8)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.jobs < 1 or args.jobs > 32:
        raise ValueError("jobs must be between 1 and 32")
    root = args.root.resolve()
    report_path = root / "audio-analysis-v2.json"
    report = build_report(root, args.ffprobe, args.ffmpeg, args.jobs)
    report_bytes = encoded(report)
    if args.check:
        if not report_path.is_file() or report_path.read_bytes() != report_bytes:
            raise ValueError("KOF XIV audio analysis is stale")
        manifest = updated_manifest(root, report_path, report)
        if (root / "source-manifest.json").read_bytes() != encoded(manifest):
            raise ValueError("KOF XIV source manifest is stale")
        print(json.dumps({"check": "ok", "files": report["fileCount"], "seconds": report["totalDurationSeconds"]}))
        return 0
    report_path.write_bytes(report_bytes)
    manifest = updated_manifest(root, report_path, report)
    (root / "source-manifest.json").write_bytes(encoded(manifest))
    print(json.dumps({
        "report": str(report_path),
        "files": report["fileCount"],
        "seconds": report["totalDurationSeconds"],
        "categories": report["sourceCategoryCounts"],
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
