#!/usr/bin/env python3
"""
⭐⭐ 英雄卡**內嵌**技能圖示的一次性遷移（GH#1165）。

## ⛔⛔ 抓到的

37 名社群英雄的英雄卡裡，`abilities.{Q,W,E,R}.icon` **仍然指著骨架的圖**
（`assets/icons/abilities/sela.q.webp`）—— 共 **148 格**。

⭐ 而**同一份文件的英雄級 `icon` 早就遷移過了**
（`assets/icons/champions/community-review-01-20260907.webp`）
⇒ ⭐ 這是決定性的證據：**刻意共用不會只遷移一半**。

⭐ 而且獨立的技能文件 `content/abilities/<id>.json` **早就指著自己的圖**，
那 444 張 webp **也真的在磁碟上**。
⇒ ⛔ 也就是說：正確的值一直都在，⭐ 只有這一份**內嵌的副本**沒跟上。

## ⭐ 為什麼會這樣（第〇·四守則）

`gen.py::attach_ability_icon()` 修的是**獨立技能文件**那一份；
⛔ 而英雄卡裡那一份是**第二個住處**，⛔ 沒有任何人在維護它。

⇒ ⭐ 這一支把第二個住處**對回唯一的來源**（獨立技能文件）。
⚠️ ⭐ 它**不編造**任何值：只有當獨立文件有 `icon`、⭐ **而且那個檔真的在磁碟上**時才寫。

## ⭐ 玩家看到什麼

⛔ 修之前：37 名英雄的四格技能，圖示全部是**另一名英雄（骨架 sela）的**。
⭐ 第一·五守則：卡片上不可以有「說了但不會發生」的東西 —— 一張別人的圖就是那個形狀。
"""
import json
import pathlib
import sys

REPO = pathlib.Path(__file__).resolve().parents[2]
CH = REPO / "content/champions"
AB = REPO / "content/abilities"


def main() -> int:
    check = "--check" in sys.argv
    fixed = 0
    heroes = 0
    skipped: list[str] = []
    for f in sorted(CH.glob("*.json")):
        if f.name.startswith("_"):
            continue
        doc = json.loads(f.read_text(encoding="utf-8"))
        ab = doc.get("abilities")
        if not isinstance(ab, dict):
            continue
        touched = False
        for slot, node in ab.items():
            if not isinstance(node, dict):
                continue
            aid = node.get("id")
            cur = node.get("icon")
            if not isinstance(aid, str) or not isinstance(cur, str):
                continue
            want = f"assets/icons/abilities/{aid}.webp"
            if cur == want:
                continue
            # ⭐ 只在「正確的圖**真的存在**」時才改 —— ⛔ 不編造。
            if not (REPO / "content" / want).is_file():
                skipped.append(f"{doc.get('id')}.{slot}: ⛔ 沒有 {want}（維持 {cur}）")
                continue
            node["icon"] = want
            fixed += 1
            touched = True
        if touched:
            heroes += 1
            if not check:
                f.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for s in skipped:
        print(f"  skip {s}")
    verb = "會改" if check else "改了"
    print(f"{verb} {fixed} 格內嵌圖示，跨 {heroes} 名英雄（⛔ 跳過 {len(skipped)} 格：正確的圖不在磁碟上）")
    if check and fixed:
        print("⛔ 內嵌技能圖示過期 —— 跑 `python3 tools/ship-81/fix_embedded_icons.py`")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
