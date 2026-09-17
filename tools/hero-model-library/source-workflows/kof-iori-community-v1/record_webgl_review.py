#!/usr/bin/env python3
"""Register a fully backed, bounded Iori static-body WebGL review without runtime promotion."""
import argparse
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
ASSET_ROOT = ROOT.parent / "GGD-Asset-Library"
SOURCE_ID = "thunderstore-iori"
BODY = ASSET_ROOT / "conversions/iori-community-body-v1/native-glb/body.glb"
REVIEW_DIR = ASSET_ROOT / "conversions/iori-community-body-v1/webgl-visual-review-v1"
DOWNLOADS = ROOT / "materials/hero-model-library/download-sources.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_json(path: Path):
    return json.loads(path.read_text())


def file_record(path: Path):
    return {"path": str(path), "bytes": path.stat().st_size, "sha256": sha256(path)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--receipt", type=Path, required=True,
                        help="Fully verified legacy backup receipt for the frozen review directory.")
    args = parser.parse_args()
    review = read_json(REVIEW_DIR / "review.json")
    run = read_json(REVIEW_DIR / "run.json")
    proof = read_json(REVIEW_DIR / "proof.json")
    if (review.get("schema") != "ggd-iori-community-webgl-static-review@1"
            or review.get("candidateId") != "thunderstore-iori-kof-static-skinned-v1"
            or review.get("sourceGlb") != file_record(BODY)
            or review.get("manualReview", {}).get("status") != "reviewed-static-body-only"
            or review.get("result", {}).get("staticBodyAccepted") is not True
            or review["result"].get("runtimeReady") is not False
            or run.get("complete") is not True or run.get("proofExists") is not True
            or run.get("errorExists") is not False or run.get("images") != 3
            or proof.get("animationGroups") != 0 or proof.get("gameplayAcceptance") is not False):
        raise ValueError("Iori review is not a bounded static-body acceptance")
    receipt = read_json(args.receipt)
    if (receipt.get("schema") != "ggd-intake-backup-receipt@1"
            or not all(receipt.get(key) is True for key in ["fullGetVerified", "allMemberSha256Verified", "localUnchanged"])
            or Path(receipt.get("source", "")).resolve() != REVIEW_DIR.resolve()):
        raise ValueError("Review backup receipt is incomplete or targets another directory")
    manifest = read_json(Path(receipt["manifest"]))
    required = {path.name: file_record(path) for path in [
        REVIEW_DIR / "front.png", REVIEW_DIR / "back.png", REVIEW_DIR / "isometric.png",
        REVIEW_DIR / "proof.json", REVIEW_DIR / "run.json", REVIEW_DIR / "review.json",
    ]}
    backed = {row["path"]: row for row in manifest["files"]}
    for name, record in required.items():
        expected = {"path": name, "bytes": record["bytes"], "sha256": record["sha256"]}
        if backed.get(name) != expected:
            raise ValueError(f"Verified review archive is missing or changed: {name}")
    data = read_json(DOWNLOADS)
    sources = [source for source in data["publicSources"] if source["id"] == SOURCE_ID]
    if len(sources) != 1:
        raise ValueError("Expected exactly one Iori source record")
    source = sources[0]
    candidates = [candidate for candidate in source.get("modelCandidates", [])
                  if candidate.get("candidateId") == review["candidateId"]]
    if len(candidates) != 1:
        raise ValueError("Expected exactly one Iori model candidate")
    candidate = candidates[0]
    review_location = {
        "s3Uri": receipt["s3Uri"], "s3ArchiveMember": "review.json", "s3Use": "evidence-backup-only-not-runtime-entry",
        "backupReceiptPath": str(args.receipt.resolve()), "backupReceiptSha256": sha256(args.receipt),
    }
    candidate.update({
        "readyStage": "glb-structural-and-webgl-static-body-validated-pending-rights-actions-backend",
        "manualVisualReview": "reviewed-static-body-only",
        "webglVisualReview": {
            "review": file_record(REVIEW_DIR / "review.json"),
            "proof": file_record(REVIEW_DIR / "proof.json"),
            "run": file_record(REVIEW_DIR / "run.json"),
            "images": {name: file_record(REVIEW_DIR / f"{name}.png") for name in ("front", "back", "isometric")},
            "engine": f"Babylon {proof['babylonVersion']}",
            "scope": "reviewed-static-body-only",
            "sourceGameShaderParity": False,
            "gameplayAcceptance": False,
            "backup": review_location,
        },
        "limitations": [
            "No native animation, audio or standalone VFX assets were present in the source bundle.",
            "Three WebGL views validate only static-body completeness and basic material visibility; original KOF shader parity is not proven.",
            "This is a community MOD source, not verified as a direct KOF game extraction or a licensed redistribution asset.",
            "No GGD action retargeting, gameplay test, backend dropdown registration, default selection or deployment has been performed.",
        ],
        "runtimeReady": False, "backendSelectionVerified": False, "defaultChanged": False,
        "defaultEligible": False, "automaticEligible": False,
    })
    source["readiness"] = "converted-glb-structural-and-webgl-static-body-validated-pending-rights-action-integration"
    source["verification"] = (
        "已將 IoriKOF bundle 的2個蒙皮網格轉為自包含GLB：26,795頂點、14,704三角面、2材質/2貼圖、2組各100骨節；"
        "所有權重、關節引用、有限值及座標轉換檢查通過。Babylon WebGL 已載入兩個GPU蒙皮網格與兩張來源 albedo 貼圖，"
        "前／後／等角三視圖的靜態身體、四肢連接與材質可見性已人工驗收。原始AnimationClip=0，未取得音效/語音/VFX；"
        "未驗證原作KOF shader、權利、動作整合、後台下拉、預設選擇、遊戲測試或部署。"
    )
    source["backendIntegration"] = {
        "required": True, "state": "pending-rights-action-integration-and-backend-selection",
        "heroIds": ["community-review-02-20260907"], "ownerEntryIds": [], "release": None,
        "selectionVerified": False,
    }
    DOWNLOADS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"sourceId": SOURCE_ID, "candidateId": candidate["candidateId"],
                      "readiness": source["readiness"], "reviewReceipt": review_location}, ensure_ascii=False))


if __name__ == "__main__":
    main()
