#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""20 亞瑟王 - Saber —— `godie-e002` 的 6 支技能（天生技 / Q / W / E / R / EX）。

⛔ 這一份只有**這一位英雄的資料**。共用的機制（`amt` / `dmg` / `area` /
   `buff` / 級距 / 各種閘）在 `common.py`；匯總與產生在 `batch1.py`。
"""
from common import A, M, area, buff, dmg, line, static_model


A("20-00", "20-00 銀色甲胄", "self", [0], [0], 0,
  "[被動][格擋][機率]\n{{cd}}秒冷卻\n\n「沒有魔的狀態，等於我什麼都沒穿」\n魔力化的銀色鎧甲有相當良好的魔法抗性，有30%[機率][格擋]100%魔法([AP])傷害。",
  innate="passive",
  # ⛔ 不要填 internalCooldown：syncAbilityPassives 是 detach+attach，升級／EX 解鎖／
  #    變身會把 blockLastFired 歸零；出貨的技能格擋一律沒有 ICD，規格也只寫機率。
  #    ⚠️ 舊寫法的 800 是規格從來沒出現過的數字，而且護盾語意與格擋不同
  #    （超過 800 照樣全額扣血）。
  passive={"name": "20-00 銀色甲胄", "ranks": [
      {"block": {"damageTypes": ["magic"], "chance": 0.3, "fraction": 1.0}}]})

A("20-01", "20-01 風王結界", "self", [60, 60, 60, 60], [50, 100, 150, 200], 0,
  "[主動][切換][普攻時][魔力耗盡][暴擊][屬性門檻][AP加成][範圍]\n{{cd}}秒冷卻\n每次[開關]耗[MP] {{mp}}\n\n「我不喜歡沒有放假的颱風」\n開啟時[每次攻擊][消耗]MP30/50/70/90，[MP]不足則自動關閉。\n以多層纏繞的風改變光線折射，隱藏劍身與強化劍刃的攻擊力，造成1.4/1.6/1.8/2倍[暴擊]傷害。關閉時，凝聚的風能一次釋放「風王鐵槌」，造成前方圓形[範圍] {{dmg}}+ 30% [AP]傷害。",
  # ⛔ effects 不放 buff：切換沒有時鐘，600 秒是猜的（zAbilityToggle 的①號理由
  #    逐字寫著這個坑）。開著期間的暴擊改由 passive 的**形態閘**表達。
  #    身體交換由 A-1 的規則自己插進 effects[0]。
  effects=[],
  toggle={
      # ⭐ 2026-08-13 —— 「開啟時[每次攻擊][消耗]MP30/50/70/90，[MP]不足則自動關閉」
      #    整句搬回 toggle 自己身上。
      # ⚠️ 之前這裡是 `"none"` + `[0]`，扣款掛在下面 passive hook 的 `spendMana` 上，
      #    而 `toggleUpkeepSystem` 的第一道閘就是
      #    `if (!tg || tg.upkeepCadence === "none") continue;` ⇒ 整段被 continue 掉。
      #    `exitToggle(world, id, slot, "resourceEmpty")` 是**全專案唯一**會自動關閉的
      #    那一行 ⇒ 「[MP]不足則自動關閉」在出貨版本裡**一次都不會發生**：魔力見底之後
      #    hook 的條件只是安靜地不再扣款，結界永遠開著、100% 暴擊、1.4~2.0 倍傷害
      #    一路吃到底，而「關閉時的風王鐵槌」也永遠不會自己觸發（只剩手動按第二次）。
      # ⭐ `perAttack` 的依據是「揮出」不是「打中」（`toggle.ts` 檔頭）—— 規格寫的正是
      #    「每次**攻擊**」，而 `basicAttack` 事件在迴避／失手判定之前發射。
      # ⚠️ `exitOnResourceEmpty` 刻意不填 —— 省略即 true，正好是規格那一句；
      #    填 false 才是「付不出來就免費繼續開著」的另一種設計（第一守則：它是一格）。
      # ⚠️ 這四個數字與下面 hook 那條 `mp >= cost` 的 `cost` 是**同一組**，
      #    只調一邊就會變成「扣得起但不刮風」或「刮了風卻扣不到錢」，兩種都靜默。
      "upkeepCadence": "perAttack",
      "upkeepCost": [30, 50, 70, 90],
      # ⭐ 20-01 需要 toggle 區塊的**真正**理由：castAbility 把「第二次按下＝關閉」
      #    排在**冷卻閘之前**（abilitySystem.ts，那段註解逐字用 20-01 的
      #    60 秒解釋這個順序）。所以 60 秒冷卻不會把按鈕鎖住，而關閉的身體交換
      #    寫在這裡 —— exitToggle 是全專案唯一跑 onExit 的地方。
      # ⭐ 「關閉時，凝聚的風能一次釋放『風王鐵槌』，造成前方圓形[範圍] 120+30% [AP]」
      #    —— `exitToggle` 是全專案唯一跑 `onExit` 的地方，所以它就是這一句的家。
      "onExit": [{"kind": "championForm", "to": "toggle"},
                 area("magic", tier="小", dmg_tier="極小", ap=0.3)]  # ④ 收招爆發，一次關閉只炸一發,
  },
  passive={"name": "20-01 風王結界 · 法球", "ranks": [
      {"whileForm": "alternate",
       "modifiers": [M("critChance", "flat", 1.0), M("critDamage", "override", cdmg)],
       "hooks": [
           {"on": "onBasicAttack", "target": "event",
            "condition": {"kind": "stat", "subject": "self", "stat": "mp",
                          "mode": "absolute", "op": ">=", "value": cost},
            # ⭐ 2026-08-13 —— `spendMana` 從這條 hook 拿掉了：「每次攻擊消耗 MP」
            #    現在由上面 `toggle.upkeepCadence: "perAttack"` 出帳。
            #    ⛔ 兩邊都收就是每刀扣兩次（30 → 60）。
            # ⭐ 上面那條 `condition {mp >= cost}` **刻意留著**，但它的角色換了：
            #    不再是「有錢才扣款」，而是「付不出來的那一刀不刮風」。
            #    ⚠️ 拿掉它會多出一發免費法球 —— `basicAttackSystem`（法球在這裡發）
            #      排在 `toggleUpkeepSystem`（那一刀才發現付不出來 → 自動關閉）**之前**，
            #      所以觸發自動關閉的那一刀會白拿一次法球，
            #      而 `windOrbAndFormBuffs.test.ts`「法力不足 30 時法球不觸發」會紅。
            "effects": [
                        # ⚠️ 這一發是 A-5 的那一半：法球傷害 10 + 50% [AD] 是
                        #    出貨檔既有的機制，規格沒點名所以重製稿把它丟了。
                        #    windOrbAndFormBuffs 用**比值**釘死這兩個係數。
                        dmg("magic", flat=10, ad=0.5)]}]}
      for cdmg, cost in ((1.4, 30), (1.6, 50), (1.8, 70), (2.0, 90))]})

A("20-02", "20-02 感知能力", "self", [0], [0], 0,
  "[被動][迴避][機率]\n{{cd}}秒冷卻\n\n「你的魔力流向了我」\n感應魔力流向，進而有6/12/18/24%[機率][迴避]物理([AD])攻擊。",
  innate="passive", maxRank=4,
  passive={"name": "20-02 感知能力", "ranks": [
      {"modifiers": [M("evasion", "flat", p)]} for p in (0.06, 0.12, 0.18, 0.24)]})

A("20-03", "20-03 約束與勝利之劍", "ground", [60, 60, 60, 60], [250, 350, 450, 550], 14,
  "[主動][指向][範圍][AP加成]\n{{cd}}秒冷卻 吟唱1秒\n消耗[MP] {{mp}}\n施法距離：{{range}}\n\n「放了這招我就要補魔了」\n它會將所有者的魔力轉換成光後收束，對[前方][直線]敵人造成 {{dmg}} + 100% [AP]點傷害。",
  cast_time=1.0,
  # GH#375 —— 舊文件那顆 `imported.wave` 是 A-5 沿用回來的，規格沒點名過它；
  #           傷害整包住在上面那條 damageLine。改掛 spawnVfx（理由見 carry_mechanisms）。
  cosmetic_projectile="imported.wave",
  # ⭐ GH#543 —— owner 2026-08-22 逐字：「**Saber約束勝利之劍(翻滾光束)**⋯都是**動畫特效**」
  #    ⛔ 這三個節點在 2026-08-22 曾經被直接寫進 `content/abilities/godie-e002.e.json`,
  #       而**下一次 `skills:sync` 就把它們刪回去了**（64 行）—— 那個檔是這一支產生的。
  #    ⚠️ 更糟的是:變身態 `godie-e00l.e` 有而**本體沒有**,而變身態
  #       **一律被逐出白名單**（`transformevict.go:48`）⇒ ⭐ **玩家選得到的那個 Saber
  #       打 E 是舊的直線傷害,一條光束都沒有**,而全套測試是綠的。
  #    ⭐ `spinDegPerSec: 720` 就是「翻滾」;`touchRadius/touchSide` 讓光束**沿路掃到人**,
  #       ⛔ 不是只在終點結算 —— 那正是「翻滾光束」與一發直線傷害的差別。
  # ⭐ GH#649 —— 「Saber 持有武器**金粉閃爍粒子特效**」。原作逐字
  #    （war3map.j:32306，Trig_Excalibur_Actions）：第一次施放 E 時
  #    `AddSpecialEffectTargetUnitBJ("handright", u, "Magical_Sword.mdx")`，
  #    掛上之後**從不 DestroyEffect**（udg_winSword 只設不清）⇒ 常駐的武器金粉。
  #    GGD 側走 `persistentVfx`（GH#539）且 `when` 缺席 ＝「E 學到（rank>0）就掛著」
  #    （GH#603 的學習閘），與原作「第一次放 E 起永遠在」同一個量級。
  # ⚠️ 粒子路徑的實際掛點由 vfx 文件自己的 `anchorBone`（Bone_Hand_R）決定
  #    （AmbientVfx.buildItem）；`attach` 這一格記 WC3 掛點的正典寫法 "hand,right"
  #    （JASS 原文是無逗號的 "handright"），兩邊都是持劍那隻右手 —— ⛔ 不要改成
  #    兩個不同的掛點（zPersistentVfx 檔頭那句「兩個住處會漂」）。
  # ⚠️ `fx.saber.gold-dust` 刻意**不帶** `ambient: true`：ambient+continuous+
  #    anchorBone 三件齊 = isSwingTrailDoc ⇒ 刀光預算的**揮劍閘**會把站著不動的
  #    金粉壓到近零 —— 而那與「沒做」在畫面上長得一模一樣（失敗形態②）。
  persistent_vfx=[{"vfxKey": "fx.saber.gold-dust", "attach": "hand,right"}],
  effects=[
      line("magic", length=14, width=2.0, per=[350, 550, 750, 950], ap=1.0),
      {"kind": "floatingText", "shape": "single", "text": "約束與勝利之劍！",
       "colorRgb": [255, 224, 120], "sizeScale": 1.4, "riseSpeed": 2.0,
       "durationSec": 2.8, "applyTo": "self"},
      # ⭐ 2026-08-23（owner：「這四個經典總是要看到**橫放的光束砲**吧」）——
      #    七格演出幾何（modelKey / path / speed / distance / spinDegPerSec / scale /
      #    touchRadius / touchSide）搬進**共用表**
      #    `content/ability-templates/tpl-beam-roll.json`，這裡只留 `preset` 一格。
      # ⛔ 在此之前它們是**逐支手寫**的，而出貨樹上有五份幾乎一模一樣的節點 ——
      #    第零守則⑨的反面標記，也是第〇·四守則說的「同一個數字的第二個住處」。
      # ⚠️ `onTouch` 仍然逐支寫：模板刻意**不**自動塞傷害（那會替每一支引用它的
      #    技能加一份沒有人裁決過的數值，第一守則）。
      # ⚠️ 2026-08-24 兩項裁決（詳 docs/legacy/_w3x-fidelity-superseded.md §2026-08-24）:
      #    ① `path` 不再寫 —— 住模板那一格（default="static",owner:「原地開火」）。
      #    ② `onTouch`（magic·級距小）**刪除** —— effects[0] 的 damageLine（級距中·
      #       length 14）已蓋同一條線,原作只結算一次;這組是重製時加的第二份傷害。
      #       rollback = 後台覆蓋層把那組 onTouch 貼回來（原文在 superseded 檔裡）。
      {"kind": "spawnModelFx", "shape": "single", "preset": "tpl-beam-roll",
       # ⭐ GH#607 —— 落點要炸開。在此之前 `onArrive` 只有震動 ⇒ 光束飛到底
       #    **憑空消失**。⚠️ 而 `tpl-beam-roll` 的家族預設早就宣告了 `arriveSoundKey`
       #    ⇒ 聲音說爆炸、畫面什麼都沒有（第一·五守則:說了但不會發生）。
       # ⚠️ 這一發要與變身態雙胞胎 `godie-e00l.e` **一模一樣** —— 編號 20-03 是
       #    JASS 對照的 join key,兩份不同就會被 abilityCodeParity 棘輪擋下。
       # ⭐ GH#688 Phase 6 · QUAD —— 接上自己的原作模型（staging 契約④的
       #    SHARED_MODEL_FENCED_OUT 點名「20-03＝h00S（ReviveHuman 紅）」）。
       #    census h00S：`Excalibur/ExcaliburMAX/Open Skill of Saber 三生成點 ·
       #    tint [255,100,100] · usca 0.2 · timedLife 0.5`。tint 照 census 忠實搬；
       #    scale/life 不覆寫 —— 光束的幾何住 tpl-beam-roll 的共用表（第〇·四守則），
       #    0.2/0.5s 是原作**逐段小劍氣**的參數，套在單具滾動光束上是張冠李戴。
       "modelKey": "w3x.stock.revivehuman", "tint": [1.0, 0.3922, 0.3922],
       "onArrive": [{"kind": "spawnVfx", "vfxId": "fx.prim.holy.explosion", "at": "point"},
                    {"kind": "screenShake", "shape": "single", "amplitude": 0.6,
                     "durationSec": 0.8, "applyTo": "all"}]},
  ])

A("20-04", "20-04 Avalon-永恆的理想鄉", "self", [60, 60, 60], [150, 250, 350], 0,
  "[主動][輔助][反彈][AP加成]\n{{cd}}秒冷卻\n消耗MP{{mp}}\n\n「也可能只是我在發呆而已，要不要試試看？」\n在2秒內[反彈]承受的[魔法傷害]，[反彈]量為原傷害的 3/5/7倍，另加 300% [AP]傷害。",
  maxRank=3,
  # ⭐ B3-A —— 反彈第一次真的發得出來。⛔ 原本只有一個 moon-combo 空殼
  #    （那是蒼月潮 07-03 的 1 秒連段窗口，跟反彈完全無關）。
  # ⭐ GH#691（#688 Phase 6-1）—— 原作的 `o00G` dummy（`MonsoonBoltTarget.mdl`）。
  #    census 逐列：`usca 6 · tint [100,0,0] · avalonStart timedLife 2s（war3map.j:32435）`。⛔ 手寫進出貨 JSON 會被下一次 skillremake:json 打回來
  #    （`carry_mechanisms` 只沿用 invulnerable / spawnProjectile），所以它走表格出口。
  model_fx=[static_model("w3x.stock.monsoonbolttarget", "self", 2.0, scale=6.0,
                         tint=[0.3922, 0.0, 0.0], clip="idle")],
  effects=[buff([], 2.0, hooks=[
      {"on": "onDamageTaken", "target": "event", "damageType": "magic",
       "effects": [dmg("magic", flat=0, ap=3.0,
                       inc_pct={"perRank": [3.0, 5.0, 7.0]})]},
      # ⭐⭐ GH#549 —— **反彈成功的回饋住這裡，⛔ 不是 20-002。**
      #
      # owner 2026-08-22 逐字：「理想鄉被反彈的敵方單位 身上要有明顯的
      # **七彩閃電爆炸 畫面閃爍及震動 不然都不知道發生什麼事情有沒有反擊成功**」
      #
      # ⛔ 這一組在 2026-08-23 被**直接寫進 `content/abilities/godie-e002.r.json`**
      #    （commit daf72473，44 行），而**下一次 `skills:sync` 就把它刪掉了** ——
      #    那是這一支產生器的產物。⭐ 這已經是同一個檔案上的**第二次**
      #    （20-002 那一組的註解記著 2026-08-22 的第一次，52 行）。
      #    ⇒ 產生器擁有的檔案要改**來源**（第零守則：改產物等於沒改）。
      #
      # ⭐ 為什麼掛在 20-04 而不是 20-002：**反彈是 R 做的**。
      #    20-002 只有在反彈成功之後才追打 —— 把回饋掛在它身上，等於
      #    「沒學 EX 的人反彈成功時什麼都看不到」。
      {"on": "onReflectSuccess", "target": "event", "internalCooldown": 1.0,
       "effects": [
           # ⭐ `at:"target"` 是承重的那一格：爆炸要長在**被反彈者**身上，
           #    ⛔ 不是施法者腳下 —— 否則玩家看到的是自己在發光而不是對手被炸。
           {"kind": "spawnVfx", "vfxId": "fx.avalon.reflect-burst", "at": "target"},
           # ⭐ 兩發閃爍、兩種顏色：施法者看到**暖金**（我反擊成功了），
           #    被反彈者看到**紫**（我被反彈打到了）。⛔ 同色的話兩邊分不出誰做了什麼。
           {"kind": "screenFlash", "shape": "single", "colorRgb": [255, 232, 160],
            "peakAlpha": 0.45, "durationSec": 0.28, "applyTo": "self"},
           {"kind": "screenFlash", "shape": "single", "colorRgb": [190, 120, 255],
            "peakAlpha": 0.62, "durationSec": 0.34, "applyTo": "victim", "scripted": True},
           # ⭐ 震動 `all` —— owner 的理由逐字是「不然都不知道發生什麼事情」⇒ 兩邊都要感覺到。
           {"kind": "screenShake", "shape": "single", "amplitude": 0.62,
            "durationSec": 0.5, "applyTo": "all"},
       ]},
  ])])

A("20-002", "20-002 解放.約束勝利劍MAX", "self", [0], [0], 0,
  "[被動][指向][範圍][反彈][反彈成功時][AP加成]\n{{cd}}秒冷卻\n\n「在這個空間所有魔法都被遮斷」\n「永恆的理想鄉」[反彈]成功時發動，給予敵人連續七次斬擊，每次造成7倍[反彈]傷害；最後施展「約束與勝利之劍」，對[前方][直線]敵人造成（[現存魔力]+[AP]）×7倍傷害。",
  passive={"name": "20-002 解放.約束勝利劍MAX", "ranks": [{"hooks": [
      {"on": "onReflectSuccess", "target": "event", "internalCooldown": 1.0,
       "effects": [
           # ⭐ GH#549 —— owner 2026-08-22 逐字：「理想鄉被反彈的敵方單位 身上要有明顯的
           #    **七彩閃電爆炸 畫面閃爍及震動 不然都不知道發生什麼事情有沒有反擊成功**」。
           # ⛔ 這四個在 2026-08-22 曾經被直接寫進 `content/abilities/godie-e002.ex.json`,
           #    而**下一次 `skills:sync` 就把它們刪掉了**（52 行）—— 那個檔是這一支產生的。
           #    ⇒ 產生器擁有的檔案要改**來源**（CLAUDE.md #500 的教訓）。
           # ⭐ `at:"target"` 是承重的那一格:爆炸要長在**被反彈者**身上,
           #    ⛔ 不是施法者腳下 —— 否則玩家看到的是自己在發光而不是對手被炸。
           {"kind": "spawnVfx", "vfxId": "fx.avalon.reflect-burst", "at": "target"},
           # ⭐ 兩發閃爍、兩種顏色:施法者看到**暖金**（我反擊成功了）,
           #    被反彈者看到**紫**（我被反彈打到了）。⛔ 同一個顏色的話兩邊分不出誰做了什麼。
           {"kind": "screenFlash", "shape": "single", "colorRgb": [255, 232, 160],
            "peakAlpha": 0.45, "durationSec": 0.28, "applyTo": "self"},
           {"kind": "screenFlash", "shape": "single", "colorRgb": [190, 120, 255],
            "peakAlpha": 0.62, "durationSec": 0.34, "applyTo": "victim"},
           # ⭐ 震動 `all` —— owner 的理由逐字是「不然都不知道發生什麼事情」,⇒ 兩邊都要感覺到。
           {"kind": "screenShake", "shape": "single", "amplitude": 0.62,
            "durationSec": 0.5, "applyTo": "all"},
           {"kind": "delayed", "shape": "single", "delaySec": 0.12, "count": 7, "intervalSec": 0.12,
            # ⭐「每次造成 **7 倍[反彈]**傷害」—— 出貨到今天是 ap=1.0，跟反彈毫無關係。
            #    ⚠️ 這一條要等 E1（delayed 繼承觸發脈絡）落地才有消費端，否則七刀靜默付 0。
            # ⚠️ maxChainDepth 1 **不是選配**：onReflectSuccess 帶進來的封包
            #    reflectDepth 已經是 1，而預設上界是 0 ⇒ 少了它七刀一樣付 0。
            "effects": [dmg("magic", flat=0,
                            inc_pct={"perRank": [7.0], "maxChainDepth": 1}),
                        # ⭐ GH#549 第 2 項（owner:「⭐ 別忘了還有**特效文字**」）——
                        #    七刀各一顆火花 + 一個 `{{i}}Hit`。⭐ **一個節點**,
                        #    ⛔ 不是七個:`resolveCueText` 把 `{{i}}` 換成
                        #    「這是序列裡的第幾段」,而 `delayed count:7` 天生就會
                        #    跑七次 ⇒ 自然得到 1Hit…7Hit（`sim/effects/clientCues.ts`）。
                        # ⛔ 這兩個在 2026-08-23 曾經被直接寫進
                        #    `content/abilities/godie-e002.ex.json`,而下一次
                        #    `skills:sync` 又把它們刪掉了 —— 同一個檔、同一個坑,
                        #    第二次。⇒ 產生器擁有的檔案要改**來源**。
                        # ⚠️ `spawnVfx` ⛔ 不收 `shape`（Zod strict 會擋）——
                        #    它的作用範圍由 `at` 決定,⛔ 不是幾何。
                        {"kind": "spawnVfx", "vfxId": "fx.avalon.reflect-spark",
                         "at": "target"},
                        {"kind": "floatingText", "shape": "single", "text": "{{i}}Hit",
                         "colorRgb": [255, 240, 190], "sizeScale": 1.2,
                         "riseSpeed": 1.6, "durationSec": 1.1, "applyTo": "victim"}],
            # ⭐ owner 規格逐字：「（[現存魔力]+[AP]）×7倍傷害」。
         #    ⚠️ 上一版**只寫了 AP 那一半** —— 現存魔力那一項整個不見了，
         #    而「有傷害」跟「傷害少一半」在畫面上長得一模一樣（失敗形態②）。
         #    `resourcePct{subject:"self", resource:"mana", basis:"current"}`
         #    就是「我現在有多少魔力」，係數 7 = 規格的 ×7 倍。
         "finalEffects": [dict(line("magic", length=14, width=2.0, ap=7.0,
                                    res_pct={"subject": "self", "resource": "mana",
                                             "basis": "current", "perRank": [7.0]}),
                               # ⭐ `includeOrigin` 明填 True —— 這一發**必須**打到被反彈
                               #    的那個人。這條 hook 是 onReflectSuccess + target:"event"，
                               #    `delayed` 排程那一刻凍住的名單裡**只有他一個**，而
                               #    `damageLine.ts:128` 的
                               #    `skip = includeOrigin===true ? null : new Set(ctx.targets)`
                               #    正好把他排除 ⇒ 1v1 決鬥區裡**全技能最大的那一發**
                               #    （現存魔力×7 + AP×7）一滴血都不扣，七刀照跳字、
                               #    完全不報錯（失敗形態②）。
                               # ⛔ 這裡要明填而不是靠 `_own_area()` 的規則：那支 walker
                               #    只走 `doc["effects"]`，這一發住在 `doc["passive"]` 底下。
                               includeOrigin=True),
                          # ⭐ GH#549 —— **收尾那一下**要看得出來是收尾（owner 的
                          #    「不然都不知道發生什麼事情有沒有反擊成功」對整段成立,
                          #    ⛔ 不只對第一下）。⇒ 收尾三件套:爆炸落在被反彈者身上、
                          #    全場閃一下、全場震一下。
                          # ⚠️ `screenFlash` 這裡是 `applyTo:"all"`（⛔ 不是 self/victim）:
                          #    七刀已經逐刀給了施法者與受害者各自的訊號,收尾這一下是
                          #    **給全場看的**「這一輪結束了」。
                          {"kind": "spawnVfx", "vfxId": "fx.avalon.reflect-burst", "at": "target"},
                          {"kind": "screenFlash", "shape": "single",
                           "colorRgb": [255, 232, 160], "peakAlpha": 0.55,
                           "durationSec": 0.34, "applyTo": "all"},
                          {"kind": "screenShake", "shape": "single", "amplitude": 0.6,
                           "durationSec": 0.5, "applyTo": "all"}]}]}]}]})
