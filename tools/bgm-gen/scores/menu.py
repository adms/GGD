"""menu — "戰旗 / Banner of the Fallen" : the title theme, and the pack's
reference track.

This is where the shared identity is stated in full: D minor, 90 bpm, the
i-VI-III-VII cadence (Dm-Bb-F-C), the piano ostinato, and THE HOOK sung by the
sopranos with the supersaw doubling an octave below. Everything else in the
pack quotes some part of this.

LENGTH — 32 bars @90 = 3 763 200 samples = 85.333 s, i.e. 2 x the pack's
1 881 600-sample loop GRID, not a departure from it: 32 @90 = 48 @135 =
24 @67.5 = 96 @180, so this track still lines up bar-for-bar with every other
loop in the release (see music.py, "LOOP GRID").

WHY IT GREW. The 16-bar cut said everything it had by bar 8 and then restated
it. Measured on the old rendered file (40-band mel, mean-removed cosine, so it
compares spectral SHAPE not level): 13 of its 21 layers entered in bars 0-7;
"HOOK B" scored +0.865 against HOOK A, the highest pair in the file, because it
was the same phrase with one chord changed; per-bar RMS spread was 3.28 dB and
a 3 s window stayed inside 1.5 dB for 20.5 s continuous — the entire drop was
one plateau; and the loop seam handed a -4.76 dB RMS cliff back to the sparse
head every 42.7 s. The second half below exists to give the first half
something to be louder *than*, and to give the piece a second harmonic
destination.

THE SECOND HALF IS NOT AN APPENDIX. Bar 16 falls at t = 42.667 s — exactly
where the old file looped — so anyone who has sat on the login screen expects
the sparse ostinato back there. Instead the floor drops out from under it.
Four turns:

  16  THE CUT           everything stops but the ostinato. The deep taiko that
                        raised the banner at bar 8 (f0=42, decay=1.9) drops it
                        on the identical call, and a downlifter sweeps 5 kHz ->
                        90 Hz into the hole. The 3.6 s cathedral carries bar
                        15's choir about a bar and a third into the gap on its
                        own, so the floor reads as the room after the shout.
  16  THE GROUND MOVES  `ostinato` picks chord TONES, so putting 7ths under it
                        (Bbmaj7 Gm7 Dm7 Am7) lowers the figure's own top note
                        from the octave to the 7th — Dm gives D3 A3 D4 A3, Dm7
                        gives D3 A3 C4 A3. After 42 s of an unchanging
                        four-note cell the cell changes shape, and not one new
                        instrument was added. A D2 pedal holds under it: the
                        harmony has moved a third down, home has not.
  20  THE COUNTERLINE   the strings have been a bed since bar 4 and have never
                        carried a line. Here they do, over PROG_SHADOW, with
                        the kit still out and only a low male hum under them.
                        The line is derived, not foreign: bars 20-21 are the
                        hook's lift (D5-F5-A5) in retrograde at half speed,
                        bars 22-23 are HOOK_CELL falling instead of rising, and
                        it ENDS ON A4 — the note HOOK A begins on. The sopranos
                        take that A4 back on the downbeat of 24, so the return
                        is handed over rather than spliced on.
  24  THE RETURN        the melody comes home four bars before the ground does:
                        HOOK A, the same `choir_hook` call as bar 8, but over
                        PROG_SHADOW. Only at 28 does the cadence come back to
                        Dm — and that is where the GUITAR, held out of the
                        entire first drop, finally enters, over a half-time
                        kick. The last chorus is the biggest thing in the track
                        instead of a re-run of the first.

REPRISE RULE (music.py): menu STATES the hook — that is this track's job. The
new sections re-harmonise it; they never hand it to another cue.

NO CYMBAL. The user's standing rule (2026-07-22): 我不喜歡 cymbal 這種刺耳的
聲音出現在 BGM. There is no `drum("cymbal", ...)` here and nothing was added in
that register; the accents are taiko.

Shape (32 bars = 85.333 s, seamless):
  bars    s            section
  0-3     0.0-10.7     集結 GATHER      piano ostinato + "oo" choir + sub;
                                        taiko far away
  4-7     10.7-21.3    行軍 MARCH       strings bed, half-time kit, riser
  8-11    21.3-32.0    DROP / HOOK A    full SATB on the hook, supersaw, four-
                                        on-the-floor + taiko, hard pump. NO
                                        guitar — it is being saved for 28.
  12-15   32.0-42.7    HOOK B           the answering phrase, over
                                        HOOK_CHORDS_B (Dm Bb Bb C) at last, so
                                        bar 14 finally agrees with the tune
  16-19   42.7-53.3    崩し THE FLOOR   THE TURN — ostinato alone over 7ths, a
                                        D2 pedal, choir back at 18, taiko at 19
  20-23   53.3-64.0    対旋律 COUNTER   the strings sing; the kit walks back in
  24-27   64.0-74.7    再来 THE RETURN  HOOK A re-harmonised over PROG_SHADOW
  28-31   74.7-85.3    凱歌 HOME        HOOK B, home cadence, guitar, half-time
                                        kick, everything
  32                   mirror bar       bar 0's material, so the loop join
                                        crossfades music onto music instead of
                                        hall decay onto music
"""

from ggd import music
from ggd.music import note
from ggd.score import Score

# PROG_HOME seen a diatonic third lower — Dm->Bb, Bb->Gm, F->Dm, C->Am
# (VI-iv-i-v). Every note is in D natural minor: no accidental, no key change,
# the tonic pitch class never moves. It is the same cadence from underneath,
# which is what lets HOOK A sit on top of it unaltered at bar 24. Declared here
# rather than in music.py because so far only this track uses it (precedent:
# champSelect.py declares its OSTINATO locally).
PROG_SHADOW = ["Bb", "Gm", "Dm", "Am"]

# The floor: PROG_SHADOW with a 7th on every chord. See "THE GROUND MOVES".
PROG_FLOOR = ["Bbmaj7", "Gm7", "Dm7", "Am7"]

# One symbol per bar; len(PROG) == bars, so bar 32 wraps to bar 0's chord.
PROG = (music.PROG_HOME * 2             # 0-7    Dm Bb F  C, twice
        + music.HOOK_CHORDS_A           # 8-11   Dm Bb F  C  — the drop
        + music.HOOK_CHORDS_B           # 12-15  Dm Bb Bb C  — the answer
        + PROG_FLOOR                    # 16-19  the hole, in 7ths
        + PROG_SHADOW                   # 20-23  the counterline's ground
        + PROG_SHADOW                   # 24-27  the hook, re-harmonised
        + music.HOOK_CHORDS_B)          # 28-31  home
assert len(PROG) == 32, PROG

# THE COUNTERLINE, bars 20-23, over Bb Gm Dm Am. (beat, beats, midi) relative
# to bar 20. Derived from the hook, not new: the lift D5-F5-A5 played backwards
# at half speed (A5 F5 D5), then the cell falling instead of rising. Ends on A4
# — HOOK A's first note — which the sopranos pick up on the next downbeat.
COUNTER = [
    (0.0, 2.0, note("A5")), (2.0, 2.0, note("F5")),    # Bb : maj7 -> 5th
    (4.0, 2.0, note("D5")), (6.0, 2.0, note("E5")),    # Gm : 5th -> 6th (Gm6)
    (8.0, 4.0, note("F5")),                            # Dm : the 3rd, held
    (12.0, 2.0, note("E5")), (14.0, 1.0, note("C5")),
    (15.0, 1.0, note("A4")),                           # Am : 5th 3rd ROOT = A4
]

OSTINATO = (0, 2, 3, 2)   # root, 5th, octave — and the 7TH once the floor hits


def build() -> Score:
    s = Score(
        id="menu",
        title="戰旗 / Banner of the Fallen (main theme)",
        mood="sacred, monumental, driving — the pack's title statement",
        bpm=music.BPM_BASE,          # 90
        bars=32,                     # 3 763 200 samples = 2 x the pack's grid
        key="Dm",
        seed=5201,
        loop=True,
        pump_depth=0.52,
        pump_release=0.185,
        hall=3.6,
    )
    s.progression(PROG)
    # relative to the pack defaults: the choir leads, the kit stays behind it
    s.gain(choir=1.10, lead=0.95, keys=1.05, strings=0.95, gtr=0.85, perc=1.15)

    # ---------------------------------------------------------- the constant
    # THE THREAD THAT NEVER STOPS — one call, bars 0-32 inclusive of the mirror
    # bar, so the loop point never feels like a restart. It is also the piece's
    # only survivor of the cut at bar 16, which is why the 7ths underneath it
    # there are audible as a change of shape rather than as a chord change.
    s.ostinato((0, 33), voice="piano", shape=OSTINATO, subdiv=8,
               octave=0, gain=0.40, pan=-0.12)

    # ------------------------------------------------------- 0-3 集結 GATHER
    s.choir_pad((0, 4), vowel="oo", dyn=0.52, voices_scale=0.85, effort=0.30,
                gain=0.95)
    s.bass((0, 4), "X.......X.......", octave=-2, style="sub", gain=0.75)
    s.drum("taiko", "X...............", (0, 4), gain=0.42, humanize=0.008,
           f0=62.0, decay=1.1)
    s.fx("reverse", at_bar=3.0, length_bars=1.0, gain=0.28)

    # -------------------------------------------------------- 4-7 行軍 MARCH
    s.choir_pad((4, 8), vowel=["ah", "oh", "ah", "ah"], dyn=0.68,
                effort=0.5, gain=1.0)
    s.chords((4, 16), voice="strings", octave=0, gain=0.78)
    s.drumkit((4, 8), style="halftime", gain=0.85)
    s.bass((4, 8), "X.......X...X...", octave=-2, style="both", gain=0.8,
           cutoff=1100.0)
    s.drum("taiko", "X.......X.......", (4, 8), gain=0.55, humanize=0.008)
    s.fx("riser", at_bar=6.0, length_bars=2.0, gain=0.30)

    # --------------------------------------------------- 8-11 DROP: HOOK A
    # No guitar. It exists in this track exactly once, at bar 28, so the last
    # chorus has a timbre the first one never had.
    s.fx("impact", at_bar=8.0, length_bars=1.0, gain=0.55)
    # the downbeat accent the removed cymbal used to carry — a DEEP TAIKO, not
    # metal. User (2026-07-22): 我不喜歡 cymbal 這種刺耳的聲音出現在 BGM.
    s.drum("taiko", "X...............", (8, 9), gain=0.72, humanize=0.004,
           f0=42.0, decay=1.9)
    s.choir_hook((8, 12), phrase="A", vowel="ah", dyn=1.0, effort=0.92,
                 gain=1.0)
    s.lead((8, 12), phrase="A", octave=-1, voice="supersaw", gain=0.34,
           detune=0.19, cutoff=8200.0)
    s.drumkit((8, 12), style="drive", gain=1.0)
    s.bass((8, 12), "X...X...X...X...", octave=-2, style="both", gain=0.85,
           cutoff=1300.0)
    s.arp((8, 16), pattern=(2, 3, 4, 3), subdiv=16, octave=1, gain=0.13,
          voice="pluck", pan=0.34)

    # ------------------------------------------------------- 12-15 HOOK B
    # Nothing telegraphs bar 16: the old snare fill and sweepdown that landed
    # the listener back on bar 0 are gone, because there is no bar 0 to land on
    # any more. Bar 15 ends full and bar 16 is simply not there.
    s.choir_hook((12, 16), phrase="B", vowel="ah", dyn=1.0, effort=0.95,
                 gain=1.02)
    s.lead((12, 16), phrase="B", octave=-1, voice="supersaw", gain=0.34,
           detune=0.20, cutoff=9000.0)
    s.drumkit((12, 16), style="drive", gain=1.0)
    s.drum("taiko", "X...X...X..xX.x.", (12, 16), gain=0.5, humanize=0.006)
    s.bass((12, 16), "X...X...X...X...", octave=-2, style="both", gain=0.85,
           cutoff=1400.0)
    s.drum("taiko", "X...............", (12, 13), gain=0.66, humanize=0.004,
           f0=44.0, decay=1.7)

    # -------------------------------------------------- 16-19 崩し THE FLOOR
    # 轉折 1 + 2, at t = 42.667 s, the old loop point. The re-entry ladder is
    # deliberate: 16 ostinato alone -> 17 pedal -> 18 choir -> 19 taiko+riser.
    # This is also the dynamics fix, and it measures: bar 17 sits 6.6 dB under
    # bar 28, the drums bus is 45 dB down, the bass bus 22 dB down, and the
    # 8-20 kHz band drops 25 dB because every hat is gone. Per-bar RMS spread
    # across the track went 3.28 -> 6.61 dB. That is what the return at 24 has
    # to return from.
    s.drum("taiko", "X...............", (16, 17), gain=0.72, humanize=0.004,
           f0=42.0, decay=1.9)
    s.fx("downlifter", at_bar=16.0, length_bars=2.0, gain=0.24,
         f_hi=5000.0, f_lo=90.0)
    # the pedal: pad on the sub bus = a true sustained drone, no reverb, D2
    # under everything for three bars while the chords sit a third below home.
    # Deliberately under the ostinato — it is meant to be felt, not heard.
    s.melody(17, [(0.0, 12.0, note("D2"))], voice="pad", bus="sub",
             gain=0.22, attack=0.60, cutoff=180.0)
    # bar 0's texture, but SMALLER than bar 0 — this is a re-entry from nothing,
    # so it has to start under the level it will climb back to.
    s.choir_pad((18, 20), vowel="oo", dyn=0.44, voices_scale=0.72, effort=0.25,
                gain=0.82)
    s.drum("taiko", "X.......X.......", (19, 20), gain=0.40, humanize=0.008,
           f0=58.0, decay=1.2)
    s.fx("riser", at_bar=19.0, length_bars=1.0, gain=0.20, f_lo=220.0,
         f_hi=6000.0)

    # ------------------------------------------------ 20-23 対旋律 COUNTERLINE
    # 轉折 3. The strings carry a line for the first time in the pack's title
    # theme. Under them, tenors and basses only — a low male hum this track has
    # never used, which keeps the whole soprano register clear for the tune.
    s.melody(20, COUNTER, voice="strings", bus="strings", gain=0.62,
             attack=0.09, cutoff=4200.0)
    s.choir_pad((20, 24), vowel="oo", dyn=0.58, parts=("tenor", "bass"),
                voices_scale=0.90, effort=0.35, gain=0.95)
    s.bass((20, 24), "X.......X.......", octave=-2, style="sub", gain=0.70)
    s.drum("taiko", "X.......X.......", (20, 22), gain=0.50, humanize=0.008,
           f0=58.0, decay=1.2)
    s.drumkit((22, 24), style="halftime", gain=0.80)
    s.drum("taiko", "X...X...X..xX.x.", (23, 24), gain=0.58, humanize=0.006)
    s.fx("riser", at_bar=22.0, length_bars=2.0, gain=0.28)

    # ------------------------------------------------- 24-27 再来 THE RETURN
    # 轉折 4. Byte-for-byte the same choir call as bar 8 — same phrase, same
    # dyn, same effort — over PROG_SHADOW. Nothing about the tune changed; the
    # ground did.
    s.fx("impact", at_bar=24.0, length_bars=1.0, gain=0.45)
    s.drum("taiko", "X...............", (24, 25), gain=0.70, humanize=0.004,
           f0=42.0, decay=1.9)
    s.choir_hook((24, 28), phrase="A", vowel="ah", dyn=1.0, effort=0.92,
                 gain=1.0)
    s.lead((24, 28), phrase="A", octave=-1, voice="supersaw", gain=0.34,
           detune=0.19, cutoff=8200.0)
    s.chords((24, 32), voice="strings", octave=0, gain=0.80)
    s.drumkit((24, 28), style="drive", gain=1.0)
    s.bass((24, 28), "X...X...X...X...", octave=-2, style="both", gain=0.85,
           cutoff=1300.0)

    # --------------------------------------------- 28-31 凱歌 HOOK B / HOME
    # The cadence comes home (Dm Bb Bb C) and the arrangement opens all the way
    # for the first and only time: guitar, and a HALF-TIME kick under 16th hats
    # so the biggest section is monumental rather than merely faster. Two kicks
    # a bar also means the sidechain stops chopping and the choir sits up.
    s.choir_hook((28, 32), phrase="B", vowel="ah", dyn=1.0, effort=0.98,
                 gain=1.08)
    # the one timbre the track has never used: a low male CHANT on the
    # half-time downbeats, under the SATB hook. Monastic, not another pad —
    # this is what stops the last chorus measuring as bars 12-15 again.
    s.choir_chant((28, 32), pattern="X.......X.......", vowel="oh", dyn=0.88,
                  parts=("tenor", "bass"), length=1.7, gain=0.52)
    s.lead((28, 32), phrase="B", octave=-1, voice="supersaw", gain=0.36,
           detune=0.20, cutoff=9000.0)
    s.chords((28, 32), voice="guitar", octave=-1, gain=0.72,
             rhythm="x.x.x.x.x.x.x.x.", hit_beats=0.45)
    s.drum("kick", "X.......X.......", (28, 32), gain=0.95)
    s.drum("clap", "........X.......", (28, 32), gain=0.42, humanize=0.002)
    s.drum("hat", "xoxoxoxoxoxoxoxo", (28, 32), gain=0.20, humanize=0.002,
           pan=0.15)
    s.drum("taiko", "X..xX...X..xX.x.", (28, 32), gain=0.62, humanize=0.006)
    s.bass((28, 32), "X.......X...X...", octave=-2, style="both", gain=0.88,
           cutoff=1500.0)
    s.arp((28, 32), pattern=(2, 3, 4, 3), subdiv=16, octave=1, gain=0.13,
          voice="pluck", pan=0.34)
    s.drum("taiko", "X...............", (28, 29), gain=0.70, humanize=0.004,
           f0=44.0, decay=1.7)
    # fill on the last bar, landing the listener back on bar 0
    s.drum("snare", "............oxXX", (31, 32), gain=0.34)
    s.fx("sweepdown", at_bar=31.0, length_bars=1.0, gain=0.22)

    # ------------------------------------------------------ 32 the loop join
    # Bar 32 is bar 0. The old cut wrote nothing here, so seamless_loop
    # crossfaded 0.3 s of pure hall decay onto the head and the seam measured
    # as a -4.76 dB RMS cliff. Now it crossfades bar 0's own material onto
    # bar 0. See the module docstring and dsp.seamless_loop.
    s.choir_pad((32, 33), vowel="oo", dyn=0.52, voices_scale=0.85, effort=0.30,
                gain=0.95)
    s.bass((32, 33), "X.......X.......", octave=-2, style="sub", gain=0.75)
    s.drum("taiko", "X...............", (32, 33), gain=0.42, humanize=0.008,
           f0=62.0, decay=1.1)
    return s
