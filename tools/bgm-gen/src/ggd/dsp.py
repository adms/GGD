"""Core DSP for bgm-gen — everything is numpy, nothing is sampled.

DESIGN NOTE — why FFT/overlap-add and not sample-by-sample IIR.
There is no scipy in this toolchain, and a per-sample Python loop over 40 s
(1.76 M samples) is minutes per filter pass. So:

  * static filters (formant banks, EQ, shelves) -> one full-length rFFT,
    multiply by the exact complex analog response, one irFFT. This is not an
    approximation: it is the LTI filter, evaluated in the frequency domain.
  * time-varying filters (the resonant EDM sweep) -> overlap-add with a
    per-frame response. 1024-sample Hann frames at 50 % overlap, 2048-point
    FFT, so the resonator's impulse tail (~2-3 ms at the Q values used) fits
    inside the zero-pad and does not time-alias.
  * feedback delays -> block recursion with a block size equal to the delay,
    so the Python loop runs ~len/D times instead of len times.
"""

from __future__ import annotations

import numpy as np

SR = 44100
TWO_PI = 2.0 * np.pi


# ------------------------------------------------------------------ utilities


def to_stereo(x: np.ndarray) -> np.ndarray:
    x = np.asarray(x, dtype=np.float64)
    return x if x.ndim == 2 else np.stack([x, x])


def db(g: float) -> float:
    return 10.0 ** (g / 20.0)


def fit(dst: np.ndarray, src: np.ndarray, at: int) -> None:
    """Add `src` into `dst` at sample offset `at`, clipping to bounds."""
    if src.ndim == 1:
        src = np.stack([src, src])
    if dst.ndim == 1:
        dst = dst[None, :]
    n = dst.shape[1]
    a = max(0, at)
    b = min(n, at + src.shape[1])
    if b <= a:
        return
    dst[:, a:b] += src[:, a - at : b - at]


def pan(x: np.ndarray, p: float) -> np.ndarray:
    """Constant-power pan of a mono array. p = -1 hard L .. +1 hard R."""
    p = float(np.clip(p, -1.0, 1.0))
    ang = (p + 1.0) * 0.25 * np.pi
    return np.stack([x * np.cos(ang), x * np.sin(ang)])


def norm_peak(x: np.ndarray, peak: float = 0.98) -> np.ndarray:
    m = float(np.max(np.abs(x))) or 1.0
    return x * (peak / m)


# ---------------------------------------------------------------- envelopes


def adsr(n: int, a: float, d: float, s: float, r: float, sr: int = SR,
         curve: float = 2.0) -> np.ndarray:
    """Sample-accurate ADSR over exactly n samples (r is inside n)."""
    a_n = max(1, int(a * sr))
    d_n = max(1, int(d * sr))
    r_n = max(1, int(r * sr))
    sus_n = max(0, n - a_n - d_n - r_n)
    if sus_n == 0:  # short note: squeeze
        total = a_n + d_n + r_n
        k = n / total
        a_n, d_n = max(1, int(a_n * k)), max(1, int(d_n * k))
        r_n = max(1, n - a_n - d_n)
        sus_n = max(0, n - a_n - d_n - r_n)
    at = np.linspace(0.0, 1.0, a_n, endpoint=False) ** (1.0 / curve)
    dt = 1.0 + (s - 1.0) * (np.linspace(0.0, 1.0, d_n, endpoint=False) ** (1.0 / curve))
    st = np.full(sus_n, s)
    rt = s * (1.0 - np.linspace(0.0, 1.0, r_n)) ** curve
    e = np.concatenate([at, dt, st, rt])
    return e[:n] if len(e) >= n else np.pad(e, (0, n - len(e)))


def perc_env(n: int, attack: float, decay: float, sr: int = SR, shape: float = 4.0) -> np.ndarray:
    """Percussive: fast attack then exponential-ish decay over n samples."""
    a_n = max(1, int(attack * sr))
    t = np.arange(n, dtype=np.float64) / sr
    e = np.exp(-t / max(1e-4, decay) * shape * 0.25)
    at = np.minimum(1.0, np.arange(n) / a_n)
    return e * at


def swell(n: int, sr: int = SR, rise: float = 0.35, fall: float = 0.5,
          floor: float = 0.0) -> np.ndarray:
    """Choral/pad envelope: slow raised-cosine in, plateau, raised-cosine out."""
    r = max(1, int(rise * sr))
    f = max(1, int(fall * sr))
    if r + f > n:
        k = n / (r + f)
        r, f = max(1, int(r * k)), max(1, n - max(1, int(r * k)))
    mid = max(0, n - r - f)
    up = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, r))
    dn = 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, f))
    e = np.concatenate([up, np.ones(mid), dn])[:n]
    return floor + (1.0 - floor) * e


# ------------------------------------------------------------------- sources


def noise(n: int, rng: np.random.Generator) -> np.ndarray:
    return rng.standard_normal(n)


def pink(n: int, rng: np.random.Generator) -> np.ndarray:
    """Pink noise by spectral shaping (exact 1/f, no filter cascade drift)."""
    w = np.fft.rfft(rng.standard_normal(n))
    f = np.arange(len(w))
    f[0] = 1
    w = w / np.sqrt(f)
    y = np.fft.irfft(w, n)
    return y / (np.std(y) or 1.0)


def phase_of(f0: np.ndarray | float, n: int, sr: int = SR, phase0: float = 0.0) -> np.ndarray:
    """Integrate a (possibly time-varying) frequency into wrapped phase 0..1."""
    if np.isscalar(f0):
        f0 = np.full(n, float(f0))
    return (phase0 + np.cumsum(np.asarray(f0, dtype=np.float64)) / sr) % 1.0


def wt_read(table: np.ndarray, ph: np.ndarray) -> np.ndarray:
    """Linear-interpolated wavetable read. `ph` in 0..1."""
    m = len(table)
    x = ph * m
    i0 = np.floor(x).astype(np.int64) % m
    i1 = (i0 + 1) % m
    fr = x - np.floor(x)
    return table[i0] * (1.0 - fr) + table[i1] * fr


def bl_saw_table(n_harm: int, size: int = 4096, rng: np.random.Generator | None = None,
                 tilt: float = 1.0) -> np.ndarray:
    """Band-limited sawtooth wavetable; amplitude of harmonic k ~ 1/k**tilt."""
    spec = np.zeros(size // 2 + 1, dtype=complex)
    k = np.arange(1, min(n_harm, size // 2 - 1) + 1)
    amp = 1.0 / (k ** tilt)
    ph = rng.uniform(0, TWO_PI, len(k)) if rng is not None else np.full(len(k), -np.pi / 2)
    spec[k] = amp * np.exp(1j * ph)
    t = np.fft.irfft(spec, size)
    return t / (np.max(np.abs(t)) or 1.0)


def bl_square_table(n_harm: int, size: int = 4096, duty: float = 0.5) -> np.ndarray:
    spec = np.zeros(size // 2 + 1, dtype=complex)
    for k in range(1, min(n_harm, size // 2 - 1) + 1):
        a = (2.0 / (np.pi * k)) * np.sin(np.pi * k * duty)
        spec[k] = a * np.exp(-1j * np.pi / 2)
    t = np.fft.irfft(spec, size)
    return t / (np.max(np.abs(t)) or 1.0)


# ------------------------------------------------------ frequency-domain filters


def _freqs(n: int, sr: int = SR) -> np.ndarray:
    return np.fft.rfftfreq(n, 1.0 / sr)


def apply_response(x: np.ndarray, h: np.ndarray) -> np.ndarray:
    """Multiply x's spectrum by a precomputed complex response of matching length."""
    return np.fft.irfft(np.fft.rfft(x) * h, len(x))


def resonator_response(f: np.ndarray, fc: float, bw: float, gain: float = 1.0) -> np.ndarray:
    """Complex response of an analog 2-pole bandpass (constant peak gain).

        H(s) = g * (s*w/Q) / (s^2 + s*w/Q + w^2),  s = j*2*pi*f
    """
    w = TWO_PI * fc
    q = max(0.5, fc / max(1.0, bw))
    s = 1j * TWO_PI * np.maximum(f, 1e-6)
    return gain * (s * w / q) / (s * s + s * w / q + w * w)


def lowpass_response(f: np.ndarray, fc: float, order: int = 2, q: float = 0.707) -> np.ndarray:
    w = TWO_PI * max(10.0, fc)
    s = 1j * TWO_PI * np.maximum(f, 1e-6)
    h = (w * w) / (s * s + s * w / q + w * w)
    return h ** (order // 2) if order > 2 else h


def highpass_response(f: np.ndarray, fc: float, order: int = 2, q: float = 0.707) -> np.ndarray:
    w = TWO_PI * max(5.0, fc)
    s = 1j * TWO_PI * np.maximum(f, 1e-6)
    h = (s * s) / (s * s + s * w / q + w * w)
    return h ** (order // 2) if order > 2 else h


def shelf_response(f: np.ndarray, fc: float, gain_db: float, high: bool = True) -> np.ndarray:
    g = db(gain_db)
    x = np.maximum(f, 1e-6) / fc
    lp = 1.0 / (1.0 + 1j * x)
    hp = (1j * x) / (1.0 + 1j * x)
    return (lp + g * hp) if high else (g * lp + hp)


def lowpass(x: np.ndarray, fc: float, order: int = 2, q: float = 0.707) -> np.ndarray:
    return apply_response(x, lowpass_response(_freqs(len(x)), fc, order, q))


def highpass(x: np.ndarray, fc: float, order: int = 2, q: float = 0.707) -> np.ndarray:
    return apply_response(x, highpass_response(_freqs(len(x)), fc, order, q))


def bandpass(x: np.ndarray, fc: float, bw: float) -> np.ndarray:
    return apply_response(x, resonator_response(_freqs(len(x)), fc, bw))


def shelf(x: np.ndarray, fc: float, gain_db: float, high: bool = True) -> np.ndarray:
    return apply_response(x, shelf_response(_freqs(len(x)), fc, gain_db, high))


def peak_eq(x: np.ndarray, fc: float, gain_db: float, q: float = 1.0) -> np.ndarray:
    f = _freqs(len(x))
    bp = resonator_response(f, fc, fc / q)
    return apply_response(x, 1.0 + (db(gain_db) - 1.0) * bp)


# ----------------------------------------------------- time-varying OLA filter


def ola_lowpass(x: np.ndarray, cutoff: np.ndarray, res: float | np.ndarray = 0.707,
                frame: int = 1024, sr: int = SR) -> np.ndarray:
    """Resonant lowpass whose cutoff (and optionally Q) move over time.

    `cutoff` is a per-sample Hz array (or scalar); `res` is Q (>0.5).
    """
    n = len(x)
    hop = frame // 2
    nfft = frame * 2
    f = np.fft.rfftfreq(nfft, 1.0 / sr)
    win = np.hanning(frame + 1)[:frame]
    if np.isscalar(cutoff):
        cutoff = np.full(n, float(cutoff))
    if np.isscalar(res):
        res = np.full(n, float(res))
    pad = np.pad(x, (0, frame))
    out = np.zeros(len(pad) + nfft)
    for start in range(0, n, hop):
        seg = pad[start : start + frame]
        if len(seg) < frame:
            seg = np.pad(seg, (0, frame - len(seg)))
        mid = min(n - 1, start + hop)
        h = lowpass_response(f, float(cutoff[mid]), 2, float(res[mid]))
        y = np.fft.irfft(np.fft.rfft(seg * win, nfft) * h, nfft)
        out[start : start + nfft] += y
    return out[:n]


# -------------------------------------------------------------- nonlinearities


def soft_clip(x: np.ndarray, drive: float = 1.0) -> np.ndarray:
    return np.tanh(x * drive) / np.tanh(drive) if drive > 0 else x


def waveshape(x: np.ndarray, drive: float = 3.0, bias: float = 0.0) -> np.ndarray:
    """Asymmetric shaper for the 'guitar' layer — adds even + odd harmonics."""
    y = np.tanh(drive * (x + bias))
    y = y - np.tanh(drive * bias)
    return y / (np.max(np.abs(y)) or 1.0)


# ------------------------------------------------------------- delay / reverb


def delay(x: np.ndarray, time_s: float, feedback: float = 0.35, mix: float = 0.3,
          sr: int = SR, damp_hz: float = 6000.0) -> np.ndarray:
    """Feedback delay, computed one delay-block at a time (see module docstring)."""
    d = max(1, int(time_s * sr))
    n = len(x)
    y = np.zeros(n + d)
    y[:n] = x
    nblocks = int(np.ceil(n / d))
    for b in range(1, nblocks + 1):
        a0, a1 = b * d, min(n + d, (b + 1) * d)
        p0, p1 = (b - 1) * d, min(n + d, b * d)
        seg = y[p0:p1] * feedback
        seg = lowpass(seg, damp_hz) if len(seg) > 8 else seg
        y[a0 : a0 + len(seg)] += seg[: a1 - a0]
    return x + mix * y[:n]


def make_ir(seconds: float, rng: np.random.Generator, sr: int = SR,
            predelay: float = 0.045, decay_hf: float = 0.55, tone_hz: float = 4200.0,
            early: bool = True) -> np.ndarray:
    """Synthesise a CATHEDRAL impulse response (stereo).

    Structure: silent pre-delay -> a handful of sparse early reflections ->
    a dense exponentially-decaying noise tail whose top end decays faster than
    its bottom (air + stone absorption). Stereo decorrelation comes from two
    independent noise seeds, which is what gives the tail its width.
    """
    n = int(seconds * sr)
    pre = int(predelay * sr)
    t = np.arange(n) / sr
    out = np.zeros((2, pre + n))
    for c in range(2):
        tail = rng.standard_normal(n)
        env = np.exp(-t * (6.9 / seconds))
        # frequency-dependent decay: split, decay the top faster, recombine
        lo = lowpass(tail, tone_hz, 2)
        hi = tail - lo
        body = lo * env + hi * (env ** (1.0 / max(1e-3, decay_hf)))
        # build-up: a real hall does not start dense
        body *= np.minimum(1.0, t / 0.09) ** 1.5
        out[c, pre:] = body
    if early:
        taps = [(0.011, 0.42), (0.019, -0.33), (0.027, 0.28), (0.041, -0.22),
                (0.058, 0.18), (0.073, -0.14), (0.091, 0.11)]
        for i, (tt, g) in enumerate(taps):
            for c in range(2):
                off = int((tt * (1.0 + 0.13 * c)) * sr)
                if off < out.shape[1]:
                    out[c, off] += g * (1.0 - 0.1 * i)
    out = np.stack([lowpass(out[0], 9000, 2), lowpass(out[1], 9000, 2)])
    out = np.stack([highpass(out[0], 65, 2), highpass(out[1], 65, 2)])
    return out / (np.max(np.abs(out)) or 1.0)


def convolve(x: np.ndarray, ir: np.ndarray) -> np.ndarray:
    """FFT convolution. x may be (N,) or (2,N); ir may be (M,) or (2,M)."""
    x = to_stereo(x)
    ir = to_stereo(ir)
    n = x.shape[1] + ir.shape[1] - 1
    nfft = 1 << int(np.ceil(np.log2(n)))
    out = np.zeros((2, n))
    for c in range(2):
        X = np.fft.rfft(x[c], nfft)
        H = np.fft.rfft(ir[c], nfft)
        out[c] = np.fft.irfft(X * H, nfft)[:n]
    return out[:, : x.shape[1]]


def reverb_send(x: np.ndarray, ir: np.ndarray, wet: float) -> np.ndarray:
    """Dry + `wet` x an ENERGY-MATCHED reverb return.

    The return is scaled so its RMS equals the dry's RMS before the wet amount
    is applied, so `wet=0.6` really is "the tail sits 4.4 dB under the source".
    Matching PEAKS instead would be a trap: a 3.6 s tail has a far lower peak
    than the dry signal for the same energy, so peak-matching silently sends
    10-15 dB too much and turns the bus into pure reverb.
    """
    x = to_stereo(x)
    w = convolve(x, ir)
    rx = float(np.sqrt(np.mean(x ** 2)))
    rw = float(np.sqrt(np.mean(w ** 2)))
    if rw > 1e-12:
        w *= rx / rw
    return x + wet * w


# ------------------------------------------------------- width / chorus / pump


def widen(x: np.ndarray, amount: float = 0.4) -> np.ndarray:
    """Mid/side widening. Bass stays mono (below 180 Hz side is removed)."""
    x = to_stereo(x)
    mid = 0.5 * (x[0] + x[1])
    side = 0.5 * (x[0] - x[1])
    side = highpass(side, 180.0, 2)
    side *= 1.0 + 2.0 * amount
    return np.stack([mid + side, mid - side])


def chorus(x: np.ndarray, rng: np.random.Generator, depth_ms: float = 7.0,
           rate: float = 0.28, voices: int = 3, mix: float = 0.5, sr: int = SR) -> np.ndarray:
    """Modulated multi-tap chorus, computed with fractional-delay interpolation."""
    x1 = x if x.ndim == 1 else 0.5 * (x[0] + x[1])
    n = len(x1)
    t = np.arange(n) / sr
    outs = []
    for v in range(voices):
        r = rate * (0.7 + 0.6 * rng.random())
        ph = rng.random() * TWO_PI
        base = 0.012 + 0.006 * rng.random()
        d = (base + depth_ms * 1e-3 * 0.5 * (1 + np.sin(TWO_PI * r * t + ph))) * sr
        idx = np.arange(n) - d
        i0 = np.clip(np.floor(idx), 0, n - 1).astype(np.int64)
        i1 = np.clip(i0 + 1, 0, n - 1)
        fr = np.clip(idx - i0, 0, 1)
        outs.append(x1[i0] * (1 - fr) + x1[i1] * fr)
    l = outs[0] + 0.6 * outs[min(2, len(outs) - 1)]
    r_ = outs[min(1, len(outs) - 1)] + 0.6 * outs[-1]
    wet = np.stack([l, r_]) * 0.6
    return to_stereo(x) * (1 - mix * 0.5) + wet * mix


def pump_envelope(n: int, hits: list[float], sr: int = SR, depth: float = 0.72,
                  attack: float = 0.004, hold: float = 0.02, release: float = 0.20,
                  curve: float = 1.7) -> np.ndarray:
    """SIDECHAIN duck curve built from known kick times (score-driven, not detected).

    Score-driven is both more musical and fully deterministic: the pump lands
    exactly on the grid rather than on whatever the detector noticed.
    """
    g = np.ones(n)
    a_n = max(1, int(attack * sr))
    h_n = max(0, int(hold * sr))
    r_n = max(1, int(release * sr))
    down = np.linspace(1.0, 1.0 - depth, a_n)
    holdv = np.full(h_n, 1.0 - depth)
    up = (1.0 - depth) + depth * (np.linspace(0.0, 1.0, r_n) ** curve)
    shape = np.concatenate([down, holdv, up])
    for hsec in hits:
        i = int(hsec * sr)
        if i >= n:
            continue
        j = min(n, i + len(shape))
        g[i:j] = np.minimum(g[i:j], shape[: j - i])
    return g


# ----------------------------------------------------------------- dynamics


def compress(x: np.ndarray, thresh_db: float = -18.0, ratio: float = 4.0,
             attack: float = 0.01, release: float = 0.15, makeup_db: float = 0.0,
             sr: int = SR) -> np.ndarray:
    """Feed-forward compressor with a one-pole (FFT-computed) detector."""
    x = to_stereo(x)
    det = np.maximum(np.abs(x[0]), np.abs(x[1]))
    # one-pole smoothing == convolution with a decaying exponential
    def smooth(sig, tau):
        m = max(1, int(tau * sr * 5))
        k = np.exp(-np.arange(m) / max(1.0, tau * sr))
        k /= k.sum()
        return np.convolve(sig, k, mode="full")[: len(sig)]

    env = smooth(det, attack)
    env = np.maximum(env, smooth(det, release))
    env_db = 20 * np.log10(np.maximum(env, 1e-6))
    over = np.maximum(0.0, env_db - thresh_db)
    gain_db = -over * (1.0 - 1.0 / ratio) + makeup_db
    return x * (10.0 ** (gain_db / 20.0))


def limiter(x: np.ndarray, ceiling: float = 0.94, lookahead: float = 0.005,
            release: float = 0.12, sr: int = SR) -> np.ndarray:
    """Lookahead peak limiter — the last thing before encode."""
    x = to_stereo(x)
    la = max(1, int(lookahead * sr))
    det = np.maximum(np.abs(x[0]), np.abs(x[1]))
    # sliding max over the lookahead window (dilate)
    padded = np.pad(det, (la, la), mode="edge")
    win = 2 * la + 1
    strided = np.lib.stride_tricks.sliding_window_view(padded, win)
    peak = strided.max(axis=1)[: len(det)]
    need = np.minimum(1.0, ceiling / np.maximum(peak, 1e-9))
    m = max(1, int(release * sr))
    k = np.exp(-np.arange(m) / (release * sr / 3.0))
    k /= k.sum()
    gain = np.convolve(need, k, mode="full")[: len(need)]
    gain = np.minimum(gain, need)
    y = x * gain
    return np.clip(y, -ceiling, ceiling)


# ------------------------------------------------------------------- looping


def seamless_loop(x: np.ndarray, body_s: float, xfade: float = 0.3,
                  sr: int = SR) -> np.ndarray:
    """Self-join loop, matching the repo convention exactly.

    Take `body_s` seconds; crossfade the `xfade` seconds that FOLLOW the cut
    point onto the faded head, so the file's end flows into its start.
    Requires the render to contain body_s + xfade seconds of音楽.
    """
    x = to_stereo(x)
    n = int(round(body_s * sr))
    f = int(round(xfade * sr))
    assert x.shape[1] >= n + f, "render must include the crossfade tail"
    body = x[:, :n].copy()
    tail = x[:, n : n + f]
    ramp = np.linspace(0.0, 1.0, f)
    body[:, :f] = body[:, :f] * ramp + tail * (1.0 - ramp)
    return body
