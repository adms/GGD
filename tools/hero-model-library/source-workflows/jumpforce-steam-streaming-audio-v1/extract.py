#!/usr/bin/env python3
"""Copy and decode the directly mounted JUMP FORCE Streaming AWB set.

The source share is read only. Every AFS2/AWB is copied into a new local intake,
then each CRI HCA subsong is decoded with a caller-supplied pinned vgmstream-cli.
Completed bank directories are installed atomically so an interrupted run can be
restarted without treating partial output as a finished delivery.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import tempfile


SOURCE_ID = "steam-jump-force-streaming-audio-816020-build-8523149"
CHARACTER_RE = re.compile(r"chr(\d{4})_", re.IGNORECASE)


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def write_json(path, value):
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    os.replace(temporary, path)


def awb_stream_count(path):
    header = path.read_bytes()[:16]
    if len(header) != 16 or header[:4] != b"AFS2":
        raise ValueError(f"Not an AFS2/AWB container: {path}")
    count = int.from_bytes(header[8:12], "little")
    if count <= 0:
        raise ValueError(f"Invalid AFS2 stream count: {path}")
    return count


def category_for(name):
    if "EvnVoice" in name:
        return "voice"
    if "BGM" in name:
        return "music"
    return "sfx"


def parse_pcm_wave(path):
    data = path.read_bytes()
    if len(data) < 12 or data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise ValueError(f"Decoder output is not RIFF/WAVE: {path}")
    offset = 12
    fmt = payload_bytes = None
    while offset + 8 <= len(data):
        chunk_id = data[offset:offset + 4]
        size = struct.unpack_from("<I", data, offset + 4)[0]
        start, end = offset + 8, offset + 8 + size
        if end > len(data):
            raise ValueError(f"Truncated WAVE chunk: {path}")
        if chunk_id == b"fmt ":
            fmt = data[start:end]
        elif chunk_id == b"data":
            payload_bytes = size
        offset = end + (size & 1)
    if fmt is None or payload_bytes is None or len(fmt) < 16:
        raise ValueError(f"Missing fmt/data chunk: {path}")
    format_tag, channels, sample_rate, _, block_align, bits = struct.unpack_from("<HHIIHH", fmt)
    if format_tag not in {1, 3, 0xFFFE} or channels <= 0 or sample_rate <= 0 or block_align <= 0:
        raise ValueError(f"Unexpected decoded WAVE format: {path}")
    if payload_bytes % block_align:
        raise ValueError(f"Decoded WAVE data is not frame aligned: {path}")
    frames = payload_bytes // block_align
    return {
        "sampleRate": sample_rate,
        "channels": channels,
        "frames": frames,
        "bitsPerSample": bits,
        "sampleFormat": "pcm" if format_tag in {1, 0xFFFE} else "float",
        "durationSeconds": frames / sample_rate,
        "pcmPayloadBytes": payload_bytes,
    }


def copy_verified(source, target):
    source_hash = sha256(source)
    if target.exists():
        if target.stat().st_size != source.stat().st_size or sha256(target) != source_hash:
            raise ValueError(f"Existing local original differs: {target}")
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=target.parent, prefix=target.name + ".", delete=False) as tmp:
            temp_path = Path(tmp.name)
            with source.open("rb") as stream:
                shutil.copyfileobj(stream, tmp, 1024 * 1024)
        if temp_path.stat().st_size != source.stat().st_size or sha256(temp_path) != source_hash:
            raise ValueError(f"Local copy verification failed: {source}")
        os.replace(temp_path, target)
    return source_hash


def decoded_rows(target, count, original_row, character_map):
    wavs = sorted(target.glob("*.wav"), key=lambda path: int(re.search(r"#(\d+)\.wav$", path.name).group(1)))
    if len(wavs) != count:
        raise ValueError(f"Decoded stream count mismatch for {target}: {len(wavs)} != {count}")
    rows = []
    for expected, wav in enumerate(wavs, 1):
        index = int(re.search(r"#(\d+)\.wav$", wav.name).group(1))
        if index != expected:
            raise ValueError(f"Non-contiguous stream indexes in {target}")
        character_match = CHARACTER_RE.search(original_row["name"])
        native_id = character_match.group(1) if character_match else None
        mapping = character_map.get(native_id, {})
        metadata = parse_pcm_wave(wav)
        rows.append({
            "path": wav.relative_to(target.parents[1]).as_posix(),
            "bytes": wav.stat().st_size,
            "sha256": sha256(wav),
            "sourceBank": original_row["path"],
            "sourceBankSha256": original_row["sha256"],
            "sourceEncoding": "CRI HCA in AFS2/AWB",
            "sourceCategory": category_for(original_row["name"]),
            "sourceLabelCategory": "EvnVoice" if "EvnVoice" in original_row["name"] else ("BGM" if "BGM" in original_row["name"] else "SE"),
            "nativeCharacterId": f"chr{native_id}" if native_id else None,
            "nativeCharacterName": mapping.get("name"),
            "relatedExistingGroupId": mapping.get("existingGroupId"),
            "streamIndex": index,
            "language": "unreviewed",
            "languageReviewed": False,
            "speakerReviewed": False,
            "speakerVerified": False,
            "transcriptReviewed": False,
            "synthesisReady": False,
            **metadata,
        })
    return rows


def decode_bank(vgmstream, source, target, count, log_dir):
    if target.is_dir():
        existing = list(target.glob("*.wav"))
        if len(existing) == count:
            return
        raise ValueError(f"Existing completed bank has wrong file count: {target}")
    target.parent.mkdir(parents=True, exist_ok=True)
    staging_root = target.parents[1] / "staging"
    staging_root.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=target.name + ".", dir=staging_root))
    log_dir.mkdir(parents=True, exist_ok=True)
    command = [str(vgmstream), "-i", "-s", "1", "-S", "0", "-o", str(staging / (target.name + "#?s.wav")), str(source)]
    completed = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    (log_dir / (target.name + ".log")).write_text(completed.stdout)
    if completed.returncode:
        raise RuntimeError(f"vgmstream failed for {source}; see {log_dir / (target.name + '.log')}")
    produced = list(staging.glob("*.wav"))
    if len(produced) != count:
        raise ValueError(f"vgmstream produced {len(produced)} of {count} streams for {source}")
    for path in produced:
        match = re.search(r"#(\d+)\.wav$", path.name)
        if not match:
            raise ValueError(f"Unexpected decoder output name: {path.name}")
        padded = path.with_name(target.name + f"#{int(match.group(1)):04d}.wav")
        path.rename(padded)
        parse_pcm_wave(padded)
    os.replace(staging, target)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--vgmstream", type=Path, required=True)
    parser.add_argument("--character-map", type=Path, default=Path(__file__).with_name("character-map.json"))
    args = parser.parse_args()
    source_dir, output, vgmstream = args.source_dir.resolve(), args.output.resolve(), args.vgmstream.resolve()
    if not source_dir.is_dir() or not vgmstream.is_file():
        raise FileNotFoundError("The source directory and vgmstream-cli must exist")
    output.mkdir(parents=True, exist_ok=True)
    mapping_document = json.loads(args.character_map.read_text())
    if mapping_document.get("schema") != "ggd.jumpforce.native-character-map.v1":
        raise ValueError("Unexpected character map schema")
    character_map = mapping_document["characters"]
    tool_hash = sha256(vgmstream)
    version_probe = subprocess.run(
        [str(vgmstream), "-V"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
    )
    # r2117 prints valid JSON but returns 1 when -V is used without an input.
    # Pin only the version value; the executable hash is the full tool identity.
    version_document = json.loads(version_probe.stdout)
    version = version_document["version"]
    originals, audio = [], []
    sources = sorted(source_dir.glob("*.awb"))
    if len(sources) != 43:
        raise ValueError(f"Expected the observed 43 Streaming AWBs, found {len(sources)}")
    for position, source in enumerate(sources, 1):
        count = awb_stream_count(source)
        local = output / "original" / source.name
        digest = copy_verified(source, local)
        original_row = {
            "name": source.name,
            "path": local.relative_to(output).as_posix(),
            "bytes": local.stat().st_size,
            "sha256": digest,
            "streamCount": count,
            "sourceAbsolutePath": str(source),
        }
        originals.append(original_row)
        target = output / "decoded" / source.stem
        decode_bank(vgmstream, local, target, count, output / "logs")
        audio.extend(decoded_rows(target, count, original_row, character_map))
        print(json.dumps({"bank": position, "totalBanks": len(sources), "name": source.name, "streams": count, "decodedTotal": len(audio)}, ensure_ascii=False), flush=True)
    index = {
        "schema": "ggd.decoded-audio-file-index.v1",
        "sourceId": SOURCE_ID,
        "decoder": {"path": str(vgmstream), "sha256": tool_hash, "version": version},
        "sourceDirectory": str(source_dir),
        "files": audio,
        "summary": {
            "originalAwbFiles": len(originals),
            "originalAwbBytes": sum(row["bytes"] for row in originals),
            "decodedFiles": len(audio),
            "decodedBytes": sum(row["bytes"] for row in audio),
            "knownDurationSeconds": sum(row["durationSeconds"] for row in audio),
            "voiceSourceLabelFiles": sum(row["sourceCategory"] == "voice" for row in audio),
            "soundEffectFiles": sum(row["sourceCategory"] == "sfx" for row in audio),
            "musicFiles": sum(row["sourceCategory"] == "music" for row in audio),
            "speakerVerifiedFiles": 0,
            "languageReviewedFiles": 0,
        },
    }
    write_json(output / "audio-file-index.json", index)
    manifest_rows = originals + [{
        "path": row["path"], "bytes": row["bytes"], "sha256": row["sha256"], "kind": "decoded-wave"
    } for row in audio]
    manifest_rows += [{
        "path": "audio-file-index.json",
        "bytes": (output / "audio-file-index.json").stat().st_size,
        "sha256": sha256(output / "audio-file-index.json"),
        "kind": "metadata",
    }]
    write_json(output / "files-sha256.json", {
        "schema": "ggd.local-source-file-manifest.v1",
        "sourceId": SOURCE_ID,
        "files": sorted(manifest_rows, key=lambda row: row["path"]),
        "fileCount": len(manifest_rows),
        "bytes": sum(row["bytes"] for row in manifest_rows),
    })
    write_json(output / "source-summary.json", {
        "schema": "ggd.jumpforce.streaming-audio-delivery.v1",
        "sourceId": SOURCE_ID,
        "source": "Steam App 816020 / build 8523149 / directly mounted Windows installation",
        "sourceDirectory": str(source_dir),
        "localRoot": str(output),
        "decoder": index["decoder"],
        "summary": index["summary"],
        "audioFileIndex": {"path": "audio-file-index.json", "bytes": (output / "audio-file-index.json").stat().st_size, "sha256": sha256(output / "audio-file-index.json")},
        "fileManifest": {"path": "files-sha256.json", "bytes": (output / "files-sha256.json").stat().st_size, "sha256": sha256(output / "files-sha256.json")},
        "classification": "EvnVoice/ActSE/BGM/SE are native bank labels only; language, speaker, dialogue, gameplay event and skill bindings remain unreviewed.",
        "backendSelectable": False,
        "deployed": False,
    })
    print(json.dumps(index["summary"], ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
