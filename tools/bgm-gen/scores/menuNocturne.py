"""menuNocturne — 「夕凪 / Evening Calm」 : the login screen's second theme.

THE BRIEF (2026-07-22): 「登入頁主題曲可以有第二首輪播 風格是 Secret Garden -
Nocturne 那樣寧靜緩慢 只有女聲偏高」— a second login theme in rotation, quiet and
slow, one high female voice only.

COPYRIGHT. Nocturne is a copyrighted composition and nothing of it is here: no
transcription was consulted, no phrase is quoted, approximated or reconstructed.
What is reproduced is the IDIOM, which is a set of techniques and not a work —
an unhurried compound metre, plain diatonic harmony that cadences, a sparse
arpeggiated harp, strings held far back, an enormous room, and a wordless high
soprano singing a simple line with real silence between the phrases. In this
idiom THE SPACE IS THE STYLE, so the hardest constraint here is subtraction: the
sung line is silent for 47.9 % of the loop, its longest single rest is 9.8 s, and
the whole track sits more than 20 dB below its own peak envelope for 9.1 % of its
length. menu does that for 0.0 % — it never once drops that far.

IT IS THE OPPOSITE OF WHAT IT ALTERNATES WITH. menu is 進撃の巨人-flavoured: taiko,
supersaw, four-on-the-floor, a full SATB section. This track keeps NONE of that
scaffolding — no kick, no sub, no bass, no drum of any kind, no supersaw, no fx,
no cymbal (standing rule), no male voice anywhere (「只有女聲」), no sidechain
(there is nothing to duck against), master air pulled from 2.0 to 0.5. A serene
track that kept the epic frame would just be a quiet epic track.

THE VOICE — a SMALL UNISON GROUP OF 3, not a section and not one oscillator.
The engine's own knobs reach this; nothing in ggd/ was changed for it (probe
evidence, task #88 phase 1):
  * the engine has no aperiodic f0 jitter — f0 is a product of smooth terms, so
    ONE voice with aspiration off measures HNR 173 dB and spectral flatness
    1.4e-17, i.e. a numerically pure tone. That is the theremin, measured.
  * aspiration buries it under a real breath floor. It is summed into the
    GLOTTAL SOURCE before the formant bank, so the tract shapes it like breath
    instead of laying hiss over the top. Re-swept on THIS melody rather than
    inherited: 0.95 puts the median HNR at 23.7 dB, inside the 10-25 dB a sung
    human vowel occupies (see SOLO below for the whole sweep).
  * 3 voices at +-6 cents add 1-12 Hz beating a single voice physically cannot
    produce (2.84 % -> 3.92 % AM depth). Beating SATURATES there: 6 and 12
    voices measure 3.92 % and 3.98 %, i.e. identical. So three buys the whole
    anti-theremin benefit of a section while still reading as one singer — a
    +-6 c / +-14 ms unison double is standard lead-vocal production.
  * voices_scale 0.25 gives round(12 * 0.25) = 3, above the engine's max(2, ...)
    floor, so NO engine edit is needed. A true 1-voice solo would need that
    floor lowered and an aperiodic-jitter term added; 3 needs neither.
  * PART_PAN['soprano'] is -0.42 with a 0.48 spread, so a 1-3 voice render lands
    6-15 dB LEFT and no seed centres it. render_choir(width=0.0) then L+R
    recovers 2*mid exactly (dsp.pan/dsp.widen are both linear), so the layer
    sums and re-pans. Measured balance on this track's choir stem: +0.09 dB.
  * C6 IS THE CEILING. At C6 the harmonics are so far apart that the envelope
    resolves only two formant peaks (F5 and A5 resolve three); above it the
    voice stops having a vocal identity. 偏高 invites more; the measurement says
    no. C6 is used exactly once, at the arrival.

METRE. 12/8 at 67.5 bpm: a 4/4 "beat" in the engine is 0.889 s, which IS the
dotted-quarter pulse, so subdiv=4 gives one harp note per pulse and the unit
below (bar/12) is the compound eighth. 67.5 is sample-aligned, so 24 bars is
exactly 3 763 200 samples.

LENGTH — 24 bars = 3 763 200 samples = 85.333 s = 2 x the 1 881 600-sample LOOP
GRID (music.py). Checked against the pack rather than assumed: task #87 landed
while this was being written and moved menu to 32 @90, combat to 48 @135 and
intermission to 32 @90 — all 3 763 200 samples — and rewrote the invariant in
music.py from "one fixed length" to "a GRID unit; a looping track is one of
these or a whole multiple". 24 @67.5 is the 67.5 bpm spelling of the same 2x
cell, so this conforms rather than claims an exemption.
It is also what the music needs. This piece is made of silence: at 42.7 s with
the rests the idiom requires there is room for five phrases and nothing left
over to withhold, and a piece with nothing withheld has no arc.
And it makes THE ROTATION ARITHMETIC EXACT: the login rotation switches every
85.333 s, which is now exactly ONE loop of menu and ONE loop of this, so the
crossfade always lands on a loop boundary of whichever track is playing.
NOT a reason: length as a substitute for material. No bar below repeats
another; see the form.

REPRISE RULE (music.py / README §1) — DELIBERATE DECISION: this track does NOT
state or trace the hook, and alludes only through harmony. Argued both ways:
  FOR quoting it — "the same melody, disarmed" is a beautiful idea and lobby
  already proves an allusion can be carried by contour alone.
  AGAINST, decisive — lobby's allusion works because lobby and menu are twenty
  minutes apart in a session. These two alternate on THE SAME SCREEN 85 s
  apart. At that distance a contour allusion stops being an allusion and
  becomes a quotation, and the entire content of the brief is that the second
  track is not the first one quieter.
  What ties it to the pack instead: bars 4-7 are literally music.PROG_HOME
  (Dm Bb F C), stated ONCE and never again, heard as a passing colour inside an
  F-major piece rather than as the engine of the track. Same four chords, same
  tonic pitch class, opposite function. Everything else is F major — the pack's
  relative major — so it cannot clash with the D-minor theme it alternates with.

FORM (24 bars = 85.333 s, seamless; the sung line is in bars 2-23)
    0-1    the room        harp alone. 7 s before anything else exists.
    2-3    entrance        first phrase, F5-A5, ends on a suspension that only
                           resolves when the harmony moves to Dm.
    4-7    PROG_HOME       the pack's cadence, once. Strings enter at bar 4.
    8-11   the answer      the first half peaks on Bb5 (bar 10).
    12-15  the widening    Gm arrives at bar 14 — a chord absent from the first
                           twelve bars. The voice states it (G5-Bb5-A5).
    16-19  THE ARRIVAL     a LOW harp enters at bar 16, the only new voice in
                           the piece: the texture grows roots exactly as the
                           singer reaches her ceiling. C6 lands at bar 18 as an
                           11th over Gm and resolves under the held note into
                           the root of C at bar 19 — 4.3 s, the one high note.
    20-23  the dissolve    everything withdraws. A-G-F falls to the tonic over
                           a plagal Bb-F, and the last note ends 1.8 s before
                           the loop point so the hall (RT60 4.67 s) is 23 dB
                           down at the join instead of 11.
    24     mirrors bar 0 (harp only) so the join crossfades music onto music.

THE LOOP POINT IS THE QUIETEST BAR, not a turnaround: bar 23 is F, bar 0 is F,
and the voice is silent for 9.8 s across the seam — the longest rest in the
piece deliberately spans the join, so nothing sung is ever spliced there.
Measured join step x1.2 of the track's own 99.9th-percentile step (gate x3.0).

WHERE THE QUIETNESS COMES FROM: not here. render.py normalises every track to
-16 LUFS, so this arrives at exactly menu's loudness. The BGM gain in
content/config/audio-map.json is 0.55 against menu's 0.90 — that is the level
decision, and it belongs there because it is a mix decision, not a master one.
The spectral collision with UI/typing SFX is genuinely low (the voice
concentrates at 700-2000 Hz, clicks live at 2-6 kHz) but only while effort
stays at 0.42; raising it walks the singer's formant into the click band.
"""

from __future__ import annotations

import numpy as np

from ggd import choir as choir_mod
from ggd import music
from ggd.music import note as n_
from ggd.score import RenderCtx, Score

# --------------------------------------------------------------- the singer
#
# Deltas from ChoirConfig's defaults ARE the whole recipe; every one of them was
# measured (task #88 phase 1). Defaults in the comments.
SOLO = dict(
    voices_scale=0.25,   # 1.0 -> 12 voices. 0.25 -> round(12*0.25) = 3.
    detune_cents=6.0,    # 11.0 — a tight unison double, not a section
    timing_ms=14.0,      # 32.0 — tight entries read as one singer
    vib_rate=5.4,        # 5.2 — human sung vibrato is 5-7 Hz
    vib_depth=0.018,     # 0.011 -> 74 cents p-p (human 30-100; default gives 43)
    vib_onset=0.80,      # 0.55 — the BLOOM. Measured 33.7 c at 0.05 s, 71.9 at
                         #   0.60 s, 74.8 at 3.0 s. A theremin is at full depth
                         #   from sample zero; this is the single most audible
                         #   "someone is singing this" cue.
    drift_cents=12.0,    # 7.0 — slow intonation wander
    aspiration=0.95,     # 0.030 <- THE ONE THAT MATTERS: it is what stops the
                         #   voice being a numerically pure tone. Phase 1
                         #   recommended 0.55 from a single sustained A5, which
                         #   measured HNR 26.1 dB. Re-swept on THIS melody (14
                         #   sustained notes, F5-C6) 0.55 gives a MEDIAN of
                         #   28.4 dB — 3.4 dB outside the 10-25 dB a sung human
                         #   vowel occupies, i.e. still audibly too clean up
                         #   here. The sweep on this line: 0.30 -> 33.7,
                         #   0.55 -> 28.4, 0.80 -> 25.2, 0.95 -> 23.9,
                         #   1.10 -> 22.5, 1.50 -> 19.8. 0.95 lands the median
                         #   inside the band with the range still overlapping
                         #   it, and level is unaffected (the part is
                         #   self-normalising: RMS moves 0.07 dB across the
                         #   whole sweep).
    breath=0.90,         # 0.16 (= 16 dB down = inaudible). 0.90 lands the entry
                         #   breath at about -13 dB: present, not panting.
    effort=0.42,         # 0.55 — soft and dark, and it keeps the singer's
                         #   formant out of the UI-click band
    attack=0.22,         # 0.14
    release=0.60,        # 0.30
    portamento=0.10,     # 0.055 -> a 63 ms glide inside a phrase. Across a rest
                         #   the engine disables it by itself (gap >= 0.12 s),
                         #   which is right: a singer does not scoop over a breath.
)

# BREATH IS PER-NOTE, NOT PER-PHRASE — the engine has no concept of a phrase, so
# at breath=0.90 every note gets an entry breath. The mitigation is
# compositional and it is a hard rule for this melody: NO LEGATO RUN IS LONGER
# THAN THREE NOTES. Longer and it pants.
U = 12                   # compound-eighth units per bar (12/8)

# (start_unit, length_units, midi, dyn). dyn drives level AND vocal effort, so
# it is also the dynamic shape of the piece: 0.44 at the dissolve, 0.60 at the
# arrival. Range F5-C6 centred on A5, never above C6.
MELODY: list[tuple[int, int, int, float]] = [
    # -- bars 2-3  the entrance. F5 hangs as a 4th over C and is resolved by the
    #    harmony moving to Dm underneath it, not by the voice moving.
    (27,  6, n_("A5"),  0.50),
    (36,  3, n_("G5"),  0.50), (39, 3, n_("A5"), 0.50), (42, 9, n_("F5"), 0.48),
    # -- bars 6-7  the answer, over the pack's own cadence. Ends on the 9th of F.
    (75,  6, n_("A5"),  0.50),
    (84,  3, n_("G5"),  0.50), (87, 3, n_("A5"), 0.50), (90, 9, n_("G5"), 0.48),
    # -- bars 9-11  the first half peaks: Bb5 on the downbeat of the Bb bar.
    (111, 6, n_("A5"),  0.52),
    (120, 3, n_("G5"),  0.54), (123, 3, n_("A5"), 0.54), (126, 6, n_("Bb5"), 0.56),
    (138, 3, n_("A5"),  0.52), (141, 12, n_("G5"), 0.50),
    # -- bars 13-15  low and settled, then the Gm colour stated in the melody.
    (159, 6, n_("F5"),  0.48),
    (168, 3, n_("G5"),  0.52), (171, 3, n_("Bb5"), 0.54), (174, 6, n_("A5"), 0.52),
    (183, 6, n_("G5"),  0.48),
    # -- bars 17-19  THE ARRIVAL. The Bb5->C6 gap is 27 ms, so the engine glides
    #    into the top note; the 15-unit C6 gives the vibrato bloom 4.4 s to work.
    (207, 3, n_("F5"),  0.52), (210, 3, n_("G5"), 0.54), (213, 6, n_("A5"), 0.56),
    (222, 3, n_("Bb5"), 0.58), (225, 15, n_("C6"), 0.60),
    # -- bars 21-23  the dissolve: A-G-F onto the tonic under a plagal cadence.
    (255, 6, n_("A5"),  0.48),
    (267, 3, n_("A5"),  0.46), (270, 3, n_("G5"), 0.46), (273, 9, n_("F5"), 0.44),
]

# One chord per bar. Diatonic to F major throughout; the only cadences that
# actually resolve are bar 7->8 and bar 19->20 (perfect) and bar 22->23 (plagal,
# the ending). Every other C is deceptive, which is what keeps a slow piece
# moving without adding notes.
PROG = (
    ["F", "Bb", "F", "C"]           # 0-3   the room, the entrance
    + list(music.PROG_HOME)         # 4-7   Dm Bb F C — the pack's cadence, ONCE
    + ["F", "Dm", "Bb", "C"]        # 8-11  the answer
    + ["Bb", "F", "Gm", "C"]        # 12-15 Gm: the widening
    + ["Dm", "Bb", "Gm", "C"]       # 16-19 the arrival
    + ["F", "Dm", "Bb", "F"]        # 20-23 the plagal landing
)
assert len(PROG) == 24


def solo_soprano(sc: Score, mel: list[tuple[int, int, int, float]],
                 gain: float = 1.0, vowel: str = "ah") -> Score:
    """A CENTRED, exposed 3-voice soprano on the choir bus, via Score.custom().

    custom() rather than choir_pad/choir_hook because those expose only
    voices_scale/effort/attack and cannot reach aspiration, breath, vibrato
    depth/onset, detune, timing or portamento — which is to say they cannot
    reach anything that decides voice-versus-theremin.

    Centring: PART_PAN['soprano'] = -0.42 with PART_SPREAD 0.48 puts every voice
    in [-0.90, +0.06], and with only three of them no seed averages out (six
    seeds measured +9.1 to +15.6 dB LEFT). dsp.pan gives L = x*cos a,
    R = x*sin a and dsp.widen gives [m+s, m-s], so L+R == 2m == a clean scalar
    copy of the voice: sum it and re-pan it ourselves. Verified corr(L, mid) =
    0.97 at 3 voices; this track's choir stem measures +0.09 dB L-R. width=0.0
    keeps the dry voice dead centre; the stereo hall on the choir bus still
    spreads its tail, which is the balance you want — dry voice centred, room
    wide.
    """
    def fn(ctx: RenderCtx) -> None:
        u = (4 * 60.0 / ctx.score.bpm) / U          # seconds per 12/8 unit
        s = choir_mod.ChoirScore()
        for (start, dur, midi, dyn) in mel:
            s.add("soprano", choir_mod.ChoirNote(start * u, dur * u * 0.97,
                                                 midi, vowel, dyn))
        cfg = choir_mod.ChoirConfig(seed=ctx.score.seed + 23, **SOLO)
        y = choir_mod.render_choir(s, ctx.n, cfg, ir=None, width=0.0)
        mono = y[0] + y[1]
        ctx.buses["choir"] += np.stack([mono, mono]) * (np.sqrt(0.5) * gain)
    sc.custom("choir", fn, "solo_soprano")
    return sc


def build() -> Score:
    s = Score(
        id="menuNocturne",
        title="夕凪 / Evening Calm (login nocturne)",
        mood="still, unhurried, wordless — one high soprano over a sparse harp "
             "and far strings; the login theme's quiet alternate",
        bpm=music.BPM_SLOW,          # 67.5 -> a 0.889 s dotted-quarter pulse
        bars=24,                     # = 3 763 200 samples = 2 x the pack loop
        key="F",                     # the relative major of the pack's D minor
        seed=5212,                   # menu 5201 .. fireRing 5211 are taken
        loop=True,
        sidechain=(),                # nothing ducks: there is no kick to duck to
        hall=4.6,                    # measured RT60 4.67 s — the room IS the style
        tail_s=6.0,                  # long enough to feed the loop crossfade
        master_air=0.5,              # menu uses 2.0; this must not sparkle
        master_headroom=0.62,        # 0.80 default; leaves the transients alone
    )
    s.progression(PROG)
    # The voice sits at the PACK DEFAULT (choir=1.0), and so does the harp.
    # The first pass had keys at 0.55 — 7 dB under the level menu and lobby give
    # their piano — on the theory that "sparse" meant "quiet". track_check's
    # choir ceiling caught it: the choir carried 93.1 % of the 300-3500 Hz band
    # against an 85 % limit, which is the gate correctly reporting "there is no
    # other instrument in this record". Sparse is a statement about DENSITY (one
    # harp note per 0.889 s pulse), not about level. At 1.05 the harp is exactly
    # where menu's piano is and the choir share lands at 74 %.
    s.gain(choir=1.0, keys=1.05, strings=0.62)
    s.verb(choir=0.66, keys=0.52, strings=0.48)

    # ---------------------------------------------------- the thread: the harp
    # One note per dotted-quarter pulse (subdiv=4 at 67.5), root-5th-3rd-5th,
    # octave 1 = F4..C5, an octave under the singer so it can never mask her.
    # It plays every bar of the loop: it is the only continuous element and it
    # is what stops the loop point reading as a restart.
    HARP = dict(pattern=(0, 2, 1, 2), subdiv=4, octave=1,
                voice="pluck", pan=-0.15)
    s.arp((0, 22), gain=0.34, **HARP)

    # ------------------------------------------------------------ the singer
    solo_soprano(s, MELODY, gain=1.0, vowel="ah")

    # ---------------------------------------------------- strings, held back
    # Absent for the first four bars, thickest under the arrival, gone by bar 22
    # so the dissolve is harp and voice alone and the hall is nearly empty at
    # the loop join.
    s.chords((4, 12), voice="strings", octave=0, gain=0.22)
    s.chords((12, 20), voice="strings", octave=0, gain=0.30)
    s.chords((20, 22), voice="strings", octave=0, gain=0.22)

    # ------------------------------------------- 16-21  the withheld element
    # A second harp an octave BELOW the first, two notes a bar (root, fifth).
    # Deliberately downward: anything new in the singer's own register would
    # compete with her at the one moment she is most exposed. Entering here is
    # what makes bars 16-19 feel like an arrival rather than just a higher note.
    s.arp((16, 22), pattern=(0, 2), subdiv=2, octave=0, gain=0.24,
          voice="pluck", pan=0.22)

    # ------------------------------------------- 22-24  dissolve + loop join
    # The last three bars take the harp down 2.3 dB. Two reasons, and they are
    # the same reason: the dissolve should actually dissolve, and the loop join
    # lands on a harp attack, so the quieter that attack is the smaller the step
    # at the seam. Measured: x2.54 of the track's own 99.9th-percentile step at
    # a flat 0.34, x1.77 like this (gate is x3.0). It also pulled the true peak
    # from -1.20 to -1.42 dB, against a gate at -1.0.
    # Bar 24 IS bar 0 (chord_at wraps: PROG[24 % 24] = F), so the 0.3 s the
    # renderer crossfades onto the head is real music and not a bare tail.
    s.arp((22, 25), gain=0.25, **HARP)
    return s
