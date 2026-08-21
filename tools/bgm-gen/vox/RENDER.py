#!/usr/bin/env python3
"""Render the arena RAP lines with CosyVoice 3, once, to committed wavs (GH#531).

    python3 tools/bgm-gen/vox/RENDER.py            # what would run (no model)
    python3 tools/bgm-gen/vox/RENDER.py --go       # actually synthesise

⭐ WHY PRE-RENDERED AND NOT CALLED AT RENDER TIME. bgm-gen's one hard property is
「same score + same seed + same soundfont ⇒ byte-identical mp3」. A live model call
— MPS scheduling, checkpoint variant, sampling — destroys it outright. So the
lines are synthesised HERE, the wavs are committed, and `ggd/aot.vox_line` just
reads them. (The older `Score.say_line` is gated off by default for exactly this
reason.)

⚠️ Needs the CosyVoice venv, which lives OUTSIDE the repo:

    /Users/Takuro/ggd-voice-cosyvoice3/.venv/bin/python
    GGD_COSYVOICE_HOME=/Users/Takuro/ggd-voice-cosyvoice3/CosyVoice

⚠️ Japanese MUST be space-separated katakana (`kana`) — CosyVoice 3 reads kanji
input as Chinese. That is a training-data limit, not a vocabulary one; see the
long note at the top of tools/voice-gen/engine_cosyvoice3.py.

⛔ 効果音ラボ clips must never be used as a `ref`: their terms forbid AI use.
Refs come from voice-reference-pipeline/approved/processed only.
"""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
REFS = os.path.join(REPO, "voice-reference-pipeline", "approved", "processed")
VENV = os.environ.get("GGD_COSYVOICE_PY",
                      "/Users/Takuro/ggd-voice-cosyvoice3/.venv/bin/python")
HOME = os.environ.get("GGD_COSYVOICE_HOME",
                      "/Users/Takuro/ggd-voice-cosyvoice3/CosyVoice")
SYNTH = os.path.join(REPO, "tools", "voice-gen", "synth.py")


def plan() -> list[dict]:
    man = json.load(open(os.path.join(HERE, "lines.json"), encoding="utf-8"))
    jobs, seen = [], set()
    for arena, a in man["arenas"].items():
        for ln in a["lines"]:
            if ln["wav"] in seen:            # the two placements share one wav
                continue
            seen.add(ln["wav"])
            jobs.append({"arena": arena, "ref": a["ref"], "text": ln["text"],
                         "kana": ln["kana"], "wav": ln["wav"],
                         "confidence": ln["confidence"], "source": ln["source"]})
    return jobs


def main(argv: list[str]) -> int:
    jobs = plan()
    go = "--go" in argv
    missing_ref = [j for j in jobs if not os.path.exists(os.path.join(REFS, j["ref"]))]
    print(f"{len(jobs)} 句 · ref 目錄 {REFS}")
    for j in jobs:
        mark = "⛔ ref 不存在" if j in missing_ref else "  "
        done = "✓" if os.path.exists(os.path.join(HERE, j["wav"])) else " "
        print(f" {done}{mark} {j['arena']:22} {j['text']:12} [{j['confidence']}] <- {j['ref']}")
    if missing_ref:
        print(f"⛔ {len(missing_ref)} 句的參考音訊不存在 —— ⛔ 不要改成別人的聲音蒙混過去,"
              f"先確認 voice-reference-pipeline 是否跑過", file=sys.stderr)
        return 1
    if not go:
        print("\n(dry run) 加 --go 真的合成。⚠️ 需要 CosyVoice venv:\n  " + VENV)
        return 0
    if not os.path.exists(VENV):
        print(f"⛔ 找不到 CosyVoice venv: {VENV}\n"
              f"   ⛔ 不要退回 macOS `say` —— 那是 22.05 kHz 單聲道,而且 owner 要的是 CosyVoice。",
              file=sys.stderr)
        return 2

    env = dict(os.environ, GGD_COSYVOICE_HOME=HOME)
    failed = 0
    for j in jobs:
        out = os.path.join(HERE, j["wav"])
        if os.path.exists(out):
            print(f"  skip {j['wav']} (已存在;刪掉它才會重算)")
            continue
        cmd = [VENV, SYNTH, "--ref", os.path.join(REFS, j["ref"]), "--lang", "ja",
               "--kana", j["kana"], "--text", j["text"], "--out", out]
        print(f"  … {j['arena']:22} {j['text']}")
        raw = out + ".raw.wav"
        r = subprocess.run([*cmd[:-1], raw], env=env, capture_output=True, text=True)
        if r.returncode != 0 or not os.path.exists(raw):
            failed += 1
            print(f"  ⛔ {j['wav']}: {r.stderr[-600:]}", file=sys.stderr)
            continue
        # ⚠️ CosyVoice 3 writes 24 kHz 32-bit FLOAT wav (format tag 3). bgm-gen's
        # `audio.read_wav` is Python's `wave` module, which handles PCM only — so
        # the raw output crashes the renderer with "unknown format: 3" three
        # frames inside a layer closure. Normalise here, once, to the pack's own
        # format: mono 16-bit PCM at 44.1 kHz, the same as every other input.
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-nostdin", "-i", raw,
                        "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", out],
                       check=True)
        os.remove(raw)
    if failed:
        print(f"⛔ {failed} 句沒產出 —— aot.vox_line 會靜默略過它們,"
              f"所以 render.py 的 vox_status() 會把缺的印出來。", file=sys.stderr)
        return 1
    print(f"✓ {len(jobs)} 句就緒 -> {HERE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
