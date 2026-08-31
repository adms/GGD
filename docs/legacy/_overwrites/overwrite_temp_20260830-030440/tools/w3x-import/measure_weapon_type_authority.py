#!/usr/bin/env python3
"""量一次「`weapon_type` 這一欄能不能回答『這位英雄揮的是什麼』」（GH#874）。

⭐ **為什麼是一支腳本而不是一段註解**：`stock_unit_data.py` 在 2026-08-30 之前
用一段散文把這一欄宣告成「保真權威」，⛔ 而那句話引用不到任何量測 —— 第三守則的
標準形狀：一個零消費端的欄位被一段散文守著，而沒有任何東西會紅。散文會過期，
⛔ 而它過期的時候看起來跟真的一模一樣。⇒ 把那句宣稱換成**一個跑得起來的指令**。

    python3 tools/w3x-import/measure_weapon_type_authority.py

READ-ONLY —— ⛔ 一個位元組都不寫。離開碼：0 = 量到了（結論印在最後一段），
非零 = **量尺壞了**（⛔ 不是「沒有矛盾」）。

⭐ 兩個方向都校準（CLAUDE.md：單邊校準的尺會在它最需要說話的時候沉默）：
  · 已知**有**的要量得到 —— 解析得出 `weapon_type` 的英雄數必須 > 0
  · 已知**沒有**的要量不到 —— 分類詞彙必須同時抓得到刃器與鈍器；只抓得到一邊的
    分類器會把每一支都判成同一類，而那讀起來就是「零矛盾」。
"""

from __future__ import annotations

import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
STOCK = os.path.join(HERE, "out", "stock", "STOCK_UNITS.json")
OBJECTS = os.path.join(HERE, "out", "GoDieEX22s-src", "OBJECTS.json")
SRC_MAP = os.path.join(REPO, "src_gogodieEX227s.w3x")
CHAMPIONS = os.path.join(REPO, "content", "champions", "*.json")

# 三段式 `<材質><重量><動作>`，⭐ 決定音效的是**第三段**。
BLADE = ("Slice", "Chop")
BLUNT = ("Bash",)
# 出貨的近戰武器 tag（`packages/shared/src/sim/systems/BasicAttackSystem.ts`
# 的 WEAPON_TAGS）—— 這三個全部是刃器，所以 tag→類別的映射沒有第二個答案。
MELEE_TAGS = ("greatsword", "katana", "sword")
RANGED_TAGS = ("gun", "bow", "magic", "thrown")


def kind_of(weapon_type: str) -> str | None:
    if any(k in weapon_type for k in BLADE):
        return "blade"
    if any(k in weapon_type for k in BLUNT):
        return "blunt"
    return None


def calibrate() -> None:
    """⛔ 這把尺自己要先過關，否則下面每一個結論都作廢。"""
    seen = {kind_of("MetalHeavySlice"), kind_of("MetalMediumChop"), kind_of("WoodHeavyBash")}
    if seen != {"blade", "blunt"}:
        sys.exit(f"⛔ 分類器校準失敗：刃器/鈍器只認得 {seen} —— 這把尺在一個方向上是瞎的")
    if kind_of("Nonsense") is not None:
        sys.exit("⛔ 分類器把不認得的值也分了類 —— 已知沒有的它也量得到")


def main() -> int:
    calibrate()
    for p in (STOCK, OBJECTS):
        if not os.path.exists(p):
            sys.exit(f"⛔ 量不到：{p} 不存在（⛔ 這不是『沒有矛盾』）")

    stock = {k.lower(): v for k, v in json.load(open(STOCK, encoding="utf8"))["units"].items()}
    obj = json.load(open(OBJECTS, encoding="utf8"))
    heroes = {k.lower(): v for k, v in obj["heroes"].items()}
    units = obj["units"]

    print("① stock 側（`UnitWeapons.slk` 的 weapType1 欄）")
    have = sum(1 for r in stock.values() if r.get("weapon_type"))
    print(f"   帶這一欄的列: {have} / {len(stock)}")

    print("\n② 地圖側（`OBJECTS.json`，＝ GoDie 自己的英雄）")
    hh = sum(1 for h in heroes.values() if h.get("weapon_type"))
    uu = sum(1 for u in units.values() if u.get("weapon_type"))
    print(f"   自訂英雄帶 weapon_type: {hh} / {len(heroes)}    自訂單位: {uu} / {len(units)}")
    print("   ⇒ 抽取器沒有讀這一欄 ⇒ 要問一位 GoDie 英雄只能走 `base` 進 stock 表，")
    print("     ⭐ 而回來的是 **base 那一隻**的武器，⛔ 不是這位英雄的。")

    print("\n③ 拿它去驗**已經有 tag** 的近戰英雄（用這一欄自己宣告的判準）")
    total = resolved = agree = 0
    contradictions: list[tuple[str, str, str, str]] = []
    for p in sorted(glob.glob(CHAMPIONS)):
        if os.path.basename(p).startswith("_"):
            continue
        doc = json.load(open(p, encoding="utf8"))
        tags = [str(t).lower() for t in (doc.get("tags") or [])]
        tag = next((t for t in (*MELEE_TAGS, *RANGED_TAGS) if t in tags), None)
        if tag not in MELEE_TAGS:
            continue
        total += 1
        cid = doc.get("id") or os.path.basename(p)[:-5]
        base = (heroes.get(cid.split("-")[-1].lower()) or {}).get("base", "").lower()
        wt = (stock.get(base) or {}).get("weapon_type")
        if not wt:
            continue
        resolved += 1
        k = kind_of(wt)
        if k is None:
            continue
        if k == "blade":  # MELEE_TAGS 三個全是刃器
            agree += 1
        else:
            contradictions.append((cid, tag, base, wt))

    if resolved == 0:
        sys.exit("⛔ 一隻都解析不出來 —— 這把尺壞了（join 斷了），⛔ 不是「零矛盾」")

    print(f"   近戰 tag 的出貨英雄: {total}   經 base 解析得出 weapon_type: {resolved}")
    print(f"   一致: {agree}   ⛔ 矛盾: {len(contradictions)}")
    for cid, tag, base, wt in contradictions:
        print(f"     ⛔ {cid:<14} tag={tag:<11} base={base:<6} → {wt}")
    rate = len(contradictions) / (agree + len(contradictions))
    print(f"   ⇒ 矛盾率 {rate:.0%} —— ⛔ 一把這樣的尺不能拿來判「這一隻的 tag 對不對」。")

    print("\n④ 走完 (a)「補上出口」原本要走的那條路（⭐ ⛔ 不只是推翻它）")
    print("   ⚠️ SLK 的 `weapType1` 在 w3u 裡叫 **`ucs1`**（Attack 1 - Weapon *Sound*），")
    print("     ⛔ 不是 `ua1t` —— 那是 Attack *Type*，值域是 pierce/hero/chaos/unknown。")
    if not os.path.exists(SRC_MAP):
        print(f"   ⚠️ 量不到：{SRC_MAP} 不在這棵樹上 ⇒ 這一段**沒有量到**（⛔ 不是量到 0）。")
        return 0
    sys.path.insert(0, HERE)
    from w3xlib.mpq import W3XArchive  # noqa: PLC0415 — 只有這一段需要它
    from w3xlib.objdata import parse_object_file  # noqa: PLC0415

    w3u = parse_object_file(W3XArchive(SRC_MAP).read_file("war3map.w3u"), has_levels=False)
    per_hero = {}
    n_heroes = 0
    for table in ("original", "custom"):
        for e in w3u[table]:
            if not e.base_id[0].isupper():
                continue
            n_heroes += 1
            v = e.get("ucs1")
            if v not in (None, ""):
                per_hero[e.obj_id.lower()] = v
    print(f"   地圖自己設了 ucs1 的英雄: {len(per_hero)} / {n_heroes}")
    fixed = added = 0
    for cid, tag, base, wt in contradictions:
        mv = per_hero.get(cid.split("-")[-1].lower())
        if mv and kind_of(mv) == "blade":
            fixed += 1
            print(f"     ⭐ (a) 會修好: {cid} base 說 {wt} → 地圖自己說 {mv}")
    for rc, mv in per_hero.items():
        if rc not in {c.split("-")[-1].lower() for c, *_ in contradictions} and f"godie-{rc}" in {
            (json.load(open(p, encoding="utf8")).get("id") or "")
            for p in glob.glob(CHAMPIONS)
            if not os.path.basename(p).startswith("_")
        }:
            added += 1
    print(f"   ⇒ (a) 會修好 {fixed} 個矛盾（剩 {len(contradictions) - fixed}），")
    print(f"     而 {n_heroes - len(per_hero)} / {n_heroes} 位英雄**仍然**只有 base 的答案。")
    print("   ⭐ 結論：(a) 讓它變準一點，⛔ 但**變不成權威** ⇒ 這張票選 (b)「收回宣稱」。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
