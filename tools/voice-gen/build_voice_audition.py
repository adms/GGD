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
# ⭐⭐ GH#756 AC2+AC4 —— campplus 的三個門檻**從閘的 JSON 讀**，⛔ 不是字面常數。
#
# 在此之前這三行寫死著 n=1 那一列（0.50 / 0.40 / 2.0），而閘自己的階梯有 **7 列**
# （n = 1,2,3,4,5,6,8）—— ⇒ ⭐ 語料從每人 1 段長到 8 段之後，這支工具仍然拿 n=1 的
# 門檻在判，而**沒有任何東西會紅**（第〇·四守則：同一個數字的第二個住處必然過期）。
#
# ⚠️ 門檻**隨 n 變嚴**（n=1 confusable 0.50 → n=8 更高）：拿 n=1 的門檻去判 n=8 的
# 材料 ⇒ ⭐ 幾乎什麼都不會被標記出來，而報告讀起來跟「全部通過」一模一樣。
#
# ⭐ 這一段同時是 AC2 的答案：在此之前 `separation-qc-gate` 這個名字
# **一個程式檔都沒有引用**（只有規格自己＋文件＋報告）⇒ 零執行者。
SEPARATION_GATE_PATH = (
    Path(__file__).resolve().parents[2]
    / "content/assets/audio/voices/_separation-qc-gate.json"
)


def _load_separation_ladder(clips_per_champion: int) -> dict[str, float]:
    """閘的階梯裡挑**不超過** n 的最後一列（⛔ 不外插）。

    ⚠️ 階梯是離散的（1,2,3,4,5,6,8）—— n=7 要用 n=6 那一列，⭐ 因為往下取是
    **保守**的（門檻較鬆 ⇒ 標記較多 ⇒ 人會看到），⛔ 往上取會漏掉該標的對子。
    """
    gate = json.loads(SEPARATION_GATE_PATH.read_text(encoding="utf-8"))
    rows = gate["thresholdLadder"]["rows"]
    usable = [r for r in rows if int(r["clipsPerChampion"]) <= max(1, clips_per_champion)]
    row = max(usable, key=lambda r: int(r["clipsPerChampion"])) if usable else rows[0]
    return {
        "confusable": float(row["confusableAdopted"]),
        "target": float(row["targetForNewCast"]),
        "hard_ceiling": float(row["hardCeiling"]),
        "pair_budget": float(row["pairBudget"]),
        "n": int(row["clipsPerChampion"]),
    }


# ⭐ 模組層的預設是**最保守的 n=1 列**（門檻最鬆 ⇒ 標記最多 ⇒ 人會看到）。
# ⚠️ `build()` 會依**實際語料**（每位英雄幾段）重算一次 —— ⛔ 讀不到語料時
# 不可以退回一個「比較嚴」的門檻，那會靜默地讓該標的對子消失。
LADDER: dict[str, float] = {}


def _clips_per_champion(inventory: list[dict[str, str]]) -> int:
    """每位英雄**至少**有幾段可用 clip。⭐ 取 min，⛔ 不是平均。

    ⚠️ 階梯的 n 是「每人幾段」而不是「總共幾段」—— 一位只有 1 段的英雄會把
    整批的判斷力拉回 n=1，⭐ 而平均值會把他藏起來。
    """
    per: dict[str, int] = {}
    for row in inventory:
        rid = row.get("id") or ""
        if rid and (row.get("processed_path") or ""):
            per[rid] = per.get(rid, 0) + 1
    return min(per.values()) if per else 1


# ⭐ 註冊音域閘的語意來源也在同一份 JSON 的 `passRule` 裡
# （「|dF0| >= 2 semitones OR cosine <= target(n)」）。⚠️ 它今天是**散文**，
# ⛔ 不是一個欄位 —— 所以這一格仍是字面值，⭐ 但它現在**指得到出處**，
# 而上面那三個不再是。（⇒ 下一步是讓閘把它表達成欄位。）
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

    # ⭐ GH#756 AC4 —— 門檻**依實際語料**從閘的階梯挑一列（⛔ 不是寫死 n=1）。
    LADDER.update(_load_separation_ladder(_clips_per_champion(inventory)))
    print(
        f"[audition] 分離度門檻讀自 _separation-qc-gate.json 的 n={LADDER['n']} 列："
        f"confusable={LADDER['confusable']} target={LADDER['target']} "
        f"hardCeiling={LADDER['hard_ceiling']}",
        file=sys.stderr,
    )

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
        return max(p["ecapa"] / ECAPA_HIGH, p["campplus"] / LADDER["confusable"])

    for key in pairs_by_id:
        pairs_by_id[key].sort(key=rank_key, reverse=True)

    # ---- per-champion separation status ----------------------------------
    # Mirrors build_manifest._separation_statuses(): a champion inherits the
    # WORST collision risk of any pair it appears in. This matters because
    # separation_fit can rescue "needs review" but NOT "high collision risk" --
    # the pack refuses those outright, so no listening verdict can approve them.
    # Mirrors build_manifest._separation_statuses() EXACTLY, including its
    # treatment of "not_rated_nonhuman_descriptor": that value is absent from
    # RISK_ORDER, so .get(risk, 0) scores it 0 and the setdefault leaves the
    # character on "acceptable". Non-human characters therefore pass the
    # separation gate by default. That is the pack's real behaviour, and this
    # page has to predict the real behaviour rather than a tidier one -- but the
    # page labels those characters so the pass is never mistaken for a measured
    # speaker-embedding result.
    risk_order = {"acceptable": 0, "needs review": 1, "high collision risk": 2}
    sep_status: dict[str, str] = {}
    for row in separation:
        risk = row.get("collision_risk", "acceptable")
        for key in ("id_a", "id_b"):
            hid = row.get(key, "")
            if not hid:
                continue
            cur = sep_status.get(hid, "acceptable")
            if risk_order.get(risk, 0) > risk_order.get(cur, 0):
                sep_status[hid] = risk
            else:
                sep_status.setdefault(hid, cur)

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

        # What build_manifest.py will still refuse even on a perfect verdict.
        # Stating this up front stops the page promising an approval it cannot
        # deliver -- the reviewer's ear cannot override any of these.
        status = sep_status.get(hid, "not_analyzed" if hid in audio else "")
        duration = fnum(row.get("duration"))
        blockers: list[str] = []
        if hid in audio:
            if row.get("quality_status") != "usable":
                blockers.append(f"品質為 {row.get('quality_status') or 'unknown'}，非 usable")
            if not (5.0 <= duration <= 15.0):
                blockers.append(f"長度 {duration:.2f}s 不在 5–15 秒")
            if status == "high collision risk":
                blockers.append("分離度為 high collision risk，管線一律不核准")
            elif status == "not_analyzed":
                blockers.append("分離度尚未分析")

        champions.append(
            {
                "id": hid,
                "character": row["character"],
                "status": row.get("delivery_status", ""),
                "quality": row.get("quality_status", ""),
                "role_identity": proc.get("role_identity_status", ""),
                "separation_status": status,
                "blockers": blockers,
                "duration": duration,
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
            "campplus_confusable": LADDER["confusable"],
            "campplus_hard_ceiling": LADDER["hard_ceiling"],
            "campplus_pair_budget": LADDER["pair_budget"],
            "separation_ladder_n": LADDER["n"],
            "campplus_target": LADDER["target"],
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
    # 96k mono off a 24 kHz source is well clear of transparency for judging
    # voice identity, and keeps the single-file page a third smaller than 128k.
    ap.add_argument("--bitrate", default="96k", help="MP3 bitrate for embedded audio")
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
