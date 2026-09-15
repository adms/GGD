"""Project tracked FateUBW completion receipts into the portable design backlog.

The large source audits are intentionally local caches.  This overlay only
accepts the tracked download source registry and pinned Git receipts, and
fails closed when their identities, counts, bytes, hashes, or S3 readback
claims disagree.
"""

from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
from typing import Any


SOURCE_ID = "github-flemmli97-fateubw-07e9d79b"
FAMILY_ID = "fateubw-community"
CHARACTERS = {
    "artoria_pendragon_saber", "cu_chulainn_lancer",
    "diarmuid_ua_duibhne_lancer", "emiya_archer", "gilgamesh_archer",
    "gilles_de_rais_caster", "hassan-i-sabbah_assassin",
    "heracles_berserker", "iskander_rider", "lancelot_berserker",
    "medea_caster", "medusa_rider", "nero_claudius_saber",
    "sasaki_kojiro_assassin",
}
LOCAL_CACHE_INPUTS = {
    "materials/hero-model-library/design-backlog/sources-300-mba.json",
    "materials/hero-model-library/design-backlog/sources-community.json",
    "materials/hero-model-library/design-backlog/resource-coverage.json",
}
RECEIPTS = {
    "native": "materials/hero-model-library/priority-evidence/fateubw-community/native-motion-completion-v2.json",
    "nativeBackup": "materials/hero-model-library/priority-evidence/fateubw-community/native-motion-completion-v2-s3-backup.json",
    "derivative": "materials/hero-model-library/priority-evidence/fateubw-community/static-pose-derivatives-v1/batch-manifest.json",
    "derivativeValidation": "materials/hero-model-library/priority-evidence/fateubw-community/static-pose-derivatives-v1/validation.json",
    "derivativeBackup": "materials/hero-model-library/priority-evidence/fateubw-community/static-pose-derivatives-v1/s3-backup-receipt.json",
}


def _read(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError("FateUBW backlog overlay rejected: " + message)


def _verified_backup(value: dict[str, Any], *, label: str) -> None:
    _require(value.get("s3Uri", "").startswith(
        "s3://ggd-390630837668-ap-east-2-an/legacy/"), label + " S3 URI drift")
    _require(value.get("fullGetVerified") is True, label + " full GET is not verified")
    _require(value.get("allMemberSha256Verified") is True,
             label + " member hashes are not verified")


def _candidate_base(source: dict[str, Any], attempt: dict[str, Any]) -> dict[str, Any]:
    body = attempt["body"]
    return {
        "path": body["path"],
        "existsLocal": True,
        "bytes": body["bytes"],
        "sha256": body["sha256"],
        "sha256Status": "pinned Git receipt plus verified S3 full readback",
        "magicHex": "676c544602000000",
        "library": "community",
        "sourceId": SOURCE_ID,
        "sourceUrl": source["url"],
        "converted": True,
        "format": "glTF Binary",
        "componentReady": False,
        "runtimeSelectable": False,
        "defaultEligible": False,
        "fullHeroModel": False,
        "identityReviewRequired": False,
        "recordedBytes": body["bytes"],
        "sizeMatchesManifest": True,
        "absolutePath": body["path"],
        "localSizeMatches": True,
    }


def _native_candidate(source: dict[str, Any], attempt: dict[str, Any]) -> dict[str, Any]:
    animations = attempt["nativeAnimations"]
    backup = attempt["backup"]
    candidate = _candidate_base(source, attempt)
    candidate.update({
        "id": attempt["id"],
        "readiness": attempt["status"],
        "resourceRole": "character-body",
        "isStandaloneModelCandidate": True,
        "sourceAnimationCount": animations["sourceClipCount"],
        "nativeAnimationCount": animations["convertedClipCount"],
        "unconvertedAnimationCount": animations["unconvertedClipCount"],
        "proceduralAnimationCount": len(animations["newlyConvertedFormulaOrPrePostClips"]),
        "animationProvenance": "community-mod-native-with-bounded-formula-baking",
        "limitations": list(attempt["missing"]),
        "validationEvidence": {
            "converterReport": attempt["converterReport"],
            "structuralReadback": attempt["structuralReadback"],
            "contractValidation": attempt["contractValidation"],
            "completionReceipt": attempt["completionEvidence"],
        },
        "visualEvidence": {"webglNewCurveReview": attempt["webglNewCurveReview"]},
        "s3Uri": backup["s3Uri"],
        "s3ArchiveMember": attempt["candidateId"] + "/body.glb",
        "archiveSha256": backup["archiveSha256"],
        "readbackVerified": True,
    })
    return candidate


def _derivative_candidate(source: dict[str, Any], attempt: dict[str, Any]) -> dict[str, Any]:
    backup = attempt["s3Backup"]
    candidate = _candidate_base(source, attempt)
    candidate.update({
        "id": attempt["id"],
        "readiness": attempt["status"],
        "resourceRole": "independent-skinned-model-motion-component",
        "isStandaloneModelCandidate": False,
        "sourceAnimationCount": 1,
        "nativeAnimationCount": 0,
        "unconvertedAnimationCount": 0,
        "proceduralAnimationCount": 1,
        "animationClipCount": 1,
        "animationProvenance": attempt["classification"],
        "sourceClip": attempt["sourceClip"],
        "derivedClip": attempt["derivedClip"],
        "durationSeconds": attempt["durationSeconds"],
        "sourceAnimationLengthProvided": False,
        "nativeDurationClaim": False,
        "limitations": [
            "derived motion; not a native-duration source clip",
            "owner visual approval pending",
            "redistribution permission for ARR source",
            "GGD action/event mapping and backend selection",
        ],
        "validationEvidence": {"derivativeReport": attempt["report"]},
        "visualEvidence": {"visuallyOwnerApproved": False},
        "s3Uri": backup["s3Uri"],
        "s3ArchiveMember": attempt["candidateId"] + "/body.glb",
        "archiveSha256": backup["archiveSha256"],
        "readbackVerified": True,
    })
    return candidate


def _validate_inputs(repo: Path) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    source_path = repo / "materials/hero-model-library/download-sources.json"
    source_doc = _read(source_path)
    sources = [row for row in source_doc["publicSources"] if row["id"] == SOURCE_ID]
    _require(len(sources) == 1, "download source identity must occur exactly once")
    source = sources[0]
    native = _read(repo / RECEIPTS["native"])
    native_backup = _read(repo / RECEIPTS["nativeBackup"])
    derivative = _read(repo / RECEIPTS["derivative"])
    derivative_validation = _read(repo / RECEIPTS["derivativeValidation"])
    derivative_backup = _read(repo / RECEIPTS["derivativeBackup"])

    _require(native.get("schema") == "ggd-fateubw-native-motion-completion@1",
             "native receipt schema drift")
    _require(derivative.get("schema") == "ggd-fateubw-static-pose-derivative-batch@1",
             "derivative receipt schema drift")
    _require(derivative_validation.get("schema") ==
             "ggd-fateubw-static-pose-derivative-validation@1",
             "derivative validation schema drift")
    for receipt in (native, derivative):
        _require(receipt.get("sourceId") == SOURCE_ID, "receipt source ID drift")
        _require(receipt.get("sourceCommit") == source["sourceCommit"],
                 "receipt source commit drift")
    _require(native["summary"]["servants"] == 14, "native servant count must be 14")
    _require(native["summary"]["sourceClips"] == 132, "source clip count must be 132")
    _require(native["summary"]["convertedNativeClips"] == 127,
             "native clip count must be 127")
    _require(native["summary"]["retainedNoDurationSourcePoses"] == 5,
             "durationless source count must be 5")
    _verified_backup(native_backup, label="native")
    _verified_backup(derivative_backup, label="derivative")
    _require(native["s3Backup"]["archiveSha256"] == native_backup["archiveSha256"],
             "native archive receipt mismatch")
    _require(derivative["counts"] == {
        "candidates": 5, "staticPoseHolds": 3,
        "proceduralFormulaLoops": 2, "nativeDurationClips": 0,
    }, "derivative counts drift")

    servant_sources = {
        row["candidateId"]: row for row in source["modelCandidates"]
        if "/servant/" in row.get("sourceModel", "")
    }
    expected_ids = {"fateubw-" + name for name in CHARACTERS}
    _require(set(servant_sources) == expected_ids, "reviewed servant identity set drift")
    completion_by_id = {row["candidateId"]: row for row in native["candidates"]}
    _require(set(completion_by_id) == expected_ids, "native completion identity set drift")
    attempts = {row["id"]: row for row in source["conversionAttempts"]}
    derivative_records = {row["candidateId"]: row for row in derivative["records"]}
    validation_records = {row["candidateId"]: row
                          for row in derivative_validation["records"]}
    _require(set(derivative_records) == set(validation_records),
             "derivative manifest and validation identities differ")
    _require(set(derivative_records) == {
        "fateubw-cu_chulainn_lancer", "fateubw-diarmuid_ua_duibhne_lancer",
        "fateubw-heracles_berserker", "fateubw-medea_caster",
        "fateubw-sasaki_kojiro_assassin",
    }, "durationless derivative identity set drift")

    for candidate_id, completion in completion_by_id.items():
        meta = servant_sources[candidate_id]["nativeMotionStandardization"]
        attempt = attempts.get(meta["attemptId"])
        _require(attempt is not None, candidate_id + " current native attempt missing")
        _require(attempt["candidateId"] == candidate_id, candidate_id + " attempt identity drift")
        _require(attempt["body"] == completion["body"], candidate_id + " body receipt mismatch")
        _require(attempt["nativeAnimations"]["convertedClipCount"] ==
                 completion["convertedNativeClipCount"], candidate_id + " clip count mismatch")
        _require(attempt["runtimeReady"] is False and
                 attempt["backendSelectionVerified"] is False and
                 attempt["defaultEligible"] is False,
                 candidate_id + " release boundary drift")
        _verified_backup(attempt["backup"], label=candidate_id)
    for candidate_id, record in derivative_records.items():
        attempt_id = candidate_id + "-durationless-derivative-v1"
        attempt = attempts.get(attempt_id)
        _require(attempt is not None, candidate_id + " derivative attempt missing")
        _require(attempt["body"]["sha256"] == record["sha256"] and
                 attempt["body"]["bytes"] == record["bytes"],
                 candidate_id + " derivative body receipt mismatch")
        validation = validation_records[candidate_id]
        _require(validation["sha256"] == record["sha256"] and
                 validation["bytes"] == record["bytes"],
                 candidate_id + " derivative validation mismatch")
        _require(attempt["sourceAnimationLengthProvided"] is False and
                 attempt["nativeDurationClaim"] is False and
                 attempt["runtimeReady"] is False,
                 candidate_id + " derivative boundary drift")
        _verified_backup(attempt["s3Backup"], label=candidate_id + " derivative")
    return source, attempts, native


def apply_fateubw_overlay(data: dict[str, Any], repo: Path) -> dict[str, Any]:
    """Return a deterministic backlog with 14 v2 native and five derivatives."""
    result = copy.deepcopy(data)
    source, attempts, native = _validate_inputs(repo)
    rows_by_candidate: dict[str, dict[str, Any]] = {}
    for row in result["characters"]:
        for candidate in row.get("modelCandidates", []):
            if candidate.get("sourceId") == SOURCE_ID and candidate["id"].endswith(":0"):
                rows_by_candidate[candidate["id"][:-2]] = row
    _require(set(rows_by_candidate) == {"fateubw-" + name for name in CHARACTERS},
             "portable backlog lacks the reviewed 14 servant source rows")

    overlay_ids = {
        attempt_id for attempt_id in attempts
        if attempt_id.endswith("-native-motion-completion-v2")
        or attempt_id.endswith("-durationless-derivative-v1")
    }
    for candidate_id, row in rows_by_candidate.items():
        candidates = [c for c in row["modelCandidates"] if c["id"] not in overlay_ids]
        source_candidate = next(c for c in source["modelCandidates"]
                                if c["candidateId"] == candidate_id)
        native_attempt = attempts[source_candidate["nativeMotionStandardization"]["attemptId"]]
        candidates.append(_native_candidate(source, native_attempt))
        derivative_id = candidate_id + "-durationless-derivative-v1"
        if derivative_id in attempts:
            candidates.append(_derivative_candidate(source, attempts[derivative_id]))
        row["modelCandidates"] = candidates
        bodies = sum(c.get("resourceRole") in {
            "character-body", "character-body-costume", "character-body-mesh-source"
        } for c in candidates)
        row["candidateBreakdown"] = {
            "characterBodySources": bodies,
            "standaloneCharacterBodies": sum(c.get("isStandaloneModelCandidate") is True
                                             for c in candidates),
            "componentsOrProps": sum(c.get("resourceRole") ==
                                     "independent-skinned-model-motion-component"
                                     for c in candidates),
            "sharedContainers": 0,
            "otherCandidateFiles": 0,
        }
        converted = native_attempt["nativeAnimations"]["convertedClipCount"]
        unconverted = native_attempt["nativeAnimations"]["unconvertedClipCount"]
        derivative = derivative_id in attempts
        row["resources"]["motion"] = (
            f"來源 {native_attempt['nativeAnimations']['sourceClipCount']} 個片段；"
            f"已轉換 {converted} 個原生動作"
            + (f"；{unconverted} 個無來源時長片段另建標示清楚的衍生動作"
               if derivative else "")
            + "；待來源引擎曲線比對、事件映射、權利與後台驗收"
        )
        row["resources"]["motionCandidateCounts"] = [
            {
                "candidateId": c["id"],
                "count": c.get("nativeAnimationCount", c.get("animationClipCount", 0)),
                "sourceCount": c.get("sourceAnimationCount"),
                "unconvertedCount": c.get("unconvertedAnimationCount"),
                "provenance": c.get("animationProvenance"),
                "readiness": c.get("readiness"),
                "evidence": "existing-candidate-metadata; not runtime acceptance",
            }
            for c in candidates if isinstance(c.get("nativeAnimationCount",
                                                    c.get("animationClipCount")), int)
        ]
        paths = row["resources"].setdefault("evidencePaths", [])
        for path in [RECEIPTS["native"], RECEIPTS["nativeBackup"],
                     RECEIPTS["derivative"], RECEIPTS["derivativeValidation"],
                     RECEIPTS["derivativeBackup"]]:
            if path not in paths:
                paths.append(path)

    family = next((row for row in result["resourceCoverage"]["sourceFamilies"]
                   if row["id"] == FAMILY_ID), None)
    _require(family is not None, "embedded FateUBW resource family missing")
    family["model"] = (
        "14名英靈皆保留靜態GLB、舊原生動作GLB及目前native-v2骨架動作GLB；"
        "5個道具／生物仍保留原始幾何JSON。全部待權利、來源引擎比對、事件映射與後台驗收。"
    )
    family["motion"] = (
        "14名英靈合計132項來源動作：127項已轉換原生動作，"
        "5項未提供來源時長的姿勢已另建3項靜態姿勢保持與2項程序公式循環；"
        "衍生動作不宣稱原生時長。另5個道具／生物20項及共用4項仍為原始格式；非FUC PSP。"
    )

    input_paths = {row["path"]: row for row in result.get("inputs", [])
                   if row["path"] not in LOCAL_CACHE_INPUTS}
    tracked_inputs = ["materials/hero-model-library/download-sources.json", *RECEIPTS.values()]
    for relative in tracked_inputs:
        path = repo / relative
        _require(path.is_file(), relative + " is missing")
        input_paths[relative] = {"path": relative, "sha256": _sha(path)}
    result["inputs"] = list(input_paths.values())
    result["portableOverlay"] = {
        "schema": "ggd-fateubw-backlog-overlay@1",
        "sourceId": SOURCE_ID,
        "nativeCandidates": 14,
        "convertedNativeClips": native["summary"]["convertedNativeClips"],
        "derivedCandidates": 5,
        "nativeDurationClaimForDerivatives": False,
        "runtimeSelectable": False,
        "inputs": tracked_inputs,
        "base": "non-Fate rows are retained from the tracked generated backlog when local audit caches are absent",
    }
    return result
