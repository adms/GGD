"""intermission.samantha — 「街の合間 · Deep House」 the shop, as a lounge record.

Samantha-James variant of `intermission` (task #137). The original already turns
city-pop into an EDM burst; this variant takes the same shop-breathes idea all
the way into a soulful deep-house lounge cut — jazzy Dmadd9/Gm7/Bbmaj7 Rhodes,
a smooth fingered bass, brushed four-on-the-floor and a breathy female vocal
that lifts through the middle and comes back down. Keeps the D-minor/F-major
warmth and the A7 turnaround the original loves. 32 bars @120 = 64.0 s, loop-safe.
"""

from ggd import samantha as S

# Warm city-pop jazz, one per bar; the A7 (V7/i) is the recurring turnaround.
PROG = (
    ["Dmadd9", "Gm7", "Bbmaj7", "Fmaj7"]     # 0-3
    + ["Dmadd9", "Gm7", "Bbmaj7", "C7"]      # 4-7
    + ["Dm7", "Gm7", "Am7", "A7"]            # 8-11 turnaround
    + ["Bbmaj7", "C7", "Dm7", "Gm7"]         # 12-15 the lift
    + ["Dm7", "Bbmaj7", "Fmaj7", "C7"]       # 16-19 full floor
    + ["Dm7", "Bbmaj7", "Am7", "A7"]         # 20-23
    + ["Dmadd9", "Gm7", "Bbmaj7", "Fmaj7"]   # 24-27 comedown
    + ["Bbmaj7", "C7", "Gm7", "A7"]          # 28-31 A7 -> bar 0's Dmadd9 seam
)
assert len(PROG) == 32, len(PROG)


def build():
    s = S.new_score(
        id="intermission.samantha", key="Dm", prog=PROG, bars=32, seed=6205,
        title="街の合間 · Deep House / City Between (Samantha James mix)",
        mood="soulful deep-house lounge — the shop breathes, a vocal lifts and settles",
        pump_depth=0.42,
    )

    # A — the head settles (0-11): Rhodes + pad + full groove + smooth bass + oo.
    S.warm_pad(s, (0, 32), gain=0.17, cutoff=1900.0)
    S.rhodes(s, (0, 12), gain=0.30)
    S.house_drums(s, (0, 12), intensity=0.92)
    S.house_bass(s, (0, 12), "..x...x.X.x...x.", gain=0.66, cutoff=720.0)
    S.vocal_pad(s, (0, 12), vowel=["oo", "oh", "oo", "ah"], dyn=0.48,
                voices_scale=0.74, effort=0.32, gain=0.82)

    # B — the vocal lift (12-15): thin the floor, sopranos take the hook (window).
    S.rhodes(s, (12, 16), gain=0.30)
    S.house_drums(s, (12, 14), kick=False, intensity=0.6, shaker=True)
    S.deep_sub(s, (12, 14), "X.......X.......", gain=0.5)
    S.vocal_hook(s, (12, 16), phrase="A", vowel="ah", dyn=0.94, effort=0.82,
                 gain=1.08)
    S.house_drums(s, (14, 16), intensity=0.95)

    # C — the full floor (16-23): the deep-house peak, vocal chops over the top.
    S.rhodes(s, (16, 24), gain=0.31)
    S.house_drums(s, (16, 24), intensity=1.0)
    S.house_bass(s, (16, 24), "..x...x.X.x...x.", gain=0.72, cutoff=900.0)
    s.chords((16, 24), voice="supersaw", octave=0, gain=0.18,
             rhythm="..x...x...x...x.", hit_beats=0.4, cutoff=4400.0)
    S.vocal_stabs(s, (16, 24), pattern="..x...x...x...x.", vowel="ah", dyn=0.66,
                  gain=0.5)
    S.vocal_pad(s, (16, 24), vowel=["ah", "oh"], dyn=0.5, voices_scale=0.8,
                effort=0.4, parts=("alto", "tenor"), gain=0.66)

    # A' — the comedown (24-31): back to the lazy groove for a soft loop seam.
    S.rhodes(s, (24, 32), gain=0.29)
    S.house_drums(s, (24, 32), intensity=0.88)
    S.house_bass(s, (24, 32), "..x...x...x...x.", gain=0.62, cutoff=700.0)
    S.vocal_pad(s, (24, 32), vowel=["oh", "oo", "oh", "oo"], dyn=0.46,
                voices_scale=0.72, effort=0.3, gain=0.8)
    s.drum("openhat", "........x.x.x.x.", (31, 32), gain=0.06, pan=-0.16, decay=0.05)
    return s
