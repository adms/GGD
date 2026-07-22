"""Measurement gates for bgm-gen.

These exist because "it sounds like a choir" is not a check anyone can re-run.
Two objective properties separate a real choir render from a synth pad:

  FORMANT PEAKS — the cepstrally-smoothed spectral envelope must have maxima
  near the vowel's F1/F2/F3 targets, and a peak in the 2.6-3.5 kHz
  singer's-formant band. A raw sawtooth pad has a monotone falling envelope
  and fails this.

  ENSEMBLE SPREAD — around each harmonic there must be a CLUSTER of partials
  a few cents apart (many detuned voices), not one clean line. Measured as the
  ratio of energy in the +-40 cent skirt of each harmonic to the energy in its
  +-3 cent core: a single voice is near zero, an ensemble is high.
"""

from __future__ import annotations

import numpy as np

SR = 44100


def mono(x: np.ndarray) -> np.ndarray:
    return x if x.ndim == 1 else 0.5 * (x[0] + x[1])


def spectral_envelope(x: np.ndarray, sr: int = SR, f0: float | None = None,
                      lifter: int | None = None) -> tuple[np.ndarray, np.ndarray]:
    """Cepstrally-smoothed log spectrum (dB) — the formant envelope.

    THE LIFTER LENGTH IS THE WHOLE MEASUREMENT. A cepstral index q is a
    quefrency of q/sr seconds, so keeping the first `lifter` coefficients keeps
    only spectral detail coarser than sr/lifter Hz. A fixed lifter of 48
    resolves nothing finer than 919 Hz apart, which merges F1 and F2 on the
    close vowels and reports a phantom peak between them. It must instead sit
    just under the pitch period (sr/f0) — that is what separates the envelope
    from the harmonic comb — so it is derived from f0 when f0 is known.
    """
    if lifter is None:
        lifter = 176 if f0 is None else int(np.clip(0.78 * sr / f0, 36, 260))
    w = x * np.hanning(len(x))
    n = 1 << int(np.ceil(np.log2(len(w))))
    mag = np.abs(np.fft.rfft(w, n)) + 1e-12
    cep = np.fft.irfft(np.log(mag), n)
    cep[lifter:-lifter] = 0.0
    env = np.fft.rfft(cep, n).real
    return np.fft.rfftfreq(n, 1.0 / sr), 20.0 / np.log(10) * env


def ltas(x: np.ndarray, sr: int = SR, nfft: int = 4096, hop: int = 1024
         ) -> tuple[np.ndarray, np.ndarray]:
    """Long-term average spectrum (dB), Welch-style.

    Used with a GLISSANDO: when the voice glides across an octave its harmonics
    sweep through the fixed vocal-tract resonances, so the long-term average
    traces the formant envelope directly and is not limited by the harmonic
    spacing of any single note. This is the honest way to see the formant bank
    of a high voice, where a single note simply does not have enough harmonics
    to resolve F1 from F2.
    """
    w = np.hanning(nfft)
    acc = np.zeros(nfft // 2 + 1)
    cnt = 0
    for i in range(0, max(1, len(x) - nfft), hop):
        acc += np.abs(np.fft.rfft(x[i : i + nfft] * w)) ** 2
        cnt += 1
    acc /= max(1, cnt)
    return np.fft.rfftfreq(nfft, 1.0 / sr), 10 * np.log10(acc + 1e-20)


def smooth_db(e: np.ndarray, width: int = 9) -> np.ndarray:
    k = np.hanning(width)
    k /= k.sum()
    return np.convolve(e, k, mode="same")


def envelope_peaks(f: np.ndarray, e: np.ndarray, fmin: float = 200.0,
                   fmax: float = 4200.0, n: int = 6) -> list[tuple[float, float]]:
    m = (f >= fmin) & (f <= fmax)
    fe, ee = f[m], e[m]
    idx = [i for i in range(1, len(ee) - 1) if ee[i] > ee[i - 1] and ee[i] >= ee[i + 1]]
    idx.sort(key=lambda i: -ee[i])
    keep = sorted(idx[:n], key=lambda i: fe[i])
    return [(float(fe[i]), float(ee[i])) for i in keep]


def band_energy_db(x: np.ndarray, lo: float, hi: float, sr: int = SR) -> float:
    n = 1 << int(np.ceil(np.log2(len(x))))
    mag = np.abs(np.fft.rfft(x * np.hanning(len(x)), n))
    f = np.fft.rfftfreq(n, 1.0 / sr)
    m = (f >= lo) & (f < hi)
    tot = float(np.sum(mag ** 2)) or 1e-20
    return 10 * np.log10(float(np.sum(mag[m] ** 2)) / tot + 1e-20)


def ensemble_spread(x: np.ndarray, f0: float, sr: int = SR, harmonics: int = 8,
                    core_cents: float = 3.0, skirt_cents: float = 40.0) -> float:
    """dB ratio of harmonic-skirt energy to harmonic-core energy.

    ONE oscillator puts essentially all of a harmonic's energy inside +-3
    cents; N detuned voices smear it across the +-40 cent skirt. Higher is more
    ensemble. (Vibrato widens it too — which is the point: both are things a
    single synth oscillator does not do.)
    """
    n = 1 << int(np.ceil(np.log2(len(x))))
    w = np.abs(np.fft.rfft(x * np.hanning(len(x)), n)) ** 2
    f = np.fft.rfftfreq(n, 1.0 / sr)
    core = skirt = 0.0
    for k in range(1, harmonics + 1):
        fk = f0 * k
        if fk > sr * 0.4:
            break
        c = (f > fk * 2 ** (-core_cents / 1200)) & (f < fk * 2 ** (core_cents / 1200))
        s = (f > fk * 2 ** (-skirt_cents / 1200)) & (f < fk * 2 ** (skirt_cents / 1200))
        core += float(np.sum(w[c]))
        skirt += float(np.sum(w[s]))
    return 10 * np.log10((skirt - core + 1e-20) / (core + 1e-20))


def partial_count(x: np.ndarray, sr: int = SR, floor_db: float = -45.0,
                  fmax: float = 8000.0) -> int:
    """Number of distinct spectral peaks above `floor_db` relative to the max."""
    n = 1 << int(np.ceil(np.log2(len(x))))
    mag = np.abs(np.fft.rfft(x * np.hanning(len(x)), n))
    f = np.fft.rfftfreq(n, 1.0 / sr)
    m = f <= fmax
    mg = 20 * np.log10(mag[m] + 1e-12)
    mg -= mg.max()
    return int(sum(1 for i in range(1, len(mg) - 1)
                   if mg[i] > floor_db and mg[i] > mg[i - 1] and mg[i] >= mg[i + 1]))


def crest_db(x: np.ndarray) -> float:
    x = mono(x)
    rms = float(np.sqrt(np.mean(x ** 2))) or 1e-12
    return 20 * np.log10((float(np.max(np.abs(x))) or 1e-12) / rms)


def rt60_estimate(ir: np.ndarray, sr: int = SR) -> float:
    """Schroeder backward-integration RT60 of an impulse response."""
    x = mono(ir) ** 2
    sch = np.cumsum(x[::-1])[::-1]
    sch = 10 * np.log10(sch / (sch[0] or 1e-20) + 1e-20)
    try:
        i5 = int(np.argmax(sch <= -5.0))
        i25 = int(np.argmax(sch <= -25.0))
        if i25 <= i5:
            return 0.0
        return (i25 - i5) / sr * 3.0
    except Exception:
        return 0.0


def report_choir(x: np.ndarray, f0: float, label: str = "", sr: int = SR) -> dict:
    m = mono(x)
    f, e = spectral_envelope(m, sr, f0=f0)
    pk = envelope_peaks(f, e)
    r = {
        "label": label,
        "formant_peaks_hz": [round(p[0]) for p in pk],
        "singers_formant_db": round(band_energy_db(m, 2600, 3500, sr), 1),
        "ensemble_spread_db": round(ensemble_spread(m, f0, sr), 1),
        "partials": partial_count(m, sr),
        "crest_db": round(crest_db(m), 1),
    }
    return r
