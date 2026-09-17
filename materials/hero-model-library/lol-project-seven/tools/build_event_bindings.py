#!/usr/bin/env python3
"""Build deterministic LoL BIN -> HIRC -> WEM/WAV event evidence."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def category_for_event(event_name: str, ability_tokens: dict[str, list[str]]) -> tuple[str, str | None]:
    for slot, tokens in ability_tokens.items():
        if any(token.casefold() in event_name.casefold() for token in tokens):
            return "ability-cast", slot
    lowered = event_name.casefold()
    rules = [
        ("death", ("_death",)),
        ("attack", ("attack", "critattack")),
        ("move", ("_move",)),
        ("emote", ("_joke", "_laugh", "_taunt", "_dance")),
        ("recall", ("_recall",)),
        ("item", ("_buyitem", "_useitem")),
        ("encounter", ("_firstencounter", "_kill", "_ally", "_respawn")),
    ]
    for category, tokens in rules:
        if any(token in lowered for token in tokens):
            return category, None
    return "other-event", None


def media_id_from_source(value: str) -> int:
    match = re.search(r"-(\d+)\.wem$", value)
    if not match:
        raise ValueError("Decoded source does not end with a numeric WEM ID: " + value)
    return int(match.group(1))


def build_report(source_root: Path, control_path: Path, metadata_receipt_path: Path,
                 native_id: str, skin_id: str, tool_commit: str) -> dict:
    from league_tools import BIN, NativeHIRC, AudioEventMapper
    from league_tools.utils.hash import str_fnv_32

    source_root = source_root.resolve()
    control = json.loads(control_path.read_text())
    if control.get("schema") != "ggd.lol-shared-event-metadata-scope@1":
        raise ValueError("Unexpected event metadata control schema")
    character_rows = [row for row in control["characters"] if row["nativeId"] == native_id]
    if len(character_rows) != 1 or native_id not in control["allowedFetchNames"]:
        raise ValueError("Native ID is outside project-seven scope")
    character = character_rows[0]
    internal_bin = f"data/characters/{native_id.casefold()}/skins/{skin_id}.bin"
    if internal_bin not in character["skinPaths"]:
        raise ValueError("Requested skin BIN is absent from the control")
    metadata_receipt = json.loads(metadata_receipt_path.read_text())
    if (metadata_receipt.get("schema") != "ggd-lol-shared-event-metadata-batch@1"
            or metadata_receipt.get("releaseId") != control["releaseId"]
            or metadata_receipt.get("manifestSha256") != control["manifestSha256"]):
        raise ValueError("Sparse metadata receipt differs from pinned control")
    metadata_rows = [row for row in metadata_receipt["results"] if row["nativeId"] == native_id]
    if len(metadata_rows) != 1:
        raise ValueError("Sparse metadata receipt has no unique native character")
    entry_rows = [row for row in metadata_rows[0]["entries"] if row["internalPath"] == internal_bin]
    if len(entry_rows) != 1 or entry_rows[0].get("wadStoredChecksumVerified") is not True:
        raise ValueError("Sparse skin BIN lacks verified WAD entry evidence")
    bin_path = Path(entry_rows[0]["absolutePath"])
    if not bin_path.is_relative_to(source_root) or sha256(bin_path) != entry_rows[0]["sha256"]:
        raise ValueError("Sparse skin BIN changed")

    package_root = source_root / "audio" / "packages" / f"{native_id}.ja_JP"
    extraction_path = package_root / "extraction.json"
    decoding_path = source_root / "audio" / "decoded" / f"{native_id}.ja_JP" / "audio-index.json"
    extraction = json.loads(extraction_path.read_text())
    decoding = json.loads(decoding_path.read_text())
    source_skin = "base" if skin_id == "skin0" else skin_id
    event_suffix = f"/{source_skin}/{native_id.casefold()}_{source_skin}_vo_events.bnk"
    event_banks = [row for row in extraction["nativeAudioBanks"]
                   if (row.get("sourcePath") or "").casefold().endswith(event_suffix)]
    if len(event_banks) != 1:
        raise ValueError("Could not select one exact events BNK")
    event_bank = event_banks[0]
    event_bnk_path = package_root / event_bank["path"]
    if sha256(event_bnk_path) != event_bank["sha256"]:
        raise ValueError("Events BNK changed")
    audio_stem = event_bank["sourcePath"][:-len("_events.bnk")] + "_audio"
    audio_banks = [row for row in extraction["nativeAudioBanks"]
                   if row.get("sourcePath") in {audio_stem + ".wpk", audio_stem + ".bnk"}]
    if not audio_banks:
        raise ValueError("No exact audio WPK/BNK accompanies events BNK")
    for row in audio_banks:
        if sha256(package_root / row["path"]) != row["sha256"]:
            raise ValueError("Audio WPK/BNK changed: " + row["path"])
    source_bank_ids = {Path(row["path"]).stem for row in audio_banks}
    decoded_rows = [row for row in decoding["files"]
                    if Path(row["source"]).parts[0] in source_bank_ids and row.get("decoded") is True]
    decoded_by_media = {media_id_from_source(row["source"]): row for row in decoded_rows}
    if len(decoded_by_media) != len(decoded_rows):
        raise ValueError("Audio bank has duplicate decoded WEM IDs")

    parsed_bin = BIN(bin_path)
    hirc = NativeHIRC.from_bnk(event_bnk_path, use_cache=False)
    mapping = AudioEventMapper(parsed_bin, hirc).build_mapping()
    mapped_ids = mapping.get_all_sound_ids()
    missing_media = sorted(mapped_ids - set(decoded_by_media))
    if missing_media:
        raise ValueError("Mapped WEM IDs are absent from the exact audio bank: " + repr(missing_media[:20]))
    ability_tokens = character.get("eventAbilityTokens", {})
    event_rows = []
    file_events: dict[int, list[dict]] = defaultdict(list)
    for event_name, media_ids in sorted(mapping.forward_mapping.items()):
        category, slot = category_for_event(event_name, ability_tokens)
        event = {
            "eventName": event_name,
            "eventId": str_fnv_32(event_name),
            "category": category,
            "abilitySlotCandidate": slot,
            "wemIds": media_ids,
        }
        event_rows.append(event)
        for media_id in media_ids:
            file_events[media_id].append({key: event[key] for key in
                ["eventName", "eventId", "category", "abilitySlotCandidate"]})
    file_rows = []
    decoded_root = decoding_path.parent
    for media_id in sorted(mapped_ids):
        row = decoded_by_media[media_id]
        wav = decoded_root / row["output"]
        if (not wav.is_file() or wav.stat().st_size != row["bytes"]
                or sha256(wav) != row["sha256"]):
            raise ValueError("Decoded WAV differs from audio index: " + str(wav))
        categories = sorted({event["category"] for event in file_events[media_id]})
        slots = sorted({event["abilitySlotCandidate"] for event in file_events[media_id]
                        if event["abilitySlotCandidate"]})
        file_rows.append({
            "wemId": media_id,
            "sourceWem": row["source"],
            "sourceWemSha256": row["sourceSha256"],
            "path": wav.relative_to(source_root.parents[3]).as_posix(),
            "absolutePath": str(wav.resolve()),
            "bytes": row["bytes"],
            "sha256": row["sha256"],
            "seconds": row["pcm"]["seconds"],
            "categories": categories,
            "abilitySlotCandidates": slots,
            "eventBindings": sorted(file_events[media_id], key=lambda item: item["eventName"]),
            "eventBindingsVerified": True,
            "speakerVerified": False,
            "perClipLanguageVerified": False,
            "skillSemanticBindingStatus": "native-event-name-only-pending-ggd-audit",
        })
    return {
        "schema": "ggd-lol-native-event-bindings@1",
        "sourceId": "lol-project-seven-ja-jp-16.18.8159717",
        "sourceGame": "League of Legends",
        "heroId": character["heroId"],
        "nativeId": native_id,
        "skinId": skin_id,
        "reportedLocale": "ja_JP",
        "releaseId": control["releaseId"],
        "manifestSha256": control["manifestSha256"],
        "sourcePackage": metadata_rows[0]["sourcePackage"],
        "sourcePackageCompleteLocally": False,
        "metadataAcquisitionStatus": metadata_rows[0]["acquisitionStatus"],
        "inputs": {
            "bin": {"path": str(bin_path), "sha256": sha256(bin_path)},
            "eventsBnk": {"path": str(event_bnk_path), "sha256": sha256(event_bnk_path),
                         "sourcePath": event_bank["sourcePath"]},
            "audioBanks": [{"path": str((package_root / row["path"]).resolve()),
                             "sha256": row["sha256"], "sourcePath": row["sourcePath"]}
                            for row in audio_banks],
            "extraction": {"path": str(extraction_path), "sha256": sha256(extraction_path)},
            "decoding": {"path": str(decoding_path), "sha256": sha256(decoding_path)},
            "metadataReceipt": {"path": str(metadata_receipt_path.resolve()),
                                "sha256": sha256(metadata_receipt_path)},
        },
        "tool": {"name": "league-tools", "commit": tool_commit,
                 "mapping": "BIN event strings -> NativeHIRC event graph -> WEM ID"},
        "validation": {
            "binEvents": sum(len(unit.events) for group in parsed_bin.data for unit in group.bank_units),
            "hircEvents": sum(len(bank.events) for bank in hirc.banks.values()),
            "mappedEvents": len(event_rows),
            "mappedWemIds": len(mapped_ids),
            "exactAudioBankDecodedFiles": len(decoded_rows),
            "allMappedWemIdsFoundInExactAudioBank": True,
            "allReferencedWavBytesAndSha256Verified": True,
            "eventBindingsVerified": True,
            "speakerVerified": False,
            "perClipLanguageVerified": False,
            "ggdSkillSemanticBindingsVerified": False,
            "categoryCountsByEvent": dict(sorted(Counter(row["category"] for row in event_rows).items())),
            "abilitySlotCountsByEvent": dict(sorted(Counter(row["abilitySlotCandidate"] for row in event_rows
                                                              if row["abilitySlotCandidate"]).items())),
        },
        "events": event_rows,
        "files": file_rows,
        "gaps": [
            "Per-clip listening, speaker, language and transcript review are pending.",
            "Ability slots are candidates derived from native event-name tokens; GGD runtime binding is pending.",
            "The complete non-localized champion WAD has not been reconstructed or archived.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", required=True, type=Path)
    parser.add_argument("--control", required=True, type=Path)
    parser.add_argument("--metadata-receipt", required=True, type=Path)
    parser.add_argument("--native-id", required=True)
    parser.add_argument("--skin-id", default="skin0")
    parser.add_argument("--league-tools-commit", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    report = build_report(args.source_root, args.control, args.metadata_receipt,
                          args.native_id, args.skin_id, args.league_tools_commit)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    args.output.write_text(encoded)
    print(json.dumps({
        "output": str(args.output.resolve()),
        "sha256": sha256(args.output),
        "mappedEvents": report["validation"]["mappedEvents"],
        "mappedWemIds": report["validation"]["mappedWemIds"],
        "eventBindingsVerified": report["validation"]["eventBindingsVerified"],
        "speakerVerified": report["validation"]["speakerVerified"],
        "perClipLanguageVerified": report["validation"]["perClipLanguageVerified"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
