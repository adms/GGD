#!/usr/bin/env python3
"""Register Kirei's validated six-state MOD candidate without promoting it."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path


SOURCE_ID = "gamebanana-fuc-kotomine-kirei-291438"
CANDIDATE_ID = "fuc-mod-kotomine-kirei-sven"
ATTEMPT_ID = "fuc-mod-kotomine-kirei-sven-ggd-six-state-v1"
STATUS = "ggd-six-state-subset-contract-and-webgl-validated-pending-rights-semantic-gameplay-backend"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def record(path: Path) -> dict:
    return {"path": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha256(path)}


def read(path: Path):
    return json.loads(path.read_text())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--stage", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    repo, stage, receipt_path = args.repo.resolve(), args.stage.resolve(), args.receipt.resolve()
    review_path = stage / "review.json"
    review, receipt = read(review_path), read(receipt_path)
    result = review.get("result", {})
    if (review.get("schema") != "ggd.fuc-kotomine-kirei-six-state-review@1"
            or result.get("currentGgdContractAccepted") is not True
            or result.get("webglPhaseReviewAccepted") is not True
            or result.get("fateNativeMotion") is not False
            or result.get("semanticRoleMappingAccepted") is not False
            or result.get("runtimeReady") is not False):
        raise ValueError("bounded Kirei review is incomplete")
    if (receipt.get("schema") != "ggd-intake-backup-receipt@1"
            or not all(receipt.get(key) is True for key in ("fullGetVerified", "allMemberSha256Verified", "localUnchanged"))
            or Path(receipt.get("source", "")).resolve() != stage):
        raise ValueError("stage backup receipt is incomplete or targets another directory")
    backed = {row["path"]: row for row in read(Path(receipt["manifest"]))["files"]}
    required = [
        "body.glb", "preflight.glb", "conversion-preflight.json", "preparation.json", "review.json",
        "webgl/proof.json", "webgl/run.json", "webgl/kirei-six-motion-contact-sheet.png",
    ]
    for relative in required:
        path = stage / relative
        expected = {"path": relative, "bytes": path.stat().st_size, "sha256": sha256(path)}
        if backed.get(relative) != expected:
            raise ValueError(f"verified archive lacks {relative}")

    downloads_path = repo / "materials/hero-model-library/download-sources.json"
    document = read(downloads_path)
    source = next((row for row in document["publicSources"] if row["id"] == SOURCE_ID), None)
    if source is None:
        raise ValueError("Kirei source is absent")
    candidate = next((row for row in source.get("modelCandidates", []) if row["candidateId"] == CANDIDATE_ID), None)
    if candidate is None or candidate.get("sha256") != review["source"]["sha256"]:
        raise ValueError("Kirei source candidate changed")
    legacy = {
        "s3Uri": receipt["s3Uri"],
        "manifestUri": receipt["manifestUri"],
        "archiveSha256": receipt["archiveSha256"],
        "s3ArchiveMember": "body.glb",
        "readbackVerified": True,
        "receiptPath": str(receipt_path),
        "receiptSha256": sha256(receipt_path),
        "s3Use": "candidate-evidence-backup-only-not-runtime-entry",
    }
    attempt = {
        "id": ATTEMPT_ID,
        "candidateId": CANDIDATE_ID,
        "status": STATUS,
        "sourceClass": "community-mod",
        "originalPlatform": "unknown",
        "targetModPlatform": "Sven Co-op / GoldSrc",
        "localPath": str(stage),
        "body": review["body"],
        "preflight": review["preflight"],
        "conversionPreflight": review["conversionPreflight"],
        "preparation": review["preparation"],
        "review": record(review_path),
        "motionSelection": review["motions"],
        "fullSourceAnimationEntries": 349,
        "candidateAnimationEntries": 6,
        "omittedEntriesPreservedInFullSource": 343,
        "yawOffsetDeg": 90,
        "webglPhaseReview": review["webgl"],
        "legacyBackup": legacy,
        "currentGgdContractAccepted": True,
        "currentGgdBudgetAccepted": True,
        "khronosAccepted": True,
        "fateNativeMotion": False,
        "semanticRoleMappingAccepted": False,
        "continuousPlaybackAccepted": False,
        "runtimeReady": False,
        "runtimeSelectable": False,
        "backendSelectionVerified": False,
        "defaultChanged": False,
        "defaultEligible": False,
        "deploymentStatus": "not-deployed",
        "missing": review["manualReview"]["limitations"],
    }
    attempts = source.setdefault("conversionAttempts", [])
    prior = [row for row in attempts if row.get("id") == ATTEMPT_ID]
    if prior and prior != [attempt]:
        raise ValueError("existing Kirei attempt differs")
    if not prior:
        attempts.append(attempt)
    candidate.update({
        "readyStage": STATUS,
        "manualVisualReview": "reviewed-six-state-webgl-phase-samples-candidate-only",
        "ggdSixStateCandidate": {
            "attemptId": ATTEMPT_ID,
            "status": STATUS,
            "body": review["body"],
            "clipMap": read(stage / "preparation.json")["output"]["model"]["clipMap"],
            "yawOffsetDeg": 90,
            "motionOrigin": "Sven Co-op/GoldSrc MOD",
            "fateNativeMotion": False,
            "fullSourceAnimationEntries": 349,
            "candidateAnimationEntries": 6,
            "omittedEntriesPreservedInFullSource": 343,
            "currentGgdContractAccepted": True,
            "currentGgdBudgetAccepted": True,
            "khronosAccepted": True,
            "webglPhaseReviewAccepted": True,
            "semanticRoleMappingAccepted": False,
            "continuousPlaybackAccepted": False,
            "runtimeReady": False,
            "runtimeSelectable": False,
            "backendSelectionVerified": False,
            "defaultEligible": False,
            "legacyBackup": legacy,
        },
        "runtimeReady": False,
        "runtimeSelectable": False,
        "backendSelectionVerified": False,
        "defaultChanged": False,
        "defaultEligible": False,
        "limitations": [
            "Original Fate/unlimited codes PSP/PS2 platform is not proven; this is a Sven Co-op/GoldSrc community-MOD body and motion set.",
            "Six GGD role mappings are provisional; gutshot falls to the ground and needs gameplay recovery/transition review.",
            "Continuous playback, loop seams, root-motion policy, source-engine events/controllers and shader parity are not accepted.",
            "Redistribution permission, backend selection and deployment remain pending.",
        ],
    })
    source["readiness"] = STATUS
    source["backendIntegration"] = {"required": True, "state": "pending-rights-semantic-gameplay-and-backend-selection", "selectionVerified": False}
    source["verification"] = (
        "完整Sven/GoldSrc MOD原包、18.7MB GLB與349個動作項均保留；另以固定來源SHA可重建裁出6段時間變化候選。"
        "預處理把3個同骨架且無額外變換的mesh節點合併，清除沒有payload的2個不支援擴充宣告，"
        "並只在候選排除343段、未從完整來源刪除。最終body.glb經GGD正式prepare/verify，8 draw合併為4、"
        "4812三角面、4貼圖、17個glTF weighted joints、6段片段，Khronos 0錯誤0警告、GGD預算0錯誤。"
        "Babylon 7.54.3 WebGL已跑6組24張分段姿勢，18個Babylon bones且4個mesh皆GPU蒙皮；完整身體可見。"
        "動作屬社群MOD而非Fate原生，六用途語意、連續播放、事件、權利、後台選項與部署仍未驗收。"
    )

    evidence_dir = repo / "materials/hero-model-library/reviews/fate-mod-models-20260910"
    evidence_dir.mkdir(parents=True, exist_ok=True)
    contact_dest = evidence_dir / "kirei-six-state-candidate-contact-sheet.png"
    review_dest = evidence_dir / "kirei-six-state-candidate-review.json"
    contact_source = stage / "webgl/kirei-six-motion-contact-sheet.png"
    if contact_dest.exists() and sha256(contact_dest) != sha256(contact_source):
        raise ValueError("existing Git contact sheet differs")
    shutil.copyfile(contact_source, contact_dest)
    public_review = {
        "schema": review["schema"],
        "candidateId": CANDIDATE_ID,
        "status": STATUS,
        "body": review["body"],
        "preparation": review["preparation"],
        "webgl": review["webgl"],
        "motions": review["motions"],
        "manualReview": review["manualReview"],
        "result": review["result"],
        "legacyBackup": legacy,
        "gitEvidence": {"contactSheet": contact_dest.relative_to(repo).as_posix()},
    }
    encoded = json.dumps(public_review, ensure_ascii=False, indent=2) + "\n"
    if review_dest.exists() and review_dest.read_text() != encoded:
        raise ValueError("existing Git review differs")
    review_dest.write_text(encoded)
    downloads_path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"candidateId": CANDIDATE_ID, "status": STATUS, "runtimeReady": False, "gitEvidence": str(review_dest)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
