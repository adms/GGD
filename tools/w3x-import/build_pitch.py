#!/usr/bin/env python3
"""揮砍／特效仰角 `pitchDeg` —— **唯一的寫入者**（GH#456，owner 2026-08-20 選 C）。

    python3 tools/w3x-import/build_pitch.py            # 重算並寫 content/
    python3 tools/w3x-import/build_pitch.py --check    # 閘:只比對,不一致回非零

## 為什麼會有這一支（⛔ 不要退回兩支各寫各的）

`content/config/vfx-families.json` 的 `pitchDeg` 一共 40 支技能有值,而在此之前
**兩支腳本都在寫它**:

| 產生器 | 資料來源 | 宣稱擁有 |
|---|---|---:|
| `build_vfx_orient.py` | w3a 表 + 模型發射器的**靜止姿態** | 40 支（全部） |
| `build_slash_pitch.py` | 模型的**揮擊動畫**（刀身向量連續外積 → 旋轉軸） | 37 支 |

37 支**完全被 40 支包住** —— 不是部分重疊。所以「後跑的贏」不是偶發:
**每一次都在同樣 37 支上打架**,而兩條守衛因此**互為對方的紅燈**
（跑完 A 則 B 紅,跑完 B 則 A 紅）。`pnpm skills:sync` 兩支都跑,
於是**誰贏取決於指令順序**,而順序**沒有任何東西在守** —— 那正是
CLAUDE.md 元規則說的「判準不是閘」的教科書形狀。

## 優先序（內建,⛔ 不靠執行順序）

**動畫量到的 > w3a 表推的。**

理由不是偏好,是第〇·六守則第 3 層的同一個方向:**程式/資料不會說謊,文案會**。
對一支有揮擊動畫的近戰技能,「這一刀實際掃過的旋轉軸」就是玩家在畫面上看到的
那一個;w3a 表那一欄描述的是**特效藝術的靜止姿態**,兩者只在沒有揮擊動畫時才等價。
⇒ 有動畫量得到 → 用動畫;量不到 → 落回 w3a;兩邊都沒有 → **把那一格刪掉**
（留著一個過期的手打值,正是這條閘存在的理由）。

## 兩支舊腳本現在是什麼

它們**只量測、不寫 content**（`--measure` 寫各自的中繼帳本）。
這一支 import 它們的量測函式再合併。⇒ **寫入者只有一個,順序從此無意義。**

⚠️ 刻意沒有產生日期（同兩支舊腳本的理由,GH#389）:任何隨時鐘變動的欄位都會讓
逐位元組比對永遠不相等,於是 `--check` 只能被放寬成模糊比對 —— 而一條被放寬的閘
等於沒有閘。

守衛:`packages/shared/src/ops/pitchDerived.test.ts`（真的把這支用 `--check` 跑起來）。
"""
from __future__ import annotations

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import build_slash_pitch as ANIM  # noqa: E402  動畫量測（37 支）
import build_vfx_orient as W3A  # noqa: E402  w3a 表推導（40 支）

VFX_FAMILIES = os.path.join(HERE, "..", "..", "content", "config", "vfx-families.json")
VFX_FAMILIES = os.path.normpath(VFX_FAMILIES)
ABILITY_DIR = os.path.normpath(os.path.join(HERE, "..", "..", "content", "abilities"))


def shipped_ability_ids() -> set[str]:
    """出貨的技能 id（`content/abilities/<id>.json` 的檔名）。

    ⭐ 從**磁碟**推導,⛔ 不是一張手寫名單 —— 一張手寫的名單會過期,而且它過期的時候
    這條規則會靜靜地放行（CLAUDE.md 元規則:判準不是閘）。
    """
    if not os.path.isdir(ABILITY_DIR):  # 沙盒/半棵樹 —— 不知道就不要剪
        return set()
    return {
        n[: -len(".json")]
        for n in os.listdir(ABILITY_DIR)
        if n.endswith(".json") and not n.startswith("_")
    }


def combine() -> tuple[dict[str, dict], dict[str, str], list[str]]:
    """→ ({abilityId: {pitchDeg, _src, ...}}, {abilityId: 來源}, 兩邊都量不到的 id)"""
    w3a_rows, w3a_unmeasured = W3A.derive()
    anim_ledger = ANIM.measure_all()

    merged: dict[str, dict] = {}
    src: dict[str, str] = {}

    for aid, row in w3a_rows.items():
        merged[aid] = dict(row)
        src[aid] = "w3a"

    # ⭐ 動畫**覆蓋** w3a —— 這一行就是優先序本身。⛔ 刪掉它 = 退回「順序決定勝負」。
    for aid, row in anim_ledger["abilities"].items():
        merged[aid] = {
            "pitchDeg": row["pitchDeg"],
            "_clip": row.get("clip"),
            "_sweptDeg": row.get("sweptDeg"),
        }
        src[aid] = "anim"

    owned = set(W3A._family_ability_ids()) | set(anim_ledger["abilities"])
    dead = sorted(aid for aid in owned if aid not in merged)
    return merged, src, dead


def apply_to_content(merged: dict[str, dict], dead: list[str]) -> tuple[dict, list[str]]:
    """把合併結果折進 config。⚠️ **只動 `pitchDeg` 這一格** —— 同一列上的
    family / tint / anchor 是別人推導的,碰到就是把兩份推導攪在一起。"""
    with open(VFX_FAMILIES, encoding="utf-8") as fh:
        doc = json.load(fh)
    abilities = doc.setdefault("abilities", {})
    changes: list[str] = []

    # ⭐ GH#713 —— **死列**:掛著 family/tint/anchor 而 `content/abilities/<id>.json`
    #    根本不存在。第一·五守則的形狀:一份**沒有消費端的宣稱**（沒有任何技能查得到它）。
    #    2026-08-27 量到 313 列裡 **93 列**是死的（票上只點名了 family:"mark" 那 4 支）。
    # ⚠️ 為什麼剪在這裡而不是「別碰 family」那條規矩的例外:那條規矩說的是
    #    **⛔ 不要改別人推導出來的值**;整列刪掉不是改值,是把一列**指向不存在的技能**的
    #    索引移除。⭐ 它們全部從 w3a/模型量測**重新推導得出來** —— 那幾位英雄哪天真的
    #    上架,下一次 `pitch:build` 會連同 family 一起把列長回來,⛔ 知識不會消失。
    shipped = shipped_ability_ids()
    if shipped:
        for aid in sorted(abilities):
            if aid not in shipped:
                changes.append(f"{aid}: （刪列,content/abilities 沒有這份出貨文件）")
                del abilities[aid]

    for aid in sorted(merged):
        if shipped and aid not in shipped:
            continue  # ⛔ 不要把剛剪掉的那一列又加回來
        slot = abilities.setdefault(aid, {})
        before = slot.get("pitchDeg")
        want = merged[aid]["pitchDeg"]
        if before != want:
            changes.append(f"{aid}: {before} → {want}")
        slot["pitchDeg"] = want

    for aid in dead:
        slot = abilities.get(aid)
        if slot and "pitchDeg" in slot:
            changes.append(f"{aid}: {slot['pitchDeg']} → （刪除,兩邊都量不到）")
            del slot["pitchDeg"]

    doc["abilities"] = dict(sorted(abilities.items()))
    return doc, changes


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="閘:只比對,不寫。不一致回非零")
    args = ap.parse_args(argv)

    merged, src, dead = combine()
    n_anim = sum(1 for v in src.values() if v == "anim")
    n_w3a = sum(1 for v in src.values() if v == "w3a")
    print(f"合併 {len(merged)} 支 —— 動畫量到 {n_anim} 支（優先）· w3a 推到 {n_w3a} 支 · 兩邊都沒有 {len(dead)} 支")

    doc, changes = apply_to_content(merged, dead)

    if args.check:
        if changes:
            print("\n⛔ content/config/vfx-families.json 的 pitchDeg 與推導不一致:", file=sys.stderr)
            for c in changes:
                print("   " + c, file=sys.stderr)
            print(
                "\n⛔ 不要改測試 —— 跑 `python3 tools/w3x-import/build_pitch.py` 然後 git add content/",
                file=sys.stderr,
            )
            return 1
        print("✅ content 是最新的")
        return 0

    with open(VFX_FAMILIES, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=2, sort_keys=False)
        fh.write("\n")
    print(f"寫入 {os.path.relpath(VFX_FAMILIES, os.path.join(HERE, '..', '..'))}（{len(changes)} 格變動）")
    for c in changes:
        print("   " + c)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
