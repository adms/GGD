#!/usr/bin/env python3
"""Register a backed-up FateUBW static conversion attempt without enabling it."""
import argparse
import hashlib
import json
from pathlib import Path


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def result_file(path):
    path = path.resolve()
    return {"path": str(path), "sha256": sha256(path), "bytes": path.stat().st_size}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--id", required=True)
    parser.add_argument("--status", choices=["rejected-invalid-glb", "structural-validated-pending-visual-and-rights-review"], required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--attempt-dir", type=Path, required=True)
    parser.add_argument("--structural-readback", type=Path)
    parser.add_argument("--animation-reserve", type=Path)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[4]
    sources_path = repo / "materials/hero-model-library/download-sources.json"
    raw = sources_path.read_bytes()
    document = json.loads(raw)
    source_id = "github-flemmli97-fateubw-07e9d79b"
    candidate_id = "fateubw-artoria_pendragon_saber"
    sources = [row for row in document["publicSources"] if row["id"] == source_id]
    if len(sources) != 1:
        raise ValueError("expected exactly one FateUBW source")
    source = sources[0]
    candidate = next((row for row in source["modelCandidates"] if row["candidateId"] == candidate_id), None)
    if candidate is None:
        raise ValueError("expected Artoria candidate")
    attempt_dir = args.attempt_dir.resolve()
    receipt_path = args.receipt.resolve()
    receipt = json.loads(receipt_path.read_text())
    required = ["fullGetVerified", "allMemberSha256Verified", "localUnchanged"]
    if receipt.get("schema") != "ggd-intake-backup-receipt@1" or any(receipt.get(key) is not True for key in required):
        raise ValueError("attempt backup lacks verified full readback")
    if Path(receipt["source"]).resolve() != attempt_dir:
        raise ValueError("backup receipt source does not match attempt directory")
    if not receipt["s3Uri"].startswith("s3://ggd-390630837668-ap-east-2-an/legacy/"):
        raise ValueError("attempt backup is outside authorized legacy bucket")
    report = attempt_dir / "conversion-report.json"
    validation = attempt_dir / "khronos-validation.json"
    body = attempt_dir / "body.glb"
    if not all(path.is_file() for path in [report, validation, body]):
        raise ValueError("attempt lacks converter report, validator output, or body")
    converter = json.loads(report.read_text())
    khronos = json.loads(validation.read_text())
    converter_candidate = converter.get("candidateId", "")
    if (converter.get("sourceId") != source_id
            or not converter_candidate.startswith(candidate_id + "-static-v")):
        raise ValueError("converter report does not identify this source/candidate")
    errors = khronos.get("issues", {}).get("numErrors")
    if args.status == "rejected-invalid-glb":
        if not isinstance(errors, int) or errors <= 0:
            raise ValueError("rejected attempt must retain Khronos errors")
    if args.status.startswith("structural-validated") and errors != 0:
        raise ValueError("structural validated attempt must have zero Khronos errors")
    linked = [row for row in source.get("supplementalDeliveries", []) if row["id"] == args.id and row["sha256"] == receipt["archiveSha256"]]
    if len(linked) != 1:
        raise ValueError("verified supplemental backup must be registered first")
    entry = {
        "id": args.id,
        "candidateId": candidate_id,
        "conversionInstanceId": converter_candidate,
        "status": args.status,
        "sourceClass": "community-mod",
        "platform": "Minecraft Java 1.21.1",
        "nativeFucPsp": False,
        "localPath": str(attempt_dir),
        "body": result_file(body),
        "converterReport": result_file(report),
        "khronosValidation": {**result_file(validation), "numErrors": errors, "numWarnings": khronos.get("issues", {}).get("numWarnings")},
        "legacyBackup": {"s3Uri": receipt["s3Uri"], "manifestUri": receipt["manifestUri"], "archiveSha256": receipt["archiveSha256"], "readbackVerified": True, "receiptPath": str(receipt_path), "receiptSha256": sha256(receipt_path)},
        "runtimeReady": False,
        "backendSelectionVerified": False,
        "defaultEligible": False,
        "deploymentStatus": "not-deployed",
    }
    if args.structural_readback:
        structural = json.loads(args.structural_readback.read_text())
        if structural.get("valid") is not True:
            raise ValueError("structural readback is not valid")
        entry["structuralReadback"] = result_file(args.structural_readback)
    if args.animation_reserve:
        animation = json.loads(args.animation_reserve.read_text())
        if animation.get("convertedToGlb") is not False or animation.get("allTargetsExistInGeometry") is not True:
            raise ValueError("unexpected animation reserve evidence")
        entry["nativeAnimationReserve"] = {**result_file(args.animation_reserve), "clipCount": animation["clipCount"], "convertedToGlb": False, "allTargetsExistInGeometry": True}
    if args.status == "rejected-invalid-glb":
        entry["reason"] = "v1 emitted scaled normals and an invalid single skeleton root for a multi-root joint forest; Khronos rejected it. Preserved as a failed stage."
    else:
        entry["reason"] = "Static GLB is structurally valid and self-contained, but requires visual review, rights review, and native animation conversion before any runtime registration."
        entry["missing"] = ["rendered visual review", "redistribution permission", "TenshiLib animation conversion and event mapping", "GGD backend import and selection verification"]
    prior = [row for row in source.setdefault("conversionAttempts", []) if row["id"] == args.id]
    if prior and prior != [entry]:
        raise ValueError("attempt ID already has different immutable evidence")
    if not prior:
        source["conversionAttempts"].append(entry)
    if args.status.startswith("structural-validated"):
        candidate["readyStage"] = "static-body-structural-validated-pending-visual-rights-animation"
        candidate["bodyStandardization"] = {
            "attemptId": args.id,
            "status": args.status,
            "bodyConverted": True,
            "nativeAnimationConverted": False,
            "visualReview": "pending",
            "rightsReview": "pending",
            "runtimeReady": False,
            "backendSelectionVerified": False,
            "defaultEligible": False,
        }
    if sources_path.read_bytes() != raw:
        raise ValueError("sources changed during attempt registration")
    sources_path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"id": args.id, "status": args.status, "candidateReadyStage": candidate["readyStage"], "runtimeReady": entry["runtimeReady"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
