"""defeat.samantha — 「灰燼 · Lounge」 the loss, reimagined as a down-tempo house sigh.

Samantha-James variant of `defeat` (task #137). defeat is the ~8 s one-shot
descending sigh; this keeps its D-minor and mournful descent but frames it as a
slow, warm down-tempo house cut — a soft filtered Rhodes and a held pad/strings
bed, a round sub under a barely-there brushed pulse, and a breathy descending
"oh"/"oo" vocal that thins to nothing. One-shot, fades to silence.
4 bars @120 = 8.0 s.
"""

from ggd import samantha as S

PROG = ["Dm7", "Dm7", "C7", "Bbmaj7"]


def build():
    s = S.new_score(
        id="defeat.samantha", key="Dm", prog=PROG, bars=4, seed=6209,
        title="灰燼 · Lounge / Ash (Samantha James mix)",
        mood="a slow down-tempo house sigh — warm, mournful, a vocal thins to nothing",
        loop=False, pump_depth=0.16,
    )
    # keep the vocal breathy but its reverb tail SHORT so the (short) sting isn't
    # all vocal; the held pad/strings carry the mid band alongside it.
    s.verb(keys=0.26, pad=0.36, strings=0.34, choir=0.34)
    s.tail_s = 2.6

    # a warm held bed: pad + a soft strings chord that ring through the sigh.
    S.warm_pad(s, (0, 4), gain=0.30, cutoff=1350.0)
    s.chords((0, 4), voice="strings", octave=0, gain=0.26)
    S.rhodes(s, (0, 4), rhythm=S.COMP_SPARSE, gain=0.30)

    # barely-there pulse — a soft toll + low sub, no house floor.
    s.drum("kick", "X.......X.......", (0, 3), gain=0.4, f_end=44.0, decay=0.4,
           click=0.12)
    s.fx("impact", at_bar=0.0, length_bars=1.0, gain=0.30, f0=44.0, decay=2.0)
    S.deep_sub(s, (0, 4), "X.......X.......", gain=0.5)

    # the descending "oh"/"oo" vocal — present, then thinning out.
    S.vocal_pad(s, (0, 2), vowel=["ah", "oh"], dyn=0.56, voices_scale=0.7,
                effort=0.32, gain=0.84)
    S.vocal_pad(s, (2, 4), vowel=["oh", "oo"], dyn=0.4, voices_scale=0.62,
                effort=0.24, gain=0.7)
    return s
