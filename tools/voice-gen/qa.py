#!/usr/bin/env python3
"""voice-gen QA — measure a rendered corpus, then pin the failures to the fallback.

This is the second half of the owner's directive. CosyVoice 3 renders
everything; this decides, with numbers, which clips were "not good enough" and
writes the pin file that sends exactly those lines to IndexTTS-2:

    C=/Users/Takuro/ggd-voice-cosyvoice3/.venv/bin/python
    I=/Users/Takuro/ggd-voice/index-tts/.venv/bin/python

    $C tools/voice-gen/qa.py --manifest lines.jsonl --report qa.json --pins-out pins.jsonl
    $I tools/voice-gen/synth.py --manifest lines.jsonl --pins pins.jsonl --engine-only indextts

The two measurement stages need two different, incompatible venvs (speaker
scoring wants onnxruntime + torchaudio; the transcriber wants mlx_whisper). Run
this under either one and it RE-EXECS ITSELF for the stage it cannot do, via
$GGD_COSYVOICE_PYTHON / $GGD_ASR_PYTHON. The final gate stage is pure stdlib.

THE FOUR VERDICTS
-----------------
  PASS      shippable on the numbers we have.
  RETRY     same engine, best-of-N. The cheap lever, and a measured one:
            best-of-4 moved hurt 0.439 -> 0.612 and name 0.752 -> 0.823.
  FALLBACK  re-render on the other engine and KEEP WHICHEVER SCORES BETTER.
            Both scores are recorded; see `--adjudicate` below.
  REVIEW    the tool cannot judge this one. A human listens.

WHAT DECIDES, AND WHAT MERELY INFORMS
-------------------------------------
Deciding (each is a measurement with a threshold justified in `score.py`):
  * speaker similarity < --min-speaker-sim
  * clipped samples >= 2% of the clip — audible distortion, no interpretation
  * mora rate > 10.0/s — the audio is too short to physically contain the
    requested morae, so content was dropped
  * silent / undecodable / shorter than 0.25s
Informing: the ASR transcript, its CER, kana coverage and speaking rate are
           recorded on every clip and shown, but never fail a clip on their own.
           `score.py`'s docstring records the four separate attempts to make CER
           a gate on this install and why each one lies. Clips in the grey band
           (--review-speaker-sim) or with signals the tool cannot interpret land
           in a REVIEW list — surfaced, not silently accepted.

THE FULL LOOP
-------------
    $C qa.py --manifest m.jsonl --report qa.json --pins-out pins.jsonl \
             --retries-out retry.jsonl --html qa.html
    $C synth.py --manifest m.jsonl --pins retry.jsonl --only-pinned   # RETRY
    $I synth.py --manifest m.jsonl --pins pins.jsonl  --only-pinned   # FALLBACK
    $C qa.py --manifest m.jsonl --adjudicate --pins pins.jsonl        # keep the winner

Nothing here plays audio (#62); it reads files and writes JSON and HTML.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import engine as core      # noqa: E402
import report_html         # noqa: E402
import routing             # noqa: E402
import score               # noqa: E402
import synth               # noqa: E402

COSY_PY = os.environ.get("GGD_COSYVOICE_PYTHON",
                         "/Users/Takuro/ggd-voice-cosyvoice3/.venv/bin/python")
ASR_PY = os.environ.get("GGD_ASR_PYTHON", "/Users/Takuro/ggd-voice/asr-venv/bin/python")

#: Shipped in every report, JSON and HTML. A gate that does not say what it is
#: blind to reads as a quality guarantee, and this one is not.
LIMITATIONS = [
    "A PASS means: it sounds like the right speaker, it is not clipped, not "
    "silent, and long enough to contain the line. It does NOT mean the clip is "
    "good.",
    "PROSODY IS NOT MEASURED. Nothing here can tell whether a battlecry sounds "
    "like a shout, whether a defeat line sounds defeated, or whether a joke "
    "lands. A flat, bored reading of the right words by the right voice scores "
    "exactly as well as a great one.",
    "COMEDIC TIMING IS NOT MEASURED, and #57 makes the VO deliberately 惡搞 "
    "jank. A clip can pass every threshold here and still be wrong for the "
    "game — and, just as often, a clip the numbers dislike may be exactly the "
    "kind of broken that is funny. The gate finds DEFECTS; it does not have "
    "taste. Overrule it freely.",
    "PROPER NOUNS ARE THE KNOWN HOLE. A mangled champion name is a small edit "
    "distance and a fatal error: on the proof set 「リュウグウ レナ」 came back "
    "as 「リューグレナ」 and still scored 0.719 speaker similarity — a PASS. The "
    "name-bearing categories (角色名言, 喊出技能名稱) must be auditioned by a "
    "human regardless of what this report says.",
    "Speaker similarity is measured against ONE reference clip per champion. It "
    "rewards sounding like that recording, which for a shout or a pain grunt is "
    "partly the wrong target — the weak scores on 受傷 / 衝鋒 style lines are "
    "real, but some of that gap is the metric, not the audio.",
]


def _have(*mods: str) -> bool:
    import importlib.util
    for m in mods:
        try:
            if importlib.util.find_spec(m) is None:
                return False
        except (ImportError, ValueError):
            return False
    return True


def _reexec(python: str, stage: str, payload: str, out: str) -> None:
    """Run one measurement stage under the interpreter that can do it."""
    if not os.path.exists(python):
        sys.exit(f"voice-gen qa: stage {stage!r} needs {python}, which does not exist\n"
                 f"  set $GGD_COSYVOICE_PYTHON / $GGD_ASR_PYTHON")
    cmd = [python, os.path.join(HERE, "qa.py"), "--_stage", stage,
           "--_payload", payload, "--_stage-out", out]
    r = subprocess.run(cmd)
    if r.returncode != 0:
        sys.exit(f"voice-gen qa: stage {stage!r} failed (exit {r.returncode})")


# --------------------------------------------------------------- stages ------

def stage_speaker(payload_path: str, out_path: str) -> None:
    """clip -> cosine similarity against its own reference clip."""
    rows = json.load(open(payload_path, encoding="utf-8"))
    res = {}
    for r in rows:
        try:
            ref16 = core.normalised_ref(r["ref"])
            res[r["id"]] = score.speaker_similarity(ref16, r["out"])
        except Exception as e:
            res[r["id"]] = {"error": f"{type(e).__name__}: {e}"}
    json.dump(res, open(out_path, "w", encoding="utf-8"), ensure_ascii=False)


def stage_asr(payload_path: str, out_path: str) -> None:
    """clip -> transcript. Offline, read-only borrow of the ASR venv."""
    rows = json.load(open(payload_path, encoding="utf-8"))
    res = {}
    for r in rows:
        try:
            res[r["id"]] = score.transcribe(r["out"], language=r.get("asrLang", "ja"))
        except Exception as e:
            res[r["id"]] = {"error": f"{type(e).__name__}: {e}"}
    json.dump(res, open(out_path, "w", encoding="utf-8"), ensure_ascii=False)


# ----------------------------------------------------------- bookkeeping -----

def champion_of(entry: dict) -> str:
    """`godie-e001.hurt` -> `godie-e001`. The owner reviews by CHARACTER, not by
    line id: a champion whose whole set fell back is a different problem from a
    champion with one bad grunt."""
    champ = (entry.get("champion") or "").strip()
    if champ:
        return champ
    eid = str(entry.get("id") or "")
    return eid.rsplit(".", 1)[0] if "." in eid else eid


def contest_dir() -> str:
    return os.path.join(core.CACHE_DIR, "contest")


def contest_record_path(out_path: str) -> str:
    """Keyed by the OUTPUT path, so it survives manifest edits and weird ids."""
    import hashlib
    h = hashlib.sha1(os.path.abspath(out_path).encode("utf-8")).hexdigest()[:24]
    return os.path.join(contest_dir(), f"{h}.json")


def archive_incumbent(row: dict) -> dict | None:
    """Copy the current clip aside BEFORE the other engine overwrites it.

    Without this there is no head-to-head: `synth.py` writes to the same output
    path, so the CosyVoice take would be gone by the time we wanted to compare.
    """
    import shutil
    out = row["out"]
    os.makedirs(contest_dir(), exist_ok=True)
    ext = os.path.splitext(out)[1] or ".wav"
    stash = contest_record_path(out)[:-5] + ".incumbent" + ext
    try:
        shutil.copy2(out, stash)
        marker = core.marker_path(out)
        if os.path.exists(marker):
            shutil.copy2(marker, stash + ".method")
    except Exception as e:
        print(f"voice-gen qa: could not archive {row['id']}: {e}", file=sys.stderr)
        return None
    rec = {
        "id": row["id"], "out": out, "ref": row.get("ref"),
        "archivedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "incumbent": {
            "engine": row.get("engine"), "variant": row.get("variant"),
            "path": stash, "spkSim": row.get("spkSim"),
            "asrCer": row.get("asrCer"), "transcript": row.get("transcript"),
            "clippedFraction": row.get("clippedFraction"),
            "durationSec": row.get("durationSec"),
            "verdictReasons": row.get("reasons"),
        },
        "resolved": False,
    }
    with open(contest_record_path(out), "w", encoding="utf-8") as fh:
        json.dump(rec, fh, ensure_ascii=False, indent=2)
    return rec


# ------------------------------------------------------------------ gate -----

def verdict_for(row: dict, args) -> tuple[str, list[str], list[str]]:
    """pass / retry / fallback / review, the hard reasons, and the advisories.

    Two independent questions, in order:
      1. Is the clip DEFECTIVE?  (hard, measured, thresholds justified in score.py)
      2. If so, is the cheap fix still available?  -> retry, else fallback.
    """
    hard: list[str] = []
    advice: list[str] = []

    # -- 1. defects -----------------------------------------------------------
    # Sanity first: a silent or truncated clip makes every other number
    # meaningless (a silent clip's speaker similarity is noise, not a verdict).
    if row.get("sanityError"):
        advice.append(f"sanity probe failed: {row['sanityError']}")
    if row.get("silent"):
        hard.append(f"silent (peak {row.get('peakDbfs')} dBFS "
                    f"<= {score.SILENT_PEAK_DBFS})")
    dur = row.get("durationSec")
    if dur is not None and dur < score.MIN_DURATION_SEC:
        hard.append(f"duration {dur}s < {score.MIN_DURATION_SEC}s")
    frac = row.get("clippedFraction")
    if frac is not None and frac >= score.CLIP_FRACTION_FAIL:
        hard.append(f"clipped: {frac:.2%} of samples at full scale "
                    f">= {score.CLIP_FRACTION_FAIL:.0%}")
    elif frac is not None and frac >= score.CLIP_FRACTION_ADVISE:
        advice.append(f"hot: {frac:.2%} of samples at full scale (advisory)")

    # Truncation. This is the ONE thing the ASR/text path may decide, because it
    # is physical: too few seconds to hold the morae means content was dropped.
    rate = row.get("moraRate")
    if rate is not None and rate > score.MORA_RATE_TRUNCATED:
        hard.append(f"truncated: {rate} morae/s > {score.MORA_RATE_TRUNCATED} — "
                    f"too short to contain the line")
    elif rate is not None and not (score.MORA_RATE_BAND[0] <= rate
                                   <= score.MORA_RATE_BAND[1]):
        advice.append(f"speaking rate {rate}/s outside {score.MORA_RATE_BAND} (advisory)")

    sim = row.get("spkSim")
    if sim is None:
        advice.append("speaker similarity unavailable — cannot gate this clip")
    elif sim < args.min_speaker_sim:
        hard.append(f"spkSim {sim:.3f} < {args.min_speaker_sim}")
    elif sim < args.review_speaker_sim:
        advice.append(f"spkSim {sim:.3f} in grey band "
                      f"[{args.min_speaker_sim}, {args.review_speaker_sim})")

    # -- advisory content signals (never decide, always shown) ----------------
    cov = row.get("kanaCoverage")
    cer = row.get("asrCer")
    if cer is not None and cer > args.advise_cer:
        hint = ""
        if cov is not None and cov < args.min_kana_coverage:
            hint = f", transcript only {cov:.0%} kana"
        advice.append(f"ASR error {cer:.2f} > {args.advise_cer}{hint} — "
                      f"LISTEN, do not trust this number (advisory)")
    if row.get("transcript") == "":
        advice.append("empty transcript (advisory)")

    # -- 2. what to do about it ----------------------------------------------
    if not hard:
        return ("review" if advice else "pass"), hard, advice

    if sim is not None and sim < score.RETRY_FLOOR:
        hard.append(f"spkSim {sim:.3f} < retry floor {score.RETRY_FLOOR} — the best "
                    f"best-of-4 gain ever measured here (+0.173) would not reach "
                    f"{args.min_speaker_sim}")
        return "fallback", hard, advice

    if int(row.get("takesTried") or 1) < args.retry_takes:
        return "retry", hard, advice

    hard.append(f"already best-of-{row.get('takesTried')} on {row.get('engine')} — "
                f"the cheap lever is spent")
    return "fallback", hard, advice


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Measure rendered clips; write a report and the fallback pins.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__.split("WHAT DECIDES")[0])
    ap.add_argument("--manifest", required=False, help="the same manifest synth.py rendered")
    ap.add_argument("--ref-root", default=None)
    ap.add_argument("--out-root", default=None)
    ap.add_argument("--report", default=None, help="write the full JSON report here")
    ap.add_argument("--pins-out", default=None,
                    help="write a JSONL pin file for the failures (feed to synth.py --pins)")
    ap.add_argument("--fallback-engine", default="indextts", choices=core.engine_names(),
                    help="engine the failures are pinned to (default indextts)")
    ap.add_argument("--pin-reviews", action="store_true",
                    help="also pin grey-band/advisory clips, not just hard failures")
    ap.add_argument("--retries-out", default=None,
                    help="write a JSONL pin file for RETRY clips — same engine, "
                         "best-of-N. Feed to synth.py --pins … --only-pinned")
    ap.add_argument("--retry-takes", type=int, default=4,
                    help="best-of-N used for retries (default 4; measured to lift "
                         "hurt 0.439->0.612 and name 0.752->0.823). A clip already "
                         "rendered with at least this many takes skips RETRY and "
                         "goes straight to FALLBACK")
    ap.add_argument("--html", default=None,
                    help="write the per-champion audition report here")
    ap.add_argument("--adjudicate", action="store_true",
                    help="resolve pending contests: measure the fallback render "
                         "against the archived original and KEEP THE BETTER ONE")
    ap.add_argument("--pins", default=None,
                    help="with --adjudicate: the pin file to prune of losing pins")
    ap.add_argument("--min-speaker-sim", type=float, default=score.MIN_SPEAKER_SIM,
                    help=f"hard gate (default {score.MIN_SPEAKER_SIM}; on the 21-clip proof "
                         f"run every accepted clip scored >=0.719 and every rejected one "
                         f"<=0.635, so this sits in an empty band)")
    ap.add_argument("--review-speaker-sim", type=float, default=score.REVIEW_SPEAKER_SIM,
                    help="below this but above the gate -> flagged for a human listen")
    ap.add_argument("--advise-cer", type=float, default=score.ADVISE_CER,
                    help=f"advisory only — ASR error above this is flagged, never "
                         f"failed (default {score.ADVISE_CER}: the 17 good proof clips "
                         f"reach 0.706 and the worst broken one 0.800)")
    ap.add_argument("--min-kana-coverage", type=float, default=0.5,
                    help="below this the transcript is too kanji-heavy for CER to mean anything")
    ap.add_argument("--no-asr", action="store_true",
                    help="skip transcription (speaker similarity alone)")
    ap.add_argument("--shard", type=int, default=0)
    ap.add_argument("--shards", type=int, default=1)
    ap.add_argument("--verbose", action="store_true")
    # internal re-exec plumbing
    ap.add_argument("--_stage", default=None, help=argparse.SUPPRESS)
    ap.add_argument("--_payload", default=None, help=argparse.SUPPRESS)
    ap.add_argument("--_stage-out", default=None, help=argparse.SUPPRESS)
    args = ap.parse_args()

    if args._stage == "speaker":
        stage_speaker(args._payload, args._stage_out)
        return 0
    if args._stage == "asr":
        stage_asr(args._payload, args._stage_out)
        return 0
    if args.adjudicate:
        return adjudicate(args)
    if not args.manifest:
        sys.exit("voice-gen qa: --manifest is required")

    base = os.path.dirname(os.path.abspath(args.manifest))
    ref_root = os.path.abspath(args.ref_root or base)
    out_root = os.path.abspath(args.out_root or base)
    entries = synth.load_manifest(args.manifest)

    # -- collect the clips that actually exist --------------------------------
    rows, missing = [], []
    for e in entries:
        if not synth.in_shard(e["id"], args.shard, args.shards):
            continue
        out = synth.resolve(out_root, e["out"])
        ref = synth.resolve(ref_root, e["ref"])
        if not os.path.exists(out) or os.path.getsize(out) <= 0:
            missing.append(e["id"])
            continue
        m = core.read_marker(out) or {}
        rows.append({
            "id": e["id"],
            "out": out,
            "ref": ref,
            "champion": champion_of(e),
            "category": routing.category_of(e),
            "engine": m.get("engine"),
            "variant": m.get("variant"),
            "engineReason": m.get("engineReason"),
            "lang": e.get("lang") or m.get("lang") or "zh",
            "text": e.get("text"),
            "expectKana": e.get("kana") or e.get("expectKana"),
            "hasRomaji": bool(str(e.get("romaji") or "").strip()),
            "durationSec": m.get("durationSec"),
            "renderSpkSim": m.get("spkSim"),     # from best-of-N, if synth scored it
            "takesTried": m.get("takesTried") or 1,
        })
    if not rows:
        sys.exit(f"voice-gen qa: no rendered clips found under {out_root} "
                 f"({len(missing)} manifest entries have no output yet)")

    workdir = os.path.join(core.CACHE_DIR, "qa")
    os.makedirs(workdir, exist_ok=True)
    payload = os.path.join(workdir, f"payload.{args.shard}.json")
    json.dump([{"id": r["id"], "out": r["out"], "ref": r["ref"],
                "asrLang": "ja" if r["lang"] == "ja" else r["lang"]} for r in rows],
              open(payload, "w", encoding="utf-8"), ensure_ascii=False)

    # -- stage 1: speaker similarity (the gate) -------------------------------
    spk_out = os.path.join(workdir, f"speaker.{args.shard}.json")
    if _have("onnxruntime", "torchaudio", "numpy"):
        stage_speaker(payload, spk_out)
    else:
        _reexec(COSY_PY, "speaker", payload, spk_out)
    spk = json.load(open(spk_out, encoding="utf-8"))

    # -- stage 2: transcripts (advisory) --------------------------------------
    asr: dict = {}
    if not args.no_asr:
        asr_out = os.path.join(workdir, f"asr.{args.shard}.json")
        if _have("mlx_whisper"):
            stage_asr(payload, asr_out)
        else:
            _reexec(ASR_PY, "asr", payload, asr_out)
        asr = json.load(open(asr_out, encoding="utf-8"))

    # -- stage 3: sanity (ffmpeg only — no venv, so it always runs here) -------
    # Deliberately measured from the FILE rather than trusted from the render
    # receipt: the receipt describes what the engine thought it wrote.
    for r in rows:
        r.update(score.audio_sanity(r["out"]))

    # -- stage 4: gate (stdlib) -----------------------------------------------
    for r in rows:
        s = spk.get(r["id"])
        r["spkSim"] = s if isinstance(s, (int, float)) else None
        if isinstance(s, dict):
            r["spkError"] = s.get("error")
        t = asr.get(r["id"])
        r["transcript"] = t if isinstance(t, str) else None
        if isinstance(t, dict):
            r["asrError"] = t.get("error")
        if r["transcript"] is not None:
            r["kanaCoverage"] = round(score.kana_coverage(r["transcript"]), 3)
            fid = score.asr_fidelity(r["transcript"], kana=r.get("expectKana"),
                                     text=r.get("text"))
            r["asrCer"] = fid["cer"]
            r["asrCerKana"] = fid["cerKana"]
            r["asrCerText"] = fid["cerText"]
            r["asrMatched"] = fid["matched"]
        if r.get("expectKana"):
            r["moraRate"] = score.mora_rate(r["expectKana"], r.get("durationSec"))
        r["verdict"], r["reasons"], r["advisories"] = verdict_for(r, args)

    # A FALLBACK that the fallback engine physically cannot render is not a
    # fallback. IndexTTS-2 has no kana tokens, so a Japanese line with no
    # hand-written `romaji` would simply be refused — pinning it would quietly
    # leave the clip broken. Those become BLOCKED: still failing, but the fix is
    # editorial (respell `kana`), not a reroute.
    for r in rows:
        if (r["verdict"] == "fallback" and args.fallback_engine == "indextts"
                and r["lang"] == "ja" and not r["hasRomaji"]):
            r["verdict"] = "blocked"
            r["reasons"].append(
                "cannot fall back: IndexTTS-2 has no kana tokens and this line has "
                "no `romaji`. Respell the `kana` reading and re-render on CosyVoice 3 "
                "— respelling is the only pronunciation control CosyVoice 3 offers "
                "for Japanese, and editing it re-renders exactly this clip.")

    passed = [r for r in rows if r["verdict"] == "pass"]
    review = [r for r in rows if r["verdict"] == "review"]
    retry = [r for r in rows if r["verdict"] == "retry"]
    failed = [r for r in rows if r["verdict"] == "fallback"]
    blocked = [r for r in rows if r["verdict"] == "blocked"]

    def group(key: str) -> dict[str, dict]:
        g: dict[str, dict] = {}
        for r in rows:
            c = g.setdefault(r[key] or "-", {"n": 0, "sims": []})
            c["n"] += 1
            c[r["verdict"]] = c.get(r["verdict"], 0) + 1
            if r["spkSim"] is not None:
                c["sims"].append(r["spkSim"])
        for c in g.values():
            sims = c.pop("sims")
            c["meanSpkSim"] = round(sum(sims) / len(sims), 4) if sims else None
            c["minSpkSim"] = round(min(sims), 4) if sims else None
        return dict(sorted(g.items()))

    # byCategory tells you whether a whole CATEGORY should be routed rather than
    # pinned line by line; byChampion is how the owner actually reviews — one
    # character whose whole set fell back is a different problem from one bad
    # grunt spread across the roster.
    cats = group("category")
    champs = group("champion")

    order = {"blocked": 0, "fallback": 1, "retry": 2, "review": 3, "pass": 4}
    report = {
        "manifest": os.path.abspath(args.manifest),
        "shard": f"{args.shard}/{args.shards}",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "gate": {
            "minSpeakerSim": args.min_speaker_sim,
            "reviewSpeakerSim": args.review_speaker_sim,
            "retryFloor": score.RETRY_FLOOR,
            "retryTakes": args.retry_takes,
            "clipFractionFail": score.CLIP_FRACTION_FAIL,
            "moraRateTruncated": score.MORA_RATE_TRUNCATED,
            "adviseCer": args.advise_cer,
            "encoder": score.campplus_path(),
            "decides": ["speaker similarity", "clipping >= 2% of samples",
                        "mora rate > 10/s (truncation)", "silent / too short"],
            "informsOnly": ["ASR transcript + error rate", "kana coverage",
                            "speaking rate inside the band"],
            "note": "ASR error rate is ADVISORY and cannot be promoted to a gate "
                    "on this install — see score.py for the four attempts and the "
                    "measurements that killed each one.",
        },
        "limitations": LIMITATIONS,
        "totals": {"measured": len(rows), "pass": len(passed),
                   "review": len(review), "retry": len(retry),
                   "fallback": len(failed), "blocked": len(blocked),
                   "notRendered": len(missing)},
        "byCategory": cats,
        "byChampion": champs,
        # Shallow COPIES: `ref` is dropped from the report (it is an absolute
        # path to a file the reader does not need) but must survive on the live
        # rows, because archive_incumbent() below still needs it to score the
        # head-to-head. Popping it in place silently broke --adjudicate.
        "clips": [{k: v for k, v in r.items() if k != "ref"}
                  for r in sorted(rows, key=lambda r: (
                      order.get(r["verdict"], 9),
                      r["spkSim"] if r["spkSim"] is not None else 9))],
    }

    if args.report:
        os.makedirs(os.path.dirname(os.path.abspath(args.report)) or ".", exist_ok=True)
        with open(args.report, "w", encoding="utf-8") as fh:
            json.dump(report, fh, ensure_ascii=False, indent=2)
            fh.write("\n")

    # -- retry pins: same engine, more takes -----------------------------------
    # `takes` is part of the idempotency key, so bumping it makes exactly these
    # clips pending again without --force touching anything else.
    if args.retries_out and retry:
        os.makedirs(os.path.dirname(os.path.abspath(args.retries_out)) or ".",
                    exist_ok=True)
        with open(args.retries_out, "w", encoding="utf-8") as fh:
            fh.write("// voice-gen RETRY pins — written by qa.py.\n")
            fh.write(f"// Same engine, best-of-{args.retry_takes}, keeping the take "
                     f"closest to the reference speaker.\n")
            fh.write("//   synth.py --manifest … --pins THIS --only-pinned\n")
            for r in retry:
                fh.write(json.dumps({
                    "id": r["id"], "engine": r.get("engine") or "cosyvoice3",
                    "variant": r.get("variant"), "takes": args.retry_takes,
                    "reason": f"retry: {'; '.join(r['reasons'])}",
                    "spkSim": r.get("spkSim"),
                }, ensure_ascii=False) + "\n")

    # -- fallback pins: the other engine, with the head-to-head set up ---------
    pinned = failed + (review if args.pin_reviews else [])
    if args.pins_out:
        os.makedirs(os.path.dirname(os.path.abspath(args.pins_out)) or ".", exist_ok=True)
        archived = 0
        with open(args.pins_out, "w", encoding="utf-8") as fh:
            fh.write("// voice-gen FALLBACK pins — written by qa.py. "
                     "Feed to: synth.py --pins THIS --only-pinned\n")
            fh.write(f"// gate: spkSim < {args.min_speaker_sim} against "
                     f"{os.path.basename(score.campplus_path())}, "
                     f"clipping >= {score.CLIP_FRACTION_FAIL:.0%}, "
                     f"mora rate > {score.MORA_RATE_TRUNCATED}/s\n")
            fh.write("// The current clip has been ARCHIVED. After re-rendering, run\n")
            fh.write("//   qa.py --manifest … --adjudicate --pins THIS\n")
            fh.write("// to keep whichever engine actually scored better.\n")
            fh.write("// Hand-editable: delete a line to leave that clip where it is.\n")
            for r in pinned:
                if archive_incumbent(r):
                    archived += 1
                fh.write(json.dumps({
                    "id": r["id"], "engine": args.fallback_engine,
                    "reason": "; ".join(r["reasons"]) or "qa",
                    "wasEngine": r.get("engine"), "spkSim": r.get("spkSim"),
                }, ensure_ascii=False) + "\n")
        if archived:
            print(f"voice-gen qa: archived {archived} incumbent clip(s) for the "
                  f"head-to-head -> {contest_dir()}")

    # -- console ---------------------------------------------------------------
    print(f"voice-gen qa: {len(rows)} measured — {len(passed)} pass, "
          f"{len(review)} review, {len(retry)} retry, {len(failed)} fallback, "
          f"{len(blocked)} blocked"
          + (f", {len(missing)} not rendered" if missing else ""))
    print(f"  gate: spkSim >= {args.min_speaker_sim} "
          f"(grey band to {args.review_speaker_sim})")
    for cat, c in sorted(cats.items(), key=lambda kv: (kv[1]["meanSpkSim"] or 0)):
        print(f"  {cat:<16s} n={c['n']:<4d} meanSpkSim="
              f"{c['meanSpkSim'] if c['meanSpkSim'] is not None else '-':<8} "
              f"min={c['minSpkSim'] if c['minSpkSim'] is not None else '-':<8} "
              f"retry={c.get('retry', 0)} fallback={c.get('fallback', 0)} "
              f"blocked={c.get('blocked', 0)} review={c.get('review', 0)}")
    worst = sorted(champs.items(),
                   key=lambda kv: (-(kv[1].get("fallback", 0) + kv[1].get("blocked", 0)
                                     + kv[1].get("retry", 0)), kv[0]))[:8]
    flagged = [(c, v) for c, v in worst
               if v.get("fallback") or v.get("blocked") or v.get("retry")]
    if flagged:
        print("  worst champions:")
        for champ, c in flagged:
            print(f"    {champ:<20s} n={c['n']:<4d} "
                  f"fallback={c.get('fallback', 0)} retry={c.get('retry', 0)} "
                  f"blocked={c.get('blocked', 0)} meanSpkSim={c['meanSpkSim']}")
    for r in (failed + blocked)[:20]:
        print(f"  {r['verdict'].upper():<9s} {r['id']} [{r.get('engine')}/"
              f"{r.get('variant')}] {'; '.join(r['reasons'])}")
    if len(failed) + len(blocked) > 20:
        print(f"  … and {len(failed) + len(blocked) - 20} more (see --report)")

    if args.retries_out and retry:
        print(f"voice-gen qa: {len(retry)} clip(s) -> RETRY (best-of-{args.retry_takes}, "
              f"same engine) -> {args.retries_out}")
        print(f"  next: synth.py --manifest {os.path.relpath(args.manifest)} "
              f"--pins {os.path.relpath(args.retries_out)} --only-pinned")
    elif retry and not args.retries_out:
        print(f"voice-gen qa: {len(retry)} clip(s) would RETRY — pass --retries-out "
              f"to write them out")

    if args.pins_out:
        print(f"voice-gen qa: {len(pinned)} clip(s) pinned to "
              f"{args.fallback_engine} -> {args.pins_out}")
        if pinned:
            hint = core.get_engine_class(args.fallback_engine).VENV_HINT
            print(f"  next: {hint} tools/voice-gen/synth.py --manifest "
                  f"{os.path.relpath(args.manifest)} --pins {os.path.relpath(args.pins_out)} "
                  f"--only-pinned")
            print(f"  then: qa.py --manifest {os.path.relpath(args.manifest)} "
                  f"--adjudicate --pins {os.path.relpath(args.pins_out)}")
    if blocked:
        # The fallback is not a free lunch for Japanese. IndexTTS-2 has no kana
        # tokens at all, so a ja line without a hand-written `romaji` reading
        # cannot be rescued by rerouting. Say so HERE, while the operator is
        # looking, rather than letting synth.py report it as "broken" later.
        print(f"\nvoice-gen qa: {len(blocked)} clip(s) FAILED BUT CANNOT FALL BACK — "
              f"Japanese lines with no `romaji`.\n"
              f"  IndexTTS-2 has zero kana tokens, so rerouting them does nothing.\n"
              f"  Fix each one editorially: respell its `kana` reading and re-render "
              f"on CosyVoice 3.\n"
              f"  Affected: " + ", ".join(r["id"] for r in blocked[:8])
              + (f" … +{len(blocked) - 8} more" if len(blocked) > 8 else ""),
              file=sys.stderr)
    if review:
        print(f"voice-gen qa: {len(review)} clip(s) need a human listen "
              f"(the tool cannot judge them) — see --report")
    if args.html:
        report_html.write(report, args.html)
        print(f"voice-gen qa: audition report -> {args.html}")
    return 0


# ------------------------------------------------------------ adjudicate -----

def adjudicate(args) -> int:
    """Resolve every pending contest: measure the challenger, keep the winner.

    This is the half of "fall back to IndexTTS" that makes it honest. Falling
    back is a BET that the other engine does better, and on the proof numbers
    that bet is not free — IndexTTS-2 is unproven on this material and cannot
    speak Japanese at all without a romaji reading. So the fallback render does
    not simply replace the original: both are scored with the same encoder and
    the better one is installed, with both numbers written down.
    """
    records = []
    if os.path.isdir(contest_dir()):
        for name in sorted(os.listdir(contest_dir())):
            if not name.endswith(".json"):
                continue
            try:
                rec = json.load(open(os.path.join(contest_dir(), name), encoding="utf-8"))
            except Exception:
                continue
            if not rec.get("resolved"):
                records.append((os.path.join(contest_dir(), name), rec))
    if not records:
        print("voice-gen qa: no pending contests — nothing to adjudicate")
        return 0

    import shutil
    kept_incumbent = kept_challenger = not_rendered = 0
    resolved_ids: set[str] = set()
    for path, rec in records:
        out = rec["out"]
        inc = rec["incumbent"]
        if not os.path.exists(out):
            print(f"  {rec['id']}: output is gone, skipping", file=sys.stderr)
            continue
        marker = core.read_marker(out) or {}
        chal_engine = marker.get("engine")
        # If the marker still names the incumbent engine, the fallback render
        # never happened. Leave the contest pending rather than declaring a
        # winner by default.
        if chal_engine == inc.get("engine") and inc.get("engine") is not None:
            not_rendered += 1
            continue

        ref = rec.get("ref") or marker.get("ref")
        if not ref or not os.path.isfile(ref):
            print(f"  {rec['id']}: reference clip missing ({ref!r}) — cannot score "
                  f"the head-to-head, leaving the contest pending", file=sys.stderr)
            continue
        ref16 = core.normalised_ref(ref)
        try:
            chal_sim = score.speaker_similarity(ref16, out)
        except Exception as e:
            print(f"  {rec['id']}: could not score challenger ({e})", file=sys.stderr)
            continue
        chal_sanity = score.audio_sanity(out)
        challenger = {"engine": chal_engine, "variant": marker.get("variant"),
                      "spkSim": chal_sim,
                      "clippedFraction": chal_sanity.get("clippedFraction"),
                      "durationSec": chal_sanity.get("durationSec")}

        inc_sim = inc.get("spkSim")
        # Compare on the gate metric. A challenger that is itself defective
        # (silent/clipped) never wins, however well it scores on similarity.
        chal_ok = not chal_sanity.get("silent") and not chal_sanity.get("clipped")
        winner = "challenger" if (chal_ok and inc_sim is not None
                                  and chal_sim > inc_sim) else "incumbent"
        if not chal_ok:
            winner = "incumbent"

        if winner == "incumbent":
            shutil.copy2(inc["path"], out)
            if os.path.exists(inc["path"] + ".method"):
                shutil.copy2(inc["path"] + ".method", core.marker_path(out))
            kept_incumbent += 1
        else:
            kept_challenger += 1
            resolved_ids.add(rec["id"])

        rec.update({"resolved": True, "winner": winner, "challenger": challenger,
                    "resolvedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(rec, fh, ensure_ascii=False, indent=2)
        # The head-to-head lives next to the clip too, so the number that chose
        # this engine is discoverable from the asset, not only from the cache.
        with open(out + ".contest.json", "w", encoding="utf-8") as fh:
            json.dump({"id": rec["id"], "winner": winner,
                       "incumbent": {k: inc.get(k) for k in
                                     ("engine", "variant", "spkSim", "asrCer",
                                      "transcript", "verdictReasons")},
                       "challenger": challenger}, fh, ensure_ascii=False, indent=2)
        print(f"  {rec['id']}: {inc.get('engine')} {inc_sim} vs "
              f"{chal_engine} {chal_sim} -> kept {winner.upper()}")

    print(f"voice-gen qa: adjudicated {kept_incumbent + kept_challenger} contest(s) — "
          f"{kept_challenger} fallback win(s), {kept_incumbent} original(s) kept back"
          + (f", {not_rendered} still awaiting the fallback render" if not_rendered else ""))

    # Keep the pin file agreeing with reality: a pin whose challenger LOST would
    # otherwise re-render the loser on every future run and never settle.
    if args.pins and kept_incumbent:
        keep, dropped = [], 0
        with open(args.pins, encoding="utf-8") as fh:
            for line in fh:
                s = line.strip()
                if not s or s.startswith(("//", "#")):
                    keep.append(line.rstrip("\n"))
                    continue
                row = json.loads(s)
                if row.get("id") in resolved_ids or row.get("id") not in {
                        r[1]["id"] for r in records}:
                    keep.append(line.rstrip("\n"))
                else:
                    dropped += 1
        if dropped:
            with open(args.pins, "w", encoding="utf-8") as fh:
                fh.write("\n".join(keep) + "\n")
                fh.write(f"// {dropped} pin(s) removed by --adjudicate: the fallback "
                         f"engine scored WORSE, so those clips stay on their "
                         f"original engine.\n")
            print(f"voice-gen qa: dropped {dropped} losing pin(s) from "
                  f"{args.pins} so the corpus settles")
    return 0


if __name__ == "__main__":
    sys.exit(main())
