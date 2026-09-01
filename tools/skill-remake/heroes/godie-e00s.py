#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""70 白木卡迪那 —— `godie-e00s` 的 6 支技能（天生技 / Q / W / E / R / EX）。

⛔ 這一份只有**這一位英雄的資料**。共用的機制（`amt` / `dmg` / `area` /
   `buff` / 級距 / 各種閘）在 `common.py`；匯總與產生在 `batch1.py`。
"""
from common import A, TIER_R, area, status


A("70-00", "70-00 紮根", "self", [15], [0], 0,
  "[主動][切換]\n{{cd}}秒冷卻\n\n「你聽過樹人自拍嗎?」\n在地面紮根，變得無法移動，但是這可以讓它開始丟出巨大的石塊，[防禦]增加2倍、[力量]增加10點、[攻擊距離]提升到10，[切換]回行走模式則回到原本能力與狀態。",
  innate="active",
  # ⛔ effects 留空 —— A-1 的規則會插進 championForm(toggle)，而那**就是**全部。
  #
  # 「[防禦]增加2倍、[攻擊距離]提升到10」是**第二具身體 godie-e010 自己的數值**
  # （w3u：armor 2→10、range 11.0→11.9），不是一段 8 秒 buff。寫成 buff 有兩個
  # 後果：①切換沒有時鐘，8 秒後樹人站在原地卻拿回本體數值（失敗形態②）
  #       ②championFormToggle.test.ts 的「the sheet IS godie-e010's」量的是
  #         按下去 20 tick 後的**整張屬性表**，多一份 buff 就直接紅。
  #
  # ⛔ 也不可以給它 toggle 區塊：castAbility 把「第二次按下＝關閉」排在冷卻閘
  #    **之前**，而同一支測試釘死了「冷卻內的第二次按下必須答 cooldown」。
  #    70-00 的來回是靠 `to:"toggle"` 對**當下的身體**解算，走一般的冷卻閘。
  #
  # ⭐「變得無法移動」（2026-08-13 落地）—— owner 逐字裁決：
  #    「應該是**狀態改變，類似定身**（可攻擊跟施展技能但不能移動），
  #      並非把移動速度調整到 0」
  #    ⇒ 機制是英雄卡上的一格 `immobile: true`，而**替身卡 `godie-e010` 就是紮根形態**，
  #      所以它跟著 championForm 進出、⛔ 不需要時鐘（切換技沒有時鐘，那正是舊方案卡住的點）。
  #    消費端 `sim/movementHold.ts`，與施法定身／擊倒同一個出口；只擋移動，普攻/施法/轉向不動。
  #    ⛔ 不是 CC：不可被【淨化】剝掉、不被免控 buff 拒絕、不計進 ccAppliedTicks。
  #    守衛 `packages/shared/src/sim/formImmobile.test.ts`（量**位移**，不是量那個布林）。
  #
  # ⚠️ 這一格解決的正是那個**反過來**的症狀：`godie-e010.baseStats.ms` 是 5.5、
  #    本體 `godie-e00s` 是 5.3 ⇒ 在此之前「代價是不能移動」在遊戲裡是「紮根之後跑得**更快**」。
  #    現在 ms 是多少都不重要了（走不動），所以 ⛔ 不順手去改那個數字（第零守則⑧）。
  #
  # ⛔ 仍然開著的一半：**客戶端預測**看不到它。`LocalPrediction` 的影子世界
  #    `championId: ""`（見該檔 155-174 行），`world.status` 永遠是空的、`rooted` 恆為 false
  #    ⇒ 按下紮根的**那個玩家自己**會看到橡皮筋（影子走出去、快照 snap 回來）。
  #    那是 `predict/**` 這一片領域自己的工作，開在 GH#321（與 #281 同一個家族）。
  # ⭐「[力量]增加10點」（2026-08-13，owner 裁決後重新落地）：走 G13-1 ——
  #    **主動型天生技也掛 passive 區塊**（`innateActivePassive:"attach"`），
  #    再用 `while_form="alternate"` 把它關在紮根形態裡。
  #    ⛔ 不是 toggle.whileOn（那條來源升級不換 rank），
  #    ⛔ 也不是 modifiers —— 力量不是 Stat，它走 attributes 那條授權面。
  #
  # ⚠️ 這一批第一次做的時候撤回過，因為它打壞 `auraIncludeSelf`。
  #
  # ⛔ 而我當時對那次撤回的**修法是錯的**，owner 2026-08-13 當場抓到：
  #    他的「healing friend and self」講的是 **70-002 樹海降臨**的
  #    「[回復][周圍]**自己與友方隊伍**生命 10%」（那一條**本來就已經實作**，
  #    走 `side:"allies"` 的圈），⛔ **不是** 70-00 的芬多精光環。
  #    我卻去改了芬多精的 `includeSelf` —— 因為我讀了那支技能 JSON 裡
  #    **w3x 時代的 description**，而不是上面這一段 owner 規格。他的回覆是
  #      「你不是有做一個最新版本的英雄的技能列表及說明(JSON & MD)? 怎麼會搞混呢?」
  #
  # ⭐ 上面這段 70-00 的 owner 規格**從頭到尾沒有提芬多精**。以它為準。
  #    芬多精照 w3a 維持 `includeSelf: false`，原作事實在
  #    `docs/legacy/_w3x-fidelity-superseded.md`（知識不可以無聲消失）。
  #    ⚠️ 舊規格從此只住 `docs/legacy/`（owner：「不要再發生了」），
  #    閘在 `packages/shared/src/ops/legacySpecQuarantine.test.ts`。
  innate_active_passive="attach", while_form="alternate",
  passive={"name": "70-00 紮根", "ranks": [{"attributes": {"str": 10}}]},
  effects=[])

A("70-01", "70-01 伸卡球", "ground", [60, 60, 60, 60], [250, 300, 350, 400], 11,
  "[主動][指向][範圍]\n{{cd}}秒冷卻\n消耗[MP] {{mp}}\n施法距離：{{range}}\n\n「我餵人人，人人餵我」\n造成[範圍]敵人{{dmg}}+80% [AP]傷害。",
  radiusTier="小",
  # GH#375 —— `imported.wave.arcane` 是純視覺（傷害在 damageArea 上）。
  #           ⚠️ 「伸卡球」聽起來該是一顆**真的會飛的球**，但那是設計變更
  #           （傷害改成命中才結算）⇒ 要換就填 projectile="deliver"，是 owner 的決定。
  cosmetic_projectile="imported.wave.arcane",
  effects=[area("physical", tier="小", per=[150, 300, 450, 600], ap=0.8)])

A("70-02", "70-02 大怒石", "self", [0], [0], 0,
  "[被動][普攻時][範圍]\n\n「咖啡只是一種豆漿、海洋只是一種蔬菜湯、所以大怒石只是我的尿結石，對吧?」\n[每次普通攻擊]皆能造成[小範圍] 30/40/50/60% [擴散]傷害。",
  innate="passive", maxRank=4,
  passive={"name": "70-02 大怒石", "ranks": [
      {"hooks": [{"on": "onBasicAttack", "target": "event",
                  "effects": [area("physical", tier="極小", flat=30, ad=v)]}]}
      for v in (0.3, 0.4, 0.5, 0.6)]})

A("70-03", "70-03 木束縛之術", "self", [45, 45, 45, 45], [100, 150, 150, 250], 0,
  "[主動][範圍][定身]\n{{cd}}秒冷卻\n消耗MP{{mp}}\n\n「這個好像叫做...資本主義的豬？」\n讓白木[周圍][範圍]的敵方都受到木靈束縛綑綁，持續0.6/1.2/1.8/2.4秒。(敵方仍可施展技能與攻擊，僅不能移動)",
  radiusTier="小",
  # ⭐ 逐階定身 0.6/1.2/1.8/2.4 —— `applyStatus.duration` 是 zRankScalar，填陣列＝一階一格。
  #    ⚠️ 出貨到今天四階全是 0.6：升階的玩家看到的是「點了沒有變強」。
  #    ⚠️ root 是硬控，上界 20 秒，2.4 遠低於它。
  effects=[area("magic", tier="小", flat=1),
           status("root", [0.6, 1.2, 1.8, 2.4], root=True)])

# ⭐ GH#405 —— castType `ground` → `self`。CLAUDE.md 第〇·六守則細則①**逐字點名這一支**：
#    規格寫「[指定]…施法距離14」卻又寫「在[周圍]隨機」⇒ 以內文為準，
#    **而且方括號標籤要被改成符合內文**（⛔ 不是留著兩個打架的來源）。
#    ⇒ `[指定]` 與「施法距離14」一起退場，castType 跟著內文走。理由同 13-04 那一段。
#
# ⭐ GH#404 —— 「[召喚]／招喚樹精」退場，**改成只講真的會發生的事**（第一·五守則出路②）。
#    ⚠️ 原作**真的有召喚**（第 5 層 w3a，證據鏈三段，⛔ 不是我判不出來）：
#      · `A0GN` 70-04 千年練成 base `ANr3` = **Rain of Chaos**
#        （stock `comments: "Rain of Chaos(Button 0,2)"`），DataA = 子技能、DataB = 顆數
#      · DataA → `A0GO`「招喚樹精」base `ANin` = **Inferno**，`UnitID1` = `n00Q`
#      · `n00Q` = 單位「千年練成樹精」：HP 450、護甲 2、攻擊 100、攻擊距離 180、
#        **move_speed 0**（不會走）、model `…\EntangleMine\Roots.mdl`、scale 1.5
#      · DataB = **4/6/8**（rank 1–3）—— 正是卡片上那三個數字
#      · EX 那一支（`A0ZO`/`A0ZQ` 70-002）召的是 `n01M`：HP 4500 / 護甲 10 / 傷害 360、
#        顆數 8/12/16 —— 逐項對上它 tooltip 的「十倍血量、五倍裝甲、傷害與數量兩倍」
#    ⛔ 那為什麼不直接走出路①（加 `summon`）？因為缺的**不是數值，是一具身體**：
#      `summon.championId` 是 `zRef("champions")`，而 `champion@1.modelKey` 是
#      **硬 ref**（`zRef("models")`，⛔ 不是 soft）⇒ 要一份新的 `model@1` + 一顆 GLB
#      + 一份新的 `champion@1` + 選人畫面／白名單的排除。出貨樹裡 `summon` 今天
#      **0 份內容在用**，也沒有任何 body-only 的 champion 文件可以抄。
#      ⇒ 第一·五守則出路③（升級成 owner 的決定）。原作數值全數保存在
#      `docs/legacy/_w3x-fidelity-superseded.md`，owner 點頭就照那張表接。
#    ⚠️ 同時量到的：出貨的 `content/items` 與 `content/augments` **沒有任何一件**
#      吃召喚物（那 5 筆 `召喚` 命中全是文案），所以「召喚流派玩家少一顆」的代價
#      今天是 **0** —— 這是走出路②在此刻可接受的理由，⛔ 不是它變成正解的理由。
A("70-04", "70-04 千年練成", "self", [90, 90, 90], [240, 420, 600], 0,
  "[主動][AP加成][範圍]\n{{cd}}秒冷卻\n消耗[MP] {{mp}}\n\n「想到以前某個夜晚一隻大貓跟兩個蘿莉一直要我下面長大呢」\n在[周圍][範圍]隨機竄出樹精，練成千年的魔力爆發，總共4/6/8棵樹精，每棵樹精在誕生的瞬間造成 {{dmg}} + 30% [AP] [範圍]傷害，若是被[定身]的狀態，則傷害加倍。（樹精會留在場上 8 秒替你打，攻擊與生命是你的 25%）",
  maxRank=3, radiusTier="中",
  effects=[{"kind": "randomArea", "who": "self", "count": [4, 6, 8], "intervalSec": 0.25,
            "scatterRadius": 6.0, "firstAtCast": True, "stopOnCasterDeath": True,
            # ⭐「隨機[招喚]樹精⋯總共 4/6/8 棵」的**看得見**那一半（2026-08-13）。
            #    ⚠️ 技能層級那一格 `vfxKey` 是跟著**施法事件**送的
            #    （abilitySystem.ts:375 `vfxKey: def.vfxKey`）—— 一次、在施法者身上，
            #    ⛔ 不會跟著 randomArea 的每一個落點播。所以在此之前那 4/6/8 棵樹精
            #    在畫面上是**零表現**：玩家只看到敵人身上每 0.25 秒莫名跳一次傷害，
            #    數不出「幾棵」，也沒有任何線索判斷落點在哪、該往哪閃（失敗形態②）。
            #    `spawnVfx` 的 `at:"point"` 讀的正是 `ctx.point`，而 randomArea 到期時
            #    就是用 `targets:[] + point:hit.pos` 跑這一串 ⇒ **一棵樹精一個落點**。
            # ⛔ 它要排在兩發 damageArea **前面**：`_fold_onhit` 折的是「形狀後面的
            #    酬載」，排前面就不可能被折進 onHitTargets（spawnVfx 也不在
            #    `_PAYLOAD_KINDS` 裡，兩道保險）。
            "effects": [{"kind": "spawnVfx", "vfxId": "fx.prim.nature.explosion-lg",
                         "at": "point"},
                        # ⭐⭐ GH#423 —— owner 2026-09-01 逐字：
                        #    「不是 A, B，而是 **C. 生出一個我方單位**，類似場上會攻擊敵人的
                        #     中立單位就好(這個已有)，**不要複雜化盡量重複使用**」
                        #
                        # ⚠️ 在此之前這裡卡在「缺一具身體」：`summon.championId` 是硬 ref，
                        #    要一份新的 `model@1` ＋ 一顆 GLB ＋ 一份新的 `champion@1`。
                        # ⭐ 而 `body:"self"` **一具都不用新增** —— 它複製施法者，
                        #    正是 owner 說的「重複使用」。⇒ 樹精 = 一具會打人的芙莉蓮分身。
                        #
                        # ⭐ `at:"point"` 讓每一個 randomArea 落點各生一具（⛔ 不是全部
                        #    擠在施法者身上）—— 那一格是 `summon` schema 本來就有的
                        #    「anchor for the formation: caster / first target / **cast point**」。
                        # ⛔ 這裡**不換成 tpl-summon-agent**：那會把整支技能重寫成模板，
                        #    而 randomArea 的落點、兩發條件傷害、爆炸特效全都要重接 ——
                        #    owner 說「不要複雜化」。⇒ 加一個 effect，⛔ 不是改一整支。
                        {"kind": "summon", "at": "point", "count": 1,
                         "body": "self", "team": "owner",
                         # ⚠️ 原作 `n00Q` 是 **move_speed 0**（不會走），而 GGD 今天
                         #    沒有「不會走的召喚物」那一格 ⇒ 它會走。誠實記一筆：
                         #    這是**已知的落差**，⛔ 不是我沒看到（w3a 證據在上面那一段）。
                         "durationSec": 8.0,
                         # ⭐ 原作攻擊 100 vs 英雄自己的攻擊 —— 取 0.25 讓它「會打人但不搶輸出」。
                         #    ⛔ 這個數字沒有 JASS 出處（原作是絕對值 100，而 self 複製是倍率）
                         #    ⇒ 它是**我挑的**，rollback＝把這一格改回 0 或刪掉這個 effect。
                         "damageMult": 0.25, "hpMult": 0.25,
                         "onOwnerDeath": "despawn"},
                        area("magic", tier="極小", per=[250, 350, 450], ap=0.3),
                        # ⭐「傷害加倍」= 同量再打一次，但**只打被定身的人**。
                        #    victimCondition 是圈**內**逐一過濾，這正是它唯一正確的用途。
                        # ⛔ victimCondition 不可以當 kw 傳進 area()：會被 amt() 的
                        #    o.update(kw) 倒進 amount，zScaling 是 .strict() ⇒ 整份拒收。
                        # ⚠️ 代價：兩發同量而不是一發乘二 ⇒ 兩個跳字、on-hit 各觸發兩次。
                        #    引擎詞彙裡沒有「條件式傷害倍率」這一格（engine-gap）。
                        dict(area("magic", tier="極小", per=[250, 350, 450], ap=0.3),
                             victimCondition={"kind": "status", "subject": "target",
                                              "tag": "root"})]}])

# ⭐ GH#404 —— `[召喚]` 標籤退場（內文 > 標籤）。這一支的**內文**從頭到尾只講兩件事：
#    「[千年練成] 追加 500% [AP] 傷害」與「[回復]自己與友方隊伍生命 10%」，
#    ⛔ 一個字都沒有召喚。標籤留著就是 `tag_gate` 那筆豁免存在的唯一理由
#    （("godie-e00s.ex","召喚")：「70-002 只是引用 R 的樹精」）—— 標籤走了，豁免也一起走。
A("70-002", "70-002 樹海降臨", "self", [0], [0], 0,
  "[被動][範圍][治療][AP加成]\n\n「是誰說樹味像雞」\n集千年煉成之大成，[千年練成] 追加 500% [AP]傷害，並且[回復][周圍]自己與友方隊伍生命10%。",
  # ⭐ 「[千年練成] **追加** 500% [AP] 傷害」＝ 改寫**另一支技能**的係數 ⇒ `augment`。
  #    `mode:"add"` 正是規格的「追加」（⛔ 不是 set）。⚠️「追加」是加在 70-04 每一顆
  #    樹精的傷害上，⛔ 不是這一支自己多打一發。
  augment={"targets": [
      {"abilityId": "godie-e00s.r",   # 70-04 千年練成
       "ops": [{"op": "damageCoeffAp", "mode": "add", "value": 5.0}]}]},
  passive={"name": "70-002 樹海降臨", "ranks": [{"hooks": [
      {"on": "onAbilityCast", "abilitySlot": "R", "target": "self",
       # ⭐「自己與友方隊伍」——原本只有 applyTo:"self"，隊友那一半靜默消失。
       #    ⚠️ 標籤閘看不到這一格（[治療] 已經被 restore 滿足），是讀規格抓出來的。
       #    ⚠️ shape:"circle" 的 radius 必填（見 92-002 那一列的註解）。
       "effects": [{"kind": "weightedBranch", "shape": "circle",
                    "radiusTier": "中", "radius": TIER_R["中"],
                    "side": "allies", "maxTargets": 24,
                    "branches": [{"weight": 1, "effects": [
                        {"kind": "restore", "healthPct": 0.1}]}]}]}]}]})
