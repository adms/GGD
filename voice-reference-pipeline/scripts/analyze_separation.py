"""Phase 7 — cross-character voice separation analysis.

Embeds every approved/processed clip (SpeechBrain ECAPA-TDNN when installed,
otherwise a documented spectral-proxy feature vector) and computes pairwise
cosine similarity. Pairs involving the configured non-human characters are
compared on acoustic features (pitch range, centroid, rolloff, harmonicity,
roughness, tempo, attack) instead of speaker embeddings alone. In a 12-player
arena any two heroes can meet, so ALL pairs are analyzed, sorted riskiest
first. Thresholds live in config/processing.yaml (separation.*).
"""
from __future__ import annotations

import argparse
import sys
from itertools import combinations
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from audio_metrics import (  # noqa: E402
    acoustic_features, cosine_similarity, decode_pcm, feature_similarity,
    frame_analysis, proxy_embedding, try_speechbrain_embedding,
)
from pipeline_util import (  # noqa: E402
    APPROVED_PROCESSED_DIR, REPORTS_DIR, get_logger, load_heroes,
    load_processing_config, parse_ref_filename, write_csv_rows,
)

FIELDS = ("id_a", "character_a", "id_b", "character_b", "similarity",
          "collision_risk", "recommended_fix")

FIX_CHOICES = ("降低音高", "提高音高", "改用更慢語速", "改用更快語速", "增加沙啞感",
               "改用氣音", "改用吼叫片段", "改用冷語片段", "改用卡通鼻音",
               "改用非語言聲音", "重新錄製")


def collect_profiles(backend: str) -> tuple[dict[str, dict[str, Any]], str]:
    """hero_id -> {embedding, features, files}; returns actual backend used."""
    logger = get_logger("analyze_separation")
    used_backend = backend
    profiles: dict[str, dict[str, Any]] = {}
    for wav in sorted(APPROVED_PROCESSED_DIR.glob("*.wav")):
        parsed = parse_ref_filename(wav.name)
        if parsed is None:
            continue
        hero_id, _variant = parsed
        audio = decode_pcm(wav)
        fs = frame_analysis(audio)
        features = acoustic_features(fs)

        embedding: list[float] | None = None
        if backend in {"auto", "speechbrain"}:
            try:
                embedding = try_speechbrain_embedding(wav)
            except Exception as exc:  # noqa: BLE001 — degrade loudly, not silently
                logger.warning("speechbrain failed on %s: %s", wav.name, exc)
            if embedding is None and backend == "speechbrain":
                raise RuntimeError("embedding_backend=speechbrain but speechbrain is unusable")
        if embedding is None:
            embedding = proxy_embedding(features)
            used_backend = "spectral_proxy"

        slot = profiles.setdefault(hero_id, {"embeddings": [], "features": [], "files": []})
        slot["embeddings"].append(embedding)
        slot["features"].append(features)
        slot["files"].append(wav.name)

    for slot in profiles.values():  # average multi-variant profiles
        n = len(slot["embeddings"])
        dim = len(slot["embeddings"][0])
        slot["embedding"] = [sum(e[i] for e in slot["embeddings"]) / n for i in range(dim)]
        keys = slot["features"][0].keys()
        slot["feature"] = {k: sum(f[k] for f in slot["features"]) / n for k in keys}
    return profiles, used_backend


def risk_label(similarity: float, cfg: dict[str, Any]) -> str:
    sep = cfg.get("separation", {})
    if similarity >= float(sep.get("high_collision_threshold", 0.78)):
        return "high"
    if similarity >= float(sep.get("review_threshold", 0.68)):
        return "needs_review"
    return "acceptable"


def recommend_fix(fa: dict[str, float], fb: dict[str, float],
                  a_nonhuman: bool, b_nonhuman: bool) -> str:
    """Deterministic fix suggestion from the closest-matching feature axis."""
    if a_nonhuman or b_nonhuman:
        return "改用非語言聲音"
    pitch_a, pitch_b = max(fa["f0_median"], 1.0), max(fb["f0_median"], 1.0)
    pitch_ratio = abs(pitch_a - pitch_b) / max(pitch_a, pitch_b)
    tempo_diff = abs(fa["tempo_onsets_per_s"] - fb["tempo_onsets_per_s"])
    centroid_ratio = abs(fa["centroid_mean"] - fb["centroid_mean"]) / max(fa["centroid_mean"], fb["centroid_mean"], 1.0)
    dyn_diff = abs(fa["rms_dynamics"] - fb["rms_dynamics"])

    if pitch_ratio < 0.12:
        return "降低音高" if pitch_a <= pitch_b else "提高音高"
    if tempo_diff < 0.5:
        return "改用更慢語速" if fa["tempo_onsets_per_s"] >= fb["tempo_onsets_per_s"] else "改用更快語速"
    if centroid_ratio < 0.15:
        return "增加沙啞感" if fa["flatness_mean"] <= fb["flatness_mean"] else "改用氣音"
    if dyn_diff < 4.0:
        return "改用吼叫片段" if fa["rms_dynamics"] <= fb["rms_dynamics"] else "改用冷語片段"
    return "重新錄製"


def run(*, dry_run: bool = False) -> list[dict[str, str]]:
    logger = get_logger("analyze_separation")
    cfg = load_processing_config()
    heroes = {h["id"]: h for h in load_heroes()}
    non_human = set(cfg.get("non_human_ids", []))
    backend_cfg = str(cfg.get("separation", {}).get("embedding_backend", "auto"))

    profiles, backend = collect_profiles(backend_cfg)
    logger.info("profiles for %d heroes (backend=%s)", len(profiles), backend)
    if backend == "spectral_proxy" and profiles:
        logger.warning("使用 spectral_proxy 代理特徵 — 結果僅供排序參考; "
                       "安裝 speechbrain 可得真正的 speaker embedding")

    proxy_scale = float(cfg.get("separation", {}).get("proxy_distance_scale", 3.0))
    rows: list[dict[str, str]] = []
    for id_a, id_b in combinations(sorted(profiles), 2):
        pa, pb = profiles[id_a], profiles[id_b]
        a_nh, b_nh = id_a in non_human, id_b in non_human
        if a_nh or b_nh or backend == "spectral_proxy":
            # 非人類聲音(或無 speaker embedding 後端): 以聲學特徵的距離型
            # 相似度比較 — z-score 向量用 cosine 會被共同大分量支配而虛高
            sim = feature_similarity(proxy_embedding(pa["feature"]),
                                     proxy_embedding(pb["feature"]), proxy_scale)
        else:
            sim = cosine_similarity(pa["embedding"], pb["embedding"])
        risk = risk_label(sim, cfg)
        fix = recommend_fix(pa["feature"], pb["feature"], a_nh, b_nh) if risk != "acceptable" else ""
        if fix and fix not in FIX_CHOICES:
            raise RuntimeError(f"invalid fix {fix!r}")
        rows.append({
            "id_a": id_a, "character_a": heroes.get(id_a, {}).get("character", id_a),
            "id_b": id_b, "character_b": heroes.get(id_b, {}).get("character", id_b),
            "similarity": f"{sim:.4f}", "collision_risk": risk,
            "recommended_fix": fix,
        })

    rows.sort(key=lambda r: float(r["similarity"]), reverse=True)
    out = write_csv_rows(REPORTS_DIR / "separation_report.csv", rows, FIELDS, dry_run=dry_run)
    high = sum(r["collision_risk"] == "high" for r in rows)
    logger.info("separation report -> %s (%d pairs, %d high risk)", out, len(rows), high)
    return rows


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    run(dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
