#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""13 揍敵客桀諾 —— `godie-efur` 的 6 支技能（天生技 / Q / W / E / R / EX）。

⛔ 這一份只有**這一位英雄的資料**。共用的機制（`amt` / `dmg` / `area` /
   `buff` / 級距 / 各種閘）在 `common.py`；匯總與產生在 `batch1.py`。
"""
from common import A, M, area, dmg, status


A("13-00", "13-00 念。攻防轉換", "self", [0], [0], 0,
  "[被動][輪替增益][普攻時]\n{{cd}}秒冷卻\n\n「年輕人，知道你想把念轉移到哪裡，勸你不要」\n[每次普通攻擊]的時候，依照順序循環強化① 法術強度([AP]) +10% ② 攻擊力([AD]) +10% ③ [防禦] +10% ④ [魔法抗性] +10% ，每一個各自持續 1.0 秒，[攻擊速度]夠快的話四個強化可以同時存在。",
  innate="passive",
  passive={"name": "13-00 念。攻防轉換", "ranks": [{"hooks": [
      {"on": "onBasicAttack", "target": "self", "effects": [
          {"kind": "cycleBuff", "cycleKey": "efur-nen", "applyTo": "self", "steps": [
              {"modifiers": [M("ap", "pctAdd", 0.1)], "duration": 1.0},
              {"modifiers": [M("ad", "pctAdd", 0.1)], "duration": 1.0},
              {"modifiers": [M("armor", "pctAdd", 0.1)], "duration": 1.0},
              {"modifiers": [M("mr", "pctAdd", 0.1)], "duration": 1.0}]}]}]}]})

A("13-01", "13-01 暗步。極限之圓", "targeted", [4, 3, 2, 1], [0, 0, 0, 0], 4,
  "[主動][指定][瞬移]\n施法距離：{{range}}\n{{cd}}秒冷卻\n\n「年輕全盛時期的老朽可以把圓擴大到整個競技場呢」\n[指定一名]敵人，無視地形與碰撞[瞬移]至其身旁，並造成[致盲]效果，持續1秒。",
  effects=[{"kind": "blink", "shape": "single", "to": "targetUnit", "applyTo": "self", "stopShortUnits": 1.0,
            # ⭐ GH#607 的同一條守衛:每一個 `onArrive` 都要有一個**看得見**的東西。
            #    ⚠️ 這一支是**瞬移落地**⛔ 不是光束落點 ⇒ 用一發輕的到位閃光
            #    （既有 `fx.fam.blink.arcane.s65`），⛔ 不是爆炸。
            #    少了它,「老朽瞬移到你旁邊」在畫面上只有一個突然換位置的模型。
            "onArrive": [{"kind": "spawnVfx", "vfxId": "fx.fam.blink.arcane.s65", "at": "point"},
                         status("blind", 1.0, missChance=0.5)]}])

A("13-02", "13-02 龍頭戲畫。牙突", "targeted", [45, 45, 45, 45], [60, 90, 120, 150], 2,
  "[主動][指定][擊退]\n{{cd}}秒冷卻\n消耗MP{{mp}}\n施法距離：{{range}}\n\n「突起的不一定是牙，也可能是老朽的愛」\n對指定敵人造成{{dmg}} + 目標[最大生命]6/8/10/12%的傷害，並[擊退]6距離。",
  # ⭐ GH#459（2026-08-19）—— 「目標[最大生命] 6/8/10/12%」**回來了**，而這一次
  #    它是真的落地的，不是只寫在卡片上。
  #
  # ⚠️ 這一列在 2026-08-12 → 08-19 之間是**兩份各說各話**的狀態，而那正是
  #    CLAUDE.md 第一·五守則點名的形狀：`description` 逐字寫著
  #    「+ 目標[最大生命]6/8/10/12%的傷害」，`effects` 裡卻只有 perRank + AD ——
  #    schema 收得下、後台存得起來、卡片上印著那句話、全套測試綠，而遊戲裡
  #    那一項**逐位元不存在**。上一版的註解自己記著這是 owner 裁決的待辦
  #    （「要嘛改 md、要嘛改守衛，⛔ 不可以兩份各說各話」）—— GH#459 就是那個裁決，
  #    而 owner 選的是「卡面說得到的就要做得到」⇒ 補機制，⛔ 不是刪那句話。
  #
  # ⛔ 走 `res_pct=` **不是** `damage.hpPct`：`_split_res_pct` 的檔頭逐字寫著
  #    「⛔ 不要開 `hp_pct=`」，理由是 `hpPct` 只長在 `damage` 一個 kind 上，而
  #    `resourcePct{subject:"target", resource:"health", basis:"max"}` 在
  #    damage / damageArea / damageLine / dot 四個 kind 同名同語意、共用同一份
  #    schema 與同一個讀取器（`dynamicTerms.ts::resourcePctAmount`）。
  #    ⭐ 同一位英雄的 13-002「額外 40% 目標[最大生命]傷害」用的就是這一格 ——
  #    兩句同型的規格走同一條路，⛔ 不是一句一個機制。
  # ⚠️ `subject:"target"` 的比例上界是 `RESOURCE_PCT_RATIO_MAX`，0.06~0.12 在界內，
  #    ⛔ 不需要動任何引擎上界。
  effects=[dmg("physical", per=[40, 60, 80, 100], ad=0.5,
               res_pct={"subject": "target", "resource": "health",
                        "basis": "max", "perRank": [0.06, 0.08, 0.10, 0.12]}),
           {"kind": "knockback", "distance": 6.0, "speed": 16, "from": "caster"}])

A("13-03", "13-03 龍頭戲畫。布陣", "self", [60, 60, 60, 60], [120, 180, 240, 300], 0,
  "[主動][範圍][AP加成]\n{{cd}}秒冷卻\n消耗[MP] {{mp}}\n\n「其實還可以衝刺，但老了」\n將念形成龍形衝擊波包裹全身，造成[範圍]敵人 {{dmg}} + {{ap}}% [AP] 傷害。",
  radiusTier="小",
  effects=[area("magic", tier="小", per=[150, 250, 350, 450], ap=0.6)])

# ⭐ GH#405 —— castType `ground` → `self`（第〇·六守則細則①：**內文 > 標籤**）。
#    規格內文逐字是「**自身**[周圍]每0.2秒[隨機]地點落下一顆流星」⇒ 語意是 self，
#    而落點錨定的那一格 `randomArea.who` 出貨就是 `"self"`。
# ⚠️ 在此之前這支是 `ground`：介面要玩家**指定一個地點**（施法距離12），而
#    `randomArea.who:"self"` 讀的是**施法者的 transform**，⛔ 從來不讀 `ctx.point`
#    （`sim/effects/randomArea.ts:176`）⇒ 玩家瞄的點對落點**逐位元沒有影響**。
#    卡片說「指定地點」、遊戲做「自己周圍」= 第一·五守則那條紅線。
# ⛔ 反方向（讓落點跟著 `ctx.point` 走）需要在 `who` 上開第三個值 `"point"`，
#    那是**引擎機制**（第〇·五守則）—— 而它解鎖的技能數是 **0**（內文兩支都寫「自身周圍」）。
# ⚠️ `radiusTier="極小"` 從**借**改成**明填**：`_ground_radius()` 只在 `castType=="ground"`
#    時借，改成 self 之後那條借道關閉 ⇒ 頂層 `radiusTier` 會整格消失、
#    `targetsEnemies` 也跟著翻成 false（`e["cast"] != "self" or bool(radiusTier)`）。
#    明填 = 出貨那一份逐位元不變，⛔ 不是新的平衡值。
A("13-04", "13-04 龍星群", "self", [120, 120, 120], [150, 200, 250], 0,
  "[主動][範圍][週期][AP加成]\n{{cd}}秒冷卻，吟唱{{cast}}秒\n消耗MP{{mp}}\n\n「生。意。星。龍」\n自身[周圍]每0.2秒[隨機]地點落下一顆流星，共10顆；每顆造成[小範圍] {{dmg}} + {{ap}}% [AP] [魔法傷害]。",
  maxRank=3, cast_time=0.6, radiusTier="極小",
  effects=[{"kind": "randomArea", "who": "self", "count": [10], "intervalSec": 0.2,
            "scatterRadius": 8.0, "firstAtCast": True, "stopOnCasterDeath": True,
            "effects": [area("magic", tier="極小", per=[150, 200, 250], ap=0.4)]}])

A("13-002", "13-002 絕。暗殺奧義", "self", [0], [0], 0,
  "[被動][技能命中時][身上有某狀態時][機率]\n\n對於[致盲]狀態的敵人施展 [龍頭戲畫。牙突] 時，有20%機會摘除心臟，造成額外40%目標[最大生命]傷害。",
  passive={"name": "13-002 絕。暗殺奧義", "ranks": [{"hooks": [
      {"on": "onAbilityHit", "abilitySlot": "W", "chance": 0.2, "target": "event",
       "condition": {"kind": "status", "subject": "target", "statusId": "blind"},
       # ⭐ 內文是「造成**額外 40% 目標最大生命傷害**」，所以它是一發傷害，⛔ 不是處決。
       #    第〇·六守則細則①：內文 > 方括號標籤 —— 標頭那個 [處決] 要跟著內文被修正。
       # ⛔ `devour` 是處決線：`sim/effects/devour.ts:80` 逐字是
       #    `if (hp.hp > hp.maxHp * pct) continue;` ⇒ 目標血量高於 40% 就**一點傷害都不打**，
       #    低於門檻時打的是「剛好致死量」而不是 40% 最大生命 ⇒ 規格那一句只在血量剛好
       #    等於 40% 的那一個點上湊巧成立（失敗形態②）。
       #    它還附帶兩筆規格沒有的副作用：`healPct` 預設 1（吞多少回多少）、
       #    `victim:"champion"`（對殭屍無效，而第 3 回合之後場上大多是殭屍）。
       # ⚠️ 一樣走 `res_pct=`（先例 60-00「[普通攻擊時]造成額外 3%[最大生命]傷害」）：
       #    subject="target" 的 ratio 上界是 1，0.4 在界內，⛔ 不需要動任何引擎上界。
       "effects": [dmg("magic", flat=0,
                       res_pct={"subject": "target", "resource": "health",
                                "basis": "max", "perRank": [0.4]})]}]}]})
