"""Phase 5a — pick the most emotional 5-15 s from each accepted clip.

Clips <= 15 s pass through whole. Longer clips get a sliding-window search
scored on loudness dynamics + spectral flux + pitch range; window edges snap
to nearby silence so sentences aren't chopped. The chosen segment is written
to approved/raw/{hero_id}[.N].wav (PCM, original sample rate — format
conversion happens later in normalize_audio.py).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from audio_metrics import best_segment, decode_pcm, frame_analysis, probe  # noqa: E402
from pipeline_util import (  # noqa: E402
    APPROVED_RAW_DIR, ProcessingLog, get_logger, iter_incoming_files,
    load_metadata, load_processing_config, run_command, save_metadata,
)


def raw_output_path(hero_id: str, variant: int) -> Path:
    suffix = "" if variant == 1 else f".{variant}"
    return APPROVED_RAW_DIR / f"{hero_id}{suffix}.wav"


def extract_one(path: Path, meta: dict[str, Any], cfg: dict[str, Any],
                plog: ProcessingLog, *, dry_run: bool, force: bool) -> Path | None:
    logger = get_logger("extract_best_segment")
    hero_id, variant = meta["hero_id"], int(meta["variant"])
    out = raw_output_path(hero_id, variant)
    if out.exists() and not force:
        logger.info("skip (exists): %s", out.name)
        return out

    info = probe(path)
    audio = decode_pcm(path)
    fs = frame_analysis(audio)
    start, end, score = best_segment(fs, info.duration, cfg)
    meta["segment"] = {"start": start, "end": end, "score": score}
    save_metadata(path, meta, dry_run=dry_run)

    action = "copy_whole" if (start == 0.0 and abs(end - info.duration) < 0.05) else "trim"
    logger.info("%s: %s %.2f-%.2fs (score=%.3f, 原長 %.1fs)",
                path.name, action, start, end, score, info.duration)
    if dry_run:
        plog.add("extract", hero_id=hero_id, variant=variant, input_file=path.name,
                 output_file=out.name, action=f"[dry-run] {action}",
                 detail=f"{start:.2f}-{end:.2f}s score={score:.3f}")
        return None

    APPROVED_RAW_DIR.mkdir(parents=True, exist_ok=True)
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", str(path)]
    if action == "trim":
        cmd += ["-ss", f"{start:.3f}", "-t", f"{end - start:.3f}"]
    cmd += ["-map", "a:0", "-c:a", "pcm_s16le", str(out)]
    run_command(cmd)
    plog.add("extract", hero_id=hero_id, variant=variant, input_file=path.name,
             output_file=out.name, action=action,
             detail=f"{start:.2f}-{end:.2f}s score={score:.3f}")
    return out


def run(*, dry_run: bool = False, force: bool = False,
        only_hero: str | None = None) -> list[Path]:
    logger = get_logger("extract_best_segment")
    cfg = load_processing_config()
    plog = ProcessingLog()
    outputs: list[Path] = []
    for path, _tag in iter_incoming_files():
        meta = load_metadata(path)
        if meta is None:
            logger.warning("%s: 尚未 inspect, 先執行 inspect_audio", path.name)
            continue
        if meta.get("verdict") not in {"accepted", "needs_review"}:
            continue
        if only_hero and meta.get("hero_id") != only_hero:
            continue
        result = extract_one(path, meta, cfg, plog, dry_run=dry_run, force=force)
        if result is not None:
            outputs.append(result)
    plog.write(dry_run=dry_run)
    logger.info("extracted %d segments", len(outputs))
    return outputs


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true", help="re-extract even if output exists")
    parser.add_argument("--hero", help="only process this hero id")
    args = parser.parse_args(argv)
    run(dry_run=args.dry_run, force=args.force, only_hero=args.hero)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
