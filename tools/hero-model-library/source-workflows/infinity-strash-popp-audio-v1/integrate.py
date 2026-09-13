#!/usr/bin/env python3
"""Register verified Popp raw packages and priority Strash audio media."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from collections import defaultdict
from pathlib import Path
import shutil


SOURCE_ID = "steam-infinity-strash-popp-priority-audio-build-local-20240328"
PARENT_SOURCE_ID = "steam-infinity-strash-primary-paks-build-local-20240328"
REPO = Path(__file__).resolve().parents[4]
DOWNLOADS = REPO / "materials/hero-model-library/download-sources.json"
GIT_EVIDENCE = REPO / "materials/hero-model-library/source-inventories/infinity-strash-popp-audio-v1"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument(
        "--local-root",
        default="GGD-Asset-Library/intake/windows-readonly-20260913/infinity-strash-popp-and-priority-audio-deps-v1",
    )
    args = parser.parse_args()
    workspace = args.workspace.resolve()
    local_root = (workspace / args.local_root).resolve()
    if not local_root.is_relative_to(workspace) or not local_root.is_dir():
        raise ValueError("verified extraction must be inside the workspace")
    extraction_path = local_root / "extraction-index.json"
    extraction = json.loads(extraction_path.read_text(encoding="utf-8"))
    if extraction.get("schema") != "ggd-infinity-strash-popp-priority-audio@1" or extraction.get("sourceId") != SOURCE_ID:
        raise ValueError("unexpected extraction identity")
    if extraction.get("selection") != {
        "pakEntries": 181304,
        "poppDirectMembers": 2280,
        "priorityEventsWithMedia": 565,
        "uniqueMediaReferences": 938,
        "selectedMediaMembers": 2805,
    }:
        raise ValueError("priority selection changed")
    if len(extraction.get("media", [])) != 938 or len(extraction.get("payloadMissing", [])) != 9:
        raise ValueError("media dependency set is incomplete")
    decoded = [row for row in extraction["media"] if row["payloadState"].startswith("decoded-")]
    if len(decoded) != 929:
        raise ValueError("expected 929 decoded priority media files")
    for row in extraction["files"]:
        path = (local_root / row["path"]).resolve()
        if not path.is_relative_to(local_root) or not path.is_file():
            raise ValueError("missing extraction member: " + row["path"])
        if path.stat().st_size != row["bytes"] or sha256(path) != row["sha256"]:
            raise ValueError("extraction member changed: " + row["path"])

    audio_files = []
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for row in decoded:
        wav = row["decodedWav"]
        wav_path = Path(wav["absolutePath"])
        relative = wav_path.relative_to(local_root).as_posix()
        native_ids = tuple(row["nativeIds"])
        languages = tuple(row["languages"])
        kinds = tuple(row["kinds"])
        category = kinds[0] if len(kinds) == 1 else "unclassified"
        language = languages[0] if len(languages) == 1 else "unreviewed"
        event_paths = sorted({event["eventPath"] for event in row["events"]})
        entry = {
            "path": relative,
            "bytes": wav["bytes"],
            "sha256": wav["sha256"],
            "durationSeconds": wav["durationSeconds"],
            "sampleRate": wav["sampleRate"],
            "channels": wav["channels"],
            "frames": wav["frames"],
            "sourceCategory": category,
            "reportedLocale": language,
            "nativeIds": list(native_ids),
            "eventPaths": event_paths,
            "eventReview": "native-event-reference-verified-speaker-language-and-ggd-skill-binding-pending",
            "sourcePath": row["masterWem"]["absolutePath"],
            "sourceSha256": row["masterWem"]["sha256"],
            "sourceEncoding": "Audiokinetic Wwise custom Vorbis RIFF",
            "speakerVerified": False,
            "languageReviewed": False,
            "transcriptReviewed": False,
        }
        audio_files.append(entry)
        groups[(native_ids, language, category)].append(entry)
    audio_files.sort(key=lambda row: row["path"])
    audio_index = {
        "schema": "ggd-infinity-strash-priority-audio-files@1",
        "sourceId": SOURCE_ID,
        "files": audio_files,
        "summary": {
            "files": len(audio_files),
            "bytes": sum(row["bytes"] for row in audio_files),
            "seconds": sum(row["durationSeconds"] for row in audio_files),
            "payloadMissing": len(extraction["payloadMissing"]),
        },
    }
    audio_index_path = local_root / "audio-file-index.json"
    audio_index_path.write_text(json.dumps(audio_index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    names = {native_id: row["nameZh"] for native_id, row in extraction["identities"].items()}
    hero_ids = {native_id: row["heroIds"] for native_id, row in extraction["identities"].items()}
    audio_groups = []
    for (native_ids, language, category), rows in sorted(groups.items()):
        group_native = "-".join(native_ids).lower()
        group_id = f"{group_native}-{language.lower()}-{category}"
        group_hero_ids = sorted({hero_id for native_id in native_ids for hero_id in hero_ids[native_id]})
        label = "／".join(names[native_id] for native_id in native_ids)
        language_label = {"Japanese": "日文標籤", "English_US": "英文標籤", "nonlocalized": "非語系音效", "unreviewed": "語系待核"}.get(language, language)
        audio_groups.append({
            "id": group_id,
            "name": f"{label}／{language_label}／{category}",
            "characterName": label,
            "nativeCharacterId": "+".join(native_ids),
            "heroIds": group_hero_ids,
            "pathPrefixes": [row["path"] for row in rows],
            "sourceGame": "Infinity Strash: Dragon Quest The Adventure of Dai",
            "sourcePlatform": "Windows (Steam)",
            "sourceId": SOURCE_ID,
            "sourcePage": "https://www.square-enix.com/asia/newsportal/en/topics/infinitystrash-dragonquest-aod/post01.html",
            "author": "Square Enix / Game Studio Inc.",
            "fileCount": len(rows),
            "reportedLanguage": language if language in {"Japanese", "English_US"} else None,
            "audioCategory": "sound-effect" if category == "sound-effect" else "unclassified",
            "speakerReviewed": False,
            "languageReviewed": False,
            "transcriptReviewed": False,
            "synthesisReady": False,
            "note": "Wwise event-to-media reference is verified. Locale directory, event label and native ID are source evidence; speaker, spoken language, transcript and GGD skill semantics still require listening review.",
        })

    compact_manifest = {
        "schema": "ggd-infinity-strash-popp-audio-source-manifest@1",
        "sourceId": SOURCE_ID,
        "parentSourceId": PARENT_SOURCE_ID,
        "localRoot": str(local_root),
        "extractionIndex": {"path": "extraction-index.json", "bytes": extraction_path.stat().st_size, "sha256": sha256(extraction_path)},
        "audioFileIndex": {"path": "audio-file-index.json", "bytes": audio_index_path.stat().st_size, "sha256": sha256(audio_index_path)},
        "selection": extraction["selection"],
        "countsByNativeId": extraction["countsByNativeId"],
        "countsByLanguage": extraction["countsByLanguage"],
        "countsByKind": extraction["countsByKind"],
        "states": extraction["states"],
        "gaps": extraction["gaps"],
    }
    source_manifest_path = local_root / "source-manifest.json"
    source_manifest_path.write_text(json.dumps(compact_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    GIT_EVIDENCE.mkdir(parents=True, exist_ok=True)
    copied = []
    for path in (source_manifest_path, audio_index_path):
        target = GIT_EVIDENCE / path.name
        shutil.copyfile(path, target)
        copied.append({"gitPath": target.relative_to(REPO).as_posix(), "bytes": target.stat().st_size, "sha256": sha256(target)})
    relation_bytes = (local_root / "audio-event-media-map.json").read_bytes()
    relation_gzip = GIT_EVIDENCE / "audio-event-media-map.json.gz"
    relation_gzip.write_bytes(gzip.compress(relation_bytes, mtime=0))
    copied.append({"gitPath": relation_gzip.relative_to(REPO).as_posix(), "bytes": relation_gzip.stat().st_size, "sha256": sha256(relation_gzip)})

    source = {
        "id": SOURCE_ID,
        "target": "Infinity Strash 原作：波普完整原生 ID 套件＋達伊／波普／巴恩／密斯特巴恩 929 個可播放音訊",
        "heroIds": ["godie-nbbc", "godie-n01c", "b2-popp", "godie-ubal"],
        "ownerEntryIds": [],
        "url": "https://www.square-enix.com/asia/newsportal/en/topics/infinitystrash-dragonquest-aod/post01.html",
        "uploader": "User-owned local Steam install exposed through read-only SMB",
        "format": "Unreal Engine 4.26 packages; Wwise custom Vorbis RIFF masters; decoded PCM WAV",
        "accessStatus": "local-installed-game-readonly-share",
        "acquisitionStatus": "downloaded-verified",
        "readiness": "popp-raw-extracted-audio-decoded-pending-model-export-and-listening-review",
        "purchaseDecision": "no-purchase-user-owned-install",
        "defaultEligible": False,
        "resourceRole": "canonical-game-model-animation-vfx-audio-reserve",
        "localPath": local_root.relative_to(workspace).as_posix(),
        "sourceGame": "Infinity Strash: Dragon Quest The Adventure of Dai",
        "platform": "Windows (Steam)",
        "selectionClass": "canonical-game",
        "discoveryChannel": "local-readonly-smb",
        "assetKinds": ["model-package", "texture-material-package", "skeleton-package", "animation-cinematic-package", "vfx-package", "voice", "sound-effect"],
        "publicationStatus": "local-only-awaiting-s3-upload",
        "files": [],
        "notAliases": ["Baran", "巴蘭", "バラン"],
        "identityRecords": [
            {"name": "小呆／達伊", "nameZh": "小呆／達伊", "originalName": "Dai", "nativeCharacterId": "PN010", "aliases": ["小呆", "達伊", "Dai"], "heroIds": ["godie-nbbc", "godie-n01c"]},
            {"name": "何布／波普", "nameZh": "何布／波普", "originalName": "Popp", "nativeCharacterId": "PN020", "aliases": ["何布", "波普", "Popp"], "heroIds": ["b2-popp"]},
            {"name": "巴恩大魔王", "nameZh": "巴恩大魔王", "originalName": "Vearn", "nativeCharacterId": "EN801", "aliases": ["巴恩", "Vearn"], "heroIds": ["godie-ubal"]},
            {"name": "密斯特巴恩", "nameZh": "密斯特巴恩", "originalName": "MystVearn", "nativeCharacterId": "EN653", "aliases": ["密斯特巴恩", "MystVearn"], "heroIds": []},
        ],
        "derivedFromSourceIds": [PARENT_SOURCE_ID, "steam-infinity-strash-priority-original-assets-build-local-20240328"],
        "filesManifest": {"path": "source-manifest.json", "sha256": sha256(source_manifest_path)},
        "audioFileIndex": {"reportPath": "audio-file-index.json", "reportSha256": sha256(audio_index_path)},
        "audioCount": len(audio_files),
        "primaryAudioFormats": [".wav"],
        "audioGroups": audio_groups,
        "reportedLanguage": "Japanese and English_US directory labels; per-clip listening not verified",
        "languageEvidence": "Wwise Localized directory and event package paths",
        "gitEvidence": copied,
        "modelCandidates": [{
            "candidateId": "infinity-strash-native-popp-pn020-raw-v1",
            "sourceId": SOURCE_ID,
            "name": "何布／波普",
            "character": "何布／波普 / Popp",
            "nativeCharacterId": "PN020",
            "heroIds": ["b2-popp"],
            "sourceGame": "Infinity Strash: Dragon Quest The Adventure of Dai",
            "platform": "Windows (Steam)",
            "selectionClass": "canonical-game",
            "assetKinds": ["model-package", "texture-material-package", "skeleton-package", "animation-cinematic-package", "vfx-package", "voice", "sound-effect"],
            "fileCount": extraction["selection"]["poppDirectMembers"],
            "modelState": "native-unreal-packages-extracted-pending-game-specific-export",
            "animationState": "native-unreal-packages-extracted-pending-game-specific-export",
            "vfxState": "native-unreal-packages-extracted-pending-game-specific-export",
            "audioState": "decoded-pending-listening-review",
            "designStatus": "existing-hero-definition-present-pending-model-option",
            "defaultEligible": False,
            "backendSelectable": False,
            "deployed": False,
        }],
        "backendIntegration": {"required": True, "state": "pending-game-specific-model-export-listening-and-binding", "selectionVerified": False, "release": None},
        "verification": (
            "The PAK index yielded 2,280 exact PN020 members. AkLocalizedMediaAsset references from 565 PN010/PN020/EN801/EN653 events resolved to 938 media packages; "
            "929 contained Wwise RIFF payloads and decoded to PCM WAV with exact source and output SHA-256. Nine package shells have no .ubulk payload and remain explicit gaps."
        ),
        "limitations": extraction["gaps"],
    }
    document = json.loads(DOWNLOADS.read_text(encoding="utf-8"))
    matches = [row for collection in ("publicSources", "paidSources") for row in document.get(collection, []) if row.get("id") == SOURCE_ID]
    if matches:
        if len(matches) != 1:
            raise ValueError("source ID is duplicated")
        existing = matches[0]
        mutable = {"publicationStatus", "pendingBackup", "backup", "verification"}
        # The first local integration predated the explicit per-character query
        # scope.  Adding these identity-only fields changes no archived bytes.
        if "identityRecords" not in existing:
            existing.pop("characters", None)
            existing["identityRecords"] = source["identityRecords"]
            existing["notAliases"] = source["notAliases"]
        if {key: value for key, value in existing.items() if key not in mutable} != {key: value for key, value in source.items() if key not in mutable}:
            raise ValueError("existing source differs; refusing to overwrite another workflow")
        DOWNLOADS.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        status = "already-integrated"
    else:
        document["publicSources"].append(source)
        DOWNLOADS.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        status = "integrated"
    print(json.dumps({"sourceId": SOURCE_ID, "status": status, "audioFiles": len(audio_files), "audioGroups": len(audio_groups)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
