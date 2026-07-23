"""settlement.samantha — 「餘燼 · Lounge」 the aftermath, as a chilled house cut.

Samantha-James variant of `settlement` (task #137). settlement is the reflective
results-screen reprise; this keeps its D-minor and its ceremonial calm but plays
it as a slow, warm deep-house down-tempo — a gentle half-house pulse, a soft
Rhodes, a round sub, and a breathy vocal that quotes the answering hook (B).
12 bars @120 = 24.0 s, loop-safe.
"""

from ggd import samantha as S

# HOME, then the hook-B chords, then a landing on Dm — settlement's own shape.
PROG = ["Dm7", "Bbmaj7", "Fmaj7", "C7",
        "Bbmaj7", "C7", "Bbmaj7", "C7",
        "Bbmaj7", "Fmaj7", "C7", "Dm7"]
assert len(PROG) == 12, len(PROG)


def build():
    s = S.new_score(
        id="settlement.samantha", key="Dm", prog=PROG, bars=12, seed=6210,
        title="餘燼 · Lounge / What the Battle Left (Samantha James mix)",
        mood="chilled reflective house — the aftermath, soft and warm, a quiet vocal",
        pump_depth=0.24,
    )

    S.warm_pad(s, (0, 12), gain=0.22, cutoff=1500.0)
    S.rhodes(s, (0, 12), rhythm=S.COMP, gain=0.30)

    # a gentle half-house pulse — softer than the floor cues; opens up bars 4-5.
    S.half_house(s, (0, 4), intensity=0.85)
    S.half_house(s, (4, 6), intensity=0.5)
    S.half_house(s, (6, 12), intensity=0.9)

    S.house_bass(s, (0, 4), "X.....x.X.......", gain=0.56, cutoff=560.0)
    S.deep_sub(s, (4, 6), "X.......X.......", gain=0.46)
    S.house_bass(s, (6, 12), "X.....x.X.....x.", gain=0.6, cutoff=600.0)

    # the vocal quotes the answering hook (B) — settlement "quotes B" in the pack.
    S.vocal_pad(s, (0, 4), vowel=["oo", "oh"], dyn=0.44, voices_scale=0.7,
                effort=0.28, gain=0.86)
    S.vocal_hook(s, (4, 8), phrase="B", vowel="ah", dyn=0.86, effort=0.66,
                 gain=1.02)
    S.vocal_pad(s, (8, 12), vowel=["oh", "oo", "oh", "oo"], dyn=0.46,
                voices_scale=0.72, effort=0.3, gain=0.84)

    s.drum("openhat", "............x...", (11, 12), gain=0.05, pan=-0.16, decay=0.06)
    return s
