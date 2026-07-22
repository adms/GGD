"""intermission — 「合間 / Between the Bells」 : downtempo groove, purposeful.

The third of the quiet 90 bpm tracks, and the only one with a real beat. This
is the walk back to the fight: a laid-back kick with the backbeat pulled
slightly behind it, the menu piano ostinato, a reese under it, and a choir
that stops humming and starts SINGING — but only the three-note cell.

THIS CUE IS NOT HEARD AS A LOOP.  `intermissionSec: 60` (config.match.json)
and one bar @90 = 240/90 = 2.6667 s, so a visit is EXACTLY 22.5 BARS, and the
client restarts every bed at sample 0 on scene entry (AudioSystem.swapBed).
At the old 16 bars the player heard bars 0-15 and then bars 0-6.5 AGAIN, seven
times a match. At 32 bars they hear bars 0-22.5 ONCE: no internal repeat, and
the loop join is never reached. Length alone killed the fatigue here — which is
not true of menu or combat, where the loop still comes round.

So the deadline is BAR 22.5 (60.0 s), not bar 32. Everything the player is
meant to hear is stated by then; the piece is written against the phase clock,
not against its own length.

BARS 23-31 ARE NOT HEARD TODAY, deliberately, and they are still real music:
  - countdownCue.ts already anticipates the phase length changing ("25 s, 60 s
    or 90 s all reach 5 and ring the same five bells"), and task #38 is
    rebuilding this screen; a raised `intermissionSec` walks straight into the
    tail.
  - if the bed is ever resumed at its previous phase instead of restarted at 0,
    7 visits x 22.5 bars over a 32-bar loop is ~4.9 passes and EVERY VISIT
    STARTS ON A DIFFERENT BAR. The tail is the only thing that would make that
    change worth anything. Do not assume the change; do not write filler either.

THE SECOND CLOCK — THE COUNTDOWN BELLS.  `COUNTDOWN_PHASES` includes
"intermission" (countdownCue.ts, task #38): countTick fires at t = 55/56/57/58 s
and the longer countFinal at 59 s, at rising volume 0.45 -> 1.0. In bars that is
20.625 / 21.0 / 21.375 / 21.75 / 22.125 — the five loudest cues on the screen all
land in the last two bars the player hears. Section F exists to get out of their
way. HARD CONSTRAINT, and it is measurable: NO PERCUSSION ONSET IN
t = [54.5 s, 60.0 s] (bars 20.44-22.5), and nothing bright in 2-6 kHz across it —
no hats, no snare, no pluck, no strings, no piano; the last percussion onset in
the piece is the taiko full-stop on the downbeat of bar 20 (53.333 s).

REPRISE RULE (music.py): intermission quotes FRAGMENTS. The sopranos sing
HOOK_CELL (A-D-F, the rising i triad) exactly twice — the downbeat of bar 8 and
the downbeat of bar 16 — over a real SATB bed. The whole phrase is never stated;
that is the difference between recognising the theme and hearing the theme. The
countermelody in D/E is NEW material for this cue, not the hook.

HARMONY — a 32-entry progression, one chord per bar (Score.chord_at wraps on
len(prog), so `len(PROG) == bars` also makes the mirror bar wrap to bar 0's
chord by construction).
    0-11   PROG_DRIVE x3 (Dm C Bb C)  restless, never settles — as before
    12-15  PROG_BREATH   (Bb F G Dm)  THE TURN
    16-19  PROG_DRIVE    (Dm C Bb C)  the return
    20-23  the clearing  (Dm Dm C Bb) leaves the player on C at 58.7 s
    24-27  the long way  (F F Dm Dm)  the relative major, unheard today
    28-31  the light     (Bb G C C)   C hands bar 0 its Dm
  BAR 12 (Bb) is the expectation break: three times running every 4-bar downbeat
  has been Dm, so bar 12 gives the ear a chord it already knows in the wrong
  place. BAR 14 (G) is the turn itself — the FIRST B NATURAL in the cue. G major
  is the dorian IV, major IV over a minor tonic, the "clouds part" chord of
  JRPG/anime scoring, and it is sanctioned by the pack's key family (music.py:
  D dorian, tonic pitch class unmoved). It arrives in the choir, because
  voice_satb("G") puts B in the soprano, and in the countermelody's lowest note.
  BAR 15 (Dm) is the first true arrival: G->Dm is IV->i, plagal, a soft landing —
  the exact opposite of PROG_DRIVE. PROG_BREATH is the pack's own PROG_RESOLVE
  (Bb F C Dm, "the landing") with its VII raised to the dorian IV.
  BAR 22 = C. The cut at 60.0 s lands mid-bar-22 ON THE DOMINANT, and combat's
  Dm answers it 600 ms later across the scene boundary.

WHAT IS WITHHELD.  The old cue had 13 of its 21 layers running by bar 7 and a
per-bar RMS spread of 2.07 dB (std 0.48): everything was stated early, so
nothing could develop. Seven things are now held back — the B natural / any G
chord, the countermelody (this score had no melodic layer at all), the taiko
(bar 12 -> bar 16), the supersaw, the half-time kick, the second cell
statement, and the open hats. Bars 0-11 are the only part of the cue that is
pure groove. Measured on the render: per-bar RMS
spread 7.70 dB, std 1.72 — 3.6x the old spread, and the longest stretch the
3 s window stays inside 1.5 dB drops from 27.0 s to 12.0 s.

Shape (32 bars = 85.333 s = 2 x the 1 881 600-sample loop grid, seamless):
  bars    s            section
  0-3     0.0-10.7     A 息 settle       arrival out of combat; shop auto-opens
  4-7     10.7-21.3    B groove          the kit; browsing begins
  8-11    21.3-32.0    C the cell        HOOK_CELL, one statement
  12-15   32.0-42.7    D 息継ぎ THE BREATH  THE TURN. Kit, ostinato and pluck all
                                         stop. 12-13 are the barest bars in the
                                         cue (-22.5 dB, the minimum of the heard
                                         portion); 14-15 bloom on the G. Dead
                                         centre of the 60 s the player owns.
  16-19   42.7-53.3    E the return      the peak (-17.0 dB): taiko, half-time
                                         kick, the countermelody a fourth higher
                                         with a supersaw an octave under it
  20-23   53.3-61.3    F the clearing    music vacates for the bells; the phase
                                         cuts mid-bar-22 at 60.0 s
  24-27   64.0-74.7    G the long way i  unheard today (see above)
  28-31   74.7-85.3    H the long way ii unheard today; decrescendos so bar 0's
                                         sparse head is a landing, not a cliff
  32                   mirror bar        bar 0's material, for the join

MEASURED (probe/track_check.py + a self-similarity pass over the render):
  85.333 s / 3 763 200 samples / 32.000 bars @90 · -16.5 LUFS · TP -4.53 ·
  loop join step x0.5 (gate fails at 3.0), RMS step +0.16 dB · choir share
  100.0 % best-2s / 70.3 % overall (gates 12 % / 85 %). Section novelty
  (checkerboard kernel on the MFCC self-similarity matrix, 1- and 2-bar
  half-widths): BAR 12 IS THE GLOBAL MAXIMUM, 1.000, at both scales — the turn
  is the strongest structural boundary in the file. Bars 4, 7, 8, 12, 13 and 16
  clear the 0.90 bar-novelty threshold; the old 16-bar cue had three such bars
  in total (4, 7, 8) and nothing new after bar 8, so D and E are the first
  material this track has ever introduced in its second half. No window
  repeats — nothing is a copy of anything: the most similar 8-bar pair differs by
  +2.07 dB relative to the signal in raw samples, i.e. uncorrelated. In the
  bell window the 2-6 kHz band sits 14.4 dB below the rest of the track and no
  onset exceeds the track's 97th-percentile onset strength.
"""

from ggd import music
from ggd.score import Score

N = music.note

# One symbol per bar; len(PROG) == bars, so bar 32 wraps to bar 0's chord.
PROG = (["Dm", "C", "Bb", "C"] * 3      # 0-11   PROG_DRIVE, restless
        + ["Bb", "F", "G", "Dm"]        # 12-15  PROG_BREATH — the turn
        + ["Dm", "C", "Bb", "C"]        # 16-19  the return
        + ["Dm", "Dm", "C", "Bb"]       # 20-23  the clearing
        + ["F", "F", "Dm", "Dm"]        # 24-27  the long way back i
        + ["Bb", "G", "C", "C"])        # 28-31  the long way back ii
assert len(PROG) == 32, PROG

# THE COUNTERMELODY — new material, not the hook. (beat, beats, midi) relative
# to the section's first bar. The shape is 3+1 / 2+2 / 1+1+2 / 2+1+1 and it is
# reused in all three sections, so the return reads as the same voice speaking
# again rather than as a second, unrelated tune.

# D, bars 12-15 over Bb F G Dm. Falls, rests low, then lifts off the B natural.
BREATH = [
    (0.0, 3.0, N("F5")), (3.0, 1.0, N("D5")),        # Bb  the sigh
    (4.0, 2.0, N("C5")), (6.0, 2.0, N("A4")),        # F   down to rest
    (8.0, 1.0, N("B4")),                             # G   <- THE FIRST B NATURAL
    (9.0, 1.0, N("D5")), (10.0, 2.0, N("G5")),       #     and the leap up
    (12.0, 2.0, N("F5")), (14.0, 1.0, N("E5")),
    (15.0, 1.0, N("D5")),                            # Dm  plagal landing
]

# E, bars 16-19 over Dm C Bb C. Same skeleton a fourth higher: the peak.
RETURN = [
    (0.0, 3.0, N("A5")), (3.0, 1.0, N("F5")),
    (4.0, 2.0, N("G5")), (6.0, 2.0, N("E5")),
    (8.0, 1.0, N("D5")), (9.0, 1.0, N("F5")), (10.0, 2.0, N("Bb5")),
    (12.0, 2.0, N("A5")), (14.0, 1.0, N("G5")), (15.0, 1.0, N("F5")),
]

# G, bars 24-27 over F F Dm Dm. The same line in the relative major, an octave
# down and half the weight — the tail remembering the turn on the way home.
LONGWAY = [
    (0.0, 3.0, N("C5")), (3.0, 1.0, N("A4")),
    (4.0, 2.0, N("A4")), (6.0, 2.0, N("F4")),
    (8.0, 1.0, N("D4")), (9.0, 1.0, N("F4")), (10.0, 2.0, N("A4")),
    (12.0, 2.0, N("G4")), (14.0, 1.0, N("F4")), (15.0, 1.0, N("E4")),
]

OSTINATO = (0, 2, 3, 2)   # menu's own figure (root, 5th, octave, 5th)


def build() -> Score:
    s = Score(
        id="intermission",
        title="合間 / Between the Bells",
        mood="downtempo groove, purposeful — the walk back to the fight",
        bpm=music.BPM_BASE,          # 90
        bars=32,                     # 3 763 200 samples = 2 x the pack's loop grid
        key="Dm",
        seed=4409,
        loop=True,
        pump_depth=0.42,
        pump_release=0.19,
        hall=3.3,
        master_air=1.6,
    )
    s.progression(PROG)
    s.gain(choir=1.00, keys=1.08, strings=0.95, drums=0.80, perc=0.85,
           bass=0.92, lead=0.55)

    # ---------------------------------------------------------- the constant
    # The pack's thread — and the one thing this cue is now willing to take
    # away. It runs 0-19, VACATES for the breath (12-15) and for the clearing
    # (20-23), and comes home in the tail. Its absence is the loudest event in
    # the piece.
    s.ostinato((0, 4), voice="piano", shape=OSTINATO, subdiv=8, octave=0,
               gain=0.26, pan=-0.14)
    s.ostinato((4, 8), voice="piano", shape=OSTINATO, subdiv=8, octave=0,
               gain=0.30, pan=-0.14)
    s.ostinato((8, 12), voice="piano", shape=OSTINATO, subdiv=8, octave=0,
               gain=0.33, pan=-0.14)

    # ---------------------------------------------------- 0-3  A  息 settle
    s.choir_pad((0, 4), vowel="oo", dyn=0.38, voices_scale=0.62, effort=0.22,
                gain=0.80)
    s.bass((0, 4), "X.......X.......", octave=-2, style="sub", gain=0.50)
    s.drum("hat", "..o...o...o...o.", (2, 4), gain=0.080, pan=0.20,
           decay=0.032)

    # ------------------------------------------------------ 4-7  B  groove
    s.choir_pad((4, 8), vowel=["oh", "oo", "oh", "ah"], dyn=0.50,
                voices_scale=0.82, effort=0.33, gain=0.92)
    s.chords((4, 8), voice="pad", octave=0, gain=0.18, cutoff=1500.0)
    #      the groove: kick on 1 and the "and" of 2, backbeat on 2 and 4
    s.drum("kick", "X.....x...X.....", (4, 8), gain=0.54, humanize=0.004)
    s.drum("snare", "....X.......X...", (4, 12), gain=0.28, humanize=0.005)
    s.drum("snare", "..o....o..o...o.", (6, 12), gain=0.10, humanize=0.008)
    s.drum("hat", "x.xox.xox.xox.xo", (4, 12), gain=0.100, pan=0.20,
           decay=0.034)
    s.bass((4, 8), "X.....x.X...x...", octave=-2, style="both", gain=0.62,
           cutoff=820.0)

    # ---------------------------------------------------- 8-11  C  the cell
    # ONE statement of HOOK_CELL, on the downbeat of bar 8 (choir_hook repeats
    # every four bars, so an exactly-four-bar range states it once). The second
    # statement is withheld until bar 16.
    s.choir_hook((8, 12), phrase="cell", vowel="ah", dyn=0.76, effort=0.56,
                 voices_scale=0.92, gain=1.02)
    s.chords((8, 12), voice="strings", octave=0, gain=0.42)
    s.arp((8, 12), pattern=(2, 3, 4, 3), subdiv=16, octave=1, gain=0.070,
          voice="pluck", pan=0.32)
    s.drum("kick", "X.....x...X...x.", (8, 12), gain=0.68, humanize=0.004)
    s.bass((8, 12), "X.....x.X...x...", octave=-2, style="both", gain=0.82,
           cutoff=1000.0)
    s.fx("reverse", at_bar=7.0, length_bars=1.0, gain=0.15)

    # ------------------------------------------- 12-15  D  息継ぎ THE BREATH
    # 32.0-42.7 s: the midpoint of the 60 s the player owns. The kit stops, the
    # ostinato stops, the pluck stops. Bars 12-13 are the barest music in the
    # cue — choir, one timpani, a sub on the downbeat and a strings
    # countermelody heard here for the first time — and then bars 14-15 BLOOM
    # on the G: strings and pad arrive with the B natural. Two of the four
    # chords (Bb, G) have never been a 4-bar downbeat in this cue.
    s.choir_pad((12, 14), vowel="ah", dyn=0.52, voices_scale=0.85, effort=0.36,
                gain=0.84)
    s.choir_pad((14, 16), vowel=["ah", "oh"], dyn=0.72, voices_scale=1.0,
                effort=0.55, gain=1.02)
    s.chords((14, 16), voice="strings", octave=0, gain=0.34)
    s.chords((14, 16), voice="pad", octave=0, gain=0.24, cutoff=2400.0)
    s.melody(12, BREATH, voice="strings", bus="lead", gain=0.46, pan=0.10)
    s.bass((12, 14), "X...............", octave=-2, style="sub", gain=0.46)
    s.bass((14, 16), "X.......X.......", octave=-2, style="sub", gain=0.58)
    s.drum("timpani", "X...............", (12, 13), gain=0.22, f0=55.0,
           decay=1.9)
    s.drum("timpani", "X...............", (14, 15), gain=0.20, f0=58.0,
           decay=1.9)
    # the only percussion pickup in the cue: a war-drum figure on the last beat
    # of the breath, announcing the return. It is what makes bar 16 land.
    s.drum("taiko", "............o.x.", (15, 16), gain=0.26, humanize=0.005,
           f0=70.0, decay=0.6)

    # -------------------------------------------------- 16-19  E  the return
    # The peak, and a recontextualisation rather than a repeat: the same
    # countermelody a fourth higher with a supersaw shadowing it an octave
    # down, the taiko finally arriving, and the kick recast half-time so the
    # groove of bars 4-11 comes back changed.
    s.ostinato((16, 20), voice="piano", shape=OSTINATO, subdiv=8, octave=0,
               gain=0.36, pan=-0.14)
    s.choir_hook((16, 20), phrase="cell", vowel="ah", dyn=0.88, effort=0.70,
                 voices_scale=1.0, gain=1.08)
    s.chords((16, 20), voice="strings", octave=0, gain=0.52)
    s.chords((16, 20), voice="pad", octave=-1, gain=0.22, cutoff=1800.0)
    s.melody(16, RETURN, voice="strings", bus="lead", gain=0.46, pan=0.10)
    s.melody(16, [(t, d, m - 12) for (t, d, m) in RETURN], voice="supersaw",
             bus="lead", gain=0.20, detune=0.17, cutoff=5200.0, pan=-0.10)
    s.drum("taiko", "X.......X...X...", (16, 20), gain=0.44, humanize=0.007,
           f0=62.0, decay=1.0)
    s.drum("taiko", "......x.....x...", (18, 20), gain=0.24, humanize=0.007,
           f0=88.0, decay=0.55)
    s.drum("kick", "X.......x...X...", (16, 20), gain=0.74, humanize=0.004)
    s.drum("snare", "....X.......X...", (16, 20), gain=0.28, humanize=0.005)
    s.drum("hat", "x.xox.xox.xox.xo", (16, 20), gain=0.100, pan=0.20,
           decay=0.034)
    s.drum("openhat", "....x.......x...", (17, 19), gain=0.05, pan=-0.22)
    s.bass((16, 20), "X...x.x.X...x.x.", octave=-2, style="both", gain=0.88,
           cutoff=1250.0)

    # ------------------------------------------------ 20-23  F  the clearing
    # THE BELL WINDOW. One taiko full-stop on the downbeat of bar 20 (53.333 s,
    # the last percussion onset in the cue) and then the music gets out of the
    # way: choir + a dark pad + the sub floor, nothing above ~2 kHz, so
    # countTick x4 and countFinal ring into an open room. The player is cut off
    # mid-bar-22, on C.
    s.drum("taiko", "X...............", (20, 21), gain=0.30, humanize=0.0,
           f0=58.0, decay=1.4)
    s.choir_pad((20, 22), vowel=["ah", "oh"], dyn=0.50, voices_scale=0.80,
                effort=0.32, gain=0.82)
    s.choir_pad((22, 24), vowel="oo", dyn=0.36, voices_scale=0.64, effort=0.20,
                gain=0.68)
    s.chords((20, 22), voice="pad", octave=0, gain=0.16, cutoff=950.0)
    s.bass((20, 22), "X...............", octave=-2, style="sub", gain=0.46)
    s.bass((22, 24), "X...............", octave=-2, style="sub", gain=0.38)

    # -------------------------------------------- 24-27  G  the long way i
    # Not heard under today's 60 s clock. F major — the relative major, the one
    # colour the cue has never used — with the countermelody an octave down.
    s.ostinato((24, 28), voice="piano", shape=OSTINATO, subdiv=8, octave=0,
               gain=0.24, pan=-0.14)
    s.choir_pad((24, 28), vowel=["oo", "oo", "oh", "oh"], dyn=0.50,
                voices_scale=0.80, effort=0.30, gain=0.94)
    s.chords((24, 28), voice="strings", octave=0, gain=0.30)
    s.melody(24, LONGWAY, voice="strings", bus="lead", gain=0.30, pan=-0.08)
    s.bass((24, 28), "X.......X...x...", octave=-2, style="sub", gain=0.60)
    s.drum("taiko", "X...............", (24, 25), gain=0.28, humanize=0.006,
           f0=66.0, decay=1.1)
    s.drum("hat", "..o...o...o...o.", (25, 28), gain=0.075, pan=0.20,
           decay=0.032)

    # ------------------------------------------- 28-31  H  the long way ii
    # Bb-G-C-C: the dorian IV is quoted once more and then the cue steps down
    # into bar 0 instead of slamming into it — bar 31 drops to sub + choir, so
    # the join lands on a sparse head from a sparse tail.
    s.ostinato((28, 32), voice="piano", shape=OSTINATO, subdiv=8, octave=0,
               gain=0.30, pan=-0.14)
    s.choir_pad((28, 32), vowel=["ah", "ah", "oh", "ah"], dyn=0.62,
                voices_scale=0.90, effort=0.42, gain=1.00)
    s.chords((28, 32), voice="pad", octave=0, gain=0.22, cutoff=1500.0)
    s.chords((30, 32), voice="strings", octave=0, gain=0.32)
    s.drum("hat", "x.xox.xox.xox.xo", (28, 31), gain=0.100, pan=0.20,
           decay=0.034)
    s.drum("kick", "X.....x...X.....", (29, 31), gain=0.58, humanize=0.004)
    s.drum("snare", "....X.......X...", (30, 31), gain=0.24, humanize=0.005)
    s.bass((28, 31), "X.....x.X...x...", octave=-2, style="both", gain=0.70,
           cutoff=900.0)
    s.bass((31, 32), "X.......X.......", octave=-2, style="sub", gain=0.58)
    s.drum("snare", "..........o.o.x.", (31, 32), gain=0.16, humanize=0.004)
    s.fx("sweepdown", at_bar=31.0, length_bars=1.0, gain=0.12)

    # ------------------------------------------------------ 32  the loop join
    # Bar 32 is bar 0 (champSelect's convention). The renderer cuts the body at
    # bar 32 and crossfades the 0.3 s that follows onto the head, so making
    # bar 32 bar 0's own material is what stops the join from dipping.
    s.ostinato((32, 33), voice="piano", shape=OSTINATO, subdiv=8, octave=0,
               gain=0.26, pan=-0.14)
    s.choir_pad((32, 33), vowel="oo", dyn=0.44, voices_scale=0.68, effort=0.24,
                gain=0.92)
    s.bass((32, 33), "X.......X.......", octave=-2, style="sub", gain=0.58)
    return s
