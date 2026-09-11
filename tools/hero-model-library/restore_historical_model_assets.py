#!/usr/bin/env python3
"""Restore exact historical GLBs from a pinned Git commit without overwriting changes."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_EVIDENCE = ROOT / "materials/hero-model-library/priority-evidence/historical-model-recovery/validation.json"
DEFAULT_RECEIPT = ROOT / "materials/hero-model-library/priority-evidence/historical-model-recovery/restoration-receipt.json"


def digest(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def restore(repo: Path, evidence_path: Path) -> dict:
    evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    commit = evidence["historicalCommit"]
    records = []
    for row in evidence["records"]:
        relative = row["gitPath"]
        payload = subprocess.check_output(["git", "show", f"{commit}:{relative}"], cwd=repo)
        if len(payload) != row["bytes"] or digest(payload) != row["sha256"]:
            raise ValueError(f"Historical Git object does not match evidence: {relative}")
        target = (repo / relative).resolve()
        if not target.is_relative_to(repo.resolve()):
            raise ValueError(f"Historical path escapes checkout: {relative}")
        if target.exists() and target.read_bytes() != payload:
            raise ValueError(f"Refusing to overwrite changed file: {relative}")
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            target.write_bytes(payload)
        records.append({
            "id": row["id"],
            "gitPath": relative,
            "gitObject": f"{commit}:{relative}",
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
    args = parser.parse_args()
    repo = args.repo.resolve()
    receipt = restore(repo, args.evidence.resolve())
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    args.receipt.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"records": len(receipt["records"]), "receipt": str(args.receipt)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
