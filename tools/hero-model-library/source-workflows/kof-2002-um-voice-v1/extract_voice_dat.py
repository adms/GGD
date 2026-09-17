#!/usr/bin/env python3
"""Losslessly split KOF 2002 UM voice.dat into its embedded RIFF/WAVE records."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import wave
from pathlib import Path


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def records(path: Path):
    total = path.stat().st_size
    offset = 0
    with path.open("rb", buffering=0) as handle:
        while offset < total:
            handle.seek(offset)
            header = handle.read(16)
            if len(header) != 16:
                raise ValueError(f"short record header at {offset}")
            stored_bytes = struct.unpack_from("<I", header, 0)[0]
            if header[4:8] != b"RIFF" or header[12:16] != b"WAVE":
                raise ValueError(f"unexpected RIFF/WAVE magic at {offset}")
            riff_bytes = struct.unpack_from("<I", header, 8)[0] + 8
            aligned_bytes = (riff_bytes + 3) & ~3
            if stored_bytes != aligned_bytes:
                raise ValueError(
                    f"record {offset} stores {stored_bytes} bytes but RIFF requires {riff_bytes} "
                    f"({aligned_bytes} with padding)"
                )
            handle.seek(offset + 4)
            payload = handle.read(riff_bytes)
            if len(payload) != riff_bytes:
                raise ValueError(f"short RIFF payload at {offset}")
            yield offset, stored_bytes, payload
            offset += 4 + stored_bytes
    if offset != total:
        raise ValueError(f"parsed {offset} of {total} bytes")


def wav_metadata(path: Path) -> dict[str, int | float]:
    with wave.open(str(path), "rb") as wav:
        frames = wav.getnframes()
        rate = wav.getframerate()
        return {
            "channels": wav.getnchannels(),
            "sampleWidthBytes": wav.getsampwidth(),
            "sampleRate": rate,
            "frameCount": frames,
            "durationSeconds": round(frames / rate, 6) if rate else 0,
        }


def extract(source: Path, output: Path) -> dict:
    source = source.resolve()
    output.mkdir(parents=True, exist_ok=True)
    rows = []
    for index, (offset, stored_bytes, payload) in enumerate(records(source)):
        name = f"voice-{index:04d}.wav"
        target = output / name
        digest = sha256_bytes(payload)
        if target.exists():
            if target.stat().st_size != len(payload) or sha256_file(target) != digest:
                raise FileExistsError(f"preserve differing output: {target}")
        else:
            target.write_bytes(payload)
        rows.append({
            "index": index,
            "recordOffset": offset,
            "riffOffset": offset + 4,
            "riffBytes": len(payload),
            "bytes": len(payload),
            "storedBytes": stored_bytes,
            "paddingBytes": stored_bytes - len(payload),
            "path": name,
            "sha256": digest,
            **wav_metadata(target),
            "classification": "voice-container-record-unreviewed",
            "language": "pending-confirmation",
            "speaker": "pending-confirmation",
            "event": "pending-confirmation",
        })
    manifest = {
        "schema": "ggd-kof2002um-voice-dat-extraction@1",
        "sourceId": "steam-kof-2002-um-222440-build-8463197-voice-dat",
        "sourcePath": str(source),
        "sourceBytes": source.stat().st_size,
        "sourceSha256": sha256_file(source),
        "method": "lossless embedded RIFF/WAVE record split",
        "fileCount": len(rows),
        "totalExtractedBytes": sum(row["riffBytes"] for row in rows),
        "identityStatus": "language-speaker-event-pending-confirmation",
        "files": rows,
    }
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    manifest = extract(args.source, args.output.resolve())
    print(json.dumps({key: manifest[key] for key in (
        "sourceId", "sourceBytes", "sourceSha256", "fileCount", "totalExtractedBytes", "identityStatus"
    )}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
