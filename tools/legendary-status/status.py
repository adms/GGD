#!/usr/bin/env python3
"""寶具三選一的實作進度表 —— 從 content/ 現況「算出來」，不是手寫的。

    python3 tools/legendary-status/status.py            # 重新產生 docs/_legendary-49-status.md
    python3 tools/legendary-status/status.py --print    # 只印到終端機，不寫檔

為什麼是產生器而不是一份 md
─────────────────────────────────────────────────────────────────────────────
CLAUDE.md 第三守則：註解會說謊。一份手寫的進度表在下一次有人改 content/ 的那一刻
就開始腐爛，而且腐爛的方向永遠是「看起來比實際完成得多」——這正是這一批要消滅的
失敗形態（描述承諾了、資料沒有付）。所以這支工具每次都重讀 content/，逐行比對
owner 寫的「效能」文案與該道具真正帶的 modifiers / passive / auras。

判定規則（每一條「效能」行都會被分類，沒有「略過」這個選項）
─────────────────────────────────────────────────────────────────────────────
  ✅ 已實作   數值行 → 找得到同一條 stat 的 modifier，而且數字對得上
              機制行 → 該標籤要求的 effect kind 真的出現在 passive/auras 裡
  ❌ 未實作   文案講了，資料沒有 —— 玩家抽到會拿不到這一行寫的東西
  📝 已登記   還沒實作，但 authoringNote 有寫清楚缺什麼（不是被忘記，是被記錄）
  ❔ 看不懂   這支工具的規則讀不出來的行 —— **這本身是缺陷**，代表沒有人在檢查它

⚠️ 「✅」只證明「有一個對應的 effect/modifier 存在」，不證明它在戰鬥裡真的正確。
   行為正確性靠 packages/shared 的測試，不靠這張表。
"""
import argparse
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ITEMS = REPO / "content" / "items"
# ⭐ owner 2026-08-18 把上架寶具切成三階。⛔ 這裡列的是檔名，件數一律**算出來**
# —— 標題以前寫死「49 支」，而 owner 每週都在動策展。
POOL_TABLES = ["legendary-weapons", "ex-release-weapons", "ex-origin-weapons"]
POOLS = [REPO / "content" / "loot-tables" / f"{t}.json" for t in POOL_TABLES]
OUT = REPO / "docs" / "_legendary-49-status.md"
STARTER_GO = REPO / "apps" / "platform" / "internal" / "curation" / "starter.go"
ARENA_RULES = REPO / "content" / "config" / "arena-rules.json"

# ── 數值行：文案標籤 → (stat, 是不是百分比寫法) ──────────────────────────────
# owner 2026-08-01 的文案用了比舊池子寬得多的詞彙，全部列在這裡。
# 順序重要：長的標籤要排在短的前面，否則「總生命」會被「生命」吃掉。
STAT_LABELS: list[tuple[str, str, bool]] = [
    # ⚠️ 2026-08-01 修正：這一條原本被我放進 DYNAMIC_RES（「做不到」那一類），
    # 結果把一個**已經正確實作**的欄位報成 ❌（死之王的長槍 ad pctAdd 0.17 ↔
    # 文案「攻擊力額外增加 17%」）。假警報會讓人去追不存在的工作，比漏報更貴。
    ("攻擊力額外增加", "ad", True),
    ("每秒魔力回復速度", "manaRegen", False),
    ("每秒魔力回復", "manaRegen", False),
    ("魔力回復速度", "manaRegen", False),
    ("每秒生命回復", "healthRegen", False),
    ("每秒回復生命", "healthRegen", False),
    ("每秒回魔", "manaRegen", False),
    ("攻擊速度上限", "as", False),
    ("最大生命", "maxHealth", True),
    ("總生命", "maxHealth", True),
    ("最大魔力", "maxMana", True),
    ("總移動速度", "ms", True),
    ("移動速度", "ms", False),
    ("攻擊速度", "as", True),
    ("總 AP 額外", "ap", True),
    ("總AP 額外", "ap", True),
    ("總AP", "ap", True),
    ("總防禦", "armor", True),
    ("總攻擊", "ad", True),
    ("普攻吸血", "lifesteal", True),
    ("全能吸血", "lifesteal", True),
    ("法術強度", "ap", False),
    ("魔法抗性", "mr", False),
    ("攻擊力", "ad", False),
    ("生命", "maxHealth", False),
    ("魔力", "maxMana", False),
    ("裝甲", "armor", False),
    ("防禦", "armor", False),
    ("魔抗", "mr", True),
    ("吸血", "lifesteal", True),
    ("閃避", "evasion", True),
    ("AP", "ap", False),
    ("MP", "maxMana", False),
]

# ── 屬性三圍 ─────────────────────────────────────────────────────────────────
# 力/敏/智 是英雄屬性，不是 Stat 表上的東西（見 sim/stats/statTypes.ts），所以它們
# 永遠不會是一條 modifier。2026-08-01 起 item@1 有了專屬的 `attributes` 區塊
# （ModifierSource.attributes → sim/stats/statPipeline.ts 折進 championStatBase），
# 所以這一族從「明確地做不到」變成「資料對不對得上」——判定方式跟數值行同一套：
# 文案說幾點，`attributes` 就要有幾點。
#
# ⚠️ 這裡**不是**去看 `attributes` 存不存在就給 ✅。存在但數字不對（力量+12 寫成
# {str: 1.2}）是這一批最愛出的那種缺陷：欄位看起來被填了，玩家拿到的是別的東西。
ATTR_RE = re.compile(r"^(力量|敏捷|智慧|力敏智)\s*[+\-]")
ATTR_LINE_RE = re.compile(r"^(力量|敏捷|智慧|力敏智)\s*\+\s*(\d+(?:\.\d+)?)$")
ATTR_KEY = {"力量": ["str"], "敏捷": ["agi"], "智慧": ["int"], "力敏智": ["str", "agi", "int"]}


def attr_backed(doc: dict, line: str) -> tuple[bool, str]:
    """『力敏智+30』『力量+12』↔ doc['attributes']。回 (對得上嗎, 說明)。"""
    m = ATTR_LINE_RE.match(line)
    if not m:
        return False, "讀不出這一行要加幾點三圍"
    want = float(m.group(2))
    have = doc.get("attributes") or {}
    if not isinstance(have, dict) or not have:
        return False, "item@1.attributes 沒有這個區塊"
    missing = [k for k in ATTR_KEY[m.group(1)] if abs(float(have.get(k, 0)) - want) > 1e-9]
    if missing:
        return False, f"attributes 的 {'/'.join(missing)} 與文案的 {want:g} 對不上"
    return True, f"attributes {'/'.join(ATTR_KEY[m.group(1)])} = {want:g}"

# 動態值 —— 數字要在戰鬥中即時算，不是一個常數 modifier。
#
# ⚠️ 每一條都要帶「什麼算實作了」(`need`)，不能只是一句話。
# 2026-08-01 修正：這張表原本每一條都無條件判 ❌，結果把三個**已經實作**的機制
# 報成未實作（奇門盾甲的 onInterval heal、落魂嗜血劍的 hpPct 自傷、死之王意志的
# 減速光環）。這跟先前的「攻擊力額外增加」是同一個錯誤：把「我認為做不到」寫死成
# 「它沒做」。工具要去看資料，不是複誦我的假設。
# `need` 為空 set = 真的沒有原語可以表達。
DYNAMIC_RES: list[tuple[re.Pattern[str], set[str], str]] = [
    (re.compile(r"每秒回復最大生命"), {"heal"},
     "每秒回復『最大生命的 %』= onInterval + heal(ratios maxHealth)"),
    (re.compile(r"每秒損失.*現存生命"), {"damage", "dot"},
     "每秒扣『現存生命的 %』= onInterval + damage(hpPct current)"),
    # 【2026-08-01】資源衍生屬性做出來了 —— StatModifier.fromResource +
    # sim/stats/resourceStats.ts。這一格原本是 set()（「沒有原語」），那在落地之前
    # 是真的；同一個教訓在這份檔案裡已經是**第五次**（神速 / 格擋 / 套裝 /
    # 無視+真實傷害 / 現在這個），所以判準一律是「去看資料」。
    #
    # ⚠️ 只看「有沒有 percentOf」是不夠的：`from: "maxMana"` 也是 percentOf，而它讀
    # 的是**最大**魔力 —— 滿魔時兩者相同，空魔時舊寫法照樣發滿額 AP，也就是這一行
    # 文案的謊話。所以 collect_kinds 專門找 `fromResource`。
    (re.compile(r"AP\s*\+\s*\(?\s*目前\s*MP"), {"__resourceModifier__"},
     "AP 隨**現存** MP 浮動 = StatModifier.fromResource（見 sim/stats/resourceStats.ts）"),
    # 2026-08-01：套裝原語做出來了 —— item@1.sets + sim/economy/itemSets.ts。
    # 這一條原本無條件判 ❌（「目前沒有原語」），跟上面兩條被修正過的一樣，是把
    # 「我認為做不到」寫死成「它沒做」。判準改成看資料：這份文件有沒有 sets 區塊。
    (re.compile(r"死之王套裝"), {"__itemSet__"},
     "套裝加成 = item@1.sets（一套只發一次，見 sim/economy/itemSets.ts）"),
]

# ── 機制行：括號標籤 → 滿足它需要在 passive/auras 裡看到的 effect kind 之一 ──
# 空 set = 這個標籤目前沒有任何原語可以表達，只能靠 authoringNote 登記。
TAG_IMPL: dict[str, set[str]] = {
    # 2026-08-01：`spendMana` 加進來 —— 熾天使之弓的「削去敵方現存 MP 5%」
    # 是一個貨真價實的 on-hit 效果，而它既不是傷害也不是狀態。少了這一格，
    # 一件已經實作的武器會被報成未實作（跟 神速/格擋/套裝 三次一樣的教訓）。
    "On-Hit": {"damage", "damageArea", "damageLine", "dot", "applyStatus", "applyBuff",
               "heal", "restore", "spendMana"},
    "OnHit": {"damage", "damageArea", "damageLine", "dot", "applyStatus", "applyBuff"},
    "擴散": {"damageArea"},
    # 「周圍敵方 …減半」是光環，不是命中觸發 —— 兩種形狀都算實作。
    # (2026-08-01: 只列 applyStatus/applyBuff 讓死之王的意志那條減速光環被誤報成未實作。)
    "緩慢": {"applyStatus", "applyBuff", "__aura__"},
    "暈眩": {"applyStatus"},
    # 【2026-08-01】疊層 —— 這一格原本只列 applyBuff/cycleBuff，於是甘豆腐之袍
    # (godie-i03f)「每殺死一名英雄可以額外獲得 10點智慧，上限 160」被報成
    # 「未實作（需要 applyBuff/cycleBuff）」，而那句話**指錯了缺口**：一個
    # `applyBuff` 永遠寫不出「+10 點智慧」——三圍不是 Stat（見
    # sim/stats/attributes.ts），所以那條建議照做只會做出另一張卡。
    # 真正缺的是 `grantAttribute` 的兩個欄位：
    #   (a) `store:"source"` —— 把點數記在**道具的來源**上，賣掉就跟著走
    #       （在它之前 grantAttribute 一律寫進 ChampionComp.attrBonus，永久且與
    #        道具無關 = 「賣掉還留著 160 智慧」）；
    #   (b) `maxSourceTotal` —— 「這個來源自己一共發過多少」的上限，而**不是**
    #       `maxAttribute`（那條封的是英雄三圍的絕對值，含等級成長，掛在智慧裝
    #        上會在高等法師身上直接把第一層擋掉）。
    # 一個工具把「我以為缺什麼」寫死成「它缺什麼」，代價就是有人照著那句話去做。
    "疊層": {"applyBuff", "cycleBuff", "grantAttribute"},
    # 純 modifier 就滿足的標籤：as capRaise 本身就是「解鎖上限」，不需要 passive。
    # ⚠️ 這一格曾經寫成 set()，而 set() 在下面代表「沒有任何原語」——結果把一個
    # 已經實作的機制報成未實作。空集合與「用 modifier 表達」是兩件事。
    "神速": {"__modifier__"},
    "衝刺": {"dash", "leap"},
    "焚身": {"damageArea", "dot"},
    "流星": {"damageArea", "dot"},
    "腐蝕": {"__aura__"},
    "斬殺": {"damage"},
    "反彈": {"damage"},
    "嘲弄": {"taunt"},
    "煉金術": {"damage"},
    "重創": {"applyBuff", "applyStatus"},
    "伸長": {"__modifier__"},
    "閃避": {"__modifier__"},
    "迴避": {"__modifier__"},
    "暴擊": {"__modifier__"},
    "看穿": {"__vision__"},
    "隱身": {"__vision__"},
    "飛昇": {"__flight__"},
    # 格擋 = item@1.block（sim/combat/block.ts 的 BlockGrant）。
    # ⚠️ 這一格曾經是 set()，也就是「沒有任何原語」——   那在 2026-08-01 之前是真的，
    # 現在不是了。跟 神速 那一格同一個教訓：空集合與「用某個欄位表達」是兩件事，
    # 忘記改這裡會讓四件**已經實作**的道具永遠報成未實作。
    "格擋": {"__block__"},
    # 套裝原語 = item@1.sets（2026-08-01）。空 set() 代表「沒有原語」，這一格曾經是
    # 空的，而那讓一個已經可以表達的機制被永遠報成未實作。
    "死之王套裝": {"__itemSet__"},
    # 【2026-08-01】無視防禦 / 真實傷害 = item@1.damageTypeOverride
    # （sim/combat/damageTypeOverride.ts）。同一格教訓第三次：這兩格原本是
    # set()，那在落地之前是真的，落地之後不改就會把三件已實作的武器報成未實作。
    # ⚠️ 兩個標籤共用同一個原語，差別在 `scope`（"basic" 是 [無視] 那兩件，
    # "ability" 是 [真實傷害] 那件）。這張表只證明「欄位存在」，**不證明 scope
    # 對不對** —— 那是 packages/shared/src/sim/combat/damageTypeOverride.shipped.test.ts
    # 的工作，它逐件釘死三件武器的 scope 與 becomes。
    "無視": {"__damageTypeOverride__"},
    "真實傷害": {"__damageTypeOverride__"},
    # 【2026-08-01】變形 = 殺豬刀 godie-i06g「專殺畜牲，7%機率將敵人變成食材，
    # 無法動作」。**這一格的舊訊息指錯了缺口**：它說「目前沒有原語」，而真相是
    # 「無法動作」這一半用的全部是**既有**原語 —— onBasicAttack + chance + victim +
    # applyStatus{stun:true}，一個新 effect kind 都不需要，net/eventFanout.ts 也不用動
    # （stunApplied 早就過線、ENTITY_FLAG.STUNNED 早就在快照上）。
    #
    # ⚠️ 這一格判的是「敵人有沒有真的被定住」，**不判**「有沒有變成雞腿」。
    # 那個視覺確實還沒做（championForm 只換得動施法者自己，見
    # sim/effects/championForm.ts），而它需要一格 ENTITY_FLAG —— protocol/schema.ts
    # 的 BIT BUDGET **只剩 32768 一格**。刻意沒有花掉它換一個純視覺；這件事寫在
    # 該道具的 authoringNote 裡，不是靠這張表表達。
    #
    # ⚠️ 也**不判**「專殺畜牲」那個目標過濾對不對 —— sim 裡沒有「畜牲」這個分類，
    # 出貨用 victim:"mob" 取最接近的讀法。釘死它的是
    # packages/shared/src/sim/combat/pigButcher.shipped.test.ts（打英雄打 3000 tick
    # 一次都不能暈）。
    "變形": {"applyStatus"},
    # 【2026-08-01】復活 / 回復 —— 天生牙 (godie-i031) 的兩行。
    #
    # 這兩格原本都是 `set()`，也就是這支工具說的「目前沒有原語，只能靠
    # authoringNote 登記」。那句話在 2026-08-01 之前是真的，但它**指錯了缺口**：
    # 真正卡住的從來不是「有沒有一個叫復活的 effect」，而是**作用域** ——
    # `HookDef.target` 只有 "self"(一個人) 與 "event"(被殺的那個人)，
    # 而 owner 兩行文案的主詞都是「我方所有英雄 / 我們全部英雄」。
    # 也就是說 [回復] 那一行的 `restore healthPct` 早就存在，缺的只是「打給誰」。
    #
    # 兩件事一起補上之後才成立：
    #   · `HookDef.target: "allies"`（sim/effects/hooks.ts `alliedChampions`）——
    #     同隊、有 ChampionComp 的每一位，含自己、**含死掉的**、依 id 排序；
    #   · `revive` effect（sim/effects/revive.ts）—— 而且它**不是第二套復活**：
    #     站起來的狀態合約委派給 sim/revive.ts 的 `reviveChampionAt`，也就是
    #     復活圈 (#84/#206) 完成時走的同一個函式。
    # 這一格與那兩個東西是同時進來的，忘記改它就會把兩行**已經實作**的文案
    # 永遠報成未實作 —— 跟 神速 / 格擋 / 套裝 / 無視 完全一樣的教訓，第五次。
    "復活": {"revive"},
    "回復": {"restore", "heal"},
    # 【2026-08-01】暴擊吸血 = 天堂之劍 godie-i01n「6%機率造成10倍暴擊傷害，
    # 暴擊時吸血回復100%傷害」= item@1.critStrike（sim/combat/critStrike.ts）。
    # 這一格原本是 set()（「沒有原語」），而那句話**當時也只對一半**：10 倍那一半
    # 一直是 critChance+critDamage 兩條 modifier 在付，真正做不到的是「暴擊時吸血
    # 回復 100% 傷害」（Stat.Lifesteal 是無條件吸血，而且被夾在 [0, 0.8]）。
    # 現在兩半都在同一個欄位，而且舊的兩條 modifier 已經移除（並存 = 12% 暴擊率）。
    #
    # ⚠️ 這張表只證明「欄位存在」，**不證明 empowers / lifestealMode 對不對** ——
    # 那是 sim/combat/critStrike.test.ts（近戰+遠程兩條路都打）與
    # sim/economy/questDraftGate.test.ts（讀木樁真的掉了多少血）的工作。
    "暴擊吸血": {"__critStrike__"},
}

EFFICACY_HEAD = re.compile(r"^效能[:：]?$")
SECTION_HEAD = re.compile(r"^(解說|歷史|背景|說明)[:：]?$")
# 標籤不一定在行首 —— 死之王套裝那三支寫的是「額外 [死之王套裝] …」。
# 只抓行首會讓那三行掉進「無法分類」，看起來像沒人檢查，其實是漏了一個 `^`。
TAG_RE = re.compile(r"\[([^\]]+)\]")
NUM = r"([+\-]?\s*\d+(?:\.\d+)?)"


def efficacy_lines(desc: str) -> list[str]:
    """owner 文案裡『效能』到『解說』之間的行。沒有『效能』標頭時退回整段前半。"""
    lines = [l.strip() for l in (desc or "").split("\n")]
    head = next((i for i, l in enumerate(lines) if EFFICACY_HEAD.match(l)), None)
    body = lines[head + 1:] if head is not None else lines[1:]
    end = next((i for i, l in enumerate(body) if SECTION_HEAD.match(l)), None)
    return [l for l in (body[:end] if end is not None else body) if l]


def collect_kinds(doc: dict) -> set[str]:
    """這份文件實際帶了哪些 effect kind（含 aura 裡的 hook）。"""
    kinds: set[str] = set()

    def walk(effs):
        for e in effs or []:
            if isinstance(e, dict) and "kind" in e:
                kinds.add(e["kind"])

    for hook in doc.get("passive") or []:
        walk(hook.get("effects"))
    for aura in doc.get("auras") or []:
        if aura.get("modifiers"):
            kinds.add("__aura__")
        for hook in aura.get("hooks") or []:
            kinds.add("__aura__")
            walk(hook.get("effects"))
    if doc.get("modifiers"):
        kinds.add("__modifier__")
    if doc.get("vision"):
        kinds.add("__vision__")
    if doc.get("flight"):
        kinds.add("__flight__")
    if doc.get("sets"):
        kinds.add("__itemSet__")
    if doc.get("block"):
        kinds.add("__block__")
    if doc.get("damageTypeOverride"):
        kinds.add("__damageTypeOverride__")
    if doc.get("critStrike"):
        kinds.add("__critStrike__")
    # 資源衍生屬性 —— **不是**「有沒有 percentOf」，是「percentOf 讀的是不是當下的
    # 資源」。`from: maxMana` 與 `fromResource: "mp"` 在滿魔時給同一個數字，所以
    # 只看 op 的話，一份退回舊寫法的文件會照樣拿到 ✅。
    for _m in doc.get("modifiers") or []:
        if isinstance(_m, dict) and _m.get("fromResource"):
            kinds.add("__resourceModifier__")
            break
    return kinds


# ── [On-Hit] 專用：**觸發器不是缺口** ────────────────────────────────────────
#
# 🔴 2026-08-01 更正。這張表對五支武器印過「[On-Hit] 未實作」，而那句話**在觸發器
# 那一層是錯的**，並且那個錯誤自己造成了四輪假陰性：
#
#   · `packages/shared/src/content/schema/effect.ts` 的 `zHookEvent` **早就有**
#     `"onBasicAttack"`；
#   · `sim/systems/BasicAttackSystem.ts`（近戰落點）與 `sim/systems/ProjectileSystem.ts`
#     （遠程命中）**兩條路都會** `fireHooks(..., "onBasicAttack", ...)`；
#   · `sim/combat/evasion.ts` 也已經處理了「被閃掉的一下不觸發」。
#
# 真正缺的一律是**那一行自己的計算項**（自身已損生命、對方現存 MP、總力量、
# 兩點距離…）。所以這一族的訊息要指向算式，不可以指向觸發器 —— 一句怪錯地方的
# 訊息會讓下一個人去修一個沒有壞的東西。
#
# ⚠️ 同時把判定收緊：以前只要 passive 裡**任何一個** hook 帶了 damage 就算數，
# 所以一條 `onKill → damage` 會冒充成 [On-Hit]。現在只認 `on == "onBasicAttack"`
# 底下的 effect kind。這是**假陽性**那一半，跟上面那半一樣重要。
ONHIT_TAGS = {"On-Hit", "OnHit"}


def onhit_kinds(doc: dict) -> set[str]:
    """`on == "onBasicAttack"` 的 hook（含光環投出去的）底下有哪些 effect kind。"""
    kinds: set[str] = set()

    def walk(hook):
        if hook.get("on") != "onBasicAttack":
            return
        for e in hook.get("effects") or []:
            if isinstance(e, dict) and "kind" in e:
                kinds.add(e["kind"])

    for hook in doc.get("passive") or []:
        walk(hook)
    for aura in doc.get("auras") or []:
        for hook in aura.get("hooks") or []:
            walk(hook)
    return kinds


def onhit_verdict(doc: dict, tag: str, need: set[str]) -> tuple[str, str]:
    """[On-Hit] 一行的判定 —— 訊息一律指向**算式**，不指向觸發器。"""
    note = doc.get("authoringNote") or ""
    have = onhit_kinds(doc) & need
    if have:
        return "✅", f"[{tag}] ← onBasicAttack → {'/'.join(sorted(have))}"
    # 有掛 onBasicAttack 但 kind 對不上：算式在，但不是這一族的形狀。
    if onhit_kinds(doc):
        return ("📝" if "缺" in note else "❌"), (
            f"[{tag}] 有 onBasicAttack hook，但底下沒有 "
            f"{'/'.join(sorted(need))} 任何一種 —— 缺的是這一行的**算式項**"
        )
    # 連 hook 都沒有。⚠️ 訊息**不可以**寫「觸發器未實作」——
    # `onBasicAttack` 存在且兩條攻擊路徑都在發它（見上面那一段）。
    msg = (
        f"[{tag}] 這份文件沒有 onBasicAttack hook。"
        "⚠️ 觸發器**是有的**（zHookEvent 有 onBasicAttack，BasicAttackSystem 與 "
        "ProjectileSystem 兩條路都會 fireHooks）—— 缺的是這一行自己的**算式項**"
    )
    return ("📝" if "缺" in note else "❌"), msg


def parse_stat_line(line: str):
    """『攻擊力+87』『魔抗+40%』『MP + 600』『總生命-50%』『總移動速度*1.2』
    → (stat, value, pct) 或 None."""
    s = line.replace("＋", "+").replace("－", "-").replace("％", "%").replace("×", "*")
    for label, stat, pct_label in STAT_LABELS:
        # 乘法寫法：『總移動速度*1.2』意思是總值 ×1.2，也就是 pctMult 0.2。
        mm = re.match(rf"^{re.escape(label)}\s*\*\s*(\d+(?:\.\d+)?)$", s)
        if mm:
            return stat, (float(mm.group(1)) - 1) * 100, True
        m = re.match(rf"^{re.escape(label)}\s*{NUM}\s*(%?)$", s)
        if not m:
            continue
        raw = m.group(1).replace(" ", "")
        pct = bool(m.group(2)) or pct_label
        return stat, float(raw), pct
    return None


def stat_backed(doc: dict, stat: str, value: float, pct: bool) -> bool:
    """有沒有一條同 stat 的 modifier 的數字對得上（百分比寫法容許 /100）。"""
    for m in doc.get("modifiers") or []:
        if m["stat"] != stat:
            continue
        v = float(m["value"])
        if abs(v - value) < 1e-6:
            return True
        if pct and abs(v - value / 100) < 1e-6:
            return True
        # 「魔抗+40%」是減傷比例 → mr = 100r/(1-r)
        if stat == "mr" and pct and 0 < value < 100:
            want = 100 * (value / 100) / (1 - value / 100)
            if abs(v - want) < 0.5:
                return True
    return False


def classify(doc: dict, line: str, kinds: set[str]) -> tuple[str, str]:
    note = doc.get("authoringNote") or ""

    # 屬性三圍 / 動態值 —— 先判，因為它們「已經檢查過」，
    # 跟 ❔（沒有人在檢查）是完全不同的兩件事。
    attr_line = line.replace("＋", "+").replace("－", "-")
    if ATTR_RE.match(attr_line):
        ok, why = attr_backed(doc, attr_line)
        if ok:
            return "✅", why
        mark = "📝" if ("三圍" in note or "力敏智" in note or "屬性" in note) else "❌"
        return mark, f"力/敏/智 走 item@1.attributes（不是 modifier）—— {why}"
    for rx, need, why in DYNAMIC_RES:
        if not rx.search(line):
            continue
        if need and (kinds & need):
            return "✅", f"{why} ← {'/'.join(sorted(kinds & need))}"
        if not need:
            return ("📝" if why[:8] in note else "❌"), why
        return ("📝" if why[:8] in note else "❌"), f"{why} —— 尚未實作"

    tag_m = TAG_RE.search(line)
    if tag_m:
        tag = tag_m.group(1).strip()
        need = TAG_IMPL.get(tag)
        if need is None:
            return "❔", f"未知標籤 [{tag}] —— 這支工具沒有規則檢查它"
        if not need:
            return ("📝", f"[{tag}] 目前沒有原語，authoringNote 已登記") if tag in note or "缺" in note \
                else ("❌", f"[{tag}] 目前沒有原語，且 authoringNote 沒有登記")
        # [On-Hit] 有自己的判定：只認 onBasicAttack 底下的 kind，而且缺的時候
        # 訊息要指向算式而不是觸發器。理由見 `onhit_verdict` 上方那一段。
        if tag in ONHIT_TAGS:
            return onhit_verdict(doc, tag, need)
        if kinds & need:
            return "✅", f"[{tag}] ← {'/'.join(sorted(kinds & need))}"
        return ("📝", f"[{tag}] 未實作，authoringNote 已登記") if tag in note \
            else ("❌", f"[{tag}] 未實作（需要 {'/'.join(sorted(need))}）")

    parsed = parse_stat_line(line)
    if parsed:
        stat, value, pct = parsed
        if stat_backed(doc, stat, value, pct):
            return "✅", f"{stat} 對得上"
        return "❌", f"{stat} 找不到對得上的 modifier"

    # 不是數值行也不是標籤行 —— 純敘述（例如「(死亡後掉落)」）
    return "❔", "無法分類（純敘述？還是漏掉的機制？）"


HTML_HEAD = """<title>寶具三選一 實作進度</title>
<style>
:root{--bg:#12131a;--surface:#191b24;--surface2:#20222d;--line:#2c2f3d;--ink:#e8e9f0;
--soft:#a4a8bd;--mute:#6f7488;--ok:#5fd08a;--okbg:#16301f;--bad:#f2726b;--badbg:#33191c;
--note:#e0b155;--notebg:#332714;--accent:#8b7bf0;
--mono:ui-monospace,SFMono-Regular,Menlo,monospace;
--sans:"Inter","Noto Sans TC","PingFang TC",system-ui,sans-serif}
:root[data-theme=light]{--bg:#f5f5f8;--surface:#fff;--surface2:#eeeef3;--line:#dcdce4;
--ink:#1b1c22;--soft:#4f5262;--mute:#82869a;--okbg:#e3f5ea;--badbg:#fdeaea;--notebg:#fbf1dd;--ok:#217a4b;--bad:#b8342c;--note:#8a6413}
@media(prefers-color-scheme:light){:root:not([data-theme=dark]){--bg:#f5f5f8;--surface:#fff;
--surface2:#eeeef3;--line:#dcdce4;--ink:#1b1c22;--soft:#4f5262;--mute:#82869a;
--okbg:#e3f5ea;--badbg:#fdeaea;--notebg:#fbf1dd;--ok:#217a4b;--bad:#b8342c;--note:#8a6413}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);line-height:1.6}
.wrap{max-width:1080px;margin:0 auto;padding:40px 24px 80px}
h1{font-size:27px;margin:0 0 6px;font-weight:650;text-wrap:balance}
.sub{color:var(--soft);font-size:14px;max-width:70ch}
.stamp{font-family:var(--mono);font-size:11.5px;color:var(--mute);margin-top:10px}
.hero{display:flex;align-items:baseline;gap:14px;margin:26px 0 6px}
.hero .n{font-size:52px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.hero .of{font-size:17px;color:var(--mute)}
.track{height:12px;border-radius:99px;background:var(--surface2);overflow:hidden;border:1px solid var(--line)}
.fill{height:100%;background:linear-gradient(90deg,var(--ok),var(--accent));border-radius:99px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:10px;margin:22px 0}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:13px 15px}
.tile .n{font-size:24px;font-weight:680;font-variant-numeric:tabular-nums}
.tile .l{font-size:11.5px;color:var(--mute);margin-top:1px}
.tile.ok .n{color:var(--ok)}.tile.bad .n{color:var(--bad)}.tile.note .n{color:var(--note)}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin:22px 0;font-size:13.5px}
.panel h2{font-size:13px;text-transform:uppercase;letter-spacing:.07em;color:var(--mute);margin:0 0 10px;font-weight:650}
.panel div{margin:3px 0;color:var(--soft)}.panel b{color:var(--ink)}
.warn{border-left:3px solid var(--note);padding-left:12px;margin-top:12px;color:var(--soft);font-size:12.5px}
.bar{display:flex;gap:7px;flex-wrap:wrap;margin:26px 0 14px}
.chip{font-size:12.5px;font-weight:600;padding:6px 13px;border-radius:99px;border:1px solid var(--line);
background:var(--surface);color:var(--soft);cursor:pointer}
.chip.on{background:var(--accent);border-color:var(--accent);color:#fff}
.item{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--line);
border-radius:9px;padding:13px 16px;margin-bottom:9px}
.item.done{border-left-color:var(--ok)}.item.gap{border-left-color:var(--bad)}
.item h3{font-size:14.5px;margin:0 0 8px;font-weight:640;display:flex;gap:9px;align-items:baseline;flex-wrap:wrap}
.item h3 code{font-family:var(--mono);font-size:11.5px;color:var(--mute);font-weight:500}
.ln{display:flex;gap:9px;align-items:flex-start;font-size:13px;margin:4px 0}
.ln .m{flex:none;width:17px}
.ln .t{font-family:var(--mono);font-size:12px;background:var(--surface2);padding:1px 6px;border-radius:4px;color:var(--ink)}
.ln .w{color:var(--mute);font-size:12px}
.ln.bad .t{background:var(--badbg)}.ln.ok .t{background:var(--okbg)}.ln.note .t{background:var(--notebg)}
details{margin-top:9px}summary{cursor:pointer;font-size:12px;color:var(--mute)}
details p{font-size:12px;color:var(--soft);background:var(--surface2);padding:10px 12px;border-radius:7px;margin:7px 0 0}
footer{margin-top:44px;padding-top:16px;border-top:1px solid var(--line);font-family:var(--mono);font-size:11.5px;color:var(--mute)}
</style>
"""


def render_html(rows, totals, done, n, whitelist, pool, rounds, off, stamp) -> str:
    pct = round(100 * done / n) if n else 0
    h = [HTML_HEAD, '<div class="wrap">']
    h.append(f"<h1>寶具三選一 · {n} 支寶具 實作進度</h1>")
    h.append('<p class="sub">逐行比對 owner authored 的「效能」文案，與該道具實際帶的 '
             "<code>modifiers</code> / <code>passive</code> / <code>auras</code>。"
             "這一頁是從 <code>content/</code> 現況產生的，不是手寫的進度表。</p>")
    h.append(f'<p class="stamp">{stamp}</p>')
    h.append(f'<div class="hero"><span class="n">{done}</span>'
             f'<span class="of">/ {n} 支每一行文案都有對應資料 · {pct}%</span></div>')
    h.append(f'<div class="track"><div class="fill" style="width:{pct}%"></div></div>')
    h.append('<div class="tiles">')
    h.append(f'<div class="tile ok"><div class="n">{totals["✅"]}</div><div class="l">✅ 文案有對應資料</div></div>')
    h.append(f'<div class="tile bad"><div class="n">{totals["❌"]}</div><div class="l">❌ 文案講了、資料沒有</div></div>')
    h.append(f'<div class="tile note"><div class="n">{totals["📝"]}</div><div class="l">📝 已登記缺口</div></div>')
    h.append(f'<div class="tile"><div class="n">{totals["❔"]}</div><div class="l">❔ 沒有規則在檢查</div></div>')
    h.append("</div>")
    h.append('<div class="panel"><h2>上架管線</h2>')
    h.append(f"<div>抽獎池（三階，{' / '.join(POOL_TABLES)}）：<b>{n}</b> 支</div>")
    gap = sorted(set(pool) - whitelist)
    h.append(f"<div>白名單 <code>starter.go</code>：<b>{len(whitelist)}</b> 支 "
             f"（缺口：<b>{'、'.join(gap) if gap else '無'}</b>）</div>")
    h.append(f"<div>會滾這張表的回合：<b>{'、'.join(rounds) or '（無）'}</b></div>")
    h.append(f"<div><code>draftEligible:false</code>（在池子裡但永遠發不出來）：<b>{'、'.join(off) if off else '無'}</b></div>")
    h.append('<div class="warn">抽卡是<b>先滾骰再過白名單</b>，所以白名單少一支不是「那支抽不到」，'
             "而是整張三選一卡的選項會變少甚至空掉。</div></div>")
    h.append('<div class="bar">'
             '<button class="chip on" data-f="all">全部</button>'
             '<button class="chip" data-f="gap">未完成</button>'
             '<button class="chip" data-f="done">已完成</button></div>')
    for iid, doc, lines, marks, ok in rows:
        cls = "done" if ok else "gap"
        h.append(f'<div class="item {cls}" data-s="{cls}">')
        h.append(f'<h3>{"✅" if ok else "❌"} {esc(doc["name"])} <code>{iid}</code></h3>')
        for line, (mk, why) in zip(lines, marks):
            k = {"✅": "ok", "❌": "bad", "📝": "note"}.get(mk, "")
            h.append(f'<div class="ln {k}"><span class="m">{mk}</span>'
                     f'<span><span class="t">{esc(line)}</span> <span class="w">{esc(why)}</span></span></div>')
        if doc.get("authoringNote"):
            h.append(f"<details><summary>authoringNote</summary><p>{esc(doc['authoringNote'])}</p></details>")
        h.append("</div>")
    h.append(f"<footer>python3 tools/legendary-status/status.py · {stamp}</footer></div>")
    h.append("""<script>
document.querySelectorAll('.chip').forEach(b=>b.onclick=()=>{
 document.querySelectorAll('.chip').forEach(x=>x.classList.remove('on'));b.classList.add('on');
 const f=b.dataset.f;
 document.querySelectorAll('.item').forEach(i=>{i.style.display=(f==='all'||i.dataset.s===f)?'':'none'});
});</script>""")
    return "\n".join(h)


def esc(s: str) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--print", dest="to_stdout", action="store_true")
    ap.add_argument("--html", type=Path, help="另外輸出一份自帶樣式的 HTML（給 hosted 頁面用）")
    ap.add_argument("--quiet", action="store_true", help="只印 done/total，給 watcher 用")
    args = ap.parse_args()

    pool = [
        e["itemId"]
        for f in POOLS
        for e in json.loads(f.read_text(encoding="utf-8"))["entries"]
    ]
    go = STARTER_GO.read_text(encoding="utf-8")
    m = re.search(r"starterLegendaryItems\s*=\s*\[\]string\{(.*?)\n\t\}", go, re.S)
    whitelist = set(re.findall(r'"([\w-]+)"', m.group(1))) if m else set()
    rules = json.loads(ARENA_RULES.read_text(encoding="utf-8"))
    rounds = sorted(
        k for k, v in rules["rounds"].items() if v.get("weaponLootTable") in POOL_TABLES
    )

    rows, totals = [], {"✅": 0, "❌": 0, "📝": 0, "❔": 0}
    done_items = 0
    for iid in pool:
        doc = json.loads((ITEMS / f"{iid}.json").read_text(encoding="utf-8"))
        kinds = collect_kinds(doc)
        lines = efficacy_lines(doc.get("description", ""))
        marks = [classify(doc, l, kinds) for l in lines]
        for mk, _ in marks:
            totals[mk] += 1
        ok = all(mk == "✅" for mk, _ in marks) and bool(marks)
        done_items += ok
        rows.append((iid, doc, lines, marks, ok))

    n = len(pool)
    pct = round(100 * done_items / n) if n else 0
    bar = "█" * (pct // 5) + "░" * (20 - pct // 5)

    out = []
    out.append(f"# 寶具三選一 · {n} 支寶具 實作進度\n")
    out.append("> **這一頁是產生出來的，不要手改。** 重新產生：\n>\n"
               "> ```bash\n> python3 tools/legendary-status/status.py\n> ```\n>\n"
               "> 它每次都重讀 `content/`，逐行比對 owner 寫的「效能」文案與該道具真正帶的\n"
               "> `modifiers` / `passive` / `auras`。手寫的進度表只會往「看起來比實際完成得多」\n"
               "> 的方向腐爛，而那正是這一批要消滅的缺陷。\n")
    out.append(f"\n`{bar}` **{done_items} / {n}** 支每一行文案都有對應資料（{pct}%）\n")
    out.append("\n| 狀態 | 意思 | 行數 |\n|---|---|---:|")
    out.append(f"| ✅ | 文案這一行有對應的資料 | {totals['✅']} |")
    out.append(f"| ❌ | **文案講了、資料沒有** —— 玩家拿不到 | {totals['❌']} |")
    out.append(f"| 📝 | 還沒做，但 `authoringNote` 已登記缺什麼 | {totals['📝']} |")
    out.append(f"| ❔ | 這支工具讀不出來 —— **代表沒有人在檢查它** | {totals['❔']} |")

    out.append("\n## 上架管線\n")
    out.append("- 抽獎池（三階）：" + " · ".join(
        f"`{t}` **{len(json.loads((REPO / 'content' / 'loot-tables' / (t + '.json')).read_text(encoding='utf-8'))['entries'])}** 支"
        for t in POOL_TABLES) + f" ⇒ 合計 **{n}** 支")
    out.append(f"- 白名單 `starter.go` `starterLegendaryItems`：**{len(whitelist)}** 支 "
               f"（缺口：{sorted(set(pool) - whitelist) or '無'}）")
    out.append(f"- 會滾這張表的回合：**{', '.join(rounds) or '（無）'}**")
    off = [i for i in pool if json.loads((ITEMS / f"{i}.json").read_text(encoding='utf-8')).get("draftEligible") is False]
    out.append(f"- `draftEligible: false`（在池子裡但永遠不會被發出來）：**{off or '無'}**")
    out.append("\n⚠️ 抽卡是**先滾骰再過白名單**（`MatchController` → `whitelist.filterItems`），"
               "所以白名單少一支不是「那支抽不到」，是整張卡的選項會變少甚至空掉。\n")

    out.append("\n## 逐支明細\n")
    for iid, doc, lines, marks, ok in rows:
        head = "✅" if ok else ("❌" if any(mk == "❌" for mk, _ in marks) else "📝")
        out.append(f"\n### {head} {doc['name']} `{iid}`\n")
        if not lines:
            out.append("_（沒有「效能」區塊）_\n")
        for line, (mk, why) in zip(lines, marks):
            out.append(f"- {mk} `{line}` — {why}")
        gaps = doc.get("authoringNote")
        if gaps:
            out.append(f"\n  <details><summary>authoringNote</summary>\n\n  {gaps}\n\n  </details>")

    text = "\n".join(out) + "\n"
    if args.quiet:
        print(f"{done_items}/{n} ✅{totals['✅']} ❌{totals['❌']} 📝{totals['📝']} ❔{totals['❔']}")
        return 0
    if args.to_stdout:
        sys.stdout.write(text)
    else:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(text, encoding="utf-8")
        print(f"{OUT.relative_to(REPO)}  ({done_items}/{n} 支完整, "
              f"✅{totals['✅']} ❌{totals['❌']} 📝{totals['📝']} ❔{totals['❔']})")
    if args.html:
        # 時間戳是「產生的那一刻」，明寫出來，避免有人把舊頁面當成現況（第三守則）。
        import datetime
        stamp = "產生於 " + datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
        args.html.parent.mkdir(parents=True, exist_ok=True)
        args.html.write_text(
            render_html(rows, totals, done_items, n, whitelist, pool, rounds, off, stamp),
            encoding="utf-8")
        print(f"{args.html}  (html)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
