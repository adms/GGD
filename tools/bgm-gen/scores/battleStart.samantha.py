"""battleStart.samantha — 「開陣 · Drop」 the gate, reimagined as a house drop-in.

Samantha-James variant of `battleStart` (task #137). battleStart is the ~8 s
one-shot that slams the gate into the fight; this keeps its D-minor and its lift
(Bb Bb C Dm) but plays it as a deep-house DROP-IN — a filter riser and a breathy
vocal swell over the build, then a four-on-the-floor drop with a jazzy Rhodes, a
held pad + supersaw stab and a vocal hook-cell landing on Dm. One-shot, fades to
silence. 4 bars @120 = 8.0 s.
"""

from ggd import samantha as S

PROG = ["Bbmaj7", "Bbmaj7", "C7", "Dm7"]


def build():
    s = S.new_score(
        id="battleStart.samantha", key="Dm", prog=PROG, bars=4, seed=6207,
        title="開陣 · Drop / The Gate Opens (Samantha James mix)",
        mood="a deep-house drop-in — a vocal swell, then the floor lands on the fight",
        loop=False, pump_depth=0.42,
    )
    s.verb(keys=0.24, pad=0.36, strings=0.36, choir=0.28)
    s.tail_s = 2.0

    # a warm pad + a soft strings bed run the WHOLE sting (build + drop), so the
    # mid band is full and the exposed vocal never dominates the short track.
    S.warm_pad(s, (0, 4), gain=0.28, cutoff=2100.0)
    s.chords((0, 4), voice="strings", octave=0, gain=0.28)

    # bars 0-1: the build — riser + a swelling Rhodes + a breathy vocal "ah"
    # swell (the choir-gate window), no kick yet.
    s.fx("riser", at_bar=0.0, length_bars=2.0, gain=0.28, f_lo=260.0, f_hi=8200.0)
    S.rhodes(s, (0, 2), rhythm=S.COMP_SPARSE, gain=0.28)
    S.vocal_pad(s, (0, 2), vowel=["oh", "ah"], dyn=0.62, voices_scale=0.88,
                effort=0.5, gain=0.82)

    # bar 2 the impact, bars 2-3 the drop: full floor + a driving Rhodes/supersaw
    # stab carrying the mid + a hook-cell vocal stab on Dm.
    s.fx("impact", at_bar=2.0, length_bars=1.0, gain=0.5)
    S.rhodes(s, (2, 4), gain=0.36)
    s.chords((2, 4), voice="supersaw", octave=0, gain=0.26,
             rhythm="..x...x...x...x.", hit_beats=0.4, cutoff=4600.0)
    S.house_drums(s, (2, 4), intensity=1.0)
    S.house_bass(s, (2, 4), "..x...x.X.x...x.", gain=0.74, cutoff=920.0)
    S.vocal_hook(s, (2, 4), phrase="cell", vowel="ah", dyn=0.86, effort=0.82,
                 gain=0.9)
    return s
