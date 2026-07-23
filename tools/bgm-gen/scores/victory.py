"""victory — "凱歌 / Raise the Banner" : the euphoric reprise.

This is the one cue in the pack that restates HOOK_A whole, at the pack's home
tempo and in the pack's home cadence, with the full SATB choir on the melody
and the supersaw doubling an octave below — the same voicing menu uses, so the
win literally sounds like the title theme arriving.

    bar 0-3   HOOK A over Dm-Bb-F-C, impact on the downbeat, four-on-the-floor
              with taiko, strings, guitar eighths, piano ostinato underneath.
              Bar 2 is the LIFT (D5-F5-A5) — the peak of the whole pack.
    bar 4     THE LANDING. HOOK_A deliberately hangs open on the 9th, so the
              sting adds one more bar: everything hits a fortissimo Dm, the
              choir holds it, and the cathedral carries it out.

loop=false — it fades to silence and hands over to settlement.
"""

from ggd import intro, music
from ggd.score import Score


def build() -> Score:
    s = Score(
        id="victory",
        title="凱歌 / Raise the Banner (victory)",
        mood="a rising fanfare + a cheer, then the full choir reprises the hook",
        bpm=music.BPM_BASE,           # 90, the home tempo
        bars=6,                       # +1 bar (#135): the prepended fanfare
        key="Dm",
        seed=5211,
        loop=False,
        pump_depth=0.46,
        pump_release=0.175,
        hall=3.7,
        tail_s=2.6,
        master_air=2.3,
    )
    # bar 0 = the fanfare (over Dm), then PROG_HOME + the resolution, one bar on.
    s.progression(["Dm", "Dm", "Bb", "F", "C", "Dm"])
    s.gain(choir=1.15, lead=0.95, keys=1.05, strings=1.00, gtr=0.80, perc=1.15)

    # ------------------------------------------------ 0  SIGNATURE INTRO (#135)
    # A rising triadic brass FANFARE (D-F-A-D) with a shimmer and a crowd cheer,
    # cresting on the impact that launches HOOK_A full. The only ascending
    # fanfare in the pack — the literal inverse of defeat's descending sigh, and
    # 'you WON' before the choir even sings. See ggd/intro.py.
    s.custom("fx", intro.victory)
    # EXPERIMENTAL sing-song taunt dropped in right after the crest (macOS `say`,
    # gated off by default; baked only with render.py --tts).
    s.say_line(1.95, "Kyoko", "勝った 泣かないで また来てね", rate=170, gain=0.55,
               pan=-0.06, verb=0.18)

    # the pack's thread, running under everything including the landing bar
    s.ostinato((1, 6), voice="piano", shape=(0, 2, 3, 2), subdiv=8,
               octave=0, gain=0.38, pan=-0.12)

    # ------------------------------------------------------- 1-4  HOOK A, full
    s.fx("impact", at_bar=1.0, length_bars=1.0, gain=0.55)
    s.drum("timpani", "X.......X.......", (1, 2), gain=0.40, f0=73.4, decay=1.3)

    s.choir_hook((1, 5), phrase="A", vowel="ah", dyn=0.98, effort=0.92,
                 gain=1.05)
    s.lead((1, 5), phrase="A", octave=-1, voice="supersaw", gain=0.34,
           detune=0.19, cutoff=9000.0)
    s.chords((1, 6), voice="strings", octave=0, gain=0.70)
    s.chords((1, 5), voice="guitar", octave=-1, gain=0.44,
             rhythm="x.x.x.x.x.x.x.x.", hit_beats=0.45)
    s.drumkit((1, 5), style="drive", gain=1.0)
    s.drum("taiko", "X...X...X..xX.x.", (1, 5), gain=0.50, humanize=0.006)
    s.bass((1, 5), "X...X...X...X...", octave=-2, style="both", gain=0.85,
           cutoff=1300.0)
    s.arp((1, 5), pattern=(2, 3, 4, 3), subdiv=16, octave=1, gain=0.13,
          voice="pluck", pan=0.32)
    # fill across the last hook bar, throwing the listener at the landing
    s.drum("snare", "............oxXX", (4, 5), gain=0.36)

    # -------------------------------------------------------- 5  THE LANDING
    s.choir_pad((5, 6), vowel="ah", dyn=1.0, effort=0.90, gain=1.10,
                sustain=0.99)
    s.fx("impact", at_bar=5.0, length_bars=1.0, gain=0.50)
    s.drum("kick", "X...............", (5, 6), gain=0.95)
    s.drum("taiko", "X...X...........", (5, 6), gain=0.62, humanize=0.004)
    s.drum("timpani", "X...............", (5, 6), gain=0.42, f0=73.4, decay=1.7)
    s.bass((5, 6), "X...............", octave=-2, style="both", gain=0.90,
           cutoff=1200.0)
    return s
