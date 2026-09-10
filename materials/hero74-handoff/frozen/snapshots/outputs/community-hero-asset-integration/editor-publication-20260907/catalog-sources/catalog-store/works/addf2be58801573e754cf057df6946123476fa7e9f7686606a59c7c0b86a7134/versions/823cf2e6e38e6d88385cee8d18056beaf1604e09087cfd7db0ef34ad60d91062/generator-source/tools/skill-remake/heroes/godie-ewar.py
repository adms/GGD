#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""12 志狼 —— `godie-ewar` 的 6 支技能（天生技 / Q / W / E / R / EX）。

⛔ 這一份只有**這一位英雄的資料**。共用的機制（`amt` / `dmg` / `area` /
   `buff` / 級距 / 各種閘）在 `common.py`；匯總與產生在 `batch1.py`。
"""
from common import A, M, area, dmg, status


A("12-00", "12-00 感應意脈", "self", [0], [0], 0,
  "[被動][迴避]\n{{cd}}秒冷卻\n\n志狼矇眼修行後，領悟到感應人意識流動，神一般的技巧，可以使自身物理攻擊[迴避]達到20%。",
  innate="passive",
  passive={"name": "12-00 感應意脈", "ranks": [{"modifiers": [M("evasion", "flat", 0.2)]}]})

A("12-01", "12-01 鬥仙術", "targeted", [12, 12, 12, 12], [30, 57, 83, 90], 4,
  "[主動][指定][混亂][AP加成]\n{{cd}}秒冷卻\n消耗MP{{mp}}\n施法距離：{{range}}\n\n「我一個人無聊的時候，喜歡跟自己打麻將」\n以念體攻擊敵人，造成{{dmg}}+{{ap}}% [AP]傷害的同時可以[混亂]目標1秒。",
  effects=[dmg("magic", per=[150, 283, 350, 350], ap=0.6),
           # ⭐ [混亂] = applyStatus.targetsAllies（2026-08-09 換掉的語意），
           #    要配 berserk 一起寫：berserk 丟指令+自動尋敵，targetsAllies 才是「不分敵我」。
           #    ⛔ 原本寫的 missChance 是[致盲]的機制，不是混亂。
           status("confusion", 1.0, berserk=True, targetsAllies=True)])

A("12-02", "12-02 仙氣．採藥", "self", [60, 60, 60, 60], [50, 100, 150, 200], 0,
  "[主動][輔助][治療][淨化]\n{{cd}}秒冷卻，吟唱{{cast}}秒\n消耗MP{{mp}}\n\n「OGC 身體好」\n利用身體小周天循環[治療]自己[回復] 5/7/9/11%[最大生命]，並且除去身上任何附加法術狀態([淨化])。",
  cast_time=3.0,
  # ⭐ 逐階回血 —— `restore.healthPct` 是 `zRankScalar`（effect.ts:2204），四欄陣列收得下，
  #    而 `sim/effects/restore.ts` 開頭就是 `rankScalar(e.healthPct, ctx.rank)` 逐階解算。
  #    ⛔ 填**單一純量** = 2/3/4 階根本沒有第二、三、四欄可讀 ⇒ 面板寫 11%、場上永遠回 5%
  #    （失敗形態②：算出來了但玩家拿不到）。規格逐字是 5/7/9/11%。
  # ⭐ `count` **刻意整格省略** —— 規格那句「除去身上任何附加法術狀態」要的就是「全部」。
  #    `sim/effects/dispel.ts` 是 `Math.min(e.count ?? cap, cap)` ⇒ 省略 = 逐位元等於後台
  #    `content/config/dispel.json` 的 `maxCountCap`（owner 2026-08-18 裁決：3 → **50**，
  #    「一律統一到 50 我覺得是可以的」；上界另外抬到 **60** 讓後台調得動，GH#360）。
  #    ⛔ 不要填一個大數字：填死的值不會跟著 owner 之後調那一格而動，而且不會有任何東西提醒你。
  #    ⚠️ 這一段先前寫著「count 是 3⋯owner 明說不動上限」—— **那句話在裁決當天就變成假的**
  #    （第三守則），而卡面的「任何」在 cap=3 時是一句空話（第一·五守則）。
  effects=[{"kind": "restore", "healthPct": [0.05, 0.07, 0.09, 0.11], "applyTo": "self"},
           {"kind": "dispel", "shape": "single", "pools": {"status": True, "dot": True, "buffs": True}}])

A("12-03", "12-03 破凰之心。空破山", "self", [0], [0], 0,
  "[被動][暴擊][機率][普攻時][AP加成]\n\n「放下屠刀，換把手槍」\n[每次攻擊]有10%[機率]造成1.1/2.2/3.3/4.4倍的[暴擊]傷害且敵人身上有[混亂]標記時，額外造成 {{ap}}% [AP]傷害。",
  innate="passive", maxRank=4,
  passive={"name": "12-03 破凰之心。空破山", "ranks": [
      {"modifiers": [M("critChance", "flat", 0.1), M("critDamage", "override", v)],
       "hooks": [{"on": "onBasicAttack", "target": "event",
                  "condition": {"kind": "status", "subject": "target", "statusId": "confusion"},
                  "effects": [dmg("magic", ap=1.0)]}]}
      for v in (1.1, 2.2, 3.3, 4.4)]})

A("12-04", "12-04 龍氣爆發", "self", [60, 60, 60], [250, 350, 450], 0,
  "[主動][範圍][淨化][AP加成]\n{{cd}}秒冷卻，吟唱{{cast}}秒\n消耗MP{{mp}}\n\n「使命創造命運」\n凝聚體內的龍氣造成[周圍][大範圍]敵方單位 550/750/950 + {{ap}}% [AP] 傷害，附帶[淨化]效果。",
  maxRank=3, cast_time=2.0, radiusTier="中",
  effects=[area("magic", tier="中", per=[550, 750, 950], ap=2.0),
           # ⭐ 這一圈淨化打的是**敵人**。⛔ 省略 `side` 走的是 `shapeTargets.ts:54` 的
           #    else 分支 = `alliedChampions` ⇒ 規格寫「敵方單位…附帶[淨化]」，出貨卻是
           #    把**自己與隊友**身上的正面狀態清掉 2 層（卍解/暴走/狂怒），而傷害正常，
           #    所以畫面上看不出是這一招做的（失敗形態②）。
           # ⚠️ `pools` 是**整包取代**不是逐鍵合併（`dispel.ts:37` 的 `e.pools ?? {四個後台預設}`）
           #    —— 省略它會退回 `config.dispel@1` 的 `defaultPoolBuffs: false`，而
           #    `polarity:"buff"` 要拔的敵方增益正住在 buffs 那一池 ⇒ 兩道閘相乘為零。
           #    dot / shields 刻意不填（＝關）：那兩池是減益與護盾，`polarity:"buff"` 本來就選不到它們。
           # ⚠️ buffs 那一池後面還有第二道閘：`buffDefaultDispellable: false`，
           #    所以只拔得到來源自己標了 `dispellable: true` 的增益 —— 那是後台的決策，⛔ 不在這裡繞過。
           {"kind": "dispel", "shape": "circle", "radius": 6.0, "radiusTier": "大",
            "side": "enemies", "pools": {"status": True, "buffs": True},
            "polarity": "buff", "count": 2}])

A("12-002", "12-002 仙氣發勁", "targeted", [30], [600], 2,
  "[主動][指定][擊退][AP加成]\n{{cd}}秒冷卻，吟唱{{cast}}秒\n消耗MP{{mp}}\n施法距離：{{range}}\n\n「Hey Siri，打開電風扇」\n近身最後必殺絕技，將身上所有的仙氣集中在手上瞬間爆發造成 {{dmg}} + {{ap}}% [AP] 傷害，並[擊退]敵方單位；目標帶有[混亂]（鬥仙術）時額外增幅 [AP] 傷害。",
  cast_time=2.0,
  # ⭐ owner 2026-09-02（逐字）：「AP 7 但是綁定技能標籤 [鬥仙術造成混亂狀態下額外增幅] 但吟唱時間要降為 0.2秒」
  #    ⇒ 主係數 6 不動（enabled=false 的 rollback＝今天）＋ 目標帶 confusion 時**額外** +1 ⇒ 合計 7；
  #      吟唱 0.2 ⇒ castTimeTier 小（castTimeTierOf(0.2)，級距贏、載入時翻成秒）。
  #    ⚠️ 2026-09-06 owner「重新用公式判斷」時發現這則裁決從沒落地（castTimeSec 1.0、係數恆真）。
  castTimeTier="小",
  effects=[dmg("magic", flat=1800,
               ratios=[{"stat": "ap", "coeff": 6.0},
                       {"stat": "ap", "coeff": 1.0,
                        "when": {"kind": "status", "subject": "target", "statusId": "confusion"}}]),
           {"kind": "knockback", "distance": 6.0, "speed": 16, "from": "caster"}])
