"""Phase 6 (runs first on intake) — quality inspection of incoming clips.

Scans incoming/{user_owned,licensed,downloaded_permitted}/ for audio files
following the {hero_id}[.N].{ext} naming rule, measures duration/loudness/
clipping/silence/SNR/speech ratio plus heuristic music & multi-speaker
estimates, and writes a verdict per file into candidates/metadata/.

Hard rejects: <3 s, heavy clipping, >60 % silence, corrupt audio, strong
background-music signature, heavy speaker overlap — and unknown licensing,
but only when license.mode == strict. Odd voices (screams, kuchipa/空耳,
non-Japanese, unclear articulation) are explicitly NOT rejected.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from audio_metrics import compute_metrics  # noqa: E402
from pipeline_util import (  # noqa: E402
    CONFIG_DIR, ProcessingLog, REJECTED_DIR, REPORTS_DIR, get_logger,
    iter_incoming_files, license_mode, load_heroes, load_metadata,
    load_processing_config, parse_ref_filename, read_csv_rows, save_metadata,
    sha256_of, utcnow_iso, write_csv_rows,
)

REJECTED_FIELDS = ("id", "character", "file", "stage", "reject_reasons",
                   "duration", "integrated_loudness", "silence_ratio",
                   "clipping_ratio", "license_bucket", "timestamp")

# 只有啟發式估計造成的拒絕可被人工覆核推翻；硬性缺陷(過短/爆音/損毀/靜音過多)不可。
OVERRIDABLE_REASONS = {"background_music(heuristic)", "multi_speaker(heuristic)"}


def load_review_overrides() -> dict[str, dict[str, str]]:
    """config/review_overrides.csv: 人工覆核決定, 以檔名為鍵。"""
    path = CONFIG_DIR / "review_overrides.csv"
    if not path.exists():
        return {}
    return {row["file"]: row for row in read_csv_rows(path)
            if row.get("decision") == "accept"}


def apply_review_override(
    verdict: str, reject: list[str], review: list[str],
    override: dict[str, str] | None,
) -> tuple[str, list[str], list[str]]:
    """Demote heuristic-only rejections to needs_review when a human already
    reviewed and accepted the clip. Hard failures always stand."""
    if override is None or verdict != "rejected":
        return verdict, reject, review
    if not set(reject) <= OVERRIDABLE_REASONS:
        return verdict, reject, review
    demoted = [f"human_override({override.get('reviewer', '?')}): {r}" for r in reject]
    return "needs_review", [], review + demoted


def evaluate(metrics: dict[str, Any], license_tag: str, mode: str,
             cfg: dict[str, Any]) -> tuple[str, list[str], list[str]]:
    """Return (verdict, reject_reasons, review_notes)."""
    q = cfg.get("quality", {})
    seg = cfg.get("segment", {})
    reject: list[str] = []
    review: list[str] = []

    if metrics["duration"] < float(seg.get("min_duration_s", 3.0)):
        reject.append(f"duration<{seg.get('min_duration_s', 3.0)}s")
    if metrics["clipping_ratio"] > float(q.get("max_clipping_ratio", 0.002)):
        reject.append("clipping")
    if metrics["silence_ratio"] > float(q.get("max_silence_ratio", 0.6)):
        reject.append("silence>60%")
    if metrics["estimated_snr"] < float(q.get("min_snr_db", 10.0)):
        review.append("low_snr")  # 溫和降噪可能可救 → 人工覆核而非直接拒絕
    if metrics["music_probability"] > float(q.get("max_music_probability", 0.65)):
        reject.append("background_music(heuristic)")
    if metrics["multiple_speaker_probability"] > float(q.get("max_multi_speaker_probability", 0.65)):
        reject.append("multi_speaker(heuristic)")
    if metrics["speech_or_vocal_ratio"] < 0.1:
        review.append("little_vocal_content")
    if license_tag == "unknown":
        if mode == "strict":
            reject.append("license_unknown")
        else:
            review.append("license_unknown(private_research: 不攔截)")

    verdict = "rejected" if reject else ("needs_review" if review else "accepted")
    return verdict, reject, review


def inspect_file(path: Path, license_tag: str, heroes: dict[str, dict[str, str]],
                 cfg: dict[str, Any], mode: str, plog: ProcessingLog,
                 overrides: dict[str, dict[str, str]],
                 *, dry_run: bool, force: bool) -> dict[str, Any]:
    logger = get_logger("inspect_audio")
    parsed = parse_ref_filename(path.name)
    hero_id, variant = parsed if parsed else ("", 0)
    entry: dict[str, Any] = {
        "source_path": str(path), "file": path.name, "hero_id": hero_id,
        "variant": variant, "license_bucket": license_tag,
        "inspected_at": utcnow_iso(),
    }

    existing = load_metadata(path)
    if existing and existing.get("sha256") and not force:
        if existing.get("source_path") == str(path):
            logger.info("skip (already inspected): %s", path.name)
            return existing

    if parsed is None:
        entry.update(verdict="rejected", reject_reasons=["bad_filename"], metrics={})
        logger.warning("%s: 檔名不符 {hero_id}[.N].{ext} 規則", path.name)
    elif hero_id not in heroes:
        entry.update(verdict="rejected", reject_reasons=[f"unknown_hero_id:{hero_id}"], metrics={})
        logger.warning("%s: 未知英雄ID %s", path.name, hero_id)
    else:
        # downloaded_permitted 檔案要有 .license.json 佐證, 否則授權視為 unknown
        if license_tag == "permitted":
            sidecar = path.with_suffix(path.suffix + ".license.json")
            if not sidecar.exists():
                license_tag = "unknown"
                entry["license_bucket"] = "unknown"
        try:
            metrics, _ = compute_metrics(path, cfg)
        except Exception as exc:  # noqa: BLE001 — corrupt audio is a reject, loudly
            entry.update(verdict="rejected", reject_reasons=[f"decode_error:{exc}"], metrics={})
            logger.error("%s: decode failed: %s", path.name, exc)
        else:
            verdict, reject, review = evaluate(metrics.as_dict(), license_tag, mode, cfg)
            verdict, reject, review = apply_review_override(
                verdict, reject, review, overrides.get(path.name))
            entry.update(verdict=verdict, reject_reasons=reject,
                         review_notes=review, metrics=metrics.as_dict(),
                         sha256=sha256_of(path))
            logger.info("%s: %s (dur=%.1fs lufs=%.1f silence=%.0f%% snr=%.0fdB)",
                        path.name, verdict, metrics.duration,
                        metrics.integrated_loudness, metrics.silence_ratio * 100,
                        metrics.estimated_snr)

    save_metadata(path, entry, dry_run=dry_run)
    if entry["verdict"] == "rejected" and not dry_run:
        REJECTED_DIR.mkdir(parents=True, exist_ok=True)
        marker = REJECTED_DIR / f"{path.name}.reason.txt"
        marker.write_text("\n".join(entry["reject_reasons"]) + "\n", encoding="utf-8")
    plog.add("inspect", hero_id=hero_id, variant=variant or "", input_file=path.name,
             action="inspect", status=entry["verdict"],
             detail=";".join(entry.get("reject_reasons", []) + entry.get("review_notes", [])))
    return entry


def run(*, dry_run: bool = False, force: bool = False,
        only_hero: str | None = None) -> list[dict[str, Any]]:
    logger = get_logger("inspect_audio")
    cfg = load_processing_config()
    mode = license_mode(cfg)
    heroes = {h["id"]: h for h in load_heroes()}
    files = iter_incoming_files()
    if only_hero:
        files = [(p, tag) for p, tag in files
                 if (parse_ref_filename(p.name) or ("", 0))[0] == only_hero]
    logger.info("incoming files: %d (license mode=%s)", len(files), mode)

    plog = ProcessingLog()
    overrides = load_review_overrides()
    if overrides:
        logger.info("review overrides loaded: %d files", len(overrides))
    results = [inspect_file(p, tag, heroes, cfg, mode, plog, overrides,
                            dry_run=dry_run, force=force)
               for p, tag in files]

    rejected_rows = [{
        "id": r.get("hero_id", ""),
        "character": heroes.get(r.get("hero_id", ""), {}).get("character", ""),
        "file": r["file"], "stage": "inspect",
        "reject_reasons": ";".join(r.get("reject_reasons", [])),
        "duration": r.get("metrics", {}).get("duration", ""),
        "integrated_loudness": r.get("metrics", {}).get("integrated_loudness", ""),
        "silence_ratio": r.get("metrics", {}).get("silence_ratio", ""),
        "clipping_ratio": r.get("metrics", {}).get("clipping_ratio", ""),
        "license_bucket": r.get("license_bucket", ""),
        "timestamp": r.get("inspected_at", ""),
    } for r in results if r.get("verdict") == "rejected"]
    write_csv_rows(REPORTS_DIR / "rejected_clips.csv", rejected_rows,
                   REJECTED_FIELDS, dry_run=dry_run)
    plog.write(dry_run=dry_run)
    logger.info("inspected=%d accepted=%d needs_review=%d rejected=%d",
                len(results),
                sum(r.get("verdict") == "accepted" for r in results),
                sum(r.get("verdict") == "needs_review" for r in results),
                len(rejected_rows))
    return results


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true", help="re-inspect even if metadata exists")
    parser.add_argument("--hero", help="only inspect files for this hero id")
    args = parser.parse_args(argv)
    run(dry_run=args.dry_run, force=args.force, only_hero=args.hero)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
