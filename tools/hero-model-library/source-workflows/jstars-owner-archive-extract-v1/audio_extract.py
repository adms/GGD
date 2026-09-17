#!/usr/bin/env python3
"""Split and decode the six priority J-Stars Japanese AFS2/AWB banks.

The owner CPK inventory already materializes exact ACB/AWB files.  This lane
keeps the original ACB/AWB bytes in place, splits every AWB entry to HCA, and
uses the local FFmpeg HCA decoder to create deterministic PCM WAV listening
copies.  Cue names are read from the paired ACB string table; they are not
interpreted as GGD events or speaker claims.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import re
import shutil
import struct
import subprocess
import sys
import wave
from pathlib import Path
from typing import Any


SCHEMA = "ggd.jstars-priority-audio-extraction@1"
PRIORITY = {
    "028": ("gintoki", "坂田銀時", ["community-review-23-20260907"]),
    "041": ("nube", "鵺野鳴介／神眉", ["b2-nube"]),
    "017": ("gon", "小傑", ["godie-ucrl"]),
    "018": ("killua", "奇犽", ["community-review-24-20260907"]),
    "037": ("luckyman", "幸運超人", ["b2-luckyman"]),
    "012": ("hiei", "飛影", ["godie-u010", "godie-uvng"]),
}


def repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def default_split_root() -> Path:
    return repo_root().parent / "GGD-Asset-Library/conversions/jstars-owner-archive-extract-v1/native-token-members"


def default_output_root() -> Path:
    return repo_root().parent / "GGD-Asset-Library/conversions/jstars-priority-audio-v1"


def default_receipt() -> Path:
    return repo_root() / "materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/audio-extract.json"


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_path(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def file_record(path: Path) -> dict[str, Any]:
    return {"absolutePath": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha256_path(path)}


def align(value: int, boundary: int) -> int:
    if boundary <= 0:
        raise ValueError("AFS2 alignment must be positive")
    return (value + boundary - 1) // boundary * boundary


def read_sized_le(data: bytes, cursor: int, width: int) -> tuple[int, int]:
    if width not in {1, 2, 4, 8} or cursor + width > len(data):
        raise ValueError("invalid AFS2 sized integer")
    return int.from_bytes(data[cursor : cursor + width], "little"), cursor + width


def parse_afs2(data: bytes) -> dict[str, Any]:
    if len(data) < 16 or data[:4] != b"AFS2":
        raise ValueError("not an AFS2/AWB bank")
    id_width, offset_width = data[6], data[5]
    count = struct.unpack_from("<I", data, 8)[0]
    boundary = struct.unpack_from("<H", data, 12)[0]
    if count > 1_000_000:
        raise ValueError("unreasonable AFS2 entry count")
    cursor = 16
    ids = []
    for _ in range(count):
        value, cursor = read_sized_le(data, cursor, id_width)
        ids.append(value)
    offsets = []
    for _ in range(count + 1):
        value, cursor = read_sized_le(data, cursor, offset_width)
        offsets.append(value)
    if offsets != sorted(offsets) or offsets[-1] > len(data):
        raise ValueError("invalid AFS2 offset table")
    entries = []
    for index, entry_id in enumerate(ids):
        start, end = align(offsets[index], boundary), offsets[index + 1]
        if start > end or end > len(data):
            raise ValueError(f"invalid AFS2 entry bounds: {index}")
        payload = data[start:end]
        if not (payload.startswith(b"HCA\0") or payload.startswith(b"\xc8\xc3\xc1\x00")):
            raise ValueError(f"AFS2 entry {index} is not HCA")
        entries.append({"index": index, "id": entry_id, "start": start, "end": end, "payload": payload})
    return {
        "version": data[4], "idWidth": id_width, "offsetWidth": offset_width,
        "entryCount": count, "alignment": boundary, "entries": entries,
    }


def extract_cue_names(acb: bytes, prefix: str, native_id: str) -> list[str]:
    pattern = re.compile(rb"(?:" + prefix.encode("ascii") + rb")_" + native_id.encode("ascii") + rb"\d{3}_jp")
    names = []
    seen = set()
    for match in pattern.finditer(acb):
        value = match.group(0).decode("ascii")
        if value not in seen:
            seen.add(value)
            names.append(value)
    return names


def hca_format(data: bytes) -> tuple[int, int]:
    magic = b"fmt\0"
    cursor = data.find(magic, 8, 128)
    if cursor < 0 or cursor + 8 > len(data):
        raise ValueError("HCA fmt chunk not found")
    packed = int.from_bytes(data[cursor + 4 : cursor + 8], "big")
    channels, sample_rate = packed >> 24, packed & 0xFFFFFF
    if not 1 <= channels <= 8 or not 8_000 <= sample_rate <= 192_000:
        raise ValueError("invalid HCA channel/rate fields")
    return channels, sample_rate


def deterministic_wav(pcm: bytes, channels: int, sample_rate: int) -> bytes:
    if len(pcm) % (channels * 2):
        raise ValueError("PCM byte count is not frame aligned")
    output = io.BytesIO()
    with wave.open(output, "wb") as writer:
        writer.setnchannels(channels)
        writer.setsampwidth(2)
        writer.setframerate(sample_rate)
        writer.writeframes(pcm)
    return output.getvalue()


def ffmpeg_version(ffmpeg: Path) -> str:
    completed = subprocess.run([str(ffmpeg), "-version"], text=True, capture_output=True, check=True)
    return completed.stdout.splitlines()[0]


def decode_hca(ffmpeg: Path, path: Path, channels: int, sample_rate: int) -> bytes:
    command = [
        str(ffmpeg), "-v", "error", "-nostdin", "-i", str(path),
        "-map", "0:a:0", "-f", "s16le", "-acodec", "pcm_s16le", "pipe:1",
    ]
    completed = subprocess.run(command, capture_output=True, check=False)
    if completed.returncode != 0:
        raise RuntimeError(f"FFmpeg HCA decode failed for {path}: {completed.stderr.decode(errors='replace')}")
    return deterministic_wav(completed.stdout, channels, sample_rate)


def write_if_changed(path: Path, data: bytes) -> None:
    if path.is_file() and path.read_bytes() == data:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_bytes(data)
    temporary.replace(path)


def deterministic_gzip(rows: list[dict[str, Any]]) -> bytes:
    raw = "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows).encode()
    output = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=output, mtime=0) as archive:
        archive.write(raw)
    return output.getvalue()


def locate_bank(split_root: Path, native_id: str, bank: str, extension: str) -> Path:
    name = f"{bank}_{native_id}_00_ST_JP.{extension}"
    matches = sorted((split_root / native_id).rglob(name), key=lambda value: str(value).casefold())
    if len(matches) != 1:
        raise ValueError(f"expected one {name}, found {len(matches)}")
    return matches[0]


def build(split_root: Path, output_root: Path, ffmpeg: Path, *, verify_only: bool = False) -> dict[str, Any]:
    manifest_rows: list[dict[str, Any]] = []
    characters = []
    for native_id, (slug, name, hero_ids) in PRIORITY.items():
        banks = []
        for bank in ("CV", "PV"):
            acb_path = locate_bank(split_root, native_id, bank, "acb")
            awb_path = locate_bank(split_root, native_id, bank, "awb")
            acb, awb = acb_path.read_bytes(), awb_path.read_bytes()
            parsed = parse_afs2(awb)
            cues = extract_cue_names(acb, bank.casefold(), native_id)
            if len(cues) != parsed["entryCount"]:
                raise ValueError(f"{bank} {native_id}: {len(cues)} cue names != {parsed['entryCount']} AWB entries")
            total_seconds = 0.0
            files = []
            for entry, cue in zip(parsed["entries"], cues, strict=True):
                hca_path = output_root / slug / bank.casefold() / "hca" / f"{cue}.hca"
                wav_path = output_root / slug / bank.casefold() / "wav" / f"{cue}.wav"
                if not verify_only:
                    write_if_changed(hca_path, entry["payload"])
                    channels, sample_rate = hca_format(entry["payload"])
                    if not wav_path.is_file():
                        write_if_changed(wav_path, decode_hca(ffmpeg, hca_path, channels, sample_rate))
                if not hca_path.is_file() or hca_path.read_bytes() != entry["payload"] or not wav_path.is_file():
                    raise ValueError(f"missing or stale decoded audio: {cue}")
                channels, sample_rate = hca_format(entry["payload"])
                wav_bytes = wav_path.stat().st_size
                with wave.open(str(wav_path), "rb") as reader:
                    if reader.getnchannels() != channels or reader.getframerate() != sample_rate or reader.getsampwidth() != 2:
                        raise ValueError(f"WAV format mismatch: {wav_path}")
                    frames = reader.getnframes()
                duration = frames / sample_rate
                total_seconds += duration
                row = {
                    "nativeId": native_id, "slug": slug, "bank": bank, "cueName": cue,
                    "awbEntryIndex": entry["index"], "awbEntryId": entry["id"],
                    "language": "ja", "languageEvidence": f"sound/JP/{bank}_{native_id}_00_ST_JP",
                    "eventStatus": "pending-owner-listening-review", "speakerStatus": "pending-owner-confirmation",
                    "channels": channels, "sampleRate": sample_rate, "durationSeconds": round(duration, 6),
                    "hca": file_record(hca_path), "wav": file_record(wav_path),
                }
                files.append(row)
                manifest_rows.append(row)
            banks.append({
                "bank": bank, "role": "character-audio-candidate-event-and-speaker-pending-review",
                "acb": file_record(acb_path), "awb": file_record(awb_path),
                "cueNameCount": len(cues), "hcaCount": len(files), "decodedWavCount": len(files),
                "durationSeconds": round(total_seconds, 3),
            })
        characters.append({
            "nativeId": native_id, "slug": slug, "nameZhTW": name, "ggdHeroIds": hero_ids,
            "language": "ja", "banks": banks,
            "decodedAudioFiles": sum(row["decodedWavCount"] for row in banks),
            "runtimeBindingStatus": "blocked-owner-event-and-speaker-review-required",
        })
    manifest_rows.sort(key=lambda row: (row["nativeId"], row["bank"], row["awbEntryIndex"]))
    manifest_path = output_root / "audio-files.jsonl.gz"
    manifest_bytes = deterministic_gzip(manifest_rows)
    if not verify_only:
        write_if_changed(manifest_path, manifest_bytes)
    if not manifest_path.is_file() or manifest_path.read_bytes() != manifest_bytes:
        raise ValueError(f"stale audio manifest: {manifest_path}")
    return {
        "schema": SCHEMA, "sourceId": "owner-jstars-victory-vs-plus-20260917",
        "status": "priority-six-japanese-audio-decoded-owner-review-pending",
        "splitRoot": str(split_root.resolve()), "outputRoot": str(output_root.resolve()),
        "decoder": {"path": str(ffmpeg.resolve()), "version": ffmpeg_version(ffmpeg)},
        "fullAudioManifest": {**file_record(manifest_path), "rows": len(manifest_rows)},
        "characters": characters,
        "summary": {
            "priorityCharacters": len(characters), "sourceBanks": len(characters) * 2,
            "hcaFiles": len(manifest_rows), "decodedWavFiles": len(manifest_rows),
            "durationSeconds": round(sum(row["durationSeconds"] for row in manifest_rows), 3),
            "runtimeBindings": 0, "ownerApprovedFiles": 0,
        },
        "blockers": [
            {
                "action": "bind J-Stars audio events", "resource": "CV/PV cue rows",
                "reason": "cue names are numeric; every file still needs owner listening approval and event assignment",
            },
            {
                "action": "confirm speaker and SFX/voice role", "resource": "CV/PV banks",
                "reason": "Japanese path is proven, but bank and native-token identity alone do not prove every clip speaker or gameplay role",
            },
            {
                "action": "decode battle sound container", "resource": "battle_character_sound_<id>_jp_m.pak",
                "reason": "$CMP/$CH0 remains blocked; decoded CV/PV banks do not claim coverage of that separate source",
            },
        ],
        "productionDeploymentVerified": False,
    }


def serialize(value: dict[str, Any]) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--split-root", type=Path, default=default_split_root())
    parser.add_argument("--output-root", type=Path, default=default_output_root())
    parser.add_argument("--receipt", type=Path, default=default_receipt())
    parser.add_argument("--ffmpeg", type=Path, default=Path(shutil.which("ffmpeg") or "ffmpeg"))
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    ffmpeg = args.ffmpeg.resolve()
    if not ffmpeg.is_file():
        raise FileNotFoundError("FFmpeg with the HCA decoder is required")
    value = build(args.split_root.resolve(), args.output_root.resolve(), ffmpeg, verify_only=args.check)
    rendered = serialize(value)
    receipt = args.receipt.resolve()
    if args.check:
        if not receipt.is_file() or receipt.read_bytes() != rendered:
            print(f"stale or missing audio receipt: {receipt}", file=sys.stderr)
            return 1
        print(json.dumps({"ok": str(receipt), **value["summary"]}, ensure_ascii=False))
        return 0
    write_if_changed(receipt, rendered)
    print(json.dumps({"receipt": str(receipt), **value["summary"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
