#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""60 勇者 —— `godie-h00l` 的 6 支技能（天生技 / Q / W / E / R / EX）。

⛔ 這一份只有**這一位英雄的資料**。共用的機制（`amt` / `dmg` / `area` /
   `buff` / 級距 / 各種閘）在 `common.py`；匯總與產生在 `batch1.py`。
"""
from common import A, amt, area, buff, dmg, hook_icd, status


A("60-00", "60-00 大師之劍", "self", [0], [0], 0,
  "[被動][淨化][普攻時]\n\n「真正的大師，都是買分的」\n[普通攻擊時]造成額外 3%[最大生命]傷害。並且造成 [淨化] 效果。",
  innate="passive",
  # ⭐ owner 2026-08-21 ⑤：「**不對 有些被動是有冷卻的 例如初號機吞噬**」
  #    ⇒ 這一支是「觸發式被動、零節流」那 9 支之一，而它**兩半的處置不一樣**：
  #      · 3% 最大生命的魔傷 —— 規格本體（「[普通攻擊時]造成額外 3%[最大生命]傷害」），
  #        ⛔ 不設限。
  #      · [淨化] —— 攻速上限 4 ⇒ **每秒 4 次 dispel**，對手放的任何增益平均活不過
  #        0.25 秒。那不是「大師之劍很強」，是**沒有人替它裝門**。
  #    ⇒ 拆成兩條 hook，只有淨化那一格帶內部冷卻。
  # ⚠️ `hook.internalCooldown` 是**實際秒**（`sim/effects/hookIcd.ts::hookIcdTicks`
  #    ⛔ 不吃 `combatEnv.cooldown`），而 `ability.cooldown[]` 是**卡面秒**。
  #    ⇒ 數字由 `hook_icd()` 從 owner 的冷卻表推導，⛔ 不手打 ——
  #    同一個數字寫在兩個欄位裡差 5 倍，而 59-00 暴走已經因此差了 5 倍。
  passive={"name": "60-00 大師之劍", "ranks": [{"hooks": [
      {"on": "onBasicAttack", "target": "event",
       "effects": [dmg("magic", flat=0,
                       res_pct={"subject": "target", "resource": "health",
                                "basis": "max", "perRank": [0.03]})]},
      {"on": "onBasicAttack", "target": "event", "internalCooldown": hook_icd(),
       "effects": [{"kind": "dispel", "shape": "single",
                    "pools": {"status": True}, "count": 1}]}]}]})

A("60-01", "60-01 旋風斬", "self", [30, 30, 30, 30], [100, 150, 200, 250], 0,
  "[主動][範圍][AD加成][擊退]\n{{cd}}秒冷卻\n消耗MP{{mp}}\n\n「看我先暈倒還是你先被我砍死」\n造成[周圍][範圍] {{dmg}}+50% [AD]點傷害，並且[擊退]敵人。",
  radiusTier="小",
  effects=[area("physical", tier="小", per=[150, 250, 350, 450], ad=0.5),
           {"kind": "knockback", "distance": 3.0, "speed": 15.0, "from": "caster"}])

# ⭐ castType `ground` → `targeted`：內文逐字是「勾住**一個單位**」，標籤列也是
#    [指向]。ground 讓玩家點的是一塊空地，沒有任何節點鎖定被勾住的身體。
# ⚠️ 內文「[直線]距離」那一半（路徑阻擋、勾不過牆）**沒做** —— 明說，不是漏掉。
A("60-02", "60-02 鎖鏈槍", "targeted", [45, 45, 45, 45], [50, 75, 100, 125], 11,
  "[主動][指向][範圍][跳躍]\n{{cd}}秒冷卻\n消耗MP{{mp}}\n\n「我喜歡勾，但不喜歡脫鉤的時候」\n[直線]距離勾住一個單位，自身[跳躍]過去，並給予 150/250/350/450傷害。",
  # ⚠️ apexHeight 只能是 JASS 家族值 —— `GGD_APEX_PER_WC3 = 1/250` 把 w3a 的
  #    0 / 300 / 600 / 1000 換成 0 / 1.2 / 2.4 / 4.0，而 `leapFraming.test.ts:411`
  #    逐支釘死這四個。1.4 是我手打出來的第五個值，它同時**跳出畫面 51%**
  #    （同一支測試的取景檢查）。
  # ⚠️ 改成 1.2 之後仍然裁掉 45% —— 因為 `throwDistance: 11` 是全 roster 最長的
  #    勾索之一，弧線本身就出框。最後取 **0.0**：規格是「[直線]距離勾住一個單位，
  #    自身[跳躍]過去」，那是**沿地面被扯過去**不是被拋高，所以 apex 0 反而更忠實
  #    （`godie-hart.q` 同型也是 0）。取景 0% 裁切。
  effects=[{"kind": "leap", "applyTo": "self", "mode": "toPoint", "apexHeight": 0.0,
            "durationSec": 0.4, "throwDistance": 11.0, "landRadius": 3.0,
            "onLand": [dmg("physical", per=[150, 250, 350, 450])]}])

A("60-03", "60-03 三角神力．勇氣", "self", [0], [0], 0,
  "[被動][強化][普攻時][AP加成]\n\n喚醒勇者體內的三角神力，提高 [智慧]、[敏捷]、[力量] 3/6/9/12點，並且每三下普通攻擊則會額外造成 33% [AP]傷害。",
  innate="passive", maxRank=4,
  passive={"name": "60-03 三角神力．勇氣", "ranks": [
      {"attributes": {"str": v, "agi": v, "int": v},
       # ⭐「每三下」是**次數**不是時鐘 —— ⛔ 不可以用 internalCooldown 冒充。
       #    出貨到今天這條 hook **完全無條件** ⇒「每三下」變成**每一下**，
       #    輸出是規格的 3 倍（玩家看得出來的平衡缺陷）。
       #    計數器＝一顆疊層狀態，兩條 hook 依**陣列序**跑：第三下先 +1 變成 3、
       #    再被下面那條 minStacks:3 讀到，然後 -3 歸零。
       "hooks": [{"on": "onBasicAttack", "target": "event",
                  "effects": [status("triforce-courage", 60.0, stacks=1, applyTo="self")]},
                 {"on": "onBasicAttack", "target": "event",
                  "condition": {"kind": "status", "subject": "self",
                                "statusId": "triforce-courage", "minStacks": 3},
                  "effects": [dmg("magic", ap=0.33),
                              status("triforce-courage", 60.0, stacks=-3, applyTo="self")]}]}
      for v in (3, 6, 9, 12)]})

A("60-04", "60-04 完美盾反", "self", [60, 60, 60], [120, 150, 180], 0,
  "[主動][反彈]\n{{cd}}秒冷卻 吟唱{{cast}}秒\n消耗[MP] {{mp}}\n有效半徑：{{radius}}\n\n「唯一擋不住的是你的魅力」\n瞬間架起海拉爾之盾，[反彈]魔法([AP])及物理([AD])傷害，持續3秒，期間若成功[反彈]敵方技能[AP]傷害，立即 [回復] 8/16/24% [最大生命]，並且[擊退]敵人。",
  maxRank=3, cast_time=2.0,
  # ⭐ B3-A —— ⛔ 刻意不填 damageType：規格是魔法**及**物理都反彈。
  # ⚠️ 兩題要拿給 owner：`perRank=[1.0]` 是**發明的數字**（規格只給了回復 8/16/24%，
  #    沒給反彈比）；`negateOriginal` 沒填 ⇒ 照樣掉血只是打回去。
  # ⚠️ engine-gap：反彈封包一律以 magic 送出 ⇒ 反彈物理傷害會走魔抗而不是護甲。
  effects=[buff([], 3.0, hooks=[
      {"on": "onDamageTaken", "target": "event",
       "effects": [dmg("magic", flat=0, inc_pct={"perRank": [1.0]})]}])],
  passive={"name": "60-04 完美盾反", "ranks": [{"hooks": [
      # ⭐ `target:"event"` —— 出貨寫 "self" 的話 `ctx.targets=[自己]`，
      #    規格說的「並且[擊退]**敵人**」會變成把自己推開。
      #    回復仍然 `applyTo:"self"`，所以兩句話各自打對人。
      # ⭐ `healthPct` 逐階 8/16/24%（`zRankScalar` 早就收陣列）——
      #    原本只有一格 0.08，rank 2/3 的 16%/24% 玩家永遠拿不到。
      {"on": "onReflectSuccess", "target": "event",
       "reflectedDamageSource": "ability", "reflectedDamageType": "magic",
       "effects": [{"kind": "restore", "healthPct": [0.08, 0.16, 0.24], "applyTo": "self"}]},
      # ⭐「有效半徑 6」的擊退（2026-08-13）：knockback 自己**沒有圓**，唯一的圓形
      #    目標集產生器是 damageArea 的 onHitTargets。圓心必須是林克，所以這一條的
      #    target 是 "self"。⚠️ 舊寫法 target:"event" ⇒ 只推得到**剛才那一個攻擊者**，
      #    規格的「半徑 6 內的敵人被擊退」在場上是一個人。
      #    ⚠️ 上面那段註解說「出貨寫 self 會把自己推開」對**頂層 sibling** 是真的，
      #    但搬進 onHitTargets 之後它收到的是這個圓真的打到的敵人（第三守則）。
      #    flat=1 不是 0：damageArea 無條件 push 封包，0 會在畫面上打出一排「0」。
      {"on": "onReflectSuccess", "target": "self",
       "reflectedDamageSource": "ability", "reflectedDamageType": "magic",
       "effects": [area("magic", tier="中", flat=1,
                        onhit=[{"kind": "knockback", "distance": 4.0,
                                "speed": 16.0, "from": "caster"}])]}]}]})

A("60-002", "60-002 勇者意志", "self", [120], [0], 0,
  "[被動][反彈成功時][反彈]\n{{cd}}秒冷卻\n\n「真正的勇者不是不會死，是存檔點夠近」\n生命值低於30%時，立即獲得相當於 100% [最大生命值]的[護盾]，120秒內只能觸發一次，若 [完美盾反] [反彈]成功，冷卻立即重置。",
  # ⚠️ engine-gap（2026-08-13 量到的）——「120秒冷卻」這一句的**機制**是好的：
  #    hook 的 `internalCooldown` 真的鎖得住，`onReflectSuccess` 那一條也真的把
  #    `hookLastFired` 寫回 `NEVER_FIRED`（＝逐字等於「從來沒發動過」）。壞的是它
  #    在**畫面上**與**後台上**都不存在，而兩半都不在這張表的射程內：
  #
  #    ① 玩家看不到：`apps/game-server/src/net/snapshot.ts` 沒有投影
  #       `hookLastFired` / `internalCooldown`（`apps/client/src/ui/hud/` 唯一一筆
  #       `internalCooldown` 在 `markModel.ts`，而它自己註明跟 sim 的 hook ICD 無關）。
  #       EX 圖示讀的是 `seat.exCooldown` ＝ `exSlot.cooldownRemainingTicks`，而這支
  #       `effects: []` 是**純被動**、永遠不會被 cast ⇒ 那一格恆為 0 ⇒ 圖示永遠亮著，
  #       沒有掃描也沒有秒數，「反彈成功立即重置」也沒有任何回饋。
  #       ⛔ 不可以用 `modifyCooldown{target:"abilitySlot"}` 去「把 EX 推上冷卻」湊一個
  #       掃描出來：`sim/effects/modifyCooldown.ts` 那條路第一道就是
  #       `if (inst.cooldownRemainingTicks <= 0) continue;` —— 它只縮短**已經在跑**的
  #       冷卻，起不了一格新的（`mode` 也沒有 `set`）。
  #       ⛔ 也不可以改寫成「狀態當鎖」：`schema/condition.ts` 的 `zStatusIdLeaf` 只有
  #       `minStacks ≥ 1`，**沒有**「不帶某狀態」這一葉，寫不出「上次觸發過就別再觸發」。
  #
  #    ② 後台旋鈕碰不到：`sim/effects/hookIcd.ts` 的 factor 是
  #       `src.kind === "item" ? combatEnv.itemCooldown : 1` ⇒ 英雄被動一律 1，所以這
  #       120 秒是**真的 120 秒**；而同一位英雄 60-04 的「60秒冷卻」走技能槽位、吃出貨
  #       `content/config/combat-env.json` 的 `cooldown: 0.2` ⇒ 實際 12 秒。規格寫的是
  #       2 倍稀有度，出貨是 10 倍。
  #       ⛔ 這裡**不可以**把 120 改成 24 去湊比例 —— 那是把一個 config 值烘進內容
  #       （第一守則），owner 下次調 `cooldown` 這一格就再度說謊，而且沒有任何守衛會紅。
  #
  #    ⚠️ 這是 37 支 `effects: []` 純被動 EX **共有**的形態（這 15 位英雄裡佔 9 支），
  #       ⛔ 不是 60-002 自己的內容錯 —— 修它要動引擎（多一條投影 + 一格冷卻縮放範圍），
  #       不是動這張表。
  passive={"name": "60-002 勇者意志", "ranks": [{"hooks": [
      {"on": "onDamageTaken", "key": "brave-will", "target": "self",
       "internalCooldown": 120.0,
       "condition": {"kind": "stat", "subject": "self", "stat": "hp",
                     "mode": "percent", "op": "<=", "value": 0.3},
       # ⭐「相當於 **100% [最大生命值]**的[護盾]」—— flat 1500 是一個寫死的常數：
       #    一個 6,000 血的滿裝英雄拿到的是 25%，而卡片說 100%。
       # ⚠️ 副作用要明說：**低等級時它變小**（第 1 回合約 750 vs 今天 1500），
       #    要寫進 release note。
       "effects": [{"kind": "shield",
                    "amount": amt(ratios=[{"stat": "maxHealth", "coeff": 1.0}]),
                    "duration": 8.0}]},
      # ⭐ B3-A —— 「若完美盾反反彈成功，冷卻立即重置」。
      # ⚠️ 這一筆的存活條件是 60-04 同批落地：onReflectSuccess 由反彈封包落地時發，
      #    而 godie-h00l 整組在這一批之前沒有任何 damage.incomingPct
      #    ⇒ 單獨套用 = 卡片寫了、遊戲裡永遠不觸發（失敗形態②）。
      {"on": "onReflectSuccess", "target": "self",
       "effects": [{"kind": "modifyCooldown", "shape": "single", "who": "self",
                    "mode": "reset", "target": "hookInternalCooldown",
                    "hookKey": "brave-will", "hookScope": "originSource"}]}]}]})
