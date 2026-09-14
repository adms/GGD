#!/usr/bin/env python3
"""Refresh the audited LoL seven-hero battle-audio projection in priority-release.

The priority release ledger is an integration summary, while the listening queue,
runtime registration, and runtime audit are the authority for the fixed seven-hero
battle subset.  This tool only synchronizes that derived summary.  It never
approves additional clips, changes a runtime asset, or asserts production deploy.
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


def build(priority_release: dict, registration: dict, audit: dict, queue: dict) -> dict:
    result = json.loads(json.dumps(priority_release))
    audio = result.setdefault("audio", {})
    audio["projectSevenRuntimeCombatBinding"] = projection(registration, audit, queue)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    result = build(read(PRIORITY_RELEASE), read(REGISTRATION), read(AUDIT), read(QUEUE))
    payload = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if PRIORITY_RELEASE.read_text(encoding="utf-8") != payload:
            raise SystemExit(f"STALE {PRIORITY_RELEASE.relative_to(REPO)}")
    else:
        PRIORITY_RELEASE.write_text(payload, encoding="utf-8")
    print(json.dumps({"check": args.check, "projectSevenRuntimeCombatBinding": result["audio"]["projectSevenRuntimeCombatBinding"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
