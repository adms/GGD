"""Shared infrastructure for the voice-reference pipeline.

Paths, structured logging, CSV (UTF-8 with BOM), config loading, ffmpeg/HTTP
helpers, and filename conventions. Every script imports this module.
"""
from __future__ import annotations

import csv
import hashlib
import json
import logging
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Sequence

# ---------------------------------------------------------------- paths -----

ROOT: Path = Path(__file__).resolve().parents[1]
CONFIG_DIR = ROOT / "config"
INCOMING_DIR = ROOT / "incoming"
CANDIDATES_DIR = ROOT / "candidates"
METADATA_DIR = CANDIDATES_DIR / "metadata"
PREVIEWS_DIR = CANDIDATES_DIR / "previews"
APPROVED_RAW_DIR = ROOT / "approved" / "raw"
APPROVED_PROCESSED_DIR = ROOT / "approved" / "processed"
REJECTED_DIR = ROOT / "rejected"
REPORTS_DIR = ROOT / "reports"
LOGS_DIR = ROOT / "logs"
DRY_RUN_REPORTS_DIR = LOGS_DIR / "dry-run-reports"

INCOMING_BUCKETS: dict[str, str] = {
    "user_owned": "user_owned",
    "licensed": "licensed",
    "downloaded_permitted": "permitted",
}

AUDIO_EXTS = {".wav", ".mp3", ".m4a", ".flac", ".ogg"}

LICENSE_STATUSES = {
    "permitted", "user_owned", "licensed",
    "needs_manual_license_review", "not_permitted", "unknown",
}
RECOMMENDED_ACTIONS = {
    "auto_download", "manual_review", "request_permission",
    "reject", "record_new_voice",
}

MIN_PYTHON = (3, 11)


class PipelineError(RuntimeError):
    """Fatal, user-facing pipeline error."""


def ensure_runtime() -> None:
    """Fail fast on missing runtime prerequisites."""
    if sys.version_info < (3, 10):
        raise PipelineError(
            f"Python {sys.version.split()[0]} is too old; need >= "
            f"{'.'.join(map(str, MIN_PYTHON))} (see README)."
        )
    if sys.version_info < MIN_PYTHON:
        logging.getLogger("pipeline").warning(
            "Python %s < recommended %s — continuing, but use the project venv",
            sys.version.split()[0], ".".join(map(str, MIN_PYTHON)),
        )
    for tool in ("ffmpeg", "ffprobe"):
        if shutil.which(tool) is None:
            raise PipelineError(f"{tool} not found on PATH — install FFmpeg (see README)")


# --------------------------------------------------------------- logging ----

class _JsonlHandler(logging.Handler):
    def __init__(self, path: Path) -> None:
        super().__init__()
        self._path = path

    def emit(self, record: logging.LogRecord) -> None:
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        with self._path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry, ensure_ascii=False) + "\n")


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger
    logger.setLevel(logging.INFO)
    console = logging.StreamHandler()
    console.setFormatter(logging.Formatter("%(asctime)s %(levelname)-7s [%(name)s] %(message)s", "%H:%M:%S"))
    logger.addHandler(console)
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    logger.addHandler(_JsonlHandler(LOGS_DIR / "pipeline.jsonl"))
    logger.propagate = False
    return logger


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ------------------------------------------------------------------- CSV ----

def read_csv_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        return [dict(row) for row in csv.DictReader(fh)]


def write_csv_rows(
    path: Path,
    rows: Iterable[dict[str, Any]],
    fieldnames: Sequence[str],
    *,
    dry_run: bool = False,
) -> Path:
    """Write a UTF-8-with-BOM CSV (Excel-friendly). In dry-run mode the file is
    diverted to logs/dry-run-reports/ so real reports are never clobbered."""
    if dry_run:
        DRY_RUN_REPORTS_DIR.mkdir(parents=True, exist_ok=True)
        path = DRY_RUN_REPORTS_DIR / path.name
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(fieldnames), extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
    return path


# ---------------------------------------------------------------- config ----

def load_yaml(path: Path) -> dict[str, Any]:
    import yaml  # hard dependency, provided by the project venv

    with path.open("r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh)
    if not isinstance(data, dict):
        raise PipelineError(f"{path} did not parse to a mapping")
    return data


def load_processing_config() -> dict[str, Any]:
    return load_yaml(CONFIG_DIR / "processing.yaml")


def load_search_sources() -> list[dict[str, Any]]:
    data = load_yaml(CONFIG_DIR / "search_sources.yaml")
    sources = data.get("sources")
    if not isinstance(sources, list) or not sources:
        raise PipelineError("search_sources.yaml: 'sources' list missing or empty")
    return sources


def load_heroes() -> list[dict[str, str]]:
    heroes = read_csv_rows(CONFIG_DIR / "heroes.csv")
    if not heroes:
        raise PipelineError("config/heroes.csv is empty")
    return heroes


def load_instruct_seeds() -> dict[str, Any]:
    with (CONFIG_DIR / "instruct_seeds.json").open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    data.pop("_comment", None)
    return data


def license_mode(cfg: dict[str, Any]) -> str:
    mode = str(cfg.get("license", {}).get("mode", "strict"))
    if mode not in {"strict", "private_research"}:
        raise PipelineError(f"processing.yaml: unknown license.mode {mode!r}")
    return mode


# ------------------------------------------------------------ subprocess ----

def run_command(args: Sequence[str], *, timeout_s: float = 600.0) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(
        list(args), capture_output=True, text=True, timeout=timeout_s,
    )
    if proc.returncode != 0:
        tail = "\n".join(proc.stderr.strip().splitlines()[-8:])
        raise PipelineError(f"command failed ({args[0]}, rc={proc.returncode}):\n{tail}")
    return proc


def ffprobe_json(path: Path) -> dict[str, Any]:
    proc = run_command([
        "ffprobe", "-v", "error", "-print_format", "json",
        "-show_format", "-show_streams", str(path),
    ])
    return json.loads(proc.stdout)


# ------------------------------------------------------------------ HTTP ----

@dataclass
class NetConfig:
    timeout_s: float = 30.0
    retries: int = 3
    backoff_s: float = 2.0
    user_agent: str = "GGD-VoiceRefPipeline/1.0"

    @classmethod
    def from_config(cls, cfg: dict[str, Any]) -> "NetConfig":
        net = cfg.get("network", {})
        return cls(
            timeout_s=float(net.get("timeout_s", 30)),
            retries=int(net.get("retries", 3)),
            backoff_s=float(net.get("backoff_s", 2.0)),
            user_agent=str(net.get("user_agent", cls.user_agent)),
        )


def http_fetch(url: str, net: NetConfig, *, logger: logging.Logger) -> bytes:
    """GET with UA/timeout/retry. Raises PipelineError after exhausting retries."""
    last_err: Exception | None = None
    for attempt in range(1, net.retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": net.user_agent})
            with urllib.request.urlopen(req, timeout=net.timeout_s) as resp:
                return resp.read()
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_err = exc
            logger.warning("fetch attempt %d/%d failed for %s: %s", attempt, net.retries, url, exc)
            if attempt < net.retries:
                time.sleep(net.backoff_s * attempt)
    raise PipelineError(f"failed to fetch {url} after {net.retries} attempts: {last_err}")


# ------------------------------------------------------------- filenames ----

def parse_ref_filename(name: str) -> tuple[str, int] | None:
    """'godie-e001.wav' -> ('godie-e001', 1); 'godie-e001.2.wav' -> ('godie-e001', 2).

    Returns None when the name does not follow the convention.
    """
    p = Path(name)
    if p.suffix.lower() not in AUDIO_EXTS:
        return None
    stem = p.stem  # strips the audio extension only
    hero_id, dot, variant_s = stem.rpartition(".")
    if not dot:
        return stem, 1
    if variant_s.isdigit() and int(variant_s) >= 2:
        return hero_id, int(variant_s)
    return None


def processed_output_path(hero_id: str, variant: int) -> Path:
    suffix = "" if variant == 1 else f".{variant}"
    return APPROVED_PROCESSED_DIR / f"{hero_id}{suffix}.wav"


def next_free_variant(hero_id: str, directory: Path) -> int:
    variant = 1
    while True:
        suffix = "" if variant == 1 else f".{variant}"
        if not (directory / f"{hero_id}{suffix}.wav").exists():
            return variant
        variant += 1


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def iter_incoming_files() -> list[tuple[Path, str]]:
    """All audio files under incoming/, tagged with their license bucket."""
    found: list[tuple[Path, str]] = []
    for bucket_dir, license_tag in INCOMING_BUCKETS.items():
        base = INCOMING_DIR / bucket_dir
        if not base.is_dir():
            continue
        for path in sorted(base.rglob("*")):
            if path.is_file() and path.suffix.lower() in AUDIO_EXTS:
                found.append((path, license_tag))
    return found


def metadata_path_for(source: Path) -> Path:
    return METADATA_DIR / f"{source.name}.json"


def load_metadata(source: Path) -> dict[str, Any] | None:
    meta_path = metadata_path_for(source)
    if not meta_path.exists():
        return None
    with meta_path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def save_metadata(source: Path, data: dict[str, Any], *, dry_run: bool = False) -> None:
    if dry_run:
        return
    METADATA_DIR.mkdir(parents=True, exist_ok=True)
    with metadata_path_for(source).open("w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)


# ------------------------------------------------------------- reporting ----

@dataclass
class ProcessingLog:
    """Accumulates rows for reports/processing_report.csv across stages."""

    FIELDS = ("timestamp", "stage", "hero_id", "variant", "input_file",
              "output_file", "action", "status", "detail")
    rows: list[dict[str, str]] = field(default_factory=list)

    def add(self, stage: str, *, hero_id: str = "", variant: int | str = "",
            input_file: str = "", output_file: str = "", action: str = "",
            status: str = "ok", detail: str = "") -> None:
        self.rows.append({
            "timestamp": utcnow_iso(), "stage": stage, "hero_id": hero_id,
            "variant": str(variant), "input_file": input_file,
            "output_file": output_file, "action": action, "status": status,
            "detail": detail,
        })

    def write(self, *, dry_run: bool = False) -> Path:
        existing: list[dict[str, str]] = []
        report = REPORTS_DIR / "processing_report.csv"
        if report.exists() and not dry_run:
            existing = read_csv_rows(report)
        return write_csv_rows(report, existing + self.rows, self.FIELDS, dry_run=dry_run)
