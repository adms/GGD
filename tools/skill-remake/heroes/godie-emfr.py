#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""15 涅吉 —— `godie-emfr` 的 6 支技能（天生技 / Q / W / E / R / EX）。

⛔ 這一份只有**這一位英雄的資料**。共用的機制（`amt` / `dmg` / `area` /
   `buff` / 級距 / 各種閘）在 `common.py`；匯總與產生在 `batch1.py`。
"""
from common import A, M, amt, area, buff, dmg, line, status, static_model


# ⭐ S1 涅吉三支形態技的**共用模板**（第零守則⑨：N 個同型 = K 個模板 + 一張表）
#
# 15-02/03/04 的規格逐字共用三句話，三支各寫一份就是三份會各自腐爛的 JSON：
#   ①「持續12秒」→ 觸發器必須**跟著這 12 秒一起消失** ⇒ 掛進 `applyBuff.hooks`
#      （閘在 `sim/effects/hooks.ts`：來源過期就 continue）。
#      ⛔ 不是 `whileForm`：那一格讀 `world.championForm` 的身體索引，
#      而 godie-emfr **沒有第二具身體**，填了永遠是 false。
#      ⚠️ 這一條是三支裡最痛的：15-03 的兩條追打以前掛在**常駐 passive**，
#      所以**不按 E 也永遠生效**，而按了 E 只換來移速減半的**純負面**。
#   ②「([變身]為唯一狀態不可疊加)」→ `applyBuff.exclusiveGroup`，
#      `enforceExclusiveGroup` 會把同組舊的整份拔掉。
#      ⛔ 不是 championForm（不換身體）、⛔ 不是 stackKey（同 key 只加層數）。
#      ⚠️ 刻意**不填** `exclusiveOnExisting`：省略 = "replace"（新的接手）＝規格的讀法，
#      而留空這一格就是把「replace / reject」這個決策留在後台（第一守則）。
#   ③ 逐階數字 → hook payload 的 `perRank`：`applyBuff` 掛 source 時帶 grantRank，
#      `fireHooks` 以它求值。
EMFR_FORM = "emfr-form"      # 互斥組名：身上永遠只有一種戰型
EMFR_FORM_SEC = 12.0         # 規格三支逐字都寫「持續12秒」
#: 15-04「施放技能後的**下一次**普通攻擊」的武裝窗。規格**沒有寫秒數** ——
#: 那是一個決策點（第一守則），所以給它自己的常數。
#: ⛔ 不要沿用 EMFR_FORM_SEC：那是形態的 12 秒，借用等於把兩個決策綁成一格。
EMFR_ARM_SEC = 3.0
#: 武裝標記的**疊層鍵**。⚠️ 沒有它，`applyBuff.ts:154` 會把來源算成
#: `buff:${ctx.origin}#${world.tick}` —— **每一次施放都是一份全新的來源**，而
#: `maxTriggers` 的額度記在**逐來源一格**的 `src.hookFireCount[hi]`（hooks.ts）。
#: ⇒ R 開著的 12 秒內先放 Q 再放 EX（30s / 60s CD，3 秒窗口內完全放得出來）
#:   ＝ 身上兩份武裝，下一次普攻被兩份各扣一次額度、打出**兩發**雷神一擊
#:   ＝ 三階 600 + 140% AP 而不是 300 + 70% AP，而畫面上只是「這一下特別痛」
#:   （失敗形態②）。規格逐字是「施放技能後的**下一次**普通攻擊」一次。
#: ⭐ 同 key 只會有一份來源、一份額度；`onConsumed:"detachSource"` 打出去之後
#:   把整份卸掉（hooks.ts:500 推 `src.id`），所以下一次施放仍然重新武裝得起來。
EMFR_ARM_KEY = "emfr-thunder-arm"


def form_buff(mods, hooks=None, perRank=None):
    """涅吉的 12 秒戰型：互斥 + 限時，觸發器掛在它身上（⛔ 不是常駐 passive）。"""
    kw = {"exclusiveGroup": EMFR_FORM}
    if perRank is not None:
        kw["perRank"] = perRank
    return buff(mods, EMFR_FORM_SEC, hooks=hooks, **kw)


#: GH#369 —— owner 2026-08-18 逐字：「改成**生命回復 2%，魔力消耗 1%，只有在生命
#: 低於 50% 以下才會觸發**」。⇒ 第〇·六守則第 1 層（owner 的新版技能說明），
#: 贏過 2026-08-12 那一版的 5%/5% 常駐。被取代的兩份（w3x 的 A0UG 天生法術書、
#: 08-12 的 5%/5% 無條件）另存在 `docs/legacy/_w3x-fidelity-superseded.md` §6。
#: ⭐ 門檻是**掛在 hook 上的既有條件葉**（`condition.stat` / hp / percent），
#:   ⛔ 不是為這一支寫一個 if —— 同一顆葉子 59-00 / 60-002 / 92-00 都在用。
#:   `sim/effects/hooks.ts:484` 在 `hookLastFired` **之前**求值，所以血量高於門檻
#:   的那幾秒連 ICD 都不會被吃掉（＝門檻一掉下來就立刻跳第一次，不用再等一秒）。
#: ⚠️ `restore.healthPct` 的分母是 **maxHp**（`sim/effects/restore.ts:28`
#:   `hp.maxHp * healthPct`），不是「已失去的生命」——「生命回復 2%」照卡片上
#:   原本就寫著的「%[最大生命]」讀，兩邊語意一致。
HP_LOW_50 = {"kind": "stat", "subject": "self", "stat": "hp",
             "mode": "percent", "op": "<=", "value": 0.5}

A("15-00", "15-00 真·不死不滅", "self", [0], [0], 0,
  "[被動][週期][屬性門檻][回復][燒魔]\n\n「為了拯救我的學生，以及打噴嚏」\n自身生命低於 50% 時才會發動：每秒[回復] 2%[最大生命]，但每秒也[燒魔]魔力 1%。",
  innate="passive",
  passive={"name": "15-00 真·不死不滅", "ranks": [{"hooks": [
      {"on": "onInterval", "internalCooldown": 1.0, "target": "self",
       "condition": HP_LOW_50,
       "effects": [{"kind": "restore", "healthPct": 0.02, "applyTo": "self"},
                   {"kind": "spendMana", "amount": amt(flat=0), "pctMaxMana": 0.01,
                    "applyTo": "self"}]}]}]})

A("15-01", "15-01 雷神槍「巨神殺手」", "ground", [30, 30, 30, 30], [175, 275, 375, 475], 6.42,
  "[主動][指向][範圍][AP加成]\n{{cd}}秒冷卻\n消耗[MP] {{mp}}\n施法距離：{{range}}\n\n「千之雷是頂級魔法，但我還可以開掛」\n對[前方]一[直線]敵方單位造成 {{dmg}} +30% [AP]傷害，附帶麻痺 [緩慢] [移動速度]，持續1秒",
  effects=[line("magic", length=6.42, width=1.6, per=[250, 350, 450, 550], ap=0.3),
           status("slow50", 1.0, moveSpeedMult=0.5)])

A("15-02", "15-02 疾風迅雷", "self", [60, 60, 60, 60], [120, 180, 240, 300], 0,
  "[主動][輔助][變身][普攻時][AP加成]\n{{cd}}秒冷卻\n消耗[MP] {{mp}}\n持續12秒\n\n「質疑魔法、成為魔法、超越魔法」\n獲得 1.2倍 [移動速度] 與 30/60/90/120% [攻擊速度]，普通攻擊附加 30/45/60/75 +10% [AP] 雷電傷害。\n([變身]為唯一狀態不可疊加)",
  # ⭐ 三條缺口一起關：①雷電追打搬進 12 秒 buff（⛔ 不再靠 `status rage` ——
  #    全 content 施加 rage 的只有 godie-hapm.q/w 與 godie-h01u.q，這支自己不施加，
  #    所以那個條件**永遠是 false，追打一次都不會發動**）②逐階 30/45/60/75
  #    ③互斥組由 form_buff() 填。⛔ passive 整塊刪掉。
  effects=[form_buff([M("ms", "pctMult", 0.2), M("as", "pctAdd", 0.3)],
                     hooks=[{"on": "onBasicAttack", "target": "event",
                             "effects": [dmg("magic", per=[30, 45, 60, 75], ap=0.1)]}],
                     perRank=[{"modifiers": [M("ms", "pctMult", 0.2), M("as", "pctAdd", a)],
                               "duration": 12.0}
                              for a in (0.3, 0.6, 0.9, 1.2)])])

A("15-03", "15-03 獄炎煉我", "self", [55, 55, 55, 55], [180, 260, 340, 420], 0,
  "[主動][變身][普攻時][範圍][AP加成]\n{{cd}}秒冷卻\n消耗[MP] {{mp}}\n持續12秒\n\n「問問這砂鍋大的火拳？」\n普通攻擊附加 60/90/120/150 + 40% [AP] 火焰傷害，每次技能命中都會引發爆炎[燃燒]標記，對[周圍]敵人造成 {{dmg2}} +60% [AP] [範圍]傷害，但[移動速度]減半。\n([變身]為唯一狀態不可疊加)",
  # ⭐ 「獄炎」是**火**技，但這一格從舊文件繼承下來的是 `fx.prim.lightning.nova`
  #    —— 從同英雄的雷系兄弟技（Q/W/R 都是雷）複製過去沒改的一格。
  #    `apps/client/src/GameApp.ts:651` 是 `def.vfxKey ? vfxFor(def.vfxKey) : null`，
  #    施放特效直接讀這一格 ⇒ 一支內文講三次火（火焰傷害／爆炎／燃燒）的技能，
  #    在畫面上炸開的是藍色雷電，三支變身技分不出是哪一種。
  # ⛔ 不要改 `content/abilities/godie-emfr.e.json` —— 那是這支產生器的輸出，
  #    下次一跑就被覆寫。唯一的出口是這一格表格欄位（見 build() 的覆寫閘）。
  vfx_key="fx.prim.fire.nova",
  # ⭐ 四條缺口一起關：①普攻火焰逐階 60/90/120/150 ②爆炎逐階 100/150/200/250
  #    ③⚠️ 兩條追打搬進 12 秒 buff —— 在此之前它們掛在**常駐 passive**，所以
  #    **不按 E 也永遠生效**，而按了 E 只換來移速減半的**純負面**（玩家一定看得出來）
  #    ④互斥組由 form_buff() 填。⛔ passive 整塊刪掉。
  # ⭐ GH#691（#688 Phase 6-1）—— 原作的 `AddSpecialEffect` dummy（`MonsoonBoltTarget.mdl`）。
  #    census 逐列：`provenance jass:effectTargetUnit（A052）—— 同上,無 dummy`。⛔ 手寫進出貨 JSON 會被下一次 skillremake:json 打回來
  #    （`carry_mechanisms` 只沿用 invulnerable / spawnProjectile），所以它走表格出口。
  model_fx=[static_model("w3x.stock.monsoonbolttarget", "self", 1.0, scale=4.0)],
  effects=[form_buff([M("ms", "pctMult", -0.5)],
                     hooks=[{"on": "onBasicAttack", "target": "event",
                             "effects": [dmg("magic", per=[60, 90, 120, 150], ap=0.4)]},
                            # ⭐ 「每次**技能命中**都會引發爆炎」的落點是
                            #    `onDamageDealt` + `damageSource:"ability"`，
                            #    ⛔ **不是** `onAbilityHit`。理由是發射點：
                            #    `onAbilityHit` 只在 `abilitySystem.ts:445` /
                            #    `CastResolveSystem.ts:102` 對**施法當下算出的 targets**
                            #    發（而且 `hitId !== caster` 排掉自己），
                            #    `sim/effects/damageLine.ts` 裡一行 `fireHooks` 都沒有。
                            # ⚠️ 涅吉五格技能裡唯一會傷人的是 Q，而 Q 是 ground + damageLine
                            #    ⇒ 那條線上真正被打中的人一個都不算「命中」；
                            #    W/E/R/EX 全是 self ⇒ targets=[caster] ⇒ 被 `hitId !== id` 濾掉。
                            #    ＝ 這一句規格在場上**一次都不會發生**（失敗形態②：
                            #    卡片上最顯眼的那一句，玩家只換到普攻附火 + 移速減半）。
                            #    `combat/damage.ts:1235` 對每一發**真的落地**的封包都發
                            #    `onDamageDealt`，那才是「命中」。
                            # ⛔ 不會遞迴：hook 效果的 origin 是 `hook:…`（hooks.ts:543），
                            #    而 `damageSource:"ability"` 走 `originInScope`（只認
                            #    `ability:` **開頭**），所以爆炎自己打不出第二發爆炎。
                            # ⚠️ 節奏（一條線打中三個人＝三次爆炎）刻意**不寫死**：
                            #    要節流就是 hook 的 `internalCooldown` 一格，留空＝規格
                            #    逐字的「每次」（第一守則：決策留在欄位，不在註解裡辯護）。
                            {"on": "onDamageDealt", "target": "event",
                             "damageSource": "ability",
                             "effects": [area("magic", tier="小",
                                              per=[100, 150, 200, 250], ap=0.6),
                                         status("burn", 3.0)]}])])

A("15-04", "15-04 雷天大壯。貳式", "self", [60, 60, 60], [200, 400, 600], 0,
  "[主動][變身][普攻時][AP加成]\n{{cd}}秒冷卻\n消耗[MP] {{mp}}\n持續12秒\n\n「比光更快的是思念，比思念更快的是昨天」\n獲得 2倍 [移動速度]、100/150/200% [攻擊速度]、[攻擊速度上限]提升至10。施放技能後的下一次普通攻擊將釋放雷神一擊，造成 {{dmg}} + 70% [AP] 雷屬性傷害。\n([變身]為唯一狀態不可疊加)",
  maxRank=3,
  # ⛔ 舊文件那顆 `spawnProjectile`（`imported.bolt.lightning`）**明示退場**。
  #    它是 A-5「沉默 ≠ 移除」的沿用機制帶回來的，但在新版規格下它是一發**空包彈**：
  #    castType 是 self ⇒ 按下 R 的瞬間就往 `t.facing` 射出去（`spawnProjectile.ts`
  #    沒有 point/direction 時的退路），而 `onHit: []` ⇒ `runEffects([])` = 0 傷害。
  #    更糟的是 `ProjectileSystem.ts:122` 會因為 origin 有 `ability:` 前綴，替這發
  #    空包彈補一次 `fireHooks(onAbilityHit)` 與一次 `recordAbilityHit`（戰績多一筆
  #    假命中）。規格的「雷神一擊」是**下一次普通攻擊**打出去的，不是施法瞬間飛出去的
  #    東西 —— 玩家會把那道不痛的閃電當成雷神一擊，照著它去站位對線（失敗形態②）。
  #    視覺改掛在真正打出去的那一發上（見下面那顆 spawnVfx）。
  retire={"spawnProjectile": "15-04 的雷神一擊由下一次普攻打出（onAbilityCast→onBasicAttack 武裝鏈），"
                             "施法瞬間那顆 imported.bolt.lightning 是 onHit 空的空包彈：0 傷害、"
                             "誤導站位、還記一次假命中。視覺改用 spawnVfx 掛在真正打出去的那一發上。"},
  # ⭐ 五條缺口一起關（⛔ 不是逐條補丁，是把整條時序寫出來）：
  #    ①觸發條件「**施放技能後**」—— 武裝來源是 `onAbilityCast`（在此之前整個沒有）
  #    ②「**下一次**」一次性 —— `maxTriggers: 1`；`consumeOn` 單獨填是**沒有用的**
  #      （`hooks.ts` 只在 `maxTriggers !== undefined` 才進扣額度那一段）
  #    ③雷神一擊逐階 150/225/300 ④只在 12 秒形態內（整棵搬進 form_buff 的 hooks）
  #    ⑤互斥組由 form_buff() 填。⛔ passive 整塊刪掉。
  #    ⚠️ 額度**不可以**放在常駐 passive 上：那是一份跟著英雄一整場的來源，
  #      `maxTriggers: 1` 會變成「一場只有一次」。掛在 buff 上才是「每次武裝一次」——
  #      每一發 onAbilityCast 都掛一份**新的** source（selfId 帶 tick），額度跟著它走。
  #    ⚠️ 武裝標記是**獨立的一顆限時 buff**（`EMFR_ARM_SEC`）——
  #      它**不隨形態結束消失**、也**不受 exclusiveGroup 管**。誠實記著。
  # ⭐ GH#691（#688 Phase 6-1）—— 原作的 `AddSpecialEffect` dummy（`MonsoonBoltTarget.mdl`）。
  #    census 逐列：`provenance jass:effectTargetUnit（A053）—— 同上,無 dummy`。⛔ 手寫進出貨 JSON 會被下一次 skillremake:json 打回來
  #    （`carry_mechanisms` 只沿用 invulnerable / spawnProjectile），所以它走表格出口。
  model_fx=[static_model("w3x.stock.monsoonbolttarget", "self", 1.0, scale=4.0)],
  effects=[form_buff([M("ms", "pctMult", 1.0), M("as", "pctAdd", 1.0),
                      M("as", "capRaise", 10.0)],
                     hooks=[{"on": "onAbilityCast", "target": "self",
                             "effects": [buff([], EMFR_ARM_SEC,
                                              # ⭐ 一份武裝 = 一份來源 = 一次額度
                                              #    （為什麼一定要有 key 見 EMFR_ARM_KEY）。
                                              # ⚠️ `maxStacks=1`：這顆 buff 的 modifiers 是空的，
                                              #    層數對數值沒有任何作用，釘成 1 才不會讓一個
                                              #    沒有意義的計數在面板上長出來。
                                              #    ⛔ 疊層路徑**不重置** `hookFireCount` ——
                                              #    那正是要的：窗口內再施放只刷新到期時間，
                                              #    不會補一份新的額度。
                                              stackKey=EMFR_ARM_KEY, maxStacks=1,
                                              hooks=[
                                 {"on": "onBasicAttack", "target": "event",
                                  "maxTriggers": 1, "consumeOn": "fire",
                                  "onConsumed": "detachSource",
                                  # ⭐ 規格那一句的「視覺」那一半就掛在這裡 ——
                                  #    真正打出 150/225/300 + 70% AP 的是這一發，而它
                                  #    在此之前**畫面上什麼都沒有**：它的 origin 是
                                  #    `hook:buff:…`，不走 `def.vfxKey` 那條施放特效路徑，
                                  #    所以三階最高 300 的那一下看起來只是一次普攻。
                                  # ⚠️ `at:"target"` = 打在被打的那個人身上，⛔ 不是施法者
                                  #    （`spawnVfx.ts` 的 at 省略時退回 caster）。
                                  "effects": [dmg("magic", per=[150, 225, 300],
                                                  ap=0.7),
                                              {"kind": "spawnVfx",
                                               "vfxId": "fx.prim.lightning.bolt",
                                               "at": "target"}]}])]}],
                     perRank=[{"modifiers": [M("ms", "pctMult", 1.0), M("as", "pctAdd", a),
                                             M("as", "capRaise", 10.0)],
                               "duration": 12.0}
                              for a in (1.0, 1.5, 2.0)])])

A("15-002", "15-002 敵彈吸收陣。太陰道", "self", [60], [0], 0,
  "[主動][輔助][反彈][回復][層數累積][AP加成]\n{{cd}}秒冷卻\n\n「大..太陰道，吸收！」\n[反彈] 100% 魔法([AP])傷害，並且將傷害轉化為自身魔力([MP])，以及將該傷害短暫加成至 [AP] ([可累加])，持續 5秒後歸零。",
  # ⭐ B3-A —— 有了反彈，下面那條 onReflectSuccess（轉魔力）才第一次收得到事件。
  # ⚠️ 規格第三句「將該傷害短暫加成至 [AP]([可累加])」**仍然沒實作**（engine-gap：
  #    需要「把事件數值換算成暫時屬性」的機制），兩筆豁免因此保持有效。
  effects=[buff([], 5.0, hooks=[
      {"on": "onDamageTaken", "target": "event", "damageType": "magic",
       "effects": [dmg("magic", flat=0, inc_pct={"perRank": [1.0]})]}])],
  passive={"name": "15-002 敵彈吸收陣。太陰道", "ranks": [{"hooks": [
      {"on": "onReflectSuccess", "target": "self",
       # ⭐ 規格第三句「將該傷害短暫加成至 [AP]([可累加])，持續 5秒後歸零」——
       #    `eventValueConversion.buff` 就是那一格（同一發效果，⛔ 不需要第二顆）。
       #    ([可累加]) 是**免費**的：statPipeline 對多份 flat 來源求和。
       "effects": [{"kind": "eventValueConversion", "shape": "single", "source": "incomingDamage",
                    "to": "mana", "ratio": 1.0, "who": "self",
                    "buff": {"stat": "ap", "durationSec": 5.0, "ratio": 1.0}}]}]}]})
