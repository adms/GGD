#!/usr/bin/env python3
"""Render source/final views for the second MBA reserve batch."""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROSTER = {
    "nowel": ("諾威爾·迪亞斯塔西斯", "outputs/game-asset-library-20260907/magical-battle-arena/models/Model/Chara02_O/Nowel.glb"),
    "kukuri": ("柯柯麗", "outputs/game-asset-library-20260907/magical-battle-arena/models/Model/Chara07/KukuriMigMig.glb"),
    "naga": ("白蛇娜卡", "outputs/game-asset-library-20260907/magical-battle-arena/models/Model/Chara08/Naga.glb"),
    "gajet1": ("Gadget Drone I 型", "outputs/game-asset-library-20260907/magical-battle-arena/models/Model/Chara09/Gajet1.glb"),
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--final", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--jobs", type=int, default=4)
    args = parser.parse_args()
    repo, workspace, final, output = (p.resolve() for p in (args.repo, args.workspace, args.final, args.output))
    output.mkdir(parents=True, exist_ok=True)
    renderer = repo / "tools/hero-model-library/source-workflows/approved-derivatives-v1/render_static_glb.py"
    jobs = []
    for slug, (label, source_relative) in ROSTER.items():
        jobs.extend([
            (slug, label, "source", workspace / source_relative),
            (slug, label, "final", final / slug / "body.glb"),
        ])

    def render(job):
        slug, label, variant, source = job
        target = output / slug / variant
        if target.exists():
            run = json.loads((target / "run.json").read_text()) if (target / "run.json").is_file() else {}
            if run.get("complete") and not run.get("errorExists"):
                return job, target
            raise RuntimeError(f"incomplete render directory exists: {target}")
        subprocess.run(["python3", str(renderer), str(source), str(target), "--repo", str(repo)], check=True)
        return job, target

    records = []
    with ThreadPoolExecutor(max_workers=max(1, min(args.jobs, 4))) as pool:
        futures = [pool.submit(render, job) for job in jobs]
        for future in as_completed(futures):
            (slug, label, variant, source), target = future.result()
            proof = json.loads((target / "proof.json").read_text())
            run = json.loads((target / "run.json").read_text())
            records.append({
                "slug": slug,
                "label": label,
                "variant": variant,
                "source": str(source),
                "sourceSha256": sha(source),
                "output": str(target),
                "complete": run.get("complete") is True and run.get("errorExists") is False,
                "animationGroups": proof.get("animationGroups"),
                "skeletons": proof.get("skeletons"),
                "geometry": proof.get("geometry"),
                "worldSkinnedBounds": proof.get("worldSkinnedBounds"),
                "views": {name: {"path": str(target / f"{name}.png"), "sha256": sha(target / f"{name}.png")} for name in ("front", "isometric", "back")},
            })
    records.sort(key=lambda row: (list(ROSTER).index(row["slug"]), row["variant"]))

    thumb, pad, caption = 400, 16, 56
    sheet = Image.new("RGB", (thumb * 4 + pad * 5, (thumb + caption + pad) * 2 + pad), (235, 237, 241))
    draw = ImageDraw.Draw(sheet)
    font_path = Path("/System/Library/Fonts/STHeiti Medium.ttc")
    font = ImageFont.truetype(str(font_path), 20) if font_path.is_file() else ImageFont.load_default(size=20)
    for column, (slug, (label, _)) in enumerate(ROSTER.items()):
        for row_index, variant in enumerate(("source", "final")):
            record = next(row for row in records if row["slug"] == slug and row["variant"] == variant)
            image = Image.open(record["views"]["front"]["path"]).convert("RGB")
            image.thumbnail((thumb, thumb))
            x = pad + column * (thumb + pad) + (thumb - image.width) // 2
            y = pad + row_index * (thumb + caption + pad) + (thumb - image.height) // 2
            sheet.paste(image, (x, y))
            draw.text((pad + column * (thumb + pad), y + thumb + 5), f"{label} / {variant}", font=font, fill=(20, 20, 24))
    contact = output / "source-final-contact-sheet.png"
    sheet.save(contact, optimize=True)
    receipt = {
        "schema": "ggd-mba-unused-model-batch2-visual@1",
        "records": records,
        "summary": {"requested": len(jobs), "complete": sum(row["complete"] for row in records), "failed": sum(not row["complete"] for row in records)},
        "contactSheet": {"path": str(contact), "bytes": contact.stat().st_size, "sha256": sha(contact)},
        "scope": "Babylon WebGL rest-pose source/final evidence; motion semantics, source shader parity, hero binding and deployment excluded.",
    }
    (output / "receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(receipt["summary"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
