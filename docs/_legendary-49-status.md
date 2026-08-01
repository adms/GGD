# 棱彩三選一 · 49 支傳說武器 實作進度

> **這一頁是產生出來的，不要手改。** 重新產生：
>
> ```bash
> python3 tools/legendary-status/status.py
> ```
>
> 它每次都重讀 `content/`，逐行比對 owner 寫的「效能」文案與該道具真正帶的
> `modifiers` / `passive` / `auras`。手寫的進度表只會往「看起來比實際完成得多」
> 的方向腐爛，而那正是這一批要消滅的缺陷。


`████████████████████` **49 / 49** 支每一行文案都有對應資料（100%）


| 狀態 | 意思 | 行數 |
|---|---|---:|
| ✅ | 文案這一行有對應的資料 | 139 |
| ❌ | **文案講了、資料沒有** —— 玩家拿不到 | 0 |
| 📝 | 還沒做，但 `authoringNote` 已登記缺什麼 | 0 |
| ❔ | 這支工具讀不出來 —— **代表沒有人在檢查它** | 0 |

## 上架管線

- 抽獎池 `content/loot-tables/legendary-weapons.json`：**49** 支
- 白名單 `starter.go` `starterLegendaryItems`：**49** 支 （缺口：無）
- 會滾這張表的回合：**2, 5**
- `draftEligible: false`（在池子裡但永遠不會被發出來）：**無**

⚠️ 抽卡是**先滾骰再過白名單**（`MatchController` → `whitelist.filterItems`），所以白名單少一支不是「那支抽不到」，是整張卡的選項會變少甚至空掉。


## 逐支明細


### ✅ 近擊的巨人鎧 `bulwark-charge-greaves`

- ✅ `裝甲+100` — armor 對得上
- ✅ `每秒生命回復+12` — healthRegen 對得上
- ✅ `[衝刺] 施放技能時向前衝刺 4.5 距離（冷卻 8 秒）` — [衝刺] ← dash

  <details><summary>authoringNote</summary>

  [衝刺]「施放技能時向前衝刺 4.5 距離（冷卻 8 秒）」= passive[0]（onAbilityCast + internalCooldown 8 + dash forward maxDistance 4.5）。speed 18 是文案沒有給的（只給了距離與冷卻），它是一個欄位。
⚠️ **描述與資料不一致，需要 owner 裁決，這一輪刻意沒有動它**：hook 上掛了 `requires: {attackType:"melee", primaryStat:"STR", onMismatch:"block"}`，也就是**只有力量近戰英雄**衝得動；描述從頭到尾**沒有任何職業限制**（名字與 tags 是 melee/tank，但那不是規格）。以現行 119 位英雄的名冊估算，這道閘會讓大多數持有者拿到一件「裝甲+100、回復+12、然後什麼都不會發生」的鎧甲 —— 正是這一批要消滅的「描述說謊」。兩個修法都只改資料：(a) 拿掉 `requires` 讓它符合描述，(b) 保留閘但把 onMismatch 改成 "reduced" + mismatchScale，讓不符條件的人衝短一點。**不要**改描述（那是 owner 的規格）。

  </details>

### ✅ 泰坦九頭蛇 `cleaver-of-the-warden`

- ✅ `最大生命+10%` — maxHealth 對得上
- ✅ `[On-Hit] 攻擊附帶額外的（15+1.5%自身最大生命值）物理傷害攻擊特效(On-Hit)，並生成一道衝擊波來對目標身後的敵人們造成（40+3%最大生命值）物理傷害。` — [On-Hit] ← onBasicAttack → damage/damageArea

### ✅ 無盡連刃 `endless-edge`

- ✅ `[神速] 攻擊速度上限提升至 10 (預設上限為4)` — [神速] ← __modifier__
- ✅ `[疊層] 每次普攻命中攻擊速度增加10%，可無限疊加，1秒內沒有新的普攻命中則全部層數歸零` — [疊層] ← applyBuff

  <details><summary>authoringNote</summary>

  [神速]「攻擊速度上限提升至 10」= modifiers 的 ModOp.CapRaise（as → 10.0）。CapRaise **不給任何數值**，只把天花板搬高（sim/statCaps.ts 的 effectiveCap 再夾一次到 config.stat-caps@1 的 unlocked）；要真的打到 10 還是得靠下面的疊層或別件裝備。
[疊層]「每次普攻命中攻擊速度增加10%，可無限疊加，1秒內沒有新的普攻命中則全部層數歸零」= passive[0]，而且**三句話都是逐字對上的**，不要「順手修好」它：
· 「增加10%」= applyBuff modifiers as pctAdd 0.1；
· 「可**無限**疊加」= **故意不寫 maxStacks**（sim/effects/applyBuff.ts：`const cap = e.maxStacks ?? Number.POSITIVE_INFINITY`）。加一個上限就是改掉這張卡。
· 「1秒內沒有新的普攻命中則**全部**層數歸零」= duration 1 + stackKey。⚠️ 這一點很容易被誤讀成「每層各自 1 秒、會逐層掉」：**不會**。stackKey 讓所有層共用**同一個** ModifierSource，而每次命中都會把那一個 source 的 expiresAtTick 整個往後推（applyBuff.ts 的 stacking path）。所以層數是一起活、一起死的 —— 正是文案說的「全部歸零」。

  </details>

### ✅ 丈八蛇矛 `godie-i000`

- ✅ `攻擊力+87` — ad 對得上
- ✅ `生命+872` — maxHealth 對得上
- ✅ `[擴散] 擴散傷害87%` — [擴散] ← damageArea

### ✅ 至尊魔戒 `godie-i004`

- ✅ `魔力+1000` — maxMana 對得上
- ✅ `[隱身] 永久隱身 (不會被主動索敵)，但攻擊會現身，無動作 3秒後再次隱身。` — [隱身] ← __vision__

  <details><summary>authoringNote</summary>

  [隱身] = item@1 的 vision.stealthFadeDelaySec = 3，直接對上文案的「無動作 3秒後再次隱身」。「攻擊會現身」不需要另外寫：sim/stealth.ts 的淡入計時本來就由「有沒有動作」驅動，攻擊會把它重置。「不會被主動索敵」也已經是既有規則 —— config.stealth@1 的 blocksAutoAcquire 預設 true。w3x 出處 Apiv（永久隱形術），同族的 27-00 用 fade 4.0；這裡用 owner 文案自己給的 3 秒。

【先前紀錄】【仍缺】[隱身]「永久隱身 (不會被主動索敵)，但攻擊會現身，無動作 3秒後再次隱身」。
原語存在但**道具接不到**：zVisionGrant（packages/shared/src/content/schema/effect.ts）帶 stealthFadeDelaySec / trueSightRadius，而 sim/stealth.ts:258 的 syncVisionGrants 是走 `sc.sources` 的 —— 任何一個 ModifierSource 都可以帶它。缺的只有兩樣：(a) zItemDef 沒有 `vision` 欄位，(b) sim/economy/itemSource.ts 沒有把它轉發到 kind:"item" 的 source 上。今天只有 ability@1 的 passive rank 寫得出來。
文案把兩個數字都給了：stealthFadeDelaySec = **3**（「無動作 3秒後再次隱身」，正好對應 WC3 Apiv 的 Dur 欄；27-00 永久性的隱形術 出貨 4.0）。所以這一件不需要任何設計決定，只需要那兩行接線。
已落地：魔力+1000（maxMana flat 1000）。

  </details>

### ✅ 雅典娜的驚嘆號 `godie-i006`

- ✅ `AP+33%` — ap 對得上
- ✅ `每秒魔力回復速度+13` — manaRegen 對得上
- ✅ `[OnHit] 每次攻擊造成造成額外 33% AP傷害(On-Hit)` — [OnHit] ← onBasicAttack → damage

### ✅ 虛哭神去 `godie-i007`

- ✅ `普攻吸血+20%` — lifesteal 對得上
- ✅ `[On-Hit] 每次攻擊造成造成額外 [自身已損失的生命百分比數值(0~100)] (On-Hit)` — [On-Hit] ← onBasicAttack → damage

  <details><summary>authoringNote</summary>

  普攻吸血+20% = modifiers lifesteal flat 0.2。
[On-Hit]「每次攻擊造成造成額外 [自身已損失的生命百分比數值(0~100)]」= passive onBasicAttack → damage.resourcePct {subject:"self", resource:"health", basis:"missing", scale:"points", perRank:[1]}（sim/effects/dynamicTerms.ts）。
⚠️ **讀法**:文案寫的是「百分比**數值**(0~100)」,所以掉了 60% 血 = 打 **60 點**,不是「60% 的什麼」。那正是 scale:"points" 這個欄位存在的理由 —— 另一種讀法(ratio)是「已損生命的 100%」,在滿血倍率下差三個數量級。兩種讀法都寫得出來,預設是 ratio(保守),這一件明寫 points。
⚠️ **owner 要看的數字**:上限 100 點(1 HP 時),典型交戰 50% 血 = 50 點。與生命上限**無關**,所以它在後期是相對變弱的一項 —— 如果 owner 要的是「已損生命的百分比傷害」(隨血量長大),把 scale 改成 "ratio"、perRank 改 [0.1] 這一類即可,不用改程式。
⚠️ 滿血時這一項是 0,而 effects/damage.ts 會**不發空封包**(否則每一刀都在對方頭上跳一個 0、還會白白觸發雙方的 onDamageTaken/onDamageDealt)。
damageType 選 physical:妖刀是實體武器,而且 physical 會吃護甲減免 —— 出錯時傷害較小的那一個。要改成 true/magic 是編輯器上的一個下拉。

  </details>

### ✅ 霸王破甲槍 `godie-i00f`

- ✅ `[無視] 普攻無視敵方防禦真實傷害` — [無視] ← __damageTypeOverride__
- ✅ `總防禦+10%` — armor 對得上
- ✅ `總攻擊+10%` — ad 對得上

  <details><summary>authoringNote</summary>

  【2026-08-01 落地】[無視]「普攻無視敵方防禦真實傷害」= damageTypeOverride {scope:"basic", becomes:"true"}。
· 機制：sim/combat/damage.ts 的 mitigate() 在 `pkt.type === "true"` 就直接回傳原值，護甲/魔抗那條 100/(100+resist) 曲線整個跳過 —— 所以「無視防禦」不需要新的減傷數學，只需要有人把封包重蓋成 true。做這件事的是 sim/combat/damageTypeOverride.ts 的 resolveDamageTypeOverride()，由傷害佇列的抽乾迴圈呼叫。
· ⚠️ 更正這份備註的舊版本：它建議「由 BasicAttackSystem 組封包時讀」，那是**錯的接縫**。普攻有兩個 push 站點 —— 近戰在 systems/BasicAttackSystem.ts、遠程在 systems/ProjectileSystem.ts —— 所以那個做法會讓遠程英雄拿到一件完全沒有效果的武器（CLAUDE.md 失敗形態 ②）。傷害佇列是全樹 9 個 push 站點的唯一匯流處。
· 另一條路 Stat.ArmorPen 被否決：它要動 statTypes / STAT_CLAMPS / ITEM_MODIFIER_LIMITS / 面板 / 商店預覽，而且**表達不出 惡夢魔王碎片**（穿甲值對法術傷害無話可說）。
· 省略 applyAt = 預設 "afterGates"：無敵/免疫與閃避仍然用**原本的**物理型別判定，轉換只影響護甲魔抗與護盾型別過濾。要連免疫一起無視就寫 applyAt:"beforeGates"（那是 owner 的決定，不是這次匯入偷偷做掉的）。
已落地：總防禦+10%（armor pctAdd 0.1）、總攻擊+10%（ad pctAdd 0.1）、[無視]。
守衛：packages/shared/src/sim/combat/damageTypeOverride.test.ts（機制）＋ damageTypeOverride.shipped.test.ts（這三件出貨文件的 scope 逐件釘死）。

  </details>

### ✅ 炎龍巨弩 `godie-i00i`

- ✅ `[On-Hit] 每次普攻會同時發出 100% AP 傷害的炎龍怒火造成周圍 3名敵人燃燒傷害(On-Hit)，持續3秒` — [On-Hit] ← onBasicAttack → damageArea
- ✅ `最大魔力+20%` — maxMana 對得上

  <details><summary>authoringNote</summary>

  [On-Hit]「每次普攻會同時發出 100% AP 傷害的炎龍怒火造成周圍 3名敵人燃燒傷害」= passive[0] 的 damageArea（ratios ap 1.0、maxTargets 3 = 文案的「3名敵人」、radius 3.5 = 這一批 on-hit 範圍傷害的出貨慣例，文案沒有給半徑）。
【仍缺】「**持續3秒**」—— 現在是**一次打完**，不是分 3 秒燒。`dot` 效果（content/schema/effect.ts）是**單體**的：它作用在 ctx.targets 上，而 `damageArea` 沒有辦法帶一個 dot payload。要補需要 (a) 給 damageArea 一個「命中者各自套用的效果」陣列，或 (b) 給 dot 一個 radius。總傷害量是對的，分佈不是 —— 差別在對手有沒有機會在燒完之前把血補回來。
已落地：最大魔力+20%。

  </details>

### ✅ 奇門盾甲 `godie-i00j`

- ✅ `每秒回復最大生命+1%` — 每秒回復『最大生命的 %』= onInterval + heal(ratios maxHealth) ← heal
- ✅ `[格擋] 50%格擋 AD 及 AP 傷害 (真實傷害無法阻擋)` — [格擋] ← __block__

  <details><summary>authoringNote</summary>

  「每秒回復最大生命+1%」= passive[0]（onInterval + internalCooldown 1 + heal ratios maxHealth 0.01）。節奏一律由 HookDef.internalCooldown 表達，見 sim/systems/IntervalHookSystem.ts。

[格擋]「50%格擋 AD 及 AP 傷害 (真實傷害無法阻擋)」= block {damageTypes:[physical,magic], chance:0.5, fraction:1}。
⚠️ 「50%」是**機率**不是比例，而且這是用證據判的，不是猜的：
  (a) w3x 原始資料（docs/content/reconciliation/items.md 的 godie-i00j 那一列）掛的是 A0US◄Ansk→Assk「Hardened Skin(Naga Turtle)」，欄位是**降低傷害機率 (%) 50** —— 那個欄位的名字自己就是「機率」。
  (b) 同一支 Ansk、同一個 50 也掛在 黃金聖鬥衣 godie-i00s（A035，降低傷害機率 (%) 50），而 owner 對那一支寫的是「50%**機率**抵擋」。同一個來源欄位、同一個數字，owner 在其中一支明寫了機率。
  (c) **owner 自己的改寫史**：這一件在 owner 改寫前的匯入文案是「50%格擋**100點**傷害」—— 那句話裡的 50% 只能是機率（Ansk 的兩個欄位：機率 50 / 忽視 100）。owner 保留了 50%、把「100點」換成「AD 及 AP 傷害」，也就是把**定量**換成**型別涵蓋**，沒有把機率換成比例。同一次改寫在 黃金聖鬥衣 上是「50%機率抵擋**125**傷害」→「50%機率抵擋 **100%** AP傷害」，同一個手法。
  · 若 owner 要改讀成「每發擋一半」，那是後台把 chance 改 1、fraction 改 0.5，不是改程式（第一守則）。
「真實傷害無法阻擋」= damageTypes 裡沒有 "true"，不是程式裡的一行 if。
⚠️ WC3 的 Ansk 其實是「忽視固定 100 點」而不是比例；這裡**沒有**做固定點數那根軸，因為 owner 的文案一個字都沒提到點數，而一根沒有內容在用的軸就是失敗形態 ②。
⚠️ **多來源不是「取最好的一個」了。** owner 推翻了舊註解的「取 chance×fraction 最大者、一發只抽一次骰，帶兩件格擋不會比一件強」，裁決是「獨立判斷兩次，拿第一次擋掉剩餘繼續算下一次」：每個來源各抽各的骰、各自從**剩餘**傷害再削一次。實測（20 萬發）：本件單獨吃一發魔法傷害擋到 0.4992；本件 + 黃金聖鬥衣 一起吃同一發，跳到 **0.7508**（1−0.5²）—— 兩件都是 fraction 1，先擋中的就把整發吃光、鏈到此為止。物理那一邊仍是 0.4992（黃金聖鬥衣 只列 magic，型別不符連骰子都不抽）。規則是欄位 blockRules.stacking（出貨 independent，舊行為 best 切得回去）。
【格擋機制】四支 [格擋] 共用 sim/combat/block.ts 的 BlockGrant（item@1.block）：damageTypes / chance / fraction / lethalOnly / lethalBasis / internalCooldown **六根軸**，不是四個 bespoke 分支。（⚠️ 原本寫「五根軸」，漏掉後補的 internalCooldown —— 本件與 黃金聖鬥衣 沒有冷卻，晨曦之光 / 殺豬刀 出貨都是 1 秒。軸數會腐爛，所以 content/blockNoteTruth.test.ts 拿 zItemBlockGrant 的鍵數對這個字。）閘點在 combat/damage.ts 的佇列裡、mitigate() 之後、護盾池之前 —— 所以「擋掉一半」擋的是玩家真的會吃的量，而格擋不吃你的護盾；applyImpact 收到的仍是**擋之前**的 impact，所以一發被完全擋下的重擊照樣有硬直與擋格火花（跟護盾吃滿一發完全同一條路）。
它**沒有**新事件：blocked=true 已經是客戶端「擋下了」的完整通道 —— combatText 的 guard 文字、hitFeel 的 sparkKind:"block"、GameApp 的 playContextualVoice(blocker,"block") 格擋語音。所以 net/eventFanout.ts 不用動。

  </details>

### ✅ 落魂的嗜血劍 `godie-i00l`

- ✅ `攻擊力+128` — ad 對得上
- ✅ `[神速] 攻擊速度+200%，攻速上限提升到10 (預設上限為4)` — [神速] ← __modifier__
- ✅ `全能吸血+30%` — lifesteal 對得上
- ✅ `每秒損失 3%現存生命` — 每秒扣『現存生命的 %』= onInterval + damage(hpPct current) ← damage

  <details><summary>authoringNote</summary>

  四行效能全部落地：攻擊力+128、[神速] 攻速+200% + capRaise 10.0（ModOp.CapRaise，見 sim/statCaps.ts 與 GH#286）、吸血+30%、「每秒損失 3%現存生命」= passive[0]（onInterval + internalCooldown 1 + true damage hpPct basis "current" 0.03，打自己）。
⚠️ 一個名詞差異記在這裡以免下次稽核當成缺陷：文案寫「**全能**吸血+30%」（omnivamp，技能傷害也吸），但 sim 只有 Stat.Lifesteal，而它在 sim/combat/damage.ts:675 是掛在 `pkt.origin === "basic"` 底下的 —— **只吃普攻**。要真的做出全能吸血需要一個第二條屬性（或讓 Lifesteal 帶一個 「吃哪些 origin」的欄位），那是屬性表層級的改動，不是這一件道具的工作。

  </details>

### ✅ 黃金聖鬥衣 `godie-i00s`

- ✅ `[格擋] 50%機率抵擋 100% AP傷害` — [格擋] ← __block__
- ✅ `生命+1200` — maxHealth 對得上
- ✅ `魔力+1200` — maxMana 對得上
- ✅ `攻擊速度+120%` — as 對得上
- ✅ `總移動速度*1.2` — ms 對得上

  <details><summary>authoringNote</summary>

  [格擋]「50%機率抵擋 100% AP傷害」= block {damageTypes:[magic], chance:0.5, fraction:1}。文案把三根軸都寫死了，一個決策都不用做：機率 0.5、只擋魔法、整包擋掉（100%）。
w3x 佐證：A035◄Ansk→Assk「Hardened Skin(Naga Turtle)」降低傷害機率 (%) **50** —— owner 的 50% 與原作同數。（原作那一格是「忽視 125 點」的定量減傷，owner 改寫成整包擋掉；文案是規格，原作只是佐證機率那一半。）
owner 改寫前的匯入文案是「50%機率抵擋**125**傷害」（Ansk：機率 50 / 忽視 125），owner 保留機率、把定量 125 換成「100% AP傷害」—— 定量換成比例＋型別，機率沒有動。
比 奇門盾甲 godie-i00j 更窄（只有 magic），同一組軸一次服務兩件。
⚠️ **多來源不是「取最好的一個」了。** owner 推翻了舊註解的「取 chance×fraction 最大者、一發只抽一次骰，帶兩件格擋不會比一件強」，裁決是「獨立判斷兩次，拿第一次擋掉剩餘繼續算下一次」：每個來源各抽各的骰、各自從**剩餘**傷害再削一次。實測（20 萬發）：本件 + 奇門盾甲 一起吃一發魔法傷害擋到 **0.7508**（1−0.5²），單獨一件 0.4992 —— 兩件都是 fraction 1，先擋中的就把整發吃光、鏈到此為止。物理傷害本件完全不參與（damageTypes 只有 magic，型別不符連骰子都不抽）。規則是欄位 blockRules.stacking（出貨 independent，舊行為 best 切得回去）。
【格擋機制】四支 [格擋] 共用 sim/combat/block.ts 的 BlockGrant（item@1.block）：damageTypes / chance / fraction / lethalOnly / lethalBasis / internalCooldown **六根軸**，不是四個 bespoke 分支。（⚠️ 原本寫「五根軸」，漏掉後補的 internalCooldown —— 本件與 奇門盾甲 沒有冷卻，晨曦之光 / 殺豬刀 出貨都是 1 秒。軸數會腐爛，所以 content/blockNoteTruth.test.ts 拿 zItemBlockGrant 的鍵數對這個字。）閘點在 combat/damage.ts 的佇列裡、mitigate() 之後、護盾池之前 —— 所以「擋掉一半」擋的是玩家真的會吃的量，而格擋不吃你的護盾；applyImpact 收到的仍是**擋之前**的 impact，所以一發被完全擋下的重擊照樣有硬直與擋格火花（跟護盾吃滿一發完全同一條路）。
它**沒有**新事件：blocked=true 已經是客戶端「擋下了」的完整通道 —— combatText 的 guard 文字、hitFeel 的 sparkKind:"block"、GameApp 的 playContextualVoice(blocker,"block") 格擋語音。所以 net/eventFanout.ts 不用動。
已落地：生命+1200、魔力+1200、攻擊速度+120%、總移動速度×1.2（ms pctMult 0.2）。

  </details>

### ✅ 名刀-天狼 `godie-i00u`

- ✅ `[On-Hit] 每次攻擊造成敵方英雄現存生命 6%傷害（On-Hit）` — [On-Hit] ← onBasicAttack → damage
- ✅ `攻擊速度+60%` — as 對得上
- ✅ `普攻吸血+10%` — lifesteal 對得上

### ✅ 四魂之玉 `godie-i00z`

- ✅ `力敏智+30` — attributes str/agi/int = 30
- ✅ `魔力+300` — maxMana 對得上
- ✅ `[緩慢] 周圍敵方 總攻擊速度 減半` — [緩慢] ← __aura__
- ✅ `[緩慢] 周圍敵方 總移動速度 減半` — [緩慢] ← __aura__

  <details><summary>authoringNote</summary>

  [緩慢] 兩行「周圍敵方 總攻擊速度／總移動速度 減半」= auras[0]（affects enemy、as/ms 各 pctMult −0.5、radius 9.17 = WC3 500 ÷ 54.5；半徑文案沒給，取原作同族靈氣的值，而且會再乘 combatEnv.abilityRange）。
「力敏智+30」= attributes {str:30, agi:30, int:30}（item@1.attributes，2026-08-01 新增）。
· 力/敏/智 不是 Stat，所以它不是一條 modifier：它掛在 ModifierSource.attributes 上，由 sim/economy/itemSource.ts 轉發、sim/stats/statPipeline.ts 折進 championStatBase 的 BASE —— 跟 #260 能力屬性強化三選一走同一條通道，所以道具的 +30 力量與卡片的 +30 力量是同一個數字，而且都吃後台 combat-env 的 strToMaxHealth / agiToAttackSpeed 等係數。
· 賣掉/變身自動正確：加成隨 ModifierSource 生滅，detachSource 一移除就不見，syncItemSources 只重解 modifiers 不碰 attributes，所以變身既不會掉也不會變兩份。守衛在 packages/shared/src/sim/itemAttributes.test.ts。
已落地：魔力+300、力敏智+30、兩條減速光環。

  </details>

### ✅ 熾天使之弓 `godie-i012`

- ✅ `[On-Hit] 每次削去敵方英雄現存 MP 3%，並附帶燃燒效果每秒燃燒3%最大生命，持續2秒 (On-Hit)` — [On-Hit] ← onBasicAttack → dot/spendMana
- ✅ `攻擊速度+30%` — as 對得上

  <details><summary>authoringNote</summary>

  攻擊速度+30% = modifiers as pctAdd 0.3。
[On-Hit]「每次削去敵方英雄現存 MP 3%,並附帶燃燒效果每秒燃燒3%最大生命,持續2秒」= passive onBasicAttack(victim:"champion")底下兩個效果:
  · 削魔 = spendMana {applyTo:"target", pctCurrentMana:0.03}
  · 燃燒 = dot {resourcePct:{subject:"target",resource:"health",basis:"max",perRank:[0.03]}, intervalSec:1, durationSec:2, damageType:"magic"}
⚠️ **「敵方英雄」是 victim:"champion" 這個欄位**,不是寫死的判斷 —— 文案明說英雄,所以出貨值是 champion;要讓它也削殭屍的魔,後台把它改成 "any" 就好(那會讓這件武器在殭屍波裡強很多,所以預設選文案講的那個)。
⚠️ **削魔為什麼是第二個欄位而不是 basis**:`spendMana.pctMaxMana` 名字寫著 Max,已經出貨在內容裡;給它加一個 basis:"current" 會讓那個名字在一半的取值下變成謊話(CLAUDE.md 第一守則末段)。兩個欄位各自誠實、相加。
⚠️ **DoT 的百分比守衛架在總量上**:一次 damage 的 0.35 是一下,dot 會付 duration/interval 次。0.03 × 2 次 = 6%,上限 DOT_RESOURCE_PCT_RATIO_TOTAL_MAX = 50%(sim/effects/dynamicTerms.ts)。直接抄 HP_PCT_DAMAGE_MAX(0.35)會讓一個20 秒燒傷變成 700% 最大生命,所以刻意沒抄。
⚠️ **owner 要看的數字**:燒傷 = 目標最大生命 6%(兩跳),在 maxHealth 倍率 3 下一條血約 1,350 → 約 81 點,再乘 combat-env damageDealt(0.5)≈ 40。削魔 = 對方現存魔 **3%**,滿魔 1,000 時是 30 點,而且**每秒最多一次**。
⚠️ **owner 2026-08-01 兩處裁定,一起看**:「3% 就可以了,冷卻1秒」。
  · 5% → **3%**,而且**文案裡的那個 5% 也一起改成 3%** —— 只改資料會讓卡片承諾一個玩家拿不到的數字(legendaryClaims.test.ts 抓的正是這個)。這次文案改寫登記在 packages/shared/src/content/__fixtures__/legendary49OwnerText.json 的 _sanctionedRewrites。
  · `internalCooldown: 1`(秒)加在 hook 上。**純內容改動**:節奏閘早就在 sim/effects/hooks.ts(絕對 tick 比較),一行 sim 都沒動。改之前這件武器是「每一次普攻都削」,配 +30% 攻速對法師是硬克制;現在削魔與燒傷**兩個效果一起**受同一個 ICD 管(它們掛在同一條 hook 上),所以 2 秒的燒傷也不會再互相蓋來蓋去。
⚠️ 燒傷那一句的 3% 是**另一個 3%**(每秒燒最大生命 3%,兩跳),owner 沒有動它 —— 兩個 3% 剛好同值,改的時候要看清楚改的是哪一個(削魔在 spendMana.pctCurrentMana,燒傷在 dot.resourcePct.perRank)。
⚠️ 冷卻長度是**欄位不是政策**:拿掉 `internalCooldown` 就回到「每一下都削」;道具來源的 ICD 還會再乘後台 combat-env 的 `itemCooldown`。
燒傷凍在 apply 當下(per target),與 amountPerTick 既有語意一致,所以 effects/dotTick.ts 一行都不用改。

  </details>

### ✅ 緣一零式 `godie-i013`

- ✅ `攻擊力+38` — ad 對得上
- ✅ `[暈眩] 8%的機率增加 140點傷害並暈眩0.1秒` — [暈眩] ← applyStatus

### ✅ 天叢雲劍 `godie-i014`

- ✅ `攻擊速度+30%` — as 對得上
- ✅ `總移動速度*1.2` — ms 對得上
- ✅ `[飛昇] 移動轉變為無視碰撞的飛行形態` — [飛昇] ← __flight__

  <details><summary>authoringNote</summary>

  [飛昇] = item@1 的 flight。「無視碰撞」拆成 ignoreUnits + ignoreObstacles 兩個既有旗標。stayInsideBoundary 保持 true 是刻意的：文案說的是「無視碰撞」，不是「可以飛出競技場」，而飛出邊界會直接繞過火圈這個回合結束機制。hoverHeight 留空（沿用預設）——文案沒有給高度，不該由我發明一個。

【先前紀錄】【仍缺】[飛昇]「移動轉變為無視碰撞的飛行形態」。
· 原語存在但**道具接不到**，形狀與 至尊魔戒 godie-i004 的隱身完全一樣：zFlightGrant（content/schema/effect.ts）帶 hoverHeight / ignoreUnits / ignoreObstacles / stayInsideBoundary，而 sim/flight.ts:158 的 syncFlightGrants 是走 `sc.sources` 的，任何 ModifierSource 都可以帶它。缺的是 zItemDef 的 `flight` 欄位 + sim/economy/itemSource.ts 的轉發。
· ⚠️ 接上去的時候 `stayInsideBoundary` **一定要留在預設的 true**：「無視碰撞」如果連場地邊界也無視，決鬥判定 / teamAliveInZone / 小地圖 都會開始推理一個不在任何地方的英雄（那個預設的理由寫在 zFlightGrant 的註解裡）。
已落地：攻擊速度+30%、總移動速度×1.2。

  </details>

### ✅ 晨曦之光 `godie-i016`

- ✅ `[看穿] 看穿隱形` — [看穿] ← __vision__
- ✅ `[格擋] 30%機率 抵擋致命一擊(超過現存生命的傷害)` — [格擋] ← __block__
- ✅ `每秒回魔+8` — manaRegen 對得上
- ✅ `[重創] 敵方攻擊時吸血效果降低50%吸血回復量` — [重創] ← applyBuff

  <details><summary>authoringNote</summary>

  [看穿] = vision.trueSightRadius。文案沒有給半徑，所以取 w3x 同族技能 Atru（16-00 通靈能力）的 500 ÷ 54.5 = 9.17，跟 godie-e008 / godie-nplh 兩支既有的真視文件同值 —— 取原作同族的數字，而不是憑空挑一個。

【先前紀錄】[重創]「敵方攻擊時吸血效果降低50%吸血回復量」= onDamageTaken + damageSource:"basic" 的 applyBuff（lifesteal 減半）。細節見 git 歷史；留這一行是為了讓「這句文案曾經是什麼」查得到。

【全部落地】
· ✅ [看穿] 已補齊（2026-07-31）：item@1 加上 vision 欄位，sim/economy/itemSource.ts 轉交，sim/stealth.ts syncVisionGrants 讀得到。守衛 sim/economy/itemVisionFlight.test.ts 用**出貨文件**驗，把那一行轉交拿掉就紅。⚠️ 舊註解寫「原語存在但道具接不到、仍缺 1 項」—— 那在補上之後就是假話，而它跟本檔第一行「[看穿] = vision.trueSightRadius」直接矛盾，2026-08-01 一併更正。
· [格擋]「30%機率 抵擋致命一擊(超過現存生命的傷害)」= block {damageTypes:[physical,magic,true], chance:0.3, fraction:1, lethalOnly:true, internalCooldown:1}。
  · **三種型別都列**是刻意的：owner 在 奇門盾甲 明寫了「(真實傷害無法阻擋)」，卻沒有寫在這一句上 —— 他知道有這個豁免、也知道怎麼寫，所以這裡的沉默是「都擋」。
  · 這**不會**變成火圈的解藥：火圈燒傷在 sim/systems/FireRingSystem.ts 直接寫 `hp.hp -=`（該行自己註明 ignores armor/MR, shields），根本不走傷害佇列，所以格擋看不到它。（同一個事實 sim/effects/invulnerable.ts 檔頭 ⑤ 也記著。）
  · 「超過現存生命」的分母預設是 lethalBasis:"hpAndShields"（欄位，可改成 "hp"）：身上還有護盾時，一發打不穿護盾的傷害不是致命一擊，在那裡觸發等於替護盾擋刀。要字面讀法就把欄位改成 "hp"。
  · ✅ **內部冷卻 1 秒**（出貨 block.internalCooldown: 1）。owner 裁決逐字：「致命一擊格擋要不要內部冷卻? => 冷卻 1秒」。閘在骰子之前、只有擋中才記時間、絕對 tick，見 sim/combat/block.ts ⑥。
  · ⚠️ **舊註解作廢**（存查）：「這件沒有冷卻，是 owner 刪掉的」→ 現在有；「要放回去是新欄位，BlockGrant 沒有」→ 現在就有這根軸；「無冷卻 30% ⇒ 多撐 ≈0.43 發」→ 那式子假設每發都抽得到，1 秒 ICD 下同一秒的第二發不抽。
  · w3x 來源：A0C9◄ANss「Spell Shield」**Cool 45**；owner 把文案的「技能冷卻時間：45秒」刪掉，之後才裁定 1 秒 —— 設計值不是漏抄。
⚠️ **多來源不是「取最好的一個」了。** owner 推翻了舊註解的「取 chance×fraction 最大者、一發只抽一次骰，帶兩件格擋不會比一件強」，裁決是「獨立判斷兩次，拿第一次擋掉剩餘繼續算下一次」：每個來源各抽各的骰、各自從**剩餘**傷害再削一次。本件 + 殺豬刀 實測 **0.5103**（1−0.7²，20 萬發，**前提是兩次致命相隔 ≥1 秒**；兩件都帶 internalCooldown:1，同秒連續致命時第二件在冷卻中，實際低於 51%）。出貨的 30% 免死**只有這兩件**，另兩件 block 是 50% 非免死，湊不出「三件 0.6568」那種外推值。規則是欄位 blockRules.stacking（出貨 independent）。

  </details>

### ✅ 朗基努斯之槍 `godie-i018`

- ✅ `力量+12` — attributes str = 12
- ✅ `敏捷+12` — attributes agi = 12
- ✅ `[On-Hit] (總敏捷)% 機率性造成等同 (總力量) 之閃電傷害 (On-Hit)` — [On-Hit] ← onBasicAttack → damage

  <details><summary>authoringNote</summary>

  「力量+12 敏捷+12」= attributes {str:12, agi:12}(item@1.attributes,機制見 四魂之玉 godie-i00z 與 sim/stats/attrSources.ts)。
⚠️ **攻速加成沒有了 —— owner 2026-08-01 裁定「取消攻速加成」**。所以這份文件現在**一條 modifiers 都沒有**,而文案裡的「攻擊速度+55%」那一行也在同一次改寫裡刪掉:留著文案卻拿掉資料,三選一卡片就會承諾一個玩家永遠拿不到的數字(legendaryClaims.test.ts 正是抓這個)。這次文案改寫登記在 packages/shared/src/content/__fixtures__/legendary49OwnerText.json 的 _sanctionedRewrites。要放回去是**加回一條 modifiers {stat:"as", op:"pctAdd", value:0.55} 並把那一行文案寫回去**,不是改程式。
[On-Hit]「(總敏捷)% 機率性造成等同 (總力量) 之閃電傷害」= passive onBasicAttack,兩個軸各自落在一個新欄位上:
  · 機率 = HookDef.chanceFrom {attr:"agi", basis:"total", coeff:0.01, min:0, max:1}
  · 傷害 = Scaling.attrRatios [{attr:"str", basis:"total", coeff:1}]
「總」= basis "total"(含裝備),對應 Blizzard 的 GetHeroStatBJ(…, true);原作也用過 false(蒼月潮 07-00 的 120 敏上限),所以 basis 是欄位不是寫死。
⚠️ **機率是無界的,而我沒有偷偷夾它**。max 出貨值是 **1.0**,也就是「機率的數學上限」而不是一個設計上的削弱 —— 把 max 壓在 1.0 以下會讓文案在後期變成謊話,而竄改 owner 的文案不是我的權限。MEASURED(出貨 combat-env,AGI 基礎 20 + 成長 2.3/級 + 本槍 12):
    lv1  ≈ 32 敏 → 32%      lv10 ≈ 53 敏 → 53%
    lv15 ≈ 64 敏 → 64%      再加滿 20 層屬性強化(最多 +40)→ 90%+
  也就是說**後期接近必定觸發**。如果 owner 要一個真的上限,`max` 就是那個欄位(例如 0.5),改一個下拉、不用改程式。
⚠️ coeff 的 schema 上界是 CHANCE_PER_ATTR_MAX = 0.1,那是**打錯數字的守衛**:寫 1 而不是 0.01 = 「一點敏捷 100%」,而 clamp 會幫它藏起來(永遠觸發,diff 裡看不出來)。
⚠️ chance 與 chanceFrom **互斥**(schema 在載入時擋)——「相乘還是取代」沒有正確答案。抽籤的**次數與位置**完全沒變,所以既有內容的亂數流一個位元都沒動。
⚠️ **owner 要看的數字**:傷害 = 總力量 × 1.0。STR 基礎 20 + 成長 + 本槍 12,lv10 約 53 點,再乘 combat-env damageDealt(0.5)≈ 26 —— 配 53% 觸發率、而且**攻速加成已由 owner 取消**(所以每秒揮幾下完全由英雄自己的攻速決定),DPS 增益溫和。要更兇就調 attrRatios.coeff(原作 JASS 最大用到 9)。
damageType 選 magic(閃電),吃魔抗。

  </details>

### ✅ 死之王的長槍 `godie-i01d`

- ✅ `攻擊力額外增加 17%` — ad 對得上
- ✅ `[無視] 普通攻擊無視防禦給予傷害` — [無視] ← __damageTypeOverride__
- ✅ `[On-Hit] 普攻附加敵方現存 MP 10%傷害，並且回復敵方最大 MP 10%(On-Hit)` — [On-Hit] ← onBasicAttack → restore
- ✅ `額外 [死之王套裝] 同時裝備死之王長槍、意志、神盾，則總 AP 額外 + 100%` — 套裝加成 = item@1.sets（一套只發一次，見 sim/economy/itemSets.ts） ← __itemSet__

  <details><summary>authoringNote</summary>

  [On-Hit]「普攻附加敵方現存 MP 10%傷害，並且回復敵方最大 MP 10%」—— **後半段落地了，前半段還沒有。**
· 已做：「回復敵方最大 MP 10%」= passive[0] 的 restore manaPct 0.1。hook 的 target 省略 = "event"，onBasicAttack 的事件實體就是被你打的那個人，而 restore 是「目標自己最大值的一個比例」（WC3 SetUnitManaPercentBJ，見 sim/effects/restore.ts），所以這一行是**逐字**落地的 —— 連這件道具的笑點（「幫對方補魔就是我的攻擊方式」）都在。
· 【仍缺】「敵方現存 MP 10%傷害」—— damage 可以按受害者的**生命**比例算（hpPct，content/schema/effect.ts），但**沒有魔力的對應物**；而 zScaling.ratios 讀的是施法者的表，不是受害者的。要補需要給 damage 一個 mpPct: {basis:"max"|"current", perRank}，與 hpPct 同一個形狀、同一種上下界。這個缺口同時卡住 瑪那魔杖 godie-i020 與 熾天使之弓 godie-i012。
· 【2026-08-01 落地】[無視]「普通攻擊無視防禦給予傷害」= damageTypeOverride {scope:"basic", becomes:"true"}，與 霸王破甲槍 godie-i00f 同一個機制、同一組參數。mitigate() 在 `pkt.type === "true"` 直接回傳原值，所以「無視防禦」不是新的減傷數學，只是把封包重蓋成 true；蓋的地方在**傷害佇列**（sim/combat/damage.ts 的抽乾迴圈 → sim/combat/damageTypeOverride.ts），不是這份備註舊版本寫的 BasicAttackSystem —— 那裡蓋的話遠程普攻（走 systems/ProjectileSystem.ts）拿不到，是失敗形態 ②。
· ⚠️ 兩件事的先後：[無視] 只改**這一發普攻封包**的型別，而下面 passive 那條 restore 是一個獨立的 hook，兩者不互相影響。
· 【2026-08-01 落地】[死之王套裝] = item@1.sets，三份文件各帶一份相同的區塊；獎勵依 set id 只發**一份** `item-set:` 來源（每件各發一份 = +300%，不是 +100%）。機制與決策在 sim/economy/itemSets.ts，守衛在 sim/lichkingSet.test.ts。⚠️ 平衡註記：這件（套裝 +100% AP）與 惡夢魔王碎片 godie-i067（也是 +100% AP，且技能傷害轉真傷）是同一個 pctAdd 桶，套裝實作之後兩件同時帶 = AP ×3.0（1 + 1.0 + 1.0，見 sim/stats/statPipeline.ts 的 `(base+flat)·(1+ΣpctAdd)·Π(1+pctMult)`），而且那 3 倍 AP 打出來的技能全部無視魔抗。這是量出來的數字，不是估的；要不要封頂是 owner 的決定，這裡沒有偷偷夾。

  </details>

### ✅ 貫雷槍 `godie-i01g`

- ✅ `[緩慢] 8%的機率造成敵方緩速，移動速度 -2，持續 0.6秒` — [緩慢] ← applyBuff/applyStatus
- ✅ `[伸長] 近戰攻擊距離+4；遠戰攻擊距離+2` — [伸長] ← __modifier__
- ✅ `[重創] 敵方攻擊時吸血效果降低50%吸血回復量` — [重創] ← applyBuff/applyStatus

  <details><summary>authoringNote</summary>

  [伸長] 近戰+4 / 遠戰+2 是同一個 modifiers 陣列上的兩條 `requires` 閘（見 content/schema/item.ts 的 zGatedItemStatModifier），在裝備時由 sim/economy/itemSource.ts 解析；變身換攻擊型態會重解（三對變身跨近戰/遠程）。

[緩慢] 用出貨的 slow30 標記 + moveSpeedMult 0.7。⚠️ 描述寫的是「移動速度 -2」＝一個 FLAT 差值，而 applyStatus 只吃倍率，表達不出來。實測全 119 位英雄 baseStats.ms（p10 5.5／中位 5.9／p90 6.4），slow30 拿掉的是 1.65–1.92（中位 −1.77），111/119 落在 −2±0.5。要精準 −2 只有兩條路：(a) applyBuff {ms flat −2}，但那條完全繞過 applyStatus 的免控閘與 CC 計分（魔免也躲不掉），(b) 給 applyStatus 加一個有上下界的 moveSpeedFlat 欄位＋MovementHold 開一條 flat 通道 —— 那是共用 CC 機制的改動，會一次服務全部 7 件 [緩慢] 道具，不該塞在單件道具的工作裡。等 owner 裁決。

[重創] onDamageTaken 的事件實體是攻擊者（見 sim/combat/damage.ts:742 與 復仇之袍 godie-i02j 的前例），所以 applyBuff 直接落在他身上，lifesteal pctMult −0.5 → 吸血減半。⚠️ 真正在做事的是 **stackKey**：沒有它，每一次挨打都會 attach 一個**新的** buff source，而 statPipeline 對每一個 source 各跑一次 `pctMult *= 1 + value`（0.5^n），打五下就剩 3% 吸血 —— 那是另一個效果。⚠️ 2026-08-01 突變驗證改正（第三守則）：`maxStacks: 1` 在這裡是**惰性的**，因為 statPipeline 只讓 `Flat` / `PercentAdd` 乘 `src.stacks`，`PercentMult` 不看層數；留著是宣告意圖，不是機制。完整說明見 祕銀鎖子甲 godie-i01w 的同一段。持續 3 秒是描述沒給的數字（唯一一個），選 3 秒是為了跨得過對手兩次揮擊的間隔，讓對打時不會中途失效；要調就改這裡一個數字。

damageSource:"basic" 對應「敵方**攻擊**時」：吸血本來就只吃普攻（damage.ts `pkt.origin === "basic"`），所以不加也不會算錯，但少了它火圈灼燒與 DoT 每一跳都會重刷這個 debuff —— 那不是描述講的東西。

【2026-08-01 [重創] 統一】stackKey 由 "grievous-lance" 改成 "grievous-wounds"，與晨曦之光 godie-i016 / 雷神之鎚 godie-i01i / 祕銀鎖子甲 godie-i01w 共用同一個 key。四段文案一字不差都是「吸血效果降低50%」，所以同時帶兩件應該還是 50% 而不是 75%（pctMult 是連乘的：0.5×0.5 = 只剩 25% 吸血）。要讓它們可疊，把其中一件的 stackKey 改掉即可。

  </details>

### ✅ 雷神之鎚 `godie-i01i`

- ✅ `[On-Hit] 7%機率產生造成 100% AP 雷電範圍傷害 (On-Hit)，[緩慢] 並使範圍內部隊移動速度下降50%，持續1秒` — [On-Hit] ← onBasicAttack → applyStatus/damageArea
- ✅ `防禦+20` — armor 對得上
- ✅ `AP+130` — ap 對得上
- ✅ `[重創] 敵方攻擊時吸血效果降低50%吸血回復量` — [重創] ← applyBuff/applyStatus

  <details><summary>authoringNote</summary>

  [On-Hit]「7%機率產生造成 100% AP 雷電範圍傷害」= passive[0] 的 damageArea（chance 0.07 / ratios ap 1.0 / damageType magic）。
· includeOrigin:true —— 雷打在被你打中的那個人**身上**，所以震央本人要吃。（預設是 false，那是給泰坦九頭蛇那種「打 A 濺到 A 身後的 B」用的。）
· radius 3.5 與 maxTargets 5 是**文案沒有給的數字**，兩個都是欄位不是常數：3.5 是這一批 on-hit 範圍傷害的出貨慣例（泰坦九頭蛇 / 丈八蛇矛 / 炎龍巨弩 都是 3.5），maxTargets 5 是為了不讓一發普攻掃掉整波殭屍（省略的話預設是上界 20，見 sim/effects/spreadLimits.ts）。要調就改這裡。

[緩慢]「並使範圍內部隊移動速度下降50%，持續1秒」= passive[0] 的 applyStatus（slow40 + moveSpeedMult 0.5 = 減半，與老衲的棒子 godie-i06n 同一個寫法）。
· ⚠️ **只落在被普攻打中的那一個人身上，不是「範圍內部隊」**。applyStatus 沒有 radius，作用對象是 ctx.targets；damageArea 也沒有辦法帶一個 status payload。這是這件道具唯一打折的地方，而且是刻意寫出來而不是假裝沒有。要補的最小改動是給 damageArea 一個「命中者一併套用的 status」欄位，或給 applyStatus 一個 radius —— 後者會一次服務全部 7 件 [緩慢] 道具，是共用 CC 機制的改動，不該塞在單件道具的工作裡。

[重創]「敵方攻擊時吸血效果降低50%吸血回復量」= onDamageTaken + damageSource:"basic" 的 applyBuff（lifesteal pctMult −0.5，落在**攻擊者**身上 —— onDamageTaken 的事件實體是他，見 sim/combat/damage.ts:772）。持續 3 秒是文案沒給的唯一數字。**stackKey "grievous-wounds" 由四件 [重創] 共用**（晨曦之光 / 貫雷槍 / 雷神之鎚 / 祕銀鎖子甲），因為四段文案都是「降低50%」，兩件疊起來不該變 75%。完整理由（包含 2026-08-01 突變驗證改正的「maxStacks 其實是惰性的」那一段）寫在 祕銀鎖子甲 content/items/godie-i01w.json，不重複。

  </details>

### ✅ 天堂之劍 `godie-i01n`

- ✅ `總生命-50%` — maxHealth 對得上
- ✅ `[暴擊吸血] 6%機率造成10倍暴擊傷害，暴擊時吸血回復100%傷害` — [暴擊吸血] ← __critStrike__

  <details><summary>authoringNote</summary>

  【2026-08-01 owner 重寫，draftEligible 重新開啟】舊的關閉理由是「代價實作了、回報沒有」——原作 I01N 的招牌機制『魂藏』(AIrc ItemReincarnation，死亡時原地復活三次) 沒有實作，卻保留了 生命-500，所以抽到就是純扣血。owner 這次的新文案**整段拿掉了復活**。

『總生命-50%』= modifiers[0] (maxHealth pctAdd -0.5)。

『[暴擊吸血] 6%機率造成10倍暴擊傷害，暴擊時吸血回復100%傷害』= **critStrike**(sim/combat/critStrike.ts 的 CritStrikeGrant)。
· ⚠️ 它**取代**了 2026-08-01 之前的兩條 modifier（critChance flat 0.06 + critDamage flat 8.25，1.75+8.25=10.0）。那個寫法有兩個修不掉的缺陷：(a) critDamage 是聚合屬性，+8.25 之後這位英雄**每一次**暴擊都變 10 倍（含他自己天生的、三選一給的、別件裝備給的），而文案綁的是「6% 的那一次」；(b)『暴擊時吸血回復 100% 傷害』根本寫不出來 —— Stat.Lifesteal 是無條件吸血而且被夾在 [0, 0.8]。兩者**不可並存**（一起寫 = 12% 暴擊率，一半還是舊語意），content/legendaryCritStrike.test.ts 釘死這一點。
· 決策點 → 欄位：`empowers` = ownProcOnly（預設，出貨值）/ everyCrit。預設選前者因為它嚴格較弱 —— 一個已經堆到 40% 暴擊的英雄不會因為撿到這把劍就把 40% 全部變成 10 倍。owner 想要後者在後台改一個下拉即可。
· 決策點 → 欄位：`lifestealMode` = replace（預設，出貨值）/ add。replace 是文案的字面讀法，而且嚴格小於 add。
· 兩個倍率同時成立（自己的暴擊 + 這個 proc）時**取 max 不相乘**。
  · ⚠️ **2026-08-01 更正：這條規則的理由不能再引用 combat/block.ts。** 舊文寫「沿用 block.ts ⑤ 已經論證過的『取 max 不相加』」，但 owner 當天推翻了格擋的多來源規則，block.ts ⑤ 現在論證的是**鏈式獨立判定**（兩件 30% = 51%），不再是取 max。暴擊這裡**維持取 max**是本件自己的選擇（10 倍與一般暴擊相乘會直接失控），理由寫在這裡，不是別處。
· 近戰與遠程**兩條路都接了**：critLifesteal 跟著 DamagePacket（近戰）與 ProjectileComp（遠程）走。只接近戰的話遠程英雄拿到的是一把只有 10 倍傷害、完全不吸血的劍 —— 這正是 damageTypeOverride.ts 檔頭記著的「普攻有兩個 push 站點」那個陷阱。
· 不需要新事件：crit 已經在 basicAttack / basicAttackHit / damage 三個事件上，吸血走的是healTarget(origin:"lifesteal") → heal，而 heal 早就在 net/eventFanout.ts 的 fanned-out 清單裡。

⚠️ **請 owner 看一下這個數字**：10 倍普攻 + 100% 吸血 = 一次 proc 幾乎是滿血回復。以 AD 100 的英雄計，一發 proc 打 1000、吸 1000（扣掉護甲/魔抗與護盾之後的實際掉血量），而這把劍同時把他的總生命砍半。6% × 攻速 1.5 ≈ 每 11 秒一次。這是文案直譯的結果，沒有偷偷夾上限；要調的是 critStrike.damageMult / lifestealFraction 兩個欄位。

  </details>

### ✅ 仙后座 `godie-i01s`

- ✅ `[迴避] 25%物理傷害迴避，迴避成功時瞬間移動 (前進一小段距離)` — [迴避] ← __modifier__
- ✅ `最大魔力+100%` — maxMana 對得上
- ✅ `每秒回魔+25` — manaRegen 對得上

  <details><summary>authoringNote</summary>

  【2026-08-01 owner 重寫，draftEligible 重新開啟】舊的關閉理由是「完全沒有 payload」——modifiers/passive/auras 三個都空，抽到什麼都拿不到。owner 新文案給了實際數值：最大魔力+100% (maxMana pctAdd 1.0)、每秒回魔+25 (manaRegen flat 25)、以及 25%物理傷害迴避 —— 最後這項用既有的 Stat.Evasion 表達 (evasion flat 0.25；ITEM_MODIFIER_LIMITS 帶 0..1，STAT_CLAMPS 再折到 [0,0.8]；判定在 sim/combat/evasion.ts)。空卡問題解決，關閉的理由消失。【仍缺】『迴避成功時瞬間移動 (前進一小段距離)』——迴避本身有了，但「迴避成功」目前不是一個掛鉤事件，item@1 也還存不下主動/觸發式位移 (見 #56)。要補需要一個 onEvade 事件 + 一個能掛在 item 上的 dash 效果。

  </details>

### ✅ 螺旋劍 `godie-i01v`

- ✅ `[On-Hit] 每次普通攻擊皆會施展螺旋擊，直線範圍造成魔力5%傷害(On-Hit)，同時消耗1%魔力` — [On-Hit] ← onBasicAttack → damageLine/spendMana
- ✅ `攻擊速度+100%` — as 對得上
- ✅ `移動速度+2` — ms 對得上

  <details><summary>authoringNote</summary>

  [On-Hit]「每次普通攻擊皆會施展螺旋擊，直線範圍造成魔力5%傷害(On-Hit)，同時消耗1%魔力」= passive[0]。
· 「直線範圍」= damageLine（sim/effects/damageLine.ts）。出貨前例是 18-00 薔薇荊棘之刃（content/abilities/godie-nsjs.passive.json）：同樣是 onBasicAttack 拉一條「我 → 被打的那個人」方向的走廊。
· 「消耗1%魔力」= spendMana pctMaxMana 0.01，而且**先扣再打**（effects 陣列的順序就是執行順序）。hook 的 condition「自身法力 ≥ 1%」是照 20-01 風王結界 的模型寫的：spendMana 自己不做門檻判斷（sim/effects/spendMana.ts 的檔頭講了三個理由），所以少了這個 condition，空魔的英雄會**免費**拿到螺旋擊。
· 「魔力5%傷害」= ratios maxMana 0.05。⚠️ zScaling 讀的是施法者的**最終屬性表**，也就是 maxMana（最大魔力），不是現存魔力 —— 文案只寫「魔力」沒有寫「現存」，所以這裡取讀得到的那一個並寫在這裡，不是無聲的解讀。
· length 3.6 / width 1.2 / maxTargets 5 / includeOrigin false 是**文案沒有給的**，四個都直接沿用薔薇荊棘之刃的房規（3 個身位長 × 1 個身位寬；被普攻打中的那個人不再吃一次，因為他已經領過普攻本身了）。四個都是欄位。

  </details>

### ✅ 祕銀鎖子甲 `godie-i01w`

- ✅ `防禦+40` — armor 對得上
- ✅ `魔抗+40%` — mr 對得上
- ✅ `[重創] 敵方攻擊時吸血效果降低50%吸血回復量` — [重創] ← applyBuff

  <details><summary>authoringNote</summary>

  [重創]「敵方攻擊時吸血效果降低50%吸血回復量」= onDamageTaken 的 applyBuff。
· onDamageTaken 的事件實體是**攻擊者**（sim/combat/damage.ts:772 的 fireHooks(world, pkt.target, "onDamageTaken", pkt.source)），hook 的 target 省略 = "event"，所以 buff 直接落在打你的人身上；出貨前例是復仇之袍 content/items/godie-i02j.json。
· lifesteal pctMult −0.5 → 吸血減半。吸血在 damage.ts:675 讀 srcStats.final[Stat.Lifesteal]，所以不需要任何新機制。
· damageSource:"basic" 對應「敵方**攻擊**時」。吸血本來就只吃普攻，不加也不會算錯，但少了它火圈灼燒與 DoT 的每一跳都會重刷這個 debuff —— 那不是描述講的東西。
· ⚠️ **真正在做事的是 stackKey，不是 maxStacks** —— 這一段是 2026-08-01 突變驗證改正的（CLAUDE.md 第三守則：註解會說謊，去驗證）。
  (a) `stackKey` 是必要的：沒有它，每挨一下就 attach 一個**新的** ModifierSource，而 sim/stats/statPipeline.ts 對每一個 source 各跑一次 `pctMult *= 1 + m.value` —— 五下就是 0.5^5，只剩 3% 吸血，那是另一個效果。（突變 M4′ 實測：拿掉 stackKey，「連打五下」那條守衛變紅。）
  (b) `maxStacks: 1` **對這個 buff 目前是惰性的**。statPipeline 只有 `Flat` 與 `PercentAdd` 會乘 `src.stacks`；`PercentMult` 那一支是 `pctMult *= 1 + m.value`，完全不看層數。所以層數疊到 5，吸血一樣只減半。（突變 M4 實測：拿掉 maxStacks，守衛**不會**紅 —— 它是一條「刪掉還是綠」的假守衛，所以這裡本來寫的「沒有它就 0.5^n」是錯的。）留著它是宣告意圖 + 保險：哪天這個 buff 加上 flat/pctAdd 欄位，這道上限就會開始咬人。
  (c) 四件 [重創] 道具**共用同一個 key**（晨曦之光 / 貫雷槍 / 雷神之鎚 / 祕銀鎖子甲），因為四段文案一字不差都是「降低50%」：兩件疊起來應該還是 50%，不是 75%（實測兩個不同 key = 兩個 source = 只剩 25% 吸血）。要改成可疊，把其中一件的 stackKey 改掉即可 —— 那正是這個欄位存在的意義。
· 持續 3 秒是**描述沒有給的唯一一個數字**。選 3 秒是為了跨得過對手兩次揮擊的間隔，讓對打時不會中途失效；它是一個欄位，要調就改這裡。

「魔抗+40%」的 mr 66.7 是換算不是筆誤：引擎的魔法減傷是 100/(100+mr)，所以 mr = 100·r/(1−r)，r=0.40 → 66.67。同一條換算的說明見 月牙魔杖 godie-i06e 與 消失的密室 godie-i02d 的 authoringNote。

  </details>

### ✅ 瑪那魔杖 `godie-i020`

- ✅ `AP+80` — ap 對得上
- ✅ `魔力+520` — maxMana 對得上
- ✅ `每秒魔力回復速度+12` — manaRegen 對得上
- ✅ `[On-Hit] 普攻附加敵方現存 MP 5%傷害，並且回復己方 MP 該傷害量(On-Hit)` — [On-Hit] ← onBasicAttack → damage

  <details><summary>authoringNote</summary>

  AP+80 / 魔力+520 / 每秒魔力回復+12 = modifiers。
[On-Hit]「普攻附加敵方現存 MP 5%傷害,並且回復己方 MP 該傷害量」= passive onBasicAttack → damage 的兩個欄位:
  · resourcePct {subject:"target", resource:"mana", basis:"current", perRank:[0.05]}
  · refund {resource:"mana", basis:"hpLost", pct:1}
⚠️ **「該傷害量」讀的是哪一個數字**:refund 不是在 effects 裡算的,它騎在`DamagePacket.refund` 上,由 combat/damage.ts 的排空迴圈在**全域倍率 → 護甲/魔抗 → 格擋 → 護盾**都算完之後付款。basis 預設 "hpLost" = 真的從血條掉下來那一格,也就是玩家看到的浮動數字 —— 所以「回復該傷害量」在畫面上字面為真。在效果端算會拿到「打算打多少」,永遠比畫面大(#125 的形態)。
⚠️ **owner 要看的數字**:敵人滿魔 1,000 → 意圖 50 點 → 乘上 combat-env 的 damageDealt(出貨 0.5)= 25 → 再過魔抗。所以實際回魔約 20 上下,不是 50。要它更有感就調 perRank,或把 refund.basis 改成 "mitigated"(護盾吃掉的也算)。
⚠️ 護盾全吃掉的一下回 0 魔,那是誠實的(那一下沒有造成傷害)。要改成「護盾不影響回收」把 basis 改 "mitigated"。
共用同一個 resourcePct 讀數的還有 熾天使之弓 godie-i012(它是**削魔**不是傷害,走 spendMana.pctCurrentMana)。

  </details>

### ✅ 光魔杖 `godie-i027`

- ✅ `[On-Hit] 普攻附加消耗自己現存 MP 5%並造成傷害(On-Hit)` — [On-Hit] ← onBasicAttack → damage/spendMana
- ✅ `AP+ (目前MP的 5%)` — AP 隨**現存** MP 浮動 = StatModifier.fromResource（見 sim/stats/resourceStats.ts） ← __resourceModifier__
- ✅ `每秒魔力回復+18` — manaRegen 對得上

  <details><summary>authoringNote</summary>

  [On-Hit]「普攻附加消耗自己現存 MP 5%並造成傷害」= passive[0]，用的是 spendMana.bankAs → damage.bankedBonus 這一對原語（sim/effects/spendMana.ts + sim/effects/effectCommon.ts 的 bankedAddend）—— 它本來就是為「效果隨消耗的 MP 放大」而做的（揍敵客 13-002）。
· 「並造成傷害」文案**沒有給數字**。coeff 1 = 燒掉多少魔力就打多少傷害，是這句話唯一自洽的讀法；它是一個欄位。max 400 是**保險絲**不是平衡值：法力池會隨等級與裝備長大（惡夢魔王碎片一件就是 +2200），一條沒有天花板的線性項在後期就是一擊必殺。上界 BANKED_BONUS_MAX 是 1200，400 離它還很遠。
· bankAs.durationSec 1 —— 存款與領款在**同一個 tick、同一個 effects 陣列**裡，1 秒只是不讓一筆沒被領走的存款外溢到下一次揮擊。
· condition「自身法力 ≥ 5%」的理由同螺旋劍：spendMana 會把扣款夾到池子剩下的量，而 bankAs 記的是**實扣量**，所以沒有這個 condition，空魔的英雄會打出 0 傷害的空包彈（而不是不觸發）。
· 新增的標記文件：content/status-effects/light-wand-banked.json。
· ⚠️ pctMaxMana 是**最大**魔力的 5%，文案寫的是「現存 MP 5%」。spendMana 沒有 pctCurrentMana 這個欄位，而 zScaling 也讀不到現存魔力。差異：滿魔時兩者相同，半魔時實扣是文案的兩倍（但永遠不會超過池子裡剩下的量）。要精準需要給 spendMana 一個 basis: "max"|"current" 欄位。

「AP+ (目前MP的 5%)」= modifiers[0]:`ModOp.PercentOf` + **`fromResource: "mp"`**(stat ap / value 0.05)—— 讀的是**當下**的 hp.mana,不是 maxMana。
· 這是全遊戲第一條**會浮動**的 modifier。`statPipeline` 的第二趟本來只讀「另一條屬性的 pass-1 值」,現在多一個來源域;什麼時候重算由 `sim/stats/resourceStats.ts` 的 `resourceStatSystem` 決定 ——它每 tick 掃一次,但**只有讀數真的變了**才把那個單位打成 dirty,所以滿魔站著不動的英雄一次都不重算,而場上沒有人帶這件裝備時它一個位元都不改(既有 replay/digest 逐位元不變)。
· ⚠️ 「目前 vs 最大」是一個**欄位**不是一個分支:`fromResource: "mp"` ↔ `from: "maxMana"` 同一條 modifier 換一個鍵就切得過去,owner 在後台改一個下拉即可。
· ⚠️ 商店的即時預覽 (`ui/panels/statPreview.ts`) 是在 scratch world 裡 spawn 一個**滿魔**的英雄,所以沒有餵 `manaPct` 的呼叫端看到的是這條加成的**上限值**。那兩個欄位已經加上去了(`manaPct`/`hpPct`,省略 = 1 = 滿資源);把現場魔量接進商店面板的 memo 還沒做,原因與代價寫在 statPreview.ts 的檔頭。
· ⚠️ **仍然不精準的一點**:上面 passive 的 `spendMana.pctMaxMana` 依舊是**最大**魔力的 5%,文案那一半寫的是「現存 MP 5%」。那一半要精準需要 `spendMana` 一個 `basis: "max"|"current"` 欄位,跟這裡的 `fromResource` 是同一種修法,但它是另一條效能行,不在這次的範圍。

  </details>

### ✅ 消失的密室 `godie-i02d`

- ✅ `防禦+100` — armor 對得上
- ✅ `魔抗+66.7%` — mr 對得上
- ✅ `[神速] 攻擊速度+100%，上限提升至10 (預設上限為4)` — [神速] ← __modifier__
- ✅ `移動速度+4` — ms 對得上
- ✅ `[暈眩] 4%的機率普攻造成暈眩 0.1秒` — [暈眩] ← applyStatus

  <details><summary>authoringNote</summary>

  【2026-08-01 owner 裁定「魔抗的 % 是減傷比例」】引擎的魔法減傷是 100/(100+mr)，所以 mr = 100·r/(1-r)。r=1.00（100% 減傷）需要 mr=∞，用 mr 永遠表達不出來 —— 字面上的『魔抗+100%』等於完全魔法免疫，owner 選擇不走真免疫路徑，改成一個讀得出來的數字。採用 mr 200（ITEM_MODIFIER_LIMITS 的上界，不需要動那道 mis-parse 護欄）= 66.7% 減傷，文案同步改成 66.7% 讓描述與資料一致（這一批的核心原則就是描述不可以說謊）。註：月牙魔杖這個值正好等於本批之前出貨的 mr 200，w3x 來源 AIsr『降低的傷害 0.5』則是 50%，見 docs/content/reconciliation/items.md。

  </details>

### ✅ 狂暴軒轅劍 `godie-i02e`

- ✅ `攻擊速度+200%` — as 對得上
- ✅ `[暈眩] 10%的機率普攻造成暈眩 0.1秒` — [暈眩] ← applyStatus

### ✅ 天生牙 `godie-i031`

- ✅ `[復活] 殺死任一個敵方英雄單位，將復活我方所有英雄` — [復活] ← revive
- ✅ `[回復] 殺死任一個敵方單位，回復我們全部英雄 1%生命` — [回復] ← restore
- ✅ `每秒生命回復+20` — healthRegen 對得上

  <details><summary>authoringNote</summary>

  【已落地 2026-08-01】三行全到齊：每秒生命回復+20（modifier）、[回復]、[復活]。
· [回復]「殺死任一個敵方單位，回復我們全部英雄 1%生命」= `onKill` + `victim:"any"` + **`target:"allies"`(新)** + `restore healthPct 0.01`。
· [復活]「殺死任一個敵方英雄單位，將復活我方所有英雄」= 同一個作用域 + `victim:"champion"` + **`revive` effect(新)**。
· 兩條的差別**只有 `victim` 一個欄位** —— 英雄 vs 單位是設計本身，不是兩條程式分支。
· `revive` 沒有自己重寫一套復活：站起來的狀態合約是 `sim/revive.ts::reviveChampionAt`，也就是復活圈(#84/#206)完成時走的同一個函式。位置=自己的屍體，HP/MP=`arena-rules` 的 `reviveCircles.reviveHpPctMax/ManaPctMax`(出貨 0.5/0.5)，火圈全關時一律拒絕(#195)。
· **一回合一次是一個欄位，出貨關著**：`revive.teamCharge` 預設 `"ignore"`(owner 文案沒有寫上限)，填 `"requireAndSpend"` 就與復活圈共用同一顆每隊每回合的復活額度。另一個現成的節流是 hook 自己的 `internalCooldown`。
⚠️ 平衡數字留給 owner 看（**量到的**，不是猜的）：#84 的復活圈基準資料（docs/todo/revive-circles.md，12 場 12-bot 實跑 = 96 回合 / 160 場對決 / 566 次死亡）換算成 **每場對決 3.54 次英雄死亡**，其中一隊平均拿到約 1.8 個人頭，再分給隊上三個人 —— 也就是持有者本人一回合大約觸發 **[復活] 0.6 次**（尾巴很長：連殺時一回合兩三次是正常的）。
⚠️ 那份資料是 #215 肉鴿殭屍波**之前**量的。對 [復活] 沒有影響（它只吃英雄擊殺），但 [回復] 吃任何單位，殭屍波之下它會變成幾乎整場常駐的 1%/擊殺 團隊回血 —— 這一行才是真正被小怪波放大的那一條，值得 owner 先看。
要收，改上面那兩個欄位其中一個就好，不用改程式。

  </details>

### ✅ 幻之匕首 `godie-i039`

- ✅ `[On-Hit] 3%機率造成敵方 20%生命傷害(On-Hit)` — [On-Hit] ← onBasicAttack → damage
- ✅ `[閃避] 閃避 + 10%` — [閃避] ← __modifier__

### ✅ 甘豆腐之袍 `godie-i03f`

- ✅ `MP + 600` — maxMana 對得上
- ✅ `每秒魔力回復速度+4` — manaRegen 對得上
- ✅ `[疊層] 每殺死一名英雄可以額外獲得 10點智慧，上限 160` — [疊層] ← grantAttribute

  <details><summary>authoringNote</summary>

  【已落地 2026-08-01】三行全到齊：MP+600、每秒魔力回復+4、[疊層]。
· [疊層]「每殺死一名英雄可以額外獲得 10點智慧，上限 160」= `onKill` + `victim:"champion"` + `target:"self"` + `grantAttribute {attr:"int", amount:10, store:"source", maxSourceTotal:160}` = 最多 16 層。
· **`store:"source"` 是新的那一半**，而且它就是「賣掉之後還在不在」這個問題的答案：點數記在這件袍子的 `ModifierSource.attrEarned` 上，不是 `ChampionComp.attrBonus`，所以 `detachSource`(賣掉/退貨)會把 160 點一起帶走 —— 不是被測出來的，是**沒有地方可以留下**。
· **`maxSourceTotal` 不是 `maxAttribute`**：後者封的是英雄那條三圍的絕對值(含等級成長)，掛在一件智慧裝上會在高等法師身上直接把第一層就擋掉。這一條只數這件袍子自己發過多少。超過上限的那一發是**夾到剛好 160**，不是整發拒絕。
· 死亡不清層、跨回合不清層 —— **這是量出來的，不是選的**：`MatchController.enterCombat` 只是把座位就地復活重置，英雄實體與它的 item source 從頭到尾是同一個，而 `attachItemSource` 只在買/退貨/三選一發放時跑。要「每回合歸零」得先有一個回合邊界的清除點，目前沒有。
⚠️ 數字留給 owner 看：滿層 160 智慧。以出貨的 `intToAp` 係數換算，這一件在滿層時給的 AP 比它自己那條 MP+600 有感得多，而 16 個英雄擊殺大約是三到四個回合的量。

  </details>

### ✅ 天地崩裂魔杖 `godie-i03h`

- ✅ `AP + 87` — ap 對得上
- ✅ `總AP + 10%` — ap 對得上
- ✅ `[暈眩] 施展技能的時候有 5%的機率招喚隕石流星雨，造成範圍 100% AP傷害及 2秒暈眩` — [暈眩] ← applyStatus

  <details><summary>authoringNote</summary>

  [暈眩]「施展技能的時候有 5%的機率招喚隕石流星雨，造成範圍 100% AP傷害及 2秒暈眩」= passive[0]。
· 「施展技能的時候」= on:"onAbilityCast"（abilities/abilitySystem.ts:326 與 CastResolveSystem.ts:92 都會發），「5%的機率」= chance 0.05，「100% AP」= ratios ap 1.0，「2秒暈眩」= applyStatus burnstun duration 2 stun:true（burnstun 的文案就是「被火風暴擊暈」，正好是隕石）。
· radius 4.0 / maxTargets 6 是**文案沒有給的數字**，兩個都是欄位。4.0 取自同批的死之王的神盾 godie-i061 焚身光環（也是「範圍」沒給數字的那一種），maxTargets 6 與月牙魔杖 godie-i06e 的流星同級。damageArea **不吃** combatEnv.abilityRange（見 sim/effects/effect.ts），所以 4.0 就是場上的 4.0。
· ⚠️ 一個誠實的限制：隕石的圓心是 areaCentre()（sim/effects/damageArea.ts）的第一順位 = 這次施法的第一個目標；**自我指向的技能沒有目標**，那時圓心退回施法者自己（傷害照樣打得到周圍敵人），但 applyStatus 因為 ctx.targets 是空的而**不會暈到任何人**。也就是說對純自 buff 型的技能，這張卡只有傷害沒有暈。要補需要 damageArea 能帶 status payload，與雷神之鎚 godie-i01i 記的是同一個缺口。

  </details>

### ✅ 反射之盾 `godie-i03m`

- ✅ `[反彈] 反彈普通攻擊傷害 200%` — [反彈] ← damage

  <details><summary>authoringNote</summary>

  w3x 出處:item I03M,abilities = A0C6 + AId5。A0C6 的 base 是 ANth(荊棘光環),data.1.1 = 1.0,物件編輯器後綴寫 (100%);AId5 是 +5 護甲。原作文案是「近戰傷害反彈150%」。

owner 2026-08-01 改寫的文案是 GGD 的規格,三處刻意與原作不同,不是漏做:(1) 200% 而不是 150%;(2) 沒有護甲 +5,所以 modifiers 是空的;(3) 沒有「近戰」限制 —— 而且那個限制目前也表達不出來:`requires` 判的是**持有者**的攻擊型態,不是**攻擊者**的。

實作:onDamageTaken + damageSource:"basic" + damage.incomingPct。basis 留空 = "mitigated"(護甲/魔抗之後、護盾之前);maxChainDepth 留空 = 0 = 反彈不會再被反彈。applyGlobalDamageMult 留空 = false = 反彈**不**再吃一次 combatEnv.damageDealt(三個讀數已經在倍率之後了,再乘一次「200%」就會變成 200%×k —— 2026-08-01 修);whenTooLate 留空 = "drop" = 一發塞不進這個 tick 剩餘排空輪數的反彈不排進佇列。四個預設都寫在 sim/effects/effect.ts 的 incomingPct 說明裡。守衛見 packages/shared/src/sim/effects/incomingReflect.test.ts。

  </details>

### ✅ 冰晶虎魄 - 改 `godie-i04d`

- ✅ `[On-Hit] 普通攻擊附加冰凍效果，造成緩速 30%，持續0.6秒(On-Hit)` — [On-Hit] ← onBasicAttack → applyStatus/damageArea
- ✅ `[緩慢] 10%機率寒冰爆，範圍 300點傷害並緩速3秒` — [緩慢] ← applyStatus

  <details><summary>authoringNote</summary>

  [On-Hit]「普通攻擊附加冰凍效果，造成緩速 30%，持續0.6秒」= passive[0]（slow30 + moveSpeedMult 0.7 = −30%）。

[緩慢]「10%機率寒冰爆，範圍 300點傷害並緩速3秒」= passive[1]。
· chance 0.1 / amount.flat 300 / duration 3 都是文案上的數字，一個都沒有改。
· 三個**文案沒有給**的值，三個都是欄位：
  (a) damageType magic —— 「300點傷害」沒有講屬性。寒冰爆是元素爆炸，而且這 300 完全不吃攻擊力，所以走魔法而不是物理；要改就改這一個字。
  (b) radius 3.5 / maxTargets 5 —— 同批 on-hit 範圍傷害的出貨慣例（泰坦九頭蛇 / 丈八蛇矛 / 炎龍巨弩）。
  (c) 「緩速3秒」沒有給**幅度**，這裡沿用這件道具自己第一行講的 30%（slow30 / 0.7），而不是憑空挑一個數字 —— 同一份文件裡已經有答案的時候，那個答案就是最好的來源。
· ⚠️ 與雷神之鎚 godie-i01i 同一個缺口：緩速只落在被普攻打中的那一個人身上，不是整個爆炸範圍（applyStatus 沒有 radius，damageArea 帶不了 status）。

  </details>

### ✅ 死之王的意志 `godie-i060`

- ✅ `[斬殺] 可直接斬殺生命低於 3%的敵方單位` — [斬殺] ← damage
- ✅ `[緩慢] 周圍敵方 總移動速度 減半` — [緩慢] ← __aura__
- ✅ `額外 [死之王套裝] 同時裝備死之王長槍、意志、神盾，則總 AP 額外 + 100%` — 套裝加成 = item@1.sets（一套只發一次，見 sim/economy/itemSets.ts） ← __itemSet__

  <details><summary>authoringNote</summary>

  [斬殺]「可直接斬殺生命低於 3%的敵方單位」= passive[0]，不需要任何新的 effect kind。
· 「生命低於 3%」= condition {subject:"target", stat:"hp", mode:"percent", op:"<", value:0.03}（sim/content/condition.ts；「低於」是嚴格小於，與鍊金術之盾 godie-i06q 的 5% 寫法一致）。
· 「直接斬殺」= 目標**最大生命 35%** 的真實傷害。對一個已經低於 3% 最大生命的身體，那是十倍以上的致死量；0.35 是 HP_PCT_DAMAGE_MAX（content/schema/effect.ts）的上界，也就是這個原語能給的最大保證。
· ⚠️ 觸發事件選 onBasicAttack 而不是 onDamageDealt，是一個**決策**，理由是終止性：onDamageDealt 會被斬殺自己打出的那一發再次觸發（damage.ts:771），而 combatResolveSystem 的「死了就丟包」守衛是 `!hp.alive`，而 alive 要等 DeathSystem（slot 9）才翻，所以同一 tick 內會多跑幾輪空轉。onBasicAttack 完全沒有這條回路，而且與出貨的 幻之匕首（godie-i039，「3%機率造成敵方 20%生命傷害」）同一個事件。`on` 本身就是後台欄位：想讓技能傷害也能斬殺，把它改成 onDamageDealt 即可。
· 【2026-08-01 落地】[死之王套裝]「同時裝備死之王長槍、意志、神盾，則總 AP 額外 + 100%」= 三份文件各自帶一份**一模一樣**的 sets 區塊（item@1.sets，pieces 三件、requiredPieces 省略 = 全部）。獎勵不是掛在每一件上，而是 sim/economy/itemSets.ts 依 set id 掛**一個** `item-set:` 來源 —— 每件各掛一份就會變成 pctAdd 3.0（+300%）。重算點在 economy/itemSource.ts 的 attachItemSource / detachItemSource，所以買 / 賣 / 反悔 / 三選一 / 商店預覽全都會重跑，不必各自記得。守衛：sim/lichkingSet.test.ts（出貨文件）與 sim/economy/itemSets.test.ts（機制）。
· ⚠️ 這裡原本記的補法（在 modifier entry 上加 requiresItems 閘，再讓 shop.ts 的三個 attachSource 呼叫點各自重跑一次）**沒有採用**：那個形狀要在四個呼叫點各記得一次，而漏掉一個正是它自己預告的「買齊會亮、抽到不會亮」。改成把重算收進 attach/detach 這一道**唯一的縫**，呼叫點一個都不必改。

  </details>

### ✅ 死之王的神盾 `godie-i061`

- ✅ `[焚身] 每秒造成周圍範圍燃燒 10% AP 傷害` — [焚身] ← damageArea
- ✅ `[腐蝕] 周圍敵方單位防禦 -30` — [腐蝕] ← __aura__
- ✅ `額外 [死之王套裝] 同時裝備死之王長槍、意志、神盾，則總 AP 額外 + 100%` — 套裝加成 = item@1.sets（一套只發一次，見 sim/economy/itemSets.ts） ← __itemSet__

  <details><summary>authoringNote</summary>

  【2026-08-01 落地】[死之王套裝]「同時裝備死之王長槍、意志、神盾，則總 AP 額外 + 100%」= 三份文件各自帶一份**一模一樣**的 sets 區塊（item@1.sets，pieces 三件、requiredPieces 省略 = 全部）。獎勵不是掛在每一件上，而是 sim/economy/itemSets.ts 依 set id 掛**一個** `item-set:` 來源 —— 每件各掛一份就會變成 pctAdd 3.0（+300%）。重算點在 economy/itemSource.ts 的 attachItemSource / detachItemSource，所以買 / 賣 / 反悔 / 三選一 / 商店預覽全都會重跑，不必各自記得。守衛：sim/lichkingSet.test.ts（出貨文件）與 sim/economy/itemSets.test.ts（機制）。

  </details>

### ✅ 惡夢魔王碎片 `godie-i067`

- ✅ `魔力 + 2200` — maxMana 對得上
- ✅ `魔力回復速度+50` — manaRegen 對得上
- ✅ `總 AP 額外 + 100%` — ap 對得上
- ✅ `[真實傷害] 所有裝備者技能傷害都轉為真實傷害` — [真實傷害] ← __damageTypeOverride__

  <details><summary>authoringNote</summary>

  【2026-08-01 落地】[真實傷害]「所有裝備者技能傷害都轉為真實傷害」= damageTypeOverride {scope:"ability", becomes:"true", impactType:"original"}。
· scope 是 "ability"（origin 以 `ability:` 開頭）而**不是** "all"，因為 owner 的文案講的是「技能傷害」。"all" 會額外把道具觸發（`hook:`）、小怪與守衛塔封包一起轉成真傷 —— 那是另一件道具。這個差異就是 scope 之所以是一個欄位的理由（與 霸王破甲槍/死之王的長槍 的 "basic" 是同一個機制、不同參數）。
· ⚠️【2026-08-01 owner 裁決 · 更正上一版】「技能留下的延燒，算不算『技能傷害』？ => yes，除非特別講真傷」。所以**技能留下的延燒/中毒每一跳也算在這件道具裡**，會被轉成真傷 —— 不是新行為，是本來就成立的資料流：`effects/dot.ts` 把 `ctx.origin`（= `ability:<id>`）寫進 `DotInstance.origin`，`effects/dotTick.ts` 再原封不動寫進封包。這份 note 上一版寫「"all" 會把 DoT 跳…一起轉成真傷」，暗示 "ability" 不含 DoT —— **那是假的**。「除非特別講真傷」自動成立：已寫成 `damageType:"true"` 的燒傷再被轉成 "true" 是恆等式。⚠️ `hook:` 授權的燒傷（道具 proc 掛的）帶 `hook:<srcId>`，不在 "ability" 裡 —— 落差在「誰授權的」，不在「它是不是 DoT」。
· impactType:"original"（= 省略時的預設，這裡**明寫**因為這是唯一被它改到的一件）：`applyImpact` 用 `type !== "magic"` 當擊倒的閘，而轉換發生在那一行之前。不擋的話這件道具會讓持有者的**每一發法術都多一個它本來沒有的擊倒** —— owner 文案沒提，也沒有人選過。"converted" 是另一側（轉真傷順便附贈擊倒）。兩件 "basic" 武器省略它：普攻本來就是 physical，對它們是嚴格 no-op。
· 相對於 霸王破甲槍 的差別很大：普攻本來就是物理，轉真傷跳過的是護甲；技能可以是魔法，轉真傷跳過的是**魔抗**，而且讓一個 `absorbs:"magic"` 的護盾再也吃不到它（sim/combat/damage.ts 的 eligibleShields）。
· 省略 applyAt = 預設 "afterGates"：魔法免疫（47-04 天翔龍閃、97-04 火產靈神、99-04、黃昏公主的血脈）**仍然擋得住**這件道具轉出來的法術。要讓它連免疫一起穿透就寫 applyAt:"beforeGates" —— 那是 owner 的決定。
· ⚠️ 平衡註記（量出來的，不是估的）：這件同時給「總 AP 額外 + 100%」。pctAdd 是同一個桶相加（sim/stats/statPipeline.ts：`(base+flat)·(1+ΣpctAdd)·Π(1+pctMult)`），所以與 死之王套裝 的另一個 +100% AP 同時成立時是 **AP ×3.0**（1+1.0+1.0），不是 ×4；而那 3 倍 AP 打出來的技能傷害全部無視魔抗。**沒有夾**（要不要封頂是 owner 的決定，偷偷夾會讓卡片說謊）。
守衛：packages/shared/src/sim/combat/damageTypeOverride.test.ts ＋ damageTypeOverride.shipped.test.ts（含 ap ×3.0 這個數字的釘死、真的跑一支技能授權的 DoT 過 dotTickSystem、以及「轉換不送擊倒」）。

【2026-08-01】owner 文案原本寫「魔力回復速度+64」，但 ITEM_MODIFIER_LIMITS.manaRegen 的上界是 50（schema/common.ts），64 會讓這份文件載不進來。owner 同意夾在 50，文案同步改成 50 —— 只夾資料不改文案的話，卡片就會承諾一個玩家永遠拿不到的數字，而『描述不可以說謊』正是這一批的核心原則。要真的給 64 就得**有意識地**抬高那道護欄（它是 mis-parse 防線，不是平衡政策），那是一個獨立決定，不應該混在這次匯入裡偷偷做掉。

  </details>

### ✅ 妖物碎殺牙 `godie-i06a`

- ✅ `攻擊力+112` — ad 對得上
- ✅ `吸血+15％` — lifesteal 對得上
- ✅ `[On-Hit] 6%機率造成255傷害，持續3秒` — [On-Hit] ← onBasicAttack → dot

### ✅ 斬龍刀 `godie-i06d`

- ✅ `攻擊力+128` — ad 對得上
- ✅ `防禦+12` — armor 對得上
- ✅ `[暴擊] 20%機率造成 2倍傷害` — [暴擊] ← __modifier__

### ✅ 月牙魔杖 `godie-i06e`

- ✅ `[流星] 流星每秒造成 100% AP 範圍傷害（距離越遠流星傷害越低）` — [流星] ← damageArea
- ✅ `魔抗+66.7%` — mr 對得上

  <details><summary>authoringNote</summary>

  【2026-08-01 owner 裁定「魔抗的 % 是減傷比例」】引擎的魔法減傷是 100/(100+mr)，所以 mr = 100·r/(1-r)。r=1.00（100% 減傷）需要 mr=∞，用 mr 永遠表達不出來 —— 字面上的『魔抗+100%』等於完全魔法免疫，owner 選擇不走真免疫路徑，改成一個讀得出來的數字。採用 mr 200（ITEM_MODIFIER_LIMITS 的上界，不需要動那道 mis-parse 護欄）= 66.7% 減傷，文案同步改成 66.7% 讓描述與資料一致（這一批的核心原則就是描述不可以說謊）。註：月牙魔杖這個值正好等於本批之前出貨的 mr 200，w3x 來源 AIsr『降低的傷害 0.5』則是 50%，見 docs/content/reconciliation/items.md。

  </details>

### ✅ 傲慢水龍王 `godie-i06f`

- ✅ `總 AP 額外 + 300%` — ap 對得上
- ✅ `每秒回魔 + 7` — manaRegen 對得上

### ✅ 殺豬刀 `godie-i06g`

- ✅ `攻擊力+37` — ad 對得上
- ✅ `防禦+13` — armor 對得上
- ✅ `攻擊速度+30%` — as 對得上
- ✅ `[變形] 專殺畜牲，7%機率將敵人變成食材，無法動作` — [變形] ← applyStatus
- ✅ `[格擋] 30%機率 抵擋致命一擊(超過現存生命的傷害)` — [格擋] ← __block__

  <details><summary>authoringNote</summary>

  【2026-08-01 [變形] 落地】
· [變形]「專殺畜牲，7%機率將敵人變成食材，無法動作」= passive[0]，**全部用既有原語**：onBasicAttack + chance + victim + applyStatus{stun:true}。沒有新 effect kind、沒有新 sim 事件、net/eventFanout.ts 不用動 —— stunApplied 早就過線、ENTITY_FLAG.STUNNED 早就在快照上。
  · 「無法動作」→ stun:true。sim 裡「不能動作」就是它（movementHold/abilitySystem/CastResolveSystem/BasicAttackSystem/RecoverySystem 全部讀它）；root 只擋位移，沒有 silence。
  · ⚠️ **「專殺畜牲」是目標過濾，而 sim 沒有『畜牲』分類。** 生物只分英雄(ChampionComp)/肉鴿小怪(MobComp)/召喚物/守衛塔。w3x 也幫不上忙：本件兩支 BEHAVIOUR 是 A03U◄ANss Spell Shield 與 A0KW◄Asph Sphere（裝飾光球），**原作根本沒有變形技**，所以「畜牲」是 owner 新寫的設計，無來源可對照。最初出貨用 victim:"mob"（=「不是英雄的東西」），並把後果說在明處：第 1–2 回合沒有小怪，那一行完全不會觸發。
  · ✅ **owner 2026-08-01 裁定「也殺敵方英雄單位」→ victim:"any"。** 所以「畜牲」是風味不是過濾器，敵方英雄與小怪一律吃 7%。這也順帶解掉前兩回合完全不觸發的問題。改動只有這一個欄位，sim 一行沒動。
  · ⚠️ **持續秒數是 owner 沒給的數字。** 出貨 duration:1 秒 + internalCooldown:3 秒，兩個都是**保守值不是設計值**：7%×攻速1.5 ≈ 每 9.5 秒一次、約 10% 上線率；ICD 3 秒封住攻速上限那一端（攻速解鎖到 10/s 時 7% = 每秒 0.7 次 proc，沒有 ICD 會連成永久控場）。兩個都是既有欄位，owner 給數字當天就能換。
  · ⚠️ **「變成食材」的視覺沒有做。** championForm 換的是**施法者自己**的 transform.counterpartId（sim/effects/championForm.ts：主詞永遠是 ctx.caster），指不到別人也指不到非英雄模型。要做需要一格 ENTITY_FLAG（**只剩 32768 一格**，見 protocol/schema.ts BIT BUDGET）或一個新的狀態視覺事件 + 客戶端消費者。我刻意沒有花掉最後那一格換一個純視覺。目前玩家看到的是既有暈眩表現。
· [格擋]「30%機率 抵擋致命一擊」= block{damageTypes:[physical,magic,true],chance:.3,fraction:1,lethalOnly:true} —— 與 晨曦之光 godie-i016 同一句話同一組值，理由寫在那一份，不重複。w3x 這一格是 A03U◄ANss Spell Shield **Cool 100**；owner 改寫時把那一行刪掉，之後在 2026-08-01 裁定 **internalCooldown: 1 秒**（出貨值，見 block.internalCooldown）。
  · ⚠️ **2026-08-01 owner 推翻了原本的多來源規則。** 舊註解寫「取 chance×fraction 最大者…帶兩件格擋不會比一件強」—— 那已經**不是**現在的行為。owner 裁定「獨立判斷兩次，拿第一次擋掉剩餘繼續算下一次」，所以每個來源各抽各的骰、各自從**剩餘**傷害再削一次：本件 + 晨曦之光 兩件 30% 實測是 **51%**（1−0.7²），三件是 65.7%。規則是欄位 blockRules.stacking（出貨 "independent"，舊行為 "best" 仍可切）。機制在 sim/combat/block.ts。

  </details>

### ✅ 炎神弩 `godie-i06i`

- ✅ `攻擊力+42` — ad 對得上
- ✅ `攻擊速度+60%` — as 對得上
- ✅ `[On-Hit] 攻擊額外造成 10-1000 傷害，敵我距離越遠傷害越高 (0~10)(冷卻1秒)` — [On-Hit] ← onBasicAttack → damage

  <details><summary>authoringNote</summary>

  攻擊力+42 / 攻擊速度+60% = modifiers。
[On-Hit]「攻擊額外造成 10-1000 傷害,敵我距離越遠傷害越高 (0~10)」= passive onBasicAttack → damage.distanceScale {atRange:10, near:10, far:1000}(sim/effects/dynamicTerms.ts)。文案把三個數字都給了,所以這一件沒有任何設計決定:near/far/atRange 一一對應 10 / 1000 / (0~10)。線性內插,沒有曲線 —— sim/purity.test.ts 禁 `**` 與三角函式(火圈的縮圈法則也因此是線性的)。
距離取的是**施法者與受害者的平面距離**,在 hook 觸發那一刻讀 transform:近戰路徑在 BasicAttackSystem 揮擊落點、遠程路徑在 ProjectileSystem 的**命中**那一刻(所以是箭矢飛完之後的兩點距離,那正是「敵我距離」的讀法)。
⚠️ **owner 一定要看的數字 —— 這是這一批最大的一個**:文案的 far = **1000**。MEASURED(出貨 champion range,單位就是這裡的 sim 單位):
    近戰 range 1.6  → 10 + 990×0.16 ≈ **168**
    遠程 range 6.0  → ≈ **604**
    遠程 range 8.2  → ≈ **822**   (11 位英雄是這一格)
    遠程 range 12.0 → 夾在 atRange=10 → **1000**
  再乘 combat-env damageDealt(出貨 0.5)分別約 84 / 302 / 411 / 500,而maxHealth 倍率 3 下一條血約 1,350。也就是說**一位 12 距離的射手每一次普攻額外打掉對手三分之一條血**。這是文案字面值,我照著出,但這是 owner 應該親自看一眼的那一個數字 —— 而他看了。
⚠️ **owner 2026-08-01 裁定「冷卻1 秒」**,所以這條 hook 現在帶 `internalCooldown: 1`(秒)。**純內容改動**:節奏閘早就在 sim/effects/hooks.ts(絕對 tick 比較,`world.tick - hookLastFired < icdTicks`),一行 sim 都沒動。實際效果是這一發**每秒最多一次**,所以上面那四個 168 / 604 / 822 / 1000 現在是「每秒的上限」而不是「每一下」——攻速再高也不會讓它變快,這正是 owner 要收的那一條。
⚠️ **這件的文案沒有寫冷卻**(只寫「攻擊額外造成 10-1000 傷害」),而 owner 沒有授權我改那一句,所以卡片目前**少講了**一個真實限制。要不要補「(冷卻1秒)」是 owner 的決定,不是我的 —— 記在這裡,不要被當成漏抄。
⚠️ 冷卻長度是**欄位不是政策**:拿掉 `internalCooldown` 就回到「每一下都打」,填 3 就是三秒一次;道具來源的 ICD 還會再乘後台 combat-env 的 `itemCooldown`(hooks.ts 的 `src.kind === "item"` 那一行),所以全域節奏也調得動。
⚠️ schema 上界 DISTANCE_SCALE_DAMAGE_MAX = 3000,工作是擋住多打一個零(10000),**不是**壓制 1000 —— 壓制它等於竄改文案。
⚠️ 方向是資料不是程式:near > far 就是「越近越痛」,一樣寫得出來。
damageType 選 magic(炎神),吃魔抗。

  </details>

### ✅ 獸人船長十字鎬 `godie-i06j`

- ✅ `[暈眩] 11%機率攻擊附帶暈眩1秒` — [暈眩] ← applyStatus

### ✅ 老衲的棒子 `godie-i06n`

- ✅ `[緩慢] 10%機率攻擊附帶移動速度減半，持續 4秒` — [緩慢] ← applyStatus

### ✅ 血染八月 `godie-i06o`

- ✅ `攻擊力+88` — ad 對得上
- ✅ `[On-Hit] 攻擊敵方額外造成 88流血傷害，持續3秒` — [On-Hit] ← onBasicAttack → applyStatus/dot
- ✅ `[暈眩] 50%機率造成 0.01秒暈眩` — [暈眩] ← applyStatus

  <details><summary>authoringNote</summary>

  [On-Hit]「攻擊敵方額外造成 88流血傷害，持續3秒」= passive[0]（dot 29.33 × 3 跳 = 88，總量對得上文案）。

[暈眩]「50%機率造成 0.01秒暈眩」= passive[1]，chance 0.5。
· ⚠️ **duration 出貨值是 0.034 而不是文案的 0.01，這是刻意的，需要 owner 過目。**sim 是 30 Hz，applyStatus 換算是 expiresAtTick = tick + Math.round(duration/dt)（sim/effects/applyStatus.ts）。0.01 秒 → Math.round(0.3) = **0 tick** → 這個暈眩一次都不會發生，是一個玩家永遠拿不到的功能（CLAUDE.md 失敗形態 ②）。0.034 秒 = 1 tick，是這個引擎表達得出來的**最短**暈眩，也就是「0.01 秒」這個玩笑在 30 Hz 底下唯一能落地的樣子。同一個 30 Hz 地板在 content/schema/effect.ts 的 grantAttribute.durationSec（.min(0.067)）與 cycleBuff.steps[].duration 都有寫。
· 它是一個欄位：owner 想要文案的字面 0.01（也就是明知它不會發生）只要把這個數字改回去。
· statusId 用 fang-stun（出貨的極短僵直標記，緣一零式 godie-i013 與 消失的密室 godie-i02d 的 0.1 秒暈眩用的是同一個）。

  </details>

### ✅ 鍊金術之盾 `godie-i06q`

- ✅ `[嘲弄] 每秒吸引周圍敵人優先攻擊自己，持續 0.5秒` — [嘲弄] ← taunt
- ✅ `[煉金術] 受敵人攻擊時，有 10%機率將直接將 HP 低於 5% 的敵人變成黃金 (敵方單位直接死亡，黃金數量為敵方等級)` — [煉金術] ← damage

  <details><summary>authoringNote</summary>

  [嘲弄] = passive[0]。「每秒」是 internalCooldown: 1（不是 taunt 效果自己的欄位 —— 節奏一律由 HookDef.internalCooldown 表達，見 systems/IntervalHookSystem.ts 決策 1，而且它會吃 combatEnv.itemCooldown）。「持續 0.5秒」= durationSec，會再乘上後台 config.taunt@1 的 durationMult。radius 9.17 = WC3 Taunt（Ntau）的 500 單位 ÷ 54.5：文案沒有給半徑，所以取原作同族技能的值而不是憑空挑一個；它還會再乘 combatEnv.abilityRange（出貨 0.6）→ 場上實際 5.5。maxTargets 8 是防止一發把整波 30 隻殭屍全部拉住。

[煉金術] = passive[1]。「10%機率」= chance；「HP 低於 5%」= condition（subject: target —— onDamageTaken 的事件實體是**攻擊者**，見 combat/damage.ts 的 fireHooks(world, pkt.target, "onDamageTaken", pkt.source) 與 effects/hooks.ts）；「直接死亡」= 目標最大生命 35% 的真實傷害，對一個已經低於 5% 的身體是七倍致死；「黃金數量為敵方等級」= grantGold perTargetLevel 1。

⚠️ 兩個已知限制，寫在這裡而不是假裝沒有：
（1）金幣是在 proc 當下發的，不是在確認擊殺之後 —— 傷害走 damageQueue，這一 tick 稍後才結算，所以那一刻還沒有死亡可以掛。條件本身讓擊殺成為必然，但如果目標身上有大於自身最大生命 35% 的護盾，會出現「發了金幣但沒死」。現行內容沒有任何東西產得出那種護盾。用 onKill 反而更糟：onKill 不帶「是哪一發打死的」，掛在那裡會變成這位持有者的每一次擊殺都發錢，那是另一件道具。
（2）小怪（殭屍）**沒有 per-entity 等級**（spawnMobBody 不寫 level，波次等級在 MobRules 上、由主機逐回合烘），所以轉化一隻殭屍付 0 金。殭屍本來就會付 #215 的 mobKill 賞金給補刀的人，所以不是白做工；要讓它也按等級付，得先讓 MobComp 帶等級，那是另一張單。

  </details>
