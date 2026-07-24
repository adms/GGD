#!/usr/bin/env python3
"""GATE for task #110 - the 3-choose-1 card LOCK-IN cue (draftConfirm) must be a
WEIGHTY, MECHANICAL 厲害的科技音效 — NOT bright, NOT bubbly — and must be
unmistakable next to the two cues it shares the champ-select / intermission flow
with (the cyber hover, and the countdown bells).

    python3 GATE-draft-confirm.py <candidate.wav|mp3> [...]   # judge candidates
    python3 GATE-draft-confirm.py --selftest                  # prove the gate
                                                              # still rejects the
                                                              # known failure
                                                              # archetypes

WHY THIS FILE EXISTS. "厲害的科技音效" and "weighty, not bubbly" are subjective.
The thresholds below are the falsifiable version of that brief, calibrated
against the shipped clip and against the exact cues it must never be mistaken
for (measured on disk at authoring time):

    cue                 dur(s)  attack(ms)  centroid(Hz)  energy<500Hz
    draft-confirm       0.605      6.0          405           0.85     <- this
    ui-hover-cyber      1.550     30.2         1948           0.96
    count-tick          1.200      7.1          581           0.75
    count-final         1.050      4.3         2678           0.00

NOTE the hover: task #86 moved it into a LOW craft-flyby, so it too is now
weighty (0.96 < 500 Hz). That is deliberate — the confirm SHARES that low world
rather than fighting it. What still separates the two by ear is that the confirm
is a decisive mechanical STRIKE and the hover is a passing FLYBY: the confirm
hits HARD (6 vs 30 ms), sits DARKER (405 vs 1948 Hz) and is SHORT (0.6 vs
1.55 s). Low-band share alone no longer distinguishes them; the other three axes
do, and the gate rejects the real hover on all three.

The four axes that carry the brief:
  * HARD ONSET   attack <= 15 ms   — a machined strike; the hover swells (30 ms).
  * DARK/HEAVY   centroid <= 800Hz — well under hover 1948 / count-final 2678.
  * WEIGHTY      >=55% of the energy under 500 Hz (count-final is ~0%; the #86
                 hover is also low now, so weight is the SHARED world, not the
                 separator).
  * DECISIVE     0.40-0.85 s       — about half of every other cue, so it can
                                     never be confused with a countdown bell or
                                     the long hover flyby.

NEVER PLAY AUDIO FROM THIS SCRIPT. The user tests the game on this machine and
background noise ruins it (task #62). Judgement is by measurement only.

Playback contract this gate assumes (content/config/audio-map.json, draftConfirm):
    gain 1.0, cooldownMs 200, maxConcurrent 1, no pan.
"""
import subprocess
import sys
import tempfile

import numpy as np

SR = 48000
EPS = 1e-20

# ---- thresholds (the falsifiable brief) -----------------------------------
MAX_ATTACK_MS = 15.0     # hard onset; hover is 72.6 ms
MAX_CENTROID = 800.0     # dark/heavy; hover 1860, count-final 2678
MIN_LO500 = 0.55         # weighty; hover / count-final ~0.00
MIN_DUR = 0.40           # not a mere tick
MAX_DUR = 0.85           # decisive; count-final 1.05, count-tick 1.20, hover 1.63


def load(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-nostdin", "-i", path,
         "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def measure(path):
    x = load(path)
    if x.size == 0:
        return None
    x = x / (np.max(np.abs(x)) + EPS)
    # amplitude envelope + time-to-peak (attack)
    env = np.convolve(np.abs(x), np.ones(256) / 256, mode="same")
    attack_ms = 1000.0 * int(np.argmax(env)) / SR
    # whole-clip average magnitude spectrum
    n, hop = 2048, 1024
    xp = x if len(x) >= n else np.pad(x, (0, n - len(x)))
    w = np.hanning(n)
    mags = [np.abs(np.fft.rfft(xp[i:i + n] * w)) for i in range(0, len(xp) - n + 1, hop)]
    mag = np.mean(mags, axis=0)
    freqs = np.fft.rfftfreq(n, 1 / SR)
    cen = float(np.sum(freqs * mag) / (np.sum(mag) + EPS))
    p = mag ** 2
    lo500 = float(np.sum(p[freqs < 500]) / (np.sum(p) + EPS))
    return {"dur": len(x) / SR, "attack": attack_ms, "cen": cen, "lo500": lo500}


def judge(m):
    reasons = []
    if not (m["attack"] <= MAX_ATTACK_MS):
        reasons.append(f"onset too soft: {m['attack']:.1f} ms > {MAX_ATTACK_MS} (not a strike)")
    if not (m["cen"] <= MAX_CENTROID):
        reasons.append(f"too bright: centroid {m['cen']:.0f} Hz > {MAX_CENTROID}")
    if not (m["lo500"] >= MIN_LO500):
        reasons.append(f"not weighty: only {m['lo500']:.2f} of energy < 500 Hz (need {MIN_LO500})")
    if not (MIN_DUR <= m["dur"] <= MAX_DUR):
        reasons.append(f"duration {m['dur']:.3f}s outside {MIN_DUR}-{MAX_DUR}s (not decisive)")
    return (len(reasons) == 0), reasons


def report(path):
    m = measure(path)
    if m is None:
        print(f"FAIL {path}: empty/undecodable")
        return False
    ok, reasons = judge(m)
    tag = "PASS" if ok else "FAIL"
    print(f"{tag} {path}")
    print(f"     dur={m['dur']:.3f}s  attack={m['attack']:.1f}ms  "
          f"centroid={m['cen']:.0f}Hz  energy<500Hz={m['lo500']:.2f}")
    for r in reasons:
        print(f"     - {r}")
    return ok


# --- selftest: synthesize the failure archetypes and prove they are rejected ---
def _synth(args, dst):
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-nostdin", *args,
                    "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", dst], check=True)


def selftest():
    import os
    here = os.path.dirname(os.path.abspath(__file__))
    ok = True

    shipped = os.path.join(here, "draft-confirm.mp3")
    if os.path.exists(shipped):
        m = measure(shipped)
        passed, reasons = judge(m)
        print(f"[shipped] draft-confirm.mp3  {'PASS' if passed else 'FAIL ' + str(reasons)}")
        ok = ok and passed
    else:
        print("[shipped] draft-confirm.mp3 MISSING")
        ok = False

    # Prove distinctness against the REAL sibling cues on disk (stronger than the
    # synthetic archetypes below): the confirm must never be mistaken for the
    # cyber hover or either countdown bell, so the gate must REJECT all three.
    for sib in ("ui-hover-cyber.mp3", "count-tick.mp3", "count-final.mp3"):
        p = os.path.join(here, sib)
        if not os.path.exists(p):
            print(f"[reject ] {sib:20s} (absent — skipped)")
            continue
        passed, reasons = judge(measure(p))
        hit = not passed
        print(f"[reject ] {sib:20s} {'OK (rejected)' if hit else 'GATE LEAK: accepted as a confirm!'}")
        ok = ok and hit

    with tempfile.TemporaryDirectory() as td:
        cases = {
            # hover archetype: bright rising chirp with a slow swell -> bright + soft onset
            "hover_like": (["-f", "lavfi", "-i",
                "aevalsrc='0.6*sin(2*PI*(1400*t+850*t*t))+0.26*sin(2*PI*(2100*t+1275*t*t))':d=0.6:s=44100",
                "-af", "afade=t=in:st=0:d=0.034:curve=qsin,afade=t=out:st=0.09:d=0.5:curve=exp"],
                ["too bright", "onset too soft"]),
            # count-final archetype: high bell trill -> bright
            "bell_like": (["-f", "lavfi", "-i",
                "aevalsrc='0.5*sin(2*PI*1180*t)+0.25*sin(2*PI*2832*t)':d=0.5:s=44100",
                "-af", "afade=t=out:st=0:d=0.5:curve=exp"],
                ["too bright"]),
            # long low drone: weighty but NOT decisive (too long) -> duration
            "long_drone": (["-f", "lavfi", "-i",
                "aevalsrc='0.9*sin(2*PI*90*t)':d=1.20:s=44100",
                "-af", "afade=t=out:st=0.2:d=1.0:curve=exp"],
                ["duration"]),
            # bubbly: high bright bloom -> bright
            "bubbly": (["-f", "lavfi", "-i",
                "aevalsrc='0.5*sin(2*PI*1760*t)+0.3*sin(2*PI*2640*t)':d=0.4:s=44100",
                "-af", "afade=t=out:st=0:d=0.4:curve=exp"],
                ["too bright"]),
        }
        for name, (args, want) in cases.items():
            dst = f"{td}/{name}.wav"
            _synth(args, dst)
            m = measure(dst)
            passed, reasons = judge(m)
            blob = " ".join(reasons)
            hit = (not passed) and all(any(w in r for r in reasons) for w in want)
            print(f"[reject ] {name:11s} {'OK (rejected)' if hit else 'GATE LEAK: ' + ('accepted' if passed else blob)}")
            ok = ok and hit

    print("SELFTEST", "PASS" if ok else "FAIL")
    return ok


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 2
    if args[0] == "--selftest":
        return 0 if selftest() else 1
    allok = all(report(a) for a in args)
    return 0 if allok else 1


if __name__ == "__main__":
    sys.exit(main())
