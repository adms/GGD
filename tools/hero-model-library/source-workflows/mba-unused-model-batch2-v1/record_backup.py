#!/usr/bin/env python3
"""Pin the verified S3 conversion-stage receipt into the MBA batch report."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
EVIDENCE = REPO / "materials/hero-model-library/priority-evidence/mba-unused-model-batch2-v1"


def main() -> int:
    receipt_path = EVIDENCE / "s3-backup-receipt.json"
    receipt = json.loads(receipt_path.read_text())
    if receipt.get("profile") != "vibe-coding" or receipt.get("region") != "ap-east-2":
        raise ValueError("unexpected AWS profile or region")
    if "assumed-role/vibe-coding-s3-role/" not in receipt.get("callerArn", ""):
        raise ValueError("unexpected AWS caller ARN")
    if receipt.get("fullGetVerified") is not True or receipt.get("allMemberSha256Verified") is not True or receipt.get("localUnchanged") is not True:
        raise ValueError("conversion-stage backup is not fully verified")
    if not receipt.get("s3Uri", "").startswith("s3://ggd-390630837668-ap-east-2-an/legacy/conversion-stages/mba-unused-model-batch2-v1/"):
        raise ValueError("backup escaped the authorized conversion-stage prefix")
    report_path = EVIDENCE / "report.json"
    report = json.loads(report_path.read_text())
    report["conversionStageBackup"] = {
        "gitPath": receipt_path.relative_to(REPO).as_posix(),
        "bytes": receipt_path.stat().st_size,
        "sha256": hashlib.sha256(receipt_path.read_bytes()).hexdigest(),
        "s3Uri": receipt["s3Uri"],
        "manifestUri": receipt["manifestUri"],
        "archiveSha256": receipt["archiveSha256"],
        "archiveBytes": receipt["archiveBytes"],
        "fileCount": receipt["fileCount"],
        "fullGetVerified": True,
        "allMemberSha256Verified": True,
        "callerArn": receipt["callerArn"],
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report["conversionStageBackup"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
