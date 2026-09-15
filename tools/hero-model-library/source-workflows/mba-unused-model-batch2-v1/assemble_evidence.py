#!/usr/bin/env python3
"""Freeze the reviewed second MBA reserve batch into Git."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
SOURCE_ID = "magical-battle-arena-complete-form-1.60-plus"
ROSTER = {
    "nowel": ("mba:Chara02_O", "諾威爾·迪亞斯塔西斯", "ノウェル・ディアスタシス", "原創（魔法少女武鬥祭）"),
    "kukuri": ("mba:Chara07_02", "柯柯麗", "ククリ", "魔法陣咕嚕咕嚕（魔法少女武鬥祭）"),
    "naga": ("mba:Chara08", "白蛇娜卡", "白蛇のナーガ", "秀逗魔導士（魔法少女武鬥祭）"),
    "gajet1": ("mba:Chara09", "Gadget Drone I 型", "ガジェットドローンⅠ型", "魔法少女奈葉（魔法少女武鬥祭）"),
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pin(path: Path) -> dict:
    return {"gitPath": path.relative_to(REPO).as_posix(), "bytes": path.stat().st_size, "sha256": sha(path)}


def copy(source: Path, target: Path) -> dict:
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    return pin(target)


def require(value, message: str) -> None:
    if not value:
        raise ValueError(message)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--final", type=Path, required=True)
    parser.add_argument("--visual", type=Path, required=True)
    args = parser.parse_args()
    workspace, final, visual = (p.resolve() for p in (args.workspace, args.final, args.visual))
    evidence = REPO / "materials/hero-model-library/priority-evidence/mba-unused-model-batch2-v1"
    evidence.mkdir(parents=True, exist_ok=True)
    visual_receipt = json.loads((visual / "receipt.json").read_text())
    require(visual_receipt["summary"] == {"requested": 8, "complete": 8, "failed": 0}, "visual batch incomplete")
    rows = []
    for slug, (native_id, name_zh, name_native, work_zh) in ROSTER.items():
        conversion_path = final / slug / "conversion.json"
        conversion = json.loads(conversion_path.read_text())
        output = conversion["output"]
        body = final / slug / "body.glb"
        require(conversion["sourceId"] == SOURCE_ID and conversion["sourceCharacterId"] == native_id, f"identity drift: {slug}")
        require((body.stat().st_size, sha(body)) == (output["bytes"], output["sha256"]), f"output drift: {slug}")
        require(output["triangles"] < 10000 and output["drawPrimitives"] <= 3, f"geometry policy failed: {slug}")
        require(output["maxTextureEdge"] <= 256 and output["maxChannelsPerClip"] <= 300, f"texture/motion policy failed: {slug}")
        require(output["skins"] == 1 and output["skinnedPrimitives"] == 1 and output["clipCount"] == 6, f"rig structure failed: {slug}")
        require(output["khronos"]["numErrors"] == 0 and output["finiteFloatValues"]["allFinite"], f"validation failed: {slug}")
        require(conversion["deterministicRebuild"]["verified"] is True, f"deterministic rebuild missing: {slug}")
        final_visual = next(row for row in visual_receipt["records"] if row["slug"] == slug and row["variant"] == "final")
        source_visual = next(row for row in visual_receipt["records"] if row["slug"] == slug and row["variant"] == "source")
        require(final_visual["complete"] and source_visual["complete"], f"WebGL proof failed: {slug}")
        require(final_visual["animationGroups"] == 6 and final_visual["skeletons"] == 1, f"final animation/rig proof failed: {slug}")
        local = evidence / slug
        screenshots = {}
        source_screenshots = {}
        for view in ("front", "isometric", "back"):
            screenshots[view] = copy(Path(final_visual["views"][view]["path"]), local / f"final-{view}.png")
            source_screenshots[view] = copy(Path(source_visual["views"][view]["path"]), local / f"source-{view}.png")
        body_pin = copy(body, REPO / f"content/assets/models/community/{output['sha256']}.glb")
        rows.append({
            "id": f"mba-unused-batch2-{slug}-native-six-motion-v1",
            "sourceId": SOURCE_ID,
            "sourceCharacterId": native_id,
            "nameZh": name_zh,
            "originalName": name_native,
            "workZh": work_zh,
            "sourceVersion": "Complete Form 1.60+",
            "sourcePlatform": "Windows PC",
            "selectionClass": "mba",
            "resourceRole": "independent-mba-character-body-native-motion-reserve",
            "sourceClass": "original-game-direct-extraction",
            "source": conversion["source"],
            **body_pin,
            "componentReady": True,
            "converted": True,
            "fullHeroModel": False,
            "heroIds": [],
            "relatedHeroIds": [],
            "runtimeSelectable": False,
            "runtimeDropdownRegistered": False,
            "automaticEligible": False,
            "defaultEligible": False,
            "readiness": "policy-and-static-visual-validated-component; native-motion-semantics-and-playback-pending",
            "metrics": {
                "triangles": output["triangles"], "drawPrimitives": output["drawPrimitives"],
                "textures": output["textureCount"], "maxTextureEdge": output["maxTextureEdge"],
                "skins": output["skins"], "skinnedPrimitives": output["skinnedPrimitives"],
                "nativeClips": output["clipCount"], "maxChannelsPerClip": output["maxChannelsPerClip"],
            },
            "nativeMotion": {
                "clipMap": output["clipMap"], "origin": "native-same-character-mba",
                "semanticApproval": "pending", "continuousPlaybackReview": "pending",
                "death": "D-Down is a native knockdown proposed only as a death surrogate",
            },
            "validation": {
                "budgetErrors": output["budgetErrors"], "budgetWarnings": output["budgetWarnings"],
                "khronosErrors": 0, "khronosWarnings": output["khronos"]["numWarnings"],
                "khronosWarningCodes": sorted({message["code"] for message in output["khronos"]["messages"]}),
                "allFinite": True, "deterministicRebuild": True,
            },
            "scaleAndOrientation": {
                "sourceWorldSkinnedBounds": source_visual["worldSkinnedBounds"],
                "finalWorldSkinnedBounds": final_visual["worldSkinnedBounds"],
                "frontBackIsometricRendered": True,
            },
            "staticVisualReview": {
                "accepted": True, "reviewedOn": "2026-09-15",
                "scope": "source/final front, isometric and back; no black-strip/source-backdrop failure observed; shader parity and motion gameplay excluded",
                "screenshots": screenshots, "sourceScreenshots": source_screenshots,
            },
            "conversionEvidence": copy(conversion_path, local / "conversion.json"),
            "preparationEvidence": copy(Path(conversion["source"]["preparationReceipt"]), local / "preparation.json"),
            "sourceSnapshot": {
                "s3Prefix": "s3://ggd-390630837668-ap-east-2-an/legacy/ggd-asset-library/snapshots/20260908T075704221576Z/magical-battle-arena/",
                "readbackVerified": True,
                "filesIndexSha256": "647e0990e4fc911b05cac5877abacb5606731540d0c17d1f4b58d2acc843f876",
                "automaticConsumption": False,
            },
            "missing": ["GGD hero definition and skill design", "motion playback and semantic approval", "D-Down death-surrogate approval", "source-engine shader parity", "backend dropdown registration and selection test", "Git commit backup and Main deployment verification"],
        })
    contact = copy(visual / "source-final-contact-sheet.png", evidence / "source-final-contact-sheet.png")
    visual_pin = copy(visual / "receipt.json", evidence / "visual-receipt.json")
    report = {
        "schema": "ggd-mba-unused-model-batch2@1",
        "sourceId": SOURCE_ID,
        "generatedOn": "2026-09-15",
        "status": "four-independent-components-policy-and-static-visual-validated; motion-review-hero-design-registration-and-deployment-pending",
        "summary": {"sourcesReviewed": 4, "componentsAccepted": 4, "componentsRejected": 0, "newDownloads": 0, "sourceBytesPreserved": True, "distinctSourceSha256": 4, "distinctOutputSha256": 4, "nativeClipsRetained": 24, "runtimeSelectable": 0, "defaultsChanged": 0, "heroDefinitionsCreated": 0, "vfxConverted": 0, "audioConverted": 0},
        "policy": {"decimationTriggerTriangles": 10000, "runtimeHardLimit": {"drawPrimitives": 6, "textureEdge": 512, "channelsPerClip": 500}, "runtimeWarnLimit": {"triangles": 16000, "drawPrimitives": 3, "textureEdge": 256, "channelsPerClip": 300}, "source": "packages/shared/src/content/modelUpload/adoptionPolicy.json and live budget modules"},
        "candidates": rows,
        "contactSheet": contact,
        "visualReceipt": visual_pin,
        "boundaries": ["Static visual acceptance does not approve motion meaning, source shader parity, hero binding, dropdown selection or deployment.", "No recolor, proxy mapping, default change or extension of the eleven authorized derivatives occurred."],
    }
    report_path = evidence / "report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    lines = ["# MBA 未使用模型第二批", "", "本批從既有 Complete Form 1.60+ 本機與 S3 讀回來源中接受 4 個獨立角色元件；沒有新下載、沒有改預設、沒有建立英雄或註冊下拉選項。", "", "| 角色 | 原生 ID | 三角面 | draw | 貼圖 | 原生動作 | Khronos | 狀態 |", "|---|---|---:|---:|---:|---:|---|---|"]
    for row in rows:
        lines.append(f"| {row['nameZh']}（{row['originalName']}） | `{row['sourceCharacterId']}` | {row['metrics']['triangles']:,} | {row['metrics']['drawPrimitives']} | {row['metrics']['textures']} × {row['metrics']['maxTextureEdge']}px | {row['metrics']['nativeClips']} | 0 error／{row['validation']['khronosWarnings']} warning | 政策與靜態視覺驗收；動作語意、英雄設計、下拉註冊待處理 |")
    lines += ["", "24 段動作均為同角色 MBA 原生片段；諾威爾與柯柯麗依各自來源名稱選用攻擊／施法候選。`D-Down` 只列作死亡替代候選，仍須逐項播放核准。", "", f"來源／成品對照：`{contact['gitPath']}`。本批沒有可切換或正式部署成果。"]
    (evidence / "README.md").write_text("\n".join(lines) + "\n")
    print(json.dumps({"accepted": len(rows), "report": str(report_path)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
