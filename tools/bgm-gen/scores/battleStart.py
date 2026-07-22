"""battleStart — "開陣 / The Gate Opens" : the one-shot sting that throws the
player into the match.

THREE BARS AT THE COMBAT TEMPO. 135 bpm is what combat.mp3 runs at, so the
sting hands the player over without a tempo change — the fight simply continues
the pulse the gate started. The harmony is PROG_RISE, the pack's lift cadence
(VI-VII-i = Bb-C-Dm), which means every bar of the build is already leaning on
the tonic that lands with the impact.

    bar 0-1   BUILD    riser, an accelerating taiko roll (quarters -> 16ths),
                       the pack's piano ostinato as the clock, a low "oo" choir
                       opening to "ah", strings, sub swell
    bar 2     THE HIT  impact + the sopranos' HOOK_CELL (A-D-F, the pack's
                       three-note identity fragment) over a tenor/bass stab,
                       four-on-the-floor, taiko, cymbal, guitar eighths

The cell is deliberately the ONLY hook material here: menu states the theme in
full, victory and settlement reprise it, and the stings just quote the fragment
— that is what keeps the hook a hook.
"""

from ggd import music
from ggd.score import Score


def build() -> Score:
    s = Score(
        id="battleStart",
        title="開陣 / The Gate Opens (battle start)",
        mood="short build, choir hit, impact — straight into the fight",
        bpm=music.BPM_DRIVE,          # 135, same as combat
        bars=3,
        key="Dm",
        seed=5207,
        loop=False,
        pump_depth=0.44,
        pump_release=0.16,
        hall=3.4,
        tail_s=2.4,                   # ~2.2 s of hall after the body, then fade
        master_air=2.2,
    )
    s.progression(["Bb", "C", "Dm"])  # VI VII i — the lift, landing on the hit
    s.gain(choir=1.02, perc=1.20, fx=0.95, strings=1.10, keys=1.05)

    # The pack's piano figure is the clock the build runs against — it is also
    # what keeps this sting from being 85 % choir, which the mix gate rejects.
    s.ostinato((0, 3), voice="piano", shape=(0, 2, 3, 2), subdiv=8,
               octave=0, gain=0.36, pan=-0.12)

    # ------------------------------------------------------------ 0-1 build
    # The choir opens the throat as the riser climbs: closed "oo" on the Bb,
    # open "ah" on the C, so the vowel itself is part of the crescendo.
    s.choir_pad((0, 2), vowel=["oo", "ah"], dyn=0.58, effort=0.36,
                voices_scale=0.9, gain=0.95)
    s.chords((0, 2), voice="strings", octave=0, gain=0.78)
    s.bass((0, 2), "X.......X.......", octave=-2, style="sub", gain=0.70)
    # one 32-char string = two bars: quarters, then sixteenths. The roll IS the
    # build; the riser only colours it.
    s.drum("taiko", "x...x...x...x..." "x.x.x.x.x.xxxxxx", (0, 2),
           gain=0.52, humanize=0.006, f0=64.0, decay=0.85)
    s.fx("riser", at_bar=0.0, length_bars=2.0, gain=0.30)
    s.fx("reverse", at_bar=1.0, length_bars=1.0, gain=0.26)

    # -------------------------------------------------------------- 2 THE HIT
    s.fx("impact", at_bar=2.0, length_bars=1.0, gain=0.60)
    # sopranos scoop A4-D5 into a held F5 — HOOK_CELL at speed reads as the
    # choir throwing itself at the downbeat; A/T/B hold the Dm underneath.
    s.choir_hook((2, 3), phrase="cell", vowel="ah", dyn=1.0, effort=0.95,
                 gain=1.10)
    # the low male stab that gives the hit its consonant
    s.choir_chant((2, 3), pattern="X...............", vowel="ah", dyn=0.95,
                  parts=("tenor", "bass"), length=1.3, gain=0.55)
    s.lead((2, 3), phrase="cell", octave=-1, voice="supersaw", gain=0.30,
           detune=0.20, cutoff=8600.0)
    s.chords((2, 3), voice="guitar", octave=-1, gain=0.58,
             rhythm="x.x.x.x.x.x.x.x.", hit_beats=0.45)
    s.drum("kick", "X...X...X...X...", (2, 3), gain=0.90)
    s.drum("taiko", "X...X.x.X...X.X.", (2, 3), gain=0.62, humanize=0.005)
    s.bass((2, 3), "X.......X...X...", octave=-2, style="both", gain=0.90,
           cutoff=1400.0)
    return s
