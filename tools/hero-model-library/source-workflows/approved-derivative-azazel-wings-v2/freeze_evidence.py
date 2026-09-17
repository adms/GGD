#!/usr/bin/env python3
"""Freeze deterministic v1/v2 3D A/B evidence and a compact v2 receipt."""
from __future__ import annotations

from hashlib import sha256
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[4]
ASSETS = ROOT.parent / "GGD-Asset-Library"
STAGE = ASSETS / "conversions/approved-derivative-azazel-wings-v2"
V1_RENDER = ASSETS / "conversions/approved-derivative-azazel-wings-v1/render-v2"
V2_RENDER = STAGE / "render-v13"
REFERENCE = ASSETS / "references/approved-derivative-azazel-wings-v1/owner-appearance-reference.png"
EVIDENCE = ROOT / "materials/hero-model-library/priority-evidence/approved-derivative-azazel-wings-v2"


def digest(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def pin(path: Path, git: bool = False) -> dict:
    value = {"path": str(path.resolve()), "bytes": path.stat().st_size, "sha256": digest(path)}
    if git:
        value["gitPath"] = path.resolve().relative_to(ROOT.resolve()).as_posix()
    return value


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def contact_sheet(output: Path) -> None:
    views = ("front", "isometric", "back")
    size, gap, label = 520, 20, 42
    sheet = Image.new("RGB", (size * 2 + gap * 3, (size + label + gap) * 3 + gap), (235, 237, 241))
    draw = ImageDraw.Draw(sheet)
    font_path = Path("/System/Library/Fonts/PingFang.ttc")
    font = ImageFont.truetype(str(font_path), 22) if font_path.is_file() else ImageFont.load_default()
    for row, view in enumerate(views):
        top = gap + row * (size + label + gap)
        for column, (root, title) in enumerate(((V1_RENDER, "A v1 open-eye atlas"), (V2_RENDER, "B v2 reference-cropped closed eyes"))):
            image = Image.open(root / f"{view}.png").convert("RGB")
            image.thumbnail((size, size), Image.Resampling.LANCZOS)
            left = gap + column * (size + gap)
            sheet.paste(image, (left + (size - image.width) // 2, top + (size - image.height) // 2))
            draw.text((left, top + size + 6), f"{title} / {view}", font=font, fill=(24, 24, 28))
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, quality=94, optimize=True)


def main() -> None:
    candidate = STAGE / "azazel-wings-v2.glb"
    build = read(STAGE / "azazel-wings-v2.build.json")
    validation = read(STAGE / "azazel-wings-v2.validation.json")
    preservation = read(STAGE / "azazel-wings-v2.preservation.json")
    publication = read(STAGE / "azazel-wings-v2.publish.json")
    registration = read(STAGE / "azazel-wings-v2.registration.json")
    run = read(V2_RENDER / "run.json")
    proof = read(V2_RENDER / "proof.json")
    assert digest(candidate) == build["output"]["sha256"] == validation["candidate"]["sha256"] == publication["candidate"]["sha256"]
    assert validation["metrics"]["triangles"] <= 8_000
    assert validation["metrics"]["drawPrimitives"] <= 6
    assert validation["metrics"]["maxTextureEdge"] <= 256
    assert validation["metrics"]["maxChannelsPerClip"] <= 500
    assert validation["khronos"]["errors"] == validation["khronos"]["warnings"] == 0
    assert preservation["byteIdenticalRebuild"] and preservation["sourceTriangleUnionUnchanged"]
    assert run["complete"] and run["proofExists"] and not run["errorExists"] and run["images"] == 3
    assert len(proof["skeletons"]) == 1 and len(proof["animationGroups"]) == 5
    assert registration["status"] == {
        "registered": True, "selectable": True, "automaticEligible": False,
        "automaticSelected": False, "priorV2SupersededAndNonAutomatic": True,
        "ownerAppearanceAcceptance": "pending", "productionDeployed": False,
    }
    sheet = EVIDENCE / "azazel-face-v1-v2-ab.jpg"
    contact_sheet(sheet)
    views = [pin(V2_RENDER / f"{view}.png") | {"view": view} for view in ("front", "isometric", "back")]
    payload = {
        "schema": "ggd.approved-azazel-wings-v2-evidence@1",
        "workflowId": "approved-derivative-azazel-wings-v2",
        "heroId": "community-review-32-20260907",
        "reference": pin(REFERENCE) | {"role": "owner appearance reference"},
        "candidate": pin(candidate) | {
            "sourceModelKey": publication["sourceModel"]["modelKey"],
            "versionModelKey": registration["addedVersion"]["modelKey"],
            "metrics": validation["metrics"],
        },
        "atlasProcess": build["preservation"]["bodyAtlas"],
        "trianglePartition": build["preservation"]["trianglePartition"],
        "preservation": pin(STAGE / "azazel-wings-v2.preservation.json") | {
            "sourceTriangleUnionUnchanged": True, "skeletonAnimationsUnchanged": True,
        },
        "visualEvidence": {"views": views, "proof": pin(V2_RENDER / "proof.json"), "abSheet": pin(sheet, True)},
        "registration": pin(STAGE / "azazel-wings-v2.registration.json") | {
            "mode": "independent selectable option; automaticEligible=false; current active v1 retained",
            "activeModelKey": registration["after"]["activeModelKey"],
        },
        "status": {
            "converted": True, "policyValidated": True, "khronosValidated": True,
            "threeViewRendered": True, "registered": True, "selectable": True,
            "automaticSelected": False, "ownerAppearanceAcceptance": "pending", "productionDeployed": False,
        },
        "limitations": [
            "Closed-eye/brow pixels are deterministic crops from the owner reference, colour-matched and pasted to the source face UV islands.",
            "Orange hair, skin torso and deep-brown pants use a head/body/pelvis material split over the unchanged source triangle union.",
            "The two source hair shells use a deterministic orange-texel UV pin because their original atlas overlaps the face/eye island and produced a brown crown patch.",
            "The model remains a modified 300英雄 proxy with borrowed source animations; it is not an original-game Azazel model or native motion.",
        ],
    }
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / "inventory.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (EVIDENCE / "README.md").write_text(
        "# 阿薩謝爾參考圖臉部貼圖與蝙蝠翼 v2\n\n"
        "![v1 與 v2 實際 3D A/B](azazel-face-v1-v2-ab.jpg)\n\n"
        f"v2 為 `{validation['metrics']['triangles']:,}` 面、{validation['metrics']['drawPrimitives']} draw、"
        f"最大貼圖 {validation['metrics']['maxTextureEdge']}px、單段最多 {validation['metrics']['maxChannelsPerClip']} 通道；"
        "Khronos 0 error / 0 warning。參考圖的閉眼與眉毛以可重現的 crop/scale/colour-match/composite 貼到實際 face UV，"
        "並以骨架權重分離 head/body/pants 材質，保留完整原三角形集合、骨架、蒙皮、5 段借用動作與蝙蝠翼。\n\n"
        f"已註冊獨立可選版本 `{registration['addedVersion']['modelKey']}`，`automaticEligible=false`，"
        "現有 v1 預選保持不變；先前錯色 v2 已標為由 v2.1 取代且保持非自動。新外觀仍等 owner 核准，正式站未部署。\n",
        encoding="utf-8",
    )
    print(json.dumps({"sourceModelKey": publication["sourceModel"]["modelKey"], "versionModelKey": registration["addedVersion"]["modelKey"], "ownerAppearanceAcceptance": "pending"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
