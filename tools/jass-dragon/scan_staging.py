#!/usr/bin/env python3
"""JASS 演出掃描器 —— 把一支 JASS 技能拆成「三軸」（時序／特效／傷害）。

⭐ 為什麼是一支工具而不是一次手抄（第零守則⑨「N 個同型 = K 個模板 + 一張表」）：
`tools/w3x-import/out/GoDieEX22s/jass-spells/` 有 **418 份**同型切片，而
#553 只是其中一份。手抄一份的成本 ≈ 寫這支的成本，但手抄**不會**留下一份
可以重跑、可以 `--check` 的證據；下一支（#551 五軸普查點名的其餘缺口）就要
從頭再抄一次。

⛔ 這支**不做判斷**，只做抽取：它不知道什麼是「黑龍」，也不該知道。
   哪一段是「三條龍」、哪一段是「動地剁」是**人**在讀 out/*.staging.json 時
   決定的，然後那個決定落進 `content/ability-templates/tpl-*.json`。

三軸（沿用 `ggd-jass-effect-audit` 的軸名）:
  · 時序 timeline —— 週期觸發間隔、迴圈上界、TriggerSleepAction、UnitApplyTimedLife
  · 特效 vfx      —— AddSpecialEffect* 的模型路徑與掛點、CreateNUnitsAtLoc 的單位模型
  · 傷害 damage   —— UnitDamage* 的數量式、攻擊/傷害型別、以及它被哪個範圍查詢餵養

用法:
    python3 tools/jass-dragon/scan_staging.py A09I
    python3 tools/jass-dragon/scan_staging.py A09I --check   # ⛔ 唯讀，過期就回非零
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SLICES = ROOT / "tools/w3x-import/out/GoDieEX22s/jass-spells"
UNITS = ROOT / "tools/w3x-import/out/GoDieEX22s/parsed/units.json"
OUT = Path(__file__).resolve().parent / "out"

# ⚠️ 每一條都只認 BJ 包裝層的**固定字面形狀**。原生 API（CreateUnit/UnitDamageTarget）
#    的參數順序不同，混在同一條正則裡會把第 3 個參數讀成第 5 個 —— 那種誤讀
#    看起來完全正常（失敗形態④），所以寧可漏掉也不要猜。
RE = {
    "periodic": re.compile(r"TriggerRegisterTimerEventPeriodic\s*\([^,]+,\s*([\d.]+)\s*\)"),
    "loop_bound": re.compile(r"exitwhen\s+udg_(\w+)\s*>\s*(\d+)"),
    "count_gate": re.compile(r"udg_(\w+)\s*<\s*(\d+)"),
    "sleep": re.compile(r"TriggerSleepAction\s*\(\s*([\d.]+)\s*\)"),
    "timed_life": re.compile(r"UnitApplyTimedLifeBJ\s*\(\s*([\d.]+)\s*,"),
    "create_unit": re.compile(r"CreateNUnitsAtLoc\s*\(\s*(\d+)\s*,\s*'(\w{4})'"),
    # ⚠️ 只認到 `距離,` 為止。角度是一段**巢狀括號**的運算式（`I2R(udg_X) * 30.00`），
    #    正則讀不完整 —— 用 {@link _polar_angles} 的括號配對讀，⛔ 不是 `[^)]*`：
    #    後者會在第一個內層 `)` 斷掉，於是環的 `* 30.00`（＝整個環的間距）不見了，
    #    而剩下的字串看起來仍然像一個合理的角度（失敗形態④）。
    "polar_head": re.compile(r"PolarProjectionBJ\s*\([^,]+,\s*([\d.]+)\s*,\s*"),
    "fx_loc": re.compile(r"AddSpecialEffectLocBJ\s*\([^,]+,\s*\"([^\"]+)\"\s*\)"),
    "fx_unit": re.compile(r"AddSpecialEffectTargetUnitBJ\s*\(\s*\"([^\"]+)\"\s*,[^,]+,\s*\"([^\"]+)\"\s*\)"),
    "damage": re.compile(
        r"UnitDamageTargetBJ\s*\([^,]+,[^,]+,\s*(.+?)\s*,\s*(ATTACK_TYPE_\w+)\s*,\s*(DAMAGE_TYPE_\w+)\s*\)"
    ),
    "in_range": re.compile(r"GetUnitsInRangeOfLocAll\s*\(\s*([\d.]+)\s*,"),
    "destructables": re.compile(r"EnumDestructablesInCircleBJ\s*\(\s*([\d.]+)\s*,"),
    "sound": re.compile(r"PlaySoundOnUnitBJ\s*\(\s*gg_snd_(\w+)"),
    "add_ability": re.compile(r"UnitAddAbilityBJ\s*\(\s*'(\w{4})'"),
    "order": re.compile(r"IssuePointOrderLocBJ\s*\([^,]+,\s*\"(\w+)\""),
    "group_gate": re.compile(r"IsUnitInGroup\s*\(\s*GetEnumUnit\(\)\s*,\s*udg_(\w+)\s*\)\s*==\s*false"),
    "modulo": re.compile(r"ModuloInteger\s*\(\s*udg_(\w+)\s*,\s*(\d+)\s*\)\s*==\s*(\d+)"),
    "time_scale": re.compile(r"SetUnitTimeScalePercent\s*\([^,]+,\s*([\d.]+)\s*\)"),
    "header": re.compile(r"^//\s*(\w+):\s*(.+)$"),
}


def _uniq(seq: list) -> list:
    """保序去重。⛔ 不用 set —— 順序本身就是時序證據。"""
    seen, out = set(), []
    for x in seq:
        k = json.dumps(x, ensure_ascii=False, sort_keys=True)
        if k not in seen:
            seen.add(k)
            out.append(x)
    return out


def _polar_angles(src: str) -> list[dict]:
    """`PolarProjectionBJ(loc, 距離, 角度)` 的距離＋**完整**角度運算式。

    括號配對從距離後面那一格開始數，遇到深度回到 0 的 `,` 或 `)` 才停 ——
    所以 `( I2R(udg_BlackDargon) * 30.00 )` 整段都留得下來。
    """
    out: list[dict] = []
    for m in RE["polar_head"].finditer(src):
        i, depth = m.end(), 0
        while i < len(src):
            c = src[i]
            if c in "([":
                depth += 1
            elif c in ")]":
                if depth == 0:
                    break
                depth -= 1
            elif c == "," and depth == 0:
                break
            i += 1
        out.append({"dist": float(m.group(1)), "angle": " ".join(src[m.end() : i].split())})
    return out


def scan(rawcode: str) -> dict:
    src = (SLICES / f"{rawcode}.j").read_text(encoding="utf-8")
    units = json.loads(UNITS.read_text(encoding="utf-8"))

    header = {}
    for line in src.splitlines():
        if not line.startswith("//"):
            continue
        m = RE["header"].match(line)
        if m and m.group(1) in {"nameZh", "cooldown", "mana", "area", "range", "duration"}:
            header[m.group(1)] = m.group(2)

    spawned = []
    for n, code in RE["create_unit"].findall(src):
        u = units.get(code, {})
        spawned.append(
            {
                "rawcode": code,
                "count": int(n),
                "nameZh": u.get("name"),
                "model": u.get("model"),
                "scale": u.get("scale"),
                "moveSpeed": u.get("move_speed"),
            }
        )

    damage = []
    for expr, atk, dmg in RE["damage"].findall(src):
        damage.append(
            {
                "expr": " ".join(expr.split()),
                "attackType": atk.replace("ATTACK_TYPE_", ""),
                "damageType": dmg.replace("DAMAGE_TYPE_", ""),
            }
        )

    return {
        "rawcode": rawcode,
        "header": header,
        "timeline": {
            "periodicSec": _uniq([float(x) for x in RE["periodic"].findall(src)]),
            "loopBounds": _uniq([{"var": v, "max": int(n)} for v, n in RE["loop_bound"].findall(src)]),
            "countGates": _uniq([{"var": v, "below": int(n)} for v, n in RE["count_gate"].findall(src)]),
            "alternation": _uniq(
                [{"var": v, "mod": int(m), "eq": int(e)} for v, m, e in RE["modulo"].findall(src)]
            ),
            "sleepSec": _uniq([float(x) for x in RE["sleep"].findall(src)]),
            "timedLifeSec": _uniq([float(x) for x in RE["timed_life"].findall(src)]),
            "unitTimeScalePct": _uniq([float(x) for x in RE["time_scale"].findall(src)]),
        },
        "vfx": {
            "spawnedUnits": _uniq(spawned),
            "atPoint": _uniq(RE["fx_loc"].findall(src)),
            "onAttachment": _uniq([{"attach": a, "model": m} for a, m in RE["fx_unit"].findall(src)]),
            "sounds": _uniq(RE["sound"].findall(src)),
        },
        "damage": {
            "calls": _uniq(damage),
            # ⭐ 傷害是被「範圍查詢」餵的 —— 半徑與傷害式**一起**才是一個機制。
            "fedByRadius": _uniq([float(x) for x in RE["in_range"].findall(src)]),
            "destructableRadius": _uniq([float(x) for x in RE["destructables"].findall(src)]),
            # 「同一個人只吃一次」在 JASS 裡的樣子就是這個閘。
            "onceViaGroup": _uniq(RE["group_gate"].findall(src)),
        },
        "geometry": {
            "polarProjections": _uniq(_polar_angles(src)),
        },
        "delegation": {
            "grantedAbilities": _uniq(RE["add_ability"].findall(src)),
            "orders": _uniq(RE["order"].findall(src)),
        },
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("rawcode")
    ap.add_argument("--check", action="store_true", help="⛔ 唯讀：與 out/ 現況不符就回非零")
    a = ap.parse_args()

    if not (SLICES / f"{a.rawcode}.j").exists():
        print(f"⛔ 找不到切片 {a.rawcode}.j（{SLICES}）", file=sys.stderr)
        return 2

    got = json.dumps(scan(a.rawcode), ensure_ascii=False, indent=1, sort_keys=True) + "\n"
    dest = OUT / f"{a.rawcode}.staging.json"

    if a.check:
        if not dest.exists():
            print(f"⛔ {dest} 不存在 —— 跑一次不帶 --check 的同一行", file=sys.stderr)
            return 1
        if dest.read_text(encoding="utf-8") != got:
            print(f"⛔ {dest} 過期 —— 跑一次不帶 --check 的同一行然後 git add", file=sys.stderr)
            return 1
        print(f"✅ {dest.name} 是最新的")
        return 0

    OUT.mkdir(parents=True, exist_ok=True)
    dest.write_text(got, encoding="utf-8")
    print(f"✅ {dest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
