"""victory.samantha — 「凱歌 · Lounge」 the win, reimagined as a soulful house cut.

Samantha-James variant of `victory` (task #137). victory is the ~12 s one-shot
fanfare that reprises the hook; this keeps its D-minor and its resolving cadence
but plays it as a celebratory deep-house flourish — a warm floor, a round bass,
a held pad + jazzy Rhodes carrying the mid, and the sopranos singing hook A over
the top. One-shot, fades to silence. 6 bars @120 = 12.0 s.
"""

from ggd import samantha as S

PROG = ["Dm7", "Dm7", "Bbmaj7", "Fmaj7", "C7", "Dm7"]


def build():
    s = S.new_score(
        id="victory.samantha", key="Dm", prog=PROG, bars=6, seed=6208,
        title="凱歌 · Lounge / Raise the Banner (Samantha James mix)",
        mood="a soulful deep-house win — warm floor, the hook sung in triumph",
        loop=False, pump_depth=0.4,
    )
    s.verb(keys=0.24, pad=0.36, strings=0.34, choir=0.36)
    s.tail_s = 2.8

    # a held pad + a sustained supersaw bed keep the mid full under the vocal.
    S.warm_pad(s, (0, 6), gain=0.24, cutoff=2000.0)
    S.rhodes(s, (0, 6), gain=0.34)
    s.chords((1, 6), voice="strings", octave=0, gain=0.24)
    s.chords((1, 6), voice="supersaw", octave=0, gain=0.16,
             rhythm="..x...x...x...x.", hit_beats=0.4, cutoff=4600.0)

    # bar 0 opens exposed (vocal swell = the choir window), then the floor lands.
    S.vocal_pad(s, (0, 1), vowel="ah", dyn=0.76, voices_scale=0.92, effort=0.56,
                gain=1.0)
    s.fx("impact", at_bar=1.0, length_bars=1.0, gain=0.36)
    S.house_drums(s, (1, 6), intensity=1.0)
    S.house_bass(s, (1, 6), "..x...x.X.x...x.", gain=0.74, cutoff=920.0)

    # the sopranos sing hook A across the resolution — victory "quotes A".
    S.vocal_hook(s, (1, 5), phrase="A", vowel="ah", dyn=0.9, effort=0.8, gain=0.96)
    S.vocal_pad(s, (5, 6), vowel=["ah", "oh"], dyn=0.54, voices_scale=0.8,
                effort=0.42, gain=0.82)
    return s
