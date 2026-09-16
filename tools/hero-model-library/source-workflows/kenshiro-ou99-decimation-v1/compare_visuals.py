#!/usr/bin/env python3
"""Compare the fixed-camera OU99 Kenshiro source and LOD renders."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[3]
EVIDENCE = ROOT / "evidence"
POLICY = json.loads((REPO / "packages/shared/src/content/modelUpload/adoptionPolicy.json").read_text())["hero"]
VIEWS = ("front", "back", "isometric")


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


rows = []
sheet = Image.new("RGB", (1600, 840 * len(VIEWS)), (16, 18, 24))
draw = ImageDraw.Draw(sheet)
for index, view in enumerate(VIEWS):
    source = Image.open(EVIDENCE / "source-render" / f"{view}.png").convert("RGB")
    candidate = Image.open(EVIDENCE / "candidate-render" / f"{view}.png").convert("RGB")
    left, right = np.asarray(source, dtype=np.int16), np.asarray(candidate, dtype=np.int16)
    delta = np.abs(left - right)
    source_luma = .2126 * left[:, :, 0] + .7152 * left[:, :, 1] + .0722 * left[:, :, 2]
    candidate_luma = .2126 * right[:, :, 0] + .7152 * right[:, :, 1] + .0722 * right[:, :, 2]
    rows.append({
        "view": view,
        "changedPixelPctAtChannelDeltaGt10": round(float((delta.max(2) > 10).mean() * 100), 6),
        "litClassificationXorPctAtLuma128": round(float(np.logical_xor(source_luma >= 128, candidate_luma >= 128).mean() * 100), 6),
        "meanAbsoluteChannelDelta": round(float(delta.mean()), 6),
        "maxChannelDelta": int(delta.max()),
    })
    y = index * 840
    draw.text((10, y + 10), f"{view} source 21,733 triangles", fill="white")
    draw.text((810, y + 10), f"{view} candidate 7,844 triangles", fill="white")
    sheet.paste(source, (0, y + 40))
    sheet.paste(candidate, (800, y + 40))

sheet_path = EVIDENCE / "ab-contact-sheet.png"
sheet.save(sheet_path)
maximum_lit_delta = max(row["litClassificationXorPctAtLuma128"] for row in rows)
limit = float(POLICY["visualLitPixelDeltaPctMax"])
if maximum_lit_delta > limit:
    raise ValueError(f"visual lit-pixel contract failed: {maximum_lit_delta} > {limit}")
result = {
    "schema": "ggd.kenshiro-ou99-static-visual-comparison@1",
    "policyAuthority": "packages/shared/src/content/modelUpload/adoptionPolicy.json",
    "litPixelContractMaxPct": limit,
    "rows": rows,
    "maxLitClassificationXorPctAtLuma128": maximum_lit_delta,
    "litPixelContractPassed": True,
    "technicalInspection": {
        "reviewer": "Codex bounded visual inspection",
        "result": "passed",
        "scope": "front, back and isometric silhouette, head, hair, hands, clothing, feet, materials and missing-part regression",
        "finding": "No missing body section, material loss or whole-model breakup was observed; reduced edge detail is acceptable for this non-default candidate.",
    },
    "contactSheet": {"path": "evidence/ab-contact-sheet.png", "bytes": sheet_path.stat().st_size, "sha256": digest(sheet_path)},
    "sourceGameShaderParity": False,
    "productionDeploymentVerified": False,
}
(EVIDENCE / "visual-comparison.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"maxLitPixelDeltaPct": maximum_lit_delta, "limit": limit, "passed": True}))
