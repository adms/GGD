"""defeat — "灰燼 / Ash" : the fall.

The exact inverse of victory, built from the same materials so the two read as
a pair: same key, same choir, same piano — but the tempo halves to 67.5 (the
pack's ceremonial tempo), the bass walks DOWN instead of cadencing, and the
choir loses a section every bar until only the men are left.

    bar 0  Dm   the blow: impact, timpani, a downlifter, FULL SATB "ah"
    bar 1  C    ATB only, "oh", darker, the noise sweep closing over it
    bar 2  Bb   tenors and basses alone on "oo", a half-sized section, the
                piano sighing A3 over the Bb — the 6th, never resolved

No kick anywhere: there is nothing left to march to. The lament line
A-G-F / E-D-C / Bb-A is the descending tetrachord, deliberately the mirror of
the hook's rising i-triad.

loop=false — it fades to silence.
"""

from ggd import intro, music
from ggd.music import note
from ggd.score import Score


def build() -> Score:
    s = Score(
        id="defeat",
        title="灰燼 / Ash (defeat)",
        mood="a descending sigh + one funeral toll, then the choir thins to none",
        bpm=music.BPM_SLOW,           # 67.5, ceremonial half-time
        bars=4,                       # +1 bar (#135): the prepended sigh + toll
        key="Dm",
        seed=5213,
        loop=False,
        pump_depth=0.20,
        pump_release=0.24,
        hall=3.9,
        tail_s=2.6,
        master_air=0.8,               # no shimmer; the top end is meant to go
        master_headroom=0.78,
    )
    # bar 0 = the sigh + toll (over the tonic), then i - VII - VI walking down.
    s.progression(["Dm", "Dm", "C", "Bb"])
    s.gain(choir=1.00, keys=1.15, strings=1.05, perc=0.90, fx=0.90)
    s.verb(choir=0.72, keys=0.34, strings=0.48)

    # ------------------------------------------------ 0  SIGNATURE INTRO (#135)
    # A descending SIGH — a filtered choral 'ahh' glissando falling in pitch —
    # and one hollow low BELL TOLL (tuned very low, long dark decay), before the
    # blow lands. The only intro that DESCENDS and the only single tolling bell;
    # victory's exact mirror (falling vs rising). See ggd/intro.py.
    s.custom("fx", intro.defeat)
    # EXPERIMENTAL deadpan 惡搞 line over the toll (macOS `say`, gated off by
    # default; baked only with render.py --tts). The most experimental of the
    # three — it may undercut the pathos, for the user to judge in the audition.
    s.say_line(0.85, "Sinji", "輸咗喇 當冇發生過吖", rate=155, gain=0.5,
               pan=0.04, verb=0.2)

    # ------------------------------------------------------------- the blow
    s.fx("impact", at_bar=1.0, length_bars=1.0, gain=0.42, f0=44.0, decay=2.2)
    s.fx("downlifter", at_bar=1.0, length_bars=1.6, gain=0.26)
    s.drum("timpani", "X...............", (1, 2), gain=0.42, f0=73.4, decay=1.7)
    s.drum("taiko", "X...............", (1, 2), gain=0.34, f0=55.0, decay=1.3)

    # --------------------------------------------- the choir loses a section
    s.choir_pad((1, 2), vowel="ah", dyn=0.66, effort=0.34, gain=1.00)
    s.choir_pad((2, 3), vowel="oh", dyn=0.52, effort=0.26, gain=0.90,
                parts=("alto", "tenor", "bass"), voices_scale=0.85)
    s.choir_pad((3, 4), vowel="oo", dyn=0.36, effort=0.20, gain=0.80,
                parts=("tenor", "bass"), voices_scale=0.60)

    # -------------------------------------------------------- the lament line
    s.melody(1, [
        (0.0, 1.0, note("A4")), (1.0, 1.0, note("G4")), (2.0, 2.0, note("F4")),
        (4.0, 1.0, note("E4")), (5.0, 1.0, note("D4")), (6.0, 2.0, note("C4")),
        (8.0, 2.0, note("Bb3")), (10.0, 2.0, note("A3")),
    ], voice="piano", bus="keys", gain=0.55, vel=0.52, pan=-0.10)

    s.chords((1, 4), voice="strings", octave=-1, gain=0.55)
    s.bass((1, 4), "X...............", octave=-2, style="sub", gain=0.62)
    s.fx("sweepdown", at_bar=2.6, length_bars=1.4, gain=0.20)
    return s
