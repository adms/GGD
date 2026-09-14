#!/usr/bin/env python3
"""Publish one verified Git asset-backup receipt and refresh the fixed four-day report."""
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
RECEIPTS = ROOT / "materials/hero-model-library/priority-evidence/git-backups"
REPORT = ROOT / "materials/hero-model-library/近四日新增模型動作特效清單.md"
PREFIX = "- Git 成品與程式備份："


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipt", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    receipt = json.loads(args.receipt.read_text())
    if receipt.get("schema") != "ggd-git-asset-backup-receipt@1":
        raise ValueError("unexpected receipt schema")
    if not receipt.get("fullGetAndEveryFileVerified"):
        raise ValueError("receipt does not prove full S3 readback and per-file verification")
    if "assumed-role/vibe-coding-s3-role/" not in receipt.get("callerArn", ""):
        raise ValueError("receipt does not contain the authorized assumed-role ARN")
    if receipt.get("profile") != "vibe-coding" or receipt.get("region") != "ap-east-2":
        raise ValueError("receipt uses an unauthorized AWS profile or region")

    short = receipt["commit"][:9]
    target = RECEIPTS / f"git-backup-{short}.json"
    expected = args.receipt.read_bytes()
    lines = REPORT.read_text().splitlines()
    replacement = (
        f"{PREFIX}`materials/hero-model-library/priority-evidence/git-backups/"
        f"{target.name}`；{receipt['files']} 檔，S3 完整讀回與逐檔 SHA-256 驗證通過"
    )
    hits = [index for index, line in enumerate(lines) if line.startswith(PREFIX)]
    if len(hits) != 1:
        raise ValueError(f"expected one Git backup report row, found {len(hits)}")
    lines[hits[0]] = replacement
    report_bytes = ("\n".join(lines) + "\n").encode()

    if args.check:
        if not target.is_file() or target.read_bytes() != expected:
            raise ValueError(f"stale Git backup receipt: {target}")
        if REPORT.read_bytes() != report_bytes:
            raise ValueError(f"stale four-day report: {REPORT}")
    else:
        RECEIPTS.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(args.receipt, target)
        REPORT.write_bytes(report_bytes)
    print(json.dumps({"receipt": str(target.relative_to(ROOT)), "report": str(REPORT.relative_to(ROOT)), "check": args.check}, ensure_ascii=False))


if __name__ == "__main__":
    main()
