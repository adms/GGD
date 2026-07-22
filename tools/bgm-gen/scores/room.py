"""room — 「控室 / The Antechamber」 : minimal, low-key anticipation.

The sparsest track in the pack. Where lobby is warm, room is *waiting*: four
isolated piano bells with a lot of air around them, a hum that barely resolves
into voices, and — twice per loop — a low male chant on the downbeat that says
the fight is close. Nothing lands hard, nothing resolves; the last two bars
lift very slightly and drop back into bar 0.

REPRISE RULE (music.py): room alludes, never states. The allusion is carried by
the HARMONY and by the four piano bells (D5, A4, F5, D5 — the hook cell's own
pitches, one per four-bar block), not by a figure. There is no mid-high
Karplus-Strong pluck in this track and there must never be one again: the first
cut ran the hook cell's contour as a quarter-note pluck ostinato and the user
heard it (with fireRing's eighth-note twin) as 「丟丟丟丟 丟丟丟丟」.

The 8-bar progression is the pack's brooding variant extended so the second
half turns major on the seventh bar (F), which is the only "light" in the
track and is why 16 bars of near-silence do not read as a drone.

Shape (16 bars = 42.667 s, seamless):
    0-3    a 4-voice hum + sub, nothing else; a piano bell in bar 2
    4-7    the hum thickens, a distant taiko marks two-bar time
    8-11   pad opens, heartbeat kick, choir moves to "oh"
    10-13  the low chant (tenor + bass) on alternate downbeats
    14-15  a whisper of a riser back into bar 0 — anticipation, not a drop
"""

from ggd import music
from ggd.music import note
from ggd.score import Score

# PROG_DARK (Dm Dm Bb C) extended to eight bars so the loop takes twice as
# long to come around; the F in bar 7 is the one moment of light.
PROG_WAIT = music.PROG_DARK + ["Dm", "Dm", "F", "C"]


def build() -> Score:
    s = Score(
        id="room",
        title="控室 / The Antechamber",
        mood="minimal, low-key anticipation — air, a distant hum, a chant that "
             "says the fight is close",
        bpm=music.BPM_BASE,          # 90
        bars=16,                     # = 1 881 600 samples, the pack loop length
        key="Dm",
        seed=2213,
        loop=True,
        pump_depth=0.20,
        pump_release=0.28,
        hall=3.9,                    # emptier than lobby: more room, longer tail
        master_air=1.0,
    )
    s.progression(PROG_WAIT)
    s.gain(choir=1.00, pad=1.15, keys=1.10, drums=0.55, perc=0.70, sub=0.80)
    s.verb(keys=0.40, pad=0.46, choir=0.70)

    # ---------------------------------------------------------- the constant
    # THE ROWING PULSE. The first cut ran a quarter-note Karplus-Strong pluck
    # (A3 D4 F4 D4) through all 16 bars; the user heard it as 「丟丟丟丟 丟丟丟丟」
    # and asked for 中低音戰鼓 + 低音維京航海豁嘿聲 instead. That mid-high pluck
    # is gone entirely — nothing replaces it in that register, which is the
    # point: the spine is now DRUM + LOW MALE CHANT and the mids stay empty.
    #
    # The chant is a Viking rowing call-and-response, not a pad: a short CALL on
    # the downbeat answered by a longer, lower PULL on beat 3, so the bar has the
    # heave-ho shape. Tenor+bass on the call, bass alone an octave down on the
    # answer — the answer being lower AND longer is what reads as the oar coming
    # back rather than a second identical shout.
    s.drum("taiko", "X.......x.......", (0, 16), gain=0.52, humanize=0.012,
           f0=46.0, decay=1.45)
    s.choir_chant((0, 16), pattern="X" + "." * 15, vowel="oh", dyn=0.52,
                  gain=0.44, parts=("tenor", "bass"), length=0.85)
    s.choir_chant((0, 16), pattern="........X.......", vowel="uh", dyn=0.44,
                  gain=0.40, parts=("bass",), octave=-1, length=1.6)
    s.bass((1, 16), "X" + "." * 15, octave=-2, style="sub", gain=0.44)

    # Four isolated piano bells across the loop — the clock on the wall. They
    # fall on bars 2, 6, 10, 14, i.e. the middle of each four-bar block, so
    # they never coincide with a section change.
    s.melody(0, [(8.0, 2.0, note("D5")), (24.0, 2.0, note("A4")),
                 (40.0, 2.0, note("F5")), (56.0, 2.0, note("D5"))],
             voice="piano", bus="keys", gain=0.30, pan=0.26, vel=0.52)

    # ----------------------------------------------------- 0-7  the waiting
    s.choir_pad((0, 8), vowel="oo", dyn=0.30, voices_scale=0.50, effort=0.18,
                gain=0.92)
    s.chords((0, 8), voice="pad", octave=0, gain=0.30, cutoff=1650.0)

    # ---------------------------------------------------- 8-13 the tightening
    # The oars quicken: the pull answer doubles up and a second war drum lands
    # off-beat, so the same rowing figure gains urgency WITHOUT adding anything
    # in the mid-high register the user asked to clear out.
    s.choir_pad((8, 12), vowel=["oh", "oh", "ah", "oh"], dyn=0.44,
                voices_scale=0.85, effort=0.32, gain=1.02)
    s.chords((8, 16), voice="pad", octave=0, gain=0.34, cutoff=2300.0)
    s.drum("taiko", "....x.......x..x", (8, 16), gain=0.34, humanize=0.014,
           f0=54.0, decay=0.85, pan=-0.2)
    s.choir_chant((8, 16), pattern="............X...", vowel="oh", dyn=0.48,
                  gain=0.34, parts=("tenor", "bass"), length=0.7)

    # ------------------------------------------------------- 14-15 the breath
    s.choir_pad((12, 16), vowel="oo", dyn=0.28, voices_scale=0.55, effort=0.20,
                gain=0.92)
    s.fx("reverse", at_bar=7.2, length_bars=0.8, gain=0.10)
    # ends just before the cut, so the loop turnaround inhales rather than
    # slamming: the riser peaks into the pluck's bar-0 downbeat.
    s.fx("riser", at_bar=14.0, length_bars=1.8, gain=0.085, f_lo=400.0,
         f_hi=5200.0)
    return s
