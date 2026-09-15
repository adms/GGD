#!/usr/bin/env python3
"""Freeze the actual JUMP FORCE Dai v6 alpha-review render for owner review.

The alpha-normalized v6 GLB is immutable and has a distinct hash from v5.
This helper only copies the three deterministic WebGL review images and their
run/proof receipts after verifying that they came from that exact v6 byte
stream.  It does not turn visual proof into owner approval or register a
runtime option.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil


V6_SHA = "bdd72532896ff92db3f18238771fc63e0139f845068bb78a678ca7bede9d999d"
VIEWS = ("front", "back", "isometric")


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def encode(value: dict) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def copy_exact(source: Path, target: Path, write: bool) -> None:
    if target.is_file() and target.read_bytes() == source.read_bytes():
        return
    if not write:
        raise ValueError(f"stale frozen review file: {target}")
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)


def write_or_match(path: Path, content: bytes, write: bool) -> None:
    if path.is_file() and path.read_bytes() == content:
        return
    if not write:
        raise ValueError(f"stale generated review file: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def review_page(review: dict) -> bytes:
    cards = "\n".join(
        f'<figure><img src="review-assets/jump-force-dai-v6/{view}.png" alt="達伊 v6 {view}"><figcaption>{title}</figcaption></figure>'
        for view, title in (("front", "正面"), ("back", "背面"), ("isometric", "等角"))
    )
    return f"""<!doctype html>
<html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>JUMP FORCE 達伊 v6 視覺審查</title>
<style>body{{background:#111827;color:#e5e7eb;font:16px system-ui;margin:0 auto;max-width:1320px;padding:28px}}h1{{margin-bottom:4px}}.state{{color:#fbbf24}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}}figure{{margin:0;background:#1f2937;padding:12px;border-radius:8px}}img{{width:100%;height:auto;background:#b9bec8}}figcaption{{padding-top:8px}}code{{word-break:break-all}}</style>
<h1>JUMP FORCE 小呆／達伊 `chr0430` v6</h1>
<p class="state">技術畫面已完成；等待 owner 視覺決策。此頁不會登錄後台模型，也不代表已上架或已部署。</p>
<p>來源候選 SHA-256：<code>{review['candidate']['sha256']}</code><br>7,930 面／6 draw／256px／159 joints／0 原生動作。</p>
<div class="grid">{cards}</div>
</html>""".encode()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--asset-root", type=Path, required=True)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    repo, asset_root = args.repo.resolve(), args.asset_root.resolve()
    stage = asset_root / "conversions/jump-force-dai-six-draw-v6-alpha"
    source = stage / "run-a/dai-chr0430-six-draw.glb"
    render = stage / "render-v1"
    backup_path = asset_root / "backups/jump-force-dai-six-draw-v6-alpha-render-v1/latest-receipt.json"
    evidence = repo / "materials/hero-model-library/priority-evidence/jump-force-dai-six-draw-v6"
    public = repo / "apps/client/public/review-assets/jump-force-dai-v6"
    if not source.is_file() or sha(source) != V6_SHA:
        raise ValueError("v6 source is absent or changed")
    run = json.loads((render / "run.json").read_text())
    proof = render / "proof.json"
    if (run.get("sourceSha256") != V6_SHA or run.get("complete") is not True
            or run.get("proofExists") is not True or run.get("errorExists") is not False
            or run.get("images") != 3 or not proof.is_file()):
        raise ValueError("v6 render receipt is incomplete or refers to another GLB")
    if not backup_path.is_file():
        raise FileNotFoundError(f"missing v6 legacy backup receipt: {backup_path}")
    backup = json.loads(backup_path.read_text())
    required_backup = ("s3Uri", "manifestUri", "archiveSha256", "archiveBytes", "fileCount")
    if (backup.get("schema") != "ggd-intake-backup-receipt@1"
            or Path(backup.get("source", "")).resolve() != stage.resolve()
            or not backup.get("s3Uri", "").startswith("s3://ggd-390630837668-ap-east-2-an/legacy/")
            or backup.get("fullGetVerified") is not True
            or backup.get("allMemberSha256Verified") is not True
            or any(key not in backup for key in required_backup)):
        raise ValueError("v6 legacy backup receipt is invalid")
    images = []
    for view in VIEWS:
        image = render / f"{view}.png"
        if not image.is_file() or image.stat().st_size == 0:
            raise FileNotFoundError(image)
        images.append({"view": view, "bytes": image.stat().st_size, "sha256": sha(image)})
        copy_exact(image, evidence / image.name, args.write)
        copy_exact(image, public / image.name, args.write)
    copy_exact(proof, evidence / proof.name, args.write)
    copy_exact(render / "run.json", evidence / "render-run.json", args.write)
    review = {
        "schema": "ggd.jump-force-dai-v6-alpha-visual-review@1",
        "candidate": {"absolutePath": str(source), "sha256": V6_SHA, "bytes": source.stat().st_size},
        "render": {
            "runAbsolutePath": str((render / "run.json").resolve()), "runSha256": sha(render / "run.json"),
            "proofAbsolutePath": str(proof.resolve()), "proofSha256": sha(proof),
            "images": images,
        },
        "technicalRenderComplete": True,
        "stageBackup": {key: backup[key] for key in (*required_backup, "fullGetVerified", "allMemberSha256Verified", "localUnchanged", "profile", "region")},
        "ownerVisualQualityReview": "pending-owner-v6-alpha-normalization-review",
        "backendOptionRegistered": False,
        "runtimeSelectable": False,
        "productionDeployed": False,
    }
    write_or_match(evidence / "visual-review.json", encode(review), args.write)
    write_or_match(repo / "apps/client/public/jump-force-dai-v6-review.html", review_page(review), args.write)
    print(json.dumps({"candidateSha256": V6_SHA, "views": len(images), "ownerReview": review["ownerVisualQualityReview"], "check": not args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
