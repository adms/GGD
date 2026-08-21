"""scenefx — one signature SCENE sound per arena, synthesised from numpy.

owner 2026-08-22 (GH#531):

    「每一首都要有一個戰鬥場景明顯關鍵特徵的場景音效」

So every map track carries a diegetic sound that belongs to *that* arena and
nowhere else — the thing you would actually hear standing on it. It is a
musical layer, not a sample library: each recipe below is oscillators, noise
and filters, exactly like the rest of the pack, so the tool keeps its one hard
property — **nothing is sampled, nothing is downloaded, same seed ⇒ same bytes**.

WHERE THE CHOICES COME FROM. ⛔ Not from my impression of the source anime —
from the arena's own authored data (`content/maps/map.*.json`): its `gimmick`
gate ids, its `landmark` region, its `groundStyle` and its `backdrop.profile`.
`map.shiganshina` really does have `city_gate_n`/`city_gate_s` and a `plaza`;
`map.infinity-castle` really does have `biwa_hall` and sliding `west_door`/
`east_door` over `tatami`. The sound is a reading of the file, so it stays true
when someone re-authors the map.

HOW A TRACK USES IT. `aot.arc()` places the scene sound three times, and the
three placements are the same array at different gains — an identity, not a
decoration:

  1. bar 0        under the intro ostinato, half-lit — "you are here"
  2. the HOLLOW   alone in the silence, full gain — this is the section owner
                  asked for (「收束靜止低潮」) and the sound IS the low point
  3. the TURN     one hit, hard, as the lift begins

⚠️ Every recipe must be SHORTER than the section it lands in (≤ 4 bars @135 =
7.1 s) and must decay to silence on its own. A tail that runs past the loop
join is the one way this layer can break `track_check.py`'s seam test.
"""
from __future__ import annotations

import numpy as np

from . import dsp
from .audio import SR


# ------------------------------------------------------------------ helpers

def _bell(n: int, rng: np.random.Generator, f0: float, partials: tuple[float, ...],
          decay: float = 3.0, strike: float = 0.004) -> np.ndarray:
    """An inharmonic struck-metal body. The RATIOS are what make it a bell
    rather than a sine — a bronze bell's partials are famously not harmonic
    (the 'hum'/'prime'/'tierce'/'quint'/'nominal' series)."""
    t = np.arange(n) / SR
    y = np.zeros(n)
    for k, r in enumerate(partials):
        f = f0 * r
        if f > SR * 0.45:
            continue
        # higher partials die first — that is what "metal" sounds like
        d = decay / (1.0 + 0.55 * k)
        amp = 1.0 / (1.0 + 1.35 * k)
        beat = 1.0 + 0.0016 * rng.standard_normal()      # two-mode beating
        y += amp * np.exp(-t / d) * np.sin(2 * np.pi * f * beat * t + rng.uniform(0, 6.28))
    click = dsp.noise(n, rng) * dsp.perc_env(n, 0.0004, strike, shape=8.0)
    return y / (np.max(np.abs(y)) or 1.0) * 0.86 + dsp.highpass(click, 2600.0, 2) * 0.22


def _scrape(n: int, rng: np.random.Generator, fc: float, bw: float,
            rise: float = 0.30, fall: float = 0.55) -> np.ndarray:
    """Stone/iron dragging: band-passed pink noise under a slow swell, with a
    slight随 rumble underneath so it reads as MASS and not as hiss."""
    body = dsp.bandpass(dsp.pink(n, rng), fc, bw)
    rumble = dsp.lowpass(dsp.pink(n, rng), 90.0, 2)
    env = dsp.swell(n, rise=rise, fall=fall)
    return (body * 0.85 + rumble * 0.55) * env


def _sweep_tone(n: int, rng: np.random.Generator, f_a: float, f_b: float,
                shape: float = 1.0) -> np.ndarray:
    """A glissando sine — the cheapest way to say 'something opened'."""
    t = np.linspace(0.0, 1.0, n)
    f = f_a * (f_b / f_a) ** (t ** shape)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * dsp.swell(n, rise=0.22, fall=0.62)


def _ratchet(n: int, rng: np.random.Generator, hits: int, f_lo: float, f_hi: float,
             accel: float = 1.0) -> np.ndarray:
    """A winch/capstan: a train of clicks whose spacing tightens. Deterministic
    positions, so this is a rhythm, not noise."""
    y = np.zeros(n)
    pos = np.linspace(0.0, 1.0, hits) ** accel
    for i, p in enumerate(pos):
        at = int(p * (n - 1) * 0.94)
        f = f_lo + (f_hi - f_lo) * (i / max(1, hits - 1))
        m = min(n - at, int(0.10 * SR))
        if m <= 8:
            continue
        click = dsp.bandpass(dsp.noise(m, rng), f, f * 0.7) * dsp.perc_env(m, 0.0006, 0.035, shape=6.0)
        y[at:at + m] += click * (0.55 + 0.45 * (i / max(1, hits - 1)))
    return y


# ------------------------------------------------------------- the 13 scenes
# Each returns MONO float at SR, peak-normalised, decaying to silence.

def magic_door(n: int, rng: np.random.Generator) -> np.ndarray:
    """map.frieren — `magic_door_n/s` over `ruin_hall`, stone, snow-blue peaks.
    A rune circle lighting: a low tone opening upward with crystal bells over it."""
    y = _sweep_tone(n, rng, 74.0, 296.0, shape=0.7) * 0.62
    for k, (at, f) in enumerate(((0.30, 1318.5), (0.44, 1760.0), (0.60, 2093.0))):
        a = int(at * n)
        m = min(n - a, int(2.4 * SR))
        if m > 64:
            y[a:a + m] += _bell(m, rng, f, (1.0, 2.02, 3.01, 4.18), decay=1.5) * (0.42 - 0.08 * k)
    return dsp.highpass(y, 45.0, 2)


def arena_bell(n: int, rng: np.random.Generator) -> np.ndarray:
    """map.heavens-arena — landmark `ring`, wood floor, a sea of cloud.
    The bout bell. Two strikes: the call and its answer, high and clean."""
    y = np.zeros(n)
    for at, f, g in ((0.0, 587.33, 1.0), (0.42, 880.0, 0.58)):
        a = int(at * n)
        m = min(n - a, int(4.2 * SR))
        y[a:a + m] += _bell(m, rng, f, (1.0, 2.0, 2.4, 3.0, 4.5, 5.33), decay=3.4) * g
    return dsp.highpass(y, 120.0, 2)


def grail_hum(n: int, rng: np.random.Generator) -> np.ndarray:
    """map.holy-grail — landmark `grail`, stone, gold-rimmed towers, `mud_*` gates.
    A cavern that RINGS: a sustained bowl overtone, water dripping into it."""
    t = np.arange(n) / SR
    y = np.zeros(n)
    for r, g in ((1.0, 1.0), (2.0, 0.5), (2.97, 0.3), (4.06, 0.16), (5.43, 0.09)):
        y += g * np.sin(2 * np.pi * 146.83 * r * t + rng.uniform(0, 6.28))
    y *= dsp.swell(n, rise=0.30, fall=0.58)
    for p in (0.34, 0.52, 0.61, 0.78):                     # drips, fixed positions
        a = int(p * n)
        m = min(n - a, int(0.5 * SR))
        if m > 64:
            drop = _sweep_tone(m, rng, 2400.0, 900.0, shape=2.0) * dsp.perc_env(m, 0.001, 0.16, shape=5.0)
            y[a:a + m] += drop * 0.30
    return dsp.highpass(y, 60.0, 2) / (np.max(np.abs(y)) or 1.0)


def biwa_shoji(n: int, rng: np.random.Generator) -> np.ndarray:
    """map.infinity-castle — landmark `biwa_hall`, TATAMI, sliding `west/east_door`,
    torii silhouettes in lantern amber. A biwa's sawari buzz, then a shoji slides."""
    y = np.zeros(n)
    for i, (at, f) in enumerate(((0.00, 220.0), (0.14, 293.66), (0.26, 440.0))):
        a = int(at * n)
        m = min(n - a, int(1.9 * SR))
        if m <= 64:
            continue
        t = np.arange(m) / SR
        # sawari = the buzzing bridge: a saw-ish body waveshaped into a rattle
        body = np.zeros(m)
        for k in range(1, 13):
            body += (1.0 / k) * np.sin(2 * np.pi * f * k * t + rng.uniform(0, 6.28))
        body = dsp.waveshape(body * 1.4, drive=2.6) * np.exp(-t / (0.85 - 0.05 * i))
        y[a:a + m] += dsp.bandpass(body, 1500.0, 2600.0) * 0.5 + body * 0.5
    a = int(0.46 * n)                                       # the door
    m = min(n - a, int(1.5 * SR))
    if m > 64:
        y[a:a + m] += _scrape(m, rng, 1900.0, 1500.0, rise=0.16, fall=0.70) * 0.55
    return dsp.highpass(y, 70.0, 2) / (np.max(np.abs(y)) or 1.0)


def tomb_gate(n: int, rng: np.random.Generator) -> np.ndarray:
    """map.nazarick — landmark `throne`, OBSIDIAN, `guard_north/south`, necro-green
    rim over pagodas. A stone slab grinding open, and something under it exhales."""
    y = _scrape(n, rng, 320.0, 420.0, rise=0.34, fall=0.52) * 0.9
    t = np.arange(n) / SR
    breath = dsp.lowpass(dsp.pink(n, rng), 700.0, 2) * dsp.swell(n, rise=0.46, fall=0.44)
    growl = np.sin(2 * np.pi * 48.0 * t) * 0.5 + np.sin(2 * np.pi * 71.5 * t) * 0.3
    y += breath * 0.55 + growl * dsp.swell(n, rise=0.40, fall=0.50) * 0.45
    a = int(0.80 * n)                                       # the slab lands
    m = min(n - a, int(1.6 * SR))
    if m > 64:
        y[a:a + m] += dsp.lowpass(dsp.noise(m, rng), 140.0, 2) * dsp.perc_env(m, 0.002, 0.55, shape=3.0) * 1.1
    return dsp.highpass(y, 32.0, 2) / (np.max(np.abs(y)) or 1.0)


def city_gate(n: int, rng: np.random.Generator) -> np.ndarray:
    """map.shiganshina — `city_gate_n/s`, landmark `plaza`, dirt, brick towers.
    ⭐ The pack's most on-the-nose scene sound, and deliberately so: the capstan
    ratchet hauling the gate up, then the ZIP of a grapple line paying out —
    the one gesture the whole 進擊的巨人 register is built on."""
    y = _ratchet(n, rng, hits=14, f_lo=420.0, f_hi=1150.0, accel=0.78) * 0.85
    y += _scrape(n, rng, 260.0, 340.0, rise=0.30, fall=0.55) * 0.55
    a = int(0.56 * n)                                       # the grapple line
    m = min(n - a, int(1.1 * SR))
    if m > 64:
        zip_ = _sweep_tone(m, rng, 700.0, 4200.0, shape=1.5)
        zip_ = dsp.bandpass(zip_, 2200.0, 3200.0) + dsp.highpass(dsp.noise(m, rng), 3000.0, 2) * 0.35
        y[a:a + m] += zip_ * dsp.perc_env(m, 0.01, 0.42, shape=2.4) * 0.75
    a2 = int(0.86 * n)                                      # anchor bites
    m2 = min(n - a2, int(0.7 * SR))
    if m2 > 64:
        y[a2:a2 + m2] += dsp.bandpass(dsp.noise(m2, rng), 1800.0, 2400.0) * dsp.perc_env(m2, 0.001, 0.09, shape=7.0) * 0.8
    return dsp.highpass(y, 55.0, 2) / (np.max(np.abs(y)) or 1.0)


def warp_leaves(n: int, rng: np.random.Generator) -> np.ndarray:
    """map.world-tree — landmark `tree_core`, GRASS, `warp_west/east`, sakura canopy.
    A gate shimmering open, and a gust moving through the canopy behind it."""
    t = np.arange(n) / SR
    shimmer = np.zeros(n)
    for k, f in enumerate((659.25, 987.77, 1318.5, 1975.5)):
        trem = 1.0 + 0.35 * np.sin(2 * np.pi * (5.5 + 1.7 * k) * t + rng.uniform(0, 6.28))
        shimmer += np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)) * trem / (1.0 + k)
    shimmer *= dsp.swell(n, rise=0.26, fall=0.60)
    wind = dsp.bandpass(dsp.pink(n, rng), 1400.0, 1900.0)
    gust = dsp.swell(n, rise=0.44, fall=0.48) * (0.75 + 0.25 * np.sin(2 * np.pi * 0.7 * t))
    return dsp.highpass(shimmer * 0.5 + wind * gust * 0.85, 90.0, 2) / (np.max(np.abs(shimmer)) or 1.0)


def castle_portcullis(n: int, rng: np.random.Generator) -> np.ndarray:
    """arena.castle — 城堡競技場（室內）, stone. Chain over a drum, then iron lands."""
    y = _ratchet(n, rng, hits=11, f_lo=900.0, f_hi=2200.0, accel=1.25) * 0.8
    y += _scrape(n, rng, 440.0, 520.0, rise=0.28, fall=0.58) * 0.5
    a = int(0.78 * n)
    m = min(n - a, int(1.8 * SR))
    if m > 64:
        y[a:a + m] += _bell(m, rng, 98.0, (1.0, 1.94, 2.81, 3.92), decay=0.9) * 0.9
    return dsp.highpass(y, 45.0, 2) / (np.max(np.abs(y)) or 1.0)


def colosseum_crowd(n: int, rng: np.random.Generator) -> np.ndarray:
    """arena.colosseum — 羅馬大擂台（室外）, SAND. A crowd taking a breath and
    roaring. Formant-shaped noise, not white noise: a crowd is thousands of
    vocal tracts, so it has an 'ah' shape."""
    base = dsp.pink(n, rng)
    voice = np.zeros(n)
    for fc, bw, g in ((700.0, 260.0, 1.0), (1220.0, 380.0, 0.62), (2600.0, 900.0, 0.30)):
        voice += dsp.bandpass(base, fc, bw) * g
    t = np.arange(n) / SR
    surge = dsp.swell(n, rise=0.30, fall=0.55) * (0.82 + 0.18 * np.sin(2 * np.pi * 1.4 * t))
    stomp = np.zeros(n)
    for i in range(6):                                       # feet on stone
        a = int((0.18 + i * 0.115) * n)
        m = min(n - a, int(0.35 * SR))
        if m > 64:
            stomp[a:a + m] += dsp.lowpass(dsp.noise(m, rng), 170.0, 2) * dsp.perc_env(m, 0.002, 0.12, shape=4.0)
    return dsp.highpass(voice * surge + stomp * 0.6, 70.0, 2) / (np.max(np.abs(voice)) or 1.0)


def river_rune(n: int, rng: np.random.Generator) -> np.ndarray:
    """arena.dota — Dota 三路河道（迷你）, grass. The river, and a rune popping."""
    water = dsp.bandpass(dsp.pink(n, rng), 2600.0, 2800.0)
    t = np.arange(n) / SR
    water *= 0.7 + 0.3 * np.sin(2 * np.pi * 0.9 * t + 1.1)
    y = water * dsp.swell(n, rise=0.22, fall=0.64) * 0.8
    a = int(0.48 * n)
    m = min(n - a, int(1.6 * SR))
    if m > 64:
        y[a:a + m] += _bell(m, rng, 523.25, (1.0, 1.5, 2.0, 3.0), decay=1.2) * 0.75
        y[a:a + m] += _sweep_tone(m, rng, 300.0, 1500.0, shape=0.6) * 0.30
    return dsp.highpass(y, 100.0, 2) / (np.max(np.abs(y)) or 1.0)


def godie_siren(n: int, rng: np.random.Generator) -> np.ndarray:
    """arena.godie — 去死團的逆襲 EX 2.2s, dirt. The house arena: an air-raid
    two-tone over a crowd of boots. This map is the game's own name — it gets
    the alarm, not a landscape."""
    t = np.arange(n) / SR
    f = 420.0 + 210.0 * np.sin(2 * np.pi * 0.55 * t - np.pi / 2)
    ph = 2 * np.pi * np.cumsum(f) / SR
    horn = dsp.waveshape(np.sin(ph) + 0.35 * np.sin(2 * ph), drive=1.8)
    y = horn * dsp.swell(n, rise=0.20, fall=0.58) * 0.85
    boots = np.zeros(n)
    for i in range(8):
        a = int((0.10 + i * 0.10) * n)
        m = min(n - a, int(0.3 * SR))
        if m > 64:
            boots[a:a + m] += dsp.lowpass(dsp.noise(m, rng), 200.0, 2) * dsp.perc_env(m, 0.001, 0.10, shape=5.0)
    return dsp.highpass(y + boots * 0.55, 90.0, 2) / (np.max(np.abs(y)) or 1.0)


def training_chime(n: int, rng: np.random.Generator) -> np.ndarray:
    """arena.skeleton — 新手競技場, stone. The one arena that should NOT sound
    dangerous: a clean practice-hall chime and a soft wooden clack."""
    y = np.zeros(n)
    for at, f, g in ((0.00, 783.99, 1.0), (0.20, 1046.5, 0.7), (0.38, 1318.5, 0.5)):
        a = int(at * n)
        m = min(n - a, int(2.6 * SR))
        if m > 64:
            y[a:a + m] += _bell(m, rng, f, (1.0, 2.0, 3.01, 4.02), decay=1.8) * g
    a = int(0.62 * n)
    m = min(n - a, int(0.4 * SR))
    if m > 64:
        y[a:a + m] += dsp.bandpass(dsp.noise(m, rng), 1100.0, 900.0) * dsp.perc_env(m, 0.001, 0.05, shape=7.0) * 0.55
    return dsp.highpass(y, 150.0, 2) / (np.max(np.abs(y)) or 1.0)


def royale_horn(n: int, rng: np.random.Generator) -> np.ndarray:
    """arena.royale — 終局大混戰, the FINALE map (deliberately outside the
    rotation pool). A war horn stack: the only scene sound in the set that is
    an ANNOUNCEMENT rather than a place."""
    t = np.arange(n) / SR
    y = np.zeros(n)
    for f, g, d in ((73.42, 1.0, 0.0), (110.0, 0.8, 0.05), (146.83, 0.6, 0.10)):
        a = int(d * n)
        m = n - a
        tt = np.arange(m) / SR
        body = np.zeros(m)
        for k in range(1, 9):
            body += (1.0 / (k ** 1.2)) * np.sin(2 * np.pi * f * k * tt + rng.uniform(0, 6.28))
        y[a:a + m] += dsp.waveshape(body, drive=1.6) * dsp.swell(m, rise=0.14, fall=0.62) * g
    a = int(0.66 * n)
    m = min(n - a, int(2.2 * SR))
    if m > 64:
        y[a:a + m] += _bell(m, rng, 261.63, (1.0, 2.0, 2.4, 3.0, 4.5), decay=2.0) * 0.45
    return dsp.highpass(y, 40.0, 2) / (np.max(np.abs(y)) or 1.0)


SCENES = {
    "magic_door": magic_door,
    "arena_bell": arena_bell,
    "grail_hum": grail_hum,
    "biwa_shoji": biwa_shoji,
    "tomb_gate": tomb_gate,
    "city_gate": city_gate,
    "warp_leaves": warp_leaves,
    "castle_portcullis": castle_portcullis,
    "colosseum_crowd": colosseum_crowd,
    "river_rune": river_rune,
    "godie_siren": godie_siren,
    "training_chime": training_chime,
    "royale_horn": royale_horn,
}


def render(name: str, n: int, rng: np.random.Generator) -> np.ndarray:
    """The single entry point. Peak-normalised mono, decaying to silence."""
    if name not in SCENES:
        raise ValueError(f"unknown scene sound {name!r}; have {sorted(SCENES)}")
    y = SCENES[name](n, rng)
    y = np.nan_to_num(y, nan=0.0, posinf=0.0, neginf=0.0)
    # Hard fade over the last 8 % so nothing can ever run into the loop join.
    k = max(1, int(n * 0.08))
    y[-k:] *= np.linspace(1.0, 0.0, k) ** 1.5
    return y / (np.max(np.abs(y)) or 1.0)
