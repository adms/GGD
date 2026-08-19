#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""59 初號機 —— `godie-e00r` 的 6 支技能（天生技 / Q / W / E / R / EX）。

⛔ 這一份只有**這一位英雄的資料**。共用的機制（`amt` / `dmg` / `area` /
   `buff` / 級距 / 各種閘）在 `common.py`；匯總與產生在 `batch1.py`。
"""
from common import A, M, amt, buff, line, status


A("59-00", "59-00 暴走", "self", [150], [0], 0,
  "[被動][暴走][迴避][吸血][受到傷害時][屬性門檻][機率]\n150秒冷卻\n\n「吼！是誰踢掉插頭了！」\n生命降至5%時必定[暴走]，將[攻擊速度]提升100%，並獲得60%[吸血]與25%[迴避]，持續6秒。",
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

A("59-01", "59-01 吞噬", "targeted", [60, 60, 60, 60], [50, 80, 110, 140], 11,
  "[主動][指定][處決][吸血][吞噬][屬性門檻]\n60秒冷卻\n消耗MP50/80/110/140\n施法距離11\n\n「有一種餓是阿嬤覺得你餓」\n可以直接[吞噬]生命剩餘3/5/7/9%的**任何敵方單位**（含殭屍與殭屍王），使其[立即死亡]，並[回復]等同其剩餘生命的生命值。",
  # ⚠️ 鍵序 = Zod 宣告序（healPct 在 victim 之前），理由見 area() 的註解。
  #
  # ⭐ owner 2026-08-19（GH#408 裁決）：
  #    「he can kill enemy below 3% hp left, **including zombies. boss**」
  #
  # ⇒ `victim` 從 `"champion"` 改成 `"any"`。這是**回答一個平衡疑慮的方式**，
  #    ⛔ 不是放寬：我問的是「rank1 的處決線只有 3%，是不是幾乎沒作用」，
  #    而 owner 的答案不是「把 3% 調高」，是「**目標池本來就該更大**」——
  #    一場有 60 隻殭屍（`maxAlivePerZone: 30` × 2 zone）加一隻殭屍王，
  #    3% 在那個池子裡每回合都會觸發好幾次，rank1 於是真的有用。
  #    ⭐ 這比調數字好：數字是平衡旋鈕，會再被改；目標池是**設計**。
  #
  # ⚠️ 卡面同步改成「任何敵方單位（含殭屍與殭屍王）」——
  #    ⛔ 只改 JSON 不改文案 = 卡片繼續說「敵方英雄」，那就是第一·五守則的
  #    「說了但不會發生」的鏡像（做得到卻不說），一樣是在對玩家說謊。
  effects=[{"kind": "devour", "shape": "single",
            "thresholdPctOfMax": [0.03, 0.05, 0.07, 0.09], "healPct": 1.0,
            "victim": "any", "throughShields": True}])

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
  "[主動][指向][範圍][真傷]\n90秒冷卻，吟唱3秒\n消耗MP350/500/650\n施法距離8.25\n\n「站著不要動，我...我要射了」\n對[前方][直線]敵人造成750/1200/1650點[真實傷害]。",
  maxRank=3, cast_time=3.0,
  # GH#375 —— `imported.wave.ki` 是純視覺（傷害在 damageLine 上）。
  cosmetic_projectile="imported.wave.ki",
  effects=[line("true", length=8.25, width=2.2, per=[750, 1200, 1650])])

A("59-002", "59-001 完全暴走", "self", [150], [0], 0,
  "[被動][暴走][迴避][吸血][加速][屬性門檻]\n150秒冷卻\n\n「什麼？竟然沒有世界末日嗎？」\n[暴走]的門檻降為低於自身[最大生命] 20%，[攻擊速度]提升至最上限 10，[吸血]120%、[迴避]50%，持續 12秒。",
  passive={"name": "59-001 完全暴走", "ranks": [{"hooks": [
      {"on": "onDamageTaken", "target": "self", "internalCooldown": 150.0,
       "condition": {"kind": "stat", "subject": "self", "stat": "hp",
                     "mode": "percent", "op": "<=", "value": 0.2},
       "effects": [buff([M("as", "capRaise", 10.0), M("as", "pctAdd", 4.0),
                         M("lifesteal", "flat", 0.8), M("evasion", "flat", 0.5)], 12.0),
                   # ⭐ 同 59-00：這一行才是「暴走」，也是施法門檻認得出這支技能的憑據
                   #    （berserkRules.trigger = 'berserkGrantors'）。
                   status("berserk", 12.0, berserk=True, applyTo="self")]}]}]})
