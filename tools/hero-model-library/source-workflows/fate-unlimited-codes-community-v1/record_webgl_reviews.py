#!/usr/bin/env python3
"""Register backed Fate/UC community-MOD static-body reviews without runtime promotion."""
import argparse
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
ASSET_ROOT = ROOT.parent / "GGD-Asset-Library"
REVIEW_ROOT = ASSET_ROOT / "conversions/fuc-community-webgl-review-v1"
DOWNLOADS = ROOT / "materials/hero-model-library/download-sources.json"
SOURCE_TO_CANDIDATES = {
    "gamebanana-fuc-rin-474593": ["fuc-mod-rin-rin", "fuc-mod-rin-homurahara", "fuc-mod-rin-rinb", "fuc-mod-rin-extra"],
    "gamebanana-fuc-shirou-473819": ["fuc-mod-shirou-casual", "fuc-mod-shirou-homurahara", "fuc-mod-shirou-casual-b", "fuc-mod-shirou-satsujinki"],
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_json(path: Path):
    return json.loads(path.read_text())


def file_record(path: Path) -> dict:
    return {"path": str(path), "bytes": path.stat().st_size, "sha256": sha256(path)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    review = read_json(REVIEW_ROOT / "review.json")
    if (review.get("schema") != "ggd.fate-unlimited-codes-community-webgl-static-review@1"
            or review.get("result", {}).get("staticBodyAccepted") is not True
            or review["result"].get("runtimeReady") is not False
            or set(review.get("variants", {})) != {candidate for values in SOURCE_TO_CANDIDATES.values() for candidate in values}):
        raise ValueError("Fate/UC review does not prove the required bounded static-body contract")
    receipt = read_json(args.receipt)
    if (receipt.get("schema") != "ggd-intake-backup-receipt@1"
            or not all(receipt.get(key) is True for key in ["fullGetVerified", "allMemberSha256Verified", "localUnchanged"])
            or Path(receipt.get("source", "")).resolve() != REVIEW_ROOT.resolve()):
        raise ValueError("Review backup receipt is incomplete or targets another directory")
    manifest = read_json(Path(receipt["manifest"]))
    backed = {item["path"]: item for item in manifest["files"]}
    review_record = file_record(REVIEW_ROOT / "review.json")
    if backed.get("review.json") != {"path": "review.json", "bytes": review_record["bytes"], "sha256": review_record["sha256"]}:
        raise ValueError("Verified review archive does not contain root review evidence")
    for candidate_id, details in review["variants"].items():
        label = details["label"]
        for name in ["proof.json", "run.json", "front.png", "back.png", "isometric.png"]:
            path = REVIEW_ROOT / label / name
            expected = {"path": f"{label}/{name}", "bytes": path.stat().st_size, "sha256": sha256(path)}
            if backed.get(expected["path"]) != expected:
                raise ValueError(f"Verified review archive missing {expected['path']}")
    review_location = {"s3Uri": receipt["s3Uri"], "s3ArchiveMember": "review.json",
                       "s3Use": "evidence-backup-only-not-runtime-entry",
                       "backupReceiptPath": str(args.receipt.resolve()), "backupReceiptSha256": sha256(args.receipt)}
    data = read_json(DOWNLOADS)
    source_map = {source["id"]: source for source in data["publicSources"]}
    for source_id, candidate_ids in SOURCE_TO_CANDIDATES.items():
        source = source_map.get(source_id)
        if source is None:
            raise ValueError(f"Missing source: {source_id}")
        candidates = {candidate["candidateId"]: candidate for candidate in source.get("modelCandidates", [])}
        if set(candidate_ids) - set(candidates):
            raise ValueError(f"Missing source candidate(s) for {source_id}")
        for candidate_id in candidate_ids:
            candidate = candidates[candidate_id]
            details = review["variants"][candidate_id]
            label = details["label"]
            candidate.update({
                "readyStage": "standard-glb-and-webgl-static-body-validated-pending-rights-actions-backend",
                "manualVisualReview": "reviewed-static-body-only",
                "webglVisualReview": {
                    "review": {**review_record, "candidateId": candidate_id},
                    "proof": details["proof"], "run": details["run"], "images": details["images"],
                    "engine": details["webgl"]["engine"], "scope": "reviewed-static-body-only",
                    "sourceGameShaderParity": False, "gameplayAcceptance": False, "backup": review_location,
                },
                "runtimeReady": False, "backendSelectionVerified": False, "defaultChanged": False,
                "defaultEligible": False, "automaticEligible": False,
                "limitations": [
                    "Original Fate/UC game platform, skeleton and animations are not proven; this is a Bomb Rush Cyberfunk community-MOD port.",
                    "Three WebGL views validate only static-body completeness and embedded material visibility; source-game toon-shader parity is not proven.",
                    "Dynamic hair/skirt MonoBehaviours are retained source data and were not executed or simulated in the GLB review.",
                    "No rights/republication approval, GGD action integration, backend dropdown registration, default selection, gameplay validation or deployment has been performed.",
                ],
            })
        source["readiness"] = "converted-webgl-static-body-validated-pending-rights-actions-backend"
        source["backendIntegration"] = {"required": True, "state": "pending-rights-action-integration-and-backend-selection",
                                        "selectionVerified": False}
        source["verification"] = (
            "完整 MOD 原包、4服裝 GLB與來源標示 PCM 已驗證；Khronos 0 error/0 warning、內嵌貼圖 SHA 通過。"
            "Babylon WebGL 已對4套服裝完成前／後／等角三視圖的靜態身體、四肢連接及材質可見性驗收。"
            "此為 Bomb Rush Cyberfunk 社群 MOD 轉接，PSP/PS2來源平台、原生骨架、原生動作與VFX均未證明；"
            "不代表 Fate/unlimited codes 原生庫已完成，也未完成權利、動作、後台或部署驗收。"
        )
    DOWNLOADS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"sources": list(SOURCE_TO_CANDIDATES), "variants": 8, "reviewReceipt": review_location}, ensure_ascii=False))


if __name__ == "__main__":
    main()
