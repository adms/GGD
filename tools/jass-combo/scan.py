"""共用掃描器：從 war3map.j 撈出「連段→收尾」的 29 個函式。

判準（owner 2026-08-22 逐字，⛔ 不要改）：
    函式裡**同時**有 `TriggerSleepAction|PolledWait` **且**有
    `UnitDamageTarget|UnitDamagePoint|UnitDamageArea`。

⚠️ 這支只做**機械掃描**（行號 / 間隔 / 傷害次數 / 形狀 / 條件裡的 rawcode / gate）。
「這個觸發器屬於哪一支 GGD 技能」那一半是**人工 join**，住在 extract.py 的
RESOLUTION 表裡 —— 因為 JASS 用父觸發器、全域變數、單位型別三種方式綁英雄，
⛔ 沒有一條正則抓得到全部。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

FUNC_RE = re.compile(r"function\s+(\w+)\s+takes\b")
# 一次掃「等待」與「傷害」兩種 token,才能保住它們在原始碼裡的**先後順序** ——
# owner 要的是節奏,而節奏就是 W/D 的交錯,⛔ 不是兩個各自排序的清單。
TOKEN_RE = re.compile(
    r"\b(?:TriggerSleepAction|PolledWait)\s*\(\s*([^()]*?)\s*\)"
    r"|\b(?:UnitDamage(?:Target|Point|Area))\w*\s*\("
)
GATES = ("GetEventDamageSource", "GetUnitAbilityLevel", "udg_EX_Mode", "udg_IsAvalonReady")
SPELL_ID_RE = re.compile(r"GetSpellAbilityId\(\)\s*==\s*'([A-Za-z0-9]{4})'")


def fmt_secs(v: float) -> str:
    """0.20 → '0.2'、1.00 → '1'、0.00 → '0'。⛔ 不四捨五入,只去掉尾隨的零。"""
    s = f"{v:.6f}".rstrip("0").rstrip(".")
    return s or "0"


@dataclass
class Family:
    func: str
    line: int
    waits: list[float] = field(default_factory=list)
    n_damage: int = 0
    loop: bool = False
    shape: str = "tail"
    seq: list[str] = field(default_factory=list)
    nonliteral_wait: bool = False
    rawcodes: list[str] = field(default_factory=list)
    gates: list[str] = field(default_factory=list)


def _functions(lines: list[str]) -> list[tuple[str, int, int, int]]:
    out, cur = [], None
    for i, raw in enumerate(lines):
        m = FUNC_RE.match(raw)
        if m:
            cur = (m.group(1), i + 1, i)
        elif raw.strip() == "endfunction" and cur is not None:
            out.append((cur[0], cur[1], cur[2], i))
            cur = None
    return out


def scan(jass_text: str) -> list[Family]:
    lines = jass_text.split("\n")
    funcs = _functions(lines)
    by_name = {name: (start, end) for name, _ln, start, end in funcs}

    families: list[Family] = []
    for name, line, start, end in funcs:
        body = lines[start : end + 1]
        text = "\n".join(body)
        seq: list[str] = []
        waits: list[float] = []
        n_dmg = 0
        nonliteral = False
        for m in TOKEN_RE.finditer(text):
            arg = m.group(1)
            if arg is None:
                n_dmg += 1
                seq.append("D")
            else:
                try:
                    secs = float(arg)
                except ValueError:
                    # 等待長度是一個**運算式**（例：`TriggerSleepAction( LifeTime )`）。
                    # ⛔ 不要瞎猜一個秒數 —— 記成不透明 token,讓下游看得見它不是常數。
                    seq.append("W?")
                    nonliteral = True
                    continue
                waits.append(secs)
                seq.append("W" + fmt_secs(secs))
        if not waits or n_dmg == 0:
            continue

        loop = any(l.strip() == "loop" for l in body)
        if loop:
            shape = "loop"
        elif n_dmg >= 2 and seq[0].startswith("W"):
            shape = "per-step"
        else:
            shape = "tail"

        # 觸發器區塊 = Trig_<Name>_(Conditions|Func*|Actions)。
        # ⚠️ 後綴一定要帶底線,否則 Trig_XHunter 會把 Trig_XHunterStone 一起吃進來。
        stem = name[len("Trig_") : -len("_Actions")] if name.startswith("Trig_") and name.endswith("_Actions") else None
        block = text
        if stem:
            pat = re.compile(r"^Trig_" + re.escape(stem) + r"_(Conditions|Func\w*|Actions)$")
            block = "\n".join(
                "\n".join(lines[by_name[n][0] : by_name[n][1] + 1]) for n in by_name if pat.match(n)
            )

        families.append(
            Family(
                func=name,
                line=line,
                waits=waits,
                n_damage=n_dmg,
                loop=loop,
                shape=shape,
                seq=seq,
                rawcodes=sorted(set(SPELL_ID_RE.findall(block))),
                gates=sorted(g for g in GATES if g in block),
                nonliteral_wait=nonliteral,
            )
        )
    return families
