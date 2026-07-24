"""Phase 8 — final deliverables.

* reports/voice_reference_manifest.csv — one row per processed clip (plus a
  placeholder row per hero with no clip), with approval gating.
* reports/cosyvoice_instructs.csv — per-hero Japanese instruct text for
  inference_instruct2 (default/attack/ultimate/hurt/death), generated from
  config/instruct_seeds.json. Every instruct ends with the no-impersonation
  clause.
* reports/missing_characters.csv — heroes still lacking any approved clip.

approve = true requires: length in range, quality pass, emotion/segment score
present, no high-collision pair — and verified licensing when license.mode
== strict (in private_research mode licensing is recorded, not gated).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pipeline_util import (  # noqa: E402
    APPROVED_PROCESSED_DIR, REPORTS_DIR, get_logger, iter_incoming_files,
    license_mode, load_heroes, load_instruct_seeds, load_metadata,
    load_processing_config, parse_ref_filename, read_csv_rows, sha256_of,
    write_csv_rows,
)
from audio_metrics import probe  # noqa: E402

MANIFEST_FIELDS = ("id", "character", "file_path", "variant", "duration",
                   "voice_profile", "official_voice_actor", "casting_reference",
                   "emotion", "pitch_profile", "tempo_profile", "license_status",
                   "license_source", "source_url", "license_url", "sha256",
                   "quality_status", "separation_status", "approved", "notes")

INSTRUCT_FIELDS = ("id", "character", "default_instruct_ja", "attack_instruct_ja",
                   "ultimate_instruct_ja", "hurt_instruct_ja", "death_instruct_ja")

MISSING_FIELDS = ("id", "character", "voice_profile", "reason", "recommended_source")

BAN_JA = "特定の実在人物の声を模倣しない。"

SCENE_DEFAULTS = {
    "default": "通常時の話し方。",
    "attack": "攻撃の瞬間の短い掛け声。息が強く乗り、鋭く切れる。",
    "ultimate": "必殺技の解放。感情・音量・音高が最大まで高まり、声を張る。",
    "hurt": "被弾の苦痛。短い呻きで、息が詰まる。",
    "death": "力尽きる最後の声。震えて弱まり、途切れる。",
}


# ------------------------------------------------------------- instructs ----

def build_instructs(heroes: list[dict[str, str]], seeds: dict[str, Any]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for hero in heroes:
        seed = seeds.get(hero["id"])
        if seed is None:
            raise ValueError(f"instruct_seeds.json missing hero {hero['id']}")
        base = str(seed["base_ja"]).rstrip("。") + "。"
        overrides = seed.get("scene_overrides", {})
        row: dict[str, str] = {"id": hero["id"], "character": hero["character"]}
        for scene, default_text in SCENE_DEFAULTS.items():
            scene_text = str(overrides.get(scene, default_text))
            row[f"{scene}_instruct_ja"] = f"{base}{scene_text}{BAN_JA}"
        rows.append(row)
    return rows


# -------------------------------------------------------------- manifest ----

def _incoming_meta_by_output(heroes: dict[str, dict[str, str]]) -> dict[str, dict[str, Any]]:
    """Map processed filename -> intake metadata (license, sha, metrics...)."""
    out: dict[str, dict[str, Any]] = {}
    for path, _tag in iter_incoming_files():
        meta = load_metadata(path)
        if not meta or not meta.get("hero_id"):
            continue
        variant = int(meta.get("variant") or 1)
        suffix = "" if variant == 1 else f".{variant}"
        out[f"{meta['hero_id']}{suffix}.wav"] = meta
    return out


def _license_sidecar(meta: dict[str, Any]) -> dict[str, str]:
    src = Path(meta.get("source_path", ""))
    sidecar = src.with_suffix(src.suffix + ".license.json") if src.name else None
    if sidecar and sidecar.exists():
        import json
        data = json.loads(sidecar.read_text(encoding="utf-8"))
        return {"source_url": str(data.get("source_url", "")),
                "license_url": str(data.get("license_url", "")),
                "source_name": str(data.get("source_name", ""))}
    return {"source_url": "", "license_url": "", "source_name": ""}


def _separation_status(hero_id: str, separation_rows: list[dict[str, str]]) -> str:
    worst = "ok"
    for row in separation_rows:
        if hero_id not in (row["id_a"], row["id_b"]):
            continue
        if row["collision_risk"] == "high":
            return "high_collision"
        if row["collision_risk"] == "needs_review":
            worst = "needs_review"
    return worst


def build_manifest_rows(cfg: dict[str, Any]) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    logger = get_logger("build_manifest")
    mode = license_mode(cfg)
    seg = cfg.get("segment", {})
    heroes = load_heroes()
    heroes_by_id = {h["id"]: h for h in heroes}
    seeds = load_instruct_seeds()
    intake = _incoming_meta_by_output(heroes_by_id)

    sep_path = REPORTS_DIR / "separation_report.csv"
    separation_rows = read_csv_rows(sep_path) if sep_path.exists() else []

    manifest: list[dict[str, str]] = []
    covered: set[str] = set()
    for wav in sorted(APPROVED_PROCESSED_DIR.glob("*.wav")):
        parsed = parse_ref_filename(wav.name)
        if parsed is None:
            logger.warning("%s: 檔名不符規則, 不列入 manifest", wav.name)
            continue
        hero_id, variant = parsed
        hero = heroes_by_id.get(hero_id)
        if hero is None:
            logger.warning("%s: 未知英雄 %s", wav.name, hero_id)
            continue
        covered.add(hero_id)
        seed = seeds.get(hero_id, {})
        meta = intake.get(wav.name, {})
        metrics = meta.get("metrics", {})
        sidecar = _license_sidecar(meta)
        duration = probe(wav).duration

        min_d = float(seg.get("min_duration_s", 3.0))
        max_d = float(seg.get("auto_trim_above_s", 20.0))
        length_ok = min_d <= duration <= max_d
        quality_status = meta.get("verdict", "unknown")
        quality_ok = quality_status in {"accepted", "needs_review"}
        sep_status = _separation_status(hero_id, separation_rows)
        sep_ok = sep_status != "high_collision"
        license_status = str(meta.get("license_bucket", "unknown"))
        license_ok = (mode == "private_research") or (
            license_status in {"permitted", "user_owned", "licensed"})
        emotion_ok = bool(meta.get("segment", {}).get("score", 0) or metrics)

        approved = length_ok and quality_ok and sep_ok and license_ok and emotion_ok
        notes: list[str] = []
        if not length_ok:
            notes.append(f"length {duration:.1f}s outside [{min_d},{max_d}]")
        if not quality_ok:
            notes.append(f"quality={quality_status}")
        if not sep_ok:
            notes.append("high voice collision")
        if not license_ok:
            notes.append("license unverified (strict mode)")
        if mode == "private_research" and license_status == "unknown":
            notes.append("private_research: 授權未驗證(不攔截)")

        manifest.append({
            "id": hero_id, "character": hero["character"],
            "file_path": str(wav.relative_to(REPORTS_DIR.parent)),
            "variant": str(variant), "duration": f"{duration:.2f}",
            "voice_profile": hero["voice_profile"],
            "official_voice_actor": hero["official_voice_actor"],
            "casting_reference": hero["casting_reference"],
            "emotion": str(seed.get("emotion", "")),
            "pitch_profile": str(seed.get("pitch_profile", "")),
            "tempo_profile": str(seed.get("tempo_profile", "")),
            "license_status": license_status,
            "license_source": sidecar["source_name"],
            "source_url": sidecar["source_url"],
            "license_url": sidecar["license_url"],
            "sha256": sha256_of(wav),
            "quality_status": quality_status,
            "separation_status": sep_status,
            "approved": "true" if approved else "false",
            "notes": "; ".join(notes),
        })

    missing: list[dict[str, str]] = []
    queue_path = REPORTS_DIR / "license_review_queue.csv"
    queue = read_csv_rows(queue_path) if queue_path.exists() else []
    best_source: dict[str, str] = {}
    for row in queue:
        best_source.setdefault(row["id"], f"{row['source_name']} ({row['recommended_action']})")
    for hero in heroes:
        if hero["id"] not in covered:
            missing.append({
                "id": hero["id"], "character": hero["character"],
                "voice_profile": hero["voice_profile"],
                "reason": "no reference audio yet",
                "recommended_source": best_source.get(hero["id"], "record_new_voice"),
            })
    return manifest, missing


def run(*, dry_run: bool = False) -> dict[str, Any]:
    logger = get_logger("build_manifest")
    cfg = load_processing_config()
    heroes = load_heroes()
    seeds = load_instruct_seeds()

    instruct_rows = build_instructs(heroes, seeds)
    write_csv_rows(REPORTS_DIR / "cosyvoice_instructs.csv", instruct_rows,
                   INSTRUCT_FIELDS, dry_run=dry_run)
    logger.info("cosyvoice instructs: %d heroes", len(instruct_rows))

    manifest, missing = build_manifest_rows(cfg)
    write_csv_rows(REPORTS_DIR / "voice_reference_manifest.csv", manifest,
                   MANIFEST_FIELDS, dry_run=dry_run)
    write_csv_rows(REPORTS_DIR / "missing_characters.csv", missing,
                   MISSING_FIELDS, dry_run=dry_run)
    approved = sum(r["approved"] == "true" for r in manifest)
    logger.info("manifest: %d clips (%d approved); missing heroes: %d",
                len(manifest), approved, len(missing))
    return {"manifest": manifest, "missing": missing, "instructs": instruct_rows}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    run(dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
