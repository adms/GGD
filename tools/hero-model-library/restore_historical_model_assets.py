#!/usr/bin/env python3
"""Restore exact historical GLBs from a pinned Git commit without overwriting changes."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_EVIDENCE = ROOT / "materials/hero-model-library/priority-evidence/historical-model-recovery/current-lineage-audit.json"
DEFAULT_RECEIPT = ROOT / "materials/hero-model-library/priority-evidence/historical-model-recovery/restoration-receipt.json"


def digest(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def restore(repo: Path, evidence_path: Path) -> dict:
    evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    commit = evidence["historicalCommit"]
    records = []
    for row in evidence["records"]:
        lineage = row.get("recoveredFrom")
        if lineage:
            source_relative = lineage["originalGitPath"]
            retained_relative = lineage["retainedGitPath"]
            expected_bytes = lineage["bytes"]
            expected_sha256 = lineage["sha256"]
        else:
            source_relative = row["gitPath"]
            retained_relative = row.get("recoveredGitPath", source_relative)
            expected_bytes = row["bytes"]
            expected_sha256 = row["sha256"]
        payload = subprocess.check_output(["git", "show", f"{commit}:{source_relative}"], cwd=repo)
        if len(payload) != expected_bytes or digest(payload) != expected_sha256:
            raise ValueError(f"Historical Git object does not match evidence: {source_relative}")
        target = (repo / retained_relative).resolve()
        if not target.is_relative_to(repo.resolve()):
            raise ValueError(f"Historical path escapes checkout: {retained_relative}")
        if target.exists() and target.read_bytes() != payload:
            raise ValueError(f"Refusing to overwrite changed file: {retained_relative}")
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            target.write_bytes(payload)
        records.append({
            "id": row["id"],
            "sourceGitPath": source_relative,
            "retainedGitPath": retained_relative,
            "gitObject": f"{commit}:{source_relative}",
            "bytes": len(payload),
            "sha256": digest(payload),
            "presentByteIdenticalAfterRestore": True,
        })
    return {
        "schema": "ggd-historical-model-restoration-receipt@1",
        "historicalCommit": commit,
        "sourceEvidenceGitPath": str(evidence_path.relative_to(repo)),
        "records": records,
        "allPresentByteIdenticalToHistoricalGit": True,
        "scope": "Exact historical GLB bytes only. Runtime selection and deployment remain separate.",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=ROOT)
    parser.add_argument("--evidence", type=Path, default=DEFAULT_EVIDENCE)
    parser.add_argument("--receipt", type=Path, default=DEFAULT_RECEIPT)
    parser.add_argument("--check", action="store_true", help="Verify all retained bytes without rewriting the receipt.")
    args = parser.parse_args()
    repo = args.repo.resolve()
    receipt = restore(repo, args.evidence.resolve())
    if not args.check:
        args.receipt.parent.mkdir(parents=True, exist_ok=True)
        args.receipt.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"records": len(receipt["records"]), "receipt": str(args.receipt), "written": not args.check}, ensure_ascii=False))


if __name__ == "__main__":
    main()
