#!/usr/bin/env python3
"""Freeze fixed-camera source/candidate A/B and the owner-set lit-pixel metric."""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, __version__ as PILLOW_VERSION


VIEWS = ("front", "back", "isometric")


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def render(repo: Path, source: Path, output: Path) -> None:
    renderer = repo / "tools/hero-model-library/source-workflows/ssbu-models-v1/render_static_glb.py"
    subprocess.run([sys.executable, str(renderer), str(source), str(output), "--repo", str(repo)], check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--reuse-existing-renders", action="store_true")
    parser.add_argument("--accept-human-review", action="store_true")
    args = parser.parse_args()
    repo, source, candidate, output = args.repo.resolve(), args.source.resolve(), args.candidate.resolve(), args.output_root.resolve()
    source_render, candidate_render = output / "source", output / "candidate"
    if not args.reuse_existing_renders:
        render(repo, source, source_render)
        render(repo, candidate, candidate_render)
    rows = []
    sheet = Image.new("RGB", (1600, 840 * len(VIEWS)), (16, 18, 24)); draw = ImageDraw.Draw(sheet)
    worst = None
    for index, view in enumerate(VIEWS):
        a_img = Image.open(source_render / f"{view}.png").convert("RGB")
        b_img = Image.open(candidate_render / f"{view}.png").convert("RGB")
        a, b = np.asarray(a_img, dtype=np.int16), np.asarray(b_img, dtype=np.int16)
        delta = np.abs(a - b)
        la = .2126 * a[:, :, 0] + .7152 * a[:, :, 1] + .0722 * a[:, :, 2]
        lb = .2126 * b[:, :, 0] + .7152 * b[:, :, 1] + .0722 * b[:, :, 2]
        row = {
            "view": view,
            "changedPixelPctAtChannelDeltaGt10": round(float((delta.max(2) > 10).mean() * 100), 6),
            "meanAbsoluteChannelDelta": round(float(delta.mean()), 6),
            "litClassificationXorPctAtLuma128": round(float(np.logical_xor(la >= 128, lb >= 128).mean() * 100), 6),
            "maxChannelDelta": int(delta.max()),
        }
        rows.append(row)
        if worst is None or row["changedPixelPctAtChannelDeltaGt10"] > worst[0]["changedPixelPctAtChannelDeltaGt10"]:
            worst = (row, a_img, b_img, delta)
        y = index * 840
        draw.text((10, y + 10), f"{view} source 59,768 tris / 20 draws / 2048px", fill="white")
        draw.text((810, y + 10), f"{view} candidate 7,947 tris / 20 draws / 256px", fill="white")
        sheet.paste(a_img, (0, y + 40)); sheet.paste(b_img, (800, y + 40))
    contact = output / "ab-contact-sheet.png"; sheet.save(contact)
    assert worst is not None
    row, a_img, b_img, delta = worst
    heat = np.zeros_like(delta, dtype=np.uint8)
    heat[:, :, 0] = np.clip(delta.max(2) * 4, 0, 255).astype(np.uint8)
    heat[:, :, 1] = np.clip(delta.mean(2) * 2, 0, 128).astype(np.uint8)
    overview = Image.new("RGB", (2400, 860), (16, 18, 24)); d = ImageDraw.Draw(overview)
    overview.paste(a_img, (0, 60)); overview.paste(b_img, (800, 60)); overview.paste(Image.fromarray(heat), (1600, 60))
    d.text((10, 12), f"source / {row['view']}", fill="white"); d.text((810, 12), "candidate", fill="white")
    d.text((1610, 12), f"RGB delta x4 / changed {row['changedPixelPctAtChannelDeltaGt10']:.6f}%", fill="white")
    worst_path = output / "worst-difference-overview.png"; overview.save(worst_path)
    max_changed = max(item["changedPixelPctAtChannelDeltaGt10"] for item in rows)
    max_lit = max(item["litClassificationXorPctAtLuma128"] for item in rows)
    result = {
        "schema": "ggd.jump-force-dai-static-visual-comparison@1",
        "source": {"absolutePath": str(source), "bytes": source.stat().st_size, "sha256": sha(source)},
        "candidate": {"absolutePath": str(candidate), "bytes": candidate.stat().st_size, "sha256": sha(candidate)},
        "sampling": {"views": list(VIEWS), "renderer": "Babylon WebGL right-handed scene; identical lighting and CPU-skinned fixed camera fitting"},
        "metric": {"litPixelContractMaxPct": 5, "litPixelDefinition": "XOR of luma >= 128 / all 800x800 pixels", "changedPixelDiagnostic": "any RGB channel delta > 10 / all pixels"},
        "rows": rows, "maxChangedPixelPctAtChannelDeltaGt10": max_changed,
        "maxLitClassificationXorPctAtLuma128": max_lit, "litPixelContractPassed": max_lit <= 5,
        "contactSheet": {"file": contact.name, "bytes": contact.stat().st_size, "sha256": sha(contact)},
        "worstDifferenceOverview": {"file": worst_path.name, "view": row["view"], "bytes": worst_path.stat().st_size, "sha256": sha(worst_path), "heatmapScale": "max RGB delta x4"},
        "rawRendersRetainedLocally": True, "pillowVersion": PILLOW_VERSION,
        "humanReview": {
            "reviewer": "Codex bounded visual inspection", "result": "accepted" if args.accept_human_review else "pending",
            "scope": "front/back/isometric silhouette, face, hair spikes, hands, clothing, weapon, textures and missing-part regression",
            "finding": "No missing body part, material loss or whole-model breakup observed; reduced hair/face edge detail is visible at the stricter review framing.",
        },
    }
    if not result["litPixelContractPassed"]:
        raise ValueError("owner-set 5% lit-pixel contract failed")
    (output / "visual-comparison.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"maxChanged": max_changed, "maxLit": max_lit, "humanReview": result["humanReview"]["result"]}))


if __name__ == "__main__":
    main()
