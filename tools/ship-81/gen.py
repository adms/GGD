#!/usr/bin/env python3
"""⭐ 81 名新英雄 → `content/champions` ＋ `content/abilities` ＋ 圖示（GH#1165）。

> owner 2026-09-10（逐字）：「⋯**已經取得審查授權可以直接上架，被認定為預設官方角色**⋯
>  **全角色模型盤點.md 會持續更新模型預設對應表，請你也配合改變上架設定**」

⭐ 三張表 join，⛔ 一個模板（第零守則⑨：N 個同型 ＝ K 個模板 ＋ 一張表）：

  ① 英雄資料  `materials/community-hero-forge/recipes/*.upload-recipe.json` 的 `effectiveHero`
              ＋（第二批）PR #1144 的 `compiled/b2-*.json` 的 `champion`
  ② 圖示      `docs/_reports/community-hero-icons-20260909/{champions,abilities}/`
  ③ ⭐ 模型    ⭐ **owner 的 `全角色模型盤點.md`** —— 見 `model_map.py`（⛔ 不抄一份）

⛔⛔ **兩格佔位是這一票的全部**（2026-09-10 實測）：
  · `icon`     第一批 **37/37** 指向 `assets/icons/champions/sela.webp`（骨架的圖）
  · `modelKey` 第一批 37/37、第二批 36/37 是 `champ.sela`／`champ.thorne`

⭐ 而資產**都已經存在**：第一批的頭圖 37 張、技能圖示 222 張全部產好了，
join key（`community-review-NN-20260907`）實測 **37/37 完全命中**。
⇒ ⛔ 缺的不是資產，是**把它們填進去**。

⚠️ ⭐ **暫用的一律標記**（第一·五守則：⛔ 卡面上不可以有「說了但不會發生」的字）：
拿不到真圖／真模型的那幾名，`provenance` 帶著 `shipPlaceholders`，
⭐ 而 `--report` 逐名列出來 —— ⛔ 不靜靜給一張骨架的圖。
"""
import argparse
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from model_map import parse_inventory, catalog_titles, resolve  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
RECIPES = REPO / "materials/community-hero-forge/recipes"
ICONS = REPO / "docs/_reports/community-hero-icons-20260909"
OUT_CH = REPO / "content/champions"
OUT_AB = REPO / "content/abilities"
ICON_CH = REPO / "content/assets/icons/champions"
ICON_AB = REPO / "content/assets/icons/abilities"
OUT_MODELS = REPO / "content/models"
SKELETON_ICONS = ("sela.webp", "thorne.webp")


def load_batch1() -> list[dict]:
    """⭐ 第一批 37 —— `effectiveHero` 就是一份完整的 `champion@1`。"""
    out = []
    for f in sorted(RECIPES.glob("*.upload-recipe.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        hero = d.get("effectiveHero")
        if not hero or hero.get("schema") != "champion@1":
            continue
        out.append({"champion": hero, "slots": d.get("slots") or [], "recipe": f.name})
    return out


# ⭐ 級距欄位（值在載入時從共用表解析）—— 第〇·四守則。
# ⛔ 同一個節點同時有級距與算好的值 ⇒ schema 直接拒絕：
#    「msBonusTier 與 value 不可同時存在（第〇·四守則：value 是第二個住處）」
TIER_FIELDS = ("msBonusTier", "damageTier", "cooldownTier", "rangeTier", "manaCostTier",
               "radiusTier", "castTimeTier", "healTier", "shieldTier")


def drop_baked_values(node):
    """⭐ 遞迴：帶級距的節點把**算好的值**拿掉。

    ⚠️ ⭐ 這**不是**「讓 schema 閉嘴」—— 第〇·四守則逐字：
    「⛔ 烘進去的那一份**必然過期**」。編輯器兩個都給了，
    ⭐ 而出貨只能留級距那一份（載入時由 `resolveDamageTier()` 那一族解析）。
    ⛔ 反過來丟掉級距留值才是錯的：那會讓 owner 改一次公式而這 81 名不動。
    """
    if isinstance(node, dict):
        if any(t in node for t in TIER_FIELDS):
            node.pop("value", None)
            node.pop("flat", None)
        for v in node.values():
            drop_baked_values(v)
    elif isinstance(node, list):
        for v in node:
            drop_baked_values(v)
    return node


def ability_docs(hero: dict, slots: list[dict]) -> list[dict]:
    """⭐ 一名英雄的六份 `ability@1`。

    ⚠️ ⭐ **兩個來源，⛔ 而它們的完整度不同**（2026-09-10 實測）：
      · Q/W/E/R  `effectiveHero.abilities.*` —— ⭐ **幾乎是成品**（19 個欄位），
                 ⛔ 只缺 `schema` 那一行
      · EX/被動  `effectiveHero` 只給**字串 id** ⇒ ⭐ 文件要從 `slots[].effectiveRuntime` 組

    ⛔ 我第一版猜了一個叫 `effectiveAbilities` 的鍵 —— ⭐ **它不存在**，
    而 dry-run 沒抓到，因為它靜靜地回一個空陣列 ⇒ 寫出 0 份技能檔，
    ⭐ 而 `content:build` 的 `DanglingRefError` 是**第一個說出真相的東西**。
    ⇒ ⭐ 所以這一支結尾**斷言六份都在**，⛔ 不讓「少寫了」再一次靜靜通過。
    """
    by_slot = {s.get("slot"): s for s in slots}
    docs: list[dict] = []
    for key in ("Q", "W", "E", "R"):
        a = (hero.get("abilities") or {}).get(key)
        if not a:
            raise ValueError(f"⛔ {hero['id']} 缺 {key} —— effectiveHero.abilities 不完整")
        docs.append({**a, "schema": "ability@1"})
    for key, slot_name, field in (("EX", "EX", "exAbility"), ("PASSIVE", "PASSIVE", "passiveAbility")):
        ref = hero.get(field)
        slot = by_slot.get(slot_name)
        if not ref or not slot:
            raise ValueError(f"⛔ {hero['id']} 缺 {key}（ref={ref!r} slot={bool(slot)}）")
        rt = dict(slot.get("effectiveRuntime") or {})
        # ⭐ `damageAndMechanics` 是編輯器的名字；出貨 schema 叫 `effects`。
        if "damageAndMechanics" in rt:
            rt["effects"] = rt.pop("damageAndMechanics")
        doc = {
            "id": ref, "schema": "ability@1",
            "name": slot.get("name") or ref,
            "description": slot.get("ownerDescription") or "",
            "slot": "EX" if key == "EX" else "PASSIVE",
            "provenance": "editor-json",
            **rt,
        }
        # ⭐ 編輯器對「沒有被動段」給的是**空陣列** `[]`，⛔ 而 schema 要物件或**不存在**。
        # ⇒ 空的就**拿掉那一格**（⛔ 不是塞一個空物件 —— 那會變成一個什麼都不做的宣稱，
        #   ＝第一·五守則「卡片上不可以有說了但不會發生的字」）。
        if isinstance(doc.get("passive"), list) and not doc["passive"]:
            doc.pop("passive")
        for k in ("marks",):
            if isinstance(doc.get(k), list) and not doc[k]:
                doc.pop(k)
        if key == "PASSIVE":
            # ⭐ 出貨的被動有兩格是**必填**（照 `godie-nsjs.passive.json` 那個範本）：
            #   · `innateKind` —— schema 逐字：slot "PASSIVE" requires innateKind
            #   · `passive.name` —— ⛔ 少了它 schema 回 `passive: Expected object`
            doc["innateKind"] = "passive"
            pas = dict(doc.get("passive") or {})
            pas.setdefault("name", doc["name"])
            ranks = pas.get("ranks") or []
            if not ranks:
                # ⭐⭐ **`requiredRefinement` 的那幾名** —— owner 2026-09-08 點名
                # 「37 名交接**保留** `requiredRefinement`」為不可以動的兩件之一。
                #
                # ⛔ 他們的被動**真的還沒有 runtime**（`effectiveRuntime.passive: []`，
                # `semanticStatus: adaptation-requires-review`）。⭐ 而 schema 要至少一個 rank。
                #
                # ⇒ ⛔ **三條路裡兩條是錯的**：
                #   · 編一段效果填進去 ⇒ ⛔ 捏造機制
                #   · 把 `passiveAbility` 從英雄身上拿掉 ⇒ ⛔ 卡面上那段文字連著消失
                #   ⭐ 對的那一條：**一個沒有效果的 rank ＋ 卡面說出它還沒實作** ——
                #     第一·五守則：⛔ 卡片上不可以有「說了但不會發生」的字。
                ranks = [{"modifiers": [], "hooks": []}]
                doc["description"] = (
                    (doc.get("description") or "").rstrip()
                    + "\n\n【尚未實作】這個被動的效果還在調整中，目前**不會發生任何事**。"
                )
                # ⛔ 不發明 enum 值 —— `provenance` 只收 'owner-spec' | 'editor-json'。
                #   ⭐ 那個狀態放在**描述**裡（玩家看得到的地方），⛔ 不是一個 schema 不認得的字。
            pas["ranks"] = ranks
            doc["passive"] = pas
        docs.append(doc)
    for d in docs:
        drop_baked_values(d)
    if len(docs) != 6:
        raise ValueError(f"⛔ {hero['id']} 只組出 {len(docs)} 份技能 —— 六格要齊")
    return docs


def copy_model_docs(catalog_path: Path, needed: set[str]) -> list[str]:
    """⭐ 把用到的 `model@1` 文件從素材庫搬進 `content/models/`。

    ⭐ owner 2026-09-10：「隨著 **git & S3 備份**可一起被打包遷移」
    ⇒ ⭐ **文件（`model@1`）進 git**，⛔ 而 **GLB 的位元組進 S3**（第一·四守則的逐類表：
      「一個位元組如果只能靠雜湊驗、不能靠 diff 讀，它就不屬於 git」）。
    ⇒ 這一支只搬**文件**；⛔ `.glb` 一個位元組都不碰。
    """
    root = catalog_path.parent
    cat = json.loads(catalog_path.read_text(encoding="utf-8"))
    OUT_MODELS.mkdir(parents=True, exist_ok=True)
    copied: list[str] = []
    for e in cat["entries"]:
        if e.get("kind") != "model-body":
            continue
        d = root / e["path"] / "content" / "models"
        if not d.is_dir():
            continue
        for f in d.glob("*.json"):
            key = f.stem
            if key not in needed:
                continue
            doc = json.loads(f.read_text(encoding="utf-8"))
            # ⚠️ ⭐ `glbPath` 指到 `assets/models/community/<sha>.glb` —— ⛔ 那個位元組**不進 git**。
            #   ⭐ 它由 S3 供（內容定址），而 manifest 帶著 SHA-256（`content/assets-offdisk.json`）。
            OUT_MODELS.joinpath(f.name).write_text(
                json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            copied.append(key)
    return copied


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--inventory", type=Path, required=True, help="全角色模型盤點.md")
    ap.add_argument("--catalog", type=Path, required=True, help="素材庫 catalog.json")
    ap.add_argument("--report", type=Path, help="逐名報告（⭐ 暫用的都列出來）")
    ap.add_argument("--write", action="store_true", help="⛔ 不給就是 dry-run")
    args = ap.parse_args()

    inv = {r["heroId"]: r for r in parse_inventory(args.inventory)}
    titles = catalog_titles(args.catalog)
    heroes = load_batch1()
    if not heroes:
        raise SystemExit("⛔ 一份英雄資料都沒讀到 —— 母體塌了（⛔ 0 份「處理過」讀起來跟全過一樣）")

    rows = []
    for h in heroes:
        c = dict(h["champion"])
        hid = c["id"]
        row = inv.get(hid)
        placeholders = []
        # ── ③ 模型 ────────────────────────────────────────────────
        if row:
            m = resolve(row, titles, c.get("role") or "fighter")
            c["modelKey"] = m["modelKey"]
            if m["state"] != "real" and m["state"] != "real-late":
                placeholders.append({"field": "modelKey", "state": m["state"], "why": m["why"]})
        else:
            m = {"state": "not-in-inventory", "why": "⛔ 盤點表裡找不到這一名"}
            placeholders.append({"field": "modelKey", "state": m["state"], "why": m["why"]})
        # ── ② 圖示 ────────────────────────────────────────────────
        src = ICONS / "champions" / f"{hid}.webp"
        if src.is_file():
            c["icon"] = f"assets/icons/champions/{hid}.webp"
        else:
            placeholders.append({"field": "icon", "state": "no-generated-icon",
                                 "why": f"⛔ 沒有產好的頭圖（找過 {src.relative_to(REPO)}）—— 暫用骨架的圖"})
        drop_baked_values(c)
        rows.append({"id": hid, "name": c.get("name"), "modelKey": c.get("modelKey"),
                     "icon": c.get("icon"), "modelState": m["state"], "why": m["why"],
                     "placeholders": placeholders, "doc": c, "abilities": ability_docs(c, h["slots"])})

    if args.write:
        needed = {r["doc"].get("modelKey") for r in rows if str(r["doc"].get("modelKey", "")).startswith("community.body.")}
        copied = copy_model_docs(args.catalog, needed)
        missing_models = sorted(needed - set(copied))
        if missing_models:
            print(f"⚠️ ⛔ 這 {len(missing_models)} 顆模型文件在素材庫裡找不到：{missing_models[:3]}", file=sys.stderr)
        ICON_CH.mkdir(parents=True, exist_ok=True)
        ICON_AB.mkdir(parents=True, exist_ok=True)
        for r in rows:
            src = ICONS / "champions" / f"{r['id']}.webp"
            if src.is_file():
                shutil.copyfile(src, ICON_CH / f"{r['id']}.webp")
                sc = src.with_suffix(".webp.method")
                if sc.is_file():
                    shutil.copyfile(sc, ICON_CH / f"{r['id']}.webp.method")
            for ab in ICONS.glob(f"abilities/{r['id']}.*.webp"):
                shutil.copyfile(ab, ICON_AB / ab.name)
                if ab.with_suffix(".webp.method").is_file():
                    shutil.copyfile(ab.with_suffix(".webp.method"), ICON_AB / (ab.name + ".method"))
            OUT_CH.mkdir(parents=True, exist_ok=True)
            (OUT_CH / f"{r['id']}.json").write_text(
                json.dumps(r["doc"], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            OUT_AB.mkdir(parents=True, exist_ok=True)
            for a in r["abilities"]:
                (OUT_AB / f"{a['id']}.json").write_text(
                    json.dumps(a, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    n_ph = sum(1 for r in rows if r["placeholders"])
    summary = {
        "schema": "ggd-ship81-report@1", "heroes": len(rows),
        "withRealModel": sum(1 for r in rows if r["modelState"] in ("real", "real-late")),
        "skeletonByDesign": sum(1 for r in rows if r["modelState"] == "skeleton-by-design"),
        "pending": sum(1 for r in rows if r["modelState"].startswith("pending")),
        "inventoryStale": [r["name"] for r in rows if r["modelState"] == "real-late"],
        "withPlaceholders": n_ph,
        "rows": [{k: r[k] for k in ("id", "name", "modelKey", "icon", "modelState", "why", "placeholders")} for r in rows],
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: summary[k] for k in
                      ("heroes", "withRealModel", "skeletonByDesign", "pending", "inventoryStale", "withPlaceholders")},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
