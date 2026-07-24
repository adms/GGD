"""Phase 3 — build reports/license_review_queue.csv.

Matches every hero against the curated legal-source catalogue
(config/search_sources.yaml) and computes recommended_action from the license
flags. auto_download requires download+commercial+derivative+ai all true AND
high confidence AND a concrete URL; anything ambiguous goes to manual_review.
Heroes with no matching source get a record_new_voice row so nobody is lost.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pipeline_util import (  # noqa: E402
    RECOMMENDED_ACTIONS, REPORTS_DIR, get_logger, load_heroes,
    load_processing_config, load_search_sources, license_mode, write_csv_rows,
)

FIELDS = ("id", "character", "candidate_url", "source_name", "speaker_name",
          "license_type", "license_url", "commercial_use", "derivative_use",
          "ai_use", "download_allowed", "confidence", "recommended_action")


def _flag(value: Any) -> str:
    """Normalize true/false/unknown flags to strings."""
    if value is True:
        return "true"
    if value is False:
        return "false"
    return "unknown"


def recommended_action(source: dict[str, Any], mode: str) -> str:
    flags = [_flag(source.get(k)) for k in
             ("download_allowed", "commercial_use", "derivative_use", "ai_use")]
    confidence = str(source.get("confidence", "low"))
    negotiable = bool(source.get("negotiable", False))

    if "false" in flags:
        # 在 strict 模式明確不可用; private_research 模式仍標記 reject 以保留
        # 事實(如効果音ラボ明文禁止AI學習), 由人工自行決定是否採用
        return "reject"
    if all(f == "true" for f in flags) and confidence == "high" and source.get("url"):
        return "auto_download"
    if negotiable:
        return "request_permission"
    return "manual_review"


def build_rows(heroes: list[dict[str, str]], sources: list[dict[str, Any]], mode: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for hero in heroes:
        matched = False
        for source in sources:
            profiles = source.get("suitable_profiles") or []
            if hero["voice_profile"] not in profiles:
                continue
            action = recommended_action(source, mode)
            if action not in RECOMMENDED_ACTIONS:
                raise ValueError(f"invalid action {action!r}")
            matched = True
            rows.append({
                "id": hero["id"],
                "character": hero["character"],
                "candidate_url": str(source.get("url", "")),
                "source_name": str(source.get("name", "")),
                "speaker_name": str(source.get("speaker_name", "")),
                "license_type": str(source.get("license_type", "")),
                "license_url": str(source.get("license_url", "")),
                "commercial_use": _flag(source.get("commercial_use")),
                "derivative_use": _flag(source.get("derivative_use")),
                "ai_use": _flag(source.get("ai_use")),
                "download_allowed": _flag(source.get("download_allowed")),
                "confidence": str(source.get("confidence", "low")),
                "recommended_action": action,
            })
        if not matched:
            rows.append({
                "id": hero["id"], "character": hero["character"],
                "candidate_url": "", "source_name": "自主録音",
                "speaker_name": "", "license_type": "契約による買い取り",
                "license_url": "", "commercial_use": "true",
                "derivative_use": "true", "ai_use": "true",
                "download_allowed": "false", "confidence": "high",
                "recommended_action": "record_new_voice",
            })
    return rows


def run(*, dry_run: bool = False) -> Path:
    logger = get_logger("search_candidates")
    cfg = load_processing_config()
    mode = license_mode(cfg)
    heroes = load_heroes()
    sources = load_search_sources()
    rows = build_rows(heroes, sources, mode)
    counts: dict[str, int] = {}
    for row in rows:
        counts[row["recommended_action"]] = counts.get(row["recommended_action"], 0) + 1
    logger.info("license mode=%s; queue rows=%d; actions=%s", mode, len(rows), counts)
    out = write_csv_rows(REPORTS_DIR / "license_review_queue.csv", rows, FIELDS, dry_run=dry_run)
    logger.info("license review queue -> %s", out)
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    run(dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
