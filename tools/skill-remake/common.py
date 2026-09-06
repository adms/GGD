#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""技能重製產生器的**機制側** —— 模板、級距、閘、`build()`。

⭐ 這一份**不含任何一位英雄的資料**。90 支的表住在 `heroes/<champion-id>.py`，
   一位英雄一檔；`batch1.py` 是把它們掃進來的薄殼。

為什麼要拆（GH#467）：這三段東西原本擠在同一個 3,345 行的檔裡，於是
**任何要動到那 20 位英雄的工作都只能排隊**。拆開之後：
  · 改一位英雄的技能 → 只碰 `heroes/<那一位>.py`
  · 改一個機制（模板 / 級距 / 閘） → 只碰這一份
  · 加/減一位英雄 → 只碰 `batch1.py` 的 `HERO` 註冊表 + 一個檔案

⛔ 跨英雄共用的東西**一律住這裡**。同一段模板複製到兩份 hero 檔就是兩份會各自
   腐爛的副本（第零守則⑨：N 個同型 = K 個模板 + 一張表）—— 涅吉的 `form_buff()`
   之所以留在 `heroes/godie-emfr.py`，是因為它**只有那一位在用**；
   一旦第二位英雄要用同一個形狀，它就該搬過來。
"""
import json
import os
import re
import subprocess

# ⭐ 五級距全轉的**唯一**實作 —— 這 90 支與其餘 330 支共用它（見那一份的檔頭）。
from tierize import Grids as tierize_grids, hook_icd, tierize  # noqa: F401
# ⭐ `TIER_R` 從出貨 config 推導要用它（⛔ 不要在這裡再開第二個讀檔器）。
from tierize import _load as _tierize_load

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
AB = os.path.join(ROOT, "content", "abilities")
CH = os.path.join(ROOT, "content", "champions")
DOC = os.path.join(ROOT, "docs", "技能編輯器引擎須知 20260811.md")

# 英雄註冊表（登錄在 `batch1.py`，⛔ 不在這裡 —— 理由見 `register_heroes()`）。
HERO = {}
# ⚠️ 編號後綴**只是慣例，不是事實**。真正的槽位來自地圖本身（`OBJECTS.json`
# 的 `<hero>.hero_abilities` 排序），而出貨樹裡 660 份有編號的技能文件有 33 支
# 不照慣例擺。落在這 90 支身上的是 4 支 / 2 對：
#   20-01 風王結界 在 **W**、20-02 感知能力 在 **Q**（Saber）
#   92-02 消化液  在 **E**、92-03 狂草泥馬 在 **W**（草泥馬）
# 所以這兩張表從「答案」降級成「查不到時的退路」，答案改由 `slot_suffix()` 查。
SUFFIX = {"00": "passive", "01": "q", "02": "w", "03": "e", "04": "r", "002": "ex"}
SLOT = {"00": "PASSIVE", "01": "Q", "02": "W", "03": "E", "04": "R", "002": "EX"}
SLOT_OF_SUFFIX = {"passive": "PASSIVE", "q": "Q", "w": "W", "e": "E", "r": "R", "ex": "EX"}
_NUM_RE = re.compile(r"^(\d{2})-(\d{2,3})(?:\s|$)")
_SLOT_CACHE = {}


def _git(*args):
    return subprocess.run(["git", "-C", ROOT, *args],
                          capture_output=True, text=True, check=True).stdout


def _shipped_number_to_suffix():
    """從 **git HEAD** 的出貨 ability 文件推出「技能編號 → 槽位後綴」。

    ⛔ **不讀工作區。** 這支產生器自己會覆寫 `content/abilities/`，所以跑過一次
       壞的之後，工作區裡的槽位就是上一次的錯誤答案 —— 再讀它只會把錯誤鎖成
       不動點。git 追蹤的那一份才是出貨的那一份（同
       `shippedBundleHasTrackedSources.test.ts` 的立場：出貨的是 git，不是這台
       機器的工作區）。
    ⚠️ 只收 `HERO` 名單裡的**本體** id：變身態的身體（如 `godie-e00l`）帶著
       同一組編號，混進來會讓「編號 → 槽位」不再是函數。
    """
    out = {}
    for path in _git("ls-tree", "-r", "--name-only", "HEAD", "content/abilities/").split("\n"):
        path = path.strip()
        if not path.endswith(".json"):
            continue
        stem = os.path.basename(path)[:-5]
        if stem.startswith("_"):
            continue
        cid, _dot, suffix = stem.rpartition(".")
        if cid not in HERO.values() or suffix not in SLOT_OF_SUFFIX:
            continue
        hit = _NUM_RE.match(json.loads(_git("show", "HEAD:" + path)).get("name", ""))
        if hit:
            out[f"{hit.group(1)}-{hit.group(2)}"] = suffix
    return out


def slot_suffix(num):
    """技能編號 → 槽位後綴。**出貨文件優先**，查不到才退回後綴慣例。

    ⭐ 這是**一條規則**，不是逐支補丁（CLAUDE.md 第零守則⑨）：任何一支
       「編號後綴 ≠ 實際槽位」的技能都被同一條規則涵蓋，下一批不必再列例外。
    """
    if not _SLOT_CACHE:
        shipped = _shipped_number_to_suffix()
        for hero in HERO:
            rows = [e["num"] for e in T if e["num"].split("-")[0] == hero]
            assert len(rows) == 6, f"英雄 {hero} 在表裡有 {len(rows)} 支，應該是 6"
            taken = {n: shipped[n] for n in rows if n in shipped}
            for n in rows:
                taken.setdefault(n, SUFFIX[n.split("-")[1]])
            # ⭐ 這一行是**閘**，不是判準：六支必須剛好落在六格。編號改了、
            #    名稱前綴打錯、兩支撞同一格 —— 任何一種都在這裡當場炸，
            #    而不是靜默把另一支覆寫掉（那正是 A-4 一開始沒有人發現的原因）。
            assert sorted(taken.values()) == sorted(SLOT_OF_SUFFIX), \
                f"英雄 {hero} 的槽位解析不是雙射：{taken}"
            _SLOT_CACHE.update(taken)
    return _SLOT_CACHE[num]


# ─────────────────────────────────────────────────────────────────────────────
# 【變身】/【切換】→ championForm（A-1）—— 一條規則，⛔ 不是逐支補丁
# ─────────────────────────────────────────────────────────────────────────────
# 一支技能會不會換身體，由**兩個條件的交集**決定，缺一個都會譯錯：
#
#   ① 它的**標籤列**（描述的第一行）帶 [變身] 或 [切換]
#   ② 它的英雄在 content/champions 裡真的有 `transform.role == "base"` +
#      `counterpartId`，而且那份 `transform.triggerAbility.name` 的**編號**
#      就是這一支
#
# ⛔ 少了②：15-02 / 15-03 / 15-04（godie-emfr）的標籤列逐字帶 [變身]，但那是
#    「([變身]為唯一狀態不可疊加)」的 buff 形態 —— 那位英雄**沒有第二具身體**，
#    譯成 championForm 的後果是每按必 `castRejected: no-form`（失敗形態②）。
# ⛔ 少了「只讀第一行」：79-01 / 79-03 的內文寫著「(卍解 [變身] 狀態下…)」，
#    那是**引用**不是標籤 —— 掃全文會讓一護的 Q 與 E 都變成變身技。
#
# join key 是**編號**不是名字（12-03 的名字在這一批從「破凰之心-徒手空破山」
# 改成「破凰之心。空破山」，而編號永遠是 12-03 —— 記憶 ggd-naming-layer）。
FORM_TAG_TO = {"[切換]": "toggle", "[變身]": "alternate"}

# 帶著 w3x transform 連結、但這一批的規格**刻意**沒有變身標籤的編號。
# ⛔ 這不是裝飾：留空就會 assert（見 main() 的閘），所以「某一支悄悄不再變身」
#    不可能再無聲發生 —— B-4 就是這樣被抓到的。
FORM_TAG_WAIVED = {
    # 12-03 破凰之心。空破山 —— owner 2026-08-08 的規格把它改成純被動暴擊，
    # 標籤列一個變身/切換都沒有，天地志狼 godie-e007 因此變成沒有入口的孤兒內容。
    # owner 2026-08-12 明說 B-4 這一輪**不裁決**，⛔ 不要自己補標籤、也不要改測試。
    "12-03": "B-4 owner 2026-08-12 尚未裁決（志狼退場 or 變身換綁別的槽）",
}

# 編號 → 這一支輸出的 ability id。build() 邊產邊記，main() 的閘讀它。
# ⭐ 刻意記 build() 算出來的 aid，⛔ 不要在 main() 裡自己再推一次槽位 ——
#    A-4 正在把槽位改成讀出貨文件，第二份推導就是第二個會腐爛的住處。
FORMS_EMITTED = {}


def lead_tags(desc):
    """描述的**標籤列** = 第一行。⛔ 不要掃全文，見 79-01/79-03（`heroes/godie-h01n.py`）。"""
    return desc.split("\n", 1)[0]


def form_triggers():
    """{編號: champion id} —— w3x 自己指名的變身觸發技。

    ⚠️ 讀的是 champion 文件，而產生器**只覆寫 `abilities` 那一格**、從不寫
    `transform`，所以就算工作區已經跑過一次壞的產生器，這裡讀到的仍然是
    w3x 的原始連結。"""
    out = {}
    for cid in HERO.values():
        p = os.path.join(CH, f"{cid}.json")
        if not os.path.exists(p):
            continue
        tr = json.load(open(p, encoding="utf-8")).get("transform") or {}
        if tr.get("role") != "base" or not tr.get("counterpartId"):
            continue
        name = (tr.get("triggerAbility") or {}).get("name") or ""
        num = name.split(" ", 1)[0]  # 「70-00 紮根」→「70-00」
        if num:
            out[num] = cid
    return out


#: 由 `register_heroes()` 在 `HERO` 填好**之後**才算得出來。
#: ⛔ 不可以在這裡就寫 `FORM_TRIGGERS = form_triggers()`：那一刻 HERO 還是空的，
#:    算出來會是 `{}` —— 而空的 FORM_TRIGGERS **不會報錯**，它只是讓每一支變身技
#:    靜默少掉 championForm（第二守則失敗形態②）。
FORM_TRIGGERS = {}


def register_heroes(mapping):
    """把 `batch1.py` 的 `HERO` 字面值接上機制側，並算出 `FORM_TRIGGERS`。

    ⚠️ 為什麼字面值住在 `batch1.py` 而不是這裡：**三個讀者用正則抓那個字面值** ——
       `stamp_provenance.py`、`export_xlsx.py`、以及出貨守衛
       `packages/shared/src/content/abilityProvenance.test.ts`（它抓的是
       batch1.py 裡以 `HERO = {` 開頭、以第 0 欄的 `}` 收尾的那一段）。
       搬過來 = 三個讀者同時瞎掉，而其中一個是**守衛**。
    """
    assert not HERO, (
        "HERO 已經註冊過了 —— 同一個行程裡 exec 了兩次 batch1.py，"
        "T 會疊成 180 支。載入一次就好。"
    )
    HERO.update(mapping)
    FORM_TRIGGERS.update(form_triggers())


# ── A-6：build() 產出整份文件，所以「哪些欄位歸產生器管」必須是一張**明表** ──
#
# ⛔ 這裡刻意是 denylist（黑名單）不是 allowlist。allowlist 的失敗模式是
#    「沒被想到的欄位靜默消失」，而它已經發生過：舊版只救 icon/vfxKey/hitFeel，
#    於是 sfxKey(19 份)、vfxLayers(6 份)、interruptOn(1)、recoverySec(2)
#    一起被刪掉 —— efur-r-interrupt 紅，另外 27 個欄位值**沒有任何東西叫出聲**
#    （CLAUDE.md 第二守則失敗形態②）。
#    新規則只有一句：**規格沒有重新定義的欄位，一律原樣保留。**

#: 規格重新定義的欄位 —— 由那張表 T（`heroes/` 分片填的）產生，舊值不算數。
#: ⚠️ innateKind / passive / marks 一定要在這裡：一支技能在規格裡從被動改成主動
#: （或反過來、或換槽位）時，把舊的救回來就是把重製稿改回去。
SPEC_OWNED = frozenset({
    "id", "schema", "name", "description", "slot", "castType", "maxRank",
    # ⭐ `rangeTier` 2026-08-21 補進來（GH#433）。⚠️ 在它之前這張表上有 `radiusTier`
    #    **卻沒有它的雙胞胎** —— 於是 A-6 把舊文件的 `rangeTier` 原樣救回來，
    #    `tierize()` 的 `_apply_geometry` 再照那一格把 `range` 寫回去（級別贏）。
    #    ⇒ 2026-08-21 全轉替 90 支都填上 `rangeTier` 之後，`A(...)` 的 `rng`
    #    **對這 90 支整個失效**：改 hero 檔裡的數字，重生成出來一個位元都不會動，
    #    ⛔ 而且沒有任何東西會紅（第二守則失敗形態②）。實測：79-02 從 2.0 改成
    #    4.5 重跑，`godie-h01n.w.json` 逐位元不變。
    #    ⛔ 不要改成「在 hero 檔裡順便寫 rangeTier」—— 那是把一個壞掉的接縫
    #    繞過去，下一支照樣踩。
    "cooldown", "manaCost", "range", "rangeTier", "innateKind", "radiusTier",
    # ⭐ `cooldownShape` 2026-08-24 補進來（GH#644 59-01 吞噬）。⚠️ 理由與 rangeTier
    #    同型：不進這張表的欄位會被 A-6 從舊文件救回來，而這一格是**規格**在說
    #    「查哪一張冷卻表」—— 舊值贏過規格就是 tierize 拿錯格線。
    "cooldownShape",
    "targetsEnemies", "effects", "passive", "marks", "toggle", "augment",
})

#: 規格**刻意讓它退場**的欄位 —— 舊值存在，但救回來會造成傷害。
#: ⚠️ 每一格都會進 DROP_LOG 印出來：丟掉是**決定**，不是遺漏。
RETIRED = frozenset({
    # ⛔ template：content/templates/expand.ts 的 mergeExpansion() 會先 delete
    #    effects/castType/radius/castTimeSec/targetsEnemies/innateKind/passive/
    #    marks（EXPANDED_KEYS），再用舊模板的展開結果蓋上去。救回它 =
    #    **靜默回滾 36 支重製稿**，而且描述講新的、場上打舊的（失敗形態②）。
    "template",
    # ⛔ radius：owner 2026-08-11「原則上**不寫範圍數字**」。範圍改走 radiusTier
    #    四級距，content/aoeTiers.ts 的 resolveRadiusTier() 在註冊時翻成 radius，
    #    而且**級別贏過手寫值**。救回 radius 等於逆著 owner 走。
    "radius",
    # ⛔ castTimeSec：唯一來源是 castTimeFormula.deriveCastTime()。effects 整批
    #    換過之後舊值一定是錯的，抄回來只會讓 castTimeCoverage 用**錯誤的訊息**
    #    紅。正解是後處理 `pnpm exec tsx packages/shared/scripts/deriveCastTimes.ts --write`。
    "castTimeSec",
})

#: aid → {被刻意丟掉的欄位: 舊值}。main() 收工前印出來（第二守則：靜默才是缺陷）。
DROP_LOG = {}

#: aid → `tierize()` 動過的每一格。⭐ 收工前印出來 —— 一次改 90 支的傷害／冷卻／
#: 耗魔如果**安靜地**發生，那就是第二守則失敗形態②的教科書樣本。
TIERIZE_LOG = {}
_GRIDS_CACHE = []


def _TIER_GRIDS():
    """四張出貨表讀一次就好（`Grids()` 每次都開四個檔）。"""
    if not _GRIDS_CACHE:
        _GRIDS_CACHE.append(tierize_grids())
    return _GRIDS_CACHE[0]


def amt(per=None, flat=None, ap=None, ad=None, dmg_tier=None, **kw):
    """amount 物件：perRank 陣列 / flat 常數 / ratios 加成係數。

    ⭐ `dmg_tier=` —— **第〇·四守則**的入口：填了它就**只**寫 `damageTier`，
    值在載入時由 `resolveDamageTier()` 從 `content/config/damage-tiers.json` 解析。
    ⛔ 不要同時給 `flat=`／`per=`（級距**取代**它們，兩個一起寫 = 第二個住處）。
    ⚠️ 鍵序：`damageTier` 在最前 —— 理由同 `area()` 那一段（英雄卡內嵌版是 Zod
    重建出來的，順序不同就會被 fx-19 判成 desync）。
    """
    o = {}
    if dmg_tier is not None:
        assert flat is None and per is None, (
            "amt(): `dmg_tier=` 與 `flat=`/`per=` 只能給一個 —— 級距**取代**基礎值，"
            "兩個一起寫就是同一個數字的兩個住處（CLAUDE.md 第〇·四守則）")
        o["damageTier"] = dmg_tier
    if per is not None:
        o["perRank"] = [float(x) for x in per]
    if flat is not None:
        o["flat"] = float(flat)
    # ⭐ B1-L（2026-08-12）：**係數不再被夾**。
    #
    # 這裡以前寫 `min(float(ap), 1.0)`，理由是「`abilityScaling.test.ts` 的 fx-16
    # 在守」—— 那是**倒果為因**：測試裡的 `RATIO_MAX = 1.0` 是一個抄下來的常數，
    # 不是引擎的上界。於是 owner 規格的「300% AP」「500% AP」**靜默**變成 100%，
    # 而卡片上仍然寫 300% —— 失敗形態②（算出來了但玩家拿不到），而且
    # **是產生器自己造的**。
    #
    # ⛔ 不要退回 min()。要限制係數請改 `abilityScaling.test.ts` 的 RATIO_MAX，
    #    那裡是這個決策的**單一住處**。
    r = []
    if ap is not None:
        r.append({"stat": "ap", "coeff": float(ap)})
    if ad is not None:
        r.append({"stat": "ad", "coeff": float(ad)})
    if r:
        o["ratios"] = r
    o.update(kw)
    return o


#: 純比例的酬載也算「有基礎」。⚠️ 這些鍵**不是** `amt()` 的具名參數就是它的
#: `**kw` 直通鍵，兩種都會讓這一發真的打得出傷害。
_PROPORTIONAL = ("ap", "ad", "attrRatios", "ratios")


def _split_res_pct(kw):
    """⭐ B2-D —— `resourcePct` 是 `amount` 的**兄弟鍵**，⛔ 不是它的內容。

    「造成目標**現存生命** 30/40/50% 的傷害」這一族在 90 支裡完全寫不出來，因為
    三個傷害 helper 只轉發 per/flat/ap/ad，而多出來的 kwarg 會被 `amt()` 的
    `o.update(kw)` 倒進 **amount 物件內部** —— 那裡是 `zScaling` 且 `.strict()`，
    整份文件當場被拒收（＝ 2026-08-02 退回骨架事故的形狀）。

    ⛔ **不要開 `hp_pct=`**：`hpPct` 只長在 `damage`（effect.ts:1328），
    `damageArea` / `damageLine` **沒有這一格**，而這一族的受害者多半是後兩者。
    `resourcePct{subject:"target", resource:"health", basis:"current"}` 語意完全
    涵蓋它，而且四個 kind（damage / damageArea / damageLine / dot）同名同語意、
    共用同一份 schema 與同一個讀取器（`dynamicTerms.ts::resourcePctAmount`）。

    ⚠️ 上界由 `scale` 決定（`RESOURCE_PCT_RATIO_MAX` / `_POINTS_MAX`），
    superRefine 會擋 —— 那是**打錯數字**的守衛，⛔ 不要為了塞一個大倍率去改它。
    """
    t = kw.pop("res_pct", None)
    if t is None:
        return None
    assert isinstance(t, dict) and "perRank" in t, (
        "res_pct= 要給完整的 resourcePct 物件："
        '{"subject":"self|target","resource":"health|mana","basis":"current|max|missing",'
        '"perRank":[…]}（"scale" 選填）'
    )
    return t


def _split_inc_pct(kw):
    """⭐ B3-A（反彈）—— `incomingPct` 是 `amount` 的**兄弟鍵**，⛔ 不是它的內容。

    「反彈剛剛打中我的那一發的 N%」在此之前 90 支寫不出來（引擎 0 採用），因為三個
    傷害 helper 只轉發 per/flat/ap/ad，多出來的 kwarg 會被 `amt()` 的 `o.update(kw)`
    倒進 **amount 物件內部** —— 那裡是 `zScaling` 且 `.strict()`，整份文件當場被拒收
    （＝ 2026-08-02 退回骨架事故的形狀）。

    ⛔ 不要開在 `area()` / `line()`：`incomingPct` 只長在 `damage`（effect.ts:1385），
       而反彈本來就是單發。
    ⚠️ 呼叫點一律帶 `flat=0`（逐字抄出貨的反射之盾 godie-i03m），⛔ 不要為了
       「純反彈沒有基礎」去放寬 `_require_base` —— 那會同時放掉 29 顆惰性節點的守衛。
    """
    t = kw.pop("inc_pct", None)
    if t is None:
        return None
    # ⭐ owner 2026-08-13 逐字：「**預設都是 100%反彈 免受傷**」。
    #    ⇒ 兩格都在這裡給預設，⛔ 不是逐支填（第零守則⑨：規則不是補丁）。
    #    · `negateOriginal` 省略 ⇒ 被打的人**照樣掉血**，只是把傷害也打回去 ——
    #      那不是「反彈」是「反擊」。owner 2026-08-09 就說過「反彈預設都是免傷」，
    #      但那是**設計**預設，引擎預設是 false ⇒ 90 支裡 5 支靜默走了錯的那一邊。
    #    · `perRank` 省略 ⇒ 100%（規格只寫「[反彈]」沒寫比例時的答案）。
    #    ⚠️ 逐支仍然可以明寫覆蓋（20-04 的 3/5/7 倍、20-002 的 7 倍就是）。
    if isinstance(t, dict):
        t = {"perRank": [1.0], **t} if "perRank" not in t else dict(t)
        t.setdefault("negateOriginal", True)
    assert isinstance(t, dict) and "perRank" in t, (
        'inc_pct= 要給完整的 incomingPct 物件：{"perRank":[…]}'
        '（basis / maxChainDepth / applyGlobalDamageMult / whenTooLate / negateOriginal 選填）')
    return t


def _require_base(kw, where):
    """⭐ B1-E（2026-08-12）：缺基礎值就**喊出來**，⛔ 不再偷塞 `flat=50`。

    這三個 helper 以前都有一句 `if "per" not in kw and "flat" not in kw:
    kw["flat"] = 50`。動機是對的（惰性傷害＝面板有數字、場上打 0，fx-15/fx-19
    在守），**做法是錯的**：它把「規格沒給基礎值」這件事**變成一個看起來正常的
    50 點傷害**，於是玩家看到一個卡片解釋不了的數字，而稽核看到的是「有填」。

    出貨後果量到的規模：29 顆 `flat==50 且無 perRank` 的節點 / 17 份文件，
    而全表**手寫** `flat=50` 的呼叫點只有一個（:575，59-02 是真的 50）。

    ⛔ 純比例（只有 ap/ad/attrRatios）**不算惰性** —— 它有基礎，基礎是施法者的
       屬性。`abilityScaling.test.ts` 的 `baseOf` 同步放寬（B1-E 的另一半）。
    """
    if "per" in kw or "flat" in kw or "dmg_tier" in kw:
        return
    if any(k in kw for k in _PROPORTIONAL):
        return
    raise AssertionError(
        f"{where}: 這一發沒有任何基礎值（perRank / flat / ap / ad / attrRatios 全缺）"
        f" —— 它在面板上有數字、場上打 0。⛔ 不要靠 helper 補 50，"
        f"回表格把規格的數值填進去。kwargs={sorted(kw)}"
    )


def dmg(dtype="magic", **kw):
    rp = _split_res_pct(kw)
    ip = _split_inc_pct(kw)
    _require_base(kw, "dmg()")
    o = {"kind": "damage", "damageType": dtype, "amount": amt(**kw)}
    if rp:
        o["resourcePct"] = rp
    if ip:
        o["incomingPct"] = ip
    return o


# 五級距的出貨半徑。⚠️ 這裡填 `radius` 只是為了滿足型別（`damageArea.radius` /
# `shape:"circle"` 的 radius 必填）；**真正生效的是 `radiusTier`** ——
# 註冊時由 `config.aoe-tiers@1` 覆蓋回來（`resolveRadiusTier`，級別贏）。
#
# ⭐ 2026-08-21：從**出貨 config 讀**，⛔ 不再是一行字面值。
#    在這之前它是 `{"極小":3.0,…,"大":8.0}` 五個手打數字 —— 也就是
#    `content/config/aoe-tiers.json` 的**第四個住處**，而它旁邊的註解自己承認
#    「少一格『極大』是刻意的：出貨沒有一支 area() 用到它」。那句話在 59-01 吞噬
#    改成被動圓的那一刻就過期了（第三守則：註解會說謊）。
#    ⇒ 現在它**不可能**過期，也 ⛔ 不可能少一格：aoe-tiers 加一級就自動有。
TIER_R = {k: float(v) for k, v in _tierize_load("aoe-tiers")["radius"].items()}

# 五級距的出貨**施法距離**（`A(...)` 的 `rng` 位置參數）。⭐ 與 `TIER_R` 同一個做法：
# ⛔ 不在這裡寫 `4.5`，那會是 `content/config/range-tiers.json` 的第四個住處。
#
# ⚠️ 為什麼需要它：`A(...)` 收的是一個**自由數字**，`tierize()` 再把它收到最近一格。
# 那條路對「從 w3a 換算來的數字」是對的，但 owner **逐支裁決了一個級別**的時候
# （GH#433 的 9 支）它就反了 —— 寫 2.0 會被收成「極小」，而裁決是「小」。
# ⇒ 那幾支在 hero 檔裡寫 `TIER_RANGE["小"]`，級別本身才是來源。
TIER_RANGE = {k: float(v) for k, v in _tierize_load("range-tiers")["range"].items()}


def area(dtype="magic", tier="小", maxt=None, onhit=None, **kw):
    """⭐ B1-I（2026-08-12）：`maxt` 的預設從 **6** 改成 **None**（＝不輸出）。

    以前的預設值 6 是**寫死在簽章裡的決策**，而 28 個 `area()` 呼叫點**沒有一個**
    明填過它（`maxt=` 在全表 grep 命中 0 次）—— 所以那個 6 不是任何人的選擇，
    它是一個 helper 的預設值悄悄變成了 28 支技能的人數上限。
    引擎的預設是 20（`spreadLimits.ts:70`），⇒ 上限被砍到 30%。

    90 支規格裡**沒有任何一支寫過人數上限**，所以 None 是誠實的答案：
    省略 `maxTargets` ⇒ 由後台的 `spreadLimits` 決定（第一守則：可調）。
    """
    rp = _split_res_pct(kw)
    _require_base(kw, f"area(tier={tier!r})")
    # ⚠️ 鍵的**順序**要跟 Zod schema 的宣告順序一致（radius 在 radiusTier 之前）。
    #    理由不是潔癖：`zChampionDoc.parse()` 會照 schema 順序重建物件，而
    #    `abilityScaling.test.ts` 的 fx-19 用 `JSON.stringify(standalone.effects)
    #    !== JSON.stringify(ab.effects)` 比對「獨立檔」與「英雄卡內嵌版」——
    #    獨立檔是生檔、內嵌版是 parse 過的，所以**只要順序不同就判定 desync**，
    #    即使兩份內容一模一樣。實測這一格自己就製造 23 筆假 desync。
    o = {"kind": "damageArea", "damageType": dtype, "amount": amt(**kw),
         "radius": TIER_R[tier], "radiusTier": tier}
    if maxt is not None:
        o["maxTargets"] = maxt
    # ⭐ B3-C1 —— onHitTargets 收到的是**這個圓真的打到的那群人**
    #    （victimFilter.ts:63 runOnHitChain），「打中的人裡帶 X 狀態的再追加 Y」
    #    的條件要寫在巢狀那顆效果自己的 `condition` 上。
    # ⛔ 不要拿 victimCondition 做「加成」：那一格過濾的是誰吃**基礎**傷害。
    if onhit:
        o["onHitTargets"] = list(onhit)
    if rp:
        o["resourcePct"] = rp
    return o


def line(dtype="magic", length=8.0, width=1.6, maxt=None, aim="target",
         onhit=None, **kw):
    # ⚠️ A-7：`aim` 以前寫死成 "target"，所以「[前方][直線]」的 ground 技全部拿到
    #    目標瞄準，而 `damageLine.ts` 的檔頭與全 repo 唯一的 ground damageLine
    #    （godie-efur.e）都指明「面前」= facing。開成參數，⛔ 預設不動
    #    （改預設會一次改到 20 支，那是**沒有紅燈在守**的行為變更）。
    # ⭐ B1-I：`maxt` 預設 5 → None（不輸出），理由見 area()。7 個 line() 呼叫點
    #    同樣一個都沒明填過。
    rp = _split_res_pct(kw)
    _require_base(kw, f"line(length={length})")
    # ⚠️ 鍵序 = Zod 宣告序（fromCaster 在 maxTargets 之前），理由見 area()。
    o = {"kind": "damageLine", "damageType": dtype, "amount": amt(**kw),
         "length": length, "width": width, "aim": aim, "fromCaster": True}
    if maxt is not None:
        o["maxTargets"] = maxt
    if onhit:
        o["onHitTargets"] = list(onhit)
    # ⭐ 2026-08-13 —— 這裡**不再**無條件寫 `includeOrigin = False`。
    #    那一行是產生器層級的缺陷：7 個 `line()` 呼叫點全部拿到「排除觸發者」，
    #    而其中 5 支是 ground 的「[前方][直線]」技（20-03 / 59-04 / 15-01 / 79-03 / 80-03）
    #    —— 它們的 `ctx.targets` 是 `abilitySystem.ts:266` 用落點圈查出來的**敵人本人**，
    #    於是 `damageLine.ts` 的 `skip = new Set(ctx.targets)` 把瞄準的那個人整個跳過：
    #    **瞄得越準打得越少**（點在敵人身上 0 傷害、點在他旁邊一點吃滿）。
    # ⛔ 修法不是「在第 N 列加一個參數」，是**位置**（同 A-8）：交給 `_own_area()` 走一次
    #    —— 技能自己發動的（`doc["effects"]` 樹）→ True；passive/hooks 底下的
    #    （92-02 消化液那種「被打到才往前掃」的真擴散）→ 不寫 ⇒ schema 預設 false
    #    ⇒ 行為逐字不變（`includeOrigin` 是 optional，sim 讀的是 `=== true`）。
    # ⚠️ 住在 `doc["passive"]` 裡而**又該**含觸發者的（20-002 的最後一發）walker 走不到，
    #    那一支在呼叫點用 `dict(line(...), includeOrigin=True)` 明填（setdefault 讓明填贏）。
    if rp:
        o["resourcePct"] = rp
    return o


#: `buff()` 收得下的額外欄位。⛔ **具名白名單，不是裸 `**kw` 直通。**
#:
#: 理由是複驗實測到的一次 REJECT：v1 的修法寫「`**kw` 直通，解鎖
#: stackKey/maxStacks/exclusiveGroup/maxStat/**onExisting** 五格」——
#: 而 `onExisting` **不在 applyBuff 上**，它是 `shield` 的欄位（effect.ts:1727）。
#: 裸直通寫錯一格就是**整份文件被 Zod 拒收 → content 整份載入失敗 → 退回骨架**。
#: 白名單讓那個錯誤在**產生的當下**就喊，而不是在玩家的瀏覽器裡。
_BUFF_FIELDS = frozenset({
    # 疊層／互斥（G5）
    "stackKey", "maxStacks", "stackVisual", "exclusiveGroup", "exclusiveOnExisting",
    # 上限與逐階
    "maxStat", "perRank",
    # 永久 / 狀態綁定
    "permanent", "statusId", "applyTo", "dispellable", "polarity",
    # ⭐ B2-G：SOURCE_GRANT_SHAPE 的五格授權欄位。在此之前對這 90 支**全部不可達**
    #    （出貨 96 份裡五格都是 0），因為 `buff()` 只有三個具名參數。
    "block", "critStrike", "attributes", "damageTypeOverride", "flight",
    # ⭐ GH#684：第 13 格 `statusImmunity`（GH#656 為殭屍王做的「這具身體不吃某一類
    #    狀態」）。⚠️ 它在 schema 上**早就**騎在 SOURCE_GRANT_SHAPE 上（＝ `applyBuff`
    #    授予得起），⛔ 而這張白名單漏了它 ⇒ 對 skill-remake 的 90 支**不可達**。
    #    ⭐ 那正是 #684 要收斂的那件事的**根因**：暴走寫不出「掛不上來」，
    #    只好用 dispel hook 事後補拔，於是同一個意圖長出了第二份平行實作。
    "statusImmunity",
})


_LOCUST_STRIKE_TPL = "tpl-locust-strike"
_locust_strike_defaults_cache = None


def _locust_strike_defaults():
    """⭐ GH#698 —— `tpl-locust-strike` 的出貨預設值，**從那份模板文件讀**。

    ⛔ 這裡不抄一份字面值（第〇·四守則：同一個數字不可以有第二個住處）。
    模板改了 `lifeSec: 1 → 1.5`，下一次 `skillremake:json` 產出的節點就跟著少寫
    /多寫那一格 —— ⛔ 不必回頭改這支腳本。
    """
    global _locust_strike_defaults_cache
    if _locust_strike_defaults_cache is None:
        p = os.path.join(ROOT, "content", "ability-templates", _LOCUST_STRIKE_TPL + ".json")
        with open(p, encoding="utf-8") as fh:
            params = json.load(fh)["params"]
        _locust_strike_defaults_cache = {
            k: v["default"] for k, v in params.items() if "default" in v
        }
    return _locust_strike_defaults_cache


def static_model(model_key, anchor, life, scale=None, tint=None, clip=None, **kw):
    """⭐ GH#691 —— 原作那一具**定點的蝗蟲群 dummy**（`model_fx=` 的一列）。

    原作的形狀逐字是 `CreateUnit` → `AddSpecialEffect` → `UnitApplyTimedLife`，
    一次施放擺一具**不位移**的模型然後到期回收 —— 那正是
    `spawnModelFx` 的 `path:"static"`（#649 類④）。

    ⚠️ 三個參數都是**量到的**，⛔ 不是挑的：
      · `anchor` ← 技能的 castType（self→self / ground→point / targeted→target）
      · `scale`  ← 那一具 dummy 的 w3u `usca`（`tools/locust-census/census.json`）
      · `tint`   ← `UNIT_TINTS.json` 的 `tint`（w3u → 基底 → UnitUI.slk 解出來的）
        —— 中性（白）的一律**不填**，`model@1.fxTint` 那條「tint 有來源」的閘
        只驗有填的，而填一個 [1,1,1] 是一格乘 1 的空宣稱（第一·五守則）。
    ⚠️ `lifeSec` 是 `static` 唯一的終止條件（schema refine 必填）。

    ⭐ GH#698 —— 它現在產出的是一個**引用 `tpl-locust-strike` 的稀疏節點**，
    ⛔ 不是十來格逐支抄好的幾何。`content/modelFxPreset.ts` 在**載入時**把留白的格
    從那份模板補上，所以：
      · 與家族預設相同的值 ⇒ **不寫**（13 個出貨節點裡有 6 個因此只剩 `modelKey`）
      · 真的不同的值 ⇒ 照寫，節點永遠贏過模板
      · `modelKey` **永遠寫**（它是**身分**不是幾何 —— `modelFxStagingContract` ⑤ 的
        原話，而 `animationFxTemplate` 反過來要求共用模板的節點各自寫出它）
    ⇒ 之後要調整整族的 lifeSec/scale/anchor，改**模板那一格**，⛔ 不必重跑 13 支。
    """
    d = _locust_strike_defaults()
    n = {"kind": "spawnModelFx", "shape": "single", "preset": _LOCUST_STRIKE_TPL,
         "modelKey": model_key}
    # ⚠️ `path` 不在這裡出現 —— 模板的預設就是 `static`，而寫死它等於在每一個節點上
    #    留一份會過期的複本（模板哪天把家族改成別的路徑，這 13 個節點會安靜地不跟）。
    for k, v in (("anchor", anchor), ("lifeSec", life), ("scale", scale), ("clip", clip),
                 ("tint", tint)):
        # ⭐ `clip` 走 `model@1.clipMap` 解名（GH#689 已落地：`modelFxRig` 真的會播）。
        #    ⛔ 不填 = 這一具是**靜止**的一格畫面 —— stock 特效模型的視覺有一半住在
        #    它自己的 stand 序列裡（雷柱的閃爍、火焰的翻騰）。
        if v is None or d.get(k) == v:
            continue
        n[k] = v
    n.update(kw)
    return n


def buff(mods, dur=None, hooks=None, **kw):
    """⭐ B2-F/G —— `applyBuff` 的其餘欄位有出口了。

    以前只有 `mods` / `dur` / `hooks` 三個參數，於是：
      · **F**：逐階增益寫不出來。⚠️ `applyBuff.duration` 是 `z.number()`
        （**不是** zRankScalar，實測傳陣列 REJECT），所以逐階的**唯一**落點是
        `perRank=[{"modifiers": […], "duration": n}, …]` **整列覆寫**。
      · **G**：`block` / `critStrike` / `attributes` / `damageTypeOverride` /
        `flight` 五格授權欄位對這 90 支不可達 —— 而它們正是「30% 機率格擋」
        「1.5 倍會心」「翅膀 6 秒」「這段期間普攻變真傷」的唯一寫法。

    `dur` 可省略（配 `permanent=True` 或 `perRank=`），⚠️ 但 schema 的
    `refineApplyBuff` 兩個方向都關死：`duration` 與 `permanent` **互斥且必填其一**。
    """
    bad = sorted(set(kw) - _BUFF_FIELDS)
    assert not bad, (
        f"buff() 不認得 {bad} —— ⛔ 這裡是**具名白名單**不是 `**kw` 直通。"
        f"寫錯一格 = 整份文件被 Zod 拒收 = content 整份載入失敗 = 退回 2 隻骨架英雄。"
        f"要新開一格請同時確認它真的在 applyBuff 的 schema 上"
        f"（⚠️ `onExisting` 就不是 —— 那是 shield 的）。"
    )
    o = {"kind": "applyBuff", "modifiers": mods}
    if dur is not None:
        o["duration"] = float(dur)
    if hooks:
        o["hooks"] = hooks
    o.update(kw)
    return o  # 鍵序由 build() 的 _canonical_order() 統一處理


def _own_area(node):
    """把**技能自己發動**的 `damageArea` 標成「震央也要吃」（A-8）。

    `damageArea` 的語意是**擴散**（sim/effects/damageArea.ts 檔頭）：圓心是這次
    事件的受害者，而那個受害者「已經吃過觸發這次擴散的那一擊」，所以 :50 那行
    預設把 `ctx.targets` 整組跳過。技能自己放的範圍沒有那一擊 —— 而
    abilities/abilitySystem.ts:265 在 ground 施法時把**圈內所有敵人**塞進
    `ctx.targets`，於是整圈的人全被當成震央跳過，傷害正好是 0。

    ⛔ 這不是「在第 N 列加一個參數」：規則是**位置**。在 doc["effects"] 樹裡的
    damageArea 是技能自己發動的（含 randomArea/delayed/onLand 這些巢狀容器裡的，
    它們一樣是這支技能放出去的）；在 passive/hooks 裡的才是真的擴散，⛔ 不要碰。
    """
    if isinstance(node, list):
        for v in node:
            _own_area(v)
    elif isinstance(node, dict):
        # ⭐ 2026-08-13 —— `damageLine` 一起走這條規則（原本只有 `damageArea`）。
        #    兩個 kind 在 sim 裡是**同一個機制的兩個形狀**：`damageArea.ts:52` 與
        #    `damageLine.ts:128` 是逐字相同的那一行
        #    `includeOrigin === true ? null : new Set(ctx.targets)`。
        #    只修一半 = 5 支「[前方][直線]」ground 技繼續把瞄準的那個人跳過。
        if node.get("kind") in ("damageArea", "damageLine"):
            node.setdefault("includeOrigin", True)   # setdefault：手填的特例仍然贏
        for k, v in node.items():
            # ⛔ 不要走進 hooks/passive/marks/onHitTargets/onHit —— 那底下的
            #    `damageArea` 是**真的擴散**（圓心是事件的受害者，他已經吃過
            #    觸發那一擊），灌 includeOrigin 會讓震央被打**兩次**。
            # ⭐ 用既有常數而不是硬寫 `k == "hooks"`：同一條規則一個住處，
            #    `_fold_onhit` 與 `_first_tier` 已經在讀它。
            if k in _NOT_CAST_SCOPE:
                continue
            _own_area(v)


# ─────────────────────────────────────────────────────────────────────────────
# B1（2026-08-12）· 三條**規則**，表格零列要動
#
# 這三條跟 A 類那八條是同一個形狀：改一次、90 支的輸出全變。剩下的缺陷都是
# 「詞彙」（helper 簽章加參數，每一列還要填值），CP 值天生低一階。
# ─────────────────────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────────────────────
# B2（2026-08-12）· 鍵序這件事**升格成一條規則**
#
# 以前三個 helper 各自帶一段「⚠️ 鍵的順序要跟 Zod schema 的宣告順序一致」的註解，
# 而那是**三份會各自腐爛的知識**：新開一格出口就要記得插在正確的位置，記錯了
# `abilityScaling.test.ts` 的 fx-19 會報 desync（`area()` 的註解自己記載這個坑
# 造過 **23 筆假 desync**）。
#
# 改成：helper 想怎麼塞就怎麼塞，`build()` 收尾**照這張表把整棵樹重排一次**。
# 一個住處、一條規則，而 fx-19 仍然是它的守衛。
#
# ⛔ 這張表要跟 `packages/shared/src/content/schema/effect.ts` 的宣告序一致。
#    對不上 fx-19 會紅（那正是它存在的理由），⛔ 不要改測試。
# ─────────────────────────────────────────────────────────────────────────────
_ORDER = {
    "damage": ("kind", "condition", "applyTo", "damageType", "amount", "canCrit", "comboBonus",
               "hpPct", "bankedBonus", "incomingPct", "resourcePct", "distanceScale",
               "refund"),
    "damageArea": ("kind", "condition", "damageType", "amount", "radius", "radiusTier", "falloff",
                   "maxTargets", "canCrit", "includeOrigin", "victimCondition",
                   "maxTargetsCounts", "onHitTargets", "runOnEmptyHit",
                   "onHitTargetsMode", "resourcePct"),
    "damageLine": ("kind", "condition", "damageType", "amount", "length", "width", "aim",
                   "fromCaster", "maxTargets", "canCrit", "includeOrigin",
                   "victimCondition", "maxTargetsCounts", "onHitTargets",
                   "runOnEmptyHit", "onHitTargetsMode", "resourcePct"),
    # ⚠️ `...SOURCE_GRANT_SHAPE`（block/critStrike/attributes/damageTypeOverride/
    #    flight）在 applyBuff 上展開在**最後**，不是中間。
    "applyBuff": ("kind", "condition", "modifiers", "duration", "permanent", "statusId", "applyTo",
                  "exclusiveGroup", "exclusiveOnExisting", "maxStat", "perRank",
                  "stackKey", "maxStacks", "stackVisual", "hooks", "dispellable",
                  "polarity", "block", "critStrike", "attributes",
                  "damageTypeOverride", "flight"),
    "applyStatus": ("kind", "condition", "statusId", "stacks", "refresh", "duration", "applyTo",
                    "moveSpeedMult", "root", "stun", "missChance", "berserk", "feared",
                    "silenced", "disarmed", "targetsAllies", "breakOnDamage",
                    "breakOnDamageMin", "healingTakenMult", "lifestealMult",
                    "regenMult", "dispellable"),
}


#: `zHookDef` 的宣告序。⚠️ HookDef 沒有 `kind`，所以 `_ORDER` 那張表管不到它 —— 見 G-4。
_HOOK_ORDER = (
    "on", "key", "abilitySlot", "effects", "internalCooldown", "chance", "chanceFrom",
    "condition", "target", "victim", "internalCooldownScope", "damageSource",
    "damageType", "damageCrit", "critSource", "reflectedDamageSource",
    "reflectedDamageType", "maxTriggers", "consumeOn", "onConsumed", "perTarget",
)


def _canonical_order(node):
    """把 effects 樹裡認得的 kind 照 `_ORDER` 重排（不認得的原樣保留順序）。"""
    if isinstance(node, list):
        for i, v in enumerate(node):
            node[i] = _canonical_order(v)
        return node
    if not isinstance(node, dict):
        return node
    for k in list(node):
        node[k] = _canonical_order(node[k])
    seq = _ORDER.get(node.get("kind"))
    if not seq:
        # ⭐ G-4（B3）—— HookDef **沒有 `kind`**，所以它從來沒被這張表管過。
        #    在此之前 hooks 只住在 `passive`（fx-19 不比對），而 B3-A 的反彈把 hooks
        #    搬進了 `applyBuff.hooks` ⇒ 它落在 `doc["effects"]` 裡，**fx-19 會比對到**。
        #    `zHookDef` 把 `effects` 宣告在第 4 格，helper 寫出來是
        #    on→target→damageType→effects ⇒ 生檔與 Zod 重建版不相等 ⇒ 判 desync。
        #    ⚠️ 實測：不加這一段，20-04 與 60-04（**兩支都是 R 槽＝會鏡射進英雄卡**）
        #    判 desync，`abilityScaling.test.ts` 的 fx-19 紅。
        #    ⛔ 逐筆複驗抓不到它：A 類只跑 validateDoc（鍵序不影響），C 類跑了 fx-19
        #    但沒有一筆把 hook 放進 effects —— 是**兩批的組合**生出來的。
        if "kind" not in node and "on" in node and "effects" in node:
            seq = _HOOK_ORDER
        # ⭐ G-2 —— `condition` 是 EFFECT_COMMON_SHAPE 的唯一一格，34 個聯集成員全部
        #    把它展開在 `kind` 正下方；即使這個 kind 不在 _ORDER 裡也必須排第二
        #    （例：`weightedBranch`）。
        elif "kind" in node and "condition" in node:
            return dict(sorted(node.items(),
                               key=lambda kv: {"kind": 0, "condition": 1}.get(kv[0], 2)))
        else:
            return node
    rank = {k: i for i, k in enumerate(seq)}
    # 表上沒有的鍵排在最後，彼此維持原本的相對順序（穩定排序）。
    return dict(sorted(node.items(), key=lambda kv: rank.get(kv[0], len(seq))))


#: 折進 `onHitTargets` 的酬載 kind。⛔ 不含 `damage` —— 兩顆傷害並排是合法的
#: 「本體 + 濺射」寫法，折進去會變成「打中才追加」，那是行為變更。
_PAYLOAD_KINDS = ("applyStatus", "knockback", "dot")
#: 有 `onHitTargets` 的形狀（effect.ts:1516 / :1566）。⛔ `damage` **沒有**這一格。
_SHAPE_KINDS = ("damageArea", "damageLine")
#: ⛔ 不要遞迴進去的鍵：那裡面的 `ctx.targets` 是**事件的受害者**，兄弟酬載本來
#: 就該打在他身上（`damageArea` 的原意就是擴散）。折進 onHitTargets 反而是錯的。
_NOT_CAST_SCOPE = ("hooks", "passive", "marks", "onHitTargets", "onHit")

#: 被折進去的節點（num → [(shape, payload)]）。main() 收工印出來（靜默才是缺陷）。
FOLD_LOG = {}

#: B1 的閘收集到的東西（分類 → [(num, 細節)]）。⛔ 它**不擋** build()，
#: 由 `b1_report()` 在收工時一次印完 —— 「撞到第一支就停」看不到全貌，
#: 而全貌才是「N 個同型 = K 個模板」判斷得了的東西（第零守則⑨）。
FINDINGS = __import__("collections").defaultdict(list)


def b1_report():
    """把 B1 三條閘收集到的清單一次印完。⚠️ 這是**清單**不是紅燈。

    ⛔ 「一行沒有人讀的 log 不算」（CLAUDE.md）—— 所以真正的紅燈住在
    `packages/shared/src/ops/` 的守衛裡，這裡負責的是**讓作者看得到要填什麼**。
    """
    if not FINDINGS:
        return
    print("\n─── B1 閘清單（⚠️ 不擋出貨，是待填清單）───")
    for k in sorted(FINDINGS, key=lambda k: (not k.startswith("M·⛔"), k)):
        rows = FINDINGS[k]
        print(f"  {k} —— {len(rows)} 支")
        print("     " + " · ".join(f"{n}{f'({d})' if d else ''}" for n, d in rows))


def _fold_onhit(node, num, _root=True):
    """⭐ B1-B —— 範圍技的兄弟酬載打在**施法者自己**身上，這條規則把它折回去。

    `area()/line()` 從來沒有 `onhit=` 出口，所以「範圍傷害 + 暈眩」在表格裡只能
    寫成兩顆並排的兄弟節點。而兄弟節點吃的是 `ctx.targets` ——
    `castType:"self"` 時那就是**施法者本人**，`ground` 時 `abilitySystem.ts` 塞的是
    圈內敵人（勉強對），`targeted` 時是單一目標（範圍白做了）。

    出貨實測：`onHitTargets` 在 96 份重製檔裡出現 **0 次**，而引擎那一半是活的
    （`victimFilter.ts:63 runOnHitChain` 由 `damageArea.ts:118` / `damageLine.ts:154`
    呼叫，把**真的打中的人**換進 `ctx.targets`）。

    ⛔ 這不是「在第 N 列加一個參數」——規則是**相鄰**：同一個 effects 陣列裡，
       緊接在形狀之後、且沒有明寫 `applyTo:"self"` 的酬載，就是那個形狀的酬載。
       明寫 `applyTo:"self"`（例：自己吃一個增益）一律不動。
    """
    if isinstance(node, list):
        out = []
        for v in node:
            if (
                out
                and isinstance(v, dict)
                and isinstance(out[-1], dict)
                and v.get("kind") in _PAYLOAD_KINDS
                and out[-1].get("kind") in _SHAPE_KINDS
                and v.get("applyTo") != "self"
            ):
                out[-1].setdefault("onHitTargets", []).append(v)
                FOLD_LOG.setdefault(num, []).append((out[-1]["kind"], v["kind"]))
                continue
            out.append(v)
        node[:] = out
        for v in node:
            _fold_onhit(v, num, False)
    elif isinstance(node, dict):
        for k, v in node.items():
            if k in _NOT_CAST_SCOPE:
                continue
            _fold_onhit(v, num, False)


def _first_tier(node):
    """cast effects 樹裡第一顆自發 `damageArea` 的 `radiusTier`（深度優先）。"""
    if isinstance(node, list):
        for v in node:
            t = _first_tier(v)
            if t:
                return t
    elif isinstance(node, dict):
        if node.get("kind") == "damageArea" and node.get("radiusTier"):
            return node["radiusTier"]
        for k, v in node.items():
            if k in _NOT_CAST_SCOPE:
                continue
            t = _first_tier(v)
            if t:
                return t
    return None


def _ground_radius(doc, num):
    """⭐ B1-O —— `ground` 技的 doc **頂層**沒有 `radiusTier`，落點圈就退回半徑 1。

    ⛔ B1-B 修不到這一條：`onAbilityHit` 是 `abilitySystem.ts:432` 對 **doc 頂層**
    算出來的 `targets` 發的，effect 樹裡的 `radiusTier` 它看不到。⇒ 一支「在指定
    地點造成大範圍傷害」的技能，傷害是對的（effect 自己有半徑），但所有掛在
    `onAbilityHit` 上的東西只認 1 距離內的人。

    規則：能從 effects 樹第一顆自發 `damageArea` 借就借（⚙️ 表格零列要動）。

    ⛔ 借不到**不是**缺陷 —— 我第一版在這裡 `assert`，結果 7 支全部擋下來，
       而其中 20-03 / 59-04 / 15-01 是 `damageLine`（「[前方][直線]」）、
       60-02 是 `leap`：**線與跳躍本來就沒有圓**，拿圓的規則去要求它們是誤報。
       借不到的記進清單交給第 5 節的閘（`_report()`）判，⛔ 不在這裡猜一個預設值。
    """
    if doc.get("castType") != "ground" or doc.get("radiusTier"):
        return
    t = _first_tier(doc.get("effects", []))
    if t:
        doc["radiusTier"] = t
        FINDINGS["O·借到頂層 radiusTier"].append((num, t))
        return
    shapes = sorted({x.get("kind") for x in doc.get("effects", []) if isinstance(x, dict)})
    FINDINGS["O·ground 但沒有圓（多半是線/跳躍，正常）"].append((num, ",".join(shapes)))


#: 「這一段之後還有下一段」的規格用語。⚠️ 只用來**問**，不用來猜結構。
#: ⛔ 「秒後」不在列裡 —— 「持續 5 秒後歸零」是**持續時間到期**，不是時序（15-002 誤報）。
_SEQUENCE_WORDS = ("隨後", "接著", "然後", "結束時", "結束後")
#: 傷害形狀。`spawnProjectile.onHit` 空但**旁邊有這些**＝彈道是純視覺，可接受。
_DAMAGE_KINDS = ("damage", "damageArea", "damageLine")


def _mechanics_text(desc):
    """把**角色台詞**從說明裡拿掉 —— 任何讀 desc 找機制的閘都要先過這一關。

    ⭐ owner 2026-08-12 逐字立的規則：

        「技能內文說明會有一個 **「」代表角色施展技能的對白，不是真正的效果**，
         請不要被迷惑了」

    ⛔ 這條規則的代價已經量到過：44-04 心臟麻痺的台詞是
    「不，還不能笑，我一定要忍住……**在35秒後**宣布勝利吧。」——
    掃整段會判定它是一支有時序的技能。複驗對另一條閘量到過同型的
    **57% 誤報率**，代價是作者被 8 支假紅擋住。

    ⚠️ 剝的是**整段 `「…」`**（含跨行、含行中），⛔ 不是「行首是「的那幾行」——
    後者漏掉「造成 X 傷害「台詞」再造成 Y」這種寫法。
    """
    return re.sub(r"「[^」]*」", "", desc, flags=re.S)


#: 「取代」語意的用語。⭐ owner 2026-08-12：「這是**提升至**」——
#: 判準在**字面**上，⛔ 不是每次靠人判斷。
_SET_WORDS = ("提升至", "上升至", "增加至", "提高至", "降為", "降至", "變為", "固定為")


def _set_semantics_gate(doc, e, num):
    """⭐「提升 X%」vs「提升**至** X%」是**兩件事**，而它們的 JSON 差一倍。

    · 「提升 X%」  → `pctAdd`（加成：本體的值還在，往上疊）
    · 「提升**至** X%」→ `pctMult`（取代：最終值是基礎的 X 倍）

    實測踩過：80-04 赤兔咆哮「[AP]與[AD]暫時提升**至** 150/200/250%」寫成
    `pctAdd 1.5` ＝ **+150% ＝ 2.5 倍**，而規格要的是 **1.5 倍** —— 整整多一倍，
    而卡片上兩者長得一模一樣（失敗形態②）。

    ⛔ 這條閘**只在同一句話裡同時出現「至」與「%」時**才叫 —— 「生命**降至** 20%」
    那種是**條件門檻**（59-00 暴走），不是 modifier，⛔ 不可以誤報。
    """
    txt = _mechanics_text(e.get("desc", ""))
    # 只看真的講「某個屬性提升至 N%」的句子：「至」與百分比要在同一行。
    # ⚠️ 切到**子句**再判，⛔ 不是整行 —— 15-04 一行裡同時有
    #    「100/150/200% [攻擊速度]」（加成）與「[攻擊速度上限]提升至10」（capRaise），
    #    整行判會把前者誤報成後者（實測 2 支假紅）。
    clauses = re.split(r"[，。、\n]", txt)
    suspect = [
        c for c in clauses
        if any(w in c for w in _SET_WORDS) and re.search(r"\d+\s*%", c)
        # ⛔ 「上限提升至 N」是 capRaise，不是 pctMult。
        and "上限" not in c
        # ⛔ 「生命降至 20%」是**條件門檻**（59-00 暴走），不是 modifier。
        and not re.search(r"(生命|血量|魔力|HP|MP)", c)
    ]
    if not suspect:
        return
    bad = []

    def walk(n):
        if isinstance(n, list):
            for v in n:
                walk(v)
        elif isinstance(n, dict):
            if n.get("op") == "pctAdd" and "stat" in n:
                bad.append(n["stat"])
            for v in n.values():
                walk(v)

    walk(doc.get("effects", []))
    walk(doc.get("passive", {}))
    if bad:
        FINDINGS["⚠️ 規格寫「提升至」但 JSON 用 pctAdd（差一倍）"].append(
            (num, ",".join(sorted(set(bad))))
        )


#: 佔位符：「**這一支自己的卡面冷卻，換算成實際秒**」。
#:
#: ⭐ owner 2026-08-19（59-01 吞噬改被動）＋ 2026-08-20（⛔ 他已經回答過三次以上）：
#:      「改成被動 自動發生 低於該門檻直接吃掉」
#:      「**採用原本主動的冷卻時間就好了**」
#:
#: 「跟主動一樣」是一個**關係**，⛔ 不是一個數字。寫成數字要付兩次稅：
#:   ⚠️ ①**單位不同**（見 `tierize.hook_icd` 那張表）—— `ability.cooldown[]` 是
#:      **卡面秒**（引擎再乘 `combatEnv.cooldown`，出貨 0.2），而
#:      `hook.internalCooldown` / `applyStatus.duration` 是**實際秒**（⛔ 沒有人乘）。
#:      逐字抄 60 進去 = 玩家等 **5 倍**久，而卡片、schema、測試全部正常。
#:   ⚠️ ②**冷卻會被五級距重寫**（`tierize()` 在解析這個佔位符的正上方跑）。
#:      手打的那個數字不會跟著動，於是關係在下一次調級距時**安靜地斷掉**。
#:
#: ⭐ 做成**佔位符**而不是一格 `icd_follows_cd=True` 的旗標，是因為要它的位置不只
#:    一個：hook 的 `internalCooldown`、`applyStatus.duration`、未來任何一格。
#:    一個佔位符 = 一條規則（第〇·五守則），⛔ 不是每個落點各一個旗標。
CD_ECHO = "__cd_echo__"


def _resolve_cd_echo(doc, num):
    """把整份文件裡的 {@link CD_ECHO} 換成這一支自己的卡面冷卻 × 全域冷卻倍率。

    ⚠️ 呼叫點在 `tierize()` **之後**（⛔ 不可以在之前）：冷卻在那一步才剛被
       五級距重寫，讀它之前的值就會讓「跟主動一樣」停在一個已經不存在的數字上。
    ⛔ 留著沒被換掉的佔位符會讓 Zod 當場拒收（字串塞進一個 number 欄位）——
       那是刻意的：一個「忘了填冷卻」的技能要**吵**，不可以靜靜地變成 0。
    """
    cd = [float(x) for x in (doc.get("cooldown") or []) if x]
    val = hook_icd(seconds=max(cd)) if cd else None

    def walk(node):
        if isinstance(node, list):
            for i, x in enumerate(node):
                if x == CD_ECHO:
                    assert val is not None, \
                        f"{num}: 用了 CD_ECHO 但 cooldown[] 全是 0 —— 沒有主動冷卻可以沿用"
                    node[i] = val
                else:
                    walk(x)
        elif isinstance(node, dict):
            for k, v in list(node.items()):
                if v == CD_ECHO:
                    assert val is not None, \
                        f"{num}: 用了 CD_ECHO 但 cooldown[] 全是 0 —— 沒有主動冷卻可以沿用"
                    node[k] = val
                else:
                    walk(v)

    walk(doc)


def _timing_gates(doc, e, num):
    """⭐ B1-M —— 時序容器沒有 helper，於是「先 A 再 B」被攤平成同一 tick 的兄弟。

    這是 B（空間）的**時間軸孿生**：B 問「打到誰」，這裡問「什麼時候」。
    出貨量到的：`spawnProjectile.onHit` **7/7 全空**（彈道飛出去什麼都不做，傷害
    由旁邊的兄弟在**發射的那一瞬間**結算）；`dash.onEnd` **0/4**。

    ⛔ **只記不擋**（`FINDINGS`），理由是複驗逐字寫的：「把兄弟塞進 onHit/onEnd
       是語意判斷，猜錯會靜靜地改變 7 支技能。**閘產生清單，作者逐列處理**。」
       我第一版寫成 `raise`，那是「撞到第一支就停」不是「產出清單」。
    """
    fx = doc.get("effects", [])
    tree_kinds = {x.get("kind") for x in fx if isinstance(x, dict)}
    for i, x in enumerate(fx):
        if not isinstance(x, dict):
            continue
        if x.get("kind") == "spawnProjectile" and not x.get("onHit"):
            # ⚠️ 旁邊有傷害 = 彈道是純視覺（複驗：7 顆裡 5 顆是這一種，可接受）。
            if tree_kinds & set(_DAMAGE_KINDS):
                FINDINGS["M·彈道純視覺（onHit 空但旁邊有傷害，可接受）"].append((num, ""))
            else:
                FINDINGS["M·⛔ 彈道飛出去什麼都不做（onHit 空且無傷害兄弟）"].append((num, ""))
        if x.get("kind") == "dash" and not x.get("onEnd") and i + 1 < len(fx):
            FINDINGS["M·dash 酬載在起跳瞬間結算（沒有 onEnd）"].append(
                (num, ",".join(sorted(tree_kinds - {"dash"})))
            )
    txt = _mechanics_text(e.get("desc", ""))
    hit = [w for w in _SEQUENCE_WORDS if w in txt]
    if hit:
        has_container = any(
            isinstance(x, dict)
            and (
                x.get("kind") in ("delayed", "spawnProjectile", "dash", "blink")
                or x.get("onEnd") or x.get("onArrive") or x.get("onLand")
            )
            for x in fx
        )
        if not has_container:
            FINDINGS["M·說明有時序用語但 effects 全是平行兄弟"].append((num, ",".join(hit)))


def M(stat, op, value):
    return {"stat": stat, "op": op, "value": value}


def status(sid, dur, **kw):
    """一顆 `applyStatus`。

    ⭐ `dur` 收**純量或逐階陣列**（2026-08-13）。`applyStatus.duration` 在 schema
    裡是 `zRankScalar`（`number | number[]`），sim 走 `applyStatus.ts:48` 的
    `rankScalar(e.duration, ctx.rank)` 讀 —— 所以四階不同秒數是**今天就寫得出來**的，
    ⛔ 只是這支 helper 之前把它 `float()` 掉了。
    ⚠️ 症狀是靜默的：70-03 木束縛之術規格寫 0.6/1.2/1.8/2.4，出貨四階全是 0.6，
       而升階的玩家看到的是「點了沒有變強」。

    ⛔ **`slowNN` 的 NN 必須等於 `moveSpeedMult` 換算出來的減速**（2026-08-18 / #356）。
       `moveSpeedMult=0.5` ⇒ 減 50% ⇒ `slow50`，⛔ 不是 `slow40`。
       守衛是 `packages/shared/src/content/slowLabelMatchesMultiplier.test.ts`，
       而它明說「改 statusId，⛔ 不要改 moveSpeedMult」——
       標籤只是名字，減速多少是這一格的參數。
       ⚠️ 這四支（godie-edem.w / emfr.q / emns.r / h02v.r）曾經被**繞過產生器**
       直接改 JSON，於是 `skillRemakeJsonFresh` 紅了。要改請改這裡再重生成。
    """
    o = {
        "kind": "applyStatus",
        "statusId": sid,
        # ⭐ `CD_ECHO` 原樣送下去，由 `_resolve_cd_echo()` 在 `tierize()` 之後換掉
        #    （⛔ 不可以在這裡 `float()` 掉它：那一刻冷卻還沒被五級距重寫）。
        "duration": dur if dur == CD_ECHO
        else ([float(x) for x in dur] if isinstance(dur, (list, tuple)) else float(dur)),
    }
    o.update(kw)
    return o


# ─────────────────────────────────────────────────────────────────────────────
# A-9 ·【位移級距 16】—— 表要跟著已出貨的再平衡走
#
# owner 2026-08-13「位移級距」把所有 dash/knockback 的 speed 壓到 16，
# 而那次落地（commit 34f79b7d）**只改了 content/ 沒改這張表**。
# ⇒ 2026-08-13 我重跑這支產生器時，6 支技能被靜默回捲成 30/32/30/24/18/20。
#
# ⛔ 這正是 GH#319 的形狀：產生器與編輯器（或別的批次）搶寫同一批檔、零仲裁。
#    修法不是「不要重跑產生器」，是**讓表同意已出貨的事實**。
#    ⚠️ 下一次有人再做全域再平衡，同一件事會再發生一次 —— 真正的閘在 #319。
#
# ─────────────────────────────────────────────────────────────────────────────
# A-5 ·「沉默 ≠ 移除」—— 規格沒點名的**非酬載機制**一律沿用
#
# `build()` 的 effects 是從零寫的字面 dict，所以舊出貨文件上任何規格沒點名的
# 機制都會靜默消失。實測 90 支裡消失了 7 支的彈道（projectileElement 的
# launchers 53→46）與 2 支的無敵窗（invulnerableBinding 的 EXPECTED_BOUND）。
#
# ⛔ 修法不是「在表格第 N 列補一個參數」—— 那是 7 個逐支補丁，下一批 90 支
#    會再犯一次同型。這裡是一條規則：
#      **非酬載機制（射出哪一顆彈道、施法期間免不免疫）由舊文件沿用；
#        酬載（傷害數字、狀態、增益）由規格決定。**
#
# 為什麼 CARRY_KINDS 只有這兩個（量出來的，不是挑的）：對照
# `skill-tag-manifest.json`，能表達它們的標籤是【衝擊波】→ spawnProjectile、
# 【免疫】/【魔免】/【免控】→ invulnerable，而這 90 支的描述裡**一個都沒出現**
# —— 規格從來沒有「說要它」，因此也不可能是在「說不要它」。其餘消失的 kind
# （damage / applyBuff / leap / dot …）都是規格真的改寫掉的**酬載**，那些只印
# 報表、⛔ 不自動救（自動 deep-merge 會讓新舊語意打架，也會回滾 A-6）。
CARRY_KINDS = ("invulnerable", "spawnProjectile")

# 綁模板的舊文件 `effects` 是 []，機制長在模板裡（見 testkit/expandedEffects.ts
# 的 effectsOf()）。⚠️ 這兩列是從 `packages/shared/src/content/templates/
# expand.ts` 讀來的，不是猜的：整份 expand.ts 只有 line-sweep 與 traveling-wave
# 兩張卡會 spawnProjectile，兩張都硬寫 `imported.wave`。
# expand.ts 再多一張會發射的卡，這裡要跟著補（下面的閘不會替你發現它）。
TEMPLATE_PROJECTILE = {
    "tpl-line-sweep": "imported.wave",
    "tpl-traveling-wave": "imported.wave",
}

# 逐支稽核紀錄，`main()` 的閘讀它。key = ability id。
AUDIT = {}

#: `cosmetic_projectile` 換掉了哪幾支的哪一顆 → 報表印出來（GH#375）。
COSMETIC_LOG = {}

#: 彈道文件所在。⭐ `cosmetic_projectile` 從**這裡**讀外觀，⛔ 不在表格裡手打。
PROJ_DIR = os.path.join(ROOT, "content", "projectiles")


def projectile_vfx(pid):
    """一顆彈道的**外觀** —— 住在彈道文件自己的 `vfxKey` 上。

    ⭐ 這是 GH#251 量到的事實，⛔ 不是推論：`EntityViewRegistry` 拿的是
    `projectileVfxFor(e.key)` 而 `e.key` 是 **projectileId**，所以飛在空中那顆
    長什麼樣完全由 `content/projectiles/<id>.json` 決定，技能自己的 `vfxKey`
    在飛行途中一點作用都沒有。⇒ 把彈道換成 `spawnVfx` 時，要接手的是**這一格**。

    ⛔ 不要把特效 id 抄進表格：抄一次就多一個住處，而彈道文件改了元素（GH#251
    正在做的事）之後沒有任何東西會紅。
    """
    with open(os.path.join(PROJ_DIR, pid + ".json"), encoding="utf-8") as fh:
        return json.load(fh)["vfxKey"]


def _template_refs(tpl):
    """`ability.template` 的三種合法形狀 → ref 清單（normalizeTemplateBinding 的 py 版）。"""
    if tpl is None:
        return []
    if isinstance(tpl, list):
        return [c.get("ref") for c in tpl if isinstance(c, dict)]
    if isinstance(tpl, dict):
        if "cards" in tpl:
            return [c.get("ref") for c in tpl["cards"] if isinstance(c, dict)]
        return [tpl.get("ref")]
    return []


def old_top_kinds(prev):
    """舊文件**真的會跑**的頂層 effect kind（含模板展開的那一份）。

    ⚠️ 一定要含模板：`godie-e002.e`(20-03) 的舊 effects 是 []，彈道住在
    tpl-line-sweep 裡，而 A-6 明確不把 `template` 帶回來。只讀 prev["effects"]
    會漏掉它 → launchers 停在 52，`toBe(53)` 照樣紅。
    """
    out = []
    for ef in prev.get("effects") or []:
        if isinstance(ef, dict) and isinstance(ef.get("kind"), str):
            out.append(ef["kind"])
    for ref in _template_refs(prev.get("template")):
        if ref in TEMPLATE_PROJECTILE:
            out.append("spawnProjectile")
    return out


def old_projectile_ids(prev):
    """舊文件會射出的彈道 id（inline + 模板展開）。"""
    ids = [
        ef["projectileId"]
        for ef in (prev.get("effects") or [])
        if isinstance(ef, dict) and ef.get("kind") == "spawnProjectile"
    ]
    ids += [
        TEMPLATE_PROJECTILE[r]
        for r in _template_refs(prev.get("template"))
        if r in TEMPLATE_PROJECTILE
    ]
    return ids


def carry_mechanisms(aid, prev, new_effects, row):
    """把舊文件的非酬載機制接回新 effects，並記一筆稽核給 main() 的閘。

    決策點（CLAUDE.md 第一守則：拿不定主意的決策做成欄位，不要在註解裡辯護）
    —— 表格那一列可以填：
      · 不填            → 沿用（預設；沉默 ≠ 移除）
      · projectile="deliver" → 彈道**載著**新酬載飛（onHit = 規格的效果）。
        ⚠️ 這會把整包效果關在「命中才發生」後面，自身增益型的技能填了就壞掉，
           所以⛔ 不是預設。這一批 90 支**一列都沒有填**，是留給 owner 的旋鈕。
      · cosmetic_projectile="<projectileId>" → 那顆彈道**只是視覺**：退場，改掛一顆
        指向**同一份彈道文件 vfxKey** 的 `spawnVfx`（見 {@link projectile_vfx}）。
      · retire={"spawnProjectile": "理由"} → 這一列**明說**要讓它退場（留紙本痕跡）

    ── ⭐ `cosmetic_projectile` 為什麼存在（GH#375，量到的，⛔ 不是潔癖）─────────

    A-5「沉默 ≠ 移除」把舊 w3x 文件的彈道沿用了回來，但新版規格從頭到尾沒有點名
    過任何一顆彈道 ⇒ 沿用回來的那些 `onHit` 是**空的**。而一顆 `onHit: []` 的
    **技能**彈道**不是**無害的裝飾 —— `sim/systems/ProjectileSystem.ts` 對
    `origin` 帶 `ability:` 前綴的彈道，在命中時**除了跑 onHit 還做兩件事**：

      ① `recordAbilityHit(world, owner, bestId)` —— 戰績記一筆**假命中**
      ② `fireHooks(world, owner, "onAbilityHit", bestId, proj.abilitySlot)`
         —— **真的觸發** onAbilityHit 掛勾（增益卡／天生技），
            而這支技能在施法當下已經由 `abilitySystem` 發過一次了 ⇒ **重複觸發**
      ③ 一顆都沒打到時 `recordAbilityWhiff` —— 戰績再記一筆假落空

    ⚠️ `pierce: true` 的那幾顆是**穿過幾個人就各做一次**。
    ⇒ 這是「說了但不會發生」的**反面**：沒有人說，但它真的在發生。

    前例（同一個修法，2026-08-13）：15-04 雷天大壯。貳式 用 `retire=` 讓那顆
    `imported.bolt.lightning` 退場、視覺改掛 `spawnVfx`。這一格是把那次的逐支
    處置變成**一個旋鈕**（第零守則⑨：N 個同型 = K 個模板 + 一張表）。

    `at` 是**推導**的，⛔ 不是一列一列填：`castType: "self"` 的技能沒有落點
    （`spawnProjectile` 當初就是往 `t.facing` 亂射的），所以掛在施法者身上；
    其餘（ground / targeted）掛在落點 —— 那正是傷害結算的地方。
    """
    retire = row.get("retire") or {}
    new_kinds = [n.get("kind") for n in new_effects if isinstance(n, dict)]
    pre, post, carried, dropped = [], [], [], []

    old_invuln = [
        ef
        for ef in (prev.get("effects") or [])
        if isinstance(ef, dict) and ef.get("kind") == "invulnerable"
    ]
    if old_invuln and "invulnerable" not in new_kinds:
        if "invulnerable" in retire:
            dropped.append("invulnerable")
        else:
            # ⭐ 逐字沿用：`durationSec` 是 JASS 量到的窗口（52-02 的 1.05 /
            #    52-002 的 1.5，出處記在 invulnerableBinding.test.ts 的
            #    EXPECTED_BOUND 註解），四個決策點
            #    (applyTo/blocksDamage/blocksTrueDamage/blocksControl) 也必須
            #    明寫 —— 那支守衛有一條專門在守「絕不靠繼承預設值」。
            #    ⚠️ 排在**最前面**：施法瞬間就要擋得住。
            pre.extend(dict(x) for x in old_invuln)
            carried.append("invulnerable")

    pids = old_projectile_ids(prev)
    cos = row.get("cosmetic_projectile")
    if cos:
        # ⭐ 退場的是**碰撞體**，不是畫面：外觀本來就住在彈道文件的 vfxKey 上
        #    （GH#251），所以 spawnVfx 指同一份 = 同一個元素的粒子照樣播，
        #    而假命中／重複掛勾／假落空三件事一起沒了。
        # ⚠️ 這一格**刻意不讀 `prev`**（其餘的 A-5 沿用都讀）。第一版讀了 `prev`，
        #    結果第一次跑完之後舊文件裡的 `spawnProjectile` 就沒了 ⇒ 第二次跑
        #    `pids` 是空的 ⇒ spawnVfx 整顆消失。`skillRemakeJsonFresh` 的
        #    `--check` 當場抓到（6 份不一致）——**一個不冪等的產生器就是一顆
        #    定時炸彈**：下一個人為了別的事重跑一次，這 6 支的特效就無聲不見了。
        post.append(
            {
                "kind": "spawnVfx",
                "vfxId": projectile_vfx(cos),
                "at": "self" if row["cast"] == "self" else "point",
            }
        )
        COSMETIC_LOG[aid] = [f"{cos} → {projectile_vfx(cos)}"]
        if pids:
            # 只有**還看得到舊彈道的那一次**才對得起來 —— 對完之後這條自己退場。
            assert cos in pids, f"{aid}: cosmetic_projectile={cos} 不在舊文件的 {pids} 裡"
            dropped.append("spawnProjectile")
    elif pids and "spawnProjectile" not in new_kinds:
        if "spawnProjectile" in retire:
            dropped.append("spawnProjectile")
        else:
            for pid in pids:
                # ⛔ **不要**把舊的 onHit 帶回來 —— 那是**舊酬載**（舊的傷害
                #    數字），帶回來等於同一支技能打兩次，而且數字還是過期的。
                #    沿用的只有「這支技能射出哪一顆彈道」這件事，也就是 GH#251
                #    在守的那條元素綁定（技能 vfxKey 的元素 = 彈道文件的元素）。
                post.append(
                    {
                        "kind": "spawnProjectile",
                        "projectileId": pid,
                        "onHit": list(new_effects) if row.get("projectile") == "deliver" else [],
                    }
                )
            carried.append("spawnProjectile")

    body = post if (row.get("projectile") == "deliver" and post) else list(new_effects) + post
    final = pre + body
    AUDIT[aid] = {
        "prev_kinds": sorted(set(old_top_kinds(prev))),
        "carried": carried,
        "dropped": dropped,
    }
    return final


# ─────────────────────────────────────────────────────────────────────────────
# 90 支的表。每一列 = (編號, 名稱, castType, cooldown[], manaCost[], range,
#                    描述, effects/passive/…)
# 描述逐字取自 owner 的「英雄技能第一批重製」，⛔ 不改寫。
# ⭐ 這裡只有**空的容器與登記函式** —— 90 列本身住在 `heroes/<champion-id>.py`，
#    由 `batch1.py::load_heroes()` 依 `HERO` 的宣告序載進來（⚠️ 那個順序就是 T 的
#    順序，而 T 的順序決定 `emit_spec_md.py` 產出的並排文件長什麼樣）。
# ─────────────────────────────────────────────────────────────────────────────
T = []


def A(num, name, cast, cd, mp, rng, desc, **kw):
    T.append(dict(num=num, name=name, cast=cast, cd=cd, mp=mp, rng=rng, desc=desc, **kw))


# ─────────────────────────────────────────────────────────────────────────────
def build(e):
    num = e["num"]
    hero = num.split("-")[0]
    cid = HERO[hero]
    # ⭐ 槽位是**查**出來的，不是從編號後綴算出來的（見 `slot_suffix`）。
    #    ⚠️ 下面的 `prev` 是用 `aid` 去讀舊文件搶救 icon / vfxKey / sfxKey /
    #    hitFeel / telegraph 的，所以算錯槽位不只是標籤錯 ——
    #    **圖示與特效會一起對調**。
    suffix = slot_suffix(num)
    aid = f"{cid}.{suffix}"
    slot = SLOT_OF_SUFFIX[suffix]
    mr = e.get("maxRank", 4 if slot in ("Q", "W", "E") else (3 if slot == "R" else 1))
    if slot in ("PASSIVE", "EX"):
        mr = 1
    cd = [float(x) for x in e["cd"]]
    mp = [float(x) for x in e["mp"]]
    while len(cd) < mr:
        cd.append(cd[-1])
    while len(mp) < mr:
        mp.append(mp[-1])
    # ⭐ 沿用**既有**文件的欄位。重製換的是**機制**，不是圖示、特效、音效與
    #   施法手感 —— 見檔頭 SPEC_OWNED / RETIRED 那張明表：
    #     · SPEC_OWNED  = 規格重新定義的，舊值不算數
    #     · RETIRED     = 規格刻意讓它退場的，丟掉但**印出來**
    #     · 其餘        = 一律原樣保留（icon / vfxKey / sfxKey / vfxLayers /
    #                     hitFeel / interruptOn / recoverySec / 以及未來任何一格）
    #   ⛔ 不要改回「列幾個欄位名複製」：那是 allowlist，它上一次漏掉了
    #      sfxKey 與 vfxLayers（產生器自己的註解說要沿用美術綁定，卻沒沿用音效），
    #      而且**沒有任何東西會紅**。
    prev = {}
    prev_path = os.path.join(AB, f"{aid}.json")
    if os.path.exists(prev_path):
        prev = json.load(open(prev_path, encoding="utf-8"))
    doc = {
        "id": aid,
        "schema": "ability@1",
        "name": e["name"],
        # ⭐【這一份是階梯第 1 層】—— 2026-08-13 事故的直接修法。
        #    461 份 ability 文件裡只有這 90 支是 owner 新版技能說明，其餘 371 支
        #    是 w3x 匯入的文案（第 4 層），而在這一格出現之前**兩者長得一樣權威**：
        #    29 個頂層欄位沒有任何一個說得出來源。owner：「怎麼會搞混呢?」
        #    ⚠️ 其餘 371 支由 `tools/skill-remake/stamp_provenance.py` 蓋 w3x-import，
        #    兩邊必須一致 —— 守衛 `content/abilityProvenance.test.ts` 在對。
        "provenance": "owner-spec",
        "description": e["desc"],
        "slot": slot,
        "castType": e["cast"],
        "maxRank": mr,
        "cooldown": cd[:mr],
        "manaCost": mp[:mr],
        "range": float(e["rng"]),
    }
    if slot == "PASSIVE":
        doc["innateKind"] = e.get("innate", "passive")
        # ⭐ G13-1 —— **主動型**天生技的 passive 區塊要不要也掛上去。
        #    ⛔ 省略 = 舊行為（`abilityPassives.ts` 直接 continue，那個區塊一格都不生效）。
        #    ⚠️ schema 的 refineInnate 兩個方向都關死：只有 slot PASSIVE +
        #    innateKind active 才收，而且要真的有 passive 區塊。
        #    ⚠️ **明示**才生效是刻意的：沒有這一格而帶著 passive 區塊 = 無聲的死內容，
        #    而 `innatePassive.test.ts` 現在就是照這條在守。
        if e.get("innate_active_passive"):
            doc["innateActivePassive"] = e["innate_active_passive"]
    if e.get("radiusTier"):
        doc["radiusTier"] = e["radiusTier"]
    # ⭐ 吟唱五級距（GH#943）：填了就寫，載入時 resolveCastTimeTierOnDoc 翻成秒（級距贏過 castTimeSec）。
    #    ⛔ castTimeSec 仍由 deriveCastTime() 算（RETIRED 那一格的規則不變）—— 這一格只是「作者說要哪一級」。
    if e.get("castTimeTier"):
        doc["castTimeTier"] = e["castTimeTier"]
    doc["targetsEnemies"] = e["cast"] != "self" or bool(e.get("radiusTier"))
    # A-5：規格寫的是**酬載**；舊文件上規格沒點名的**非酬載機制**（彈道 / 無敵窗）
    #      在這裡接回來。⛔ 這一行要緊貼在 effects 指派之後 —— 後面任何一步再動
    #      `doc["effects"]` 都會被 main() 的閘抓到（它比對最終寫出去的那份）。
    doc["effects"] = carry_mechanisms(aid, prev, e.get("effects", []), e)
    # ── A-1：[變身]/[切換] → championForm ────────────────────────────────
    # ⛔ 表格裡不可以再手打 championForm。79-04 就是這樣活下來的 ——
    #    一格手打讓另外四支的缺口整整沒有人發現。
    assert not any(
        isinstance(x, dict) and x.get("kind") == "championForm" for x in doc["effects"]
    ), f"{num}: ⛔ 不要在表格裡手打 championForm，它由標籤 + w3x transform 連結推導"
    tags = lead_tags(e["desc"])
    to = next((v for k, v in FORM_TAG_TO.items() if k in tags), None)
    if to is not None and FORM_TRIGGERS.get(num) == cid:
        form = {"kind": "championForm", "to": to}
        if to == "alternate":
            # w3a `ahdu`（可以是逐階陣列，schema/effect.ts 的 zRankScalar）。
            assert "form_sec" in e, f"{num} 是 [變身] 技，必須填 form_sec=（規格印的持續秒數）"
            form["durationSec"] = e["form_sec"]
        else:
            # ⭐ 切換**沒有** durationSec —— 缺席才是 FORM_NEVER_EXPIRES
            #   （ChampionFormSystem.ts）。championFormToggle.test.ts 有一條
            #   叫「a toggle is not a 15-second buff」就是在守這一格。
            assert "form_sec" not in e, f"{num} 是 [切換] 技，⛔ 不可以有 form_sec"
            # 切換沒有時鐘，所以帶 duration 的 payload 掛上去必然對不上：
            # 關掉之後還在，或開著卻先退掉（失敗形態②）。開著期間要給什麼，
            # 寫在 passive.ranks[].whileForm 或 toggle.whileOn。
            assert not any(
                isinstance(x, dict) and x.get("kind") in ("applyBuff", "applyStatus")
                for x in doc["effects"]
            ), f"{num} 是 [切換] 技，effects 不可以有 applyBuff/applyStatus（切換沒有時鐘）"
        doc["effects"].insert(0, form)
        FORMS_EMITTED[num] = aid
    if e.get("passive"):
        doc["passive"] = e["passive"]
        # ⭐ B2-N —— 形態閘。「卍解狀態下額外…」這一族在此之前寫不出來：
        #    `passive.ranks[].whileForm`（effect.ts:4020，enum any/base/alternate）
        #    在表格裡**沒有出口**，於是變身後才有的天賦變成從第一秒就常駐。
        #    ⚠️ `setdefault`：手填的特例仍然贏。
        wf = e.get("while_form")
        if wf:
            assert wf in ("any", "base", "alternate"), f"{num}: while_form 只能是 any/base/alternate"
            for rk in doc["passive"].get("ranks", []):
                if isinstance(rk, dict):
                    rk.setdefault("whileForm", wf)
    if e.get("mark"):
        doc["marks"] = [e["mark"]]
    # 【切換】的開／關兩態（schema/ability.ts 的 zAbilityToggle）。今天只有
    # 20-01 用得到，理由見那一列的註解（`heroes/godie-e002.py`）—— ⛔ 70-00 不可以有。
    if e.get("toggle"):
        doc["toggle"] = e["toggle"]
    # ⭐ B4-K —— `ability-augment@1`：一支技能**指名改寫另一支技能的數字**。
    #    引擎三個呼叫點都活著，而全 repo 帶 augment 的技能文件在此之前是 **0 份**。
    #    ⛔ 目標是硬參照（`zRef("abilities")`），打錯字在 validateReferences 就被擋，
    #       ⛔ 不是名稱文字反推、也不是 JSON Pointer（重排 hooks 會指到隔壁效果）。
    if e.get("augment"):
        doc["augment"] = e["augment"]
    # ── 美術綁定的**覆寫閘**（`vfx_key=`）────────────────────────────────
    # A-6 的規則是「規格沒有重新定義的欄位，一律原樣保留」，而 `vfxKey` 不在
    # SPEC_OWNED 裡 ⇒ 舊文件的值一路繼承下來。那對 90 支裡的絕大多數是對的
    # （重製換的是機制不是美術），但**元素講錯**的那幾格不是美術偏好，是內容缺陷：
    # 一支內文講火的技能掛著雷電特效，玩家分不出三支變身技是哪一種（15-03）。
    # ⛔ 這裡刻意是一格**表格欄位**（同 radiusTier / mark / augment / toggle），
    #    不是「if 這支技能就換特效」—— 逐支 if 是第〇·五守則的紅線。
    # ⚠️ 位置必須在下面那個 `doc.setdefault(k, v)` **之前**：setdefault 不會覆蓋
    #    已經存在的鍵，所以先填就是贏；放到迴圈後面則永遠是舊值贏（靜默失效）。
    if e.get("vfx_key"):
        doc["vfxKey"] = e["vfx_key"]
    # ── 施法特效的**完整堆疊**（`vfx_layers=`）───────────────────────────────
    # ⭐ GH#848：`resolveAbilityVfxSource` 的四階覆蓋裡，`vfx_key=` 填 `fx.prim.*`
    #    仍是**第四階** —— 推導綁定表（第三階，`ability-vfx-bindings.json`）照樣
    #    蓋掉它。只有**第一階（作者自己的 `vfxLayers`）**壓得過表。20-01 風王結界
    #    就是這一格存在的理由：A0DZ 的 w3a art:caster 是 HolyAwakening 整組 6 顆，
    #    表照證據綁上去，而 owner 2026-08-28 逐字「風王結界特效太奇怪、太濃 且太久」
    #    —— 階梯第 1 層（owner 的設計）贏過第 5 層（w3x 原始設定）。
    # ⛔ 同 vfx_key / cooldown_shape / persistent_vfx：一格**表格欄位**，
    #    不是「if 這支技能」（第〇·五守則）。值照 `zAbilityVfxLayers` 的形狀。
    # ⚠️ 位置在 A-6 setdefault **之前**：表格填了就贏。
    if e.get("vfx_layers"):
        doc["vfxLayers"] = [dict(x) for x in e["vfx_layers"]]
    # ── 冷卻查表的**明示形狀**（`cooldown_shape=`）──────────────────────────
    # ⭐ GH#644：59-01 吞噬帶著 devour 的 radius/radiusTier，`tierize` 的推導
    #    （逐字照抄引擎 `cooldownTiers.ts::cooldownShapeOf`）必然判成「範圍」——
    #    而 owner 2026-08-24 裁決它吃**單體**表的 6 秒。兩邊（產生器 tierize 與
    #    引擎 resolve）都以「手填 > 推導」為第一優先，所以出口只需要這一格欄位。
    # ⛔ 同 vfx_key：這是一格**表格欄位**，不是「if 這支技能」（第〇·五守則）。
    if e.get("cooldown_shape"):
        assert e["cooldown_shape"] in ("單體", "範圍", "變身"), \
            f"{num}: cooldown_shape 只能是 單體/範圍/變身"
        doc["cooldownShape"] = e["cooldown_shape"]
    # ── 常駐特效（`persistent_vfx=`）——「這支技能在身上就一直掛著」那一族 ──────
    # ⭐ GH#649：Saber 持劍的金粉閃爍。機制（`ability@1.persistentVfx`，GH#539）與
    #    客戶端（persistentVfxKeysFor → AmbientVfx.buildItem，vfx@1 也收）都已在線上，
    #    缺的只是**表格出口**：90 支重製稿在此之前沒有任何一格寫得出常駐特效。
    # ⛔ 同 vfx_key / cooldown_shape：這是一格**表格欄位**，不是「if 這支技能」
    #    （第〇·五守則）。⚠️ 位置在 A-6 setdefault **之前**：表格填了就贏，
    #    沒填則沿用舊文件的（vfxKey / sfxKey 那一族美術綁定的既定規矩）。
    if e.get("persistent_vfx"):
        doc["persistentVfx"] = e["persistent_vfx"]
    # ── 蝗蟲群 dummy 的 3D 模型（`model_fx=`）—— 原作那一具「特效單位」──────────
    # ⭐ GH#691（#688 Phase 6）：原作把大多數技能演出做成 **locust dummy 單位**
    #    （`CreateUnit` + `AddSpecialEffect` + `UnitApplyTimedLife`），而 GGD 的
    #    對應機制 `spawnModelFx`（#551 / #649 的 `path:"static"`）早就在線上。
    #    缺的只是**表格出口**：這 90 支重製稿在此之前沒有任何一格寫得出
    #    「在這裡擺一具 3D 模型」—— 於是把節點手寫進出貨 JSON 的人會發現它
    #    在下一次 `skillremake:json` 就被打回來（`carry_mechanisms` 只沿用
    #    `invulnerable` / `spawnProjectile` 兩種非酬載機制）。
    # ⛔ 同 vfx_key / persistent_vfx：一格**表格欄位**，⛔ 不是「if 這支技能」
    #    （第〇·五守則）。值是完整的 `spawnModelFx` 節點（modelKey / path /
    #    anchor / scale / tint / lifeSec），由 schema 在載入時驗。
    # ⚠️ **附加**在 effects 末端，⛔ 不取代 —— 它是演出，不是酬載；A-5 的閘讀
    #    最終 doc，所以這一步再動 effects 也逃不掉。
    if e.get("model_fx"):
        doc["effects"] = list(doc["effects"]) + [dict(x) for x in e["model_fx"]]
    # ── A-6：denylist —— 規格沒有重新定義的欄位，一律原樣保留 ──────────────
    for k, v in prev.items():
        if k in SPEC_OWNED:
            continue
        if k in RETIRED:
            DROP_LOG.setdefault(aid, {})[k] = v
            continue
        doc.setdefault(k, v)
    # ── A-8：技能自己發動的 damageArea 要含震央（passive/hooks 裡的不碰）──────
    _own_area(doc["effects"])
    # ── B1-B：兄弟酬載折進 onHitTargets（規則，不是逐列參數）──────────────────
    _fold_onhit(doc["effects"], num)
    # ── B1-O：ground 技的頂層 radiusTier ────────────────────────────────────
    _ground_radius(doc, num)
    # ── B1-M：時序容器的三條閘（只喊，不猜）──────────────────────────────────
    _timing_gates(doc, e, num)
    _set_semantics_gate(doc, e, num)
    # ── ①②③④⑦（owner 2026-08-21）：收進五級距 ──────────────────────────────
    # ⭐ 這 90 支與其餘 330 支走**同一支** `tierize()`（`tools/skill-remake/tierize.py`）。
    # ⛔ 不要在這裡再寫一份規則：兩份會各自腐爛，而它們的分歧長得跟正常一模一樣
    #    （出貨 90 支收了、330 支沒收，或者反過來，而沒有任何東西會紅）。
    # ⚠️ 位置在 `_canonical_order` **之前**是硬性的：`tierize` 會把
    #    `amount` 換成 `{damageTier, flat, …}`，那一步之後才輪到鍵序統一。
    tierize(doc, _TIER_GRIDS(), TIERIZE_LOG.setdefault(aid, []))
    # ── CD_ECHO：「跟這一支自己的主動冷卻一樣」（owner 2026-08-19 對 59-01 吞噬）──
    # ⚠️ 位置在 `tierize` **之後**是硬性的：冷卻在上一行才剛被五級距重寫，
    #    讀它之前的值就會讓「跟主動一樣」停在一個已經不存在的數字上。
    _resolve_cd_echo(doc, num)
    # ── B2：鍵序統一照 Zod 宣告序重排（⛔ 一定要在所有會動 effects 的步驟之後）──
    doc["effects"] = _canonical_order(doc["effects"])
    if doc.get("passive"):
        doc["passive"] = _canonical_order(doc["passive"])
    # ⛔ castTimeSec **不手填** —— `deriveCastTime()` 是唯一來源，
    #    `castTimeCoverage.test.ts` 逐支比對。由 deriveCastTimes 後處理補上
    #    （finalize_content() 會跑它）。
    return cid, slot, doc


