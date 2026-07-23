"""room.samantha — 「控室 · Lounge」 the antechamber, reimagined as deep house.

Samantha-James variant of `room` (task #137). room is a cathedral holding room;
this keeps its D-minor, its patient "waiting, quietly hopeful" mood and its
PROG_WAIT shape, but relaxes it into a sparse late-night lounge: an unhurried
Rhodes over a soft house pulse, a round offbeat bass and a breathy wordless
vocal that waits with you. 16 bars @120 = 32.0 s, loop-safe.
"""

from ggd import samantha as S

# PROG_WAIT (Dm Dm Bb C Dm Dm F C) in jazzy 7ths, x2 = 16 bars.
PROG = ["Dm7", "Dm7", "Bbmaj7", "C7", "Dm7", "Dm7", "Fmaj7", "C7"] * 2


def build():
    s = S.new_score(
        id="room.samantha", key="Dm", prog=PROG, bars=16, seed=6203,
        title="控室 · Lounge / The Antechamber (Samantha James mix)",
        mood="patient late-night lounge — waiting, quietly hopeful, a wordless vocal",
        pump_depth=0.28,
    )

    S.warm_pad(s, (0, 16), gain=0.22, cutoff=1500.0)
    # sparser Rhodes than lobby — the room is quieter, more space between chords.
    S.rhodes(s, (0, 8), rhythm=S.COMP_SPARSE, gain=0.30)
    S.rhodes(s, (8, 16), rhythm=S.COMP, gain=0.32)

    # soft groove; bars 4-5 and 12-13 open up so the vocal breathes (choir window).
    S.house_drums(s, (0, 4), intensity=0.7)
    S.house_drums(s, (4, 6), kick=False, intensity=0.55, shaker=False)
    S.house_drums(s, (6, 12), intensity=0.82)
    S.house_drums(s, (12, 16), intensity=0.85)

    S.house_bass(s, (0, 4), "..x...x...x...x.", gain=0.55, cutoff=560.0)
    S.deep_sub(s, (4, 6), "X.......X.......", gain=0.46)
    S.house_bass(s, (6, 16), "..x...x...x...x.", gain=0.6, cutoff=600.0)

    S.vocal_pad(s, (0, 4), vowel="oo", dyn=0.42, voices_scale=0.68, effort=0.24,
                gain=0.84)
    S.vocal_pad(s, (4, 6), vowel=["oh", "ah"], dyn=0.7, voices_scale=0.9,
                effort=0.46, gain=1.02)
    S.vocal_pad(s, (6, 16), vowel=["oo", "oh", "oo", "oh"], dyn=0.46,
                voices_scale=0.72, effort=0.28, gain=0.86)

    s.drum("openhat", "............x.x.", (15, 16), gain=0.05, pan=-0.16, decay=0.06)
    return s
