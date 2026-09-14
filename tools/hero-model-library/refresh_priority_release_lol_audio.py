#!/usr/bin/env python3
"""Refresh audited LoL audio and Kaiji runtime projections in priority-release.

The priority release ledger is an integration summary, while the listening queue,
runtime registration, and runtime audit are the authority for the fixed seven-hero
battle subset.  Kaiji's original raw-delivery line is likewise distinct from its
later converted and registered runtime candidate.  This tool only synchronizes
those derived summaries.  It never approves additional clips, changes a runtime
asset, or asserts production deploy.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
PRIORITY_RELEASE = REPO / "materials/hero-model-library/priority-release.json"
LOL_ROOT = REPO / "materials/hero-model-library/lol-project-seven"
REGISTRATION = LOL_ROOT / "runtime-registration.json"
AUDIT = LOL_ROOT / "runtime-audit.json"
QUEUE = LOL_ROOT / "listening-review-queue.json"
KAIJI_ROOT = REPO / "materials/hero-model-library/priority-evidence/kaiji-community"
KAIJI_RECEIPT = KAIJI_ROOT / "receipt.json"
KAIJI_REGISTRATION = KAIJI_ROOT / "registration.json"
KAIJI_READBACK = KAIJI_ROOT / "registration-readback.json"
RUNTIME_OPTIONS = REPO / "materials/hero-model-library/priority-runtime-options.json"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def projection(
    registration: dict,
    audit: dict,
    queue: dict,
) -> dict:
    registration_summary = registration.get("summary", {})
    audit_summary = audit.get("summary", {})
    queue_summary = queue.get("summary", {})
    expected = 311
    if registration.get("schema") != "ggd-lol-approved-battle-runtime-registration@1":
        raise ValueError("unexpected LoL runtime registration schema")
    if audit.get("schema") != "ggd-lol-seven-approved-runtime-audit@1":
        raise ValueError("unexpected LoL runtime audit schema")
    if queue.get("schema") != "ggd-lol-listening-review-queue@1":
        raise ValueError("unexpected LoL listening queue schema")
    values = {
        "registration approved": registration_summary.get("approved"),
        "registration runtimeRegistered": registration_summary.get("runtimeRegistered"),
        "audit approvedSourceWavsVerified": audit_summary.get("approvedSourceWavsVerified"),
        "audit runtimeMp3sVerified": audit_summary.get("runtimeMp3sVerified"),
        "audit runtimeGitBlobsVerified": audit_summary.get("runtimeGitBlobsVerified"),
        "audit runtimeManifestRowsVerified": audit_summary.get("runtimeManifestRowsVerified"),
        "queue battleReviewCandidates": queue_summary.get("battleReviewCandidates"),
        "queue runtimeApproved": queue_summary.get("runtimeApproved"),
    }
    mismatched = {key: value for key, value in values.items() if value != expected}
    if mismatched:
        raise ValueError(f"LoL fixed battle subset drift: {mismatched}")
    status = audit.get("status", {})
    if not all(status.get(key) is True for key in ("acquired", "converted", "ownerReviewed", "runtimeRegistered", "branchSelectable")):
        raise ValueError("LoL runtime audit no longer proves reviewed branch registration")
    if registration_summary.get("productionDeployed") is not False or audit_summary.get("productionDeployed") is not False:
        raise ValueError("LoL production deployment status must remain explicit")
    return {
        "state": "owner-reviewed-runtime-registered-feature-branch-production-deployment-pending",
        "scopedHeroes": 7,
        "approvedAndRuntimeRegisteredClips": expected,
        "pendingOtherEventBoundWavs": audit_summary.get("pendingOtherEventBoundWavs"),
        "productionDeployed": False,
        "registrationEvidence": "lol-project-seven/runtime-registration.json",
        "auditEvidence": "lol-project-seven/runtime-audit.json",
        "queueEvidence": "lol-project-seven/listening-review-queue.json",
    }


def kaiji_projection(receipt: dict, registration: dict, readback: dict, runtime_options: dict) -> dict:
    """Prove the converted Kaiji candidate supersedes stale raw-intake flags."""
    candidate_id = "kaiji-holya-procedural-six-state-v1"
    hero_id = "b2-kaiji"
    if receipt.get("schema") != "ggd-kaiji-runtime-delivery@1":
        raise ValueError("unexpected Kaiji runtime receipt schema")
    if registration.get("schema") != "ggd-model-library-registration@1":
        raise ValueError("unexpected Kaiji registration schema")
    if readback.get("schema") != "ggd-kaiji-registration-readback@1":
        raise ValueError("unexpected Kaiji registration readback schema")
    if receipt.get("candidateId") != candidate_id or receipt.get("heroId") != hero_id:
        raise ValueError("Kaiji receipt identity drift")
    if receipt.get("readiness") != "registered-runtime-option" or receipt.get("backendSelectionVerified") is not True:
        raise ValueError("Kaiji receipt no longer proves branch registration")
    if receipt.get("productionDeployed") is not False or readback.get("productionDeployed") is not False:
        raise ValueError("Kaiji production deployment status must remain explicit")
    hero = next((row for row in registration.get("heroes", []) if row.get("id") == hero_id), None)
    if not hero or f"runtime:{candidate_id}" not in hero.get("registered", []) or hero.get("pending"):
        raise ValueError("Kaiji registration no longer contains the completed runtime candidate")
    if hero.get("state", {}).get("activeModelKey") != receipt.get("activeModelKey"):
        raise ValueError("Kaiji active model differs between registration and receipt")
    if readback.get("activeModelKey") != receipt.get("activeModelKey"):
        raise ValueError("Kaiji readback active model differs from receipt")
    runtime = next((row for row in runtime_options.get("models", []) if row.get("id") == f"runtime:{candidate_id}"), None)
    if not runtime or runtime.get("modelKey") != receipt.get("runtimeModelKey") or runtime.get("sha256") != receipt.get("sha256"):
        raise ValueError("Kaiji runtime option differs from receipt")
    if runtime.get("nativeAnimationCount") != 0 or runtime.get("proceduralAnimationCount") != 6:
        raise ValueError("Kaiji motion provenance drift")
    return {
        "state": "model-converted-procedural-motion-runtime-registered-feature-branch-production-deployment-pending",
        "heroId": hero_id,
        "candidateId": candidate_id,
        "activeModelKey": receipt["activeModelKey"],
        "nativeAnimationCount": 0,
        "proceduralAnimationCount": 6,
        "sourceAudioCount": receipt.get("audioCount"),
        "sourceVfxCount": receipt.get("vfxCount"),
        "productionDeployed": False,
        "receiptEvidence": "priority-evidence/kaiji-community/receipt.json",
        "registrationEvidence": "priority-evidence/kaiji-community/registration.json",
        "readbackEvidence": "priority-evidence/kaiji-community/registration-readback.json",
        "runtimeOptionEvidence": "priority-runtime-options.json",
    }
def build(
    priority_release: dict,
    registration: dict,
    audit: dict,
    queue: dict,
    kaiji_receipt: dict,
    kaiji_registration: dict,
    kaiji_readback: dict,
    runtime_options: dict,
) -> dict:
    result = json.loads(json.dumps(priority_release))
    audio = result.setdefault("audio", {})
    audio["projectSevenRuntimeCombatBinding"] = projection(registration, audit, queue)
    other_workflows = result.setdefault("otherWorkflows", {})
    kaiji = kaiji_projection(kaiji_receipt, kaiji_registration, kaiji_readback, runtime_options)
    # The raw source entry remains useful evidence, but these arrays describe
    # current integration state and must not claim a now-registered model is
    # pending conversion or still an engine placeholder.
    for key in ("newLocalBodyPendingConversion", "stillUsingPriorPlaceholder"):
        other_workflows[key] = [value for value in other_workflows.get(key, []) if value != kaiji["heroId"]]
    other_workflows["kaijiRuntimeIntegration"] = kaiji
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    result = build(
        read(PRIORITY_RELEASE), read(REGISTRATION), read(AUDIT), read(QUEUE),
        read(KAIJI_RECEIPT), read(KAIJI_REGISTRATION), read(KAIJI_READBACK), read(RUNTIME_OPTIONS),
    )
    payload = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if PRIORITY_RELEASE.read_text(encoding="utf-8") != payload:
            raise SystemExit(f"STALE {PRIORITY_RELEASE.relative_to(REPO)}")
    else:
        PRIORITY_RELEASE.write_text(payload, encoding="utf-8")
    print(json.dumps({
        "check": args.check,
        "projectSevenRuntimeCombatBinding": result["audio"]["projectSevenRuntimeCombatBinding"],
        "kaijiRuntimeIntegration": result["otherWorkflows"]["kaijiRuntimeIntegration"],
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
