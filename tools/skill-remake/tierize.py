#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""⭐【五級距全轉】—— owner 2026-08-21 ①③④⑦ 的**唯一**實作。

⛔ 這一份是**機制**，不是 420 次編輯（CLAUDE.md 第零守則⑨）。
   兩個呼叫點共用它，所以兩邊不可能漂移：

     · `common.py::build()`      —— 產生器擁有的 90 支，重生成時當場套用
     · `apply_tiers.py`          —— 其餘 330 支直接編的 JSON

   ⚠️ 少了第一個呼叫點，寫進那 90 支的級距會在下一次 `skills:sync`
      **靜默消失**（`common.py:52` 逐字：「⛔ 不讀工作區，這支產生器自己會覆寫
      content/abilities/」）—— 那正是 GH#319 的形狀。

─────────────────────────────────────────────────────────────────────────────
⭐ owner 2026-08-21 的四個裁決，逐字

  ① 「**我們也有升階公式討論過不是嗎 除了冷卻以外 傷害跟耗魔是一起變動的**
     　應該是比較接近 **B 全轉，接受升階只剩 ratios 成長**」
  ③ 「[v] A 都夾」（冷卻 24 支超上限 + 27 支低於下限）
  ④ 「manaCostTier 342 / 78 支免費技 => **那就不要調耗魔阿**」
  ⑦ 「damageTier 204 / 216 支沒有可換算的基礎傷害葉
     　=> **若不是主動傷害技能 就免魔力吧 乾脆點**」

─────────────────────────────────────────────────────────────────────────────
⭐ ① 的兩句話怎麼同時成立（這是這一份最需要說清楚的一格）

「B 全轉」把**基礎值**交給級距，而級距是**一支技能一格** ⇒ 傷害的 `perRank`
消失。owner 同一句話又說「傷害跟耗魔是一起變動的」——那句話講的是**升階公式**：
升一階，傷害漲、耗魔漲、**冷卻不動**（出貨語料實測 185/215 支的 `manaCost` 是遞增
陣列，而 `cooldown` 幾乎全部是常數陣列）。

⇒ 兩句話合起來只有一個解：**耗魔的逐階形狀必須跟著傷害走**。
   傷害的 `perRank` 交出去了，耗魔的 `perRank` 就不可以留著自己漲 ——
   留著就變成「升階只多花錢、不多傷害」，那是把 owner 的連動關係**弄反**。

   ⛔ 但它**不是**「全部壓平成同一個數字」：⛔ 沒有第三張耗魔級距表
   （owner 2026-08-21 00:32「C 上下限 ⇒ ⛔ 不建第三張表」）。每一支保留**自己的**
   耗魔量級，只是把逐階那一維收掉 —— 取**首階**那一格（最便宜的那一個）。

   ⭐ 為什麼是首階而不是滿階：這是同一句話的直接推論。升階已經不再給傷害回報了，
   ⇒ 它就**不可以繼續漲價**；取滿階＝「升一階只多花錢、不多傷害」，那正是 owner
   說的連動關係被**弄反**的樣子。⚠️ 而且它有一道硬閘在守 ——
   `abilityAffordableAtUnlock.test.ts`（首階 MP 超過當時的魔力池 = 那顆鈕永遠按不下去）
   對「取滿階」實測是紅的。

   三軸落地之後升階還剩什麼：
     · 傷害 —— `ratios` / `attrRatios`（＝ AP/AD 成長）。owner：「接受」
     · 耗魔 —— 無（跟著傷害一起交出去）
     · 冷卻 —— 本來就沒有（owner：「除了冷卻以外」）

─────────────────────────────────────────────────────────────────────────────
⭐ 「往前靠還是往後靠」是**推導**的，⛔ 不是一個全域常數

owner 2026-08-21 00:32：
> 「應該是用**我們算出來的 600/1500/3000/4500/6000 作為基礎來算**吧，
>  記得要 **script 自動化**」

⇒ 界線**逐支**：一支技能的**傷害級距索引** i_d 對上它的冷卻落在哪兩根橫木之間
   (j, j+1)：`i_d >= j+1` ⇒ 往後靠（長冷卻），否則往前靠（短冷卻）。
   ⭐ 這樣級距表一改，界線自己跟著動 —— ⛔ 不是一個當時量到的絕對值
   （那種數字會**用錯誤的訊息**過期：技能靠錯邊而沒有任何東西會紅）。
   ⚠️ 沒有傷害的技能 i_d = 0（＝最低）⇒ 一律往前靠。輔助技能放勤一點是對的方向。

─────────────────────────────────────────────────────────────────────────────
⚠️ 原始欄位**一格都不刪**

`enabled: false` 是止血閥（`cooldown-tiers` / `damage-tiers` / `range-tiers` /
`aoe-tiers` 四張表各一格）。刪掉原始值之後拉止血閥 = 420 支技能沒有冷卻、沒有
傷害。⇒ 這一份**同時寫兩格**：級別 + 與級別**逐位元相等**的原始值。
守衛 `packages/shared/src/content/tierRawParity.test.ts` 兩個方向都關。
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CFG = os.path.join(ROOT, "content", "config")

#: 五個級別。⛔ 不要在這裡另立一組 —— 它與 `packages/shared/src/content/skillTiers.ts`
#: 的 `SKILL_TIER_NAMES` 是同一份，四張表的鍵名都是它。
TIER_NAMES = ("極小", "小", "中", "大", "極大")

#: 傷害型 effect 的 kind。⭐ 與 `tierSnap.ts` 的 `DAMAGE_KINDS` 同一份名單。
DAMAGE_KINDS = frozenset(
    {"damage", "damageArea", "damageLine", "dot", "damageOverTime", "chainLightning"}
)

#: 會產出傷害的模板（`content/ability-templates/`）。⚠️ 模板技的傷害住在
#: `template.params.damage`（一個 `zScaling`），⛔ 不在 `effects` 裡 ——
#: 只掃 effects 會讓 95 支模板技全部被判成「沒有傷害」而免魔（⑦ 誤傷）。
DAMAGE_TEMPLATES = frozenset(
    {
        "tpl-single-strike",
        "tpl-instant-blast",
        "tpl-line-sweep",
        "tpl-ground-nova",
        "tpl-orbit-array",
        "tpl-traveling-wave",
        "tpl-proxy-cast",
    }
)

#: `template.params` 裡屬於「傷害」的參數名。
TEMPLATE_DAMAGE_PARAMS = ("damage", "hitDamage", "tickDamage")


def _load(name):
    with open(os.path.join(CFG, f"{name}.json"), encoding="utf-8") as f:
        return json.load(f)


class Grids:
    """四張出貨表 + 耗魔上下限。⭐ 全部**讀 `content/config/`**，⛔ 沒有字面值。"""

    def __init__(self):
        self.cooldown = _load("cooldown-tiers")["seconds"]  # 形狀 → 級別 → 卡面秒
        self.damage = _load("damage-tiers")["damage"]
        self.range = _load("range-tiers")["range"]
        self.radius = _load("aoe-tiers")["radius"]
        #: ⭐ 耗魔五格改**讀出貨 config**（`config.mana-tiers@1`，2026-08-21）——
        #: 在它之前這裡是拿正則去挖 `balanceAnchorsDerived.ts`，那是**第三個住處**
        #: 而且沒有任何東西在守它。現在三個住處（content/config · Zod DEFAULT_*
        #: · admin SHIPPED_*）之間本來就有 drift 測試。
        self.mana = _load("mana-tiers")["manaCost"]

    def mana_row(self):
        return [float(self.mana[t]) for t in TIER_NAMES]

    def cd_row(self, shape):
        return [float(self.cooldown[shape][t]) for t in TIER_NAMES]

    def dmg_row(self):
        return [float(self.damage[t]) for t in TIER_NAMES]


#: ⛔ `_mana_band()` 已經退場（2026-08-21）—— 它拿正則去挖
#: `balanceAnchorsDerived.ts` 反算兩端，那是耗魔數字的**第三個住處**，
#: 而且沒有任何東西在守它。現在直接讀 `content/config/mana-tiers.json`
#: （Zod `DEFAULT_MANA_TIERS` 與 admin `SHIPPED_*` 之間本來就有 drift 測試）。


def hook_icd(tier="極小", shape="單體"):
    """一條 hook 的**內部冷卻**（`hook.internalCooldown`）—— ⭐ 從冷卻表推導。

    ⚠️ ⛔ **兩個欄位是兩把不同的尺**，而它們長得一模一樣：

      | 欄位 | 單位 | 誰乘 `combatEnv.cooldown`（出貨 0.2）|
      |---|---|---|
      | `ability.cooldown[]` | **卡面秒** | 引擎（⇒ 60 卡面秒 = 12 實際秒）|
      | `hook.internalCooldown` | **實際秒** | ⛔ 沒有人（`sim/effects/hookIcd.ts`）|

    ⇒ 逐字抄一個卡面秒進 `internalCooldown` 會讓玩家等 **5 倍**久，而卡片、schema、
      測試全部正常。⚠️ 這**已經發生在出貨內容裡**：59-00 暴走 `cooldown:[150]`
      （＝30 實際秒）配 `internalCooldown: 150.0`（＝150 實際秒）。
    ⇒ 這一支把換算收成**一個住處**：填級距名，換算它自己做。
    """
    cd = _load("cooldown-tiers")["seconds"][shape][tier]
    mult = _load("combat-env")["multipliers"]["cooldown"]
    return round(float(cd) * float(mult), 3)


# ─────────────────────────────────────────────────────────────────────────────
# 讀取：一支技能的招牌傷害、形狀、是不是主動傷害技
# ─────────────────────────────────────────────────────────────────────────────
#: 「載體節點」的門檻。⚠️ ⛔ 這不是一個魔術數字，是這個 repo 的**既有慣例**：
#: 一顆 `damageArea{amount:{flat:1.0}, onHitTargets:[…]}` 的工作是**送狀態**，
#: 那個 1 點傷害只是為了讓圈成立。把它當成「基礎傷害」收進級距 ⇒ 一支純控場技
#: 變成 600 傷害的核彈（實測命中 70-03 木束縛之術 / 79-01 瞬步 / 92-04 馬勒戈壁 /
#: 45-002 天照）。owner 2026-08-21 的帳本本來就把它排除在「可換算的基礎傷害葉」外。
#: ⭐ 2026-08-21 起它是**後台一格**（`config.skill-normalize@1.carrierBaseMax`）——
#: ⛔ 這裡不再寫死 1.0。三個住處：content/config · Zod `DEFAULT_SKILL_NORMALIZE`
#: · admin `SHIPPED_*`，而 `skillNormalize.ts::axisVerdicts` 讀同一格 ——
#: 兩邊分岔的後果是「閘要求填級別、寫入器判它是載體不填」的死迴圈。
CARRIER_BASE_MAX = float(_load("skill-normalize")["carrierBaseMax"])


def _scaling_base(amount):
    """一個 `zScaling` 的**可換算基礎值**（flat + 滿階 perRank）。沒有就 None。

    ⛔ 不看 `ratios` / `attrRatios`：那兩條是**成長**（取決於玩家那一場的裝備），
       ⛔ 不是卡面基礎值 —— 級距取代的是基礎值那一格。
    """
    if not isinstance(amount, dict):
        return None
    flat = amount.get("flat")
    per = amount.get("perRank")
    if flat is None and not per:
        return None
    v = float(flat or 0.0)
    if per:
        v += max(float(x) for x in per)
    return v


def damage_leaves(doc):
    """`(基礎值, 那個 amount dict)` 的清單，深度優先。含模板參數那一支。"""
    out = []

    def walk(node):
        if isinstance(node, list):
            for x in node:
                walk(x)
            return
        if not isinstance(node, dict):
            return
        if node.get("kind") in DAMAGE_KINDS and isinstance(node.get("amount"), dict):
            b = _scaling_base(node["amount"])
            if b is not None and b > CARRIER_BASE_MAX:
                out.append((b, node["amount"]))
        for v in node.values():
            walk(v)

    walk(doc.get("effects", []))
    tpl = doc.get("template")
    if isinstance(tpl, dict) and tpl.get("ref") in DAMAGE_TEMPLATES:
        params = tpl.get("params") or {}
        for key in TEMPLATE_DAMAGE_PARAMS:
            b = _scaling_base(params.get(key))
            if b is not None and b > CARRIER_BASE_MAX:
                out.append((b, params[key]))
    return out


def _mentions(node, names):
    """⚠️ **鍵名與 `kind` 值兩種都要看** —— 理由逐字同 `cooldownTiers.ts::mentions`：
    `radiusTier` 是**鍵**而變身是 `{kind:"championForm"}`（一個**值**），
    只掃鍵名會讓變身技拿到便宜一半的單體冷卻表，⛔ 而且沒有任何東西會紅。"""
    if isinstance(node, list):
        return any(_mentions(x, names) for x in node)
    if not isinstance(node, dict):
        return False
    for k in names:
        if node.get(k) is not None:
            return True
        if node.get("kind") == k:
            return True
    return any(_mentions(v, names) for v in node.values())


def cooldown_shape(doc):
    """哪一張冷卻表。⭐ 規則逐字照抄 `cooldownTiers.ts::cooldownShapeOf`
    （手填 > championForm > radius/radiusTier > 單體），⛔ 不要在這裡另立一套 ——
    兩邊分岔的後果是內容填了「中」而引擎查另一張表。"""
    explicit = doc.get("cooldownShape")
    if explicit in ("單體", "範圍", "變身"):
        return explicit
    if _mentions(doc, ["championForm"]):
        return "變身"
    if _mentions(doc, ["radius", "radiusTier"]):
        return "範圍"
    return "單體"


def is_active(doc):
    """有沒有**施放路徑**。⚠️ ⛔ 不是「slot 不是 PASSIVE」——
    天生技槽裡有 16 支帶著 `effects` 的主動技（例 02-00 淨化、44-00 機警），
    用槽位判會把它們全部誤判成被動。"""
    return bool(doc.get("effects")) or bool(doc.get("template"))


def _is_carrier(node):
    """這顆傷害節點是不是**載體**（只為了送狀態而存在的 1 點傷害）。

    ⚠️ 判準要與 {@link damage_leaves} 一致：那邊不把載體收進級距，這邊就不可以
    把它當成「這是一支傷害技」—— 兩邊分岔的後果是 79-01 瞬步這種
    「衝刺 + 破魔標記 + 1 點傷害」被判成傷害技而繼續收 120 魔，
    而它在傷害那一軸被判成沒有傷害。同一支技能，兩個相反的結論。
    """
    amount = node.get("amount")
    if not isinstance(amount, dict):
        return False  # 沒有 amount（例如只有 hpPct 的百分比傷害）⇒ 當成真的傷害
    if amount.get("ratios") or amount.get("attrRatios"):
        return False  # 純成長型傷害仍然是傷害
    b = _scaling_base(amount)
    return b is not None and b <= CARRIER_BASE_MAX


def is_damage(doc):
    """施放時會不會造成傷害（⑦ 的判準）。⚠️ 與「有沒有可換算的基礎傷害葉」是
    **兩件事**：純 `ratios` 的技能沒有葉子可換算，但它**是**主動傷害技 ⇒ 保留耗魔。"""
    found = []

    def walk(node):
        if isinstance(node, list):
            for x in node:
                walk(x)
            return
        if not isinstance(node, dict):
            return
        if node.get("kind") in DAMAGE_KINDS and not _is_carrier(node):
            found.append(node)
        for v in node.values():
            walk(v)

    walk(doc.get("effects", []))
    if found:
        return True
    tpl = doc.get("template")
    return isinstance(tpl, dict) and tpl.get("ref") in DAMAGE_TEMPLATES


# ─────────────────────────────────────────────────────────────────────────────
# 靠攏
# ─────────────────────────────────────────────────────────────────────────────
def nearest_index(value, grid):
    """最近的一根橫木，平手往**低**（便宜那邊）。⛔ 不是「無條件進位到下一格」——
    那會在一條起點 600 的梯子上把整批傷害再往上推一級。"""
    best, bi = None, 0
    for i, g in enumerate(grid):
        d = abs(g - value)
        if best is None or d < best - 1e-9:
            best, bi = d, i
    return bi


def snap_index(value, grid, damage_index):
    """一個秒數落在梯子的哪一格。⭐ 兩端**夾**（owner ③「A 都夾」），
    中間看傷害級距（owner 00:32「用 600/1500/… 作為基礎來算」）。"""
    if value <= grid[0]:
        return 0, "低於下限⇒夾"
    if value >= grid[-1]:
        return len(grid) - 1, "超過上限⇒夾"
    for i, g in enumerate(grid):
        if abs(g - value) < 1e-9:
            return i, "已在格點"
    j = max(i for i, g in enumerate(grid) if g < value)
    if damage_index >= j + 1:
        return j + 1, f"傷害級距 {TIER_NAMES[damage_index]}⇒往後靠"
    return j, f"傷害級距 {TIER_NAMES[damage_index]}⇒往前靠"


# ─────────────────────────────────────────────────────────────────────────────
# 寫入
# ─────────────────────────────────────────────────────────────────────────────
def _rewrite_scaling(amount, tier, value):
    """把一個 `zScaling` 換成「級別 + 逐位元相等的 flat」。

    ⚠️ 鍵序照 `zScaling` 的宣告序（`damageTier` 在最前）—— `abilityScaling.test.ts`
    的 fx-19 已經改成順序無關的深比較，但 `content/champions` 的內嵌鏡射版是
    Zod 重建出來的，序列化成同一個形狀讓 diff 讀得懂。
    ⛔ `perRank` 要**移除**：`resolveDamageTier` 就是這樣做的（級距**取代** flat
    與 perRank，⛔ 不是相加），留著它 = 出貨檔與註冊後的物件不一致。
    """
    rest = {k: v for k, v in amount.items() if k not in ("damageTier", "flat", "perRank")}
    amount.clear()
    amount["damageTier"] = tier
    amount["flat"] = float(value)
    amount.update(rest)


def preview_mirror_radius(doc):
    """頂層 `radius` 是不是效果樹上**另一個幾何鍵的預覽鏡像**。

    ⚠️ 這一格是踩出來的（2026-08-21）：01-02 隕石擊的爆炸半徑住在
    `leap.landRadius`（4.58 ＝ war3map.j:33722 的 250 wc3），而技能的頂層
    `radius` 只是**畫給玩家看的那個圈**，逐位元組等於它。
    把頂層那一格獨立收進級距（4.58 → 4.5）之後，⛔ **預覽圈與真正的爆炸圈
    說了兩句話** —— 76-04 巨人迴旋彈更誇張：6.97 → 6，預覽圈小了 14%。
    ⚠️ 這**不是保真度問題**（那是階梯第 3 層，設計贏得了它），是**內部一致性**
    問題：兩個欄位描述同一個圓，⛔ 不可以只動一個。

    ⇒ 判準是**結構推導**的：頂層 `radius` 的值等於效果樹上任何一個
    `*Radius`（⛔ 不含 `radius` 本身）⇒ 它是鏡像，這一軸**不收級距**
    （`landRadius` 那一軸今天還沒有級距表 —— 有了再一起收）。
    ⛔ 不是一張「這四支例外」的名單：明天多一支 leap 技能自動拿到同樣的判斷。
    """
    r = doc.get("radius")
    if not isinstance(r, (int, float)):
        return None
    found = []

    def walk(n):
        if isinstance(n, list):
            for x in n:
                walk(x)
            return
        if not isinstance(n, dict):
            return
        for k, v in n.items():
            if k != "radius" and k.endswith("Radius") and isinstance(v, (int, float)):
                found.append((k, float(v)))
            walk(v)

    walk(doc.get("effects"))
    for k, v in found:
        if abs(v - float(r)) < 1e-9:
            return k
    return None


def _assign_geometry_tiers(doc, grids, log):
    """②b【沒有級別的幾何，**從現值長出一格級別**】—— 五級距全轉的最後一哩。

    ⚠️ 這一段補的是一個**看不見**的洞：`_apply_geometry` 只做「級別 → 值」，
    所以一支從來沒填過級別的技能，它那個從 w3a 換算來的自由數字**永遠不會**被
    級距表碰到 —— 級距表怎麼改它都一動不動，⛔ 而且沒有任何東西會紅。
    量到的（2026-08-21）：`radiusTier` 96 支適用只有 31 支填了、`rangeTier` 194
    支適用只有 186 支填了。

    ⭐ 哪些節點可以掛 `radiusTier` 是**推導**的，⛔ 不是一張名單：
      · 技能**頂層**（`ability@1` 有這一格）
      · 任何 **effect 節點**（有 `kind`）—— 實測 `schema/effects/` 裡每一份帶
        `radius:` 的檔案**都**帶 `radiusTier`，所以「有 kind + 有 radius」等價於
        「Zod 收得下」。
    ⛔ **不碰** `template.params.radius`：那一格的單位是 **wc3u**
      （`tpl-ground-nova` 的 `params.radius.unit == "wc3u"`，出貨值 224.5），
      而級距表的單位是場地單位（決鬥區半徑 24）。填進去 = 圈從 224.5 wc3u 變成
      8 場地單位，⛔ 而兩邊都不會有任何東西紅。
    ⛔ 也不碰 `auras[]` / `deathWard`：它們不是 effect，Zod 上沒有這一格。
    """
    rng = doc.get("range")
    if doc.get("rangeTier") is None and isinstance(rng, (int, float)) and rng > 0:
        grid = [float(grids.range[t]) for t in TIER_NAMES]
        i = nearest_index(float(rng), grid)
        doc["rangeTier"] = TIER_NAMES[i]
        log.append(("range-tier", rng, grid[i], TIER_NAMES[i]))

    grid_r = [float(grids.radius[t]) for t in TIER_NAMES]

    def assign(node):
        r = node.get("radius")
        if node.get("radiusTier") is None and isinstance(r, (int, float)) and r > 0:
            i = nearest_index(float(r), grid_r)
            node["radiusTier"] = TIER_NAMES[i]
            log.append(("radius-tier", r, grid_r[i], TIER_NAMES[i]))

    # 頂層 —— ⛔ 除非它只是另一個幾何鍵的**預覽鏡像**（見 `preview_mirror_radius`）
    if preview_mirror_radius(doc) is None:
        assign(doc)

    def walk(node, under_template):
        if isinstance(node, list):
            for x in node:
                walk(x, under_template)
            return
        if not isinstance(node, dict):
            return
        if not under_template and isinstance(node.get("kind"), str):
            assign(node)
        for k, v in node.items():
            walk(v, under_template or k == "template")

    for k, v in doc.items():
        walk(v, k == "template")


def _apply_geometry(doc, grids, log):
    """②【以級距為準，改 JSON】—— owner 2026-08-21「[v] A 以級距為準，改 JSON」。

    ⭐ 這是**一條規則**不是 20 個修補：填了級別的節點，它的原始數值一律由級別
    決定。⇒ 未來任何一支再漂移都不可能發生（`resolveRangeTier` 註冊時本來就是
    「級別贏」，所以這只是把出貨檔改成**說實話**）。
    """
    rt = doc.get("rangeTier")
    if rt in grids.range:
        want = float(grids.range[rt])
        if doc.get("range") != want:
            log.append(("range", doc.get("range"), want, rt))
            doc["range"] = want

    def walk(node):
        if isinstance(node, list):
            for x in node:
                walk(x)
            return
        if not isinstance(node, dict):
            return
        t = node.get("radiusTier")
        if isinstance(t, str) and t in grids.radius and isinstance(node.get("radius"), (int, float)):
            want = float(grids.radius[t])
            if node["radius"] != want:
                log.append(("radius", node["radius"], want, t))
                node["radius"] = want
        for v in node.values():
            walk(v)

    walk(doc)


#: ⛔ **fail-open 骨架佔位**，⛔ 不是遊戲內容。`apps/client/src/main.tsx` 在內容
#: 驗證失敗時註冊這兩位（讓首次繪製不被內容擋住），而它們的權威副本是
#: `packages/shared/src/content/*.ts` 裡的 **TS 字面值** —— `loader.test.ts` 逐欄位
#: 比對「JSON 來回一趟等於那份字面值」。⇒ 收它們進級距 = 那條守衛紅，而且紅的
#: 理由是假的（骨架本來就不該有平衡）。owner 2026-08-21 也逐字說過它們不在母體裡：
#: 「Scorch Ring（`sela.e`）排進平衡清單就是因為母體用了檔案數」。
SKELETON_CHAMPIONS = frozenset({"sela", "thorne"})


def tierize(doc, grids=None, log=None):
    """把一份 `ability@1` 收進五級距。**冪等**（再跑一次不會再動）。

    ⚠️ 「冪等」只對**同一條規則**成立：規則改了要先把原始欄位從 git 還原
    （`git show HEAD:<檔>`）再重跑 —— 級距是**取代**基礎值的，跑過一次之後
    逐階那一維已經不在檔案裡了。
    """
    grids = grids or Grids()
    log = log if log is not None else []
    if str(doc.get("id", "")).partition(".")[0] in SKELETON_CHAMPIONS:
        return doc

    # ── ②：幾何。先「值 → 級別」（補上從來沒填過的那些），再「級別 → 值」。
    #    ⚠️ 順序不可以顛倒：反過來的話新填的級別當天不會被寫回原始值，
    #    於是 `tierRawParity.test.ts` 當場紅。
    _assign_geometry_tiers(doc, grids, log)
    _apply_geometry(doc, grids, log)

    # ── ①：傷害。級距取代基礎值，`ratios` 不動（那是 owner 接受的那一半成長）──
    dgrid = grids.dmg_row()
    leaves = damage_leaves(doc)
    if leaves:
        base, amount = max(leaves, key=lambda x: x[0])
        idx = nearest_index(base, dgrid)
        before = amount.get("flat"), amount.get("perRank")
        _rewrite_scaling(amount, TIER_NAMES[idx], dgrid[idx])
        if before != (amount["flat"], None):
            log.append(("damage", before, dgrid[idx], TIER_NAMES[idx]))
    else:
        # 沒有可換算的葉子 ⇒ 用它**有沒有傷害**決定 i_d：純 ratios 的傷害技仍是
        # 傷害技，但它的卡面基礎是 0 ⇒ 落在最低那一格。
        idx = 0

    # ── ①③：冷卻。⛔ 只有真的有冷卻的才填級別（62 支 cd=0 的被動不憑空長冷卻）──
    cd = doc.get("cooldown")
    if isinstance(cd, list) and cd:
        positive = [x for x in cd if isinstance(x, (int, float)) and x > 0]
        if positive:
            shape = cooldown_shape(doc)
            grid = grids.cd_row(shape)
            # ⭐ 參照階是**滿階**（`positive[-1]`），與傷害／耗魔同一階 ——
            #    ⛔ 不是第一階。出貨語料有逐階**遞減**的冷卻（44-03 火車輾過
            #    `[60,50,40,30]`、13-01 暗步 `[4,3,2,1]`），取第一階等於把
            #    那些技能的滿階手感（30 秒）換成一階的（60 秒），而卡片、schema、
            #    測試全部正常 —— 失敗形態②。
            ci, why = snap_index(float(positive[-1]), grid, idx)
            doc["cooldownTier"] = TIER_NAMES[ci]
            if cd != [grid[ci]] * len(cd):
                log.append(("cooldown", list(cd), grid[ci], f"{shape}/{TIER_NAMES[ci]}/{why}"))
            doc["cooldown"] = [grid[ci]] * len(cd)

    # ── ①④⑦：耗魔 ─────────────────────────────────────────────────────────
    mp = doc.get("manaCost")
    if isinstance(mp, list) and mp:
        if all(not x for x in mp):
            # ④ owner：「那就不要調耗魔阿」—— 78 支免費技一格都不動。
            # ⛔ 但級別要拔掉（理由同下面那一支：下界是 1）。
            doc.pop("manaCostTier", None)
        elif not (is_active(doc) and is_damage(doc)):
            # ⑦ owner：「若不是主動傷害技能 就免魔力吧 乾脆點」
            if any(mp):
                log.append(("mana-free", list(mp), 0.0, "非主動傷害技⇒免魔"))
            doc["manaCost"] = [0.0] * len(mp)
            # ⛔ 免費技不可以留著一格級別：`manaCostTier` 的下界是 1，
            #    留著它 = 註冊時 `resolveManaCostTier` 把 0 換成 73，
            #    而卡片、schema、測試全部正常（失敗形態②）。
            doc.pop("manaCostTier", None)
        else:
            # ① 耗魔跟著傷害走：逐階那一維**交出去**（量級保留），而且從
            #    2026-08-21 起它**收進五級距**並寫下 `manaCostTier`。
            #
            # ⚠️ 在此之前這裡只做「取首階 + 夾兩端」，於是 212 支要花魔力的技能
            #    各自停在一個自由數字上 —— `config.mana-tiers@1` 怎麼改它們都
            #    一動不動，⛔ 而且沒有任何東西會紅（`ability@1` 上根本沒有
            #    `manaCostTier` 一格，所以連「漏填」都無從說起）。
            #
            # ⭐ 參照階仍取**首階**（最便宜的那一格），⛔ 不是滿階 —— 這一格是
            #    owner ① 的直接推論：升階已經不再給傷害回報了，那它就**不可以
            #    繼續漲價**。取滿階等於「升一階只多花錢、不多傷害」，那正是他說的
            #    「傷害跟耗魔是一起變動的」被弄反的樣子。
            # ⚠️ 而且它有一道硬閘在守：`abilityAffordableAtUnlock.test.ts`
            #    （「首階 MP 超過持有者當時的魔力池 = 那顆鈕永遠按不下去」）。
            grid = grids.mana_row()
            mi = nearest_index(float(mp[0]), grid)
            v = grid[mi]
            if doc.get("manaCostTier") != TIER_NAMES[mi] or mp != [v] * len(mp):
                log.append(("mana", list(mp), v, f"收進耗魔級距 {TIER_NAMES[mi]}（首階參照）"))
            doc["manaCostTier"] = TIER_NAMES[mi]
            doc["manaCost"] = [v] * len(mp)
    return doc
