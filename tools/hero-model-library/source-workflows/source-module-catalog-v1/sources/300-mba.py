#!/usr/bin/env python3
"""Build the 300 Heroes / Magical Battle Arena module-catalog fragment.

The output deliberately keeps indexed records, converted candidates, visual
acceptance, runtime registration, and production deployment as separate facts.
Audio linked by a numeric character prefix is not guessed to be SFX or voice.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from fragment_compaction import compact_fragment, expanded_json_bytes


REPO = Path(__file__).resolve().parents[5]
WORKSPACE = REPO.parent
INDEX_REL = "materials/hero-model-library/priority-evidence/300-mba-unused-assets-v1/index.json"
PILOT_REL = "materials/hero-model-library/priority-evidence/mba-unused-model-pilot-v1/report.json"
BATCH2_REL = "materials/hero-model-library/priority-evidence/mba-unused-model-batch2-v1/report.json"
NATIVE_REL = "materials/hero-model-library/priority-evidence/mba-unused-native-batch-v2/receipt.json"
REGISTRY_REL = "outputs/asset-library-registry-20260907/catalog.sqlite"
CHARACTERS_REL = "outputs/asset-library-registry-20260907/characters.json"
LIBRARY_SUMMARY_REL = "outputs/game-asset-library-20260907/asset-library-summary.json"
MBA_VALIDATION_REL = "outputs/game-asset-library-20260907/evidence/mba-output-validation.json"
DEFAULT_OUTPUT = REPO / "materials/hero-model-library/source-module-catalog-v1/300-mba.json"


def read_json(path: Path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def module(stage, count, note, **extra):
    value = {"stage": stage, "count": count, "note": note}
    value.update(extra)
    return value


def workspace_evidence(path: str) -> str:
    return f"../{path}"


def linked_counts(registry: Path):
    result: dict[str, dict[str, int]] = {}
    with sqlite3.connect(registry) as db:
        rows = db.execute(
            """
            SELECT l.character_id, a.kind, COUNT(*)
            FROM links l JOIN assets a ON a.id = l.asset_id
            WHERE a.library IN ('300heroes', 'mba') AND a.exists_local = 1
            GROUP BY l.character_id, a.kind
            """
        )
        for character_id, kind, count in rows:
            result.setdefault(character_id, {})[kind] = count
    return result


def reviewed_mba_products():
    products = {}
    for rel in (PILOT_REL, BATCH2_REL):
        report = read_json(REPO / rel)
        for item in report.get("candidates", []):
            products[item["sourceCharacterId"]] = {
                "report": rel,
                "motionCount": item.get("metrics", {}).get("nativeClips"),
                "readiness": item.get("readiness"),
            }
    return products


def build_fragment():
    index = read_json(REPO / INDEX_REL)
    library_summary = read_json(WORKSPACE / LIBRARY_SUMMARY_REL)
    linked = linked_counts(WORKSPACE / REGISTRY_REL)
    reviewed = reviewed_mba_products()
    structural = {
        item["sourceCharacterId"]: item
        for item in index.get("standardizedCandidateProducts", [])
    }

    candidates_by_library = {"300heroes": [], "mba": []}
    for item in index["characters"]:
        character_id = item["sourceCharacterId"]
        library = character_id.split(":", 1)[0]
        counts = linked.get(character_id, {})
        pipeline = item["pipelineStageCounts"]
        evidence = [
            INDEX_REL,
            workspace_evidence(CHARACTERS_REL),
            workspace_evidence(REGISTRY_REL),
        ]

        if library == "300heroes":
            model_count = counts.get("model")
            motion_count = counts.get("animation")
            audio_count = counts.get("audio")
            model_value = module(
                "extracted-native-and-static-preview-indexed" if model_count else None,
                model_count,
                "Linked model index records include native JUMPX/EG3D and static OBJ previews; OBJ does not prove rig or animation readiness.",
            )
            texture_value = module(
                None,
                None,
                "47,543 native texture files exist at library scope, but this evidence set has no authoritative per-character texture count.",
            )
            skeleton_value = module(
                None,
                None,
                "Native model/animation containers may carry rig data, but no per-character skeleton parse or retarget acceptance is established here.",
            )
            motion_value = module(
                "extracted-native-indexed" if motion_count else None,
                motion_count,
                "Character-linked native animation index records; semantic six-state mapping and playback acceptance are not established.",
            )
            audio_note = (
                f"{audio_count} playable audio records are linked by numeric-prefix candidate logic; the registry does not classify the pool into SFX versus voice."
                if audio_count
                else "No character-linked playable audio pool is established for this candidate."
            )
            sfx_value = module(
                "playable-audio-pool-unclassified" if audio_count else None,
                None,
                audio_note,
                sourcePoolCount=audio_count,
            )
            voice_value = module(
                "playable-audio-pool-unclassified" if audio_count else None,
                None,
                audio_note,
                sourcePoolCount=audio_count,
            )
            vfx_count = item.get("assetCounts", {}).get("vfx")
            vfx_value = module(
                "native-path-indexed" if vfx_count else None,
                vfx_count,
                "Only character-linked VFX records are counted here; the large native VFX reserve is primarily unlinked and is reported at source-group level.",
            )
        else:
            model_count = counts.get("model")
            motion_count = counts.get("animation")
            converted = item.get("assetCounts", {}).get("convertedCandidateFiles", 0)
            model_value = module(
                "converted-glb-candidate-indexed" if converted else ("extracted-native-indexed" if model_count else None),
                model_count,
                "Linked records may include the native X source and a GLB candidate; conversion does not imply GGD acceptance.",
            )
            texture_value = module(
                "embedded-in-glb-candidate" if converted else None,
                None,
                "MBA conversion reported no missing GLB textures, but the registry has no authoritative per-character texture count.",
            )
            skeleton_value = module(
                None,
                None,
                "GLB motion indexing indicates an animated payload, but no per-character skeleton validation count is claimed without a dedicated receipt.",
            )
            motion_value = module(
                "converted-glb-clips-indexed" if motion_count else None,
                motion_count,
                "Animation clips indexed from the character GLB; six-state semantics and continuous playback remain separate review gates.",
            )
            shared_audio_note = "MBA has 640 playable library audio files, but the registry has no character-to-audio links and no reliable SFX/voice split."
            sfx_value = module(None, None, shared_audio_note)
            voice_value = module(None, None, shared_audio_note)
            vfx_value = module(
                None,
                None,
                "MBA has 423 native VFX/shader records at library scope, with no authoritative per-character mapping in the registry.",
            )

            if character_id in structural:
                model_value = module(
                    "standardized-six-state-candidate-structurally-validated",
                    1,
                    "Deterministic standardized body GLB passed structural validation; owner visual acceptance and hero definition remain pending.",
                )
                motion_value = module(
                    "six-state-candidate-structurally-validated",
                    6,
                    "Native idle/run/attack/cast/hurt/death proposal is structurally valid; semantic and visual playback approval remain pending.",
                )
                texture_value = module(
                    "standardized-component-structurally-validated",
                    1,
                    "The standardized GLB receipt validates one embedded 256px texture for this component.",
                )
                skeleton_value = module(
                    "standardized-component-structurally-validated",
                    1,
                    "The standardized GLB receipt validates one skin; retargeting to a GGD hero remains pending.",
                )
                evidence.append(NATIVE_REL)

            if character_id in reviewed:
                model_value = module(
                    "converted-static-visual-validated-component",
                    1,
                    "Policy, budget, deterministic build, and static front/isometric/back review passed; this is not a complete hero model admission.",
                )
                motion_value = module(
                    "six-native-clips-semantic-review-pending",
                    reviewed[character_id]["motionCount"],
                    "Six native clips are retained, while gameplay playback, semantics, and the D-Down death surrogate remain pending.",
                )
                texture_value = module(
                    "converted-static-visual-validated-component",
                    1,
                    "The component receipt records one 256px texture and accepted static front/isometric/back review; shader parity remains pending.",
                )
                skeleton_value = module(
                    "converted-structurally-validated-component",
                    1,
                    "The component receipt records one skin with no budget error; runtime retargeting is not established.",
                )
                evidence.append(reviewed[character_id]["report"])

        mapped = item.get("mappedHeroIds", [])
        candidates_by_library[library].append(
            {
                "character": item["name"],
                "id": character_id,
                "work": item.get("work"),
                "model": model_value,
                "texture": texture_value,
                "skeleton": skeleton_value,
                "motion": motion_value,
                "vfx": vfx_value,
                "sfx": sfx_value,
                "voice": voice_value,
                "registration": module(
                    "not-registered-as-source-file",
                    pipeline.get("runtimeRegisteredAsSourceFile", 0),
                    "Identity links to GGD heroes do not mean the source module is registered or selectable.",
                    mappedHeroIds=mapped,
                ),
                "deployment": module(
                    "not-deployed",
                    pipeline.get("productionDeployed", 0),
                    "No production deployment is evidenced for this source module.",
                ),
                "evidence": sorted(set(evidence)),
            }
        )

    source_300 = index["sources"]["300heroes"]
    source_mba = index["sources"]["mba"]
    raw_300 = library_summary
    raw_mba = library_summary["magical_battle_arena"]

    return {
        "schema": "ggd.source-module-catalog-fragment@1",
        "sourceGroups": [
            {
                "sourceId": source_300["sourceId"],
                "title": source_300["sourceName"],
                "platform": source_300["platform"],
                "version": source_300["sourceVersion"],
                "status": "extracted-indexed-candidate-library; no source-file registration or deployment",
                "evidencePaths": [
                    INDEX_REL,
                    workspace_evidence(LIBRARY_SUMMARY_REL),
                    workspace_evidence(REGISTRY_REL),
                    workspace_evidence(CHARACTERS_REL),
                ],
                "summary": {
                    "candidateCharacters": len(candidates_by_library["300heroes"]),
                    "nativeFiles": raw_300["raw_files"],
                    "modelIndexRecords": index["summary"]["registryAssetRecords"]["300heroes"]["model"],
                    "textureFiles": raw_300["categories"]["textures-native"],
                    "motionIndexRecords": index["summary"]["registryAssetRecords"]["300heroes"]["animation"],
                    "nativeVfxPathRecords": index["summary"]["native300VfxRecords"],
                    "playableAudioFilesUnclassified": raw_300["playable_audio"],
                    "undecodedAudioFiles": raw_300["undecoded_audio"],
                    "convertedCharacterCandidateFiles": sum(
                        row["pipelineStageCounts"]["convertedCandidate"]
                        for row in index["characters"]
                        if row["sourceCharacterId"].startswith("300heroes:")
                    ),
                    "ggdAcceptedSourceFiles": 0,
                    "registeredSourceFiles": 0,
                    "deployedSourceFiles": 0,
                    "boundary": "Audio counts are not split into SFX/voice; model records include static previews; VFX path records are mostly unlinked reserve.",
                },
                "candidates": candidates_by_library["300heroes"],
            },
            {
                "sourceId": source_mba["sourceId"],
                "title": source_mba["sourceName"],
                "platform": source_mba["platform"],
                "version": source_mba["sourceVersion"],
                "status": "1.60-plus-extracted-and-converted-candidate-library; 1.70 absent; registration and deployment pending",
                "evidencePaths": [
                    INDEX_REL,
                    workspace_evidence(LIBRARY_SUMMARY_REL),
                    workspace_evidence(MBA_VALIDATION_REL),
                    workspace_evidence(REGISTRY_REL),
                    workspace_evidence(CHARACTERS_REL),
                    PILOT_REL,
                    BATCH2_REL,
                    NATIVE_REL,
                ],
                "summary": {
                    "candidateCharacters": len(candidates_by_library["mba"]),
                    "rawFiles": raw_mba["raw_files"],
                    "modelIndexRecords": index["summary"]["registryAssetRecords"]["mba"]["model"],
                    "nativeModelFiles": raw_mba["categories"]["models"],
                    "glbCandidateFiles": raw_mba["glb_models"],
                    "textureFiles": raw_mba["categories"]["textures"],
                    "motionIndexRecords": index["summary"]["registryAssetRecords"]["mba"]["animation"],
                    "nativeVfxRecords": index["summary"]["registryAssetRecords"]["mba"]["vfx"],
                    "playableAudioFilesUnclassified": raw_mba["categories"]["audio"],
                    "convertedCharacterCandidateFiles": sum(
                        row["pipelineStageCounts"]["convertedCandidate"]
                        for row in index["characters"]
                        if row["sourceCharacterId"].startswith("mba:")
                    ),
                    "staticVisualValidatedSixClipComponents": len(reviewed),
                    "structurallyValidatedSixStateCandidates": len(structural),
                    "ggdAcceptedSourceFiles": 0,
                    "registeredSourceFiles": 0,
                    "deployedSourceFiles": 0,
                    "versionBoundary": source_mba["versionLimit"],
                    "boundary": "VFX and audio are library-level reserves without authoritative per-character mapping; audio is not split into SFX/voice.",
                },
                "candidates": candidates_by_library["mba"],
            },
        ],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    fragment = build_fragment()
    expanded = expanded_json_bytes(fragment)
    compact = compact_fragment(
        fragment,
        repo_relative_path=DEFAULT_OUTPUT.relative_to(REPO).as_posix(),
        expanded_bytes=expanded,
    )
    rendered = json.dumps(compact, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if not args.output.exists() or args.output.read_text(encoding="utf-8") != rendered:
            raise SystemExit(f"stale: {args.output}")
        print(f"ok: {args.output}")
        return
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(rendered, encoding="utf-8")
    print(f"wrote: {args.output}")


if __name__ == "__main__":
    main()
