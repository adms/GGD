#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""79 黑崎一護 —— `godie-h01n` 的 6 支技能（天生技 / Q / W / E / R / EX）。

⛔ 這一份只有**這一位英雄的資料**。共用的機制（`amt` / `dmg` / `area` /
   `buff` / 級距 / 各種閘）在 `common.py`；匯總與產生在 `batch1.py`。
"""
from common import A, M, area, buff, dmg, line, status


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
# ⚠️ 施法距離規格沒給 —— 用 2.0（近戰，同 13-02 牙突；79-03 月牙天衝才是 11 的遠程那支）。
#    這個數字是**推斷**的，列進 owner 裁決。
A("79-02", "79-02 月牙斬擊", "targeted", [60, 60, 60, 60], [80, 160, 240, 320], 2.0,
  "[主動][AP加成]\n{{cd}}秒冷卻\n消耗MP{{mp}}\n\n「月牙。斬魄刀」\n給予目標額外200/350/500/650傷害。\n(若對方在 [破魔] 狀態，則額外造成 100% [AP] 傷害)\n(卍解 [變身] 狀態下傷害額外追加 200% [AP])",
  effects=[dmg("magic", per=[200, 350, 500, 650], ap=0.5)],
  # ⭐ 兩個括號子句是**同一階的兩條 hook**，⛔ 不是兩個 rank。
  #    ⚠️ `abilityPassives.ts::rankBlock` 一次只掛**一格**
  #    （`p.ranks[min(rank, len(ranks)) - 1]`）。上一版把破魔放 ranks[0]、卍解放
  #    ranks[1]，於是 W 一升到 2 階（4 階技，玩家一定會升）破魔那條就整個不存在；
  #    而 ranks[1] 又帶 `whileForm:"alternate"`（形態不合直接 return null）
  #    ⇒ 未卍解的常態下 2 階以上**一格都掛不上**，兩句話同時失效。
  #    ⛔ 兩句話也因此永遠不可能同時成立 —— 而規格是兩個獨立的括號，不是二選一。
  # ⭐ 卍解那一條改用**條件葉**而不是 `whileForm`：79-04 的增益帶
  #    `statusId:"bankai"`（G10），而 `effectCommon.ts::hasStatus` 連具名標記
  #    一起讀 ⇒ `status/self/bankai` 問得到它。這正是兄弟技 79-03 月牙天衝對
  #    **同兩句話**用的形狀，差別只在 subject：破魔問敵人、卍解問自己。
  # ⚠️ 一格 rank 區塊 = 四階共用（`min(rank, 1) - 1` 永遠是 0），這是對的：
  #    兩個括號的係數是固定的 100% / 200%，規格沒有逐階。
  passive={"name": "79-02 月牙斬擊", "ranks": [
      {"hooks": [
          {"on": "onAbilityHit", "abilitySlot": "W", "target": "event",
           "condition": {"kind": "status", "subject": "target", "statusId": "magic-break"},
           "effects": [dmg("magic", ap=1.0)]},
          {"on": "onAbilityHit", "abilitySlot": "W", "target": "event",
           "condition": {"kind": "status", "subject": "self", "statusId": "bankai"},
           "effects": [dmg("magic", ap=2.0)]}]}]})

A("79-03", "79-03 月牙天衝", "ground", [55, 55, 55, 55], [250, 350, 450, 550], 11,
  "[主動][指向][範圍][AP加成]\n{{cd}}秒冷卻\n消耗MP{{mp}}\n施法距離：{{range}}\n\n「月牙天衝！招式喊得越大聲，傷害就越強大」\n造成一[直線]上的敵方部隊受到450/600/750/900傷害。\n(若對方在 [破魔] 狀態，則額外造成 60% [AP] 傷害)\n(卍解 [變身] 狀態下傷害額外追加 120% [AP])",
  # ⭐ B3-C1 —— 79-02 用 hook 是因為它是單體；79-03 是線，hook 收不到「線上的每一個人」，
  #    所以走 onHitTargets。⛔ 不可以改寫成兄弟 damage：79-03 是 ground 技而它**沒有圓**，
  #    doc 頂層的 ctx.targets 只認 1 距離內的人。
  # ⚠️ 第二個括號「(卍解變身狀態下傷害額外追加 120% AP)」這一版仍然沒寫（已知殘留）。
  effects=[line("magic", length=11, width=2.0, per=[450, 600, 750, 900],
                onhit=[dict(dmg("magic", ap=0.6),
                            condition={"kind": "status", "subject": "target",
                                       "statusId": "magic-break"}),
                       # ⭐ 第二個括號終於有落點：與破魔那一條同一個機制
                       #    （onHitTargets 上的條件葉），差別只在 subject ——
                       #    破魔問「敵人」，卍解問「我自己」。
                       dict(dmg("magic", ap=1.2),
                            condition={"kind": "status", "subject": "self",
                                       "statusId": "bankai"})])])

A("79-04", "79-04 卍解", "self", [90, 90, 90], [100, 200, 300], 0,
  "[主動][輔助][變身]\n{{cd}}秒冷卻\n消耗MP{{mp}}\n\n「卍解。天鎖斬月」\n壓縮全部力量並進入 [卍解] 狀態，[攻擊速度]提升100/150/200%，[瞬步] 冷卻縮短 50%，持續8秒。",
  maxRank=3,
  # ⭐ 手打的 championForm 拿掉，改由 A-1 的規則產。79-04 是全檔唯一手打的一格，
  #    而那正是另外四支的缺口整整沒有人發現的原因（第零守則⑨）。
  form_sec=8.0,
  # ⭐ G10 —— 讓這份增益**同時是一個具名狀態**，79-03 的「(卍解狀態下…)」才有一顆
  #    條件葉問得到它。⛔ 條件系統沒有「形態」葉，而 79-03 是 damageLine、
  #    hook 收不到線上的人，所以 79-02 用的 whileForm 那條路在 E 上走不通。
  # ⚠️ 這支的 championForm.durationSec 也是 8.0 —— **兩個 8 必須一起改**
  #    （今天看不出來，但只要有人動其中一個，兩邊就會對同一個問題給不同答案）。
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
