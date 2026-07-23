"""room — 「控室 / The Antechamber」 : a CATHEDRAL, not a cold machine.

Rewritten from the cold fluorescent-hum waiting room into a CHURCH. The body is
a pipe ORGAN and a sacred SATB CHOIR (聖歌/gospel) breathing in a great stone
REVERB; a black-priest SERMON opens it and a taunting sermon drives its CLIMAX,
where the sopranos finally sing the hook. What was rejected — the sterile
machine drone — is gone; what is kept is the frame: 90 bpm, 16 bars =
42.667 s, Dm, seamless loop, so the track stays phase-compatible with the pack.

WHY IT IS STILL A CATHEDRAL AND NOT A DRONE. The 8-bar progression (PROG_DARK
extended so bar 7 turns to F, the relative major) is the one shaft of light in
an otherwise brooding room — major IV over the minor tonic, the "clouds part"
chord, used sparingly per music.py's rule. The organ states it, the choir lifts
into it, and the loop keeps pulling back to Dm.

Shape (16 bars = 42.667 s, seamless; head =~ tail):
    0-3    organ + a low "oo/oh" choir breathe in under the priest's sermon
    4-7    the bed thickens; a church bell tolls; bar 7 turns to F — the light
    8-9    the choir tightens and the taunting sermon drops into the turn
    10-13  THE CLIMAX (旋律高潮轉折): the sopranos sing the hook over the full
           organ, a gospel low-chant drive and a timpani lifting under it
    14-15  it resolves back to the soft opening texture, so the loop breathes
    16     mirrors bar 0's soft cluster for the 0.3 s crossfade join

LOOP-SAFETY. The organ is a continuous, heavily-overlapped per-bar bed rendered
THROUGH bar 16 (= bar 0's Dm) so it never gaps across the seam; the head (0-4)
and tail (14-16) choir are the same soft low "oo" cluster; and the intro wash is
faded up from sample 0 (intro.py) and never duplicated into the mirror bar. So
the self-join lands soft-cathedral on soft-cathedral with nothing to click.

RAPS (baked ONLY with `render.py --tts`; silent and fully deterministic
otherwise — the gate lives in ggd/score.py and intro._say):
  * the OPENING sermon is in intro.room — Reed (en_US), a deep clean male:
    "Brothers and sisters, only one walks out.";
  * the CLIMAX taunt is a custom layer here — Reed again — "Kneel down. Your
    hour has come.", dropped at bar ~9.3 so it lands into the sopranos' entry.
The 中低音戰鼓 + 維京 rowing chant of the old cut is gone with the machine hum;
this room prays instead of waits.
"""

from ggd import dsp, intro, music
from ggd.dsp import SR
from ggd.music import hz, note
from ggd.score import Score

# PROG_DARK (Dm Dm Bb C) extended to eight bars; the F in bar 7 is the light.
PROG_WAIT = music.PROG_DARK + ["Dm", "Dm", "F", "C"]

# The organ's dynamic arc across the 16 bars (+ the bar-16 mirror). Soft at the
# head and tail so the loop breathes; full through the 10-13 climax.
ORGAN_ARC = {0: 0.50, 1: 0.50, 2: 0.54, 3: 0.58, 4: 0.66, 5: 0.70, 6: 0.74,
             7: 0.80, 8: 0.88, 9: 0.92, 10: 1.00, 11: 1.00, 12: 1.00, 13: 0.94,
             14: 0.62, 15: 0.52, 16: 0.50}


def build() -> Score:
    s = Score(
        id="room",
        title="控室 / The Antechamber",
        mood="a cathedral holding room — pipe organ and a sacred choir in a great "
             "stone reverb, a preacher's sermon, and a taunting climax",
        bpm=music.BPM_BASE,          # 90 — unchanged
        bars=16,                     # 42.667 s, the pack loop length — unchanged
        key="Dm",                    # unchanged
        seed=2213,                   # unchanged
        loop=True,                   # unchanged
        pump_depth=0.16,             # barely a duck — nothing hammers in here
        pump_release=0.28,
        hall=4.6,                    # a bigger, longer stone room than lobby's
        master_air=1.1,
    )
    s.progression(PROG_WAIT)
    s.gain(choir=1.05, pad=1.10, keys=1.05, perc=0.72, sub=0.85)
    # heavy cathedral sends on the sacred buses; a touch on fx for the sermon/bell.
    s.verb(pad=0.52, keys=0.34, choir=0.74, fx=0.30)

    # ---------------------------------------------------------- SIGNATURE INTRO
    # A cathedral breathing in: an organ/choir WASH from silence + a distant
    # church BELL + the black-priest SERMON (say, --tts). Replaces the old cold
    # HUM entirely. Faded from sample 0, so the loop join stays safe. intro.py.
    s.custom("fx", intro.room)

    # ============================================== THE ORGAN — the cathedral bed
    # There is no organ voice in the kit, so it is stacked drawbar partials
    # (intro._organ). One chord per bar, but each note is TWO bars long and placed
    # every bar, so consecutive chords cross-fade and the bed never gaps — a
    # continuous organ whose chord changes are smoothed by the long reverb rather
    # than a per-bar pulse. Rendered through bar 16 (= bar 0's Dm) for the seam.
    def organ_bed(ctx):
        r = ctx.sub_rng("room-organ")
        dur = ctx.beat_s(8)                          # two bars, heavy overlap
        for b in range(0, ctx.score.bars + 1):
            freqs = [hz(t) for t in music.chord(ctx.score.chord_at(b), 3)]
            x = intro._organ(r, freqs, dur)
            x = x * dsp.swell(len(x), rise=0.18, fall=1.8)
            ctx.add("pad", x * ORGAN_ARC.get(b, 0.6) * 0.92, b * 4, pan=-0.03)
    s.custom("pad", organ_bed)

    # a soft 16' pedal under every bar — organ weight, sine, no attack of its own.
    s.bass((0, 16), "X...............", octave=-2, style="sub", gain=0.30,
           length=3.6)
    s.bass((16, 17), "X...............", octave=-2, style="sub", gain=0.30,
           length=3.6)                               # mirror bar

    # ======================================== THE CHOIR — sacred / gospel voices
    # Low, dark and slow at the head and tail; opening its vowels and lifting
    # through the middle. Head (0-4, "oo") and tail (14-16, "oo") match for the
    # loop; the alto/tenor/bass cluster keeps the opening solemn, not bright.
    s.choir_pad((0, 4), vowel="oo", dyn=0.32, voices_scale=0.60, effort=0.20,
                parts=("alto", "tenor", "bass"), gain=0.84)
    s.choir_pad((4, 8), vowel=["oh", "oh", "ah", "oh"], dyn=0.46,
                voices_scale=0.80, effort=0.34, gain=0.98)
    s.choir_pad((8, 10), vowel="ah", dyn=0.62, voices_scale=0.95, effort=0.52,
                gain=1.00)

    # THE CLIMAX (旋律高潮轉折): the sopranos sing the hook over full SATB support
    # — the melodic turn the waiting room never had. Four bars = one HOOK_A.
    s.choir_hook((10, 14), phrase="A", vowel="ah", dyn=0.92, effort=0.82,
                 voices_scale=1.0, gain=1.06)
    s.choir_pad((10, 14), vowel="ah", dyn=0.70, voices_scale=0.90, effort=0.60,
                parts=("alto", "tenor", "bass"), gain=0.74)
    # a gospel drive under the climax: low "oh" chant stabs on the downbeats.
    s.choir_chant((10, 14), pattern="X...X...X...X...", vowel="oh", dyn=0.66,
                  parts=("tenor", "bass"), length=0.5, gain=0.60)

    # resolve back to the soft opening cluster (mirrors the head for the loop).
    s.choir_pad((14, 16), vowel="oo", dyn=0.34, voices_scale=0.62, effort=0.22,
                parts=("alto", "tenor", "bass"), gain=0.84)
    s.choir_pad((16, 17), vowel="oo", dyn=0.32, voices_scale=0.60, effort=0.20,
                parts=("alto", "tenor", "bass"), gain=0.84)   # mirror bar

    # ============================================== CHURCH BELLS + CLIMAX TIMPANI
    # A low toll marks the room on bars 6 and 14 (mid-block, never on a section
    # change); a soft timpani is the only percussion, lifting the climax.
    def bells(ctx):
        r = ctx.sub_rng("room-bell")
        for b, m in [(6, note("D3")), (14, note("A2"))]:
            x = dsp.lowpass(intro._bell_note(r, hz(m), 3.4, decay=2.6, bright=0.55),
                            2600.0, 2)
            ctx.add("keys", x * 0.5, b * 4, pan=0.16)
    s.custom("keys", bells)

    s.drum("timpani", "X.......X.......", (10, 14), gain=0.30, humanize=0.010,
           f0=58.0, decay=1.7)

    # ================================================ THE CLIMAX TAUNT (say, --tts)
    # "Kneel down. Your hour has come." — dropped at bar ~9.3 so its last words
    # land as the sopranos enter at bar 10: the sacred bed builds, the sermon
    # breaks it open, the hook cries. Silent (None) unless rendered with --tts.
    def priest_taunt(ctx):
        m = intro._say("Kneel down. Your hour has come.", "Reed", 175,
                       hp=95.0, presence=3.0)
        if m is None:
            return
        at = int(ctx.beat_s(9.3 * 4) * SR)
        dsp.fit(ctx.buses["fx"], dsp.pan(m, 0.06) * 0.6, at)
    s.custom("fx", priest_taunt)

    return s
