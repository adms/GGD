#!/usr/bin/env python3
"""Prepare KOF XV Ash's preserved Float32 WAVs as review-only MP3 candidates.

The source package calls this directory ``XV_Ash``.  That establishes package
scope only: individual clips remain unclassified until listening review.  This
tool never writes a runtime binding or overwrites the source WAV/OGG files.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
from typing import Any


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
CONVERSION_ID = "kof-xv-ash-audio-review-v1"
SOURCE_ID = "kof-xv-ash-audio-float32-v1"
SOURCE_RELATIVE = Path(
    "GGD-Asset-Library/intake/public-models-20260910/"
    "kof-mffa-miner600-xv-audio-float32-v1"
)
OUTPUT_RELATIVE = Path("GGD-Asset-Library/conversions") / CONVERSION_ID
RECEIPT_RELATIVE = Path("materials/hero-model-library/priority-evidence") / CONVERSION_ID / "receipt.json"
FILES_RELATIVE = RECEIPT_RELATIVE.with_name("files.jsonl.gz")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def json_load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object: {path}")
    return value


def safe_relative(value: str) -> Path:
    path = Path(value)
    if path.is_absolute() or ".." in path.parts:
        raise ValueError(f"unsafe source path: {value}")
    return path


def ffmpeg_version() -> str:
    proc = subprocess.run(["ffmpeg", "-version"], text=True, capture_output=True, check=True)
    return next(line for line in proc.stdout.splitlines() if line.strip())


def run_encode(source: Path, output: Path) -> None:
    proc = subprocess.run(
        [
            "ffmpeg", "-nostdin", "-v", "error", "-i", str(source),
            "-map_metadata", "-1", "-vn", "-fflags", "+bitexact", "-flags:a", "+bitexact",
            "-c:a", "libmp3lame", "-b:a", "96k", "-write_xing", "0", "-id3v2_version", "0",
            str(output),
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0 or not output.is_file():
        raise RuntimeError(f"ffmpeg failed for {source}: {proc.stderr}")


def probe_mp3(path: Path) -> dict[str, Any]:
    decode = subprocess.run(
        ["ffmpeg", "-nostdin", "-v", "error", "-i", str(path), "-f", "null", "-"],
        text=True, capture_output=True, check=False,
    )
    if decode.returncode != 0:
        raise RuntimeError(f"full MP3 decode failed for {path}: {decode.stderr}")
    raw = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_name,sample_rate,channels", "-of", "json", str(path)],
        text=True,
    )
    value = json.loads(raw)
    streams = value.get("streams", [])
    if len(streams) != 1 or streams[0].get("codec_name") != "mp3":
        raise ValueError(f"not a one-stream MP3: {path}")
    return {
        "codec": "mp3",
        "sampleRate": int(streams[0]["sample_rate"]),
        "channels": int(streams[0]["channels"]),
        "seconds": round(float(value["format"]["duration"]), 6),
        "fullDecodePassed": True,
    }


def source_rows(source_root: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    validation_path = source_root / "audio-validation.json"
    validation = json_load(validation_path)
    if validation.get("schema") != "ggd-float32-audio-conversion@1":
        raise ValueError("unexpected Float32 audio validation schema")
    rows = validation.get("files")
    if not isinstance(rows, list) or len(rows) != 86:
        raise ValueError("expected exactly 86 Ash Float32 WAV records")
    result: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("invalid source audio row")
        relative = safe_relative(str(row["path"]))
        if not relative.as_posix().startswith("decoded-audio/XV_Ash/") or relative.suffix.lower() != ".wav":
            raise ValueError(f"unexpected Ash WAV location: {relative}")
        source = source_root / relative
        if not source.is_file() or source.stat().st_size != int(row["bytes"]) or sha256(source) != row["sha256"]:
            raise ValueError(f"Float32 WAV differs from frozen validation: {relative}")
        result.append({**row, "relativePath": relative.as_posix(), "absolutePath": str(source.resolve())})
    return validation, sorted(result, key=lambda row: row["relativePath"])


def file_rows(repo: Path, workspace: Path, *, write: bool) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    source_root = workspace / SOURCE_RELATIVE
    output_root = workspace / OUTPUT_RELATIVE
    validation, sources = source_rows(source_root)
    rows: list[dict[str, Any]] = []
    for source in sources:
        source_relative = Path(source["relativePath"])
        output_relative = Path("review-mp3") / source_relative.relative_to("decoded-audio").with_suffix(".mp3")
        output = output_root / output_relative
        if write:
            with tempfile.TemporaryDirectory(prefix="ggd-kof-xv-ash-mp3-") as directory:
                first, second = Path(directory) / "first.mp3", Path(directory) / "second.mp3"
                run_encode(Path(source["absolutePath"]), first)
                run_encode(Path(source["absolutePath"]), second)
                if sha256(first) != sha256(second):
                    raise RuntimeError(f"non-deterministic MP3 output: {source_relative}")
                output.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(first, output)
        if not output.is_file():
            raise FileNotFoundError(f"missing generated review MP3: {output}")
        row = {
            "sourceId": SOURCE_ID,
            "nativeAudioId": source["nativeId"],
            "sourceRelativePath": source_relative.as_posix(),
            "sourceAbsolutePath": source["absolutePath"],
            "sourceBytes": source["bytes"],
            "sourceSha256": source["sha256"],
            "sourceFormat": source["format"],
            "sourceSampleFormat": source["sampleFormat"],
            "outputRelativePath": output_relative.as_posix(),
            "outputAbsolutePath": str(output.resolve()),
            "outputBytes": output.stat().st_size,
            "outputSha256": sha256(output),
            **probe_mp3(output),
            "category": "unclassified-audio",
            "reportedLanguage": "pending-confirmation",
            "speaker": "pending-confirmation",
            "event": "pending-confirmation",
            "packageScope": "XV_Ash source directory; no per-clip speaker assertion",
            "runtimeBindingAuthorized": False,
            "runtimeSelectable": False,
        }
        rows.append(row)
    return validation, rows


def render(repo: Path, workspace: Path, *, write: bool) -> tuple[bytes, bytes]:
    validation, rows = file_rows(repo, workspace, write=write)
    raw_rows = b"".join(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8") + b"\n" for row in rows)
    compressed = gzip.compress(raw_rows, mtime=0)
    receipt = {
        "schema": "ggd.kof-xv-ash-audio-review-conversion@1",
        "conversionId": CONVERSION_ID,
        "sourceId": SOURCE_ID,
        "sourceGame": "The King of Fighters XV",
        "platform": "PC (author sound-rip collection; original platform/build not independently verified)",
        "scope": "86 Float32 WAV files under XV_Ash; original Vorbis and Float32 WAV remain untouched",
        "sourceValidation": {
            "absolutePath": str((workspace / SOURCE_RELATIVE / "audio-validation.json").resolve()),
            "sha256": sha256(workspace / SOURCE_RELATIVE / "audio-validation.json"),
            "schema": validation["schema"],
        },
        "tool": {
            "ffmpeg": ffmpeg_version(),
            "arguments": ["-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact", "-c:a", "libmp3lame", "-b:a", "96k", "-write_xing", "0", "-id3v2_version", "0"],
            "twoIndependentEncodesByteIdentical": True,
        },
        "fileManifest": {
            "gitPath": FILES_RELATIVE.as_posix(),
            "sha256": hashlib.sha256(compressed).hexdigest(),
            "uncompressedSha256": hashlib.sha256(raw_rows).hexdigest(),
            "encoding": "gzip-jsonl",
        },
        "summary": {
            "sourceFloat32WavFiles": len(rows),
            "convertedReviewMp3Files": len(rows),
            "convertedBytes": sum(int(row["outputBytes"]) for row in rows),
            "fullDecodePassed": all(row["fullDecodePassed"] for row in rows),
            "perClipLanguageConfirmed": 0,
            "perClipSpeakerConfirmed": 0,
            "perClipEventConfirmed": 0,
            "runtimeBindingsCreated": 0,
            "backendSelectableAssets": 0,
            "productionDeployments": 0,
        },
        "status": "converted-review-candidates-pending-listening-and-event-mapping",
        "limitations": [
            "The source directory name is XV_Ash, but it does not prove an individual clip's speaker.",
            "No clip is assigned to dialogue, cry, sound effect, music, a skill, or a game event.",
            "Review MP3s are local conversion products, not accepted Git runtime voice assets.",
        ],
    }
    return (json.dumps(receipt, ensure_ascii=False, indent=2).encode("utf-8") + b"\n", compressed)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=REPO)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.write == args.check:
        raise SystemExit("choose exactly one of --write or --check")
    repo, workspace = args.repo.resolve(), args.workspace.resolve()
    receipt, files = render(repo, workspace, write=args.write)
    receipt_path, files_path = repo / RECEIPT_RELATIVE, repo / FILES_RELATIVE
    if args.check:
        if not receipt_path.is_file() or receipt_path.read_bytes() != receipt:
            raise SystemExit("KOF XV Ash audio receipt is stale")
        if not files_path.is_file() or files_path.read_bytes() != files:
            raise SystemExit("KOF XV Ash audio file index is stale")
    else:
        receipt_path.parent.mkdir(parents=True, exist_ok=True)
        receipt_path.write_bytes(receipt)
        files_path.write_bytes(files)
    print(json.dumps({"conversionId": CONVERSION_ID, "reviewMp3Files": 86, "runtimeBindings": 0}, ensure_ascii=False))


if __name__ == "__main__":
    main()
