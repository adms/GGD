#!/usr/bin/env python3
"""ROUTE (a) EVIDENCE — measure the synthesised choir instead of asserting it.

Three gates, printed with PASS/FAIL:

  1. FORMANTS. Each part sings a glissando across its range; the long-term
     average spectrum is then compared against that part's expected formant
     frequencies (the vowel table scaled by the part's vocal-tract length). A
     glissando is used rather than a single note because a soprano's harmonics
     are 500-900 Hz apart and simply cannot resolve F1 from F2 on one pitch —
     sweeping the harmonics across the fixed resonances does resolve them.
     GATE: F1 and F2 within 15 % of target for every part and vowel.

  2. ENSEMBLE. The same chord is rendered three ways — the full choir, a
     one-voice-per-part version, and a supersaw pad — and the harmonic-skirt
     energy is compared. GATE: the full choir must show markedly more spread
     than one voice, which is the difference between a section and a soloist.

  3. THE HALL. RT60 and pre-delay of the cathedral impulse response.
     GATE: RT60 >= 2.5 s.

    python3 tools/bgm-gen/probe/choir_check.py
"""

import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))

from ggd import analyze, choir, dsp, voices  # noqa: E402
from ggd.music import hz, note  # noqa: E402

SR = 44100
RANGES = {"bass": ("E2", "D4"), "tenor": ("C3", "A4"),
          "alto": ("F3", "D5"), "soprano": ("C4", "A5")}
VOWELS = ["ah", "oh", "eh", "oo"]
TOL = 0.15


def glide(part: str, vowel: str, step: float = 0.12):
    lo, hi = (note(x) for x in RANGES[part])
    ns, t = [], 0.25
    for m in range(lo, hi + 1):
        ns.append(choir.ChoirNote(t, step * 1.3, m, vowel, 0.8))
        t += step
    sc = choir.ChoirScore()
    sc.parts[part] = ns
    cfg = choir.ChoirConfig(seed=5, attack=0.05, release=0.08, portamento=0.11,
                            breath=0.0)
    y = choir.render_choir(sc, int((t + 1.2) * SR), cfg, ir=None)
    return analyze.mono(y)[int(0.3 * SR):int(t * SR)]


def nearest(peaks, target):
    return min(peaks, key=lambda p: abs(p - target)) if peaks else 0.0


def expected_f1(part: str, vowel: str) -> float:
    """The F1 the glissando should actually average to.

    Not simply `F1 * tract`: choir.py implements F1 TRACKING (a singer opens
    the jaw so F1 never falls below the fundamental), so on the top half of a
    tenor's range F1 is pushed up by f0, and the long-term average of a full
    glissando is the mean of the tracked value. Comparing against the untracked
    nominal would fail the engine for doing the right thing.
    """
    lo, hi = (note(x) for x in RANGES[part])
    nominal = choir.VOWELS[vowel][0][0] * choir.PART_TRACT[part]
    vals = [max(nominal, 0.92 * hz(m)) for m in range(lo, hi + 1)]
    return float(np.mean(vals))


def gate_formants() -> bool:
    print("=== 1. FORMANTS (glissando LTAS vs the vocal-tract-scaled target) ===")
    print(f"{'part':9}{'vowel':6}{'F1 want':>8}{'got':>7}{'err':>7}"
          f"{'F2 want':>9}{'got':>7}{'err':>7}   {'singer 2.6-3.5k':>15}")
    ok = True
    for part in ("bass", "tenor", "alto", "soprano"):
        tract = choir.PART_TRACT[part]
        for vw in VOWELS:
            x = glide(part, vw)
            f, e = analyze.ltas(x)
            e = analyze.smooth_db(e, 11)
            peaks = [p[0] for p in analyze.envelope_peaks(f, e, 180, 4300, 8)]
            row = []
            for i in (0, 1):
                want = expected_f1(part, vw) if i == 0 else choir.VOWELS[vw][i][0] * tract
                got = nearest(peaks, want)
                err = abs(got - want) / want
                ok &= err <= TOL
                row += [want, got, err]
            sf = analyze.band_energy_db(x, 2600, 3500)
            flag = " " if row[2] <= TOL and row[5] <= TOL else "  <-- FAIL"
            print(f"{part:9}{vw:6}{row[0]:8.0f}{row[1]:7.0f}{row[2]*100:6.1f}%"
                  f"{row[3]:9.0f}{row[4]:7.0f}{row[5]*100:6.1f}%   {sf:14.1f}dB{flag}")
    print(f"  -> formants {'PASS' if ok else 'FAIL'} (tolerance {TOL*100:.0f} %)\n")
    return ok


def gate_ensemble() -> bool:
    print("=== 2. ENSEMBLE (harmonic-skirt energy: a section vs one singer) ===")
    chords = ["Dm"]
    times = [(0.2, 3.4)]
    total = int(4.4 * SR)
    f0 = hz(note("D3"))

    full = choir.render_choir(choir.pad_chords(chords, times, ["ah"], 0.85),
                              total, choir.ChoirConfig(seed=3), ir=None)
    solo = choir.render_choir(choir.pad_chords(chords, times, ["ah"], 0.85), total,
                              choir.ChoirConfig(seed=3, voices_scale=0.001,
                                                detune_cents=0.0, timing_ms=0.0,
                                                drift_cents=0.0, vib_depth=0.0),
                              ir=None)
    rng = np.random.default_rng(4)
    n = int(3.4 * SR)
    from ggd import music
    saw = np.zeros(n)
    for m in music.chord("Dm", 3):
        saw += voices.supersaw(n, hz(m), rng, cutoff=3000.0,
                               env=dsp.swell(n, rise=0.3, fall=0.5))
    rows = [("choir  (40 voices)", analyze.mono(full)[int(0.8 * SR):int(3.2 * SR)]),
            ("choir  (1 voice/part, no detune/vib)",
             analyze.mono(solo)[int(0.8 * SR):int(3.2 * SR)]),
            ("supersaw pad (7x3 saws)", saw[int(0.6 * SR):int(3.0 * SR)])]
    print(f"{'render':38}{'spread dB':>10}{'partials':>10}{'2.6-3.5k dB':>13}")
    vals = {}
    for label, x in rows:
        sp = analyze.ensemble_spread(x, f0)
        vals[label] = sp
        print(f"{label:38}{sp:10.1f}{analyze.partial_count(x):10d}"
              f"{analyze.band_energy_db(x, 2600, 3500):13.1f}")
    a = vals["choir  (40 voices)"]
    b = vals["choir  (1 voice/part, no detune/vib)"]
    ok = a - b >= 6.0
    print(f"  -> ensemble {'PASS' if ok else 'FAIL'}: the section spreads "
          f"{a - b:.1f} dB more energy off the harmonic centres than one singer "
          f"(need >= 6.0)\n")
    return ok


def gate_hall() -> bool:
    print("=== 3. THE HALL ===")
    ok = True
    for secs in (1.15, 3.6):
        ir = dsp.make_ir(secs, np.random.default_rng(991),
                         predelay=0.055 if secs > 2 else 0.012,
                         decay_hf=0.5 if secs > 2 else 0.75)
        rt = analyze.rt60_estimate(ir)
        m = analyze.mono(ir)
        onset = int(np.argmax(np.abs(m) > 0.02)) / SR
        kind = "cathedral" if secs > 2 else "plate"
        good = rt >= 2.5 if secs > 2 else rt >= 0.6
        ok &= good
        print(f"  {kind:10} nominal {secs:4.2f}s  RT60 {rt:5.2f}s  "
              f"first reflection at {onset*1000:5.1f} ms  {'ok' if good else 'FAIL'}")
    print(f"  -> hall {'PASS' if ok else 'FAIL'}\n")
    return ok


if __name__ == "__main__":
    results = [gate_formants(), gate_ensemble(), gate_hall()]
    print("ALL GATES", "PASS" if all(results) else "FAIL")
    raise SystemExit(0 if all(results) else 1)
