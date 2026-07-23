"""champSelect.samantha — 「選抜 · Lounge」 the draft, reimagined as deep house.

Samantha-James variant of `champSelect` (task #137). Keeps the D-minor and the
PROG_DRIVE (Dm C Bb C) anticipation, but turns the ticking-clock build into a
grooving deep-house floor: a 16th shaker + plucked ostinato ARE the ticking, a
driving offbeat bass and four-on-the-floor push it forward, and the vocal rises
across the loop with a hook fragment near the top. 24 bars @120 = 48.0 s.
"""

from ggd import samantha as S

# PROG_DRIVE (Dm C Bb C) in jazzy 7ths, x6 = 24 bars — every cycle leans on C7.
PROG = ["Dm7", "C7", "Bbmaj7", "C7"] * 6


def build():
    s = S.new_score(
        id="champSelect.samantha", key="Dm", prog=PROG, bars=24, seed=6204,
        title="選抜 · Lounge / The Choosing (Samantha James mix)",
        mood="grooving anticipation — a deep-house draft floor, the clock ticks in the shaker",
        pump_depth=0.4,
    )

    S.warm_pad(s, (0, 24), gain=0.18, cutoff=1800.0)
    S.rhodes(s, (0, 24), gain=0.30)
    # the "ticking clock": a plucked chord-tone ostinato in 16ths, panned.
    s.ostinato((0, 24), voice="pluck", shape=(0, 2, 4, 2), subdiv=8, octave=1,
               gain=0.22, pan=0.2)

    # driving groove; bars 10-11 break for a vocal lift (choir window), then build.
    S.house_drums(s, (0, 10), intensity=0.95)
    S.house_drums(s, (10, 12), kick=False, intensity=0.6, shaker=True)
    S.house_drums(s, (12, 24), intensity=1.0)

    S.house_bass(s, (0, 10), "..x...x...x...x.", gain=0.66, cutoff=680.0)
    S.deep_sub(s, (10, 12), "X.......X.......", gain=0.5)
    S.house_bass(s, (12, 24), "..x...x.X.x...x.", gain=0.7, cutoff=720.0)

    # the vocal rises across the loop, then the sopranos take the hook fragment.
    S.vocal_pad(s, (0, 8), vowel=["oo", "oh"], dyn=0.46, voices_scale=0.72,
                effort=0.3, gain=0.82)
    S.vocal_pad(s, (8, 10), vowel="ah", dyn=0.7, voices_scale=0.9, effort=0.5,
                gain=0.95)
    S.vocal_hook(s, (10, 12), phrase="A", vowel="ah", dyn=0.9, effort=0.74,
                 gain=1.02)
    S.vocal_pad(s, (12, 20), vowel=["oh", "ah", "oh", "oo"], dyn=0.54,
                voices_scale=0.82, effort=0.38, gain=0.86)
    S.vocal_stabs(s, (20, 24), pattern="..x...x...x...x.", vowel="ah", dyn=0.6,
                  gain=0.5)
    S.vocal_pad(s, (20, 24), vowel="oo", dyn=0.44, voices_scale=0.7, effort=0.3,
                parts=("alto", "tenor"), gain=0.7)

    s.drum("openhat", "........x.x.x.x.", (23, 24), gain=0.06, pan=-0.16, decay=0.05)
    return s
