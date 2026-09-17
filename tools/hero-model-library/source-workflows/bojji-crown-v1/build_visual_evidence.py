#!/usr/bin/env python3
"""Freeze fixed-render source/crown A/B evidence and a three-view contact sheet."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
WORKSPACE = REPO.parent
ASSETS = WORKSPACE / "GGD-Asset-Library"
SOURCE_ROOT = ASSETS / "validation/approved-derivatives-v1/batch-v1/bojji-current"
CANDIDATE_ROOT = ASSETS / "conversions/bojji-crown-v1/webgl-review-v1"
OUTPUT_ROOT = ASSETS / "conversions/bojji-crown-v1"
VIEWS = ("front", "back", "isometric")


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pin(path: Path) -> dict:
    return {"path": str(path.resolve()), "bytes": path.stat().st_size, "sha256": digest(path)}


def compare(left_path: Path, right_path: Path) -> dict:
    left = Image.open(left_path).convert("RGB")
    right = Image.open(right_path).convert("RGB")
    if left.size != right.size:
        raise ValueError(f"image size differs: {left.size} != {right.size}")
    changed = 0
    absolute = 0
    maximum = 0
    bbox = [left.width, left.height, -1, -1]
    lhs, rhs = left.tobytes(), right.tobytes()
    for pixel in range(left.width * left.height):
        offset = pixel * 3
        delta = [abs(lhs[offset + c] - rhs[offset + c]) for c in range(3)]
        absolute += sum(delta)
        maximum = max(maximum, *delta)
        if max(delta) > 16:
            changed += 1
            x, y = pixel % left.width, pixel // left.width
            bbox = [min(bbox[0], x), min(bbox[1], y), max(bbox[2], x), max(bbox[3], y)]
    return {
        "size": list(left.size),
        "meanAbsoluteRgb": absolute / (left.width * left.height * 3),
        "changedPixelPctAbove16": changed * 100 / (left.width * left.height),
        "maxChannelDelta": maximum,
        "changedBoundingBox": bbox if changed else None,
    }


def build(source_root: Path, candidate_root: Path, output_root: Path) -> dict:
    source_run = json.loads((source_root / "run.json").read_text())
    candidate_run = json.loads((candidate_root / "run.json").read_text())
    if not source_run.get("complete") or not candidate_run.get("complete"):
        raise ValueError("source and candidate Babylon renders must both be complete")
    if candidate_run.get("images") != 3 or candidate_run.get("errorExists"):
        raise ValueError("candidate must have exactly three successful views")

    font_path = Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf")
    font = ImageFont.truetype(str(font_path), 24) if font_path.is_file() else ImageFont.load_default(size=24)
    label_font = ImageFont.truetype(str(font_path), 19) if font_path.is_file() else ImageFont.load_default(size=19)
    thumb = 360
    header = 54
    gap = 16
    sheet = Image.new("RGB", (gap + len(VIEWS) * (thumb + gap), header + 2 * (thumb + header) + gap), (232, 235, 241))
    draw = ImageDraw.Draw(sheet)
    draw.text((gap, 12), "波吉王冠 A/B：上列原版，下列 Head joint 王冠候選", font=font, fill=(20, 24, 30))
    records = []
    for column, view in enumerate(VIEWS):
        source = source_root / f"{view}.png"
        candidate = candidate_root / f"{view}.png"
        if not source.is_file() or not candidate.is_file():
            raise FileNotFoundError(view)
        for row, (label, image_path) in enumerate((("原版", source), ("王冠候選", candidate))):
            image = Image.open(image_path).convert("RGB")
            image.thumbnail((thumb, thumb), Image.Resampling.LANCZOS)
            x = gap + column * (thumb + gap) + (thumb - image.width) // 2
            y = header + row * (thumb + header) + (thumb - image.height) // 2
            sheet.paste(image, (x, y))
            draw.text((gap + column * (thumb + gap), header + row * (thumb + header) + thumb + 8), f"{view} / {label}", font=label_font, fill=(20, 24, 30))
        records.append({"view": view, "source": pin(source), "candidate": pin(candidate), "pixelDifference": compare(source, candidate)})
    contact = output_root / "bojji-crown-ab.png"
    sheet.save(contact, optimize=True)
    result = {
        "schema": "ggd.bojji-crown-visual-evidence@1",
        "renderer": "Babylon WebGL fixed-camera rest pose",
        "sourceRun": pin(source_root / "run.json"),
        "candidateRun": pin(candidate_root / "run.json"),
        "candidateProof": pin(candidate_root / "proof.json"),
        "records": records,
        "contactSheet": pin(contact),
        "summary": {"views": 3, "complete": 3, "renderErrors": 0, "ownerVisualReviewPending": True},
        "boundaries": [
            "Three static views prove visibility and attachment placement only.",
            "Head motion following is structurally proved by 100% head-joint weights; gameplay animation playback remains pending owner review.",
            "No backend registration or production deployment is claimed.",
        ],
    }
    (output_root / "visual-evidence.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, default=SOURCE_ROOT)
    parser.add_argument("--candidate-root", type=Path, default=CANDIDATE_ROOT)
    parser.add_argument("--output-root", type=Path, default=OUTPUT_ROOT)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        expected_json = (args.output_root / "visual-evidence.json").read_bytes()
        expected_png = (args.output_root / "bojji-crown-ab.png").read_bytes()
        result = build(args.source_root.resolve(), args.candidate_root.resolve(), args.output_root.resolve())
        if (args.output_root / "visual-evidence.json").read_bytes() != expected_json or (args.output_root / "bojji-crown-ab.png").read_bytes() != expected_png:
            raise ValueError("visual evidence is stale or non-deterministic")
    else:
        result = build(args.source_root.resolve(), args.candidate_root.resolve(), args.output_root.resolve())
    print(json.dumps(result["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
