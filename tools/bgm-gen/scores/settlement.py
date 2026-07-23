"""settlement — "餘燼 / What the Battle Left" : the results-screen loop.

This one has a job besides sounding good: it plays UNDER a dense UI (scoreboard,
ranking, rating), so it must never compete for the band the UI's own sounds and
the player's attention live in. Everything here is a deliberate step back —
67.5 bpm, no guitar, no supersaw, no clap, the hats at a whisper, and the choir
sung at roughly half the effort and half the dynamic victory uses. It is the
same choir singing the same hook, just not shouting it.

SOFT IS NOT DULL. The first pass ran the choir at effort 0.24-0.45 and measured
12 dB darker than the rest of the pack above 2.5 kHz — it read as a broken
encode, not as restraint. `effort` is spectral tilt and not level, so the fix
was to open it (0.34/0.56/0.38), let the pluck run from the hook onward, and
lift the master air shelf, all of which puts the top back WITHOUT making the
track any louder or busier in the mids.

    bar 0-3   aftermath   piano ostinato, "oo" pad, sub, one distant taiko a bar
    bar 4-7   HOOK B      the answering phrase — the resolution HOOK_A withholds
                          — sung soft and slow; strings enter, a soft kick gives
                          the sidechain something to breathe against
    bar 8-11  the settle  choir thins back to "oo", pluck sparkle, kit gone by
                          bar 10, sweepdown turning the loop over

12 bars @ 67.5 = 1 881 600 samples = 42.667 s, the pack's loop length, so this
sits in the same rotation as every other looping track.
"""

from ggd import intro, music
from ggd.score import Score


def build() -> Score:
    s = Score(
        id="settlement",
        title="餘燼 / What the Battle Left (settlement)",
        mood="chilled reprise under the results screen — soft choir, clear mids",
        bpm=music.BPM_SLOW,           # 67.5
        bars=12,                      # = 42.667 s, the pack loop length
        key="Dm",
        seed=5217,
        loop=True,
        pump_depth=0.30,
        pump_release=0.26,
        hall=3.3,
        master_air=2.4,               # the top is all shelf here: see below
    )
    # PROG_HOME, then the hook-B chords, then PROG_RESOLVE landing on Dm so the
    # loop turns over onto its own tonic with no harmonic jolt.
    s.progression(["Dm", "Bb", "F", "C",
                   "Dm", "Bb", "Bb", "C",
                   "Bb", "F", "C", "Dm"])
    s.gain(choir=0.92, keys=1.10, strings=0.85, pad=0.90, drums=0.70,
           perc=0.85)

    # ---------------------------------------------------- SIGNATURE INTRO (#135)
    # A soft CELESTA shimmer DESCENDING to rest (D5-A4-F4) over a 'tally' motif —
    # soft high ticks that ritardando and STOP, like a scoreboard counting up and
    # settling — before the choir Hook-B enters. The only 'counting' intro, and
    # the softest, slowest head in the pack. Vs lobby's music box (which rises),
    # settlement's chime descends and slows. See ggd/intro.py.
    s.custom("keys", intro.settlement)

    # the thread — the same piano figure as menu, never stopping, so the loop
    # point never reads as a restart
    s.ostinato((0, 12), voice="piano", shape=(0, 2, 3, 2), subdiv=8,
               octave=0, gain=0.36, pan=-0.14)
    s.chords((0, 12), voice="pad", octave=0, gain=0.28, cutoff=2000.0)

    # ------------------------------------------------------------ 0-3 aftermath
    # `effort` is spectral tilt, not level: at 0.24 the whole track measured
    # 12 dB darker above 2.5 kHz than the rest of the pack and read as muffled
    # rather than soft. 0.34 keeps the choir just as quiet and puts the air back.
    s.choir_pad((0, 4), vowel=["oo", "oo", "ah", "oo"], dyn=0.44, effort=0.34,
                voices_scale=0.85, gain=0.95)
    s.bass((0, 4), "X.......X.......", octave=-2, style="sub", gain=0.58)
    s.drum("taiko", "X...............", (0, 4), gain=0.26, humanize=0.010,
           f0=58.0, decay=1.2)

    # -------------------------------------------------------------- 4-7 HOOK B
    s.fx("reverse", at_bar=3.0, length_bars=1.0, gain=0.13)
    s.choir_hook((4, 8), phrase="B", vowel="ah", dyn=0.68, effort=0.56,
                 gain=0.92, voices_scale=0.95)
    s.chords((4, 10), voice="strings", octave=0, gain=0.45)
    s.bass((4, 8), "X.......X...X...", octave=-2, style="both", gain=0.58,
           cutoff=780.0)
    s.drum("kick", "X.......X.......", (4, 10), gain=0.55)
    s.drum("hat", "..o...o...o...o.", (4, 10), gain=0.17, pan=0.18,
           humanize=0.002)
    s.drum("taiko", "X.......X...x...", (6, 10), gain=0.28, humanize=0.008,
           f0=58.0, decay=1.0)
    # the pluck is the only genuinely bright source in the track, so it runs
    # from the hook onward rather than only over the outro
    s.arp((4, 8), pattern=(2, 3, 4, 3), subdiv=16, octave=1, gain=0.09,
          voice="pluck", pan=0.30)

    # ------------------------------------------------------------ 8-11 settle
    s.choir_pad((8, 12), vowel=["ah", "oo", "oo", "oo"], dyn=0.44,
                effort=0.38, voices_scale=0.80, gain=0.88)
    s.arp((8, 12), pattern=(2, 3, 4, 3), subdiv=16, octave=1, gain=0.12,
          voice="pluck", pan=0.30)
    s.bass((8, 12), "X.......X.......", octave=-2, style="sub", gain=0.54)
    s.fx("sweepdown", at_bar=11.0, length_bars=1.0, gain=0.14)
    return s
