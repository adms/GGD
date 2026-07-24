"""One-button pipeline runner.

    python scripts/run_pipeline.py --research
    python scripts/run_pipeline.py --scan-incoming
    python scripts/run_pipeline.py --process
    python scripts/run_pipeline.py --analyze-separation
    python scripts/run_pipeline.py --build-manifest
    python scripts/run_pipeline.py --all
    python scripts/run_pipeline.py --dry-run --all
    python scripts/run_pipeline.py --hero godie-e001 --process --force

--all: validate configs -> research -> scan incoming (quality) -> extract
best 5-15s -> normalize -> separation -> instructs+manifest -> summary.
Downloads are intentionally NOT part of --all; run download_permitted.py
explicitly after reviewing the license queue.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

import analyze_separation  # noqa: E402
import build_manifest  # noqa: E402
import extract_best_segment  # noqa: E402
import inspect_audio  # noqa: E402
import research_cast  # noqa: E402
import search_candidates  # noqa: E402
from pipeline_util import (  # noqa: E402
    DRY_RUN_REPORTS_DIR, PipelineError, REPORTS_DIR, ensure_runtime,
    get_logger, license_mode, load_heroes, load_instruct_seeds,
    load_processing_config, load_search_sources, read_csv_rows,
)
import normalize_audio  # noqa: E402


def validate_configs() -> None:
    """Fail fast on inconsistent configuration."""
    heroes = load_heroes()
    ids = [h["id"] for h in heroes]
    if len(ids) != len(set(ids)):
        raise PipelineError("heroes.csv: duplicate hero ids")
    required_cols = {"rank", "id", "character", "voice_profile", "current_voice",
                     "origin", "official_voice_actor", "casting_reference",
                     "reference_direction", "status"}
    if missing_cols := required_cols - set(heroes[0].keys()):
        raise PipelineError(f"heroes.csv missing columns: {missing_cols}")

    cfg = load_processing_config()
    license_mode(cfg)
    sep = cfg.get("separation", {})
    high = float(sep.get("high_collision_threshold", 0.78))
    review = float(sep.get("review_threshold", 0.68))
    if not (0.0 < review < high <= 1.0):
        raise PipelineError("processing.yaml: separation thresholds must satisfy 0 < review < high <= 1")
    unknown_nonhuman = set(cfg.get("non_human_ids", [])) - set(ids)
    if unknown_nonhuman:
        raise PipelineError(f"processing.yaml: non_human_ids not in heroes.csv: {unknown_nonhuman}")

    seeds = load_instruct_seeds()
    if missing_seeds := set(ids) - set(seeds):
        raise PipelineError(f"instruct_seeds.json missing heroes: {missing_seeds}")
    load_search_sources()


def _report(name: str, dry_run: bool) -> list[dict[str, str]]:
    for base in ((DRY_RUN_REPORTS_DIR, REPORTS_DIR) if dry_run else (REPORTS_DIR,)):
        path = base / name
        if path.exists():
            return read_csv_rows(path)
    return []


def summarize(dry_run: bool) -> None:
    heroes = load_heroes()
    manifest = _report("voice_reference_manifest.csv", dry_run)
    missing = _report("missing_characters.csv", dry_run)
    queue = _report("license_review_queue.csv", dry_run)
    rejected = _report("rejected_clips.csv", dry_run)
    separation = _report("separation_report.csv", dry_run)

    approved = [r for r in manifest if r["approved"] == "true"]
    manual_review = [r for r in queue if r["recommended_action"] in
                     {"manual_review", "request_permission"}]
    rejected_quality = [r for r in rejected
                        if "license" not in r.get("reject_reasons", "")]
    rejected_license = [r for r in rejected
                        if "license" in r.get("reject_reasons", "")]
    high_pairs = [r for r in separation if r["collision_risk"] == "high"]
    record_new = sorted({r["id"] for r in queue if r["recommended_action"] == "record_new_voice"})
    ready_paths = [r["file_path"] for r in approved]
    missing_ids = [f"{r['id']} {r['character']}" for r in missing]

    print()
    print("=" * 64)
    print(f"Total characters: {len(heroes)}")
    print(f"Approved references: {len(approved)}")
    print(f"Needs manual license review: {len(manual_review)}")
    print(f"Missing references: {len(missing)}")
    print(f"Rejected for quality: {len(rejected_quality)}")
    print(f"Rejected for licensing: {len(rejected_license)}")
    print(f"High collision pairs: {len(high_pairs)}")
    print(f"Ready for CosyVoice 3: {len(ready_paths)}")
    print("=" * 64)

    if missing_ids:
        print(f"\n[1] 尚未取得音檔的角色 ({len(missing_ids)}):")
        for line in missing_ids:
            print(f"    - {line}")
    print("\n[2] 聲線碰撞風險最高的 10 組:")
    if separation:
        for row in separation[:10]:
            print(f"    - {row['character_a']} vs {row['character_b']}: "
                  f"{row['similarity']} ({row['collision_risk']})"
                  + (f" → {row['recommended_fix']}" if row['recommended_fix'] else ""))
    else:
        print("    (無已處理音檔, 尚無分離度資料)")
    print("\n[3] 需要重新錄製的角色 (record_new_voice):")
    if record_new:
        for hid in record_new:
            print(f"    - {hid}")
    else:
        print("    (無)")
    print("\n[4] 已可直接交付 CosyVoice 3 的檔案:")
    if ready_paths:
        for p in ready_paths:
            print(f"    - {p}")
    else:
        print("    (尚無 — 將參考音放入 incoming/user_owned/ 後重跑 --all)")
    print()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--research", action="store_true")
    parser.add_argument("--scan-incoming", action="store_true")
    parser.add_argument("--process", action="store_true")
    parser.add_argument("--analyze-separation", action="store_true")
    parser.add_argument("--build-manifest", action="store_true")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true",
                        help="reprocess even when outputs already exist")
    parser.add_argument("--hero", help="restrict scan/process to one hero id")
    args = parser.parse_args(argv)

    if not any((args.research, args.scan_incoming, args.process,
                args.analyze_separation, args.build_manifest, args.all)):
        parser.error("pick at least one stage flag (or --all)")

    logger = get_logger("run_pipeline")
    ensure_runtime()
    logger.info("validating configs ...")
    validate_configs()
    dry = args.dry_run
    if dry:
        logger.info("DRY-RUN: 分析照跑, 但不寫入 approved/, 不下載; "
                    "報表輸出改導向 logs/dry-run-reports/")

    if args.all or args.research:
        logger.info("[stage] research")
        research_cast.run(dry_run=dry)
        search_candidates.run(dry_run=dry)
    if args.all or args.scan_incoming:
        logger.info("[stage] scan incoming + quality inspection")
        inspect_audio.run(dry_run=dry, force=args.force, only_hero=args.hero)
    if args.all or args.process:
        logger.info("[stage] extract best 5-15s segments")
        extract_best_segment.run(dry_run=dry, force=args.force, only_hero=args.hero)
        logger.info("[stage] normalize to 24kHz/mono/s16 + loudnorm")
        normalize_audio.run(dry_run=dry, force=args.force, only_hero=args.hero)
    if args.all or args.analyze_separation:
        logger.info("[stage] cross-character separation")
        analyze_separation.run(dry_run=dry)
    if args.all or args.build_manifest:
        logger.info("[stage] instructs + manifest")
        build_manifest.run(dry_run=dry)

    summarize(dry)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
