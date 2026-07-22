#!/usr/bin/env python3
"""ROUTE (b) EVIDENCE — is macOS `say` usable as a choir sample source?

Renders sustained vowels from the same two voices `tools/tts-gen` already uses
(Kyoko ja_JP, Meijia zh_TW), then measures the three things that decide it:

  1. how much STEADY tone a maximally-sustained vowel actually yields,
  2. where the real formants sit (this is the useful part — it calibrates the
     synthesis targets in ggd/choir.py against a real human tract),
  3. what happens to pitch and formants when the clip is shifted to real SATB
     chord tones, by naive resampling and by a numpy phase vocoder.

    python3 tools/bgm-gen/probe/tts_route.py

Requires macOS `say`. Output is printed, nothing is written into the repo.
"""

import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))

from ggd import analyze  # noqa: E402
from ggd.audio import ffmpeg, read_wav  # noqa: E402

SR = 44100
TMP = os.path.join(os.environ.get("TMPDIR", "/tmp"), "ggd-bgm-tts-probe")

CASES = [
    ("kyoko_a", "Kyoko", 90, "あーーーーーーーーーーーーーーーー"),
    ("kyoko_o", "Kyoko", 90, "おーーーーーーーーーーーー"),
    ("kyoko_e", "Kyoko", 90, "えーーーーーーーーーーーー"),
    ("kyoko_u", "Kyoko", 90, "うーーーーーーーーーーーー"),
    ("meijia_a", "Meijia", 90, "啊啊啊啊啊啊啊啊"),
]

# What ggd/choir.py synthesises, for comparison.
SYNTH_TARGET = {"kyoko_a": (700, 1220), "kyoko_o": (450, 800),
                "kyoko_e": (550, 1900), "kyoko_u": (320, 800),
                "meijia_a": (700, 1220)}


def render_all() -> None:
    os.makedirs(TMP, exist_ok=True)
    for name, voice, rate, text in CASES:
        wav = f"{TMP}/{name}.wav"
        if os.path.exists(wav):
            continue
        aiff = f"{TMP}/{name}.aiff"
        subprocess.run(["say", "-v", voice, "-r", str(rate), "-o", aiff, text], check=True)
        ffmpeg(["-i", aiff, "-ar", str(SR), "-ac", "1", "-c:a", "pcm_s16le", wav])


def f0_autocorr(x, sr=SR, fmin=70, fmax=450):
    x = (x - x.mean()) * np.hanning(len(x))
    n = 1 << int(np.ceil(np.log2(len(x) * 2)))
    X = np.fft.rfft(x, n)
    ac = np.fft.irfft(X * np.conj(X), n)[: len(x)]
    ac /= ac[0] or 1
    lo, hi = int(sr / fmax), int(sr / fmin)
    k = lo + int(np.argmax(ac[lo:hi]))
    return sr / k, float(ac[k])


def steady(x, sr=SR):
    """Longest run whose 20 ms RMS stays within 6 dB of the clip's maximum."""
    hop, win = int(0.01 * sr), int(0.02 * sr)
    r = np.array([np.sqrt(np.mean(x[i:i + win] ** 2)) for i in range(0, len(x) - win, hop)])
    ok = 20 * np.log10(r + 1e-9) > (20 * np.log10(r.max() + 1e-9) - 6.0)
    best = cur = bstart = cstart = 0
    for i, v in enumerate(ok):
        if v:
            cstart = cstart if cur else i
            cur += 1
            if cur > best:
                best, bstart = cur, cstart
        else:
            cur = 0
    return bstart * hop, (bstart + best) * hop


def resample(x, ratio):
    n = int(len(x) / ratio)
    idx = np.clip(np.arange(n) * ratio, 0, len(x) - 2)
    i0 = np.floor(idx).astype(int)
    return x[i0] * (1 - (idx - i0)) + x[i0 + 1] * (idx - i0)


def pv_stretch(x, factor, nfft=2048, hop=512):
    win = np.hanning(nfft + 1)[:nfft]
    nf = 1 + (len(x) - nfft) // hop
    if nf < 3:
        return x
    S = np.stack([np.fft.rfft(x[i * hop:i * hop + nfft] * win) for i in range(nf)])
    mag, ph = np.abs(S), np.angle(S)
    omega = 2 * np.pi * hop * np.arange(S.shape[1]) / nfft
    d = (np.diff(ph, axis=0) - omega[None, :] + np.pi) % (2 * np.pi) - np.pi
    freq = omega[None, :] + d
    out = int(nf * factor)
    y = np.zeros(out * hop + nfft)
    w2 = np.zeros_like(y)
    acc = np.zeros(S.shape[1])
    for i in range(out):
        t = i / factor
        k = min(int(t), nf - 2)
        fr = t - int(t)
        m = mag[k] * (1 - fr) + mag[k + 1] * fr
        y[i * hop:i * hop + nfft] += np.fft.irfft(m * np.exp(1j * acc), nfft) * win
        w2[i * hop:i * hop + nfft] += win ** 2
        acc = acc + freq[k]
    return y / np.maximum(w2, 1e-6)


def main() -> int:
    render_all()
    print("=== 1. what `say` actually gives us "
          "(22.05 kHz mono source, upsampled to 44.1) ===")
    print(f"{'clip':10} {'file s':>7} {'steady s':>9} {'f0 Hz':>7} {'periodic':>9}  "
          f"{'measured F1/F2':>16}  {'choir.py target':>16}")
    src = {}
    for name, *_ in CASES:
        x, _ = read_wav(f"{TMP}/{name}.wav")
        x = x[0]
        a, b = steady(x)
        seg = x[a:b]
        if len(seg) < 4096:
            print(f"{name:10} {len(x)/SR:7.2f} {(b-a)/SR:9.2f}   (too short to analyse)")
            continue
        f0, per = f0_autocorr(seg[:8192])
        f, e = analyze.spectral_envelope(seg, f0=f0)
        pk = [round(p[0]) for p in analyze.envelope_peaks(f, e, 200, 2600, 2)]
        src[name] = (seg, f0)
        print(f"{name:10} {len(x)/SR:7.2f} {(b-a)/SR:9.2f} {f0:7.1f} {per:9.2f}  "
              f"{str(pk):>16}  {str(SYNTH_TARGET[name]):>16}")

    seg, f0 = src["kyoko_a"]
    print(f"\n=== 2. shifting that 'ah' to SATB chord tones (source f0 {f0:.0f} Hz) ===")
    print(f"{'target':12} {'ratio':>6} {'resample len':>13} {'resample F1/F2':>16} "
          f"{'PV f0':>7} {'PV periodic':>12}")
    for label, target in [("bass A2", 110.0), ("tenor A3", 220.0),
                          ("alto E4", 329.6), ("soprano A5", 880.0)]:
        r = target / f0
        y = resample(seg, r)
        fy, ey = analyze.spectral_envelope(y, f0=target)
        pk = [round(p[0]) for p in analyze.envelope_peaks(fy, ey, 150, 2600, 2)]
        z = resample(pv_stretch(seg, r), r)
        f0z, perz = f0_autocorr(z[:8192])
        print(f"{label:12} {r:6.2f} {len(y)/SR:12.2f}s {str(pk):>16} "
              f"{f0z:7.1f} {perz:12.2f}")

    print("""
=== verdict ===
Route (b) is a good FORMANT REFERENCE and a poor SAMPLE SOURCE:
  * usable sustain is ~1-2 s, against the 4-8 s a choral pad has to hold;
  * the source is 22.05 kHz mono, so half its bandwidth is gone before an
    octave-down shift and all of its stereo is gone permanently;
  * naive resampling drags the formants with the pitch (that is how the repo's
    dragon roar was built ON PURPOSE — it makes a creature, not a bass);
  * a numpy phase vocoder holds the length but loses the pitch on the large
    upward shift a soprano needs;
  * and one clip is one voice, where the entire choral effect is 40 independent
    ones.
ggd/choir.py therefore synthesises, and uses the measured formants above to
calibrate its vowel targets.""")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
