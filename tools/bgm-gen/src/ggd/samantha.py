"""samantha — the "Samantha James, fast" nu-jazz / deep-house STYLE HELPER.

A shared palette + building blocks for the ROTATING BGM VARIANTS (task #137).
Each of the twelve scenes gets a second, alternative arrangement that REIMAGINES
that scene's cue as a lounge / deep-house record in the manner of Samantha James
(nu-jazz, soulful deep house): a ~120 bpm four-on-the-floor groove, jazzy Rhodes
7th/9th chords, a smooth fingered/sub bass, brushed house drums + shaker/hats,
and a breathy female-vocal pad/hook (the pack's formant choir, soprano-led).

WHY THIS IS ITS OWN MODULE. All twelve variants share one groove and one palette
but reharmonise their OWN scene, so the common parts (the kit, the bass voicings,
the Rhodes comp, the vocal bed) live here and each `scores/<scene>.samantha.py`
only supplies its key, its reharmonised progression, and its section plan. No
engine edit: everything below is a thin, readable wrapper over the same `Score`
API (`ggd.score`) the originals use.

TEMPO / LOOP SAFETY. The pack's originals live on the 67.5/90/135/180 family so
they stay phase-compatible with each other; these variants are a SEPARATE
aesthetic and do not need to phase-align with the originals. They run at
`BPM = 120`, which is still sample-aligned at 44.1 kHz (44100*240/120 = 88200
samples per 4/4 bar, exact), so every looping variant is a whole number of bars
and `dsp.seamless_loop` joins it with no drift — exactly the loop-safety the
originals have. Pick a bar count and the loop is sample-exact.

  bar @120 bpm = 88200 samples = 2.000 s
  16 bars = 32.0 s      24 bars = 48.0 s      32 bars = 64.0 s

THE CHOIR GATE STILL APPLIES. `probe/track_check.py` requires the vocal (choir
bus) to carry >= 12 % of the 300-3500 Hz energy in at least one 2 s window and
<= 85 % across the whole track. The breathy female vocal IS that layer, so every
variant keeps at least one exposed vocal window (a breakdown, an intro, or the
hook out front) — which is also musically where a Samantha-James record puts the
voice.
"""

from __future__ import annotations

from ggd import music
from ggd.score import Score

# The one tempo for the whole variant set. 88200 samples/bar at 44.1 kHz.
BPM = 120.0

N = music.note


# ---------------------------------------------------------------- the Score

def new_score(id: str, *, key: str, prog: list[str], bars: int, seed: int,
              title: str = "", mood: str = "", loop: bool = True,
              pump_depth: float = 0.42) -> Score:
    """A Score pre-dressed for the deep-house palette.

    Intimate lounge room (short hall, not the pack's cathedral), a gentle house
    pump, warm-but-airy top, and a bus balance that puts the Rhodes / electric
    piano and the bass forward with the vocal sitting on top as a texture.
    """
    s = Score(
        id=id, title=title, mood=mood,
        bpm=BPM, bars=bars, key=key, seed=seed, loop=loop,
        pump_depth=pump_depth, pump_release=0.18,
        hall=2.4,                # a small warm room, not the anthem's stone hall
        tail_s=(5.0 if loop else 3.5),
        master_air=1.5,          # deep-house sheen on the top end
        master_headroom=0.80,
    )
    s.progression(prog)
    # Rhodes (keys) + bass forward; drums brushed/soft; the vocal (choir) present
    # but not dominant; a touch less lead than the originals (no supersaw wall).
    s.gain(keys=1.18, pad=1.02, bass=1.08, sub=1.02, drums=0.86, perc=0.80,
           choir=1.12, lead=0.60, strings=0.85)
    # warm, short sends: the Rhodes gets a little plate-ish room; the vocal keeps
    # some hall so it reads as breathy, the kit stays tight.
    s.verb(keys=0.24, pad=0.34, choir=0.52, strings=0.34, drums=0.05, perc=0.20)
    return s


# ------------------------------------------------------------------- drums

def house_drums(s: Score, bars: tuple[int, int], *, kick: bool = True,
                intensity: float = 1.0, shaker: bool = True,
                clap: bool = True) -> None:
    """Brushed four-on-the-floor: soft kick on every beat, a backbeat clap on
    2 & 4, the classic offbeat open hat, tight offbeat closed hats and an
    optional 16th shaker. `intensity` (0..1) scales the whole kit; drop `kick`
    for a breakdown.
    """
    g = max(0.0, intensity)
    if kick:
        s.drum("kick", "X...X...X...X...", bars, gain=0.90 * g,
               f_start=140.0, f_end=48.0, decay=0.34, click=0.28, drive=1.5)
    if clap:
        s.drum("clap", "....X.......X...", bars, gain=0.34 * g, humanize=0.004,
               decay=0.16, tone=1500.0)
        # a soft brushed ghost on the & of 4 for the shuffle
        s.drum("snare", "..............o.", bars, gain=0.06 * g, humanize=0.010)
    # the deep-house offbeat open hat (the "tss" between the kicks)
    s.drum("openhat", "..x...x...x...x.", bars, gain=0.085 * g, pan=-0.16,
           decay=0.05)
    # tight closed offbeat hats
    s.drum("hat", "..x...x...x...x.", bars, gain=0.055 * g, pan=0.16, decay=0.028)
    if shaker:
        # 16th shaker: very quiet, high, panned — the lounge sparkle
        s.drum("hat", "xxxxxxxxxxxxxxxx", bars, gain=0.028 * g, pan=0.22,
               decay=0.018, tone=10500.0)


def half_house(s: Score, bars: tuple[int, int], *, intensity: float = 1.0) -> None:
    """A softer half-time-feel groove for the chilled/ceremonial variants
    (settlement, defeat, the intro of a cue): kick on 1 & 3, brushed backbeat,
    offbeat hats, no shaker wall."""
    g = max(0.0, intensity)
    s.drum("kick", "X.......X.......", bars, gain=0.72 * g, f_end=46.0,
           decay=0.36, click=0.20)
    s.drum("clap", "....X.......X...", bars, gain=0.20 * g, humanize=0.006,
           decay=0.18, tone=1400.0)
    s.drum("hat", "..x...x...x...x.", bars, gain=0.05 * g, pan=0.16, decay=0.03)
    s.drum("openhat", "............x...", bars, gain=0.04 * g, pan=-0.18, decay=0.06)


# -------------------------------------------------------------------- bass

def house_bass(s: Score, bars: tuple[int, int], pattern: str = "..x...x...x...x.",
               *, gain: float = 0.66, cutoff: float = 620.0,
               octave: int = -2) -> None:
    """The smooth, round house bass: sub + a filtered reese through a low
    cutoff, on an offbeat house pattern by default (it answers the kick).
    `both` = the sub carries the weight, the reese carries the finger-funk."""
    s.bass(bars, pattern, octave=octave, style="both", gain=gain, cutoff=cutoff)


def deep_sub(s: Score, bars: tuple[int, int], pattern: str = "X.......X.......",
             *, gain: float = 0.6, octave: int = -2) -> None:
    """A pure sub root for weight under a breakdown or the downbeat."""
    s.bass(bars, pattern, octave=octave, style="sub", gain=gain)


# ------------------------------------------------------------------ Rhodes

# A lazy, syncopated electric-piano comp figure (16th grid). Lands off the
# downbeats so the pad/bass hold the "1" and the Rhodes answers — the city-pop /
# deep-house cushion. Reused across the set so the variants read as one player.
COMP = "..x..x...x..x..."
COMP_SPARSE = "..x......x......"


def rhodes(s: Score, bars: tuple[int, int], *, rhythm: str = COMP,
           gain: float = 0.32, spread: int = 4, octave: int = 0,
           hit_beats: float = 0.9) -> None:
    """Jazzy Rhodes/electric-piano 7th/9th comp. `spread=4` keeps the 7th/9th
    colour audible; the additive struck-piano voice reads as an EP through the
    warm keys bus + its plate send."""
    s.chords(bars, voice="piano", octave=octave, gain=gain, rhythm=rhythm,
             hit_beats=hit_beats, spread=spread)


def warm_pad(s: Score, bars: tuple[int, int], *, gain: float = 0.18,
             cutoff: float = 1650.0, octave: int = 0) -> None:
    """A soft held pad cushion under the Rhodes so the bed is alive on the '1'."""
    s.chords(bars, voice="pad", octave=octave, gain=gain, cutoff=cutoff)


# ------------------------------------------------------- the female vocal

def vocal_pad(s: Score, bars: tuple[int, int], *, vowel="oo", dyn: float = 0.5,
              voices_scale: float = 0.8, effort: float = 0.32, gain: float = 0.9,
              parts: tuple[str, ...] = ("soprano", "alto", "tenor"),
              per_bar: int = 1) -> None:
    """The breathy female-vocal pad — soprano-led SATB on the choir bus. Soft
    effort + "oo"/"oh"/"ah" is the airy Samantha-James texture. Keep at least
    one exposed call so the choir gate (>=12 % in a 2 s window) is met."""
    s.choir_pad(bars, vowel=vowel, dyn=dyn, voices_scale=voices_scale,
                effort=effort, parts=parts, gain=gain, per_bar=per_bar)


def vocal_hook(s: Score, bars: tuple[int, int], *, phrase: str = "A",
               vowel: str = "ah", dyn: float = 0.9, effort: float = 0.7,
               voices_scale: float = 1.0, gain: float = 1.05) -> None:
    """Sopranos sing the pack hook, A/T/B voiced under it — the recognisable
    moment that keeps a variant tied to the original cue. Dm-family scenes
    only (the hook is written in D minor); leave it out of the F-major nocturne."""
    s.choir_hook(bars, phrase=phrase, vowel=vowel, dyn=dyn, effort=effort,
                 voices_scale=voices_scale, gain=gain)


def vocal_stabs(s: Score, bars: tuple[int, int], pattern: str = "..x...x...x...x.",
                *, vowel: str = "ah", dyn: float = 0.7, gain: float = 0.6,
                parts: tuple[str, ...] = ("soprano", "alto"),
                length: float = 0.4) -> None:
    """Chopped soprano stabs on a grid — the deep-house "vocal chop" hook."""
    s.choir_chant(bars, pattern=pattern, vowel=vowel, dyn=dyn, gain=gain,
                  parts=parts, length=length)
