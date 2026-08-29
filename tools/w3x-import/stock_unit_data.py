#!/usr/bin/env python3
"""Extract Blizzard's STOCK unit table from the Warcraft III MPQs (task #248).

    python3 tools/w3x-import/stock_unit_data.py
    -> tools/w3x-import/out/stock/STOCK_UNITS.json

WHY THIS EXISTS. `war3map.w3u` (and therefore
`out/GoDieEX22s-src/OBJECTS.json`) records only the columns an object
OVERRIDES. A hero that keeps a stock attribute has NO entry for it, which
surfaces in OBJECTS.json as `null` — *inherit from the base unit*, NOT zero.
Resolving those inherits needs Blizzard's own tables, which live in the stock
archives at the repo root:

    Units\\UnitBalance.slk   STR/AGI/INT (+growths), HP, mana, armour, speed
    Units\\UnitWeapons.slk   attack cooldown / dice / sides / base damage / range
    Units\\UnitData.slk      race + misc (kept for context)

Same route `stock_item_data.py` already takes for item abilities and
`extract_unit_stats.py` took by hand for `STOCK_MOVE_SPEED`; this generalises
it to every stock unit and every stat field the importer reads.

LOAD ORDER. war3.mpq -> War3x.mpq -> War3Patch.mpq, later archives patch
earlier ones, so rows are replaced wholesale by the last archive that has them
(War3xLocal.mpq carries no unit tables at all).
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from w3xlib.mpq import W3XArchive  # noqa: E402

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = HERE / "out" / "stock" / "STOCK_UNITS.json"

ARCHIVES = ["war3.mpq", "War3x.mpq", "War3Patch.mpq"]

BALANCE = "Units\\UnitBalance.slk"
WEAPONS = "Units\\UnitWeapons.slk"
DATA = "Units\\UnitData.slk"

# stock SLK column -> the field name OBJECTS.json uses for the same stat.
BALANCE_MAP = {
    "STR": "str",
    "AGI": "agi",
    "INT": "int",
    "STRplus": "str_growth",
    "AGIplus": "agi_growth",
    "INTplus": "int_growth",
    "Primary": "primary_attr",
    "HP": "hp",
    "manaN": "mana",
    "regenHP": "hp_regen",
    "regenMana": "mana_regen",
    "def": "armor",
    "spd": "move_speed",
    "goldcost": "gold_cost",
    "level": "level",
}
WEAPON_MAP = {
    "cool1": "attack_cooldown",
    "dice1": "dmg_dice",
    "sides1": "dmg_sides",
    "dmgplus1": "dmg_base",
    "rangeN1": "attack_range",
    # ⭐ GH#745 加了這一欄；⛔⛔ GH#874（2026-08-30）**收回它的宣稱**。
    #
    # 這裡在 2026-08-30 之前逐字寫著「『這位英雄揮的是什麼』的**保真權威**」——
    # ⛔ **量出來它不是**,而且沒有任何東西會紅（第三守則:一個零消費端的欄位
    # 被一段散文守著）。⇒ 那句話換成一個**跑得起來的指令**:
    #
    #     python3 tools/w3x-import/measure_weapon_type_authority.py
    #
    # ⭐ 它今天回答的是 **base 那一隻的武器**,⛔ 不是這位 GoDie 英雄的 ——
    # 每一個結論旁邊都要帶著這個限定詞,⛔ 不可以只寫在標題的括號裡
    # （CLAUDE.md:一份報告的欄位表頭會靜靜地定義它量了什麼）。
    #
    # 量到的（HEAD,⛔ 不是估;⭐ 重跑上面那一行就會重印）:
    #   · 這一欄的**消費端**: **0** —— 只有寫入的這支與它寫出的 `STOCK_UNITS.json`
    #   · stock 側帶這一欄的列: **305 / 838**
    #   · `OBJECTS.json` 裡帶 `weapon_type` 的**自訂英雄**: **0 / 127**（單位 0 / 461）
    #     ⇒ 地圖側抽取器從來沒有讀過這一欄 ⇒ 只能走 `base` 進 stock 表
    #   · 拿它去驗**已經有 tag** 的 25 隻近戰（24 隻解析得出來）:
    #     一致 **13** · ⛔ 矛盾 **11**（`h00l` sword;`h01n` `h01o` `u00h` `u00j`
    #     `u010` `u01u` `udre` `uvng` katana;`hart` `hpb1` greatsword）
    #     ⇒ ⛔ **46% 矛盾率** —— 一把這樣的尺不能拿來判「這一隻的 tag 對不對」。
    #     例:`godie-ogrh` 悟空 base=Ogrh → `MetalHeavySlice`（那是**格羅姆的斧**）。
    #
    # ⚠️⚠️ **(a)「讓地圖側也讀這一欄」走完了,而它變不成權威**（⛔ 不是只推翻,
    # 是走完它原本要走的那條路）:SLK 的 `weapType1` 在 w3u 裡叫 **`ucs1`**
    # （Attack 1 - Weapon *Sound*）,⛔ **不是 `ua1t`** —— 那是 Attack *Type*,
    # 值域 pierce/hero/chaos/unknown。⭐ 照 `ua1t` 去做 (a) 會把**整條錯的欄位**
    # 匯進一個叫 `weapon_type` 的格子裡。而真的讀 `ucs1` 量到:
    # 地圖自己設了值的英雄只有 **18 / 127**,25 隻近戰裡只有 **3** 隻有
    # ⇒ 矛盾 11 → 10（只修好 `godie-hart`）。⭐ **變準一點,⛔ 變不成權威。**
    #
    # ⇒ ⭐ **近戰那一半今天沒有逐英雄的權威表**（遠程那一半有:
    # `Units/*UnitFunc.txt` 的 `Missileart=`,記在 `BasicAttackSystem.ts` 的
    # WEAPON_TAGS 檔頭）。⛔ 不要把那個**空白**讀成「還沒查」—— 查過了,
    # 出處就是上面那支腳本。
    #
    # ⭐ 欄位**留著**(知識不可以無聲消失):它對 **stock 側**仍然是對的答案,
    # 而且它本來就已經讀進來了（cool1/dice1/… 出自 `UnitWeapons.slk` 的同一列）。
    # 值域（838 列實測）:`MetalHeavySlice` · `MetalMediumChop` · `WoodHeavyBash`
    # · `RockHeavyBash` … 三段式 `<材質><重量><動作>`,而**決定音效的是第三段**
    # （Slice/Chop = 刃器,Bash = 鈍器）。⚠️ 遠程單位這一欄是 `_`（＝ MISSING
    # ⇒ 這一格自動不寫入）,所以它天然只回答近戰那一半。
    "weapType1": "weapon_type",
}
DATA_MAP = {"race": "race"}

MISSING = {"", "-", "_", "none", "None"}


def parse_slk(raw: bytes) -> dict[str, dict[str, str]]:
    """SLK -> {row-id: {column-name: raw cell text}} keyed by the first column."""
    text = raw.decode("utf-8", errors="replace")
    cells: dict[tuple[int, int], str] = {}
    cx = cy = 1
    for line in text.splitlines():
        if not line.startswith("C;"):
            continue
        # ;K<value> is always last and may itself contain ';', so split there
        # first and only scan the prefix for coordinates.
        i = line.find(";K")
        prefix = line if i < 0 else line[:i]
        m = re.search(r";X(\d+)", prefix)
        cx = int(m.group(1)) if m else cx
        m = re.search(r";Y(\d+)", prefix)
        cy = int(m.group(1)) if m else cy
        if i >= 0:
            cells[(cy, cx)] = line[i + 2 :].strip().strip('"')
    header = {x: cells[(1, x)] for (y, x) in cells if y == 1 and cells[(1, x)]}
    rows: dict[str, dict[str, str]] = {}
    by_y: dict[int, dict[int, str]] = {}
    for (y, x), v in cells.items():
        if y == 1:
            continue
        by_y.setdefault(y, {})[x] = v
    id_col = min(header)  # first column holds the unit id
    for y, row in by_y.items():
        uid = row.get(id_col)
        if not uid or uid in MISSING:
            continue
        rows[uid] = {header[x]: v for x, v in row.items() if x in header}
    return rows


def num(v: str | None):
    if v is None:
        return None
    v = v.strip().strip('"')
    if v in MISSING:
        return None
    try:
        f = float(v)
    except ValueError:
        return v  # non-numeric (e.g. Primary = "STR", race = "human")
    return int(f) if f == int(f) and "." not in v and "e" not in v.lower() else f


def read_table(fname: str) -> dict[str, dict[str, str]]:
    """Read one SLK across every archive in load order; later archives win."""
    merged: dict[str, dict[str, str]] = {}
    seen_in: dict[str, str] = {}
    for name in ARCHIVES:
        path = ROOT / name
        if not path.exists():
            print(f"  (skip {name} — not at {ROOT})", file=sys.stderr)
            continue
        arc = W3XArchive(str(path))
        try:
            raw = arc.read_file(fname)
        finally:
            arc.close()
        if not raw:
            continue
        rows = parse_slk(raw)
        print(f"  {name}:{fname} -> {len(rows)} rows", file=sys.stderr)
        for uid, row in rows.items():
            merged[uid] = row
            seen_in[uid] = name
    return merged


def main() -> int:
    bal = read_table(BALANCE)
    wep = read_table(WEAPONS)
    dat = read_table(DATA)
    if not bal:
        print("FATAL: no UnitBalance.slk rows read", file=sys.stderr)
        return 1

    units: dict[str, dict] = {}
    for uid in sorted(set(bal) | set(wep) | set(dat)):
        rec: dict = {}
        for col, field in BALANCE_MAP.items():
            v = num(bal.get(uid, {}).get(col))
            if v is not None:
                rec[field] = v
        for col, field in WEAPON_MAP.items():
            v = num(wep.get(uid, {}).get(col))
            if v is not None:
                rec[field] = v
        for col, field in DATA_MAP.items():
            v = num(dat.get(uid, {}).get(col))
            if v is not None:
                rec[field] = v
        rec["_tables"] = "".join(
            c for c, t in (("B", bal), ("W", wep), ("D", dat)) if uid in t
        )
        units[uid] = rec

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "meta": {
                    "generator": "tools/w3x-import/stock_unit_data.py",
                    "archives": ARCHIVES,
                    "tables": [BALANCE, WEAPONS, DATA],
                    "note": (
                        "Blizzard stock unit stats. Field names match "
                        "OBJECTS.json so a null there can be resolved by "
                        "walking `base` to a row in here."
                    ),
                    "count": len(units),
                },
                "units": units,
            },
            ensure_ascii=False,
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"wrote {OUT} ({len(units)} stock units)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
