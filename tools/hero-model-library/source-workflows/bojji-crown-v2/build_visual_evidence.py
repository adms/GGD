#!/usr/bin/env python3
"""Build deterministic v1/v2 three-view evidence for Bojji crown v2."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
WORKSPACE = REPO.parent
LOCAL = WORKSPACE / "GGD-Asset-Library/conversions/bojji-crown-v2"
V1_RENDER = WORKSPACE / "GGD-Asset-Library/conversions/bojji-crown-v1/webgl-review-v1"
V2_RENDER = LOCAL / "webgl-review-v2-head-split"
REFERENCE = REPO / "materials/hero-model-library/source-inventories/bojji-crown-v2/owner-reference.png"
VIEWS = ("front", "back", "isometric")


def pin(path: Path) -> dict:
    data = path.read_bytes()
    return {"path": str(path.resolve()), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def compare(left_path: Path, right_path: Path) -> dict:
    left, right = Image.open(left_path).convert("RGB"), Image.open(right_path).convert("RGB")
    if left.size != right.size:
        raise ValueError("render dimensions differ")
    changed = absolute = maximum = 0
    lhs, rhs = left.tobytes(), right.tobytes()
    for offset in range(0, len(lhs), 3):
        delta = [abs(lhs[offset + channel] - rhs[offset + channel]) for channel in range(3)]
        absolute += sum(delta)
        maximum = max(maximum, *delta)
        changed += max(delta) > 16
    pixels = left.width * left.height
    return {"size": list(left.size), "meanAbsoluteRgb": absolute / (pixels * 3), "changedPixelPctAbove16": changed * 100 / pixels, "maxChannelDelta": maximum}


def main() -> None:
    v1_run, v2_run = json.loads((V1_RENDER / "run.json").read_text()), json.loads((V2_RENDER / "run.json").read_text())
    if not v1_run.get("complete") or not v2_run.get("complete") or v2_run.get("errorExists"):
        raise ValueError("both Babylon render runs must be complete")
    font_path = Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf")
    font = ImageFont.truetype(str(font_path), 24) if font_path.is_file() else ImageFont.load_default(size=24)
    label_font = ImageFont.truetype(str(font_path), 18) if font_path.is_file() else ImageFont.load_default(size=18)
    thumb, header, gap = 360, 54, 16
    sheet = Image.new("RGB", (gap + 3 * (thumb + gap), header + 2 * (thumb + header) + gap), (232, 235, 241))
    draw = ImageDraw.Draw(sheet)
    draw.text((gap, 12), "波吉王冠 v1/v2：上列 v1，下列繪本純色 v2（待 owner 視覺審查）", font=font, fill=(20, 24, 30))
    records = []
    for column, view in enumerate(VIEWS):
        before, after = V1_RENDER / f"{view}.png", V2_RENDER / f"{view}.png"
        for row, (label, image_path) in enumerate((("v1 王冠版", before), ("v2 繪本純色", after))):
            image = Image.open(image_path).convert("RGB")
            image.thumbnail((thumb, thumb), Image.Resampling.LANCZOS)
            x = gap + column * (thumb + gap) + (thumb - image.width) // 2
            y = header + row * (thumb + header) + (thumb - image.height) // 2
            sheet.paste(image, (x, y))
            draw.text((gap + column * (thumb + gap), header + row * (thumb + header) + thumb + 8), f"{view} / {label}", font=label_font, fill=(20, 24, 30))
        records.append({"view": view, "v1": pin(before), "v2": pin(after), "pixelDifference": compare(before, after)})
    output = LOCAL / "bojji-crown-v2-ab.png"
    sheet.save(output, optimize=True)
    evidence = {
        "schema": "ggd.bojji-crown-v2-visual-evidence@1",
        "renderer": "Babylon WebGL fixed-camera rest pose",
        "ownerReference": {"gitPath": "materials/hero-model-library/source-inventories/bojji-crown-v2/owner-reference.png", **pin(REFERENCE)},
        "v1Run": pin(V1_RENDER / "run.json"),
        "v2Run": pin(V2_RENDER / "run.json"),
        "records": records,
        "contactSheet": pin(output),
        "summary": {"views": 3, "complete": 3, "renderErrors": 0, "ownerVisualReviewPending": True},
        "boundaries": ["Three static renders prove visibility and requested colour placement only.", "Owner has not accepted the v2 appearance yet.", "Production deployment is not claimed."],
    }
    (LOCAL / "visual-evidence.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(evidence["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
