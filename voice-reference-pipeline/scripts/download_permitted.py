"""Phase 4 — download clips whose recommended_action is auto_download.

Reads reports/license_review_queue.csv. Only rows with recommended_action ==
auto_download AND all four license flags true are eligible. Each download is
stored under incoming/downloaded_permitted/ together with a .license.json
sidecar recording source URL, license URL, SHA-256 and the download date.
Existing files are never overwritten. Direct media URLs only — catalogue pages
are skipped with a warning (pick the concrete clip URL during manual review).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pipeline_util import (  # noqa: E402
    AUDIO_EXTS, INCOMING_DIR, NetConfig, REPORTS_DIR, get_logger,
    load_processing_config, read_csv_rows, save_metadata, sha256_of,
    utcnow_iso, http_fetch,
)

DEST_DIR = INCOMING_DIR / "downloaded_permitted"


def eligible_rows(queue: list[dict[str, str]]) -> list[dict[str, str]]:
    return [
        row for row in queue
        if row.get("recommended_action") == "auto_download"
        and all(row.get(k) == "true" for k in
                ("download_allowed", "commercial_use", "derivative_use", "ai_use"))
        and row.get("candidate_url")
    ]


def is_direct_media_url(url: str) -> bool:
    return Path(urlparse(url).path).suffix.lower() in AUDIO_EXTS


def download_row(row: dict[str, str], net: NetConfig, *, dry_run: bool) -> Path | None:
    logger = get_logger("download_permitted")
    url = row["candidate_url"]
    if not is_direct_media_url(url):
        logger.warning("%s: %s is not a direct audio URL — resolve it during "
                       "manual review and paste the clip URL into the queue", row["id"], url)
        return None
    ext = Path(urlparse(url).path).suffix.lower()
    dest = DEST_DIR / f"{row['id']}{ext}"
    counter = 2
    while dest.exists():
        dest = DEST_DIR / f"{row['id']}.{counter}{ext}"
        counter += 1
    if dry_run:
        logger.info("[dry-run] would download %s -> %s", url, dest)
        return None
    DEST_DIR.mkdir(parents=True, exist_ok=True)
    payload = http_fetch(url, net, logger=logger)
    if not payload:
        raise RuntimeError(f"{url}: empty response body")
    dest.write_bytes(payload)
    sidecar: dict[str, Any] = {
        "hero_id": row["id"],
        "source_url": url,
        "source_name": row.get("source_name", ""),
        "license_url": row.get("license_url", ""),
        "license_type": row.get("license_type", ""),
        "sha256": sha256_of(dest),
        "downloaded_at": utcnow_iso(),
    }
    dest.with_suffix(dest.suffix + ".license.json").write_text(
        __import__("json").dumps(sidecar, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info("downloaded %s (%d bytes) -> %s", url, len(payload), dest)
    return dest


def run(*, dry_run: bool = False) -> list[Path]:
    logger = get_logger("download_permitted")
    queue_path = REPORTS_DIR / "license_review_queue.csv"
    if not queue_path.exists():
        logger.warning("no %s — run search_candidates first; nothing to download", queue_path.name)
        return []
    queue = read_csv_rows(queue_path)
    rows = eligible_rows(queue)
    logger.info("auto_download eligible rows: %d / %d", len(rows), len(queue))
    net = NetConfig.from_config(load_processing_config())
    downloaded: list[Path] = []
    for row in rows:
        result = download_row(row, net, dry_run=dry_run)
        if result is not None:
            downloaded.append(result)
    return downloaded


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    run(dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
