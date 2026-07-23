"""menuNocturne.samantha — 「夕凪 · Lounge」 the nocturne, as an F-major house cut.

Samantha-James variant of `menuNocturne` (task #137). The nocturne is the login
screen's serene second theme, one high soprano over a sparse harp, in F MAJOR
(the relative major of the pack's D minor). This variant keeps F major and its
still, wordless calm but sets it gently grooving — an Fmaj7 lounge floor with a
soft brushed pulse, a round bass, warm Rhodes and a breathy soprano-led vocal.
No D-minor hook (this cue lives in F), so the vocal is a wordless "oo"/"ah" pad.
24 bars @120 = 48.0 s, loop-safe.

This is the leaderboard bed (task #134), so it MAY rotate — the audition offers
the serene original and this lounge variant side by side.
"""

from ggd import samantha as S

# F major lounge jazz, one per bar; x3 = 24 bars. Fmaj7 home, a Dm7/Gm7 dip.
PROG = ["Fmaj7", "Am7", "Bbmaj7", "C7", "Dm7", "Gm7", "C7", "Fmaj7"] * 3
assert len(PROG) == 24, len(PROG)


def build():
    s = S.new_score(
        id="menuNocturne.samantha", key="F", prog=PROG, bars=24, seed=6212,
        title="夕凪 · Lounge / Evening Calm (Samantha James mix)",
        mood="serene F-major lounge — the nocturne, gently grooving, a wordless soprano",
        pump_depth=0.24,
    )
    # a bigger, softer room than the floor cues — this is the calm bed.
    s.verb(keys=0.3, pad=0.4, choir=0.6)

    S.warm_pad(s, (0, 24), gain=0.24, cutoff=1500.0)
    S.rhodes(s, (0, 12), rhythm=S.COMP_SPARSE, gain=0.28)
    S.rhodes(s, (12, 24), rhythm=S.COMP, gain=0.30)

    # a soft half-house pulse; bars 8-9 open right up so the soprano is exposed.
    S.half_house(s, (0, 8), intensity=0.7)
    S.half_house(s, (8, 10), intensity=0.35)
    S.half_house(s, (10, 24), intensity=0.85)

    S.house_bass(s, (0, 8), "X.......x.......", gain=0.5, cutoff=540.0)
    S.deep_sub(s, (8, 10), "X.......X.......", gain=0.42)
    S.house_bass(s, (10, 24), "X.....x.X.......", gain=0.56, cutoff=580.0)

    # soprano-led wordless vocal (F-major; no Dm hook). Exposed on bars 8-9.
    S.vocal_pad(s, (0, 8), vowel=["oo", "oh", "oo", "ah"], dyn=0.46,
                voices_scale=0.7, effort=0.28,
                parts=("soprano", "alto", "tenor"), gain=0.9)
    S.vocal_pad(s, (8, 10), vowel="ah", dyn=0.72, voices_scale=0.88, effort=0.48,
                parts=("soprano", "alto"), gain=1.06)
    S.vocal_pad(s, (10, 24), vowel=["oh", "oo", "ah", "oo"], dyn=0.48,
                voices_scale=0.72, effort=0.3,
                parts=("soprano", "alto", "tenor"), gain=0.92)

    s.drum("openhat", "............x...", (23, 24), gain=0.045, pan=-0.16, decay=0.06)
    return s
