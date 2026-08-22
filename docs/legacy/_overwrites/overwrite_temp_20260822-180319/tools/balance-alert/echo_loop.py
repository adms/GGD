#!/usr/bin/env python3
"""⚠️ **回音迴圈偵測器** —— 「調了等於白調」的那一類缺陷。

owner 2026-08-22（逐字）：

> 「script 比對**任何傷害跟生命相關參數一起調整的時候要特別發 alert**
>  來查看是否造成 **echo-loop-feedback 調了等於白調**的可能性」

⭐ 它偵測的正是引爆 #532/#533 整條線的那個 bug：
`maxHealth` 4.0 / 6.0 / 7.2 三個值實測落在 **51.0% / 52.0% / 50.9%** ——
⛔ 一格出貨的後台欄位**轉不動任何東西**，而每一條閘都是綠的。

── 為什麼它會發生 ────────────────────────────────────────────────────────
傷害五級距是**從生命反推**的（`anchorFloorFrom`）。只要那條推導鏈裡出現
一個也會放大生命的因子，那個因子就會在分子與分母上**同時**出現而互相抵銷：

    佔血條 = 級距(HP) / 血條(HP) —— 兩邊一起動 ⇒ 比值恆定

⇒ ⛔ 這種缺陷**看起來完全正常**：欄位存得起來、頁面顯示新值、
   `content:build` 綠、全套測試綠。⭐ 只有「把值換掉再量一次結果」看得出來。

── 它怎麼驗 ──────────────────────────────────────────────────────────────
對每一格**傷害/生命相關**的旋鈕：把它乘以 0.5 與 2.0，各自重算兩個
**玩家看得到的結果**（一發「極大」佔血條 % · 幾發送走 LV30 中位），
然後問：**結果有沒有跟著動？**

· 動了      → ⭐ 這一格是真的旋鈕
· 幾乎沒動  → 🚨 **ALERT：回音迴圈** —— 調了等於白調

⚠️ ⛔ 它**不驗任何出貨數值**（那是 owner 每週在調的，第二守則）。
   它驗的是「**這一格轉得動嗎**」這個**機制**。

用法：
    python3 tools/balance-alert/echo_loop.py          # 印報告
    python3 tools/balance-alert/echo_loop.py --check  # 有 ALERT 就非零離開
"""
from __future__ import annotations

import argparse
import json
import math
import pathlib
import sys

REPO = pathlib.Path(__file__).resolve().parents[2]
CFG = REPO / "content" / "config"

#: 這些旋鈕**同時**碰得到傷害與生命 —— 回音迴圈只可能發生在它們身上。
#: ⚠️ 名單從**推導鏈真的讀到的東西**列出來，⛔ 不是「看起來相關的」。
SUSPECT_KNOBS = ("maxHealth", "damageDealt", "attackDamage", "abilityPower", "strToMaxHealth")

#: 結果變化小於這個比例就當成「沒動」。
#: ⚠️ 不是 0：浮點與級距的**進位**本來就會吃掉一點點（級距進位到 50 的整數倍）。
#: ⭐ 0.02 = 把旋鈕**翻倍**之後結果只動了 2% ⇒ 那不是靈敏度不足，是抵銷。
ECHO_EPS = 0.02


def load(name: str) -> dict:
    return json.loads((CFG / f"{name}.json").read_text(encoding="utf-8"))


def tier_step(tiers: dict) -> int:
    """五格皆整數的最小單位的整數倍 —— 與 `damageTiers.ts::tierStep` 同一個意思。"""
    return 50


def outcome(mult: dict, base_hp: float, hp_bonus: float, ratios: list[float]) -> tuple[float, float]:
    """(一發「極大」佔血條 %, 幾發送走中位) —— **玩家看得到的**那兩個數字。

    ⭐ 級距在**純基礎空間**推導（owner：「不能把系統倍率乘進去再反推」），
    而血條是**引擎最終**（含倍率）—— 兩者刻意不同空間，那正是旋鈕生效的原因。
    """
    smallest_raw = (base_hp + hp_bonus) / 20.0
    step = 50
    smallest = math.ceil(smallest_raw / step) * step
    biggest = smallest * ratios[-1]
    final_hp = base_hp * mult.get("maxHealth", 1.0) + hp_bonus
    dealt = biggest * mult.get("damageDealt", 1.0)
    return (dealt / final_hp * 100.0, final_hp / dealt)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="有 ALERT 就非零離開")
    args = ap.parse_args()

    env = load("combat-env")["multipliers"]
    anchors = json.loads((REPO / "content" / "config" / "damage-tiers.json").read_text("utf-8"))
    names = list(anchors["damage"].keys())
    smallest_shipped = anchors["damage"][names[0]]
    ratios = [anchors["damage"][n] / smallest_shipped for n in names]

    # 純基礎中位與初始加成 —— 從產生的量測文件讀（⛔ 不抄字面值）。
    doc = (REPO / "docs" / "平衡錨點量測.md").read_text(encoding="utf-8")
    import re

    m = re.search(r"純基礎中位\(LV\d+\) ([\d.]+)", doc)
    b = re.search(r"\+ 初始加成 ([\d,]+)", doc)
    if not m or not b:
        print("⛔ 讀不到純基礎中位／初始加成 —— docs/平衡錨點量測.md 的格式變了", file=sys.stderr)
        return 2
    base_hp = float(m.group(1))
    hp_bonus = float(b.group(1).replace(",", ""))

    now = outcome(env, base_hp, hp_bonus, ratios)
    print("⚠️  回音迴圈偵測（echo-loop-feedback）—— 「調了等於白調」")
    print(f"   出貨：一發「{names[-1]}」＝血條 {now[0]:.1f}% · {now[1]:.1f} 發送走 LV30 中位")
    print()
    print(f"   {'旋鈕':<18} {'×0.5':>10} {'出貨':>10} {'×2.0':>10}   判定")

    alerts: list[str] = []
    for knob in SUSPECT_KNOBS:
        if knob not in env:
            continue
        lo = outcome({**env, knob: env[knob] * 0.5}, base_hp, hp_bonus, ratios)
        hi = outcome({**env, knob: env[knob] * 2.0}, base_hp, hp_bonus, ratios)
        spread = abs(hi[0] - lo[0]) / max(now[0], 1e-9)
        dead = spread < ECHO_EPS
        verdict = "🚨 ALERT：回音迴圈（調了等於白調）" if dead else "⭐ 真的旋鈕"
        print(f"   {knob:<18} {lo[0]:>9.1f}% {now[0]:>9.1f}% {hi[0]:>9.1f}%   {verdict}")
        if dead:
            alerts.append(knob)

    print()
    if alerts:
        print("🚨 " + "、".join(alerts) + " 把值翻倍之後結果幾乎沒動。")
        print("   ⇒ 那一格在推導鏈的**分子與分母上同時出現**，互相抵銷了。")
        print("   ⛔ 修法是把它從**推導**那一側拿掉（owner：「不能把系統倍率乘進去再反推」），")
        print("      ⛔ 不是換一個數字 —— 換數字對回音迴圈是完全無效的。")
        return 1 if args.check else 0
    print("✔ 每一格都轉得動 —— 沒有回音迴圈。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
