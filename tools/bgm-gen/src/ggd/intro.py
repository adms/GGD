"""Signature INTROS — the per-scene 5-10 s heads that make each cue's opening
unmistakable (task #135).

The complaint this fixes: every non-drum-led scene used to open on the same
piano-ostinato + low "oo" swell + sub pulse, so the first seconds were near
interchangeable. Each function here is a NEW opening TIMBRE that no other scene
uses — a music box, a crowd roar, an iron gate, a blade, fire + a klaxon, a
mechanical hum, a school bell, a scoreboard tally, a fanfare, a funeral toll —
built entirely from numpy (no samples), deterministic through `ctx.sub_rng`.

HOW A SCENE USES THIS
    from ggd import intro
    s.custom("fx", intro.lobby)         # fn(ctx) writes straight onto buses

Each `scene(ctx)` writes onto whatever bus gives the right treatment (reverb,
sidechain, gain) and returns None. Placement is by SECONDS via `_beat` so the
same head lands at the same clock time whatever the tempo.

LOOP-SAFETY (the looping scenes). The renderer crossfades the 0.3 s AFTER the
body cut onto the file head, so a sharp transient sitting exactly at sample 0
would be half-swallowed on scene entry. The rule obeyed here: anything with a
hard attack is placed at t >= ~0.33 s (past the crossfade zone) and any bed that
does start at sample 0 is faded IN from zero and OUT before the body ends, so it
is ~0 at both the head and the tail and the join stays seamless without having
to be duplicated into the mirror bar. The non-looping stings (battleStart,
victory, defeat) have no crossfade and prepend their intro freely.
"""

from __future__ import annotations

import numpy as np

from . import dsp
from .dsp import SR, TWO_PI


# ------------------------------------------------------------------ placement


def _beat(ctx, sec: float) -> float:
    """Seconds -> quarter-note beats at the score's tempo."""
    return sec * ctx.bpm / 60.0


def _add(ctx, bus: str, x: np.ndarray, at_sec: float, gain: float, pan: float = 0.0):
    ctx.add(bus, x * gain, _beat(ctx, at_sec), pan)


def _norm(x: np.ndarray) -> np.ndarray:
    return x / (np.max(np.abs(x)) or 1.0)


def _fade(x: np.ndarray, rise: float, fall: float) -> np.ndarray:
    n = len(x)
    r = min(int(rise * SR), n // 2)
    f = min(int(fall * SR), n // 2)
    e = np.ones(n)
    if r:
        e[:r] = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, r))
    if f:
        e[-f:] = 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, f))
    return x * e


def _say(text: str, voice: str, rate: int, hp: float = 120.0,
         presence: float = 0.0) -> "np.ndarray | None":
    """Bake a macOS `say` line to peak-normalised mono through the score's TTS gate.

    Returns None whenever the gate is OFF — which is every probe and every
    pure-synth render — so the deterministic pipeline never spawns `say`;
    render.py --tts turns it on for the shipped pack. Unlike Score.say_line this
    accepts ANY installed voice, which is why the fireRing/room raps (a zh_TW
    taunt, an en_US preacher) are baked here rather than through the four-voice
    say_line whitelist. `hp` is kept low so a deep male keeps its body; `presence`
    lifts ~2.8 kHz so the line still cuts through the bed."""
    from . import score as score_mod
    m = score_mod._say_to_mono(voice, rate, text)
    if m is None:
        return None
    m = dsp.highpass(m, hp, 2)
    if presence:
        m = dsp.peak_eq(m, 2800.0, presence, 0.9)
    return _norm(m)


# -------------------------------------------------------------- raw primitives


def _struck(r, f0, dur, ratios, amps, decay, attack=0.002):
    """A struck metallic/bell/tine tone: inharmonic partials, high ones decaying
    fastest. `ratios` are the partial-to-f0 frequency ratios (not integers, so
    the tone reads as struck metal, not an organ)."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for ratio, amp in zip(ratios, amps):
        fk = f0 * ratio
        if fk > SR * 0.45:
            continue
        d = decay / (1.0 + 0.8 * (ratio - 1.0))
        out += amp * np.sin(TWO_PI * fk * t + r.uniform(0, TWO_PI)) * np.exp(-t / max(0.02, d))
    out = _norm(out)
    a_n = max(1, int(attack * SR))
    out[:a_n] *= np.linspace(0, 1, a_n)
    return out


def _musicbox_note(r, f0, dur=1.1):
    # a bright tine: strong fundamental + shimmering high partials, fast decay
    return _struck(r, f0, dur,
                   ratios=[1.0, 2.01, 3.03, 4.16, 5.43, 6.79, 8.1],
                   amps=[1.0, 0.45, 0.32, 0.42, 0.20, 0.16, 0.10],
                   decay=0.85, attack=0.0016)


def _bell_note(r, f0, dur, decay, bright=1.0):
    # tuned bell: hum, prime, tierce (minor 3rd), quint, nominal + upper
    amps = [0.42, 1.0, 0.55, 0.38, 0.62, 0.28 * bright, 0.20 * bright]
    return _struck(r, f0, dur,
                   ratios=[0.5, 1.0, 1.19, 1.5, 2.0, 2.66, 3.01],
                   amps=amps, decay=decay, attack=0.0015)


def _crackle(r, dur, lo=300.0, hi=2500.0, dens=150.0):
    """Fire: bandpassed pink noise + a shower of short random pops in-band."""
    n = int(dur * SR)
    base = dsp.bandpass(dsp.pink(n, r), (lo + hi) / 2, hi - lo) * 0.5
    npop = int(dens * dur)
    for _ in range(npop):
        i = int(r.integers(0, n))
        L = min(int(SR * r.uniform(0.002, 0.012)), n - i)
        if L <= 2:
            continue
        base[i:i + L] += (r.standard_normal(L) * np.exp(-np.linspace(0, 9, L))
                          * r.uniform(0.3, 1.0))
    return _norm(dsp.bandpass(base, (lo + hi) / 2, hi - lo))


def _hum(r, dur, f0=58.0):
    """Cold mechanical drone: a steady low sine + its octave + a faint detuned
    electrical whine, with a slow amplitude flutter."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = np.sin(TWO_PI * f0 * t)
    x += 0.45 * np.sin(TWO_PI * f0 * 2.0 * t + 0.6)
    whine = 0.05 * np.sin(TWO_PI * (f0 * 7.0 * (1 + 0.002 * np.sin(TWO_PI * 0.7 * t))) * t)
    flutter = 1.0 + 0.06 * dsp.lowpass(r.standard_normal(n), 9.0, 2)
    return _norm((x + whine) * flutter)


def _crowd(r, dur):
    """Stadium roar: pink noise shaped by a formant that sweeps up (ooo -> aah),
    with crowd roughness and a rising swell — a 'wooooo' filling up."""
    n = int(dur * SR)
    x = dsp.pink(n, r)
    lowc = dsp.bandpass(x, 480.0, 360.0)
    hic = dsp.bandpass(x, 1150.0, 760.0)
    blend = np.linspace(0, 1, n) ** 1.3
    out = lowc * (1 - blend) + hic * blend
    rough = 1.0 + 0.35 * dsp.lowpass(r.standard_normal(n), 13.0, 2)
    swell = np.linspace(0, 1, n) ** 2.0
    return _norm(out * rough * swell)


def _alarm(r, dur, fa, fb, rate=2.2):
    """Two-pitch hazard klaxon: a detuned reese oscillating between two pitches."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = np.where(np.sin(TWO_PI * rate * t) > 0, fa, fb)
    tbl = dsp.bl_saw_table(60, rng=r)
    a = dsp.wt_read(tbl, dsp.phase_of(f * 2 ** (-0.06 / 12), n, phase0=r.random()))
    b = dsp.wt_read(tbl, dsp.phase_of(f * 2 ** (0.06 / 12), n, phase0=r.random()))
    x = dsp.ola_lowpass(0.5 * (a + b), 1500.0, 2.4)
    return _norm(dsp.soft_clip(x, 1.6))


def _zing(r, dur=0.5):
    """A bright steel blade-ring: an inharmonic metallic ping with a fast upward
    pitch flick, plus a high bandpassed-noise transient."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    flick = 1.0 + 0.28 * np.clip(t / 0.028, 0, 1)   # rises then holds
    out = np.zeros(n)
    for ratio, amp, dec in [(1.0, 1.0, 0.28), (2.76, 0.6, 0.16), (5.4, 0.35, 0.09),
                            (8.2, 0.2, 0.05)]:
        f = 2350.0 * ratio * flick
        out += amp * np.sin(TWO_PI * np.cumsum(f) / SR + r.uniform(0, TWO_PI)) * np.exp(-t / dec)
    noise = dsp.bandpass(r.standard_normal(n), 6500.0, 4500.0) * np.exp(-t / 0.028)
    return _norm(out + 0.7 * noise)


def _creak(r, dur=1.6):
    """A heavy iron gate groan: a detuned reese gliding downward + a bandpassed
    noise scrape that grinds. The SLAM is a separate impact placed at the end."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 60.0 + 190.0 * np.exp(-t / (dur / 1.6))
    tbl = dsp.bl_saw_table(50, rng=r)
    a = dsp.wt_read(tbl, dsp.phase_of(f * 2 ** (-0.09 / 12), n, phase0=r.random()))
    b = dsp.wt_read(tbl, dsp.phase_of(f * 2 ** (0.09 / 12), n, phase0=r.random()))
    groan = dsp.ola_lowpass(0.5 * (a + b), 900.0, 2.6)
    groan = dsp.soft_clip(groan, 1.5)
    scrape = dsp.bandpass(r.standard_normal(n), 1300.0, 900.0)
    scrape *= (0.35 + 0.4 * np.abs(np.sin(TWO_PI * 7.0 * t))) * np.linspace(0.4, 1.0, n)
    x = 0.9 * groan + 0.5 * scrape
    return _norm(_fade(x, 0.05, 0.02))


def _fanfare(r, freqs, step=0.13, dur=0.22):
    """A rising brass-ish fanfare: short detuned-saw notes ascending."""
    from . import voices
    total = int((step * (len(freqs) - 1) + dur + 0.2) * SR)
    out = np.zeros(total)
    for i, f in enumerate(freqs):
        n = int(dur * SR) + int(0.18 * SR)
        e = dsp.adsr(n, 0.008, 0.05, 0.8, 0.14)
        x = voices.supersaw(n, f, r, voices=7, detune=0.16, cutoff=6500.0, res=1.2, env=e)
        x = dsp.peak_eq(x, 1400.0, 4.0, 1.0)   # brass presence
        at = int(i * step * SR)
        out[at:at + n] += x[: total - at] * (0.7 + 0.3 * i / max(1, len(freqs) - 1))
    return _norm(out)


def _sigh(r, dur=1.8, f_hi=520.0, f_lo=150.0):
    """A descending choral 'ahh' downlifter: a formant-shaped detuned cluster
    gliding DOWN in pitch, dark, no top end."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = f_lo + (f_hi - f_lo) * np.exp(-t / (dur / 2.5))
    out = np.zeros(n)
    for det in (-0.14, -0.05, 0.05, 0.14):
        ph = dsp.phase_of(f * 2 ** (det / 12) * 0.5, n, phase0=r.random())
        out += dsp.wt_read(dsp.bl_saw_table(40, rng=r), ph)
    # 'ah' formants F1~700 F2~1150, then roll the top off (filtered-dark)
    out = dsp.bandpass(out, 700.0, 500.0) + 0.7 * dsp.bandpass(out, 1150.0, 700.0)
    out = dsp.lowpass(out, 2000.0, 2)
    return _norm(_fade(out, 0.06, 0.4))


def _tick(r, dur=0.05, tone=3200.0):
    n = int(dur * SR)
    x = dsp.bandpass(r.standard_normal(n), tone, tone * 0.8)
    return _norm(x * np.exp(-np.linspace(0, 12, n)))


def _clank(r, dur=0.9):
    """One distant metal clank (a locker/door): a dry filtered-noise + a short
    inharmonic body, for the antechamber."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    body = (np.sin(TWO_PI * 320.0 * t) + 0.6 * np.sin(TWO_PI * 320.0 * 2.71 * t)
            + 0.4 * np.sin(TWO_PI * 320.0 * 5.1 * t)) * np.exp(-t / 0.22)
    hit = dsp.bandpass(r.standard_normal(min(n, int(0.02 * SR))), 2400.0, 1800.0)
    hit *= np.exp(-np.linspace(0, 10, len(hit)))
    x = body
    x[: len(hit)] += hit * 1.2
    return _norm(x)


def _dropchord(r, notes_low, dur=0.95, octaves=2.0, fall=0.58):
    """A harmony that PLUNGES: the chord `notes_low` (its LANDING pitches) played
    `octaves` higher and glided DOWN to them over `fall` s, then held low — the
    floor dropping out under you (tension). Detuned saws, dark-filtered so the
    high start reads as weight, not a piercing top. (combat intro, #135.)"""
    from .music import hz
    n = int(dur * SR)
    t = np.arange(n) / SR
    k = np.clip(t / fall, 0.0, 1.0) ** 0.7          # 0 at the top, 1 once landed
    mult = 2.0 ** (octaves * (1.0 - k))             # start 2**octaves up, glide to 1
    out = np.zeros(n)
    for m in notes_low:
        base = hz(m)
        for det in (-0.08, 0.08):
            f = base * mult * 2 ** (det / 12.0)
            out += dsp.wt_read(dsp.bl_saw_table(48, rng=r), dsp.phase_of(f, n, phase0=r.random()))
    out = dsp.lowpass(out, 2400.0, 2)               # tame the top — no harsh zing
    amp = 0.55 + 0.45 * k                           # loudest at the LOW landing = release
    return _norm(out * amp)


def _clap(r, dur=0.22):
    """A hand-clap — the 搭 of boom-boom-clap: two-three tight noise bursts inside
    ~18 ms + a short room tail, rolled off above ~5 kHz so it snaps without
    piercing."""
    n = int(dur * SR)
    out = np.zeros(n)
    for off in (0.0, 0.006, 0.013):
        L = int(0.02 * SR)
        i = int(off * SR)
        burst = dsp.bandpass(r.standard_normal(L), 1500.0, 1300.0) * np.exp(-np.linspace(0, 7, L))
        out[i:i + L] += burst * r.uniform(0.75, 1.0)
    tail = dsp.bandpass(r.standard_normal(n), 1800.0, 1500.0) * np.exp(-np.linspace(0, 16, n))
    out += 0.32 * tail
    return _norm(dsp.lowpass(out, 5200.0, 2))


def _siren(r, dur=2.7, f_lo=300.0, f_hi=560.0):
    """A distant WW2 air-raid siren: ONE slow rise-and-fall wail (a mechanical
    tone — fundamental plus a few harmonics — with a rotating-chopper tremolo),
    then heavily low-passed so it reads as far-off and weakened, not close and
    piercing. Ominous background, not a foreground alarm."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    wail = 0.5 - 0.5 * np.cos(TWO_PI * t / dur)          # 0 -> 1 -> 0 over the clip
    f = f_lo + (f_hi - f_lo) * wail
    out = np.zeros(n)
    for mult, amp in [(1.0, 1.0), (2.0, 0.5), (3.0, 0.28), (4.0, 0.14)]:
        out += amp * np.sin(TWO_PI * np.cumsum(f * mult) / SR + r.uniform(0, TWO_PI))
    out *= 0.72 + 0.28 * (0.5 + 0.5 * np.sin(TWO_PI * 7.0 * t))   # motor chopper
    out = dsp.lowpass(out, 640.0, 2)                     # far / filtered / weakened
    return _norm(out)


def _organ(r, freqs, dur, detune=0.05, tremulant=5.6):
    """A pipe-organ CHORD from stacked drawbar partials — there is no organ voice
    in the kit, so it is built here. Ranks at 16'/8'/4'/2 2/3'/2' plus two upper
    ranks, each doubled with a small +/- detune for the celeste shimmer, over a
    gentle tremulant amplitude vibrato (the church-organ hallmark); a short
    filtered 'chiff' stands in for the pipe/key attack. Returns peak-normalised
    mono, meant to be enveloped and drenched in the cathedral reverb by the
    caller."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    ranks = [(0.5, 0.55), (1.0, 1.0), (2.0, 0.55), (3.0, 0.30),
             (4.0, 0.24), (6.0, 0.16), (8.0, 0.12)]
    out = np.zeros(n)
    for f0 in freqs:
        for mult, amp in ranks:
            for det in (-detune, detune):
                f = f0 * mult * 2 ** (det / 12.0)
                if f > SR * 0.45:
                    continue
                out += amp * np.sin(TWO_PI * f * t + r.uniform(0, TWO_PI))
    out *= 1.0 + 0.06 * np.sin(TWO_PI * tremulant * t + r.uniform(0, TWO_PI))
    out = _norm(out)
    chiff = dsp.bandpass(r.standard_normal(min(n, int(0.03 * SR))), 2000.0, 1600.0)
    chiff *= np.exp(-np.linspace(0, 12, len(chiff)))
    out[: len(chiff)] += chiff * 0.12
    return _norm(out)


# ================================================================= the scenes


def lobby(ctx):
    """0-2.5 s: a warm MUSIC-BOX chime tracing the hook cell in the relative
    major (F4-A4-D5-A4), high, tolling, RISING, drenched in the hall; over a
    soft lit-room air bed and one distant 'oh' hum. The only music-box in the
    pack and the only intro that opens on F."""
    r = ctx.sub_rng("intro-lobby")
    from .music import hz, note
    # air bed: very low filtered-noise warmth, faded in from 0 (join-safe)
    air = dsp.lowpass(dsp.pink(int(2.6 * SR), r), 380.0, 2)
    _add(ctx, "pad", _fade(_norm(air), 0.25, 0.9), 0.0, gain=0.16)
    # a single distant 'oh' hum note (low F), soft
    humn = _norm(np.sin(TWO_PI * hz(note("F2")) * np.arange(int(2.4 * SR)) / SR)
                 + 0.4 * np.sin(TWO_PI * hz(note("C3")) * np.arange(int(2.4 * SR)) / SR))
    _add(ctx, "pad", _fade(humn, 0.3, 0.8), 0.05, gain=0.10)
    # the music box: F4 A4 D5 A4, rubato, first strike past the crossfade zone.
    # Loud enough that the bright tine, not the bed, is the first impression.
    for t, m in [(0.36, note("F4")), (0.92, note("A4")),
                 (1.52, note("D5")), (2.18, note("A4"))]:
        _add(ctx, "keys", _musicbox_note(r, hz(m)), t, gain=0.85, pan=-0.06)


def champSelect(ctx):
    """0-4 s: one continuous rising CROWD-ROAR swell topped by a supersaw riser
    inhale, breaking on a single deep taiko BOOM that launches the build. Pure
    crescendo, no downbeat until it breaks — the only intro with a crowd."""
    r = ctx.sub_rng("intro-champSelect")
    from . import voices
    roar = _crowd(r, 3.9)
    _add(ctx, "fx", roar, 0.0, gain=0.42)
    # supersaw riser inhale over the roar
    rise = voices.riser(int(3.6 * SR), r, f_lo=300.0, f_hi=6500.0, res=3.0)
    _add(ctx, "fx", rise, 0.2, gain=0.14)
    # the taiko boom that breaks the tension into bar 0's ostinato build
    boom = voices.taiko(int(1.2 * SR), r, f0=52.0, decay=1.1, pitch_drop=1.4)
    _add(ctx, "perc", boom, 3.55, gain=0.7)


def battleStart(ctx):
    """0-1.8 s: a heavy iron GATE — a metallic groan gliding downward + a scrape,
    grinding open, before the current riser. The SLAM is an impact at the end.
    (Placed in the prepended bar 0; the old piano+'oo' now starts at bar 1.)"""
    r = ctx.sub_rng("intro-battleStart")
    from . import voices
    creak = _creak(r, 1.65)
    _add(ctx, "fx", creak, 0.05, gain=0.5)
    # a low sub swell under the gate so it has weight
    sub = _fade(_norm(np.sin(TWO_PI * 41.0 * np.arange(int(1.7 * SR)) / SR)), 0.4, 0.1)
    _add(ctx, "fx", sub, 0.05, gain=0.22)
    # the portcullis SLAM at ~1.8 s, launching the taiko roll
    slam = voices.impact(int(0.9 * SR), r, f0=48.0, decay=1.0)
    _add(ctx, "fx", slam, 1.78, gain=0.5)


def combat(ctx):
    """0-1.7 s: a HARMONY that plunges high->low (a Dm chord dropping ~2 octaves
    into the sub — the floor dropping out, tension) UNDER a WE-WILL-ROCK-YOU
    "boom-boom-clap", twice, on a low MUFFLED kick (低調爆炸 — an understated
    explosion, no harsh top). Replaces the old bright steel zing, which read as
    too piercing on the ~7x/match replay; the drop + the stomp pattern land the
    combat identity instantly and drive into bar 0's downbeat. (#135, user rev.)"""
    r = ctx.sub_rng("intro-combat")
    from .music import hz, note
    from . import voices
    # A) harmony high -> low: Dm (D/F/A) plunging from 2 octaves up into the low
    #    register; starts at sample 0 so it is faded in for a seamless loop join.
    drop = _dropchord(r, [note("D3"), note("F3"), note("A3")], dur=0.95, octaves=2.0, fall=0.58)
    _add(ctx, "pad", _fade(drop, 0.04, 0.20), 0.0, gain=0.30)
    #    a sub landing note so the bottom of the drop has real weight
    landing = np.sin(TWO_PI * hz(note("D2")) * np.arange(int(0.75 * SR)) / SR)
    _add(ctx, "pad", _fade(_norm(landing), 0.45, 0.22), 0.50, gain=0.20)
    # B) We-Will-Rock-You boom-boom-clap x2 — a low, muffled "quiet explosion"
    #    kick (past the 0.33 s crossfade zone), the clap a beat off the stomps.
    def _boom():
        b = voices.impact(int(0.5 * SR), r, f0=47.0, decay=0.55)
        return dsp.lowpass(b, 200.0, 2)             # muffled body only — 低調爆炸
    beat = 60.0 / ctx.bpm
    eighth = beat / 2.0
    for cyclestart in (0.34, 0.34 + 2.0 * beat):    # two half-bar-spaced cycles
        _add(ctx, "perc", _boom(), cyclestart, gain=0.58)
        _add(ctx, "perc", _boom(), cyclestart + eighth, gain=0.58)
        _add(ctx, "fx", _clap(r), cyclestart + 2.0 * eighth, gain=0.34)


def fireRing(ctx):
    """0-~3.5 s: a distant WW2 air-raid SIREN wailing up and down, a short cocky
    Chinese TAUNT at the people running away (macOS `say`, baked only with
    --tts), an EXPLOSION — and only THEN the FIRE-CRACKLE bed with the low
    two-tone hazard KLAXON, its swell now TIGHT rather than a slow build. The
    alarm sounds, the taunt lands, the blast hits, the ring ignites. (#135
    follow-up; supersedes the crackle-first opening.)"""
    r = ctx.sub_rng("intro-fireRing")
    from .music import hz, note
    from . import voices
    # (a) distant, weakened air-raid siren — a slow rise-and-fall wail, far and
    #     filtered, faded in from sample 0 so the loop head stays seamless.
    siren = _fade(_siren(r, 2.7, f_lo=300.0, f_hi=560.0), 0.45, 0.7)
    _add(ctx, "fx", siren, 0.0, gain=0.13, pan=-0.15)
    # (b) 「還想跑～來不及囉！」 — a cocky taunt at the runaways (only with --tts).
    rap = _say("還想跑 來不及囉", "Rocko (中文（台灣）)", 190, hp=130.0, presence=3.5)
    if rap is not None:
        _add(ctx, "fx", rap, 0.5, gain=0.62, pan=0.05)
    # (c) the EXPLOSION — a hard transient, well past the 0.33 s crossfade zone.
    boom = voices.impact(int(1.0 * SR), r, f0=46.0, decay=1.1)
    _add(ctx, "fx", boom, 2.35, gain=0.5)
    # (d) THEN the fire: a crackle bed with a TIGHT swell (0.05 s rise, not the
    #     old 0.2 s slow build) and the low two-tone klaxon over it, into the PULL.
    crackle = _fade(_crackle(r, 1.35, lo=300.0, hi=2600.0, dens=175.0), 0.05, 0.35)
    _add(ctx, "fx", crackle, 2.5, gain=0.30)
    alarm = _alarm(r, 1.1, fa=hz(note("A3")), fb=hz(note("E3")), rate=2.6)
    _add(ctx, "fx", _fade(alarm, 0.06, 0.22), 2.62, gain=0.16)


def room(ctx):
    """0-~4.5 s: a CATHEDRAL breathing in. An organ/choir wash rises from silence
    with a distant church-BELL toll, and a black-priest SERMON is spoken over it
    (macOS `say`, baked only with --tts): "Brothers and sisters, only one walks
    out." Replaces the old cold fluorescent HUM entirely — the antechamber is now
    a chapel. Loop-safe: the wash is faded up from sample 0, the bell and sermon
    sit past the crossfade zone, and none of it is duplicated into the mirror
    bar. (room is fully rewritten to a church; see scores/room.py.)"""
    r = ctx.sub_rng("intro-room")
    from .music import hz, note
    # a low sacred WASH faded in from 0 — a sine cluster (organ/choir 'breath')
    # so t=0 reads as a cathedral at once, while the body choir enters with a
    # slow attack behind it. Rolled off dark; heavy pad-bus reverb carries it.
    n = int(3.4 * SR)
    wash = np.zeros(n)
    for m in (note("D2"), note("D3"), note("A3"), note("F4")):
        wash += np.sin(TWO_PI * hz(m) * np.arange(n) / SR + r.uniform(0, TWO_PI))
    wash = dsp.lowpass(_norm(wash), 1300.0, 2)
    _add(ctx, "pad", _fade(wash, 0.5, 1.3), 0.0, gain=0.18)
    # a distant low church bell, past the crossfade zone, tolling into the stone.
    bell = dsp.lowpass(_bell_note(r, hz(note("D3")), 3.2, decay=2.5, bright=0.6),
                       2600.0, 2)
    _add(ctx, "fx", bell, 0.5, gain=0.34, pan=0.2)
    # the black-priest sermon — kept dark (low high-pass) so the deep voice keeps
    # its body; a touch of presence so it carries. Silent (None) without --tts.
    rap = _say("Brothers and sisters, only one walks out.", "Reed", 160,
               hp=95.0, presence=2.5)
    if rap is not None:
        _add(ctx, "fx", rap, 0.95, gain=0.6, pan=-0.05)


def intermission(ctx):
    """0-2.6 s: a soft CITY-POP pickup — a warm Rhodes/electric-piano chord SWELL
    (a lush Dm9: D-F-A-C-E) rising out of faint vinyl-air, no hard attack, easing
    straight into the lazy shop groove. Replaces the old school-recess bell
    (task #124 direction), which the user rejected as jarring and un-blended; the
    慵懶 city-pop bed now simply breathes in. The only intro that opens on a soft
    sustained keys swell, and it is faded up from silence at sample 0 so the loop
    join stays seamless. (Supersedes the #124/#135 intermission intro.)"""
    r = ctx.sub_rng("intro-intermission")
    from .music import hz, note
    from . import voices
    # faint vinyl-air: a low filtered-noise warmth faded in from 0 (join-safe),
    # the "record hiss / room" a city-pop head sits on. No bright top.
    air = dsp.lowpass(dsp.pink(int(2.7 * SR), r), 340.0, 2)
    _add(ctx, "pad", _fade(_norm(air), 0.3, 0.9), 0.0, gain=0.11)
    # the warm EP chord swell: a lush Dm9 struck soft (low velocity) with a slow
    # amplitude swell over it, so the strike reads as a Rhodes bloom, not a hammer.
    n = int(2.6 * SR)
    e = dsp.swell(n, rise=0.55, fall=0.7)
    ep = np.zeros(n)
    for m in (note("D3"), note("F3"), note("A3"), note("C4"), note("E4")):
        ep += voices.piano(n, hz(m), r, vel=0.4, decay=2.6)
    _add(ctx, "keys", _norm(ep) * e, 0.05, gain=0.34, pan=-0.05)


def settlement(ctx):
    """0-3 s: a soft CELESTA shimmer descending to rest over a 'tally' motif — a
    run of very soft high ticks that ritardando and STOP, like a scoreboard
    settling — then the choir enters. The only intro with a counting motif; its
    chime DESCENDS and slows where lobby's rises."""
    r = ctx.sub_rng("intro-settlement")
    from .music import hz, note
    # celesta: a slow falling figure D5 -> A4 -> F4, bright pluck, heavy hall
    for t, m in [(0.35, note("D5")), (1.15, note("A4")), (2.1, note("F4"))]:
        _add(ctx, "keys", _struck(r, hz(m), 1.4,
                                  ratios=[1.0, 2.0, 3.01, 4.2, 5.4, 6.8],
                                  amps=[1.0, 0.55, 0.4, 0.32, 0.22, 0.15], decay=1.0),
             t, gain=0.5, pan=0.08)
    # the tally: soft high ticks with a ritardando (gaps grow) that stop at ~2.4s
    t = 0.4
    gap = 0.12
    while t < 2.45:
        _add(ctx, "fx", _tick(r, 0.045, tone=3600.0), t, gain=0.16, pan=-0.1)
        t += gap
        gap *= 1.16   # decelerate to rest


def victory(ctx):
    """0-1.8 s: a rising triadic FANFARE stinger — a brass ascent D-F-A-D with a
    shimmer and a crowd cheer, cresting on the impact that launches HOOK_A. The
    only ascending fanfare; the literal inverse of defeat. (Prepended bar 0.)"""
    r = ctx.sub_rng("intro-victory")
    from .music import hz, note
    # slower steps so the ascent crests near ~1.7 s, into the impact at bar 1
    fan = _fanfare(r, [hz(note("D4")), hz(note("F4")), hz(note("A4")), hz(note("D5"))],
                   step=0.5, dur=0.34)
    _add(ctx, "fx", fan, 0.12, gain=0.36)
    # a rising crowd cheer under it, swelling into the crest
    cheer = _crowd(r, 2.2)
    _add(ctx, "fx", _fade(cheer, 0.1, 0.3), 0.1, gain=0.18)


def defeat(ctx):
    """0-2.2 s: a descending SIGH — a filtered choral 'ahh' glissando falling in
    pitch — and one hollow low BELL TOLL (tuned very low, long dark decay),
    before the blow lands. The only intro that DESCENDS; victory's exact mirror.
    (Prepended bar 0.)"""
    r = ctx.sub_rng("intro-defeat")
    from .music import hz, note
    sigh = _sigh(r, 2.0, f_hi=520.0, f_lo=150.0)
    _add(ctx, "fx", sigh, 0.05, gain=0.30)
    # one funeral bell toll, tuned very low (D2), long dark decay
    toll = _bell_note(r, hz(note("D2")), 2.6, decay=2.2, bright=0.5)
    _add(ctx, "fx", dsp.lowpass(toll, 1600.0, 2), 0.2, gain=0.34, pan=-0.05)
