#!/usr/bin/env python3
"""Track reproducible rejected <=8k Re:Zero Ram candidates without promotion."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
WORKSPACE = ROOT.parent
ATTEMPTS = WORKSPACE / "GGD-Asset-Library/conversions/rezero-ram-material-preserving-decimation-v1/conversion-attempts.json"
BACKUP = WORKSPACE / "GGD-Asset-Library/backups/rezero-ram-material-preserving-decimation-v1/latest-receipt.json/latest-receipt.json"
EVIDENCE = ROOT / "materials/hero-model-library/priority-evidence/rezero-ram-material-preserving-decimation-v1/rejected-attempts.json"
INDEX = ROOT / "materials/hero-model-library/download-sources.json"
SOURCE_ID = "thunderstore-rezero"
COMPONENT_ID = "rezero-ram-thunderstore-0.1.1-static-skinned-v1"
SOURCE_SHA256 = "333c43b9a8a1cbaa8871072df7eec1a41307fcb1aa27af5aab63203e81221e3b"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pin(path: Path) -> dict:
    data = path.read_bytes()
    return {"gitPath": path.relative_to(ROOT).as_posix(), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def build() -> tuple[dict, dict]:
    attempts = json.loads(ATTEMPTS.read_text(encoding="utf-8"))
    backup = json.loads(BACKUP.read_text(encoding="utf-8"))
    if (attempts.get("schema") != "ggd.rezero-ram-material-preserving-decimation-attempts@1"
            or attempts.get("sourceId") != SOURCE_ID
            or attempts.get("componentId") != COMPONENT_ID
            or attempts.get("source", {}).get("sha256") != SOURCE_SHA256
            or attempts.get("acceptedCandidate") is not None
            or len(attempts.get("attempts", [])) != 2):
        raise ValueError("Ram conversion attempt evidence is stale or overclaims acceptance")
    for attempt in attempts["attempts"]:
        if (attempt.get("accepted") is not False
                or attempt.get("decimation", {}).get("candidateTriangles", 8000) >= 8000
                or attempt.get("structuralValidation", {}).get("passed") is not True
                or attempt.get("visualEvidence", {}).get("withinThreshold") is not False
                or attempt.get("visualEvidence", {}).get("maxSilhouetteXorUnionPct", 0) <= 5):
            raise ValueError("Ram attempt does not prove the required visual rejection")
    if (not backup.get("fullGetVerified") or not backup.get("allMemberSha256Verified")
            or not str(backup.get("s3Uri", "")).startswith("s3://ggd-390630837668-ap-east-2-an/legacy/")):
        raise ValueError("Ram rejection archive is not fully read back from the authorized legacy bucket")
    evidence = {
        "schema": "ggd.rezero-ram-material-preserving-decimation-rejection@1",
        "sourceId": SOURCE_ID,
        "componentId": COMPONENT_ID,
        "source": attempts["source"],
        "policy": attempts["policy"],
        "attempts": attempts["attempts"],
        "acceptedCandidate": None,
        "status": "conversion-attempts-archived-no-accepted-candidate",
        "nextAction": attempts["nextAction"],
        "localAttemptReport": {"absolutePath": str(ATTEMPTS), "bytes": ATTEMPTS.stat().st_size, "sha256": sha256(ATTEMPTS)},
        "legacyBackup": {key: backup[key] for key in (
            "s3Uri", "manifestUri", "archiveSha256", "archiveBytes", "fileCount",
            "fullGetVerified", "allMemberSha256Verified", "localUnchanged",
        )},
    }
    evidence_pin = pin(EVIDENCE) if EVIDENCE.is_file() else {"gitPath": EVIDENCE.relative_to(ROOT).as_posix(), "bytes": None, "sha256": None}
    overlay = {
        "status": evidence["status"],
        "acceptedCandidate": None,
        "attemptCount": len(evidence["attempts"]),
        "reason": "Both structurally valid <=8,000-triangle candidates exceed the 5% three-view silhouette continuity gate (maximum 8.3501%).",
        "evidence": evidence_pin,
        "legacyBackup": evidence["legacyBackup"],
    }
    return evidence, overlay


def expected_index() -> dict:
    evidence, overlay = build()
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    rows = [row for bucket in ("publicSources", "paidSources") for row in index.get(bucket, []) if row.get("id") == SOURCE_ID]
    if len(rows) != 1:
        raise ValueError("Expected exactly one Thunderstore Re:Zero source")
    candidates = [row for row in rows[0].get("componentCandidates", []) if row.get("id") == COMPONENT_ID]
    if len(candidates) != 1:
        raise ValueError("Expected exactly one Ram static component")
    result = json.loads(json.dumps(index))
    target = next(row for bucket in ("publicSources", "paidSources") for row in result.get(bucket, []) if row.get("id") == SOURCE_ID)
    component = next(row for row in target["componentCandidates"] if row.get("id") == COMPONENT_ID)
    component["decimationAttempts"] = overlay
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()
    evidence, _ = build()
    body = json.dumps(evidence, ensure_ascii=False, indent=2) + "\n"
    if args.write:
        EVIDENCE.parent.mkdir(parents=True, exist_ok=True)
        EVIDENCE.write_text(body, encoding="utf-8")
        INDEX.write_text(json.dumps(expected_index(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    else:
        if not EVIDENCE.is_file() or EVIDENCE.read_text(encoding="utf-8") != body:
            raise SystemExit("Ram rejection evidence is stale; rerun with --write")
        expected = json.dumps(expected_index(), ensure_ascii=False, indent=2) + "\n"
        if INDEX.read_text(encoding="utf-8") != expected:
            raise SystemExit("Ram decimation index overlay is stale; rerun with --write")
    print(json.dumps({"componentId": COMPONENT_ID, "acceptedCandidate": None, "attempts": len(evidence["attempts"]), "written": args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
