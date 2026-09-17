#!/usr/bin/env python3
"""Build the SSBU source-module catalog fragment from preserved evidence.

This generator deliberately keeps source discovery, readable payloads,
conversion/acceptance, backend registration, and deployment as separate stages.
It never treats a container filename or a community-source payload as an
original-game extraction or a runtime-selectable GGD option.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from fragment_compaction import compact_fragment, expanded_json_bytes


SCHEMA = "ggd.source-module-catalog-fragment@1"
WORK = "Super Smash Bros. Ultimate"


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _module(stage: str | None, count: int | None, note: str | None) -> dict[str, Any]:
    return {"stage": stage, "count": count, "note": note}


def _unknown(note: str | None = None) -> dict[str, Any]:
    return _module(None, None, note)


def _not_registered(note: str) -> dict[str, Any]:
    return _module("not-registered", 0, note)


def _not_deployed() -> dict[str, Any]:
    return _module("not-deployed", 0, "沒有正式站部署證據。")


def _base_candidate(character: str, candidate_id: str) -> dict[str, Any]:
    return {
        "character": character,
        "id": candidate_id,
        "work": WORK,
        "model": _unknown(),
        "texture": _unknown(),
        "skeleton": _unknown(),
        "motion": _unknown(),
        "vfx": _unknown(),
        "sfx": _unknown(),
        "voice": _unknown(),
        "registration": _not_registered("尚未登記為後台可選模組。"),
        "deployment": _not_deployed(),
        "evidence": [],
    }


def _worldblender_group(roster: dict[str, Any]) -> dict[str, Any]:
    candidates: list[dict[str, Any]] = []
    inventory_path = (
        "materials/hero-model-library/source-inventories/"
        "ssbu-ultimate-local-roster-v1/inventory.json"
    )
    model_validation = "materials/hero-model-library/ssbu-model-library-validation.json"

    for fighter in roster["fighters"]:
        native_id = fighter["nativeId"]
        source = fighter["worldblender"]
        accepted = source.get("acceptedStaticComponent")
        row = _base_candidate(native_id, f"ssbu-worldblender-{native_id}")
        row["classification"] = fighter["classification"]
        row["container"] = _module(
            "manifest-verified",
            source["fileCount"],
            "Worldblender Git LFS snapshot paths and byte sizes were locally verified; this is a community export, not an original-game container.",
        )
        row["payload"] = _module(
            "source-payload-verified",
            source["fileCount"],
            f"{source['blendCount']} Blend and {source['pngCount']} PNG payloads are present for this native ID.",
        )

        if accepted:
            component_note = (
                f"Accepted independent component {accepted['componentId']} at "
                f"{accepted['gitPath']}; {accepted['triangles']} triangles, "
                f"{accepted['jointCount']} joints. It is not runtime-selectable."
            )
            row["model"] = _module("accepted-component", 1, component_note)
            row["texture"] = _module(
                "accepted-component",
                source["pngCount"],
                "Textures are embedded/referenced by the accepted standardized component; count is the source PNG count for this native ID.",
            )
            row["skeleton"] = _module(
                "accepted-component",
                1,
                f"Validated skinned component with {accepted['jointCount']} joints.",
            )
        elif source["modelCandidateExists"]:
            row["model"] = _module(
                "source-payload",
                source["primaryBodyOrAvatarCandidateCount"],
                "Primary body/avatar Blend candidates exist; conversion and acceptance remain separate.",
            )
            row["texture"] = _module(
                "source-payload",
                source["pngCount"],
                "PNG texture payloads exist in the pinned community snapshot.",
            )
            row["skeleton"] = _module(
                "source-payload-uninspected",
                None,
                f"Inventory status: {source['skeletonStatus']}; no accepted skeleton count is claimed.",
            )
        else:
            row["model"] = _module("not-present", 0, "No primary body/avatar candidate was identified for this helper/shared ID.")
            row["texture"] = _module(
                "source-payload" if source["textureFilesExist"] else "not-present",
                source["pngCount"],
                "Texture payloads may be shared/helper resources and do not establish a character model.",
            )
            row["skeleton"] = _module("not-present", 0, source["skeletonStatus"])

        row["motion"] = _unknown("本份 Worldblender 盤點沒有建立可驗收動作候選。")
        row["vfx"] = _unknown("本份 Worldblender 盤點沒有建立角色 VFX 候選。")
        row["sfx"] = _unknown("本份 Worldblender 盤點沒有建立角色 SFX 候選。")
        row["voice"] = _unknown("本份 Worldblender 盤點沒有建立角色語音候選。")
        row["evidence"] = [inventory_path, model_validation, *row["evidence"]]
        candidates.append(row)

    summary = roster["summary"]
    return {
        "sourceId": "gitlab-ssbu-models",
        "title": "SSBU Worldblender pinned community model snapshot",
        "platform": "Nintendo Switch / community Blender export",
        "version": roster["worldblender"]["commit"],
        "status": "source-payload-verified-with-independent-components",
        "evidencePaths": [inventory_path, model_validation],
        "summary": {
            "manifestFiles": summary["worldblenderManifestFiles"],
            "manifestBytes": summary["worldblenderManifestBytes"],
            "fighterOrFormIds": summary["fighterOrFormIdCount"],
            "primaryModelCandidates": summary["primaryBodyOrAvatarCandidateCount"],
            "acceptedStaticComponents": summary["acceptedStaticComponentCount"],
            "registeredOptions": summary["runtimeSelectableCount"],
            "note": "All 28,681 LFS paths exist and match pinned size/hash evidence. They are community exports; accepted components are independent GLBs, not backend-selectable options.",
        },
        "candidates": candidates,
    }


def _ultimate14_group(roster: dict[str, Any]) -> dict[str, Any]:
    candidates: list[dict[str, Any]] = []
    inventory_path = (
        "materials/hero-model-library/source-inventories/"
        "ssbu-ultimate-local-roster-v1/inventory.json"
    )
    motion_path = "materials/hero-model-library/source-inventories/ultimate14-native-motions.json"
    decoded_index = (
        "../GGD-Asset-Library/conversions/ultimate14-audio-decoded-20260911-v1/"
        "audioFileIndex.json"
    )

    for fighter in roster["fighters"]:
        native_id = fighter["nativeId"]
        source = fighter["ultimate14"]
        has_any = any(
            (
                source["nativeMotionExists"],
                source["effectFilesExist"],
                source["audioBankExists"],
                source.get("acceptedMotionComponent") is not None,
            )
        )
        if not has_any:
            continue

        accepted = source.get("acceptedMotionComponent")
        row = _base_candidate(native_id, f"ssbu-ultimate14-{native_id}")
        row["container"] = _module(
            "archive-and-extraction-verified",
            1,
            "Ultimate14 1.0 community-mod archive and extracted files are locally preserved and hash indexed.",
        )
        row["payload"] = _module(
            "source-payload-parsed",
            source["motionAliasCount"] + source["effectFileCount"] + source["audioBankAliasCount"],
            "Count combines native motion aliases, effect files, and audio bank aliases for this source-native ID; it is not a count of unique ready modules.",
        )
        row["model"] = _module("not-present", 0, "Ultimate14 does not deliver a character body model for this catalog lane.")
        row["texture"] = _unknown("角色模型貼圖未由此來源建立候選；VFX 用 NUTEXB 另計。")
        row["skeleton"] = _unknown("動作與目標骨架相容性需要獨立驗收。")

        if accepted:
            row["motion"] = _module(
                "accepted-component",
                accepted["nativeAnimationCount"],
                f"Accepted independent motion component {accepted['componentId']} at {accepted['gitPath']}; skeleton playback was accepted for that component only, and it is not runtime-selectable.",
            )
        elif source["nativeMotionExists"]:
            row["motion"] = _module(
                "source-payload-parsed",
                source["uniqueBodyMotionPayloadCount"],
                f"{source['motionAliasCount']} NUANMB aliases are present; count reports unique body-motion payloads. No target-skeleton playback acceptance is claimed.",
            )
        else:
            row["motion"] = _module("not-present", 0, "No NUANMB motion payload was indexed for this native ID.")

        row["vfx"] = (
            _module(
                "source-payload-unconverted",
                source["effectFileCount"],
                "Native NUTEXB trail/effect texture payloads exist; no GGD VFX conversion, visual acceptance, registration, or deployment is claimed.",
            )
            if source["effectFilesExist"]
            else _module("not-present", 0, "No Ultimate14 effect file was indexed for this native ID.")
        )
        if source["decodedWavCount"]:
            row["sfx"] = _module(
                "decoded-local-unclassified",
                source["decodedWavCount"],
                "PCM WAV decode passed, but se_ is only a source label; listening, event binding, and character mapping remain unverified.",
            )
            row["voice"] = _unknown("confirmedVoiceCount is null; do not promote these se_-labelled streams to voice candidates without listening review.")
        elif source["audioBankExists"]:
            row["sfx"] = _module(
                "source-payload",
                source["audioBankAliasCount"],
                "Native patch3audio aliases exist; decoded candidate count for this ID is zero in the current receipt.",
            )
            row["voice"] = _unknown("No confirmed voice count exists.")
        else:
            row["sfx"] = _module("not-present", 0, "No Ultimate14 audio bank was indexed for this native ID.")
            row["voice"] = _module("not-present", 0, "No Ultimate14 audio bank was indexed for this native ID.")

        row["evidence"] = [inventory_path, motion_path, decoded_index, *row["evidence"]]
        candidates.append(row)

    summary = roster["summary"]
    return {
        "sourceId": "parallel-ns-ultimate14",
        "title": "Ultimate14 1.0 community-mod motion, effect, and audio payloads",
        "platform": "Nintendo Switch / community mod",
        "version": "1.0",
        "status": "payload-parsed-partially-converted-not-registered",
        "evidencePaths": [inventory_path, motion_path, decoded_index],
        "summary": {
            "motionFighterIds": summary["ultimate14MotionFighterCount"],
            "motionAliases": summary["ultimate14MotionAliasCount"],
            "uniqueTransformPayloads": summary["ultimate14UniqueTransformPayloadCount"],
            "acceptedMotionComponents": summary["acceptedMotionComponentCount"],
            "effectFiles": summary["ultimate14EffectFiles"],
            "audioBankAliases": summary["ultimate14AudioBankAliases"],
            "decodedWavFiles": summary["ultimate14DecodedWavFiles"],
            "registeredOptions": summary["runtimeSelectableCount"],
            "note": "Ultimate14 is a community mod, not a full SSBU roster or verified base-game extraction. Audio is decoded but remains unclassified and unmapped.",
        },
        "candidates": candidates,
    }


def _nsandns2_group(roster: dict[str, Any]) -> dict[str, Any]:
    inventory_path = (
        "materials/hero-model-library/source-inventories/"
        "ssbu-ultimate-local-roster-v1/inventory.json"
    )
    audit_path = (
        "../GGD-Asset-Library/intake/ultimate16-nsandns2-audit-20260915-v1/"
        "ultimate14-files-reverified.json"
    )
    candidates: list[dict[str, Any]] = []

    for index, container in enumerate(roster["nsandns2"]["containers"], start=1):
        row = _base_candidate("全角色（容器未檢查）", f"ssbu-nsandns2-container-{index}")
        row["container"] = _module(
            "container-metadata-only",
            1,
            f"Windows path and reported byte size ({container['bytes']}) are recorded; content hash and member table are unavailable.",
        )
        row["payload"] = _module(
            "not-read",
            0,
            "The Windows share was not mounted; payload bytes read, headers inspected, and members inventoried are all zero.",
        )
        unknown_note = "Container contents are unread; this module type cannot be counted or classified yet."
        row["model"] = _unknown(unknown_note)
        row["texture"] = _unknown(unknown_note)
        row["skeleton"] = _unknown(unknown_note)
        row["motion"] = _unknown(unknown_note)
        row["vfx"] = _unknown(unknown_note)
        row["sfx"] = _unknown(unknown_note)
        row["voice"] = _unknown(unknown_note)
        row["evidence"] = [inventory_path, audit_path]
        row["sourcePath"] = container["windowsAbsolutePath"]
        row["sourceTitle"] = container["title"]
        candidates.append(row)

    return {
        "sourceId": "windows-game-library-20260912:ssbu-nsandns2",
        "title": "NSandNS2 SSBU NSP/ZIP container records",
        "platform": "Nintendo Switch / Windows library metadata",
        "version": None,
        "status": "container-metadata-only-share-unmounted",
        "evidencePaths": [inventory_path, audit_path],
        "summary": {
            "containerRecords": len(candidates),
            "payloadBytesRead": roster["summary"]["windowsNsandns2PayloadBytesRead"],
            "memberRecords": 0,
            "convertedCandidates": 0,
            "acceptedCandidates": 0,
            "registeredOptions": 0,
            "deployedOptions": 0,
            "note": roster["nsandns2"]["blocker"],
        },
        "candidates": candidates,
    }


def _alucard_mod_group() -> dict[str, Any]:
    source_prefix = (
        "../GGD-Asset-Library/intake/public-models-20260910/parallel-ns-alucard-ssbu"
    )
    audio_prefix = "../GGD-Asset-Library/conversions/alucard-audio-20260911-v1/revision-02"
    row = _base_candidate("alucard-ssm-on-richter-c120", "ssbu-mod-alucard-ssm")
    row["container"] = _module(
        "archive-and-extraction-verified",
        1,
        "Alucard.SSM community-mod archive is preserved and its extracted file list is hash indexed.",
    )
    row["payload"] = _module(
        "source-payload-header-validated",
        340,
        "340 extracted records are indexed; 147 selected native-format headers passed with zero header errors.",
    )
    row["model"] = _module(
        "source-payload-unconverted",
        6,
        "Six NUMSHB mesh payloads cover body/props/stage assets; no GGD model conversion or visual acceptance is claimed.",
    )
    row["texture"] = _module(
        "source-payload-unconverted",
        73,
        "73 NUTEXB texture payloads are present; no standardized texture acceptance is claimed.",
    )
    row["skeleton"] = _module(
        "source-payload-unconverted",
        6,
        "Six NUSKTB skeleton payloads are present; no GGD skeleton compatibility acceptance is claimed.",
    )
    row["motion"] = _module(
        "source-payload-header-validated",
        112,
        "112 NUANMB paths are present and covered by the native header audit; target-skeleton playback and six-state mapping are unverified.",
    )
    row["vfx"] = _module(
        "source-payload-unconverted",
        8,
        "Eight EFF payloads plus related textures are present; no GGD VFX conversion or visual acceptance is claimed.",
    )
    row["sfx"] = _module(
        "decoded-local-unreviewed",
        92,
        "92 non-silent se_-labelled WAV candidates are decoded; source labels do not replace listening or event-binding review.",
    )
    row["voice"] = _module(
        "decoded-local-unreviewed",
        41,
        "39 vc_-labelled, one cheer-labelled, and one narration-labelled WAV candidate are decoded; speaker/language/event mapping is unverified and confirmedVoiceCount remains null.",
    )
    row["evidence"] = [
        f"{source_prefix}/extracted-files.jsonl",
        f"{source_prefix}/native-format-validation.json",
        f"{audio_prefix}/audioFileIndex.json",
        "materials/hero-model-library/voice-index.json",
    ]
    return {
        "sourceId": "parallel-ns-alucard-ssbu",
        "title": "Alucard SSM community mod",
        "platform": "Nintendo Switch / Super Smash Bros. Ultimate community mod",
        "version": "2.7 source release lineage",
        "status": "payload-and-audio-decoded-not-converted-or-registered",
        "evidencePaths": row["evidence"],
        "summary": {
            "extractedFiles": 340,
            "headerChecks": 147,
            "headerErrors": 0,
            "modelMeshes": 6,
            "motions": 112,
            "effectFiles": 8,
            "decodedSfxLabelledWavs": 92,
            "decodedVoiceLikeLabelledWavs": 41,
            "silentPlaceholdersExcluded": 2,
            "registeredOptions": 0,
            "deployedOptions": 0,
            "note": "All module identities are source-path/filename based. No model, animation, VFX, audio event, backend option, or deployment acceptance is implied.",
        },
        "candidates": [row],
    }


def _bowser_mod_group() -> dict[str, Any]:
    source_prefix = (
        "../GGD-Asset-Library/intake/public-models-20260910/parallel-ns-bowser-big-blast"
    )
    row = _base_candidate("koopa (Bowser)", "ssbu-mod-bowsers-big-blast")
    row["container"] = _module(
        "archives-and-extraction-verified",
        2,
        "Two preserved source revisions contribute byte-indexed extracted records.",
    )
    row["payload"] = _module(
        "source-payload-header-validated",
        68,
        "68 extracted records are indexed; 38 NUANMB headers passed with zero errors across the two revisions.",
    )
    row["model"] = _module("not-present", 0, "No model payload is present in this motion-only mod delivery.")
    row["texture"] = _module("not-present", 0, "No texture payload is present in this motion-only mod delivery.")
    row["skeleton"] = _module("not-present", 0, "No skeleton payload is present in this motion-only mod delivery.")
    row["motion"] = _module(
        "source-payload-header-validated",
        38,
        "38 NUANMB paths are preserved across two revisions; this path count includes revision/costume aliases and is not a unique accepted animation count.",
    )
    row["vfx"] = _module("not-present", 0, "No VFX payload was indexed in this delivery.")
    row["sfx"] = _module("not-present", 0, "No audio bank was indexed in this delivery.")
    row["voice"] = _module("not-present", 0, "No audio bank was indexed in this delivery.")
    row["evidence"] = [
        f"{source_prefix}/extracted-files.jsonl",
        f"{source_prefix}/native-format-validation.json",
    ]
    return {
        "sourceId": "parallel-ns-bowser-big-blast",
        "title": "Bowser's Big Blast community motion mod",
        "platform": "Nintendo Switch / Super Smash Bros. Ultimate community mod",
        "version": None,
        "status": "motion-payload-header-validated-not-converted",
        "evidencePaths": row["evidence"],
        "summary": {
            "extractedFiles": 68,
            "motionPathsAcrossRevisions": 38,
            "headerErrors": 0,
            "acceptedMotionComponents": 0,
            "registeredOptions": 0,
            "deployedOptions": 0,
            "note": "This is a source motion candidate only. Costume and revision aliases have not been deduplicated into accepted GGD actions.",
        },
        "candidates": [row],
    }


def _voice_group(repo_root: Path, asset_root: Path) -> dict[str, Any]:
    relative_root = Path("intake/public-models-20260910/parallel-voice-ssbu-japanese")
    source_root = asset_root / relative_root
    groups_path = source_root / "native-audio-groups.json"
    groups = _read_json(groups_path)["groups"]
    validation = _read_json(repo_root / "materials/hero-model-library/ssbu-japanese-audio-validation.json")
    decoded_root = source_root / "decoded-audio-nus3"
    decoded_counts: dict[str, int] = {}

    if decoded_root.exists():
        for directory in decoded_root.iterdir():
            if not directory.is_dir():
                continue
            folder = re.sub(r"^\d+-", "", directory.name)
            wav_count = sum(1 for path in directory.iterdir() if path.suffix.lower() == ".wav")
            decoded_counts[folder] = wav_count

    evidence_prefix = "../GGD-Asset-Library/" + relative_root.as_posix()
    candidates: list[dict[str, Any]] = []
    for group in groups:
        group_id = group["groupId"]
        pattern = re.compile(rf"^{re.escape(group_id)}(?:_c\d\d)?$")
        decoded_wavs = sum(count for name, count in decoded_counts.items() if pattern.match(name))
        canonical_banks = {bank["canonicalBank"] for bank in group["banks"]}
        row = _base_candidate(group["sourceCharacterKey"], f"ssbu-japanese-{group_id}")
        row["container"] = _module(
            "archive-verified",
            len(group["banks"]),
            "Count is the native bank alias count for this source-name group; aliases may share byte-identical canonical banks.",
        )
        row["payload"] = _module(
            "decoded-local",
            decoded_wavs,
            f"{len(canonical_banks)} unique canonical NUS3Audio bank payload(s) feed the local WAV decode count.",
        )
        row["model"] = _module("not-present", 0, "Audio-only source.")
        row["texture"] = _module("not-present", 0, "Audio-only source.")
        row["skeleton"] = _module("not-present", 0, "Audio-only source.")
        row["motion"] = _module("not-present", 0, "Audio-only source.")
        row["vfx"] = _module("not-present", 0, "Audio-only source.")
        row["sfx"] = _unknown("The vc_ source label suggests voice but per-clip classification has not established an SFX subset.")
        row["voice"] = (
            _module(
                "decoded-local-unreviewed",
                decoded_wavs,
                "WAV payloads are decoded and hash/PCM checked. Character key is filename-derived; speaker, language, transcript, and event bindings are not reviewed, so confirmedVoiceCount remains null.",
            )
            if decoded_wavs
            else _module(
                "source-payload-alias-only",
                0,
                "This native-name group shares byte-identical canonical payloads with another group and has no separate decoded input directory; no distinct voice performance is claimed.",
            )
        )
        row["evidence"] = [
            "materials/hero-model-library/ssbu-japanese-audio-validation.json",
            f"{evidence_prefix}/native-audio-groups.json",
            f"{evidence_prefix}/nus3audio-decoding.json",
        ]
        candidates.append(row)

    return {
        "sourceId": "parallel-voice-ssbu-japanese",
        "title": "SSBU All Japanese Voices reserve",
        "platform": "Nintendo Switch / community audio package",
        "version": None,
        "status": "decoded-local-pending-listening-and-character-mapping",
        "evidencePaths": [
            "materials/hero-model-library/ssbu-japanese-audio-validation.json",
            f"{evidence_prefix}/native-audio-groups.json",
            f"{evidence_prefix}/nus3audio-decoding.json",
        ],
        "summary": {
            "nativeBankAliases": validation["originalBankCount"],
            "nativeNameGroups": validation["nativeNameGroups"],
            "decodedInputGroups": validation["decodedInputGroups"],
            "uniqueDecodedBanks": validation["uniqueDecodedBankCount"],
            "decodedWavFiles": validation["decodedWavCount"],
            "uniqueDecodedWavHashes": validation["uniqueDecodedWavHashes"],
            "confirmedVoiceCount": validation["confirmedVoiceCount"],
            "registeredOptions": 0,
            "deployedOptions": 0,
            "note": "The author declares Japanese game-rip audio, but GGD evidence has not verified speaker/language/event mappings per clip. Decoded files are candidates only.",
        },
        "candidates": candidates,
    }


def build_fragment(repo_root: Path, asset_root: Path) -> dict[str, Any]:
    roster_path = (
        repo_root
        / "materials/hero-model-library/source-inventories/ssbu-ultimate-local-roster-v1/inventory.json"
    )
    roster = _read_json(roster_path)
    fragment = {
        "schema": SCHEMA,
        "sourceFamily": "Nintendo Super Smash Bros. Ultimate",
        "auditedAt": "2026-09-17",
        "truthBoundary": [
            "Worldblender and Ultimate14 are community sources, not verified Nintendo base-game payloads.",
            "NSandNS2 records are container metadata only because the share was unmounted and zero payload bytes were read.",
            "Accepted independent components do not imply backend registration or production deployment.",
            "Decoded audio remains a candidate until listening, identity, event binding, registration, and deployment evidence exists.",
        ],
        "sourceGroups": [
            _worldblender_group(roster),
            _ultimate14_group(roster),
            _voice_group(repo_root, asset_root),
            _alucard_mod_group(),
            _bowser_mod_group(),
            _nsandns2_group(roster),
        ],
    }
    validate_fragment(fragment, repo_root)
    return fragment


def validate_fragment(fragment: dict[str, Any], repo_root: Path) -> None:
    if fragment.get("schema") != SCHEMA:
        raise ValueError(f"unexpected schema: {fragment.get('schema')!r}")
    required_group = {
        "sourceId",
        "title",
        "platform",
        "version",
        "status",
        "evidencePaths",
        "summary",
        "candidates",
    }
    required_candidate = {
        "character",
        "id",
        "work",
        "model",
        "motion",
        "vfx",
        "sfx",
        "voice",
        "registration",
        "deployment",
        "evidence",
    }
    module_fields = {
        "container",
        "payload",
        "model",
        "texture",
        "skeleton",
        "motion",
        "vfx",
        "sfx",
        "voice",
        "registration",
        "deployment",
    }
    ids: set[str] = set()
    evidence_paths: set[str] = set()
    for group in fragment["sourceGroups"]:
        missing_group = required_group - group.keys()
        if missing_group:
            raise ValueError(f"{group.get('sourceId')} missing group fields: {sorted(missing_group)}")
        evidence_paths.update(group["evidencePaths"])
        for row in group["candidates"]:
            missing_candidate = required_candidate - row.keys()
            if missing_candidate:
                raise ValueError(f"{row.get('id')} missing candidate fields: {sorted(missing_candidate)}")
            if row["id"] in ids:
                raise ValueError(f"duplicate candidate id: {row['id']}")
            ids.add(row["id"])
            evidence_paths.update(row["evidence"])
            for field in module_fields & row.keys():
                if set(row[field]) != {"stage", "count", "note"}:
                    raise ValueError(f"{row['id']}.{field} must contain stage/count/note")
                if row[field]["count"] is not None and (
                    not isinstance(row[field]["count"], int) or row[field]["count"] < 0
                ):
                    raise ValueError(f"{row['id']}.{field}.count must be a non-negative integer or null")

    if not ids:
        raise ValueError("SSBU fragment contains no candidates")
    missing_evidence = sorted(
        path
        for path in evidence_paths
        if not path.startswith(("http://", "https://", "s3://"))
        and not (repo_root / path).resolve().exists()
    )
    if missing_evidence:
        raise ValueError(f"missing evidence paths: {missing_evidence}")


def _default_repo_root() -> Path:
    return Path(__file__).resolve().parents[5]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path, default=_default_repo_root())
    parser.add_argument("--asset-root", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    repo_root = args.repo_root.resolve()
    asset_root = (args.asset_root or repo_root.parent / "GGD-Asset-Library").resolve()
    output = args.output or (
        repo_root / "materials/hero-model-library/source-module-catalog-v1/ssbu.json"
    )
    fragment = build_fragment(repo_root, asset_root)
    expanded = expanded_json_bytes(fragment)
    repo_relative_path = "materials/hero-model-library/source-module-catalog-v1/ssbu.json"
    compact = compact_fragment(
        fragment,
        repo_relative_path=repo_relative_path,
        expanded_bytes=expanded,
    )
    payload = json.dumps(compact, ensure_ascii=False, indent=2) + "\n"

    if args.check:
        if not output.exists() or output.read_text(encoding="utf-8") != payload:
            raise SystemExit(f"stale or missing generated catalog: {output}")
        print(f"PASS {output}")
        return 0

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(payload, encoding="utf-8")
    print(f"wrote {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
