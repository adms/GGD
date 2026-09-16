#!/usr/bin/env python3
"""🃏 社群英雄天生技的卡面 ＝ 與同一名英雄 Q/W/E/R **同一個三行格式**（GH#1239）。

> owner 2026-09-12（逐字，`docs/_daily/ledger-source_temp_20260912.md:30`）：
>  「卡面缺字 #1239 34 支技能攻擊時會觸發而卡面沒說(31 支是新上架那批帶的)=> 那你補阿幹嘛問我」

## 根因（⛔ 不是文案債，是組裝路徑不對稱）

`gen.py::ability_docs()` 有兩條組裝路：
  · Q/W/E/R 從 `effectiveHero.abilities.*` 拿卡面 —— ⭐ 它**本來就是三行**
    `【目前模板可執行】currentBehavior / 【目標設計】ownerDescription / 【待補機制】requiredRefinement`
    （2026-09-15 逐張比對：146/148 逐字吻合，另 2 張是編輯器省略了通用的第三行）
  · EX/PASSIVE 從 `slots[]` 組 —— ⛔ 卡面**只拿了 `ownerDescription`**
⇒ 天生技卡面只剩「目標設計」那一行，⭐ 而出貨跑的是代理 hook（`tpl-on-attack`：普攻追加極小級傷害）
⇒ 玩家讀到「召喚物命中與陷阱成功觸發，各累積布局」，實際發生的是「普攻追加傷害」——
   第一·五守則的兩個方向**同時**成立（說了的不會發生、會發生的沒說）。

## 做法（⛔ 不替它們做設計）

- ⭐ **一處組字**：`composed()`。組裝處（`gen.py`）與已出貨的卡（本支 CLI）都呼叫它，⛔ 不抄第二份。
- 【目前模板可執行】照抄 recipe 的 `currentBehavior` —— ⛔ **但先與出貨 JSON 推導的那一句比對**，
  兩個來源一致才寫（照實）。對不上 ⇒ 跳過並列出，⛔ 不猜。
  ⚠️ 前例：11/14/17 的 recipe 寫「小範圍反擊」，出貨 JSON 是**單體** `damage`
  （`reflectRadius` 在展開時掉了）⇒ 抄過去就是另一句謊話 ⇒ 這一支跳過它們。
- 【目標設計】＝ `ownerDescription` 逐字、【待補機制】＝ `requiredRefinement` 逐字
  （交接要求「保留原始描述」「保留 requiredRefinement」—— ⭐ 兩者都**原封不動上卡**）。
- ⛔ 覆蓋前比對：現卡必須是 `ownerDescription`（尚未組）或已組好的樣子，
  否則停下來指名（第〇·六守則：被覆蓋的那一份可能有獨立內容）。
- recipe（`materials/community-hero-forge/recipes/*`）**唯讀**：被 S3 proof 釘雜湊。

## ⚠️ 數字

`currentBehavior` 帶字面值（「內置冷卻 3 秒」）。寫進卡面後由 `pnpm prose:build`
（`tools/card-prose/apply_placeholders.ts`，唯一的正規化處）換成 `{{cd}}` ——
⛔ 這一支不自己換（那會是第二份正規化器）。⇒ `--check` 比對時把佔位符當成「任何數字」。

用法：
  python3 tools/ship-81/passive_card.py           # 寫（冪等）
  python3 tools/ship-81/passive_card.py --check   # 還有沒組好的 ⇒ exit 1
"""
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
RECIPES = REPO / "materials/community-hero-forge/recipes"
OUT_AB = REPO / "content/abilities"

TYPE_ZH = {"magic": "魔法", "physical": "物理"}


def derived_behavior(passive: dict | None) -> str | None:
    """⭐ 從**出貨 JSON** 推導的那一句「目前實際發生什麼」。

    ⛔ 形狀不是這裡認得的代理模板 ⇒ `None`（⛔ 不猜）。要認得新的代理形狀 ⇒ 在這裡加一個分支，
    ⭐ 而那一句必須與 recipe `currentBehavior` 逐字相同才會上卡（兩個來源互相作證）。
    """
    ranks = (passive or {}).get("ranks") or []
    if len(ranks) != 1 or ranks[0].get("modifiers"):
        return None
    hooks = ranks[0].get("hooks") or []
    if len(hooks) != 1:
        return None
    h = hooks[0]
    effects = h.get("effects") or []
    if h.get("on") != "onBasicAttack" or len(effects) != 1:
        return None
    e = effects[0]
    amount = e.get("amount") or {}
    tier = amount.get("damageTier")
    if e.get("kind") != "damage" or e.get("damageType") not in TYPE_ZH or not tier or amount.get("ratios"):
        return None
    if h.get("condition") not in (None, {"kind": "chance", "p": 1}) or h.get("chance") not in (None, 1):
        return None
    icd = h.get("internalCooldown")
    if not isinstance(icd, (int, float)) or icd <= 0:
        return None
    return f"普攻追加{tier}級{TYPE_ZH[e['damageType']]}傷害，內置冷卻 {icd:g} 秒。"


def composed(slot: dict, passive: dict | None) -> str | None:
    """⭐ 三行卡面；⛔ recipe 的 `currentBehavior` 與出貨 JSON 對不上 ⇒ `None`。"""
    behavior = (slot.get("currentBehavior") or "").strip()
    if not behavior or derived_behavior(passive) != behavior:
        return None
    lines = [f"【目前模板可執行】{behavior}", f"【目標設計】{slot['ownerDescription']}"]
    refine = (slot.get("requiredRefinement") or "").strip()
    if refine:
        lines.append(f"【待補機制】{refine}")
    return "\n".join(lines)


def _as_pattern(text: str) -> re.Pattern:
    """組好的卡 ⇒ 正則：數字那一格也接受 `prose:build` 換上的佔位符（含它吃掉的空白）。"""
    out, last = [], 0
    for m in re.finditer(r"\s*\d+(?:\.\d+)?\s*", text):
        out.append(re.escape(text[last:m.start()]))
        out.append(r"(?:\s*\d+(?:\.\d+)?\s*|\s*\{\{[a-z]+\d*!?\}\}\s*)")
        last = m.end()
    out.append(re.escape(text[last:]))
    return re.compile("".join(out))


def is_composed(have: str, want: str) -> bool:
    return have == want or _as_pattern(want).fullmatch(have) is not None


def main() -> int:
    check = "--check" in sys.argv
    todo, skipped, done = [], [], 0
    for rp in sorted(RECIPES.glob("*.upload-recipe.json")):
        recipe = json.loads(rp.read_text(encoding="utf-8"))
        pid = recipe["effectiveHero"]["passiveAbility"]
        slot = next(s for s in recipe["slots"] if s.get("slot") == "PASSIVE")
        path = OUT_AB / f"{pid}.json"
        raw = path.read_text(encoding="utf-8")
        doc = json.loads(raw)
        want = composed(slot, doc.get("passive"))
        have = doc.get("description") or ""
        if want is None:
            if any(r.get("hooks") for r in (doc.get("passive") or {}).get("ranks") or []):
                skipped.append(pid)
            continue
        if is_composed(have, want):
            done += 1
            continue
        if have != slot["ownerDescription"]:
            raise SystemExit(f"⛔ {pid}：卡面既不是 ownerDescription、也不是組好的三行 —— 可能有獨立內容，停下來看")
        todo.append((path, raw, have, want, pid))

    if skipped:
        print(f"ℹ️ 有 runtime 但與 recipe currentBehavior 對不上、⛔ 未上卡 {len(skipped)} 份：{', '.join(skipped)}")
    if check:
        if todo:
            print(f"⛔ {len(todo)} 份社群天生技卡面還只有「目標設計」：{', '.join(t[4] for t in todo)}\n"
                  "   ⇒ python3 tools/ship-81/passive_card.py && pnpm prose:build", file=sys.stderr)
            return 1
        print(f"passive-card OK：已組好 {done} 份")
        return 0
    for path, raw, have, want, _ in todo:
        old = json.dumps(have, ensure_ascii=False)
        if raw.count(old) != 1:
            raise SystemExit(f"⛔ {path.name}：description 字串在檔案裡出現 {raw.count(old)} 次 —— ⛔ 不盲改")
        path.write_text(raw.replace(old, json.dumps(want, ensure_ascii=False), 1), encoding="utf-8")
    print(f"寫入 {len(todo)} 份 · 原本就組好 {done} 份")
    return 0


if __name__ == "__main__":
    sys.exit(main())
