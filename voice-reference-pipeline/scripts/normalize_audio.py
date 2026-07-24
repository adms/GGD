"""Phase 5b — normalize approved segments to the CosyVoice delivery format.

approved/raw/*.wav  ->  approved/processed/{hero_id}[.N].wav
WAV / 24 kHz / mono / 16-bit PCM, high-pass ~70 Hz (also kills DC offset),
optional gentle denoise, two-pass ffmpeg loudnorm to about -19 LUFS with true
peak <= -1 dBTP, then an ebur128 verification pass. Character is preserved:
no aggressive compression, no per-hero uniformity beyond loudness.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from audio_metrics import ebur128  # noqa: E402
from pipeline_util import (  # noqa: E402
    APPROVED_PROCESSED_DIR, APPROVED_RAW_DIR, PipelineError, ProcessingLog,
    get_logger, load_processing_config, parse_ref_filename, run_command,
)

_LOUDNORM_JSON = re.compile(r"\{[^{}]*\"input_i\"[^{}]*\}", re.S)


def _filter_chain(cfg: dict[str, Any], loudnorm_args: str) -> str:
    filters = cfg.get("filters", {})
    chain = [f"highpass=f={int(filters.get('highpass_hz', 70))}"]
    if str(filters.get("denoise", "off")) == "gentle":
        chain.append(f"afftdn=nr={int(filters.get('denoise_nr_db', 6))}:nf=-40")
    chain.append(loudnorm_args)
    return ",".join(chain)


def _loudnorm_target(cfg: dict[str, Any]) -> tuple[float, float]:
    loud = cfg.get("loudness", {})
    return float(loud.get("integrated_lufs", -19.0)), float(loud.get("true_peak_dbtp", -1.0))


def measure_pass(src: Path, cfg: dict[str, Any]) -> dict[str, str]:
    target_i, target_tp = _loudnorm_target(cfg)
    loudnorm = f"loudnorm=I={target_i}:TP={target_tp}:LRA=11:print_format=json"
    proc = subprocess.run(
        ["ffmpeg", "-nostats", "-i", str(src), "-af", _filter_chain(cfg, loudnorm),
         "-f", "null", "-"], capture_output=True, text=True, timeout=600)
    match = _LOUDNORM_JSON.search(proc.stderr)
    if proc.returncode != 0 or not match:
        raise PipelineError(f"loudnorm measure pass failed for {src.name}")
    return json.loads(match.group(0))


def render_pass(src: Path, dest: Path, measured: dict[str, str], cfg: dict[str, Any]) -> None:
    target = cfg.get("target", {})
    target_i, target_tp = _loudnorm_target(cfg)
    loudnorm = (
        f"loudnorm=I={target_i}:TP={target_tp}:LRA=11:linear=true"
        f":measured_I={measured['input_i']}:measured_TP={measured['input_tp']}"
        f":measured_LRA={measured['input_lra']}:measured_thresh={measured['input_thresh']}"
        f":offset={measured['target_offset']}"
    )
    run_command([
        "ffmpeg", "-v", "error", "-y", "-i", str(src),
        "-af", _filter_chain(cfg, loudnorm),
        "-ar", str(int(target.get("sample_rate", 24000))),
        "-ac", str(int(target.get("channels", 1))),
        "-sample_fmt", str(target.get("sample_fmt", "s16")),
        str(dest),
    ])


def verify_output(dest: Path, cfg: dict[str, Any]) -> str:
    loud = cfg.get("loudness", {})
    tol = float(loud.get("verify_tolerance_lu", 0.75))
    lufs, _lra, tp = ebur128(dest)
    problems: list[str] = []
    if not (float(loud.get("lufs_min", -20.0)) - tol <= lufs <= float(loud.get("lufs_max", -18.0)) + tol):
        problems.append(f"loudness {lufs:.1f} LUFS outside target")
    if tp > float(loud.get("true_peak_dbtp", -1.0)) + 0.3:
        problems.append(f"true peak {tp:.1f} dBTP above target")
    return "; ".join(problems)


def normalize_one(src: Path, cfg: dict[str, Any], plog: ProcessingLog,
                  *, dry_run: bool, force: bool) -> Path | None:
    logger = get_logger("normalize_audio")
    parsed = parse_ref_filename(src.name)
    if parsed is None:
        logger.warning("%s: 檔名不符規則, 跳過", src.name)
        return None
    hero_id, variant = parsed
    suffix = "" if variant == 1 else f".{variant}"
    dest = APPROVED_PROCESSED_DIR / f"{hero_id}{suffix}.wav"
    if dest.exists() and not force:
        logger.info("skip (exists): %s", dest.name)
        return dest
    if dry_run:
        logger.info("[dry-run] would normalize %s -> %s", src.name, dest.name)
        plog.add("normalize", hero_id=hero_id, variant=variant, input_file=src.name,
                 output_file=dest.name, action="[dry-run] loudnorm2pass")
        return None

    APPROVED_PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    measured = measure_pass(src, cfg)
    render_pass(src, dest, measured, cfg)
    problems = verify_output(dest, cfg)
    status = "ok" if not problems else "verify_warn"
    if problems:
        logger.warning("%s: %s", dest.name, problems)
    else:
        logger.info("normalized %s -> %s", src.name, dest.name)
    plog.add("normalize", hero_id=hero_id, variant=variant, input_file=src.name,
             output_file=dest.name, action="loudnorm2pass", status=status, detail=problems)
    return dest


def run(*, dry_run: bool = False, force: bool = False,
        only_hero: str | None = None) -> list[Path]:
    logger = get_logger("normalize_audio")
    cfg = load_processing_config()
    plog = ProcessingLog()
    sources = sorted(APPROVED_RAW_DIR.glob("*.wav"))
    if only_hero:
        sources = [s for s in sources
                   if (parse_ref_filename(s.name) or ("", 0))[0] == only_hero]
    outputs: list[Path] = []
    for src in sources:
        result = normalize_one(src, cfg, plog, dry_run=dry_run, force=force)
        if result is not None:
            outputs.append(result)
    plog.write(dry_run=dry_run)
    logger.info("normalized %d files", len(outputs))
    return outputs


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true", help="re-normalize even if output exists")
    parser.add_argument("--hero", help="only process this hero id")
    args = parser.parse_args(argv)
    run(dry_run=args.dry_run, force=args.force, only_hero=args.hero)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
