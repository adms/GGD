#!/usr/bin/env python3
"""Record reproducible rejected EN653 decimation attempts without promoting a model."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SOURCE_ID = "steam-infinity-strash-priority-original-assets-build-local-20240328"
COMPONENT_ID = "infinity-strash-mystvearn-en653-01-static-skinned-v1"
SOURCE_SHA256 = "f76a9108bca1da1934eb3a823b6a9ff6f6ce5311715dd6959ab91ed16390df65"
ATTEMPTS = ROOT.parent / "GGD-Asset-Library/conversions/mystvearn-en653-decimation-v1/conversion-attempts.json"
RECEIPT = ROOT.parent / "GGD-Asset-Library/backups/mystvearn-en653-decimation-v1/latest-receipt.json"
EVIDENCE = ROOT / "materials/hero-model-library/priority-evidence/infinity-strash-en653-decimation-v1/rejected-attempts.json"
INDEX = ROOT / "materials/hero-model-library/download-sources.json"


def pin(path: Path) -> dict:
    body = path.read_bytes()
    return {"gitPath": path.relative_to(ROOT).as_posix(), "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest()}


def build() -> tuple[dict, dict]:
    attempts = json.loads(ATTEMPTS.read_text())
    receipt = json.loads(RECEIPT.read_text())
    if attempts.get("schema") != "ggd.mystvearn-en653-decimation-attempts@1":
        raise ValueError("Unexpected MystVearn decimation attempt report")
    if attempts.get("source", {}).get("sha256") != SOURCE_SHA256:
        raise ValueError("Attempt report does not pin the accepted EN653 source")
    if attempts.get("acceptedCandidate") is not None:
        raise ValueError("This recorder only handles rejected candidates")
    if not receipt.get("fullGetVerified") or not receipt.get("allMemberSha256Verified"):
        raise ValueError("S3 backup is not fully read back")
    if not str(receipt.get("s3Uri", "")).startswith("s3://ggd-390630837668-ap-east-2-an/legacy/"):
        raise ValueError("Unexpected S3 destination")
    evidence = {
        "schema": "ggd.mystvearn-en653-decimation-rejection@1",
        "componentId": COMPONENT_ID,
        "sourceId": SOURCE_ID,
        "source": attempts["source"],
        "policy": attempts["policy"],
        "attempts": attempts["attempts"],
        "acceptedCandidate": None,
        "status": "conversion-attempts-archived-no-accepted-candidate",
        "nextAction": attempts["nextAction"],
        "localReport": {"absolutePath": str(ATTEMPTS), "bytes": ATTEMPTS.stat().st_size,
                        "sha256": hashlib.sha256(ATTEMPTS.read_bytes()).hexdigest()},
        "legacyBackup": {key: receipt[key] for key in (
            "s3Uri", "manifestUri", "archiveSha256", "archiveBytes", "fileCount",
            "fullGetVerified", "allMemberSha256Verified", "localUnchanged")},
    }
    evidence_pin = pin(EVIDENCE) if EVIDENCE.is_file() else {
        "gitPath": EVIDENCE.relative_to(ROOT).as_posix(), "bytes": None, "sha256": None,
    }
    return evidence, {
        "status": evidence["status"],
        "acceptedCandidate": None,
        "attemptCount": len(evidence["attempts"]),
        "reason": "No candidate may be registered: two <=8,000-triangle outputs visibly damage the robe; the topology-safe output remains over policy target.",
        "evidence": evidence_pin,
        "legacyBackup": evidence["legacyBackup"],
    }


def expected_index() -> dict:
    evidence, overlay = build()
    index = json.loads(INDEX.read_text())
    matches = [source for collection in ("publicSources", "paidSources") for source in index.get(collection, [])
               if source.get("id") == SOURCE_ID]
    if len(matches) != 1:
        raise ValueError("Expected exactly one Infinity Strash source")
    candidates = [row for row in matches[0].get("componentCandidates", []) if row.get("id") == COMPONENT_ID]
    if len(candidates) != 1:
        raise ValueError("Expected exactly one MystVearn component")
    result = json.loads(json.dumps(index))
    out_source = next(source for collection in ("publicSources", "paidSources") for source in result.get(collection, [])
                      if source.get("id") == SOURCE_ID)
    out_candidate = next(row for row in out_source["componentCandidates"] if row.get("id") == COMPONENT_ID)
    out_candidate["decimationAttempts"] = overlay
    return evidence, result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()
    evidence, _ = build()
    serialized = json.dumps(evidence, ensure_ascii=False, indent=2) + "\n"
    if args.write:
        EVIDENCE.parent.mkdir(parents=True, exist_ok=True)
        EVIDENCE.write_text(serialized)
        # Rebuild after the evidence exists so its immutable Git pin is correct.
        _, expected = expected_index()
        INDEX.write_text(json.dumps(expected, ensure_ascii=False, indent=2) + "\n")
    else:
        if not EVIDENCE.is_file() or EVIDENCE.read_text() != serialized:
            raise SystemExit("MystVearn rejection evidence is stale; rerun with --write")
        _, expected = expected_index()
        index_serialized = json.dumps(expected, ensure_ascii=False, indent=2) + "\n"
        if INDEX.read_text() != index_serialized:
            raise SystemExit("MystVearn decimation overlay is stale; rerun with --write")
    print(json.dumps({"componentId": COMPONENT_ID, "acceptedCandidate": None,
                      "attempts": len(evidence["attempts"]), "written": args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
