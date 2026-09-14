#!/usr/bin/env python3
"""Register a fully read-back FateUBW static-mesh batch without enabling it.

The source's Bedrock rig and TenshiLib clips remain source reserves.  This
registrar deliberately records only the visually reviewed, unrigged static GLB
and leaves runtime selection/default/deployment false.
"""
import argparse
import hashlib
import json
from pathlib import Path


SOURCE_ID = "github-flemmli97-fateubw-07e9d79b"


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_record(path):
    return {"path": str(path.resolve()), "sha256": sha256(path), "bytes": path.stat().st_size}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--delivery-id", required=True,
                        help="Verified supplemental-delivery ID that owns this immutable batch archive.")
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[4]
    batch, receipt_path = args.batch.resolve(), args.receipt.resolve()
    receipt = json.loads(receipt_path.read_text())
    if (receipt.get("schema") != "ggd-intake-backup-receipt@1"
            or any(receipt.get(key) is not True for key in ("fullGetVerified", "allMemberSha256Verified", "localUnchanged"))
            or Path(receipt.get("source", "")).resolve() != batch):
        raise ValueError("batch backup receipt is not a verified readback of this batch")
    manifest = json.loads((batch / "batch-manifest.json").read_text())
    contract = json.loads((batch / "contract-validation.json").read_text())
    if (manifest.get("sourceId") != SOURCE_ID or manifest.get("counts", {}).get("converted") != len(manifest.get("records", []))
            or not manifest.get("records")
            or contract.get("allKhronosErrorsZero") is not True
            or contract.get("allKhronosWarningsZero") is not True
            or contract.get("allGgdBudgetErrorsZero") is not True):
        raise ValueError("batch is not the expected validated FateUBW static conversion")
    source_paths = {row["path"] for row in json.loads(Path(receipt["manifest"]).read_text())["files"]}
    sources_path = repo / "materials/hero-model-library/download-sources.json"
    original = sources_path.read_bytes()
    document = json.loads(original)
    source = next((row for row in document["publicSources"] if row["id"] == SOURCE_ID), None)
    if source is None:
        raise ValueError("frozen FateUBW source is absent")
    delivery = next((row for row in source.get("supplementalDeliveries", [])
                     if row.get("id") == args.delivery_id and row.get("sha256") == receipt["archiveSha256"]), None)
    if delivery is None or delivery.get("readbackVerified") is not True:
        raise ValueError("matching verified supplemental delivery is absent")
    candidates = {row["candidateId"]: row for row in source["modelCandidates"]}
    records = manifest["records"]
    if len(records) != len({row["candidateId"] for row in records}):
        raise ValueError("batch candidate list is not unique")
    attempts = source.setdefault("conversionAttempts", [])
    for row in records:
        candidate_id = row["candidateId"]
        candidate = candidates.get(candidate_id)
        if candidate is None:
            raise ValueError("candidate is absent from source: " + candidate_id)
        directory = batch / candidate_id
        body = directory / "body.glb"
        structural = json.loads((directory / "structural-readback.json").read_text())
        webgl = json.loads((directory / "webgl-source-material-v1" / "proof.json").read_text())
        run = json.loads((directory / "webgl-source-material-v1" / "run.json").read_text())
        contract_row = next((item for item in contract["records"] if item["candidateId"] == candidate_id), None)
        if (not body.is_file() or structural.get("valid") is not True or structural["structure"].get("staticMeshOnly") is not True
                or row["output"]["body"]["sha256"] != sha256(body)
                or contract_row is None or contract_row["sha256"] != sha256(body)
                or run.get("complete") is not True or run.get("errorExists") is not False or run.get("images") != 3
                or webgl.get("sourceGameShaderParity") is not False or webgl.get("gameplayAcceptance") is not False
                or len(webgl.get("shots", [])) != 3):
            raise ValueError("incomplete static/visual evidence: " + candidate_id)
        required_members = [
            f"{candidate_id}/body.glb", f"{candidate_id}/conversion-report.json",
            f"{candidate_id}/structural-readback.json", f"{candidate_id}/animation-reserve.json",
            f"{candidate_id}/contract-validation.json", f"{candidate_id}/webgl-source-material-v1/proof.json",
            f"{candidate_id}/webgl-source-material-v1/run.json",
        ]
        if any(member not in source_paths for member in required_members):
            raise ValueError("verified archive lacks evidence member: " + candidate_id)
        attempt_id = candidate_id + "-static-mesh-v2"
        entry = {
            "id": attempt_id, "candidateId": candidate_id, "conversionInstanceId": candidate_id + "-static-v2",
            "status": "static-mesh-khronos-webgl-validated-pending-rights-rig-animation-backend",
            "sourceClass": "community-mod", "platform": "Minecraft Java 1.21.1", "nativeFucPsp": False,
            "localPath": str(directory), "body": file_record(body),
            "converterReport": file_record(directory / "conversion-report.json"),
            "structuralReadback": file_record(directory / "structural-readback.json"),
            "contractValidation": file_record(directory / "contract-validation.json"),
            "nativeAnimationReserve": {**file_record(directory / "animation-reserve.json"),
                                       "clipCount": row["output"]["nativeAnimationReserve"]["clipCount"],
                                       "convertedToGlb": False},
            "webglVisualReview": {**file_record(directory / "webgl-source-material-v1" / "proof.json"),
                                  "run": file_record(directory / "webgl-source-material-v1" / "run.json"),
                                  "reviewedViews": ["front", "back", "isometric"],
                                  "scope": "Static body visible with embedded source texture in Babylon WebGL; not source-engine shader parity or gameplay acceptance."},
            "legacyBackup": {"s3Uri": receipt["s3Uri"], "manifestUri": receipt["manifestUri"],
                              "archiveSha256": receipt["archiveSha256"], "readbackVerified": True,
                              "receiptPath": str(receipt_path), "receiptSha256": sha256(receipt_path),
                              "s3Use": "backup-only-not-runtime-entry"},
            "runtimeReady": False, "backendSelectionVerified": False, "defaultEligible": False,
            "deploymentStatus": "not-deployed",
            "missing": ["redistribution permission for ARR source", "glTF skeleton conversion", "TenshiLib animation conversion and event mapping", "GGD backend import and selection verification"],
        }
        prior = [item for item in attempts if item["id"] == attempt_id]
        if prior and prior != [entry]:
            raise ValueError("existing attempt differs: " + attempt_id)
        if not prior:
            attempts.append(entry)
        candidate.update({
            "readyStage": "static-mesh-khronos-webgl-validated-pending-rights-rig-animation-backend",
            "manualVisualReview": "reviewed-static-body-only",
            "bodyStandardization": {"attemptId": attempt_id, "status": entry["status"], "bodyConverted": True,
                                   "glbRigConverted": False, "nativeAnimationConverted": False,
                                   "visualReview": "reviewed-static-body-only", "rightsReview": "pending",
                                   "runtimeReady": False, "backendSelectionVerified": False, "defaultEligible": False},
        })
    if sources_path.read_bytes() != original:
        raise ValueError("source index changed during registration")
    sources_path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"records": len(records), "status": "registered-static-only", "runtimeReady": False}, ensure_ascii=False))


if __name__ == "__main__":
    main()
