#!/usr/bin/env python3
"""Build the blocked SSBU Mario model-option registration preflight.

This preflight deliberately does not create a model@1 document or mutate the
Hero Forge model list.  The five native d01special clips have no approved GGD
semantic mapping, and the possible Linkstik motion donor has no verified
target-side retarget or playback evidence.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
from pathlib import Path
from typing import Any


REPO = Path(__file__).resolve().parents[4]
WORKSPACE = REPO.parent
EVIDENCE_REL = Path(
    "materials/hero-model-library/priority-evidence/ssbu-mario-motion/"
    "28149d8ae2b38abede317ae060de977cd71539c5ca951710c94179e92675c176"
)
EVIDENCE = REPO / EVIDENCE_REL
OUTPUT = EVIDENCE / "model-option-registration.json"
COMPONENT_ID = "ssbu-mario-c00-ultimate14-motion-v1"
HERO_ID = "acquired-mario"
CURRENT_PROXY = "imported.linkstik"
MODEL_SHA256 = "bdb557c348f155e1c931ce226c5a6bbb37aaefb68717df266ab1ed698ca2c526"
GLB_REL = Path(f"content/assets/models/community/{MODEL_SHA256}.glb")
GLB = REPO / GLB_REL
VISUAL_ROOT = WORKSPACE / "GGD-Asset-Library/conversions/ssbu-mario-ultimate14-motion-v1/visual-07"
COMMUNITY_ACQUIRED_REL = Path("packages/shared/src/content/heroForge/communityAcquired.ts")
POLICY_REL = Path("materials/hero-model-library/priority-evidence/current-component-policy-audit.json")
BORROWED_REL = Path("materials/hero-model-library/motion-review/borrowed-motion-candidates.json")
BORROWED_LEAD_ID = "mario-linkstik-to-ssbu-c00-six-state-v1"
NATIVE_CLIPS = [
    "d01specialairsdash",
    "d01specialairsend",
    "d01specialairsjump",
    "d01specialsdash",
    "d01specialsend",
]
REQUIRED_STATES = ["idle", "run", "attack", "cast", "hurt", "death"]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def file_record(relative_path: Path) -> dict[str, Any]:
    path = REPO / relative_path
    require(path.is_file(), f"missing evidence: {relative_path.as_posix()}")
    return {
        "gitPath": relative_path.as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def read_json(relative_path: Path) -> dict[str, Any]:
    return json.loads((REPO / relative_path).read_text())


def glb_animation_names(path: Path) -> list[str]:
    payload = path.read_bytes()
    require(payload[:4] == b"glTF", "component is not a GLB")
    require(struct.unpack_from("<I", payload, 4)[0] == 2, "component GLB version is not 2")
    offset = 12
    while offset + 8 <= len(payload):
        chunk_length, chunk_type = struct.unpack_from("<II", payload, offset)
        offset += 8
        chunk = payload[offset : offset + chunk_length]
        offset += chunk_length
        if chunk_type == 0x4E4F534A:
            doc = json.loads(chunk.decode("utf-8").rstrip(" \t\r\n\0"))
            return [animation.get("name", "") for animation in doc.get("animations", [])]
    raise ValueError("component GLB has no JSON chunk")


def parse_current_selection() -> tuple[list[str], str]:
    source = (REPO / COMMUNITY_ACQUIRED_REL).read_text()
    options_match = re.search(r'"acquired-mario"\s*:\s*\[([^\]]*)\]', source)
    proxy_match = re.search(r'"acquired-mario"\s*:\s*"([^"]+)"', source)
    require(options_match is not None, "acquired-mario model options are missing")
    require(proxy_match is not None, "acquired-mario proxy model is missing")
    options = re.findall(r'"([^"]+)"', options_match.group(1))
    return options, proxy_match.group(1)


def reserved_model_id() -> str:
    digest = hashlib.sha256(f"{COMPONENT_ID}:{MODEL_SHA256}".encode()).hexdigest()
    value = f"community.body.{digest[:48]}"
    require(len(value) <= 64, "reserved model id exceeds 64 characters")
    return value


def build_receipt() -> dict[str, Any]:
    require(GLB.is_file(), f"missing component: {GLB_REL.as_posix()}")
    require(GLB.stat().st_size == 1_148_100, "component byte count changed")
    require(sha256(GLB) == MODEL_SHA256, "component SHA-256 changed")
    require(glb_animation_names(GLB) == NATIVE_CLIPS, "native clip set or ordering changed")

    options, proxy = parse_current_selection()
    require(options == [CURRENT_PROXY], "acquired-mario existing model options changed")
    require(proxy == CURRENT_PROXY, "acquired-mario existing proxy/default changed")
    require(COMPONENT_ID not in options, "component id must not be registered as a runtime model")

    policy = read_json(POLICY_REL)
    policy_record = next((row for row in policy.get("records", []) if row.get("id") == COMPONENT_ID), None)
    require(policy_record is not None, "component policy record is missing")
    require(policy_record.get("sha256") == MODEL_SHA256, "policy record model hash changed")
    require(policy_record.get("metrics", {}).get("triangles") == 7_189, "triangle count changed")
    require(policy_record.get("runtimeBudget", {}).get("pass") is True, "runtime budget does not pass")
    adoption = policy_record.get("formalHeroAdoption", {})
    require(adoption.get("eligible") is True, "formal adoption geometry policy is not eligible")
    require(adoption.get("requiresDecimatedCandidate") is False, "unexpected decimation requirement")

    validation = read_json(EVIDENCE_REL / "validation.json")
    require(validation.get("glb", {}).get("sha256") == MODEL_SHA256, "validation model hash changed")
    issues = validation.get("khronosIssues", {})
    require(issues.get("numErrors") == 0 and issues.get("numWarnings") == 0, "Khronos gate is not clean")
    require(validation.get("structuralValidationPassed") is True, "structural validation is not passing")
    require(validation.get("completeGameplayActionSet") is False, "component was unexpectedly labeled complete")
    require(validation.get("runtimeSelectable") is False, "component was unexpectedly labeled selectable")
    checks = validation.get("animationChecks", [])
    require([row.get("name") for row in checks] == NATIVE_CLIPS, "animation validation set changed")
    require(all(row.get("channelCount") == 294 for row in checks), "animation channel count changed")
    require(all(row.get("targetedJointCount") == 98 for row in checks), "animation joint coverage changed")

    visual = read_json(EVIDENCE_REL / "visual-review.json")
    require(visual.get("accepted") is True, "component visual review is not accepted")
    require(visual.get("scope") == "independent-skinned-model-motion-component", "visual scope changed")
    require(visual.get("modelSha256") == MODEL_SHA256, "visual review model hash changed")
    screenshots = visual.get("screenshots", [])
    require(len(screenshots) == 15, "visual review must pin 15 screenshots")
    local_visual: list[dict[str, Any]] = []
    for screenshot in screenshots:
        path = VISUAL_ROOT / Path(screenshot["gitPath"]).name
        require(path.is_file(), f"missing local visual sample: {path}")
        require(path.stat().st_size == screenshot["bytes"], f"visual byte count changed: {path.name}")
        require(sha256(path) == screenshot["sha256"], f"visual SHA-256 changed: {path.name}")
        local_visual.append({
            "absolutePath": str(path.resolve()),
            "bytes": path.stat().st_size,
            "sha256": screenshot["sha256"],
        })

    borrowed = read_json(BORROWED_REL)
    lead = next((row for row in borrowed.get("blockedLeads", []) if row.get("id") == BORROWED_LEAD_ID), None)
    require(lead is not None, "Mario borrowed-motion blocked lead is missing")
    require(lead.get("playableReviewEligible") is False, "unverified Mario retarget cannot be playable")
    require(bool(lead.get("blockers")), "Mario borrowed-motion blockers are missing")
    playable_for_mario = [
        row for row in borrowed.get("candidates", [])
        if row.get("target", {}).get("heroId") == HERO_ID
    ]
    require(not playable_for_mario, "Mario cannot have a playable borrowed candidate without verified evidence")

    model_id = reserved_model_id()
    model_doc = Path(f"content/models/{model_id}.json")
    require(not (REPO / model_doc).exists(), "blocked preflight must not create a model@1 document")
    return {
        "schema": "ggd.ssbu-mario-model-option-preflight@1",
        "status": "blocked-not-registered",
        "scope": "local evidence preflight only; no model registration, hero mutation or deployment",
        "hero": {
            "id": HERO_ID,
            "existingSelection": {
                "modelOptions": options,
                "proxyModel": proxy,
                "manualOrProxyDefaultPreserved": True,
            },
        },
        "proposedOption": {
            "componentId": COMPONENT_ID,
            "reservedModelId": model_id,
            "reservedModelIdLength": len(model_id),
            "modelDocumentPath": model_doc.as_posix(),
            "modelDocumentCreated": False,
            "default": False,
            "glb": file_record(GLB_REL),
            "triangles": 7_189,
            "drawPrimitives": 6,
            "joints": 98,
            "nativeClips": NATIVE_CLIPS,
            "nativeClipClassification": "SSBU Ultimate14 community MOD native special-action clips",
            "approvedSemanticMapping": {},
            "requiredSemanticStates": REQUIRED_STATES,
            "semanticMappingStatus": "absent-for-all-six-required-states",
        },
        "validation": {
            "runtimeBudgetPass": True,
            "runtimeBudgetVerdict": policy_record["runtimeBudget"]["verdict"],
            "formalHeroAdoptionEligible": True,
            "decimationRequired": False,
            "khronosErrors": 0,
            "khronosWarnings": 0,
            "structuralAnimationValidationPassed": True,
            "visualReviewAcceptedForIndependentComponent": True,
            "visualSamplesReadBack": len(local_visual),
            "localVisualEvidence": local_visual,
        },
        "borrowedMotion": {
            "blockedLeadId": BORROWED_LEAD_ID,
            "playableReviewEligible": False,
            "compatiblePlayableCandidates": 0,
            "skeletonCompatibility": lead["skeletonCompatibility"],
            "blockers": lead["blockers"],
        },
        "contentIntake": {
            "schema": "model@1",
            "schemaIntakeAttempted": False,
            "bundleIntakeAttempted": False,
            "reason": "model@1 requires an approved six-state clipMap; none exists for this component",
        },
        "blockers": [
            "No approved mapping exists for idle, run, attack, cast, hurt or death.",
            "The five d01special* clips are special actions and cannot be relabeled as idle, hurt or death.",
            "No compatible borrowed or retargeted motion candidate has a verified skeleton map and target-side playback evidence.",
            "No model@1 document may be created until the semantic action contract is satisfied.",
        ],
        "result": {
            "runtimeDropdownRegistered": False,
            "optionListChanged": False,
            "defaultChanged": False,
            "heroConfigChanged": False,
            "runtimeSelectable": False,
            "productionDeployed": False,
        },
        "sources": [
            file_record(COMMUNITY_ACQUIRED_REL),
            file_record(POLICY_REL),
            file_record(EVIDENCE_REL / "validation.json"),
            file_record(EVIDENCE_REL / "visual-review.json"),
            file_record(EVIDENCE_REL / "webgl-proof.json"),
            file_record(BORROWED_REL),
        ],
    }


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()
    rendered = canonical_json(build_receipt())
    if args.write:
        OUTPUT.write_text(rendered)
        print(f"wrote {OUTPUT.relative_to(REPO)}")
        return 0
    require(OUTPUT.is_file(), f"missing generated receipt: {OUTPUT.relative_to(REPO)}")
    require(OUTPUT.read_text() == rendered, "generated receipt is stale; run with --write")
    print(f"verified {OUTPUT.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
