#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""59 初號機 —— `godie-e00r` 的 6 支技能（天生技 / Q / W / E / R / EX）。

⛔ 這一份只有**這一位英雄的資料**。共用的機制（`amt` / `dmg` / `area` /
   `buff` / 級距 / 各種閘）在 `common.py`；匯總與產生在 `batch1.py`。
"""
from common import A, CD_ECHO, M, TIER_R, amt, buff, hook_icd, line, status


# ⭐ GH#574 —— owner 2026-08-23 逐字：
#    「初號機 **天生技暴走門檻 5->10%** 請你**測試確定真的會暴走 不能控制**
#      並且身上要有**明顯冒煙特效**」
#
# 三件事，三個落點：
#  ① 門檻：下面 `BERSERK_HP_PCT`（⛔ 不是散在條件葉裡的一個字面值）。
#  ② 「真的不能控制」：`sim/berserk.ts::berserkDropsOrders` 早就在了 ——
#     守衛在 `packages/shared/src/sim/berserkUncontrollable.test.ts`，它斷言的是
#     **玩家的 order 真的被丟掉**（讀 `IntentFrame` 採納之後的結果），
#     ⛔ 不是「旗標有沒有被設」。
#  ③ 冒煙：下面 `berserk_smoke()`。
#
# ⚠️ ⛔ 這一格**不搬到** `content/config/berserk.json`：那份文件管的是
#    「**主動**暴走可以按下去的門檻（`castHpPct`）」與暴走期間的冷卻倍率 ——
#    ⭐ 這裡是**天生技自動觸發**的門檻，兩者是**兩個問題**，合成一格會讓
#    「按得下去」與「自己會炸」再也分不開（59-001 完全暴走的 50% 是第三個值，
#    它自己就證明了這一軸是**逐支技能**的，⛔ 不是一個全域常數）。
#    ⇒ 它住在技能文件上（`condition.value`），而技能文件正是後台／Codex 編輯器
#    改得到的地方（第一守則：可調 ✅）。
BERSERK_HP_PCT = 0.10


def berserk_smoke(duration, hz=4.0):
    """⭐【明顯冒煙】暴走期間**跟著身體**的常駐煙柱。

    ⛔ 為什麼不是 `persistentVfx`：那一格今天只算得出 `when` **缺席**的那一批
       （客戶端刻意不重寫一份會跟 sim 漂開的條件求值器），而「暴走中」正是一個
       `when` —— 加上去會讓 `persistentVfxClientCoverage.test.ts` 當場紅，
       而且畫面上與「條件沒成立」長得一模一樣（失敗形態②）。
    ⛔ 為什麼不是一發 `spawnVfx`：`vfxSpawn` 是**定點**一次性的（客戶端拿的是
       世界座標），初號機一走開，煙就留在原地。

    ⭐ 所以用既有的兩個零件組出來（第〇·五守則：⛔ 沒有為這一支寫任何新機制）：
       `delayed` 排一串班表，每一發跑一顆 `spawnVfx at:"self"` ——
       而 `spawnVfx` 的 `"self"` 是在**那一發到期的當下**才去讀施法者的座標，
       ⇒ 煙一路跟著身體。`stopOnCasterDeath` 讓它在倒下的那一刻停。
    """
    count = int(round(duration * hz))
    assert 1 <= count <= 32, f"delayed.count 上界是 32（DELAYED_MAX_COUNT），算出 {count}"
    return {"kind": "delayed", "shape": "single",
            "delaySec": 1.0 / hz, "count": count, "intervalSec": 1.0 / hz,
            "effects": [{"kind": "spawnVfx",
                         "vfxId": "fx.w3x.particle.flamessmoke.p00", "at": "self"}],
            "stopOnCasterDeath": True}


# ═════════════════════════════════════════════════════════════════════════════
# ⭐ GH#644 —— owner 2026-08-24 四則逐字（⛔ 不要再問）：
#  ①「AT力場效果及說明**除了護盾以外，追加** 10/15/20/25%機率格擋50%物理傷害」
#  ②「暴走狀態免疫所有負面 buff，吸血提升到100%, EX提升到400%
#     暴走狀態追加身體移動拖曳光束特效」
#  ③「吞噬 應該改為單體的冷卻 6秒才符合五級距」
#  ④「暴走狀態 吞噬門檻提升2x，請記得改說明跟實際效果」
# ═════════════════════════════════════════════════════════════════════════════


# ⭐ GH#661 —— owner 2026-08-24 說了兩次的同一件事：
#    「暴走狀態**追加身體移動拖曳光束特效**」／「初號機的**暴走移動拖曳特效**」
#
# ⚠️ GH#644 ② 落地的版本**不是它**：那是一串 `delayed` 班表，每 0.25 秒在腳下
#    放一發**定點**的 `fx.prim.ki.beam`（一根光柱）。站著不動 = 原地一直閃光柱，
#    跑起來 = 一串**離散的**光柱，⛔ 而且與「移動得多快」完全無關。
#    ⭐ owner 要的是「**移動拖曳**」：跟著身體、沿著路徑、**速度越快越明顯**。
#
# ⇒ 三個改動，⛔ 零個新機制（第〇·五守則）：
#   ① vfxId 指向一份 **`ribbon@1`**（`content/vfx/fx.trail.berserk-beam.json`）。
#      客戶端的判準就是「它是不是一份緞帶文件」—— 是就交給 `MoveTrailFx`
#      拉一條**每一幀**跟著身體走的光幕（⛔ 不是名單、⛔ 不是技能 id 的 if）。
#   ② 節奏從 `delayed` 班表換成增益自己的 **`onInterval` hook**。
#      ⭐ 這一格是承重的：班表**排下去就一定跑完**，所以暴走被提前拔掉（或
#      被驅散）時光束還會繼續落 —— 而 hook 是**隨增益生、隨增益死**，
#      也就是 owner 要的「出暴走當場清乾淨」。順帶解掉 `DELAYED_MAX_COUNT`
#      32 發的上限（12 秒 × 4Hz = 48 發，原本只能把 hz 降到 2.5 硬塞）。
#   ③ `durationSec` = 客戶端那一拍的 **hold**（心跳停了多久就拆）。
#      ⚠️ 它必須 **>** 心跳週期（否則兩拍之間會斷格 ⇒ 拖曳變閃爍），
#      同時 **<** #569 的 0.5 秒（它是「暴走結束到畫面乾淨」的上界）。
#
# ⭐ 一鍵 rollback（後台／內容編輯器一格，⛔ 不必重新部署）：把這一格改回
#    `fx.prim.ki.beam`（一份 `vfx@1`）⇒ 客戶端認不出緞帶 ⇒ 逐位元退回 GH#644
#    的定點光柱演出。⇒ 「換一份文件」就是開關本身。
BERSERK_TRAIL_VFX = "fx.trail.berserk-beam"
#    ⭐ 0.25 秒一拍：夠密（每一拍之間身體最多走 ~1.5 格，緞帶自己是 60Hz 取樣
#    所以中間不會斷），也夠疏（12 秒才 48 則事件，⛔ 不是每 tick 30 則）。
BERSERK_TRAIL_BEAT_SEC = 0.25
#    ⭐ 0.4 秒 hold：> 0.25（不斷格）且 < 0.5（#569）。
BERSERK_TRAIL_HOLD_SEC = 0.4


def berserk_beam_trail_hook():
    """⭐【移動拖曳光束】的心跳 —— 掛在**暴走增益自己**身上的一條 hook。

    ⛔ 為什麼不是 `persistentVfx`：那一格今天只算得出 `when` **缺席**的那一批，
       而「暴走中」正是一個 `when` —— 加上去會讓
       `persistentVfxClientCoverage.test.ts` 當場紅（同 `berserk_smoke` 的理由）。
    ⛔ 為什麼不是 `delayed`：見上面 ②（班表停不下來）。
    ⭐ 為什麼 `onInterval` 就夠：`IntervalHookSystem` 每 tick 無條件發射，
       真正的節奏閘是 `internalCooldown`，而 hook 掛在增益上 ⇒ 增益一沒了
       （到期／被拔掉／死亡）下一拍就不會來。
    """
    return {"on": "onInterval", "target": "self",
            "internalCooldown": BERSERK_TRAIL_BEAT_SEC,
            "effects": [{"kind": "spawnVfx", "vfxId": BERSERK_TRAIL_VFX,
                         "at": "self", "durationSec": BERSERK_TRAIL_HOLD_SEC}]}


def _debuff_dispel():
    """一發「把身上的負面全部拔掉」——【暴走】免疫組合的下半身（GH#644 ②）。

    ⭐ GH#684 之後這一發**只剩一個掛載點**（`onInterval` 每秒補掃），⛔ 不再掛在
    `onStatusApplied` 上 —— 「掛上來的那一刻」現在由 `statusImmunity{tags:["debuff"]}`
    在**掛上之前**擋掉（見 {@link berserk_package}）。⭐ 留著它是因為它涵蓋一段
    免疫**結構上**看不到的東西：**DoT 與減益型 buff 不走 `applyStatus`**。

    ⚠️ `polarity:"debuff"` 是承重的：`berserk` 狀態文件自己是 polarity:"buff"、
    `devour-cooldown` 由 59-01 明寫 `dispellable:false` —— 兩者都拔不到，
    所以這一發可以放心地掛在每秒的掃描上。
    `count` 刻意省略 ＝ 跟著後台 `dispelRules.maxCountCap` 走（⛔ 不要寫數字）。
    """
    return {"kind": "dispel", "shape": "single",
            "pools": {"status": True, "dot": True, "buffs": True},
            "polarity": "debuff"}


def berserk_package(dur, mods, hz=4.0):
    """【暴走】的完整效果包 —— 59-00 與 59-001 只差參數（第零守則⑨）。

    ⭐ GH#684（owner 2026-08-24 逐字：「殭屍王免疫負面狀態⋯**跟初號機暴走一樣，
    我建議可以參考甚至共用部分模板**」）—— 這一包現在與殭屍王**共用同一個機制**。

    ── 收斂前後（⭐ 這是 #684 的全部內容）────────────────────────────────────
    | | 殭屍王（GH#656） | 暴走（收斂**前**） |
    |---|---|---|
    | 掛不上來 | `statusImmunity{tags:["cc"]}` | ⛔ **寫不出來** ⇒ `onStatusApplied` 事後拔 |

    ⭐ 兩邊要的是**同一件事**（「這具身體不吃某一類狀態」），差的只有**廣度**：
    殭屍王是 `cc`（owner 要保留標記與疊層），暴走是 `debuff`（owner：「免疫**所有**
    負面效果」）。而 `cc ⊂ debuff`（量到的：21 份帶 cc 的**每一份**也帶 debuff）
    ⇒ ⭐ 一個機制、一格參數，⛔ 不是兩份平行實作。

    ── ⚠️ 為什麼 `tags:["debuff"]` 是**量出來**的，⛔ 不是挑的 ───────────────
    44 份出貨 status 逐份掃：`polarity:"debuff"` 有 28 份，帶 `debuff` tag 的 27 份。
    ⭐ **唯一的差集是 `devour-cooldown`** —— 59-01 吞噬**自己**的內部冷卻標記
    （`no-stat-change` `internal-cooldown` `self`）。⭐ 它落在免疫**外面**正是對的：
    `applyStatus.ts:116` 逐字寫著免疫「⛔ 不排除 `target === ctx.caster`」，
    所以它要是帶了 `debuff` tag，暴走會**免疫掉自己的吞噬冷卻** ⇒ 無限吞噬。
    ⚠️ 同理 `berserk` 狀態自己是 `polarity:"buff"` 且不帶 `debuff` ⇒ ⭐ 免疫**不會
    把自己擋掉**（這一包的順序是 buff → invulnerable → status("berserk")）。

    ── 三個零件各自負責的那一段（⛔ 沒有重疊，這是收斂的重點）────────────────
      · ⭐ `statusImmunity{tags:["debuff"]}`（**新**，與殭屍王同一個機制）——
        任何走 `applyStatus` 的負面狀態在**掛上之前**被拒絕，並發 `immuneControl`
        讓玩家看見。⭐ 它**取代**了原本的 `onStatusApplied` dispel：那條 hook 修的是
        「已經落地的」，而落地本身現在不會發生了。
        ⚠️ 順帶修好一個既有的洞：`invulnerable.blocksControl` 的 `isCc` 讀的是**效果
        欄位**（stun/root/feared/disarmed/moveSpeedMult），**漏掉詛咒與致盲**
        （那兩支走 `missChance`）—— 在此之前它們得等 dispel 事後拔，也就是
        **先生效再被拔掉**。走 tag 就沒有那個窗口了。
      · `invulnerable {blocksDamage:"none", blocksControl:true}` —— 留著：它擋的是
        **控制效果**那一族，⛔ 不是只有 `applyStatus` 那條路。
      · `onInterval` 每秒補掃 —— ⭐ **留著，而且它不是重複的**：DoT 與**減益型
        buff** 不走 `applyStatus`，`statusImmunity` 在結構上**聽不到**它們。

    ⭐ GH#661 —— 第三條 hook 是【移動拖曳光束】的心跳，掛在**同一份增益**上
    正是為了同一個理由：增益到期／被拔掉，下一拍就不會來（見
    {@link berserk_beam_trail_hook}）。
    """
    return [buff(mods, dur,
                 hooks=[
                {"on": "onInterval", "target": "self", "internalCooldown": 1.0,
                 "effects": [_debuff_dispel()]},
                berserk_beam_trail_hook()]),
            {"kind": "invulnerable", "durationSec": float(dur), "applyTo": "self",
             "blocksDamage": "none", "blocksControl": True},
            # ⭐ [暴走] 的機制本體：拿走方向盤 + 自動尋敵（sim/berserk.ts）。
            #    上面那包是屬性與免疫，這一行才是「暴走」——少了它三個系統都不會動。
            status("berserk", dur, berserk=True, applyTo="self"),
            berserk_smoke(dur, hz=hz)]


A("59-00", "59-00 暴走", "self", [150], [0], 0,
  "[被動][暴走][迴避][吸血][免疫][受到傷害時][屬性門檻][機率]\n{{cd}}秒冷卻\n\n「吼！是誰踢掉插頭了！」\n生命降至10%時必定[暴走]，將[攻擊速度]提升100%，並獲得100%[吸血]與25%[迴避]，持續6秒。\n[暴走]期間[免疫]所有負面效果、**不受控制**：移動與攻擊指令全部失效，身體自己找最近的敵人打，冒著煙並拖曳光束。",
  innate="passive",
  passive={"name": "59-00 暴走", "ranks": [{"hooks": [
      {"on": "onDamageTaken", "target": "self", "internalCooldown": 150.0,
       "condition": {"kind": "stat", "subject": "self", "stat": "hp",
                     "mode": "percent", "op": "<=", "value": BERSERK_HP_PCT},
       # ⭐ GH#644 ②：吸血 0.6 → 1.0（「吸血提升到100%」）。1.0 在 base cap 2.0
       #    之內，⛔ 不補 capRaise —— 寫了就是逐位元不改變任何數字的空 modifier
       #    （第一·五守則，noOpModifierClaims.test.ts 會紅）。
       "effects": berserk_package(6.0, [M("as", "pctAdd", 1.0),
                                        M("lifesteal", "flat", 1.0),
                                        M("evasion", "flat", 0.25)])}]}]})

# ⭐ GH#644 ③ —— owner 2026-08-24 逐字：「吞噬 應該改為單體的冷卻 6秒才符合五級距」
#    ＝ 單體五級距 6/15/30/45/60 的**極小**格。⚠️ devour 帶著 radius/radiusTier，
#    tierize 的推導（逐字照抄引擎 cooldownTiers.ts）必然判成「範圍」（極小 = 30），
#    所以 `cooldown_shape="單體"` 是**承重的** —— 兩邊（產生器與引擎）都是手填贏。
DEVOUR_CD_CARD = 6
# ⭐ GH#644 ④ —— owner 2026-08-24 逐字：「暴走狀態 吞噬門檻提升2x，請記得改說明跟實際效果」
DEVOUR_THRESHOLDS = [0.03, 0.05, 0.07, 0.09]
DEVOUR_THRESHOLDS_BERSERK = [round(t * 2, 4) for t in DEVOUR_THRESHOLDS]


def _devour_hook(thresholds, berserk):
    """59-01 的一條掃描 hook —— 平時與[暴走]兩態**只差門檻**（第零守則⑨）。

    兩條 hook 的條件互斥（berserk 有／無），所以任何一刻只有一條會發射；
    `devour-cooldown` 那一格是共用的 —— 暴走中吃掉一個，退暴走後照樣要等。

    ⚠️ 掃描節奏 = 冷卻的一半（3 卡面秒 → 實際秒由 hook_icd 換算）。
       ⛔ 不再用 hook_icd() 的表格預設：單體·極小（6）現在**就是**這一支的冷卻，
       掃描節奏若等於兩餐間隔，取樣週期會蓋掉冷卻本身
       （devourPassiveIcd.test.ts ② 的閘：scanSec < mealSec）。
    """
    cond_cd = {"not": {"kind": "status", "subject": "self",
                       "statusId": "devour-cooldown"}}
    cond_bz = {"kind": "status", "subject": "self", "statusId": "berserk"}
    return {"on": "onInterval", "target": "self",
            "internalCooldown": hook_icd(seconds=DEVOUR_CD_CARD / 2),
            "condition": {"all": [cond_cd, cond_bz if berserk else {"not": cond_bz}]},
            # ⚠️ 鍵序 = Zod 宣告序（`schema/effects/devour.ts`）。
            "effects": [{"kind": "devour", "shape": "circle",
                         # ⚠️ `shape:"circle"` 的 `radius` 是**必填**（refineDispelShape），
                         #    真正生效的仍是 `radiusTier`（註冊時 resolveRadiusTier 覆蓋，
                         #    級別贏）—— 同 92-002 的先例。
                         "radius": TIER_R["極大"], "radiusTier": "極大",
                         "side": "enemies",
                         # ⭐ 一次只吃**最近的一個**（`shapeTargets` 已經排好序）。
                         "maxTargets": 1,
                         "thresholdPctOfMax": list(thresholds),
                         "healPct": 1.0, "victim": "any", "throughShields": True,
                         # ⭐ **真的吞掉了才跑**（`sim/effects/devour.ts` 的
                         #    `devouredIds`）—— 這一行就是「兩餐之間」的整個實作。
                         # ⚠️ `dispellable:false` 是 GH#644 ② 的連帶：暴走的免疫
                         #    每秒拔一次 debuff，而 devour-cooldown 的狀態文件
                         #    polarity 是 debuff —— 沒有這一格，暴走中的初號機會
                         #    自己拔掉兩餐之間的冷卻，變成每次掃描都吃一個。
                         #    （內部冷卻記帳本來就不該被任何淨化拔掉。）
                         "onDevour": [status("devour-cooldown", CD_ECHO,
                                             applyTo="self", dispellable=False)]}]}


A("59-01", "59-01 吞噬", "self", [DEVOUR_CD_CARD] * 4, [0, 0, 0, 0], 0,
  "[被動][週期][範圍][處決][吸血][吞噬][屬性門檻]\n{{cd}}秒冷卻\n有效範圍：{{radius}}\n\n「有一種餓是阿嬤覺得你餓」\n初號機**自動**[吞噬][周圍]範圍內生命剩餘3/5/7/9%的**任何敵方單位**（含殭屍與殭屍王），使其[立即死亡]，並[回復]等同其剩餘生命的生命值。\n[暴走]期間門檻加倍：6/10/14/18%。\n(不必施放，也不耗魔；每次只吃最近的一個，兩次之間隔 {{cd}} 秒)",
  maxRank=4,
  cooldown_shape="單體",
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
  # ⭐ 冷卻填 DEVOUR_CD_CARD（6）—— 那是**卡面秒**，兩個消費者：`{{cd}}` 印它，
  #    `CD_ECHO` 把它換算成**實際秒**（× combatEnv.cooldown）。⛔ 實際秒不手打。
  #
  # ⭐ 耗魔歸 0：owner 2026-08-21「若不是主動傷害技能 就免魔力吧 乾脆點」。
  #    （`tierize()` 的⑦本來就會把它壓成 0 —— 這裡寫 0 是讓表格自己說出這件事，
  #     ⛔ 不是靠一個看不見的後處理。）
  #
  # ─────────────────────────────────────────────────────────────────────────
  # ⚠️⚠️ 為什麼「兩餐之間」**不是**填在 `internalCooldown` 上（量過的，不是偏好）
  #
  # `fireHooks` 在**條件通過的那一刻**就蓋 `hookLastFired`（`effects/hooks.ts`），
  # ⛔ 它不知道底下那顆 `devour` 有沒有真的吃到人。⇒ 把冷卻填進 `internalCooldown`
  # 得到的**不是**「兩餐之間有間隔」，而是「**每隔那麼久抽查一次**」：那一瞬間場上
  # 剛好沒有人低於門檻，就整段重等。一個處決線是**瞬間**成立的條件，用冷卻當
  # 取樣週期去抓它，實際命中率遠低於卡面讀起來的樣子 —— 第二守則失敗形態②。
  #
  # ⇒ 兩個數字，各自回答一個問題，**兩個都是推導的**（見 `_devour_hook`）：
  #      · `internalCooldown` = 掃描節奏 = 冷卻的一半（hook_icd 換算實際秒）。
  #      · `devour-cooldown` 狀態的 `duration` = `CD_ECHO` = 兩餐之間
  #        （＝這一支當主動時的實際冷卻）。真的吃到人才掛上去。
  #
  # ⭐ 這**沒有新機制**（第〇·五守則）：`onInterval` + `internalCooldown` +
  #    `condition` + `devour.onDevour` + `applyStatus` 五個零件全部是出貨就有的。
  # ⭐ 而且它把冷卻**畫到 HUD 上**：被動沒有技能鈕可以轉圈，那顆狀態圖示就是玩家
  #    唯一看得到的倒數。
  passive={"name": "59-01 吞噬", "ranks": [
      # ⭐ **一個** rank 區塊，⛔ 不是四個。逐階那一維走 `thresholdPctOfMax`，
      #    由 `fireHooks` 的 `rank: src.grantRank` 挑格（`effects/hooks.ts:541`）。
      # ⭐ GH#644 ④：兩條 hook ＝ 平時／[暴走] 兩態，條件互斥、只差門檻
      #    （`_devour_hook`，⛔ 不是抄兩份 devour）。
      {"hooks": [
          _devour_hook(DEVOUR_THRESHOLDS, berserk=False),
          _devour_hook(DEVOUR_THRESHOLDS_BERSERK, berserk=True),
      ]}]},
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

# ⭐ GH#644 ① —— owner 2026-08-24 逐字：
#    「AT力場效果及說明**除了護盾以外，追加** 10/15/20/25%機率格擋50%物理傷害」
#    ⇒ 護盾 hook **一格不動**，rank 上多一份 `block`（BlockGrant 的第四個授權面，
#      同 79-002 虛化 / 20-00 銀色甲胄的先例）。fraction 0.5 = 擋掉這一發的一半，
#      chance 逐階 10/15/20/25%。真傷不在 damageTypes 裡 ＝ 擋不住（欄位說的，不是 if）。
# ⚠️ 觸發特效：owner 要「橘色力場面一閃」**取代**預設 block 火花。格擋今天的
#    可見回饋是引擎級的（blocked → guard 浮字 + block 火花 + 格擋語音），
#    ⛔ BlockGrant 沒有 per-source 特效軸，內容側寫不出「這一次格擋長什麼樣」——
#    需要引擎補一格（BlockGrant.vfxId + damage.ts 發射 + 客戶端消費），已回報主 session。
A("59-03", "59-03 AT力場", "self", [0], [0], 0,
  "[被動][週期][護盾][機率][格擋]\n\n「所謂的心之壁，就是我不想跟你講話的意思」\n每8秒生成一個可抵擋150/250/350/450點魔法([AP])傷害的[護盾]，[護盾]不會疊加。\nAT力場並有10/15/20/25%[機率][格擋]50%物理([AD])傷害（真實傷害無法格擋）。",
  innate="passive", maxRank=4,
  passive={"name": "59-03 AT力場", "ranks": [
      {"hooks": [{"on": "onInterval", "internalCooldown": 8.0, "target": "self",
                  "effects": [{"kind": "shield", "amount": amt(flat=v),
                               "duration": 8.0, "absorbs": "magic"}]}],
       "block": {"damageTypes": ["physical"], "chance": c, "fraction": 0.5}}
      for v, c in zip((150, 250, 350, 450), (0.10, 0.15, 0.20, 0.25))]})

A("59-04", "59-04 野戰型陽電子砲", "ground", [90, 90, 90], [350, 500, 650], 8.25,
  "[主動][指向][範圍][真傷]\n{{cd}}秒冷卻，吟唱3秒\n消耗MP{{mp}}\n施法距離：{{range}}\n\n「站著不要動，我...我要射了」\n對[前方][直線]敵人造成{{dmg}}點[真實傷害]，並額外造成目標[最大生命]10%的[真實傷害]。",
  maxRank=3, cast_time=3.0,
  # GH#375 —— `imported.wave.ki` 是純視覺（傷害在 damageLine 上）。
  cosmetic_projectile="imported.wave.ki",
  # ⭐ GH#578 —— owner 2026-08-23 逐字：「**初號雞 R 附帶 敵方單位最大生命10%真實傷害**」。
  #    ⛔ 沒有新的 effect kind：`resourcePct` 是 damage / damageArea / damageLine / dot
  #    四個 kind **同名同語意**的那一格（13-02 牙突 GH#459 就是這一格），
  #    而 `damageType:"true"` 讓整包（基礎 + 百分比）一起走真傷 ——
  #    `damageLine.ts` 是 `amount += resourcePctAmount(...)` 之後才送出一個封包，
  #    ⛔ 不是兩發，所以百分比那一半不可能被減傷吃掉。
  #    ⚠️ 逐階三格都是 0.10：owner 只給了一個數字，⛔ 我不替他編一條成長曲線。
  effects=[line("true", length=8.25, width=2.2, per=[750, 1200, 1650],
                res_pct={"subject": "target", "resource": "health",
                         "basis": "max", "perRank": [0.10, 0.10, 0.10]}),
           # ⭐ GH#555 —— owner 2026-08-23：「**初號機陽離子砲**…這四個經典總是要
           #    看到**橫放的光束砲**吧」。演出幾何全部住共用表
           #    `content/ability-templates/tpl-beam-roll.json`（第〇·四守則），
           #    這裡只寫兩格「這一支自己的」：往哪去、走多遠。
           # ⚠️ 2026-08-24 裁決（owner:「光束砲原地開火,只有波飛出去」）:
           #    這裡**不再寫 `path`/`distance`** —— 值住模板那一格
           #    （`tpl-beam-roll.params.path.default = "static"`,第〇·四守則:
           #    一鍵 rollback = 改模板那一格,四支經典一起回去）。
           # ⛔ 下面這段舊註解**留著當歷史**:它描述的是被取代的 toTarget 行為。
           # ⭐ `path:"toTarget"` 是**原作**：war3map.j:47756-47765（A0GI）生一隻光束
           #    dummy `h01P` 於施法者身上並**面向目標點**，⛔ 不是沿著身體面向噴。
           # ⭐ `distance` 逐字等於上面那條 damageLine 的長度（450 w3x u × 11/600），
           #    所以**看得到的光束**與**真的會被打到的那條線**是同一段。
           # ⭐ GH#607 —— `tpl-beam-roll` 的家族預設宣告了 `arriveSoundKey`,
           #    而這個節點沒有落點畫面 ⇒ 聲音說爆炸、螢幕上什麼都沒有。
           #    ki 系（初號機的陽電子砲同族）⇒ 用既有的 `fx.prim.ki.explosion-lg`,
           #    ⛔ 零新資產。
           # ⭐ GH#692 —— 原作是**一具**光束:war3map.j:47757
           #    `CreateNUnitsAtLoc( 1, 'h01P', … )`(生成數字面值 1),隨後
           #    SetUnitScalePercent 120+30×lvl%(150–210%)把那一具放大。
           # ⛔⛔ GH#702（owner 2026-08-25「是哪裡走歪⋯請你反省根因並修正」）——
           #    ⭐ **這一格的逐支覆寫已經刪掉了**,因為它正是走歪的第三段:
           #    GH#692 當時的結論逐字是「逐支覆寫 count:1(模板預設 6 是 09-04 的
           #    量值,⛔ 不動模板)」—— ⛔ 而「6 是 09-04 的量值」是**誤讀**:
           #    09-04 的 `i=1..6 × 200`(war3map.j:31925)是 h006 FlameStrike1
           #    **火柱**的迴圈(現在有自己的節點,preset tpl-locust-line),
           #    光束 h007/h008 是 `CreateNUnitsAtLoc( 1, … )`(j:31907 j:31909)。
           #    ⇒ 家族預設本來就該是 1。逐支覆寫**掩蓋**了它:59-04 看起來對了,
           #    另外六個節點繼續錯了一整版。
           #    ⇒ 修在**模板那一格**(tpl-beam-roll.params.count.default = 1,
           #    帶 origin 行號),這裡回到「一格都不寫」——第〇·四守則:同一個數字
           #    ⛔ 沒有第二個住處(閘:animationFxTemplate.test.ts 會指名它)。
           # ⭐⭐ GH#702 APPLY —— 這一支終於穿**自己的**模型。
           #    ⛔ 這個節點一格 `modelKey` 都沒寫 ⇒ 它吃家族預設,而 2026-08-26 之前
           #    那個預設是 `imported.netherstrike` ——「黑化亞瑟王的勝利劍」。
           #    ⇒ 初號機的陽電子砲長成 Saber 的劍氣(modelFxStagingContract ⑤ 逐字:
           #    「modelKey 是**身分**不是幾何」),而三支技能收斂成同一具模型。
           # ⚠️ 誠實更正:2026-08-26 實測 netherstrike.glb 是 **5/5 primitive 可見**
           #    (a9cf7187 的 28 份重烘之後,`ZERO_PIXEL_FX_MODELS` 已經空了)——
           #    ⛔ 所以這**不是**「它從來沒畫出來過」,是「它畫出來的是別人」。
           # ⭐ 真值 war3map.j:47757 —— `h01P`「野戰電子砲」穿的是
           #    `Abilities\Spells\Other\Awaken\Awaken.mdl`（OBJECTS.json.units.h01P.model）。
           #    2026-08-26 用 convert_stock_model.py 轉出來（3/4 primitive 可見 ·
           #    動畫 Stand · tools/w3x-import/out/stock/convert-awaken.json）。
           # ⭐ `scale` 1.5 —— j:47758 `SetUnitScalePercent( 120 + 技能等級×30, …)`,
           #    WC3 的技能等級從 **1** 起算 ⇒ 等級 1 是 **150%**。
           #    ⛔ 2026-08-25 之前 tpl-beam-roll 的 description 寫「59-04 scale:1.2」——
           #    那是把**公式的常數項**當成了值,四級其實是 150/180/210%。
           # ⭐ `scaleAxis` 第三格 3.25 —— 「渲染長度 ≈ 這一支自己打得到的距離」:
           #      16.757(awaken.glb bbox_y) × 0.101(model@1.scale) × 1.5 = 2.539
           #      → 上面那條 damageLine 的 length **8.25** ⇒ 8.25 / 2.539 = **3.25**
           #    ⛔ 它引用不到 JASS（WC3 的 SetUnitScale 只讀第一個參數,而 j:47758
           #    三個參數逐字相同 ⇒ 原作等向）—— 出處是 owner 2026-08-23「橫放的
           #    光束砲」＋ PRE2 粒子沒有被轉檔器帶過來這個量到的缺口。
           #    ⭐ 一鍵 rollback ＝ 把 scaleAxis 拿掉（缺席 ⇒ [1,1,1]）。
           # ⚠️⚠️ 誠實記下一個**與原作相反**的地方:`docs/_reference/w3x-shots/eva01/`
           #    四張擷圖上 59-04 是**繞著施法者的粉紫色符文圓陣＋上升的環**,
           #    ⛔ 一道光束都沒有（Awaken.mdl 是 WC3 的「甦醒」演出,不是砲）。
           #    ⇒ 照第〇·六守則的階梯,owner 的新版設計（第 1 層,他逐字點名
           #    「初號機陽離子砲…總是要看到橫放的光束砲」）**贏過** JASS（第 3 層）
           #    ⇒ 保持 tpl-beam-roll。⭐ rollback = 把 preset 換成 tpl-locust-strike
           #    （定點播一次,不橫放）—— 那才是原作的形狀。
           {"kind": "spawnModelFx", "shape": "single", "preset": "tpl-beam-roll",
       # ⭐ 2026-08-26 —— 家族預設的 `arriveSoundKey` 已移除（無 JASS 出處,
       #    且 13 個節點裡 6 個沒有落點畫面 ⇒ 聲音說謊）⇒ **有畫面的自己宣告**。
           "arriveSoundKey": "explosion",
            "modelKey": "w3x.stock.awaken", "scale": 1.5, "scaleAxis": [1, 1, 3.25],
            "onArrive": [{"kind": "spawnVfx", "vfxId": "fx.prim.ki.explosion-lg",
                          "at": "point"}]}])

A("59-002", "59-001 完全暴走", "self", [150], [0], 0,
  "[被動][暴走][迴避][吸血][免疫][加速][屬性門檻]\n{{cd}}秒冷卻\n\n「什麼？竟然沒有世界末日嗎？」\n[暴走]的門檻降為低於自身[最大生命] 50%，[攻擊速度]提升至最上限 10，[吸血]400%、[迴避]50%，持續 12秒。\n[暴走]期間[免疫]所有負面效果，冒著煙並拖曳光束。",
  passive={"name": "59-001 完全暴走", "ranks": [{"hooks": [
      {"on": "onDamageTaken", "target": "self", "internalCooldown": 150.0,
       "condition": {"kind": "stat", "subject": "self", "stat": "hp",
                     "mode": "percent", "op": "<=", "value": 0.5},  # ⭐ owner 2026-08-22:「暴走EX血量門檻降到50%」(20%→50%)
       # ⭐ GH#644 ②：吸血 1.2 → 4.0（「EX提升到400%」）。⚠️ 4.0 **超過** base cap
       #    2.0（config/stat-caps.json），所以這一次 capRaise 是**承重的**，⛔ 不是
       #    空 modifier —— capRaise 的值是**絕對高度**（statPipeline 取 max），
       #    4.0 ≤ unlocked 20 有空間（noOpModifierClaims 從 stat-caps 推導放行）。
       #    （2026-08-22 那一版 1.2 在 cap 內所以不寫 capRaise —— 那條理由隨著
       #     400% 失效，⛔ 不要把它抄回來。）
       # ⭐ 冒煙 hz 調低：12 秒 × 4Hz = 48 發，超過 DELAYED_MAX_COUNT(32)。
       #    ⚠️ 拖曳光束**不受這一格影響**（GH#661 之後它走 `onInterval` hook，
       #    ⛔ 不是 `delayed` 班表）—— 兩態都是固定 0.25 秒一拍。
       "effects": berserk_package(
           12.0, [M("as", "capRaise", 10.0), M("as", "pctAdd", 4.0),
                  M("lifesteal", "flat", 4.0), M("lifesteal", "capRaise", 4.0),
                  M("evasion", "flat", 0.5)], hz=2.5)}]}]})
