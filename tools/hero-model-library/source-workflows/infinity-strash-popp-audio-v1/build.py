#!/usr/bin/env python3
"""Extract Popp packages and priority Wwise media, then decode reproducible WAV files."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
import subprocess
import wave
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path


SCHEMA = "ggd-infinity-strash-popp-priority-audio@1"
SOURCE_ID = "steam-infinity-strash-popp-priority-audio-build-local-20240328"
NATIVE_IDS = ("PN010", "PN020", "EN801", "EN653")
IDENTITIES = {
    "PN010": {"nameZh": "小呆／達伊", "originalName": "Dai", "heroIds": ["godie-nbbc", "godie-n01c"]},
    "PN020": {"nameZh": "何布／波普", "originalName": "Popp", "heroIds": ["b2-popp"]},
    "EN801": {"nameZh": "巴恩大魔王", "originalName": "Vearn", "heroIds": ["godie-ubal"]},
    "EN653": {"nameZh": "密斯特巴恩", "originalName": "MystVearn", "heroIds": []},
}
MEDIA_REF = re.compile(rb"/Game/WwiseAudio/(?:Localized/[^\x00\r\n]+?/)?Media/[0-9]+")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def event_kind(path: str) -> str:
    lower = path.lower()
    if "/voice_work_unit/" in lower or "/vo_" in lower:
        return "voice"
    if "/bgm_work_unit/" in lower or "/bgm_" in lower:
        return "music"
    return "sound-effect"


def language_for(path: str) -> str:
    if "/Localized/Japanese/" in path:
        return "Japanese"
    if "/Localized/English_US_/" in path:
        return "English_US"
    return "nonlocalized"


def exact_riff_at_end(payload: bytes) -> bytes:
    candidates = []
    for offset in range(max(0, len(payload) - 8)):
        if not payload.startswith(b"RIFF", offset):
            continue
        length = struct.unpack_from("<I", payload, offset + 4)[0] + 8
        if offset + length == len(payload):
            candidates.append(payload[offset:])
    if len(candidates) != 1:
        raise ValueError(f"expected one RIFF segment ending at payload boundary, got {len(candidates)}")
    return candidates[0]


def run_extractor(extractor: Path, pak: Path, manifest: Path, output: Path) -> None:
    subprocess.run([str(extractor), str(pak), str(manifest), str(output)], check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pak", type=Path, required=True)
    parser.add_argument("--repak", type=Path, required=True)
    parser.add_argument("--extractor", type=Path, required=True)
    parser.add_argument("--prior-raw-root", type=Path, required=True)
    parser.add_argument("--vgmstream", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    pak, repak, extractor, prior_raw, vgmstream, output = (
        value.resolve() for value in (args.pak, args.repak, args.extractor, args.prior_raw_root, args.vgmstream, args.output)
    )
    if (output / "extraction-index.json").exists():
        raise ValueError("completed output is immutable; use a new source revision")
    for path in (pak, repak, extractor, vgmstream):
        if not path.is_file():
            raise ValueError(f"missing required file: {path}")
    if not prior_raw.is_dir():
        raise ValueError(f"missing prior priority extraction: {prior_raw}")
    output.mkdir(parents=True, exist_ok=True)

    listing = subprocess.run([str(repak), "list", str(pak)], check=True, capture_output=True, text=True).stdout.splitlines()
    available = set(listing)
    popp_paths = sorted({path for path in listing if re.search(r"(?<![A-Za-z0-9])PN020(?![A-Za-z0-9])", path, re.I)})
    popp_manifest = output / "selected-pn020-paths.txt"
    popp_manifest.write_text("\n".join(popp_paths) + "\n", encoding="utf-8")
    raw_root = output / "raw"
    run_extractor(extractor, pak, popp_manifest, raw_root)

    event_rows = []
    media_to_events: dict[str, list[dict]] = defaultdict(list)
    for root in (prior_raw, raw_root):
        for event_path in sorted(root.rglob("*.uasset")):
            relative = event_path.relative_to(root).as_posix()
            native_ids = [native_id for native_id in NATIVE_IDS if native_id in relative]
            if not native_ids or "/WwiseAudio/" not in relative or "/Events/" not in relative:
                continue
            media = sorted({match.decode("ascii") for match in MEDIA_REF.findall(event_path.read_bytes())})
            if not media:
                continue
            row = {
                "eventPath": relative,
                "nativeIds": native_ids,
                "language": language_for(relative),
                "kind": event_kind(relative),
                "media": media,
            }
            event_rows.append(row)
            for media_ref in media:
                media_to_events[media_ref].append({key: row[key] for key in ("eventPath", "nativeIds", "language", "kind")})

    media_paths = []
    for media_ref in sorted(media_to_events):
        stem = "strash/Content/" + media_ref.removeprefix("/Game/")
        members = [stem + suffix for suffix in (".uasset", ".uexp", ".ubulk") if stem + suffix in available]
        if not members:
            raise ValueError("media reference is absent from PAK index: " + media_ref)
        media_paths.extend(members)
    media_paths = sorted(set(media_paths))
    media_manifest = output / "selected-media-paths.txt"
    media_manifest.write_text("\n".join(media_paths) + "\n", encoding="utf-8")
    run_extractor(extractor, pak, media_manifest, raw_root)

    master_root = output / "media-master"
    wav_root = output / "decoded-wav"
    media_rows = []
    payload_missing = []
    for media_ref, events in sorted(media_to_events.items()):
        relative_stem = Path(media_ref.removeprefix("/Game/WwiseAudio/"))
        package_stem = raw_root / "strash/Content/WwiseAudio" / relative_stem
        bulk = package_stem.with_suffix(".ubulk")
        relation = {
            "mediaRef": media_ref,
            "events": events,
            "nativeIds": sorted({native_id for event in events for native_id in event["nativeIds"]}),
            "languages": sorted({event["language"] for event in events}),
            "kinds": sorted({event["kind"] for event in events}),
        }
        if not bulk.is_file():
            relation["payloadState"] = "referenced-package-has-no-ubulk-payload"
            payload_missing.append(relation)
            media_rows.append(relation)
            continue
        wem = master_root / relative_stem.with_suffix(".wem")
        wav = wav_root / relative_stem.with_suffix(".wav")
        wem.parent.mkdir(parents=True, exist_ok=True)
        wav.parent.mkdir(parents=True, exist_ok=True)
        wem.write_bytes(exact_riff_at_end(bulk.read_bytes()))
        completed = subprocess.run(
            [str(vgmstream), "-o", str(wav), str(wem)], capture_output=True, text=True
        )
        if completed.returncode != 0:
            raise RuntimeError(f"vgmstream failed for {wem}: {completed.stderr}")
        with wave.open(str(wav), "rb") as decoded:
            audio = {
                "channels": decoded.getnchannels(),
                "sampleRate": decoded.getframerate(),
                "sampleWidthBytes": decoded.getsampwidth(),
                "frames": decoded.getnframes(),
                "durationSeconds": decoded.getnframes() / decoded.getframerate(),
            }
        relation.update({
            "payloadState": "decoded-automated-validation-passed-pending-listening-review",
            "sourceUbulk": {"absolutePath": str(bulk), "bytes": bulk.stat().st_size, "sha256": sha256(bulk)},
            "masterWem": {"absolutePath": str(wem), "bytes": wem.stat().st_size, "sha256": sha256(wem)},
            "decodedWav": {"absolutePath": str(wav), "bytes": wav.stat().st_size, "sha256": sha256(wav), **audio},
        })
        media_rows.append(relation)

    counts_by_native = {}
    for native_id in NATIVE_IDS:
        related = [row for row in media_rows if native_id in row["nativeIds"]]
        counts_by_native[native_id] = {
            "events": sum(native_id in row["nativeIds"] for row in event_rows),
            "referencedMedia": len(related),
            "decodedMedia": sum(row["payloadState"].startswith("decoded-") for row in related),
            "payloadMissing": sum(row["payloadState"].endswith("no-ubulk-payload") for row in related),
            "byKind": dict(sorted(Counter(kind for row in related for kind in row["kinds"]).items())),
        }

    files = []
    for path in sorted(output.rglob("*")):
        if path.is_file() and path.name != "extraction-index.json":
            files.append({
                "path": path.relative_to(output).as_posix(),
                "absolutePath": str(path),
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
            })
    index = {
        "schema": SCHEMA,
        "sourceId": SOURCE_ID,
        "sourceWork": "Infinity Strash: Dragon Quest The Adventure of Dai",
        "platform": "Windows Steam",
        "identities": IDENTITIES,
        "sourcePak": {"absolutePath": str(pak), "bytes": pak.stat().st_size, "sha256": sha256(pak)},
        "tools": {
            "repak": {"absolutePath": str(repak), "sha256": sha256(repak)},
            "extractor": {"absolutePath": str(extractor), "sha256": sha256(extractor)},
            "vgmstream": {"absolutePath": str(vgmstream), "sha256": sha256(vgmstream)},
        },
        "selection": {
            "pakEntries": len(listing),
            "poppDirectMembers": len(popp_paths),
            "priorityEventsWithMedia": len(event_rows),
            "uniqueMediaReferences": len(media_to_events),
            "selectedMediaMembers": len(media_paths),
        },
        "countsByNativeId": counts_by_native,
        "countsByLanguage": dict(sorted(Counter(language for row in media_rows for language in row["languages"]).items())),
        "countsByKind": dict(sorted(Counter(kind for row in media_rows for kind in row["kinds"]).items())),
        "events": event_rows,
        "media": media_rows,
        "payloadMissing": payload_missing,
        "files": files,
        "totalBytes": sum(row["bytes"] for row in files),
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "states": {
            "acquired": True,
            "poppRawPackagesExtracted": True,
            "audioMediaDependenciesResolved": True,
            "audioMasterWemExtracted": True,
            "audioDecoded": True,
            "automatedAudioValidationPassed": True,
            "listeningReviewComplete": False,
            "modelConverted": False,
            "visuallyAccepted": False,
            "heroRegistered": False,
            "backendSelectable": False,
            "deployed": False,
        },
        "gaps": [
            "Nine referenced media packages contain no .ubulk payload and are retained as explicit missing-payload relations.",
            "Decoded clips passed container and PCM checks but still require speaker, language and event listening review.",
            "Popp and Vearn Unreal models, textures, skeletons, animations and effects still require the game-specific exporter and visual acceptance.",
            "EN801 is Vearn; its pre/post-transformation model variants are not yet visually classified.",
            "EN653 is MystVearn, a separate character. EN680/EN681 are Baran and are not merged into either identity.",
        ],
    }
    (output / "audio-event-media-map.json").write_text(json.dumps({"events": event_rows, "media": media_rows}, ensure_ascii=False, indent=2) + "\n")
    # Rehash the final relation map after it replaces the exploratory version.
    index["files"] = []
    for path in sorted(output.rglob("*")):
        if path.is_file() and path.name != "extraction-index.json":
            index["files"].append({"path": path.relative_to(output).as_posix(), "absolutePath": str(path), "bytes": path.stat().st_size, "sha256": sha256(path)})
    index["totalBytes"] = sum(row["bytes"] for row in index["files"])
    (output / "extraction-index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({
        "output": str(output), "poppMembers": len(popp_paths), "events": len(event_rows),
        "media": len(media_rows), "decoded": len(media_rows) - len(payload_missing), "payloadMissing": len(payload_missing),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
