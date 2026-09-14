#!/usr/bin/env python3
"""Register verified Dark Sakura static-body review evidence without runtime promotion."""
import argparse
import hashlib
import json
from pathlib import Path


SOURCE_ID = "gamebanana-fuc-dark-sakura-492607"
CANDIDATES = {"fuc-mod-dark-sakura-p1", "fuc-mod-dark-sakura-p2"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read(path: Path):
    return json.loads(path.read_text())


def record(path: Path) -> dict:
    return {"path": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha256(path)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--workspace-root", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    repo = args.repo.resolve()
    workspace = args.workspace_root.resolve()
    review_root = workspace / "GGD-Asset-Library/conversions/fuc-dark-sakura-webgl-review-v1"
    review_path = review_root / "review.json"
    review = read(review_path)
    if (review.get("schema") != "ggd.fuc-dark-sakura-webgl-review@1"
            or review.get("result", {}).get("staticBodyAccepted") is not True
            or review["result"].get("currentGgdBudgetAccepted") is not True
            or review["result"].get("runtimeReady") is not False
            or set(review.get("variants", {})) != CANDIDATES):
        raise ValueError("Review does not prove the bounded Dark Sakura contract")
    receipt_path = args.receipt.resolve()
    receipt = read(receipt_path)
    if (receipt.get("schema") != "ggd-intake-backup-receipt@1"
            or not all(receipt.get(key) is True for key in ("fullGetVerified", "allMemberSha256Verified", "localUnchanged"))
            or Path(receipt.get("source", "")).resolve() != review_root.resolve()):
        raise ValueError("Review backup receipt is incomplete or targets another directory")
    manifest = read(Path(receipt["manifest"]))
    backed = {item["path"]: item for item in manifest["files"]}
    required = ["review.json", "contract-validation.json"]
    for details in review["variants"].values():
        required.append(f"{details['label']}/contract-validation.json")
        required.extend(f"{details['label']}/webgl/{name}" for name in
                        ("proof.json", "run.json", "front.png", "back.png", "isometric.png"))
    for relative in required:
        path = review_root / relative
        expected = {"path": relative, "bytes": path.stat().st_size, "sha256": sha256(path)}
        if backed.get(relative) != expected:
            raise ValueError(f"Verified review archive missing {relative}")
    review_record = record(review_path)
    backup = {
        "s3Uri": receipt["s3Uri"],
        "s3ArchiveMember": "review.json",
        "s3Use": "evidence-backup-only-not-runtime-entry",
        "backupReceiptPath": str(receipt_path),
        "backupReceiptSha256": sha256(receipt_path),
    }
    downloads_path = repo / "materials/hero-model-library/download-sources.json"
    data = read(downloads_path)
    sources = [row for row in data["publicSources"] if row["id"] == SOURCE_ID]
    if len(sources) != 1:
        raise ValueError("Expected one Dark Sakura source")
    source = sources[0]
    candidates = {row["candidateId"]: row for row in source.get("modelCandidates", [])}
    if set(candidates) != CANDIDATES:
        raise ValueError("Unexpected Dark Sakura candidates")
    for candidate_id, details in review["variants"].items():
        candidate = candidates[candidate_id]
        if candidate.get("sha256") != details["sourceGlb"]["sha256"]:
            raise ValueError(f"Candidate bytes changed: {candidate_id}")
        candidate.update({
            "readyStage": "standard-glb-current-budget-and-webgl-static-body-validated-pending-rights-actions-backend",
            "manualVisualReview": "reviewed-static-body-only",
            "ggdContractValidation": {
                "batch": review["contractValidation"],
                "candidate": details["contractValidation"],
                "allKhronosErrorsZero": True,
                "allKhronosWarningsZero": True,
                "allGgdBudgetErrorsZero": True,
                "contractCommit": read(review_root / "contract-validation.json")["contractCommit"],
            },
            "webglVisualReview": {
                "review": {**review_record, "candidateId": candidate_id},
                "proof": details["proof"],
                "run": details["run"],
                "images": details["images"],
                "engine": details["webgl"]["engine"],
                "scope": "reviewed-static-body-only",
                "sourceGameShaderParity": False,
                "gameplayAcceptance": False,
                "backup": backup,
            },
            "runtimeReady": False,
            "runtimeSelectable": False,
            "backendSelectionVerified": False,
            "defaultChanged": False,
            "defaultEligible": False,
            "automaticEligible": False,
            "limitations": [
                "Original Fate/unlimited codes PSP/PS2 platform, skeleton and native animations are not proven; this is a Bomb Rush Cyberfunk community-MOD port.",
                "Static WebGL review proves body completeness and embedded material visibility only; the source toon shader and dynamic hair/skirt MonoBehaviours are not reproduced.",
                "This candidate has no native or approved GGD action clips.",
                "No rights/republication approval, backend dropdown registration, gameplay validation or deployment has been performed.",
            ],
        })
    source["readiness"] = "converted-current-budget-and-webgl-static-body-validated-pending-rights-actions-backend"
    source["backendIntegration"] = {
        "required": True,
        "state": "pending-rights-action-integration-and-backend-selection",
        "selectionVerified": False,
    }
    source["verification"] = (
        "完整 MOD 原包、4筆來源服裝關係、2個不同SHA的P1/P2 GLB與15個來源標示PCM均保留；"
        "兩GLB通過目前分支的GGD匯入檢查與英雄預算，Khronos均為0錯誤0警告。"
        "Babylon 7.54.3 WebGL已各完成前／後／等角三視圖，57骨節GPU蒙皮、完整身體及內嵌材質可見性通過。"
        "此為Bomb Rush Cyberfunk社群MOD轉接；PSP/PS2原生平台、原生骨架／動作／VFX、toon shader、動態頭髮／裙襬、"
        "語音語言與事件、權利、後台切換、遊戲驗收及部署仍未完成。"
    )
    source["supplementalReview"] = {"review": review_record, "backup": backup}
    downloads_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"source": SOURCE_ID, "candidates": len(CANDIDATES), "review": review_record, "backup": backup}, ensure_ascii=False))


if __name__ == "__main__":
    main()
