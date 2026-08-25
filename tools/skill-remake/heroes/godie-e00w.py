#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""77 十六夜/剎那（神鳴流） —— `godie-e00w` 的 6 支技能（天生技 / Q / W / E / R / EX）。

⛔ 這一份只有**這一位英雄的資料**。共用的機制（`amt` / `dmg` / `area` /
   `buff` / 級距 / 各種閘）在 `common.py`；匯總與產生在 `batch1.py`。
"""
from common import A, M, area, buff, dmg, status, static_model


A("77-00", "77-00 浮雲-旋一閃", "self", [30], [0], 0,
  "[被動][機率][迴避][迴避時][旋轉][暈眩]\n{{cd}}秒冷卻\n\n「少女的雙腿就是你的墓穴」\n有10%[機率][迴避]物理攻擊；[迴避]成功後發動，雙腿抓住對手[旋轉]拋摔，造成{{dmg}}+130% [AP]點傷害並[暈眩]2秒。",
  innate="passive",
  passive={"name": "77-00 浮雲-旋一閃", "ranks": [{
      "modifiers": [M("evasion", "flat", 0.10)],
      "hooks": [{"on": "onEvade", "target": "event", "internalCooldown": 30.0,
                 "effects": [dmg("physical", dmg_tier="極小", ap=1.3),  # ④ 單發（onEvade + 30 秒 ICD）⇒ 收進級距
                             status("stun", 2.0, stun=True)]}]}]})

A("77-01", "77-01 百烈櫻華斬", "self", [40, 40, 40, 40], [75, 110, 145, 180], 0,
  "[主動][範圍][擊退][AD加成]\n{{cd}}秒冷卻\n消耗MP{{mp}}\n有效半徑：{{radius}}\n\n「我的劍，成為了守護之風」\n用劍捲起一陣由內往外的旋風，給予[周圍]敵人200/300/400/500+50% [AD]點傷害，並[擊退]一段距離。",
  radiusTier="中",
  effects=[area("physical", tier="中", per=[200, 300, 400, 500], ad=0.5),
           {"kind": "knockback", "distance": 3.0, "speed": 15.0, "from": "caster"}])

A("77-02", "77-02 雷鳴劍", "self", [0], [0], 0,
  "[被動][普攻時][機率][暴擊][範圍][AP加成]\n\n「雷鳴。會心」\n[攻擊時]有10%的[機率]可以使出[會心一擊]造成1.5倍的[暴擊]傷害，並且附加落雷，造成[範圍內]敵方10% [AP]傷害。",
  innate="passive",
  passive={"name": "77-02 雷鳴劍", "ranks": [{
      # ⛔ 不要改寫成 critChance/critDamage 兩條屬性：那兩條是聚合的，會讓這位英雄
      #    **每一次**暴擊都變 1.5 倍，還會蓋掉道具的暴傷。
      "critStrike": {"chance": 0.10, "damageMult": 1.5, "lifestealFraction": 0.0},
      "hooks": [
      {"on": "onBasicAttack", "chance": 0.10, "target": "event",
       "effects": [area("magic", tier="極小", ap=0.1)]}]}]})

A("77-03", "77-03 GLADIARIA ALAT", "self", [120, 120, 120, 120], [90, 180, 270, 360], 0,
  "[主動][變身][加速][飛行]\n{{cd}}秒冷卻\n消耗MP{{mp}}\n\n「GLADIARIA  ALAT 。翼之劍士」\n[加速][攻擊速度]60/90/120/150% ，並可以變換為[飛行]狀態無視碰撞，持續6/9/12/15秒。",
  # 規格逐字「持續6/9/12/15秒」。schema 的 durationSec 是 zRankScalar —— 逐階可以
  # 是陣列，而那一格的註解點名的就是 77-03（「rank 4 的加速活 15 秒、翅膀只有 6 秒」
  # 這種兩半各走各的，就是它被開放的理由）。
  form_sec=[6.0, 9.0, 12.0, 15.0],
  # ⭐ F+G 合併：兩個出口改同一行。F 是逐階（form_sec 早就是 [6,9,12,15]，buff 卻鎖死
  #    6 秒），G 是翅膀。合併後飛行跟著同一份 source 的 expiresAtTick 到期，⛔ 不需要
  #    第二個時鐘。⚠️ stayInsideBoundary ⛔ 不要關（抄 04-00 翔封界），否則會走出競技場。
  effects=[buff([M("as", "pctAdd", 0.6)], 6.0,
                perRank=[{"modifiers": [M("as", "pctAdd", a)], "duration": d}
                         for a, d in ((0.6, 6.0), (0.9, 9.0), (1.2, 12.0), (1.5, 15.0))],
                flight={"hoverHeight": 0.45, "ignoreUnits": True,
                        "ignoreObstacles": True, "stayInsideBoundary": True})])

A("77-04", "77-04 真-雷光劍", "ground", [70, 70, 70], [150, 225, 300], 11,
  "[主動][範圍][AD加成]\n{{cd}}秒冷卻，施展時間2秒\n消耗MP{{mp}}\n施法距離：{{range}}\n\n「神鳴。雷光」\n神鳴流決戰奧義，聚集大量雷電於劍上予以斬擊，給予[小範圍]敵人600/800/1000+60% [AD]傷害。",
  maxRank=3, cast_time=2.0, radiusTier="極小",
  # ⭐ GH#691（#688 Phase 6-1）—— 原作的 `AddSpecialEffect` dummy（`MonsoonBoltTarget.mdl`）。
  #    census 逐列：`loc-oneshot（war3map.j:49906 Move_Effect）—— ⛔ 沒有 dummy 單位,所以原作沒有記下 usca/tint;scale 4.0 見 docs/_reports/V6_temp_20260825.md 的對照表`。⛔ 手寫進出貨 JSON 會被下一次 skillremake:json 打回來
  #    （`carry_mechanisms` 只沿用 invulnerable / spawnProjectile），所以它走表格出口。
  model_fx=[static_model("w3x.stock.monsoonbolttarget", "point", 1.0, scale=8.0)],
  effects=[area("physical", tier="極小", per=[600, 800, 1000], ad=0.6)])

A("77-002", "77-002 御雷劍", "self", [0], [0], 0,
  "[被動][機率]\n\n「御雷劍。飛行」\n使用從者道具「御雷劍」的剎那，其雷鳴劍發動[機率]上升至50%，[GLADIARIA ALAT] 持續時間增加至30秒。",
  # ⭐ 規格的兩句話第一次真的實作：`ability-augment@1`。
  #    ⚠️ 兩個目標**共用同一個前提**（拿著御雷劍），所以 condition 掛在 target 層 ——
  #    掛頂層表達不出「同一支 EX 的兩個強化各有各的前提」，掛每條 op 則會分岔。
  # ⭐ owner 2026-08-13 更正我的誤讀：**「御雷劍」就是這支 EX 自己**，
  #    「使用⋯的剎那」＝ 擁有這支 EX 就生效，⛔ 不是「身上帶著某件道具」。
  # ⛔ 舊 JSON 的 `{"kind":"equipment","tag":"legendary"}` 是「身上有**任何一件**
  #    傳說道具」—— 跟御雷劍毫無關係，而且 `content/items/` 裡**沒有**這件道具
  #    （grep 0 命中）⇒ 那個條件永遠靠別的道具偶然成立或永遠不成立，兩種都是錯的。
  # ⇒ 條件整個拿掉：首行標籤是 [被動]，被動 EX 擁有即生效。
  #    ⚠️ 標籤列的 [裝備了某類道具時] 因此也是贅標籤（owner 規則：內文 > 標籤）。
  augment={"targets": [
      {"abilityId": "godie-e00w.w",   # 77-02 雷鳴劍 —— 發動機率上升「至」50%
       "ops": [{"op": "procChance", "mode": "set", "value": 0.5}]},
      {"abilityId": "godie-e00w.e",   # 77-03 GLADIARIA ALAT —— 持續時間增加「至」30 秒
       "ops": [{"op": "durationSec", "mode": "set", "value": 30.0}]}]},
  # ⚠️⚠️ 這一段 passive 在**五層裡一層都沒有**（2026-08-13 逐層量的，⛔ 不是推測）：
  #    · 第 1 層 owner 新版說明：剝掉台詞「御雷劍。飛行」之後只剩兩句話，兩句都是
  #      「改別支技能的數字」，上面那個 augment 已經是它們的家。⛔ 沒有第三句。
  #    · 第 3–5 層 w3x：A10G「御雷劍」base=AIxk，ubertip 逐字是「其雷鳴劍發動機率
  #      上升至 50%，並且可以減免 33% 傷害，持續 15 秒」—— 原作也**沒有**它自己的落雷。
  #    ⇒ `chance: 0.4` 這個數字是這支產生器自己造的（同 `_require_base` 檔頭記的
  #      `flat=50` 那個坑：一個看起來正常、卡片解釋不了的數字）。
  # ⛔ 而且它**與 augment 重複計數**：77-02 雷鳴劍的落雷已經被 `procChance set 0.5`
  #    抬到 50%，這一條再獨立抽 40% ⇒ 實際約 70% 會落雷、而且兩發可以同時落。
  #    規格寫的是「上升**至** 50%」，不是「50% 再加一份 40%」。
  # ⛔ 但**這一輪不刪**，因為刪掉會讓產生器當場非零離開，而不是靜默出錯：
  #    `tag_gate.audit()` 對 `[被動]` 問的是 `doc.get("passive") is not None or marks`，
  #    對 `[機率]` 問的是 `{"chance": ANY}` 那一組形狀 —— 兩個今天**都只由這段
  #    passive 滿足**，`augment` 的 `{"op":"procChance"}` 兩張表都不認得。
  #    ⇒ 正解是**同時**在 tag_gate.py 讓一支「純 augment 的被動 EX」也算數
  #      （`[被動]` 接受 `doc.get("augment")`、`[機率]` 接受 `{"op":"procChance"}`，
  #      形狀抄 70-002 的 `{"op":"damageCoeffAp"}` 那一列），那是兩個檔的改動。
  # ⭐ 順帶：gap 報告說「augment.targets 少了 condition」的那一條**已經被上面
  #    owner 2026-08-13 的裁決取代**（御雷劍就是這支 EX 自己），⛔ 不要再補回去。
  passive={"name": "77-002 御雷劍", "ranks": [{"hooks": [
      {"on": "onBasicAttack", "chance": 0.4, "target": "event",
       "effects": [area("magic", tier="極小", ap=0.1)]}]}]})
