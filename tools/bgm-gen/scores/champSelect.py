"""champSelect — "選抜 / The Choosing" : 24 bars @ 135 bpm, a build with no drop.

Draft screens are pure anticipation, so this cue is one continuous 42.667 s
crescendo and nothing else. Every four bars something is added and something
tightens: the hats go offbeat-8ths -> 8ths -> 16ths -> straight 16ths, the
supersaw wall opens from a 900 Hz mumble to a 7 kHz blaze, the kit goes from
one taiko to four-on-the-floor, and the choir climbs from a distant "oo" to a
full-effort "ah" wall. Then the loop hands the listener back to bar 0 and the
drop never comes — which is the point: the tension belongs to the screen, not
to the music, and it has to survive being sat on for two minutes.

HARMONY  PROG_DRIVE (i-VII-VI-VII : Dm C Bb C). Every four-bar cycle ends on C,
the dominant-function VII, so the phrase is permanently leaning forward and
never lands. That is the harmonic version of "never quite drops".

THE HOOK  is teased for exactly two bars at the very top (bars 20-21, sopranos
+ supersaw on the first half of HOOK_A) and then withheld. Per the pack's
reprise plan champSelect quotes fragments only; menu/victory/settlement own the
full statement.

BAR 24  every score in this pack writes one extra bar that mirrors bar 0. The
renderer cuts the body at bar 24 and crossfades the 0.3 s that follows onto the
head, so bar 24 is the audio the join fades out of — making it bar 0's own
material is what stops the loop point from dipping in level every pass.
"""

from ggd import intro, music
from ggd.score import Score

OSTINATO = (0, 2, 3, 2)   # the pack's ostinato shape, straight off menu


def build() -> Score:
    s = Score(
        id="champSelect",
        title="選抜 / The Choosing (draft)",
        mood="rising tension — a build with no drop; anticipation for the draft",
        bpm=music.BPM_DRIVE,          # 135
        bars=24,                      # = 1 881 600 samples, the pack loop length
        key="Dm",
        seed=5204,
        loop=True,
        pump_depth=0.44,
        pump_release=0.15,
        hall=3.3,
    )
    s.progression(music.PROG_DRIVE)   # Dm C Bb C
    s.gain(choir=0.98, keys=1.05, lead=1.00, strings=1.10, pad=1.15, gtr=1.10,
           perc=1.10)

    # ---------------------------------------------------- SIGNATURE INTRO (#135)
    # A rising stadium CROWD-ROAR + a supersaw riser inhale, breaking on a single
    # deep taiko BOOM that launches the build below. The only crowd in the pack,
    # and a pure 4 s crescendo with no downbeat until it breaks — the draft-floor
    # filling up. See ggd/intro.py. It swells from silence so the loop crossfade
    # never has to be duplicated into the mirror bar.
    s.custom("fx", intro.champSelect)
    # EXPERIMENTAL comic-MC rap on the boom (macOS `say`, gated off by default;
    # baked only with render.py --tts). Half-shouted over the riser.
    s.say_line(3.42, "Meijia", "選啊 快選啊 時間到了沒", rate=210, gain=0.62,
               pan=0.05, verb=0.16)

    # ------------------------------------------------ the thread, in three steps
    # One figure runs the whole loop so the build has something to build ON;
    # it simply gets louder every eight bars.
    s.ostinato((0, 8), voice="piano", shape=OSTINATO, subdiv=8, octave=0,
               gain=0.30, pan=-0.14)
    s.ostinato((8, 16), voice="piano", shape=OSTINATO, subdiv=8, octave=0,
               gain=0.38, pan=-0.14)
    s.ostinato((16, 24), voice="piano", shape=OSTINATO, subdiv=8, octave=0,
               gain=0.44, pan=-0.14)

    # ------------------------------------------------------------ 0-3  distant
    s.choir_pad((0, 4), vowel="oo", dyn=0.44, voices_scale=0.80, effort=0.22,
                gain=0.95)
    s.bass((0, 4), "X.......X.......", octave=-2, style="sub", gain=0.62)
    s.drum("hat", "..x...x...x...x.", (0, 4), gain=0.10, pan=0.18, decay=0.032)
    s.drum("taiko", "X...............", (0, 4), gain=0.34, humanize=0.008,
           f0=60.0, decay=1.2)

    # ------------------------------------------------------- 4-7  pulse arrives
    s.choir_pad((4, 8), vowel=["oo", "oo", "oh", "oh"], dyn=0.58,
                voices_scale=0.9, effort=0.34, gain=0.98)
    s.chords((4, 8), voice="supersaw", octave=-1, gain=0.58, cutoff=900.0,
             spread=3)
    s.drum("kick", "X.......X.......", (4, 8), gain=0.72)
    s.drum("hat", "x.x.x.x.x.x.x.x.", (4, 8), gain=0.14, pan=0.18, decay=0.034)
    s.bass((4, 8), "X.......X...X...", octave=-2, style="both", gain=0.70,
           cutoff=900.0)

    # ------------------------------------------------- 8-11  the floor arrives
    s.choir_pad((8, 12), vowel="ah", dyn=0.70, effort=0.48, gain=1.00)
    s.chords((8, 12), voice="supersaw", octave=-1, gain=0.64, cutoff=1600.0)
    s.chords((8, 16), voice="strings", octave=0, gain=0.62)
    s.drum("kick", "X...X...X...X...", (8, 16), gain=0.86)
    s.drum("clap", "....X.......X...", (8, 16), gain=0.34, humanize=0.002)
    s.drum("hat", "xoxoxoxoxoxoxoxo", (8, 16), gain=0.21, pan=0.18, decay=0.030)
    s.bass((8, 12), "X...X...X...X...", octave=-2, style="both", gain=0.78,
           cutoff=1100.0)
    s.drum("taiko", "X.......X.......", (8, 12), gain=0.40, humanize=0.007)

    # ---------------------------------------------------- 12-15  the filter opens
    s.choir_pad((12, 16), vowel=["ah", "ah", "eh", "ah"], dyn=0.82, effort=0.62,
                gain=1.04)
    s.chords((12, 16), voice="supersaw", octave=-1, gain=0.68, cutoff=2900.0)
    s.arp((12, 24), pattern=(2, 3, 4, 3), subdiv=16, octave=1, gain=0.10,
          voice="pluck", pan=0.36)
    s.drum("openhat", "..x...x...x...x.", (12, 16), gain=0.09, pan=-0.22)
    s.bass((12, 16), "X...X..xX...X..x", octave=-2, style="both", gain=0.80,
           cutoff=1400.0)
    s.drum("taiko", "X...X...X...X...", (12, 16), gain=0.42, humanize=0.006)

    # --------------------------------------------------------- 16-19  tightening
    s.choir_pad((16, 20), vowel="ah", dyn=0.90, effort=0.76, gain=1.08)
    s.chords((16, 20), voice="supersaw", octave=-1, gain=0.72, cutoff=4600.0)
    s.chords((16, 24), voice="strings", octave=0, gain=0.70)
    s.chords((16, 24), voice="guitar", octave=-1, gain=0.54,
             rhythm="x.x.x.x.x.x.x.x.", hit_beats=0.45)
    s.drum("kick", "X...X...X...X...", (16, 24), gain=0.92)
    s.drum("clap", "....X.......X...", (16, 24), gain=0.38, humanize=0.002)
    s.drum("hat", "xoxoxoxoxoxoxoxo", (16, 20), gain=0.24, pan=0.18, decay=0.028)
    s.drum("snare", "..o...o...o...o.", (16, 20), gain=0.16, humanize=0.003)
    s.bass((16, 20), "X...X...X...X...", octave=-2, style="both", gain=0.84,
           cutoff=1700.0)
    s.drum("taiko", "X.......X...X...", (16, 20), gain=0.46, humanize=0.006)

    # ------------------------------------------------ 20-23  the top, held open
    # The theme is quoted for two bars and taken away again; the riser runs the
    # whole four bars and is never answered by an impact.
    s.choir_hook((20, 22), phrase="A", vowel="ah", dyn=0.95, effort=0.88,
                 gain=1.00)
    s.lead((20, 22), phrase="A", octave=-1, voice="supersaw", gain=0.36,
           detune=0.19, cutoff=7000.0)
    s.choir_pad((22, 24), vowel="ah", dyn=0.94, effort=0.85, gain=1.02)
    s.chords((20, 24), voice="supersaw", octave=-1, gain=0.78, cutoff=7000.0)
    s.drum("hat", "XxxxXxxxXxxxXxxx", (20, 24), gain=0.24, pan=0.18, decay=0.024)
    s.bass((20, 24), "X..xX...X..xX...", octave=-2, style="both", gain=0.86,
           cutoff=2000.0)
    s.drum("taiko", "X...X...X...X...", (20, 22), gain=0.48, humanize=0.005)
    s.drum("taiko", "X.x.X.x.X.x.XxXx", (22, 24), gain=0.50, humanize=0.005)
    s.drum("snare", "o...o...o...o..." "o.o.o.o.oxoxXXXX", (22, 24), gain=0.30,
           humanize=0.003)
    s.fx("riser", at_bar=20.0, length_bars=4.0, gain=0.30, f_lo=260.0,
         f_hi=9500.0)
    # a reversed swell over the last bar leads into bar 0 instead of a drop
    s.fx("reverse", at_bar=23.0, length_bars=1.0, gain=0.22)

    # ------------------------------------------------------- 24  the loop join
    # Bar 24 is bar 0. See the module docstring.
    s.ostinato((24, 25), voice="piano", shape=OSTINATO, subdiv=8, octave=0,
               gain=0.30, pan=-0.14)
    s.choir_pad((24, 25), vowel="oo", dyn=0.44, voices_scale=0.80, effort=0.22,
                gain=0.95)
    s.bass((24, 25), "X.......X.......", octave=-2, style="sub", gain=0.62)
    s.drum("hat", "..x...x...x...x.", (24, 25), gain=0.10, pan=0.18, decay=0.032)
    s.drum("taiko", "X...............", (24, 25), gain=0.34, humanize=0.008,
           f0=60.0, decay=1.2)
    return s
