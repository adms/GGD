#!/usr/bin/env python3
"""Register the five durationless FateUBW entries as labelled derivative reserves."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


SOURCE_ID = "github-flemmli97-fateubw-07e9d79b"
EVIDENCE = Path("materials/hero-model-library/priority-evidence/fateubw-community/static-pose-derivatives-v1")


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pin(path: Path) -> dict:
    return {"path": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha(path)}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--batch", type=Path, required=True)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    repo, batch = args.repo.resolve(), args.batch.resolve()
    evidence = repo / EVIDENCE
    manifest = json.loads((evidence / "batch-manifest.json").read_text())
    validation = json.loads((evidence / "validation.json").read_text())
    reproducibility = json.loads((evidence / "reproducibility.json").read_text())
    receipt = json.loads((evidence / "evidence-receipt.json").read_text())
    backup_path = evidence / "s3-backup-receipt.json"
    backup = json.loads(backup_path.read_text())
    require(manifest.get("schema") == "ggd-fateubw-static-pose-derivative-batch@1", "Unexpected derivative manifest")
    require(manifest.get("counts") == {"candidates": 5, "staticPoseHolds": 3, "proceduralFormulaLoops": 2, "nativeDurationClips": 0}, "Derivative counts drift")
    require(validation.get("counts", {}).get("khronosErrors") == 0 and validation.get("counts", {}).get("ggdBudgetErrors") == 0, "Derivative validation failed")
    require(reproducibility.get("allGlbHashesIdentical") is True, "Derivative rebuild is not byte-identical")
    require(receipt.get("nativeDurationClaim") is False and receipt.get("runtimeReady") is False, "Derivative receipt overclaims readiness")
    require(backup.get("schema") == "ggd-intake-backup-receipt@1" and backup.get("source") == str(batch), "Derivative S3 source mismatch")
    require(backup.get("fullGetVerified") and backup.get("allMemberSha256Verified") and backup.get("localUnchanged"), "Derivative S3 verification incomplete")
    require(backup.get("s3Uri", "").startswith("s3://ggd-390630837668-ap-east-2-an/legacy/conversions/fateubw-static-pose-derivatives-v2/"), "Derivative S3 prefix mismatch")

    sources_path = repo / "materials/hero-model-library/download-sources.json"
    document = json.loads(sources_path.read_text())
    source = next(row for row in document["publicSources"] if row.get("id") == SOURCE_ID)
    candidates = {row["candidateId"]: row for row in source["modelCandidates"]}
    attempts = source.setdefault("conversionAttempts", [])
    by_attempt = {row["id"]: row for row in attempts}
    registered = []
    for row in manifest["records"]:
        candidate_id = row["candidateId"]
        require(candidate_id in candidates, "Unknown FateUBW model candidate: " + candidate_id)
        body = batch / candidate_id / "body.glb"
        report = evidence / "candidates" / candidate_id / "derivative-report.json"
        require(body.is_file() and body.stat().st_size == row["bytes"] and sha(body) == row["sha256"], "Derivative GLB drift: " + candidate_id)
        attempt_id = candidate_id + "-durationless-derivative-v1"
        derived = {
            "attemptId": attempt_id, "sourceClip": row["sourceClip"], "derivedClip": row["derivedClip"],
            "classification": row["classification"], "durationSeconds": row["duration"],
            "sourceAnimationLengthProvided": False, "nativeDurationClaim": False,
            "body": pin(body), "report": pin(report), "runtimeReady": False,
            "backendSelectionVerified": False, "defaultEligible": False, "visuallyOwnerApproved": False,
            "rightsReview": "pending", "eventMapComplete": False,
            "s3Backup": {"state": "verified", "s3Uri": backup["s3Uri"], "manifestUri": backup["manifestUri"],
                         "archiveSha256": backup["archiveSha256"], "archiveBytes": backup["archiveBytes"],
                         "fileCount": backup["fileCount"], "fullGetVerified": True, "allMemberSha256Verified": True,
                         "receiptGitPath": str((EVIDENCE / "s3-backup-receipt.json").as_posix()),
                         "receiptSha256": sha(backup_path)},
        }
        current = [item for item in candidates[candidate_id].setdefault("derivedMotionCandidates", []) if item.get("attemptId") == attempt_id]
        require(len(current) <= 1, "Duplicate derivative candidate: " + attempt_id)
        if current:
            current[0].clear(); current[0].update(derived)
        else:
            candidates[candidate_id]["derivedMotionCandidates"].append(derived)
        attempt = {"id": attempt_id, "candidateId": candidate_id, "status": "derived-motion-validated-reserve-owner-review-pending",
                   **{key: value for key, value in derived.items() if key != "attemptId"},
                   "deploymentStatus": "not-deployed"}
        if attempt_id in by_attempt:
            attempts[attempts.index(by_attempt[attempt_id])] = attempt
            by_attempt[attempt_id] = attempt
        else:
            attempts.append(attempt); by_attempt[attempt_id] = attempt
        registered.append({"candidateId": candidate_id, "attemptId": attempt_id, "classification": row["classification"], "sha256": row["sha256"]})

    source["durationlessDerivativeCompletion"] = {
        "status": "five-derived-motion-candidates-validated-owner-review-and-event-mapping-pending",
        "evidenceGitPath": str((EVIDENCE / "evidence-receipt.json").as_posix()),
        "evidenceSha256": sha(evidence / "evidence-receipt.json"),
        "validationGitPath": str((EVIDENCE / "validation.json").as_posix()),
        "validationSha256": sha(evidence / "validation.json"),
        "s3BackupReceiptGitPath": str((EVIDENCE / "s3-backup-receipt.json").as_posix()),
        "s3Uri": backup["s3Uri"], "counts": manifest["counts"], "nativeDurationClaim": False,
        "runtimeReady": False, "backendSelectionVerified": False, "deployed": False,
    }
    encoded = json.dumps(document, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        require(sources_path.read_text() == encoded, "FateUBW derivative source index is stale")
    else:
        sources_path.write_text(encoded)
    print(json.dumps({"registered": len(registered), "staticPoseHolds": 3, "proceduralFormulaLoops": 2, "nativeDurationClaim": False, "written": not args.check}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
