"""combat — 「戦域 II / Contested Ground — The Turn」 : 48 bars @ 135 bpm.

48 bars = 3 763 200 samples = 85.333 s = 2 x the pack's 1 881 600-sample loop
GRID. The grid is the invariant, not the length: 32 @90 = 48 @135 = 24 @67.5 =
96 @180 all land on the same sample count, so a doubled track stays phase-
compatible with every 1x track in the pack (see music.py).

THIS CUE IS HEARD THROUGH A 60-SECOND WINDOW, NOT AS A LOOP.
`scene.ts` swaps the bed to `fireRing` at 30 s left of a 90 s round
(`combatMaxSec: 90`, config.match.json), and `AudioSystem.swapBed` restarts
every bed at sample 0 on scene entry. So the player hears AT MOST bars 0-33.75
(60.0 s), roughly seven times a match, and the round can end early the moment
every duel has a winner (MatchController) — exposure is 20-60 s and variable.

    THE HARD RULE THAT FOLLOWS: NO LAYER MAKES ITS FIRST APPEARANCE AFTER
    BAR 33. Bars 34-47 may only re-use, resolve and reassemble. A debut
    nobody hears is not a debut.

That is why the new section is at BAR 16, not appended to the end. "Add a B
section after the old ending" would have written 24 bars of music the player
can never reach. Every debut in this score is at or before bar 33 — snare 16,
guitar 16, strings 16, the shadow line 16, `reverse` 27, the 16th hats 28, the
fill 31, the pad 32, `sweepdown` 33 — and bars 34-47 contain no sound, no
pattern and no timbre the first 34 bars have not already stated.

WHY THE OLD 24 BARS FATIGUED (measured, not felt): 13 of 25 layers entered in
bars 0-7 and everything was on the table by bar 16; only bars 12-13 were new
material against anything earlier; mean self-similarity at a 4-bar lag was
+0.928, i.e. the 4-bar unit was almost as repetitive as the 1-bar unit; and
LRA was 2.2 LU, the flattest in the pack. Nothing was withheld and the mix
never left a 3 dB corridor. The fix is not "more bars of the same" — it is a
section that contradicts the groove, and a dynamic floor to fall to.

Shape (48 bars = 85.333 s, seamless):
  bars    s            section
  0-3     0.0-7.1    A0 the frame   groove only, under the battleStart sting
                                    (0-7.494 s). The least characterful music
                                    in the track because it is the MOST heard.
  4-7     7.1-14.2   A1 the bed     lands exactly as the sting's tail dies:
                                    choir "ah", chant, supersaw stabs, openhat
  8-11    14.2-21.3  B  the lift    sopranos sing the hook fragment, supersaw
                                    doubles an 8ve down. NO guitar, NO strings
                                    — the lift is choir-led, so the turn can
                                    own those two colours.
  12-13   21.3-24.9  -- THE HOLE    kit out; "oo" + ostinato + one pluck figure
                                    + one bar of sub + downlifter. Kept
                                    verbatim: it is the measured fatigue-
                                    breaker. Do not touch it.
  14-15   24.9-28.4  -- rebuild     kit back, riser retuned DARK (200-3000 Hz)
                                    so bar 16 is not announced as a lift
  16-19   28.4-35.6  T  「翳」THE TURN  half-time + D dorian. See below.
  20-23   35.6-42.7  T' the way back ostinato in 16THS, the shadow line's
                                    second statement, Bb C Bb C (NO TONIC for
                                    four bars), taiko roll accelerates, riser
                                    22-23, NO KICK IN BAR 23
  24-27   42.7-49.8  R  THE RETURN  home cadence, four-on-the-floor, the hook
                                    fragment again — now answered by the
                                    STRINGS instead of by a choir sustain
  28-31   49.8-56.9  P  the peak    everything at once; the shadow line climbs
                                    to its top (A5); 16th hats; fill on 31
  32-33   56.9-60.4  -- the descent kick and clap out, choir + strings + sub
                                    sustain. fireRing takes over at 60.0 s =
                                    bar 33.75, so in a full-length round the
                                    floor drops out exactly as the tension bed
                                    enters. Nothing breaks if the round ends
                                    early — the descent is a landing, not a
                                    cliff.
  34-35   60.4-64.0  -- descent ii  ---- from here on nobody in a match ever
                                    hears a note ----
  36-43   64.0-78.2  S  the synthesis  Dm G Bb C x2: the turn's chord folded
                                    INSIDE the home cadence, at half power,
                                    distant choir, the turn's beat-3 snare
                                    kept. The shadow line's epilogue is the
                                    only place the MELODY sings the raised 6th.
  44-47   78.2-85.3  -- the run home bar 0's texture reassembles one element
                                    per bar: 44 kick+ostinato+bass+"oo",
                                    45 +clap, 46 +hat+taiko+chant,
                                    47 = bar 0's full texture + the snare fill
                                    INTO the bar line
  48                 mirror bar     bar 0's material, for the join

THE TURN 「翳 / The Shadow Turns」 (bars 16-19). Two things happen on the same
downbeat and they contradict each other.

  (a) THE METRE HALVES. Kick to 1 and 3; the backbeat moves from 2 & 4 to
      BEAT 3 (snare — its first appearance in the track); the taiko plays ONCE
      A BAR at the track's largest gain; the hats stop entirely; and the piano
      ostinato — which in the shipped 24-bar version played 24 bars out of 24,
      the single most-repeated element in the whole pack — STOPS for the first
      time in this track's life.
      The pump does the rest for free: `pump_envelope` is built from the kicks
      the scheduler recorded, so halving the kick rate lets the 0.155 s release
      fully recover between hits. The choir and pads stop chugging and start
      heaving. One pattern edit, whole-mix consequence.

  (b) THE HARMONY BRIGHTENS. `Dm | G | Dm | G`. G major is the RAISED 6TH —
      D dorian, explicitly sanctioned by music.py and used NOWHERE ELSE in the
      pack: every progression in music.py is flat-side only (Dm/Bb/F/C). Four
      bars in, the Bb vanishes and a B natural appears.

  The ear has had sixteen bars of a flat-side 4-bar cycle at a constant 4/4
  pulse, rising. Bar 16 is where the next LIFT is due. Instead the floor halves
  and the light changes — heavier groove, brighter harmony — a combination this
  bed has never played. Forward motion survives because the taiko and the
  guitar get BIGGER, not smaller, so a round that ends inside the bridge does
  not end on a whimper.

  (c) ONE NEW TIMBRE ARRIVES WITH IT: the guitar, as long power chords rather
      than the 8th-note chug it used to play at bars 8-11. It is withheld from
      every bar before 16 so the turn owns a colour. The strings and the shadow
      line arrive on the same downbeat, for the same reason.

  The recolouring is nearly free because of how `ostinato()` and `chords()`
  work: `shape` indexes CHORD TONES, so the same figure over G plays G-D-G-D
  instead of D-A-D-A, and `voice_satb("G")` re-voices the choir automatically.
  One 48-entry progression list changes the colour of every tonal layer at once.

WHY THE RETURN LANDS (bar 24 = 42.7 s), six mechanisms, none of them "louder":
  1. TONIC ABSENCE. Bars 20-23 (Bb C Bb C) never state D minor. The tonic had
     been on every 4-bar downbeat for twenty bars; four bars without it is the
     longest tonic absence anywhere in the pack.
  2. THE THREAD BREAKS AND RE-FORMS. The ostinato is silent 16-19, doubles to
     16ths 20-23, and returns at 24 in its original 8ths. The ear identifies
     home by the FIGURE before it identifies the chord.
  3. METRIC RESTORATION. Half-time -> build -> four-on-the-floor.
  4. THE PUMP GAP. No kick in bar 23, so the duck fully releases and bar 24's
     downbeat is the first kick the ear has waited for.
  5. THE HOOK RETURNS, ANSWERED. Bars 24-25 restate the fragment; bars 26-27
     answer it with the shadow line on strings — the turn's voice speaking
     inside the home cadence, which is what makes the coda's synthesis legible.
  6. THE RISER IS TWO BARS, not one, and starts on the bar the taiko roll
     starts accelerating.

HARMONY  a 48-entry progression, one chord per bar. `Score.chord_at` wraps on
`len(prog)`, so `len(PROG) == bars` also makes the mirror bar 48 wrap to bar
0's Dm by construction. Every `bar % 4 == 0` is Dm EXCEPT bar 20 — that is the
point of bar 20.

THE HOOK  bars 8-9 and 24-25 only. `choir_hook` over a two-bar range renders
exactly the first half of HOOK_A (the A4-D5-F5 call and its E5-D5-C5 answer)
and drops the rest, which is the fragment the reprise plan allots to combat.
The whole phrase is never stated here; menu/victory/settlement state it.
The SHADOW LINE is new material for this cue, not the hook.

THE PLUCK  the mid-high Karplus arp that the user rejected as 「丟丟丟」 in
fireRing and room ran 20 of 24 bars here. It now runs 16 of 48 (bars 4-11 as
before, 12-15 inside the hole where it is structural, and 28-31 at the peak) —
a strictly smaller share of the track, and it is kept OUT of the turn, which
belongs to the guitar. NO CYMBAL ANYWHERE, at any gain.
"""

from ggd import intro, music
from ggd.score import Score

N = music.note

OSTINATO = (0, 2, 3, 2)   # the pack's ostinato shape, straight off menu

# One symbol per bar; len(PROG) == bars, so bar 48 wraps to bar 0's chord.
PROG = (["Dm", "Bb", "F", "C"] * 4      # 0-15   HOME, the anthem cadence
        + ["Dm", "G", "Dm", "G"]        # 16-19  THE TURN — the raised 6th
        + ["Bb", "C", "Bb", "C"]        # 20-23  the way back; NO TONIC
        + ["Dm", "Bb", "F", "C"] * 3    # 24-35  the return, the peak, descent
        + ["Dm", "G", "Bb", "C"] * 2    # 36-43  the synthesis: turn + home
        + ["Dm", "Bb", "F", "C"])       # 44-47  the run home; C -> bar 0's Dm
assert len(PROG) == 48, len(PROG)

# ---------------------------------------------------------------- THE SHADOW LINE
#
# New material for combat — NOT the hook. Where HOOK_A is high (D5-A5), bright
# and triadic, this sits a full octave lower (D4-D5), moves in half-notes, and
# opens with a THREE-BEAT note: it is the half-time voice. Its shape is
# 3+1 / 2+2 / 3+1 / 2+2 and it is reused in all four statements, so the return
# and the coda read as the same voice speaking again rather than as new tunes.
# (beat, beats, midi) relative to the section's first bar.

# 1st statement, bars 16-19 over Dm G Dm G. NO B NATURAL in the melody yet —
# the raised 6th is in the CHORD only, so the harmony changes colour before
# the tune admits it.
SHADOW_1 = [
    (0.0, 3.0, N("D4")), (3.0, 1.0, N("F4")),        # Dm  heavy, low, patient
    (4.0, 2.0, N("G4")), (6.0, 2.0, N("A4")),        # G   lifts over the light
    (8.0, 3.0, N("F4")), (11.0, 1.0, N("E4")),       # Dm  falls further than it rose
    (12.0, 2.0, N("G4")), (14.0, 2.0, N("D5")),      # G   leaps the octave, open
]

# 2nd statement, bars 20-23 over Bb C Bb C. The same shape a third higher over
# a progression with no tonic in it.
SHADOW_2 = [
    (0.0, 3.0, N("F4")), (3.0, 1.0, N("A4")),        # Bb
    (4.0, 2.0, N("C5")), (6.0, 2.0, N("D5")),        # C
    (8.0, 3.0, N("A4")), (11.0, 1.0, N("G4")),       # Bb
    (12.0, 2.0, N("C5")), (14.0, 2.0, N("E5")),      # C   hangs on the 3rd
]

# The ANSWER, bars 26-27 over F C — the head of the shape, inside the home
# cadence, where a choir sustain used to be. Lands on D to pull into bar 28.
SHADOW_ANSWER = [
    (0.0, 3.0, N("A4")), (3.0, 1.0, N("C5")),        # F
    (4.0, 2.0, N("E5")), (6.0, 2.0, N("D5")),        # C
]

# 3rd statement, bars 28-31 over Dm Bb F C — an octave up, and it climbs to its
# top note (A5, the same ceiling HOOK_A reaches) without ever quoting the hook.
SHADOW_3 = [
    (0.0, 3.0, N("D5")), (3.0, 1.0, N("F5")),        # Dm
    (4.0, 2.0, N("G5")), (6.0, 2.0, N("A5")),        # Bb  the top
    (8.0, 2.0, N("F5")), (10.0, 2.0, N("E5")),       # F
    (12.0, 1.0, N("D5")), (13.0, 1.0, N("E5")),      # C
    (14.0, 2.0, N("A5")),                            #     the top again, held
]

# The EPILOGUE, bars 36-43 over Dm G Bb C x2 — the only place the MELODY sings
# the raised 6th (B4, bars 37 and 41). Unheard in a match; it is what makes the
# audition page and the credits a complete piece rather than a truncation.
SHADOW_EPILOGUE = [
    (0.0, 2.0, N("D5")), (2.0, 2.0, N("F5")),        # 36 Dm
    (4.0, 2.0, N("B4")), (6.0, 2.0, N("D5")),        # 37 G   <- THE RAISED 6TH
    (8.0, 3.0, N("C5")), (11.0, 1.0, N("A4")),       # 38 Bb
    (12.0, 4.0, N("G4")),                            # 39 C
    (16.0, 2.0, N("A4")), (18.0, 2.0, N("D5")),      # 40 Dm
    (20.0, 1.0, N("B4")), (21.0, 1.0, N("D5")),      # 41 G   <- and again
    (22.0, 2.0, N("G5")),                            #        then the leap
    (24.0, 2.0, N("F5")), (26.0, 2.0, N("E5")),      # 42 Bb
    (28.0, 4.0, N("D5")),                            # 43 C   tonic over dominant
]


def build() -> Score:
    s = Score(
        id="combat",
        title="戦域 II / Contested Ground — The Turn (battle)",
        mood="driving, relentless, listenable for minutes — the workhorse loop",
        bpm=music.BPM_DRIVE,          # 135
        bars=48,                      # 3 763 200 samples = 2 x the loop grid
        key="Dm",
        seed=5206,
        loop=True,
        pump_depth=0.50,
        pump_release=0.155,
        hall=3.1,
    )
    s.progression(PROG)
    s.gain(choir=1.05, keys=1.05, lead=1.05, strings=1.15, gtr=1.25, pad=1.15,
           perc=1.10)

    # ---------------------------------------------------- SIGNATURE INTRO (#135)
    # A single bright STEEL blade-ring on the pickup — a flash, not a phrase,
    # ringing into bar 0's first kick. Deliberately tiny (<=0.5 s): bars 0-3 are
    # the most-heard music in the game and restart ~7x/match, so the signature
    # must not fatigue on the 7th replay. Bar 0's bed is untouched, so the loop
    # join stays mirror-safe. The only bright-steel zing in the pack. intro.py.
    s.custom("fx", intro.combat)

    # ======================================================= THE PIANO THREAD
    # Present for 40 of the 48 bars, and its two absences are the two structural
    # events: bars 16-19 (the turn takes it away) and 34-35 (the floor).
    s.ostinato((0, 12), voice="piano", shape=OSTINATO, subdiv=8, octave=0,
               gain=0.34, pan=-0.15)
    s.ostinato((12, 16), voice="piano", shape=OSTINATO, subdiv=8, octave=0,
               gain=0.40, pan=-0.15)
    # 16-19: SILENT. The thread breaks.
    # 20-23: it comes back DOUBLED — same figure, 16ths — which is what makes
    # bar 24's return to 8ths read as "home" before the chord does.
    s.ostinato((20, 24), voice="piano", shape=OSTINATO, subdiv=16, octave=0,
               gain=0.30, pan=-0.15)
    s.ostinato((24, 32), voice="piano", shape=OSTINATO, subdiv=8, octave=0,
               gain=0.38, pan=-0.15)
    s.ostinato((32, 34), voice="piano", shape=OSTINATO, subdiv=8, octave=0,
               gain=0.30, pan=-0.15)
    # 34-35: SILENT. The lowest point in the track.
    s.ostinato((36, 44), voice="piano", shape=OSTINATO, subdiv=8, octave=0,
               gain=0.28, pan=-0.15)
    s.ostinato((44, 48), voice="piano", shape=OSTINATO, subdiv=8, octave=0,
               gain=0.34, pan=-0.15)

    # ========================================================= 0-3  A0 the frame
    s.drum("kick", "X...X...X...X...", (0, 12), gain=0.90)
    s.drum("hat", "xoxoxoxoxoxoxoxo", (0, 8), gain=0.17, pan=0.20, decay=0.030)
    s.drum("clap", "....X.......X...", (0, 12), gain=0.34, humanize=0.002)
    s.bass((0, 4), "X...X..xX...X...", octave=-2, style="both", gain=0.80,
           cutoff=1200.0)
    # the low chant is the engine's "choir stab": tenor+bass, short, rhythmic
    s.choir_chant((0, 4), pattern="....X.......X...", vowel="uh", dyn=0.80,
                  parts=("tenor", "bass"), length=0.55, gain=0.92)
    s.drum("taiko", "X.......X.......", (0, 4), gain=0.38, humanize=0.007)
    # a low bed under the stabs so the choir is present from bar 0, not just
    # on the backbeat — without it the first four bars are pure kit
    s.choir_pad((0, 4), vowel="oo", dyn=0.50, effort=0.26, voices_scale=0.85,
                parts=("alto", "tenor", "bass"), gain=0.85)

    # ====================================================== 4-7  A1 the bed lands
    s.choir_pad((4, 8), vowel=["ah", "ah", "oh", "ah"], dyn=0.66, effort=0.52,
                parts=("soprano", "alto"), voices_scale=0.9, gain=0.95)
    s.choir_chant((4, 8), pattern="....X.......X..x", vowel="uh", dyn=0.84,
                  parts=("tenor", "bass"), length=0.55, gain=0.95)
    s.chords((4, 12), voice="supersaw", octave=-1, gain=0.48,
             rhythm="X.......X...X...", hit_beats=1.6, cutoff=3400.0)
    s.bass((4, 8), "X...X..xX...X..x", octave=-2, style="both", gain=0.82,
           cutoff=1400.0)
    s.drum("openhat", "..x...x...x...x.", (4, 12), gain=0.10, pan=-0.22)
    s.arp((4, 12), pattern=(2, 3, 4, 3), subdiv=16, octave=1, gain=0.10,
          voice="pluck", pan=0.34)

    # ========================================================== 8-11  B the lift
    # Choir-led on purpose: no guitar and no strings until bar 16, so the turn
    # gets two timbres the player has not heard from this bed.
    # Taking the guitar and the strings out of the lift left bars 0-11 flat
    # (measured: 1.49 dB across twelve bars, so a 3 s window never moved 1.5 dB
    # in the first 20 s — the most-heard 20 s in the game). The answer is not to
    # give the guitar back; it is to let the CHOIR be biggest where the choir is
    # the point. The hook now carries the lift on its own.
    s.choir_hook((8, 10), phrase="A", vowel="ah", dyn=0.96, effort=0.86,
                 gain=1.12)
    s.lead((8, 10), phrase="A", octave=-1, voice="supersaw", gain=0.42,
           detune=0.19, cutoff=8000.0)
    s.choir_pad((10, 12), vowel="ah", dyn=0.80, effort=0.66, gain=0.98)
    s.drum("hat", "xoxoxoxoxoxoxoxo", (8, 12), gain=0.19, pan=0.20, decay=0.028)
    s.drum("taiko", "X.......X...X...", (8, 12), gain=0.52, humanize=0.006)
    s.bass((8, 12), "X...X...X...X...", octave=-2, style="both", gain=0.90,
           cutoff=1600.0)

    # ================================================= 12-13 THE HOLE, 14-15 back
    s.choir_pad((12, 14), vowel="oo", dyn=0.62, effort=0.30, voices_scale=0.85,
                gain=1.00)
    s.bass((12, 13), "X.......X.......", octave=-2, style="sub", gain=0.60)
    s.drum("hat", "..x...x...x...x.", (12, 13), gain=0.07, pan=0.20, decay=0.030)
    s.arp((12, 16), pattern=(0, 2, 3, 4), subdiv=16, octave=1, gain=0.13,
          voice="pluck", pan=0.30)
    s.fx("downlifter", at_bar=12.0, length_bars=1.0, gain=0.16)

    s.choir_pad((14, 16), vowel="ah", dyn=0.82, effort=0.66, gain=1.00)
    s.drum("kick", "X...X...X...X...", (14, 16), gain=0.92)
    s.drum("clap", "....X.......X...", (14, 16), gain=0.36, humanize=0.002)
    s.drum("hat", "xoxoxoxoxoxoxoxo", (14, 16), gain=0.19, pan=0.20, decay=0.028)
    s.bass((14, 16), "X...X..xX...X..x", octave=-2, style="both", gain=0.86,
           cutoff=1500.0)
    s.drum("taiko", "X.......X.......", (14, 15), gain=0.44, humanize=0.006)
    s.drum("taiko", "X...X...X..xX.x.", (15, 16), gain=0.50, humanize=0.006)
    # RETUNED DARK. The old riser ran 400-8000 Hz and announced a LIFT; this one
    # tops out at 3 kHz so bar 16 arrives as a weight, not as a brightening.
    s.fx("riser", at_bar=15.0, length_bars=1.0, gain=0.24, f_lo=200.0,
         f_hi=3000.0)

    # ==================================================== 16-19  T  「翳」THE TURN
    s.fx("impact", at_bar=16.0, length_bars=1.0, gain=0.30)
    # (a) the metre halves — kick on 1 and 3, the backbeat moves to BEAT 3
    s.drum("kick", "X.......X.......", (16, 20), gain=0.92)
    s.drum("snare", "........X.......", (16, 20), gain=0.42, humanize=0.003)
    #     the taiko once a bar, at the largest gain in the track
    s.drum("taiko", "X...............", (16, 20), gain=0.58, humanize=0.004)
    #     NO HATS, NO CLAP, NO OSTINATO, NO PLUCK in these four bars.
    s.bass((16, 20), "X.......X.......", octave=-2, style="both", gain=0.80,
           cutoff=900.0)
    # (b) the harmony brightens — PROG puts Dm G Dm G under all of this
    s.choir_pad((16, 20), vowel="ah", dyn=0.78, effort=0.66, gain=0.74)
    s.choir_chant((16, 20), pattern="X.......X.......", vowel="oh", dyn=0.84,
                  parts=("tenor", "bass"), length=1.10, gain=0.60)
    # (c) the guitar's debut: LONG power chords, not the 8th-note chug.
    #     NO string PAD here either — the shadow line is the only strings in
    #     these four bars, so the new tune is heard, not accompanied.
    s.chords((16, 20), voice="guitar", octave=-1, gain=0.50,
             rhythm="X.......X.......", hit_beats=2.2)
    s.melody(16, SHADOW_1, voice="strings", bus="strings", gain=0.30,
             cutoff=3800.0, attack=0.06, pan=-0.10)
    # LEVEL, and why "heavier but quieter" is not a contradiction. The turn has
    # the biggest single hits in the track — taiko 0.58, the largest taiko gain
    # anywhere here; a kick alone on 1 and 3; an impact on the downbeat — and
    # the LOWEST section RMS outside the hole and the descent, because half-time
    # means fewer of them with real silence in between.
    #   MEASURED, final render: bars 16-19 average -19.35 dBFS against -19.03
    #   for the A material, with a crest factor of 12.43 dB against 12.29 —
    #   quieter bars, bigger peaks. The step from bar 15 into bar 16 is -1.04 dB.
    # This is not cosmetic. The FIRST render of this score filled those gaps
    # with a string pad, a louder choir and long guitar, and the whole stretch
    # from bar 14 to bar 31 then held inside 1.5 dB for 30.6 s straight — worse
    # than the 24-bar version's 15.3 s, i.e. the extension had made the fatigue
    # WORSE. Sustain in the gaps is what turns a heave into a drone.

    # ================================================== 20-23  T'  the way back
    s.melody(20, SHADOW_2, voice="strings", bus="strings", gain=0.36,
             cutoff=4200.0, attack=0.05, pan=-0.10)
    # T' is a RAMP, so every sustaining layer is written as two calls with the
    # second louder — the section climbs out of the turn instead of switching on
    s.chords((20, 22), voice="strings", octave=0, gain=0.40)
    s.chords((22, 24), voice="strings", octave=0, gain=0.66)
    # the guitar goes back to the chug — that is the acceleration, not a riser
    s.chords((20, 22), voice="guitar", octave=-1, gain=0.38,
             rhythm="x.x.x.x.x.x.x.x.", hit_beats=0.45)
    s.chords((22, 24), voice="guitar", octave=-1, gain=0.66,
             rhythm="x.x.x.x.x.x.x.x.", hit_beats=0.45)
    s.choir_pad((20, 22), vowel="oh", dyn=0.68, effort=0.52,
                parts=("soprano", "alto"), voices_scale=0.9, gain=0.66)
    s.choir_pad((22, 24), vowel="oh", dyn=0.80, effort=0.64,
                parts=("soprano", "alto"), voices_scale=0.9, gain=0.94)
    s.choir_chant((20, 23), pattern="....X.......X...", vowel="uh", dyn=0.82,
                  parts=("tenor", "bass"), length=0.55, gain=0.92)
    s.drum("hat", "xoxoxoxoxoxoxoxo", (20, 22), gain=0.12, pan=0.20, decay=0.028)
    s.drum("hat", "xoxoxoxoxoxoxoxo", (22, 24), gain=0.19, pan=0.20, decay=0.028)
    s.drum("clap", "....X.......X...", (20, 22), gain=0.26, humanize=0.002)
    s.drum("clap", "....X.......X...", (22, 24), gain=0.36, humanize=0.002)
    s.drum("snare", "........X.....x.", (20, 23), gain=0.44, humanize=0.003)
    s.drum("kick", "X.......X.......", (20, 22), gain=0.96)
    s.drum("kick", "X...X.......X...", (22, 23), gain=0.96)
    # BAR 23: NO KICK. The pump fully releases for one bar, so bar 24's downbeat
    # is the first kick the ear has been made to wait for.
    s.bass((20, 24), "X...X.......X...", octave=-2, style="both", gain=0.90,
           cutoff=1300.0)
    # the taiko roll accelerates across four bars into the return
    s.drum("taiko", "X.......X.......", (20, 21), gain=0.44, humanize=0.006)
    s.drum("taiko", "X...X...X...X...", (21, 22), gain=0.48, humanize=0.006)
    s.drum("taiko", "X..xX..xX..xX..x", (22, 23), gain=0.50, humanize=0.005)
    s.drum("taiko", "X.xXx.XxX.xXxXXx", (23, 24), gain=0.52, humanize=0.004)
    s.fx("riser", at_bar=22.0, length_bars=2.0, gain=0.26, f_lo=400.0,
         f_hi=8000.0)

    # ==================================================== 24-27  R  THE RETURN
    s.fx("impact", at_bar=24.0, length_bars=1.0, gain=0.38)
    s.choir_hook((24, 26), phrase="A", vowel="ah", dyn=0.95, effort=0.85,
                 gain=1.02)
    s.lead((24, 26), phrase="A", octave=-1, voice="supersaw", gain=0.32,
           detune=0.20, cutoff=8600.0)
    # THE ANSWER: where bars 10-11 gave the hook a choir sustain, bars 26-27
    # give it the shadow line — the turn's voice, now inside the home cadence.
    s.melody(26, SHADOW_ANSWER, voice="strings", bus="strings", gain=0.32,
             cutoff=4400.0, attack=0.05, pan=0.12)
    s.choir_pad((26, 28), vowel="ah", dyn=0.80, effort=0.66, gain=0.88)
    s.chords((24, 26), voice="strings", octave=0, gain=0.66)
    s.chords((26, 28), voice="strings", octave=0, gain=0.50)
    s.chords((28, 32), voice="strings", octave=0, gain=0.70)
    s.drum("kick", "X...X...X...X...", (24, 32), gain=0.94)
    s.drum("clap", "....X.......X...", (24, 32), gain=0.36, humanize=0.002)
    s.drum("hat", "xoxoxoxoxoxoxoxo", (24, 26), gain=0.19, pan=0.20, decay=0.028)
    s.drum("hat", "xoxoxoxoxoxoxoxo", (26, 28), gain=0.13, pan=0.20, decay=0.028)
    s.drum("openhat", "..x...x...x...x.", (24, 32), gain=0.10, pan=-0.22)
    # the taiko sits OUT of 26-27 so the strings answer has the floor: bars
    # 26-27 are the dip that lets the peak at 28 read as a peak
    s.drum("taiko", "X...X...X...X...", (24, 26), gain=0.50, humanize=0.005)
    s.bass((24, 32), "X...X...X...X...", octave=-2, style="both", gain=0.92,
           cutoff=1800.0)
    s.fx("reverse", at_bar=27.0, length_bars=1.0, gain=0.20)

    # ====================================================== 28-31  P  the peak
    s.melody(28, SHADOW_3, voice="strings", bus="strings", gain=0.34,
             cutoff=5200.0, attack=0.05, pan=-0.08)
    s.melody(28, [(t, d, m - 12) for (t, d, m) in SHADOW_3], voice="supersaw",
             bus="lead", gain=0.20, detune=0.20, cutoff=7200.0, pan=0.10)
    s.choir_pad((28, 32), vowel="ah", dyn=0.96, effort=0.88, gain=1.12)
    s.choir_chant((28, 32), pattern="X...X...X...X..x", vowel="oh", dyn=0.88,
                  parts=("tenor", "bass"), length=0.42, gain=0.88)
    s.chords((28, 32), voice="guitar", octave=-1, gain=0.74,
             rhythm="x.x.x.x.x.x.x.x.", hit_beats=0.45)
    # 16th hats — the only bars in the track with a 16th top line
    s.drum("hat", "XxxxXxxxXxxxXxxx", (28, 32), gain=0.21, pan=0.20, decay=0.026)
    s.drum("taiko", "X...X...X..xX.x.", (28, 32), gain=0.56, humanize=0.005)
    s.arp((28, 32), pattern=(2, 3, 4, 3), subdiv=16, octave=1, gain=0.10,
          voice="pluck", pan=0.34)
    s.drum("snare", "............oxXX", (31, 32), gain=0.32)

    # ================================================= 32-35  the descent
    # fireRing takes the bed at 60.0 s = bar 33.75. The floor drops out on the
    # bar the tension cue arrives, and nothing breaks if the round ends early.
    s.choir_pad((32, 36), vowel=["ah", "ah", "oo", "oo"], dyn=0.72, effort=0.50,
                gain=1.00)
    s.chords((32, 36), voice="strings", octave=0, gain=0.58)
    # the pad debuts on bar 32 — the last bar the player reliably hears — so
    # the coda that leans on it is made of a colour already in the room
    s.chords((32, 44), voice="pad", octave=0, gain=0.42, cutoff=2400.0)
    s.bass((32, 36), "X...............", octave=-2, style="sub", gain=0.66)
    s.drum("hat", "..x...x...x...x.", (32, 33), gain=0.10, pan=0.20, decay=0.030)
    s.drum("taiko", "X...............", (32, 33), gain=0.40, humanize=0.006)
    s.fx("downlifter", at_bar=32.0, length_bars=1.0, gain=0.18)
    s.fx("sweepdown", at_bar=33.0, length_bars=1.0, gain=0.14)

    # ================================================ 36-43  S  the synthesis
    # Dm G Bb C x2 — the turn's chord folded inside the home cadence, at half
    # power, with the turn's beat-3 snare kept. Nothing debuts here.
    s.melody(36, SHADOW_EPILOGUE, voice="strings", bus="strings", gain=0.30,
             cutoff=4000.0, attack=0.07, pan=-0.10)
    s.choir_pad((36, 44), vowel=["oo", "ah", "oo", "ah"], dyn=0.60, effort=0.38,
                voices_scale=0.9, gain=0.92)
    s.chords((36, 44), voice="strings", octave=0, gain=0.55)
    s.chords((36, 44), voice="pad", octave=0, gain=0.42, cutoff=2400.0)
    s.drum("kick", "X.......X.......", (36, 44), gain=0.72)
    s.drum("snare", "........X.......", (36, 44), gain=0.30, humanize=0.003)
    s.drum("taiko", "X.......X.......", (36, 44), gain=0.34, humanize=0.007)
    s.bass((36, 44), "X.......X.......", octave=-2, style="both", gain=0.78,
           cutoff=1100.0)

    # ================================================== 44-47  the run home
    # One element per bar until bar 47 is bar 0's texture again.
    s.drum("kick", "X...X...X...X...", (44, 48), gain=0.90)
    s.bass((44, 48), "X...X..xX...X...", octave=-2, style="both", gain=0.80,
           cutoff=1200.0)
    s.choir_pad((44, 48), vowel="oo", dyn=0.50, effort=0.26, voices_scale=0.85,
                parts=("alto", "tenor", "bass"), gain=0.85)
    s.drum("clap", "....X.......X...", (45, 48), gain=0.34, humanize=0.002)
    s.drum("hat", "xoxoxoxoxoxoxoxo", (46, 48), gain=0.17, pan=0.20, decay=0.030)
    s.drum("taiko", "X.......X.......", (46, 48), gain=0.38, humanize=0.007)
    s.choir_chant((46, 48), pattern="....X.......X...", vowel="uh", dyn=0.80,
                  parts=("tenor", "bass"), length=0.55, gain=0.92)
    # The fill runs all the way into the bar line on purpose. Measured both
    # ways: stopping a 16th short leaves the seam more exposed (join RMS step
    # -1.16 dB instead of -1.02, and the sample either side of the join jumps
    # 0.052 instead of 0.003), because the snare tail is what carries the ear
    # across the join. A fill INTO the loop point is also just how the figure
    # should be played.
    s.drum("snare", "............oxXX", (47, 48), gain=0.32)
    s.fx("sweepdown", at_bar=47.0, length_bars=1.0, gain=0.18)

    # ====================================================== 48  the loop join
    # Bar 48's material is bar 0's, so the 0.3 s crossfade lands music on music.
    # PROG[48 % 48] == "Dm" by construction. See scores/champSelect.py.
    s.ostinato((48, 49), voice="piano", shape=OSTINATO, subdiv=8, octave=0,
               gain=0.34, pan=-0.15)
    s.drum("kick", "X...X...X...X...", (48, 49), gain=0.90)
    s.drum("hat", "xoxoxoxoxoxoxoxo", (48, 49), gain=0.17, pan=0.20, decay=0.030)
    s.drum("clap", "....X.......X...", (48, 49), gain=0.34, humanize=0.002)
    s.bass((48, 49), "X...X..xX...X...", octave=-2, style="both", gain=0.80,
           cutoff=1200.0)
    s.choir_chant((48, 49), pattern="....X.......X...", vowel="uh", dyn=0.80,
                  parts=("tenor", "bass"), length=0.55, gain=0.92)
    s.choir_pad((48, 49), vowel="oo", dyn=0.50, effort=0.26, voices_scale=0.85,
                parts=("alto", "tenor", "bass"), gain=0.85)
    s.drum("taiko", "X.......X.......", (48, 49), gain=0.38, humanize=0.007)
    return s
