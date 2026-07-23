"""lobby — 「灯火 / Hearthlight」 : the warm hall you wait in.

The quiet side of the pack. Same key, same tempo, same cadence as menu, but
the anthem is turned down to a lit room: a small choir humming somewhere down
the corridor, a piano figure, one warm pad opening over sixteen bars.

It must survive being on screen for minutes while the player reads UI, so
NOTHING here competes with speech or with a click: no snare, no hat above a
whisper, no supersaw, master air pulled back, and the choir stays on the dark
vowels ("oo"/"oh") except for one four-bar bloom.

REPRISE RULE (music.py): lobby ALLUDES to the hook, it never states it. The
allusion is carried two ways —
  * the harmony IS the hook's harmony, rotated to start on the relative major;
  * the piano ostinato traces the hook cell's contour (5th → root → 3rd, i.e.
    A–D–F over Dm) an octave BELOW the sung cell and in even eighths, so the
    ear recognises the shape without hearing the quote.

Shape (16 bars = 42.667 s, seamless):
    0-3    empty room     piano + a 6-voice "oo" hum + sub, one far taiko
    4-7    warmth         choir opens to "oh", heartbeat kick, strings enter
    8-11   the bloom      full section on "ah", pad filter opens, pluck shimmer
    12-15  dissolve       everything thins back to the opening so the loop
                          turnaround is a breath rather than a restart
"""

from ggd import intro, music
from ggd.score import Score

# The pack's home cadence rotated to begin on the relative major:
# Dm-Bb-F-C  ->  F-C-Dm-Bb  (III VII i VI). Literally the same four chords as
# menu — that is the coherence — but landing on F it reads settled and warm
# instead of anthemic, and the tonic pitch class never moves.
PROG_WARM = music.PROG_HOME[2:] + music.PROG_HOME[:2]


def build() -> Score:
    s = Score(
        id="lobby",
        title="灯火 / Hearthlight",
        mood="restrained, warm — a distant wordless choir in a lit hall; "
             "unobtrusive under UI",
        bpm=music.BPM_BASE,          # 90
        bars=16,                     # = 1 881 600 samples, the pack loop length
        key="Dm",
        seed=3307,
        loop=True,
        # The kick is a heartbeat, not a beat: the pump is present (there IS a
        # kick under sustained pads) but shallow and slow, so it breathes
        # instead of chopping.
        pump_depth=0.24,
        pump_release=0.26,
        hall=3.5,
        master_air=1.2,              # menu uses 2.0; this one must not sparkle
    )
    s.progression(PROG_WARM)         # F C Dm Bb
    # Relative to the pack defaults: percussion well down, and the choir only
    # slightly up. It is deliberately NOT pushed further — track_check gates
    # the choir at <=85 % of the 300-3500 Hz band precisely so a quiet track
    # cannot become "a choir with a piano behind it", which is what this was
    # on the first pass (86.0 %). The piano, pad and strings carry the rest.
    s.gain(choir=1.02, pad=1.15, keys=1.10, strings=1.00, drums=0.45,
           perc=0.65, sub=0.85)
    s.verb(keys=0.34, pad=0.42, strings=0.48)

    # ---------------------------------------------------- SIGNATURE INTRO (#135)
    # A warm music-box chime (F4-A4-D5-A4) tracing the hook cell in the relative
    # major, rubato, drenched in the hall, over a lit-room air bed. The ONLY
    # music-box and the ONLY F-major opening in the pack. See ggd/intro.py.
    s.custom("keys", intro.lobby)

    # ---------------------------------------------------------- the constant
    # The hook cell's contour (5th, root, 3rd, root) an octave under the sung
    # register, in even eighths — the shape, not the quote. HELD BACK to bar 2
    # so the music box, not the ostinato, is the first sound; the bass and the
    # "oo" pad carry the loop-point continuity in its place.
    s.ostinato((2, 16), voice="piano", shape=(2, 3, 4, 3), subdiv=8,
               octave=0, gain=0.36, pan=-0.16)
    s.bass((0, 16), "X.......X.......", octave=-2, style="sub", gain=0.46)
    # one drum, far away, every second bar
    s.drum("taiko", "X" + "." * 31, (0, 16), gain=0.15, humanize=0.012,
           f0=54.0, decay=1.55)

    # ------------------------------------------------------ 0-3  empty room
    s.choir_pad((0, 4), vowel="oo", dyn=0.34, voices_scale=0.55, effort=0.20,
                gain=0.95)
    s.chords((0, 8), voice="pad", octave=0, gain=0.30, cutoff=1450.0)

    # --------------------------------------------------------- 4-7  warmth
    s.choir_pad((4, 8), vowel=["oo", "oo", "oh", "oh"], dyn=0.44,
                voices_scale=0.75, effort=0.30, gain=1.0)
    s.drum("kick", "X.......X.......", (4, 14), gain=0.34, humanize=0.005)
    s.chords((5, 13), voice="strings", octave=0, gain=0.34)

    # ------------------------------------------------------- 8-11 the bloom
    # The only place the choir opens to "ah" and the pad's filter is fully up.
    s.choir_pad((8, 12), vowel=["ah", "oh", "ah", "oh"], dyn=0.58,
                voices_scale=1.0, effort=0.42, gain=1.05)
    s.chords((8, 16), voice="pad", octave=0, gain=0.34, cutoff=2450.0)
    s.arp((8, 12), pattern=(2, 3, 4, 3), subdiv=8, octave=1, gain=0.10,
          voice="pluck", pan=0.32)
    s.drum("hat", "..o.......o.....", (8, 12), gain=0.085, pan=0.22,
           decay=0.030)

    # ----------------------------------------------------- 12-15 dissolve
    s.choir_pad((12, 16), vowel="oo", dyn=0.36, voices_scale=0.65, effort=0.24,
                gain=0.95)
    s.fx("reverse", at_bar=7.0, length_bars=1.0, gain=0.12)
    s.fx("sweepdown", at_bar=15.0, length_bars=1.0, gain=0.09)
    return s
