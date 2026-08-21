#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""44 夜神月 —— `godie-emns` 的 6 支技能（天生技 / Q / W / E / R / EX）。

⛔ 這一份只有**這一位英雄的資料**。共用的機制（`amt` / `dmg` / `area` /
   `buff` / 級距 / 各種閘）在 `common.py`；匯總與產生在 `batch1.py`。
"""
from common import A, TIER_RANGE, area, dmg, status


A("44-00", "44-00 機警", "self", [15], [0], 0,
  "[主動][吸收（護盾）]\n{{cd}}秒冷卻\n\n「我是新世界的神」\n夜神月的機警，將智慧具現化成魔力[護盾]，可抵擋全部傷害。每點魔力可以抵免3點傷害。",
  innate="active",
  effects=[{"kind": "manaBarrier", "shape": "single", "perMana": 3.0, "durationSec": 6.0,
            "damageTypes": ["physical", "magic", "true"], "minManaReserve": 0.0, "who": "self"}])

A("44-01", "44-01 死神之眼", "targeted", [30, 30, 30, 30], [150, 200, 250, 300],
  TIER_RANGE["極大"],
  "[主動][指定][詛咒（失手）]\n{{cd}}秒冷卻，吟唱2秒\n消耗MP{{mp}}\n施法距離：極大\n\n「這個世界正在腐敗，腐敗的人不該活著。」\n被鎖定的目標會因為死神的[詛咒]標記而暫時50%攻擊失手，持續6/12/18/24秒。",
  cast_time=2.0,
  # ⭐ GH#420（owner 2026-08-19）逐字：「② 44-01 死神之眼（夜神月）=>
  #    **施法距離可以是極大、冷卻時間縮短為 30 秒**」⇒ 兩半都在這一列：
  #    級距那一半見下面那段（`rangeTier` 已經是「極大」），冷卻那一半是
  #    `[30, 30, 30, 30]` **與卡面第二行的「30秒冷卻」同時改** —— ⛔ 只改一邊
  #    就會變成第一·五守則的另一種形狀（卡面說 30、引擎跑 60）。
  # ⚠️ owner 在同一則票裡自己標了平衡連鎖：44-01 是 44-03 火車輾過與
  #    44-04 心臟麻痺**唯一**能掛上【詛咒】的開關（兩支都掛著 `condition.status`
  #    的條件葉），所以冷卻減半 = 那兩支的可用頻率翻倍。這是 owner 要的，
  #    ⛔ 不是我挑的數字。
  # ⭐ GH#420（owner 2026-08-19）：「我說過了死神之眼是**極大**，**卡面也請跟著修改**」。
  #
  # ⚠️ 2026-08-21 訂正（GH#433，第三守則：註解會說謊）。這一段原本寫著
  #    「出貨文件早就有 `rangeTier: 極大`（…而 `rangeTier` 不在 SPEC_OWNED，
  #    所以 A-6 的 denylist 每次重生成都把它救回來）⇒ ⛔ 不動 `rng=2`」。
  # ⛔ 那個「救回來」是一個**缺陷**，⛔ 不是可以靠的機制：同一個洞讓 `A(...)` 的
  #    `rng` 對這 90 支全部失效（實測 79-02 改 2.0→4.5，重生成逐位元不變）。
  #    洞在 2026-08-21 補起來（`rangeTier` 進了 SPEC_OWNED），⇒ owner 的裁決
  #    必須住在**這裡**，⛔ 不能繼續躺在出貨 JSON 上等別人不要動它。
  # ⇒ `rng` 改成 `TIER_RANGE["極大"]`：級別是 owner 給的東西，12 是查表結果。
  #    ⛔ 不要寫 `12`，那會是 `content/config/range-tiers.json` 的第四個住處。
  # ⚠️ owner 的卡面規則（2026-08-19）：「**所有卡面範圍跟距離說明都應該要跟著改五級距**
  #    （傷害/冷卻/耗魔要明確數值 不然很難讓玩家判斷取捨）」⇒ 距離寫級距詞，
  #    上面三行的秒數／耗魔／持續秒數維持明確數字。
  # ⭐ 逐階 6/12/18/24 秒。原本四階全部是 6.0 —— 卡片寫 24 秒、場上 6 秒（失敗形態②）。
  effects=[status("curse", [6.0, 12.0, 18.0, 24.0], missChance=0.5)])

A("44-02", "44-02 死神的規則", "self", [0], [0], 0,
  "[被動]\n\n「我是新世界的神」\n將這份知識化為 [智慧] 7/12/17/22點。",
  innate="passive", maxRank=4,
  passive={"name": "44-02 死神的規則", "ranks": [
      {"attributes": {"int": v}} for v in (7, 12, 17, 22)]})

# ⭐ owner 2026-08-13：「請修正為範圍技」。
#    規格逐字是「使敵方 [詛咒]標記的 **[周圍]的敵方部隊**受到⋯傷害」——
#    中心語是「周圍的部隊」，而**圓心**是那個被標記的敵人。
# ⚠️ `ground` 施法時 `abilitySystem` 把圈內所有敵人塞進 `ctx.targets`，圓心退回施法點；
#    改成 `targeted` 之後 `ctx.targets = [被指定的那個敵人]`，而 `damageArea` 的圓心
#    正是 `ctx.targets[0]` ⇒ **圓心自動錨到那個敵人身上**，範圍不變。
# ⭐ 這也讓「落點錨定」那個 engine-gap 消失 —— 引擎一直做得到，只是用錯 castType。
# ⛔ 不可以用 `victimCondition` 表達「[詛咒]標記的」：那一格過濾的是**誰吃基礎傷害**，
#    套上去會把規格點名要吃傷害的「周圍部隊」全部濾掉，範圍技降成單體技。
A("44-03", "44-03 火車輾過", "targeted", [60, 50, 40, 30], [150, 250, 350, 450], 12,
  "[主動][範圍][AP加成]\n{{cd}}秒冷卻\n消耗MP{{mp}}\n有效半徑：{{radius}}\n\n「我就是正義！」\n使敵方 [詛咒]標記的 [周圍]的敵方部隊受到650/750/850/950+ 60% [AP]點的劇烈傷害。",
  radiusTier="中",
  # ⭐ 「使敵方 [詛咒]標記的 …」是一個**前提**，而它在此之前一個落點都沒有 ——
  #    44-01 死神之眼有沒有先掛上【詛咒】完全不影響這一發（失敗形態②：
  #    連招的前提消失，而畫面上跟正常一模一樣）。
  #    `targeted` 施法下 `ctx.targets = [被指定的那個敵人]`，而
  #    `effectRunner.ts::gateOnCondition` 用 `subject:"target"` 讀的正是他 ⇒
  #    這一格問的是「**圓心那個人**身上有沒有【詛咒】」。
  #    姊妹技 44-04 心臟麻痺對**同一句話**用的就是這顆葉子（兩顆效果各掛一份）。
  # ⛔ 仍然不可以改用 victimCondition（理由見上面那段）：那一格過濾的是誰吃
  #    **基礎**傷害，套上去會把規格點名要吃傷害的「周圍部隊」全部濾掉。
  # ⚠️ 要用 `dict(area(...), condition=...)` 包 —— 直接當 kw 傳進 area() 會被
  #    `amt()` 的 `o.update(kw)` 倒進 amount，而 zScaling 是 .strict()（同 52-04）。
  effects=[dict(area("magic", tier="中", per=[650, 750, 850, 950], ap=0.6),
                condition={"kind": "status", "subject": "target", "statusId": "curse"})])

A("44-04", "44-04 心臟麻痺", "targeted", [35, 35, 35], [150, 250, 350], 12,
  "[主動][AP加成]\n{{cd}}秒冷卻\n消耗MP{{mp}}\n\n「不，還不能笑，我一定要忍住……在35秒後宣布勝利吧。」\n造成敵方[詛咒]標記的[現存生命] 30/40/50% + 40% [AP] 傷害，並使動作[緩慢]持續5秒。",
  maxRank=3,
  # ⭐ 44-04 是 targeted，`damage` **沒有** victimCondition（那格只開在
  #    damageArea / damageLine），所以「[詛咒]標記的」唯一的落點是**效果層 condition**。
  effects=[dict(dmg("magic", ap=0.4,
                    res_pct={"subject": "target", "resource": "health",
                             "basis": "current", "perRank": [0.3, 0.4, 0.5]}),
                condition={"kind": "status", "subject": "target", "statusId": "curse"}),
           # 同一句話的第二半：[緩慢] 也只落在被標記的目標身上。
           status("slow50", 5.0, moveSpeedMult=0.5,
                  condition={"kind": "status", "subject": "target", "statusId": "curse"})])

A("44-002", "44-002 交換筆記本", "targeted", [120], [450], 5.29,
  "[主動][指定]\n{{cd}}秒冷卻，吟唱2秒\n消耗MP{{mp}}\n施法距離：{{range}}\n\n「計畫通！」\n置死地而後生的大絕招，將筆記本暫時送給別人，讓自己跟指定的敵人[現存生命]作 [交換]。",
  cast_time=2.0,
  effects=[{"kind": "swapResource", "shape": "single", "resource": "health", "clampMin": 1.0}])
