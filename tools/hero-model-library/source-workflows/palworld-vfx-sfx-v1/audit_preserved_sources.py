#!/usr/bin/env python3
"""Audit every locally preserved Palworld model/audio component for the priority three.

This script reads only the existing central Palworld index and its absolute local
paths.  It never opens game PAK/IoStore containers, guesses Wwise events, or
changes runtime bindings.  GLB JSON is parsed to prove what is embedded in the
preserved model containers; model textures and animation names remain separate
from standalone VFX and skill-specific SFX.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
BASE = ROOT / "materials/hero-model-library"
INDEX = BASE / "palworld/帕魯三角色素材索引.json"
INVENTORY = BASE / "source-inventories/palworld-vfx-sfx-v1/inventory.json"
OUT = BASE / "source-inventories/palworld-vfx-sfx-v1/preserved-source-audit.json"
FULL_MOTION_VALIDATION = BASE / "priority-evidence/palworld-full-motion-options-v1/validation.json"
ASTRALYM_VALIDATION = BASE / "priority-evidence/palworld-astralym-full58-decimation-v1/validation.json"
ASSET_SUFFIXES = {
    ".fbx", ".glb", ".viewer-model", ".png", ".webp", ".jpg", ".jpeg",
    ".mp3", ".wav", ".ogg", ".flac", ".json",
}
SOURCE_DIRS = {"original", "decoded", "derived", "standardized", "extracted"}


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def evidence(path: Path, expected: dict | None = None) -> dict:
    if not path.is_file():
        raise FileNotFoundError(path)
    row = {
        "absolutePath": str(path.resolve()),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }
    if expected:
        row["expectedBytes"] = expected.get("bytes")
        row["expectedSha256"] = expected.get("sha256")
        row["bytesVerified"] = row["bytes"] == expected.get("bytes")
        row["sha256Verified"] = row["sha256"] == expected.get("sha256")
        if not row["bytesVerified"] or not row["sha256Verified"]:
            raise ValueError(f"local evidence mismatch: {path}")
    return row


def source_root(path: Path) -> Path | None:
    for parent in (path, *path.parents):
        if parent.name.startswith("parallel-palworld-"):
            return parent
    return None


def glb_document(path: Path) -> tuple[dict, str]:
    raw = path.read_bytes()
    if len(raw) < 20:
        raise ValueError(f"short GLB-like file: {path}")
    magic = raw[:4]
    wrapper = "glb"
    if magic == b"\x01\x01\x01\x01":
        wrapper = "viewer-model-glb-wrapper"
    elif magic != b"glTF":
        raise ValueError(f"unsupported GLB magic {magic!r}: {path}")
    version, total_length = struct.unpack_from("<II", raw, 4)
    if version != 2 or total_length != len(raw):
        raise ValueError(f"invalid GLB header: {path}")
    chunk_length, chunk_type = struct.unpack_from("<II", raw, 12)
    if chunk_type != 0x4E4F534A:
        raise ValueError(f"first GLB chunk is not JSON: {path}")
    doc = json.loads(raw[20 : 20 + chunk_length].rstrip(b" \0"))
    return doc, wrapper


def inspect_model(candidate: dict) -> dict:
    path = Path(candidate["absolutePath"])
    row = {
        "candidateId": candidate["id"],
        "sourceId": candidate["sourceId"],
        "format": candidate["format"],
        "gitPath": candidate.get("gitPath"),
        "componentReady": candidate.get("componentReady") is True,
        "runtimeBindingApproved": False,
        "file": evidence(path, candidate),
    }
    if path.suffix.lower() not in {".glb", ".viewer-model"}:
        row["containerInspection"] = {
            "kind": "fbx-source-container",
            "parsed": False,
            "reason": "FBX bytes are preserved and hashed; GLB-only structural parser does not reinterpret FBX.",
        }
        return row
    doc, wrapper = glb_document(path)
    images = doc.get("images", [])
    animations = doc.get("animations", [])
    channels = [len(item.get("channels", [])) for item in animations]
    embedded = sum(isinstance(item.get("bufferView"), int) for item in images)
    external = sum(isinstance(item.get("uri"), str) and not item["uri"].startswith("data:") for item in images)
    data_uri = sum(isinstance(item.get("uri"), str) and item["uri"].startswith("data:") for item in images)
    emissive_materials = sum("emissiveTexture" in item for item in doc.get("materials", []))
    row["containerInspection"] = {
        "kind": wrapper,
        "parsed": True,
        "meshCount": len(doc.get("meshes", [])),
        "skinCount": len(doc.get("skins", [])),
        "materialCount": len(doc.get("materials", [])),
        "imageCount": len(images),
        "embeddedImageCount": embedded + data_uri,
        "externalImageReferenceCount": external,
        "emissiveMaterialCount": emissive_materials,
        "animationCount": len(animations),
        "animationChannelCountTotal": sum(channels),
        "animationChannelsPerClipMax": max(channels, default=0),
        "standaloneVfxObjectsFound": 0,
        "audioObjectsFound": 0,
        "interpretation": "Images and emissive materials are model appearance resources; animation names and Ring suffixes are not standalone VFX evidence.",
    }
    return row


def relevant_source_files(roots: set[Path]) -> list[dict]:
    rows = []
    for root in sorted(roots, key=str):
        for path in sorted(root.rglob("*"), key=str):
            if not path.is_file() or path.suffix.lower() not in ASSET_SUFFIXES:
                continue
            relative = path.relative_to(root)
            if not relative.parts or relative.parts[0] not in SOURCE_DIRS:
                continue
            role = relative.parts[0]
            if path.name == "materials.json":
                role = "source-material-map"
            rows.append({
                "bundleId": root.name,
                "relativePath": relative.as_posix(),
                "role": role,
                **evidence(path),
            })
    return rows


def build() -> dict:
    index = read(INDEX)
    inventory = read(INVENTORY)
    by_character = {row["id"]: row for row in inventory["characters"]}
    config = read(HERE / "source-config.json")
    full_motion_validation = read(FULL_MOTION_VALIDATION)
    astralym_validation = read(ASTRALYM_VALIDATION)
    relationships = {row["id"]: row.get("motionSkillRelationships", []) for row in config["characters"]}
    model_rows = []
    audio_rows = []
    roots: set[Path] = set()

    for character in index["characters"]:
        for candidate in character["modelCandidates"]:
            model_rows.append({"characterId": character["id"], **inspect_model(candidate)})
            root = source_root(Path(candidate["absolutePath"]))
            if root:
                roots.add(root)
        for item in character["audioFiles"]:
            path = Path(item["absolutePath"])
            root = source_root(path)
            if root:
                roots.add(root)
            selected = evidence(path, item)
            original = None
            if item.get("originalPath") and root:
                original_path = root / item["originalPath"]
                original = evidence(original_path, {
                    "bytes": original_path.stat().st_size,
                    "sha256": item["originalSha256"],
                })
            audio_rows.append({
                "characterId": character["id"],
                "nativeId": character["sourceCode"],
                "sourceId": character["audioSourceId"],
                "sourceLabel": item.get("event") or item.get("label"),
                "classification": "nonverbal-creature-cry",
                "language": "not-applicable-nonverbal",
                "sampleRateHz": item.get("sampleRate"),
                "channels": item.get("channels"),
                "durationSeconds": item.get("durationSeconds", item.get("seconds")),
                "decodeToNullPassed": item.get("decodeToNullPassed", True),
                "selectedFile": selected,
                "originalFile": original,
                "skillCode": None,
                "skillEventVerified": False,
                "ownerReviewStatus": "pending",
                "runtimeBinding": False,
            })

    motion_rows = []
    for character_id, character in by_character.items():
        relation_rows = relationships[character_id]
        for motion in character["sourceSkillMotionCandidates"]:
            relation = next(
                (item for item in relation_rows if motion["clip"].startswith(item["motionPrefix"])),
                None,
            )
            motion_rows.append({
                "characterId": character_id,
                "nativeId": character["nativeId"],
                "clip": motion["clip"],
                "durationSeconds": motion.get("durationSeconds"),
                "animationChannelCount": motion.get("animationChannelCount"),
                "sourceSkillCodeCandidate": relation["skillCode"] if relation else None,
                "relationshipConfidence": relation["confidence"] if relation else "motion-family-only",
                "ownerReviewStatus": "pending",
                "runtimeBinding": False,
            })

    source_files = relevant_source_files(roots)
    parsed_models = [row for row in model_rows if row["containerInspection"]["parsed"]]
    policy_rows = []
    for row in full_motion_validation["rows"]:
        candidate = next(item for item in model_rows if item["candidateId"] == row["componentId"])
        if candidate["file"]["sha256"] != row["file"]["sha256"]:
            raise ValueError(f"policy evidence points at different bytes: {row['componentId']}")
        policy_rows.append({
            "candidateId": row["componentId"],
            "metrics": row["metrics"],
            "budget": row["budget"],
            "khronos": row["khronos"],
            "formalAdoptionEligible": row["formalAdoptionEligible"],
            "policyEvidenceGitPath": FULL_MOTION_VALIDATION.relative_to(ROOT).as_posix(),
            "policyEvidenceSha256": sha256(FULL_MOTION_VALIDATION),
        })
    astralym_candidate_id = "opgg-palworld-astralym-2026081102.full58-256-decimated-v1"
    astralym_candidate = next(item for item in model_rows if item["candidateId"] == astralym_candidate_id)
    if astralym_candidate["file"]["sha256"] != astralym_validation["candidate"]["sha256"]:
        raise ValueError("Astralym policy evidence points at different bytes")
    policy_rows.append({
        "candidateId": astralym_candidate_id,
        "metrics": {
            "triangles": astralym_validation["measured"]["triangles"],
            "meshes": astralym_validation["measured"]["drawPrimitives"],
            "textureCount": len(astralym_validation["measured"]["textures"]),
            "maxTextureEdge": max(max(row["width"], row["height"]) for row in astralym_validation["measured"]["textures"]),
            "clips": len(astralym_validation["measured"]["clips"]),
            "maxClipChannels": max(row["channels"] for row in astralym_validation["measured"]["clips"]),
            "maxClipSeconds": max(row["duration"] for row in astralym_validation["measured"]["clips"]),
        },
        "budget": astralym_validation["budget"],
        "khronos": astralym_validation["khronos"],
        "formalAdoptionEligible": not astralym_validation["budget"]["errors"] and astralym_validation["visual"]["humanReview"]["result"] == "accepted",
        "policyEvidenceGitPath": ASTRALYM_VALIDATION.relative_to(ROOT).as_posix(),
        "policyEvidenceSha256": sha256(ASTRALYM_VALIDATION),
    })
    result = {
        "schema": "ggd.palworld-preserved-source-audit@1",
        "sourceId": inventory["sourceId"],
        "inputFiles": [
            {"gitPath": INDEX.relative_to(ROOT).as_posix(), "sha256": sha256(INDEX)},
            {"gitPath": INVENTORY.relative_to(ROOT).as_posix(), "sha256": sha256(INVENTORY)},
            {"gitPath": (HERE / "source-config.json").relative_to(ROOT).as_posix(), "sha256": sha256(HERE / "source-config.json")},
            {"gitPath": FULL_MOTION_VALIDATION.relative_to(ROOT).as_posix(), "sha256": sha256(FULL_MOTION_VALIDATION)},
            {"gitPath": ASTRALYM_VALIDATION.relative_to(ROOT).as_posix(), "sha256": sha256(ASTRALYM_VALIDATION)},
        ],
        "summary": {
            "characters": 3,
            "nativeIds": 3,
            "distinctSourceSkills": inventory["summary"]["distinctSourceSkills"],
            "preservedSourceBundleRoots": len(roots),
            "sourceAssetFilesHashed": len(source_files),
            "sourceAssetBytesHashed": sum(row["bytes"] for row in source_files),
            "modelCandidateFilesVerified": len(model_rows),
            "modelCandidateBytesVerified": sum(row["file"]["bytes"] for row in model_rows),
            "glbLikeContainersParsed": len(parsed_models),
            "fbxContainersRecorded": len(model_rows) - len(parsed_models),
            "embeddedModelImages": sum(row["containerInspection"]["embeddedImageCount"] for row in parsed_models),
            "externalModelImageReferences": sum(row["containerInspection"]["externalImageReferenceCount"] for row in parsed_models),
            "modelAnimationsAcrossCandidates": sum(row["containerInspection"]["animationCount"] for row in parsed_models),
            "modelAnimationChannelsAcrossCandidates": sum(row["containerInspection"]["animationChannelCountTotal"] for row in parsed_models),
            "sourceSkillMotionCandidates": len(motion_rows),
            "nativeNameStemSkillMotionCandidates": sum(row["relationshipConfidence"] == "native-name-stem-exact" for row in motion_rows),
            "translatedAliasSkillMotionCandidates": sum(row["relationshipConfidence"] == "translated-name-alias-only" for row in motion_rows),
            "genericCryCandidatesVerified": len(audio_rows),
            "genericCrySelectedBytesVerified": sum(row["selectedFile"]["bytes"] for row in audio_rows),
            "currentReviewComponentsPolicyVerified": len(policy_rows),
            "currentReviewComponentsPolicyClean": sum(not row["budget"]["warnings"] and not row["budget"]["errors"] for row in policy_rows),
            "currentReviewComponentsPolicyWarningOnly": sum(bool(row["budget"]["warnings"]) and not row["budget"]["errors"] for row in policy_rows),
            "currentReviewComponentsPolicyHardBlocked": sum(bool(row["budget"]["errors"]) for row in policy_rows),
            "originalGamePakOrIoStoreContainers": 0,
            "extractedUnrealAssetFiles": 0,
            "wwiseBanks": 0,
            "wwiseMedia": 0,
            "standaloneVfxCandidates": 0,
            "skillSpecificSfxCandidates": 0,
            "ownerApprovedBindings": 0,
            "runtimeBindingsAdded": 0,
            "productionDeployed": 0,
        },
        "sourceRoots": [str(path.resolve()) for path in sorted(roots, key=str)],
        "modelContainers": model_rows,
        "sourceAssetFiles": source_files,
        "skillMotionCandidates": motion_rows,
        "audioCandidates": audio_rows,
        "currentReviewComponentPolicy": {
            "dynamicLimits": full_motion_validation["currentPolicy"]["runtimeBudget"],
            "rows": policy_rows,
            "note": "Policy values and verdicts are read from the existing generated validation receipts; this audit does not copy a new independent threshold.",
        },
        "limits": {
            "sourceFilesOnly": True,
            "noNetworkAcquisition": True,
            "noContainerDecryption": True,
            "modelTexturesAreNotStandaloneVfx": True,
            "animationNamesAreNotAudioOrVfx": True,
            "genericCriesAreNotSkillSpecificSfx": True,
            "ownerReviewRequiredBeforeBinding": True,
            "runtimeBindingChanged": False,
            "productionDeploymentVerified": False,
        },
    }
    if len(audio_rows) != 18 or len(motion_rows) != 70:
        raise ValueError("Palworld priority-three source counts changed; review before regenerating")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    expected = json.dumps(build(), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if not OUT.is_file() or OUT.read_text(encoding="utf-8") != expected:
            raise ValueError(f"stale preserved source audit: {OUT}")
    else:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(expected, encoding="utf-8")
    print(json.dumps(json.loads(expected)["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
