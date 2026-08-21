"""aot — the per-ARENA battle theme: one arc, one palette, thirteen maps.

owner 2026-08-22 (GH#531), verbatim:

  「因為現在地圖變多了，我們來為每張地圖創作新音樂吧」
  「記得要要融合進擊的巨人熱血史詩戰鬥感，有收束靜止低潮後高潮轉折，
    最後形成LOOP，每一首都要有一個戰鬥場景明顯關鍵特徵的場景音效，
    搭配人聲，也可RAP由CozyVoice產生幾句該動畫作品名句短語搭配」

WHY THIS IS A MODULE AND NOT THIRTEEN SCORES. Every one of the thirteen tracks
is the same five-section arc in the same tempo with the same palette; only the
colour changes. Writing them one at a time is thirteen rounds of the same
decisions, each free to rot separately — the exact shape 第零守則⑨ forbids
(「N 個同型 = K 個模板 + 一張表」). So the arc lives here once, the thirteen
differences live in `MAPS` below as data, and each `scores/map.<slug>.py` is
three lines. Adding arena #14 is one row.

---------------------------------------------------------------- THE ARC

48 bars @135 = 85.333 s = 2× the pack's loop grid (1,881,600 samples), so the
track is still a whole number of bars in every tempo of the family and
`dsp.seamless_loop` joins it with no drift. 2× (not 1×) because README §2 house
rule 1 allows it for "a cue the player is exposed to for minutes at a time,
and only if you have a second harmonic idea to put in the extra bars" — the
collapse-and-turn owner asked for IS that second idea, and a round lasts
minutes.

  bars  0– 8  INTRO    ostinato alone; the scene sound lights, half-lit
  bars  8–20  DRIVE    the 熱血 section: full kit, low chant, sub+reese
  bars 20–28  HOLLOW   ⭐「收束靜止低潮」 — drums OUT, one exposed voice, and
                       the scene sound alone in the silence. This is the low
                       point AND the choir gate's exposed window; they are the
                       same eight bars on purpose.
  bars 28–32  TURN     ⭐「高潮轉折」 — riser + timpani + a choir swell; the kit
                       walks back in on the last bar
  bars 32–45  CLIMAX   full SATB, supersaw doubling an octave down, epic taiko
  bars 45–48  DESCENT  the climax falls back to the ostinato, which is already
                       what bar 0 is — so the loop join is a musical return,
                       not a cut

⚠️ The ostinato runs ALL 48 BARS (README house rule 4). It is the element that
carries the loop point, which is why the join can be a return instead of a
splice — and why the HOLLOW can strip everything else away without the track
losing its floor.

---------------------------------------------------------------- THE VOICE

`人聲` is the pack's own formant choir (`ggd/choir.py`) — the same engine, so
these thirteen sit in the same room as the twelve scene beds.

`RAP` is CosyVoice 3, and it is **PRE-RENDERED TO A COMMITTED WAV**, never
called at render time. That is not a convenience: the entire tool is built on
「same score + same seed ⇒ byte-identical mp3」, and a live model call — MPS
scheduling, model revision, sampling — destroys that property outright. It is
also why the older `Score.say_line` is gated OFF by default. So:

    tools/bgm-gen/vox/<arena-slug>.<n>.wav      committed, deterministic input
    tools/bgm-gen/vox/lines.json                the text + source + voice ref

⚠️ FAIL-OPEN IS FINE; SILENT IS NOT (第二守則). A missing wav renders silence
rather than crashing the pack — but `vox_status()` reports it and
`probe/track_check.py` prints it, so a line that never got rendered cannot look
exactly like a line that did.
"""
from __future__ import annotations

import json
import os

import numpy as np

from . import dsp, music, scenefx
from .audio import SR
from .score import Score

BPM = music.BPM_DRIVE          # 135.0
BARS = 48                      # 2× loop grid: 48 × 78,400 = 3,763,200 samples

INTRO = (0, 8)
DRIVE = (8, 20)
HOLLOW = (20, 28)
TURN = (28, 32)
CLIMAX = (32, 45)
DESCENT = (45, 48)

HERE = os.path.dirname(os.path.abspath(__file__))
VOX_DIR = os.path.abspath(os.path.join(HERE, "..", "..", "vox"))
LINES_JSON = os.path.join(VOX_DIR, "lines.json")

_MISSING_VOX: list[str] = []


# ---------------------------------------------------------------- the table
#
# Thirteen rows = `content/config/arena-pool.json`'s twelve rotation arenas plus
# the finale `arena.royale`. Every colour choice is read off the arena's OWN
# authored data (groundStyle / landmark / gimmick / backdrop.profile in
# content/maps/map.*.json), never off my impression of a source work — see the
# header of `scenefx.py`.
#
#   prog     the 4-bar cycle for DRIVE/HOLLOW; CLIMAX may differ
#   ⛔ NO `scene` key: the arena's scene recordings are bound per-arena in
#      tools/bgm-gen/env/MANIFEST.json, keyed by the SAME arena id as this
#      table. Naming them twice would be a second home that goes stale.
#   colour   the ostinato instrument — the track's fingerprint
#   shape    chord-tone indices for the ostinato (0=root, 2=fifth, 4=octave)
#   kit      drumkit preset for DRIVE
#   vowels   (hollow vowel, climax vowel) for the choir
#   hollow   what carries the low point: "solo" | "strings" | "pad"
#   brass    the CLIMAX horn stack — real recorded brass is what makes this
#            register read as 進擊的巨人 rather than as a synth pad

MAPS: dict[str, dict] = {
    "arena.frieren": dict(
        name="芙莉蓮迷宮", seed=5301,
        prog=music.PROG_DARK, prog_climax=music.PROG_HOME,
        colour="harp", shape=(0, 4, 2, 4), subdiv=8, kit="drive",
        brass="horn", vowels=("oo", "ah"), hollow="solo", pump=0.50,
        note="stone · 雪藍 peaks · ruin_hall · magic_door gates ⇒ 冷、稀疏、水晶質地",
    ),
    "arena.heavens-arena": dict(
        name="天空鬥技場", seed=5302,
        prog=music.PROG_DRIVE, prog_climax=music.PROG_RISE,
        colour="piano", shape=(0, 2, 4, 6), subdiv=8, kit="rock",
        brass="horn", vowels=("oh", "ah"), hollow="pad", pump=0.55,
        note="wood · cloudSea · ring ⇒ 高、亮、開闊；上行的 climax",
    ),
    "arena.holy-grail": dict(
        name="大聖杯洞窟", seed=5303,
        prog=music.PROG_DARK, prog_climax=music.PROG_RESOLVE,
        colour="organ", shape=(0, 1, 2, 1), subdiv=8, kit="epic",
        brass="brass", vowels=("oo", "oh"), hollow="pad", pump=0.62,
        note="stone · 金邊 towers · grail · mud gates ⇒ 厚、儀式感、低男聲",
    ),
    "arena.infinity-castle": dict(
        name="無限城", seed=5304,
        prog=music.PROG_DRIVE, prog_climax=music.PROG_DARK,
        colour="koto", shape=(0, 2, 3, 2), subdiv=16, kit="drive",
        brass="horn", vowels=("ah", "ah"), hollow="solo", pump=0.58,
        note="tatami · torii · biwa_hall · 拉門 ⇒ 撥弦為主、16 分驅動",
    ),
    "arena.nazarick": dict(
        name="納薩力克大墳墓", seed=5305,
        prog=music.PROG_DARK, prog_climax=music.PROG_DARK,
        colour="piano", shape=(0, 2, 4, 2), subdiv=8, kit="epic",
        brass="brass", vowels=("oo", "oh"), hollow="pad", pump=0.66,
        note="obsidian · 亡靈綠 pagoda · throne ⇒ 全套最重；合唱壓到低把位",
    ),
    "arena.shiganshina": dict(
        name="希干希納", seed=5306,
        prog=music.PROG_DRIVE, prog_climax=music.PROG_RISE,
        colour="piano", shape=(0, 4, 2, 4), subdiv=8, kit="march",
        brass="brass", vowels=("ah", "ah"), hollow="strings", pump=0.60, hook="A",
        note="dirt · 磚 towers · plaza · city_gate ⇒ 進行曲；⭐ 這一張是本批的原型",
    ),
    "arena.world-tree": dict(
        name="世界樹核心", seed=5307,
        prog=music.PROG_RESOLVE, prog_climax=music.PROG_HOME,
        colour="harp", shape=(0, 2, 4, 5), subdiv=16, kit="four",
        brass="horn", vowels=("ah", "ah"), hollow="strings", pump=0.48,
        note="grass · sakura · tree_core · warp gates ⇒ 明亮；女聲高把位",
    ),
    "arena.castle": dict(
        name="城堡競技場（室內）", seed=5308,
        prog=music.PROG_HOME, prog_climax=music.PROG_DRIVE,
        colour="strings", shape=(0, 2, 4, 2), subdiv=8, kit="rock",
        brass="horn", vowels=("oh", "ah"), hollow="pad", pump=0.55,
        note="stone · 室內 ⇒ 通用場地：弦樂 ostinato，⛔ 不掛任何作品名句",
    ),
    "arena.colosseum": dict(
        name="羅馬大擂台（室外）", seed=5309,
        prog=music.PROG_RISE, prog_climax=music.PROG_RISE,
        colour="guitar", shape=(0, 2, 4, 2), subdiv=8, kit="march",
        brass="brass", vowels=("ah", "ah"), hollow="strings", pump=0.58,
        note="sand · 室外 ⇒ 群眾與行軍；⛔ 不掛任何作品名句",
    ),
    "arena.dota": dict(
        name="Dota 三路河道（迷你）", seed=5310,
        prog=music.PROG_HOME, prog_climax=music.PROG_DRIVE,
        colour="pluck", shape=(0, 2, 4, 6), subdiv=16, kit="four",
        brass="horn", vowels=("oo", "ah"), hollow="pad", pump=0.52,
        note="grass · 河道 ⇒ 輕、流動；⛔ 不掛任何作品名句",
    ),
    "arena.godie": dict(
        name="去死團的逆襲 EX 2.2s", seed=5311,
        prog=music.PROG_DRIVE, prog_climax=music.PROG_DRIVE,
        colour="guitar", shape=(0, 3, 2, 3), subdiv=16, kit="drive",
        brass="brass", vowels=("ah", "ah"), hollow="solo", pump=0.66, hook="A",
        note="dirt · 本家場地 ⇒ 最直接的 drive；⭐ 這張圖是遊戲自己的名字",
    ),
    "arena.skeleton": dict(
        name="新手競技場", seed=5312,
        prog=music.PROG_RESOLVE, prog_climax=music.PROG_HOME,
        colour="piano", shape=(0, 2, 4, 2), subdiv=8, kit="halftime",
        brass="horn", vowels=("oo", "oh"), hollow="pad", pump=0.42,
        note="stone · 新手 ⇒ ⭐ 唯一刻意不危險的一首：最輕的 kit、最低的 pump",
    ),
    "arena.royale": dict(
        name="終局大混戰", seed=5313,
        prog=music.PROG_DRIVE, prog_climax=music.PROG_HOME,
        colour="strings", shape=(0, 4, 2, 4), subdiv=8, kit="epic",
        brass="brass", vowels=("oh", "ah"), hollow="strings", pump=0.70, hook="A",
        note="決賽場地（刻意不在輪替池）⇒ 全套最大；climax 敢直接引用 HOOK_A",
    ),
}

#: `arena.frieren` -> `map.frieren`. The score id, the mp3 name and the
#: audio-map key all derive from this, so there is exactly one spelling.
def slug(arena_id: str) -> str:
    return arena_id.split(".", 1)[1]


def score_id(arena_id: str) -> str:
    return f"map.{slug(arena_id)}"


# ------------------------------------------------------------------ the vox

def load_lines() -> dict:
    """`vox/lines.json` — the authored RAP lines. Missing file = no rap."""
    try:
        with open(LINES_JSON, encoding="utf-8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        return {}


def vox_audit() -> list[str]:
    """Every authored line must actually be PLACED by `build()`.

    ⛔ `vox_status()` alone cannot catch a lookup that finds nothing — it only
    reports wavs that were asked for and missing. This compares the authored
    count against the placed count per arena, so "the rap silently stopped being
    wired" is a red line rather than a track that merely sounds emptier.
    """
    man = load_lines().get("arenas", {})
    bad = []
    for arena in MAPS:
        want = len(man.get(arena, {}).get("lines", []))
        got = sum(1 for lyr in build(arena).layers if lyr.name.startswith("vox:"))
        if want != got:
            bad.append(f"{arena}: 寫了 {want} 句,只排進 {got} 句")
    return bad


def vox_status() -> list[str]:
    """Which authored lines have NO rendered wav. ⛔ Never swallowed: render.py
    prints this, so a line that silently never got made cannot pass for one
    that did (第二守則: fail-open 沒錯,靜默才是缺陷)."""
    return list(_MISSING_VOX)


def _vox_mono(path: str) -> np.ndarray | None:
    if not os.path.exists(path):
        _MISSING_VOX.append(path)
        return None
    from .audio import read_wav
    x, _ = read_wav(path)
    m = x[0] if x.ndim > 1 else x
    m = np.nan_to_num(m, nan=0.0)
    return m / (np.max(np.abs(m)) or 1.0)


def vox_line(s: Score, at_bar: float, wav: str, *, gain: float = 0.85,
             pan: float = 0.0, verb: float = 0.22, bus: str = "lead") -> Score:
    """Place one PRE-RENDERED CosyVoice line on the `lead` bus at `at_bar`.

    ⚠️ `lead`, ⛔ not `fx`. The first version used `fx` (bus gain 1.10) and the
    line measured **+0.2 dB** against a six-track control group with no rap —
    i.e. inaudible. `lead` carries 2.00 and is NOT in `DEFAULT_SIDECHAIN`, so a
    voice there sits forward and does not pump on every kick. It is also the
    right slot musically: this IS the hook line.

    High-passed at 190 Hz so it sits above the bed rather than fighting the
    bass, and given a short send into a room BRIGHTER than the cathedral — a
    spoken line drowned in a 3.65 s tail is unintelligible, which defeats the
    whole point of quoting a line."""
    def fn(ctx) -> None:
        m = _vox_mono(os.path.join(VOX_DIR, wav))
        if m is None:
            return
        m = dsp.highpass(m, 190.0, 2)
        m = dsp.compress(m, thresh_db=-20.0, ratio=3.5)
        if verb > 0:
            ir = dsp.make_ir(1.25, ctx.sub_rng("vox" + wav), predelay=0.018,
                             decay_hf=0.62, tone_hz=5200.0, early=True)
            m = dsp.reverb_send(m, ir, verb)[0]
        ctx.add(bus, m * gain, at_bar * 4, pan)
    s.custom(bus, fn, f"vox:{wav}")
    return s


# ---------------------------------------------------------------- the scene

def scene_layer(s: Score, arena_id: str) -> Score:
    """Place the arena's real recordings — see scenefx's header for the sources.

    The HIT is heard three times, because the point is that the player learns it:
    half-lit under the intro, full in the hollow where nothing else is playing,
    and once hard as the turn begins. The BED runs under the intro and the whole
    hollow, so the low point has a PLACE in it and not just an absence.

    ⚠️ Everything here lands on the `fx` bus, which is NOT in `DEFAULT_SIDECHAIN`
    — a gate hauling open should not duck on every kick; it is diegetic, not a
    synth layer."""
    def fn(ctx) -> None:
        r = ctx.sub_rng("scene" + arena_id)
        hit_n = min(ctx.n, int(5.0 * SR))
        h_intro = scenefx.hit(arena_id, hit_n, np.random.default_rng(r.integers(1 << 31)))
        h_hollow = scenefx.hit(arena_id, hit_n, np.random.default_rng(r.integers(1 << 31)))
        h_turn = scenefx.hit(arena_id, min(ctx.n, int(3.2 * SR)),
                             np.random.default_rng(r.integers(1 << 31)))
        ctx.add("fx", h_intro * 0.26, INTRO[0] * 4, -0.20)
        ctx.add("fx", h_hollow * 0.80, HOLLOW[0] * 4 + 2.0, 0.10)
        ctx.add("fx", h_turn * 0.58, TURN[0] * 4, 0.0)

        bar_s = 4.0 * 60.0 / BPM
        b_intro = scenefx.bed(arena_id, int((INTRO[1] - INTRO[0]) * bar_s * SR),
                              np.random.default_rng(r.integers(1 << 31)))
        b_hollow = scenefx.bed(arena_id, int((TURN[1] - HOLLOW[0]) * bar_s * SR),
                               np.random.default_rng(r.integers(1 << 31)))
        ctx.add("fx", b_intro * 0.55, INTRO[0] * 4, -0.10)
        ctx.add("fx", b_hollow * 1.00, HOLLOW[0] * 4, 0.08)
    s.custom("fx", fn, f"scene:{arena_id}")
    return s


# ----------------------------------------------------------------- the arc

def build(arena_id: str) -> Score:
    """The whole template. Thirteen calls to this ARE the thirteen tracks."""
    if arena_id not in MAPS:
        raise ValueError(f"unknown arena {arena_id!r}; have {sorted(MAPS)}")
    m = MAPS[arena_id]
    hollow_kind = m.get("hollow", "pad")
    v_low, v_high = m["vowels"]

    s = Score(
        id=score_id(arena_id), title=m["name"], mood=m["note"],
        bpm=BPM, bars=BARS, key="Dm", seed=m["seed"], loop=True,
        pump_depth=m.get("pump", 0.55), hall=3.4,
    )
    s.progression(list(m["prog"]))
    s.gain(choir=1.05, drums=1.10, lead=1.0, keys=0.95)

    # ---- the spine: the ostinato runs every bar (README house rule 4)
    s.ostinato((0, BARS), voice=m["colour"], shape=m["shape"],
               subdiv=m["subdiv"], gain=0.30, pan=-0.12)
    scene_layer(s, arena_id)

    # ---- INTRO — one voice of colour, a sub arriving under it
    s.chords(INTRO, voice="pad", gain=0.20, cutoff=1500.0)
    s.bass((INTRO[0] + 4, INTRO[1]), "X.......X.......", style="sub", gain=0.55)
    s.choir_pad(INTRO, vowel=v_low, dyn=0.42, gain=0.55, effort=0.30,
                parts=("tenor", "bass"), voices_scale=0.6)

    # ---- DRIVE — 熱血
    s.drumkit(DRIVE, style=m["kit"])
    s.bass(DRIVE, "X..x..X.X..x..X.", style="both", gain=0.85)
    s.choir_chant(DRIVE, "x...x...x.x.x...", vowel=v_high, gain=0.85,
                  parts=("tenor", "bass"))
    s.chords(DRIVE, voice="strings", gain=0.22, cutoff=3200.0)
    s.ostinato(DRIVE, voice="supersaw", shape=m["shape"], subdiv=m["subdiv"],
               octave=1, gain=0.16, pan=0.20)
    s.melody(DRIVE[0] + 4, music.hook("cell", octave=-1), voice="supersaw",
             gain=0.26)

    # ---- HOLLOW — ⭐ 收束靜止低潮. No kit. No bass. This is the floor.
    if hollow_kind == "solo":
        # three voices at low effort = one singer with a section's beating
        # (the menuNocturne finding), so the low point has a PERSON in it
        s.choir_pad(HOLLOW, vowel=v_low, dyn=0.40, gain=0.80, effort=0.26,
                    parts=("soprano",), voices_scale=0.25, per_bar=1)
    elif hollow_kind == "strings":
        s.chords(HOLLOW, voice="strings", gain=0.30, cutoff=2200.0)
        s.choir_pad(HOLLOW, vowel=v_low, dyn=0.44, gain=0.60, effort=0.28,
                    parts=("alto", "tenor"), voices_scale=0.5)
    else:
        s.chords(HOLLOW, voice="pad", gain=0.26, cutoff=1700.0)
        s.choir_pad(HOLLOW, vowel=v_low, dyn=0.46, gain=0.66, effort=0.30,
                    parts=("tenor", "bass"), voices_scale=0.7)
    s.drum("taiko", "X...............", (HOLLOW[0] + 4, HOLLOW[1]), gain=0.30)

    # ---- TURN — ⭐ 高潮轉折
    s.fx("riser", TURN[0], length_bars=4.0, gain=0.34)
    s.drum("timpani", "x.x.x.x.x.x.X.X.", TURN, gain=0.42, humanize=0.004)
    # ⭐ Tremolo strings under the riser. This is the single most recognisable
    # gesture of the register owner asked for, and it was simply unavailable
    # before the sample bank — the oscillator kit has no bowed tremolo at all.
    s.chords(TURN, voice="tremolo", gain=0.34, cutoff=5000.0)
    s.choir_pad(TURN, vowel=v_high, dyn=0.70, gain=0.85, effort=0.55, per_bar=2)
    s.bass((TURN[0] + 2, TURN[1]), "X...X...X...X...", style="reese", gain=0.70)
    s.drumkit((TURN[1] - 1, TURN[1]), style="drive", gain=0.8)
    s.fx("impact", CLIMAX[0], length_bars=1.5, gain=0.52)

    # ---- CLIMAX — 高潮
    s.progression(list(m["prog"]))          # DRIVE/HOLLOW cycle stays authoritative
    s.drumkit(CLIMAX, style="drive", gain=1.05)
    s.drum("taiko", "X...X...X..xX.x.", CLIMAX, gain=0.62, humanize=0.006)
    s.drum("cymbal", "X...............", (CLIMAX[0], CLIMAX[0] + 1), gain=0.45)
    s.bass(CLIMAX, "X..x..X.X..x..X.", style="both", gain=0.92)
    s.choir_pad(CLIMAX, vowel=v_high, dyn=0.86, gain=1.0, effort=0.72, per_bar=2)
    if m.get("hook") == "A":
        s.choir_hook((CLIMAX[0] + 4, CLIMAX[0] + 8), phrase="A", vowel=v_high,
                     gain=0.9)
        s.lead((CLIMAX[0] + 4, CLIMAX[0] + 8), phrase="A", octave=-1, gain=0.46)
    else:
        s.melody(CLIMAX[0] + 4, music.hook("cell"), voice="supersaw", gain=0.40)
        s.melody(CLIMAX[0] + 8, music.hook("cell", octave=1), voice="supersaw",
                 gain=0.32)
    s.chords(CLIMAX, voice="strings", gain=0.26, cutoff=4200.0)
    # ⭐ THE HORN STACK — recorded brass under the choir, holding whole bars an
    # octave below the voices. ⛔ Not a supersaw pretending: the reason this
    # register never worked before is that a sawtooth has no brass formant and
    # no player-to-player timing spread, and no amount of gain fixes either.
    s.chords(CLIMAX, voice=m.get("brass", "horn"), octave=-1, gain=0.30,
             cutoff=5200.0)
    s.chords((CLIMAX[0] + 6, CLIMAX[1]), voice="trombone", octave=-1, gain=0.18,
             rhythm="X.......X.......", hit_beats=2.0)
    s.ostinato(CLIMAX, voice="supersaw", shape=m["shape"], subdiv=m["subdiv"],
               octave=1, gain=0.22, pan=0.22)

    # ---- DESCENT — fall back to what bar 0 already is, so the join is a return
    s.chords(DESCENT, voice="pad", gain=0.22, cutoff=1600.0)
    s.choir_pad(DESCENT, vowel=v_low, dyn=0.50, gain=0.55, effort=0.34,
                parts=("tenor", "bass"), voices_scale=0.7)
    s.drum("taiko", "X.......x.......", (DESCENT[0], DESCENT[0] + 2), gain=0.42)
    s.drum("kick", "X...X...X...X...", (DESCENT[0], DESCENT[0] + 1), gain=0.7)
    s.fx("downlifter", DESCENT[0], length_bars=2.0, gain=0.30)

    # ---- the RAP, if this arena has authored lines
    # ⚠️ `["arenas"][arena_id]`, ⛔ not `[arena_id]`: lines.json nests the table
    # under "arenas", and the flat lookup this used to do found nothing, placed
    # no lines, and reported no problem — `vox_status()` only names wavs that
    # were REQUESTED, so a layer that is never requested is invisible to it.
    # ⭐ That is the exact failure shape 第二守則⑤ describes: everything green,
    # feature absent. The audit below is the fix for the class, not just this bug.
    for ln in load_lines().get("arenas", {}).get(arena_id, {}).get("lines", []):
        vox_line(s, float(ln["bar"]), ln["wav"],
                 gain=float(ln.get("gain", 0.85)), pan=float(ln.get("pan", 0.0)))
    return s
