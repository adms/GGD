#!/usr/bin/env python3
"""🏛 英雄卡描述裡的**開發流程樣板**剝掉（GH#1258 ②）—— 一次性、欄位級、原文另存。

> owner 2026-09-10 02:49（逐字，節錄；全文 `docs/_daily/2026-09-10.md:18`
>  —— ⚠️ 2026-09-15 更正：原寫 `:19`，那是另一棵工作樹長出一列之後的行號；帳本會長，行號會漂）：
>  「⋯並且已經取得審查授權可以直接上架，被認定為預設官方角色⋯」

⇒ 卡面上仍寫「社群英雄功能驗收稿」「這是待審查稿」「外觀為驗收用替身」＝第一·五守則的形狀
（卡面上的字與事實不符）。這是 Claude 依那句裁決的推論。

⭐ 只剝**固定樣板**（逐字比對，⛔ 不是「含『實作』就擋」）：
  · community 37：開頭 `<name> 社群英雄功能驗收稿。` ＋ 結尾那一行
    `以 GGD <出身> 的三圍與正規化生成屬性⋯六槽原文⋯代理資產⋯這是待審查稿⋯`
  · lol 7：結尾 `採用既有 GGD 模型與特效，外觀為驗收用替身。`
⛔ 不動的：作品／採用／定位／視覺方向／註／查證紀錄（逐位不同，⛔ 不逐個判斷），
  以及被動技能描述裡的【尚未實作】（對玩家誠實的字，gen.py 刻意寫的）。

⚠️ 為什麼改卡而不是改上游：卡的作者是 `tools/ship-81/gen.py`／`lol7.py`（一次性匯入器，
  吃 repo 外輸入、不在 sync-io 作者表），整份重跑會蓋掉之後的模型版本與平衡欄位；
  `materials/community-hero-forge/recipes/*` 被 S3 proof 釘雜湊，⛔ 不可改。
  ⭐ 防再匯入（2026-09-15 補，GH#1258 審查）：
    · 兩支匯入器在組裝處 import 這裡的 `stripped()`（⛔ 不抄第二份）⇒ 重跑出來的卡本來就是乾淨的
    · Hero Forge 範本 `communityExamples.ts` 的「外觀為驗收用替身」**刻意不動**：在草稿裡它是真話，
      而 `communityRecipe.test.ts` 釘著草稿原文；剝在「草稿 → 出貨內容」那一步（`lol7.py`）
    · 閘兩條：內容閘 `packages/shared/src/ops/championDevNotesStripped.test.ts`（全部卡）＋
      `apps/client/src/ui/platform/valhallaShippedRoster.test.ts`（英靈殿名單上印出來的字）

原文另存：`docs/legacy/_valhalla-card-dev-notes-full.md`（第一·五守則：另存，⛔ 不是壓縮取代）。

用法：
  python3 tools/valhalla-intro/strip_dev_notes.py           # 剝＋另存（冪等）
  python3 tools/valhalla-intro/strip_dev_notes.py --check   # 還有樣板 ⇒ exit 1
"""
import argparse
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CHAMPS = REPO / "content/champions"
LEGACY = REPO / "docs/legacy/_valhalla-card-dev-notes-full.md"

COMMUNITY_HEAD = "{name} 社群英雄功能驗收稿。"
COMMUNITY_TAIL = re.compile(
    r"\n以 GGD \S+ 的三圍與正規化生成屬性，使用\S+?。六槽原文與待補機制保存在各槽 purpose。"
    r"現有模型／圖示為 GGD 代理資產，未包含原作外觀。這是待審查稿，不是原設計機制已通過。$"
)
LOL_TAIL = "\n\n採用既有 GGD 模型與特效，外觀為驗收用替身。"


def stripped(doc: dict) -> str | None:
    """回傳剝完的描述；沒有樣板 ⇒ None。樣板只剝到一半 ⇒ 擲錯（⛔ 不靜靜留半句）。"""
    desc, cid = doc.get("description") or "", doc["id"]
    if cid.startswith("community-review-"):
        head = COMMUNITY_HEAD.format(name=doc["name"])
        has_head, tail = desc.startswith(head), COMMUNITY_TAIL.search(desc)
        if not has_head and not tail:
            return None
        if not (has_head and tail):
            raise SystemExit(f"⛔ {cid}：樣板只找到一半（head={has_head} tail={bool(tail)}）—— 停下來看")
        return desc[len(head):tail.start()]
    if cid.startswith("lol-") and desc.endswith(LOL_TAIL):
        return desc[: -len(LOL_TAIL)]
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    todo = []
    for path in sorted(CHAMPS.glob("*.json")):
        if path.name.startswith("_"):
            continue
        raw = path.read_text(encoding="utf-8")
        doc = json.loads(raw)
        new = stripped(doc)
        if new is not None:
            todo.append((path, raw, doc, new))
    if args.check:
        for path, *_ in todo:
            print(f"⛔ {path.relative_to(REPO)} 還有開發流程樣板")
        return 1 if todo else 0
    if not todo:
        print("✓ 沒有要剝的（冪等）")
        return 0
    if LEGACY.exists():
        raise SystemExit(f"⛔ {LEGACY.relative_to(REPO)} 已存在而卡上又長出樣板 —— ⛔ 不覆蓋另存檔，先看是誰再匯入的")
    lines = [
        "# 英靈殿稽核：44 張英雄卡被剝掉的開發流程樣板（原文全文）",
        "",
        "> 由 `tools/valhalla-intro/strip_dev_notes.py` 在剝除**之前**寫下（GH#1258 ②）。",
        "> 還原：把下面的原文貼回該卡的 `description`，或 `git revert` 那個 commit。",
        "",
    ]
    for path, raw, doc, new in todo:
        old = doc["description"]
        enc_old, enc_new = json.dumps(old, ensure_ascii=False), json.dumps(new, ensure_ascii=False)
        if raw.count(enc_old) != 1:
            raise SystemExit(f"⛔ {path.name}：原文在檔案裡不是恰好出現一次（{raw.count(enc_old)}）—— ⛔ 不盲改")
        path.write_text(raw.replace(enc_old, enc_new), encoding="utf-8")
        lines += [f"## `{doc['id']}` {doc['name']}", "", "```text", old, "```", ""]
    LEGACY.write_text("\n".join(lines), encoding="utf-8")
    print(f"✓ 剝了 {len(todo)} 張；原文另存 {LEGACY.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
