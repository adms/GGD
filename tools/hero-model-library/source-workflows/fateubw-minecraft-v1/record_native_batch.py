#!/usr/bin/env python3
"""Register a fully backed FateUBW native-motion reserve without enabling it."""
import argparse
import hashlib
import json
from pathlib import Path


SOURCE_ID = "github-flemmli97-fateubw-07e9d79b"
STATUS = "native-motion-khronos-webgl-phase-validated-pending-source-engine-parity-rights-event-map-backend"


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path):
    return json.loads(path.read_text())


def file_record(path):
    return {"path": str(path.resolve()), "sha256": sha256(path), "bytes": path.stat().st_size}


def require_member(backed, batch, path):
    member = path.resolve().relative_to(batch).as_posix()
    expected = {"path": member, "sha256": sha256(path), "bytes": path.stat().st_size}
    if backed.get(member) != expected:
        raise ValueError("verified archive lacks or mismatches member: " + member)
    return member


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--delivery-id", required=True)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[4]
    batch, receipt_path = args.batch.resolve(), args.receipt.resolve()
    receipt = read_json(receipt_path)
    if (receipt.get("schema") != "ggd-intake-backup-receipt@1"
            or any(receipt.get(key) is not True for key in
                   ("fullGetVerified", "allMemberSha256Verified", "localUnchanged"))
            or Path(receipt.get("source", "")).resolve() != batch):
        raise ValueError("batch backup receipt is not a complete readback of this batch")
    backed = {row["path"]: row for row in read_json(Path(receipt["manifest"]))["files"]}
    manifest_path = batch / "batch-manifest.json"
    webgl_batch_path = batch / "batch-webgl-review.json"
    assessment_path = batch / "batch-visual-assessment.json"
    manual_path = batch / "manual-visual-review.json"
    contact_path = batch / "batch-midpoint-contact-sheet.png"
    for path in (manifest_path, webgl_batch_path, assessment_path, manual_path, contact_path):
        require_member(backed, batch, path)
    manifest = read_json(manifest_path)
    webgl_batch = read_json(webgl_batch_path)
    assessment = read_json(assessment_path)
    manual = read_json(manual_path)
    counts = manifest.get("counts", {})
    if (manifest.get("schema") != "ggd-fateubw-native-motion-reserve-batch@1"
            or manifest.get("sourceId") != SOURCE_ID
            or counts != {"sourceCharacters": 14, "convertedCharacters": 13,
                           "pendingRestRotationCharacter": 1, "sourceClips": 115,
                           "convertedNativeClips": 98, "unconvertedClips": 17,
                           "skippedNoDurationOrEmptyClips": 4, "retainedUnsupportedClips": 13}
            or manifest.get("allKhronosErrorsZero") is not True
            or manifest.get("allKhronosWarningsZero") is not True
            or manifest.get("allGgdBudgetErrorsZero") is not True
            or manifest.get("runtimeReady") is not False):
        raise ValueError("unexpected FateUBW native batch manifest")
    if (webgl_batch.get("schema") != "ggd-fateubw-native-motion-batch-webgl@1"
            or webgl_batch.get("counts") != {"characters": 13, "animationGroups": 98, "shots": 392}
            or webgl_batch.get("allRunsComplete") is not True
            or webgl_batch.get("allModelsMatchBatchPins") is not True
            or assessment.get("schema") != "ggd-fateubw-native-motion-visual-assessment@1"
            or assessment.get("allShotsPresentAndFinite") is not True
            or manual.get("schema") != "ggd-fateubw-native-motion-manual-review@1"
            or manual.get("review", {}).get("acceptedAs") != "native-motion-conversion-reserve"
            or manual.get("runtimeReady") is not False
            or manual.get("rightsStatus") != "ARR redistribution permission pending"):
        raise ValueError("native WebGL or bounded manual review evidence is incomplete")

    sources_path = repo / "materials/hero-model-library/download-sources.json"
    original = sources_path.read_bytes()
    document = json.loads(original)
    source = next((row for row in document["publicSources"] if row["id"] == SOURCE_ID), None)
    if source is None:
        raise ValueError("frozen FateUBW source is absent")
    delivery = next((row for row in source.get("supplementalDeliveries", [])
                     if row.get("id") == args.delivery_id
                     and row.get("sha256") == receipt["archiveSha256"]), None)
    if delivery is None or delivery.get("readbackVerified") is not True:
        raise ValueError("matching verified supplemental delivery is absent")
    candidates = {row["candidateId"]: row for row in source["modelCandidates"]}
    records = manifest["records"]
    if len(records) != 13 or len({row["candidateId"] for row in records}) != 13:
        raise ValueError("batch candidate set is not the expected unique 13")
    webgl_rows = {row["candidateId"]: row for row in webgl_batch["records"]}
    assessment_rows = {row["candidateId"]: row for row in assessment["records"]}
    attempts = source.setdefault("conversionAttempts", [])
    for row in records:
        candidate_id = row["candidateId"]
        candidate = candidates.get(candidate_id)
        if candidate is None or candidate_id == "fateubw-heracles_berserker":
            raise ValueError("unexpected native-motion candidate: " + candidate_id)
        directory = batch / candidate_id
        body = directory / "body.glb"
        report_path = directory / "conversion-report.json"
        structural_path = directory / "native-structural-readback.json"
        contract_path = directory / "contract-validation.json"
        proof_path = directory / "webgl-native-v1/proof.json"
        run_path = directory / "webgl-native-v1/run.json"
        for path in (body, report_path, structural_path, contract_path, proof_path, run_path):
            require_member(backed, batch, path)
        report = read_json(report_path)
        structural = read_json(structural_path)
        contract = read_json(contract_path)
        proof = read_json(proof_path)
        run = read_json(run_path)
        webgl_row = webgl_rows.get(candidate_id)
        assessment_row = assessment_rows.get(candidate_id)
        if (row["body"]["sha256"] != sha256(body)
                or report.get("schema") != "ggd-bedrock-native-animation-glb-conversion@1"
                or report.get("output", {}).get("sha256") != sha256(body)
                or structural.get("schema") != "ggd-bedrock-glb-structural-readback@1"
                or structural.get("valid") is not True
                or structural.get("structure", {}).get("animationCount") != row["convertedNativeClipCount"]
                or contract.get("khronos", {}).get("issues", {}).get("numErrors") != 0
                or contract.get("khronos", {}).get("issues", {}).get("numWarnings") != 0
                or contract.get("ggdInspection", {}).get("budget", {}).get("errors") != []
                or proof.get("schema") != "ggd.fateubw-native-motion-webgl@1"
                or proof.get("model", {}).get("animationGroups") != row["convertedNativeClipCount"]
                or run.get("complete") is not True or run.get("errorExists") is not False
                or webgl_row is None or webgl_row.get("bodySha256") != sha256(body)
                or webgl_row.get("shots") != row["convertedNativeClipCount"] * 4
                or assessment_row is None
                or assessment_row.get("animationGroups") != row["convertedNativeClipCount"]):
            raise ValueError("incomplete native conversion evidence: " + candidate_id)
        expected_names = [clip["name"] for clip in report["clips"] if clip["converted"]]
        if expected_names != row["convertedClipNames"]:
            raise ValueError("converted clip list drifted: " + candidate_id)
        attempt_id = candidate_id + "-native-motion-reserve-v1"
        legacy = {"s3Uri": receipt["s3Uri"], "s3ArchiveMember": candidate_id + "/body.glb",
                  "manifestUri": receipt["manifestUri"], "archiveSha256": receipt["archiveSha256"],
                  "readbackVerified": True, "receiptPath": str(receipt_path),
                  "receiptSha256": sha256(receipt_path), "s3Use": "backup-only-not-runtime-entry"}
        entry = {
            "id": attempt_id, "candidateId": candidate_id,
            "conversionInstanceId": candidate_id + "-native-motion-v1", "status": STATUS,
            "sourceClass": "community-mod", "platform": "Minecraft Java 1.21.1",
            "nativeFucPsp": False, "localPath": str(directory), "body": file_record(body),
            "converterReport": file_record(report_path), "structuralReadback": file_record(structural_path),
            "contractValidation": file_record(contract_path),
            "nativeAnimations": {
                "classification": "community-mod-native-animation-json",
                "sourceClipCount": row["sourceClipCount"],
                "convertedClipCount": row["convertedNativeClipCount"],
                "unconvertedClipCount": row["unconvertedClipCount"],
                "convertedClipNames": row["convertedClipNames"],
                "retainedUnconvertedClips": row["retainedClipRows"],
                "rotationSamplingFps": manifest["rotationSamplingFps"],
                "eventMapComplete": False,
            },
            "webglPhaseReview": {"proof": file_record(proof_path), "run": file_record(run_path),
                                 "animationGroups": webgl_row["animationGroups"], "shots": webgl_row["shots"],
                                 "sampledVisibleBodyMotionGroups": assessment_row["sampledVisibleBodyMotionGroups"],
                                 "sampledUnchangedBodyGroups": assessment_row["sampledUnchangedBodyGroups"],
                                 "continuousPlaybackAccepted": False, "sourceEngineCurveParity": False},
            "batchEvidence": {"manifest": file_record(manifest_path), "webgl": file_record(webgl_batch_path),
                              "visualAssessment": file_record(assessment_path), "manualReview": file_record(manual_path),
                              "contactSheet": file_record(contact_path)},
            "legacyBackup": legacy,
            "runtimeReady": False, "backendSelectionVerified": False, "defaultEligible": False,
            "deploymentStatus": "not-deployed",
            "missing": ["redistribution permission for ARR source",
                        "continuous playback review and source-engine curve parity",
                        "weapon and held-item attachment geometry",
                        "unsupported formula and no-duration source clips",
                        "GGD action and event mapping", "GGD backend import and selection verification"],
        }
        prior = [item for item in attempts if item["id"] == attempt_id]
        if prior and prior != [entry]:
            raise ValueError("existing attempt differs: " + attempt_id)
        if not prior:
            attempts.append(entry)
        candidate.update({
            "readyStage": STATUS,
            "manualVisualReview": "accepted-native-motion-reserve-midpoint-only",
            "nativeMotionStandardization": {
                "attemptId": attempt_id, "status": STATUS, "rigConverted": True,
                "nativeAnimationConverted": True,
                "sourceClipCount": row["sourceClipCount"],
                "convertedClipCount": row["convertedNativeClipCount"],
                "unconvertedClipCount": row["unconvertedClipCount"],
                "visualReview": "accepted-native-motion-reserve-midpoint-only",
                "continuousPlaybackAccepted": False, "sourceEngineCurveParity": False,
                "rightsReview": "pending", "eventMapComplete": False,
                "runtimeReady": False, "backendSelectionVerified": False, "defaultEligible": False,
            },
        })
    heracles = candidates.get("fateubw-heracles_berserker")
    if heracles is None or "nativeMotionStandardization" in heracles:
        raise ValueError("Heracles must remain an explicit static-only pending candidate")
    source["readiness"] = "partial-native-motion-reserve-13-of-14-khronos-webgl-phase-validated-pending-parity-rights-event-map-backend"
    source["verification"] = (
        "14名英靈靜態模型已完成結構、Khronos與WebGL驗證。13名平移休息骨架英靈另轉為剛性蒙皮GLB，"
        "115個來源片段中98段數值原生動作已轉換；全部Khronos 0錯誤/0警告、GGD預算0錯誤，"
        "Babylon WebGL完成98組、392張分段播放證據。人工檢視98張中點圖未見爆模或非有限姿勢；"
        "6段summon只動到未納入身體GLB的配件骨節，17段公式或無時長片段未轉換。Heracles因來源休息骨架含旋轉仍待獨立轉換。"
        "ARR再散布權、連續播放/來源引擎曲線一致性、武器配件、GGD事件映射、後台選項與部署均未完成。"
    )
    source["backendIntegration"] = {
        "required": True, "state": "pending-rights-parity-event-map-and-backend-selection",
        "heroIds": source.get("heroIds", []), "ownerEntryIds": source.get("ownerEntryIds", []),
        "release": None, "selectionVerified": False,
    }
    if sources_path.read_bytes() != original:
        raise ValueError("source index changed during registration")
    sources_path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"sourceId": SOURCE_ID, "registeredCandidates": len(records),
                      "convertedNativeClips": counts["convertedNativeClips"],
                      "pendingHeracles": True, "runtimeReady": False}, ensure_ascii=False))


if __name__ == "__main__":
    main()
