#!/usr/bin/env python3
"""⭐ 驗策劃主體表：37/37 英雄與 222/222 技能的主體是否**全部相異**（GH#1129）。

⛔ 為什麼要這一支：內建 deriver 對中文名是瞎的 —— 量到 34/37 英雄落到 `role` 退路
（22 隻會長成同一張 `an anime warrior…`），222 支技能只推出 68 個相異主體。
⇒ ⭐ 這條閘證明策劃表把那個坍縮修好了,而且**還沒有塌回去**。
"""
from __future__ import annotations

import json
import pathlib
import sys

DATA = pathlib.Path(__file__).resolve().parent / "data" / "community37-subjects.json"


def main() -> int:
    heroes = json.loads(DATA.read_text(encoding="utf-8"))["heroes"]
    hero_subj = [v["hero"][0] for v in heroes.values()]
    slot_subj = [s[0] for v in heroes.values() for s in v["slots"].values()]
    ok = True
    print(f"英雄 {len(hero_subj)} · 相異 {len(set(hero_subj))}")
    print(f"技能 {len(slot_subj)} · 相異 {len(set(slot_subj))}")
    if len(set(hero_subj)) != len(hero_subj):
        dup = {s for s in hero_subj if hero_subj.count(s) > 1}
        print(f"⛔ 英雄主體重複：{sorted(dup)[:5]}")
        ok = False
    if len(set(slot_subj)) != len(slot_subj):
        dup = {s for s in slot_subj if slot_subj.count(s) > 1}
        print(f"⛔ 技能主體重複：{sorted(dup)[:5]}")
        ok = False
    if len(heroes) != 37:
        print(f"⛔ 英雄數 {len(heroes)} ≠ 37")
        ok = False
    if len(slot_subj) != 222:
        print(f"⛔ 技能槽 {len(slot_subj)} ≠ 222")
        ok = False
    print("✓ 全部相異" if ok else "⛔ 有重複")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
