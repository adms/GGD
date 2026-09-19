#!/usr/bin/env python3
"""Extract directly readable CRI AFS2/HCA clips from selected Hero's Bonds AWB files."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import struct
import subprocess
from pathlib import Path


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def parse_afs2(data: bytes) -> list[bytes]:
    if len(data) < 24 or data[:4] != b"AFS2":
        raise ValueError("not an AFS2 container")
    offset_bytes, id_bytes = data[5], data[6]
    (count,) = struct.unpack_from("<I", data, 8)
    (alignment,) = struct.unpack_from("<H", data, 12)
    if offset_bytes not in (2, 4, 8) or id_bytes not in (2, 4, 8) or not alignment:
        raise ValueError("unsupported AFS2 layout")
    offset_table = 16 + count * id_bytes
    offsets = [int.from_bytes(
        data[offset_table + index * offset_bytes:offset_table + (index + 1) * offset_bytes], "little"
    ) for index in range(count + 1)]
    clips = []
    for index in range(count):
        start = (offsets[index] + alignment - 1) // alignment * alignment
        end = offsets[index + 1]
        if start >= end or end > len(data):
            raise ValueError(f"invalid AFS2 stream range {start}:{end}")
        clips.append(data[start:end])
    return clips


def probe_duration(ffprobe: str, path: Path) -> float | None:
    result = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False,
    )
    if result.returncode:
        return None
    value = json.loads(result.stdout).get("format", {}).get("duration")
    return round(float(value), 6) if value is not None else None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    ffmpeg, ffprobe = shutil.which("ffmpeg"), shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        raise SystemExit("ffmpeg and ffprobe are required")

    document = json.loads(args.manifest.read_text())
    cue_names: dict[str, list[str]] = {}
    for row in document["files"]:
        if not row["logicalPath"].endswith(".acb"):
            continue
        source = Path(row["extractedAbsolutePath"])
        names = sorted({match.decode("ascii") for match in re.findall(
            rb"(?:se_in|vo_ch)[A-Za-z0-9_]+", source.read_bytes()
        )})
        cue_names[Path(row["logicalPath"]).stem] = names
    outputs = []
    for row in document["files"]:
        if not row["logicalPath"].endswith(".awb"):
            continue
        source = Path(row["extractedAbsolutePath"])
        clips = parse_afs2(source.read_bytes())
        character = Path(row["logicalPath"]).stem
        target = args.output / character
        target.mkdir(parents=True, exist_ok=True)
        for index, clip in enumerate(clips):
            hca = target / f"{index:03d}.hca"
            wav = target / f"{index:03d}.wav"
            hca.write_bytes(clip)
            conversion = subprocess.run(
                [ffmpeg, "-y", "-v", "error", "-i", str(hca), "-c:a", "pcm_s16le", str(wav)],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False,
            )
            outputs.append({
                "characterContainerId": character,
                "streamIndex": index,
                "sourceAwbLogicalPath": row["logicalPath"],
                "sourceAwbSha256": row["sha256"],
                "hca": {"absolutePath": str(hca.resolve()), "bytes": hca.stat().st_size,
                        "sha256": sha256_file(hca)},
                "wav": ({"absolutePath": str(wav.resolve()), "bytes": wav.stat().st_size,
                         "sha256": sha256_file(wav), "durationSeconds": probe_duration(ffprobe, wav)}
                        if conversion.returncode == 0 else None),
                "decodeStatus": "decoded-unbound-numbered-stream" if conversion.returncode == 0 else "ffmpeg-decode-failed",
                "speakerStatus": "unverified",
                "eventBindingStatus": "unverified",
            })
    receipt = {
        "schema": "ggd.heros-bonds-cri-audio-extraction@1",
        "sourceManifest": str(args.manifest.resolve()),
        "clipCount": len(outputs),
        "decodedWavCount": sum(row["wav"] is not None for row in outputs),
        "totalDurationSeconds": round(sum((row["wav"] or {}).get("durationSeconds") or 0 for row in outputs), 6),
        "cueNamesByCharacterContainer": cue_names,
        "cueEvidence": {
            "ch027003700": "cue names include Iora attacks; path evidence links this ID to shinBurn",
            "ch027003800": "cue names include Stomp and combat voice cues; this supports a large boss hypothesis but does not prove Ghost-Eye King identity",
        },
        "warning": "Streams are decoded but speaker and combat-event bindings remain unverified until listening review.",
        "files": outputs,
    }
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    args.receipt.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({key: receipt[key] for key in ("clipCount", "decodedWavCount", "totalDurationSeconds")}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
