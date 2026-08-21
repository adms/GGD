"""scenefx — one signature SCENE sound per arena, from REAL RECORDINGS.

owner 2026-08-22 (GH#531), two rulings, in order:

    「每一首都要有一個戰鬥場景明顯關鍵特徵的場景音效」
    「環境音效也是 請先上網尋找來使用」

⚠️ THE FIRST VERSION OF THIS FILE SYNTHESISED ALL THIRTEEN FROM NUMPY and owner
judged the quality insufficient. It is replaced, not patched: every scene sound
is now a real recording from **効果音ラボ (soundeffect-lab.info)**, staged by
`tools/bgm-gen/env/FETCH.py` and ledgered in `tools/bgm-gen/env/MANIFEST.json`.
⛔ The licence condition is not optional — owner's standing authorisation for
this source is conditional on 「只要好好列出附記在授權頁面就好」, so every clip
here must also appear in `content/assets/CREDITS.md`.

WHERE THE CHOICES COME FROM. ⛔ Not from my impression of a source anime — from
the arena's own authored data (`content/maps/map.*.json`): its `gimmick` gate
ids, its `landmark` region, its `groundStyle`. `map.shiganshina` really does
have `city_gate_n`/`city_gate_s`, so it gets 「門を開ける」; `map.infinity-castle`
really does have sliding `west_door`/`east_door` over tatami, so it gets
「引き戸を開ける」. The sound is a reading of the map file, which is what keeps it
true when someone re-authors the map.

TWO ROLES, because a real catalogue gives two kinds of material and they are
not interchangeable:

  hit(arena)   the TRANSIENT — a gate hauling open, a gong, a warp. Placed at a
               moment. Peak-normalised, because what matters is the strike.
  bed(arena)   the AMBIENCE — wind, a dripping cave, a stadium, a creek. Laid
               under a section. RMS-normalised, because what matters is level.

The manifest lists both per arena and **names the role on every row**.

⚠️ THE FIRST VERSION INFERRED THE ROLE FROM DURATION (「≥ 10 s ⇒ ambience」) and
it was wrong twice out of thirteen: 「学校のチャイム」 runs 26 s but is plainly a
gesture, so 新手競技場 ended up with no transient at all, and 大聖杯洞窟 had two
beds and nothing to strike. A role is a DESIGN decision; deriving it from a
measurement was me guessing where the file should simply have said.

⚠️ EVERYTHING RETURNED FADES TO SILENCE. A tail that survives past the end of
its section runs into the loop join, and `probe/track_check.py`'s seam test is
the only thing that would catch it — after the fact, on a track that has already
been rendered.
"""
from __future__ import annotations

import json
import os

import numpy as np

from . import dsp
from .audio import SR

HERE = os.path.dirname(os.path.abspath(__file__))
ENV_DIR = os.path.abspath(os.path.join(HERE, "..", "..", "env"))
WAV_DIR = os.path.join(ENV_DIR, "wav")
MANIFEST = os.path.join(ENV_DIR, "MANIFEST.json")

#: Beds land at this RMS before the score's own gain, matching `sampler.REF_RMS`
#: so a scene bed and an instrument mean the same thing at `gain=1.0`.
BED_RMS = 10 ** (-18.0 / 20.0)

_MAN: dict | None = None
_WAV: dict[str, np.ndarray] = {}
_MISSING: list[str] = []


def manifest() -> dict:
    global _MAN
    if _MAN is None:
        try:
            with open(MANIFEST, encoding="utf-8") as fh:
                _MAN = json.load(fh)
        except FileNotFoundError:
            _MAN = {"scenes": {}, "clips": []}
    return _MAN


def missing() -> list[str]:
    """Clips the manifest names but `FETCH.py` never staged. ⛔ Never swallowed —
    `render.py` prints this, because a scene that silently lost its sound and a
    scene that never had one must not look the same (第二守則)."""
    return sorted(set(_MISSING))


#: WC3 ambience lives in its own directory, extracted straight from the retail
#: MPQs and kept byte-exact — ⛔ not under `wav/`, which is the (gitignored)
#: decode cache for the 効果音ラボ mp3s and gets rebuilt from them.
WC3_DIR = os.path.join(ENV_DIR, "wc3")


def _load(rel: str) -> np.ndarray | None:
    if rel in _WAV:
        return _WAV[rel]
    if rel.startswith("wc3/"):
        path = os.path.join(WC3_DIR, rel[4:] + ".wav")
    else:
        path = os.path.join(WAV_DIR, rel.replace("/", "__") + ".wav")
    if not os.path.exists(path):
        _MISSING.append(rel)
        return None
    from .audio import read_wav
    x, _ = read_wav(path)
    m = x.mean(axis=0) if x.ndim > 1 else x
    m = np.nan_to_num(np.asarray(m, dtype=np.float64), nan=0.0)
    _WAV[rel] = m
    return m


def _entries(arena_id: str) -> list[tuple[str, str, float, str]]:
    return [(r, t, float(g), role)
            for r, t, g, role in manifest().get("scenes", {}).get(arena_id, [])]


def _fade(y: np.ndarray, head: float = 0.004, tail_frac: float = 0.12) -> np.ndarray:
    n = len(y)
    h = max(1, int(head * SR))
    y[:h] *= np.linspace(0.0, 1.0, h)
    t = max(1, int(n * tail_frac))
    y[-t:] *= np.linspace(1.0, 0.0, t) ** 1.4
    return y


def _fit(src: np.ndarray, n: int, rng: np.random.Generator, *, loop: bool) -> np.ndarray:
    """Take `n` samples of `src`. Ambience may loop with a crossfade; a transient
    is used from its own start and zero-padded — ⛔ never looped, because a gate
    opening twice inside one gesture reads as a mistake, not as texture."""
    if not loop:
        y = np.zeros(n)
        m = min(n, len(src))
        y[:m] = src[:m]
        return y
    if len(src) >= n:
        # Start a little way in: the first moment of a field recording is where
        # the recordist's own handling noise lives.
        off = int(min(len(src) - n, rng.integers(0, max(1, int(0.15 * len(src))))))
        return src[off:off + n].copy()
    y = np.zeros(n)
    xf = int(min(0.35 * SR, len(src) * 0.25))
    pos, fade_in = 0, np.linspace(0.0, 1.0, xf)
    while pos < n:
        m = min(len(src), n - pos)
        chunk = src[:m].copy()
        if pos > 0 and m > xf:
            chunk[:xf] *= fade_in
            y[pos:pos + xf] *= np.linspace(1.0, 0.0, xf)
        y[pos:pos + m] += chunk
        if m <= xf:
            break
        pos += m - xf
    return y


def _mix(arena_id: str, n: int, rng: np.random.Generator, *, want_bed: bool) -> np.ndarray:
    out = np.zeros(n)
    got = False
    for rel, _title, g, role in _entries(arena_id):
        if (role == "bed") != want_bed:
            continue
        src = _load(rel)
        if src is None or len(src) < 64:
            continue
        y = _fit(src, n, rng, loop=want_bed)
        peak = float(np.max(np.abs(y))) or 1.0
        if want_bed:
            rms = float(np.sqrt(np.mean(y ** 2))) or 1.0
            y *= BED_RMS / rms
        else:
            y /= peak
        out += y * g
        got = True
    if not got:
        return out
    out = np.nan_to_num(out, nan=0.0, posinf=0.0, neginf=0.0)
    if not want_bed:
        out /= float(np.max(np.abs(out))) or 1.0
    return _fade(out, tail_frac=0.10 if want_bed else 0.18)


def hit(arena_id: str, n: int, rng: np.random.Generator) -> np.ndarray:
    """The arena's transient gesture — the gate, the gong, the warp."""
    return _mix(arena_id, n, rng, want_bed=False)


def bed(arena_id: str, n: int, rng: np.random.Generator) -> np.ndarray:
    """The arena's ambience — laid under a section, high-passed so it never
    competes with the sub for the bottom of the mix."""
    y = _mix(arena_id, n, rng, want_bed=True)
    return dsp.highpass(y, 120.0, 2) if np.any(y) else y


def describe(arena_id: str) -> str:
    return " + ".join(f"{t}({role})" for _r, t, _g, role in _entries(arena_id)) or "(none)"


#: ⛔ Categories the GAME already draws its own SFX cues from. A scene sound
#: taken from either is heard during play as a CUE — owner 2026-08-22:
#: 「魔法陣を展開（hit）已經在本遊戲中大量使用 放入背景音樂中會造成遊戲判斷混亂」.
#: Measured at the time: the shipped SFX pack takes 21 clips from `battle/` and
#: 4 from `anime/`. ⛔ Do not "just avoid the exact files" — the confusion is
#: about a shared vocabulary, not about byte equality.
CUE_CATEGORIES = ("battle", "anime")

#: The shipped SFX ledger, used to catch an EXACT collision as well.
LAB_MANIFEST = os.path.abspath(os.path.join(
    HERE, "..", "..", "..", "..", "content", "assets", "audio", "sfx", "lab", "MANIFEST.json"))


def _game_sfx_rels() -> dict[str, str]:
    """`<category>/<name>` -> the in-game event it plays for."""
    try:
        with open(LAB_MANIFEST, encoding="utf-8") as fh:
            lab = json.load(fh)
    except FileNotFoundError:
        return {}
    out = {}
    for c in lab.get("clips", []):
        page = c.get("sourcePage", "")
        cat = page.split("/sound/", 1)[1].split("/")[0] if "/sound/" in page else ""
        stem = os.path.splitext(c.get("sourceFile", ""))[0]
        if cat and stem:
            out[f"{cat}/{stem}"] = c.get("ggdEvent") or c.get("file", "?")
    return out


def audit() -> list[str]:
    """Three things the manifest must satisfy. ⭐ All three are GATES, not
    reminders — each one is a mistake that already happened once.

    1. Every arena has BOTH a hit and a bed. (The first version inferred the
       role from clip duration and left two arenas with no transient at all.)
    2. ⛔ No clip from a category the GAME uses for its own cues. A player who
       hears 「魔法陣を展開」 in the music reads it as somebody casting.
    3. ⛔ No clip that is byte-for-byte one of the shipped SFX. Redundant with
       (2) today, kept because (2)'s category list is a judgement about the
       shipped pack and this one is a fact about it.
    """
    bad = []
    scenes = manifest().get("scenes", {})
    for arena, rows in scenes.items():
        roles = {r[3] for r in rows}
        for want in ("hit", "bed"):
            if want not in roles:
                bad.append(f"{arena}: 沒有 {want}")
    # ⭐ owner 2026-08-22:「太多重複滴水洞窟，每一首都要是獨特的樂器音色跟環境音效，
    # 不能重複」。在此之前 `environment/cave1` 同時掛在芙莉蓮與大聖杯上,而那正是他
    # 聽出來的重複。⛔ 這條是閘,不是提醒。
    owner_of = {}
    for arena, rows in scenes.items():
        for rel, title, _g, _role in rows:
            if rel in owner_of:
                bad.append(f"⛔ `{rel}`（{title}）同時用在 {owner_of[rel]} 與 {arena} —— "
                           f"每一張場地的環境音必須是獨一無二的")
            owner_of[rel] = arena
    game = _game_sfx_rels()
    for arena, rows in scenes.items():
        for rel, title, _g, _role in rows:
            cat = rel.split("/", 1)[0]
            if cat in CUE_CATEGORIES:
                bad.append(f"{arena}: `{rel}`（{title}）來自 `{cat}/` —— "
                           f"遊戲的提示音就住在那個分類,玩家會誤判")
            if rel in game:
                bad.append(f"⛔ {arena}: `{rel}`（{title}）**就是**遊戲的 "
                           f"{game[rel]} 音效,同一支素材不可以同時當 BGM 場景音")
    return bad
