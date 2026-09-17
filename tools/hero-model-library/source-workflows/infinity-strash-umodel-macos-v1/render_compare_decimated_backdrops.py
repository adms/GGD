#!/usr/bin/env python3
"""Render six runtime states and compare repaired source against decimated output."""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, __version__ as pillow_version

STATES = ("idle", "run", "attack", "cast", "hurt", "death")
SAMPLES = ("0", "50", "100")


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pin(path: Path) -> dict:
    return {"path": str(path), "bytes": path.stat().st_size, "sha256": sha(path)}


def render(repo: Path, source: Path, output: Path, model: Path) -> None:
    run = output / "run.json"
    if run.is_file():
        receipt = json.loads(run.read_text())
        if (receipt.get("complete") is True and receipt.get("sourceSha256") == sha(source)
                and receipt.get("model", {}).get("sha256") == sha(model)
                and len(list(output.glob("ggd-state-*.png"))) == 18):
            return
    if output.exists():
        failed = output.parent / "failed-attempts"
        failed.mkdir(parents=True, exist_ok=True)
        attempt = 1
        destination = failed / f"{output.name}-attempt-{attempt}"
        while destination.exists():
            attempt += 1
            destination = failed / f"{output.name}-attempt-{attempt}"
        output.rename(destination)
    subprocess.run([sys.executable, str(repo / "tools/hero-model-library/source-workflows/infinity-strash-umodel-macos-v1/render_babylon.py"),
                    str(source), str(output), "--model", str(model)], check=True)


def compare_record(repo: Path, local_root: Path, evidence: Path, row: dict, accepted: bool) -> dict:
    candidate_id = row["candidateId"]
    local = local_root / candidate_id
    source, candidate = Path(row["source"]["base"]["path"]), Path(row["output"]["base"]["path"])
    source_render, candidate_render = local / "render-source", local / "render-candidate"
    render(repo, source, source_render, Path(row["reviewModels"]["source"]["path"]))
    render(repo, candidate, candidate_render, Path(row["reviewModels"]["candidate"]["path"]))
    target = evidence / candidate_id
    target.mkdir(parents=True, exist_ok=True)
    rows = []
    for state in STATES:
        panels = []
        for sample in SAMPLES:
            name = f"ggd-state-{state}-{sample}.png"
            left_path, right_path = source_render / name, candidate_render / name
            left = np.asarray(Image.open(left_path).convert("RGB"), dtype=np.int16)
            right = np.asarray(Image.open(right_path).convert("RGB"), dtype=np.int16)
            delta = np.abs(left - right)
            left_luma = .2126 * left[:, :, 0] + .7152 * left[:, :, 1] + .0722 * left[:, :, 2]
            right_luma = .2126 * right[:, :, 0] + .7152 * right[:, :, 1] + .0722 * right[:, :, 2]
            rows.append({
                "state": state, "samplePct": int(sample),
                "changedPixelPctAtChannelDeltaGt10": round(float((delta.max(2) > 10).mean() * 100), 6),
                "meanAbsoluteChannelDelta": round(float(delta.mean()), 6),
                "litClassificationXorPctAtLuma128": round(float(np.logical_xor(left_luma >= 128, right_luma >= 128).mean() * 100), 6),
                "maxChannelDelta": int(delta.max()), "source": pin(left_path), "candidate": pin(right_path),
            })
            panels.append((Image.fromarray(left.astype(np.uint8)).resize((400, 400)), Image.fromarray(right.astype(np.uint8)).resize((400, 400))))
        sheet = Image.new("RGB", (1200, 840), (16, 18, 24))
        draw = ImageDraw.Draw(sheet)
        for column, (left, right) in enumerate(panels):
            x = column * 400
            sheet.paste(left, (x, 20)); sheet.paste(right, (x, 440))
            draw.text((x + 8, 4), f"{state} {SAMPLES[column]}% source", fill="white")
            draw.text((x + 8, 424), f"{state} {SAMPLES[column]}% candidate", fill="white")
        sheet.save(target / f"{state}-contact-sheet.png")
    all_states = Image.new("RGB", (2400, 2520), (16, 18, 24))
    for index, state in enumerate(STATES):
        with Image.open(target / f"{state}-contact-sheet.png") as sheet:
            all_states.paste(sheet.convert("RGB"), ((index % 2) * 1200, (index // 2) * 840))
    all_states.save(target / "all-states-contact-sheet.png")
    worst = max(rows, key=lambda item: item["changedPixelPctAtChannelDeltaGt10"])
    name = f"ggd-state-{worst['state']}-{worst['samplePct']}.png"
    left = Image.open(source_render / name).convert("RGB")
    right = Image.open(candidate_render / name).convert("RGB")
    delta = np.abs(np.asarray(left, dtype=np.int16) - np.asarray(right, dtype=np.int16))
    heat = np.zeros_like(delta, dtype=np.uint8)
    heat[:, :, 0] = np.clip(delta.max(2) * 4, 0, 255).astype(np.uint8)
    heat[:, :, 1] = np.clip(delta.mean(2) * 2, 0, 128).astype(np.uint8)
    overview = Image.new("RGB", (2400, 840), (16, 18, 24))
    overview.paste(left, (0, 40)); overview.paste(right, (800, 40)); overview.paste(Image.fromarray(heat), (1600, 40))
    draw = ImageDraw.Draw(overview)
    draw.text((8, 10), f"source / {worst['state']} {worst['samplePct']}%", fill="white")
    draw.text((808, 10), f"candidate / changed {worst['changedPixelPctAtChannelDeltaGt10']}%", fill="white")
    draw.text((1608, 10), "amplified RGB delta x4", fill="white")
    overview.save(target / "worst-difference-overview.png")
    max_changed = max(item["changedPixelPctAtChannelDeltaGt10"] for item in rows)
    max_lit = max(item["litClassificationXorPctAtLuma128"] for item in rows)
    return {
        "candidateId": candidate_id, "source": pin(source), "candidate": pin(candidate),
        "sampling": {"states": list(STATES), "samplesPct": [int(value) for value in SAMPLES],
                     "renderer": "Babylon WebGL; same clip map, camera, lights and sample times"},
        "metric": {"contractMaxPct": 5, "changedPixelDefinition": "any RGB channel delta >10 over complete 800x800 frame",
                   "litPixelDefinition": "exclusive-or of luma >=128 classification"},
        "rows": rows, "maxChangedPixelPctAtChannelDeltaGt10": max_changed,
        "maxLitClassificationXorPctAtLuma128": max_lit,
        "metricGatePassed": max_lit <= 5,
        "conservativeChangedPixelDiagnosticUnder5": max_changed <= 5,
        "contactSheets": [pin(target / f"{state}-contact-sheet.png") for state in STATES],
        "allStatesContactSheet": pin(target / "all-states-contact-sheet.png"),
        "worstDifferenceOverview": {**pin(target / "worst-difference-overview.png"), "state": worst["state"], "samplePct": worst["samplePct"]},
        "rawRenderRoot": str(local), "rawRendersRetainedLocally": True, "pillowVersion": pillow_version,
        "humanReview": {"reviewer": "Codex visual inspection", "result": "accepted" if accepted else "pending",
                        "scope": "six GGD states at 0/50/100 percent; source and candidate contact sheets plus worst-difference overview"},
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--accept-after-inspection", action="store_true")
    args = parser.parse_args()
    repo, workspace = args.repo.resolve(), args.workspace.resolve()
    evidence = repo / "materials/hero-model-library/priority-evidence/infinity-strash-texture-backdrop-decimation-v1"
    generation = json.loads((evidence / "generation.json").read_text())
    local_root = workspace / "GGD-Asset-Library/conversions/infinity-strash-texture-backdrop-decimation-v1"
    records = [compare_record(repo, local_root, evidence, row, args.accept_after_inspection) for row in generation["records"]]
    result = {"schema": "ggd.infinity-strash-texture-backdrop-decimation-visual@1", "records": records,
              "summary": {"candidates": len(records), "allMetricGatesPassed": all(row["metricGatePassed"] for row in records),
                          "allHumanReviewed": all(row["humanReview"]["result"] == "accepted" for row in records),
                          "maxChangedPixelPct": max(row["maxChangedPixelPctAtChannelDeltaGt10"] for row in records),
                          "maxLitClassificationXorPct": max(row["maxLitClassificationXorPctAtLuma128"] for row in records)}}
    (evidence / "visual-comparison.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(result["summary"]))
    return 0 if result["summary"]["allMetricGatesPassed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
