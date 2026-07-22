#!/usr/bin/env python3
"""GATE for task #86 - the cyber BUTTON hover (uiHoverCyber) must be a
LOW-FREQUENCY CRAFT FLYBY, not a light bubbly chirp and not a flabby low drone.

    python3 GATE-hover-cyber.py <candidate.wav|mp3> [...]   # judge candidates
    python3 GATE-hover-cyber.py --selftest                  # prove the gate still
                                                            # rejects every known
                                                            # failure archetype

WHY THIS FILE EXISTS. The complaint was subjective ("too much like Bubble
Bobble, light and floaty; I want sci-fi low-frequency with a sense of speed,
like a technological craft passing by low"). The thresholds below are the
falsifiable version of that sentence, calibrated against the sound that was
actually rejected and against the two failure modes that have already been
rejected twice on the dragon roar (low must not mean flabby).

NEVER PLAY AUDIO FROM THIS SCRIPT. The user tests the game on this machine;
background noise ruins it (task #62). Judgement is by measurement only.

Playback contract this gate assumes (content/config/audio-map.json, uiHoverCyber):
    gain 0.30, cooldownMs 55, maxConcurrent 3, no pan -> a baked-in stereo
    image reaches the output intact.
"""
import subprocess
import sys

import numpy as np

import subprocess

import numpy as np

SR = 48000
EPS = 1e-20


def probe_channels(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a:0",
         "-show_entries", "stream=channels", "-of", "csv=p=0", path],
        capture_output=True, text=True, check=True).stdout.strip()
    return int(out.splitlines()[0])


def decode(path):
    ch = probe_channels(path)
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-acodec", "pcm_f32le",
         "-ar", str(SR), "-ac", str(ch), "-"],
        capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype="<f4").astype(np.float64).reshape(-1, ch)


def db(x):
    return 10 * np.log10(max(float(x), 1e-30))


def adb(x):
    return 20 * np.log10(max(float(x), 1e-15))


def whole_fft_bands(mono):
    """Exact (Parseval) band energy fractions - no windowing bias."""
    X = np.abs(np.fft.rfft(mono)) ** 2
    f = np.fft.rfftfreq(len(mono), 1 / SR)
    tot = X[(f >= 20) & (f < 20000)].sum()
    def frac(lo, hi):
        return float(X[(f >= lo) & (f < hi)].sum() / max(tot, EPS))
    return {
        "sub120": frac(20, 120), "lo300": frac(20, 300), "lo500": frac(20, 500),
        "b500_2k": frac(500, 2000), "b500_6k": frac(500, 6000),
        "b2k_6k": frac(2000, 6000), "hi6k": frac(6000, 20000),
    }


def stft(mono, n=2048, hop=256):
    win = np.hanning(n)
    if len(mono) < n:
        mono = np.pad(mono, (0, n - len(mono)))
    frames = 1 + (len(mono) - n) // hop
    S = np.empty((frames, n // 2 + 1))
    for i in range(frames):
        S[i] = np.abs(np.fft.rfft(mono[i * hop:i * hop + n] * win)) ** 2
    return S, np.fft.rfftfreq(n, 1 / SR), (np.arange(frames) * hop + n / 2) / SR


def bmask(f, lo, hi):
    return (f >= lo) & (f < hi)


K_B1 = np.array([1.53512485958697, -2.69169618940638, 1.19839281085285])
K_A1 = np.array([1.0, -1.69065929318241, 0.73248077421585])
K_B2 = np.array([1.0, -2.0, 1.0])
K_A2 = np.array([1.0, -1.99004745483398, 0.99007225036621])


def biquad(x, b, a):
    y = np.zeros_like(x)
    x1 = x2 = y1 = y2 = 0.0
    for i in range(len(x)):
        xi = x[i]
        yi = b[0] * xi + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2
        y[i] = yi
        x2, x1 = x1, xi
        y2, y1 = y1, yi
    return y


def lkfs_ungated(x):
    """BS.1770 K-weighted level, UNGATED (these clips are shorter than the
    400 ms gating block, so real gated LUFS is undefined for them)."""
    tot = 0.0
    for c in range(x.shape[1]):
        y = biquad(biquad(x[:, c].copy(), K_B1, K_A1), K_B2, K_A2)
        tot += float(np.mean(y ** 2))
    return -0.691 + 10 * np.log10(max(tot, 1e-20))


def flatness_floored(P, m, floor_db=60.0):
    """SFM with bins clamped floor_db below the band max.

    Without the clamp the geometric mean is set by the codec/numeric noise floor,
    so a wav and its own mp3 measure decades apart and the metric is untestable.
    """
    p = P[m]
    if p.size < 4 or p.max() <= 0:
        return float("nan")
    p = np.maximum(p, p.max() * 10 ** (-floor_db / 10))
    p = p / p.mean()
    return float(np.exp(np.mean(np.log(p))) / p.mean())


def crest_band_db(P, m):
    """10log10(max bin / mean bin) in a band. Pure tone -> large; noise -> ~8-12 dB.

    Encoder-robust companion to SFM: driven by the PEAK, not the valleys.
    """
    p = P[m]
    if p.size < 4 or p.max() <= 0:
        return float("nan")
    return float(10 * np.log10(p.max() / max(p.mean(), EPS)))


def ltas(mono, n=8192, hop=2048):
    """Energy-normalised 1/3-octave LTAS, 40 Hz..16 kHz. n=8192 -> 5.9 Hz bins,
    so no 1/3-octave band above 40 Hz is left empty."""
    S, f, _ = stft(mono, n=n, hop=hop)
    avg = S.mean(axis=0)
    centers = 1000 * 2.0 ** (np.arange(-14, 13) / 3.0)  # 40 Hz .. 16 kHz
    vals = []
    for c in centers:
        m = bmask(f, c / 2 ** (1 / 6), c * 2 ** (1 / 6))
        vals.append(avg[m].sum() if m.any() else avg[np.argmin(np.abs(f - c))])
    vals = np.array(vals)
    return centers, 10 * np.log10(np.maximum(vals / max(vals.sum(), EPS), 1e-12))


def ltas_dist(a, b):
    return float(np.sqrt(np.mean((a - b) ** 2)))


def analyse(x, name="?"):
    """x: (n, ch) float array."""
    ch = x.shape[1]
    mono = x.mean(axis=1)
    n = len(mono)

    # --- envelope / time ---
    w = max(1, int(SR * 0.001))
    e = np.sqrt(np.convolve(mono ** 2, np.ones(w) / w, mode="same") + 1e-20)
    pk = e.max()
    pi = int(np.argmax(e))
    above = np.nonzero(e > pk * 10 ** (-40 / 20))[0]
    onset = int(above[0]) if above.size else 0
    seg = e[onset:pi + 1]
    if seg.size >= 2:
        i10 = np.nonzero(seg >= 0.10 * pk)[0]
        i90 = np.nonzero(seg >= 0.90 * pk)[0]
        atk = ((i90[0] - i10[0]) / SR * 1000) if (i10.size and i90.size) else 0.0
    else:
        atk = 0.0

    def decay_to(d):
        idx = np.nonzero(e[pi:] < pk * 10 ** (-d / 20))[0]
        return (idx[0] / SR * 1000) if idx.size else float("nan")

    # --- spectral ---
    S, f, tf = stft(mono)
    fe = S.sum(axis=1)
    fedb = 10 * np.log10(np.maximum(fe / max(fe.max(), EPS), 1e-12))
    active = fedb > -40
    head = fedb > -12

    aud = bmask(f, 20, 20000)
    cent = (S[:, aud] * f[aud]).sum(axis=1) / np.maximum(S[:, aud].sum(axis=1), EPS)

    def wmean(v, mask):
        ww = np.where(mask, fe, 0.0)
        return float((v * ww).sum() / max(ww.sum(), EPS)) if ww.sum() > 0 else float("nan")

    def slope(mask):
        idx = np.nonzero(mask)[0]
        if idx.size < 3:
            return float("nan")
        tt, cc, ww = tf[idx], cent[idx], fe[idx]
        tm = (tt * ww).sum() / ww.sum()
        cm = (cc * ww).sum() / ww.sum()
        den = (ww * (tt - tm) ** 2).sum()
        return float((ww * (tt - tm) * (cc - cm)).sum() / den) if den > 0 else float("nan")

    hidx = np.nonzero(head)[0]
    if hidx.size >= 3:
        cum = np.cumsum(fe[hidx]) / fe[hidx].sum()
        ei, li = hidx[cum <= 0.40], hidx[cum >= 0.60]
        ce = float((cent[ei] * fe[ei]).sum() / max(fe[ei].sum(), EPS)) if ei.size else float("nan")
        cl = float((cent[li] * fe[li]).sum() / max(fe[li].sum(), EPS)) if li.size else float("nan")
        arc = float(np.log2(cl / ce)) if (ce > 0 and cl > 0) else float("nan")
    else:
        ce = cl = arc = float("nan")

    bands = whole_fft_bands(mono)

    wa = np.where(active, fe, 0.0)
    m_low, m_up = bmask(f, 40, 500), bmask(f, 500, 6000)
    fl_low = np.array([flatness_floored(S[i], m_low) for i in range(S.shape[0])])
    fl_up = np.array([flatness_floored(S[i], m_up) for i in range(S.shape[0])])
    cr_up = np.array([crest_band_db(S[i], m_up) for i in range(S.shape[0])])
    cr_low = np.array([crest_band_db(S[i], m_low) for i in range(S.shape[0])])

    def wavg(v, mask):
        ww = np.where(mask, fe, 0.0)
        ok = np.isfinite(v) & (ww > 0)
        return float((v[ok] * ww[ok]).sum() / ww[ok].sum()) if ok.any() else float("nan")

    # --- stereo ---
    if ch == 2:
        L = stft(x[:, 0])[0].sum(axis=1)
        R = stft(x[:, 1])[0].sum(axis=1)
        ild = 10 * np.log10(np.maximum(L, EPS) / np.maximum(R, EPS))
        ai = np.nonzero(active[:len(ild)])[0]
        if ai.size:
            v = ild[ai]
            span = float(np.percentile(v, 95) - np.percentile(v, 5))
            k = max(1, v.size // 5)
            st, en = float(v[:k].mean()), float(v[-k:].mean())
            trav = en - st
        else:
            span = st = en = trav = float("nan")
        a_, b_ = x[:, 0], x[:, 1]
        corr = float(np.dot(a_, b_) / max(np.sqrt(np.dot(a_, a_) * np.dot(b_, b_)), EPS))
    else:
        span = st = en = trav = 0.0
        corr = 1.0

    lc, lv = ltas(mono)

    # --- per-frame PERSISTENCE: defeats "pass the average, fail every instant" ---
    ftot = np.maximum(S[:, aud].sum(axis=1), EPS)
    f_lo_r = S[:, bmask(f, 20, 300)].sum(axis=1) / ftot
    f_air_r = S[:, bmask(f, 2000, 8000)].sum(axis=1) / ftot
    hd = np.nonzero(head)[0]
    if hd.size:
        head_ms = float((tf[hd[-1]] - tf[hd[0]]) * 1000)
        low_persist = float(np.mean(f_lo_r[hd] >= 0.30))
        air_persist = float(np.mean(f_air_r[hd] >= 0.010))
    else:
        head_ms = low_persist = air_persist = float("nan")
    ad = np.nonzero(active)[0]
    act_ms = float((tf[ad[-1]] - tf[ad[0]]) * 1000) if ad.size else float("nan")

    # centroid FALL TIME: 90% -> 10% of the head's centroid range. This is the
    # "speed" the user asked for - the same total drop taken slowly is a sag.
    fall_ms = float("nan")
    if hd.size >= 5:
        cw = np.convolve(cent[hd], np.ones(5) / 5, mode="same")
        hi_, lo_ = cw.max(), cw.min()
        if hi_ > lo_ * 1.05:
            t90 = lo_ + 0.90 * (hi_ - lo_)
            t10 = lo_ + 0.10 * (hi_ - lo_)
            i90 = np.nonzero(cw <= t90)[0]
            i10 = np.nonzero(cw <= t10)[0]
            if i90.size and i10.size and i10[0] >= i90[0]:
                fall_ms = float((tf[hd[i10[0]]] - tf[hd[i90[0]]]) * 1000)

    return {
        "head_ms": head_ms, "active_ms": act_ms, "fall_ms": fall_ms,
        "low_persist": low_persist, "air_persist": air_persist,
        "lkfs": lkfs_ungated(x),
        "name": name, "ch": ch, "dur_s": n / SR,
        "atk_ms": atk, "t_peak_ms": (pi - onset) / SR * 1000,
        "t20_ms": decay_to(20), "t60_ms": decay_to(60),
        "peak_dbfs": adb(np.abs(mono).max()), "rms_dbfs": adb(np.sqrt(np.mean(mono ** 2))),
        "crest_db": adb(np.abs(mono).max()) - adb(np.sqrt(np.mean(mono ** 2))),
        "cent_mean": wmean(cent, active), "cent_head": wmean(cent, head),
        "cent_early": ce, "cent_late": cl, "arc_oct": arc,
        "slope_head": slope(head), "slope_all": slope(active),
        **{"f_" + k: v for k, v in bands.items()},
        "fl_low": wavg(fl_low, active), "fl_up": wavg(fl_up, active),
        "fl_up_head": wavg(fl_up, head), "fl_low_head": wavg(fl_low, head),
        "crest_up": wavg(cr_up, active), "crest_low": wavg(cr_low, active),
        "crest_up_head": wavg(cr_up, head),
        "ild_span": span, "ild_start": st, "ild_end": en, "ild_travel": trav, "corr": corr,
        "_ltas": lv, "_ltas_c": lc,
        "_cent_series": (tf[active], cent[active]),
    }


def table(results, rows, width=22):
    names = [r["name"] for r in results]
    ws = [30] + [width] * len(names)
    out = []
    out.append("| " + " | ".join(h.ljust(w) for h, w in zip(["metric"] + names, ws)) + " |")
    out.append("|" + "|".join("-" * (w + 2) for w in ws) + "|")
    for label, key, fmt in rows:
        cells = []
        for r in results:
            v = r.get(key, float("nan"))
            cells.append("n/a" if (isinstance(v, float) and not np.isfinite(v)) else fmt.format(v))
        out.append("| " + " | ".join(c.ljust(w) for c, w in zip([label] + cells, ws)) + " |")
    return "\n".join(out)


ROWS = [
    ("channels", "ch", "{:.0f}"),
    ("duration (s)", "dur_s", "{:.3f}"),
    ("head >-12dB span (ms)", "head_ms", "{:.0f}"),
    ("active >-40dB span (ms)", "active_ms", "{:.0f}"),
    ("attack 10-90% (ms)", "atk_ms", "{:.1f}"),
    ("onset->peak (ms)", "t_peak_ms", "{:.1f}"),
    ("peak->-20dB (ms)", "t20_ms", "{:.0f}"),
    ("peak->-60dB (ms)", "t60_ms", "{:.0f}"),
    ("peak (dBFS)", "peak_dbfs", "{:.1f}"),
    ("rms (dBFS)", "rms_dbfs", "{:.1f}"),
    ("crest (dB)", "crest_db", "{:.1f}"),
    ("centroid mean (Hz)", "cent_mean", "{:.0f}"),
    ("centroid head (Hz)", "cent_head", "{:.0f}"),
    ("centroid early40% (Hz)", "cent_early", "{:.0f}"),
    ("centroid late40% (Hz)", "cent_late", "{:.0f}"),
    ("centroid ARC (oct)", "arc_oct", "{:+.2f}"),
    ("centroid slope head (Hz/s)", "slope_head", "{:+.0f}"),
    ("centroid slope all (Hz/s)", "slope_all", "{:+.0f}"),
    ("E <120 Hz", "f_sub120", "{:.3f}"),
    ("E <300 Hz", "f_lo300", "{:.3f}"),
    ("E <500 Hz", "f_lo500", "{:.3f}"),
    ("E 500-2k", "f_b500_2k", "{:.3f}"),
    ("E 500-6k", "f_b500_6k", "{:.3f}"),
    ("E 2k-6k", "f_b2k_6k", "{:.3f}"),
    ("E >6k", "f_hi6k", "{:.3f}"),
    ("SFM 40-500 (all)", "fl_low", "{:.3f}"),
    ("SFM 500-6k (all)", "fl_up", "{:.3f}"),
    ("SFM 500-6k (head)", "fl_up_head", "{:.3f}"),
    ("crest 500-6k (dB)", "crest_up", "{:.1f}"),
    ("crest 500-6k head (dB)", "crest_up_head", "{:.1f}"),
    ("crest 40-500 (dB)", "crest_low", "{:.1f}"),
    ("low-persistence (frac head)", "low_persist", "{:.2f}"),
    ("air-persistence (frac head)", "air_persist", "{:.2f}"),
    ("K-weighted level (LKFS)", "lkfs", "{:.1f}"),
    ("ILD span p95-p5 (dB)", "ild_span", "{:.2f}"),
    ("ILD travel start->end (dB)", "ild_travel", "{:+.2f}"),
    ("L/R correlation", "corr", "{:.3f}"),
]



rng = np.random.default_rng(86)


def moving_bp_noise(t, fc_of_t, bw_oct=1.4, n=1024):
    """White noise through a bandpass whose centre follows fc_of_t (STFT mask + OLA)."""
    x = rng.standard_normal(len(t))
    hop = n // 2
    win = np.hanning(n + 1)[:n]
    out = np.zeros(len(t) + n)
    f = np.fft.rfftfreq(n, 1 / SR)
    for i in range(0, len(t) - n, hop):
        fc = float(np.interp(t[i + n // 2], t, fc_of_t))
        lo, hi = fc / 2 ** (bw_oct / 2), fc * 2 ** (bw_oct / 2)
        # smooth skirts so the mask itself does not ring
        g = np.exp(-0.5 * (np.log2(np.maximum(f, 1e-6) / fc) / (bw_oct / 2)) ** 2)
        g[f < 30] = 0
        seg = np.fft.rfft(x[i:i + n] * win) * g
        out[i:i + n] += np.fft.irfft(seg, n)
    return out[:len(t)]


def stereo_pan(mono, t, pan_start=-0.85, pan_end=0.85, move_until=0.55):
    p = np.clip(np.interp(t, [0, move_until], [pan_start, pan_end]), -1, 1)
    th = (p + 1) * np.pi / 4
    return np.stack([mono * np.cos(th), mono * np.sin(th)], axis=1)


def probe_flyby(dur=1.60, f_rest=105.0, t0=0.22, tau=0.075, bright=1.0, stereo=True, air=1.0):
    t = np.arange(int(SR * dur)) / SR
    # doppler: apparent freq falls through f_rest at closest approach
    dop = 1 + 0.55 * np.tanh(-(t - t0) / tau)
    f = f_rest * bright * dop
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = sum(a * np.sin(k * ph) for k, a in [(1, 1.0), (2, 0.55), (3, 0.30), (4, 0.16), (6, 0.07)])
    # amplitude arc: approach swell -> pass -> long ring-out
    rise = 1 - np.exp(-t / 0.055)
    fall = np.exp(-np.maximum(t - t0, 0) / 0.30) * 0.72 + np.exp(-np.maximum(t - t0, 0) / 0.85) * 0.28
    env = rise * fall
    air_fc = 2600 * bright * dop
    noise = moving_bp_noise(t, air_fc) * (0.55 * env + 0.45 * np.exp(-t / 0.55)) * 0.9 * air
    y = 0.85 * body * env + noise
    y = y / np.max(np.abs(y)) * 0.72
    if not stereo:
        return np.stack([y, y], axis=1)
    st = stereo_pan(y, t)
    # decorrelated reverb-ish tail so the ring-out is wide, not a point source
    tail_env = np.exp(-t / 0.55) * 0.30
    for c in range(2):
        st[:, c] += moving_bp_noise(t, np.full_like(t, 420.0), bw_oct=2.6) * tail_env * 0.25
    return st / np.max(np.abs(st)) * 0.72


def probe_fart(dur=1.45):
    """The rejected-twice failure mode: sustained low tone, no air, no motion."""
    t = np.arange(int(SR * dur)) / SR
    vib = 1 + 0.02 * np.sin(2 * np.pi * 6.5 * t)
    y = (np.sin(2 * np.pi * 95 * t * vib) + 0.40 * np.sin(2 * np.pi * 190 * t * vib)
         + 0.18 * np.sin(2 * np.pi * 285 * t * vib))
    env = (1 - np.exp(-t / 0.040)) * np.exp(-t / 0.42)
    y = y * env
    y = y / np.max(np.abs(y)) * 0.72
    return np.stack([y, y], axis=1)


def probe_low_air_static(dur=1.45):
    """Low + broadband air, but NOTHING MOVES: no sweep, no doppler, no pan."""
    t = np.arange(int(SR * dur)) / SR
    y = sum(a * np.sin(2 * np.pi * 105 * k * t) for k, a in [(1, 1.0), (2, 0.5), (3, 0.28), (4, 0.15)])
    env = (1 - np.exp(-t / 0.045)) * np.exp(-t / 0.40)
    n = moving_bp_noise(t, np.full_like(t, 2200.0)) * env * 0.85
    y = 0.85 * y * env + n
    y = y / np.max(np.abs(y)) * 0.72
    return np.stack([y, y], axis=1)


def probe_roarlike(dur=1.5):
    """Low, moving, but no air above 2 k: collides with the dragon."""
    t = np.arange(int(SR * dur)) / SR
    dop = 1 + 0.5 * np.tanh(-(t - 0.25) / 0.09)
    f = 92 * dop
    ph = 2 * np.pi * np.cumsum(f) / SR
    growl = 1 + 0.45 * np.sin(2 * np.pi * 31 * t)
    y = sum(a * np.sin(k * ph) for k, a in [(1, 1.0), (2, 0.7), (3, 0.5), (4, 0.34), (5, 0.2), (7, 0.1)])
    env = (1 - np.exp(-t / 0.05)) * np.exp(-t / 0.45)
    y = y * env * growl
    y = y / np.max(np.abs(y)) * 0.72
    return np.stack([y, y], axis=1)


def bandrms(mono, lo, hi):
    X = np.fft.rfft(mono)
    f = np.fft.rfftfreq(len(mono), 1 / SR)
    X[~bmask(f, lo, hi)] = 0
    return float(np.sqrt(np.mean(np.fft.irfft(X, len(mono)) ** 2)))


def pile(x, gain=0.30, offs=(0, 55, 110)):
    n = len(x) + int(SR * max(offs) / 1000) + 1
    acc = np.zeros((n, x.shape[1]))
    solo = np.zeros((n, x.shape[1]))
    for o in offs:
        s = int(SR * o / 1000)
        acc[s:s + len(x)] += x * gain
    solo[:len(x)] += x * gain
    sm, am = solo.mean(axis=1), acc.mean(axis=1)
    return {
        "3x peak dBFS": adb(np.abs(am).max()),
        "peak growth dB": adb(np.abs(am).max()) - adb(np.abs(sm).max()),
        "sub300 pile dB": adb(bandrms(am, 20, 300)) - adb(bandrms(sm, 20, 300)),
        "500-6k pile dB": adb(bandrms(am, 500, 6000)) - adb(bandrms(sm, 500, 6000)),
    }


PROBES = [
    ("A target flyby", probe_flyby()),
    ("B fart drone FAIL", probe_fart()),
    ("C low+air static FAIL", probe_low_air_static()),
    ("D roar-clone FAIL", probe_roarlike()),
    ("E flyby too bright", probe_flyby(f_rest=105, bright=6.5)),
    ("F flyby mono", probe_flyby(stereo=False)),
    ("G flyby no air", probe_flyby(air=0.02)),
]




GAIN = 0.30
OFFS = (0, 55, 110)
ANCHOR_3X_LKFS = -26.5      # the level the user already accepts (rejected chirp)
DRAGONS = ["/Users/Takuro/GGD/content/assets/audio/sfx/dragon-roar-angry.mp3",
           "/Users/Takuro/GGD/content/assets/audio/sfx/dragon-roar.mp3",
           "/Users/Takuro/GGD/content/assets/audio/sfx/dragon-roar2.mp3"]
# The rejected "bubbly rising chirp" reference. It USED to be the live
# fx/ui-hover-cyber.wav, but task #86 replaced that file with the low-flyby
# winner — so pointing here at the live file would compare the shipped clip to
# ITSELF (P2 distance 0, and --selftest's "REJECTED chirp" would no longer be
# the chirp). The original rising-chirp render is archived verbatim (byte-
# identical, md5 1eade92637b21a7e479bfee5e7a68804) in retired/ and referenced
# from there, so P2 and --selftest keep measuring against the real rejected sound.
REJECTED = "/Users/Takuro/GGD/content/assets/audio/sfx/retired/ui-hover-cyber-bubbly-rising-chirp.wav"


def stack(x, gain=GAIN, offs=OFFS):
    n = len(x) + int(SR * max(offs) / 1000) + 1
    acc = np.zeros((n, x.shape[1]))
    solo = np.zeros((n, x.shape[1]))
    for o in offs:
        s = int(SR * o / 1000)
        acc[s:s + len(x)] += x * gain
    solo[:len(x)] += x * gain
    return solo, acc


def bandrms(mono, lo, hi):
    X = np.fft.rfft(mono)
    f = np.fft.rfftfreq(len(mono), 1 / SR)
    X[~bmask(f, lo, hi)] = 0
    return float(np.sqrt(np.mean(np.fft.irfft(X, len(mono)) ** 2)))


def band_frac(mono, lo, hi):
    X = np.abs(np.fft.rfft(mono)) ** 2
    f = np.fft.rfftfreq(len(mono), 1 / SR)
    return float(X[bmask(f, lo, hi)].sum() / max(X[bmask(f, 20, 20000)].sum(), 1e-20))


# criterion: (id, label, getter, lo, hi, unit)  -- lo/hi None = unbounded
CRITERIA = [
    ("C1", "centroid, head (Hz)",          "cent_head",   380,  900,  "Hz"),
    ("C2", "energy <300 Hz",               "f_lo300",     0.45, 0.90, "frac"),
    ("C3", "energy <120 Hz",               "f_sub120",    0.10, 0.60, "frac"),
    ("A1", "energy 2k-8k (AIR)",           "f_air",       0.020, None, "frac"),
    ("A2", "SFM 500-6k, head (AIR)",       "fl_up_head",  0.12, None, "0-1"),
    ("A3", "crest 500-6k, head (AIR)",     "crest_up_head", None, 14.0, "dB"),
    ("A4", "air-persistence over head",    "air_persist", 0.30, None, "frac"),
    ("M1", "centroid ARC",                 "arc_oct",     None, -0.80, "oct"),
    ("M2", "centroid fall 90->10%",        "fall_ms",     None, 350,  "ms"),
    ("M3", "head span >-12 dB",            "head_ms",     250,  None, "ms"),
    ("S1", "ILD span p95-p5",              "ild_span",    6.0,  18.0, "dB"),
    ("S2", "|ILD travel| start->end",      "ild_abs",     5.0,  None, "dB"),
    ("P1", "LTAS dist to nearest dragon",  "d_dragon",    20.0, None, "dB"),
    ("P2", "LTAS dist to rejected chirp",  "d_rejected",  30.0, None, "dB"),
    ("T1", "peak -> -60 dB tail",          "t60_ms",      350,  None, "ms"),
    ("T2", "total duration",               "dur_s",       0.90, 1.80, "s"),
    ("T3", "attack 10-90%",                "atk_ms",      20.0, None, "ms"),
    ("K1", "3x peak @0.30 (normalised)",   "k_peak",      None, -8.0, "dBFS"),
    ("K2", "3x sub-300 pile-up",           "k_pile",      None, 6.0,  "dB"),
]


def evaluate(name, x):
    # --- step 0: loudness-normalise to the anchor -------------------------
    _, acc = stack(x)
    trim_db = ANCHOR_3X_LKFS - lkfs_ungated(acc)
    xn = x * 10 ** (trim_db / 20)
    if np.abs(xn).max() > 0.99:                      # would clip; report it
        trim_db -= adb(np.abs(xn).max() / 0.99)
        xn = x * 10 ** (trim_db / 20)

    r = analyse(xn, name)
    mono = xn.mean(axis=1)
    r["f_air"] = band_frac(mono, 2000, 8000)
    r["ild_abs"] = abs(r["ild_travel"])
    lv = ltas(mono)[1]
    r["d_dragon"] = min(ltas_dist(lv, ltas(decode(d).mean(axis=1))[1]) for d in DRAGONS)
    r["d_rejected"] = ltas_dist(lv, ltas(decode(REJECTED).mean(axis=1))[1])
    solo, acc = stack(xn)
    sm, am = solo.mean(axis=1), acc.mean(axis=1)
    r["k_peak"] = adb(np.abs(am).max())
    r["k_pile"] = adb(bandrms(am, 20, 300)) - adb(bandrms(sm, 20, 300))
    r["trim_db"] = trim_db
    return r


def verdict(r):
    out = []
    for cid, label, key, lo, hi, unit in CRITERIA:
        v = r.get(key, float("nan"))
        if not np.isfinite(v):
            ok = False
        else:
            ok = (lo is None or v >= lo) and (hi is None or v <= hi)
        out.append((cid, label, v, lo, hi, unit, ok))
    return out



# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def _print_report(results):
    w = 16
    print("| " + "criterion".ljust(34) + "| " + "must be".ljust(17) + "| " +
          " | ".join(n[:14].ljust(w) for n, _ in results) + " |")
    print("|" + "-" * 35 + "|" + "-" * 18 + "|" + "|".join("-" * (w + 2) for _ in results) + "|")
    for i, (cid, label, key, lo, hi, unit) in enumerate(CRITERIA):
        req = (f"{lo:g} .. {hi:g}" if lo is not None and hi is not None
               else (f">= {lo:g}" if lo is not None else f"<= {hi:g}"))
        cells = []
        for _, r in results:
            row = verdict(r)[i]
            v, ok = row[2], row[6]
            s = "n/a" if not np.isfinite(v) else (f"{v:.3f}" if abs(v) < 10 else f"{v:.1f}")
            cells.append((("PASS " if ok else "FAIL ") + s).ljust(w))
        print("| " + f"{cid} {label}".ljust(34) + "| " + f"{req} {unit}".ljust(17) + "| " + " | ".join(cells) + " |")
    print("|" + "-" * 35 + "|" + "-" * 18 + "|" + "|".join("-" * (w + 2) for _ in results) + "|")
    print("| " + "VERDICT".ljust(34) + "| " + "".ljust(17) + "| " + " | ".join(
        ("ACCEPT" if all(c[6] for c in verdict(r)) else
         f"REJECT ({sum(1 for c in verdict(r) if not c[6])})").ljust(w) for _, r in results) + " |")
    print("| " + "loudness trim applied (dB)".ljust(34) + "| " + "".ljust(17) + "| " +
          " | ".join(f"{r['trim_db']:+.1f}".ljust(w) for _, r in results) + " |")
    print()
    for n, r in results:
        f = [c[0] for c in verdict(r) if not c[6]]
        print(f"  {n:<26} {'ALL PASS' if not f else 'failed: ' + ' '.join(f)}")


def _selftest():
    """The gate must reject every archetype we already know is wrong, and must
    accept a realisable target. Probes are built in RAM and never written."""
    cands = [(n, x) for n, x in PROBES if n != "A target flyby"]
    _o = stereo_pan

    def _sp(mono, t, pan_start=-0.45, pan_end=0.45, move_until=0.55):
        return _o(mono, t, pan_start, pan_end, move_until)
    globals()["stereo_pan"] = _sp
    good = probe_flyby()
    globals()["stereo_pan"] = _o
    cands = [("A target flyby", good)] + cands + [
        ("REJECTED chirp", decode(REJECTED)),
        ("Kenney tick", decode("/Users/Takuro/GGD/content/assets/audio/sfx/ui-hover.mp3")),
        ("dragon-roar-angry", decode(DRAGONS[0])),
    ]
    results = [(n, evaluate(n, x)) for n, x in cands]
    _print_report(results)
    ok = all(c[6] for c in verdict(results[0][1])) and \
        all(not all(c[6] for c in verdict(r)) for _, r in results[1:])
    print("\nSELFTEST:", "OK - gate accepts the target and rejects every known failure"
          if ok else "BROKEN - gate no longer separates target from failures")
    return 0 if ok else 1


if __name__ == "__main__":
    args = [a for a in sys.argv[1:]]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0)
    if args[0] == "--selftest":
        sys.exit(_selftest())
    res = [(a.split("/")[-1], evaluate(a.split("/")[-1], decode(a))) for a in args]
    _print_report(res)
    sys.exit(0 if all(all(c[6] for c in verdict(r)) for _, r in res) else 1)
