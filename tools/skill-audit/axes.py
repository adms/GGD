"""三軸驗收的**量法**（⛔ 這裡一個技能 id 都不出現）。

⭐ 票 #450 的產出不是「把三支修好」，是**一把尺**。所以這一支只做一件事：
   把「原作那一側」與「GGD 那一側」各自化約成**可數的東西**，然後相減。

⚠️ 三軸全部回傳**計數**，⛔ 不是分數。owner 的原話是
   「輸出要是一張排序過的缺口表，⛔ 不是一個總分」——
   總和只被拿來**排序**，⛔ 不被拿來下判決。
"""

from __future__ import annotations

import math
import re

# --------------------------------------------------------------------------
# 說明文字 → 承諾的次數
# --------------------------------------------------------------------------

#: ⭐ owner 2026-08-12 逐字：「技能內文說明會有一個 **「」代表角色施展技能的對白，
#: 不是真正的效果**，請不要被迷惑了」。
#: ⚠️ 與 `tools/skill-remake/common.py::_mechanics_text()` **同一條正則** ——
#: 剝的是整段 `「…」`（含跨行、含行中），⛔ 不是「行首是「的那幾行」。
#: 量到過的誤報：44-04 心臟麻痺的台詞「…在35秒後宣布勝利吧。」會被讀成一支有時序的技能。
_DIALOGUE = re.compile(r"「[^」]*」", re.S)

#: 承諾的**次數**。⚠️ 單位字元刻意收窄到「打了幾下」那一族，
#: ⛔ 不含「秒」「點」「%」—— 那些是時長與量值，不是次數。
_HITS = re.compile(r"(\d+|[一二兩三四五六七八九十]+)\s*(次|下|發|段|擊|連斬|連擊)")

_CN = {"一": 1, "二": 2, "兩": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}

#: ⚠️ 「N 次」**不一定是打 N 下**。量到的三顆假陽性，三顆都在出貨說明裡：
#:
#:   58-04 瘋狂皮卡丘   「極限是刺激**50次**」        → 那是**層數上限**
#:   52-00 十二道試煉   「跨回合共享**12次** [試煉]」 → 那是**標記數**
#:   58-002 打雷絕招    「共傳遞**16次**」            → 這一顆**是真的**（彈跳）
#:
#: ⛔ 全收會讓傷害軸的第一名變成一支「承諾打 50 下」的變身技 —— 一張排錯的表
#: 比沒有表更糟，因為它把注意力帶去錯的地方。
#: ⇒ 判準：命中的前後 `_WINDOW` 個字裡要出現**扣血語彙**。⛔ 不含「攻擊力」那種
#: 屬性詞（假陽性三顆有兩顆是被「攻擊」騙的），所以白名單刻意收窄。
_DAMAGE_WORDS = ("傷害", "斬", "命中", "打擊")
_WINDOW = 24


def strip_dialogue(desc: str) -> str:
    """⛔ 任何讀說明找機制的東西都要先過這一關。"""
    return _DIALOGUE.sub("", desc or "")


def _cn_int(tok: str) -> int | None:
    if tok.isdigit():
        return int(tok)
    if tok == "十":
        return 10
    if len(tok) == 1:
        return _CN.get(tok)
    if len(tok) == 2 and tok[0] == "十":  # 十二
        return 10 + (_CN.get(tok[1]) or 0)
    if len(tok) == 2 and tok[1] == "十":  # 二十
        return (_CN.get(tok[0]) or 0) * 10
    if len(tok) == 3 and tok[1] == "十":  # 二十三
        return (_CN.get(tok[0]) or 0) * 10 + (_CN.get(tok[2]) or 0)
    return None


def promised_hits(desc: str) -> tuple[int | None, str, list[str]]:
    """卡面**承諾**打幾下 —— 回傳 (次數, 佐證原文, 被駁回的候選)。

    ⭐ 這一欄是第一·五守則（⛔ 卡片上不可以有「說了但不會發生」的字）在傷害軸的入口：
       「連斬七次」是一個**可以被證偽**的承諾，而它與實作的差就是缺口。
    ⚠️ 一律回傳**佐證原文**，讓人可以當場反駁，⛔ 不是丟一個數字。
    ⚠️ 被駁回的候選也一律回傳 —— 一個靜默丟棄的判斷沒有人能發現它判錯了。
    """
    text = strip_dialogue(desc)
    best, ev = None, ""
    rejected: list[str] = []
    for m in _HITS.finditer(text):
        n = _cn_int(m.group(1))
        if n is None or n <= 1:
            continue
        lo, hi = max(0, m.start() - _WINDOW), m.end() + _WINDOW
        snippet = text[lo:hi].replace("\n", " ")
        if not any(w in snippet for w in _DAMAGE_WORDS):
            rejected.append(f"{m.group(0)}（前後無扣血語彙：…{snippet.strip()}…）")
            continue
        if best is None or n > best:
            best, ev = n, text[max(0, m.start() - 8): m.end() + 2].replace("\n", " ")
    return best, ev, rejected


# --------------------------------------------------------------------------
# GGD 那一側：把一份 ability doc 化約成可數的東西
# --------------------------------------------------------------------------

def _is_damage_node(node: dict) -> bool:
    """⭐ 判準是**結構**推導的，⛔ 不是一張手寫的 kind 白名單。

    出貨 schema 把 `damageType` 掛在（且只掛在）會扣血的 effect 上 ——
    量過：`damage` / `damageArea` / `damageLine` / `dot` / `chainLightning` 有它，
    其餘 32 種 kind 一個都沒有。另加一條 `kind` 以 `damage` 開頭，
    收掉那一顆省略了 optional `damageType` 的 `damageArea`。
    ⇒ 新增一種扣血 effect 時這條**自動**跟上，⛔ 不必回來改這支工具。
    """
    k = node.get("kind")
    return (isinstance(k, str) and k.startswith("damage")) or "damageType" in node


def _dot_ticks(node: dict) -> int:
    iv = node.get("intervalSec")
    du = node.get("durationSec")
    if isinstance(iv, (int, float)) and iv > 0 and isinstance(du, (int, float)) and du > 0:
        return max(1, int(math.floor(du / iv + 1e-9)))
    return 1


def ggd_counts(effects, template_doc: dict | None, bound_params: dict | None) -> dict:
    """走訪 effects（含 `onHit` / `onLand` / `delayed` 的巢狀），數出三件事。

    回傳 `{damageLeaves, beats, inert[]}`：
      · **damageLeaves** —— 這一支在遊戲裡會扣幾次血（`dot` 按 tick 展開）
      · **beats** —— 有幾個**時間上分得開**的節拍（dot tick / delayed / 未失效的分段參數）
      · **inert** —— 模板**自己宣告**做不到的參數（`params[*].inert`）
    """
    damage_leaves = 0
    beats = 0

    def walk(n):
        nonlocal damage_leaves, beats
        if isinstance(n, dict):
            k = n.get("kind")
            if _is_damage_node(n):
                if k == "dot":
                    t = _dot_ticks(n)
                    damage_leaves += t
                    beats += t
                else:
                    damage_leaves += 1
            if k == "delayed":
                beats += 1
            for v in n.values():
                walk(v)
        elif isinstance(n, list):
            for v in n:
                walk(v)

    walk(effects or [])

    inert: list[str] = []
    if template_doc:
        params = template_doc.get("params") or {}
        for pname, pspec in sorted(params.items()):
            if not isinstance(pspec, dict):
                continue
            if pspec.get("inert"):
                inert.append(pname)
                continue
            # ⭐ 未被宣告失效、且單位是 count 的參數 = 一段真的會演出來的時序。
            if pspec.get("unit") == "count":
                val = (bound_params or {}).get(pname, pspec.get("default"))
                if isinstance(val, (int, float)) and val > 1:
                    beats += int(val)
            if pspec.get("type") == "scaling" and "damage" in pname.lower():
                damage_leaves += 1

    return {"damageLeaves": damage_leaves, "beats": beats, "inert": inert}


# --------------------------------------------------------------------------
# 特效軸：模型 stem 的正規化與比對
# --------------------------------------------------------------------------

def norm_stem(s: str) -> str:
    """`1hswd_01` / `1hswd-01` / `HeroCloudCyd` 全部收斂成同一個鍵。

    ⚠️ 這一步是特效軸的**承重**：provenance 用底線、fx id 用連字號，
    ⛔ 不正規化的話**每一支**技能都會被判成「原作美術一個都沒播」——
    一張 421 列全紅的表跟一張全綠的表一樣沒有用。
    """
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


#: `fx.w3x.<class>.<stem>[.pNN]` —— 從 GGD 的 vfxKey 反推它播的是哪一份原作模型。
_W3X_KEY = re.compile(r"^fx\.w3x\.[^.]+\.([^.]+)")


def vfx_family(key: str | None) -> str:
    if not key:
        return "none"
    if key.startswith("fx.w3x."):
        return "w3x"
    if key.startswith("fx.prim."):
        return "prim"
    return "other"


def played_stems(key: str | None) -> set[str]:
    """GGD 目前**真的播得出來**的原作模型（通用原型 `fx.prim.*` 一份都不是）。"""
    if not key:
        return set()
    m = _W3X_KEY.match(key)
    return {norm_stem(m.group(1))} if m else set()
