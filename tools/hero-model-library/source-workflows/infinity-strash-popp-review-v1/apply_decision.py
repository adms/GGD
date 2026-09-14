#!/usr/bin/env python3
"""Validate and apply the owner-exported Popp weapon/death decision."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
LIBRARY = ROOT / "materials/hero-model-library"
CONTRACT_PATH = LIBRARY / "infinity-strash/popp-integration-review.json"
DECISION_PATH = LIBRARY / "priority-evidence/infinity-strash-popp-review-decision/popp-integration-review-decision.json"
CONTRACT_SNAPSHOT_PATH = LIBRARY / "priority-evidence/infinity-strash-popp-review-decision/contract-at-decision.json"
RECEIPT_PATH = LIBRARY / "priority-evidence/infinity-strash-popp-review-decision/receipt.json"
CHAMPION_PATH = ROOT / "content/champions/b2-popp.json"
DEATH_RUNTIME_PATHS = (
    ROOT / "apps/client/src/render/deathDissolve.ts",
    ROOT / "apps/client/src/render/deathDissolve.test.ts",
    ROOT / "apps/client/src/render/views/ChampionView.ts",
    ROOT / "apps/client/src/render/views/ChampionView.test.ts",
)


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def evidence(path: Path) -> dict:
    return {
        "gitPath": path.relative_to(ROOT).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def validate_decision(decision: dict, contract: dict, require_current_fingerprint: bool) -> dict:
    if decision.get("schema") != "ggd.popp-integration-review-decision@1":
        raise ValueError("Unexpected Popp decision schema")
    if decision.get("heroId") != "b2-popp":
        raise ValueError("Popp decision heroId mismatch")
    if require_current_fingerprint and decision.get("sourceFingerprint") != contract.get("sourceFingerprint"):
        raise ValueError("Popp decision source fingerprint is stale")
    candidates = {row["candidateId"]: row for row in contract["weaponReview"]["candidates"]}
    selected = candidates.get(decision.get("weaponCandidateId"))
    if selected is None:
        raise ValueError("Popp decision does not select a current weapon candidate")
    death = next(
        row for row in contract["fiveOpenIntegrationGaps"]
        if row["id"] == "distinct-death-presentation"
    )["candidate"]
    if decision.get("deathCandidateId") != death["id"]:
        raise ValueError("Popp decision does not select the reviewed death presentation")
    return selected


def build_receipt(decision: dict, contract: dict, champion_before: dict, selected: dict) -> dict:
    version = next(
        row for row in champion_before.get("modelVersions", [])
        if row["modelKey"] == selected["registeredModelKey"]
    )
    return {
        "schema": "ggd.popp-integration-review-decision-receipt@1",
        "heroId": "b2-popp",
        "ownerDecision": {
            "sourceFingerprint": decision["sourceFingerprint"],
            "weaponCandidateId": decision["weaponCandidateId"],
            "deathCandidateId": decision["deathCandidateId"],
            "note": decision.get("note", ""),
        },
        "selectionBefore": {
            "modelKey": champion_before["modelKey"],
            "modelSelectionMode": champion_before.get("modelSelectionMode", "automatic"),
        },
        "selectionAfter": {
            "modelKey": selected["registeredModelKey"],
            "sourceModelKey": selected["sourceModelKey"],
            "label": selected["label"],
            "modelSelectionMode": "manual",
            "binarySha256": version["binarySha256"],
        },
        "deathPresentation": {
            "candidateId": decision["deathCandidateId"],
            "motion": "GGD_native_down",
            "motionProvenance": "native PN020 down loop",
            "presentation": "existing global ChampionView corpse dissolve: lie 3 seconds, rise 3.2 world units while fading for 1.4 seconds, then hide",
            "runtimeAlreadyImplemented": True,
            "runtimeEvidence": [evidence(path) for path in DEATH_RUNTIME_PATHS],
            "poppBinding": "selected model maps hurt/death to GGD_native_down; global death-event renderer supplies the approved rise/fade presentation",
        },
        "decisionEvidence": evidence(DECISION_PATH),
        "reviewContractAtDecision": {
            **evidence(CONTRACT_SNAPSHOT_PATH),
            "sourceFingerprint": decision["sourceFingerprint"],
        },
        "featureBranchSelectable": True,
        "productionDeploymentVerified": False,
        "remainingOpenIntegrationGapIds": [
            "source-toon-and-hair-colour-parity",
            "original-vfx-conversion",
            "animation-events-and-sfx-binding",
            "skill-timing-and-full-combat-binding",
        ],
    }


def assert_applied(decision: dict, contract: dict, champion: dict, receipt: dict) -> None:
    selected = validate_decision(decision, contract, require_current_fingerprint=False)
    if receipt.get("schema") != "ggd.popp-integration-review-decision-receipt@1":
        raise ValueError("Unexpected Popp decision receipt schema")
    if receipt.get("ownerDecision", {}).get("sourceFingerprint") != decision.get("sourceFingerprint"):
        raise ValueError("Popp decision receipt fingerprint mismatch")
    if receipt.get("decisionEvidence") != evidence(DECISION_PATH):
        raise ValueError("Popp decision receipt file evidence is stale")
    snapshot = read_json(CONTRACT_SNAPSHOT_PATH)
    if snapshot.get("sourceFingerprint") != decision.get("sourceFingerprint"):
        raise ValueError("Popp decision contract snapshot fingerprint mismatch")
    if receipt.get("reviewContractAtDecision") != {
        **evidence(CONTRACT_SNAPSHOT_PATH),
        "sourceFingerprint": decision["sourceFingerprint"],
    }:
        raise ValueError("Popp decision contract snapshot evidence is stale")
    if champion.get("modelKey") != selected["registeredModelKey"]:
        raise ValueError("Popp owner-selected weapon model is not active")
    if champion.get("modelSelectionMode") != "manual":
        raise ValueError("Popp owner-selected weapon must remain a manual selection")
    for item in receipt["deathPresentation"]["runtimeEvidence"]:
        path = ROOT / item["gitPath"]
        if evidence(path) != item:
            raise ValueError("Popp death runtime evidence is stale: " + item["gitPath"])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--decision", type=Path, help="Owner-exported decision JSON")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    contract = read_json(CONTRACT_PATH)
    if args.check:
        decision = read_json(DECISION_PATH)
        receipt = read_json(RECEIPT_PATH)
        champion = read_json(CHAMPION_PATH)
        assert_applied(decision, contract, champion, receipt)
        print("Popp owner decision is applied and current")
        return
    if args.decision is None:
        parser.error("--decision is required unless --check is used")
    decision = read_json(args.decision.resolve())
    champion = read_json(CHAMPION_PATH)
    selected = validate_decision(decision, contract, require_current_fingerprint=True)
    DECISION_PATH.parent.mkdir(parents=True, exist_ok=True)
    DECISION_PATH.write_text(json.dumps(decision, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    CONTRACT_SNAPSHOT_PATH.write_text(json.dumps(contract, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    receipt = build_receipt(decision, contract, champion, selected)
    champion["modelKey"] = selected["registeredModelKey"]
    champion["modelSelectionMode"] = "manual"
    CHAMPION_PATH.write_text(json.dumps(champion, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    RECEIPT_PATH.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    assert_applied(decision, contract, champion, receipt)
    print("Applied Popp owner decision:", selected["label"])


if __name__ == "__main__":
    main()
