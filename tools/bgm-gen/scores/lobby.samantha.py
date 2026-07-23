"""lobby.samantha — 「灯火 · Lounge」 the warm hall, reimagined as deep house.

Samantha-James variant of `lobby` (task #137). Keeps lobby's D-minor / F-major
warmth and its unhurried, welcoming mood, but trades the distant cathedral choir
for a soulful lounge groove: a Fmaj7-C7-Dm7-Bbmaj7 Rhodes comp over a round
house bass and brushed four-on-the-floor, with a breathy "oo"/"ah" vocal pad
floating on top. 16 bars @120 = 32.0 s, loop-safe.
"""

from ggd import samantha as S

# Fmaj7 C7 Dm7 Bbmaj7 — lobby's warm PROG (F C Dm Bb) in jazzy 7ths, x4 = 16 bars.
PROG = ["Fmaj7", "C7", "Dm7", "Bbmaj7"] * 4


def build():
    s = S.new_score(
        id="lobby.samantha", key="Dm", prog=PROG, bars=16, seed=6202,
        title="灯火 · Lounge / Hearthlight (Samantha James mix)",
        mood="warm deep-house lounge — the lit hall, unhurried, a breathy vocal floats",
        pump_depth=0.34,
    )

    # the warm cushion + Rhodes comp run the whole loop (a fill in the last bar).
    S.warm_pad(s, (0, 16), gain=0.20, cutoff=1650.0)
    S.rhodes(s, (0, 8), gain=0.30)
    S.rhodes(s, (8, 16), gain=0.33)

    # groove: full four-on-the-floor, but bars 8-9 break down (kick out) so the
    # vocal steps in front — that is the choir-gate window and the lounge "lift".
    S.house_drums(s, (0, 8), intensity=0.9)
    S.house_drums(s, (8, 10), kick=False, intensity=0.7, shaker=False)
    S.house_drums(s, (10, 16), intensity=0.95)

    S.house_bass(s, (0, 8), "..x...x...x...x.", gain=0.62, cutoff=600.0)
    S.deep_sub(s, (8, 10), "X.......X.......", gain=0.5)
    S.house_bass(s, (10, 16), "..x...x.X.x...x.", gain=0.66, cutoff=640.0)

    # the vocal: an "oo"/"oh" pad throughout, opening to "ah" in the breakdown.
    S.vocal_pad(s, (0, 8), vowel=["oo", "oh", "oo", "oh"], dyn=0.44,
                voices_scale=0.72, effort=0.26, gain=0.86)
    S.vocal_pad(s, (8, 10), vowel="ah", dyn=0.72, voices_scale=0.9, effort=0.5,
                gain=1.05)
    S.vocal_pad(s, (10, 16), vowel=["oh", "oo", "oh", "oo"], dyn=0.46,
                voices_scale=0.74, effort=0.28, gain=0.88)

    # last-bar fill: an open hat sweep so the loop seam has a lift back to bar 0.
    s.drum("openhat", "........x.x.x.x.", (15, 16), gain=0.06, pan=-0.16, decay=0.06)
    return s
