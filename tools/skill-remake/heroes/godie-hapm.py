#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""52 Berserker —— `godie-hapm` 的 6 支技能（天生技 / Q / W / E / R / EX）。

⛔ 這一份只有**這一位英雄的資料**。共用的機制（`amt` / `dmg` / `area` /
   `buff` / 級距 / 各種閘）在 `common.py`；匯總與產生在 `batch1.py`。
"""
from common import A, M, area, buff, dmg, status


A("52-00", "52-00 十二道試煉", "self", [0], [0], 0,
  "[被動][範圍][暈眩]\n{{cd}}秒冷卻\n\n「十二條命聽起來很多，直到你遇到會算數的玩家」\n初始擁有十二層 [試煉] 標記。受到致命傷害時消耗一層試煉，進入 [無敵] 狀態1.5秒，隨後 [回復] 50%[最大生命]，並[擊退]並[暈眩] 0.5秒 [周圍]敵人。每失去一層試煉，永久提升10%攻擊力與10%[最大生命]。\n(跨回合共享12次 [試煉] 標記)",
  innate="passive",
  # ⭐ 整套 `mark@1 + lethal` 是**為這一支做的**（`sim/combat/lethalSave.ts` 檔頭逐字
  #    寫著「十二道試煉留 1%」），而在此之前 content 用它的文件數是 **0** ——
  #    出貨的寫法是「HP ≤ 5% 時觸發一條 hook」，那不是免死：
  #    ⛔ 一發超過 5% 的傷害直接把人打死，試煉一層都不會消耗（失敗形態②）。
  mark={"markId": "trial", "initial": 12, "max": 12, "durationSec": -1,
        "resetOn": "match",
        # 「每失去一層試煉，永久提升 10% 攻擊力與 10% 最大生命」——
        # ⛔ 原本寫成 buff(…, 99999) 假裝永久，而且掛在 hook 上（只有觸發那一次）。
        "perStackLost": [M("ad", "pctAdd", 0.1), M("maxHealth", "pctAdd", 0.1)],
        "lethal": {
            "consume": 1,
            "surviveHpPct": 0.01,
            "damageTypes": ["physical", "magic", "true"],
            "internalCooldown": 1.5,
            "selfEffects": [
                {"kind": "invulnerable", "durationSec": 1.5, "applyTo": "self",
                 "blocksDamage": "all", "blocksTrueDamage": True, "blocksControl": True},
                # 「**隨後**回復 50% 最大生命」—— 無敵窗結束才回，⛔ 不是同一 tick。
                {"kind": "delayed", "shape": "single", "delaySec": 1.5, "count": 1,
                 "intervalSec": 1.0,
                 "effects": [{"kind": "restore", "healthPct": 0.5, "applyTo": "self"}]}],
            "aoeEffects": [
                {"kind": "knockback", "distance": 4.0, "speed": 16.0, "from": "caster"},
                status("stun", 0.5, stun=True)],
            "aoeRadius": 6.0}})

A("52-01", "52-01 狂戰士之怒", "self", [60, 60, 60, 60], [100, 140, 180, 220], 0,
  "[主動][輔助]\n{{cd}}秒冷卻\n消耗MP{{mp}}\n持續6秒\n\n「吼叫不是技能前搖，只是想嚇嚇他」\n進入[狂怒]狀態，提升60/90/120/150% [攻擊速度] 與10/15/20/25%[吸血]。\n期間每承受自身[最大生命]5%的傷害，「狂怒」持續時間延長2秒。",
  effects=[buff([M("as", "pctAdd", 0.6), M("lifesteal", "flat", 0.1)], 6.0,
                statusId="rage",
                perRank=[{"modifiers": [M("as", "pctAdd", a), M("lifesteal", "flat", ls)],
                          "duration": 6.0}
                         for a, ls in ((0.6, 0.1), (0.9, 0.15), (1.2, 0.2), (1.5, 0.25))])],
  passive={"name": "52-01 狂戰士之怒", "ranks": [{"hooks": [
      {"on": "onDamageTaken", "target": "self",
       "effects": [{"kind": "extendBuff", "shape": "single", "who": "self", "stackKey": "rage",
                    "addSec": 2.0, "perDamagePctOfMaxHealth": 0.05,
                    "maxRemainingSec": 30.0}]}]}]})

A("52-02", "52-02 蹂躪編年史", "ground", [45, 45, 45, 45], [70, 95, 120, 145], 11,
  "[主動][指向][範圍][AP加成]\n{{cd}}秒冷卻，吟唱 1秒\n消耗MP{{mp}}\n施法距離：{{range}}\n\n「歷史是勝利者寫的，敗者只配飛出去擦地板」\n將敵方目標抓回再暴力的丟出去，使之撞擊[前方]一[直線][範圍]的敵人造成{{dmg}}+50% [AP]傷害。\n(若自身在 [狂怒] 狀態則額外附加受到 [範圍] 傷害的敵人 [恐懼] 狀態，持續 3秒)",
  cast_time=1.0,
  effects=[{"kind": "leap", "applyTo": "target", "mode": "toPoint", "apexHeight": 1.2,
            "durationSec": 0.42, "throwDistance": 7.33, "dragToCaster": True,
            "landRadius": 4.95,
            "onLand": [dmg("magic", per=[350, 450, 550, 650], ap=0.5),
                       # ⭐ LeapSystem 把 enemiesInCircle(landRadius) 直接餵成 ctx.targets，
                       #    所以 onLand 上的 condition 走的正是逐一過濾＝規格說的
                       #    「受到範圍傷害的敵人」。
                       # ⛔ statusId:"rage" 不是 tag:"rage"：狂怒是 52-01 用
                       #    applyBuff(statusId="rage") 掛的，只寫進 ModifierSource，
                       #    而 hasStatusTag 只走 world.status ⇒ tag 永遠讀 false。
                       status("fear", 3.0, feared=True,
                              condition={"kind": "status", "subject": "self",
                                         "statusId": "rage"})]}])

A("52-03", "52-03 無銘斧劍", "self", [0], [0], 0,
  "[被動][普攻時]\n\n「沒有名字不是低階裝備，是作者懶得取」\n每次普通 [攻擊時] 造成額外{{dmg}} 傷害且附加 [麻痺] 效果，持續0.6秒。",
  innate="passive", maxRank=4,
  passive={"name": "52-03 無銘斧劍", "ranks": [
      {"hooks": [{"on": "onBasicAttack", "target": "event",
                  "effects": [dmg("physical", flat=v),
                              # ⭐ [麻痺] = content/status-effects/numbness.json，
                              #    那份文件的描述**逐字點名這一支**，而且說得很清楚：
                              #    「它擋住哪幾格**不在這個標記上** —— 由施加它的那支
                              #    技能的 applyStatus 決定；這份文件只負責身分。」
                              #    ⇒ 這一顆只掛**身分**，⛔ 不帶任何修飾詞。
                              status("numbness", 0.6),
                              # ⭐ 麻痺**做了什麼**由階梯的下層回答，⛔ 不是我猜的。
                              #    規格（第 1 層）只寫「附加 [麻痺] 效果，持續0.6秒」，
                              #    對「擋住哪一格」保持沉默 ⇒ 由 w3x 說明（第 4 層）
                              #    與 w3a 欄位（第 5 層）填。A0BA 的 ubertip 逐字：
                              #    「行動暫時麻痺，**遲緩攻擊速度40%**，持續0.6秒」，
                              #    learn_ubertip「每等級增加20%減緩攻速」，
                              #    w3a data 欄位 3 = 0.4/0.6/0.8/1.0（逐階）。
                              #    額外傷害 50/70/90/110 與 0.6 秒也逐字對得上 ⇒ 同一支。
                              # ⛔ 出貨到今天的 `moveSpeedMult=0.5` 在**五層裡一層都沒有**
                              #    —— 原作減的是攻速不是移速，而 0.5 這個數字沒有來源。
                              # ⛔ 也不要改成 stun：原作不是硬控，而 0.6 秒 × 每一次普攻
                              #    = 永久暈眩鎖 —— 那是我編出來的平衡，不是規格說的。
                              # ⚠️ 形狀抄 79-01 破魔（`status()` 掛身分 +
                              #    `buff(polarity="debuff")` 掛真正的數值），因為
                              #    applyStatus **沒有**攻速那一格（stun/root/disarmed/
                              #    silenced/moveSpeedMult 五格裡沒有攻速）。
                              #    攻速地板是 STAT_CLAMPS 的 0.2，所以 -100% 不會除以零。
                              buff([M("as", "pctAdd", -sl)], 0.6,
                                   polarity="debuff", dispellable=True)]}]}
      for v, sl in ((50, 0.4), (70, 0.6), (90, 0.8), (110, 1.0))]})

A("52-04", "52-04 巨神一擊", "self", [120, 120, 120], [400, 600, 800], 0,
  "[主動][衝刺][範圍]\n{{cd}}秒冷卻，吟唱2秒\n消耗[MP] {{mp}}\n\n「體型差不是霸凌，是傷害公式」\n向前[衝刺]一小段距離後揮出致命的一擊，對[周圍][範圍] 敵人造成{{dmg}} 傷害。\n(若敵人具有[恐懼]狀態，則額外追加 自身[最大生命]25%傷害)",
  maxRank=3, cast_time=2.0, radiusTier="中",
  # ⚠️ GH#442 —— `mode` 是 **forward** 不是 toPoint。兩個理由，方向一致：
  #  ① 規格內文逐字寫「向**前**[衝刺]一小段距離」（第〇·六守則第 1 層）
  #  ② `castType:"self"` **結構上拿不到 `ctx.point`** —— 伺服器的 case "self" 不設 point、
  #     客戶端 AimResolver 回 {type:"self"} ⇒ `dash.ts` 永遠走 `ctx.direction ?? t.facing`
  #     的 fallback。寫 toPoint 是一句「說了但不會發生」的話（第一·五守則）。
  #     閘：packages/shared/src/content/blinkNotDash.test.ts
  effects=[{"kind": "dash", "mode": "forward", "speed": 16, "maxDistance": 5.0},
           area("physical", tier="中", per=[600, 1000, 1400]),
           # ⚠️ victimCondition ⛔ 不可以當 kw 傳進 area()：會被 amt() 的 o.update(kw)
           #    倒進 amount，而 zScaling 是 .strict() ⇒ 整份文件被拒收。
           dict(area("physical", tier="中", flat=0,
                     res_pct={"subject": "self", "resource": "health",
                              "basis": "max", "perRank": [0.25]}),
                victimCondition={"kind": "status", "subject": "target", "tag": "fear"})])

A("52-002", "52-002 射殺百頭", "targeted", [120], [400], 5.29,
  "[主動][指定][AP加成]\n{{cd}}秒冷卻，吟唱2秒\n消耗MP{{mp}}\n施法距離：{{range}}\n\n「名稱叫射殺百頭，但狂戰士狀態下減弱成斧頭砍九次」\n對目標連續 9次的斬擊，每次造成 100% [AP] +自身[最大生命] 3% 傷害，最後一擊附加 [擊退]一小段距離 及 [恐懼] 3秒。",
  cast_time=2.0,
  effects=[{"kind": "delayed", "shape": "single", "delaySec": 0.1, "count": 9, "intervalSec": 0.1,
            "effects": [dmg("magic", ap=1.0,
                            res_pct={"subject": "self", "resource": "health",
                                     "basis": "max", "perRank": [0.03]})],
            "finalEffects": [{"kind": "knockback", "distance": 3.0, "speed": 15.0,
                              "from": "caster"},
                             status("fear", 3.0, feared=True)]}])
