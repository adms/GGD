#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""92 草泥馬 —— `godie-h02v` 的 6 支技能（天生技 / Q / W / E / R / EX）。

⛔ 這一份只有**這一位英雄的資料**。共用的機制（`amt` / `dmg` / `area` /
   `buff` / 級距 / 各種閘）在 `common.py`；匯總與產生在 `batch1.py`。
"""
from common import A, M, TIER_R, amt, area, buff, dmg, hook_icd, line, status


A("92-00", "92-00 憂鬱的眼神", "self", [0], [0], 0,
  "[被動][受到攻擊][致盲][機率]\n{{cd}}秒冷卻\n\n「你看見的是憂鬱，我看見的是沒有草」\n有 30% [機率] 對草泥馬攻擊的敵方 [致盲] ，持續6秒。",
  innate="passive",
  passive={"name": "92-00 憂鬱的眼神", "ranks": [{"hooks": [
      {"on": "onDamageTaken", "chance": 0.3, "target": "event", "internalCooldown": 1.0,
       "effects": [status("blind", 6.0, missChance=0.5)]}]}]})

A("92-01", "92-01 臥草泥馬", "self", [60, 60, 60, 60], [160, 220, 280, 340], 0,
  "[主動][變身][週期]\n{{cd}}秒冷卻\n消耗MP{{mp}}\n\n「臥草，泥馬真的躺下來了」\n進入無法移動與攻擊的 [定身] 狀態，每秒 [回復] 1/2/3/4% 生命，[防禦] 提升20/40/60/80，持續6秒。\n(對方仍可施展技能，僅不能移動與普攻)",
  # 規格逐字「持續6秒」。⚠️ 這一支是 [變身] 不是 [切換]，所以下面那些 6 秒的
  # payload 與身體用**同一個時鐘**，是對的（切換才不可以帶 duration）。
  form_sec=6.0,
  effects=[status("root", 6.0, root=True, disarmed=True),
           buff([M("armor", "flat", 20)], 6.0,
                perRank=[{"modifiers": [M("armor", "flat", v)], "duration": 6.0}
                         for v in (20, 40, 60, 80)]),
           # ⭐「每秒[回復] 1/2/3/4% 生命」。⛔ 不可以用負值 dot：`dotTick` 是
           #    `if (amountPerTick > 0)`，負的那一發**整條被跳過** ⇒ 一滴都不回，
           #    而且 flat=-1 也把四階壓平。模板抄 92-002（delayed + restore）。
           # ⚠️ delayed 的 shape 與 delaySec 是**必填**，漏了 Zod 直接拒收。
           {"kind": "delayed", "shape": "single", "delaySec": 1.0, "count": 6,
            "intervalSec": 1.0,
            "effects": [{"kind": "restore", "healthPct": [0.01, 0.02, 0.03, 0.04],
                         "applyTo": "self"}]}])

A("92-02", "92-02 消化液", "self", [0], [0], 0,
  "[被動][指向][範圍][破魔][AP加成][機率][週期]\n\n草泥馬在 [受到傷害] 的時候有 10% [機率]，會從嘴巴裡噴出消化液攻擊敵人，造成[前方][一直線] [範圍] 敵人，每秒受到20/30/40/50+ {{ap}}% [AP] 傷害，附帶 [破魔] 降低魔抗 50%，持續3秒。",
  innate="passive", maxRank=4,
  passive={"name": "92-02 消化液", "ranks": [
      {"hooks": [{"on": "onDamageTaken", "chance": 0.1, "target": "event",
                  "internalCooldown": 2.0,
                  # ⭐ 「**每秒**受到 20/30/40/50 + 30% [AP] 傷害…**持續 3 秒**」
                  #    ＝ `dot`，⛔ 不是一發 damageLine（原本一次打完就結束）。
                  #    直線負責「打到誰」，dot 掛在被打到的人身上負責「每秒」。
                  "effects": [line("magic", length=8, width=1.8, flat=v, ap=0.3,
                                   onhit=[{"kind": "dot", "damageType": "magic",
                                           "amountPerTick": amt(flat=v, ap=0.3),
                                           "intervalSec": 1.0, "durationSec": 3.0,
                                           "stacking": "refresh"},
                                          # ⭐【破魔】的**數值**那一半（同 79-01）。
                                          # ⛔ 標記留在 applyStatus：快照的 statusIds
                                          # 只讀 world.status，換成 applyBuff.statusId
                                          # 會讓受害者 HUD 的圖示整個消失。
                                          status("magic-break", 3.0),
                                          # ⭐ owner 2026-08-13：魔抗**降為 0**（同 79-01）。
                                          buff([M("mr", "pctAdd", -1.0)], 3.0,
                                               polarity="debuff",
                                               dispellable=True)])]}]}
      for v in (20, 30, 40, 50)]})

A("92-03", "92-03 狂草泥馬", "self", [0], [0], 0,
  "[被動][屬性門檻][普攻時][吞噬][層數累積]\n\n「平常吃草，發瘋時吃人」\n當草泥馬生命降低到 30%時，普通 [攻擊時] 附加 [吞噬] 生命低於 3/4/5/6% 的敵方單位，並且永久增加1點 [AP]。",
  innate="passive", maxRank=4,
  passive={"name": "92-03 狂草泥馬", "ranks": [
      # ⭐ owner 2026-08-21 ⑤：「**不對 有些被動是有冷卻的 例如初號機吞噬**」——
      #    他點名的就是 `devour` 這個機制。這一支是它的**被動版**，而它出貨到今天
      #    唯一的門是「自己殘血」：攻速上限 4 ⇒ **每秒 4 次處決判定**，命中即
      #    無視護甲護盾秒殺，順帶永久 +1 AP（到 200 為止，一個回合就吃滿）。
      # ⚠️ `zDevour` schema 自己**沒有**任何內建冷卻，而 `ability.cooldown` 是 [0]
      #    ⇒ 節流只能寫在 hook 上。
      # ⚠️ 數字用 `hook_icd()` 從 owner 的冷卻表推導（單體·極小 6 卡面秒 × 0.2）——
      #    ⛔ 不手打，理由見 `tierize.hook_icd` 的「兩把不同的尺」。
      {"hooks": [{"on": "onBasicAttack", "target": "event",
                  "internalCooldown": hook_icd(),
                  "condition": {"kind": "stat", "subject": "self", "stat": "hp",
                                "mode": "percent", "op": "<=", "value": 0.3},
                  "effects": [{"kind": "devour", "shape": "single", "thresholdPctOfMax": [t],
                               "victim": "any", "throughShields": True,
                               # ⭐ 規格逐字「並且永久增加1點 [AP]」。
                               # ⛔ 不是 `grantAttribute attr:"int"`：`int` 是**三圍**，
                               #    `sim/stats/attributes.ts` 把它同時餵給
                               #    AbilityPower(×6.5)、MaxMana、ManaRegen、MagicResist
                               #    ⇒ 一次吞噬實得約 6.5 AP 外加三條沒寫在卡上的加成，
                               #    而卡片上寫 1（面板與說明對不上，後期強度 6.5 倍）。
                               # ⛔ 而且**收件人是錯的**：`grantAttribute` 走
                               #    `for (const id of ctx.targets)`，而 devour 是
                               #    `runEffects(onDevour, {targets:[victim]})`
                               #    ⇒ 那 1 點三圍加在**被吞掉的敵人**身上，草泥馬
                               #    一點都沒拿到。`grantAttribute` 沒有 `applyTo`，
                               #    所以那條路在 devour 底下本來就走不通。
                               # ⭐ `applyBuff` + `applyTo:"self"` 一次修好兩件事：
                               #    給的是 AP、給的是施法者。
                               # ⚠️ 上限 200 是從退場的 `maxAttribute: 200` 帶過來的
                               #    同一個數字（一格 JSON 數值，第一守則：可調）；
                               #    `basis:"thisSource"` ＝「這份增益自己最多加 200
                               #    AP」，它需要 stackKey（refineApplyBuff 會擋），
                               #    而 stackKey 也順便讓 N 次吞噬共用一份來源。
                               "onDevour": [buff([M("ap", "flat", 1.0)],
                                                 permanent=True, applyTo="self",
                                                 maxStat={"stat": "ap", "value": 200.0,
                                                          "basis": "thisSource"},
                                                 stackKey="caonima-devour-ap")]}]}]}
      for t in (0.03, 0.04, 0.05, 0.06)]})

A("92-04", "92-04 馬勒戈壁", "self", [90, 90, 90], [300, 420, 540], 0,
  "[主動][範圍][AP加成]\n{{cd}}秒冷卻\n消耗MP{{mp}}\n\n「將自己的心靈內景具現化並覆蓋現實世界的強力魔術」\n將[周圍] [範圍] 敵人附加 [緩慢] 及 [致盲]，持續6秒。\n(攻擊身上有 [致盲] 標記的敵人將額外附加 100/200/300% [AP] 傷害)",
  maxRank=3, radiusTier="大",   # GH#463：級距名整體左移一格（舊「超大」＝新「大」，值 8.0 不變）
  effects=[area("magic", tier="大", flat=1),
           status("slow50", 6.0, moveSpeedMult=0.5),
           status("blind", 6.0, missChance=0.5)],
  # ⭐ 逐階 100/200/300% AP。`ratios.coeff` 是**純量**，所以逐階的唯一落點是
  #    **多個 rank 區塊** —— 模板與 45-04 哥哥逐字相同。
  passive={"name": "92-04 馬勒戈壁", "ranks": [
      {"hooks": [{"on": "onBasicAttack", "target": "event",
                  "condition": {"kind": "status", "subject": "target", "statusId": "blind"},
                  "effects": [dmg("magic", ap=v)]}]}
      for v in (1.0, 2.0, 3.0)]})

A("92-002", "92-002 最終戈壁", "self", [0], [0], 0,
  "[被動][週期][回復][範圍][AP加成]\n\n「草泥馬戈壁，傷而扶壁曲」\n當 [馬勒戈壁] 施展期間，每秒對[周圍][範圍]友方單位 [回復] 10%[最大魔力]、也對 [周圍][範圍]敵人單位造成 2%[最大生命] + {{ap}}% [AP] 傷害，持續 6秒。",
  passive={"name": "92-002 最終戈壁", "ranks": [{"hooks": [
      {"on": "onAbilityCast", "abilitySlot": "R", "target": "self",
       "effects": [{"kind": "delayed", "shape": "single", "delaySec": 1.0, "count": 6, "intervalSec": 1.0,
                    "effects": [area("magic", tier="大", ap=1.0,
                                     res_pct={"subject": "target", "resource": "health",
                                              "basis": "max", "perRank": [0.02]}),
                                # ⭐ 規格的「每秒對周圍友方回復 10% 最大魔力」那一半。
                                #    ⚠️ restore 沒有 side/radius，範圍友方只能包一層
                                #    shape:"circle" + side:"allies" 的殼（同 89-002 的先例）。
                                #    alliedChampions() 含自己，所以「自己與友方」一次涵蓋。
                                #    ⚠️ shape:"circle" 的 radius 是**必填**（Zod 的
                                #    refine 逐字說「沒有半徑的圓在執行期直接 return」），
                                #    真正生效的仍是 radiusTier —— 同 area() 的做法。
                                {"kind": "weightedBranch", "shape": "circle",
                                 "radiusTier": "大", "radius": TIER_R["大"],
                                 "side": "allies", "maxTargets": 24,
                                 "branches": [{"weight": 1, "effects": [
                                     {"kind": "restore", "manaPct": 0.1}]}]}]}]}]}]})
