#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""45 宇智波（火遁/千鳥） —— `godie-edem` 的 6 支技能（天生技 / Q / W / E / R / EX）。

⛔ 這一份只有**這一位英雄的資料**。共用的機制（`amt` / `dmg` / `area` /
   `buff` / 級距 / 各種閘）在 `common.py`；匯總與產生在 `batch1.py`。
"""
from common import A, M, amt, area, buff, dmg, line, status


A("45-00", "45-00 寫輪眼", "self", [0], [0], 0,
  "[被動][反彈][機率]\n\n「我只要看一次，就知道你穿什麼內褲」\n宇智波家族的血繼限界，洞察眼能夠看清忍術並仿冒，有20%[機率][反彈]魔法([AP])傷害。",
  innate="passive",
  passive={"name": "45-00 寫輪眼", "ranks": [{"hooks": [
      # ⭐ B3-A —— 真的反彈，而且**免傷**。owner 2026-08-09 的裁決逐字寫在
      #    `sim/combat/damage.ts`：「反彈的預設都是免傷…這個技能是免傷」。
      # ⛔ 刪掉 ap=1.0 是對的：首行標籤是 [被動][反彈][機率]，**沒有** [AP加成]；
      #    「魔法([AP])」是在指**哪一種**傷害被反彈，不是係數。
      {"on": "onDamageTaken", "chance": 0.2, "target": "event", "damageType": "magic",
       "internalCooldown": 0.5,
       "effects": [dmg("magic", flat=0,
                       inc_pct={"perRank": [1.0], "negateOriginal": True})]}]}]})

A("45-01", "45-01 火遁-豪火龍之術", "ground", [45, 45, 45, 45], [150, 190, 230, 240], 14.67,
  "[主動][指定][範圍][燃燒][週期]\n45秒冷卻\n消耗MP150/190/230/240\n施法距離14.67\n有效半徑6.05\n\n「接招吧！我的復仇之火」\n將吐出的火焰化為龍形，對[指定範圍]內敵人造250/350/450/550傷害，並附加[燃燒]標記，使其每秒受到當下[現存生命]1%的傷害，持續3秒。",
  radiusTier="中",
  effects=[area("magic", tier="中", per=[250, 350, 450, 550]),
           status("burn", 3.0),
           # ⭐【每秒受到**當下**現存生命 1%】（2026-08-13 落地）—— `resourcePctPhase: "onTick"`。
           #    在此之前 `dot.ts` 在**施加的那一刻**就把 `resourcePct` 解算成純量凍住
           #    （該處註解逐字寫「在這裡就凍住」），`dotTick.ts` 只認那個純量、不再讀
           #    受害者的血 ⇒ 三跳付的都是「中招那一瞬間的 1%」：滿血中招三跳照滿血收，
           #    殘血中招燃燒形同不存在。**規格的關鍵字「當下」整個沒有落地。**
           #
           # ⚠️ owner 2026-08-13 指出「Berserker 不就有類似效果 每秒減少 1% 現存生命嗎?」
           #    —— 對，`config.regen@1` 的 `healthDrainPctOfMax` 確實每 tick 重算。
           #    但那一條是**最大**生命／**自己身上**／英雄卡靜態／**不算傷害**
           #    （不吃傷害倍率、不被護盾吸、不噴數字、扣不死人、沒有擊殺歸屬）。
           #    45-01 要的是敵人身上、三秒、**現存**生命、而且要算傷害。
           #    ⇒ 缺的從來不是「扣血」，是「每 tick 重算」那一格。
           {"kind": "dot", "damageType": "magic", "amountPerTick": amt(flat=1),
            "resourcePct": {"subject": "target", "resource": "health", "basis": "current",
                            "scale": "ratio", "perRank": [0.01]},
            # ⚠️ 這一格一定要排在 `resourcePct` **後面** —— 與 `content/schema/effect.ts`
            #    的宣告序一致。`zChampionDoc.parse()` 會照 Zod 宣告序重排鍵，而
            #    `abilityScaling.test.ts` 的 fx-19 用 `JSON.stringify` 比對
            #    standalone 與英雄卡內嵌的兩份 ⇒ **鍵序不同就是假的 desync**。
            #    （同一條規則寫在 `stamp_provenance.py`：provenance 插在 description 前面。）
            "resourcePctPhase": "onTick",
            "intervalSec": 1.0, "durationSec": 3.0, "stacking": "refresh"}])

A("45-02", "45-02 千鳥流", "self", [45, 45, 45, 45], [70, 120, 170, 220], 0,
  "[主動][範圍][減速][AP加成]\n45秒冷卻\n消耗[MP] 70/120/170/220\n有效半徑7.79\n\n「千鳥流。奔流」\n讓全身充滿千鳥的雷電，對[周圍][大範圍]敵人造成75/150/225/300+20% [AP]點傷害，並使其[攻擊與移動速度][降低]50%，持續3秒。",
  radiusTier="中",
  # ⭐「[攻擊與移動速度][降低]50%」的**攻速**那一半：applyStatus 沒有攻速格，
  #    唯一落點是 applyBuff 的 modifier（同 79-00 靈壓）。
  # ⛔ 不可以寫成兄弟節點：`_fold_onhit` 只折 applyStatus/knockback/dot，
  #    applyBuff 會留在原地讀 ctx.targets ＝ **施法者自己**（castType 是 self）。
  effects=[area("magic", tier="中", per=[75, 150, 225, 300], ap=0.2,
                onhit=[buff([M("as", "pctAdd", -0.5)], 3.0,
                            polarity="debuff", dispellable=True)]),
           status("slow50", 3.0, moveSpeedMult=0.5)])

A("45-03", "45-03 千鳥", "ground", [45, 45, 45, 45], [120, 185, 250, 315], 12.83,
  "[主動][指向][範圍][衝刺][AP加成]\n45秒冷卻，吟唱2秒\n消耗MP120/185/250/315\n施法距離12.83\n有效半徑6\n\n「千鳥・雷切」\n將查克拉集中在手上，以高速[直線][衝刺]，對沿途[周圍]敵人造成400/500/600/700+100% [AP]點傷害。",
  cast_time=2.0,
  # ⭐ 頂層 `radiusTier` 從「借」改成「明填」。原本 `_ground_radius()` 是從 effects 樹裡
  #    第一顆 `damageArea` 借 "大" 上來的，而下面那顆被換成 `damageLine` 之後就借不到了
  #    ⇒ `def.radius` 退回 1 ⇒ 落點圈 0.8 ⇒ `onAbilityHit` 幾乎不發 ⇒ 45-04【哥哥】
  #    的麒麟連帶失效（它掛在 `abilitySlot: "E"` 的 `onAbilityHit` 上）。
  #    ⛔ 這一行不是裝飾 —— 拿掉會**靜默弄壞另一支技能**。
  radiusTier="中",
  # ⭐「對**沿途**[周圍]敵人造成…」——【衝刺】的傷害形狀是**線**，不是圓。
  # ⚠️ 原本 `damageArea` 與 `dash` 是**兄弟節點**：effects 在 CastResolveSystem（step 2b/3）
  #    就跑完，位移要到 MovementSystem（step 5）之後好幾個 tick 才發生 ⇒ `areaCentre()`
  #    退回 `ctx.point` ＝ 12.83 單位外的落點，於是「沿途」變成「在終點開場先炸一個圓」：
  #    貼在佐助臉上的敵人（起點 0~6.8 那一段，超過一半的衝刺距離）一滴血都不掉，
  #    而爆炸在他還沒起步時就先在遠處亮起來。
  # ⭐ 改成從施法者身上往前掃的膠囊：`length` = 衝刺距離 12.83、
  #    `width` = 規格「有效半徑 6」的**直徑** 12.0（膠囊吃的是寬度不是半徑）。
  #    `aim="facing"` —— ground 技的 facing 在 `castAbility` 就被 `armFacingLock` 鎖成
  #    「自己 → 落點」，鎖的長度 = 吟唱 2 秒，所以結算那一刻它正好是衝刺方向。
  #    ⛔ 不用預設的 `aim="target"`：那條線會穿過 `ctx.targets[0]`（落點圈裡的第一個人），
  #      沒有人時才退回 facing —— 同一支技能的線會因為場上有沒有人而換方向。
  #    ⭐ `includeOrigin` 由 `_own_area()` 補 True（cast scope），所以落點圈裡那個人
  #      也吃得到 —— 這正是 20-03 那個「瞄得越準打得越少」的同一個缺陷。
  # ⚠️ 已知取捨：`damageLine` **沒有** `radiusTier` 這一格（schema 是 `.strict()`），
  #    所以 12.0 這個寬度不再受 `config.aoe-tiers@1` 調整。要補是引擎側加一格
  #    寬度級距，⛔ 不是在這裡自己發明一個欄位。
  effects=[{"kind": "dash", "mode": "toPoint", "speed": 16, "maxDistance": 12.83},
           line("magic", length=12.83, width=12.0, aim="facing",
                per=[400, 500, 600, 700], ap=1.0)])

A("45-04", "45-04 哥哥", "self", [0], [0], 0,
  "[被動][技能命中時][身上有某狀態時][範圍][AP加成]\n0秒冷卻\n有效半徑3.67\n\n「我愚蠢的弟弟啊！憎恨吧！」\n當「千鳥」命中帶有[燃燒]標記的敵人時引發忍術「麒麟」雷電大爆炸，對目標[周圍][小範圍]敵人造成400/700/1000+ 300% [AP] 傷害。",
  innate="passive", maxRank=3,
  passive={"name": "45-04 哥哥", "ranks": [
      {"hooks": [{"on": "onAbilityHit", "abilitySlot": "E", "target": "event",
                  "condition": {"kind": "status", "subject": "target", "tag": "burn"},
                  "effects": [dict(area("magic", tier="極小", flat=v, ap=3.0),
                                   # ⭐「引發忍術『麒麟』雷電大爆炸，對**目標**[周圍]
                                   #    [小範圍]敵人造成…」—— 中了[燃燒]的那個目標**自己**
                                   #    就是這一發的主要受害者，⛔ 不是被排除的那一個。
                                   #    hook 的 target:"event" ⇒ ctx.targets = [他]，
                                   #    而 `damageArea.ts:52` 的
                                   #    `epicentre = includeOrigin===true ? null
                                   #                 : new Set(ctx.targets)`
                                   #    在缺席時把圓心那個人整個跳過 ⇒ 單挑（或他身邊
                                   #    3 單位內沒有第二個敵人）時**這支大絕整個打 0**：
                                   #    千鳥命中、燃燒還在、麒麟的特效與音效都播，血條不動。
                                   # ⛔ 這裡用 `dict(...)` 明填，⛔ 不動 `_own_area()` 的規則
                                   #    —— 那條規則刻意不走進 passive/hooks，因為那裡的
                                   #    `damageArea` 多半是**真的濺射**（震央已經吃過觸發
                                   #    那一擊，例：92-02 消化液）。45-04 不是濺射，
                                   #    它是規格明寫的獨立大爆炸。
                                   includeOrigin=True)]}]}
      for v in (400, 700, 1000)]})

A("45-002", "45-002 天照", "self", [120], [650], 0,
  "[主動][範圍][燃燒][沉默][虛弱][週期]\n120秒冷卻\n消耗MP650\n有效半徑7.79\n\n「寫輪眼。天照」\n發動天照，使[周圍][大範圍]敵人每秒受到400點[燃燒]傷害並附加[燃燒]標記，同時[沉默]且[攻擊力降低]40%，持續10秒。",
  radiusTier="中",
  # ⭐「同時[沉默]且[攻擊力降低]40%」—— 沉默有了，AD −40% **整段沒寫**。
  #    ⛔ 兄弟節點會落在施法者自己身上（理由同 45-02），所以走 area 的 onhit=。
  effects=[area("magic", tier="中", flat=1,
                onhit=[buff([M("ad", "pctAdd", -0.4)], 10.0,
                            polarity="debuff", dispellable=True)]),
           status("burn", 10.0),
           status("paralysis", 10.0, silenced=True),
           {"kind": "dot", "damageType": "magic", "amountPerTick": amt(flat=400),
            "intervalSec": 1.0, "durationSec": 10.0, "stacking": "refresh"}])
