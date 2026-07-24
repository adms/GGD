"""Phase 2 — build reports/research_report.csv.

Merges config/heroes.csv with verified research data in config/research/*.json
(produced by online research sessions; each entry carries two source URLs that
were actually visited). With --verify-urls it re-checks that recorded source
URLs still resolve (HTTP HEAD/GET) and notes failures — it never invents URLs.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pipeline_util import (  # noqa: E402
    CONFIG_DIR, LICENSE_STATUSES, NetConfig, REPORTS_DIR, get_logger,
    http_fetch, load_heroes, load_processing_config, write_csv_rows,
)

FIELDS = ("id", "character", "official_voice_actor", "version", "source_url_1",
          "source_url_2", "voice_characteristics", "recommended_emotion",
          "license_status", "license_evidence_url", "notes")


def load_research_data() -> dict[str, dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    research_dir = CONFIG_DIR / "research"
    if not research_dir.is_dir():
        return merged
    for path in sorted(research_dir.glob("*.json")):
        with path.open("r", encoding="utf-8") as fh:
            entries = json.load(fh)
        if not isinstance(entries, list):
            raise ValueError(f"{path.name}: expected a JSON array")
        for entry in entries:
            merged[str(entry["id"])] = entry
    return merged


def build_rows(heroes: list[dict[str, str]], research: dict[str, dict[str, Any]]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for hero in heroes:
        hid = hero["id"]
        entry = research.get(hid, {})
        status = str(entry.get("license_status", "unknown")) or "unknown"
        if status not in LICENSE_STATUSES:
            raise ValueError(f"{hid}: invalid license_status {status!r}")
        rows.append({
            "id": hid,
            "character": hero["character"],
            "official_voice_actor": str(entry.get("official_voice_actor") or hero["official_voice_actor"]),
            "version": str(entry.get("version", "")),
            "source_url_1": str(entry.get("source_url_1", "")),
            "source_url_2": str(entry.get("source_url_2", "")),
            "voice_characteristics": str(entry.get("voice_characteristics") or hero["reference_direction"]),
            "recommended_emotion": str(entry.get("recommended_emotion", "")),
            "license_status": status,
            "license_evidence_url": str(entry.get("license_evidence_url", "")),
            "notes": str(entry.get("notes") or ("seed only — 尚無線上查證資料" if not entry else "")),
        })
    return rows


def verify_urls(rows: list[dict[str, str]], cfg: dict[str, Any]) -> None:
    logger = get_logger("research_cast")
    net = NetConfig.from_config(cfg)
    for row in rows:
        for key in ("source_url_1", "source_url_2", "license_evidence_url"):
            url = row[key]
            if not url:
                continue
            try:
                http_fetch(url, net, logger=logger)
            except Exception as exc:  # noqa: BLE001 — recorded, not swallowed
                row["notes"] = (row["notes"] + f" | URL失效({key}): {exc}").strip(" |")
                logger.warning("%s: %s unreachable: %s", row["id"], url, exc)


def run(*, dry_run: bool = False, do_verify_urls: bool = False) -> Path:
    logger = get_logger("research_cast")
    heroes = load_heroes()
    research = load_research_data()
    logger.info("heroes=%d, research entries=%d", len(heroes), len(research))
    missing = [h["id"] for h in heroes if h["id"] not in research]
    if missing:
        logger.warning("%d heroes lack research data: %s", len(missing), ", ".join(missing))
    rows = build_rows(heroes, research)
    if do_verify_urls:
        verify_urls(rows, load_processing_config())
    out = write_csv_rows(REPORTS_DIR / "research_report.csv", rows, FIELDS, dry_run=dry_run)
    logger.info("research report -> %s (%d rows)", out, len(rows))
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--verify-urls", action="store_true",
                        help="re-check recorded source URLs over the network")
    args = parser.parse_args(argv)
    run(dry_run=args.dry_run, do_verify_urls=args.verify_urls)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
