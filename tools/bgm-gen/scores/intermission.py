"""intermission — 「街の合間 / City Between the Bells」 : city-pop 慵懶 → EDM 爆発.

The shop screen's bed, rewritten from the ground up. The old cue opened on a
bright school-recess bell and stayed a moody D-dorian groove; the user rejected
it — the bell was jarring and never blended into the tune — and asked for the
WHOLE track to be a lazy CITY-POP piece with a mid-track turn where a female
voice's emotion accumulates, EXPLODES, and bursts into a fast EDM section. This
file is that track. It supersedes task #124's cheerful-recess-bell direction and
the #135 school-bell intro (intro.intermission is now a soft Rhodes swell).

WHY 90 bpm / 32 bars / loop=True STAY. 32 bars @90 = 3 763 200 samples = 2x the
pack's 1 881 600-sample loop GRID (see music.py), so the loop is sample-exact
and the file stays phase-compatible with every other track. The EDM section is
made to feel FAST not by changing tempo — that would break the sample-exact
grid — but by DOUBLE-TIME drum programming (four-on-the-floor + 16th hats) over
the unchanged 90 bpm pulse. One tempo, two feels.

Shape (32 bars = 85.333 s, seamless; bar 32 mirrors bar 0 for the join):
  bars    s            section
  0-11    0.0-32.0    A  city-pop 慵懶  the shop breathes. A lush Dm9/maj7 Rhodes
                                        comp over a warm pad, a smooth syncopated
                                        electric bass, LAZY half-time drums (soft
                                        kick, rim backbeat on 3, ghost snares,
                                        gentle offbeat hats), and a mellow sax-ish
                                        filtered-supersaw lead. This is the loop
                                        head: unhurried, warm, low.
  12-17   32.0-48.0   B  女聲情緒累積   the female voice (choir sopranos, "oo"->
                                        "ah") enters exposed and RISES in pitch
                                        and intensity as the chords climb; a
                                        filter-opening riser and an accelerating
                                        snare build stack tension under her —
                                        emotion swelling toward the break, ending
                                        on A7, the dominant.
  18-25   48.0-69.3   C  爆発 → EDM     the explosion: a big impact on the downbeat
                                        of bar 18, then FOUR-ON-THE-FLOOR kick
                                        (an onset every 0.667 s), driving supersaw
                                        stabs + a reese offbeat bass, 16th-note
                                        hats (the "fast" feel), with the soprano
                                        soaring and CHOPPED over the top. The peak.
  26-31   69.3-85.3   A' 収束 city-pop  the EDM winds back down to the lazy groove:
                                        Rhodes + sax reprise, half-time drums,
                                        decrescendo, ending on A7 -> so the loop
                                        seam (tail -> head) is city-pop into
                                        city-pop and stays seamless.
  32                  mirror bar        bar 0's material, for the crossfade join.

HARMONY — jazzy 7th/9th voicings, one chord per bar, len(PROG) == 32 so bar 32
wraps to bar 0's chord. Everything sits in the pack's D-minor / F-major family
(Dm9 F Bb Gm C), city-pop-warm rather than dorian-dark, with ONE recurring
secondary dominant A7 (V7/i, the only chromatic note C#) used purely as the
turnaround/cadence into Dm at the ends of A, B, C and A' — the city-pop cliché
that makes the loop pull back to its head. It is exceptional, not habitual, in
the spirit of the pack's "one G major" rule.

LOOP-SAFETY. The renderer crossfades the 0.3 s after the body cut (bar 32,
which is bar 0's material) onto the head. Head and tail are BOTH the lazy
city-pop groove — bar 31 is A7 decrescendo into bar 0's Dm9 — so the seam is
mellow-into-mellow with no EDM transient straddling the join. The intro (a soft
Rhodes swell, intro.py) is faded up from sample 0, so it never has to be
duplicated into the mirror bar.

NOTE ON THE OLD BELL WINDOW. The previous cue kept a percussion-free window at
54.5-60 s so the countdown bells could ring into an open room. That window fell
where the EXPLOSION now lives (bars ~20-22 = ~53-59 s), and the user's new brief
explicitly wants the fast EDM there. The countdown SFX are designed to sit over
a music bed regardless, so they still read; the quiet-window constraint is
retired with the rest of the old design.
"""

from ggd import intro, music
from ggd.score import Score

N = music.note

# One symbol per bar; len(PROG) == 32, so bar 32 wraps to bar 0's Dm9.
PROG = (
    # A — city-pop 慵懶 (0-11): three warm 4-bar turns, each cadencing softer
    ["Dmadd9", "Gm7", "Bbmaj7", "Fmaj7"]    # 0-3   i9 iv VI III — lands on F, the
                                            #       relative major: very city-pop
    + ["Dmadd9", "Gm7", "Bbmaj7", "C7"]     # 4-7   same, C7 leans forward
    + ["Dm7", "Gm7", "Am7", "A7"]           # 8-11  v->V turnaround into the build
    # B — 女聲情緒累積 (12-17): the chords CLIMB under the rising voice
    + ["Bbmaj7", "C", "Dm7", "Gm7"]         # 12-15 VI VII i iv, rising
    + ["Bbmaj7", "A7"]                      # 16-17 VI then the big dominant
    # C — 爆発 EDM drop (18-25): the pack's home anthem, hard and driving
    + ["Dm", "Bb", "F", "C"]                # 18-21 i VI III VII
    + ["Dm", "Bb", "F", "A7"]               # 22-25 A7 turns it back toward home
    # A' — 収束 back to city-pop (26-31): the lazy loop returns, decrescendo
    + ["Dmadd9", "Gm7", "Bbmaj7", "Fmaj7"]  # 26-29
    + ["Gm7", "A7"]                         # 30-31 A7 -> bar 0's Dm9, the seam
)
assert len(PROG) == 32, len(PROG)

# ---------------------------------------------------------------- THE SAX LINE
# A mellow, LAZY sax-ish lead (a filtered supersaw). Written to breathe: it comes
# in off the beat, leaves space, and never hurries. (beat, beats, midi) relative
# to the section's first bar. Reused shape so A and A' read as one player.

# A, bars 4-7 over Dmadd9 Gm7 Bbmaj7 C7.
SAX_A = [
    (0.5, 1.5, N("A4")), (2.5, 1.0, N("F4")),          # Dmadd9  laid back off 1
    (4.0, 2.0, N("D5")), (6.5, 1.0, N("C5")),          # Gm7
    (8.0, 1.5, N("F5")), (10.0, 1.5, N("D5")),         # Bbmaj7
    (12.5, 1.0, N("E5")), (14.0, 1.5, N("C5")),        # C7   leans, unresolved
]

# A, bars 8-11 over Dm7 Gm7 Am7 A7 — a touch higher, outlines the A7 turnaround.
SAX_B = [
    (0.5, 1.5, N("A4")), (2.0, 2.0, N("D5")),          # Dm7
    (4.5, 1.5, N("Bb4")), (6.5, 1.0, N("D5")),         # Gm7
    (8.0, 2.0, N("C5")), (10.5, 1.0, N("E5")),         # Am7
    (12.0, 1.0, N("C#5")), (13.0, 1.0, N("E5")),       # A7   the leading tone
    (14.0, 1.5, N("A4")),                              #      breathe into B
]

# A', bars 26-29 over Dmadd9 Gm7 Bbmaj7 Fmaj7 — sparser, the come-down reprise.
SAX_TAIL = [
    (0.5, 1.5, N("A4")), (2.5, 1.0, N("F4")),          # Dmadd9
    (4.0, 2.5, N("D5")),                               # Gm7
    (8.0, 2.0, N("F5")),                               # Bbmaj7
    (12.0, 2.5, N("A4")),                              # Fmaj7  rest into 30-31
]

# The Rhodes comp figure: a lazy, syncopated stab pattern (16th grid). It lands
# off the downbeats so the pad and bass hold the "1" and the EP answers.
COMP = "..x..x...x..x..."


def build() -> Score:
    s = Score(
        id="intermission",
        title="街の合間 / City Between the Bells (shop)",
        mood="city-pop 慵懶 — the shop breathes, then a female voice explodes into EDM",
        bpm=music.BPM_BASE,          # 90 — unchanged; the EDM is double-time feel
        bars=32,                     # 3 763 200 samples = 2 x the pack loop grid
        key="Dm",
        seed=4411,
        loop=True,
        pump_depth=0.46,
        pump_release=0.17,
        hall=3.3,
        master_air=1.3,              # warmer top than the pack default: city-pop
    )
    s.progression(PROG)
    s.gain(choir=1.05, keys=1.12, strings=0.95, drums=0.92, perc=0.90,
           bass=1.02, pad=1.06, lead=0.68)
    # warm the keys/pad reverb a touch; keep the kit tight.
    s.verb(keys=0.30, pad=0.38)

    # ---------------------------------------------------- SIGNATURE INTRO (#135)
    # A soft Rhodes/EP chord SWELL (Dm9) out of faint vinyl-air — the 慵懶 groove
    # easing in, NO school bell. Faded from sample 0, so the loop join is safe.
    s.custom("keys", intro.intermission)

    # ======================================================= A  city-pop 慵懶 0-11
    # The warm cushion under everything: a soft pad on the jazzy chords, held.
    s.chords((0, 12), voice="pad", octave=0, gain=0.20, cutoff=1700.0)
    # The Rhodes comp: syncopated stabs, spread=4 so the 7th/9th colour is heard.
    s.chords((0, 4), voice="piano", octave=0, gain=0.30, rhythm=COMP,
             hit_beats=0.9, spread=4)
    s.chords((4, 8), voice="piano", octave=0, gain=0.34, rhythm=COMP,
             hit_beats=0.9, spread=4)
    s.chords((8, 12), voice="piano", octave=0, gain=0.34, rhythm=COMP,
             hit_beats=0.9, spread=4)

    # LAZY half-time drums: soft kick on 1 (+ a syncopated ghost), a soft rim
    # backbeat on beat 3, ghost snares for shuffle, gentle offbeat 8th hats.
    s.drum("kick", "X.....x.........", (0, 12), gain=0.44)
    s.drum("snare", "........X.......", (0, 12), gain=0.16, humanize=0.006)      # rim on 3
    s.drum("snare", "..o........o..o.", (2, 12), gain=0.055, humanize=0.010)     # ghosts
    s.drum("hat", "..x...x...x...x.", (0, 4), gain=0.055, pan=0.18, decay=0.044)
    s.drum("hat", "..x...x...x...x.", (4, 12), gain=0.068, pan=0.18, decay=0.044)
    s.drum("openhat", "............x...", (4, 12), gain=0.040, pan=-0.20)

    # Smooth syncopated electric bass — funky but relaxed, round (low cutoff).
    s.bass((0, 4), "X..x...X..x.x...", octave=-2, style="both", gain=0.58,
           cutoff=680.0)
    s.bass((4, 8), "X..x...X..x.x..x", octave=-2, style="both", gain=0.66,
           cutoff=740.0)
    s.bass((8, 12), "X..x..X...x.x..x", octave=-2, style="both", gain=0.68,
           cutoff=780.0)

    # Warm choir cushion (very low, "oo") so the bed is alive from the top.
    s.choir_pad((0, 4), vowel="oo", dyn=0.34, voices_scale=0.60, effort=0.20,
                parts=("alto", "tenor", "bass"), gain=0.62)
    s.choir_pad((4, 12), vowel=["oo", "oh", "oo", "oh"], dyn=0.40,
                voices_scale=0.66, effort=0.24,
                parts=("alto", "tenor", "bass"), gain=0.70)

    # The mellow sax lead — enters at bar 4 (bars 0-3 are pure groove settling).
    s.melody(4, SAX_A, voice="supersaw", bus="lead", gain=0.34, detune=0.10,
             cutoff=2600.0, attack=0.05, pan=0.10)
    s.melody(8, SAX_B, voice="supersaw", bus="lead", gain=0.34, detune=0.10,
             cutoff=2800.0, attack=0.05, pan=0.10)

    # ==================================================== B  女聲情緒累積 12-17
    # 32.0-48.0 s. The female voice enters EXPOSED (12-13: kit pulls back to just
    # a soft pulse so the sopranos are in front — this is the track's clearest
    # choir window), then swells: vowels open oo->ah, dyn/effort/voices_scale
    # climb, and the chords rise Bb->C->Dm->Gm. A filter-opening riser and an
    # accelerating snare build stack the tension; bar 17 (A7) is the dominant the
    # explosion resolves.
    s.chords((12, 18), voice="pad", octave=0, gain=0.24, cutoff=1900.0)
    s.chords((14, 18), voice="strings", octave=0, gain=0.30)

    # the voice: soft/low, then rising, then a soprano SOAR into the drop.
    s.choir_pad((12, 14), vowel="oo", dyn=0.42, voices_scale=0.68, effort=0.26,
                gain=0.70)
    s.choir_pad((14, 16), vowel=["oh", "ah"], dyn=0.68, voices_scale=0.92,
                effort=0.52, gain=1.02)
    # bars 16-17: the sopranos sing the rising hook fragment (A4-D5-F5 / E5-D5-C5)
    # — the emotional peak of the accumulation, right before the break.
    s.choir_hook((16, 18), phrase="A", vowel="ah", dyn=0.94, effort=0.86,
                 voices_scale=1.0, gain=1.18)
    s.choir_pad((16, 18), vowel="ah", dyn=0.78, voices_scale=0.9, effort=0.6,
                parts=("alto", "tenor", "bass"), gain=0.72)

    # thinning groove under the entrance, then rebuilding into the break
    s.drum("kick", "X...............", (12, 14), gain=0.32)
    s.drum("kick", "X.......X.......", (14, 16), gain=0.52)
    s.bass((12, 14), "X.......X.......", octave=-2, style="sub", gain=0.50)
    s.bass((14, 18), "X..x...X..x...x.", octave=-2, style="reese", gain=0.60,
           cutoff=900.0)
    # the snare BUILD: sparse ghosts -> a 16th roll accelerating into bar 18
    s.drum("snare", "..o...o...o...o.", (13, 14), gain=0.10, humanize=0.006)
    s.drum("snare", "o.o.o.o.o.o.o.o.", (14, 16), gain=0.16, humanize=0.005)
    s.drum("snare", "o.o.o.o.oxoxXXXX" "oxoxoxoxXXXXXXXX", (16, 18), gain=0.30,
           humanize=0.003)
    s.drum("hat", "..x...x...x...x.", (12, 16), gain=0.06, pan=0.18, decay=0.036)
    # the filter-opening riser: four bars sweeping up into the explosion
    s.fx("riser", at_bar=14.0, length_bars=4.0, gain=0.30, f_lo=260.0,
         f_hi=8600.0)
    s.fx("reverse", at_bar=17.0, length_bars=1.0, gain=0.16)

    # ======================================================= C  爆発 → EDM 18-25
    # 48.0-69.3 s. The explosion: an impact on the downbeat, then a FOUR-ON-THE-
    # FLOOR kick (an onset every 0.667 s at 90 bpm — this IS the "fast" feel,
    # with the tempo unchanged), 16th hats, driving supersaw stabs, a reese
    # offbeat bass, and the soprano soaring + CHOPPED over the top.
    s.fx("impact", at_bar=18.0, length_bars=1.0, gain=0.34)
    s.fx("impact", at_bar=22.0, length_bars=1.0, gain=0.22)

    # four-on-the-floor + backbeat clap + a taiko accent + driving 16th hats
    s.drum("kick", "X...X...X...X...", (18, 26), gain=0.96)
    s.drum("clap", "....X.......X...", (18, 26), gain=0.42, humanize=0.002)
    s.drum("hat", "xxxxxxxxxxxxxxxx", (18, 26), gain=0.135, pan=0.18, decay=0.024)
    s.drum("openhat", "..x...x...x...x.", (18, 26), gain=0.090, pan=-0.20)
    s.drum("taiko", "X.......X.......", (18, 26), gain=0.38, humanize=0.006,
           f0=64.0, decay=0.7)

    # the bass: a sub root on the downbeat for weight + a reese OFFBEAT that
    # survives the pump (the classic house pump-and-bass).
    s.bass((18, 26), "X.......X.......", octave=-2, style="sub", gain=0.74)
    s.bass((18, 26), "..x...x...x...x.", octave=-2, style="reese", gain=0.68,
           cutoff=1500.0)

    # the driving synth: a supersaw wall opening its filter + offbeat stabs.
    s.chords((18, 22), voice="supersaw", octave=-1, gain=0.48, cutoff=3000.0)
    s.chords((22, 26), voice="supersaw", octave=-1, gain=0.56, cutoff=5200.0)
    s.chords((18, 26), voice="supersaw", octave=0, gain=0.37,
             rhythm="..x...x...x...x.", hit_beats=0.4, cutoff=5600.0)

    # the female vocal over the drop: a big "ah" soar PLUS chopped soprano stabs.
    s.choir_pad((18, 26), vowel="ah", dyn=0.92, voices_scale=1.0, effort=0.82,
                gain=1.08)
    s.choir_chant((18, 26), pattern="x.x.x.x.x.x.x.x.", vowel="ah", dyn=0.80,
                  parts=("soprano", "alto"), length=0.42, gain=0.70)
    # a supersaw doubles the soprano an octave down for body (bars 18-21 call).
    s.melody(18, [(0.0, 2.0, N("A4")), (2.0, 2.0, N("F4")),
                  (4.0, 2.0, N("D4")), (6.0, 2.0, N("F4")),
                  (8.0, 2.0, N("A4")), (10.0, 2.0, N("C5")),
                  (12.0, 2.0, N("A4")), (14.0, 2.0, N("G4"))],
             voice="supersaw", bus="lead", gain=0.22, detune=0.18, cutoff=6000.0,
             pan=-0.08)

    # ==================================================== A'  収束 city-pop 26-31
    # 69.3-85.3 s. Wind the EDM back to the lazy groove so the loop seam is
    # city-pop into city-pop. Rhodes + sax reprise + half-time drums, decrescendo,
    # ending on A7 -> bar 0's Dm9.
    s.chords((26, 32), voice="pad", octave=0, gain=0.20, cutoff=1650.0)
    s.chords((26, 30), voice="piano", octave=0, gain=0.32, rhythm=COMP,
             hit_beats=0.9, spread=4)
    s.chords((30, 32), voice="piano", octave=0, gain=0.26, rhythm=COMP,
             hit_beats=0.9, spread=4)
    s.melody(26, SAX_TAIL, voice="supersaw", bus="lead", gain=0.32, detune=0.10,
             cutoff=2600.0, attack=0.05, pan=0.10)

    # drums ease back to half-time and thin out toward the seam
    s.drum("kick", "X.....x.........", (26, 30), gain=0.46)
    s.drum("kick", "X...............", (30, 32), gain=0.40)
    s.drum("snare", "........X.......", (26, 30), gain=0.15, humanize=0.006)
    s.drum("snare", "..o........o..o.", (26, 30), gain=0.05, humanize=0.010)
    s.drum("hat", "..x...x...x...x.", (26, 30), gain=0.075, pan=0.18, decay=0.040)
    s.drum("hat", "..x.......x.....", (30, 32), gain=0.05, pan=0.18, decay=0.040)
    s.bass((26, 30), "X..x...X..x.x..x", octave=-2, style="both", gain=0.60,
           cutoff=720.0)
    s.bass((30, 32), "X......x........", octave=-2, style="both", gain=0.52,
           cutoff=680.0)
    s.choir_pad((26, 30), vowel=["ah", "oh", "oo", "oh"], dyn=0.50,
                voices_scale=0.74, effort=0.30, gain=0.78)
    s.choir_pad((30, 32), vowel="oo", dyn=0.36, voices_scale=0.62, effort=0.22,
                parts=("alto", "tenor", "bass"), gain=0.64)

    # ======================================================= 32  the loop join
    # Bar 32 is bar 0's material, so the 0.3 s crossfade lands mellow city-pop on
    # mellow city-pop. PROG[32 % 32] == "Dmadd9" by construction; A7 in bar 31
    # resolves into it across the seam.
    s.chords((32, 33), voice="pad", octave=0, gain=0.20, cutoff=1700.0)
    s.chords((32, 33), voice="piano", octave=0, gain=0.30, rhythm=COMP,
             hit_beats=0.9, spread=4)
    s.drum("kick", "X.....x.........", (32, 33), gain=0.44)
    s.drum("snare", "........X.......", (32, 33), gain=0.16, humanize=0.006)
    s.drum("hat", "..x...x...x...x.", (32, 33), gain=0.070, pan=0.18, decay=0.040)
    s.bass((32, 33), "X..x...X..x.x...", octave=-2, style="both", gain=0.58,
           cutoff=680.0)
    s.choir_pad((32, 33), vowel="oo", dyn=0.34, voices_scale=0.60, effort=0.20,
                parts=("alto", "tenor", "bass"), gain=0.62)
    return s
