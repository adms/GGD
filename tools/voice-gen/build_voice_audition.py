#!/usr/bin/env python3
"""Build the self-contained voice-reference audition page.

The reference pipeline deliberately refuses to treat "technically usable" as
"approved": whether a clip SOUNDS like the character is a human call. This
script turns the pipeline's reports into one offline HTML page where that call
can actually be made -- every clip playable, every near-collision playable
BACK TO BACK against the clip it collides with, and the verdict exported as the
``*.review.json`` the pipeline already reads.

Audio is embedded as MP3 data URIs so the page makes zero network requests.
The measured separation numbers always come from the lossless 24 kHz WAVs; the
MP3 is only what reaches the ear, and it is applied identically to both sides of
every A/B pair so it cannot bias a comparison.

Usage:
    python3 tools/voice-gen/build_voice_audition.py --pack /path/to/pack
"""

from __future__ import annotations

import argparse
import base64
import csv
import html
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

# ECAPA thresholds are the pack's own (config/processing.yaml). They are
# ASSERTED by the pack, not calibrated on this material -- on this corpus 0.78
# sits near ECAPA's p97, so it flags almost nothing.
ECAPA_HIGH = 0.78
ECAPA_REVIEW = 0.68
# campplus 0.50 is the likelihood-ratio crossover derived against a 29-actor WC3
# control corpus (content/assets/audio/voices/_separation-baseline.json).
# 0.40 is the target for newly cast pairs. Never apply these to ECAPA output.
CAMPPLUS_CONFUSABLE = 0.50
CAMPPLUS_TARGET = 0.40
# Register gate, held SEPARATELY from either cosine because campplus is nearly
# blind to register. Same register AND same embedding is the worst case.
F0_GATE_SEMITONES = 2.0

NONHUMAN_METRIC = "acoustic_descriptor"

STATUS_ORDER = [
    "technical_candidate_ready",
    "listening_review_required",
    "replacement_or_manual_isolation_required",
    "source_url_unavailable",
    "record_new_voice",
]

STATUS_LABEL = {
    "technical_candidate_ready": "技術候選就緒",
    "listening_review_required": "需試聽覆核",
    "replacement_or_manual_isolation_required": "需替換／人工分離",
    "source_url_unavailable": "來源連結失效",
    "record_new_voice": "需重新錄製",
}

STATUS_BLURB = {
    "technical_candidate_ready": (
        "規格與自動訊號指標都過關，可以直接試聽。這<b>不代表</b>已完成角色辨識——"
        "「像不像這個角色」正是這一頁要你決定的事。"
    ),
    "listening_review_required": (
        "自動訊號啟發式判定可能有配樂或多人同時說話。啟發式<b>不是</b>權威分類器："
        "近門檻時必須用耳朵判。怪物聲、呼吸、笑聲都是合法表現，不該只因 ASR 辨識率低就否決。"
    ),
    "replacement_or_manual_isolation_required": (
        "共用預告片無法提供可信的單一角色片段。其中 4 支是<b>同一個檔案</b>——見上方警示。"
    ),
    "source_url_unavailable": "來源連結已失效，需要重新尋源。沒有音檔可試聽。",
    "record_new_voice": "找不到可驗證且權利清楚的官方語音，需依法委託錄製。沒有音檔可試聽。",
}

PITCH_OPTIONS = [
    "high",
    "mid",
    "low",
    "high_to_low_dynamic",
    "low_to_high_dynamic",
    "very_low",
    "very_high",
]
TEMPO_OPTIONS = ["fast", "medium", "slow", "variable_fast", "variable_slow", "clipped"]


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def fnum(value: str | float | None, default: float = 0.0) -> float:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default


def profile_labels(profile: str) -> tuple[str, str]:
    """Mirror build_manifest._profile_labels so the prefill matches the fallback."""
    pitch = "mid"
    if "high" in profile or "child" in profile or "cartoon" in profile:
        pitch = "high"
    if "low" in profile or "giant" in profile:
        pitch = "low"
    tempo = "medium"
    if any(t in profile for t in ("comedic", "tsundere", "high_energy")):
        tempo = "fast"
    if any(t in profile for t in ("flat", "divine", "ultra", "relaxed", "old")):
        tempo = "slow"
    return pitch, tempo


def encode_mp3(wav: Path, bitrate: str) -> str:
    """Transcode to mono MP3 and return a base64 data URI."""
    proc = subprocess.run(
        [
            "ffmpeg", "-v", "error", "-nostdin", "-i", str(wav),
            "-ac", "1", "-b:a", bitrate, "-f", "mp3", "pipe:1",
        ],
        capture_output=True,
        check=True,
    )
    return "data:audio/mpeg;base64," + base64.b64encode(proc.stdout).decode("ascii")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def build(pack: Path, out: Path, bitrate: str) -> dict[str, Any]:
    reports = pack / "reports"
    heroes = read_csv(pack / "config" / "heroes.csv")
    inventory = read_csv(reports / "role_clip_inventory.csv")
    processing = read_csv(reports / "processing_report.csv")
    separation = read_csv(reports / "separation_report.csv")
    instructs = read_csv(reports / "cosyvoice_instructs.csv")

    comparison_path = reports / "encoder_comparison.csv"
    comparison = read_csv(comparison_path) if comparison_path.exists() else []

    hero_by_id = {h["id"]: h for h in heroes}
    proc_by_id = {p["id"]: p for p in processing if p.get("id")}
    inst_by_id = {i["id"]: i for i in instructs if i.get("id")}

    # ---- audio -----------------------------------------------------------
    audio: dict[str, str] = {}
    digests: dict[str, list[str]] = {}
    processed_dir = pack / "approved" / "processed"
    for row in inventory:
        rel = row.get("processed_path") or ""
        if not rel:
            continue
        wav = pack / rel
        if not wav.exists():
            continue
        audio[row["id"]] = encode_mp3(wav, bitrate)
        import hashlib

        digest = hashlib.sha256(wav.read_bytes()).hexdigest()
        digests.setdefault(digest, []).append(row["id"])

    # Byte-identical clips mean two champions share ONE recording. The
    # inventory still counts them as separate deliverables.
    dup_groups = [ids for ids in digests.values() if len(ids) > 1]

    # ---- pair tables -----------------------------------------------------
    # Human pairs carry both encoders; non-human pairs are acoustic descriptors
    # and are NEVER ranked against a speaker-embedding threshold.
    pairs_by_id: dict[str, list[dict[str, Any]]] = {}

    for row in comparison:
        a, b = row["id_a"], row["id_b"]
        rec = {
            "ecapa": fnum(row.get("ecapa_cosine")),
            "campplus": fnum(row.get("campplus_cosine")),
            "f0": fnum(row.get("abs_semitone_f0_delta"), -1.0),
            "metric": "dual_speaker_embedding",
        }
        for src, dst, name in ((a, b, row["character_b"]), (b, a, row["character_a"])):
            item = dict(rec)
            item["other"] = dst
            item["other_name"] = name
            pairs_by_id.setdefault(src, []).append(item)

    nonhuman_ids: set[str] = set()
    for row in separation:
        if row.get("metric") != NONHUMAN_METRIC:
            continue
        a, b = row["id_a"], row["id_b"]
        nonhuman_ids.update({a, b})
        rec = {
            "descriptor": fnum(row.get("similarity")),
            "metric": NONHUMAN_METRIC,
            "f0": -1.0,
        }
        for src, dst, name in ((a, b, row["character_b"]), (b, a, row["character_a"])):
            item = dict(rec)
            item["other"] = dst
            item["other_name"] = name
            pairs_by_id.setdefault(src, []).append(item)

    # A non-human id also appears in descriptor pairs with humans; the ones that
    # never appear in the ECAPA table are the true descriptor-routed set.
    ecapa_ids = {r["id_a"] for r in comparison} | {r["id_b"] for r in comparison}
    nonhuman_ids -= ecapa_ids

    def rank_key(p: dict[str, Any]) -> float:
        if p["metric"] == NONHUMAN_METRIC:
            return p["descriptor"]
        # Normalise each encoder against ITS OWN threshold, then take the worse.
        # This surfaces a pair flagged by either encoder without ever mixing the
        # two scales into a single number that gets judged by one bar.
        return max(p["ecapa"] / ECAPA_HIGH, p["campplus"] / CAMPPLUS_CONFUSABLE)

    for key in pairs_by_id:
        pairs_by_id[key].sort(key=rank_key, reverse=True)

    # ---- assemble champions ---------------------------------------------
    champions: list[dict[str, Any]] = []
    for row in inventory:
        hid = row["id"]
        hero = hero_by_id.get(hid, {})
        proc = proc_by_id.get(hid, {})
        inst = inst_by_id.get(hid, {})
        pitch, tempo = profile_labels(hero.get("voice_profile", ""))
        pairs = pairs_by_id.get(hid, [])
        neighbours = [p for p in pairs if p["other"] in audio][:5]

        worst_e = max((p["ecapa"] for p in pairs if p["metric"] != NONHUMAN_METRIC), default=None)
        worst_c = max((p["campplus"] for p in pairs if p["metric"] != NONHUMAN_METRIC), default=None)

        champions.append(
            {
                "id": hid,
                "character": row["character"],
                "status": row.get("delivery_status", ""),
                "quality": row.get("quality_status", ""),
                "role_identity": proc.get("role_identity_status", ""),
                "duration": fnum(row.get("duration")),
                "source_url": row.get("source_url", ""),
                "notes": row.get("notes", ""),
                "replacement": row.get("replacement_source_name", ""),
                "replacement_url": row.get("replacement_candidate_url", ""),
                "replacement_notes": row.get("replacement_notes", ""),
                "origin": hero.get("origin", ""),
                "voice_profile": hero.get("voice_profile", ""),
                "current_voice": hero.get("current_voice", ""),
                "official_va": hero.get("official_voice_actor", ""),
                "direction": hero.get("reference_direction", ""),
                "nonhuman": hid in nonhuman_ids,
                "has_audio": hid in audio,
                "worst_ecapa": worst_e,
                "worst_campplus": worst_c,
                "neighbours": neighbours,
                "suggest": {"pitch": pitch, "tempo": tempo},
                "instructs": {
                    k: inst.get(f"{k}_instruct_ja", "")
                    for k in ("default", "attack", "ultimate", "hurt", "death")
                },
            }
        )

    summary_path = reports / "encoder_comparison_summary.json"
    summary = json.loads(summary_path.read_text(encoding="utf-8")) if summary_path.exists() else {}

    payload = {
        "champions": champions,
        "audio": audio,
        "dup_groups": dup_groups,
        "summary": summary,
        "thresholds": {
            "ecapa_high": ECAPA_HIGH,
            "ecapa_review": ECAPA_REVIEW,
            "campplus_confusable": CAMPPLUS_CONFUSABLE,
            "campplus_target": CAMPPLUS_TARGET,
            "f0_gate": F0_GATE_SEMITONES,
        },
        "bitrate": bitrate,
    }

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render(payload), encoding="utf-8")
    return {
        "clips": len(audio),
        "distinct": len(digests),
        "dup_groups": dup_groups,
        "bytes": out.stat().st_size,
    }


def render(payload: dict[str, Any]) -> str:
    data = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    tmpl = (Path(__file__).parent / "voice_audition_template.html").read_text(encoding="utf-8")
    return tmpl.replace("/*__PAYLOAD__*/null", data)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--pack", required=True, type=Path, help="voice reference pipeline root")
    ap.add_argument("--out", type=Path, default=None, help="output HTML path")
    ap.add_argument("--bitrate", default="128k", help="MP3 bitrate for embedded audio")
    args = ap.parse_args()

    if not shutil.which("ffmpeg"):
        print("ffmpeg not found on PATH", file=sys.stderr)
        return 1
    pack = args.pack.expanduser().resolve()
    if not (pack / "reports" / "role_clip_inventory.csv").exists():
        print(f"not a pipeline pack: {pack}", file=sys.stderr)
        return 1

    out = args.out or pack / "audition" / "voice-audition.html"
    stats = build(pack, out.expanduser().resolve(), args.bitrate)
    print(f"wrote {out}  ({stats['bytes'] / 1e6:.1f} MB)")
    print(f"  clips embedded : {stats['clips']}")
    print(f"  distinct audio : {stats['distinct']}")
    for group in stats["dup_groups"]:
        print(f"  DUPLICATE      : {' = '.join(group)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
