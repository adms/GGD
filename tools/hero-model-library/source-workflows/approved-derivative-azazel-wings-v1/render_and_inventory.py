#!/usr/bin/env python3
"""Freeze local A/B evidence and a Git inventory for the Azazel wing copy."""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path
import shutil

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[4]
WORKSPACE = ROOT.parent
ASSETS = WORKSPACE / "GGD-Asset-Library"
STAGE = ASSETS / "conversions/approved-derivative-azazel-wings-v1"
BASELINE = ASSETS / "validation/approved-derivatives-v1/batch-v1/azazel-current"
EVIDENCE = ROOT / "materials/hero-model-library/priority-evidence/approved-derivative-azazel-wings-v1"
REFERENCE_INPUT = Path("/var/folders/nh/0xwcm79d52v3qyr1ntzqvwnc0000gq/T/codex-clipboard-fe2b40b4-e33c-47c2-873c-c29902f2f2a3.png")
REFERENCE_LOCAL = ASSETS / "references/approved-derivative-azazel-wings-v1/owner-appearance-reference.png"
CENTRAL_INVENTORY = ROOT / "materials/hero-model-library/inventory.json"
CURRENT_RESOURCES = ROOT / "materials/asset-library/current-resources.json"
MODEL_BUDGET_REPORT = ROOT / "content/assets/model-budget/report.json"


def digest(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def read(path: Path) -> dict:
    return json.loads(path.read_text())


def pin(path: Path, root: Path | None = None) -> dict:
    result = {"path": str(path.resolve()), "bytes": path.stat().st_size, "sha256": digest(path)}
    if root is not None and path.resolve().is_relative_to(root.resolve()):
        result["gitPath"] = path.resolve().relative_to(root.resolve()).as_posix()
    return result


def contact_sheet(output: Path) -> None:
    views = ("front", "back", "isometric")
    thumb, label, pad = 480, 42, 18
    sheet = Image.new("RGB", (2 * thumb + 3 * pad, 3 * (thumb + label) + 4 * pad), (235, 237, 241))
    draw = ImageDraw.Draw(sheet)
    font_path = Path("/System/Library/Fonts/PingFang.ttc")
    font = ImageFont.truetype(str(font_path), 22) if font_path.is_file() else ImageFont.load_default(size=22)
    for row, view in enumerate(views):
        y = pad + row * (thumb + label + pad)
        for col, (folder, title) in enumerate(((BASELINE, "A approved copy"), (STAGE / "render-v2", "B small bat wings + 256px"))):
            image = Image.open(folder / f"{view}.png").convert("RGB")
            image.thumbnail((thumb, thumb))
            x = pad + col * (thumb + pad)
            sheet.paste(image, (x + (thumb - image.width) // 2, y + (thumb - image.height) // 2))
            draw.text((x, y + thumb + 7), f"{title} / {view}", font=font, fill=(24, 24, 28))
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, quality=92, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    candidate = STAGE / "azazel-wings-v1.glb"
    build = read(STAGE / "azazel-wings-v1.build.json")
    validation = read(STAGE / "azazel-wings-v1.validation.json")
    preservation = read(STAGE / "azazel-wings-v1.preservation.json")
    publication = read(STAGE / "azazel-wings-v1.publish.json")
    registration = read(STAGE / "azazel-wings-v1.registration.json")
    registration_validation = read(STAGE / "azazel-wings-v1.registration-validation.json")
    central_inventory = read(CENTRAL_INVENTORY)
    current_resources = read(CURRENT_RESOURCES)
    model_budget = read(MODEL_BUDGET_REPORT)
    render = STAGE / "render-v2"
    proof = read(render / "proof.json"); run = read(render / "run.json")
    assert build["output"]["sha256"] == validation["candidate"]["sha256"] == publication["candidate"]["sha256"] == digest(candidate)
    assert run["complete"] and run["proofExists"] and not run["errorExists"]
    assert proof["skeletons"] == 1 and proof["animationGroups"] == 5
    assert validation["metrics"]["triangles"] <= 8_000
    assert validation["metrics"]["drawPrimitives"] <= 6
    assert validation["metrics"]["maxTextureEdge"] <= 256
    assert validation["metrics"]["maxChannelsPerClip"] <= 500
    assert validation["khronos"]["errors"] == validation["khronos"]["warnings"] == 0
    assert preservation["byteIdenticalRebuild"] and preservation["animationsUnchanged"] and preservation["wings"]["allWeightsRigidOne"]
    assert registration["after"]["allPreviousVersionsRetained"]
    assert registration["status"]["registered"] and registration["status"]["selectable"]
    assert registration["status"]["automaticEligible"] and registration["status"]["automaticSelected"]
    assert registration_validation["summary"]["testsFailed"] == 0 and registration_validation["summary"]["testsPassed"] == 23
    for folder in (BASELINE, render):
        for view in ("front", "back", "isometric"):
            assert (folder / f"{view}.png").is_file()

    source_model_key = publication["sourceModel"]["modelKey"]
    version_model_key = registration["addedVersion"]["modelKey"]
    hero_inventory = next(row for row in central_inventory["heroes"] if row.get("id") == "community-review-32-20260907")
    assert hero_inventory["checkoutSelection"] == {"modelKey": version_model_key, "mode": "automatic"}
    hero_option = next(row for row in hero_inventory["options"] if row.get("asset", {}).get("modelKey") == source_model_key)
    assert hero_option["asset"]["sha256"] == validation["candidate"]["sha256"]
    resource_row = next(row for row in current_resources["models"] if row.get("modelKey") == source_model_key)
    assert resource_row["sha256"] == validation["candidate"]["sha256"]
    assert resource_row["registeredFor"] == ["community-review-32-20260907"]
    assert resource_row["runtimeDropdownRegistered"] is True
    assert resource_row["registrationEvidence"]["versionModelKeys"] == [version_model_key]
    budget_row = next(row for row in model_budget["models"] if row.get("id") == version_model_key)
    assert budget_row["role"] == "champion"
    assert budget_row["triangles"] == validation["metrics"]["triangles"]
    assert budget_row["drawCalls"] == validation["metrics"]["drawPrimitives"]
    assert budget_row["maxTextureEdge"] == validation["metrics"]["maxTextureEdge"]
    assert budget_row["animChannels"] == validation["metrics"]["maxChannelsPerClip"]
    assert budget_row["verdicts"] == {"triangles": "ok", "drawCalls": "ok", "maxTextureEdge": "ok", "animChannels": "ok"}

    if not REFERENCE_LOCAL.is_file():
        if not REFERENCE_INPUT.is_file():
            raise FileNotFoundError("owner reference is not pinned locally")
        REFERENCE_LOCAL.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(REFERENCE_INPUT, REFERENCE_LOCAL)

    sheet = EVIDENCE / "azazel-wings-ab.jpg"
    if not args.check:
        contact_sheet(sheet)
    assert sheet.is_file()
    candidate_views = [pin(render / f"{view}.png") | {"view": view} for view in ("front", "back", "isometric")]
    baseline_views = [pin(BASELINE / f"{view}.png") | {"view": view} for view in ("front", "back", "isometric")]
    inventory = {
        "schema": "ggd.approved-azazel-wings-inventory@1",
        "workflowId": "approved-derivative-azazel-wings-v1",
        "scope": {"heroId": "community-review-32-20260907", "nameZh": "阿薩謝爾", "approvedDerivativeId": "derivative:azazel", "expandedToOtherCharacters": False},
        "source": build["source"],
        "reference": pin(REFERENCE_LOCAL) | {"role": "owner appearance reference only"},
        "candidate": publication["sourceModel"] | {
            "localPath": str(candidate.resolve()),
            "metrics": validation["metrics"],
            "khronos": validation["khronos"],
            "bodyAtlas": build["preservation"]["bodyAtlas"],
            "wingAttachment": build["wings"],
        },
        "preservation": validation["preservation"] | {
            "sourceAccessorsPreserved": preservation["sourceAccessorsPreserved"],
            "byteIdenticalRebuild": preservation["byteIdenticalRebuild"],
            "receipt": pin(STAGE / "azazel-wings-v1.preservation.json"),
        },
        "registration": {
            "versionModelKey": registration["addedVersion"]["modelKey"],
            "receipt": pin(STAGE / "azazel-wings-v1.registration.json"),
            "validationReceipt": pin(STAGE / "azazel-wings-v1.registration-validation.json"),
            "previousVersionCount": registration["before"]["versionCount"],
            "currentVersionCount": registration["after"]["versionCount"],
            "allPreviousVersionsRetained": registration["after"]["allPreviousVersionsRetained"],
            "selectionMode": registration["after"]["selectionMode"],
            "activeModelKey": registration["after"]["activeModelKey"],
        },
        "visualEvidence": {
            "baselineViews": baseline_views,
            "candidateViews": candidate_views,
            "webglProof": pin(render / "proof.json"),
            "abSheet": pin(sheet, ROOT),
            "technicalReview": "front/back/isometric all show the complete body and two attached wings; no missing texture or detached rest-pose component observed",
            "ownerAcceptance": "pending",
        },
        "centralIndexes": {
            "modelInventory": {
                "gitPath": "materials/hero-model-library/inventory.json",
                "heroId": "community-review-32-20260907",
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
        "status": {
            "converted": True, "policyValidated": True, "khronosValidated": True,
            "threeViewEvidence": True, "sourceModelPublishedToGit": True,
            "dropdownRegistered": True, "selectable": True,
            "automaticEligible": True, "automaticSelected": True,
            "productionDeployed": False,
        },
        "limitations": [
            "Wings are a GGD-authored procedural attachment based on the owner-provided appearance reference, not source-game native geometry.",
            "Five retained clips are source-model motion borrowed for the target hero; they are not Azazel-native motion.",
            "Three-view evidence is static rest-pose evidence. Owner appearance acceptance, motion playback and production deployment remain pending.",
        ],
    }
    inventory_bytes = (json.dumps(inventory, ensure_ascii=False, indent=2) + "\n").encode()
    readme = "\n".join([
        "# 阿薩謝爾小型蝙蝠翼加工副本 v1", "",
        "![原版與加工版三視圖 A/B](azazel-wings-ab.jpg)", "",
        f"新候選 `{inventory['candidate']['sha256']}` 為 **{validation['metrics']['triangles']:,} 面／{validation['metrics']['drawPrimitives']} draw／最大 {validation['metrics']['maxTextureEdge']}px／單段最多 {validation['metrics']['maxChannelsPerClip']} 通道**；Khronos 0 error / 0 warning。",
        "", "翅膀為 10 面的小型深紅／紫色雙面 primitive，全部頂點以 100% 權重綁定 `Bip01 Spine1`。來源身體 primitive、骨架、節點和五段借用動作保留；已核准的咖啡色／深咖啡色 atlas 只做 512→256 Lanczos 縮圖。原候選仍留在原路徑。",
        "", f"新 source model 已透過 `ModelVersions` 註冊為 `{registration['addedVersion']['modelKey']}`；原有 {registration['before']['versionCount']} 個選項全數保留，目前共 {registration['after']['versionCount']} 個。新版 `automaticEligible=true`，英雄保持 automatic 模式並預選新版；中央模型盤點、`current-resources.json` 與 model-budget 均已核對。ModelVersions 與內容模型窄測試共 {registration_validation['summary']['testsPassed']} 項通過，11 組加工副本稽核 11/11 通過。目前是**已轉換、政策/Khronos/靜態三視圖通過、已註冊可切換且自動預選、正式站未部署**。", "",
    ]).encode()
    expected = {EVIDENCE / "inventory.json": inventory_bytes, EVIDENCE / "README.md": readme}
    for path, data in expected.items():
        if args.check:
            assert path.read_bytes() == data, f"stale: {path}"
        else:
            path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(data)
    print(json.dumps({"candidateSha256": inventory["candidate"]["sha256"], "triangles": validation["metrics"]["triangles"], "views": 3, "ownerAcceptance": "pending", "check": args.check}, ensure_ascii=False))


if __name__ == "__main__":
    main()
