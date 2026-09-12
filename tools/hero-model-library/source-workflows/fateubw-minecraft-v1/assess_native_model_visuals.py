#!/usr/bin/env python3
"""Freeze one FateUBW model's WebGL phase evidence and contact sheet."""
import argparse
import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--contact-sheet", type=Path, required=True)
    args = parser.parse_args()
    evidence, output, contact = args.evidence.resolve(), args.output.resolve(), args.contact_sheet.resolve()
    if output.exists() or contact.exists():
        raise ValueError("assessment outputs must be new")
    proof_path = evidence / "proof.json"
    proof = json.loads(proof_path.read_text())
    if proof.get("schema") != "ggd.fateubw-native-motion-webgl@1":
        raise ValueError("unexpected WebGL proof")
    groups, tiles = [], []
    for group in proof["groups"]:
        shots = []
        for shot in group["shots"]:
            path = evidence / shot["name"]
            extent = shot["worldSkinnedBounds"]["extent"]
            if not path.is_file() or not all(math.isfinite(value) and value >= 0 for value in extent):
                raise ValueError("missing or nonfinite shot: " + shot["name"])
            shots.append({**shot, "sha256": sha256(path), "bytes": path.stat().st_size})
        front = [shot for shot in shots if shot["view"] == "front"]
        distinct = len({shot["sha256"] for shot in front})
        middle = next(shot for shot in front if shot["phase"] == 0.5)
        tiles.append((group["name"], evidence / middle["name"]))
        groups.append({
            "name": group["name"],
            "targetedAnimationCount": group["targetedAnimationCount"],
            "frontPhaseImageDistinctCount": distinct,
            "visibleBodyChangeAtSampledPhases": distinct >= 2,
            "shots": shots,
        })
    font_path = Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf")
    font = ImageFont.truetype(str(font_path), 16) if font_path.is_file() else ImageFont.load_default()
    columns, cell_width, cell_height = 4, 260, 285
    sheet = Image.new("RGB", (columns * cell_width, math.ceil(len(tiles) / columns) * cell_height), (238, 238, 238))
    draw = ImageDraw.Draw(sheet)
    for index, (clip, path) in enumerate(tiles):
        x, y = (index % columns) * cell_width, (index // columns) * cell_height
        image = Image.open(path).convert("RGB")
        image.thumbnail((250, 245))
        sheet.paste(image, (x + (cell_width - image.width) // 2, y + 34))
        draw.text((x + 6, y + 8), clip[:34], fill=(0, 0, 0), font=font)
    contact.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(contact)
    result = {
        "schema": "ggd-fateubw-native-model-visual-assessment@1",
        "proof": {"path": str(proof_path), "sha256": sha256(proof_path)},
        "groups": groups,
        "counts": {
            "animationGroups": len(groups),
            "shots": sum(len(group["shots"]) for group in groups),
            "sampledVisibleBodyMotionGroups": sum(group["visibleBodyChangeAtSampledPhases"] for group in groups),
            "sampledUnchangedBodyGroups": sum(not group["visibleBodyChangeAtSampledPhases"] for group in groups),
        },
        "sampledUnchangedGroups": [group["name"] for group in groups if not group["visibleBodyChangeAtSampledPhases"]],
        "contactSheet": {"path": str(contact), "sha256": sha256(contact), "bytes": contact.stat().st_size},
        "allShotsPresentAndFinite": True,
        "humanVisualReview": "pending",
        "scope": "Phase-sampled Babylon WebGL evidence; source-engine parity and continuous temporal acceptance remain unverified.",
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({**result["counts"], "contactSheet": str(contact)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
