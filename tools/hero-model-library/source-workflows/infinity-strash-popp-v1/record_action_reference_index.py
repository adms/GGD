#!/usr/bin/env python3
"""Register a backed-up PN020 action-reference analysis without upgrading motion readiness."""
import argparse
import hashlib
import json
from pathlib import Path


BUCKET_PREFIX = "s3://ggd-390630837668-ap-east-2-an/legacy/"
SOURCE_ID = "parallel-infinity-strash-sorcerer-popp"


def sha256(path):
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    index_path, receipt_path = args.index.resolve(), args.receipt.resolve()
    index = json.loads(index_path.read_text())
    receipt = json.loads(receipt_path.read_text())
    if index.get("schema") != "ggd-infinity-strash-pn020-action-reference-index@1" or index.get("sourceId") != SOURCE_ID:
        raise ValueError("unexpected PN020 action-reference index")
    if index.get("knownNativeMotionAssets", {}).get("decodedPlayableGlbClipCount") != 0:
        raise ValueError("reference index must not claim playable converted clips")
    if receipt.get("schema") != "ggd-intake-backup-receipt@1" or any(receipt.get(key) is not True for key in ("fullGetVerified", "allMemberSha256Verified", "localUnchanged")):
        raise ValueError("backup receipt does not prove full readback")
    if not receipt.get("s3Uri", "").startswith(BUCKET_PREFIX) or Path(receipt.get("source", "")).resolve() != index_path.parent:
        raise ValueError("receipt does not correspond to authorized index backup")
    repo = Path(__file__).resolve().parents[4]
    source_file = repo / "materials/hero-model-library/download-sources.json"
    original = source_file.read_bytes()
    document = json.loads(original)
    sources = [source for source in document["publicSources"] if source["id"] == SOURCE_ID]
    if len(sources) != 1:
        raise ValueError("expected one PN020 source")
    source = sources[0]
    delivery_id = "infinity-strash-popp-action-reference-v1"
    linked = [row for row in source.get("supplementalDeliveries", []) if row.get("id") == delivery_id and row.get("sha256") == receipt["archiveSha256"]]
    if len(linked) != 1:
        raise ValueError("verified backup must be registered before semantic index")
    entry = {
        "id": delivery_id,
        "status": "controller-references-indexed-not-playable",
        "sourceCharacterId": "PN020",
        "heroIds": ["b2-popp"],
        "artifact": {"absolutePath": str(index_path), "sha256": sha256(index_path), "bytes": index_path.stat().st_size},
        "actionControllerCount": index["actionControllerCount"],
        "categoryCounts": index["categoryCounts"],
        "eventReferenceCounts": index["eventReferenceCounts"],
        "knownNativeMotionAssets": index["knownNativeMotionAssets"],
        "legacyBackup": {"s3Uri": receipt["s3Uri"], "manifestUri": receipt["manifestUri"], "archiveSha256": receipt["archiveSha256"], "readbackVerified": True, "receiptPath": str(receipt_path), "receiptSha256": sha256(receipt_path)},
        "runtimeReady": False,
        "backendSelectionVerified": False,
        "defaultEligible": False,
        "deploymentStatus": "not-deployed",
        "gaps": index["gaps"],
    }
    entries = source.setdefault("actionReferenceAnalyses", [])
    same = [row for row in entries if row["id"] == delivery_id]
    if same and same != [entry]:
        raise ValueError("different immutable PN020 action-reference delivery exists")
    if not same:
        entries.append(entry)
    if source_file.read_bytes() != original:
        raise ValueError("source index changed during registration")
    source_file.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"id": delivery_id, "status": entry["status"], "actionControllerCount": entry["actionControllerCount"], "runtimeReady": False}, ensure_ascii=False))


if __name__ == "__main__":
    main()
