#!/usr/bin/env python3
"""Build one labelled contact sheet from Ultimate14 start/middle/end renders."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("visual_root", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    visual = args.visual_root.resolve()
    proof = json.loads((visual / "proof.json").read_text())
    groups = [row["name"] for row in proof["animationGroups"]]
    samples = ["start", "middle", "end"]
    thumb, label_width, header = 320, 210, 36
    sheet = Image.new("RGB", (label_width + thumb * len(samples), (thumb + header) * len(groups)), (28, 29, 33))
    draw = ImageDraw.Draw(sheet)
    for row_index, group in enumerate(groups):
        top = row_index * (thumb + header)
        draw.text((10, top + header + thumb // 2 - 8), group, fill="white")
        for column, sample in enumerate(samples):
            path = visual / f"{group}-{sample}.png"
            image = Image.open(path).convert("RGB").resize((thumb, thumb), Image.Resampling.LANCZOS)
            left = label_width + column * thumb
            sheet.paste(image, (left, top + header))
            draw.text((left + 8, top + 9), sample, fill="white")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.output, quality=92)
    print(json.dumps({"output": str(args.output.resolve()), "motions": len(groups), "samples": len(groups) * len(samples), "size": sheet.size}))


if __name__ == "__main__":
    main()
