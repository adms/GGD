#!/usr/bin/env python3
"""Per-track gates for the rendered pack — run this before shipping a track.

    python3 tools/bgm-gen/probe/track_check.py            # every score present
    python3 tools/bgm-gen/probe/track_check.py menu combat

Gates
  LOOP JOIN   for loop=true tracks, the file must flow into itself. Two copies
              are concatenated and the largest sample-to-sample step in a 20 ms
              window around the join is compared with the 99.9th percentile
              step of the whole track. A click shows up as a ratio well over 1.
  LENGTH      loop=true tracks must be a whole number of bars AT THEIR OWN
              TEMPO — `dur * bpm / 240` has to round to an integer. That is the
              whole gate; it says nothing about sample count, which is why a
              track on the 2x loop grid (3 763 200 samples: 32 bars @90 = 48
              @135 = 24 @67.5) passes it unchanged. The pack's loop GRID unit
              is 1 881 600 samples and every looping track is that or an
              integer multiple of it, but that is a convention documented in
              ggd/music.py — nothing here or anywhere else enforces it.
  LOUDNESS    integrated loudness within 1 LU of -16 LUFS, true peak <= -1.0.
  HEADROOM    no inter-sample clipping in the decoded file.
  CHOIR       the choir must actually be audible: at least one 2 s window where
              the choir stem carries >= 12 % of the 300-3500 Hz energy of the
              full mix. This is the gate that stops the choir quietly becoming
              a pad nobody can hear.
"""

import importlib.util
import json
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from ggd import analyze, dsp, score as score_mod  # noqa: E402
from ggd.audio import SR, decode_to_wav, measure_loudness, read_wav  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
BGM = os.path.join(ROOT, "content", "assets", "audio", "bgm")
SCORES = os.path.join(HERE, "..", "scores")
TMP = os.path.join(os.environ.get("TMPDIR", "/tmp"), "ggd-bgm-check")


def load(track):
    spec = importlib.util.spec_from_file_location(f"s_{track}",
                                                  os.path.join(SCORES, f"{track}.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m.build()


def join_ratio(x: np.ndarray) -> float:
    """How much bigger the step at the loop join is than the track's own steps."""
    m = analyze.mono(x)
    two = np.concatenate([m, m])
    d = np.abs(np.diff(two))
    j = len(m)
    w = int(0.010 * SR)
    local = float(np.max(d[j - w: j + w]))
    typical = float(np.percentile(np.abs(np.diff(m)), 99.9)) or 1e-9
    return local / typical


def choir_share(track, sc) -> tuple[float, float]:
    """Choir energy as a share of the 300-3500 Hz band -> (best 2 s, whole track).

    Two numbers because they answer two different questions. The BEST 2 s
    WINDOW answers "is the choir ever actually in front?" — a track can be
    choir-led for eight bars and still average low. The WHOLE-TRACK share
    answers "is there anything else in the record?" — the best window naturally
    hits ~100 % during any breakdown where the choir plays alone, so using it
    as a ceiling would fail every well-arranged track.

    Both are measured against the SUM OF THE STEMS, not the finished master:
    the master has been through bus compression and limiting, so comparing an
    unprocessed stem to it is not a share of anything and can exceed 100 %.
    """
    _, stems = score_mod.render(sc, stems=True)
    if "choir" not in stems:
        return 0.0, 0.0
    band = lambda z: dsp.highpass(dsp.lowpass(analyze.mono(z), 3500, 4), 300, 4)
    c, m = band(stems["choir"]), band(sum(stems.values()))
    w = int(2.0 * SR)
    best = 0.0
    for i in range(0, len(m) - w, w // 2):
        den = float(np.sum(m[i:i + w] ** 2)) or 1e-12
        best = max(best, float(np.sum(c[i:i + w] ** 2)) / den)
    overall = float(np.sum(c ** 2)) / (float(np.sum(m ** 2)) or 1e-12)
    return best, overall


def check(track: str, deep: bool = True) -> bool:
    mp3 = os.path.join(BGM, f"{track}.mp3")
    if not os.path.exists(mp3):
        print(f"{track:14} MISSING {mp3}")
        return False
    os.makedirs(TMP, exist_ok=True)
    wav = os.path.join(TMP, f"{track}.wav")
    decode_to_wav(mp3, wav, mono=False)
    x, _ = read_wav(wav)
    sc = load(track)
    dur = x.shape[1] / SR
    ok = True
    notes = []

    ln = measure_loudness(mp3)
    lufs, tp = float(ln["input_i"]), float(ln["input_tp"])
    if abs(lufs + 16.0) > 1.0:
        ok = False; notes.append(f"LOUDNESS {lufs:+.1f} LUFS")
    if tp > -1.0:
        ok = False; notes.append(f"TRUE PEAK {tp:+.2f} dB")
    if float(np.max(np.abs(x))) >= 0.999:
        ok = False; notes.append("CLIPPED")

    bars = dur * sc.bpm / 240.0
    if sc.loop:
        if abs(bars - round(bars)) > 0.02:
            ok = False; notes.append(f"NOT WHOLE BARS ({bars:.3f})")
        jr = join_ratio(x)
        if jr > 3.0:
            ok = False; notes.append(f"LOOP CLICK (step x{jr:.1f})")
    else:
        jr = float("nan")
        if float(np.sqrt(np.mean(analyze.mono(x)[-int(0.15 * SR):] ** 2))) > 0.01:
            ok = False; notes.append("STING DOES NOT END IN SILENCE")

    peak_share, avg_share = choir_share(track, sc) if deep else (float("nan"),) * 2
    if deep and peak_share < 0.12:
        ok = False; notes.append(f"CHOIR INAUDIBLE (best window {peak_share*100:.1f} %)")
    if deep and avg_share > 0.85:
        ok = False; notes.append(f"CHOIR SWAMPS THE TRACK (overall {avg_share*100:.1f} %)")

    print(f"{track:14} {dur:7.3f}s {bars:6.1f} bars @{sc.bpm:g}  "
          f"{lufs:+6.1f} LUFS  TP {tp:+5.2f}  join x{jr:4.1f}  "
          f"choir {peak_share*100:5.1f}%/{avg_share*100:5.1f}%  "
          f"{'OK' if ok else 'FAIL: ' + '; '.join(notes)}")
    return ok


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    fast = "--fast" in sys.argv
    tracks = args or sorted(f[:-3] for f in os.listdir(SCORES) if f.endswith(".py"))
    results = [check(t, deep=not fast) for t in tracks]
    print(f"\n{sum(results)}/{len(results)} tracks pass")
    raise SystemExit(0 if all(results) else 1)
