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
from model_map import parse_inventory, catalog_titles, resolve, stale_blockers  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
RECIPES = REPO / "materials/community-hero-forge/recipes"
ICONS = REPO / "docs/_reports/community-hero-icons-20260909"
OUT_CH = REPO / "content/champions"
OUT_AB = REPO / "content/abilities"
ICON_CH = REPO / "content/assets/icons/champions"
ICON_AB = REPO / "content/assets/icons/abilities"
OUT_MODELS = REPO / "content/models"
OUT_TPL = REPO / "content/ability-templates"
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


def load_batch2(root: Path) -> list[dict]:
    """
    ⭐ 第二批 37 —— 來源形狀**不一樣**，⛔ 而下游一模一樣。

    第一批的 `*.upload-recipe.json` 要**組裝**（`effectiveHero` ＋ 六格 `slots`）；
    第二批的 ZIP 裡是**已經編譯好**的 `champion@1` ＋ 六份 `ability@1`
    （而且比第一批更完整：`effects` / `vfxKey` / `vfxLayers` / `provenance` 都在）。

    ⇒ ⭐ 所以這裡只做「讀進來」，⛔ 不是第二支產生器：
      模型對應、級距清洗、圖示、報告、寫檔**全部共用**下面那一段
      （第〇·五守則：⛔ 看到「為這一批寫一份自己的流程」就是越線）。

    ⚠️ ⭐ 變身態（`b2-maple-alt-…`）**自己沒有六格技能** —— 它靠
    `transform.counterpartId` 與本體配對。⇒ 六格斷言只對**本體**成立。
    """
    out = []
    for d in sorted(root.iterdir()):
        chdir, abdir = d / "compiled/champions", d / "compiled/abilities"
        if not chdir.is_dir():
            continue
        abilities = [json.loads(f.read_text(encoding="utf-8")) for f in sorted(abdir.glob("*.json"))]
        for f in sorted(chdir.glob("*.json")):
            hero = json.loads(f.read_text(encoding="utf-8"))
            if hero.get("schema") != "champion@1":
                continue
            alt = (hero.get("transform") or {}).get("role") == "alternate"
            mine = [a for a in abilities if str(a.get("id", "")).startswith(hero["id"] + ".")]
            if not alt and len(mine) != 6:
                raise ValueError(f"⛔ {hero['id']} 只有 {len(mine)} 份技能 —— 本體六格要齊")
            out.append({"champion": hero, "slots": [], "abilities": mine, "recipe": f"{d.name}/{f.name}"})
    return out


# ⭐ 級距欄位（值在載入時從共用表解析）—— 第〇·四守則。
# ⛔ 同一個節點同時有級距與算好的值 ⇒ schema 直接拒絕：
#    「msBonusTier 與 value 不可同時存在（第〇·四守則：value 是第二個住處）」
UNEXPRESSIBLE: list[dict] = []


def shipped_status_mechanics() -> dict:
    """
    ⭐ 每個 `statusId` 在**出貨內容**裡實際帶的機制欄位（取眾數）。

    ⛔⛔ 2026-09-10 抓到（GH#1165）：`b2-yogiri.q` 的 `applyStatus` **只有名字**
    （`{kind, statusId:"curse", applyTo, duration}`）⇒ ⭐ 狀態列會畫圖示、HUD 會倒數，
    而 `sim/effects/applyStatus.ts` 讀的那幾格一個都沒填 ⇒ **對方完全自由**。
    ⚠️ 那比「沒有效果」更糟 —— 玩家看到圖示就當對方被控住 ⇒ 它**主動誤導決策**。

    ⭐ 而補什麼值**不是我發明的**：出貨的 `godie-*` 裡每一次 `curse` 都是
    `missChance: 0.5`（2/2），⭐ 連第二批自己的 `b2-kisaragi.r` 也是 0.5。
    ⇒ ⭐ 這裡**從出貨內容推導**那張表，⛔ 不寫死任何數字
    （表一改，下一次產生就跟著改 —— 第〇·四守則）。
    """
    import collections
    by = collections.defaultdict(collections.Counter)
    SKIP = {"kind", "statusId", "applyTo", "duration", "stacks", "onExisting", "stackKey"}
    for f in (REPO / "content/abilities").glob("godie-*.json"):
        def walk(o):
            if isinstance(o, dict):
                if o.get("kind") == "applyStatus" and o.get("statusId"):
                    extra = {k: v for k, v in o.items() if k not in SKIP}
                    if extra:
                        by[o["statusId"]][json.dumps(extra, sort_keys=True, ensure_ascii=False)] += 1
                for v in o.values():
                    walk(v)
            elif isinstance(o, list):
                for v in o:
                    walk(v)
        walk(json.loads(f.read_text(encoding="utf-8")))
    return {sid: json.loads(c.most_common(1)[0][0]) for sid, c in by.items() if c}


def backfill_status_mechanics(node, table: dict) -> None:
    """⭐ 只補**完全沒有機制**的那一種，⛔ 不覆蓋作者已經填的任何一格。"""
    SKIP = {"kind", "statusId", "applyTo", "duration", "stacks", "onExisting", "stackKey"}
    if isinstance(node, dict):
        if node.get("kind") == "applyStatus":
            sid = node.get("statusId")
            if sid and not any(k not in SKIP for k in node) and sid in table:
                node.update(table[sid])
        for v in node.values():
            backfill_status_mechanics(v, table)
    elif isinstance(node, list):
        for v in node:
            backfill_status_mechanics(v, table)


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
            # ⭐⭐ `perRank` 也是**算好的值** —— ⛔ 我第一版漏了它。
            #
            # ⛔⛔ 2026-09-10 抓到（GH#1165）：`skillnorm:build` 逐字說
            #   「級別『小』＝ 625，**原始值卻是 750**」—— ⭐ 那個 750 就是
            #   `perRank[3]`，而級距表裡 **750 不是任何一級**（250/625/1250/1875/2500）。
            #   ⇒ ⭐ 兩份數字對同一個節點**說兩句話**，而閘只能報一句。
            #
            # ⭐ 而母體給了答案，⛔ 不是我的判斷：出貨的 `godie-*` 裡帶
            #   `damageTier` 的節點有 **212 個，而同時帶 `perRank` 的是 0 個**。
            #   ⇒ ⭐ 出貨慣例就是**級距獨佔**。
            node.pop("perRank", None)
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
    # ── ⭐ 圖示：**六格一起接**，⛔ 不是在 Q/W/E/R 那條路上順手接 ────────────
    #
    # ⛔⛔ 2026-09-10 抓到的（GH#1165）：EX 與 PASSIVE 走的是**另一條**組裝路徑
    #   （從 `slots[].effectiveRuntime` 來，⛔ 不是 `effectiveHero.abilities.*`）
    #   ⇒ 圖示只接在前一條路上 ⇒ ⭐ **222 個圖檔全部產好了，而 74 格沒有人指向它們**
    #     （37 名 × EX/PASSIVE 兩格）。
    #
    # ⚠️ ⭐ 玩家的症狀是**技能欄兩格空白**，⛔ 而檔案在、`content:build` 綠、
    #   測試綠 —— 失敗形態②（做了、出貨了，⛔ 而玩家拿不到）。
    #
    # ⇒ ⭐ 接線放在**六格都會經過**的這一段（第〇·五守則：⛔ 不要為某一格寫一個 if）。
    # ── ⭐ 特效：把 recipe 的 `slots[].vfx` 接上去 ────────────────────────
    #
    # ⛔⛔ 2026-09-10 抓到（GH#1165）：第一批 **222 支技能一個 `vfxKey` 都沒有**,
    #   ⭐ 而 recipe 裡 **222/222 都有 `resolvedVfxId`**（60 個不同的 id,
    #   ⭐ 而且 `content/vfx/` 裡**一個都不缺**）—— 是這支產生器把它整段丟掉了。
    #   ⚠️ 而 owner 的目標逐字列了「**特效**」⇒ 失敗形態②（做了、出貨了,玩家看不到）。
    #
    # ⚠️⚠️ ⭐ **錨點只翻得過去一半** —— recipe 的 anchor 有三種,
    #   而出貨的 `attachTo` 只有 `caster | point`：
    #
    #     self(75)   → caster   ⭐ 翻得過去
    #     point(33)  → point    ⭐ 翻得過去
    #     target(114)→ ⛔ **沒有這個錨點**（省略 ⇒ 預設 caster）
    #
    # ⭐ 這與 CLAUDE.md 記過的 GH#565 是**同一個引擎缺口**（「316 次呼叫裡
    #   施法者 124 : 受擊者 124 —— 出貨機制正好覆蓋一半」）。
    # ⇒ ⭐ 選擇：**特效照播**（⛔ 零特效更糟）,⭐ 而「錨點翻不過去」逐支**記進報告**,
    #   ⛔ 不是假裝它掛在受擊者身上。報告欄 `vfxAnchorUnexpressible`。
    ANCHOR = {"self": "caster", "point": "point"}
    for d in docs:
        v = (by_slot.get(str(d.get("slot", "")).upper()) or {}).get("vfx") or {}
        vid = v.get("resolvedVfxId")
        if vid:
            d["vfxKey"] = vid
            layer = {"vfxKey": vid}
            at = ANCHOR.get(v.get("anchor"))
            if at:
                layer["attachTo"] = at
            else:
                UNEXPRESSIBLE.append({"ability": d["id"], "anchor": v.get("anchor")})
            d["vfxLayers"] = [layer]
    for d in docs:
        src = ICONS / "abilities" / f"{d['id']}.webp"
        if src.is_file() or (ICON_AB / f"{d['id']}.webp").is_file():
            d["icon"] = f"assets/icons/abilities/{d['id']}.webp"
    if len(docs) != 6:
        raise ValueError(f"⛔ {hero['id']} 只組出 {len(docs)} 份技能 —— 六格要齊")
    return docs


def copy_ability_templates(src_root: Path, needed: set[str]) -> list[str]:
    """
    ⭐ 把技能**真的引用到**的 `ability-template@1` 搬進 `content/ability-templates/`。

    ⛔⛔ 2026-09-10 抓到（GH#1165）：第二批 **222 支技能的模板展開全部失敗**,
    而載入器**fail-open**（逐字：「已個別降級（其餘內容照常註冊）」）
    ⇒ ⭐ 內容照樣註冊、`content:build` **exit 0**、選人畫面看得到那些英雄 ——
    ⛔ 而技能的模板參數一個都沒有套用。⇒ 這正是本文件記過的
    「fail-open 沒錯，**靜默**才是缺陷」。

    ⭐ 只搬**被引用的**（⛔ 不是把 20 份全倒進去）——
    一份沒有人引用的模板就是下一個孤兒（第一·五守則的鄰居）。
    """
    OUT_TPL.mkdir(parents=True, exist_ok=True)
    seen, copied = {}, []
    for f in src_root.rglob("*.json"):
        if f.parent.name != "ability-templates" or f.stem not in needed:
            continue
        seen.setdefault(f.stem, f)
    for tid, f in sorted(seen.items()):
        shutil.copyfile(f, OUT_TPL / f"{tid}.json")
        copied.append(tid)
    return copied


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
    ap.add_argument("--batch2-dir", type=Path,
                    help="第二批的 staging 根目錄（每名一個 compiled/{champions,abilities}）")
    ap.add_argument("--write", action="store_true", help="⛔ 不給就是 dry-run")
    args = ap.parse_args()

    STATUS_MECH_LOCAL = shipped_status_mechanics()
    globals()["STATUS_MECH"] = STATUS_MECH_LOCAL
    inv = {r["heroId"]: r for r in parse_inventory(args.inventory)}
    # ⭐ 出貨的通道上限**從 config 讀**，⛔ 不抄字面值（第〇·四守則：值只有一個住處）。
    lod = json.loads((REPO / "content/config/model-lod.json").read_text(encoding="utf-8"))
    stale = stale_blockers(args.inventory, int(lod["championChannelLimit"]))
    for b in stale:
        print(f"⚠️ 盤點表這一列的理由過期了：{b['row']} —— {b['why']}", file=sys.stderr)
    titles = catalog_titles(args.catalog)
    heroes = load_batch2(args.batch2_dir) if args.batch2_dir else load_batch1()
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
        # ⭐ 兩個住處都認：`ICONS`（第一批那次的產出）與**已經出貨的那一份**
        #   （`content/assets/icons/`，icon-gen 的 local batch 直接寫在那裡）。
        # ⚠️ ⭐ 這是為了讓**誰先跑都一樣**：⛔ 沒有這一段，先跑 icon-gen 再跑這一支
        #   就會把剛畫好的圖示清掉（兩個寫入端搶同一格 —— 第〇·四守則）。
        src = ICONS / "champions" / f"{hid}.webp"
        if src.is_file() or (ICON_CH / f"{hid}.webp").is_file():
            c["icon"] = f"assets/icons/champions/{hid}.webp"
        else:
            placeholders.append({"field": "icon", "state": "no-generated-icon",
                                 "why": f"⛔ 沒有產好的頭圖（找過 {src.relative_to(REPO)}）—— 暫用骨架的圖"})
        drop_baked_values(c)
        rows.append({"id": hid, "name": c.get("name"), "modelKey": c.get("modelKey"),
                     "icon": c.get("icon"), "modelState": m["state"], "why": m["why"],
                     "placeholders": placeholders, "doc": c,
                     # ⭐ 已經編譯好的就直接用（第二批），⛔ 否則從六格 slots 組（第一批）。
                     # ⚠️ ⭐ 判準是「**有沒有給**」，⛔ 不是「給的是不是空的」——
                     #   變身態**照設計**零份技能（它用本體的 `b2-maple.ex`），
                     #   ⇒ 寫 `or` 會讓它掉進組裝路徑然後死在「缺 EX」。
                     # ⚠️ ⭐ `drop_baked_values` 要在**兩條路上都跑** ——
                     #   ⛔ 我第一版只在 `ability_docs()` 裡跑,而第二批**不經過它**
                     #   ⇒ 116 個節點同時留著級距與 `perRank`,`skillnorm` 當場紅。
                     "abilities": [drop_baked_values(backfill_status_mechanics(a, STATUS_MECH) or a)
                                   for a in h["abilities"]]
                                  if "abilities" in h else ability_docs(c, h["slots"])})

    if args.write:
        # ⭐ 技能引用到的模板 —— ⛔ 沒有它們,載入器會 fail-open 把每一支技能降級。
        if args.batch2_dir:
            # ⚠️ ⭐ **遞迴收集**，⛔ 不是只看 `template.cards[]`。
            #   ⛔ 我第一版只走頂層 cards ⇒ 只收到 **4** 份（實際引用 **19**）
            #   ⇒ 15 份缺席 ⇒ 82 支技能繼續 fail-open 降級,
            #   ⭐ 而 `content:build` 仍然 **exit 0** —— 一個「修好了一半」
            #   讀起來跟「修好了」一模一樣。
            def _refs(o):
                if isinstance(o, dict):
                    r = o.get("ref")
                    if isinstance(r, str) and r.startswith("hero-template."):
                        yield r
                    for v in o.values():
                        yield from _refs(v)
                elif isinstance(o, list):
                    for v in o:
                        yield from _refs(v)
            want_tpl = {t for r in rows for a in r["abilities"] for t in _refs(a)}
            tpl = copy_ability_templates(args.batch2_dir.parent, want_tpl)
            missing_tpl = sorted(want_tpl - set(tpl))
            print(f"⭐ 技能模板：引用 {len(want_tpl)} · 搬進來 {len(tpl)}"
                  + (f" · ⛔ 缺 {missing_tpl}" if missing_tpl else ""), file=sys.stderr)
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
        # ⭐ 盤點表裡「理由引用的上限已經被改掉」的那幾列 —— ⛔ 這支程式不改表，
        #   它只說得出「該重新評估了」（表是 owner 的檔）。
        "staleBlockers": stale,
        # ⭐ 錨點翻不過去的那幾支（recipe 說 target,⛔ 而引擎只有 caster|point）。
        "vfxAnchorUnexpressible": len(UNEXPRESSIBLE),
        "withPlaceholders": n_ph,
        "rows": [{k: r[k] for k in ("id", "name", "modelKey", "icon", "modelState", "why", "placeholders")} for r in rows],
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: summary[k] for k in
                      ("heroes", "withRealModel", "skeletonByDesign", "pending", "inventoryStale",
                       "staleBlockers", "vfxAnchorUnexpressible", "withPlaceholders")},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
