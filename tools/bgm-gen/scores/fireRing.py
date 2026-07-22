"""fireRing — "火環 / Ring of Fire" : 24 bars @ 135 bpm, percussive menace.

The arena hazard cue. Same key, same tempo family as the rest of the pack — but
everything sacred about the choir is deliberately turned off. There is no
soprano line anywhere in this track: the voices are tenor and bass chanting
closed vowels ("uh", "oh") in short rhythmic stabs, with the alto only ever used
to thicken a low "oo" cluster. A choir that never rises above D4 does not read
as heaven; it reads as something circling you.

THIS CUE IS NOT A LOOP, IT IS A COUNTDOWN
    `swapBed()` starts every bed at sample 0, entry is deterministic
    (scene.ts: combat with `phaseSecondsLeft <= 30`) and so is exit (the round
    ends -> resolution -> settlement). `combatMaxSec` is 90, so a full round
    exposes bars 0 -> 16.875 and NOTHING ELSE, up to nine times a match.
    Bar N is therefore a known clock reading:  30 - N x 1.7778 s left.
    The arrangement below is written against that clock, not against the form.
    Anything placed after bar 17 is retransition, heard only if the player is
    still on the screen — so nothing structural may live there.

        bar   0    4    8   10   12   14   16  | 17        23
        left 30.0 22.9 15.8 12.2  8.7  5.1  1.6| past the exit

THE FORM — a metric modulation, not a new section
    0-7    ACT I, the spine alone: deep taiko PULL + body taiko + sub + the
           heave-ho call/answer, and nothing else. No kick, no reese, no
           guitar, no hats — the whole 2-8 kHz band is withheld for 14 s.
           Bars 0-1 are barer still (no mid answer): the head is purely low.
           Bars 2-3 bring the mid answer in; 4-7 raise density INSIDE the
           palette only — the answer doubles, the pull grows a tail, the sub
           adds its beat-3 note.
    8      THE TURN. The war drum stops walking and starts running: the deep
           taiko goes TRESILLO, 3-3-2 ("X.....X.....X..." — 16ths 0/6/12) and
           the kick enters four-on-the-floor for the first time in the cue,
           holding the straight quarter AGAINST it. Impact, reese, guitar
           chugs and 8th hats all arrive on the same downbeat.
           This is the existing figure completing itself: act I's mid answer
           already hits 16th 6, which is the "3" of 3-3-2. Act I plays
           3-.-3-. ; act II plays 3-3-2. No new register is filled.
    10-11  A (V), HELD FOR TWO BARS, with a riser across both. 12.2 -> 8.7 s.
    12     THE ARRIVAL. V->i onto Dm at 8.7 s left — the cue's structural
           centre, and the moment the round is actually decided. Full mix,
           second impact, bass to 16ths with the sub under it, hats to 16ths.
           The sub MUST NOT thin out here; the previous cut had a 7 dB hole in
           20-80 Hz at exactly this point.
    14     TIMPANI on the tresillo, tuned low; chant doubles to "X..xX..xX..x";
           snare backbeat. Last new timbre in the cue, at 5.1 s left.
    16     Dm, everything on, THE LOUDEST BAR IN THE FILE — at 1.6 s left, cut
           mid-bar by the client's 600 ms crossfade into settlement. The cue is
           at full cry when the round takes it away.
    17-23  ACT III, the retransition, past the exit: tresillo relaxes back to
           the act-I pull (17-19), Gm bare at act-I density (20-21), A with a
           downlifter (22-23).

HARMONY  PROG_RING — 12 bars, not 4:

        Dm Dm Bb C | Dm Dm Bb C | Gm Gm A A
        |-- PROG_DARK, twice, unchanged --| |- the turn -|

    12 divides 24, so chord_at(24) == chord_at(0) and the mirror bar still
    lines up (a 16-bar progression would not: 24 % 16 = 8). Gm and A are roots
    that appear NOWHERE else in the eleven-track pack — every other
    progression draws from {Dm, Bb, F, C}. Gm is the subdominant minor, it
    darkens where Bb/F brighten; A is the dominant, and bar 23 being A against
    bar 0 being Dm turns the loop join into a V->i cadence, which no other
    track in the pack has.

    NO NOTE OUTSIDE D NATURAL MINOR REACHES THE AUDIO. `voice_satb` gives the
    soprano the third and then excludes that pitch class from alto/tenor:
        Gm  S=Bb4  A=G4  T=D4  B=G3   -> low three parts are G, D
        A   S=C#5  A=A4  T=E4  B=A2   -> low three parts are A, E
    This cue uses no soprano anywhere, so A's C# is computed and never sounds;
    the turn arrives as bare open fifths in the chant and as power chords from
    guitar(), which synthesises root + fifth internally. music.py's key-family
    rule is untouched.

    The turn also fixes the bass register. At octave=-2 the roots are
    D1 36.7 Hz, Bb1 58.3, C1 32.7 — the old progression put every cycle's
    tension bar on 32.7 Hz, under what most laptops and phones reproduce.
    Gm is G1 49.0 and A is A1 55.0, squarely in the taiko's own f0 range
    (44/58/62 here), so the last ten seconds of the round are audible bass.

THE HOOK  IS NOT QUOTED. Per the reprise plan fireRing alludes to the theme
through the harmony only — the melodic identity belongs to menu/victory/
settlement, and a hazard cue that sang the main theme would tell the player the
wrong thing. The old (0, 2, 3, 2) pluck ostinato that used to carry the
allusion is gone for good: the user heard it (and room's quarter-note twin) as
「丟丟丟丟 丟丟丟丟」 and asked for 中低音戰鼓 + 低音維京航海豁嘿聲. Nothing
refills that mid-high register — not in act II, not in the mirror bar.

BAR 24 mirrors bar 0 (see scores/champSelect.py). It is the audio the join
fades OUT of, so it must be bar 0's own material and nothing else. The previous
cut had a mid-high pluck here, which the crossfade smeared over the head:
bar 0 measured -16.4 dB in 2.5-6 kHz against -29.7 dB for bars 1-4, i.e. the
first bar of the cue was contaminated by an instrument that appears nowhere
else in it. The mirror layers are also humanize=0 so the downbeat lands exactly
on sample 0 — the fade starts at gain 0 on the head, so any jitter there is a
swallowed downbeat, which is what the previous cut measured (-2.1 dB at
0-20 ms against the same window one bar later).

NO CYMBAL. Not here, not anywhere in the pack.
"""

from ggd import music
from ggd.score import Score

# 12 bars: the old PROG_DARK stated twice, then the turn it never had.
PROG_RING = list(music.PROG_DARK) * 2 + ["Gm", "Gm", "A", "A"]

PULL = "X.......X......."      # act I: the oar goes in, twice a bar
TRESILLO = "X.....X.....X..."  # act II: 3-3-2, the gait change


def build() -> Score:
    s = Score(
        id="fireRing",
        title="火環 / Ring of Fire (arena hazard)",
        mood="a 30-second countdown — the war drum changes step at 15 s left "
             "and the dominant lands at 8.7 s",
        bpm=music.BPM_DRIVE,          # 135
        bars=24,                      # = 1 881 600 samples, the pack loop length
        key="Dm",
        seed=5211,
        loop=True,
        pump_depth=0.56,
        pump_release=0.17,
        hall=2.6,                     # a smaller, harder room than the anthem's
    )
    s.progression(PROG_RING)
    s.gain(choir=1.05, keys=0.90, lead=0.80, strings=0.70, gtr=1.10,
           perc=1.30, drums=1.05)
    s.verb(choir=0.42, perc=0.20, gtr=0.10)   # drier than the sacred cues

    # ======================================================= ACT I  bars 0-7
    # 30.0 -> 15.8 s left. The spine and nothing else. Everything that will
    # arrive at bar 8 is withheld here, which is the entire point: a listener
    # who has heard this cue eight times this match must still be told
    # something at bar 8, and the only way to have something to say is to have
    # said less.
    s.drum("taiko", PULL, (0, 8), gain=0.42, humanize=0.011,
           f0=44.0, decay=1.5, pan=-0.18)
    s.drum("taiko", PULL, (0, 8), gain=0.54, humanize=0.009,
           f0=58.0, decay=1.25)
    # the mid answer: the "3" of the tresillo, four bars before the tresillo.
    s.drum("taiko", "......x.......x.", (2, 4), gain=0.26, humanize=0.016,
           f0=62.0, decay=0.7, pan=0.22)
    s.drum("taiko", "......x...x...x.", (4, 8), gain=0.29, humanize=0.016,
           f0=62.0, decay=0.7, pan=0.22)

    # SUB ONLY — no reese until the turn. A pure sine under the drums leaves
    # nothing between ~250 Hz and the chant, which is 中低音戰鼓 taken literally.
    s.bass((0, 4), "X...............", octave=-2, style="sub", gain=0.58,
           length=3.4)
    s.bass((4, 8), "X.......X.......", octave=-2, style="sub", gain=0.64,
           length=1.7)

    # heave-ho: a short CALL on the downbeat, answered by a longer, LOWER pull
    # on beat 3 — the answer being both lower and longer is what reads as an oar
    # coming back rather than as a second identical shout.
    s.choir_chant((0, 8), pattern="X...............", vowel="oh", dyn=0.80,
                  parts=("tenor", "bass"), length=0.75, gain=1.00)
    s.choir_chant((0, 4), pattern="........X.......", vowel="uh", dyn=0.70,
                  parts=("bass",), octave=-1, length=1.5, gain=0.92)
    s.choir_chant((4, 8), pattern="........X.....x.", vowel="uh", dyn=0.74,
                  parts=("bass",), octave=-1, length=1.5, gain=0.94)

    # =================================================== THE TURN  bars 8-11
    # 15.8 s left. Gm (a root the pack has never used), taiko -> tresillo,
    # kick -> four-on-the-floor against it, and the 2-8 kHz band opens for the
    # first time. Four changes on one downbeat.
    s.fx("impact", at_bar=8.0, length_bars=1.0, gain=0.50, f0=49.0)  # Gm = G1
    s.drum("taiko", TRESILLO, (8, 17), gain=0.52, humanize=0.010,
           f0=44.0, decay=1.5, pan=-0.18)
    s.drum("taiko", TRESILLO, (8, 17), gain=0.60, humanize=0.008,
           f0=58.0, decay=1.05)
    s.drum("kick", "X...X...X...X...", (8, 17), gain=0.92)
    # the chant takes the new gait too — voices are the most legible carrier of
    # a metric change, so the heave-ho itself starts running.
    s.choir_chant((8, 12), pattern=TRESILLO, vowel="oh", dyn=0.88,
                  parts=("tenor", "bass"), length=0.45, gain=1.00)
    s.bass((8, 12), "X.....X.....X.x.", octave=-2, style="reese", gain=0.78,
           cutoff=1150.0)
    s.chords((8, 12), voice="guitar", octave=-1, gain=0.48,
             rhythm="X.....x.....x...", hit_beats=0.5)
    s.drum("hat", "x.x.x.x.x.x.x.x.", (8, 12), gain=0.11, pan=0.24, decay=0.026)
    # bars 10-11 lean on the dominant for 3.6 s instead of passing through it.
    s.fx("riser", at_bar=10.0, length_bars=2.0, gain=0.24, f_lo=200.0,
         f_hi=7000.0)

    # ================================================ THE ARRIVAL  bars 12-16
    # 8.7 s left. V->i. Everything straightens except the taiko, so the 3:2 the
    # turn set up is now internal to the groove rather than an event.
    s.fx("impact", at_bar=12.0, length_bars=1.0, gain=0.52, f0=44.0)
    s.choir_chant((12, 14), pattern="X...X...X...X...", vowel="oh", dyn=0.92,
                  parts=("tenor", "bass"), length=0.40, gain=1.00)
    s.choir_chant((14, 17), pattern="X..xX..xX..xX..x", vowel="oh", dyn=0.94,
                  parts=("tenor", "bass"), length=0.36, gain=1.00)
    # the low "oo" cluster — alto/tenor/bass, no soprano — is this cue's
    # signature, and it belongs UNDER the arrival, not in a breakdown.
    s.choir_pad((12, 17), vowel=["oo", "oo", "uh", "oh"], dyn=0.72, effort=0.46,
                parts=("alto", "tenor", "bass"), voices_scale=0.95, gain=0.86)
    # THE SUB HOLE FIX: style="both" from the arrival to the exit, so 20-80 Hz
    # is carried by sub + kick + taiko continuously through the last 8.7 s.
    s.bass((12, 17), "X.x.X.x.X.x.X.x.", octave=-2, style="both", gain=0.92,
           cutoff=1700.0)
    # ...and an octave-up sub pedal, because two of these five bars are rooted
    # on D1 36.7 Hz and C1 32.7 Hz, which most laptops and phones do not
    # reproduce at all. The pedal puts 65-87 Hz under every bar of the arrival
    # so the weight is there on the hardware the game is actually played on.
    s.bass((12, 17), "X.......X.......", octave=-1, style="sub", gain=0.34,
           length=1.7)
    s.chords((12, 17), voice="guitar", octave=-1, gain=0.54,
             rhythm="xxx.xx..xxx.xx..", hit_beats=0.36)
    s.drum("hat", "xoxoxoxoxoxoxoxo", (12, 17), gain=0.14, pan=0.24, decay=0.022)
    s.drum("clap", "....X.......X...", (12, 14), gain=0.28, humanize=0.002)
    # 14: the last new timbre, at 5.1 s left.
    s.drum("timpani", TRESILLO, (14, 17), gain=0.46, humanize=0.008,
           f0=73.0, decay=1.5)
    s.drum("snare", "....X.......X...", (14, 17), gain=0.34, humanize=0.003)
    # 16 is the loudest bar and the last one the player hears. The two gaits
    # finally COLLIDE here: the tresillo keeps running and the body drum lays
    # the four straight quarters on top of it, so the bar the round is taken
    # away on is the one where the 3 and the 4 hit together.
    s.fx("riser", at_bar=15.0, length_bars=1.0, gain=0.20, f_lo=400.0,
         f_hi=8000.0)
    s.fx("impact", at_bar=16.0, length_bars=1.0, gain=0.58, f0=44.0)
    s.drum("taiko", "X...X...X...X...", (16, 17), gain=0.52, humanize=0.006,
           f0=58.0, decay=0.95)
    s.bass((16, 17), "X.......X.......", octave=-1, style="sub", gain=0.40,
           length=1.7)

    # ==================================================== ACT III  bars 17-23
    # Past the exit. This is retransition, not content: it exists so a second
    # pass arrives having been PULLED back to the tonic rather than restarted.
    s.drum("taiko", PULL, (17, 20), gain=0.56, humanize=0.009,
           f0=44.0, decay=1.5, pan=-0.18)
    s.drum("taiko", PULL, (17, 20), gain=0.58, humanize=0.008,
           f0=58.0, decay=1.2)
    s.drum("taiko", "......x...x...x.", (17, 20), gain=0.26, humanize=0.016,
           f0=62.0, decay=0.7, pan=0.22)
    s.drum("kick", "X...X...X...X...", (17, 19), gain=0.86)
    s.drum("kick", "X.......X.......", (19, 21), gain=0.78)
    s.drum("hat", "..x...x...x...x.", (17, 21), gain=0.10, pan=0.24, decay=0.026)
    s.bass((17, 20), "X.x.X...X.x.X...", octave=-2, style="reese", gain=0.78,
           cutoff=1200.0)
    s.choir_chant((17, 20), pattern="....X...x...X...", vowel="uh", dyn=0.84,
                  parts=("tenor", "bass"), length=0.60, gain=1.00)

    # 20-23: the head's own figure, sung over the two chords the head never had.
    s.drum("taiko", PULL, (20, 24), gain=0.48, humanize=0.011,
           f0=44.0, decay=1.5, pan=-0.18)
    s.drum("taiko", PULL, (20, 24), gain=0.60, humanize=0.009,
           f0=58.0, decay=1.25)
    s.bass((20, 24), "X.......X.......", octave=-2, style="sub", gain=0.74,
           length=1.7)
    s.choir_chant((20, 24), pattern="X...............", vowel="oh", dyn=0.80,
                  parts=("tenor", "bass"), length=0.75, gain=1.00)
    s.choir_chant((20, 24), pattern="........X.......", vowel="uh", dyn=0.70,
                  parts=("bass",), octave=-1, length=1.5, gain=0.92)
    s.fx("downlifter", at_bar=22.0, length_bars=2.0, gain=0.22)

    # ------------------------------------------------------- 24  the loop join
    # Bar 24 IS bar 0 — same layers, same gains, humanize=0. Nothing else may
    # live here; see the module docstring for what the old pluck did to bar 0.
    s.drum("taiko", PULL, (24, 25), gain=0.42, humanize=0.0,
           f0=44.0, decay=1.5, pan=-0.18)
    s.drum("taiko", PULL, (24, 25), gain=0.54, humanize=0.0,
           f0=58.0, decay=1.25)
    s.bass((24, 25), "X...............", octave=-2, style="sub", gain=0.58,
           length=3.4)
    s.choir_chant((24, 25), pattern="X...............", vowel="oh", dyn=0.80,
                  parts=("tenor", "bass"), length=0.75, gain=1.00)
    s.choir_chant((24, 25), pattern="........X.......", vowel="uh", dyn=0.70,
                  parts=("bass",), octave=-1, length=1.5, gain=0.92)
    return s
