#!/usr/bin/env python3
"""Publish the Bojji crown candidate inventory after central registration."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
WORKSPACE = REPO.parent
LOCAL = WORKSPACE / "GGD-Asset-Library/conversions/bojji-crown-v1"
OUTPUT = REPO / "materials/hero-model-library/source-inventories/bojji-crown-v1"
CENTRAL_INVENTORY = REPO / "materials/hero-model-library/inventory.json"
CURRENT_RESOURCES = REPO / "materials/asset-library/current-resources.json"
MODEL_BUDGET_REPORT = REPO / "content/assets/model-budget/report.json"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def encoded(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def pin(path: Path) -> dict:
    data = path.read_bytes()
    return {"absolutePath": str(path.resolve()), "bytes": len(data), "sha256": digest(data)}


def outputs(local: Path) -> dict[Path, bytes]:
    build = json.loads((local / "build-receipt.json").read_text())
    validation = json.loads((local / "validation.json").read_text())
    visual = json.loads((local / "visual-evidence.json").read_text())
    registration_path = OUTPUT / "registration-receipt.json"
    registration = json.loads(registration_path.read_text())
    central_inventory = json.loads(CENTRAL_INVENTORY.read_text())
    current_resources = json.loads(CURRENT_RESOURCES.read_text())
    model_budget = json.loads(MODEL_BUDGET_REPORT.read_text())
    candidate = local / "candidate.glb"
    assert pin(candidate)["sha256"] == validation["candidate"]["sha256"] == build["output"]["sha256"]
    assert validation["metrics"] == {
        "triangles": 7229,
        "sourceTriangles": 7165,
        "crownTriangles": 64,
        "drawPrimitives": 3,
        "maxTextureEdge": 256,
        "skinCount": 1,
        "jointCount": 54,
        "sourceNativeClipCount": 5,
        "maxChannelsPerClip": 66,
    }
    assert validation["currentLimits"]["ownerCandidateTrianglesMax"] == 8000
    assert validation["khronos"]["errors"] == validation["khronos"]["warnings"] == 0
    assert validation["ggdBudget"]["errors"] == []
    assert visual["summary"] == {"views": 3, "complete": 3, "renderErrors": 0, "ownerVisualReviewPending": True}
    assert registration["schema"] == "ggd.bojji-crown-registration-receipt@1"
    assert registration["sourceModel"]["glb"]["sha256"] == validation["candidate"]["sha256"]
    assert registration["registeredVersion"]["automaticEligible"] is True
    assert registration["selection"]["crownCandidateSelected"] is True
    assert registration["status"] == {
        "promotedToGit": True,
        "registered": True,
        "runtimeSelectable": True,
        "automaticEligible": True,
        "currentAutomaticSelected": True,
        "productionDeployed": False,
    }
    hero_inventory = next(row for row in central_inventory["heroes"] if row.get("id") == "b2-bojji")
    assert hero_inventory["checkoutSelection"] == {
        "modelKey": registration["registeredVersion"]["modelKey"],
        "mode": "automatic",
    }
    hero_option = next(
        row for row in hero_inventory["options"]
        if row.get("asset", {}).get("modelKey") == registration["sourceModel"]["modelKey"]
    )
    assert hero_option["asset"]["sha256"] == validation["candidate"]["sha256"]
    resource_row = next(
        row for row in current_resources["models"]
        if row.get("modelKey") == registration["sourceModel"]["modelKey"]
    )
    assert resource_row["sha256"] == validation["candidate"]["sha256"]
    assert resource_row["registeredFor"] == ["b2-bojji"]
    assert resource_row["runtimeDropdownRegistered"] is True
    assert resource_row["registrationEvidence"]["versionModelKeys"] == [registration["registeredVersion"]["modelKey"]]
    budget_row = next(
        row for row in model_budget["models"]
        if row.get("id") == registration["registeredVersion"]["modelKey"]
    )
    assert budget_row["path"] == f"assets/models/community/versions/{validation['candidate']['sha256']}.glb"
    assert budget_row["role"] == "champion"
    assert budget_row["triangles"] == validation["metrics"]["triangles"]
    assert budget_row["drawCalls"] == validation["metrics"]["drawPrimitives"]
    assert budget_row["maxTextureEdge"] == validation["metrics"]["maxTextureEdge"]
    assert budget_row["animChannels"] == validation["metrics"]["maxChannelsPerClip"]
    assert budget_row["verdicts"] == {
        "triangles": "ok",
        "drawCalls": "ok",
        "maxTextureEdge": "ok",
        "animChannels": "ok",
    }
    inventory = {
        "schema": "ggd.hero-model-source-inventory@1",
        "sourceId": "derivative:bojji-crown-v1",
        "hero": {"heroId": "b2-bojji", "nameZh": "波吉", "workZh": "國王排名"},
        "source": {
            "sourceId": "derivative:bojji",
            "description": "使用者核准的小桐人寵物獨立完整副本（藍色上身、白色下身）",
            "gitPath": "content/assets/models/community/versions/745fe9a31c9ed44098f7d92984de88e81f5ddf6605c7327f327ddcd82ee96581.glb",
            "sha256": validation["source"]["sha256"],
            "retainedUnchanged": True,
        },
        "candidate": {
            **pin(candidate),
            "gitPath": registration["sourceModel"]["glb"]["gitPath"],
            "sourceModelKey": registration["sourceModel"]["modelKey"],
            "registeredVersionModelKey": registration["registeredVersion"]["modelKey"],
            "candidateId": "bojji-crown-head-weighted-v1",
            "selectionClass": "owner-manual-derivative-candidate",
            "changes": ["新增小型金黃色四尖王冠", "每個王冠頂點 100% 綁到 Bip001 Head", "保留原版完整 GLB 作為另一選項"],
            "metrics": validation["metrics"],
            "motion": {
                "origin": "source-native-to-proxy; borrowed-for-target-hero",
                "nativeToBojji": False,
                "sourceNativeClipsPreserved": 5,
                "generatedClips": 0,
                "maxChannelsPerClip": 66,
            },
            "attachment": validation["attachment"],
            "policy": {
                "ownerMaximumTriangles": 8000,
                "trianglesPass": validation["metrics"]["triangles"] <= 8000,
                "drawPrimitivesMaximum": 6,
                "drawPrimitivesPass": validation["metrics"]["drawPrimitives"] <= 6,
                "maxTextureEdge": 256,
                "texturePass": validation["metrics"]["maxTextureEdge"] <= 256,
                "maxChannelsPerClip": 300,
                "channelsPass": validation["metrics"]["maxChannelsPerClip"] <= 300,
                "ggdBudgetErrors": validation["ggdBudget"]["errors"],
                "khronosErrors": validation["khronos"]["errors"],
                "khronosWarnings": validation["khronos"]["warnings"],
            },
        },
        "evidence": {
            "buildReceipt": pin(local / "build-receipt.json"),
            "validation": pin(local / "validation.json"),
            "visualEvidence": pin(local / "visual-evidence.json"),
            "registrationReceipt": {"gitPath": "materials/hero-model-library/source-inventories/bojji-crown-v1/registration-receipt.json", **pin(registration_path)},
            "localContactSheet": visual["contactSheet"],
            "gitContactSheet": "materials/hero-model-library/source-inventories/bojji-crown-v1/bojji-crown-ab.png",
            "views": visual["records"],
            "centralIndexes": {
                "modelInventory": {
                    "gitPath": "materials/hero-model-library/inventory.json",
                    "heroId": "b2-bojji",
                    "checkoutSelection": hero_inventory["checkoutSelection"],
                    "sourceModelKey": hero_option["asset"]["modelKey"],
                },
                "currentResources": {
                    "gitPath": "materials/asset-library/current-resources.json",
                    "sourceModelKey": resource_row["modelKey"],
                    "runtimeDropdownRegistered": resource_row["runtimeDropdownRegistered"],
                    "registeredVersionModelKeys": resource_row["registrationEvidence"]["versionModelKeys"],
                },
                "modelBudget": {
                    "gitPath": "content/assets/model-budget/report.json",
                    "modelKey": budget_row["id"],
                    "role": budget_row["role"],
                    "verdicts": budget_row["verdicts"],
                },
            },
        },
        "status": {
            "sourcePreserved": True,
            "converted": True,
            "validated": True,
            "threeViewRendered": True,
            "ownerRequirementApplied": True,
            "ownerVisualReviewPending": True,
            "centralIndexesUpdated": True,
            "promotedToGit": True,
            "runtimeRegistered": True,
            "runtimeSelectable": True,
            "automaticEligible": True,
            "currentAutomaticSelected": True,
            "productionDeployed": False,
        },
        "missing": ["使用者對本次 A/B 的最終視覺核准", "正式站部署驗證"],
    }
    readme = "\n".join([
        "# 波吉王冠候選 v1",
        "",
        "以現有 `derivative:bojji` 獨立 GLB 為輸入，新增 64 面、單一 draw 的小型金黃色王冠。王冠 32 個頂點全數以 1.0 權重綁到 `Bip001 Head`；來源兩個 skinned primitive、兩張內嵌 256px 貼圖、54 joints 與 5 段來源原生借用動作皆保留。",
        "",
        "![原版與王冠候選三視圖](bojji-crown-ab.png)",
        "",
        "| 檢查 | 結果 |",
        "| --- | --- |",
        "| 面數 | 7,229（原 7,165 + 王冠 64），符合使用者 `<= 8,000` |",
        "| draw primitives | 3／上限 6 |",
        "| 貼圖 | 原兩張內嵌貼圖原封不動，最大 256px；王冠用純色材質，不增貼圖 |",
        "| 動作通道 | 5 clips、每段 66 channels；王冠由 Head joint 跟隨 |",
        "| Khronos | 0 error／0 warning |",
        "| GGD budget | `errors=[]` |",
        f"| 註冊 | `{registration['sourceModel']['modelKey']}` → `{registration['registeredVersion']['modelKey']}` |",
        "| 狀態 | 已轉換、已驗證、已進 Git、已註冊可切換，並成為 automatic 目前預選；待使用者 A/B 最終視覺核准與正式站部署驗證 |",
        "",
        "重建與驗證：",
        "",
        "```sh",
        "python3 tools/hero-model-library/source-workflows/bojji-crown-v1/build_candidate.py",
        "node --import tsx tools/hero-model-library/source-workflows/bojji-crown-v1/validate_candidate.mts . content/assets/models/community/versions/745fe9a31c9ed44098f7d92984de88e81f5ddf6605c7327f327ddcd82ee96581.glb ../GGD-Asset-Library/conversions/bojji-crown-v1/candidate.glb ../GGD-Asset-Library/conversions/bojji-crown-v1/validation.json",
        "python3 tools/hero-model-library/source-workflows/approved-derivatives-v1/render_static_glb.py ../GGD-Asset-Library/conversions/bojji-crown-v1/candidate.glb ../GGD-Asset-Library/conversions/bojji-crown-v1/webgl-review-v1 --repo .",
        "python3 tools/hero-model-library/source-workflows/bojji-crown-v1/build_visual_evidence.py",
        "node --import tsx tools/hero-model-library/source-workflows/bojji-crown-v1/promote_register.mts . ../GGD-Asset-Library/conversions/bojji-crown-v1/candidate.glb --check",
        "python3 tools/hero-model-library/source-workflows/bojji-crown-v1/build_inventory.py",
        "```",
        "",
        "本批保留原有 5 個模型選項，新增一個獨立完整王冠候選並設為 automatic 目前預選。中央模型盤點與 `current-resources.json` 已登記該候選；正式站仍為未部署。",
        "",
    ]).encode()
    return {
        OUTPUT / "inventory.json": encoded(inventory),
        OUTPUT / "README.md": readme,
        OUTPUT / "bojji-crown-ab.png": (local / "bojji-crown-ab.png").read_bytes(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--local", type=Path, default=LOCAL)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    generated = outputs(args.local.resolve())
    for path, data in generated.items():
        if args.check:
            if not path.is_file() or path.read_bytes() != data:
                raise ValueError(f"stale inventory output: {path}")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    print(json.dumps({"files": len(generated), "candidateSha256": json.loads(generated[OUTPUT / 'inventory.json'])["candidate"]["sha256"], "check": args.check}, ensure_ascii=False))


if __name__ == "__main__":
    main()
