#!/usr/bin/env python3
"""
⭐【替每一份 ability 文件蓋上「這是階梯第幾層」】—— 2026-08-13 事故的直接修法。

461 份 ability 文件裡，只有 90 支歸 `tools/skill-remake/batch1.py` 管
（＝owner 新版技能說明，階梯第 1 層）。其餘 371 支是從 w3x 匯入的文案（第 4 層）。
⛔ 而它們的 29 個頂層欄位裡**沒有任何一個**說得出這件事 —— 兩種長得一樣權威。

用法：
    python3 tools/skill-remake/stamp_provenance.py           # 蓋章
    python3 tools/skill-remake/stamp_provenance.py --check   # 只檢查，有漏回非零

判定（⛔ 不是猜的，是從產生器的 HERO 表推導）：
  · `batch1.py` 的 `HERO` 對照表裡那 15 位英雄的技能 → `"owner-spec"`
  · 其餘 → `"w3x-import"`

⚠️ 「這份文件的**出身**」≠「每一個字都逐字未改」。一份 w3x-import 的文件後來
   被人手改過，它仍然不是 owner 新版規格 —— 這一格要回答的正是那個問題。

⚠️ 90 支那邊由 `batch1.py` 自己輸出 `provenance`（見 `build()`），
   這支腳本只是**補齊剩下的**與提供 `--check`。兩邊蓋出來的值必須一致，
   守衛 `packages/shared/src/content/abilityProvenance.test.ts` 在對。
"""
# ggd:writes content/abilities/*.json
# ggd:writes content/champions/*.json
# ⭐ GH#771 —— 靜態產物宣告（merge-io.mjs 收割）：這一支只在 provenance 戳缺了才寫，
#    量測（含逼寫）量不到 ⇒ 用宣告補戶籍。宣告住在寫入端旁邊，⛔ 不是手編 sync-io。
from __future__ import annotations

import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ABIL = os.path.join(ROOT, "content", "abilities")
GEN = os.path.join(ROOT, "tools", "skill-remake", "batch1.py")


def remade_prefixes() -> set[str]:
    """`batch1.py` 的 HERO 對照表 → 那 15 位英雄的 id 前綴。"""
    src = open(GEN, encoding="utf-8").read()
    m = re.search(r"^HERO\s*=\s*\{(.*?)^\}", src, re.S | re.M)
    if m is None:
        raise SystemExit("⛔ 在 batch1.py 找不到 HERO 對照表 —— 它改形狀了，先看過再跑")
    return set(re.findall(r'"(godie-[a-z0-9]+)"', m.group(1)))


def champion_heads() -> set[str]:
    """出貨 champion 文件的 id —— ⭐ 「這支技能有沒有主人」的唯一答案。"""
    d = os.path.join(ROOT, "content", "champions")
    return {
        f[: -len(".json")]
        for f in os.listdir(d)
        if f.endswith(".json") and not f.startswith("_")
    }


def classify(path: str, prefixes: set[str], champs: set[str] | None = None) -> str:
    base = os.path.basename(path)[: -len(".json")]
    head = base.split(".")[0]
    if head in prefixes:
        return "owner-spec"
    # ⭐ 2026-08-23（GH#602）—— **沒有主人 ⇒ 原創 ⇒ 只可能是 owner 的規格**
    # （w3x 裡沒有它的來源）。⚠️ 觸發它的是**殭屍王**：它是小怪，沒有 champion 文件,
    # 而它的 [leap吸血] 是 owner 2026-08-23 逐字寫的新設計,⛔ 不是原作移植。
    #
    # ⛔ 在此之前這一支與 `abilityProvenance.test.ts` 的判準**分岔**：
    # 守衛逐字寫著「沒有主人 ⇒ 原創 ⇒ 只可能是 owner 的規格」,而這裡只問了
    # 「是不是重製名單上的英雄」⇒ 一份沒有主人的文件會被蓋成 `w3x-import` 而守衛紅,
    # 而**跑蓋章器修不好它**（它每次都蓋回同一個錯的值）。
    # ⭐ 兩邊現在是同一條規則。
    if champs is not None and head not in champs:
        return "owner-spec"
    return "w3x-import"


def main() -> int:
    check = "--check" in sys.argv
    prefixes = remade_prefixes()
    champs = champion_heads()
    files = sorted(f for f in glob.glob(os.path.join(ABIL, "*.json"))
                   if not os.path.basename(f).startswith("_"))
    missing, wrong, wrote = [], [], 0
    for f in files:
        d = json.load(open(f, encoding="utf-8"))
        want = classify(f, prefixes, champs)
        have = d.get("provenance")
        if have is None:
            missing.append(os.path.basename(f))
        elif have != want:
            wrong.append(f"{os.path.basename(f)}: {have} != {want}")
        if check:
            continue
        if have == want:
            continue
        # ⚠️ 插在 `description` 前面（Zod 宣告序），⛔ 不是塞到最後 ——
        #    鍵序浮動會讓 diff 讀不出來這一版到底改了什麼。
        out = {}
        for k, v in d.items():
            if k == "description":
                out["provenance"] = want
            out[k] = v
        if "provenance" not in out:
            out["provenance"] = want
        json.dump(out, open(f, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        open(f, "a", encoding="utf-8").write("\n")
        wrote += 1

    # ⭐ 鏡像的另一半：ability 在 repo 裡存兩次（standalone + 英雄槽位裡的嵌入копия）。
    #    ⛔ 只蓋 standalone 會讓 `abilityMirror.test.ts` 紅 —— 而那條守衛的註解
    #    自己寫著「sanctioning is how drift persists」：正解是**同步**不是豁免。
    champ_dir = os.path.join(ROOT, "content", "champions")
    for cf in sorted(glob.glob(os.path.join(champ_dir, "*.json"))):
        if os.path.basename(cf).startswith("_"):
            continue
        cd = json.load(open(cf, encoding="utf-8"))
        ab = cd.get("abilities")
        if not isinstance(ab, dict):
            continue
        touched = False
        for slot, inner in ab.items():
            if not isinstance(inner, dict) or "id" not in inner:
                continue
            ih = str(inner["id"]).split(".")[0]
            want = "owner-spec" if (ih in prefixes or ih not in champs) else "w3x-import"
            if inner.get("provenance") == want:
                continue
            if check:
                missing.append(f"{os.path.basename(cf)}#{slot}")
                continue
            out = {}
            for k, v in inner.items():
                if k == "description":
                    out["provenance"] = want
                out[k] = v
            if "provenance" not in out:
                out["provenance"] = want
            ab[slot] = out
            touched = True
        if touched and not check:
            json.dump(cd, open(cf, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
            open(cf, "a", encoding="utf-8").write("\n")
            wrote += 1

    n_owner = sum(1 for f in files if classify(f, prefixes, champs) == "owner-spec")
    if check:
        if not missing and not wrong:
            print(f"provenance 齊了：{len(files)} 份（owner-spec {n_owner} / w3x-import {len(files)-n_owner}）")
            return 0
        if missing:
            print(f"⛔ {len(missing)} 份沒有 provenance，例：{missing[:5]}")
        if wrong:
            print(f"⛔ {len(wrong)} 份的 provenance 對不上，例：{wrong[:5]}")
        print("跑 `python3 tools/skill-remake/stamp_provenance.py` 補齊")
        return 1
    print(f"蓋章 {wrote} 份（總 {len(files)}：owner-spec {n_owner} / w3x-import {len(files)-n_owner}）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
