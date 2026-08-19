#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""80 呂布 —— `godie-h01u` 的 6 支技能（天生技 / Q / W / E / R / EX）。

⛔ 這一份只有**這一位英雄的資料**。共用的機制（`amt` / `dmg` / `area` /
   `buff` / 級距 / 各種閘）在 `common.py`；匯總與產生在 `batch1.py`。
"""
from common import A, M, area, buff, dmg, line, status


A("80-00", "80-00 飛將神弓", "self", [0], [0], 0,
  "[被動][擊殺時]\n0秒冷卻\n\n「轅門射戟只是熱身，這次我直接射你」\n每殺死一名敵人 [攻擊速度] 永久增加1%；[攻擊距離] 永久提升0.01，上限到10。",
  innate="passive",
  # ⭐「上限到10」（2026-08-13 落地）—— 引擎**早就有**這格機制：`applyBuff.maxStat`，
  #    而它 schema 的說明逐字寫著範例「攻擊距離上限 10」。⛔ 這不是引擎缺口，
  #    是一格沒被填的欄位（我原本要為它新開一個 ModOp，那就是重造一次輪子）。
  #
  # ⚠️ `basis:"final"` ⛔ 不是 `"thisSource"` —— owner 規格封頂的名詞是
  #    **[攻擊距離] 這條屬性的絕對值**（比角色面板上的最終值）。`thisSource` 封的是
  #    「這一份來源自己貢獻了多少」，填 10 會變成「卡面 2 + 這支技能最多再加 10 = 12」，
  #    跟規格差一個底值，而且畫面上分不出來。
  #
  # ⚠️ 兩半的上限**刻意不同**：攻速那一半規格沒有寫上限（`maxStat` 只掛 range），
  #    真正的攻速天花板走 `config.stat-caps@1`（後台可調），⛔ 不在這裡。
  #
  # ⛔ 而且兩個 modifier 一定要留在**同一份 buff** 裡：`nativeFidelity.test.ts` 的
  #    觀測點是 `passiveBuffs(world, lubu, "godie-h01u.passive").length === 1`，
  #    它數的是**來源數**。拆成兩份 buff 會讓它變 2 —— 上一輪就是這樣被撤回的。
  #
  # ⚠️ 已知且照做：呂布卡面 range = 2、每殺 +0.01 ⇒ 要 **800 次擊殺**天花板才第一次
  #    咬到，所以這一格在一般一場裡是看不到的。這是 owner 規格的算術結果，
  #    ⛔ 不是我要偷偷改的東西（第一守則：數值歸後台/內容，不歸我）。
  passive={"name": "80-00 飛將神弓", "ranks": [{"hooks": [
      {"on": "onKill", "target": "self",
       "effects": [buff([M("as", "pctAdd", 0.01), M("range", "flat", 0.01)], 99999,
                        maxStat={"stat": "range", "value": 10.0, "basis": "final"})]}]}]})

A("80-01", "80-01 天下無雙", "self", [0], [0], 0,
  "[被動][普攻時][層數累積]\n0秒冷卻\n\n「人中出呂布，馬中出赤兔」\n每次 [普通攻擊時] 都會增加 10% [攻擊速度] 並可[疊加]，持續1秒，若沒有繼續攻擊則[疊加]的 [攻擊速度] 增益歸零。",
  innate="passive",
  passive={"name": "80-01 天下無雙", "ranks": [{"hooks": [
      {"on": "onBasicAttack", "target": "self",
       # ⭐ 「可[疊加]…若沒有繼續攻擊則歸零」＝ `stackKey` + `maxStacks`：
       #    同 key 的第二發只把 `stacks` 加一（statPipeline 對 `value × stacks`
       #    求和），而 1 秒沒再打就整份 source 到期 ⇒ 「歸零」是免費的。
       # ⛔ 不要用「每層一份 buff」近似：那會留下 N 份各自到期的來源，
       #    「沒繼續攻擊就歸零」會變成一層一層慢慢掉。
       # ⚠️ `maxStacks` 20 是**上界**不是平衡值（防無限疊）；攻速真正的天花板
       #    走 `config.stat-caps@1`，⛔ 不在這裡調。
       "effects": [{"kind": "applyBuff", "modifiers": [M("as", "pctAdd", 0.1)],
                    "duration": 1.0, "statusId": "rage",
                    "stackKey": "lubu-tianxia", "maxStacks": 20,
                    "stackVisual": True}]}]}]})

A("80-02", "80-02 弒鬼神", "self", [60, 60, 60, 60], [90, 180, 270, 360], 0,
  "[主動][範圍]\n60秒冷卻\n消耗MP90/180/270/360\n\n「鬼神都殺了，剩下的只是血條」\n造成[周圍][範圍]敵方部隊 120/220/320/420 傷害，並 [擊退]及造成敵人 [破甲]，持續1秒。",
  radiusTier="小",
  # GH#375 —— 規格是「造成[**周圍**][範圍]敵方部隊」＝ 一個 360° 的圓，
  #           而沿用回來的 `imported.wave.physical` 是往 `t.facing` 直線飛出去的
  #           （castType self ⇒ 沒有落點）。改掛 spawnVfx{at:"self"}。
  cosmetic_projectile="imported.wave.physical",
  # ⭐【破甲】的**數值**那一半（形狀逐字比照 79-01 / 92-02 的【破魔】）。
  #    `armor-break` 在引擎裡是**純標記**：`status-effect@1` 只有 name/description/
  #    iconKey/polarity/tags，**沒有 modifiers**，而 `content/status-effects/
  #    armor-break.json` 自己的說明就寫著「防禦掉多少、掉多久，寫在施加它的
  #    那張卡上」—— 而這張卡上沒有。⇒ 敵人頭上亮圖示、80-03 的條件葉也讀得到，
  #    但他吃到的物理傷害一點都沒變（失敗形態②）。
  # ⛔ 這三顆一定要住在 `onhit=` 裡，⛔ 不可以當兄弟節點：`applyBuff` 不在
  #    `_PAYLOAD_KINDS`，`_fold_onhit` 折不到它，而 80-02 是 castType:"self"
  #    ⇒ ctx.targets 是**呂布自己**，破甲會扣在施法者身上。knockback 與
  #    applyStatus 本來會被折進來，這裡一併寫明：同一個容器、同一群受害者。
  effects=[area("physical", tier="小", per=[120, 220, 320, 420],
                onhit=[{"kind": "knockback", "distance": 2.5, "speed": 15.0,
                        "from": "caster"},
                       # ⛔ 標記留在 applyStatus：快照的 statusIds 只讀
                       #    world.status，換成 applyBuff.statusId 會讓受害者
                       #    HUD 的圖示整個消失（同 92-02 的註解）。
                       status("armor-break", 1.0),
                       # ⚠️ -1.0 ＝ 護甲**歸零**，逐字比照 owner 2026-08-13 對
                       #    【破魔】的裁決（79-01 / 92-02 都是 mr pctAdd -1.0）。
                       #    ⛔ 破甲這個數字 owner **還沒**裁決過 —— 它是一格 JSON
                       #    數值（第一守則：可調），要 30% 就把 -1.0 改成 -0.3，
                       #    不用動任何程式。持續 1 秒逐字照規格。
                       buff([M("armor", "pctAdd", -1.0)], 1.0,
                            dispellable=True, polarity="debuff")])])

A("80-03", "80-03 鬼神烈戟", "ground", [60, 60, 60, 60], [150, 200, 250, 300], 10,
  "[主動][指向][範圍][衝刺][AP加成]\n60秒冷卻\n消耗MP150/200/250/300\n有效半徑6\n\n「方天畫戟是中國最早的圓規」\n[衝刺] 一段距離並造成一[直線][範圍] 150/200/250/300 + 30% [AP] 傷害。\n(若對方在 [破甲] 狀態，則額外造成 100% [AP] 傷害)",
  # ⭐ 規格逐字「有效半徑6」。⛔ 不寫 `radius: 6`（它在 RETIRED 裡 —— owner
  #    2026-08-11「原則上不寫範圍數字」），走四級距：`config.aoe-tiers@1` 的
  #    「大」就是 6。
  # ⚠️ 這一格是 **doc 頂層**的，不是效果樹裡的：`abilitySystem.ts` 對 ground 技
  #    是用頂層半徑解 `ctx.targets`，缺席就退回 `def.radius ?? 1`（再乘
  #    combat-env 的 abilityRange 0.6 ⇒ 約 0.6 單位的小圈）。`_ground_radius()`
  #    幫不上忙 —— 它只從效果樹第一顆自發 damageArea 借，而 80-03 是**線**
  #    （它自己的註解就寫著「線與跳躍本來就沒有圓」）。
  # ⚠️ #152 的地板虛線預告與技能面板讀的也是這一格，缺席時畫出來的圈是錯的。
  radiusTier="中",
  effects=[{"kind": "dash", "mode": "toPoint", "speed": 16, "maxDistance": 10.0},
           # ⭐ B3-C1 —— 「(若對方在 [破甲] 狀態，則額外造成 100% [AP] 傷害)」
           #    住在**這條線自己的 onHitTargets** 上，⛔ 不是 onAbilityHit hook。
           #    `onAbilityHit` 發的是**施法解析**出來的那一組目標
           #    （abilitySystem.ts / CastResolveSystem.ts），對 ground 技就是落點
           #    上那個圓；而真正吃到傷害的是 `damageLine` 掃出來的膠囊，
           #    **damageLine 從不發 onAbilityHit**。⇒ 先 W 破甲再放 E，那 100% AP
           #    追加幾乎永遠不發，這支技能的整個 combo 賣點看不出來。
           #    ⭐ 兄弟技 79-03 月牙天衝對**同一句話**用的就是這個形狀，產生器
           #    在那一列把規則寫下來了（「79-03 是線，hook 收不到線上的每一個
           #    人，所以走 onHitTargets」）—— 80-03 當時沒有跟著改。
           # ⛔ 兩條路不可以並存：留著 hook 又加 onHitTargets ＝ 站在落點圈裡的
           #    破甲敵人吃兩份追加。所以整個 passive 區塊在這裡退場。
           line("magic", length=10, width=2.0, per=[150, 200, 250, 300], ap=0.3,
                onhit=[dict(dmg("magic", ap=1.0),
                            condition={"kind": "status", "subject": "target",
                                       "statusId": "armor-break"})])])

A("80-04", "80-04 赤兔咆哮", "self", [90, 90, 90], [250, 400, 550], 0,
  "[主動][輔助][機率][普攻時]\n90秒冷卻\n消耗MP250/400/550\n\n「赤兔不是交通工具，是交通事故」\n[AP] 與 [AD] 暫時提升至 150/200/250%，[攻擊時]與 [受傷時] 都有 20%[機率]使出弒鬼神反擊，持續 8秒。",
  maxRank=3,
  # GH#375 —— 這一支是**純自身增益**（AP/AD + 兩條 hook），規格裡沒有任何東西
  #           會飛出去；沿用回來的 `imported.wave.physical` 記假命中、還會替
  #           onAbilityHit 多觸發一輪。改掛 spawnVfx{at:"self"}。
  cosmetic_projectile="imported.wave.physical",
  # ⭐ owner 2026-08-12：「你應該要有 **×150% 的效果標籤**來實作，因為這是**提升至**」。
  #    「提升**至** 150%」＝ 最終值是基礎的 **1.5 倍**；`pctAdd 1.5` 是 **+150% ＝ 2.5 倍**，
  #    整整多一倍。`pctMult v` 給的是 ×(1+v)，所以 150/200/250% → v = 0.5/1.0/1.5。
  #    ⚠️ 判準在字面上，不在我腦裡：「提升 X%」＝ pctAdd（加成）、
  #    「提升**至** X%」＝ pctMult（取代成 X 倍）。閘在 `_set_semantics_gate()`。
  # ⭐ 「持續 8秒」管的是**三件事**：AP、AD、以及那兩條 20% 的弒鬼神反擊。
  #    ⛔ 反擊不可以住在 `passive` 裡：`abilityPassives.ts::rankBlock` 只要
  #    `rank > 0` 就把整塊掛上去，再由 `syncAbilityPassives` **常駐** ——
  #    R 點了一點之後整場都在噴弒鬼神（＝這支英雄常駐一個 20% 的 AoE proc），
  #    而那 8 秒只活在 applyBuff 的 expiresAtTick 上、只管 AP/AD。
  #    ⭐ `applyBuff.hooks` 正是引擎替這件事開的那一格（effect.ts 逐字：
  #    「the first way to attach one with a DEADLINE… a proc granted here
  #    cannot outlive the buff that granted it」）—— 到期由這份 buff 自己的
  #    `expiresAtTick` 管，`fireHooks` 走 `src.hooks` 並跳過過期來源。
  #    ⛔ 不要改用「發一個 statusId 再讓 hook 去問」：那要多一份
  #    content/status-effects 文件，而且變成兩本會各自腐爛的帳（G10 的教訓）。
  # ⚠️ `perRank` 只覆寫 modifiers / duration，`hooks` 留在頂層 ⇒ 三階共用。
  #    這是對的：規格的 20% 與 8 秒都沒有逐階。
  effects=[buff([M("ap", "pctMult", 0.5), M("ad", "pctMult", 0.5)], 8.0,
                hooks=[
                    {"on": "onBasicAttack", "chance": 0.2, "target": "self",
                     "internalCooldown": 0.5,
                     "effects": [{"kind": "proxyCast", "shape": "single", "slot": "W",
                                  "payCosts": "none", "respectCooldown": False}]},
                    {"on": "onDamageTaken", "chance": 0.2, "target": "self",
                     "internalCooldown": 0.5,
                     "effects": [{"kind": "proxyCast", "shape": "single", "slot": "W",
                                  "payCosts": "none", "respectCooldown": False}]}],
                perRank=[{"modifiers": [M("ap", "pctMult", v), M("ad", "pctMult", v)],
                          "duration": 8.0}
                         for v in (0.5, 1.0, 1.5)])])

A("80-002", "80-002 戰無不勝", "self", [0], [0], 0,
  "[被動]\n\n「只要一直贏，就沒有平衡問題」\n提升 [攻擊速度上限]至10、[吸血] 50%，並但 [防禦][魔抗] 降低 50%。",
  passive={"name": "80-002 戰無不勝", "ranks": [{"modifiers": [
      M("as", "capRaise", 10.0), M("lifesteal", "flat", 0.5),
      M("armor", "pctAdd", -0.5), M("mr", "pctAdd", -0.5)]}]})
