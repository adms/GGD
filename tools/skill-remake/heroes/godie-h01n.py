#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""79 黑崎一護 —— `godie-h01n` 的 6 支技能（天生技 / Q / W / E / R / EX）。

⛔ 這一份只有**這一位英雄的資料**。共用的機制（`amt` / `dmg` / `area` /
   `buff` / 級距 / 各種閘）在 `common.py`；匯總與產生在 `batch1.py`。
"""
from common import static_model, A, M, TIER_RANGE, area, buff, dmg, line, status


A("79-00", "79-00 靈壓", "self", [0], [0], 0,
  "[被動]\n{{cd}}秒冷卻\n有效半徑：{{radius}}\n\n「看不見不代表不存在，可能只是你靈壓太低」\n此靈力產生的強大靈壓能[降低]小 [範圍] 敵人 [攻擊速度] 減半。",
  innate="passive",
  passive={"name": "79-00 靈壓", "ranks": [{"auras": [
      {"key": "ichigo-reiatsu", "radius": 4.5, "affects": "enemy",
       "modifiers": [M("as", "pctAdd", -0.5)]}]}]})

A("79-01", "79-01 瞬步", "ground", [30, 30, 30, 30], [60, 80, 100, 120], 9.17,
  "[主動][指向][範圍][衝刺]\n{{cd}}秒冷卻\n消耗[MP] {{mp}}\n施法距離：{{range}}\n\n「不是我消失，是你反應太慢」\n以急快的速度[直線] [衝刺] 至對方身旁，造成 [範圍] 敵方單位 [破魔] 魔抗減半，持續 3秒。",
  # GH#375 —— `imported.bolt.void` 是純視覺（酬載在 dash + damageArea 上）。
  cosmetic_projectile="imported.bolt.void",
  effects=[{"kind": "dash", "mode": "toPoint", "speed": 16, "maxDistance": 9.17},
           area("magic", tier="極小", flat=1),
           # ⭐【破魔】的**數字**（2026-08-13）：`status-effect@1` 的 schema 只有
           #    name/description/iconKey/polarity/tags —— **沒有 modifiers**，
           #    所以「魔抗減半」必須是施加它的那張卡上的一顆 buff。
           #    出貨到今天完全沒有落點：magic-break 是一個純標記，玩家看到圖示、
           #    魔抗一點都沒掉。
           # ⛔ 標記那一半**留在** applyStatus：快照的 statusIds 只讀 world.status，
           #    改用 applyBuff.statusId 會讓受害者 HUD 上的【破魔】圖示整個消失。
           #    兩格秒數同為 3.0，polarity/dispellable 讓【淨化】一次拔乾淨。
           # ⭐ owner 2026-08-13：【破魔】是「魔抗**暫時降為 0**」，⛔ 不是減半。
           #    `pctAdd -1.0` ⇒ final = base × (1 − 1) = 0。
           status("magic-break", 3.0),
           buff([M("mr", "pctAdd", -1.0)], 3.0, polarity="debuff", dispellable=True)])

# ⭐ castType `self` → `targeted`：規格逐字是「給予**目標**額外…傷害」，而 self 施法讓
#    `ctx.targets=[施法者]` ⇒ 頂層那顆 damage **打自己**，兩條 hook 也全部閘在
#    `hitId !== caster` 上永遠不觸發（一支技能三個子句同時失效）。
# ⚠️ 施法距離規格沒給 —— 上一版用 2.0（近戰，同 13-02 牙突；79-03 月牙天衝才是 11 的
#    遠程那支），而那個數字是**推斷**的，所以列進了 owner 裁決。
# ⭐ owner 2026-08-19 逐支裁決（GH#433）：「**79-02 月牙斬 → 小**」。
#    ⚠️ 他在**同一則**裡把 12-002 與 13-02 裁成「極小」而只有這一支裁「小」——
#    三支的現值都是 2，所以那是**刻意多給一格**，⛔ 不是同一個答案寫了兩種字。
# ⛔ 這裡寫 `TIER_RANGE["小"]` 而不是 4.5：級別才是 owner 給的東西，數字是查表結果。
#    寫 2.0 會被 `tierize()` 收成「極小」——⛔ 那正是裁決要推翻的那一格。
A("79-02", "79-02 月牙斬擊", "targeted", [60, 60, 60, 60], [80, 160, 240, 320], TIER_RANGE["小"],
  "[主動][AP加成]\n{{cd}}秒冷卻\n消耗MP{{mp}}\n\n「月牙。斬魄刀」\n給予目標額外200/350/500/650傷害。\n(若對方在 [破魔] 狀態，則額外造成 {{ap2}}% [AP] 傷害)\n(卍解 [變身] 狀態下傷害額外追加 {{ap3}}% [AP])",
  # ⭐ GH#809 —— 掛件錨在**受擊者**身上，⛔ 不是施法者。逐行翻譯 j:37475
  #    `AddSpecialEffectTargetUnitBJ( "chest", udg_BleachTarget, "BloodBreathStream.mdx" )`
  #    ，而 `udg_BleachTarget` 在**前三行**（j:37472）逐字是 `GetAttackedUnitBJ()`
  #    ⇒ 第二個參數是被打的那個人。⛔ 在 `boneOn` 出現之前 `at:"bone"` 恆錨施法者，
  #    所以這一支在此之前只有兩條路：掛錯人，或者不掛 —— 兩條都不是翻譯。
  # ⚠️ 這是**單體**技能（castType targeted）⇒ `ctx.targets[0]` 就是那一個人，
  #    ⛔ 不需要 perTarget 扇出（那是 79-03 的線才需要的東西）。
  effects=[dmg("magic", per=[200, 350, 500, 650], ap=0.5),
           {"kind": "spawnVfx", "vfxId": "godie-bloodbreathstream-p0",
            "at": "bone", "attach": "chest", "boneOn": "victim"}],
  # ⭐ 兩個括號子句是**同一階的兩條 hook**，⛔ 不是兩個 rank。
  #    ⚠️ `abilityPassives.ts::rankBlock` 一次只掛**一格**
  #    （`p.ranks[min(rank, len(ranks)) - 1]`）。上一版把破魔放 ranks[0]、卍解放
  #    ranks[1]，於是 W 一升到 2 階（4 階技，玩家一定會升）破魔那條就整個不存在；
  #    而 ranks[1] 又帶 `whileForm:"alternate"`（形態不合直接 return null）
  #    ⇒ 未卍解的常態下 2 階以上**一格都掛不上**，兩句話同時失效。
  #    ⛔ 兩句話也因此永遠不可能同時成立 —— 而規格是兩個獨立的括號，不是二選一。
  # ⭐ 卍解那一條走**條件葉**而不是 `whileForm`（`whileForm` 是整格 rank 區塊的閘，
  #    會把同一格裡的破魔那一條一起關掉 —— 上一版就是這樣讓兩句話永不並存）。
  # ⭐ 2026-09-07（GH#1090）—— 那顆葉子從 `status/self/bankai` 換成
  #    **`form/self/alternate`**（GH#1070 落地的形態葉）。
  # ⛔ 舊寫法問的是「我身上有沒有一顆叫 bankai 的狀態」，而那顆狀態的秒數
  #    （79-04 的 `applyBuff.duration`）與**變身秒數**（`championForm.durationSec`）
  #    是**兩個住處記同一件事**：今天兩邊都是 8，只要有人動其中一個，
  #    「卍解中」這個問題就會有兩個答案，而**沒有任何東西會紅**（第〇·四守則）。
  # ⭐ 新寫法問的是「我這一刻的身體是不是變身態」——`condition.ts` 的 `form` 葉
  #    讀 `sim/formGate.ts::inAlternateForm`，與 `whileForm` **同一支**、同一個答案。
  # ⚠️ 那一份是產生器的產物：bash scripts/genguard.sh content/abilities/godie-h01o.w.json 查擁有者
  #   （castderive:build:raw · tiers:apply）⇒ 改**來源**再 genrun，⛔ 不要直接編出貨 JSON。
  # ⚠️ 變身對子的另一半 `content/abilities/godie-h01o.w.json` 要**同一份條件**
  #    （同編號＝同一支技能；只動一邊 ⇒ 玩家卍解之後用的是舊的那一份）。
  # ⚠️ 一格 rank 區塊 = 四階共用（`min(rank, 1) - 1` 永遠是 0），這是對的：
  #    兩個括號的係數是固定的 100% / 200%，規格沒有逐階。
  passive={"name": "79-02 月牙斬擊", "ranks": [
      {"hooks": [
          {"on": "onAbilityHit", "abilitySlot": "W", "target": "event",
           "condition": {"kind": "status", "subject": "target", "statusId": "magic-break"},
           "effects": [dmg("magic", ap=1.0)]},
          {"on": "onAbilityHit", "abilitySlot": "W", "target": "event",
           "condition": {"kind": "form", "subject": "self", "form": "alternate"},
           "effects": [dmg("magic", ap=2.0)]}]}]})

A("79-03", "79-03 月牙天衝", "ground", [55, 55, 55, 55], [250, 350, 450, 550], 11,
  "[主動][指向][範圍][AP加成]\n{{cd}}秒冷卻\n消耗MP{{mp}}\n施法距離：{{range}}\n\n「月牙天衝！招式喊得越大聲，傷害就越強大」\n造成一[直線]上的敵方部隊受到450/600/750/900傷害。\n(若對方在 [破魔] 狀態，則額外造成 {{ap}}% [AP] 傷害)\n(卍解 [變身] 狀態下傷害額外追加 {{ap2}}% [AP])",
  # ⭐ B3-C1 —— 79-02 用 hook 是因為它是單體；79-03 是線，hook 收不到「線上的每一個人」，
  #    所以走 onHitTargets。⛔ 不可以改寫成兄弟 damage：79-03 是 ground 技而它**沒有圓**，
  #    doc 頂層的 ctx.targets 只認 1 距離內的人。
  # ⚠️ 第二個括號「(卍解變身狀態下傷害額外追加 120% AP)」這一版仍然沒寫（已知殘留）。
  # ⭐ GH#691/#698 —— 變身態 `godie-h01o.e` 已綁 MonsoonBoltTarget,本體要**一起動**
  #    （同編號＝同一支技能；只動一邊 ⇒ 玩家卍解之後用的是舊的那一份）。
  # ⚠️ 2026-08-25 更正：這裡一度填 monsoonbolttarget（為了讓 abilityCodeParityForms 綠）,
  #    ⛔ 而那是**新的**漂移 —— 變身態 79-03 早就綁著 `imported.deathwave`（E2 聲音批,
  #    commit a34e87c8）。同編號＝同一支技能 ⇒ 本體要鏡射**既有的那一份**,
  #    ⛔ 不是把我挑的模型塞進來再逼另一邊跟上。
  model_fx=[static_model("imported.deathwave", "point", 1.0, preset="tpl-locust-orb", soundKey="wc3.crushingwavecaster1")],
  # ⭐ GH#809 —— 逐行翻譯 j:37573
  #    `AddSpecialEffectTargetUnitBJ( "hand", GetEnumUnit(), "BloodBreathStream.mdx" )`。
  #    它住在 `Trig_Bleach_Moon_Effect_Func001Func016A` 的 `ForGroup` 迴圈體裡，
  #    緊接在 `UnitDamageTargetBJ(…, GetEnumUnit(), …)` 之後 ⇒ **線上每一個被打到的人
  #    各一發**，錨在**那個人**的 `hand` 上（⛔ 不是 chest —— 79-02 才是 chest）。
  #    ⚠️ 觸發鏈：`Bleach_Moon`(A0LL) 在 j:37523 `EnableTrigger( gg_trg_Bleach_Moon_Effect )`
  #    ⇒ 那個 Effect 觸發器是 A0LL 的，⛔ 不是別支技能的。
  # ⭐ `onHitTargetsMode:"perTarget"` 是「每個人各一發」的**既有機制**
  #    （`victimFilter.ts::runOnHitChain` 逐字 `for (const id of struck) runList(chain, {…targets:[id]})`）。
  #    ⛔ 不要回頭在 spawnVfx 裡加扇出 —— 那是同一個決定的第二個住處（第〇·四守則）。
  # ⚠️ 兩顆既有的條件傷害**行為不變**：`gateOnCondition` 本來就逐個過濾 targets，
  #    batch 與 perTarget 對它們給出同一組人（條件是 status，⛔ 不吃 RNG）。
  effects=[dict(line("magic", length=11, width=2.0, per=[450, 600, 750, 900],
                onhit=[dict(dmg("magic", ap=0.6),
                            condition={"kind": "status", "subject": "target",
                                       "statusId": "magic-break"}),
                       # ⭐ 第二個括號終於有落點：與破魔那一條同一個機制
                       #    （onHitTargets 上的條件葉），差別只在問誰 ——
                       #    破魔問「敵人身上有沒有那顆狀態」，卍解問「**我這一刻是不是
                       #    變身態**」（GH#1090：`form` 葉，理由與 79-02 那一格逐字相同 ——
                       #    ⛔ 不要退回 `status/self/bankai`，那是變身秒數的第二個住處）。
                       dict(dmg("magic", ap=1.2),
                            condition={"kind": "form", "subject": "self",
                                       "form": "alternate"}),
                       {"kind": "spawnVfx", "vfxId": "godie-bloodbreathstream-p0",
                        "at": "bone", "attach": "hand", "boneOn": "victim"}]),
                onHitTargetsMode="perTarget")])

A("79-04", "79-04 卍解", "self", [90, 90, 90], [100, 200, 300], 0,
  "[主動][輔助][變身]\n{{cd}}秒冷卻\n消耗MP{{mp}}\n\n「卍解。天鎖斬月」\n壓縮全部力量並進入 [卍解] 狀態，[攻擊速度]提升100/150/200%，[瞬步] 冷卻縮短 50%，持續8秒。",
  maxRank=3,
  # ⭐ 手打的 championForm 拿掉，改由 A-1 的規則產。79-04 是全檔唯一手打的一格，
  #    而那正是另外四支的缺口整整沒有人發現的原因（第零守則⑨）。
  form_sec=8.0,
  # ⭐ `statusId:"bankai"` 留著，⛔ 但它現在**只是 HUD 上那顆圖示的名字**
  #    （玩家要看得到自己在卍解）—— ⛔ **沒有任何條件葉再讀它**（GH#1090）。
  # ⚠️ 在此之前它是「卍解中嗎」的答案，而那讓變身秒數多了一個住處：
  #    `applyBuff.duration` 8.0 與 `championForm.durationSec` 8.0 是**兩個 8**，
  #    今天相等所以看不出來（第〇·四守則）。⇒ 讀端全部換成 `form` 葉之後，
  #    這裡的 8.0 只回答**一個**問題：「攻速那顆增益持續多久」（卡面「持續8秒」）。
  # ⛔ 要退回 `status` 葉之前先讀 GH#1090 —— 那會把第二個住處長回來。
  effects=[buff([M("as", "pctAdd", 1.0)], 8.0, statusId="bankai",
                perRank=[{"modifiers": [M("as", "pctAdd", a)], "duration": 8.0}
                         for a in (1.0, 1.5, 2.0)]),
           {"kind": "modifyCooldown", "shape": "single", "who": "self", "slot": "Q",
            "mode": "reduce", "amount": 0.5}])

A("79-002", "79-002 虛化", "self", [0], [0], 0,
  "[被動][回復][機率]\n\n「面具才是本體」\n[卍解] 狀態下，額外獲得100%攻擊力([AD])提昇、60％[吸血] 、有30%的[機率][格擋]物理([AD])傷害、[月牙天衝]冷卻時間縮短50%。",
  # ⭐ G+N 合併：兩個出口改**同一段**，分開套後者會整段蓋掉前者（30% 格擋靜默消失）。
  #    effect.ts 的 whileForm 註解逐字寫著 79-002 的格擋就是「配 whileForm:"alternate"」。
  while_form="alternate",
  passive={"name": "79-002 虛化", "ranks": [
      {"modifiers": [M("ad", "pctAdd", 1.0), M("lifesteal", "flat", 0.6)],
       "block": {"damageTypes": ["physical"], "chance": 0.3, "fraction": 1.0}}]})
