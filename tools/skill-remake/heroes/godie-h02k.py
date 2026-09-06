#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""89 熊貓 —— `godie-h02k` 的 6 支技能（天生技 / Q / W / E / R / EX）。

⛔ 這一份只有**這一位英雄的資料**。共用的機制（`amt` / `dmg` / `area` /
   `buff` / 級距 / 各種閘）在 `common.py`；匯總與產生在 `batch1.py`。
"""
from common import A, M, area, buff, dmg, hook_icd, status


A("89-00", "89-00 憤怒的門牙", "self", [0], [0], 0,
  "[被動][普攻時][機率][暈眩]\n{{cd}}秒冷卻\n\n「我的門牙不是裝飾，是開罐器」\n有3%的[機率]可以使出超會心一擊造成 {{dmg}}點 [真實傷害]，並造成敵人 1%生命傷害的 [燃燒] 狀態，持續5秒。\n\n(敵方 [暈眩] 狀態下額外追加 [致盲] 狀態，持續 5秒)",
  innate="passive",
  passive={"name": "89-00 憤怒的門牙", "ranks": [{"hooks": [
      # ⭐ 兩顆各帶 chance:0.03 的 hook 合成**一顆**（＝擲一次骰）。
      #    原本「超會心 ∧ 致盲」只有 0.03×0.03 = 0.09%（規格是 3%，少 33 倍），
      #    而且致盲會在完全沒有超會心的平砍上單獨發動 3% —— 那不是「額外追加」。
      {"on": "onBasicAttack", "chance": 0.03, "target": "event",
       "effects": [dmg("true", flat=999), status("burn", 5.0),
                   status("blind", 5.0, missChance=0.5,
                          condition={"kind": "status", "subject": "target",
                                     "tag": "stun"})]}]}]})

A("89-01", "89-01 憤怒的頭槌", "self", [0], [0], 0,
  "[被動][機率][普攻時][暈眩]\n\n「頭腦不好沒關係，頭骨夠硬就行」\n[攻擊時]有 3/4/5/6%[機率]想起頭槌攻擊，造成 10倍 [暴擊] 傷害，並將敵人[暈眩] 1秒。\n\n(敵方 [燃燒] 狀態下額外追加 [致盲] 狀態，持續 5秒)",
  innate="passive", maxRank=4,
  passive={"name": "89-01 憤怒的頭槌", "ranks": [
      {"critStrike": {"chance": c, "damageMult": 10.0, "lifestealFraction": 0.0},
       "hooks": [
          # ⭐ 一次判定、一串結果。⛔ 不可以寫 `chance: c`：critStrike 自己已經擲過
          #    一次，hook 再擲一次就是 c×c（rank1 0.09%），而畫面上是「暴擊了卻沒暈」。
          #    `critSource:"thisSource"` 是引擎替這一支開的那一格（grant 與 hook
          #    住在同一份 source 上）。
          # ⚠️ 事件必須是 onDamageDealt —— damageCrit / critSource 只有
          #    DAMAGE_BEARING_EVENTS 帶得到那一發封包，掛在 onBasicAttack 上載入
          #    時就被 refineHookDamageContext 拒收 ⇒ tag_gate 的「普攻時」要同批
          #    補第二種形狀。
          {"on": "onDamageDealt", "target": "event",
           "damageSource": "basic", "damageCrit": "crit", "critSource": "thisSource",
           "effects": [status("stun", 1.0, stun=True),
                       status("blind", 5.0, missChance=0.5,
                              condition={"kind": "status", "subject": "target",
                                         "tag": "burn"})]}]}
      for c in (0.03, 0.04, 0.05, 0.06)]})

A("89-02", "89-02 憤怒的菊花", "self", [0], [0], 0,
  "[被動][範圍][機率]\n\n「菊花一緊，空氣力學就有了答案」\n當敵人攻擊熊貓的時候，有3%[機率][反彈]，[反彈時] 會胡亂噴放排泄物使[周圍][範圍] 敵人造成 [癱瘓] 及 [詛咒]。\n\n(敵方 [致盲] 狀態下額外追加 [混亂] 狀態，持續 10秒)",
  innate="passive",
  passive={"name": "89-02 憤怒的菊花", "ranks": [{"hooks": [
      # ①「有3%[機率][反彈]」—— 反彈本體。
      # ⭐ target 從 "self" 改成 "event"：damage 的封包走 ctx.targets，"self" 會讓
      #    熊貓把傷害反彈到**自己**身上。onDamageTaken 是帶傷害封包的事件，
      #    所以 inc_pct 收得到那一發。
      # ⚠️ perRank 1.0 是**規格沒給的數字**（同 60-04 那一筆，逐字同一個坑），要問 owner。
      # ⭐「當**敵人**攻擊熊貓的時候」—— `victim:"enemy"` 就是規格裡那兩個字。
      # ⛔ 省略它**不等於**「敵人打的」：`sim/effects/hooks.ts::victimPasses` 對缺席的
      #    `victim` 走 `default: return true`，也就是**任何一發進 damageQueue 的封包**
      #    都算數 —— 含熊貓自己的自傷（89-03 的 2% 自爆、89-002 的 1/6 自殺分支，
      #    兩者 `pkt.source === pkt.target === 熊貓`）。畫面上就是「沒人打我，怎麼
      #    開始噴屎了」，而規格裡沒有這個互動。
      # ⚠️ 這一格是 #244 開的**既有機制**（全 repo 13 個位置在用），⛔ 不是為熊貓寫的 if。
      # ⚠️ 殭屍與守護者照樣算敵人：`MONSTER_TEAM = 255`（mobs.ts:340）與英雄隊伍不同
      #    ⇒ `sameTeam(...) === false` ⇒ 通過。被擋掉的**只有自己**。
      {"on": "onDamageTaken", "chance": 0.03, "target": "event", "victim": "enemy",
       "internalCooldown": 1.0,
       "effects": [dmg("magic", flat=0, inc_pct={"perRank": [1.0]})]},
      # ②③「[反彈時] 會…使[周圍][範圍]敵人造成[癱瘓]及[詛咒]」
      # ⭐「[反彈時]」逐字就是 onReflectSuccess —— ⛔ **不是**第二顆帶 chance 的 hook
      #    （那是 89-00/89-01 的 0.03×0.03 = 0.09% 缺陷再造一次）。這一顆不擲骰，
      #    閘是「反彈真的落地」。
      # ⭐ target:"self" ⇒ ctx.targets=[熊貓] ⇒ damageArea 圓心是熊貓自己 ＝「周圍」。
      # ⛔ 三顆狀態**必須**在 onHitTargets 裡：那一段收到的是這個圓真的打到的敵人。
      #    掛成 hook 的頂層兄弟 ⇒ **熊貓自己暈 1 秒 + 自帶 5 秒 50% miss，敵人什麼都沒有**
      #    —— 那正是這一支上架以來的樣子。
      # ⭐ statusId 從 "stun" 改成 "paralysis"：content/status-effects/paralysis.json
      #    的描述**逐字點名這一支**（「89-02 憤怒的菊花 反彈時對周圍敵人灑的就是它」）。
      {"on": "onReflectSuccess", "target": "self",
       "effects": [area("magic", tier="小", flat=1,
                        onhit=[status("paralysis", 1.0, stun=True),
                               status("curse", 5.0, missChance=0.5),
                               status("confusion", 10.0, berserk=True, targetsAllies=True,
                                      condition={"kind": "status", "subject": "target",
                                                 "statusId": "blind"})])]}]}]})

A("89-03", "89-03 憤怒的胸毛", "self", [0], [0], 0,
  "[被動][機率]\n\n受到敵方傷害時，有 4% [機率] 拔下熊貓的一根胸毛，這份刺激的快感讓熊貓 [攻擊速度] 提升200/250/300/350%，持續4秒，但也會有 2% [機率] 拔到重要部位的毛，[自爆] 損失現存 50%生命。",
  innate="passive", maxRank=4,
  passive={"name": "89-03 憤怒的胸毛", "ranks": [
      # ⭐「受到**敵方**傷害時」—— `victim:"enemy"` 就是「敵方」那兩個字，理由與
      #    89-02 那一顆逐字相同（缺席的 victim ⇒ `victimPasses` 回 true ⇒ 任何封包
      #    都算，含自己 2% 自爆與 89-002 輪盤自殺那一發）。
      # ⚠️ `target` 與 `victim` 是**兩條軸**，並存不矛盾：`target:"self"` 說「攻速加給誰」
      #    （熊貓），`victim:"enemy"` 說「誰打的才算」（事件那一端＝攻擊者）。
      {"hooks": [{"on": "onDamageTaken", "chance": 0.04, "target": "self",
                  "victim": "enemy", "internalCooldown": 1.0,
                  "effects": [buff([M("as", "pctAdd", v)], 4.0)]},
                 # ⭐「但也會有 2%[機率]拔到重要部位的毛，[自爆]損失現存 50%生命」
                 # ⛔ 不巢狀在 4% 裡：0.04×0.02 = 0.08%，一整場都不會發生一次
                 #    （＝ 89-00/89-01 那個 0.09% 缺陷的同型）。規格的「但也會」是
                 #    同一個觸發下的**另一條**獨立機率。
                 # ⚠️ res_pct 必須當 dmg() 的**兄弟鍵**（_split_res_pct 會先 pop 掉它）；
                 #    直接當 kw 傳會被倒進 amount，而 zScaling 是 .strict() ⇒ 整份被拒。
                 #    applyTo 同理，用 dict() 包在外面。
                 # ⭐ damageType "true"：自爆是「損失生命」不是一發攻擊，不吃護甲魔抗。
                 # ⚠️「打不死人」只在**今天**字面為真（0.5 × 現存 < 現存，而
                 #    damageDealt=1.0）—— 那是 config 保證不是結構保證。
                 # ⭐ 同一句「受到**敵方**傷害時」也管到這一顆 —— 規格的 2% 與上面的
                 #    4% 共用同一個觸發詞，所以「敵方」那兩個字必須也在這裡。
                 # ⚠️ 少了它會**自我餵食**：自爆那一發（`applyTo:"self"`）是一個
                 #    `pkt.source === pkt.target === 熊貓` 的正常封包，落地時再發一次
                 #    `onDamageTaken` ⇒ 4% 那一顆（`hookLastFired[hi]` 各記各的 ICD）
                 #    可能立刻白拿一層攻速，而畫面上沒有任何敵人參與。
                 {"on": "onDamageTaken", "chance": 0.02, "target": "self",
                  "victim": "enemy", "internalCooldown": 1.0,
                  "effects": [dict(dmg("true", flat=0,
                                       res_pct={"subject": "self", "resource": "health",
                                                "basis": "current", "perRank": [0.5]}),
                                   applyTo="self")]}]}
      for v in (2.0, 2.5, 3.0, 3.5)]})

A("89-04", "89-04 憤怒的簡諧運動", "self", [0], [0], 0,
  "[被動][機率][普攻時][迴避][迴避時][拉扯][擊退][暈眩][身上有某狀態時][混亂][AP加成]\n\n[攻擊時]有8/12/16%[機率]將對方抓取過來造成 {{ap}}% [AP]傷害，並且擁有 8/12/16% 物理[迴避]，[迴避]成功的時候，將會 [擊退] 對方小一段距離，並造成 [暈眩] 1秒。\n\n(敵方 [致盲] 狀態下額外追加 [混亂] 狀態，持續 3秒)",
  innate="passive", maxRank=3,
  passive={"name": "89-04 憤怒的簡諧運動", "ranks": [
      {"modifiers": [M("evasion", "flat", c)],
       "hooks": [
           {"on": "onBasicAttack", "chance": c, "target": "event",
            "effects": [dmg("magic", ap=0.16),
                        # ⭐ [拉扯]「將對方抓取過來」= knockback.from="pull"（全 repo 第一個）
                        {"kind": "knockback", "distance": 3.0, "speed": 16.0,
                         "from": "pull"}]},
           # ⭐ owner 2026-08-21 ⑤：「有些被動是有冷卻的」。這一條是「觸發式被動、
           #    零節流」裡**唯一掛著硬控**的那一支：迴避 8–16%，被一群殭屍圍毆時
           #    每秒觸發數次 ⇒ 一個近乎常駐的 1 秒暈眩來源，而且沒有遞減。
           #    ⚠️ 同一位英雄的 89-02 / 89-03 出貨就帶著 ICD —— 一位英雄不該有兩把尺。
           {"on": "onEvade", "target": "event", "internalCooldown": hook_icd(),
            "effects": [{"kind": "knockback", "distance": 2.0, "speed": 14.0,
                         "from": "caster"},
                        status("stun", 1.0, stun=True)]},
           # ⭐「敵方 X 狀態下額外追加 Y」—— 熊貓六支共用的那**一個**模板，
           #    89-00 / 89-01 已經在用（第〇·五守則：不是為這支寫的 if）。
           {"on": "onBasicAttack", "target": "event",
            "condition": {"kind": "status", "subject": "target", "statusId": "blind"},
            "effects": [status("confusion", 3.0, berserk=True, targetsAllies=True)]}]}
      for c in (0.08, 0.12, 0.16)]})

A("89-002", "89-002 俄羅斯輪盤", "targeted", [10], [666], 5.29,
  "[主動][指定][範圍][輔助][恐懼][機率]\n{{cd}}秒冷卻\n消耗[MP] {{mp}}\n施法距離：{{range}}\n\n拿出土製左輪手槍裝填一顆子彈，生死一瞬間，有1/6的機會讓對方或1/6自己死亡，剩餘4/6 對方會陷入 [恐懼] 狀態，持續 2秒。\n\n(敵方 [致盲] 狀態下對方的死亡[機率]提升到 2/6)\n(敵方 [混亂] 狀態下對方的死亡[機率]提升到 3/6)",
  # ⭐ B3-C4 —— 條件改寫**權重**。⛔ 不可以寫進 branches[]：那是 .strict()，只收
  #    {weight, effects}，多一格 condition 整份被拒收。
  # ⚠️ 三顆**必須互斥**：兩顆同時通過 = 擲兩次骰 = 一次施放死兩次。
  # ⚠️ 混亂與致盲同時在身上時混亂贏（3/6 > 2/6）—— 這是裁決不是推導。
  effects=[{"kind": "weightedBranch", "shape": "single", "condition": cond, "branches": [
      # ⭐「讓對方死亡」= 100% 目標[最大生命]的真傷。⛔ 不可以用 devour：
      #    `thresholdPctOfMax` 上界是 0.5，**滿血的人抽中「死亡」也毫髮無傷**，
      #    而 schema 自己就寫著「一條剩一半就吞得掉的處決線…應該用 damage 寫」。
      # ⚠️ owner 2026-08-13 裁決「1/6 自己死亡**算擊殺**」= yes（見稽核文件）。
      # ⚠️ 副作用要明說：`devour.victim:"champion"` 這一格消失了 ⇒ **輪盤現在吃得掉
      #    殭屍**。那是 owner 立過的裁決（devour.ts 的註解），列進 owner 表。
      # ⭐ owner 2026-08-13：「**只能吃掉英雄**，特殊殭屍跟殭屍王可以被考慮是英雄單位」。
      #    ⇒ 用 `condition{kind:"kind", is:"champion"}` 把非英雄擋掉。
      #    ⚠️ 這一格是**回收**上一版丟掉的 `devour.victim:"champion"`（那是 owner
      #    立過的裁決，我換成 damage 時把它弄丟了）。
      # ⚠️ 「特殊殭屍/殭屍王算英雄」那一半**沒做** —— 它們今天的 entity kind 是 `mob`，
      #    要它們被這條讀成 champion 得動分類（新 kind 或重新歸類），那是另一張卡。
      # ⚠️ 「死亡」今天**打不死帶護盾的滿血目標** —— 明說，不是漏掉（第三守則）。
      #    這一發走一般 damageQueue，而 `combat/damage.ts::eligibleShields` 的濾鏡是
      #    `s.absorbs === undefined || s.absorbs === "all" || s.absorbs === type`
      #    ⇒ **真傷照樣被護盾吃掉**。滿血時 current === max，扣完剛好剩下「護盾量」點血：
      #    身上有任何一片盾就活下來。content/abilities 有 7 支發 `shield`、1 支
      #    `manaBarrier`（後者連 `shieldBreak` 都碰不到 —— 它是 damage.ts:964 的另一條
      #    扣減），所以這不是理論值。同一發還乘 `world.combatEnv.damageDealt`
      #    （damage.ts:875；出貨值 1.0）⇒ owner 一旦調到 <1，兩格死亡分支對滿血目標就
      #    **結構性**永遠不致命 —— 今天字面為真只是 config 保證，不是結構保證。
      # ⛔ 這裡**不補**：JSON 側沒有出口。`devour` 有 `throughShields` 但
      #    `thresholdPctOfMax` 上界 0.5（滿血抽中也毫髮無傷）；`shieldBreak` 沒有
      #    `applyTo`，救不了「自己死亡」那一格，也碰不到 manaBarrier。缺的是引擎的
      #    `damage.throughShields`（鏡射 `devour.throughShields`，effect.ts:2927）＋
      #    一格 `damage.skipGlobalDamageMult`（`DamagePacket` 已經有這個欄位，只是
      #    content schema 沒開）。⛔ 為這一支寫 if 是第〇·五守則的紅線。
      {"weight": foe, "effects": [dict(dmg("true", flat=0,
          res_pct={"subject": "target", "resource": "health",
                   "basis": "max", "perRank": [1.0]}),
          condition={"kind": "kind", "subject": "target", "is": "champion"})]},
      # ⭐「或 1/6 **自己**死亡」—— devour 沒有 applyTo，所以這一支從頭到尾打在
      #    敵人身上（＝兩顆分支都是「對方死」，玩家自己的 1/6 風險**根本不存在**）。
      #    `damage.applyTo:"self"` 是唯一的落點。
      {"weight": 1, "effects": [dict(dmg("true", flat=0,
          res_pct={"subject": "self", "resource": "health",
                   "basis": "max", "perRank": [1.0]}), applyTo="self")]},
      {"weight": 6 - 1 - foe, "effects": [status("fear", 2.0, feared=True)]}]}
      for cond, foe in (
          ({"kind": "status", "subject": "target", "statusId": "confusion"}, 3),
          ({"all": [{"kind": "status", "subject": "target", "statusId": "blind"},
                    {"not": {"kind": "status", "subject": "target",
                             "statusId": "confusion"}}]}, 2),
          ({"not": {"any": [{"kind": "status", "subject": "target", "statusId": "blind"},
                            {"kind": "status", "subject": "target",
                             "statusId": "confusion"}]}}, 1),
      )])
