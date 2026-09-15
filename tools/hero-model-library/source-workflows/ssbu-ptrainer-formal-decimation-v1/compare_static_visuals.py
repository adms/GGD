#!/usr/bin/env python3
"""Render and compare fixed-camera source/candidate views for both Trainers."""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, __version__ as PILLOW_VERSION

from build_candidates import CONFIG


VIEWS = ["front", "back", "isometric"]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def compare(repo: Path, output_root: Path, reuse: bool, accept: bool) -> None:
    renderer = repo / "tools/hero-model-library/source-workflows/ssbu-models-v1/render_static_glb.py"
    for variant, cfg in CONFIG.items():
        stage = output_root / variant
        source, candidate = repo / cfg["sourceGitPath"], stage / "candidate.glb"
        source_render, candidate_render = stage / "render-source", stage / "render-candidate"
        if not reuse:
            subprocess.run([sys.executable, str(renderer), str(source), str(source_render), "--repo", str(repo)], check=True)
            subprocess.run([sys.executable, str(renderer), str(candidate), str(candidate_render), "--repo", str(repo)], check=True)
        rows = []
        sheet = Image.new("RGB", (1600, 850 * len(VIEWS)), (16, 18, 24))
        draw = ImageDraw.Draw(sheet)
        worst_data = None
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
            if worst_data is None or row["changedPixelPctAtChannelDeltaGt10"] > worst_data[0]["changedPixelPctAtChannelDeltaGt10"]:
                worst_data = (row, a_img, b_img, delta)
            y = index * 850
            draw.text((10, y + 10), f"{variant} {view}: source {cfg['sourceTriangles']} triangles", fill="white")
            draw.text((810, y + 10), f"{variant} {view}: candidate", fill="white")
            sheet.paste(a_img, (0, y + 40)); sheet.paste(b_img, (800, y + 40))
        contact = stage / "visual-ab-contact-sheet.png"
        sheet.save(contact)
        assert worst_data is not None
        worst, a_img, b_img, delta = worst_data
        heat = np.zeros_like(delta, dtype=np.uint8)
        heat[:, :, 0] = np.clip(delta.max(2) * 4, 0, 255).astype(np.uint8)
        heat[:, :, 1] = np.clip(delta.mean(2) * 2, 0, 128).astype(np.uint8)
        overview = Image.new("RGB", (2400, 860), (16, 18, 24)); overview_draw = ImageDraw.Draw(overview)
        overview.paste(a_img, (0, 60)); overview.paste(b_img, (800, 60)); overview.paste(Image.fromarray(heat), (1600, 60))
        overview_draw.text((10, 12), f"source {cfg['sourceTriangles']} tris / {worst['view']}", fill="white")
        overview_draw.text((810, 12), f"candidate / {worst['view']}", fill="white")
        overview_draw.text((1610, 12), f"RGB delta x4 / changed {worst['changedPixelPctAtChannelDeltaGt10']:.6f}%", fill="white")
        worst_path = stage / "worst-difference-overview.png"; overview.save(worst_path)
        max_changed = max(row["changedPixelPctAtChannelDeltaGt10"] for row in rows)
        max_lit = max(row["litClassificationXorPctAtLuma128"] for row in rows)
        result = {
            "schema": "ggd-ssbu-ptrainer-static-visual-comparison@1", "variant": variant,
            "source": {"gitPath": cfg["sourceGitPath"], "bytes": source.stat().st_size, "sha256": sha(source)},
            "candidate": {"localPath": f"GGD-Asset-Library/conversions/ssbu-ptrainer-formal-decimation-v1/{variant}/candidate.glb", "bytes": candidate.stat().st_size, "sha256": sha(candidate)},
            "sampling": {"views": VIEWS, "renderer": "Babylon WebGL right-handed scene; identical lighting and per-model CPU-skinned bounds camera fitting"},
            "metric": {"contractMaxPct": 5, "changedPixelDefinition": "any RGB channel delta > 10 / all 800x800 pixels", "litPixelDefinition": "XOR of luma >= 128 / all pixels"},
            "rows": rows, "maxChangedPixelPctAtChannelDeltaGt10": max_changed,
            "maxLitClassificationXorPctAtLuma128": max_lit,
            "underFivePercentContract": max_changed <= 5 and max_lit <= 5,
            "contactSheet": {"file": contact.name, "bytes": contact.stat().st_size, "sha256": sha(contact)},
            "worstDifferenceOverview": {"file": worst_path.name, "bytes": worst_path.stat().st_size, "sha256": sha(worst_path), "view": worst["view"], "heatmapScale": "max RGB delta x4"},
            "rawRendersRetainedLocally": True, "pillowVersion": PILLOW_VERSION,
            "humanReview": {"reviewer": "Codex visual inspection", "result": "accepted" if accept else "pending", "scope": "front/back/isometric silhouette, face, clothes, bag, thin parts and material identity"},
        }
        if not result["underFivePercentContract"]:
            raise ValueError(f"visual A/B exceeds 5%: {variant}")
        (stage / "visual-comparison.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--reuse-existing-renders", action="store_true")
    parser.add_argument("--accept", action="store_true")
    args = parser.parse_args()
    compare(args.repo.resolve(), args.output_root.resolve(), args.reuse_existing_renders, args.accept)


if __name__ == "__main__":
    main()
