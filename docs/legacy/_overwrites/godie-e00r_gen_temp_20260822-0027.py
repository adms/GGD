#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""59 初號機 —— `godie-e00r` 的 6 支技能（天生技 / Q / W / E / R / EX）。

⛔ 這一份只有**這一位英雄的資料**。共用的機制（`amt` / `dmg` / `area` /
   `buff` / 級距 / 各種閘）在 `common.py`；匯總與產生在 `batch1.py`。
"""
from common import A, CD_ECHO, M, TIER_R, amt, buff, hook_icd, line, status


A("59-00", "59-00 暴走", "self", [150], [0], 0,
  "[被動][暴走][迴避][吸血][受到傷害時][屬性門檻][機率]\n{{cd}}秒冷卻\n\n「吼！是誰踢掉插頭了！」\n生命降至5%時必定[暴走]，將[攻擊速度]提升100%，並獲得60%[吸血]與25%[迴避]，持續6秒。",
  innate="passive",
  passive={"name": "59-00 暴走", "ranks": [{"hooks": [
      {"on": "onDamageTaken", "target": "self", "internalCooldown": 150.0,
       "condition": {"kind": "stat", "subject": "self", "stat": "hp",
                     "mode": "percent", "op": "<=", "value": 0.05},
       "effects": [buff([M("as", "pctAdd", 1.0), M("lifesteal", "flat", 0.6),
                         M("evasion", "flat", 0.25)], 6.0),
                   # ⭐ [暴走] 的機制本體：拿走方向盤 + 自動尋敵（sim/berserk.ts）。
                   #    上面那排是屬性，這一行才是「暴走」——少了它三個系統都不會動。
                   status("berserk", 6.0, berserk=True, applyTo="self")]}]}]})

A("59-01", "59-01 吞噬", "self", [60, 60, 60, 60], [0, 0, 0, 0], 0,
  "[被動][週期][範圍][處決][吸血][吞噬][屬性門檻]\n{{cd}}秒冷卻\n有效範圍：{{radius}}\n\n「有一種餓是阿嬤覺得你餓」\n初號機**自動**[吞噬][周圍]範圍內生命剩餘3/5/7/9%的**任何敵方單位**（含殭屍與殭屍王），使其[立即死亡]，並[回復]等同其剩餘生命的生命值。\n(不必施放，也不耗魔；每次只吃最近的一個，兩次之間隔 {{cd}} 秒)",
  maxRank=4,
  # ─────────────────────────────────────────────────────────────────────────
  # ⭐ owner 2026-08-19（GH#489 裁決，逐字）：
  #      「①**59-01 吞噬**（godie-e00r.q，初號機）=> **改成被動 自動發生
  #        低於該門檻直接吃掉**」
  #    owner 2026-08-20（⛔ 他已經回答過三次以上）：
  #      「**採用原本主動的冷卻時間就好了**」
  #
  # ⭐ 為什麼**還留在 Q 槽**（⛔ 不搬去 PASSIVE）：
  #    ① PASSIVE 槽已經被 59-00 暴走佔著，而 `slot_suffix()` 的閘要求六支剛好
  #       落在六格（雙射）—— 搬過去是 assert，不是一個安靜的錯誤。
  #    ② 「被動」在這個引擎裡**不是一個槽位**，是一個形狀：
  #       `isPassiveOnly(def)` ＝ 有 `passive` 區塊 + `effects` 是空的
  #       （`sim/abilities/abilityPassives.ts:55`）。`castAbility` 在**付出任何
  #       成本之前**就以 `"passive"` 退掉這一次施放（`abilitySystem.ts:294`），
  #       客戶端三個技能列也把這一格畫成 PASSIVE 圖示 —— 也就是按 Q ⛔ 不會發生
  #       任何事、⛔ 不會燒掉 60 秒冷卻。92-03 狂草泥馬（W 槽）是同一個形狀的先例。
  #    ③ 留在 Q 還買到一件必要的東西：**它仍然吃技能點、仍然 1→4 階**，
  #       而 owner 的 3/5/7/9% 逐階門檻正是掛在那個階上的。
  #
  # ⭐ 冷卻仍然填 60 —— 那是**卡面秒**，兩個消費者：`{{cd}}` 印它，
  #    `CD_ECHO` 把它換算成**實際秒**（60 × 0.2 = 12）。⛔ 12 不是手打的。
  #
  # ⭐ 耗魔歸 0：owner 2026-08-21「若不是主動傷害技能 就免魔力吧 乾脆點」。
  #    （`tierize()` 的⑦本來就會把它壓成 0 —— 這裡寫 0 是讓表格自己說出這件事，
  #     ⛔ 不是靠一個看不見的後處理。）
  #
  # ─────────────────────────────────────────────────────────────────────────
  # ⚠️⚠️ 為什麼「12 秒」**不是**填在 `internalCooldown` 上（量過的，不是偏好）
  #
  # `fireHooks` 在**條件通過的那一刻**就蓋 `hookLastFired`（`effects/hooks.ts`），
  # ⛔ 它不知道底下那顆 `devour` 有沒有真的吃到人。⇒ 把 12 填進 `internalCooldown`
  # 得到的**不是**「兩餐之間隔 12 秒」，而是「**每 12 秒抽查一次**」：那一瞬間場上
  # 剛好沒有人低於門檻，就再等 12 秒。一個處決線是**瞬間**成立的條件，用 12 秒的
  # 取樣週期去抓它，實際命中率遠低於卡面讀起來的樣子 —— 那正是第二守則失敗形態②
  #（schema 收得下、卡片寫得出、遊戲裡幾乎不發生）。
  #
  # ⇒ 兩個數字，各自回答一個問題，**兩個都是推導的**：
  #      · `internalCooldown` = `hook_icd()` = **掃描節奏**（單體·極小 6 卡面秒
  #        × 0.2 = 1.2 實際秒）。它同時是那顆圓形範圍查詢的成本上限，也是
  #        92-03 狂草泥馬用的同一格。
  #      · `devour-cooldown` 這個狀態的 `duration` = `CD_ECHO` = **兩餐之間**
  #        （＝這一支當主動時的實際冷卻，12 秒）。真的吃到人才掛上去，
  #        掛著的時候上面那個條件不成立 ⇒ ⛔ 吃不到第二個。
  #
  # ⭐ 這**沒有新機制**（第〇·五守則）：`onInterval` + `internalCooldown` +
  #    `condition.not(status)` + `devour.onDevour` + `applyStatus` 五個零件全部
  #    是出貨就有的。⛔ 也沒有為這一支寫任何 if。
  # ⭐ 而且它把冷卻**畫到 HUD 上**：被動沒有技能鈕可以轉圈，那顆狀態圖示就是玩家
  #    唯一看得到的倒數。
  passive={"name": "59-01 吞噬", "ranks": [
      # ⭐ **一個** rank 區塊，⛔ 不是四個。逐階那一維走 `thresholdPctOfMax`，
      #    由 `fireHooks` 的 `rank: src.grantRank` 挑格（`effects/hooks.ts:541`）。
      #    ⛔ 抄四份只為了換裡面那個數字＝抄寫稅，而抄漏一階不會紅。
      {"hooks": [
          # 「**自動發生**」＝ 每 tick 掃一次、由 internalCooldown 定節奏
          #  （`systems/IntervalHookSystem.ts` 決策 1）。⛔ 不是 onDamageDealt：
          #  那會變成「要先打他一下才吃得到」，而規格說的是低於門檻就直接吃掉。
          {"on": "onInterval", "target": "self",
           "internalCooldown": hook_icd(),
           # 「上一餐的冷卻還在」→ 這一輪整條不成立（⛔ 也因此不燒掃描節奏的額度）。
           "condition": {"not": {"kind": "status", "subject": "self",
                                 "statusId": "devour-cooldown"}},
           # ⚠️ 鍵序 = Zod 宣告序（`schema/effects/devour.ts`）。
           "effects": [{"kind": "devour", "shape": "circle",
                        # ⚠️ `shape:"circle"` 的 `radius` 是**必填**（refineDispelShape），
                        #    真正生效的仍是 `radiusTier`（註冊時 resolveRadiusTier 覆蓋，
                        #    級別贏）—— 同 92-002 的先例。
                        #    ⭐ 極大 = 12，逐位元等於它當主動時的施法距離 11→12 那一格，
                        #    也就是**手感沒有變**，變的只是誰按下去。
                        "radius": TIER_R["極大"], "radiusTier": "極大",
                        "side": "enemies",
                        # ⭐ 一次只吃**最近的一個**（`shapeTargets` 已經排好序）。
                        #    ⛔ 不吃滿場：一次清空整波殭屍 + 回滿血是另一支技能。
                        #    這是一格 JSON 數字（第一守則：可調），⛔ 不是一個寫死的選擇。
                        "maxTargets": 1,
                        "thresholdPctOfMax": [0.03, 0.05, 0.07, 0.09],
                        "healPct": 1.0, "victim": "any", "throughShields": True,
                        # ⭐ **真的吞掉了才跑**（`sim/effects/devour.ts` 的
                        #    `devouredIds`）—— 這一行就是「兩餐之間 12 秒」的整個
                        #    實作。⛔ 沒吃到人時它不跑，所以空手而回不會浪費冷卻。
                        "onDevour": [status("devour-cooldown", CD_ECHO,
                                            applyTo="self")]}]}]}]},
  #
  # ⭐ owner 2026-08-19（GH#408 裁決，⛔ 被動化沒有動到它）：
  #    「he can kill enemy below 3% hp left, **including zombies. boss**」
  #
  # ⇒ `victim` 是 `"any"` 而不是 `"champion"`。這是**回答一個平衡疑慮的方式**，
  #    ⛔ 不是放寬：我問的是「rank1 的處決線只有 3%，是不是幾乎沒作用」，
  #    而 owner 的答案不是「把 3% 調高」，是「**目標池本來就該更大**」——
  #    一場有 60 隻殭屍（`maxAlivePerZone: 30` × 2 zone）加一隻殭屍王，
  #    3% 在那個池子裡每回合都會觸發好幾次，rank1 於是真的有用。
  #    ⭐ 這比調數字好：數字是平衡旋鈕，會再被改；目標池是**設計**。
  #
  # ⚠️ 卡面同步寫「任何敵方單位（含殭屍與殭屍王）」——
  #    ⛔ 只改 JSON 不改文案 = 卡片繼續說「敵方英雄」，那就是第一·五守則的
  #    「說了但不會發生」的鏡像（做得到卻不說），一樣是在對玩家說謊。
  #
  # ⛔ `effects` 刻意留空 —— 那**就是**「這一格是被動」的宣告（`isPassiveOnly`）。
  #    放一顆效果回去，按 Q 就會變成一次真的施放，而 owner 要的是自動發生。
  effects=[])

A("59-02", "59-02 高週波短刀", "self", [0], [0], 0,
  "[被動][普攻時][機率][真傷]\n\n「高級的美工刀，只要動得夠快也能切斷鑽石呢」\n高週波短刀[每次普攻]有10/15/20/25%[機率]將該次攻擊轉為[真實傷害]。",
  innate="passive", maxRank=4,
  passive={"name": "59-02 高週波短刀", "ranks": [
      # ⭐「**轉為**[真實傷害]」＝ 蓋掉這一刀自己的型別，⛔ 不是再追加 50 點真傷。
      #    出貨到今天是 `dmg("true", flat=50)`：本體那一刀**照樣被護甲吃掉**，
      #    旁邊多跳一個 50 —— 卡片說「轉為」，畫面上是「追加」。
      # ⭐ 1 tick 的授予窗可行：basicAttackSystem 先把封包推進佇列、同一 tick 才發
      #    onBasicAttack，而 combatResolveSystem 是**同一 tick** 抽乾佇列並問
      #    resolveDamageConversion ⇒ 被蓋到的正是「該次攻擊」。
      #    0.034 秒 = round(0.034 / (1/30)) = 1 tick。近戰 range 1.6，沒有飛行延遲。
      # ⚠️ `tag_gate.py` 的「真傷」同批加上 `{"becomes": "true"}` —— 否則這一列拿掉
      #    damageType:"true" 之後閘判成缺口，而 main() 在**寫檔之前**跑 audit
      #    ⇒ 整批 90 支一份都產不出來。
      {"hooks": [{"on": "onBasicAttack", "chance": c, "target": "self",
                  "effects": [buff([], 0.034, applyTo="self",
                                   damageTypeOverride={"scope": "basic",
                                                       "becomes": "true"})]}]}
      for c in (0.10, 0.15, 0.20, 0.25)]})

A("59-03", "59-03 AT力場", "self", [0], [0], 0,
  "[被動][週期][護盾]\n\n「所謂的心之壁，就是我不想跟你講話的意思」\n每8秒生成一個可抵擋150/250/350/450點魔法([AP])傷害的[護盾]，[護盾]不會疊加。",
  innate="passive", maxRank=4,
  passive={"name": "59-03 AT力場", "ranks": [
      {"hooks": [{"on": "onInterval", "internalCooldown": 8.0, "target": "self",
                  "effects": [{"kind": "shield", "amount": amt(flat=v),
                               "duration": 8.0, "absorbs": "magic"}]}]}
      for v in (150, 250, 350, 450)]})

A("59-04", "59-04 野戰型陽電子砲", "ground", [90, 90, 90], [350, 500, 650], 8.25,
  "[主動][指向][範圍][真傷]\n{{cd}}秒冷卻，吟唱3秒\n消耗MP{{mp}}\n施法距離：{{range}}\n\n「站著不要動，我...我要射了」\n對[前方][直線]敵人造成{{dmg}}點[真實傷害]。",
  maxRank=3, cast_time=3.0,
  # GH#375 —— `imported.wave.ki` 是純視覺（傷害在 damageLine 上）。
  cosmetic_projectile="imported.wave.ki",
  effects=[line("true", length=8.25, width=2.2, per=[750, 1200, 1650])])

A("59-002", "59-001 完全暴走", "self", [150], [0], 0,
  "[被動][暴走][迴避][吸血][加速][屬性門檻]\n{{cd}}秒冷卻\n\n「什麼？竟然沒有世界末日嗎？」\n[暴走]的門檻降為低於自身[最大生命] 20%，[攻擊速度]提升至最上限 10，[吸血]120%、[迴避]50%，持續 12秒。",
  passive={"name": "59-001 完全暴走", "ranks": [{"hooks": [
      {"on": "onDamageTaken", "target": "self", "internalCooldown": 150.0,
       "condition": {"kind": "stat", "subject": "self", "stat": "hp",
                     "mode": "percent", "op": "<=", "value": 0.2},
       "effects": [buff([M("as", "capRaise", 10.0), M("as", "pctAdd", 4.0),
                         M("lifesteal", "flat", 0.8), M("evasion", "flat", 0.5)], 12.0),
                   # ⭐ 同 59-00：這一行才是「暴走」，也是施法門檻認得出這支技能的憑據
                   #    （berserkRules.trigger = 'berserkGrantors'）。
                   status("berserk", 12.0, berserk=True, applyTo="self")]}]}]})
