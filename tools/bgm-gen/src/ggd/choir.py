"""CHOIR ENGINE — a wordless SATB choir built from nothing but numpy.

WHY FORMANT SYNTHESIS AND NOT PITCH-SHIFTED TTS (route (a) over route (b)).
Both routes in the brief were built and measured; `probe/` holds the scripts and
`README.md` the numbers. The short version, from macOS `say`:

  * macOS voices render at 22.05 kHz MONO. Every sample is band-limited to
    11 kHz before we touch it, and half of that survives an octave-down shift.
  * A maximally-sustained vowel gives 1.1-1.8 s of steady tone (Kyoko
    "あーーー" @ r90: 1.80 s; Meijia "啊啊啊" : 0.39 s). A choral pad has to hold
    a chord for 4-8 s.
  * Kyoko's f0 is 233-277 Hz. Reaching a bass A2 means shifting down 0.47x;
    naive resampling drags the formants down with it (984/1810 Hz -> 605/1679,
    with the 3.2 kHz singer's-formant region losing 11 dB) which is the
    "slowed-down woman", not a bass. Reaching soprano A5 means 3.77x, which
    leaves 0.48 s of audio.
  * A numpy phase-vocoder fixes the length but not the pitch: at the 3.77x
    soprano target it tracked to 302 Hz instead of 880 Hz with periodicity
    falling to 0.63 — it simply fails on shifts that large.
  * And the fatal one for THIS job: a sample gives you ONE voice. The ensemble
    is the choir. 40 independently detuned, independently vibrating, independently
    timed voices is the entire effect, and 40 copies of one clip is 40 copies of
    one clip no matter how they are shifted.

Formant synthesis has the opposite properties: unlimited sustain, any pitch,
full 44.1 kHz bandwidth, and — decisively — every voice is generated
independently, so the ensemble is real. What route (b) did contribute is
CALIBRATION: the vowel targets below were cross-checked against cepstral
formant estimates measured off real `say` renders (see README).

WHAT ACTUALLY MAKES IT A CHOIR (in rough order of importance)
  1. ENSEMBLE. 8-14 voices per part, each with its own detune (+-5..15 cents),
     its own vibrato rate/depth/phase with a delayed onset, its own entry
     offset (+-20..40 ms), its own slow pitch drift, its own pan.
  2. FORMANTS. A parallel bank of 5 analog resonators per voice, scaled by a
     per-part vocal-tract length (bass 0.90 .. soprano 1.13) and per-voice
     jitter. F4/F5 form the SINGER'S FORMANT cluster around 2.8-3.4 kHz — that
     cluster is what makes a trained voice cut through an orchestra, and
     leaving it out is why naive formant synths sound like a kazoo.
  3. F1 TRACKING. Above about F1 a soprano raises her first formant to meet the
     fundamental. Without this, high notes lose their body and go thin.
  4. BREATH. Aspiration mixed into the glottal source (so it is shaped by the
     same vocal tract) plus a brighter breath transient on each entry.
  5. REAL SATB. Independent parts with proper spacing and minimal inner-voice
     motion (see music.voice_satb) — parallel octaves read as a synth pad.
  6. A CATHEDRAL. Long pre-delay, long tail. Most of the "sacred" is the room.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from . import dsp
from .dsp import SR, TWO_PI
from .music import hz

# --------------------------------------------------------------------- vowels
#
# (centre Hz, bandwidth Hz, linear amplitude) x 5 formants, for a neutral adult
# tract. Per-part tract scaling is applied on top. F4/F5 are the singer's
# formant cluster and are deliberately strong on the open vowels.

VOWELS: dict[str, list[tuple[float, float, float]]] = {
    #        F1                F2                 F3                F4                F5
    "ah": [(700, 80, 1.00), (1220, 95, 0.63), (2600, 140, 0.34), (3050, 170, 0.30), (3900, 220, 0.14)],
    "oh": [(450, 70, 1.00), (800, 90, 0.52), (2600, 150, 0.18), (3000, 180, 0.16), (3900, 230, 0.07)],
    "eh": [(550, 75, 1.00), (1900, 105, 0.48), (2500, 145, 0.38), (3100, 175, 0.30), (3900, 220, 0.13)],
    "oo": [(320, 60, 1.00), (800, 90, 0.28), (2400, 150, 0.10), (3000, 185, 0.09), (3900, 240, 0.04)],
    "uh": [(600, 80, 1.00), (1150, 95, 0.55), (2500, 145, 0.26), (3050, 175, 0.22), (3900, 225, 0.10)],
}

# Vocal-tract length scaling. A bass has a longer tract, so every formant sits
# lower; a soprano's sits higher. This is the single cheapest thing that stops
# the four parts sounding like one voice at four pitches.
PART_TRACT = {"bass": 0.90, "tenor": 0.96, "alto": 1.05, "soprano": 1.13}

# Per-part ensemble size. The low parts need fewer voices: they carry less of
# the "shimmer" and too many detuned voices down there turns to mud.
PART_VOICES = {"bass": 8, "tenor": 8, "alto": 10, "soprano": 12}

# Stereo placement of the sections (a real choir is laid out, not centred).
PART_PAN = {"soprano": -0.42, "alto": 0.30, "tenor": -0.26, "bass": 0.38}
PART_SPREAD = {"soprano": 0.48, "alto": 0.46, "tenor": 0.40, "bass": 0.32}

PART_GAIN = {"soprano": 1.00, "alto": 0.80, "tenor": 0.78, "bass": 0.92}


@dataclass
class ChoirNote:
    """One note for one part. `t` and `dur` are SECONDS."""
    t: float
    dur: float
    midi: float
    vowel: str = "ah"
    dyn: float = 0.85          # 0..1, drives both level and vocal effort
    legato: bool = True        # glide into this note from the previous one


@dataclass
class ChoirConfig:
    voices_scale: float = 1.0      # multiply PART_VOICES (0.5 = a small ensemble)
    detune_cents: float = 11.0     # +- max random detune
    vib_rate: float = 5.2          # Hz, randomised +-18 % per voice
    vib_depth: float = 0.011       # fraction of f0 (about 19 cents) at full onset
    vib_onset: float = 0.55        # seconds before vibrato reaches full depth
    timing_ms: float = 32.0        # +- entry jitter
    drift_cents: float = 7.0       # slow random intonation drift
    breath: float = 0.16           # entry breath level
    aspiration: float = 0.030      # continuous aspiration mixed into the source
    effort: float = 0.55           # 0 = dark/soft, 1 = brilliant/loud (spectral tilt)
    attack: float = 0.14           # seconds
    release: float = 0.30
    portamento: float = 0.055      # seconds of glide between legato notes
    seed: int = 0


# ------------------------------------------------------------ glottal source


def glottal_table(f0: float, effort: float, rng: np.random.Generator,
                  size: int = 2048) -> np.ndarray:
    """A band-limited glottal-pulse wavetable for one note.

    Harmonic k has amplitude k^-1.15 * exp(-(k*f0/Fc)^1.6). The k^-1.15 slope is
    the glottal flow derivative after lip radiation; the Gaussian-ish corner Fc
    is VOCAL EFFORT — soft singing rolls off at ~1.9 kHz, full voice past 6 kHz.
    Harmonic phases are randomised per voice, which is what stops N detuned
    voices combing against each other.
    """
    fc = 1900.0 + 4600.0 * float(np.clip(effort, 0.0, 1.0))
    kmax = int(min(size // 2 - 2, max(4, (SR * 0.44) // max(40.0, f0))))
    k = np.arange(1, kmax + 1)
    amp = (k ** -1.15) * np.exp(-((k * f0 / fc) ** 1.6))
    spec = np.zeros(size // 2 + 1, dtype=complex)
    spec[k] = amp * np.exp(1j * rng.uniform(0.0, TWO_PI, len(k)))
    t = np.fft.irfft(spec, size)
    return t / (np.std(t) or 1.0)


def formant_response(f: np.ndarray, vowel: str, tract: float, f0: float,
                     jitter: np.ndarray | None = None,
                     effort: float = 0.5) -> np.ndarray:
    """Complex response of the parallel formant bank for one voice on one note."""
    fm = VOWELS[vowel]
    h = np.zeros(len(f), dtype=complex)
    for i, (fc, bw, amp) in enumerate(fm):
        c = fc * tract
        if jitter is not None:
            c *= jitter[i]
        if i == 0:
            # F1 TRACKING: a singer opens the jaw to keep F1 at or above f0,
            # otherwise the fundamental falls outside the first resonance and
            # high notes go thin and reedy.
            c = max(c, 0.92 * f0)
        b = bw * (0.85 + 0.30 * tract)
        h += dsp.resonator_response(f, c, b, amp)
    # spectral tilt with vocal effort (loud singing is brighter, not just louder)
    h *= dsp.shelf_response(f, 2000.0, -7.0 + 11.0 * float(np.clip(effort, 0, 1)), True)
    # remove sub-fundamental rumble the resonator skirts would otherwise pass
    h *= dsp.highpass_response(f, max(55.0, 0.55 * f0), 2)
    return h


# --------------------------------------------------------------- one section


def _pitch_track(notes: list[ChoirNote], n: int, t0: float, cfg: ChoirConfig,
                 rng: np.random.Generator, offset: float) -> tuple[np.ndarray, np.ndarray]:
    """Continuous f0 (Hz) and per-note gate for one ensemble voice.

    The pitch track is CONTINUOUS across a legato phrase — with a raised-cosine
    portamento into each note — because a choir glides; retriggering an
    oscillator per note is one of the tells of a synth pad.
    """
    f0 = np.zeros(n)
    cur = hz(notes[0].midi)
    idx = 0
    prev_end = 0
    for k, nt in enumerate(notes):
        s = int((nt.t - t0 + offset) * SR)
        e = int((nt.t + nt.dur - t0 + offset) * SR)
        s, e = max(0, min(n, s)), max(0, min(n, e))
        if e <= s:
            continue
        target = hz(nt.midi)
        gl = int(cfg.portamento * SR) if (nt.legato and k > 0 and s - prev_end < int(0.12 * SR)) else int(0.012 * SR)
        gl = max(1, min(gl, e - s))
        ramp = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, gl))
        f0[s : s + gl] = cur + (target - cur) * ramp
        f0[s + gl : e] = target
        if idx < s:
            f0[idx:s] = cur if idx > 0 else target
        cur = target
        idx = e
        prev_end = e
    if idx < n:
        f0[idx:] = cur
    if f0[0] == 0:
        f0[f0 == 0] = cur
    return f0, np.zeros(0)


def sing_part(part: str, notes: list[ChoirNote], total: int, cfg: ChoirConfig,
              rng: np.random.Generator) -> np.ndarray:
    """Render one SATB section (an ensemble of independent voices) -> (2, total)."""
    if not notes:
        return np.zeros((2, total))
    notes = sorted(notes, key=lambda x: x.t)
    t0 = max(0.0, notes[0].t - 0.25)
    tend = max(nt.t + nt.dur for nt in notes) + cfg.release + 0.6
    n = int((tend - t0) * SR)
    if n <= 0:
        return np.zeros((2, total))

    nvoices = max(2, int(round(PART_VOICES[part] * cfg.voices_scale)))
    tract_base = PART_TRACT[part]
    out = np.zeros((2, n))
    t = np.arange(n) / SR

    for v in range(nvoices):
        # ---- this voice's permanent personality (seeded => reproducible)
        cents = rng.uniform(-cfg.detune_cents, cfg.detune_cents)
        vrate = cfg.vib_rate * rng.uniform(0.82, 1.18)
        vdepth = cfg.vib_depth * rng.uniform(0.65, 1.35)
        vphase = rng.uniform(0, TWO_PI)
        vonset = cfg.vib_onset * rng.uniform(0.7, 1.4)
        toff = rng.uniform(-cfg.timing_ms, cfg.timing_ms) * 1e-3
        tract = tract_base * rng.uniform(0.975, 1.025)
        fjit = rng.uniform(0.965, 1.035, 5)
        vgain = rng.uniform(0.78, 1.0)
        vpan = PART_PAN[part] + rng.uniform(-1, 1) * PART_SPREAD[part]

        f0, _ = _pitch_track(notes, n, t0, cfg, rng, toff)

        # slow intonation drift: two very slow randomised sinusoids, not noise,
        # so it wanders like a singer rather than flutters like a modulator
        d1, d2 = rng.uniform(0.07, 0.19), rng.uniform(0.21, 0.43)
        drift = (np.sin(TWO_PI * d1 * t + rng.uniform(0, TWO_PI))
                 + 0.6 * np.sin(TWO_PI * d2 * t + rng.uniform(0, TWO_PI)))
        drift_ratio = 2.0 ** (cfg.drift_cents * drift / 2400.0)

        # vibrato with delayed onset, re-armed at every entry
        onset = np.zeros(n)
        for nt in notes:
            s = int((nt.t - t0 + toff) * SR)
            e = int((nt.t + nt.dur - t0 + toff) * SR)
            s, e = max(0, min(n, s)), max(0, min(n, e))
            if e <= s:
                continue
            ramp = np.minimum(1.0, np.arange(e - s) / max(1.0, vonset * SR))
            onset[s:e] = np.maximum(onset[s:e], ramp)
        vib = 1.0 + vdepth * onset * np.sin(TWO_PI * vrate * t + vphase)

        f0v = f0 * (2.0 ** (cents / 1200.0)) * drift_ratio * vib
        ph = dsp.phase_of(f0v, n, phase0=rng.random())

        # ---- per-note synthesis (band limit + formants both track the note)
        mono = np.zeros(n)
        for nt in notes:
            s = int((nt.t - t0 + toff) * SR)
            e = int((nt.t + nt.dur - t0 + toff) * SR)
            pad_a = int(0.02 * SR)
            pad_b = int((cfg.release + 0.12) * SR)
            a = max(0, s - pad_a)
            b = min(n, e + pad_b)
            if b - a < 64:
                continue
            f0n = hz(nt.midi)
            eff = float(np.clip(cfg.effort * (0.55 + 0.75 * nt.dyn), 0.0, 1.0))
            tbl = glottal_table(f0n, eff, rng)
            src = dsp.wt_read(tbl, ph[a:b])

            # ASPIRATION into the source, so the tract shapes it like real breath
            if cfg.aspiration > 0:
                asp = rng.standard_normal(b - a)
                src = src + cfg.aspiration * (1.6 - 0.9 * nt.dyn) * asp

            f = np.fft.rfftfreq(b - a, 1.0 / SR)
            h = formant_response(f, nt.vowel, tract, f0n, fjit, eff)
            y = np.fft.irfft(np.fft.rfft(src) * h, b - a)

            env = np.zeros(b - a)
            atk = max(1, int(cfg.attack * rng.uniform(0.7, 1.35) * SR))
            rel = max(1, int(cfg.release * rng.uniform(0.8, 1.3) * SR))
            body = (e - a) - atk
            if body < 1:
                atk = max(1, (e - a) // 2)
                body = (e - a) - atk
            env[: atk] = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, atk))
            # a held choral note swells slightly rather than sitting flat
            sw = 1.0 + 0.10 * np.sin(np.linspace(0, np.pi, max(1, body)))
            env[atk : atk + body] = sw[: max(0, min(body, len(env) - atk))]
            r0 = atk + body
            rr = min(rel, len(env) - r0)
            if rr > 0:
                env[r0 : r0 + rr] = np.cos(np.linspace(0, np.pi / 2, rr)) ** 1.6
            env[r0 + rr :] = 0.0

            y *= env * nt.dyn

            # entry BREATH: a short bright noise transient just before the tone
            if cfg.breath > 0:
                bl = int(0.075 * SR)
                bs = max(0, s - int(0.02 * SR) - a)
                if bs + bl < len(y):
                    br = rng.standard_normal(bl)
                    br = dsp.bandpass(br, 2600.0 * tract, 2600.0)
                    br *= np.exp(-np.linspace(0, 5, bl)) * np.minimum(1, np.arange(bl) / 60)
                    y[bs : bs + bl] += br * cfg.breath * nt.dyn * rng.uniform(0.5, 1.3) * 0.35

            mono[a:b] += y

        mono *= vgain
        out += dsp.pan(mono, vpan)

    out *= PART_GAIN[part] / np.sqrt(nvoices)
    full = np.zeros((2, total))
    dsp.fit(full, out, int(t0 * SR))
    return full


# ------------------------------------------------------------------ the choir


@dataclass
class ChoirScore:
    parts: dict[str, list[ChoirNote]] = field(default_factory=dict)

    def add(self, part: str, n: ChoirNote) -> None:
        self.parts.setdefault(part, []).append(n)


def render_choir(score: ChoirScore, total: int, cfg: ChoirConfig | None = None,
                 ir: np.ndarray | None = None, wet: float = 0.55,
                 width: float = 0.45) -> np.ndarray:
    """Render an SATB score to (2, total). `ir` is the cathedral impulse."""
    cfg = cfg or ChoirConfig()
    rng = np.random.default_rng(cfg.seed)
    mix = np.zeros((2, total))
    for part in ("bass", "tenor", "alto", "soprano"):
        if score.parts.get(part):
            mix += sing_part(part, score.parts[part], total, cfg, rng)

    # section EQ: gently drop the 250-400 Hz box, lift the presence band so the
    # choir stays legible under a loud EDM mix without becoming shrill
    mix = np.stack([dsp.peak_eq(mix[0], 330.0, -2.5, 1.1),
                    dsp.peak_eq(mix[1], 330.0, -2.5, 1.1)])
    mix = np.stack([dsp.peak_eq(mix[0], 2900.0, 2.0, 0.8),
                    dsp.peak_eq(mix[1], 2900.0, 2.0, 0.8)])
    mix = dsp.widen(mix, width)
    if ir is not None:
        mix = dsp.reverb_send(mix, ir, wet)
    return mix


# --------------------------------------------------------- score construction


def pad_chords(chords: list[str], bar_times: list[tuple[float, float]],
               vowels: list[str] | None = None, dyn: float = 0.8,
               sopranos: list[int | None] | None = None,
               parts: tuple[str, ...] = ("soprano", "alto", "tenor", "bass"),
               ) -> ChoirScore:
    """Sustained SATB chords, one per bar — the 'sacred pad'."""
    from .music import voice_progression

    voiced = voice_progression(chords, sopranos)
    sc = ChoirScore()
    for i, (start, dur) in enumerate(bar_times):
        v = voiced[i % len(voiced)]
        vw = (vowels[i % len(vowels)] if vowels else "ah")
        for p in parts:
            sc.add(p, ChoirNote(start, dur, v[p], vw, dyn))
    return sc


def hook_choir(melody: list[tuple[float, float, float]], chords: list[str],
               bar_times: list[tuple[float, float]], vowel: str = "ah",
               dyn: float = 0.9, lower_parts: bool = True) -> ChoirScore:
    """SOPRANOS SING THE HOOK, the other three parts support it in real SATB.

    `melody` is (start_s, dur_s, midi). The lower parts get one chord per bar,
    voiced under whichever melody note is sounding on that downbeat.
    """
    from .music import voice_satb

    sc = ChoirScore()
    for (t, d, m) in melody:
        sc.add("soprano", ChoirNote(t, d, m, vowel, dyn))
    if not lower_parts:
        return sc
    prev = None
    for i, (start, dur) in enumerate(bar_times):
        sop = None
        for (t, d, m) in melody:
            if t <= start + 1e-6 < t + d:
                sop = int(m)
        v = voice_satb(chords[i % len(chords)], soprano=sop, prev=prev)
        prev = v
        for p in ("alto", "tenor", "bass"):
            sc.add(p, ChoirNote(start, dur, v[p], vowel, dyn * 0.88))
    return sc


def merge(*scores: ChoirScore) -> ChoirScore:
    out = ChoirScore()
    for s in scores:
        for p, ns in s.parts.items():
            out.parts.setdefault(p, []).extend(ns)
    return out
