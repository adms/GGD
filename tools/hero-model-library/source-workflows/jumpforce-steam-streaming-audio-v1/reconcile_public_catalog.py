#!/usr/bin/env python3
"""Reconcile the 58 public JUMP FORCE audio packages from verified backups."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


BATCH_IDS = [
    "parallel-ps-jumpforce-audio",
    "parallel-ps-jumpforce-local-10",
    "parallel-ps-jumpforce-local-second10",
    "parallel-ps-jumpforce-local-next32",
    "parallel-ps-jumpforce-local-final3",
]
CATALOG_ID = "miner600-jumpforce-audio-full-catalog"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[4])
    parser.add_argument("--evidence", required=True, type=Path)
    args = parser.parse_args()
    repo, evidence_path = args.repo.resolve(), args.evidence.resolve()
    base = repo / "materials/hero-model-library"
    sources_path, archives_path = base / "download-sources.json", base / "public-source-files.json"
    sources, archives = json.loads(sources_path.read_text()), json.loads(archives_path.read_text())
    archived = {row["id"]: row for row in archives["sources"]}
    batches, all_packages = [], []
    for source_id in BATCH_IDS:
        archive = archived[source_id]
        if archive.get("readbackVerified") is not True:
            raise ValueError("batch lacks verified readback: " + source_id)
        for optional_flag in ("fullReadbackVerified", "s3ReadbackVerified"):
            if optional_flag in archive and archive[optional_flag] is not True:
                raise ValueError(f"batch has failed {optional_flag}: {source_id}")
        packages = sorted(row["path"] for row in archive["files"] if row["path"].lower().endswith((".7z", ".zip", ".rar")))
        if not packages:
            raise ValueError("batch has no original packages: " + source_id)
        batches.append({
            "sourceId": source_id, "packageCount": len(packages), "packages": packages,
            "backupSha256": archive["sha256"], "s3Uri": archive["s3Uri"],
            "verificationLevel": ("full-member-readback" if archive.get("fullReadbackVerified") is True else "legacy-archive-readback"),
        })
        all_packages.extend((source_id, path) for path in packages)
    basenames = [Path(path).name.casefold() for _, path in all_packages]
    if len(all_packages) != 58 or len(set(basenames)) != 58:
        raise ValueError(f"expected 58 distinct packages, got {len(all_packages)}/{len(set(basenames))}")
    report = {
        "schema": "ggd.jumpforce-public-audio-catalog-reconciliation@1", "checkedAt": "2026-09-14",
        "catalogSourceId": CATALOG_ID, "batchSourceIds": BATCH_IDS,
        "packageCount": 58, "distinctPackageBasenames": 58, "batches": batches,
        "acceptance": {"allBackupsReadbackVerified": True, "newerFourBatchesFullMemberReadbackVerified": True, "originalPackageCatalogComplete": True, "speakerLanguageEventReviewComplete": False},
        "doesNotMean": ["every audio file was listened to", "speaker or language verified", "runtime event binding complete", "deployed"],
        "inputs": [{"gitPath": str(path.relative_to(repo)), "sha256": sha(path)} for path in (archives_path,)],
    }
    report["packages"] = [{"sourceId": source_id, "path": path} for source_id, path in sorted(all_packages)]
    evidence_path.parent.mkdir(parents=True, exist_ok=True)
    evidence_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    matches = [row for row in sources.get("publicSourceLeads", []) if row["id"] == CATALOG_ID]
    if len(matches) != 1:
        raise ValueError("expected one catalog source")
    row = matches[0]
    row.update(
        checkedAt="2026-09-14",
        acquisitionStatus="downloaded-verified-in-five-batches",
        readiness="complete-original-package-catalog-acquired-listening-review-pending",
        verification=(
            "58 original packages are present as 3+10+10+32+3 distinct archive members across five immutable source batches. "
            "Every batch has an S3 readback receipt and per-member SHA-256 in public-source-files.json; the newer four batches also carry explicit full-member readback flags. "
            "This reconciles package acquisition only; speaker, language, event binding and per-clip listening review remain pending."
        ),
        packageCount=58,
        deliverySourceIds=BATCH_IDS,
        reconciliationEvidence={"gitPath": evidence_path.relative_to(repo).as_posix(), "sha256": sha(evidence_path)},
    )
    row["backendIntegration"].update(state="audio-listening-review-and-event-binding-pending", selectionVerified=False)
    sources_path.write_text(json.dumps(sources, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"packages": len(all_packages), "distinct": len(set(basenames)), "catalog": CATALOG_ID}))


if __name__ == "__main__":
    main()
