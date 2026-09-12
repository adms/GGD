#!/usr/bin/env python3
"""Freeze hashes, bounds and a contact sheet for FateUBW WebGL motion poses."""
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
    parser.add_argument("--batch", type=Path, required=True)
    parser.add_argument("--evidence-name", default="webgl-native-v1")
    args = parser.parse_args()
    batch = args.batch.resolve()
    output = batch / "batch-visual-assessment.json"
    contact = batch / "batch-midpoint-contact-sheet.png"
    if output.exists() or contact.exists():
        raise ValueError("visual assessment output must be new")
    manifest = json.loads((batch / "batch-manifest.json").read_text())
    rows, tiles = [], []
    for record in manifest["records"]:
        candidate_id = record["candidateId"]
        evidence = batch / candidate_id / args.evidence_name
        proof_path = evidence / "proof.json"
        proof = json.loads(proof_path.read_text())
        if proof.get("schema") != "ggd.fateubw-native-motion-webgl@1":
            raise ValueError("unexpected WebGL proof: " + candidate_id)
        groups = []
        for group in proof["groups"]:
            shots = []
            for shot in group["shots"]:
                path = evidence / shot["name"]
                extent = shot["worldSkinnedBounds"]["extent"]
                if not path.is_file() or not all(math.isfinite(value) and value >= 0 for value in extent):
                    raise ValueError("invalid rendered shot: " + candidate_id + "/" + shot["name"])
                shots.append({**shot, "sha256": sha256(path), "bytes": path.stat().st_size})
            front = [shot for shot in shots if shot["view"] == "front"]
            distinct = len({shot["sha256"] for shot in front})
            middle = next(shot for shot in front if shot["phase"] == 0.5)
            tiles.append((candidate_id.removeprefix("fateubw-"), group["name"], evidence / middle["name"]))
            groups.append({"name": group["name"], "targetedAnimationCount": group["targetedAnimationCount"],
                           "frontPhaseImageDistinctCount": distinct,
                           "visibleBodyChangeAtSampledPhases": distinct >= 2, "shots": shots})
        rows.append({"candidateId": candidate_id, "proof": {"path": str(proof_path), "sha256": sha256(proof_path)},
                     "animationGroups": len(groups), "groups": groups,
                     "sampledVisibleBodyMotionGroups": sum(group["visibleBodyChangeAtSampledPhases"] for group in groups),
                     "sampledUnchangedBodyGroups": [group["name"] for group in groups if not group["visibleBodyChangeAtSampledPhases"]]})

    font_path = Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf")
    font = ImageFont.truetype(str(font_path), 14) if font_path.is_file() else ImageFont.load_default()
    columns, cell_width, cell_height = 7, 220, 245
    sheet = Image.new("RGB", (columns * cell_width, math.ceil(len(tiles) / columns) * cell_height), (238, 238, 238))
    draw = ImageDraw.Draw(sheet)
    for index, (candidate, clip, path) in enumerate(tiles):
        x, y = (index % columns) * cell_width, (index // columns) * cell_height
        image = Image.open(path).convert("RGB"); image.thumbnail((210, 205))
        sheet.paste(image, (x + (cell_width - image.width) // 2, y + 38))
        draw.text((x + 5, y + 3), candidate[:27], fill=(0, 0, 0), font=font)
        draw.text((x + 5, y + 20), clip[:27], fill=(0, 0, 0), font=font)
    sheet.save(contact)
    result = {"schema": "ggd-fateubw-native-motion-visual-assessment@1",
        "batchManifest": {"path": str(batch / "batch-manifest.json"), "sha256": sha256(batch / "batch-manifest.json")},
        "records": rows,
        "counts": {"characters": len(rows), "animationGroups": sum(row["animationGroups"] for row in rows),
                   "sampledVisibleBodyMotionGroups": sum(row["sampledVisibleBodyMotionGroups"] for row in rows),
                   "sampledUnchangedBodyGroups": sum(len(row["sampledUnchangedBodyGroups"]) for row in rows)},
        "sampledUnchangedGroups": [{"candidateId": row["candidateId"], "groups": row["sampledUnchangedBodyGroups"]}
                                   for row in rows if row["sampledUnchangedBodyGroups"]],
        "contactSheet": {"path": str(contact), "sha256": sha256(contact), "bytes": contact.stat().st_size,
                         "tiles": len(tiles), "selection": "front view at 50 percent of every converted animation group"},
        "allShotsPresentAndFinite": True,
        "humanVisualReview": "pending",
        "interpretation": "An unchanged sampled image can be valid when the source clip only changes an attachment bone absent from the body GLB. It is retained as a gap, not counted as visible body motion.",
        "scope": "Phase-sampled Babylon WebGL evidence; no source-engine parity, continuous temporal acceptance, action/event mapping, rights, backend selection or deployment claim."}
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({**result["counts"], "contactSheet": str(contact)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
