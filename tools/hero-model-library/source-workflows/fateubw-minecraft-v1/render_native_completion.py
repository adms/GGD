#!/usr/bin/env python3
"""Render only newly formula/pre-post baked FateUBW clips and freeze evidence."""
import argparse
import hashlib
import json
import math
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--batch", type=Path, required=True)
    parser.add_argument("--evidence-name", default="webgl-completion-v2")
    args = parser.parse_args()
    repo, batch = args.repo.resolve(), args.batch.resolve()
    manifest_path = batch / "batch-manifest.json"
    manifest = json.loads(manifest_path.read_text())
    renderer = Path(__file__).with_name("render_native_animation.py")
    records, tiles = [], []
    for record in manifest["records"]:
        directory = batch / record["candidateId"]
        report = json.loads((directory / "conversion-report.json").read_text())
        names = [row["name"] for row in report["clips"]
                 if row.get("formulaChannelCount", 0) or row.get("prePostChannelCount", 0)]
        if not names:
            continue
        evidence = directory / args.evidence_name
        command = [sys.executable, str(renderer), str(directory / "body.glb"), str(evidence),
                   "--repo", str(repo)]
        for name in names:
            command += ["--include-clip", name]
        subprocess.run(command, cwd=repo, check=True)
        proof = json.loads((evidence / "proof.json").read_text())
        run = json.loads((evidence / "run.json").read_text())
        groups = proof.get("groups", [])
        if ([group["name"] for group in groups] != names or run.get("complete") is not True
                or run.get("errorExists") is not False):
            raise ValueError("incomplete formula/pre-post WebGL evidence: " + record["candidateId"])
        for group in groups:
            shots = group["shots"]
            if len(shots) != 4 or not all((evidence / shot["name"]).is_file() for shot in shots):
                raise ValueError("missing phase render: " + record["candidateId"] + "/" + group["name"])
            middle = next(shot for shot in shots if shot["phase"] == .5 and shot["view"] == "front")
            tiles.append((record["candidateId"].removeprefix("fateubw-"), group["name"], evidence / middle["name"]))
        records.append({"candidateId": record["candidateId"], "bodySha256": record["body"]["sha256"],
                        "clipNames": names, "proof": {"path": str(evidence / "proof.json"), "sha256": sha(evidence / "proof.json")},
                        "run": {"path": str(evidence / "run.json"), "sha256": sha(evidence / "run.json")},
                        "shots": sum(len(group["shots"]) for group in groups)})
    font_path = Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf")
    font = ImageFont.truetype(str(font_path), 14) if font_path.is_file() else ImageFont.load_default()
    columns, width, height = 5, 240, 260
    contact = batch / "completion-midpoint-contact-sheet.png"
    sheet = Image.new("RGB", (columns * width, math.ceil(len(tiles) / columns) * height), (238, 238, 238))
    draw = ImageDraw.Draw(sheet)
    for index, (candidate, clip, path) in enumerate(tiles):
        x, y = index % columns * width, index // columns * height
        image = Image.open(path).convert("RGB"); image.thumbnail((230, 215))
        sheet.paste(image, (x + (width - image.width) // 2, y + 40))
        draw.text((x + 5, y + 4), candidate[:30], fill=(0, 0, 0), font=font)
        draw.text((x + 5, y + 21), clip[:30], fill=(0, 0, 0), font=font)
    sheet.save(contact)
    result = {"schema": "ggd-fateubw-formula-motion-webgl-completion@1",
              "batchManifest": {"path": str(manifest_path), "sha256": sha(manifest_path)},
              "records": records,
              "counts": {"characters": len(records), "clips": sum(len(row["clipNames"]) for row in records),
                         "shots": sum(row["shots"] for row in records)},
              "contactSheet": {"path": str(contact), "bytes": contact.stat().st_size, "sha256": sha(contact), "tiles": len(tiles)},
              "allRequestedGroupsRendered": True,
              "sourceEngineFormulaParity": False,
              "scope": "Babylon WebGL phase samples for the newly bounded formula/pre-post baked clips. Continuous playback, source-engine parity, event mapping, rights, backend selection and deployment remain unverified."}
    (batch / "completion-webgl-review.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(result["counts"], ensure_ascii=False))


if __name__ == "__main__":
    main()
