"""Score → audio. The deterministic arrangement engine.

A score is a small Python module in `scores/` that exposes `build() -> Score`.
It only ever *describes* the track; nothing is rendered until `render(score)`.
Given the same score and seed the renderer emits the same samples, every time.

THE RHYTHM DSL
    Percussion and rhythmic parts are written as 16th-note GRID STRINGS, one
    character per 16th, any length (16 chars = one 4/4 bar, 32 = two bars):

        "X..x..x.X...x..."      X = accent   x = normal
                                o = ghost/soft   . = rest

    A pattern shorter than the range simply repeats. This is deliberately the
    same notation for every instrument so a track's groove can be read at a
    glance and edited without touching the engine.

BARS ARE THE UNIT
    Every placement argument is `bars=(start, end)` in bar numbers, end
    exclusive. The engine converts to samples with a tempo that is guaranteed
    sample-aligned (see music.py), so a 16-bar loop is exactly 1 881 600
    samples with no rounding drift.

LOOPING
    A looping score renders `bars` bars PLUS one extra bar whose events are
    bar 0's (the pattern index wraps), then hands the result to
    dsp.seamless_loop, which cuts the body and crossfades the 0.3 s that
    follows onto the head — exactly the join the existing BGM pack uses.

BUSES AND THE PUMP
    Layers land on named buses: choir, lead, pad, keys, strings, gtr, bass,
    sub, drums, perc, fx. `sidechain=` on the Score lists the buses that duck
    on every kick. The duck curve is built from the kick times the scheduler
    actually recorded — score-driven, so the pump is locked to the grid and is
    identical on every run.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Callable

import numpy as np

from . import choir as choir_mod
from . import dsp, music, voices
from .dsp import SR
from .music import bar_samples, hz, note

BUSES = ("choir", "lead", "pad", "keys", "strings", "gtr", "bass", "sub",
         "drums", "perc", "fx")

DEFAULT_SIDECHAIN = ("pad", "choir", "sub", "bass", "keys", "strings", "gtr")

# Per-bus gain that turns "every layer at gain=1.0" into a mix that is already
# roughly balanced, so a score's own `gain=` values read as musical intent
# rather than as unit conversion. Measured from the menu render; the choir sits
# deliberately at the top of the tonal stack because it is the point.
DEFAULT_BUS_GAIN = {
    "choir": 0.70, "lead": 2.00, "pad": 1.50, "keys": 1.25, "strings": 1.80,
    "gtr": 1.90, "bass": 1.70, "sub": 1.85, "drums": 1.90, "perc": 1.30,
    "fx": 1.10,
}

GRID_GAIN = {"X": 1.0, "x": 0.72, "o": 0.40, ".": 0.0, "-": 0.0}

CHORD_BUS = {"pad": "pad", "strings": "strings", "supersaw": "pad",
             "guitar": "gtr", "piano": "keys", "pluck": "keys"}
OSTINATO_BUS = {"piano": "keys", "pluck": "keys", "supersaw": "lead"}

# How long each percussion voice is allowed to ring, in seconds.
DRUM_LEN = {"kick": 0.55, "clap": 0.40, "snare": 0.40, "hat": 0.28,
            "openhat": 0.50, "taiko": 1.40, "timpani": 1.90, "cymbal": 2.20}


# ------------------------------------------------------------------- helpers


def grid_hits(pattern: str, bars: tuple[int, int], bar_beats: int = 4,
              subdiv: int = 4) -> list[tuple[float, float]]:
    """Expand a grid string over a bar range -> [(beat_from_bar0, gain)]."""
    steps_per_bar = bar_beats * subdiv
    out = []
    b0, b1 = bars
    n = len(pattern)
    if n == 0:
        return out
    # The pattern is one continuous cycle across the range, so a half-bar
    # pattern repeats twice a bar and a two-bar pattern alternates — both work
    # without the caller padding anything out to a bar boundary.
    for b in range(b0, b1):
        for i in range(steps_per_bar):
            g = GRID_GAIN.get(pattern[((b - b0) * steps_per_bar + i) % n], 0.0)
            if g > 0:
                out.append((b * bar_beats + i / subdiv, g))
    return out


# ------------------------------------------------------------------- layers


@dataclass
class Layer:
    bus: str
    fn: Callable[["RenderCtx"], None]
    name: str = ""


@dataclass
class RenderCtx:
    score: "Score"
    buses: dict[str, np.ndarray]
    rng: np.random.Generator
    n: int
    kicks: list[float] = field(default_factory=list)

    @property
    def bpm(self) -> float:
        return self.score.bpm

    def beat_s(self, beat: float) -> float:
        return beat * 60.0 / self.score.bpm

    def sample_at(self, beat: float) -> int:
        return int(round(beat * 60.0 / self.score.bpm * SR))

    def add(self, bus: str, x: np.ndarray, at_beat: float, pan: float = 0.0) -> None:
        y = dsp.pan(x, pan) if x.ndim == 1 else x
        dsp.fit(self.buses[bus], y, self.sample_at(at_beat))

    def sub_rng(self, tag: str) -> np.random.Generator:
        """A stable per-layer generator, so adding a layer cannot reshuffle
        the random personality of the layers already written.

        sha256, NOT the builtin hash(): Python salts string hashing per process
        (PYTHONHASHSEED), so `hash()` here would make every render different
        and quietly destroy the determinism this whole tool is built on.
        """
        key = f"{self.score.seed}|{tag}".encode()
        h = int.from_bytes(hashlib.sha256(key).digest()[:8], "big")
        return np.random.default_rng(h)


# -------------------------------------------------------------------- Score


class Score:
    def __init__(self, id: str, bpm: float = music.BPM_BASE, bars: int | None = None,
                 seed: int = 1, loop: bool = True, key: str = "Dm",
                 title: str = "", mood: str = "",
                 sidechain: tuple[str, ...] = DEFAULT_SIDECHAIN,
                 pump_depth: float = 0.55, pump_release: float = 0.20,
                 hall: float = 3.4, tail_s: float = 5.0,
                 master_air: float = 2.0, master_headroom: float = 0.80):
        self.id = id
        self.title = title
        self.mood = mood
        self.bpm = float(bpm)
        self.bars = int(bars if bars is not None else music.BARS_FOR_BPM[float(bpm)])
        self.seed = int(seed)
        self.loop = loop
        self.key = key
        self.sidechain = tuple(sidechain)
        self.pump_depth = pump_depth
        self.pump_release = pump_release
        self.hall = hall
        self.tail_s = tail_s
        self.layers: list[Layer] = []
        self.prog: list[str] = list(music.PROG_HOME)
        self.bus_gain: dict[str, float] = dict(DEFAULT_BUS_GAIN)
        self.bus_verb: dict[str, float] = {
            "choir": 0.62, "lead": 0.22, "pad": 0.34, "keys": 0.26,
            "strings": 0.40, "gtr": 0.14, "bass": 0.0, "sub": 0.0,
            "drums": 0.07, "perc": 0.26, "fx": 0.30,
        }
        self.master_drive: float = 1.0
        self.master_air: float = master_air
        self.master_headroom: float = master_headroom

    # ---- geometry
    @property
    def bar_len(self) -> int:
        return bar_samples(self.bpm)

    @property
    def body_samples(self) -> int:
        return self.bars * self.bar_len

    def chord_at(self, bar: int) -> str:
        return self.prog[bar % len(self.prog)]

    def progression(self, prog: list[str]) -> "Score":
        self.prog = list(prog)
        return self

    def gain(self, **kw: float) -> "Score":
        """MULTIPLIES the default bus gains — `gain(choir=1.2)` means 20 % more
        choir than the pack default, not an absolute level."""
        for k, v in kw.items():
            if k not in self.bus_gain:
                raise ValueError(f"unknown bus {k!r}")
            self.bus_gain[k] *= v
        return self

    def verb(self, **kw: float) -> "Score":
        self.bus_verb.update(kw)
        return self

    # ---- generic escape hatch
    def custom(self, bus: str, fn: Callable[[RenderCtx], None], name: str = "") -> "Score":
        self.layers.append(Layer(bus, fn, name or "custom"))
        return self

    # ------------------------------------------------------------- the choir

    def choir_pad(self, bars: tuple[int, int], vowel: str | list[str] = "ah",
                  dyn: float = 0.75, parts: tuple[str, ...] = ("soprano", "alto", "tenor", "bass"),
                  voices_scale: float = 1.0, gain: float = 1.0,
                  effort: float = 0.5, per_bar: int = 1, sustain: float = 0.96,
                  ) -> "Score":
        """Sustained SATB chords — the sacred bed. `per_bar` splits each bar."""
        def fn(ctx: RenderCtx) -> None:
            b0, b1 = bars
            beat = 4.0 / per_bar
            chords, times, vows = [], [], []
            for b in range(b0, b1):
                for k in range(per_bar):
                    chords.append(self.chord_at(b))
                    t = ctx.beat_s((b * 4) + k * beat)
                    times.append((t, ctx.beat_s(beat) * sustain))
                    vows.append(vowel[len(vows) % len(vowel)] if isinstance(vowel, list) else vowel)
            sc = choir_mod.pad_chords(chords, times, vows, dyn, parts=parts)
            cfg = choir_mod.ChoirConfig(seed=self.seed + 17, voices_scale=voices_scale,
                                        effort=effort)
            y = choir_mod.render_choir(sc, ctx.n, cfg, ir=None)
            ctx.buses["choir"] += y * gain
        self.layers.append(Layer("choir", fn, "choir_pad"))
        return self

    def choir_hook(self, bars: tuple[int, int], phrase: str = "A", vowel: str = "ah",
                   dyn: float = 0.92, octave: int = 0, gain: float = 1.0,
                   lower_parts: bool = True, effort: float = 0.75,
                   voices_scale: float = 1.0) -> "Score":
        """SOPRANOS SING THE HOOK; A/T/B support in real four-part voicing."""
        def fn(ctx: RenderCtx) -> None:
            b0, b1 = bars
            mel_beats = music.hook(phrase, octave=octave)
            mel, times, chords = [], [], []
            for rep in range((b1 - b0 + 3) // 4):
                base = (b0 + rep * 4) * 4
                for (t, d, m) in mel_beats:
                    if base + t >= b1 * 4:
                        continue
                    mel.append((ctx.beat_s(base + t), ctx.beat_s(d) * 0.94, m))
            for b in range(b0, b1):
                times.append((ctx.beat_s(b * 4), ctx.beat_s(4) * 0.96))
                chords.append(self.chord_at(b))
            sc = choir_mod.hook_choir(mel, chords, times, vowel, dyn, lower_parts)
            cfg = choir_mod.ChoirConfig(seed=self.seed + 29, effort=effort,
                                        voices_scale=voices_scale, attack=0.10)
            ctx.buses["choir"] += choir_mod.render_choir(sc, ctx.n, cfg, ir=None) * gain
        self.layers.append(Layer("choir", fn, "choir_hook"))
        return self

    def choir_chant(self, bars: tuple[int, int], pattern: str = "x...x...x...x...",
                    vowel: str = "ah", dyn: float = 0.9, gain: float = 1.0,
                    parts: tuple[str, ...] = ("tenor", "bass"), octave: int = 0,
                    length: float = 0.9) -> "Score":
        """Rhythmic monastic stabs — the low male chant that drives the drops."""
        def fn(ctx: RenderCtx) -> None:
            sc = choir_mod.ChoirScore()
            for (beat, g) in grid_hits(pattern, bars):
                bar = int(beat // 4)
                v = music.voice_satb(self.chord_at(bar))
                for p in parts:
                    sc.add(p, choir_mod.ChoirNote(
                        ctx.beat_s(beat), ctx.beat_s(length), v[p] + 12 * octave,
                        vowel, dyn * g))
            cfg = choir_mod.ChoirConfig(seed=self.seed + 41, attack=0.045,
                                        release=0.18, breath=0.24, effort=0.8,
                                        vib_onset=0.9)
            ctx.buses["choir"] += choir_mod.render_choir(sc, ctx.n, cfg, ir=None) * gain
        self.layers.append(Layer("choir", fn, "choir_chant"))
        return self

    # -------------------------------------------------------------- melodic

    def lead(self, bars: tuple[int, int], phrase: str = "A", octave: int = -1,
             voice: str = "supersaw", gain: float = 0.55, detune: float = 0.18,
             cutoff: float = 7000.0, legato: float = 0.96) -> "Score":
        def fn(ctx: RenderCtx) -> None:
            r = ctx.sub_rng("lead" + phrase + str(bars))
            b0, b1 = bars
            for rep in range((b1 - b0 + 3) // 4):
                base = (b0 + rep * 4) * 4
                for (t, d, m) in music.hook(phrase, octave=octave):
                    if base + t >= b1 * 4:
                        continue
                    n = ctx.sample_at(d * legato) + int(0.25 * SR)
                    e = dsp.adsr(n, 0.012, 0.06, 0.85, 0.22)
                    kw = ({"detune": detune, "cutoff": cutoff, "res": 1.1}
                          if voice == "supersaw" else {})
                    x = voices.make(voice, n, r, hz(m), env=e, **kw)
                    ctx.add("lead", x * gain, base + t)
        self.layers.append(Layer("lead", fn, "lead"))
        return self

    def melody(self, bars_offset: int, notes: list[tuple[float, float, int]],
               voice: str = "supersaw", bus: str = "lead", gain: float = 0.5,
               **kw) -> "Score":
        """Arbitrary melody: (beat, beats, midi) relative to `bars_offset`."""
        def fn(ctx: RenderCtx) -> None:
            r = ctx.sub_rng(f"mel{bars_offset}{bus}{len(notes)}")
            for (t, d, m) in notes:
                n = ctx.sample_at(d * 0.97) + int(0.3 * SR)
                e = dsp.adsr(n, kw.get("attack", 0.02), 0.07, 0.85, 0.25)
                vkw = {k: v for k, v in kw.items()
                       if k in ("detune", "cutoff", "vel", "bright", "drive", "res")}
                x = voices.make(voice, n, r, hz(m), env=e, **vkw)
                ctx.add(bus, x * gain, bars_offset * 4 + t, kw.get("pan", 0.0))
        self.layers.append(Layer(bus, fn, "melody"))
        return self

    def chords(self, bars: tuple[int, int], voice: str = "pad", octave: int = 0,
               gain: float = 0.4, rhythm: str | None = None, cutoff: float = 2600.0,
               spread: int = 3, length: float = 0.95, hit_beats: float = 1.0
               ) -> "Score":
        """Chordal bed. `rhythm=None` = one whole-bar chord; else a grid string,
        each hit lasting `hit_beats` beats."""
        def fn(ctx: RenderCtx) -> None:
            r = ctx.sub_rng(f"chords{voice}{bars}")
            hits = ([(b * 4, 1.0) for b in range(*bars)] if rhythm is None
                    else grid_hits(rhythm, bars))
            for i, (beat, g) in enumerate(hits):
                bar = int(beat // 4)
                sym = self.chord_at(bar)
                tones = music.chord(sym, 3 + octave)[:spread]
                dur = (4.0 if rhythm is None else hit_beats) * length
                n = ctx.sample_at(dur) + int(0.4 * SR)
                if voice == "pad":
                    x = voices.make("pad", n, r, freqs=[hz(t) for t in tones],
                                    cutoff=cutoff, env=dsp.swell(n, rise=0.5, fall=0.9))
                elif voice == "guitar":
                    e = dsp.adsr(n, 0.004, 0.08, 0.75, 0.2)
                    x = voices.make("guitar", n, r, hz(tones[0]), env=e)
                else:
                    e = dsp.adsr(n, 0.01, 0.1, 0.8, 0.3)
                    kw = {"cutoff": cutoff} if voice == "supersaw" else {}
                    x = sum(voices.make(voice, n, r, hz(t), env=e, **kw)
                            for t in tones) / len(tones)
                ctx.add(CHORD_BUS[voice], x * gain * g, beat)
        self.layers.append(Layer(CHORD_BUS[voice], fn, "chords"))
        return self

    def ostinato(self, bars: tuple[int, int], voice: str = "piano",
                 shape: tuple[int, ...] = (0, 2, 4, 2), subdiv: int = 8,
                 octave: int = 0, gain: float = 0.42, pan: float = 0.0) -> "Score":
        """THE Sawano figure: a repeating chord-tone cycle in even subdivisions.

        `shape` indexes the chord's tones (0 = root, 2 = fifth, 4 = the octave
        above the root, and so on, wrapping through octaves), which is why the
        same shape works over every chord in the progression.
        """
        def fn(ctx: RenderCtx) -> None:
            r = ctx.sub_rng(f"ost{voice}{bars}{shape}")
            step = 4.0 / subdiv
            for b in range(*bars):
                tones = music.chord(self.chord_at(b), 3 + octave)
                for i in range(subdiv):
                    deg = shape[i % len(shape)]
                    m = tones[deg % len(tones)] + 12 * (deg // len(tones))
                    n = int(step * 60.0 / self.bpm * SR) + int(0.5 * SR)
                    kw = {"piano": {"vel": 0.55 + 0.3 * (i % 2 == 0)},
                          "pluck": {"bright": 0.75}, "supersaw": {}}[voice]
                    env = dsp.adsr(n, 0.005, 0.09, 0.4, 0.15) if voice == "supersaw" else None
                    x = voices.make(voice, n, r, hz(m), env=env, **kw)
                    ctx.add(OSTINATO_BUS[voice], x * gain, b * 4 + i * step, pan)
        self.layers.append(Layer(OSTINATO_BUS[voice], fn, "ostinato"))
        return self

    def arp(self, bars: tuple[int, int], pattern: tuple[int, ...] = (0, 1, 2, 1),
            subdiv: int = 16, octave: int = 1, gain: float = 0.3,
            voice: str = "pluck", pan: float = 0.0) -> "Score":
        return self.ostinato(bars, voice=voice, shape=pattern, subdiv=subdiv,
                             octave=octave, gain=gain, pan=pan)

    # ----------------------------------------------------------------- bass

    def bass(self, bars: tuple[int, int], pattern: str = "x...x...x...x...",
             octave: int = -2, style: str = "sub", gain: float = 0.8,
             cutoff: float = 900.0, length: float = 0.9) -> "Score":
        def fn(ctx: RenderCtx) -> None:
            r = ctx.sub_rng(f"bass{style}{bars}{pattern}")
            hits = grid_hits(pattern, bars)
            for i, (beat, g) in enumerate(hits):
                bar = int(beat // 4)
                root = music.chord(self.chord_at(bar), 3 + octave)[0]
                nxt = hits[i + 1][0] if i + 1 < len(hits) else beat + 1.0
                dur = min(nxt - beat, 4.0) * length
                n = ctx.sample_at(dur) + int(0.25 * SR)
                e = dsp.adsr(n, 0.006, 0.08, 0.75, 0.12)
                if style == "sub":
                    x = voices.make("sub", n, r, hz(root), decay=max(0.25, dur * 0.5))
                    bus = "sub"
                elif style == "reese":
                    x = voices.make("reese", n, r, hz(root), cutoff=cutoff, env=e)
                    bus = "bass"
                elif style == "both":
                    x = (0.9 * voices.make("sub", n, r, hz(root), decay=max(0.25, dur * 0.5))
                         + 0.7 * voices.make("reese", n, r, hz(root), cutoff=cutoff, env=e))
                    bus = "bass"
                else:
                    raise ValueError(style)
                ctx.add(bus, x * gain * g, beat)
        self.layers.append(Layer("bass", fn, "bass"))
        return self

    # ---------------------------------------------------------------- drums

    def drum(self, inst: str, pattern: str, bars: tuple[int, int], gain: float = 0.9,
             pan: float = 0.0, humanize: float = 0.0, **kw) -> "Score":
        """One percussion instrument on a grid string. See module docstring."""
        def fn(ctx: RenderCtx) -> None:
            r = ctx.sub_rng(f"drum{inst}{bars}{pattern}")
            for (beat, g) in grid_hits(pattern, bars):
                jitter = r.uniform(-humanize, humanize) if humanize else 0.0
                if inst not in DRUM_LEN:
                    raise ValueError(f"unknown drum {inst!r}")
                n = int(DRUM_LEN[inst] * SR)
                x = voices.make(inst, n, r, **kw)
                if inst == "kick":
                    ctx.kicks.append(ctx.beat_s(beat) + jitter)
                bus = "perc" if inst in ("taiko", "timpani", "cymbal") else "drums"
                ctx.add(bus, x * gain * g, beat + jitter * self.bpm / 60.0, pan)
        self.layers.append(Layer("drums", fn, f"drum:{inst}"))
        return self

    def drumkit(self, bars: tuple[int, int], style: str = "halftime",
                gain: float = 1.0, hats: bool = True) -> "Score":
        """Preset grooves. They are just grid strings — copy and edit freely."""
        P = {
            "halftime": dict(kick="X.......x.......", snare="........X.......",
                             hat="x.x.x.x.x.x.x.x." if hats else "",
                             taiko="X...............", tgain=0.55),
            "four": dict(kick="X...X...X...X...", clap="....X.......X...",
                         hat="..x...x...x...x." if hats else "", openhat="..x...x...x...x.",
                         taiko="", tgain=0.0),
            "rock": dict(kick="X..x..X...x.X...", snare="....X.......X...",
                         hat="x.x.x.x.x.x.x.x." if hats else "", taiko="", tgain=0.0),
            "drive": dict(kick="X...X...X...X...", clap="....X.......X...",
                          hat="xoxoxoxoxoxoxoxo" if hats else "",
                          taiko="X.......X...X...", tgain=0.5),
            "march": dict(kick="X...x...X...x...", snare="..o.X.o...o.X.o.",
                          hat="", taiko="X.......X.......", tgain=0.7),
            "epic": dict(kick="X.......X.......", snare="", hat="",
                         taiko="X...X...X..xX.x.", tgain=0.95),
            "none": dict(),
        }[style]
        if P.get("kick"):
            self.drum("kick", P["kick"], bars, gain=0.95 * gain, humanize=0.0)
        if P.get("snare"):
            self.drum("snare", P["snare"], bars, gain=0.5 * gain, humanize=0.003)
        if P.get("clap"):
            self.drum("clap", P["clap"], bars, gain=0.42 * gain, humanize=0.002)
        if P.get("hat"):
            self.drum("hat", P["hat"], bars, gain=0.20 * gain, humanize=0.002, pan=0.15)
        if P.get("openhat"):
            self.drum("openhat", P["openhat"], bars, gain=0.10 * gain, pan=-0.2)
        if P.get("taiko") and P.get("tgain", 0) > 0:
            self.drum("taiko", P["taiko"], bars, gain=P["tgain"] * gain, humanize=0.006)
        return self

    # ------------------------------------------------------------------- fx

    def fx(self, kind: str, at_bar: float, length_bars: float = 1.0,
           gain: float = 0.5, pan: float = 0.0, **kw) -> "Score":
        def fn(ctx: RenderCtx) -> None:
            r = ctx.sub_rng(f"fx{kind}{at_bar}")
            n = max(64, ctx.sample_at(length_bars * 4))
            if kind not in ("riser", "impact", "downlifter", "reverse", "sweepdown"):
                raise ValueError(f"unknown fx {kind!r}")
            x = voices.make(kind, n, r, **kw)
            ctx.add("fx", x * gain, at_bar * 4, pan)
        self.layers.append(Layer("fx", fn, f"fx:{kind}"))
        return self


# ------------------------------------------------------------------ renderer


def render(score: Score, verbose: bool = False, stems: bool = False):
    """Render a Score to (2, N) float. N = body (+ loop crossfade tail).

    With `stems=True` returns (mix, {bus: audio}) — the per-bus audio AFTER
    sidechain, reverb and bus gain, i.e. exactly what was summed. That is the
    only honest way to check a claim like "the choir is audible": measure the
    bus against the sum of the others in the band the choir occupies.
    """
    bar = score.bar_len
    body = score.body_samples
    xfade = int(0.3 * SR)
    tail = int(score.tail_s * SR)
    n = body + bar + tail  # one extra bar of wrapped material + a decay tail

    buses = {b: np.zeros((2, n)) for b in BUSES}
    ctx = RenderCtx(score, buses, np.random.default_rng(score.seed), n)

    # The extra bar exists so the loop join has real music after the cut. It is
    # produced by asking every layer for bar `bars` as well; chord_at() and the
    # grid expander both wrap, so bar `bars` is musically bar 0.
    for layer in score.layers:
        layer.fn(ctx)
        if verbose:
            print(f"  layer {layer.name:16} bus={layer.bus}")

    # --- reverb: one cathedral for the sacred buses, one plate for the kit
    rng = np.random.default_rng(score.seed + 991)
    hall = dsp.make_ir(score.hall, rng, predelay=0.055, decay_hf=0.5, tone_hz=3800.0)
    plate = dsp.make_ir(1.15, np.random.default_rng(score.seed + 992),
                        predelay=0.012, decay_hf=0.75, tone_hz=6000.0, early=False)

    # --- sidechain
    pump = dsp.pump_envelope(n, sorted(set(ctx.kicks)), depth=score.pump_depth,
                             release=score.pump_release)

    mix = np.zeros((2, n))
    kept: dict[str, np.ndarray] = {}
    for b in BUSES:
        x = buses[b]
        if not np.any(x):
            continue
        g = score.bus_gain.get(b, 1.0)
        if b in score.sidechain:
            x = x * pump
        wet = score.bus_verb.get(b, 0.0)
        if wet > 0:
            ir = plate if b in ("drums", "perc") else hall
            x = dsp.reverb_send(x, ir, wet)
        x = x * g
        mix += x
        if stems:
            kept[b] = x

    # --- master chain
    #   The gain staging matters. The mix is scaled so its 99.9th-percentile
    #   sample sits at `score.master_headroom` (0.8 by default) before the
    #   limiter, so the limiter only shaves the genuine peaks above that
    #   instead of flattening the whole track — that is what keeps the
    #   peak-to-loudness ratio near 12 dB rather than the ~9 dB you get from
    #   pushing everything into a brickwall. Final loudness is set afterwards
    #   by two-pass LINEAR loudnorm, which is pure gain and changes no shape.
    mix = np.stack([dsp.highpass(mix[0], 26.0, 2), dsp.highpass(mix[1], 26.0, 2)])
    mix = dsp.compress(mix, thresh_db=-14.0, ratio=1.8, attack=0.015, release=0.18,
                       makeup_db=1.0)
    mix = np.stack([dsp.shelf(mix[0], 7000.0, score.master_air, True),
                    dsp.shelf(mix[1], 7000.0, score.master_air, True)])
    p999 = float(np.percentile(np.abs(mix), 99.9)) or 1.0
    scale = score.master_headroom / p999
    mix = mix * scale
    if score.master_drive != 1.0:
        mix = dsp.soft_clip(mix, score.master_drive)
    mix = dsp.limiter(mix, ceiling=0.95)

    def finish(x: np.ndarray) -> np.ndarray:
        if score.loop:
            return dsp.seamless_loop(x, body / SR, 0.3)
        end = body + int(0.9 * tail)
        out = x[:, :end].copy()
        fl = min(int(1.2 * SR), end // 3)
        out[:, -fl:] *= np.cos(np.linspace(0, np.pi / 2, fl)) ** 1.4
        return out

    out = finish(mix)
    if stems:
        return out, {b: finish(v * scale) for b, v in kept.items()}
    return out
