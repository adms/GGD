"""combat.samantha — 「戦域 · Deep House」 the battle, reimagined as deep house.

Samantha-James variant of `combat` (task #137). combat is the relentless
workhorse loop on the HOME anthem cadence; this keeps its D-minor and that
i-VI-III-VII shape but drives it as a soulful deep-house record instead of an
EDM one — a four-on-the-floor floor with a rolling reese bass, a jazzy Dm9/Bb/F
Rhodes, the pack HOOK sung by the sopranos and chopped vocal stabs over the
drops. "Fast" via the house pulse, not by tempo. 32 bars @120 = 64.0 s, loop-safe.
"""

from ggd import samantha as S

# HOME (Dm Bb F C) in jazzy 7ths, x7 then an A7 turnaround cycle = 32 bars.
PROG = (
    ["Dm7", "Bbmaj7", "Fmaj7", "C7"] * 7     # 0-27
    + ["Dm7", "Bbmaj7", "Gm7", "A7"]         # 28-31 A7 pulls back to bar 0's Dm7
)
assert len(PROG) == 32, len(PROG)


def build():
    s = S.new_score(
        id="combat.samantha", key="Dm", prog=PROG, bars=32, seed=6206,
        title="戦域 · Deep House / Contested Ground (Samantha James mix)",
        mood="driving deep-house — the workhorse loop as a soulful house record",
        pump_depth=0.5,
    )

    # A — the floor establishes (0-7): Rhodes + pad + full groove + rolling bass.
    S.warm_pad(s, (0, 32), gain=0.16, cutoff=2000.0)
    S.rhodes(s, (0, 8), gain=0.28)
    S.house_drums(s, (0, 8), intensity=0.95)
    S.house_bass(s, (0, 8), "..x...x...x...x.", gain=0.66, cutoff=760.0)
    S.vocal_pad(s, (0, 8), vowel=["oo", "oh", "ah", "oh"], dyn=0.5,
                voices_scale=0.76, effort=0.34, gain=0.82)

    # B — the hook out front (8-15): a short breakdown into the sung hook, then
    # the floor slams back with vocal chops. This is the choir-gate window.
    S.rhodes(s, (8, 16), gain=0.30)
    S.house_drums(s, (8, 10), kick=False, intensity=0.55, shaker=True)
    S.deep_sub(s, (8, 10), "X.......X.......", gain=0.5)
    S.vocal_hook(s, (8, 12), phrase="A", vowel="ah", dyn=0.94, effort=0.8,
                 gain=1.08)
    S.house_drums(s, (10, 16), intensity=1.0)
    S.house_bass(s, (10, 16), "..x...x.X.x...x.", gain=0.72, cutoff=900.0)
    S.vocal_stabs(s, (12, 16), pattern="x.x.x.x.x.x.x.x.", vowel="ah", dyn=0.7,
                  gain=0.55)

    # C — the sustained drive (16-27): the reese carries the groove, sopranos
    # sing the answering hook B, a driving supersaw stab off the beat.
    S.rhodes(s, (16, 28), gain=0.30)
    S.house_drums(s, (16, 28), intensity=1.0)
    s.bass((16, 28), "X.xxX.xxX.xxX.xx", octave=-2, style="reese", gain=0.6,
           cutoff=1200.0)
    S.house_bass(s, (16, 28), "X.......X.......", gain=0.5, cutoff=640.0)
    s.chords((16, 28), voice="supersaw", octave=0, gain=0.20,
             rhythm="..x...x...x...x.", hit_beats=0.4, cutoff=4200.0)
    S.vocal_hook(s, (16, 20), phrase="B", vowel="ah", dyn=0.9, effort=0.78,
                 gain=1.0)
    S.vocal_pad(s, (20, 28), vowel=["ah", "oh", "ah", "oo"], dyn=0.56,
                voices_scale=0.84, effort=0.42, gain=0.86)

    # A' — the turnaround (28-31): decrescendo to a filtered groove so the loop
    # seam lands soft; A7 in bar 31 resolves into bar 0's Dm7 across the join.
    S.rhodes(s, (28, 32), gain=0.28)
    S.house_drums(s, (28, 32), intensity=0.9)
    S.house_bass(s, (28, 32), "..x...x...x...x.", gain=0.62, cutoff=700.0)
    S.vocal_pad(s, (28, 32), vowel=["oh", "oo"], dyn=0.48, voices_scale=0.74,
                effort=0.32, gain=0.8)
    s.drum("openhat", "........x.x.x.x.", (31, 32), gain=0.06, pan=-0.16, decay=0.05)
    return s
