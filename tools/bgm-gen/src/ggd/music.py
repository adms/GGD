"""Musical identity of the GGD soundtrack — ONE key family, ONE BPM family,
ONE hook. Every track in the pack imports from here so the eleven files read as
a single release.

BPM FAMILY  67.5 / 90 / 135 / 180
  All four are 90 x {0.75, 1, 1.5, 2}, so they share a pulse: a bar at 67.5 is
  a dotted bar at 90, a bar at 135 is two-thirds of one. They were also chosen
  so that a 4/4 bar is a WHOLE NUMBER OF SAMPLES at 44.1 kHz
  (44100*240/90 = 117600, /135 = 78400, /67.5 = 156800, /180 = 39200), which
  is what lets a loop be sample-exact rather than drifting a few ms per pass.

LOOP GRID  1 881 600 samples = 42.667 s
  = 16 bars @90 = 24 bars @135 = 12 bars @67.5 = 48 bars @180. Every looping
  track in the pack is this long OR AN INTEGER MULTIPLE OF IT, at whatever
  tempo it runs. It is a GRID, not a fixed length: a 2x track (3 763 200
  samples = 32 bars @90 = 48 @135 = 24 @67.5) is still a whole number of bars
  in every tempo of the family, so the pack keeps one grid instead of one
  length and any two tracks stay phase-compatible. Today menu, combat and
  intermission run at 2x; every other loop runs at 1x.
  NOTHING IN THE CODE READS THIS — no renderer, no probe, no client path
  consults a loop length, and the client restarts every bed at sample 0 on
  scene entry. It is a compositional convention, so the only thing that can
  keep it true is this docstring and the score that obeys it.

KEY FAMILY  D natural minor (D E F G A Bb C), relative F major.
  Tracks may sit in D minor, F major, or D dorian (raised 6th, B natural) for
  the brighter combat cues, but the tonic pitch class never moves. That is what
  lets menu bleed into champSelect into combat without a key clash.
  DORIAN IS NOT ONLY FOR THE FAST CUES: intermission spends exactly one bar on
  G major (the dorian IV) at 90 bpm, as the turn of its middle section. Major IV
  over a minor tonic is the "clouds part" chord of JRPG/anime scoring; used once,
  in one bar, it widens the cue without moving the tonic. Used as a habit it
  would dissolve the minor identity of the pack, so keep it exceptional.

HARMONY  the epic-minor loops: i-VI-III-VII (Dm-Bb-F-C) is the pack's home
  cadence; i-VII-VI-VII and VI-VII-i are its variations.

HOOK  see HOOK_A / HOOK_B below. Soprano choir + lead synth double it in
  menu, victory and settlement; fragments of it (HOOK_CELL) are the stings.
"""

from __future__ import annotations

import numpy as np

# --------------------------------------------------------------- fundamentals

A4_HZ = 440.0
SR = 44100

BPM_SLOW = 67.5     # half-time, ceremonial (settlement, defeat)
BPM_BASE = 90.0     # the pack's home tempo (menu, lobby, room, intermission)
BPM_DRIVE = 135.0   # EDM drive (champSelect, combat, fireRing)
BPM_DOUBLE = 180.0  # double-time inserts

# The loop GRID unit, not a mandated length: a looping track is one of these or
# an integer multiple of one (see the docstring). Declared for documentation
# only — grep the repo: nothing reads either name, so changing a track's length
# is a change to that score's `bars=` and to the prose, never to these.
LOOP_SAMPLES = 1_881_600
LOOP_SECONDS = LOOP_SAMPLES / SR  # 42.666666...

# ONE GRID UNIT per tempo — the DEFAULT for a Score built without `bars=`.
# Every looping score in scores/ passes `bars=` explicitly, so a track that
# wants 2x (or any other multiple) changes its own call and leaves this alone.
BARS_FOR_BPM = {67.5: 12, 90.0: 16, 135.0: 24, 180.0: 48}


def bar_samples(bpm: float, beats: int = 4) -> int:
    n = SR * 60.0 * beats / bpm
    assert abs(n - round(n)) < 1e-6, f"bpm {bpm} is not sample-aligned"
    return int(round(n))


def hz(midi: float) -> float:
    return A4_HZ * 2.0 ** ((midi - 69.0) / 12.0)


NOTE_NAMES = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5,
              "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10,
              "Bb": 10, "B": 11}


def note(name: str) -> int:
    """'D4' -> 62, 'Bb3' -> 58."""
    i = 1
    if len(name) > 1 and name[1] in "#b":
        i = 2
    return NOTE_NAMES[name[:i]] + 12 * (int(name[i:]) + 1)


# ------------------------------------------------------------------- chords

TONIC = note("D4") % 12  # 2

CHORD_INTERVALS = {
    "": (0, 4, 7), "m": (0, 3, 7), "sus2": (0, 2, 7), "sus4": (0, 5, 7),
    "m7": (0, 3, 7, 10), "maj7": (0, 4, 7, 11), "7": (0, 4, 7, 10),
    "add9": (0, 4, 7, 14), "madd9": (0, 3, 7, 14), "5": (0, 7),
    "m6": (0, 3, 7, 9), "dim": (0, 3, 6),
}


def chord(symbol: str, octave: int = 3) -> list[int]:
    """'Dm' -> [50, 53, 57] in the given octave (octave 3 => root near D3)."""
    i = 1
    if len(symbol) > 1 and symbol[1] in "#b":
        i = 2
    root = NOTE_NAMES[symbol[:i]]
    quality = symbol[i:]
    ivs = CHORD_INTERVALS[quality]
    base = root + 12 * (octave + 1)
    return [base + v for v in ivs]


def chord_root(symbol: str) -> int:
    i = 1
    if len(symbol) > 1 and symbol[1] in "#b":
        i = 2
    return NOTE_NAMES[symbol[:i]]


# The pack's progressions, one symbol per bar.
PROG_HOME = ["Dm", "Bb", "F", "C"]            # i  VI III VII  — the anthem
PROG_DRIVE = ["Dm", "C", "Bb", "C"]           # i VII VI  VII  — restless
PROG_RISE = ["Bb", "C", "Dm", "Dm"]           # VI VII i       — the lift
PROG_DARK = ["Dm", "Dm", "Bb", "C"]           # brooding
PROG_RESOLVE = ["Bb", "F", "C", "Dm"]         # VI III VII i   — the landing

D_MINOR = [note("D4") + i for i in (0, 2, 3, 5, 7, 8, 10)]  # one octave of scale


def scale_degrees(root_midi: int = None) -> list[int]:
    r = note("D4") if root_midi is None else root_midi
    return [r + i for i in (0, 2, 3, 5, 7, 8, 10, 12)]


# ---------------------------------------------------------------------- HOOK
#
# Notated as (beat_offset, beats, midi). Beats are 4/4 quarter notes, so the
# whole of HOOK_A spans 16 beats = 4 bars. Everything is in D minor and the
# melody deliberately sits in the octave D5..A5 so a soprano section can sing
# it without strain and a supersaw can double it an octave down.
#
#   b1 (Dm)  A4  D5  F5---   the i triad, rising: the "call"
#   b2 (Bb)  E5  D5  C5---   step down
#   b3 (F)   D5  F5  A5---   the SAME shape a fourth higher: the "lift"
#   b4 (C)   G5  F5  E5---   descent, left open on the 9th so it cycles
#
HOOK_A: list[tuple[float, float, int]] = [
    (0.0, 1.0, note("A4")), (1.0, 1.0, note("D5")), (2.0, 2.0, note("F5")),
    (4.0, 1.0, note("E5")), (5.0, 1.0, note("D5")), (6.0, 2.0, note("C5")),
    (8.0, 1.0, note("D5")), (9.0, 1.0, note("F5")), (10.0, 2.0, note("A5")),
    (12.0, 1.0, note("G5")), (13.0, 1.0, note("F5")), (14.0, 2.0, note("E5")),
]

# The answering phrase: same opening, but bar 3 turns to Bb and bar 4 lands on
# the tonic instead of hanging on the 9th. Use A then B for an 8-bar statement.
HOOK_B: list[tuple[float, float, int]] = [
    (0.0, 1.0, note("A4")), (1.0, 1.0, note("D5")), (2.0, 2.0, note("F5")),
    (4.0, 1.0, note("E5")), (5.0, 1.0, note("D5")), (6.0, 2.0, note("C5")),
    (8.0, 1.0, note("Bb4")), (9.0, 1.0, note("D5")), (10.0, 2.0, note("F5")),
    (12.0, 1.0, note("E5")), (13.0, 1.0, note("D5")), (14.0, 2.0, note("D5")),
]

# The three-note identity fragment (rising i triad). Stings quote this.
HOOK_CELL: list[tuple[float, float, int]] = [
    (0.0, 0.5, note("A4")), (0.5, 0.5, note("D5")), (1.0, 2.0, note("F5")),
]

# Chord bed the hook is written against, one per bar.
HOOK_CHORDS_A = ["Dm", "Bb", "F", "C"]
HOOK_CHORDS_B = ["Dm", "Bb", "Bb", "C"]


def hook(phrase: str = "A", transpose: int = 0, octave: int = 0,
         stretch: float = 1.0) -> list[tuple[float, float, int]]:
    """Return the hook, optionally transposed / octave-shifted / time-scaled."""
    src = {"A": HOOK_A, "B": HOOK_B, "cell": HOOK_CELL}[phrase]
    sh = transpose + 12 * octave
    return [(t * stretch, d * stretch, m + sh) for (t, d, m) in src]


def hook_8bar(transpose: int = 0, octave: int = 0) -> list[tuple[float, float, int]]:
    a = hook("A", transpose, octave)
    b = [(t + 16.0, d, m) for (t, d, m) in hook("B", transpose, octave)]
    return a + b


# ------------------------------------------------------------ SATB VOICING
#
# Parallel octaves are what makes a "choir patch" sound like a synth pad, so
# the voicing here is real four-part writing: the bass takes root or fifth, the
# three upper voices share the chord tones with no gap wider than an octave
# between adjacent upper parts, and the soprano is free to carry the melody.

PART_RANGE = {  # comfortable, not extreme
    "soprano": (note("C4"), note("A5")),
    "alto": (note("F3"), note("D5")),
    "tenor": (note("C3"), note("A4")),
    "bass": (note("E2"), note("D4")),
}


def _nearest_in_range(pc: int, lo: int, hi: int, near: int | None = None) -> int:
    cands = [m for m in range(lo, hi + 1) if m % 12 == pc % 12]
    if not cands:
        return lo
    if near is None:
        return cands[len(cands) // 2]
    return min(cands, key=lambda m: abs(m - near))


def voice_satb(symbol: str, soprano: int | None = None,
               prev: dict[str, int] | None = None,
               open_voicing: bool = True) -> dict[str, int]:
    """Voice one chord for S/A/T/B.

    `soprano` pins the top voice (that is how the choir sings the hook);
    `prev` makes the inner voices move by the smallest interval available,
    which is the single biggest difference between choral writing and a
    stack of parallel triads.
    """
    tones = [t % 12 for t in chord(symbol, 3)]
    root = tones[0]
    fifth = tones[2 % len(tones)] if len(tones) > 2 else tones[-1]
    out: dict[str, int] = {}

    lo, hi = PART_RANGE["soprano"]
    if soprano is None:
        soprano = _nearest_in_range(tones[1 % len(tones)], lo, hi,
                                    prev.get("soprano") if prev else note("F5"))
    out["soprano"] = int(np.clip(soprano, lo, hi))

    # bass: root, dropped to where it sits under everything
    lo, hi = PART_RANGE["bass"]
    out["bass"] = _nearest_in_range(root, lo, hi, prev.get("bass") if prev else note("D3"))

    # remaining chord tones for alto + tenor, chosen by smallest motion
    top_pc = out["soprano"] % 12
    remaining = [t for t in tones if t != top_pc] or list(tones)
    if len(remaining) < 2:
        remaining = remaining + [fifth]
    lo_a, hi_a = PART_RANGE["alto"]
    lo_t, hi_t = PART_RANGE["tenor"]
    best = None
    for i, pa in enumerate(remaining):
        for j, pt in enumerate(remaining):
            if i == j and len(remaining) > 1:
                continue
            a = _nearest_in_range(pa, lo_a, min(hi_a, out["soprano"] - 2),
                                  prev.get("alto") if prev else note("A4"))
            t = _nearest_in_range(pt, lo_t, min(hi_t, a - 2),
                                  prev.get("tenor") if prev else note("D4"))
            if a <= t or out["soprano"] - a > 12 or a - t > 12:
                continue
            cost = 0.0
            if prev:
                cost += abs(a - prev.get("alto", a)) + abs(t - prev.get("tenor", t))
            if not open_voicing:
                cost += 0.25 * (out["soprano"] - t)
            # prefer the third to be present somewhere
            if len(tones) > 1 and tones[1] not in (a % 12, t % 12, top_pc):
                cost += 6.0
            if best is None or cost < best[0]:
                best = (cost, a, t)
    if best is None:
        out["alto"] = _nearest_in_range(remaining[0], lo_a, hi_a, out["soprano"] - 4)
        out["tenor"] = _nearest_in_range(remaining[-1], lo_t, hi_t, out["soprano"] - 10)
    else:
        _, out["alto"], out["tenor"] = best
    return out


def voice_progression(symbols: list[str], sopranos: list[int | None] | None = None,
                      ) -> list[dict[str, int]]:
    prev = None
    out = []
    for i, s in enumerate(symbols):
        sop = sopranos[i] if sopranos and i < len(sopranos) else None
        v = voice_satb(s, soprano=sop, prev=prev)
        out.append(v)
        prev = v
    return out


def melody_at(melody: list[tuple[float, float, int]], beat: float) -> int | None:
    """Which melody note is sounding at `beat` (used to pin the soprano)."""
    cur = None
    for (t, d, m) in melody:
        if t <= beat + 1e-6 < t + d:
            cur = m
    return cur
