"""fireRing.samantha — 「火環 · Deep House」 the hazard, reimagined as deep house.

Samantha-James variant of `fireRing` (task #137). fireRing is a 30-second
tension countdown; the deep-house variant keeps its D-minor and its PROG_RING
(the brooding Dm/Bb/C twice, then the Gm-Gm-A-A turn to the dominant), but plays
the tension as a darker, moodier late-house cut — a tight driving bass, brushed
four-on-the-floor, minor-key Rhodes and a close, breathy "oh"/"mm" vocal that
leans on the A7 dominant before the loop pulls back. 24 bars @120 = 48.0 s.
"""

from ggd import samantha as S

# PROG_RING (Dm Dm Bb C, x2, then Gm Gm A A) jazzed, x2 = 24 bars.
PROG = (["Dm7", "Dm7", "Bbmaj7", "C7"] * 2 + ["Gm7", "Gm7", "A7", "A7"]) * 2
assert len(PROG) == 24, len(PROG)


def build():
    s = S.new_score(
        id="fireRing.samantha", key="Dm", prog=PROG, bars=24, seed=6211,
        title="火環 · Deep House / Ring of Fire (Samantha James mix)",
        mood="dark, moody late-house tension — the countdown as a deep-house cut",
        pump_depth=0.5,
    )
    # a harder, closer room for the tension.
    s.verb(keys=0.18, pad=0.28, choir=0.44)

    S.warm_pad(s, (0, 24), gain=0.20, cutoff=1500.0)
    S.rhodes(s, (0, 12), rhythm=S.COMP, gain=0.28)
    S.rhodes(s, (12, 24), rhythm=S.COMP, gain=0.30)

    # tight driving groove throughout; the Gm/A turns (bars 8-11, 20-23) push a
    # tresillo kick for the countdown urgency.
    S.house_drums(s, (0, 8), intensity=0.92)
    s.drum("kick", "X..X..X...X..X..", (8, 12), gain=0.9, f_end=48.0, decay=0.32)
    S.house_drums(s, (8, 12), kick=False, intensity=0.9)
    S.house_drums(s, (12, 20), intensity=0.95)
    s.drum("kick", "X..X..X...X..X..", (20, 24), gain=0.92, f_end=48.0, decay=0.32)
    S.house_drums(s, (20, 24), kick=False, intensity=0.95)

    S.house_bass(s, (0, 8), "X.x.X.x.X.x.X.x.", gain=0.68, cutoff=680.0)
    S.house_bass(s, (8, 12), "X.x.X.x.X.x.X.x.", gain=0.72, cutoff=760.0)
    S.house_bass(s, (12, 24), "X.x.X.x.X.x.X.x.", gain=0.7, cutoff=720.0)

    # the vocal: darker vowels, exposed on the Gm/A dominant lean (bars 10-11).
    S.vocal_pad(s, (0, 8), vowel=["oh", "oo", "oh", "uh"], dyn=0.5,
                voices_scale=0.74, effort=0.3, gain=0.84)
    S.vocal_pad(s, (8, 10), vowel="oh", dyn=0.62, voices_scale=0.82, effort=0.42,
                gain=0.94)
    S.vocal_pad(s, (10, 12), vowel="ah", dyn=0.78, voices_scale=0.94, effort=0.56,
                gain=1.06)
    S.vocal_pad(s, (12, 20), vowel=["oh", "ah", "oh", "oo"], dyn=0.52,
                voices_scale=0.8, effort=0.38, gain=0.86)
    S.vocal_pad(s, (20, 24), vowel=["ah", "oh"], dyn=0.62, voices_scale=0.86,
                effort=0.46, gain=0.92)

    s.drum("openhat", "........x.x.x.x.", (23, 24), gain=0.06, pan=-0.16, decay=0.05)
    return s
