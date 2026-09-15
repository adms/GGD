#!/usr/bin/env python3
"""Register the verified Heracles leaf-rest native-motion reserve without enabling it."""
import argparse
import hashlib
import json
from pathlib import Path


SOURCE_ID = "github-flemmli97-fateubw-07e9d79b"
CANDIDATE_ID = "fateubw-heracles_berserker"
DELIVERY_ID = "fateubw-heracles-native-motion-v1"
ATTEMPT_ID = CANDIDATE_ID + "-native-motion-reserve-v1"
STATUS = "native-motion-khronos-webgl-phase-validated-pending-source-engine-parity-rights-event-map-backend"
REST_BONES = [
    "Hair6", "Hair7", "LeftArmArmor", "LeftShinLower", "LeftShinLower2",
    "Nose", "RightArmArmor", "RightShinLower", "RightShinLower2",
]


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read(path):
    return json.loads(path.read_text())


def file_record(path):
    return {"path": str(path.resolve()), "sha256": sha256(path), "bytes": path.stat().st_size}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--conversion", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[4]
    root, receipt_path = args.conversion.resolve(), args.receipt.resolve()
    receipt = read(receipt_path)
    if (receipt.get("schema") != "ggd-intake-backup-receipt@1"
            or any(receipt.get(key) is not True for key in
                   ("fullGetVerified", "allMemberSha256Verified", "localUnchanged"))
            or Path(receipt.get("source", "")).resolve() != root):
        raise ValueError("conversion backup receipt is not a complete readback of this stage")
    backed = {row["path"]: row for row in read(Path(receipt["manifest"]))["files"]}

    paths = {
        "body": root / "body.glb",
        "converter": root / "conversion-report.json",
        "structural": root / "native-structural-readback.json",
        "contract": root / "contract-validation.json",
        "restParity": root / "rest-pose-parity-v2.json",
        "webglProof": root / "webgl-native-v1/proof.json",
        "webglRun": root / "webgl-native-v1/run.json",
        "visualAssessment": root / "visual-assessment.json",
        "manualReview": root / "manual-visual-review.json",
        "contactSheet": root / "midpoint-contact-sheet.png",
    }
    for name, path in paths.items():
        member = path.relative_to(root).as_posix()
        expected = {"path": member, "sha256": sha256(path), "bytes": path.stat().st_size}
        if backed.get(member) != expected:
            raise ValueError("verified archive lacks or mismatches " + name + ": " + member)

    conversion = read(paths["converter"])
    structural = read(paths["structural"])
    contract = read(paths["contract"])
    rest = read(paths["restParity"])
    proof = read(paths["webglProof"])
    run = read(paths["webglRun"])
    assessment = read(paths["visualAssessment"])
    manual = read(paths["manualReview"])
    converted_names = [row["name"] for row in conversion.get("clips", []) if row.get("converted")]
    retained = [row for row in conversion.get("clips", []) if not row.get("converted")]
    if (conversion.get("candidateId") != CANDIDATE_ID
            or conversion.get("output", {}).get("sha256") != sha256(paths["body"])
            or conversion.get("output", {}).get("animationCount") != 14
            or conversion.get("output", {}).get("unconvertedClipCount") != 3
            or conversion.get("transformPolicy", {}).get("restRotatedBones") != REST_BONES
            or structural.get("valid") is not True
            or structural.get("structure", {}).get("animationCount") != 14
            or contract.get("khronos", {}).get("issues", {}).get("numErrors") != 0
            or contract.get("khronos", {}).get("issues", {}).get("numWarnings") != 0
            or contract.get("ggdInspection", {}).get("budget", {}).get("errors") != []
            or rest.get("valid") is not True
            or rest.get("checks", {}).get("maxPositionAbsoluteError") != 0.0
            or rest.get("checks", {}).get("maxNormalAbsoluteError") != 0.0
            or proof.get("model", {}).get("animationGroups") != 14
            or run.get("complete") is not True or run.get("errorExists") is not False
            or assessment.get("counts") != {"animationGroups": 14, "shots": 56,
                                               "sampledVisibleBodyMotionGroups": 14,
                                               "sampledUnchangedBodyGroups": 0}
            or manual.get("review", {}).get("acceptedAs") != "native-motion-conversion-reserve"
            or manual.get("runtimeReady") is not False):
        raise ValueError("Heracles conversion evidence is incomplete or changed")

    sources_path = repo / "materials/hero-model-library/download-sources.json"
    original = sources_path.read_bytes()
    document = json.loads(original)
    source = next((row for row in document["publicSources"] if row["id"] == SOURCE_ID), None)
    if source is None:
        raise ValueError("frozen FateUBW source is absent")
    delivery = next((row for row in source.get("supplementalDeliveries", [])
                     if row.get("id") == DELIVERY_ID and row.get("sha256") == receipt["archiveSha256"]), None)
    if delivery is None or delivery.get("readbackVerified") is not True:
        raise ValueError("verified Heracles supplemental delivery is absent")
    candidate = next((row for row in source["modelCandidates"] if row["candidateId"] == CANDIDATE_ID), None)
    if candidate is None:
        raise ValueError("Heracles source candidate is absent")
    legacy = {
        "s3Uri": receipt["s3Uri"], "s3ArchiveMember": "body.glb",
        "manifestUri": receipt["manifestUri"], "archiveSha256": receipt["archiveSha256"],
        "readbackVerified": True, "receiptPath": str(receipt_path),
        "receiptSha256": sha256(receipt_path), "s3Use": "backup-only-not-runtime-entry",
    }
    entry = {
        "id": ATTEMPT_ID, "candidateId": CANDIDATE_ID,
        "conversionInstanceId": "fateubw-heracles-native-motion-v1", "status": STATUS,
        "sourceClass": "community-mod", "platform": "Minecraft Java 1.21.1",
        "nativeFucPsp": False, "localPath": str(root), "body": file_record(paths["body"]),
        "converterReport": file_record(paths["converter"]),
        "structuralReadback": file_record(paths["structural"]),
        "contractValidation": file_record(paths["contract"]),
        "restPoseParity": file_record(paths["restParity"]),
        "nativeAnimations": {
            "classification": "community-mod-native-animation-json",
            "sourceClipCount": 17, "convertedClipCount": 14, "unconvertedClipCount": 3,
            "convertedClipNames": converted_names, "retainedUnconvertedClips": retained,
            "rotationSamplingFps": 60, "eventMapComplete": False,
        },
        "restPosePolicy": {
            "classification": "unanimated-terminal-static-rotations-baked-with-full-inverse-bind",
            "restRotatedBones": REST_BONES,
            "allTerminal": True, "allUntargetedByNativeClips": True,
            "reviewedStaticMeshPositionError": 0.0, "reviewedStaticMeshNormalError": 0.0,
        },
        "webglPhaseReview": {
            "proof": file_record(paths["webglProof"]), "run": file_record(paths["webglRun"]),
            "visualAssessment": file_record(paths["visualAssessment"]),
            "manualReview": file_record(paths["manualReview"]),
            "contactSheet": file_record(paths["contactSheet"]),
            "animationGroups": 14, "shots": 56, "sampledVisibleBodyMotionGroups": 14,
            "sampledUnchangedBodyGroups": 0, "continuousPlaybackAccepted": False,
            "sourceEngineCurveParity": False,
        },
        "legacyBackup": legacy,
        "runtimeReady": False, "backendSelectionVerified": False, "defaultEligible": False,
        "deploymentStatus": "not-deployed",
        "missing": [
            "redistribution permission for ARR source",
            "continuous playback review and source-engine curve parity",
            "weapon and held-item attachment geometry",
            "idle no-duration clip and two formula-driven clips",
            "GGD action and event mapping", "GGD backend import and selection verification",
        ],
    }
    attempts = source.setdefault("conversionAttempts", [])
    prior = [row for row in attempts if row["id"] == ATTEMPT_ID]
    if prior and prior != [entry]:
        raise ValueError("existing Heracles attempt differs")
    if not prior:
        attempts.append(entry)
    candidate.update({
        "readyStage": STATUS,
        "manualVisualReview": "accepted-native-motion-reserve-midpoint-only",
        "nativeMotionStandardization": {
            "attemptId": ATTEMPT_ID, "status": STATUS, "rigConverted": True,
            "nativeAnimationConverted": True, "sourceClipCount": 17,
            "convertedClipCount": 14, "unconvertedClipCount": 3,
            "restPosePolicy": "unanimated-terminal-static-rotations-baked-with-full-inverse-bind",
            "visualReview": "accepted-native-motion-reserve-midpoint-only",
            "continuousPlaybackAccepted": False, "sourceEngineCurveParity": False,
            "rightsReview": "pending", "eventMapComplete": False,
            "runtimeReady": False, "backendSelectionVerified": False, "defaultEligible": False,
        },
    })
    source["readiness"] = "partial-native-motion-reserve-14-of-14-khronos-webgl-phase-validated-pending-parity-rights-event-map-backend"
    source["verification"] = (
        "14名英靈靜態模型均已完成結構、Khronos與WebGL驗證，並各有骨架及原生動作GLB。"
        "14名英靈132個來源片段中112段數值原生動作已轉換，20段公式／無時長片段保留未轉；"
        "全部Khronos 0錯誤/0警告、GGD預算0錯誤，Babylon WebGL共完成112組、448張分段播放證據。"
        "Heracles的9個靜態旋轉骨節均為未被動作命中的末端骨，採休息姿勢烘焙及完整逆綁定矩陣；"
        "與已接受靜態GLB的頂點及法線誤差皆為0。人工檢視112張中點圖未見爆模或非有限姿勢；"
        "6段summon只動到未納入身體GLB的配件骨節。ARR再散布權、連續播放/來源引擎曲線一致性、"
        "武器配件、GGD事件映射、後台選項與部署均未完成。"
    )
    if sources_path.read_bytes() != original:
        raise ValueError("source index changed during Heracles registration")
    sources_path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"candidateId": CANDIDATE_ID, "convertedNativeClips": 14,
                      "retainedUnconvertedClips": 3, "runtimeReady": False}, ensure_ascii=False))


if __name__ == "__main__":
    main()
