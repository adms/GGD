"""menu.samantha — 「戰旗 · Deep House」 the theme, reimagined as deep house.

Samantha-James variant of `menu` (task #137). menu is the pack's sacred anthem
that states the whole hook (A + B); this variant reimagines the SAME theme as a
soulful deep-house title cut — the hook sung breathily by the sopranos over a
jazzy Dm9/Bb/F Rhodes, a round house bass and a full brushed floor, with a
vocal-chop drop. Keeps the D-minor and the hook so it is unmistakably the theme.
32 bars @120 = 64.0 s, loop-safe.

NOTE ON ROTATION. The login screen does NOT rotate to this (task #134: login
stays the single epic `menu`). This variant exists so the audition page can
offer all 12+12, and it is still available anywhere the menu bed is auditioned.
"""

from ggd import samantha as S

# HOME (Dm Bb F C), jazzy, x7 then an A7 turnaround = 32 bars.
PROG = (
    ["Dm7", "Bbmaj7", "Fmaj7", "C7"] * 7
    + ["Dm7", "Bbmaj7", "Gm7", "A7"]
)
assert len(PROG) == 32, len(PROG)


def build():
    s = S.new_score(
        id="menu.samantha", key="Dm", prog=PROG, bars=32, seed=6201,
        title="戰旗 · Deep House / Banner of the Fallen (Samantha James mix)",
        mood="the theme as a soulful deep-house title cut — the hook, sung breathily",
        pump_depth=0.46,
    )

    # A — the title states (0-7): the sung hook A over an easy floor.
    S.warm_pad(s, (0, 32), gain=0.18, cutoff=2000.0)
    S.rhodes(s, (0, 8), gain=0.30)
    S.house_drums(s, (0, 8), intensity=0.9)
    S.house_bass(s, (0, 8), "..x...x...x...x.", gain=0.64, cutoff=740.0)
    S.vocal_hook(s, (0, 4), phrase="A", vowel="ah", dyn=0.9, effort=0.72, gain=1.05)
    S.vocal_pad(s, (4, 8), vowel=["oh", "ah"], dyn=0.54, voices_scale=0.82,
                effort=0.4, gain=0.86)

    # B — the answering hook out front (8-15): a breakdown into hook B (window),
    # then the floor returns with vocal chops.
    S.rhodes(s, (8, 16), gain=0.31)
    S.house_drums(s, (8, 10), kick=False, intensity=0.55, shaker=True)
    S.deep_sub(s, (8, 10), "X.......X.......", gain=0.5)
    S.vocal_hook(s, (8, 12), phrase="B", vowel="ah", dyn=0.95, effort=0.84, gain=1.1)
    S.house_drums(s, (10, 16), intensity=1.0)
    S.house_bass(s, (10, 16), "..x...x.X.x...x.", gain=0.72, cutoff=900.0)
    S.vocal_stabs(s, (12, 16), pattern="x.x.x.x.x.x.x.x.", vowel="ah", dyn=0.7,
                  gain=0.55)

    # C — the sustained anthem floor (16-27): hook A again, a driving stab.
    S.rhodes(s, (16, 28), gain=0.30)
    S.house_drums(s, (16, 28), intensity=1.0)
    S.house_bass(s, (16, 28), "..x...x.X.x...x.", gain=0.72, cutoff=900.0)
    s.chords((16, 28), voice="supersaw", octave=0, gain=0.20,
             rhythm="..x...x...x...x.", hit_beats=0.4, cutoff=4400.0)
    S.vocal_hook(s, (16, 20), phrase="A", vowel="ah", dyn=0.92, effort=0.8, gain=1.02)
    S.vocal_pad(s, (20, 28), vowel=["ah", "oh", "ah", "oo"], dyn=0.56,
                voices_scale=0.84, effort=0.42, gain=0.86)

    # A' — the come-down (28-31): decrescendo, A7 into bar 0's Dm7 across the seam.
    S.rhodes(s, (28, 32), gain=0.28)
    S.house_drums(s, (28, 32), intensity=0.88)
    S.house_bass(s, (28, 32), "..x...x...x...x.", gain=0.6, cutoff=700.0)
    S.vocal_pad(s, (28, 32), vowel=["oh", "oo"], dyn=0.48, voices_scale=0.74,
                effort=0.32, gain=0.8)
    s.drum("openhat", "........x.x.x.x.", (31, 32), gain=0.06, pan=-0.16, decay=0.05)
    return s
