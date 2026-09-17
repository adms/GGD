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
APPROVED_AUDIO_RECEIPT = REPO / "materials/hero-model-library/priority-evidence/infinity-strash-popp-approved-audio-v1/receipt.json"
VFX_RUNTIME_RECEIPT = REPO / "materials/hero-model-library/priority-evidence/infinity-strash-popp-vfx-runtime-v1/receipt.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def evidence(path: Path) -> dict:
    return {
        "gitPath": path.relative_to(REPO).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def approved_audio_evidence(receipt_path: Path = APPROVED_AUDIO_RECEIPT) -> dict | None:
    """Return the checked approval boundary, without granting a GGD target."""
    if not receipt_path.is_file():
        return None
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    summary = receipt.get("summary", {})
    expected = {
        "reviewCandidates": 36,
        "ownerApproved": 36,
        "gameAudioFiles": 35,
        "gameAudioCandidateRelationships": 36,
        "nativeEventRows": 8,
        "runtimeBindings": 0,
        "runtimeConsumers": 0,
        "candidateBlockers": 36,
        "productionDeployed": 0,
    }
    if (
        receipt.get("schema") != "ggd.infinity-strash-popp-approved-audio-receipt@1"
        or receipt.get("sourceId") != SOURCE_ID
        or any(summary.get(key) != value for key, value in expected.items())
        or receipt.get("allSourceBytesVerified") is not True
        or receipt.get("allOutputsProbed") is not True
        or receipt.get("runtimeMutationPerformed") is not False
        or receipt.get("productionDeploymentVerified") is not False
    ):
        raise ValueError("Popp approved-audio receipt changed; refusing to infer source readiness")
    return {
        "receipt": evidence(receipt_path),
        "ownerApprovedCandidateRelationships": 36,
        "gameAudioFiles": 35,
        "nativeEventRows": 8,
        "runtimeBindingAuthorized": False,
        "runtimeBindings": 0,
        "productionDeployed": False,
    }


def vfx_runtime_evidence(receipt_path: Path = VFX_RUNTIME_RECEIPT) -> dict | None:
    """Return the reviewed VFX release boundary without claiming native parity."""
    if not receipt_path.is_file():
        return None
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    summary = receipt.get("summary", {})
    states = receipt.get("states", {})
    expected = {
        "ownerApprovedVfxReleased": 12,
        "ownerApprovedVfxReleasedUnbound": 12,
        "abilityBindingsCreated": 0,
        "abilityBindingsPreserved": 3,
        "candidateRelationshipsProposed": 7,
        "candidateRelationshipsBound": 0,
        "reserveCandidatesReleasedUnbound": 5,
        "sourceTexturesRetained": 9,
        "staticMeshSupportGlbsRetained": 33,
    }
    if (
        receipt.get("schema") != "ggd.popp-vfx-runtime-release@1"
        or receipt.get("heroId") != "b2-popp"
        or receipt.get("nativeCharacterId") != "PN020"
        or any(summary.get(key) != value for key, value in expected.items())
        or states.get("featureBranchSkillBindingsCreated") is not False
        or states.get("candidateOnly") is not True
        or states.get("existingAbilityBindingsPreserved") is not True
        or states.get("nativeNiagaraTimingRecovered") is not False
        or states.get("rootSpecificMeshLayersBound") is not False
        or states.get("productionDeploymentVerified") is not False
    ):
        raise ValueError("Popp VFX runtime receipt changed; refusing to infer source readiness")
    return {
        "receipt": evidence(receipt_path),
        "ownerApprovedVfxDocuments": 12,
        "abilityBindings": 0,
        "abilityBindingsPreserved": 3,
        "candidateRelationshipsProposed": 7,
        "candidateRelationshipsBound": 0,
        "reserveCandidatesUnbound": 5,
        "nativeNiagaraTimingRecovered": False,
        "rootSpecificMeshLayersBound": False,
        "productionDeployed": False,
    }


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

    runtime_root = workspace / "GGD-Asset-Library/converted/infinity-strash-umodel-macos-v1/runtime-candidates-v4/popp-pn020-00"
    review_root = workspace / "GGD-Asset-Library/converted/infinity-strash-umodel-macos-v1/runtime-webgl-review-popp-magikaru-v5/popp-pn020-00"
    runtime_receipt_path = runtime_root / "receipt.json"
    review_receipt_path = review_root / "run.json"
    acceptance_path = GIT_EVIDENCE.parents[1] / "priority-evidence/infinity-strash-popp-magikaru-v2/runtime-candidates-v4/popp-pn020-00/acceptance-summary.json"
    runtime_evidence = None
    registered_version = None
    if runtime_receipt_path.is_file() and review_receipt_path.is_file():
        runtime_receipt = json.loads(runtime_receipt_path.read_text(encoding="utf-8"))
        review_receipt = json.loads(review_receipt_path.read_text(encoding="utf-8"))
        body_path = runtime_root / "body.glb"
        output = runtime_receipt.get("output", {})
        if (
            runtime_receipt.get("candidateId") != "popp-pn020-00"
            or not body_path.is_file()
            or output.get("bytes") != body_path.stat().st_size
            or output.get("sha256") != sha256(body_path)
        ):
            raise ValueError("Popp runtime receipt or body hash differs")
        if (
            review_receipt.get("complete") is not True
            or review_receipt.get("proofExists") is not True
            or review_receipt.get("errorExists") is not False
            or review_receipt.get("images") != 18
            or review_receipt.get("sourceSha256") != output["sha256"]
        ):
            raise ValueError("Popp WebGL review is incomplete or refers to another body")
        source_model_key = output["document"]["id"]
        hero = json.loads((REPO / "content/champions/b2-popp.json").read_text(encoding="utf-8"))
        matches = [
            row for row in hero.get("modelVersions", [])
            if row.get("sourceModelKey") == source_model_key and row.get("binarySha256") == output["sha256"]
        ]
        if not matches:
            raise ValueError("Popp runtime is not registered on b2-popp")
        registered_version = next(
            (row for row in reversed(matches) if row.get("source", {}).get("sourcePlatform") == "Windows (Steam)"),
            matches[-1],
        )
        if not acceptance_path.is_file():
            raise ValueError("Popp Git acceptance evidence is missing")
        acceptance = json.loads(acceptance_path.read_text(encoding="utf-8"))
        if (
            acceptance.get("candidateId") != "popp-pn020-00"
            or acceptance.get("runtime", {}).get("sha256") != output["sha256"]
            or acceptance.get("registration", {}).get("registeredVersion", {}).get("modelKey") != registered_version["modelKey"]
            or acceptance.get("registration", {}).get("productionDeployed") is not False
        ):
            raise ValueError("Popp Git acceptance evidence differs from runtime or registration")
        backup_root = workspace / "GGD-Asset-Library/backups/infinity-strash-popp-pn020-00-magikaru-delivery-v2"
        backup_manifest_path = backup_root / "scoped-manifest.json"
        backup_receipt_path = backup_root / "s3-verified-receipt.json"
        if not backup_manifest_path.is_file() or not backup_receipt_path.is_file():
            raise ValueError("Popp conversion stages have not been frozen and S3 readback verified")
        backup_manifest = json.loads(backup_manifest_path.read_text(encoding="utf-8"))
        backup_receipt = json.loads(backup_receipt_path.read_text(encoding="utf-8"))
        expected_backup_id = "infinity-strash-popp-pn020-00-magikaru-delivery-v2"
        if (
            backup_manifest.get("sourceId") != expected_backup_id
            or backup_manifest.get("fileCount") != 60
            or backup_receipt.get("id") != expected_backup_id
            or backup_receipt.get("sha256") != backup_manifest.get("sha256")
            or backup_receipt.get("manifestSha256") != sha256(backup_manifest_path)
            or backup_receipt.get("fileCount") != backup_manifest.get("fileCount")
            or backup_receipt.get("readbackVerified") is not True
            or backup_receipt.get("fullGetVerified") is not True
            or backup_receipt.get("allArchiveMembersSha256Verified") is not True
            or backup_receipt.get("profile") != "vibe-coding"
            or backup_receipt.get("region") != "ap-east-2"
            or not str(backup_receipt.get("s3Uri", "")).startswith(
                "s3://ggd-390630837668-ap-east-2-an/legacy/"
            )
        ):
            raise ValueError("Popp conversion S3 receipt differs from the frozen delivery")
        acceptance_root = acceptance_path.parent
        git_backup_manifest = acceptance_root / "conversion-scoped-manifest.json"
        git_backup_receipt = acceptance_root / "s3-conversion-receipt.json"
        shutil.copyfile(backup_manifest_path, git_backup_manifest)
        shutil.copyfile(backup_receipt_path, git_backup_receipt)
        runtime_evidence = {
            "candidateId": "infinity-strash-popp-pn020-00-magikaru-native-v2",
            "localRoot": runtime_root.relative_to(workspace).as_posix(),
            "body": {"path": "body.glb", "bytes": body_path.stat().st_size, "sha256": output["sha256"]},
            "receipt": {"path": str(runtime_receipt_path), "sha256": sha256(runtime_receipt_path)},
            "webglReview": {"path": str(review_receipt_path), "sha256": sha256(review_receipt_path), "images": 18},
            "sourceModelKey": source_model_key,
            "registeredVersionKey": registered_version["modelKey"],
            "gitAcceptance": {
                "path": acceptance_path.relative_to(REPO).as_posix(),
                "sha256": sha256(acceptance_path),
            },
            "conversionBackup": {
                "s3Uri": backup_receipt["s3Uri"],
                "manifestUri": backup_receipt["manifestUri"],
                "bytes": backup_receipt["bytes"],
                "sha256": backup_receipt["sha256"],
                "fileCount": backup_receipt["fileCount"],
                "fullGetVerified": True,
                "allArchiveMembersSha256Verified": True,
                "gitManifestPath": git_backup_manifest.relative_to(REPO).as_posix(),
                "gitManifestSha256": sha256(git_backup_manifest),
                "gitReceiptPath": git_backup_receipt.relative_to(REPO).as_posix(),
                "gitReceiptSha256": sha256(git_backup_receipt),
            },
        }

    approved_audio = approved_audio_evidence()
    published_vfx = vfx_runtime_evidence()
    readiness = (
        "popp-native-model-magikaru-attached-webgl-accepted-registered-on-feature-branch"
        "-audio-owner-reviewed-runtime-targets-pending"
        "-vfx-owner-approved-feature-branch-native-parity-pending"
        if runtime_evidence and approved_audio and published_vfx
        else "popp-native-model-magikaru-attached-webgl-accepted-registered-on-feature-branch-audio-listening-and-effects-pending"
        if runtime_evidence else "popp-raw-extracted-audio-decoded-pending-model-export-and-listening-review"
    )
    vfx_state = (
        "twelve-owner-approved-ggd-vfx-documents-feature-branch-seven-qwr-relationships-bound"
        "-native-niagara-timing-root-mesh-and-parity-pending"
        if published_vfx else "native-unreal-packages-extracted-pending-game-specific-export"
    )
    audio_state = (
        "owner-listening-approved-game-format-converted-native-events-indexed"
        "-runtime-targets-and-playback-pending"
        if approved_audio else "decoded-pending-listening-review"
    )

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
        "readiness": readiness,
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
            "modelState": "converted-webgl-accepted" if runtime_evidence else "native-unreal-packages-extracted-pending-game-specific-export",
            "animationState": "seven-native-sequences-exported-five-distinct-runtime-clips" if runtime_evidence else "native-unreal-packages-extracted-pending-game-specific-export",
            "vfxState": vfx_state,
            "audioState": audio_state,
            "designStatus": "existing-hero-definition-present-model-option-registered-feature-branch" if runtime_evidence else "existing-hero-definition-present-pending-model-option",
            "defaultEligible": bool(runtime_evidence),
            "backendSelectable": bool(runtime_evidence),
            "deployed": False,
            **({"derivedRuntimeCandidateId": runtime_evidence["candidateId"], "runtimeEvidence": runtime_evidence} if runtime_evidence else {}),
            **({"approvedAudioEvidence": approved_audio} if approved_audio else {}),
            **({"publishedVfxEvidence": published_vfx} if published_vfx else {}),
        }],
        "backendIntegration": {
            "required": True,
            "state": "registered-on-feature-branch-pending-merge-and-deployment" if runtime_evidence else "pending-game-specific-model-export-listening-and-binding",
            "selectionVerified": bool(runtime_evidence),
            "release": None,
        },
        "verification": (
            "The PAK index yielded 2,280 exact PN020 members. AkLocalizedMediaAsset references from 565 PN010/PN020/EN801/EN653 events resolved to 938 media packages; "
            "929 contained Wwise RIFF payloads and decoded to PCM WAV with exact source and output SHA-256. Nine package shells have no .ubulk payload and remain explicit gaps."
        ),
        "limitations": (
            [
                "Popp PN020/00 model, textures, skeleton, Magikaru staff and seven native sequences are converted; runtime uses five distinct native clips and reuses down for hurt/death.",
                "Magikaru is rigid-skinned to the source-configured Weapon1_R socket. The selected Kagayaki and retained Mahouno variants are handled by their own model-option evidence. Exact toon shader parameters and three-staff visual parity remain open; the 8x8 hair base relies on game shader parameters.",
                "36 owner-approved PN020 native-event relationships are stored as 35 verified game MP3 files and eight native-event rows. Their receipt authorizes no unique GGD ability/state target, runtime consumer or playback claim.",
                "Twelve owner-visual-approved GGD VFX documents are on the feature branch as unbound candidates; seven source-name relationships remain Q/W/R review proposals and five remain unpaired reserves. Active Q/W/R VFX are preserved. Native Niagara timing, root-specific mesh attribution and full original parity remain open.",
                "Nine referenced media packages contain no .ubulk payload and remain explicit missing-payload relations.",
                "Feature-branch registration is not Main merge, production backend availability or deployment evidence.",
            ] if runtime_evidence else extraction["gaps"]
        ),
        **({"runtimeEvidence": runtime_evidence} if runtime_evidence else {}),
        **({"approvedAudioEvidence": approved_audio} if approved_audio else {}),
        **({"publishedVfxEvidence": published_vfx} if published_vfx else {}),
    }
    document = json.loads(DOWNLOADS.read_text(encoding="utf-8"))
    matches = [row for collection in ("publicSources", "paidSources") for row in document.get(collection, []) if row.get("id") == SOURCE_ID]
    if matches:
        if len(matches) != 1:
            raise ValueError("source ID is duplicated")
        existing = matches[0]
        mutable = {
            "publicationStatus", "pendingBackup", "backup", "verification",
            "readiness", "modelCandidates", "backendIntegration", "limitations", "runtimeEvidence",
            "approvedAudioEvidence", "publishedVfxEvidence",
        }
        # The first local integration predated the explicit per-character query
        # scope.  Adding these identity-only fields changes no archived bytes.
        if "identityRecords" not in existing:
            existing.pop("characters", None)
            existing["identityRecords"] = source["identityRecords"]
            existing["notAliases"] = source["notAliases"]
        if {key: value for key, value in existing.items() if key not in mutable} != {key: value for key, value in source.items() if key not in mutable}:
            raise ValueError("existing source differs; refusing to overwrite another workflow")
        # Acquisition backup evidence is append-only and may have been added by
        # the S3 archiver after this source workflow first ran.  Preserve those
        # fields while advancing only locally revalidated conversion status.
        for key in {"readiness", "modelCandidates", "backendIntegration", "limitations", "runtimeEvidence", "approvedAudioEvidence", "publishedVfxEvidence"}:
            if key in source:
                existing[key] = source[key]
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
