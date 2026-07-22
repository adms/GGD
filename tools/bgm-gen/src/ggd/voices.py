"""The non-choir instrument kit — all synthesised, no samples anywhere.

Every function returns a MONO float array of exactly `n` samples and is pure
given its rng, so the same seed always produces the same bytes.

The kit is deliberately small and each entry earns its place in the Sawano /
Attack-on-Titan palette:

  supersaw   7 detuned saws          the EDM lead and the wall-of-chords
  pluck      Karplus-Strong string    arpeggios, the "digital koto" figure
  pad        slow multi-saw + filter  the bed the choir sits on
  piano      struck inharmonic tone   THE ostinato instrument of this style
  strings    bowed saw ensemble       the orchestral counter-line
  guitar     saw + waveshaper + cab   the rock layer under the drops
  sub        sine with a pitch drop   the 40-70 Hz floor
  reese      two detuned saws + LP    the mid bass that carries the groove
  kick       150->50 Hz + click       the sidechain trigger
  clap       stacked noise bursts     the backbeat
  snare      noise + a tuned body     the rock backbeat
  hat        filtered noise           the 8ths/16ths
  taiko      membrane modes + skin    THE huge drum; the style is built on it
  timpani    tuned membrane + roll    the orchestral low accent
  riser      noise sweep + pitch      pre-drop tension
  impact     downlifter + boom        the drop itself
  reverse    reversed cymbal swell    the lead-in
"""

from __future__ import annotations

import numpy as np

from . import dsp
from .dsp import SR, TWO_PI
from .music import hz


# --------------------------------------------------------------- pitched kit


def supersaw(n: int, f0: float, rng: np.random.Generator, voices: int = 7,
             detune: float = 0.16, cutoff: float | np.ndarray = 9000.0,
             res: float = 1.2, env: np.ndarray | None = None,
             stereo_spread: float = 0.0) -> np.ndarray:
    """7 detuned sawtooths. `detune` is in semitone-fractions (0.16 ~ 16 cents)."""
    t = np.arange(n) / SR
    out = np.zeros(n)
    tbl = dsp.bl_saw_table(int(min(140, SR * 0.42 / max(30.0, f0))), rng=rng)
    for v in range(voices):
        k = (v - (voices - 1) / 2.0) / max(1.0, (voices - 1) / 2.0)
        cents = detune * 100.0 * (k + 0.12 * rng.uniform(-1, 1))
        f = f0 * 2.0 ** (cents / 1200.0)
        drift = 1.0 + 0.0009 * np.sin(TWO_PI * rng.uniform(0.15, 0.6) * t + rng.uniform(0, TWO_PI))
        ph = dsp.phase_of(f * drift, n, phase0=rng.random())
        g = 1.0 if v == (voices - 1) // 2 else 0.72
        out += g * dsp.wt_read(tbl, ph)
    out /= voices ** 0.7
    if not np.isscalar(cutoff) or cutoff < 16000:
        out = dsp.ola_lowpass(out, cutoff, res)
    return out * (env if env is not None else 1.0)


def pluck(n: int, f0: float, rng: np.random.Generator, damp: float = 0.42,
          bright: float = 0.65, drive: float = 0.0) -> np.ndarray:
    """Karplus-Strong.

    Computed one delay-line-length at a time so the recursion is ~n/N python
    iterations instead of n. The loop filter is a 2-tap average whose weight
    sets the decay; `bright` shapes the initial burst.
    """
    N = max(4, int(round(SR / max(20.0, f0))))
    nblocks = int(np.ceil(n / N)) + 1
    y = np.zeros((nblocks + 1) * N)
    burst = rng.standard_normal(N)
    burst = dsp.lowpass(burst, 400.0 + 9000.0 * bright, 2) if N > 16 else burst
    burst *= np.linspace(1.0, 0.25, N)
    y[:N] = burst / (np.max(np.abs(burst)) or 1.0)
    g = 0.5 * (1.0 - 0.06 * damp)
    carry = 0.0  # y[a0-N-1] for the first tap of each block
    for b in range(1, nblocks + 1):
        a0 = b * N
        prev = y[a0 - N : a0]
        nxt = g * (prev + np.roll(prev, 1))
        nxt[0] = g * (prev[0] + carry)
        carry = prev[-1]
        y[a0 : a0 + N] = nxt
    out = y[:n]
    if drive > 0:
        out = dsp.soft_clip(out, 1.0 + 4.0 * drive)
    return out * dsp.perc_env(n, 0.002, 1.6, shape=1.0)


def pad(n: int, freqs: list[float], rng: np.random.Generator,
        cutoff: float | np.ndarray = 2600.0, res: float = 0.9,
        env: np.ndarray | None = None, detune: float = 0.09) -> np.ndarray:
    out = np.zeros(n)
    for f in freqs:
        out += supersaw(n, f, rng, voices=5, detune=detune, cutoff=16001)
    out /= max(1, len(freqs)) ** 0.6
    out = dsp.ola_lowpass(out, cutoff, res)
    return out * (env if env is not None else dsp.swell(n, rise=0.6, fall=0.9))


def piano(n: int, f0: float, rng: np.random.Generator, vel: float = 0.85,
          inharm: float = 0.00035, partials: int = 22,
          decay: float = 2.4) -> np.ndarray:
    """Struck-string tone by additive synthesis with real inharmonicity.

    Partial k sits at k*f0*sqrt(1+B k^2), not k*f0 — that stretched series is
    what makes a struck string read as a struck string instead of an organ.
    Higher partials decay faster, and a short filtered-noise transient stands
    in for the hammer.
    """
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, partials + 1):
        fk = k * f0 * np.sqrt(1.0 + inharm * k * k)
        if fk > SR * 0.45:
            break
        a = (k ** -1.35) * (0.6 + 0.8 * rng.random() * 0.3)
        d = decay / (1.0 + 0.55 * (k - 1))
        out += a * np.exp(-t / d) * np.sin(TWO_PI * fk * t + rng.uniform(0, TWO_PI))
    out /= np.max(np.abs(out)) or 1.0
    hammer = rng.standard_normal(min(n, int(0.012 * SR)))
    hammer = dsp.bandpass(hammer, min(6000.0, f0 * 6.0), 2600.0)
    hammer *= np.exp(-np.linspace(0, 8, len(hammer)))
    out[: len(hammer)] += hammer * 0.22 * vel
    return out * vel * np.minimum(1.0, np.arange(n) / 24.0)


def strings(n: int, f0: float, rng: np.random.Generator, players: int = 6,
            cutoff: float = 4200.0, attack: float = 0.11) -> np.ndarray:
    """Bowed ensemble: detuned saws, per-player vibrato, slow attack."""
    t = np.arange(n) / SR
    out = np.zeros(n)
    tbl = dsp.bl_saw_table(int(min(120, SR * 0.42 / max(30.0, f0))), rng=rng, tilt=1.08)
    for p in range(players):
        cents = rng.uniform(-9, 9)
        vr, vd = rng.uniform(4.6, 6.2), rng.uniform(0.004, 0.009)
        onset = np.minimum(1.0, t / max(0.05, rng.uniform(0.4, 0.9)))
        f = f0 * 2 ** (cents / 1200) * (1 + vd * onset * np.sin(TWO_PI * vr * t + rng.uniform(0, TWO_PI)))
        out += dsp.wt_read(tbl, dsp.phase_of(f, n, phase0=rng.random()))
    out /= players ** 0.7
    out = dsp.lowpass(out, cutoff, 2)
    e = dsp.swell(n, rise=attack, fall=min(0.5, n / SR * 0.3))
    return out * e


def guitar(n: int, f0: float, rng: np.random.Generator, drive: float = 6.0,
           env: np.ndarray | None = None) -> np.ndarray:
    """Distorted power-chord layer: saw -> waveshaper -> speaker-cab EQ."""
    tbl = dsp.bl_saw_table(int(min(90, SR * 0.42 / max(30.0, f0))), rng=rng)
    x = dsp.wt_read(tbl, dsp.phase_of(f0, n, phase0=rng.random()))
    x += 0.85 * dsp.wt_read(tbl, dsp.phase_of(f0 * 1.4983, n, phase0=rng.random()))  # 5th
    x = dsp.highpass(x, 90.0, 2)
    x = dsp.waveshape(x, drive, bias=0.06)
    # 4x12 cabinet: presence bump then a hard top rolloff
    x = dsp.peak_eq(x, 2400.0, 5.0, 1.2)
    x = dsp.peak_eq(x, 480.0, -4.0, 1.0)
    x = dsp.lowpass(x, 5200.0, 4)
    x = dsp.highpass(x, 110.0, 2)
    return x * (env if env is not None else dsp.perc_env(n, 0.004, 0.9, shape=1.2))


# ------------------------------------------------------------------- bass


def sub(n: int, f0: float, rng: np.random.Generator, drop: float = 1.6,
        drop_time: float = 0.035, decay: float = 0.9, click: float = 0.0) -> np.ndarray:
    """Sine sub with a short pitch drop into the target note."""
    t = np.arange(n) / SR
    f = f0 * (1.0 + (drop - 1.0) * np.exp(-t / max(1e-4, drop_time)))
    x = np.sin(TWO_PI * np.cumsum(f) / SR)
    e = dsp.perc_env(n, 0.004, decay, shape=1.0)
    if click > 0:
        x[: 64] += click * np.linspace(1, 0, 64)
    return x * e


def reese(n: int, f0: float, rng: np.random.Generator, cutoff: float | np.ndarray = 900.0,
          res: float = 2.2, env: np.ndarray | None = None, detune: float = 0.14) -> np.ndarray:
    """The mid bass: two detuned saws through a resonant lowpass."""
    tbl = dsp.bl_saw_table(int(min(80, SR * 0.42 / max(25.0, f0))), rng=rng)
    a = dsp.wt_read(tbl, dsp.phase_of(f0 * 2 ** (-detune / 12), n, phase0=rng.random()))
    b = dsp.wt_read(tbl, dsp.phase_of(f0 * 2 ** (detune / 12), n, phase0=rng.random()))
    x = 0.5 * (a + b)
    x = dsp.ola_lowpass(x, cutoff, res)
    x = dsp.soft_clip(x, 1.6)
    return x * (env if env is not None else dsp.perc_env(n, 0.005, 0.5, shape=1.4))


# ------------------------------------------------------------------- drums


def kick(n: int, rng: np.random.Generator, f_start: float = 150.0, f_end: float = 50.0,
         pitch_time: float = 0.045, decay: float = 0.42, click: float = 0.55,
         drive: float = 1.8) -> np.ndarray:
    t = np.arange(n) / SR
    f = f_end + (f_start - f_end) * np.exp(-t / pitch_time)
    body = np.sin(TWO_PI * np.cumsum(f) / SR)
    body *= dsp.perc_env(n, 0.001, decay, shape=1.1)
    cl = rng.standard_normal(min(n, int(0.006 * SR)))
    cl = dsp.highpass(cl, 1800.0, 2)
    cl *= np.exp(-np.linspace(0, 9, len(cl)))
    x = body
    x[: len(cl)] += cl * click
    x = dsp.soft_clip(x, drive)
    return dsp.highpass(x, 28.0, 2)


def clap(n: int, rng: np.random.Generator, spread: float = 0.011, bursts: int = 4,
         decay: float = 0.19, tone: float = 1400.0) -> np.ndarray:
    """Stacked, slightly-offset noise bursts — the offsets ARE the clap."""
    x = np.zeros(n)
    for i in range(bursts):
        off = int(i * spread * SR * rng.uniform(0.7, 1.25))
        ln = min(n - off, int(0.05 * SR))
        if ln <= 8:
            break
        b = rng.standard_normal(ln) * np.exp(-np.linspace(0, 14, ln))
        x[off : off + ln] += b * (1.0 if i == bursts - 1 else 0.55)
    tail = rng.standard_normal(n) * dsp.perc_env(n, 0.002, decay, shape=1.6)
    x = x + 0.75 * tail
    x = dsp.bandpass(x, tone, tone * 1.5)
    x = dsp.peak_eq(x, 2600.0, 4.0, 0.9)
    return x / (np.max(np.abs(x)) or 1.0)


def snare(n: int, rng: np.random.Generator, tune: float = 190.0, decay: float = 0.22,
          snap: float = 0.7) -> np.ndarray:
    t = np.arange(n) / SR
    body = (np.sin(TWO_PI * tune * t) + 0.6 * np.sin(TWO_PI * tune * 1.58 * t))
    body *= dsp.perc_env(n, 0.001, decay * 0.55, shape=1.2)
    wires = rng.standard_normal(n) * dsp.perc_env(n, 0.001, decay, shape=1.5)
    wires = dsp.highpass(wires, 1500.0, 2)
    x = 0.6 * body + snap * wires
    x = dsp.peak_eq(x, 220.0, 3.0, 1.4)
    return x / (np.max(np.abs(x)) or 1.0)


def hat(n: int, rng: np.random.Generator, decay: float = 0.045, tone: float = 8500.0,
        open_: bool = False) -> np.ndarray:
    x = rng.standard_normal(n)
    x = dsp.highpass(x, tone, 4)
    e = dsp.perc_env(n, 0.0005, decay * (5.0 if open_ else 1.0), shape=2.2)
    return x * e / (np.max(np.abs(x * e)) or 1.0)


def taiko(n: int, rng: np.random.Generator, f0: float = 78.0, decay: float = 0.75,
          skin: float = 0.35, pitch_drop: float = 1.35) -> np.ndarray:
    """A big drum: circular-membrane modes over a pitched body, plus skin noise.

    The mode ratios 1 : 1.593 : 2.135 : 2.295 : 2.917 are the Bessel zeros of an
    ideal circular membrane. A single sine reads as a synth tom; the modes are
    what makes it a drum, and they are why the taiko can sit under a full mix
    without disappearing.
    """
    t = np.arange(n) / SR
    modes = [(1.000, 1.00, 1.00), (1.593, 0.55, 0.62), (2.135, 0.34, 0.45),
             (2.295, 0.26, 0.40), (2.917, 0.17, 0.30)]
    x = np.zeros(n)
    penv = 1.0 + (pitch_drop - 1.0) * np.exp(-t / 0.03)
    for ratio, amp, dscale in modes:
        f = f0 * ratio * penv
        x += amp * np.sin(TWO_PI * np.cumsum(f) / SR + rng.uniform(0, TWO_PI)) \
            * np.exp(-t / (decay * dscale))
    sk = rng.standard_normal(min(n, int(0.03 * SR)))
    sk = dsp.bandpass(sk, 2200.0, 3000.0)
    sk *= np.exp(-np.linspace(0, 10, len(sk)))
    x[: len(sk)] += sk * skin
    x = dsp.soft_clip(x, 1.3)
    return x / (np.max(np.abs(x)) or 1.0)


def timpani(n: int, rng: np.random.Generator, f0: float = 110.0, decay: float = 1.4
            ) -> np.ndarray:
    return taiko(n, rng, f0=f0, decay=decay, skin=0.14, pitch_drop=1.12)


def cymbal(n: int, rng: np.random.Generator, decay: float = 1.6, tone: float = 6000.0
           ) -> np.ndarray:
    x = rng.standard_normal(n)
    x = dsp.highpass(x, tone * 0.5, 2)
    x = x + 0.5 * dsp.bandpass(x, tone, tone)
    return x * dsp.perc_env(n, 0.001, decay, shape=1.1) / 3.0


# ---------------------------------------------------------------------- FX


def riser(n: int, rng: np.random.Generator, f_lo: float = 300.0, f_hi: float = 9000.0,
          res: float = 3.2, tone_hz: float | None = None) -> np.ndarray:
    """White-noise riser: bandpass centre sweeps up while the level swells."""
    x = dsp.pink(n, rng)
    cut = f_lo * (f_hi / f_lo) ** (np.arange(n) / max(1, n - 1)) ** 1.4
    y = np.zeros(n)
    frame, hop = 1024, 512
    f = np.fft.rfftfreq(frame * 2, 1.0 / SR)
    win = np.hanning(frame + 1)[:frame]
    pad = np.pad(x, (0, frame))
    acc = np.zeros(len(pad) + frame * 2)
    for s in range(0, n, hop):
        seg = pad[s : s + frame]
        if len(seg) < frame:
            seg = np.pad(seg, (0, frame - len(seg)))
        fc = float(cut[min(n - 1, s + hop)])
        h = dsp.resonator_response(f, fc, fc / res)
        acc[s : s + frame * 2] += np.fft.irfft(np.fft.rfft(seg * win, frame * 2) * h, frame * 2)
    y = acc[:n]
    if tone_hz:
        t = np.arange(n) / SR
        g = tone_hz * 2 ** (np.linspace(0, 2.0, n))
        y += 0.35 * np.sin(TWO_PI * np.cumsum(g) / SR)
    e = (np.arange(n) / max(1, n - 1)) ** 2.0
    return y / (np.max(np.abs(y)) or 1.0) * e


def impact(n: int, rng: np.random.Generator, f0: float = 55.0, decay: float = 1.5
           ) -> np.ndarray:
    """The drop hit: sub boom + noise slam + a downward pitch tail."""
    t = np.arange(n) / SR
    boom = np.sin(TWO_PI * np.cumsum(f0 * (1 + 2.2 * np.exp(-t / 0.06))) / SR)
    boom *= dsp.perc_env(n, 0.001, decay, shape=0.9)
    slam = rng.standard_normal(n) * dsp.perc_env(n, 0.0005, 0.35, shape=1.6)
    slam = dsp.lowpass(slam, 3000.0, 2)
    down = np.sin(TWO_PI * np.cumsum(2200.0 * np.exp(-t / 0.25) + 60.0) / SR)
    down *= dsp.perc_env(n, 0.001, 0.55, shape=1.2) * 0.5
    x = 1.0 * boom + 0.55 * slam + 0.35 * down
    return x / (np.max(np.abs(x)) or 1.0)


def downlifter(n: int, rng: np.random.Generator, f_hi: float = 5000.0,
               f_lo: float = 90.0) -> np.ndarray:
    t = np.arange(n) / SR
    f = f_lo + (f_hi - f_lo) * np.exp(-t / (n / SR / 3.0))
    x = np.sin(TWO_PI * np.cumsum(f) / SR)
    x += 0.5 * dsp.bandpass(rng.standard_normal(n), 2000.0, 2500.0) * np.exp(-t * 4)
    return x * dsp.perc_env(n, 0.002, n / SR / 2.2, shape=1.0)


def reverse_swell(n: int, rng: np.random.Generator, tone: float = 4500.0) -> np.ndarray:
    x = cymbal(n, rng, decay=n / SR * 0.55, tone=tone)
    return x[::-1].copy()


def noise_sweep_down(n: int, rng: np.random.Generator) -> np.ndarray:
    x = dsp.pink(n, rng)
    cut = 9000.0 * (300.0 / 9000.0) ** (np.arange(n) / max(1, n - 1))
    y = dsp.ola_lowpass(x, cut, 2.0)
    return y * dsp.perc_env(n, 0.01, n / SR / 2.5, shape=1.0)


# ------------------------------------------------------------ level trimming
#
# Raw generators differ by more than 20 dB at unity — a Karplus-Strong pluck
# comes out at -27.7 dBFS RMS where a kick comes out at -3.3 — so writing a
# balanced score would mean memorising 17 arbitrary numbers. Instead every
# voice is trimmed here to a common -12 dBFS reference (measured on a 1 s D4,
# reproduce with `probe/levels.py`), which makes `gain=1.0` mean the same thing
# everywhere and makes a score's gain values readable as a mix.

REF_RMS_DB = -12.0

TRIM = {
    "supersaw": 1.65, "pad": 1.63, "strings": 0.99, "piano": 0.60, "pluck": 6.08,
    "guitar": 0.44, "sub": 0.31, "reese": 0.50,
    "kick": 0.27, "clap": 1.71, "snare": 1.56, "hat": 3.60, "openhat": 3.60,
    "taiko": 0.42, "timpani": 0.42, "cymbal": 0.68,
    "riser": 2.42, "impact": 0.48, "downlifter": 1.0, "reverse": 1.4,
    "sweepdown": 1.4,
}

_GEN = {
    "supersaw": lambda n, r, f0, kw: supersaw(n, f0, r, **kw),
    "pad": lambda n, r, f0, kw: pad(n, kw.pop("freqs", [f0]), r, **kw),
    "strings": lambda n, r, f0, kw: strings(n, f0, r, **kw),
    "piano": lambda n, r, f0, kw: piano(n, f0, r, **kw),
    "pluck": lambda n, r, f0, kw: pluck(n, f0, r, **kw),
    "guitar": lambda n, r, f0, kw: guitar(n, f0, r, **kw),
    "sub": lambda n, r, f0, kw: sub(n, f0, r, **kw),
    "reese": lambda n, r, f0, kw: reese(n, f0, r, **kw),
    "kick": lambda n, r, f0, kw: kick(n, r, **kw),
    "clap": lambda n, r, f0, kw: clap(n, r, **kw),
    "snare": lambda n, r, f0, kw: snare(n, r, **kw),
    "hat": lambda n, r, f0, kw: hat(n, r, **kw),
    "openhat": lambda n, r, f0, kw: hat(n, r, open_=True, **kw),
    "taiko": lambda n, r, f0, kw: taiko(n, r, **kw),
    "timpani": lambda n, r, f0, kw: timpani(n, r, **kw),
    "cymbal": lambda n, r, f0, kw: cymbal(n, r, **kw),
    "riser": lambda n, r, f0, kw: riser(n, r, **kw),
    "impact": lambda n, r, f0, kw: impact(n, r, **kw),
    "downlifter": lambda n, r, f0, kw: downlifter(n, r, **kw),
    "reverse": lambda n, r, f0, kw: reverse_swell(n, r, **kw),
    "sweepdown": lambda n, r, f0, kw: noise_sweep_down(n, r, **kw),
}


def make(name: str, n: int, rng: np.random.Generator, f0: float | None = None,
         env: np.ndarray | None = None, **kw) -> np.ndarray:
    """The single entry point: level-trimmed, envelope applied, mono."""
    if name not in _GEN:
        raise ValueError(f"unknown voice {name!r}; have {sorted(_GEN)}")
    if name in ("supersaw", "pad", "guitar", "reese"):
        kw["env"] = env
        env = None
    x = _GEN[name](n, rng, f0 or 0.0, dict(kw)) * TRIM[name]
    return x * env if env is not None else x
