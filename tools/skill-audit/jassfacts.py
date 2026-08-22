"""war3map.j → 每個 trigger 群組的**機械事實**（⛔ 不做任何技能專屬判斷）。

⭐ 為什麼是一支獨立的模組：三軸驗收裡有兩軸（動畫、傷害）的「原作那一側」
   完全來自這裡，而它的正確性可以**單獨**被驗（不必先跑整個 audit）。

⚠️ 這裡刻意**不吃** `tools/jass-combo/_ground-truth_temp_*.json`：
   那份是 `_temp_` 檔而且 ⛔ **沒有進版控**（`git ls-files` 查過）。
   一份產生的合約文件如果依賴未追蹤的輸入，在別人的機器上就會 `--check` 紅，
   而那正是 2026-08-02「未追蹤來源被烘進產物」那次事故的形狀。
   war3map.j 是**追蹤中的** 2.8MB 原始碼，它才是可以依賴的地面。

⚠️ 這裡也刻意**不猜語意**。它只數得出來的東西：
   `AddSpecialEffect*` 的模型路徑、`UnitDamage*` 的呼叫次數、
   `TriggerSleepAction`/`PolledWait` 的節拍、以及包住它們的 `loop` 有幾圈。
   「這一段是不是一個連段」是 audit.py 的事，不是這裡的事。
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field

# --------------------------------------------------------------------------
# 正則（全部只認**字面**，⛔ 沒有一條認得任何技能的名字）
# --------------------------------------------------------------------------

#: `function Foo takes ... returns ...` —— 函式切割點。
_FUNC = re.compile(r"^function\s+(\w+)\s+takes\b", re.M)
_ENDFUNC = re.compile(r"^endfunction\b", re.M)

#: 四字 rawcode 字面值（`'A07F'`）。⚠️ 單字元的 `'x'` 不是 rawcode，長度必須是 4。
_RAWCODE = re.compile(r"'([A-Za-z0-9_]{4})'")

#: `AddSpecialEffect…( …, "路徑" )` —— 模型路徑一律是呼叫裡的**最後**一個字串。
#: ⚠️ ⛔ 不可以用 `\(([^)]*)\)` 抓參數：`AddSpecialEffectLocBJ( GetUnitLoc(GetTriggerUnit()), "X.mdx" )`
#: 的第一個 `)` 在**巢狀呼叫裡面**，那樣抓會得到空參數 —— 而它的表現是
#: 「這支技能在原作沒有特效」（靜默的假陰性，第二守則失敗形態④）。
#: ⇒ 抓「呼叫起點之後、這一行結束之前」的最後一個字串字面值。BJ 呼叫一律單行。
_SFX = re.compile(r"AddSpecialEffect\w*\s*\(")
_STRLIT = re.compile(r'"((?:[^"\\]|\\.)*)"')

#: 任何 `UnitDamage…` 家族（TargetBJ / PointLoc / …）。
_DAMAGE = re.compile(r"\bUnitDamage\w*\s*\(")

#: 兩種等待。⚠️ `PolledWait` 與 `TriggerSleepAction` 在 WC3 語意不同
#: （前者對多人同步安全），但**對「這支技能有幾拍」這個問題它們是同一件事**。
_WAIT = re.compile(r"\b(?:TriggerSleepAction|PolledWait)\s*\(\s*\(?\s*(-?[\d.]+)")
_WAIT_ANY = re.compile(r"\b(?:TriggerSleepAction|PolledWait)\s*\(")

#: 迴圈邊界：`exitwhen <var> > <上界>`。上界可能是字面值，也可能是一個變數。
_EXITWHEN = re.compile(r"^\s*exitwhen\s+(\S+)\s*>\s*([\w.]+)")
_SETVAR = re.compile(r"^\s*set\s+(\w+)\s*=\s*(-?[\d.]+)\s*$")

#: `InitTrig_<Base>` —— trigger 群組的**註冊表**。群組名一律從這裡來，
#: ⛔ 不是從函式名硬切（`Trig_LinaS_Effect_Actions` 屬於 `LinaS Effect`，不是 `LinaS`）。
_INITTRIG = re.compile(r"^function\s+InitTrig_(\w+)\s+takes\b", re.M)
_INITTRIG_ONE = re.compile(r"^InitTrig_(\w+)$")

#: 週期 timer 驅動的 trigger（世界終結的 12 連擊就住在這種裡面）。
_PERIODIC = re.compile(r"TriggerRegisterTimerEventPeriodic\s*\(\s*\w+\s*,\s*([\d.]+)")

#: 動畫指令。⭐ 這是「動畫正確性」那一軸在原作側的第二個證據來源：
#: 一支技能演出幾個**姿勢**（而不是只有幾拍等待）。
_ANIM = re.compile(r"\bSetUnitAnimation\w*\s*\(")

#: ⭐【移動中的模型特效】原作側的證據（#543 · #551）。
#:
#: 原作把「一具會飛的模型」寫成一隻 locust dummy：`CreateUnit` → 迴圈裡
#: `SetUnitPosition` / `SetUnitX` / `SetUnitY` 一格一格推 → `RemoveUnit`。
#: 所以「這支技能有沒有一具沿路徑移動的模型」在 JASS 裡的痕跡就是**這個計數**
#: （已乘上迴圈圈數）。
#:
#: ⚠️ 它 ⛔ **不等於**「有 dummy」：單獨一次 `SetUnitPosition` 是瞬移／擊退的
#: 落點修正，那是另一件事。判準因此是 `> 1`（見 `audit.py` 的 `move` 軸）——
#: **一段路徑**至少要兩次移動，⛔ 一次不算。
_MOVE = re.compile(r"\b(?:SetUnitPosition|SetUnitX|SetUnitY)\w*\s*\(")

#: ⭐⭐ trigger **鏈**。這是這支工具最重要的一條線。
#:
#: owner 對這張票的原話是「因為有一堆**時間序 JASS + w3x 效果演出**」——
#: 而 WC3 的時間序演出**幾乎不會**寫在同一個 trigger 裡：施法那一個
#: `EnableTrigger` 下一個，下一個再 `EnableTrigger` 下下個（或掛週期 timer）。
#:
#: ⛔ 只用 rawcode 接合會**整段漏掉**：42-04 世界終結的 rawcode `A05D` 只出現在
#: `The_End_ofWorldStart`（1 次傷害），而卡面承諾的「隨機 12 次區域傷害」住在
#: 它 `EnableTrigger` 起來的 `The_End_ofWorldCasting`（0.10 秒週期 timer）裡。
#: 不跟著這條邊走，audit 會對著一支「原作只打 1 下」的技能說 GGD 沒有缺口 ——
#: **一個綠燈，而缺口有 11 下。**
_ENABLE = re.compile(r"\bEnableTrigger\s*\(\s*gg_trg_(\w+)\s*\)")


@dataclass
class JassGroup:
    """一個 trigger 群組（`Trig_<base>_*` 的所有函式）攤平後的可數事實。"""

    base: str
    line: int
    rawcodes: set[str] = field(default_factory=set)
    #: 模型 stem（小寫、去副檔名、去目錄）→ 這個群組呼叫它幾次（已乘上迴圈圈數）
    sfx: dict[str, int] = field(default_factory=dict)
    damage_calls: int = 0
    wait_beats: int = 0
    wait_values: list[float] = field(default_factory=list)
    anim_calls: int = 0
    #: dummy 移動段數（`SetUnitPosition`/`SetUnitX`/`SetUnitY`,已乘上迴圈圈數）
    move_calls: int = 0
    unbounded_loop: bool = False
    #: 這個群組 `EnableTrigger` 起來的下游群組名（見 `_ENABLE` 的註解）
    enables: set[str] = field(default_factory=set)
    #: 它是被週期 timer 驅動的嗎（`TriggerRegisterTimerEventPeriodic`）
    periodic: float | None = None

    def has_facts(self) -> bool:
        """這個群組**演出**了任何東西嗎？

        ⚠️ war3map.j 裡有幾個群組是**表格**而不是演出 —— 例如 `AILearning`
        逐條列出每個英雄的加點順序，於是它一個人就提到了幾百個 rawcode。
        ⛔ 讓它參與 rawcode→技能的接合，會讓**每一支**技能都認領到同一個空群組。
        ⇒ 判準是資料推導的：**一個字都沒演出（沒特效、沒傷害、沒等待、沒動畫、
        沒推動任何一具模型）的群組不算演出**，⛔ 不是「把 AILearning 寫進黑名單」。

        ⚠️ `move_calls` 是 #543 補上的第五項：**把一具模型沿路徑推出去就是演出**，
        而在此之前一個「只推模型、不發特效也不直接扣血」的群組會被整個丟掉 ——
        於是【移動中的模型特效】那一族在原作側**完全隱形**。
        """
        return (
            bool(self.sfx)
            or self.damage_calls > 0
            or self.wait_beats > 0
            or self.anim_calls > 0
            or self.move_calls > 0
        )

    def as_dict(self) -> dict:
        return {
            "base": self.base,
            "line": self.line,
            "rawcodes": sorted(self.rawcodes),
            "sfx": dict(sorted(self.sfx.items())),
            "damageCalls": self.damage_calls,
            "waitBeats": self.wait_beats,
            "waitValues": self.wait_values,
            "animCalls": self.anim_calls,
            "moveCalls": self.move_calls,
            "unboundedLoop": self.unbounded_loop,
            "enables": sorted(self.enables),
            "periodic": self.periodic,
        }


def _stem(path: str) -> str:
    """`"Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl"` → `warstompcaster`。

    ⭐ 與 `content/assets/vfx/w3x-ability-provenance.json` 的 `stem` 欄位**同一個算法**，
    否則兩邊接不起來（而接不起來會靜默地表現成「這支技能沒有原作美術」）。
    """
    p = path.replace("\\\\", "\\").replace("/", "\\")
    base = p.split("\\")[-1]
    return os.path.splitext(base)[0].strip().lower()


def _loop_multipliers(lines: list[str]) -> tuple[list[int], bool]:
    """替每一行算出「它會被跑幾次」。

    ⚠️ 這一段是動畫軸的**承重**：`Trig_SuperFF7_Actions` 的七連斬長成
    `loop … exitwhen udg_SupI > 7 … endloop`，⛔ 不展開迴圈的話它只有 2 拍，
    展開之後才是 14 拍 —— 而「連斬七次」正是卡面承諾的那個數字。

    上界解析三段式（⛔ 解不出來就誠實承認，不要猜）：
      ① `exitwhen i > 7`      → 字面值 7
      ② `exitwhen i > N` 且前面有 `set N = 12` → 12
      ③ 都不是（來自 `GetUnitAbilityLevel…`）→ 圈數 1，並標記 unbounded
    """
    mult = [1] * len(lines)
    # 先掃出「變數 → 最近一次被指派的字面值」，供 ② 用。
    literal_of: dict[str, float] = {}
    assign_at: list[dict[str, float]] = []
    for ln in lines:
        m = _SETVAR.match(ln)
        if m:
            literal_of[m.group(1)] = float(m.group(2))
        assign_at.append(dict(literal_of))

    stack: list[int] = []          # loop 起始行號
    bounds: dict[int, int] = {}    # loop 起始行號 → 圈數
    unbounded = False
    for i, ln in enumerate(lines):
        s = ln.strip()
        if s == "loop":
            stack.append(i)
            bounds[i] = 1
        elif s == "endloop":
            if stack:
                stack.pop()
        elif stack:
            m = _EXITWHEN.match(ln)
            if m and bounds.get(stack[-1]) == 1:
                raw = m.group(2)
                try:
                    bounds[stack[-1]] = max(1, int(float(raw)))
                except ValueError:
                    val = assign_at[i].get(raw)
                    if val is None:
                        unbounded = True
                    else:
                        bounds[stack[-1]] = max(1, int(val))

    # 第二遍：每一行的乘數 = 包住它的所有 loop 圈數的乘積。
    stack = []
    for i, ln in enumerate(lines):
        s = ln.strip()
        if s == "loop":
            stack.append(i)
            continue
        if s == "endloop":
            if stack:
                stack.pop()
            continue
        m = 1
        for start in stack:
            m *= bounds.get(start, 1)
        mult[i] = m
    return mult, unbounded


def parse_jass(path: str) -> dict[str, JassGroup]:
    """整份 war3map.j → `{群組名: JassGroup}`。"""
    src = open(path, encoding="utf-8", errors="replace").read()
    lines_all = src.split("\n")

    # ① trigger 群組的註冊表。
    bases = sorted({m.group(1) for m in _INITTRIG.finditer(src)}, key=len, reverse=True)

    # ② 切函式。
    funcs: list[tuple[str, int, str]] = []
    starts = [(m.start(), m.group(1)) for m in _FUNC.finditer(src)]
    for idx, (pos, name) in enumerate(starts):
        end = _ENDFUNC.search(src, pos)
        stop = end.end() if end else (starts[idx + 1][0] if idx + 1 < len(starts) else len(src))
        line_no = src.count("\n", 0, pos) + 1
        funcs.append((name, line_no, src[pos:stop]))

    groups: dict[str, JassGroup] = {}

    def group_for(base: str, line_no: int) -> JassGroup:
        g = groups.get(base)
        if g is None:
            g = groups[base] = JassGroup(base=base, line=line_no)
        g.line = min(g.line, line_no)
        return g

    # ① 先掃 `InitTrig_*`：它是「這個 trigger 怎麼被觸發的」的唯一住處。
    #    ⛔ 不可以只掃 `Trig_*_Actions` —— 週期 timer 完全不出現在 Actions 裡。
    for name, line_no, body in funcs:
        m = _INITTRIG_ONE.match(name)
        if not m:
            continue
        g = group_for(m.group(1), line_no)
        p = _PERIODIC.search(body)
        if p:
            g.periodic = float(p.group(1))

    for name, line_no, body in funcs:
        if not name.startswith("Trig_"):
            continue
        # ⭐ **最長**匹配：`Trig_LinaS_Effect_Actions` 要歸 `LinaS_Effect`，⛔ 不是 `LinaS`。
        base = next((b for b in bases if name.startswith("Trig_" + b + "_") or name == "Trig_" + b), None)
        if base is None:
            continue
        g = group_for(base, line_no)

        blines = body.split("\n")
        mult, unbounded = _loop_multipliers(blines)
        g.unbounded_loop = g.unbounded_loop or unbounded

        for i, ln in enumerate(blines):
            k = mult[i]
            for rc in _RAWCODE.findall(ln):
                g.rawcodes.add(rc)
            for m in _SFX.finditer(ln):
                strs = _STRLIT.findall(ln[m.end():])
                if strs:
                    st = _stem(strs[-1])
                    if st:
                        g.sfx[st] = g.sfx.get(st, 0) + k
            g.damage_calls += len(_DAMAGE.findall(ln)) * k
            g.anim_calls += len(_ANIM.findall(ln)) * k
            g.move_calls += len(_MOVE.findall(ln)) * k
            for tgt in _ENABLE.findall(ln):
                if tgt != base:
                    g.enables.add(tgt)
            n_wait = len(_WAIT_ANY.findall(ln))
            if n_wait:
                g.wait_beats += n_wait * k
                for v in _WAIT.findall(ln):
                    g.wait_values.extend([float(v)] * k)
    return groups


def index_by_rawcode(groups: dict[str, JassGroup]) -> dict[str, list[JassGroup]]:
    """rawcode → 提到它的所有群組。

    ⚠️ 一個 rawcode 可能被好幾個群組提到（施法一個、命中效果一個）。
    ⛔ 不要只取第一個 —— 那會讓「命中之後才發生的傷害」整批消失。
    """
    idx: dict[str, list[JassGroup]] = {}
    for g in groups.values():
        if not g.has_facts():
            continue
        for rc in g.rawcodes:
            idx.setdefault(rc, []).append(g)
    for rc in idx:
        idx[rc].sort(key=lambda g: g.line)
    return idx


def closure(groups: dict[str, JassGroup], seeds: list[JassGroup]) -> list[JassGroup]:
    """從施法那一個群組，沿 `EnableTrigger` 邊走到整條演出鏈。

    ⭐ 這是「一支技能在原作到底演了什麼」的正確邊界，⛔ 不是「同名的那一個函式」。
    ⚠️ 去重靠 base 名，而且**排序輸出**（`sim/purity` 那條規矩的精神：
    產生的東西不可以依賴 dict 的走訪順序，否則 `--check` 會隨機紅）。
    """
    seen: dict[str, JassGroup] = {}
    stack = list(seeds)
    while stack:
        g = stack.pop()
        if g.base in seen:
            continue
        seen[g.base] = g
        for nxt in sorted(g.enables):
            child = groups.get(nxt)
            if child is not None and child.base not in seen:
                stack.append(child)
    return [seen[k] for k in sorted(seen)]
