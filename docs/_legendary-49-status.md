# 寶具三選一 · 69 支寶具 實作進度

> **這一頁是產生出來的，不要手改。** 重新產生：
>
> ```bash
> python3 tools/legendary-status/status.py
> ```
>
> 它每次都重讀 `content/`，逐行比對 owner 寫的「效能」文案與該道具真正帶的
> `modifiers` / `passive` / `auras`。手寫的進度表只會往「看起來比實際完成得多」
> 的方向腐爛，而那正是這一批要消滅的缺陷。


`███████░░░░░░░░░░░░░` **26 / 69** 支每一行文案都有對應資料（38%）


| 狀態 | 意思 | 行數 |
|---|---|---:|
| ✅ | 文案這一行有對應的資料 | 125 |
| ❌ | **文案講了、資料沒有** —— 玩家拿不到 | 0 |
| 📝 | 還沒做，但 `authoringNote` 已登記缺什麼 | 1 |
| ❔ | 這支工具讀不出來 —— **代表沒有人在檢查它** | 79 |

## 上架管線

- 抽獎池（三階）：`legendary-weapons` **29** 支 · `ex-release-weapons` **35** 支 · `ex-origin-weapons` **5** 支 ⇒ 合計 **69** 支
- 白名單 `starter.go` `starterLegendaryItems`：**69** 支 （缺口：無）
- 會滾這張表的回合：**10, 2, 5**
- `draftEligible: false`（在池子裡但永遠不會被發出來）：**無**

⚠️ 抽卡是**先滾骰再過白名單**（`MatchController` → `whitelist.filterItems`），所以白名單少一支不是「那支抽不到」，是整張卡的選項會變少甚至空掉。


## 逐支明細


### 📝 泰坦九頭蛇 `cleaver-of-the-warden`

- ✅ `最大生命+10%` — maxHealth 對得上
- ❔ `[普通攻擊時] 攻擊附帶額外的（15+1.5%自身最大生命值）物理傷害攻擊特效，並生成一道衝擊波來對目標身後的敵人們造成（40+3%最大生命值）物理傷害。` — 未知標籤 [普通攻擊時] —— 這支工具沒有規則檢查它

  <details><summary>authoringNote</summary>

  逐句對照（2026-08-18 稽核）：
「最大生命+10%」= modifiers maxHealth pctAdd 0.1。✅
「[普通攻擊時] 攻擊附帶額外的（15+1.5%自身最大生命值）物理傷害攻擊特效」= passive[0].effects[0] 的 damage（flat 15 + ratios maxHealth 0.015）。⭐「自身」= ratios 讀的是**施法者**的面板（`effects/effectCommon.ts::casterStats`），⛔ 不是被打的人。onBasicAttack 發射點在迴避／失手兩道閘**之後**（`BasicAttackSystem`），所以「命中」是字面意思。✅
「並生成一道衝擊波來對**目標身後**的敵人們造成（40+3%最大生命值）物理傷害」= effects[1]。
⭐ 2026-08-18 修正：這一句原本寫成 `damageArea`（以受害者為圓心、半徑 3.5 的**圓**），而圓會同時打到目標**旁邊與前面**的人 —— 「身後」整個詞是空的。改成 `damageLine` + `aim:"target"` + `fromCaster:false`：膠囊的起點是受害者、方向是**施法者→受害者**，也就是「這一刀穿過去之後繼續前進」= 身後。`includeOrigin` 省略 = false，所以震央那個人不會再吃一次（他已經吃過上面那一發攻擊特效）。
· `length` 3.5 沿用原本的圓半徑（同樣的縱深，⛔ 不是趁機加強）。
· `width` 2.4 = 兩個身位（英雄碰撞半徑 0.6 ⇒ 體寬 1.2）—— 衝擊波要有寬度，一個身位的線在近戰混戰裡幾乎打不到人。
· `maxTargets` 4 不變。
⚠️ 兩個沒有寫在文案上的閘，兩個都是**發卡限制**不是效果限制，所以文案不必提（與其餘 6 件帶 `requiresAttackType` 的道具同一個慣例）：頂層 `requiresAttackType:"melee"`（只發給近戰英雄）與 hook 上的 `requires.attackType:"melee"`（第二道保險，變身成遠程時 `syncItemSources` 會重算）。

  </details>

### ✅ 丈八蛇矛 `godie-i000`

- ✅ `攻擊力+87` — ad 對得上
- ✅ `生命+872` — maxHealth 對得上
- ✅ `[擴散] 擴散傷害87%` — [擴散] ← damageArea

  <details><summary>authoringNote</summary>

  逐句對照（2026-08-18 稽核，這份文件在此之前**沒有** authoringNote）：
「攻擊力+87」= modifiers ad flat 87。✅
「生命+872」= modifiers maxHealth flat 872。✅
「[擴散] 擴散傷害87%」= passive[0] 的 damageArea（ratios ad 0.87、radius 3.5、maxTargets 4、canCrit true）。機制是有的，⛔ **但那一行原本只說了「87%」**：87% 的什麼、什麼時候發生、擴散給幾個人、會不會暴擊，卡面一個字都沒有 —— 那是「給了但不說」（第一·五守則的另一半）。
⛔ **2026-08-18 我把那一行改寫上卡面，當天又還原了。** 這 49 支是 owner 2026-08-01 親筆交來的，被 `packages/shared/src/content/legendary49OwnerText.test.ts` **逐位元釘死**（在這一批裡文案就是規格，modifiers 是從文案翻譯出來的不是反過來）。要改是「更新 fixture + 寫進 _sanctionedRewrites」，⛔ 那是 owner 的刻意動作，不是我順手做的事。
⭐ **但發現本身是對的，留在這裡等核准。** 資料一個數字都沒動；想補上卡面的是 JSON 裡本來就存在的四件事 ——「普通攻擊命中時」（on: onBasicAttack，發射點在迴避／失手兩道閘之後，所以「命中」是字面意思）、「目標周圍」（damageArea 是以**受害者**為圓心的圓）、「最多 4 名」（maxTargets 4）、「87% 攻擊力的物理傷害」（ratios 讀的是**施法者**面板的 ad，damageType physical）、「可暴擊」（canCrit true —— 走 combat/critStrike.ts::rollAbilityCrit，與普攻同一支）。
**提案卡面（⚠️ 需 owner 核准才能上，在那之前這一行維持原稿「[擴散] 擴散傷害87%」）**：「[擴散] 普通攻擊命中時，向目標周圍最多 4 名敵人擴散 87% 攻擊力的物理傷害（可暴擊）」。
⚠️ `includeOrigin` 省略 = false：被普攻打中的那個人**不會**再吃一次擴散（他已經吃過那一刀），所以「擴散」是字面意思 —— 這是預設值，卡面不必提。
⚠️ `requiresAttackType:"melee"` 是**發卡限制**不是效果限制（三選一／寶玉不會發給遠程英雄），與其餘帶這一格的道具同一個慣例，所以卡面不提。⛔ 而且它是 roll **之前**的濾網，不會產生「拿到一張招牌是死的卡」。
⚠️ 解說那一句「使用者智力會降低」是**玩笑文案**，⛔ 不是效果：JSON 沒有任何 int 減益，也**不應該**照著補一個 —— 它落在解說段而不是效能段。owner 若真要它，那是 `attributes` 的一格（負值）＋ 一行寫進效能段，屬於平衡改動。

  </details>

### 📝 虛哭神去 `godie-i007`

- ✅ `普攻吸血+20%` — lifesteal 對得上
- ❔ `[普通攻擊時] 每次攻擊造成造成額外 [自身已損失的生命百分比數值(0~100)]` — 未知標籤 [普通攻擊時] —— 這支工具沒有規則檢查它

  <details><summary>authoringNote</summary>

  普攻吸血+20% = modifiers lifesteal flat 0.2。
[普通攻擊時]「每次攻擊造成造成額外 [自身已損失的生命百分比數值(0~100)]」= passive onBasicAttack → damage.resourcePct {subject:"self", resource:"health", basis:"missing", scale:"points", perRank:[1]}（sim/effects/dynamicTerms.ts）。
⚠️ **讀法**:文案寫的是「百分比**數值**(0~100)」,所以掉了 60% 血 = 打 **60 點**,不是「60% 的什麼」。那正是 scale:"points" 這個欄位存在的理由 —— 另一種讀法(ratio)是「已損生命的 100%」,在滿血倍率下差三個數量級。兩種讀法都寫得出來,預設是 ratio(保守),這一件明寫 points。
⚠️ **owner 要看的數字**:上限 100 點(1 HP 時),典型交戰 50% 血 = 50 點。與生命上限**無關**,所以它在後期是相對變弱的一項 —— 如果 owner 要的是「已損生命的百分比傷害」(隨血量長大),把 scale 改成 "ratio"、perRank 改 [0.1] 這一類即可,不用改程式。
⚠️ 滿血時這一項是 0,而 effects/damage.ts 會**不發空封包**(否則每一刀都在對方頭上跳一個 0、還會白白觸發雙方的 onDamageTaken/onDamageDealt)。
damageType 選 physical:妖刀是實體武器,而且 physical 會吃護甲減免 —— 出錯時傷害較小的那一個。要改成 true/magic 是編輯器上的一個下拉。

⭐ 2026-08-18 逐句稽核（第一·五守則「不放任何無效說明」）：**兩句效能雙向都對得上，資料一個數字都沒改**。⛔ **我 2026-08-18 改了這一行的卡面文案，當天又還原了**：這 49 支是 owner 2026-08-01 親筆交來的，被 `packages/shared/src/content/legendary49OwnerText.test.ts` **逐位元釘死**（在這一批裡文案就是規格），要改是「更新 fixture ＋ 寫進 _sanctionedRewrites」—— 那是 owner 的刻意動作，⛔ 不是我順手做的事。
⭐ **發現本身是對的，留在這裡等核准**：那一行收在「(0~100)]」就斷掉了，**沒有講傷害型別**（JSON 是 physical），而且「點」沒有寫死在卡面上，因為 scale:"points" 與另一種讀法(ratio)在滿血倍率下差三個數量級，而卡面原本兩種都讀得通。
**提案卡面（⚠️ 需 owner 核准才能上，核准前維持原稿）**：該行末尾補上「 點物理傷害」五個字。
⛔ 描述裡的「造成造成」疊字與解說段的「」台詞都**沒有動**：前者是 w3x 匯入痕跡（同批的 雅典娜的驚嘆號 godie-i006 也有），後者是**角色對白不是效果**（第〇·六守則②）—— 那一句「只有足夠瘋狂的人才能在戰場活下來」裡沒有任何機制，⛔ 不要讀成低血加成。
⛔ 這件武器沒有 requiresAttackType、沒有 hook requires —— 沒有隱藏的閘。lifesteal 0.2 遠低於 config.stat-caps@1 的 base 0.8，不會被靜默夾掉。

  </details>

### 📝 炎龍巨弩 `godie-i00i`

- ❔ `[普通攻擊時] 每次普攻會同時發出 100% AP 傷害的炎龍怒火造成周圍 3名敵人燃燒傷害，持續3秒` — 未知標籤 [普通攻擊時] —— 這支工具沒有規則檢查它
- ✅ `AP+228` — ap 對得上
- ✅ `最大魔力+20%` — maxMana 對得上

  <details><summary>authoringNote</summary>

  逐句對照（2026-08-18 稽核）：
「AP+228」= modifiers ap flat 228。✅ 「最大魔力+20%」= maxMana pctAdd 0.2。✅

[普通攻擊時]「每次普攻會同時發出 100% AP 傷害的炎龍怒火造成周圍 3名敵人燃燒傷害，持續3秒」= passive[0]。radius 3.5 = 這一批 on-hit 範圍傷害的出貨慣例（文案沒有給半徑）；maxTargets 3 = 文案的「3名敵人」；includeOrigin 省略 = false，被普攻打中的那個人不會再吃一次（他已經吃過普攻了）。
⭐ **2026-08-18 修的是「持續3秒」**。這一行在此之前登記為【仍缺】：整份 100% AP **一次打完**，卡面上「燃燒⋯持續3秒」是一句零實作的話（第一·五守則要消滅的形狀）。當時的理由是「damageArea 沒辦法帶 dot payload」—— 那個理由已經過期了，`damageArea.onHitTargets`（effect.target-set-chain@1）就是「這個圓真的打到的那群人再跑一段」，而 `dot` 讀的正是 ctx.targets。
⛔ **總傷害一個字都沒動**：100% AP 拆成 **4 次 ×25% AP**——命中當下 1 次（damageArea 自己那一發）＋ dot 3 秒每秒 1 次（intervalSec 1、durationSec 3）。所以這是**分佈**的修正，不是加強；差別正是舊備註寫的那一句「對手有沒有機會在燒完之前把血補回來」。
⚠️ `stacking: "independent"` 是承重的一格，⛔ 不可以改成預設的 refresh：refresh 只延長期限、不加傷害，於是攻速再快每秒也只燒 25% AP —— 那會把這件武器**砍掉大半**。independent 讓每一次普攻各自帶一段自己的 3 秒燒，N 刀就是 N×100% AP，與修改前逐位元同量。
⚠️ 燒傷預設吃得到【淨化】（`config.dispel@1` 的 dotDefaultDispellable，出貨 true）—— 這是新出現的互動，文案沒有講，因為它是全 repo 燒傷的共同規則而不是這件武器的特性。

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

⭐ 2026-08-18 逐句稽核（第一·五守則「不放任何無效說明」）：五句效能**兩個方向都對得上，資料零改動**。生命/魔力是 flat（出貨上限 375960 / 232150，離得極遠，不需要 capRaise）；「攻擊速度+120%」= as pctAdd 1.2（出貨上限 base 4.0，本件不解鎖，所以它只能把人推到 4.0）；「總移動速度*1.2」= ms **pctMult** 0.2 —— 文案寫的是乘號，所以是乘區不是 pctAdd（帶第二件加速道具時兩者才分岔）。⛔ JSON→描述方向也乾淨：這份文件沒有 passive / auras / sets / vision / flight，不存在「給了但卡面沒說」的那一半。

  </details>

### 📝 名刀-天狼 `godie-i00u`

- ❔ `[普通攻擊時] 每次攻擊造成敵方英雄現存生命 6%傷害` — 未知標籤 [普通攻擊時] —— 這支工具沒有規則檢查它
- ✅ `攻擊速度+60%` — as 對得上
- ✅ `普攻吸血+10%` — lifesteal 對得上

  <details><summary>authoringNote</summary>

  ⭐ 2026-08-18 逐句稽核（第一·五守則「不放任何無效說明」）—— 三句效能都對得上，**改動只有一格 `victim`**，數值一個字都沒動。

[普通攻擊時]「每次攻擊造成敵方英雄現存生命 6%傷害」= passive[0]：
· 「現存生命 6%」= `damage.hpPct {basis:"current", perRank:[0.06]}`。`hpPct` 讀的是**受害者**的血 —— `zScaling.ratios` 只讀得到施法者的屬性表，所以這一句用 ratios 寫不出來（理由逐字在 content/schema/effect.ts 的 hpPct 上）。上界 HP_PCT_DAMAGE_MAX = 0.35。damageType 選 magic（吃魔抗）；文案沒指定型別，這是選擇不是抄寫。
· ⚠️ **「敵方英雄」四個字在此之前沒有落地**：這條 hook 原本沒有 `victim`，於是它對**殭屍波的小怪也照付 6% 現存生命**。那是「JSON 給了、卡面沒說」的那一種偏差（第一·五守則的鏡像 —— 沒有任何守衛會紅，因為每一個零件都是對的）。⇒ 補上 `victim: "champion"`，與同一句話寫法的 熾天使之弓 godie-i012 對齊。⛔ 這不是平衡調整，是把資料改成卡面說的那件事：要讓它也削殭屍，把這一格改成 `"any"` 就好（一格下拉，不用改程式）。`victimPasses` 坐在 ICD 閘與機率骰**之前**，所以被它擋掉的一發不燒冷卻、也不動 seed。
· ⛔ 沒有 `internalCooldown` —— 文案是「每次攻擊」，所以每一下都付。godie-i012 的 1 秒 ICD 是 owner 2026-08-01 對**那一件**的裁決，⛔ 不可以推廣過來。

「攻擊速度+60%」= `as pctAdd 0.6`。出貨攻速上限 base 4.0 / unlocked 10.0，這件沒有 capRaise，所以它只能把人推到 4.0。
「普攻吸血+10%」= `lifesteal flat 0.1`。⛔ **不可以寫成 pctAdd/pctMult**：lifesteal 的 base 是 0，管線是 `(base+Σflat)×(1+ΣpctAdd)×Π(1+pctMult)`，所以只有 flat 推得動它（0 乘任何東西還是 0）。⚠️ 反過來說，晨曦之光 godie-i016 的 [重創] 用 `lifesteal pctMult -0.5` **是有效的** —— 它乘的是這一件付出來的那個 0.1。

  </details>

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

⭐ 2026-08-18 逐句稽核（第一·五守則「不放任何無效說明」）：四句效能**兩個方向都對得上，資料零改動**。
· 「減半」= `pctMult -0.5`（乘區）而不是 `pctAdd -0.5`。文案寫的是「**總**攻擊速度／**總**移動速度」，而乘區才是「不管對方疊了多少加成，最後對半砍」；pctAdd 只是加進同一個加成桶，被別的加成稀釋。
· ⚠️ 光環半徑 9.17 **卡面上沒有寫**，那是刻意的：owner 的文案本來就沒給半徑，這是參數不是宣稱（與其餘 auras 道具同慣例）。它還會再乘後台 combat-env 的 `abilityRange`。
· ⛔ 沒有 passive / block / sets / vision / flight，所以「給了但卡面沒說」那一半是空的。

  </details>

### 📝 熾天使之弓 `godie-i012`

- ❔ `[普通攻擊時] 每次削去敵方英雄現存 MP 3%，並附帶燃燒效果每秒燃燒3%最大生命，持續2秒` — 未知標籤 [普通攻擊時] —— 這支工具沒有規則檢查它
- ✅ `攻擊速度+30%` — as 對得上

  <details><summary>authoringNote</summary>

  攻擊速度+30% = modifiers as pctAdd 0.3。
[普通攻擊時]「每次削去敵方英雄現存 MP 3%,並附帶燃燒效果每秒燃燒3%最大生命,持續2秒」= passive onBasicAttack(victim:"champion")底下兩個效果:
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
⭐ 2026-08-18 稽核：兩個方向都對得上，資料零改動。⚠️ 兩件**卡面沒講**的事送 owner 裁決（49 支傳說是 owner 親筆文案，⛔ 不可自行改寫）：① `internalCooldown: 1` —— 卡面寫「**每次**削去」，而配 +30% 攻速時每秒不只揮一下，實際是每秒最多一次；② `requiresAttackType:"ranged"` 是**發卡**限制不是效果限制，與其餘 6 件帶這一格的道具同慣例，所以不上卡面。

  </details>

### ✅ 緣一零式 `godie-i013`

- ✅ `攻擊力+38` — ad 對得上
- ✅ `[暈眩] 8%的機率增加 140點傷害並暈眩0.1秒` — [暈眩] ← applyStatus

  <details><summary>authoringNote</summary>

  ⭐ 2026-08-18 逐句稽核（第一·五守則「不放任何無效說明」）—— **兩個方向都對得上，資料一個位元都沒改**；這一輪只補這份備註。

「攻擊力+38」= `modifiers ad flat 38`。⛔ 沒有 capRaise：出貨 `config.stat-caps@1` 的 ad 是 base = unlocked = 21200（那是防 mis-parse 的柵欄，玩家一輩子碰不到），所以任何 ad 的 capRaise/capRaisePct 在這裡都是逐位元的 no-op。

[暈眩]「8%的機率增加 140點傷害並暈眩0.1秒」= passive[0]，三個數字各自落在一格：
· 「8%的機率」= `HookDef.chance 0.08`。⭐ **只抽一次籤**：傷害與暈眩是同一條 hook 底下的兩個 effect，所以不可能出現「加了傷但沒暈」。⛔ 拆成兩條 hook 就會變成兩次獨立判定 —— 那是同一句文案的另一個意思。
· 「增加 140點傷害」= `damage {damageType:"physical", amount.flat:140}`。physical 是因為它是刀刃的追加、應該吃護甲；文案沒指定型別，這是選擇不是抄寫。
· 「暈眩0.1秒」= `applyStatus {stun:true, duration:0.1}`。⚠️ 0.1 秒在 30 Hz 下是 `Math.round(0.1 / (1/30))` = **3 tick**，真的會發生。對照 殺豬刀 godie-i06o 的「0.01 秒」= `Math.round(0.3)` = **0 tick** = 一次都不會發生（那一件的出貨值被刻意抬到 0.034 = 1 tick）。這一件不需要那個處理，所以文案的數字原封不動。
· ⛔ 沒有 `internalCooldown`：文案只給了機率，沒有給節流。8% × 0.1 秒在任何攻速下都不構成鎖定。

⚠️ **要 owner 過目的一件事（我沒有動它）**：`statusId` 是 `fang-stun`「牙突・僵直」—— 那是 13-02 揍敵客牙突的**具名**僵直，被 godie-i013 / 消失的密室 godie-i02d / 殺豬刀 godie-i06o 三件道具共用。機制完全正確（真正讓人不能動的是 `stun: true`，statusId 只是標籤），但玩家的狀態列會看到「牙突・僵直」而不是「暈眩」。⭐ 同一個 repo 已經有兩種相反的說法：godie-i06o 的備註把 fang-stun 當成「出貨的極短僵直通用標記」，而 ultimate-mod-shiranui 的備註把它列進 `named-variant` 並寫著「借過來會讓『誰把我暈的』在戰報上指到錯的招式」。要換成通用的 `stun`（content/status-effects/stun.json 已存在）是**三件一起改**的決定，⛔ 不是我這一輪可以單方面做的。

  </details>

### 📝 朗基努斯之槍 `godie-i018`

- ✅ `力量+12` — attributes str = 12
- ✅ `敏捷+12` — attributes agi = 12
- ❔ `[普通攻擊時] (總敏捷)% 機率性造成等同 (總力量) 之閃電傷害` — 未知標籤 [普通攻擊時] —— 這支工具沒有規則檢查它
- ❔ `[淨化] 普通攻擊時機率移除目標身上的增益` — 未知標籤 [淨化] —— 這支工具沒有規則檢查它

  <details><summary>authoringNote</summary>

  「力量+12 敏捷+12」= attributes {str:12, agi:12}(item@1.attributes,機制見 四魂之玉 godie-i00z 與 sim/stats/attrSources.ts)。
⚠️ **攻速加成沒有了 —— owner 2026-08-01 裁定「取消攻速加成」**。所以這份文件現在**一條 modifiers 都沒有**,而文案裡的「攻擊速度+55%」那一行也在同一次改寫裡刪掉:留著文案卻拿掉資料,三選一卡片就會承諾一個玩家永遠拿不到的數字(legendaryClaims.test.ts 正是抓這個)。這次文案改寫登記在 packages/shared/src/content/__fixtures__/legendary49OwnerText.json 的 _sanctionedRewrites。要放回去是**加回一條 modifiers {stat:"as", op:"pctAdd", value:0.55} 並把那一行文案寫回去**,不是改程式。
[普通攻擊時]「(總敏捷)% 機率性造成等同 (總力量) 之閃電傷害」= passive onBasicAttack,兩個軸各自落在一個新欄位上:
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
damageType 選 magic(閃電),吃魔抗。 ｜ [淨化]（A4b/#278）：`chance: 0.1` 逐字來自它自己的製作書 godie-i024「10%機率淨化(法球)」（WC3 Purge 法球）。`count: 1` 表示一次拔一層；**沒有寫 count 的話會用後台「淨化規則」頁的全域上限（出貨 3）**，而那對一件 On-Hit 道具太強。要調強弱改這裡的 chance 或 count，要改「拔不拔得到沒標記的增益」則是後台那一頁的 buffDefaultDispellable（出貨關著）。
⭐ 2026-08-18 稽核：四句兩個方向都對得上，資料零改動。⚠️ [淨化] 那一行卡面只寫「機率」沒給數字（出貨 `chance: 0.1`）—— ⛔ 沒有改文案，49 支傳說是 owner 親筆。 ｜ [淨化] pools 明寫的理由見 docs/legacy/_item-authoring-notes-full.md#godie-i018。

  </details>

### ✅ 貫雷槍 `godie-i01g`

- ✅ `[緩慢] 8%的機率造成敵方緩速，移動速度 -2，持續 0.6秒` — [緩慢] ← applyBuff/applyStatus
- ✅ `[伸長] 近戰攻擊距離+4；遠戰攻擊距離+2` — [伸長] ← __modifier__
- ✅ `[重創] 敵方攻擊時吸血效果降低50%吸血回復量` — [重創] ← applyBuff/applyStatus

  <details><summary>authoringNote</summary>

  ⭐ 2026-08-18 雙向稽核（第一·五守則）：卡面 3 句 → **2 句完整、1 句偏差（[緩慢] 的「-2」）、0 句無效**；反向看 JSON 也沒有卡面沒講的效果。⚠️ 唯一的偏差整段寫在下面 [緩慢]，它需要一個**新引擎欄位**（`applyStatus.moveSpeedFlat`），⛔ 所以這一輪資料一個位元都沒改 —— 換成 `applyBuff{ms flat -2}` 寫得出那個 -2，但那條路會**繞過免控閘、不進 CC 戰績、【淨化】拔不掉**，等於偷偷把一個減速換成一個更強的別的東西。列給 owner。

[伸長] 近戰+4 / 遠戰+2 是同一個 modifiers 陣列上的兩條 `requires` 閘（見 content/schema/item.ts 的 zGatedItemStatModifier），在裝備時由 sim/economy/itemSource.ts 解析；變身換攻擊型態會重解（三對變身跨近戰/遠程）。

[緩慢] 用出貨的 slow30 標記 + moveSpeedMult 0.7。⚠️ 描述寫的是「移動速度 -2」＝一個 FLAT 差值，而 applyStatus 只吃倍率，表達不出來。實測全 119 位英雄 baseStats.ms（p10 5.5／中位 5.9／p90 6.4），slow30 拿掉的是 1.65–1.92（中位 −1.77），111/119 落在 −2±0.5。要精準 −2 只有兩條路：(a) applyBuff {ms flat −2}，但那條完全繞過 applyStatus 的免控閘與 CC 計分（魔免也躲不掉），(b) 給 applyStatus 加一個有上下界的 moveSpeedFlat 欄位＋MovementHold 開一條 flat 通道 —— 那是共用 CC 機制的改動，會一次服務全部 7 件 [緩慢] 道具，不該塞在單件道具的工作裡。等 owner 裁決。

[重創] onDamageTaken 的事件實體是攻擊者（見 sim/combat/damage.ts:742 與 復仇之袍 godie-i02j 的前例），所以 applyBuff 直接落在他身上，lifesteal pctMult −0.5 → 吸血減半。⚠️ 真正在做事的是 **stackKey**：沒有它，每一次挨打都會 attach 一個**新的** buff source，而 statPipeline 對每一個 source 各跑一次 `pctMult *= 1 + value`（0.5^n），打五下就剩 3% 吸血 —— 那是另一個效果。⚠️ 2026-08-01 突變驗證改正（第三守則）：`maxStacks: 1` 在這裡是**惰性的**，因為 statPipeline 只讓 `Flat` / `PercentAdd` 乘 `src.stacks`，`PercentMult` 不看層數；留著是宣告意圖，不是機制。完整說明見 祕銀鎖子甲 godie-i01w 的同一段。持續 3 秒是描述沒給的數字（唯一一個），選 3 秒是為了跨得過對手兩次揮擊的間隔，讓對打時不會中途失效；要調就改這裡一個數字。

damageSource:"basic" 對應「敵方**攻擊**時」：吸血本來就只吃普攻（damage.ts `pkt.origin === "basic"`），所以不加也不會算錯，但少了它火圈灼燒與 DoT 每一跳都會重刷這個 debuff —— 那不是描述講的東西。

【2026-08-01 [重創] 統一】stackKey 由 "grievous-lance" 改成 "grievous-wounds"，與晨曦之光 godie-i016 / 雷神之鎚 godie-i01i / 祕銀鎖子甲 godie-i01w 共用同一個 key。四段文案一字不差都是「吸血效果降低50%」，所以同時帶兩件應該還是 50% 而不是 75%（pctMult 是連乘的：0.5×0.5 = 只剩 25% 吸血）。要讓它們可疊，把其中一件的 stackKey 改掉即可。

  </details>

### 📝 雷神之鎚 `godie-i01i`

- ❔ `[普通攻擊時] 7%機率產生造成 100% AP 雷電範圍傷害，[緩慢] 並使範圍內部隊移動速度下降50%，持續1秒` — 未知標籤 [普通攻擊時] —— 這支工具沒有規則檢查它
- ✅ `防禦+20` — armor 對得上
- ✅ `AP+130` — ap 對得上
- ✅ `[重創] 敵方攻擊時吸血效果降低50%吸血回復量` — [重創] ← applyBuff

  <details><summary>authoringNote</summary>

  ⭐ 2026-08-18 雙向稽核（第一·五守則「不放任何無效說明」）：卡面 5 句 → 4 句原本就對得上，**第 5 句「範圍內部隊」被修好了（唯一一處資料改動）**；反向看 JSON 也沒有任何一條效果是卡面沒講的。
⭐ **修法是替換不是刪除**：applyStatus 從 effects[] 搬進 `damageArea.onHitTargets`（`onHitTargetsMode:"batch"`）。`victimFilter.ts::runOnHitChain` 把**這一圈真的打到的那群人**當成 ctx.targets 交下去，而 applyStatus 逐一掃 ctx.targets —— 所以現在是「圈內每一個」，不再是「被普攻打中的那一個」。⚠️ 因為 `includeOrigin:true`，震央本人也在那份名單裡，卡面「範圍內部隊」逐字成立。⛔ 舊 authoringNote 說這件事「需要給 applyStatus 一個 radius」是**過期的**（第三守則）：G1 的 `onHitTargets` 上線之後不需要新機制。

[普通攻擊時]「7%機率產生造成 100% AP 雷電範圍傷害」= passive[0] 的 damageArea（chance 0.07 / ratios ap 1.0 / damageType magic）。
· includeOrigin:true —— 雷打在被你打中的那個人**身上**，所以震央本人要吃。（預設是 false，那是給泰坦九頭蛇那種「打 A 濺到 A 身後的 B」用的。）
· radius 3.5 與 maxTargets 5 是**文案沒有給的數字**，兩個都是欄位不是常數：3.5 是這一批 on-hit 範圍傷害的出貨慣例（泰坦九頭蛇 / 丈八蛇矛 / 炎龍巨弩 都是 3.5），maxTargets 5 是為了不讓一發普攻掃掉整波殭屍（省略的話預設是上界 20，見 sim/effects/spreadLimits.ts）。要調就改這裡。

[緩慢]「並使範圍內部隊移動速度下降50%，持續1秒」= damageArea.onHitTargets 的 applyStatus（slow40 + moveSpeedMult 0.5 = 減半，與老衲的棒子 godie-i06n 同一個寫法）。⚠️ 上限跟著雷擊走：最多 5 個（maxTargets，含震央），⛔ 不是「圈內無限人」—— 那是刻意的，理由與 maxTargets 那一段相同。⚠️ 減速仍然是一筆 CC（moveSpeedMult < 1 進 `isCc`），所以免控擋得掉、【淨化】拔得掉、秒數進 ccAppliedTicks 戰績。

[重創]「敵方攻擊時吸血效果降低50%吸血回復量」= onDamageTaken + damageSource:"basic" 的 applyBuff（lifesteal pctMult −0.5，落在**攻擊者**身上 —— onDamageTaken 的事件實體是他，見 sim/combat/damage.ts:772）。持續 3 秒是文案沒給的唯一數字。**stackKey "grievous-wounds" 由四件 [重創] 共用**（晨曦之光 / 貫雷槍 / 雷神之鎚 / 祕銀鎖子甲），因為四段文案都是「降低50%」，兩件疊起來不該變 75%。完整理由（包含 2026-08-01 突變驗證改正的「maxStacks 其實是惰性的」那一段）寫在 祕銀鎖子甲 content/items/godie-i01w.json，不重複。

  </details>

### ✅ 天堂之劍 `godie-i01n`

- ✅ `總生命-50%` — maxHealth 對得上
- ✅ `[暴擊吸血] 6%機率造成10倍暴擊傷害，暴擊時吸血回復100%傷害` — [暴擊吸血] ← __critStrike__

  <details><summary>authoringNote</summary>

  ⭐ 2026-08-18 雙向稽核：2 句效能全部對得上，JSON 沒有卡面沒講的效果，資料未改。
【2026-08-01 owner 重寫，draftEligible 重新開啟】舊的關閉理由是「代價實作了、回報沒有」——原作 I01N 的招牌機制『魂藏』(AIrc ItemReincarnation，死亡時原地復活三次) 沒有實作，卻保留了 生命-500，所以抽到就是純扣血。owner 這次的新文案**整段拿掉了復活**。

『總生命-50%』= modifiers[0] (maxHealth pctAdd -0.5)。

『[暴擊吸血] 6%機率造成10倍暴擊傷害，暴擊時吸血回復100%傷害』= **critStrike**(sim/combat/critStrike.ts 的 CritStrikeGrant)。
· ⚠️ 它**取代**了 2026-08-01 之前的兩條 modifier（critChance flat 0.06 + critDamage flat 8.25，1.75+8.25=10.0）。那個寫法有兩個修不掉的缺陷：(a) critDamage 是聚合屬性，+8.25 之後這位英雄**每一次**暴擊都變 10 倍（含他自己天生的、三選一給的、別件裝備給的），而文案綁的是「6% 的那一次」；(b)『暴擊時吸血回復 100% 傷害』根本寫不出來 —— Stat.Lifesteal 是無條件吸血而且被夾在 [0, 0.8]。兩者**不可並存**（一起寫 = 12% 暴擊率，一半還是舊語意），content/legendaryCritStrike.test.ts 釘死這一點。
· 決策點 → 欄位：`empowers` = ownProcOnly（預設，出貨值）/ everyCrit。預設選前者因為它嚴格較弱 —— 一個已經堆到 40% 暴擊的英雄不會因為撿到這把劍就把 40% 全部變成 10 倍。owner 想要後者在後台改一個下拉即可。
· 決策點 → 欄位：`lifestealMode` = replace（預設，出貨值）/ add。replace 是文案的字面讀法，而且嚴格小於 add。
· 兩個倍率同時成立時**相乘**（`config.crit@1` 的 `critStackMode`，2026-08-09 owner 推翻「取 max」：肉鴿的三選一必須疊得起來，取 max 會讓第二張暴擊卡變廢牌）。
  · ⛔ 舊文寫「維持取 max，因為相乘會直接失控」—— **那句話是對的**：量到天花板 **43.23×**（賽菲洛斯 ownCritMult 4.323 × 10），其餘 110 位也有 30.73×。這把劍對每一位英雄都從 10× 變成 30.7–43.2×，是規則推導的副作用，沒有人點名要它。保險絲是後台的 `critMaxTotalMult`(100) 與 `critSourceCap`(5)；覺得失控就把 `critStackMode` 切回 `max`。
  · ⚠️ 暴擊率外部可疊 +1.193 已超過 [0,1] → 湊滿的人 100% 暴擊，所以 43.23× 只落在 6% 的普攻上，其餘 94% 是 4.323×。本件同時砍半總生命。
· 近戰與遠程**兩條路都接了**：critLifesteal 跟著 DamagePacket（近戰）與 ProjectileComp（遠程）走。只接近戰的話遠程英雄拿到的是一把只有 10 倍傷害、完全不吸血的劍 —— 這正是 damageTypeOverride.ts 檔頭記著的「普攻有兩個 push 站點」那個陷阱。
· 不需要新事件：crit 已經在 basicAttack / basicAttackHit / damage 三個事件上，吸血走的是healTarget(origin:"lifesteal") → heal，而 heal 早就在 net/eventFanout.ts 的 fanned-out 清單裡。

⚠️ **請 owner 看一下這個數字**：10 倍普攻 + 100% 吸血 = 一次 proc 幾乎是滿血回復。以 AD 100 的英雄計，一發 proc 打 1000、吸 1000（扣掉護甲/魔抗與護盾之後的實際掉血量），而這把劍同時把他的總生命砍半。6% × 攻速 1.5 ≈ 每 11 秒一次。這是文案直譯的結果，沒有偷偷夾上限；要調的是 critStrike.damageMult / lifestealFraction 兩個欄位。

  </details>

### ✅ 祕銀鎖子甲 `godie-i01w`

- ✅ `防禦+40` — armor 對得上
- ✅ `魔抗+40%` — mr 對得上
- ✅ `[重創] 敵方攻擊時吸血效果降低50%吸血回復量` — [重創] ← applyBuff

  <details><summary>authoringNote</summary>

  ⭐ 2026-08-18 雙向稽核：卡面 3 句全部對得上、0 句無效，JSON 沒有卡面沒講的效果，資料未改。⚠️ `lifesteal` 雖然 base 是 0，但 [重創] 的 `pctMult` 打的是**對手身上**由裝備/天生技加起來的那個和（管線 (0+Σflat)×(1+ΣpctAdd)×Π(1+pctMult)），所以它**不是**那族「pctMult 掛在加成型屬性上恆為 0」的空頭 —— 對手沒有吸血時它確實不動，而那時候「減吸血」本來就沒有東西可減。

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

🔴 2026-08-18 重算 —— 上面那段換算**已經過期**，卡面的 40% 是假數字。2026-08-10 `STAT_ENV_CHAIN` 給魔抗多了 `magicResistMult`（出貨 **0.2**）⇒ mr 66.7 進 `mitigate()` 時只剩 13.34，減傷 **11.8%**（中位英雄邊際 11.2%）。要真的 40% 需 mr flat 333.3 > `ITEM_MODIFIER_LIMITS.mr` 200。⚠️ description 被 legendary49OwnerText 逐位元釘住 ⇒ ⛔ 這輪不改文案，**提案「魔抗+11.8%」待 owner 核准**。

  </details>

### 📝 瑪那魔杖 `godie-i020`

- ✅ `AP+78` — ap 對得上
- ✅ `魔力+520` — maxMana 對得上
- ✅ `每秒魔力回復速度+12` — manaRegen 對得上
- ❔ `[普通攻擊時] 普攻附加敵方現存 MP 5%傷害，並且回復己方 MP 該傷害量` — 未知標籤 [普通攻擊時] —— 這支工具沒有規則檢查它

  <details><summary>authoringNote</summary>

  ⭐ 2026-08-18 雙向稽核（第一·五守則）：卡面 4 句 → **4 句全部對得上、0 句無效**；反向看 JSON 沒有卡面沒講的效果，資料一個位元未改。⛔ 只修了 authoringNote 自己的一句謊：這一行原本寫「AP+80」，而 modifiers 與卡面都是 **78**（第三守則：註解會說謊）。
AP+78 / 魔力+520 / 每秒魔力回復+12 = modifiers。
[普通攻擊時]「普攻附加敵方現存 MP 5%傷害,並且回復己方 MP 該傷害量」= passive onBasicAttack → damage 的兩個欄位:
  · resourcePct {subject:"target", resource:"mana", basis:"current", perRank:[0.05]}
  · refund {resource:"mana", basis:"hpLost", pct:1}
⚠️ **「該傷害量」讀的是哪一個數字**:refund 不是在 effects 裡算的,它騎在`DamagePacket.refund` 上,由 combat/damage.ts 的排空迴圈在**全域倍率 → 護甲/魔抗 → 格擋 → 護盾**都算完之後付款。basis 預設 "hpLost" = 真的從血條掉下來那一格,也就是玩家看到的浮動數字 —— 所以「回復該傷害量」在畫面上字面為真。在效果端算會拿到「打算打多少」,永遠比畫面大(#125 的形態)。
⚠️ **owner 要看的數字**:敵人滿魔 1,000 → 意圖 50 點 → 乘上 combat-env 的 damageDealt(出貨 0.5)= 25 → 再過魔抗。所以實際回魔約 20 上下,不是 50。要它更有感就調 perRank,或把 refund.basis 改成 "mitigated"(護盾吃掉的也算)。
⚠️ 護盾全吃掉的一下回 0 魔,那是誠實的(那一下沒有造成傷害)。要改成「護盾不影響回收」把 basis 改 "mitigated"。
共用同一個 resourcePct 讀數的還有 熾天使之弓 godie-i012(它是**削魔**不是傷害,走 spendMana.pctCurrentMana)。

  </details>

### 📝 光魔杖 `godie-i027`

- ❔ `[普通攻擊時] 普攻附加消耗自己現存 MP 5%並造成傷害` — 未知標籤 [普通攻擊時] —— 這支工具沒有規則檢查它
- ✅ `AP+ (目前MP的 5%)` — AP 隨**現存** MP 浮動 = StatModifier.fromResource（見 sim/stats/resourceStats.ts） ← __resourceModifier__
- ✅ `每秒魔力回復+18` — manaRegen 對得上

  <details><summary>authoringNote</summary>

  ⭐ 2026-08-18 雙向稽核（第一·五守則）：卡面 3 句 → 2 句原本就對得上，**第 1 句的「現存」被修好了（唯一一處資料改動：`pctMaxMana` → `pctCurrentMana`）**；反向看 JSON 沒有卡面沒講的效果。⛔ 舊 authoringNote 兩處寫「spendMana 沒有 pctCurrentMana 這個欄位」**是過期的**（第三守則）—— 那一格為熾天使之弓 godie-i012 加過了，這件道具只是沒跟上。條件葉同步從「法力 ≥ 5%」改成「法力 > 0」：現存制不會被夾，唯一要擋的只有 0 魔那一發空包彈，⛔ 而 5% 那道門檻卡面上根本沒寫。

[普通攻擊時]「普攻附加消耗自己現存 MP 5%並造成傷害」= passive[0]，用的是 spendMana.bankAs → damage.bankedBonus 這一對原語（sim/effects/spendMana.ts + sim/effects/effectCommon.ts 的 bankedAddend）—— 它本來就是為「效果隨消耗的 MP 放大」而做的（揍敵客 13-002）。
· 「並造成傷害」文案**沒有給數字**。coeff 1 = 燒掉多少魔力就打多少傷害，是這句話唯一自洽的讀法；它是一個欄位。max 400 是**保險絲**不是平衡值：法力池會隨等級與裝備長大（惡夢魔王碎片一件就是 +2200），一條沒有天花板的線性項在後期就是一擊必殺。上界 BANKED_BONUS_MAX 是 1200，400 離它還很遠。
· bankAs.durationSec 1 —— 存款與領款在**同一個 tick、同一個 effects 陣列**裡，1 秒只是不讓一筆沒被領走的存款外溢到下一次揮擊。
· condition「自身法力 > 0」：spendMana 會把扣款夾到池子剩下的量，而 bankAs 記的是**實扣量**，所以 0 魔時這一發是 0 傷害的空包彈（而不是不觸發）—— 這道閘只擋那一種。
· 新增的標記文件：content/status-effects/light-wand-banked.json。
· ⭐ `pctCurrentMana: 0.05` = **現存**魔力的 5%，與文案逐字相同。滿魔時扣得多、殘魔時扣得少，所以這件武器會自己隨著魔量遞減 —— 那正是「消耗現存」的設計形狀。

「AP+ (目前MP的 5%)」= modifiers[0]:`ModOp.PercentOf` + **`fromResource: "mp"`**(stat ap / value 0.05)—— 讀的是**當下**的 hp.mana,不是 maxMana。
· 這是全遊戲第一條**會浮動**的 modifier。`statPipeline` 的第二趟本來只讀「另一條屬性的 pass-1 值」,現在多一個來源域;什麼時候重算由 `sim/stats/resourceStats.ts` 的 `resourceStatSystem` 決定 ——它每 tick 掃一次,但**只有讀數真的變了**才把那個單位打成 dirty,所以滿魔站著不動的英雄一次都不重算,而場上沒有人帶這件裝備時它一個位元都不改(既有 replay/digest 逐位元不變)。
· ⚠️ 「目前 vs 最大」是一個**欄位**不是一個分支:`fromResource: "mp"` ↔ `from: "maxMana"` 同一條 modifier 換一個鍵就切得過去,owner 在後台改一個下拉即可。
· ⚠️ 商店的即時預覽 (`ui/panels/statPreview.ts`) 是在 scratch world 裡 spawn 一個**滿魔**的英雄,所以沒有餵 `manaPct` 的呼叫端看到的是這條加成的**上限值**。那兩個欄位已經加上去了(`manaPct`/`hpPct`,省略 = 1 = 滿資源);把現場魔量接進商店面板的 memo 還沒做,原因與代價寫在 statPreview.ts 的檔頭。
· ⭐ 2026-08-18：上面 passive 的那一半也改成 `pctCurrentMana` 了,所以這件道具的**兩處**「現存 MP」現在讀的是同一個數字,⛔ 不再是一個現存、一個最大。

  </details>

### ✅ 狂暴軒轅劍 `godie-i02e`

- ✅ `攻擊速度+200%` — as 對得上
- ✅ `[暈眩] 10%的機率普攻造成暈眩 0.1秒` — [暈眩] ← applyStatus

  <details><summary>authoringNote</summary>

  ⭐ 2026-08-18 逐句稽核（第一·五守則「不放任何無效說明」）：**兩句效能都對得上，資料與描述一個字都沒改**，這一輪只補上本來缺席的這份備註。

「攻擊速度+200%」= modifiers 的 as **pctAdd 2.0**。管線是 `(base+Σflat)×(1+ΣpctAdd)×Π(1+pctMult)`，所以它是 ×3.0 的加成型 —— 逐字就是「+200%」。⛔ 刻意**不是** pctMult：pctMult 是獨立乘區，兩件同樣寫「+X%」的攻速裝會變成相乘而不是相加，而卡面上的加號說的是相加。
⚠️ 一個誠實的天花板：`config.stat-caps@1` 的 `as.base` 是 **4.0**，而近戰基礎攻速中位數 lv18 約 1.77 —— 也就是說這一件單獨就足以把多數英雄推到夾限附近，再疊第二件攻速裝的收益會被夾掉。要突破 4.0 需要一件帶 `capRaise` 的道具（出貨只有無盡連刃 endless-edge 解到 10.0）。這是**平衡資料**不是這張卡的缺陷，記下來給 owner 看，⛔ 沒有自己改數字。

[暈眩]「10%的機率普攻造成暈眩 0.1秒」= passive[0]。「普攻」= on:"onBasicAttack"；「10%的機率」= chance 0.1；「暈眩 0.1秒」= applyStatus fang-stun duration 0.1 stun:true。
· `target` 省略 = 事件的那個實體（sim/effects/hooks.ts 的 `resolveAgainst`），也就是**被這一刀打中的人**，⛔ 不是持有者 —— 方向是對的。
· duration 0.1 在 schema 的下界 0.034（30 Hz 的一 tick）之上，所以它真的會掛上至少 3 個 tick，⛔ 不會被 round 成 0（那是失敗形態②）。
· fang-stun 有對應的 `content/status-effects/fang-stun.json`，所以 UI 有圖示有名字。

✅ 反向對帳（JSON → 描述）：modifiers 一條、passive 一條，沒有 auras、沒有 sets、沒有 requires 閘 —— 沒有任何「給了但卡面沒講」的效果。recipe / craftRole 是**取得方式**不是效果，照出貨慣例不上卡面。

  </details>

### 📝 幻之匕首 `godie-i039`

- ❔ `[普通攻擊時] 3%機率造成敵方 20%生命傷害` — 未知標籤 [普通攻擊時] —— 這支工具沒有規則檢查它
- ✅ `[閃避] 閃避 + 10%` — [閃避] ← __modifier__

  <details><summary>authoringNote</summary>

  ⭐ 2026-08-18 逐句稽核（第一·五守則「不放任何無效說明」）：**兩句效能都對得上，資料與描述一個字都沒改**，這一輪只補上本來缺席的這份備註。

[普通攻擊時]「3%機率造成敵方 20%生命傷害」= passive[0]。「普通攻擊時」= on:"onBasicAttack"；「3%機率」= chance 0.03；「敵方 20%生命傷害」= `damage.hpPct {basis:"current", perRank:[0.2]}`。
· ⭐ **為什麼是 hpPct 而不是 ratios**：`Scaling.ratios` 讀的是**施法者**的屬性，而這一句講的是**受害者**身上的一塊肉（見 sim/effects/effect.ts 的 hpPct 說明）。`amount: {}` 是刻意的空 —— 這一發的傷害**全部**來自那 20%，沒有任何固定值。
· ⚠️ `basis` 是**文案沒有給**的一格決策：「20%生命」可以讀成現有生命或最大生命，這裡選 `current`（比較保守的那一個 —— 對殘血的人是收尾、對滿血的人才是重擊）。0.2 也在 `HP_PCT_DAMAGE_MAX`(0.35) 之內。要改成 `max` 就改這一個字，⛔ 沒有自己動平衡。
· damageType physical 是第二個**文案沒有給**的值：這是一把匕首的一刀，走物理讓它吃護甲，與同族的死之王的意志（斬殺走 true）刻意不同。

[閃避]「閃避 + 10%」= modifiers 的 evasion **flat 0.1**。⛔ 刻意是 flat 不是 pctAdd/pctMult：`evasion` 是**加成型**屬性，出貨每一位英雄的 base 都是 **0**，而管線 `(base+Σflat)×(1+ΣpctAdd)×Π(1+pctMult)` 在 base=0 時對百分比類的 op **逐位元等於零**（第一·五守則量到的四個陷阱之一）—— 只有 flat 動得了它。0.1 也在 `STAT_CLAMPS.Evasion` 的 [0, 0.8] 之內。
⚠️ `evasion` 只對**普通攻擊**生效（sim/combat/evasion.ts，WC3 Evasion 的保真模型），技能傷害不受影響 —— 卡面寫「閃避」沒有承諾技能，所以不算無效說明，但下一個改這件裝的人要知道。

✅ 反向對帳（JSON → 描述）：modifiers 一條、passive 一條，沒有 auras、沒有 sets、沒有 requires 閘。recipe / craftRole 是取得方式不是效果，照慣例不上卡面。

  </details>

### 📝 天地崩裂魔杖 `godie-i03h`

- ✅ `AP + 255` — ap 對得上
- ✅ `總AP + 10%` — ap 對得上
- 📝 `[暈眩] 施展技能的時候有 5%的機率招喚隕石流星雨，造成範圍 100% AP傷害及 2秒暈眩` — [暈眩] 未實作，authoringNote 已登記

  <details><summary>authoringNote</summary>

  ⭐ 2026-08-18 逐句稽核（第一·五守則「不放任何無效說明」）：三句效能全部對得上，**而且補好了原本半殘的那一句**。

「AP + 255」= modifiers ap flat 255。「總AP + 10%」= 同一條 stat 的 pctAdd 0.1 —— 管線是 `(base+Σflat)×(1+ΣpctAdd)×…`，所以它乘的是**含這件自己那 255 在內的總 AP**，逐字就是「總AP」。

[暈眩]「施展技能的時候有 5%的機率招喚隕石流星雨，造成範圍 100% AP傷害及 2秒暈眩」= passive[0]。
· 「施展技能的時候」= on:"onAbilityCast"（abilitySystem.ts 與 CastResolveSystem.ts 都會發），「5%的機率」= chance 0.05，「100% AP」= ratios ap 1.0，「2秒暈眩」= applyStatus burnstun duration 2 stun:true（burnstun 的文案就是「被火風暴擊暈」，正好是隕石）。
· ⛔ **2026-08-18 修正：暈眩原本掛在 damageArea 的外面**，也就是與傷害**平行**的第二個效果。applyStatus 的受眾是 `ctx.targets`（sim/effects/applyStatus.ts 的 `subjects`），而那是**上游交下來的施法目標**，不是隕石真的砸到的那群人 —— 於是卡面寫「範圍傷害**及** 2秒暈眩」，實際上是「範圍傷害 + 只暈原本那一個目標」，而且**自我指向的技能沒有目標**（ctx.targets 空）時**一個人都不會被暈**。畫面上跟壞掉一模一樣（失敗形態②）。
· ⭐ 修法是**替換成做得到的等效機制**，⛔ 不是刪掉那句話：改用 `damageArea.onHitTargets`（`effect.target-set-chain@1`，sim/effects/victimFilter.ts::runOnHitChain）——它把**這一圈真的打到的那群人**當成 ctx.targets 交給下一段。所以現在「被隕石砸到的每一個人」都吃 2 秒暈，逐字等於卡面，而且自我指向技能那條路也一起活了（圓心退回施法者，砸到誰暈誰）。onHitTargetsMode 省略 = batch（applyStatus 自己就會迭代整群，⛔ 不需要 perTarget，那只有下游是 damageArea/damageLine 這種自己解幾何的 kind 才需要）。runOnEmptyHit 省略 = 打空了不跑。
· radius 4.0 / maxTargets 6 / damageType magic 是**文案沒有給的三個值**，三個都是欄位。4.0 取自同批的死之王的神盾 godie-i061 焚身光環（也是「範圍」沒給數字的那一種），maxTargets 6 與月牙魔杖 godie-i06e 的流星同級。damageArea **不吃** combatEnv.abilityRange，所以 4.0 就是場上的 4.0。includeOrigin true = 震央本人也吃一發（隕石不是普攻濺射，沒有「他已經吃過觸發那一擊」這回事）。

✅ 反向對帳（JSON → 描述）：modifiers 兩條、passive 一條，沒有任何「給了但卡面沒講」的效果。recipe/craftRole 是取得方式不是效果，照慣例不上卡面。

  </details>

### ✅ 反射之盾 `godie-i03m`

- ✅ `[反彈] 反彈普通攻擊傷害 200%` — [反彈] ← damage

  <details><summary>authoringNote</summary>

  w3x 出處:item I03M,abilities = A0C6 + AId5。A0C6 的 base 是 ANth(荊棘光環),data.1.1 = 1.0,物件編輯器後綴寫 (100%);AId5 是 +5 護甲。原作文案是「近戰傷害反彈150%」。

owner 2026-08-01 改寫的文案是 GGD 的規格,三處刻意與原作不同,不是漏做:(1) 200% 而不是 150%;(2) 沒有護甲 +5,所以 modifiers 是空的;(3) 沒有「近戰」限制 —— 而且那個限制目前也表達不出來:`requires` 判的是**持有者**的攻擊型態,不是**攻擊者**的。

實作:onDamageTaken + damageSource:"basic" + damage.incomingPct。basis 留空 = "mitigated"(護甲/魔抗之後、護盾之前);maxChainDepth 留空 = 0 = 反彈不會再被反彈。applyGlobalDamageMult 留空 = false = 反彈**不**再吃一次 combatEnv.damageDealt(三個讀數已經在倍率之後了,再乘一次「200%」就會變成 200%×k —— 2026-08-01 修);whenTooLate 留空 = "drop" = 一發塞不進這個 tick 剩餘排空輪數的反彈不排進佇列。四個預設都寫在 sim/effects/effect.ts 的 incomingPct 說明裡。守衛見 packages/shared/src/sim/effects/incomingReflect.test.ts。

  </details>

### 📝 冰晶虎魄 - 改 `godie-i04d`

- ❔ `[普通攻擊時] 普通攻擊附加冰凍效果，造成緩速 30%，持續0.6秒` — 未知標籤 [普通攻擊時] —— 這支工具沒有規則檢查它
- ✅ `[緩慢] 10%機率寒冰爆，範圍 300點傷害並緩速3秒` — [緩慢] ← applyStatus

  <details><summary>authoringNote</summary>

  ⭐ 2026-08-18 逐句稽核（第一·五守則「不放任何無效說明」）：兩句效能都對得上，**而且補好了原本半殘的那一句**。

[普通攻擊時]「普通攻擊附加冰凍效果，造成緩速 30%，持續0.6秒」= passive[0]（slow30 + moveSpeedMult 0.7 = −30%）。無 chance = 每一刀都掛。

[緩慢]「10%機率寒冰爆，範圍 300點傷害並緩速3秒」= passive[1]。
· chance 0.1 / amount.flat 300 / duration 3 都是文案上的數字，一個都沒有改。
· ⛔ **2026-08-18 修正：緩速原本掛在 damageArea 的外面**，也就是與爆炸**平行**的第二個效果。applyStatus 的受眾是 `ctx.targets`（sim/effects/applyStatus.ts 的 `subjects`），對 onBasicAttack 來說那只有**被這一刀打中的那一個人** —— 於是卡面寫「**範圍** 300點傷害**並**緩速3秒」，實際上是「範圍傷害 + 只緩速被打中的那一個」。範圍裡另外四個人吃了 300 點卻完全不會慢下來，而畫面上跟正常一模一樣（失敗形態②）。
· ⭐ 修法是**替換成做得到的等效機制**，⛔ 不是刪掉那句話：改用 `damageArea.onHitTargets`（`effect.target-set-chain@1`，sim/effects/victimFilter.ts::runOnHitChain）—— 它把**這一圈真的打到的那群人**當成 ctx.targets 交給下一段。`includeOrigin: true` 讓被打中的那個人也在名單裡，所以他照樣吃到 3 秒版本（覆蓋掉自己那 0.6 秒的一份，同 statusId + 同 origin 走 refresh 取較晚的到期）。onHitTargetsMode 省略 = batch —— applyStatus 自己就迭代整群，⛔ 不需要 perTarget。
· 三個**文案沒有給**的值，三個都是欄位：(a) damageType magic —— 「300點傷害」沒講屬性，而這 300 完全不吃攻擊力，所以走魔法；(b) radius 3.5 / maxTargets 5 —— 同批 on-hit 範圍傷害的出貨慣例；(c) 「緩速3秒」沒有給**幅度**，沿用這件道具自己第一行講的 30%（slow30 / 0.7），⛔ 不憑空挑數字。

✅ 反向對帳（JSON → 描述）：沒有 modifiers、沒有 auras，兩條 passive 各對一句。⚠️ 唯一沒寫在卡面上的是 `requiresAttackType:"melee"` —— 那是**發卡限制**不是效果限制（三選一／寶玉不會發給遠程英雄），與無盡連刃 endless-edge 等 7 件帶這一格的道具同一個慣例，所以卡面不提。

  </details>

### ✅ 死之王的神盾 `godie-i061`

- ✅ `[焚身] 每秒造成周圍範圍燃燒 10% AP 傷害` — [焚身] ← damageArea
- ✅ `[腐蝕] 周圍敵方單位防禦 -30%` — [腐蝕] ← __aura__
- ✅ `額外 [死之王套裝] 同時裝備死之王長槍、意志、神盾，則總 AP 額外 + 300%` — 套裝加成 = item@1.sets（一套只發一次，見 sim/economy/itemSets.ts） ← __itemSet__

  <details><summary>authoringNote</summary>

  ⭐ 2026-08-18 逐句稽核（第一·五守則「不放任何無效說明」）——**這一件抓到一個真的反了的符號**。

[焚身]「每秒造成周圍範圍燃燒 10% AP 傷害」= passive[0]。「每秒」= on:"onInterval" + internalCooldown 1（⛔ onInterval 漏填 ICD 會變成每 tick 一次，schema 有 refine 在擋）；「10% AP」= damageArea ratios ap 0.1；damageType magic 與 radius 4 / maxTargets 5 是**文案沒有給**的三個值，三個都是欄位 —— radius 4 與下面那圈腐蝕靈氣**刻意同半徑**，讓玩家看到的「周圍」只有一個圈。includeOrigin 省略 = false，而 onInterval 沒有震央，所以這一格在這裡本來就無關。

[腐蝕]「周圍敵方單位防禦 -30%」= auras[0]（affects enemy，armor pctMult **-0.3**）。
⛔ **2026-08-18 修正：這一格出貨時寫的是 `0.7`。** 管線是 `(base+Σflat)×(1+ΣpctAdd)×Π(1+pctMult)`（sim/stats/statPipeline.ts:183 `pctMult *= 1 + m.value * stacks`），所以 `0.7` 的意思是 **×1.7 = 敵人護甲 +70%**，正好是卡面那句話的**反面** —— 一件寫著「敵方防禦 -30%」的傳說裝，實際上在幫敵人加護甲。作者顯然想寫的是「×0.7」，而這一格收的是**加成**不是倍率本身。改成 -0.3 之後 ×0.7，逐字等於卡面。
⭐ 同批的另外兩圈減益靈氣都是負值（四魂之玉 godie-i00z 的 as/ms 各 -0.5、死之王的意志 godie-i060 的 ms -0.5「減半」），所以出貨慣例本身沒有分歧，分歧的只有這一格。

[死之王套裝]「同時裝備死之王長槍、意志、神盾，則總 AP 額外 + **300%**」= sets 區塊（ap pctAdd **3**）。⚠️ 這一段的舊備註寫的是「+ 100%」，而卡面與資料都是 300% —— 三份套裝文件的備註是同一段複製的，一起更正（第三守則：註解會說謊）。三份文件各自帶一份**一模一樣**的 sets 區塊（pieces 三件、requiredPieces 省略 = 全部）；獎勵不是掛在每一件上，而是 sim/economy/itemSets.ts 依 set id 掛**一個** `item-set:` 來源 —— 每件各掛一份才會變成 +300%×3。重算點在 economy/itemSource.ts 的 attach/detachItemSource，所以買 / 賣 / 反悔 / 三選一 / 商店預覽全都會重跑。守衛：sim/lichkingSet.test.ts 與 sim/economy/itemSets.test.ts。

✅ 反向對帳（JSON → 描述）：modifiers 不存在、passive 只有一條、auras 只有一圈、sets 一份 —— 沒有任何「給了但卡面沒講」的效果。

  </details>

### 📝 妖物碎殺牙 `godie-i06a`

- ✅ `攻擊力+112` — ad 對得上
- ✅ `吸血+15％` — lifesteal 對得上
- ❔ `[普通攻擊時] 6%機率造成255傷害，持續3秒` — 未知標籤 [普通攻擊時] —— 這支工具沒有規則檢查它

  <details><summary>authoringNote</summary>

  ⭐ 2026-08-18 逐句稽核（第一·五守則「不放任何無效說明」）：**三句效能都對得上，資料與描述一個字都沒改**，這一輪只補上本來缺席的這份備註。

「攻擊力+112」= modifiers 的 ad flat 112。
「吸血+15％」= modifiers 的 lifesteal **flat 0.15**。⛔ 刻意是 flat：`lifesteal` 是**加成型**屬性（出貨每位英雄 base 0），而管線 `(base+Σflat)×(1+ΣpctAdd)×Π(1+pctMult)` 在 base=0 時讓百分比類的 op 逐位元等於零 —— 只有 flat 動得了（第一·五守則量到的四個陷阱之一）。0.15 在 `stat-caps` 的 `lifesteal.base` 0.8 之內。
⚠️ `lifesteal` 在 combat/damage.ts 是被 `pkt.origin === "basic"` 閘住的，也就是**只吸普攻**；技能那一半是另一格 `spellVamp`。卡面寫「吸血」沒有承諾技能，所以不算無效說明 —— 但要做成「全能吸血」得同時填兩格。

[普通攻擊時]「6%機率造成255傷害，持續3秒」= passive[0] 的 `dot`。「6%機率」= chance 0.06；「持續3秒」= durationSec 3；「造成255傷害」= **amountPerTick 85 × intervalSec 1 × 3 跳 = 255**。
· ⭐ 這一句最容易寫錯的地方就是那個 85：`tickOnApply` 省略 = **不在施加當下付一跳**（sim/effects/dot.ts:197 `firstTick = world.tick + intervalTicks`），所以 3 秒 / 每秒一跳正好是 **3 跳**，⛔ 不是 4 跳。填 255/跳 會變成 765 總量，填 tickOnApply:true 會變成 340 —— 兩種都會讓卡面說謊。
· damageType physical 是**文案沒有給**的值（「255傷害」沒講屬性）：這是牙咬出來的流血，走物理讓它吃護甲，也與這件裝自己的 ad/吸血同一條路。
· stacking 省略 = `refresh`（同一位持有者再觸發時只是把窗口推後，⛔ 不會疊成兩份），onCasterDeath 省略 = `continue`。兩個都是欄位，⛔ 沒有寫死。

✅ 反向對帳（JSON → 描述）：modifiers 兩條、passive 一條，沒有 auras、沒有 sets、沒有 recipe、沒有 requires 閘 —— 沒有任何「給了但卡面沒講」的效果。⚠️ 卡面的「15％」用的是全形百分號（owner 原文），⛔ 沒有順手改成半形。

  </details>

### ✅ 斬龍刀 `godie-i06d`

- ✅ `攻擊力+128` — ad 對得上
- ✅ `防禦+12` — armor 對得上
- ✅ `[暴擊] 20%機率造成 2倍傷害` — [暴擊] ← __modifier__

  <details><summary>authoringNote</summary>

  ⭐ 2026-08-18 雙向逐句稽核（第一·五守則「不放任何無效說明」）：三句效能全部有實作、資料與描述一個字都沒改。

「攻擊力+128」= modifiers ad flat 128（ITEM_MODIFIER_LIMITS.ad 上界 400，沒有被夾）。
「防禦+12」= modifiers armor flat 12。
「[暴擊] 20%機率造成 2倍傷害」= critChance flat 0.2 ＋ critDamage flat **0.25**。

⚠️ 那個 0.25 看起來像打錯，它不是：`Stat.CritDamage` 是**倍率本身**而不是加成，出貨的每一張英雄卡 baseStats.critDamage 都是 **1.75**（BasicAttackSystem 的 `sc.final[Stat.CritDamage] || 1.75` 是同一個數字），所以 1.75 + 0.25 = **2.00** —— 正是卡面那個「2倍」。⛔ 把它「修好」成 2.0 會變成 3.75 倍。combat-env 的 `critDamage` 出貨倍率是 1.0，`config.stat-caps@1` 也沒有夾 critDamage/critChance，所以面板與實打都是 2.00 —— 這一條不是那種「上限解不開所以逐位元無效」的空 modifier。

⚠️ 這一件**刻意不用** `critStrike`（天堂之劍 godie-i01n 的那一格）。那一格是「自己一條機率＋自己一條倍率」的獨立骰，與 critChance/critDamage 兩條 modifier **不可並存**（legendaryCritStrike.test.ts 逐件釘死）。本件走的是普通暴擊，所以它會跟英雄自己的暴擊率**相加**，而那正是卡面「20%機率」的讀法。

⚠️ JSON→描述 方向（同族缺陷：給了但不說）：**沒有**任何卡面沒講的效果 —— 無 passive、無 block、無 aura、無 requires 閘、無 requiresAttackType。`craftRole`/`recipe` 是 w3x 來源記錄不是效果。

  </details>

### ✅ 月牙魔杖 `godie-i06e`

- ✅ `[流星] 流星每秒造成 100% AP 範圍傷害（距離越遠流星傷害越低）` — [流星] ← damageArea
- ✅ `AP+369` — ap 對得上
- ✅ `魔抗+66.7%` — mr 對得上

  <details><summary>authoringNote</summary>

  ⭐ 2026-08-18 雙向逐句稽核（第一·五守則「不放任何無效說明」）：三句效能全部有實作，卡面一個字都沒改。
「[流星] 流星每秒造成 100% AP 範圍傷害（距離越遠流星傷害越低）」= passive[0]：
· 「每秒」= `onInterval` hook + `internalCooldown: 1`。⛔ 節奏**不是** damageArea 自己的欄位（IntervalHookSystem 決策 1：那會是第二個冷卻概念）。道具來源的 ICD 還會再乘後台 `combatEnv.itemCooldown`（出貨 1.0，所以現在字面就是每秒）。
· 「100% AP」= `amount.ratios [{stat:ap, coeff:1}]`，damageType magic（吃魔抗）。
· 「範圍」= `damageArea`，圓心 = hook 的 `target:"self"` ⇒ `ctx.targets[0]` = 持有者自己（damageArea.ts 的 `areaCentre` 第一順位是事件受害者，而 self hook 的受害者就是持有者）。所以它是一圈**繞著自己**落下的流星，⛔ 不是打在某個被害者身上。
· 「距離越遠流星傷害越低」= `falloff 0.35`：線性衰減，圓心吃滿額、半徑邊緣吃 0.35 倍。
⚠️ 卡面**沒有寫**、但資料上真的存在的兩個限制（給了但不說，登記在這裡而不是假裝沒有）：`radius 5`（damageArea 的半徑**不吃** combatEnv.abilityRange，與技能 AoE 不同）與 `maxTargets 6`（近的先、同距離 id 小的先）。兩個都是「範圍傷害」這四個字沒有否定的東西，但要不要寫上卡面是 owner 的決定 —— description 是他親筆而且被 legendary49OwnerText 逐位元釘住。
⚠️ 這一件**沒有綁 VFX**：叫「流星」而畫面上只有傷害數字。要補是特效線的工作，不是這一輪。
「AP+369」= modifiers ap flat 369（ITEM_MODIFIER_LIMITS.ap 上界 400，剛好在裡面；stat-caps 的 ap 是 500000 所以沒有被夾）。

【2026-08-01 owner 裁定「魔抗的 % 是減傷比例」】引擎的魔法減傷是 100/(100+mr)，所以 mr = 100·r/(1-r)。r=1.00（100% 減傷）需要 mr=∞，用 mr 永遠表達不出來 —— 字面上的『魔抗+100%』等於完全魔法免疫，owner 選擇不走真免疫路徑，改成一個讀得出來的數字。採用 mr 200（ITEM_MODIFIER_LIMITS 的上界，不需要動那道 mis-parse 護欄）= 66.7% 減傷，文案同步改成 66.7% 讓描述與資料一致（這一批的核心原則就是描述不可以說謊）。註：月牙魔杖這個值正好等於本批之前出貨的 mr 200，w3x 來源 AIsr『降低的傷害 0.5』則是 50%，見 docs/content/reconciliation/items.md。

🔴 2026-08-18 重算 —— 上面那段換算**已經過期**，卡面的 66.7% 是假數字。2026-08-10 `STAT_ENV_CHAIN` 給魔抗加了第二格 `magicResistMult`（出貨 **0.2**，content/config/combat-env.json），而 `finalizeStat` 是 (base+Σflat)×defense×magicResistMult ⇒ 這件的 mr 200 送進 `mitigate()` 時只剩 **40**，減傷 100/(100+40) ⇒ **28.6%**（對 mr 28 的中位英雄，邊際減傷 27.5%）。要真的做到 66.7% 需要 mr flat **1001.5**，遠超 `ITEM_MODIFIER_LIMITS.mr = 200` 那道 mis-parse 護欄 ⇒ 走不通。⚠️ description 被 `legendary49OwnerText.test.ts` 逐位元釘住（本件已列在 `_sanctionedRewrites`），所以⛔ 這一輪一個字都沒改 —— **提案把卡面改成「魔抗+28.6%」，等 owner 核准**；核准後要同時更新 fixture 與那筆理由。

  </details>

### ✅ 獸人船長十字鎬 `godie-i06j`

- ✅ `[暈眩] 11%機率攻擊附帶暈眩1秒` — [暈眩] ← applyStatus

  <details><summary>authoringNote</summary>

  ⭐ 2026-08-18 雙向逐句稽核（第一·五守則「不放任何無效說明」）：唯一那句效能有實作，卡面一個字都沒改。

「[暈眩] 11%機率攻擊附帶暈眩1秒」= passive[0]，三個詞逐一對上：
· 「攻擊附帶」= `onBasicAttack`（普攻那一發），⛔ 不是 onDamageDealt —— 那會把技能傷害與 DoT 每一跳都算成一次機會，等於偷偷把 11% 變成好幾倍。
· 「11%機率」= `chance: 0.11`。骰子在 hooks.ts，失敗的一次不燒內部冷卻。
· 「暈眩」= `stun: true`。sim 裡「不能動作」就是這一格（movementHold／abilitySystem／CastResolveSystem／BasicAttackSystem／RecoverySystem 全部讀它）；root 只擋位移，沒有 silence。
· 「1秒」= `duration: 1` → 30 Hz 下 30 tick（applyStatus 的 `Math.round(duration/dt)`，不是被 round 吃掉的邊界值）。

⚠️ **2026-08-18 改了一個欄位：statusId `burnstun` → `stun`。** `burnstun`（content/status-effects/burnstun.json）是**火焰**風味的具名變體 —— 名字寫「Searing Stun」、描述寫「Stunned by the firestorm.」、標籤帶 `fire` —— 掛在一把十字鎬上，玩家的狀態列會出現一個跟這件道具毫無關係的火焰圖示。⛔ 這不是機制缺陷（statusId 是 soft ref，機制照樣動），是 **UI 說謊**，跟第一·五守則同一個方向。`stun` 是出貨的通用那一份（「這是通用的那一份 —— 帶名字的那幾種是同一種硬控的不同張臉」），正是這種沒有特殊風味的硬控該指的。機制、機率、秒數、rng 抽取順序**一個都沒有動**。

⚠️ **刻意沒有 `internalCooldown`**：卡面只寫機率沒有寫冷卻，補一個 ICD 等於安靜地把 11% 打折（同一批的 殺豬刀 godie-i06g 就帶著一個 owner 沒裁決過的 3 秒 ICD，那一件的 note 也把它記成待決）。要收節奏是 owner 的決定，不是稽核線的。
⚠️ JSON→描述 方向：**沒有**任何卡面沒講的效果 —— 無 modifiers、無 block、無 aura、無 requires 閘。

  </details>

### ✅ 老衲的棒子 `godie-i06n`

- ✅ `[緩慢] 10%機率攻擊附帶移動速度減半，持續 4秒` — [緩慢] ← applyStatus

  <details><summary>authoringNote</summary>

  ⭐ 2026-08-18 雙向逐句稽核（第一·五守則「不放任何無效說明」）：唯一那句效能**機制上**有實作，但有一處 **UI 標籤說謊**要 owner 裁決（見下）。

「[緩慢] 10%機率攻擊附帶移動速度減半，持續 4秒」= passive[0]：
· 「攻擊附帶」= `onBasicAttack`（普攻那一發），⛔ 不是 onDamageDealt。
· 「10%機率」= `chance: 0.1`。
· 「移動速度減半」= `moveSpeedMult: 0.5`（**乘算**）。⛔ 刻意不用 ms 的 flat/pctAdd：那兩個會跟英雄自己的移速加成、加速道具、以及 `config.stat-caps@1` 的 ms 上限（18／解鎖 24）混在同一個加總裡，「減半」就會變成「減某個數字」——對走得快的人是輕傷、對走得慢的人是釘死。乘算才是卡面那個字。
· 「持續 4秒」= `duration: 4`。

✅ **2026-08-18 同日稍後已修（出路①）**：`statusId` 原本是 `slow40` 而這一發實際減 50%，狀態列那顆圖示會對玩家說 40%。已新增 `content/status-effects/slow50.json` 並把 statusId 指過去。⛔ 沒有動 `moveSpeedMult`（玩家實際吃到的那一半本來就是對的 —— 真的減半）、⛔ 沒有動 description（owner 親筆，被 `legendary49OwnerText.test.ts` 逐位元釘住）。改的只有標籤。
守衛：`packages/shared/src/content/slowLabelMatchesMultiplier.test.ts` —— statusId 裡的數字必須等於同一格 moveSpeedMult 換算出來的減速，⛔ 兩邊都從內容推導，不抄名單。

⚠️ JSON→描述 方向（給了但不說）：**沒有**任何卡面沒講的效果 —— 無 modifiers、無 block、無 aura、無 requires 閘、無 internalCooldown。

  </details>

### 📝 血染八月 `godie-i06o`

- ✅ `攻擊力+88` — ad 對得上
- ❔ `[普通攻擊時] 攻擊敵方額外造成 88流血傷害，持續3秒` — 未知標籤 [普通攻擊時] —— 這支工具沒有規則檢查它
- ✅ `[暈眩] 50%機率造成 0.01秒暈眩` — [暈眩] ← applyStatus

  <details><summary>authoringNote</summary>

  [普通攻擊時]「攻擊敵方額外造成 88流血傷害，持續3秒」= passive[0]（dot 29.33 × 3 跳 = 88，總量對得上文案）。

[暈眩]「50%機率造成 0.01秒暈眩」= passive[1]，chance 0.5。
· ⚠️ **duration 出貨值是 0.034 而不是文案的 0.01，這是刻意的，需要 owner 過目。**sim 是 30 Hz，applyStatus 換算是 expiresAtTick = tick + Math.round(duration/dt)（sim/effects/applyStatus.ts）。0.01 秒 → Math.round(0.3) = **0 tick** → 這個暈眩一次都不會發生，是一個玩家永遠拿不到的功能（CLAUDE.md 失敗形態 ②）。0.034 秒 = 1 tick，是這個引擎表達得出來的**最短**暈眩，也就是「0.01 秒」這個玩笑在 30 Hz 底下唯一能落地的樣子。同一個 30 Hz 地板在 content/schema/effect.ts 的 grantAttribute.durationSec（.min(0.067)）與 cycleBuff.steps[].duration 都有寫。
· 它是一個欄位：owner 想要文案的字面 0.01（也就是明知它不會發生）只要把這個數字改回去。
· statusId 用 fang-stun（出貨的極短僵直標記，緣一零式 godie-i013 與 消失的密室 godie-i02d 的 0.1 秒暈眩用的是同一個）。

⭐ 2026-08-18 雙向逐句稽核（第一·五守則「不放任何無效說明」）：三句效能全部有實作，資料與描述一個字都沒改。
· 「攻擊力+88」= modifiers ad flat 88（ITEM_MODIFIER_LIMITS.ad 上界 400）。
· 流血的算術**真的驗過**：`dot` 不填 `tickOnApply` ⇒ 第一跳在施加後一個間隔（30 tick），`expiresAtTick` 是**閉區間**（dotTick.ts 的 INCLUSIVE 註解），所以 intervalSec 1 × durationSec 3 = 在 +30/+60/+90 tick 各一跳 = **正好 3 跳**。29.33×3 = 87.99 ≈ 卡面的 88。⛔ 不是 4 跳（那會變成 117，而「持續3秒」這句就開始說謊）。
· JSON→描述 方向（給了但不說）：兩條 hook **都沒有** internalCooldown，也沒有 modifiers 以外的常駐、沒有 block、沒有 aura、沒有 requires 閘 —— 卡面沒提的東西資料裡也沒有。唯一的偏差就是上面那條 0.01→0.034 秒，而它已經是 30 Hz 表達得出來的最短值。

  </details>

### 📝 福音書 `book-of-gospel`

- ❔ `[福音] 每次使用基礎技能（Q／W／E）累積 1 頁〔福音〕，最多 4 頁；每頁使自身造成的傷害・治療・護盾 +8%（四頁 ×1.32）` — 未知標籤 [福音] —— 這支工具沒有規則檢查它
- ❔ `[福音] 集滿四頁後的下一個基礎技能進入〔既定未來〕：接下來 3 秒內的傷害・治療・護盾再 +60%（與頁數合計約 ×1.92），並返還該格 50% 剩餘冷卻。每回合限一次` — 未知標籤 [福音] —— 這支工具沒有規則檢查它

  <details><summary>authoringNote</summary>

  ⭐ 2026-08-18 稽核：**描述已改寫成只講真的會發生的事**，owner 原文與四處落差的完整逐句對照移到 `docs/legacy/_item-authoring-notes-full.md`（本檔 2000 字上限，⛔ 不截斷原文）。三句話的摘要：①「**不同**基礎技能」沒有實作而且與「最多 4 頁」互相矛盾（基礎技只有 Q/W/E 三格），②「×1.08 每頁」實際是**線性 +8%**（四頁 ×1.32 而不是 1.36），③「之後清空」沒有機制，改成**每回合限一次**，所以既定未來那一發實際是 ×1.92（頁 +0.32 疊 +0.60）。以下是實作對照。

[福音]「使用基礎技能時累積頁，最多 4 頁」= Q/W/E **三條同型 hook**（一張表，⛔ 不是三段 if）：onAbilityCast + abilitySlot。R 是終極技（WorldHookSystem 用 `slot==="R"` 切出 onUltimateCast）、EX 是寶具，兩者都不是基礎技能所以不在表上。一頁 = applyBuff stackKey "gospel-page" + maxStacks 4 + statusId "gospel-page"（⭐ statusId 讓下面三段用 `condition.status.minStacks` 問得到層數 —— 標記與數值是**同一份**來源，不會出現「圖示還在、條件讀不到」），permanent + permanentScope:"round"。
「每頁使下一個不同技能效果 ×1.08」= 輸出倍率三軸各 flat 0.08。
⚠️ 降級①：**線性，不是複利**。三軸的讀取點是 `1 + final[stat]`（sim/stats/outputMult.ts），多份加成只會相加，所以 4 頁是 ×1.32 而不是 owner 算的 1.08^4 = ×1.36。⛔ 這不是選錯 stackKey：這族屬性本身表達不出複利（pctMult 乘一個底值 0 還是 0）。
⚠️ 降級②：「**不同**基礎技能」做不到 —— 沒有「這一發跟上一發是不是同一支」的條件葉，所以同一格連放四次也會累到 4 頁。
「四頁後下一個技能進入『既定未來』，效果 ×1.60 並返還 50%剩餘冷卻」= 每條 hook 的前三個 effect，共用同一個 condition（已有 4 頁 **且** 這一回合還沒用過）。它排在「加一頁」**前面**是刻意的：湊滿第 4 頁的那一發不會自己觸發，下一發才會 —— 正是文案的「四頁**後**下一個技能」。×1.60 = 三軸各 flat 0.60；duration 3 秒是**一段窗口**而不是「只有這一發」—— hook 在施放那一刻發射、傷害之後才落地，所以觸發它的那一發一定吃得到，但 3 秒內的其他輸出也會一起吃到（引擎沒有「只放大這一次施放」的界）。描述因此寫「接下來 3 秒內」，⛔ 不寫「該次」。返還冷卻 = modifyCooldown mode:reduce / basis:remaining / amount 0.5 / who:self / slot 指自己這一格 —— modifyCooldown **必須**指名 slot，而 hook 讀不到「剛剛放的是哪一格」，三條 hook 各自指名自己那一格就是為了避開這件事。
⚠️ 降級③：「之後清空」做不到（引擎沒有拔掉指定 buff 的機制；dispel 是整池的）。改成**一回合只發一次**：effects[2] 掛 permanent+round 的標記 "gospel-fated-future-spent"，條件裡的 not 讀它，回合開始由 clearRoundScoped 拔掉。代價是頁數留著，所以既定未來那一發實際是 +0.32 疊 +0.60 = ×1.92，而不是清空後的 ×1.60。
⚠️ G7（讀「這一發/這一次的量」，例如已付魔力）引擎沒有，但這張卡的原文沒有用到它 —— 「50%剩餘冷卻」讀的是冷卻剩餘量，那是 modifyCooldown 的 `basis:"remaining"`，已經有了。

  </details>

### ✅ 近擊的巨人鎧 `bulwark-charge-greaves`

- ✅ `裝甲+100` — armor 對得上
- ✅ `每秒生命回復+12` — healthRegen 對得上
- ✅ `[衝刺] 力量主屬性的近戰英雄施放技能時向前衝刺 4.5 距離（冷卻 8 秒）` — [衝刺] ← dash

  <details><summary>authoringNote</summary>

  逐句對照（2026-08-18 稽核）：
「裝甲+100」= modifiers armor flat 100。✅
「每秒生命回復+12」= modifiers healthRegen flat 12（`Stat.HealthRegen` 的單位就是每秒）。✅
「[衝刺] …施放技能時向前衝刺 4.5 距離（冷卻 8 秒）」= passive[0]：onAbilityCast + internalCooldown 8 + dash mode:"forward" maxDistance 4.5。✅
· `speed` **16** 是文案沒有給的（owner 只給了距離與冷卻），它是一個欄位 —— 16 u/s ⇒ 4.5 距離約 0.28 秒衝完。⚠️ 這一行以前寫「speed 18」而 JSON 是 16，第三守則的形狀（註解說謊），2026-08-18 改成讀得到的那個數字。
· ⚠️ 道具來源的 `internalCooldown` 還會再乘後台 `config.combat-env@1` 的 `itemCooldown`（出貨 1.0），所以「8 秒」是後台可調的。
⭐ **2026-08-18 改的是描述，不是資料**：hook 上一直掛著 `requires: {attackType:"melee", primaryStat:"STR", onMismatch:"block"}`（只有**力量近戰**英雄衝得動），而描述從頭到尾沒有提。量到的代價：出貨名冊 78 張卡裡符合的只有 **25 張（32%）**，也就是三分之二的持有者拿到一件「裝甲+100、回復+12、然後什麼都不會發生」的鎧甲 —— 正是 owner 2026-08-18「不放任何無效說明」要消滅的形狀。
⛔ 我沒有拿掉 `requires`：那是**平衡改動**（把一件限定裝變成通用裝），不是把說明講清楚。改的是描述那一行，現在它說得出真的會發生的事。
⚠️ owner 若認為這件鎧甲本來就該人人可衝，修法只改資料、兩選一：(a) 整格拿掉 `requires`；(b) 保留閘但 `onMismatch:"reduced"` + `mismatchScale`（不符條件的人衝短一點）。**兩者都要記得把描述那一行改回去。**
⚠️ `requires` 是 **equip time** 解析（`economy/itemSource.ts`），但 hook 這一半是 **fire time** 解析（`content/requirement.ts`），所以變身跨越近戰／遠程時衝刺會跟著變 —— 這是刻意的，不是缺陷。

  </details>

### 📝 致命魂之首輪 `collar-of-the-deadly-soul`

- ❔ `[成長曲線解放] 力量、敏捷、智慧各 +30` — 未知標籤 [成長曲線解放] —— 這支工具沒有規則檢查它
- ❔ `[不再浪費] 達到等級上限後，每擊殺一名敵方英雄使攻擊力・法強・護甲・魔抗・生命上限・魔力上限・攻速・移速各 ×1.05，最多 5 層（乘算，五層約 ×1.28）` — 未知標籤 [不再浪費] —— 這支工具沒有規則檢查它

  <details><summary>authoringNote</summary>

  ⚠️ owner 裁決**換做法**（GH#354）：G22（經驗取得倍率／升級屬性成長倍率）與 G9（溢出轉換）兩個機制都不做，所以整張卡改成用既有機制表達的近似。owner 原句留底，⛔ 不要讓它消失：「戰鬥經驗取得 -50%，但升級獲得的所有屬性成長 ×2.5。達到等級上限後，原本取得的經驗不再浪費，每累積一個等級需求量，使全部屬性 ×1.05，最多 5 層。」
[成長曲線解放]「升級獲得的所有屬性成長 ×2.5」→ attributes {str:30, agi:30, int:30}。理由：這個引擎的「屬性成長」就是英雄文件 growth 的每級三圍成長，而**沒有任何欄位乘得動它** —— 道具的 attributes 是一次性的授予，不是成長係數。唯一寫得出來的近似是把「到等級上限為止多出來的那一份成長」壓成一個常駐三圍加成。⚠️ 代價寫在明處：它從第 1 級就全額到手，所以這張卡沒有「曲線」，只有結果。
⚠️ 「戰鬥經驗取得 -50%」**整條沒有實作**：全 repo 沒有任何逐英雄的經驗取得倍率（config.match@1 的 progression 只有全域的 xpBase / xpPerLevel / xpKill / xpAssist / xpRoundSurvive）。所以這件寶具目前是純收益，比 owner 的設計強。⛔ 這裡刻意**不發明**一個替代懲罰 —— 那跟靜默丟掉一句話一樣是改設計。要補回代價需要 G22。
[不再浪費]「達到等級上限後…每累積一個等級需求量，使全部屬性 ×1.05，最多 5 層」= passive[0]。
· 觸發：「一個等級需求量的經驗」讀不到（同上），改用 onKill + victim: "enemyChampion" 近似 —— 擊殺敵方英雄是一場比賽裡最大的一筆經驗。
· 門檻：condition level >= 18。⚠️ 18 是 config.match@1 progression.levelCap 的**抄本**，那一格被調過的話這裡不會跟著動（條件葉沒有「讀設定」的寫法）。改 levelCap 時要記得回來改這個數字。
· 「×1.05，最多 5 層」是**複利**（1.05^5 ≈ ×1.276），所以**不填 stackKey** + maxStacks: 5；填了 stackKey 會被折成 1+0.05×5 = ×1.25 的線性。
· 「×1.05，最多 5 層」是**複利**（1.05^5 ≈ ×1.276），⛔ 所以不填 stackKey（填了會被折成 1+0.05×5 的線性）；maxStacks 5 在複利路徑上也吃得到（GH#354/G1，用 `buff:<origin>#` 前綴數份數）。
· ⭐ 2026-08-18：描述原本寫「**全部屬性** ×1.05」，而 modifiers 只有 ad / ap / armor / mr / maxHealth / maxMana / as / ms **八條** —— 那是一句對不上的說明，已把描述改成逐條列出。
⛔ 為什麼不乾脆補滿：`pctMult` 折的是 `(base+Σflat)×(1+ΣpctAdd)×Π(1+pctMult)`，而 critChance / critDamage / cdr / lifesteal / evasion / spellVamp / 三條輸出倍率的 base 都是 **0**，×1.05 還是 0 —— 補上去是九格永遠不生效的設定（失敗形態②）。剩下真的動得了的只有 healthRegen / manaRegen / range，加它們是**平衡改動**不是把說明講清楚，所以留給 owner 決定。
· ⚠️ as 的一般上限 4.0、ms 的上限 18（`content/config/stat-caps.json`，後台可調；這一行 2026-08-18 更正，先前寫「14」是舊值）。已經頂到上限的人拿不到那兩條的乘算 —— 不是缺陷，是兩個天花板取低。
· permanent 沒有填 permanentScope，也就是**整場**：owner 的文案是「原本取得的經驗不再浪費」，那是一個進度性的東西，不是一回合的狀態。

  </details>

### ✅ 無盡連刃 `endless-edge`

- ✅ `[神速] 攻擊速度上限提升至 10 (預設上限為4)` — [神速] ← __modifier__
- ✅ `[疊層] 每次普攻命中攻擊速度增加10%，可無限疊加，1秒內沒有新的普攻命中則全部層數歸零` — [疊層] ← applyBuff

  <details><summary>authoringNote</summary>

  ⭐ 2026-08-18 逐句稽核（第一·五守則「不放任何無效說明」）：**三句效能全部對得上，資料與描述一個字都沒改**。真的跑起來量到的：一位攻速被夾在 4.00 的英雄裝上它之後解到 4.62（上限真的搬到 10），連續 30 刀後 10.00（每刀 +10% 線性，撞到解鎖上限），停手 1 秒後**一次掉回 4.62**（不是逐層掉）—— 逐句就是卡面那三句。
⚠️ 唯一沒寫在卡面上的是 `requiresAttackType:"melee"`，那是**發卡限制**不是效果限制（三選一／寶玉不會發給遠程英雄），與其餘 6 件帶這一格的道具同一個慣例，所以卡面不提。

[神速]「攻擊速度上限提升至 10」= modifiers 的 ModOp.CapRaise（as → 10.0）。CapRaise **不給任何數值**，只把天花板搬高（sim/statCaps.ts 的 effectiveCap 再夾一次到 config.stat-caps@1 的 unlocked）；要真的打到 10 還是得靠下面的疊層或別件裝備。
[疊層]「每次普攻命中攻擊速度增加10%，可無限疊加，1秒內沒有新的普攻命中則全部層數歸零」= passive[0]，而且**三句話都是逐字對上的**，不要「順手修好」它：
· 「增加10%」= applyBuff modifiers as pctAdd 0.1；
· 「可**無限**疊加」= **故意不寫 maxStacks**（sim/effects/applyBuff.ts：`const cap = e.maxStacks ?? Number.POSITIVE_INFINITY`）。加一個上限就是改掉這張卡。
· 「1秒內沒有新的普攻命中則**全部**層數歸零」= duration 1 + stackKey。⚠️ 這一點很容易被誤讀成「每層各自 1 秒、會逐層掉」：**不會**。stackKey 讓所有層共用**同一個** ModifierSource，而每次命中都會把那一個 source 的 expiresAtTick 整個往後推（applyBuff.ts 的 stacking path）。所以層數是一起活、一起死的 —— 正是文案說的「全部歸零」。

  </details>

### 📝 指貫手套 `fingerless-gloves`

- ❔ `[計算式解放] 攻擊力 +20%` — 未知標籤 [計算式解放] —— 這支工具沒有規則檢查它
- ❔ `[計算式解放] 攻擊力每跨過一道門檻（120／140／160／180／200／220／240／260／280／300），最終攻擊力再 ×1.03，最多 10 段乘算` — 未知標籤 [計算式解放] —— 這支工具沒有規則檢查它

  <details><summary>authoringNote</summary>

  ⭐ 2026-08-18 逐句稽核：**兩句效能都對得上，資料與描述一個字都沒改**。真的跑起來量到的：ad 398 的身體十道門檻全部跨過 → ×**1.344** = 1.03¹⁰ 逐位對上「10 段乘算」；ad 158 只跨三道 → ×1.093 = 1.03³。⇒ 十個各自的 stackKey 真的是十份獨立來源。
⚠️ 一級沒裝備的身體（ad 38）一道都跨不過 —— 那是絕對門檻的必然，不是缺陷（見下面降級①）。

[EX解放] owner 規格 #53（貓耳貓／手部裝備）。⚠️ owner 2026-08-17 已裁決**換做法**：原文「**每擁有 20% 額外攻擊力**，使最終攻擊力額外 ×1.03，最多 10 次乘算」是一個**連續函數**（層數由屬性推導），而那是 G6，引擎**沒有實作** —— 沒有任何機制能把「一條屬性的讀數」換算成「幾層」。降級成 **10 道固定絕對門檻**的階梯。

逐句：
「攻擊力 +20%」（這件道具自己的貢獻，也是階梯的起跳燃料）= modifiers ad pctAdd 0.2。
「使最終攻擊力額外 ×1.03，最多 10 次乘算」= passive 的 10 段 applyBuff，每段 ad pctMult 0.03。
· ⭐ **每段各自一個 stackKey**（r01..r10）+ maxStacks 1 ⇒ 身上最多 10 份**獨立來源**，statPipeline 把每份各乘一次 ⇒ 1.03¹⁰ ≈ **×1.344**，正是「10 次乘算」。
· ⛔ 十段**不可以**共用一個 stackKey：同一份來源內 pctMult 折成線性（1+0.03×10 = ×1.30），那不是乘算。
· maxStacks 1 讓一段永遠只有一份，⛔ 不會自己疊到無限。
⚠️ **降級①（門檻是絕對值，不是相對量）**：條件葉只讀得到面板最終 ad，讀不到「額外 ad 佔基礎的幾成」。門檻取 120/140/…/300，錨是 **ad 的硬上限 21200 = L18 母體中位 × 200 ⇒ 中位 ≈ 106**，取整 100 當基準、每 20% = +20 ad。後果：基礎攻擊力高的英雄比較快爬完，低的比較慢 —— 原文那個比例式對每個人一樣。
⚠️ **降級②（回授）**：條件讀的是**含較低段加成之後**的面板 ad，所以低段可以把人推過高段門檻。有界（最多 10 段）、決定性，⛔ 但它不是原文那個純函數。
⚠️ 驅動是 onInterval + internalCooldown 1（每秒重評），duration 2 ⇒ 掉出門檻兩秒內自動退掉。**onInterval 只在 combatActive 時發射**，所以商店／回合間看不到這些層數（面板會少算），進場一秒內補齊。
⚠️ 道具來源的 internalCooldown 還會再乘後台 combat-env 的 itemCooldown。

  </details>

### 📝 至尊魔戒 `godie-i004`

- ✅ `魔力+1000` — maxMana 對得上
- ❔ `技能吸血+20%` — 無法分類（純敘述？還是漏掉的機制？）
- ✅ `[隱身] 永久隱身 (不會被主動索敵)，但攻擊會現身，無動作 3秒後再次隱身。` — [隱身] ← __vision__

  <details><summary>authoringNote</summary>

  [隱身] = item@1 的 vision.stealthFadeDelaySec = 3，直接對上文案的「無動作 3秒後再次隱身」。「攻擊會現身」不需要另外寫：sim/stealth.ts 的淡入計時本來就由「有沒有動作」驅動，攻擊會把它重置。「不會被主動索敵」也已經是既有規則 —— config.stealth@1 的 blocksAutoAcquire 預設 true。w3x 出處 Apiv（永久隱形術），同族的 27-00 用 fade 4.0；這裡用 owner 文案自己給的 3 秒。

【先前紀錄】【仍缺】[隱身]「永久隱身 (不會被主動索敵)，但攻擊會現身，無動作 3秒後再次隱身」。
原語存在但**道具接不到**：zVisionGrant（packages/shared/src/content/schema/effect.ts）帶 stealthFadeDelaySec / trueSightRadius，而 sim/stealth.ts:258 的 syncVisionGrants 是走 `sc.sources` 的 —— 任何一個 ModifierSource 都可以帶它。缺的只有兩樣：(a) zItemDef 沒有 `vision` 欄位，(b) sim/economy/itemSource.ts 沒有把它轉發到 kind:"item" 的 source 上。今天只有 ability@1 的 passive rank 寫得出來。
文案把兩個數字都給了：stealthFadeDelaySec = **3**（「無動作 3秒後再次隱身」，正好對應 WC3 Apiv 的 Dur 欄；27-00 永久性的隱形術 出貨 4.0）。所以這一件不需要任何設計決定，只需要那兩行接線。
已落地：魔力+1000（maxMana flat 1000）。

  </details>

### 📝 雅典娜的驚嘆號 `godie-i006`

- ✅ `AP+333` — ap 對得上
- ✅ `AP+33%` — ap 對得上
- ✅ `每秒魔力回復速度+13` — manaRegen 對得上
- ❔ `[普通攻擊時] 每次攻擊造成造成額外 33% AP傷害` — 未知標籤 [普通攻擊時] —— 這支工具沒有規則檢查它

  <details><summary>authoringNote</summary>

  逐句對照（2026-08-18 稽核，這份文件在此之前**沒有** authoringNote）：四句效能全部對得上，**資料與描述一個字都沒改**。
「AP+333」= modifiers ap flat 333。✅
「AP+33%」= modifiers ap pctAdd 0.33。✅ ⚠️ 這一條**不是**那四個結構性 no-op 的形狀：屬性管線是 `(base+Σflat)×(1+ΣpctAdd)×Π(1+pctMult)`，`ap` 有真的 base（來自智慧），而且同一件武器自己就給了 flat 333 —— 所以 pctAdd 乘的是「英雄基礎 AP + 333 + 其他 flat」，一定動得了。（⛔ 會逐位元無效的是掛在 base=0 的加成型屬性上的 **pctMult**，這裡兩個條件都不成立。）
「每秒魔力回復速度+13」= modifiers manaRegen flat 13（`Stat.ManaRegen` 的單位就是每秒）。✅
「[普通攻擊時] 每次攻擊造成造成額外 33% AP傷害」= passive[0] 的 damage（damageType magic、ratios ap 0.33）。✅ ratios 讀的是**施法者**面板（effects/effectCommon.ts::casterStats），而那份面板已經含上面兩條 —— 所以 333 與 +33% 會回頭放大這一發，是**同一件武器內部**刻意的自乘。onBasicAttack 的發射點在迴避／失手兩道閘之後，所以「每次攻擊」＝每次真的命中。
⚠️ 描述裡的「造成造成」是 w3x 匯入留下的疊字，⛔ **沒有動它** —— 它不是效能宣稱，而 owner 的文案逐字為準（第〇·六守則）。同一個疊字也在 虛哭神去 godie-i007 上，是同一批匯入的痕跡。
⚠️ 「神器」與 `tier: 2` 不衝突：前者是 w3x 時代的稀有度字樣（寫在描述第一行），後者是經濟層的階，兩者從匯入起就不是同一根軸。
⛔ 這件武器**沒有** requiresAttackType、沒有 hook `requires` —— 遠程英雄拿到它四句話全部有效，所以卡面沒有任何隱藏的閘要交代。

  </details>

### 📝 霸王破甲槍 `godie-i00f`

- ❔ `[穿透] 普攻無視敵方 100% 護甲` — 未知標籤 [穿透] —— 這支工具沒有規則檢查它
- ✅ `總防禦+10%` — armor 對得上
- ✅ `總攻擊+10%` — ad 對得上

  <details><summary>authoringNote</summary>

  【2026-08-12 改機制】owner「霸王破甲槍⋯改成百分百穿透」⇒ [穿透]「普攻無視敵方 100% 護甲」= penetration {scope:"basic", armorPct:1}。⛔ damageTypeOverride 整格刪除。
· 為什麼不是同一件事：真傷與 100% 穿透在**數字**上不同（護甲 ≥ 0 兩者相同；護甲被【破防】打成負數時真傷仍是 1.0×，而穿透走雙分支放大，最高 config.mitigation@1 的 negativeResistAmplifyCeiling 倍），在**型別**上也不同（穿透維持 physical：照樣被奇門盾甲的格擋擋得下、被物理/無型別護盾吃掉、照樣觸發反傷與 on-physical）。⇒ 這一次改動對玩家是「打負護甲更痛、但更容易被擋/被護盾吃」，不是純強化。
· 機制：sim/combat/penetration.ts（段③百分比穿透 → 段④扁平穿透 → 雙分支曲線），由 sim/combat/damage.ts 的兩個 mitigate* 呼叫。⚠️ 段③④ 對**已經 ≤ 0 的抗性完全無效**（LoL 明文），所以這把槍不會把 −27 的護甲抹成 0。
· 另一條路 Stat.ArmorPen 仍然被否決，理由多一條：Stat 記不住**範圍**（這一件只穿普攻），而且 stat pipeline 的折疊產不出 % 穿透要的乘法互補 1 − Π(1−xᵢ)。
· requiresAttackType:"melee" 不動。總防禦+10%（armor pctAdd 0.1）、總攻擊+10%（ad pctAdd 0.1）不動。
守衛：packages/shared/src/sim/combat/penetration.test.ts（機制 + 這份出貨文件的雙向 ratchet）。

⭐ 2026-08-18 逐句稽核（第一·五守則）：**三句效能雙向都對得上，資料與描述一個字都沒改**。
⚠️ 讀法登記一次，免得下一輪有人「順手補上魔抗」：「總防禦/總攻擊」的「總」是**總量的百分比**（乘在 base+Σflat 上），⛔ 不是「所有防禦型別」——「總攻擊+10%」只可能是 ad（沒有第二條攻擊屬性），同一個句型的「總防禦+10%」因此也只是 armor。要讓它連 magicResist 一起加是**平衡改動**（多一條 modifier），⛔ 不是把說明講清楚，所以留給 owner。
⚠️ armor / ad 的 pctAdd 都乘在有真 base 的屬性上，⛔ 不是那四個結構性 no-op 的形狀（會逐位元無效的是掛在 base=0 加成型屬性上的 pctMult）。
⚠️ requiresAttackType:"melee" 是**發卡限制**（roll 之前的濾網），不是效果限制，所以卡面不提 —— 沒有人會拿到一張招牌是死的槍。

  </details>

### ✅ 落魂的嗜血劍 `godie-i00l`

- ✅ `攻擊力+128` — ad 對得上
- ✅ `[神速] 攻擊速度+200%，攻速上限提升到10 (預設上限為4)` — [神速] ← __modifier__
- ✅ `全能吸血+30%` — lifesteal 對得上
- ✅ `每秒損失 3%現存生命` — 每秒扣『現存生命的 %』= onInterval + damage(hpPct current) ← damage

  <details><summary>authoringNote</summary>

  四行效能全部落地：攻擊力+128、[神速] 攻速+200% + capRaise 10.0（ModOp.CapRaise，見 sim/statCaps.ts 與 GH#286）、吸血+30%、「每秒損失 3%現存生命」= passive[0]（onInterval + internalCooldown 1 + true damage hpPct basis "current" 0.03，打自己）。

✅ 已落地（2026-08-11，GH#309）：「全能吸血+30%」= `lifesteal` 0.3 + `spellVamp` 0.3 **兩格**。`Stat.SpellVamp` 是 2026-08-10 加的，分流在 `sim/combat/damage.ts` —— 閘是 `pkt.origin.startsWith("ability:")`（不是「非 basic 就算」）。⛔ 不是第三條屬性。上限兩層都查過：Zod band 1（schema/common.ts 的 ITEM_MODIFIER_LIMITS）、runtime clamp 0.8（statTypes.ts）—— 0.3 兩端都不會被靜默吃掉。

  </details>

### ✅ 天叢雲劍 `godie-i014`

- ✅ `攻擊速度+30%` — as 對得上
- ✅ `總移動速度*1.2` — ms 對得上
- ✅ `[飛昇] 移動轉變為無視碰撞的飛行形態` — [飛昇] ← __flight__

  <details><summary>authoringNote</summary>

  ⭐ 2026-08-18 逐句稽核（第一·五守則「不放任何無效說明」）—— **三句效能全部對得上，資料一個位元都沒改**。⚠️ 舊備註裡那段「【仍缺】[飛昇]…道具接不到」已經**作廢並刪除**：`zItemDef.flight` 與 sim/economy/itemSource.ts 的轉發早就補上了（守衛 sim/economy/itemVisionFlight.test.ts 用**出貨文件**驗），而那段話與同一份備註第一行「[飛昇] = item@1 的 flight」直接矛盾 —— 那正是第三守則說的「註解會說謊」。

「攻擊速度+30%」= `as pctAdd 0.3`（出貨攻速上限 base 4.0；這件沒有 capRaise，所以它只能把人推到 4.0）。
「總移動速度*1.2」= `ms pctMult 0.2`。⭐ **文案寫的是乘號**，所以是 `pctMult`（乘區）而不是 `pctAdd`（加成相加）—— 兩者在只有這一件時同值，帶第二件加速道具時才分岔，而卡面說的是「總」。出貨 ms 上限 base 18 / unlocked 24。
[飛昇]「移動轉變為無視碰撞的飛行形態」= `flight`。「無視碰撞」拆成兩個既有旗標：`ignoreUnits`（穿人）+ `ignoreObstacles`（穿障礙物）。
· ⭐ `stayInsideBoundary` 留在預設的 **true** 是刻意的，而且是承重的：文案說的是「無視碰撞」，⛔ 不是「可以飛出競技場」。飛出邊界會直接繞過**火圈**這個回合結束機制，而決鬥判定 / teamAliveInZone / 小地圖三個下游都會開始推理一個不在任何地方的英雄。理由逐字在 zFlightGrant 的註解裡。
· `hoverHeight` 留空（沿用預設）—— 文案沒有給高度，⛔ 不該由我發明一個數字。

⛔ **JSON → 描述方向也乾淨**：這份文件除了上面三項沒有任何其他效果（沒有 passive、沒有 auras、沒有 block、沒有 sets），所以不存在「給了但卡面沒說」的那一半。

  </details>

### 📝 死之王的長槍 `godie-i01d`

- ✅ `攻擊力額外增加 17%` — ad 對得上
- ✅ `[無視] 普通攻擊無視防禦給予傷害` — [無視] ← __damageTypeOverride__
- ❔ `[普通攻擊時] 普攻附加敵方現存 MP 10%傷害，並且回復敵方最大 MP 10%` — 未知標籤 [普通攻擊時] —— 這支工具沒有規則檢查它
- ✅ `額外 [死之王套裝] 同時裝備死之王長槍、意志、神盾，則總 AP 額外 + 300%` — 套裝加成 = item@1.sets（一套只發一次，見 sim/economy/itemSets.ts） ← __itemSet__

  <details><summary>authoringNote</summary>

  ⭐ 2026-08-18 逐句稽核（第一·五守則「不放任何無效說明」）—— 四句效能全部對得上，而且**補回了唯一一句零實作的**：「敵方現存 MP 10%傷害」。

[普通攻擊時]「普攻附加敵方現存 MP 10%傷害，並且回復敵方最大 MP 10%」= passive[0] 的兩個 effect：
· 「回復敵方最大 MP 10%」= `restore {manaPct: 0.1}`。hook 的 `target` 省略 = 事件實體 = 被你打的那個人，`restore` 讀的是目標自己的最大值（WC3 SetUnitManaPercentBJ）—— 連這件道具的笑點（「幫對方補魔就是我的攻擊方式」）都逐字在。
· ⭐ **【2026-08-18 落地】「敵方現存 MP 10%傷害」** = `damage.resourcePct {subject:"target", resource:"mana", basis:"current", perRank:[0.1]}`。這一句在此之前是**整句空的**，而 `content:build` 與全套測試都是綠的 —— 舊備註寫的「damage 沒有魔力的對應物」在 GH#299 的 `zResourcePctTerm` 上線後就變成假話（第三守則）。形狀直接照 瑪那魔杖 godie-i020 「普攻附加敵方現存 MP 5%傷害」那一份抄，同一個 schema、同一個讀取器（sim/effects/dynamicTerms.ts::resourcePctAmount）。上界：`subject:"target"` 的 ratio 模式是 RESOURCE_PCT_RATIO_MAX = 1，0.1 遠低於它。
· ⚠️ **順序上的一個已知偏差，故意留著，請主控端裁決**：卡面的順序是「先傷害、後補魔」，而出貨的 `effects[]` 是「先補魔、後傷害」。`resourcePctAmount` 在**發射當下**求值（damage 才進佇列），所以傷害讀到的是**補魔之後**的現存 MP ⇒ 每一下多出 `0.01 × 目標最大魔力`（1,000 魔的目標約 +10 點）。⛔ 沒有把 damage 放到 index 0，是因為 `sim/economy/legendaryTags.test.ts` 用 `effects[0]` 硬索引釘住 restore，而這一輪不准動 packages/。正解是那條測試改成 `find(kind==="restore")`，再把兩個 effect 對調。

「攻擊力額外增加 17%」= `ad pctAdd 0.17`。
[無視]「普通攻擊無視防禦給予傷害」= `damageTypeOverride {scope:"basic", becomes:"true"}`，與 霸王破甲槍 godie-i00f 同一個機制。蓋的地方在**傷害佇列**（combat/damage.ts → combat/damageTypeOverride.ts），⛔ 不是 BasicAttackSystem —— 那裡蓋的話遠程普攻（ProjectileSystem）拿不到，是失敗形態②。⚠️ 它只重蓋**那一發普攻封包**的型別；上面兩個 hook effect 是獨立的，補魔與 MP 傷害不受它影響（MP 傷害自己填 magic，會吃魔抗）。
[死之王套裝]「同時裝備死之王長槍、意志、神盾，則總 AP 額外 + 300%」= `sets` 的 `ap pctAdd 3`。三份成員文件各帶一份相同區塊，獎勵依 set id 只發**一份** `item-set:` 來源（⛔ 不是每件各發一份）。機制在 sim/economy/itemSets.ts，守衛在 sim/lichkingSet.test.ts。⚠️ 平衡註記（量到的，不是估的）：它與 惡夢魔王碎片 godie-i067（也是 +100% AP）同一個 pctAdd 桶，兩者齊帶時 AP 是 base×(1+3+1) —— 要不要封頂是 owner 的決定，這裡沒有偷偷夾。

  </details>

### 📝 仙后座 `godie-i01s`

- ✅ `[迴避] 25%物理傷害迴避，迴避成功時瞬間移動 (前進一小段距離)` — [迴避] ← __modifier__
- ❔ `[淨化] 每 1 秒移除自己身上的一個減益` — 未知標籤 [淨化] —— 這支工具沒有規則檢查它
- ✅ `最大魔力+100%` — maxMana 對得上
- ✅ `每秒回魔+25` — manaRegen 對得上
- ❔ `冷卻縮減+50%` — 無法分類（純敘述？還是漏掉的機制？）

  <details><summary>authoringNote</summary>

  ⭐ 2026-08-18 雙向稽核（第一·五守則「不放任何無效說明」）：卡面 5 句 → 4 句原本就對得上，**第 1 句的後半「迴避成功時瞬間移動」原本是零實作，這一次補上（唯一一處資料改動）**；反向看 JSON 沒有任何一條效果是卡面沒講的。

『[迴避] 25%物理傷害迴避』= modifiers 的 evasion flat 0.25（ITEM_MODIFIER_LIMITS 帶 0..1，STAT_CLAMPS 再折到 [0,0.8]；判定在 sim/combat/evasion.ts）。⚠️ 引擎的迴避**只擋普通攻擊**（evasion.ts 決策 1，那是 WC3 `Aevd` 的忠實移植，也是 12-00／74-00／92-00 三支天生技共用的同一條），所以一發**物理型別的技能**傷害不會被它閃掉。這是卡面比引擎寬的唯一一處，⛔ 沒有偷偷改成別的意思 —— 要不要讓技能也可迴避是引擎級的設計題（`rollEvadeAbility` 已經存在，開關在別處），列給 owner。

『迴避成功時瞬間移動 (前進一小段距離)』= **passive[0]**：`onEvade`（`WorldHookSystem` 的那一列，持有者＝**閃掉的那個**、target＝攻擊者）→ `dash{mode:"forward"}`。⛔ 舊 authoringNote 寫的「onEvade 不是一個掛鉤事件、item 存不下位移」**兩句都過期了**（第三守則）：`onEvade` 在 2026-08-06 那批世界事件裡就有了，而 `zItemHookDef.effects` 吃的是同一份 `zEffectDef`，dash 一直在裡面。
· 距離用 `distanceTier: "小"`（owner 2026-08-11「原則上不寫範圍數字」），speed/maxDistance 填的就是那一級距自己的兩個數字（16 / 5.5），⛔ 沒有自己挑值 —— 級別會贏，改後台「位移級距」頁就一起改。
· ⚠️ **降級一處**：文案寫「瞬間移動」而 `dash` 是**有速度的位移**（5.5 ÷ 16 ≈ 0.34 秒，會被地形擋）。真瞬移是 `blink`，但 blink 的目的地只有「指定點／目標身上／集結到施法者」三種，而一個 hook 沒有點可以指 —— 「往面向前方一小段」在 blink 的詞彙裡寫不出來。要精準需要 blink 多一個 `to:"forward"`。
· ⛔ **刻意不加 internalCooldown**：卡面說的是「迴避成功時」，加一道沒有寫在卡上的冷卻就是第二種說謊。

『[淨化] 每 1 秒移除自己身上的一個減益』= passive[1]（A4b/#278）：節奏寫在 `internalCooldown: 1`（onInterval 沒填它 = 每 tick 發 30 次/秒）。`count: 1` = 一次解一層，所以連續控場仍然壓得住它。`polarity: "debuff"` 讓它不會把自己的增益也吃掉。
『最大魔力+100%』= maxMana pctAdd 1.0。『每秒回魔+25』= manaRegen flat 25。『冷卻縮減+50%』= cdr flat 0.5（config.stat-caps@1 的 cdr 上限 0.99，這一格拿得到）。

【沿革】2026-08-01 之前 draftEligible 是關的，理由是「完全沒有 payload」——三個陣列都空，抽到什麼都拿不到。owner 重寫文案給了實際數值之後開回來；今天連最後那半句也不再是空頭支票。

  </details>

### 📝 螺旋劍 `godie-i01v`

- ❔ `[普通攻擊時] 每次普通攻擊皆會施展螺旋擊，直線範圍造成魔力5%傷害，同時消耗1%魔力` — 未知標籤 [普通攻擊時] —— 這支工具沒有規則檢查它
- ✅ `攻擊速度+100%` — as 對得上
- ✅ `移動速度+2` — ms 對得上

  <details><summary>authoringNote</summary>

  ⭐ 2026-08-18 雙向稽核（第一·五守則）：卡面 3 句 → **3 句都對得上、0 句無效**；反向看 JSON 沒有卡面沒講的效果，資料一個位元未改。
⚠️ 唯一要記一筆的是「魔力」的讀法：卡面兩處（傷害係數 5% 與消耗 1%）都**沒有寫「現存」還是「最大」**，兩處都取 `maxMana`，⭐ 重點是**兩處取同一個**（同一句話裡的同一個詞不可以一半讀最大一半讀現存）。⚠️ 對照組：光魔杖 godie-i027 的卡面**明寫「現存 MP」**，所以那一件 2026-08-18 改用 `pctCurrentMana` —— 兩件的差別來自文案的差別，⛔ 不是實作不一致。要把這一件也改成現存制是 owner 的裁決（差異：滿魔時相同，半魔時扣款與傷害都減半）。

[普通攻擊時]「每次普通攻擊皆會施展螺旋擊，直線範圍造成魔力5%傷害(On-Hit)，同時消耗1%魔力」= passive[0]。
· 「直線範圍」= damageLine（sim/effects/damageLine.ts）。出貨前例是 18-00 薔薇荊棘之刃（content/abilities/godie-nsjs.passive.json）：同樣是 onBasicAttack 拉一條「我 → 被打的那個人」方向的走廊。
· 「消耗1%魔力」= spendMana pctMaxMana 0.01，而且**先扣再打**（effects 陣列的順序就是執行順序）。hook 的 condition「自身法力 ≥ 1%」是照 20-01 風王結界 的模型寫的：spendMana 自己不做門檻判斷（sim/effects/spendMana.ts 的檔頭講了三個理由），所以少了這個 condition，空魔的英雄會**免費**拿到螺旋擊。
· 「魔力5%傷害」= ratios maxMana 0.05。⚠️ zScaling 讀的是施法者的**最終屬性表**，也就是 maxMana（最大魔力），不是現存魔力 —— 文案只寫「魔力」沒有寫「現存」，所以這裡取讀得到的那一個並寫在這裡，不是無聲的解讀。
· length 3.6 / width 1.2 / maxTargets 5 / includeOrigin false 是**文案沒有給的**，四個都直接沿用薔薇荊棘之刃的房規（3 個身位長 × 1 個身位寬；被普攻打中的那個人不再吃一次，因為他已經領過普攻本身了）。四個都是欄位。

  </details>

### ✅ 消失的密室 `godie-i02d`

- ✅ `防禦+100` — armor 對得上
- ✅ `魔抗+66.7%` — mr 對得上
- ✅ `[神速] 攻擊速度+100%，上限提升至10 (預設上限為4)` — [神速] ← __modifier__
- ✅ `移動速度+4` — ms 對得上
- ✅ `[暈眩] 4%的機率普攻造成暈眩 0.1秒` — [暈眩] ← applyStatus

  <details><summary>authoringNote</summary>

  ⭐ 2026-08-18 雙向稽核（第一·五守則「不放任何無效說明」）：卡面 5 句 → **5 句全部對得上、0 句無效、0 句偏差**；反向看 JSON 也沒有任何一條效果是卡面沒講的。資料一個位元未改。⛔ 但我當時「順手把 [暈眩] 與 解說 之間多出來的一個空行拿掉」，**當天已還原** —— 這 49 支是 owner 2026-08-01 親筆交來的，被 `packages/shared/src/content/legendary49OwnerText.test.ts` **逐位元釘死**，而空白也是位元組。那個多出來的空行是原稿就有的，⛔ 不是髒資料；真要清是「更新 fixture ＋ 寫進 _sanctionedRewrites」，那是 owner 的刻意動作。⚠️ 純排版、玩家看不出差別，所以這一項是三件裡**提案優先度最低**的。逐句：
· 「防禦+100」= armor flat 100。
· 「魔抗+66.7%」= mr flat 200，換算見下面那一段。
· 「[神速] 攻擊速度+100%，上限提升至10 (預設上限為4)」= **兩條** modifier：as pctAdd 1.0（真的把值推上去）＋ as capRaise 10.0（只搬天花板）。⭐ 兩條缺一不可：capRaise **本身不給任何數值**，而 pctAdd 沒有它會被 `effectiveCap` 夾在 4.0。⚠️ `config.stat-caps@1` 的 `as` 是 base 4.0 / unlocked 10.0，**這是出貨 13 條上限裡少數真的有解鎖空間的一條**，所以這條 capRaise ⛔ 不是那族「unlocked === base 因此逐位元無效」的空頭（守衛 `noOpModifierClaims.test.ts` 從 config 推導那張名單）。卡面括號裡的「預設上限為4」與 config 的 base 逐字相同。
· 「移動速度+4」= ms flat 4。
· 「[暈眩] 4%的機率普攻造成暈眩 0.1秒」= passive[0]（chance 0.04 / applyStatus fang-stun / stun true / duration 0.1）。⚠️ 0.1 秒是**硬控**，吃 `HARD_CC_MAX_DURATION_SEC` 那條較嚴的上界，離它很遠；下界是 0.034（一個 tick），0.1 安全落在裡面 ⛔ 不會被 round 成 0 tick。

【2026-08-01 owner 裁定「魔抗的 % 是減傷比例」】引擎的魔法減傷是 100/(100+mr)，所以 mr = 100·r/(1-r)。r=1.00（100% 減傷）需要 mr=∞，用 mr 永遠表達不出來 —— 字面上的『魔抗+100%』等於完全魔法免疫，owner 選擇不走真免疫路徑，改成一個讀得出來的數字。採用 mr 200（ITEM_MODIFIER_LIMITS 的上界，不需要動那道 mis-parse 護欄）= 66.7% 減傷，文案同步改成 66.7% 讓描述與資料一致（這一批的核心原則就是描述不可以說謊）。註：月牙魔杖這個值正好等於本批之前出貨的 mr 200，w3x 來源 AIsr『降低的傷害 0.5』則是 50%，見 docs/content/reconciliation/items.md。

  </details>

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

### ✅ 傲慢水龍王 `godie-i06f`

- ✅ `總 AP 額外 + 300%` — ap 對得上
- ✅ `每秒回魔 + 7` — manaRegen 對得上

  <details><summary>authoringNote</summary>

  ⭐ 2026-08-18 雙向逐句稽核（第一·五守則「不放任何無效說明」）：兩句效能都有實作、資料與描述一個字都沒改。

「總 AP 額外 + 300%」= modifiers ap **pctAdd 3.0**。屬性管線是 `(base+Σflat)×(1+ΣpctAdd)×Π(1+pctMult)`，所以 pctAdd 3.0 = 總 AP **×4**。「總」這個字正是選 pctAdd 而不是 flat 的理由 —— 它吃的是**加總之後**的 AP（英雄自己的智慧換算 + 其它裝備的 flat 都算進去），寫成 flat 就變成一個固定值、跟「總」無關。
⚠️ 它也**不可以**寫成 pctMult：pctMult 那一族的陷阱是掛在 base=0 的加成型屬性上會 0×任何東西=0，而 ap 有 base 所以兩種都動得了；選 pctAdd 是因為卡面講的是**相加**的 +300%（多件同時帶會線性相加），⛔ 不是複利。
⚠️ 3.0 剛好坐在 `ITEM_PERCENT_LIMIT`（schema/common.ts，出貨 3）上 —— 再高一格 Zod 就會整份拒收這份文件。要調高得先動那個帶寬。
⚠️ 這一條**不是**那種「上限解不開所以逐位元無效」的空 modifier：`config.stat-caps@1` 的 ap 是 500000/500000，量到的最強 AP 組合是 4,125.7，離天花板還有兩個數量級。

「每秒回魔 + 7」= modifiers manaRegen flat 7（單位本來就是每秒；ITEM_MODIFIER_LIMITS.manaRegen 上界 50）。

⚠️ 解說裡的「因為三個老婆所以三倍!?」是**風味台詞**不是效果（CLAUDE.md 第〇·六守則②：`「」` 是對白）—— ⛔ 不要把它讀成第三條 modifier，也不要把「三倍」跟上面的 ×4 對帳。
⚠️ JSON→描述 方向（同族缺陷：給了但不說）：**沒有**任何卡面沒講的效果 —— 無 passive、無 block、無 aura、無 requires 閘。

  </details>

### 📝 炎神弩 `godie-i06i`

- ✅ `攻擊力+42` — ad 對得上
- ✅ `攻擊速度+60%` — as 對得上
- ❔ `[普通攻擊時] 攻擊額外造成 10-1000 傷害，敵我距離越遠傷害越高 (0~10)(冷卻1秒)` — 未知標籤 [普通攻擊時] —— 這支工具沒有規則檢查它

  <details><summary>authoringNote</summary>

  攻擊力+42 / 攻擊速度+60% = modifiers。
[普通攻擊時]「攻擊額外造成 10-1000 傷害,敵我距離越遠傷害越高 (0~10)」= passive onBasicAttack → damage.distanceScale {atRange:10, near:10, far:1000}(sim/effects/dynamicTerms.ts)。文案把三個數字都給了,所以這一件沒有任何設計決定:near/far/atRange 一一對應 10 / 1000 / (0~10)。線性內插,沒有曲線 —— sim/purity.test.ts 禁 `**` 與三角函式(火圈的縮圈法則也因此是線性的)。
距離取的是**施法者與受害者的平面距離**,在 hook 觸發那一刻讀 transform:近戰路徑在 BasicAttackSystem 揮擊落點、遠程路徑在 ProjectileSystem 的**命中**那一刻(所以是箭矢飛完之後的兩點距離,那正是「敵我距離」的讀法)。
⚠️ **owner 一定要看的數字 —— 這是這一批最大的一個**:文案的 far = **1000**。MEASURED(出貨 champion range,單位就是這裡的 sim 單位):
    近戰 range 1.6  → 10 + 990×0.16 ≈ **168**
    遠程 range 6.0  → ≈ **604**
    遠程 range 8.2  → ≈ **822**   (11 位英雄是這一格)
    遠程 range 12.0 → 夾在 atRange=10 → **1000**
  ⚠️ **2026-08-18 更正(第三守則)**:這一段原本寫「再乘 combat-env damageDealt(出貨 0.5)分別約 84/302/411/500,而 maxHealth 倍率 3 下一條血約 1,350」—— 那兩個出貨值都變了。現在 `damageDealt` 是 **1.0**(所以上面那四個數字就是最終傷害本身,不用再對折)、`maxHealth` 是 **4.0**(一條血約 1,800)。另外距離讀的是**場上實際**兩點距離,而普攻射程會先被 `attackRange`(出貨 0.6)壓一次,所以真實落點落在那四個數字**以下**。要精確的數字得重量一次,⛔ 不要把上面那四個當成量到的現值。
⚠️ **owner 2026-08-01 裁定「冷卻1 秒」**,所以這條 hook 現在帶 `internalCooldown: 1`(秒)。**純內容改動**:節奏閘早就在 sim/effects/hooks.ts(絕對 tick 比較,`world.tick - hookLastFired < icdTicks`),一行 sim 都沒動。實際效果是這一發**每秒最多一次**,所以上面那四個 168 / 604 / 822 / 1000 現在是「每秒的上限」而不是「每一下」——攻速再高也不會讓它變快,這正是 owner 要收的那一條。
⭐ **2026-08-18 雙向稽核結清了這一條**:這一段原本寫「文案沒有寫冷卻⋯卡片目前少講了一個真實限制」——**現在卡面自己寫著「(冷卻1秒)」**,那句話從這天起是假的,已刪(第三守則)。描述→JSON 與 JSON→描述 兩個方向現在都是滿的:卡面三句(攻擊力/攻擊速度/距離傷害含冷卻)逐一有實作,而資料裡沒有任何卡面沒講的東西(無 modifiers 以外的常駐、無 block、無 aura、無 requires 閘)。
⚠️ 冷卻長度是**欄位不是政策**:拿掉 `internalCooldown` 就回到「每一下都打」,填 3 就是三秒一次;道具來源的 ICD 還會再乘後台 combat-env 的 `itemCooldown`(hooks.ts 的 `src.kind === "item"` 那一行),所以全域節奏也調得動。
⚠️ schema 上界 DISTANCE_SCALE_DAMAGE_MAX = 3000,工作是擋住多打一個零(10000),**不是**壓制 1000 —— 壓制它等於竄改文案。
⚠️ 方向是資料不是程式:near > far 就是「越近越痛」,一樣寫得出來。
damageType 選 magic(炎神),吃魔抗。

  </details>

### ✅ 鍊金術之盾 `godie-i06q`

- ✅ `[嘲弄] 每秒吸引周圍敵人優先攻擊自己，持續 0.5秒` — [嘲弄] ← taunt
- ✅ `[煉金術] 受敵人攻擊時，有 10%機率將直接將 HP 低於 5% 的敵人變成黃金 (敵方單位直接死亡，黃金數量為敵方等級)` — [煉金術] ← damage

  <details><summary>authoringNote</summary>

  [嘲弄] = passive[0]。「每秒」是 internalCooldown: 1（不是 taunt 效果自己的欄位 —— 節奏一律由 HookDef.internalCooldown 表達，見 systems/IntervalHookSystem.ts 決策 1，而且它會吃 combatEnv.itemCooldown）。「持續 0.5秒」= durationSec，會再乘上後台 config.taunt@1 的 durationMult。radius 9.17 = WC3 Taunt（Ntau）的 500 單位 ÷ 54.5：文案沒有給半徑，所以取原作同族技能的值而不是憑空挑一個；它還會再乘 combatEnv.abilityRange（出貨 **0.8**）→ 場上實際 **7.34**。⚠️ 2026-08-18 更正（第三守則）：這一句原本寫「出貨 0.6 → 場上實際 5.5」，那個後台倍率已經被調過了，舊數字是假的。maxTargets 8 是防止一發把整波 30 隻殭屍全部拉住。

[煉金術] = passive[1]。「10%機率」= chance；「HP 低於 5%」= condition（subject: target —— onDamageTaken 的事件實體是**攻擊者**，見 combat/damage.ts 的 fireHooks(world, pkt.target, "onDamageTaken", pkt.source) 與 effects/hooks.ts）；「直接死亡」= 目標最大生命 35% 的真實傷害，對一個已經低於 5% 的身體是七倍致死；「黃金數量為敵方等級」= grantGold perTargetLevel 1。

⚠️ 兩個已知限制，寫在這裡而不是假裝沒有：
（1）金幣是在 proc 當下發的，不是在確認擊殺之後 —— 傷害走 damageQueue，這一 tick 稍後才結算，所以那一刻還沒有死亡可以掛。條件本身讓擊殺成為必然，但如果目標身上有大於自身最大生命 35% 的護盾，會出現「發了金幣但沒死」。現行內容沒有任何東西產得出那種護盾。用 onKill 反而更糟：onKill 不帶「是哪一發打死的」，掛在那裡會變成這位持有者的每一次擊殺都發錢，那是另一件道具。
（2）小怪（殭屍）**沒有 per-entity 等級**（spawnMobBody 不寫 level，波次等級在 MobRules 上、由主機逐回合烘），所以轉化一隻殭屍付 0 金。殭屍本來就會付 #215 的 mobKill 賞金給補刀的人，所以不是白做工；要讓它也按等級付，得先讓 MobComp 帶等級，那是另一張單。
（3）⭐ 2026-08-18 新增的 `Stat.MaxHitPctMaxHp`（單發傷害上限）會夾住這 35%：一個帶著那條屬性的目標可能被打到剩一絲而不死，於是又變成「發了金幣但沒死」。現行內容沒有任何東西給英雄那一格，所以今天不會發生 —— 記在這裡是因為它是**同一個**限制的第二個入口。

⭐ 2026-08-18 雙向逐句稽核（第一·五守則）：兩句效能都有實作、卡面一個字都沒改。JSON→描述 方向（給了但不說）唯二沒寫上卡面的是 **taunt 的 radius 9.17（場上 7.34）與 maxTargets 8** —— 「周圍敵人」這四個字沒有否定它們，要不要寫上卡面是 owner 的決定。除此之外沒有 modifiers、沒有 block、沒有 aura、沒有 requires 閘。

  </details>

### 📝 重力劍〈黑棒〉 `gravity-sword-black-rod`

- ❔ `[質量解放] 戰鬥中每 0.6 秒未普攻獲得 1 層〔質量〕，最多 5 層；普攻會讓計時重新開始` — 未知標籤 [質量解放] —— 這支工具沒有規則檢查它
- ❔ `[質量解放] 每層使攻擊力 ×1.18，五層約 ×2.29，本回合內持續` — 未知標籤 [質量解放] —— 這支工具沒有規則檢查它
- ❔ `[重力壓制] 五層〔質量〕時的普攻讓敵方英雄緩速 30%，持續 1.5 秒` — 未知標籤 [重力壓制] —— 這支工具沒有規則檢查它

  <details><summary>authoringNote</summary>

  ⭐ owner 原文（2026-08-17，⛔ 不可以讓它消失）：「[質量解放] 戰鬥中每 0.6 秒未普攻獲得 1 層質量，最多 5 層／下一次近戰普攻傷害 ×1.18^層數，五層約 ×2.29，**並使範圍傷害半徑增加 100%**」。逐句對照的全文在 `docs/legacy/_item-authoring-notes-full.md` 的〈gravity-sword-black-rod 重力劍〈黑棒〉〉一節（⛔ 原文一個字都沒被壓縮或截斷）。這裡留改動當下必須看到的：

·「戰鬥中」✅ `systems/IntervalHookSystem.ts` 決策 2：onInterval **只在 `world.combatActive` 時發射**，是真的閘不是修辭。
·「**未**普攻」✅ passive[1] 每刀掛一個 0.6 秒的具名標記〔gravity-sword-recent-swing〕（applyBuff + statusId，modifiers 空 = 純標記），passive[0] 的 condition 讀 `not(status self …)`。⛔ 先試過 `modifyCooldown{target:"hookInternalCooldown"}`，**實測會漏**：`basis:"base"` 每次只往前搬一個 ICD，追不上兩刀之間真實流逝的量，12 個週期漏 2 層。標記法沒有這個累積誤差。
·「×1.18^層數，五層約 ×2.29」= applyBuff `ad pctMult 0.18`，**刻意不填 stackKey**（不填才是複利；實測 5 層 ×2.288）。⛔ 填了會被折成 1+0.18×5 = ×1.90。
·「本回合內」= `permanent` + `permanentScope:"round"`（拆除點 `sim/clearPools.ts::clearRoundScoped`）。
· ⚠️ 兩處仍缺機制，描述已改成不再承諾：①「**下一次**普攻⋯消耗全部層數」—— 引擎沒有「拔掉指定的一份增益」；②「範圍傷害半徑 +100%」—— `Stat` 裡沒有任何一條是 AoE 半徑。②的**替換**（⛔ 不是刪除）就是 [重力壓制]：五層時普攻附帶 slow30／1.5 秒 —— 主題對得起來（重力＝壓制）而且引擎真的做得到。⛔ 30%／1.5 秒是我定的平衡值，不是 owner 的數字，後台可調。
· ⚠️「近戰普攻**傷害**」寫成 `ad pctMult`：引擎沒有 basic-only 的輸出倍率，吃 AD 係數的技能會一起變強，所以描述寫的是「攻擊力」。「近戰」= `requiresAttackType:"melee"`（發卡限制）。

⭐ **2026-08-18 第三輪修正**：[重力壓制] 的 `applyStatus` 原本**一格機制欄位都沒有** —— `slow30` 只是一個字串，狀態列照樣畫圖示、玩家以為對方被黏住了，而他跑得跟平常一樣快（⛔ 比沒效果更糟，它會誤導決策）。補 `moveSpeedMult: 0.7`（＝ −30%，逐字對上卡面，與 冰晶虎魄-改 `godie-i04d` 同一個寫法）。⚠️ 減速**是**一筆 CC（`sim/effects/applyStatus.ts` 的 `isCc` 含 `moveSpeedMult < 1`），所以免控擋得掉、【淨化】拔得掉、秒數進 `ccAppliedTicks` 戰績。

  </details>

### 📝 神槍・金剛徹 `lance-kongotetsu`

- ❔ `[必中解放] 連續攻擊獲得〔金剛〕最多 6 層，每層普攻傷害 ×1.04、攻擊速度 ×1.05` — 未知標籤 [必中解放] —— 這支工具沒有規則檢查它
- ❔ `[必中解放] 滿層後普攻無法被迴避，仍可被格擋、護盾抵消` — 未知標籤 [必中解放] —— 這支工具沒有規則檢查它
- ❔ `[長柄] 攻擊距離 +1` — 未知標籤 [長柄] —— 這支工具沒有規則檢查它

  <details><summary>authoringNote</summary>

  ⭐ 2026-08-18 逐句稽核：**三句效能都對得上，資料與描述一個字都沒改**。真的跑起來量到的：連續 8 刀 →〔金剛〕停在 6 層、ad ×**1.265**（1.04⁶）、as ×**1.340**（1.05⁶）、`unavoidablePct` = 1、攻擊距離 +1。⇒ 複利、上限、標記層數、必中四件事都是真的。
⚠️ 一個沒寫在卡面上的行為：滿 6 層之後 `maxStacks` 會**拒絕**新的一份，而最舊那一份仍然照自己的 4 秒到期 ⇒ 高攻速下層數在 5↔6 之間鋸齒。必中那一格 duration 也是 4 秒且每次滿層就刷新，所以實戰上不會斷 —— 但層數 UI 會跳。

[EX解放] owner 規格 #51（貓耳貓／神槍）。逐句：
[必中解放]「最多 6 層，每層普攻傷害 ×1.04、攻擊速度 ×1.05」= passive[0]。
· **複利**（⛔ 不填 stackKey）—— 判準是文案寫的是 ×1.0X 這種乘積：6 層 = ad ×1.04⁶ ≈ **×1.265**、as ×1.05⁶ ≈ **×1.34**。填 stackKey 會被 statPipeline 折成線性（1+0.04×6 = ×1.24 / ×1.30），與文案不同。
· 「最多 6 層」= maxStacks 6。⭐ 複利路徑現在也吃得到它（GH#354/G1，用 buff:<origin># 前綴數份數）。
⚠️ **降級①**：原文是「連續攻擊**同一英雄**」。「換目標就歸零」是 G14，引擎**沒有實作**（沒有 per-target 疊層記帳）。降級成**一般疊層 + 短 duration 4 秒**：4 秒內沒有再打就會逐份到期（複利路徑每份各自到期，⛔ 不是全部一起歸零）。換目標繼續打**照樣**疊得上去。
⚠️ **降級②**：「普攻**傷害** ×1.04」寫成 ad pctMult。引擎沒有 basic-only 的輸出倍率；用 outputDamagePct 會把技能傷害一起放大，離原文更遠。ad 是普攻傷害的驅動屬性，但也會餵到吃 AD 係數的技能。
[必中解放]「滿層後普攻無法被迴避」= passive[1]：condition 讀〔金剛〕層數 ≥6（statusId 讓那份增益**同時是具名標記**，statusStacks 把每一份來源各算 1 層 ⇒ 6 份 = 6 層），命中則掛 unavoidablePct 1。
⚠️ unavoidablePct **只關迴避**；格擋、護盾、免疫全部照舊 —— 正是原文「仍可被格擋、護盾抵消」那條界線。
⚠️ 但它**同時影響技能通道**：引擎只有一個折扣（rollEvade 與 rollEvadeAbility 共用），沒有 basic-only 的 scope。
⚠️ 它**寫在 applyBuff 裡而不是 modifiers**：ITEM_MODIFIER_LIMITS[unavoidablePct] 是 0.5，常駐 modifier 填 1 會被 Zod 拒收；而且常駐也不對（要滿層才有）。
⚠️ 時序：第 6 刀先疊到 6 層、同一 tick 第二條 hook 才掛必中 ⇒ 生效的是**接下來**那幾刀（duration 4，與層數同壽）。
⚠️ statusId "kongotetsu" 是 **soft ref**，目前 content/status-effects/ 沒有這份文件 ⇒ 機制正常，但 UI 上沒有圖示與名稱。要補就加一份 status-effect@1。
⚠️ 文案的 ×1.0X 標記用〔〕不是「」—— 「」在這個 repo 是角色對白，會被機制解析器整段剝掉。
[長柄]「攻擊距離 +1」= modifiers range flat 1（Stat.AttackRange 的值是 "range"）。

  </details>

### 📝 魔導鎧・零式 `magic-armor-type-zero`

- ❔ `[爐心解放] 每施放一次技能獲得 1 層魔導輸出，最多 5 層，本回合內不衰退` — 未知標籤 [爐心解放] —— 這支工具沒有規則檢查它
- ❔ `[魔導輸出] 每層使攻擊力、AP、裝甲、魔抗 ×1.06；五層約 ×1.34` — 未知標籤 [魔導輸出] —— 這支工具沒有規則檢查它
- ❔ `[過載] 滿層後所有技能（含 EX）冷卻流逝 ×1.5、移速 +2；普攻不受影響` — 未知標籤 [過載] —— 這支工具沒有規則檢查它

  <details><summary>authoringNote</summary>

  [爐心解放]「每消耗 10%最大魔力，獲得 1 層魔導輸出，最多 5 層」= passive[0]（onAbilityCast）。⚠️ 降級：引擎**沒有資源消耗事件**（G16），量不到「10% 最大魔力」，所以改成「每施放一次技能 = 1 層」。施法是耗魔的唯一常態管道，但一支貴的技能與一支便宜的技能在這裡一樣只給 1 層 —— G16 上線後要改回讀真正的耗魔量。
[魔導輸出]「每層 ×1.06，五層約 ×1.34」= **複利**（1.06^5 = 1.338），所以**刻意不填 stackKey**：填了會被 statPipeline 折成 1+0.06×5 = ×1.30 的線性。份數改用 maxStacks: 5 限制（GH#354 之後複利路徑也吃得到它）。四條 pctMult 逐字對應攻擊力 ad / AP ap / 裝甲 armor / 魔抗 mr。
[過載]「滿層後基礎技能冷卻流逝 ×1.5、移速 +2」= passive[1]。「流逝 ×1.5」用**新的 cooldownDrainRate flat 0.5**（0 = ×1），⛔ **不是** cooldownReduction：CDR 在施放那一刻就把這一輪的 tick 數算死了，而「滿層**後**」講的是冷卻**進行中**才掛上的加速，兩者語意不同。「移速 +2」= ms flat 2。
· 「滿層」怎麼問得到：passive[0] 的每一份來源都帶 statusId「magic-core-output」，複利路徑一份來源就是一層，所以 condition.status.minStacks: 5 讀到的正好是層數（effectCommon.statusStacks 的第三本帳）。hook 依陣列順序跑，所以第 5 次施法時 passive[0] 先掛上第 5 層、passive[1] 當場就成立。⚠️ 這個 statusId **沒有** status-effect@1 文件（它只是計數器，不需要圖示）；applyBuff.statusId 不是 refs.ts 抽得到的 ref 邊，所以不會有 dangling 警告。
· passive[1] 用 stackKey 而不是複利路徑是**必要的**：複利路徑的 source id 是 `buff:<origin>#<tick>`，而同一件道具的兩條 hook 共用同一個 origin —— 同一 tick 兩份會互相覆蓋。
⚠️ 降級：「**基礎**技能」這個範圍寫不出來 —— cooldownDrainRate 沒有 scope（scopeSlot 只對 cdr 開放），所以 EX 也一起加速。
⚠️ 決策：owner 沒寫層數的壽命，取 permanentScope: "round"（同一批 #54「整個回合不會衰退」的讀法），⛔ 不猜一個秒數。

⭐ 2026-08-18 逐句稽核（第一·五守則「不放任何無效說明」）—— 卡面改了三處，改的都是**描述**，實作一個位元都沒動：
① 「每消耗 10%最大魔力」→「每施放一次技能」。降級本來就記在上面，但**卡面還在承諾一個引擎讀不到的量**（G16）。
② 「基礎技能冷卻流逝」→「所有技能（含 EX）…普攻不受影響」。`tickCooldowns` 逐字對 Q/W/E/R + exSlot + passiveSlot 一起套用 `1+cooldownDrainRate`，⛔ 只有 `basicAttackCdTicks` 是 `--`。所以「基礎技能」這個範圍在卡面上是假的。
③ 補「本回合內不衰退」（`permanentScope:"round"` → `clearRoundScoped` 在下一回合開打前拔掉）。
其餘兩句逐字對得上：1.06^5 = 1.338 ≈「約 ×1.34」，四條 pctMult 對四個屬性。

  </details>

### 📝 肉切菜刀 `meat-cleaver`

- ❔ `[重量解放] 戰鬥中每 0.5 秒沒有普攻便獲得 1 層重量，最多 5 層；打出普攻後停止累積，已累積的層數 2.5 秒內逐層落下` — 未知標籤 [重量解放] —— 這支工具沒有規則檢查它
- ❔ `[重量解放] 每層使攻擊力 ×1.15（五層約 ×2.01）` — 未知標籤 [重量解放] —— 這支工具沒有規則檢查它
- ❔ `[重量解放] 帶著重量的普攻，會以目標為圓心炸開一道 50% 攻擊力的中範圍物理震波，波及他周圍的敵人（目標本人不再吃這一道）` — 未知標籤 [重量解放] —— 這支工具沒有規則檢查它

  <details><summary>authoringNote</summary>

  [EX解放] owner 規格 #56（貓耳貓／重型武器）。逐句：
「**戰鬥中**每 0.5 秒**沒有普攻**便獲得 1 層重量」= passive[0]（`onInterval` + `internalCooldown: 0.5` ＝ 節奏；「戰鬥中」是免費的 —— `IntervalHookSystem` 決策 2 本來就 `if (!world.combatActive) return`）＋ passive[1]（`onBasicAttack` 掛一份 0.5 秒的具名標記 meat-cleaver.swing，`modifiers: []` 純標記），而 passive[0] 的閘是 `not{status self meat-cleaver.swing}`。⇒ 揮刀之後的 0.5 秒內**不累積**，正是「沒有普攻」。
「最多 5 層」= maxStacks 5（複利路徑，用 origin 前綴數）。
「下一次普攻傷害 ×1.15^層數，五層約 ×2.01」= **複利**（⛔ 不填 stackKey）：每層各一份 `ad` **pctMult 0.15** 的來源，`Π(1.15)` 五份 = **×2.011**，與 owner 的 ×2.01 對得上。⭐ 選 `ad` 而不是 outputDamagePct 有兩個理由：① 普攻傷害就是 AD，所以「普攻傷害 ×1.15^N」在這條屬性上是**逐字**的；② 輸出倍率三兄弟的 base 是 0，而管線是 `(base+Σflat)×…×Π(1+pctMult)`，0 底屬性上的 pctMult 恆為 0 —— 複利在那三格根本寫不出來（見 #54 的備註）。
「50%傷害的範圍震波」= passive[2] 的 `damageArea`（`ad` ratio 0.5、physical）。hook 不填 target ⇒ 圓心是**被打中的那個人**，`includeOrigin` 缺席 = false ⇒ 他不會被震波再打一次，濺的是他旁邊的人。⭐ 震波與普攻共用同一份 `ad`，所以它自動也是 ×1.15^N（owner 說的「50% 傷害」）。

⚠️ **降級①（最重要）**：「**下一次**普攻…消耗層數」寫不出來 —— 唯一能拔掉自己增益的是 `dispel{pools:{buffs:true}}`，而普攻的傷害封包是**先入佇列、`onBasicAttack` 之後才由 combatResolveSystem 結算**的，所以在這條 hook 裡拔層數會在那一發吃到倍率**之前**就把它拔掉（整張卡歸零）。⇒ 降級成**自然衰退**：每層 duration 2.5 秒（= 5 × 0.5 秒，剛好等於疊滿所需時間）。閒置時穩定停在 5 層；一開始普攻就停止累積、2.5 秒內逐層落下。⛔ 差別是**倍率會作用在那一段時間內的每一發**，不是只有第一發。
⚠️ **降級②**：`ad` 也會放大吃 AD 係數的技能，⛔ 不只普攻。引擎沒有「只放大普攻」的 scope。
⚠️ **降級③**：層數桶是**逐道具槽**的（複利路徑用 origin 前綴數），所以帶兩把菜刀會有兩份各 5 層的重量。
⚠️ 震波半徑：`radiusTier:"中"`（後台 aoe-tiers 決定，出貨 4.5），`radius` 是級別關掉時的退路。owner 沒有給數字。

⭐ 2026-08-18 逐句稽核：三句逐字對得上實作，只改了第三句的**卡面措辭** —— 原文寫「在目標身上再炸開」，而 `includeOrigin` 缺席 = false ⇒ `damageArea` 把 `ctx.targets`（＝被打中的那個人）**排除**在受害者集合外。他一點震波傷害都吃不到，濺的是他旁邊的人（這正是 cleave 標籤要的形狀，⛔ 實作沒有錯）。卡面現在明說「目標本人不再吃這一道」，並補上「中範圍」「物理」兩個玩家看得到的事實。

  </details>

### 📝 流星之戒 `meteor-ring`

- ❔ `[三星許願] 每回合開始時重新獲得 3 顆流星` — 未知標籤 [三星許願] —— 這支工具沒有規則檢查它
- ❔ `[三星許願] 基礎技能（Q／W／E）施放後消耗 1 顆：接下來 2 秒內你的傷害·治療·護盾 ×1.25、立即回復 50% 最大魔力、該格冷卻立刻縮短 40%` — 未知標籤 [三星許願] —— 這支工具沒有規則檢查它
- ❔ `[三星許願] 施放終極技能（R）時三顆都還在，則三顆一起消耗：接下來 2 秒內你的傷害·治療·護盾 ×1.5、R 冷卻立刻縮短 30%` — 未知標籤 [三星許願] —— 這支工具沒有規則檢查它

  <details><summary>authoringNote</summary>

  [EX解放] owner 規格 #57（OVERLORD／戒指）。
⭐ 整張卡的骨架是**倒過來數的**：引擎沒有「充能」機制，所以記的不是「剩幾顆流星」而是「**用掉幾顆**」—— 一份 `permanent + permanentScope:"round"` 的疊層標記 meteor-ring.spent（`modifiers: []`，純計數）。「每回合獲得 3 顆」= 這份標記在**回合開始被拆掉**（clearRoundScoped），⛔ 不需要 onRoundStart 發卡。⛔ 也不能用 `maxTriggers: 3`：那個額度記在道具來源上、整場只有一份，不會逐回合重置。
「基礎技能」= Q/W/E，「終極技能」= R（引擎的判準就是 `onUltimateCast` = slot R），與 #58 安茲之杖 同一個讀法。abilitySlot 只吃單一槽位，所以基礎那半是**三條同型 hook**。
「施放後自動消耗 1 顆」= 每條 hook 的閘 `not{spent ≥ 3}` + 效果尾端 spent +1（maxStacks 3）。
「使效果 ×1.25」= 輸出倍率三兄弟各 **flat 0.25**（0 = ×1；⚠️ 那三格的 base 是 0，所以 `pctMult` 在它們身上恆為 no-op —— 只有 flat 會動）。
「返還 40% 冷卻」= `modifyCooldown{slot: 該格, mode:"reduce", amount:0.4, basis:"remaining"}`，指名的就是這條 hook 自己那一格。
「若施放終極技能時仍保有 3 顆」= `not{spent ≥ 1}`；「全部消耗」= 同一條 hook 裡**三發** spent +1（疊層路徑每發 +1，一次跳到 3），之後基礎那三條的閘就關上了。終極的 ×1.5 = flat 0.5、返還 30% = amount 0.3。

⚠️ **降級①**：「使**該次**效果 ×N」寫不出來 —— 輸出倍率是屬性不是「這一發」，而 `scopeSlot` 只有冷卻讀得到。⇒ 用一份 **2 秒**的增益近似「這次施放」。飛行時間長、延燒或引導型的技能會有一部分落在窗口外；窗口內打出的其他傷害（普攻）則會一起被放大。2 秒是我挑的近似值，owner 沒有給。
⚠️ **降級②（要 owner 裁決）**：「返還 50%**魔力**」有兩種讀法，而引擎只做得到一種。這裡實作的是字面那個：`restore{manaPct:0.5}` = **回復自身最大魔力的 50%**。如果 owner 的意思是「退還這次施放**魔力消耗**的 50%」，引擎讀不到那一發的消耗（G7「讀這一發的量」不存在），而且現在這個版本會強上一個量級（每回合三次半管魔力）。
⚠️ 兩份 wish 增益不會同時存在：spent 的兩道閘互斥（用過基礎就不能許終極願，反之亦然）。

⭐ 2026-08-18 逐句稽核 —— 卡面改四處（實作零改動），因為降級①②本來只寫在這裡而**玩家讀到的還是原設計**：
① 「該次效果 ×N」→「接下來 2 秒內你的傷害·治療·護盾 ×N」。那三格是屬性不是「這一發」，2 秒窗口內的普攻也一起被放大。
② 「回復 50% 魔力」→「回復 50% **最大**魔力」。`restore` 算的是 `maxMana × 0.5`（`combat/restore.ts`），⛔ 不是退還這次施放的耗魔。
③ 「返還 N% **剩餘**冷卻」→「冷卻**立刻縮短** N%」。`abilitySystem` 在 **line 317 先寫滿冷卻、line 445 才發 `onAbilityCast`**，所以 hook 看到的 remaining 恆等於**滿冷卻** —— 卡面寫「剩餘」會讓玩家以為可以晚點再用、能省更多。
④ R 那句「全部消耗」→「三顆一起消耗」（同一發三次 stackKey 疊層：1→2→3，`applyBuff` 疊層路徑同 tick 疊得起來）。

  </details>

### 📝 謎之紙片 `mystery-scrap-of-paper`

- ❔ `[不可壞] 單次受到超過最大生命 20% 的傷害時，該傷害最多只能造成 20% 最大生命` — 未知標籤 [不可壞] —— 這支工具沒有規則檢查它
- ❔ `[不可壞] 每受到一次傷害（每 8 秒最多一次），最大生命 ×1.05，最多 3 層，整場保留` — 未知標籤 [不可壞] —— 這支工具沒有規則檢查它

  <details><summary>authoringNote</summary>

  [EX解放] owner 規格 #52（貓耳貓／任務道具）。逐句：
[不可壞]「單次受到超過最大生命 20% 的傷害時，該傷害最多只能造成 20% 最大生命」= modifiers 的 **maxHitPctMaxHp flat 0.2**（新屬性，0 = 沒有上限，掛在**承受者**身上，讀取點是 combat/damage.ts 的 mitigate，抗性四段之後、護盾之前）。與守衛塔的 StructureComp.maxHitPctMaxHp 同語意同位置。
⚠️ **降級①**：原文的「**每 8 秒一次**」在**常駐 modifier 上表達不了** —— 一條屬性沒有內部冷卻的概念（ICD 只住在 hook 上）。所以這一半是**常駐生效**：每一發超過 20% 最大生命的傷害都會被夾，⛔ 不是 8 秒才擋一次。這件道具因此比原文強。要真的做出 ICD 得換成「一份帶 ICD 的 hook 掛限時 maxHitPctMaxHp」，而那會漏掉「同一 tick 的第一發」，所以沒有走那條路。
[不可壞]「每成功阻擋一次，最大生命 ×1.05，最多 3 層」= passive onDamageTaken + **永久** applyBuff（maxHealth pctMult 0.05）。
· **複利**（⛔ 不填 stackKey）—— 文案是 ×1.05 這種乘積：3 層 = **×1.158**。填 stackKey 會被折成線性 ×1.15。
· 「最多 3 層」= maxStacks 3（複利路徑現在也吃得到，GH#354/G1）。
· permanent 且**不填 permanentScope** ⇒ 整場（原文沒有寫「本回合內」）。
⚠️ **降級②**：「**成功阻擋**」讀不出來 —— 引擎沒有「這一發有沒有被 maxHitPctMaxHp 夾到」的事件，也沒有讀傷害量級的條件葉（hook 只過濾得了 damageSource / damageType / damageCrit）。降級成「**每受到一次傷害**」，並把原文那個 **8 秒 ICD 搬到這條 hook 上**：這樣**成長速率**與原文一致（最多 8 秒一層、疊滿至少 16 秒），⛔ 但**觸發條件**不同 —— 一發沒超過 20% 的小傷害照樣給層數。
⚠️ 道具來源的 internalCooldown 還會再乘後台 combat-env 的 itemCooldown，所以 8 秒是出貨值不是硬保證。
⚠️ description 第二行已改寫成**這件道具真的做的事**，⛔ 不是原文照抄：卡面寫「每成功阻擋一次」會讓玩家以為小傷害不算。

⭐ 2026-08-18 逐句稽核：兩句都**完整**，只補了一個玩家看得到而卡面沒寫的事實 ——「整場保留」（`permanent: true` 且**沒有** `permanentScope`，`clearForFreshBody` 只清 status/shields/dot，所以死一次、換一回合都留著）。
⚠️ 順手驗過夾取位置：`capPerHit` 讀的是**承受者**的 `final[MaxHitPctMaxHp]`，坐在抗性四段**之後**、護盾**之前**，而且**真傷也吃**（`mitigate` 的真傷早退分支自己也呼叫它）。所以卡面那句「單次⋯最多只能造成 20% 最大生命」對三種傷害型別都成立。

  </details>

### 📝 立體機動裝置 `odm-gear`

- ❔ `[飛行型態] 常駐飛行：無視單位與牆壁碰撞（仍受場地邊界與火圈約束）` — 未知標籤 [飛行型態] —— 這支工具沒有規則檢查它
- ❔ `[機動上限解放] 移動速度上限 18 → 24，並使移動速度 +50%` — 未知標籤 [機動上限解放] —— 這支工具沒有規則檢查它
- ❔ `[超速] 使用位移或閃現之後 2 秒內，造成的傷害・治療・護盾 各 +3%` — 未知標籤 [超速] —— 這支工具沒有規則檢查它

  <details><summary>authoringNote</summary>

  【owner 2026-08-18 裁決】「**改成飛行型態 並且移動速度上限就好**」。

[飛行型態] = `item@1.flight`（頂層授權格，天叢雲劍的前例）。`sim/flight.ts::flightSystem` 每 tick 掃 `StatsComp.sources` 找 `flight`，⛔ 不問 kind，所以道具卸下時飛行下一 tick 就消失，⛔ 不需要第二支到期掃描器。
⚠️ `stayInsideBoundary: true`（預設）—— 飛行**不會**讓你離開場地：`clampToBoundary` 照跑。火圈也**不是**碰撞（`FireRingSystem` 燒的是半徑外的人），所以飛行者照樣被燒。這兩件事寫在這裡，是因為「無視碰撞」很容易被讀成「無敵」。

[機動上限解放] = `ms capRaisePct 0.3333`（18 → 24）＋ `ms pctAdd 0.5` 真的把值推上去。
⭐ **這一條在 2026-08-18 之前是一句無效宣稱**（`ms` 的 `unlocked === base === 18`），而且**不能只靠改 config 修好**：`sim/statCaps.ts` 記著 owner 2026-08-15 的量測 ——
30Hz × 0.6(身體半徑) = **18.0 就是離散碰撞的穿牆平手線**，第一版的「上限24/解鎖30」正是因為穿牆被退回來的。
⇒ owner 的解法是**先給飛行**：`MovementSystem` 對飛行者跳過全部三處推擠，所以「會不會穿牆」對它**不是一個問題** —— 它本來就被允許穿過去。
⚠️ 但 `unlocked` 是**全域**的：任何帶 `ms` capRaise 的來源都吃得到 24，包含不會飛的。⇒ 這個耦合被寫成一道閘：`content/noOpModifierClaims.test.ts` 的「抬移速上限的文件必須同時給飛行」。⛔ 它紅了不要改閘，去給那份文件飛行或改回 18。

[超速] = `onDashOrBlink` → 2 秒的 output 三兄弟各 `flat 0.03`。⚠️ 那三條是**加成型**（base 0），所以只有 `flat` 動得了，⛔ `pctMult` 是嚴格 no-op。

⚠️ 原設計還有兩句仍然做不到（G10 移動距離累積器、`onDashOrBlink` 發射時 `abilitySlot` 是 undefined 所以 `modifyCooldown` 永遠不匹配），已從描述移除，⛔ 沒有留成假話。完整沿革見 `docs/legacy/_item-authoring-notes-full.md`。

  </details>

### 📝 蒼月葬送・千年彼方花冠 `pale-moon-requiem-crown`

- ❔ `[蒼月開花] 自己受到過量治療時（每 3 秒最多一次）生成 1 朵蒼月花，最多 8 朵，本回合內不凋謝` — 未知標籤 [蒼月開花] —— 這支工具沒有規則檢查它
- ❔ `[花瓣] 每朵使你的治療與護盾輸出 +4%（八朵 ×1.32）` — 未知標籤 [花瓣] —— 這支工具沒有規則檢查它
- ❔ `[溢流成盾] 開花的同時，把那一次的溢出化成 120 + AP×0.5 的護盾，持續 4 秒` — 未知標籤 [溢流成盾] —— 這支工具沒有規則檢查它
- ❔ `[千年花園] 集滿八朵時展開 8 秒「千年花園」：我方全體的治療與護盾輸出 ×1.40，並各自獲得 200 + AP×0.8 的護盾（每 30 秒最多展開一次）` — 未知標籤 [千年花園] —— 這支工具沒有規則檢查它

  <details><summary>authoringNote</summary>

  ⛔ **全文（逐句對照 + 三處落差的完整理由）在 `docs/legacy/_item-authoring-notes-full.md` 的「蒼月葬送・千年彼方花冠 (#69)」一節** —— 這一份撞到 `authoringNote` 的 2000 字上限，依 owner 2026-08-18 的規矩備份而不截斷。

⭐ 2026-08-18 逐句稽核（第一·五守則「不放任何無效說明」）——**實作零改動，卡面整段重寫**，四處：
① 「每產生相當於目標最大生命 8%的過量治療或過量護盾」→「**自己**受到過量治療時（每 3 秒最多一次）」。三個理由：量讀不到（G7）、護盾溢出**不發任何事件**（只有 heal 那一則帶 overheal 欄位）、而且**方向是反的**（`WorldHookSystem` 的 onOverheal 那一列 `actorKey:"target"` ＝持有者是**被治的身體**）。⛔ 舊卡面教玩家去治隊友，而那樣一朵花都開不出來。
② 「每朵 ×1.04」→「每朵 +4%（八朵 ×1.32）」。`outputHealingPct`/`outputShieldPct` 的 base 是 0、管線是 `(0+Σflat)×(1+ΣpctAdd)×Π(1+pctMult)`，**只有 flat 動得了它們** ⇒ 線性。owner 的複利讀法八朵是 ×1.369，差 3.7 個百分點。
③ ⛔ **刪掉**「其中 50%同步給另一名隊友」（G18 治療分流）與「所有過量治療轉為護盾」（G9 溢出轉換）——**兩條零實作**，留在卡面就是兩句永遠不兌現的承諾。已列進「需要新引擎機制」。
④ 補上兩個真的存在而卡面沒寫的閘：花的壽命（`permanentScope:"round"`，本回合）與花園的 30 秒 ICD（`internalCooldown: 30`，⚠️ 這個數字是**這份文件自己決定的**，owner 的規格沒有寫再觸發規則）。
⚠️ 花園那一條的 `target:"allies"` ＝ `alliedChampions()` ＝同隊每一位英雄（含自己、含死者），這就是卡面「我方全體」的來源。
⭐ 2026-08-18 二次修正（owner 規則：不放無效說明，而且**要替換類似效果**，⛔ 不是刪掉）：S3b「50% 同步給另一名隊友」與 S3c「所有過量治療轉為護盾」原本被整句刪除 —— 那消掉了假話，卻也把這張卡的一半強度一起消掉了。改成兩個**引擎真的做得到**的等價效果：①[溢流成盾] 開花的同一個 hook 追加 `shield` 120+AP×0.5／4 秒（形狀抄 sage-ward-amulet），語意就是「溢出的那一半變成護盾」，⚠️ 差別是量讀不到（G7），所以是定額而不是等量；②[花園分享] 千年花園的 hook 本來就是 `target:"allies"`，追加 `shield` 200+AP×0.8／8 秒，「分給隊友」因此變成真的會發生的事。⛔ 兩個數字都是新定的，屬平衡值，後台可調。

  </details>

### 📝 閃耀金玉 `shining-golden-orbs`

- ❔ `[EX解放・金玉回歸] 每當自身任一屬性首次達到一般上限時，獲得 1 層「金玉」，最多 2 層。每層使：攻擊速度與吸血的上限解鎖 +25% ／ 攻擊力・法強・護甲・魔抗・生命上限・魔力上限・雙回復・攻速 各 ×1.15 ／ 移動速度 ×1.10` — 未知標籤 [EX解放・金玉回歸] —— 這支工具沒有規則檢查它
- ❔ `[完全體] 取得第 2 層時觸發：上述屬性再 ×1.20 ／ 造成傷害、治療、護盾 ×1.20 ／ 技能冷卻流逝速度 ×1.20` — 未知標籤 [完全體] —— 這支工具沒有規則檢查它

  <details><summary>authoringNote</summary>

  ⭐ owner 2026-08-17 親自重新設計，⛔ 規格表第 61 列的「弓與箭」已作廢，不要照那一列改。
「每當自身任一屬性**首次**達到一般上限時」= `onStatCapReached`（`statPipeline` 對 `capFor().base` 判、每條屬性一生一次，且 `firesOutsideCombat` —— 屬性到頂多半發生在商店買完裝備那一刻）。
「獲得 1 層金玉，最多 2 層」= effects[0]：**不填 stackKey**（複利路徑，每次施加各自一份來源）＋ `maxStacks: 2`。複利是刻意的 —— 文案是「每層 ×1.15」而 2 層要是 1.3225 而不是 1.30（填 stackKey 會被折算成 1 + 0.15×2）。
「所有已達上限的屬性 解鎖上限 +25%」= 13 條 `capRaisePct 0.25`（＝出貨 `config.stat-caps@1` 的**全部** 13 條）。引擎的 payload 帶著 `stat`，但**內容側讀不到它**，所以「已達上限的那一條」只能寫成「全部 13 條」—— 對還沒到頂的那幾條，抬高上限本來就不給任何數值（`CapRaise` 家族只搬天花板）。
⚠️ **出貨 13 條上限裡只有攻速（4→10）與吸血（0.8→20）留了解鎖空間，其餘 11 條 `unlocked === base`，所以 `capRaisePct` 對它們今天是 no-op** —— `statCaps.effectiveCap` 把任何解鎖硬夾到 `unlocked`。⛔ 這**不是這張卡的缺陷**，是一個等 owner 裁決的 config 資料決定（`content/config/stat-caps.json`，後台一格、存檔生效）。⚠️ 其中 `ms` 那一格另有已量到的物理風險（18.0 = 30Hz 離散碰撞的穿牆平手線），見 `sim/statCaps.ts`。
⚠️ **降級**：「所有**正**屬性增益 ×1.15」—— 引擎沒有「只放大正的增益」這個概念（一份來源可以同時帶 +ms 與 -armor，任何啟發式都會在某張卡上錯，這也正是 `applyBuff.polarity` 要作者明寫的理由）。⇒ 降級成**指名的 9 條主要屬性各自 `pctMult 0.15`**（ad/ap/armor/mr/maxHealth/maxMana/healthRegen/manaRegen/as）。⛔ 兩點要知道：① `pctMult` 乘的是**最終值**不是「增益的部分」；② 比率型（critChance / cdr / lifesteal / evasion）與 range 刻意不在名單裡 —— ×1.15 一個 0..1 的比率是另一種語意。
「移動速度 ×1.10」= 同一份來源的 `ms pctMult 0.10`（所以 ms 不重複吃上面那 9 條的 ×1.15）。
「取得第 2 層時觸發[完全體]」= effects[1]，同一條 hook 的**第二段**：`condition.status{minStacks:2}` 讀的是金玉自己的 statusId（`statusStacks` 把兩份來源相加），而 effects 是**照順序**跑的 —— 第 2 層在 effects[0] 就已經掛上，所以這一段在同一次事件裡就成立。用 `stackKey` + `maxStacks: 1` 讓它只發生一次（⛔ 不能也走複利路徑：那條路的額度是用 `buff:hook:<來源>#` **前綴**數的，會跟金玉共用同一本帳）。
「再 ×1.20」= 同 9 條 + ms 的 `pctMult 0.20`（獨立一份來源 ⇒ 真的再乘一次）。「造成傷害、治療、護盾 ×1.20」= `outputDamagePct` / `outputHealingPct` / `outputShieldPct` 各 flat 0.2（語意是加成，0 = ×1）。「技能冷卻流逝速度 ×1.20」= `cooldownDrainRate` flat 0.2（⛔ 不是 CDR：那一格在施放的瞬間就結算完了，而這裡要的是**冷卻進行中**也立刻加速）。

【2026-08-18 修無效宣稱】⛔ 刪掉指向零解鎖空間屬性的 capRaisePct，描述同步改成只講真的。⚠️ 完整理由在 `docs/legacy/_item-authoring-notes-full.md`（⛔ 不壓縮原文）。守衛：`content/noOpModifierClaims.test.ts`。

  </details>

### 📝 噬魂者 `soul-eater`

- ❔ `[魂食] 親手擊殺一名敵方英雄獲得 1 個魂，最多 5 魂，效果整場保留` — 未知標籤 [魂食] —— 這支工具沒有規則檢查它
- ❔ `[魂食] 每個魂使攻擊力或 AP ×1.08 —— 取得那一刻誰高就吃誰，逐魂各自判定（5 魂約 ×1.47）` — 未知標籤 [魂食] —— 這支工具沒有規則檢查它
- ❔ `[魂食] 已經滿魂之後再擊殺敵方英雄，額外回復 25% 最大生命與 25% 最大魔力` — 未知標籤 [魂食] —— 這支工具沒有規則檢查它

  <details><summary>authoringNote</summary>

  [EX解放] owner 規格 #55（貓耳貓／武器）。逐句：
「依自身攻擊力與 AP **較高者**，使該屬性 ×1.08」= 兩條互斥的 hook，閘用新的跨屬性比較 `condition.other`：`{stat:"ad", op:">=", value:0, other:{subject:"self", stat:"ap"}}` ＝「我的 AD ≥ 我的 AP」→ 走 AD；`not` 同一棵樹 → 走 AP。⛔ 兩條各自一個 `chance`/ICD 都沒有，所以一次擊殺只會有一條成立、只給一個魂。⚠️ 打平（AD == AP）算 AD 那一邊，這是 `>=` 的刻意選擇（`>` 會讓兩條在打平時**都不成立** = 那次擊殺沒有魂）。
「×1.08 … 最多 5 魂，滿層約 ×1.47」= **複利**（⛔ 不填 stackKey）：每次施加各掛一份來源，`Π(1+0.08)` 五份 = **×1.469**，與 owner 的 ×1.47 對得上。填 stackKey 會被 `statPipeline` 折成線性 ×1.40。`ad`/`ap` 的 base 不是 0，所以 `pctMult` 在這裡真的會動（⚠️ 輸出倍率三兄弟就不行，見 #54 的備註）。
「最多 5 魂」= maxStacks 5（複利路徑現在也吃得到，GH#354/G1）。⭐ 兩條 hook 共用同一件道具來源，而複利路徑的額度是用 **origin 前綴**數的，所以 AD 魂與 AP 魂**合計** 5 個，⛔ 不是各 5 個。
沒有 permanentScope ⇒ 整場（原文沒有寫「本回合內」）。
「滿魂後參與擊殺另外回復 25%生命與魔力」= passive[0]（`restore` healthPct/manaPct 0.25，`applyTo:"self"`），閘是 `condition.status{minStacks:5}` —— `statusStacks` 會把五份帶同一個 statusId 的來源相加。
⭐ 它**排在兩條給魂的 hook 前面**是刻意的：hook 依文件順序發射，排後面的話「補滿第 5 個魂的那一次擊殺」自己就會觸發回復，而 owner 寫的是「滿魂**後**…另外」。現在要第 6 次擊殺才回。

⚠️ **降級①（owner 已裁決）**：「**參與**擊殺」（含助攻）引擎沒有 —— 只有 `onKill`（最後一擊）。⇒ 降級成**最後一擊**：隊友收掉的人頭不給魂、也不給回復。要做助攻得有一個「近期造成傷害者」名單，那是新機制。
⚠️ statusId 只是讓條件數得到魂數，沒有 status-effect 文件（`applyBuff.statusId` 不是 ref，不產生 dangling 警告）。

⭐ 2026-08-18 逐句稽核（第一·五守則）：三句**全部完整**，只改了卡面的措辭與一句錯的備註。
① ⛔ 刪掉舊備註「同一 tick 收兩顆人頭時來源 id 會相撞，第二個魂被覆蓋」——**那是假的**（第三守則）。`attachSource` 是 `sc.sources.push(...)`，⛔ 不是依 id 覆寫；`recomputeStats` 逐份走 `sc.sources` 也不去重。所以同一 tick 的兩個魂會變成兩份同 id 的來源，**兩份都算**。（唯一的殘留是 `detachSource` 只拔得掉一份，而這裡是永久來源、沒有人會拔。）
② 卡面拿掉 `**…**` —— 239 份道具文件裡**只有這一份**在玩家看得到的 description 裡放 markdown 星號，客戶端不 render，玩家會看到裸的 `**`。
③ 「25% 生命／魔力」寫明是 **最大**生命／最大魔力（`restore` 算的是 `maxHp × pct × combatEnv.healing` 與 `maxMana × pct`）。
④ 「擊殺」寫成「**親手**擊殺」：`onKill` 只有最後一擊，隊友收頭不算（owner 已裁決的降級，但卡面本來看不出來）。
⑤ 「較高的那一項」補「取得當下…逐魂各自判定」——閘在每次擊殺時各問一次，所以一個人身上可以同時有 AD 魂與 AP 魂。

  </details>

### 📝 雷槍 `spear-of-lightning`

- ❔ `[雷槍裝填] 戰鬥中每 1.5 秒獲得 1 層裝填，最多 5 層，本回合內不衰退` — 未知標籤 [雷槍裝填] —— 這支工具沒有規則檢查它
- ❔ `[爆炸] 帶著裝填時，普攻或技能命中敵方英雄會在他腳下炸開 150 + AP×0.6 的中範圍魔法傷害（普攻與技能各自 3 秒冷卻，層數不會被消耗）` — 未知標籤 [爆炸] —— 這支工具沒有規則檢查它
- ❔ `[雷槍裝填] 每層裝填使你造成的所有傷害 +10%，五層 ×1.50` — 未知標籤 [雷槍裝填] —— 這支工具沒有規則檢查它
- ❔ `[感電] 爆炸同時讓範圍內的敵人癱瘓（走不動、打不出手、放不出技能）0.75 秒` — 未知標籤 [感電] —— 這支工具沒有規則檢查它

  <details><summary>authoringNote</summary>

  ⭐ 全文（五個降級的完整理由 + 2026-08-18 前兩輪卡面重寫的逐句對照）在 `docs/legacy/_item-authoring-notes-full.md` 的〈spear-of-lightning 雷槍〉一節。⛔ 原文一個字都沒有被截掉 —— 這裡只留改動當下必須看到的三件事。

① **五個降級的摘要**：G10 沒有移動距離累積器 ⇒「每移動 3 距離獲得 1 層」降級成 `onInterval` + `internalCooldown 1.5`（⛔ 站著不動也會裝填，與原設計「用移動換火力」相反）；引擎沒有「清掉自己指定的一份增益」⇒「消耗全部層數」降級成兩條 hook **各自** 3 秒內部冷卻、層數不被消耗；`outputDamagePct` 是**加成型**（base 0，只有 `flat` 動得了，而且**沒有 scope**）⇒ 5 層是 **×1.50 且對你造成的所有傷害生效**，不是文案的 ×1.61、也不只爆炸；G8 沒有「半徑隨層數縮放」的形狀 ⇒ 固定 `radiusTier:"中"`（`radius: 4` 是級別關掉時的退路）。

② ⭐ **2026-08-18 第三輪修正 —— [感電] 掛錯了位置。** 兩條 hook 的 `applyStatus` 原本放在 `damageArea` 的**兄弟**位置：applyStatus 的受眾是 `ctx.targets`（`sim/effects/applyStatus.ts` 的 `subjects`），那是上游交下來的**單一**受害者，⛔ 不是爆炸真的炸到的那群人 ⇒ 卡面寫「範圍內的敵人」，實際只有被打中的那一個中招，而畫面上跟正常一模一樣（失敗形態②）。修法是**替換成做得到的等效機制**：搬進 `damageArea.onHitTargets`（`effect.target-set-chain@1`，`sim/effects/victimFilter.ts::runOnHitChain`），⛔ 不是刪掉那句話。`includeOrigin: true` 所以被命中的英雄本人也在名單裡。`onHitTargetsMode` 省略 = batch（applyStatus 自己就迭代整群）。
⚠️ **兩條 hook 都要搬**：只搬 `burst-basic` 的話，普攻引爆是範圍、技能引爆是單體，而**沒有任何東西會紅**。

③ ⭐ 同一輪：這兩個 `applyStatus` 原本**一格機制欄位都沒有** —— `paralysis` 只是一個字串，狀態列照樣畫圖示、玩家看到就不敢上，而對方完全自由（⛔ 比沒效果更糟）。補 `stun: true`（出貨前例 `godie-h02k.w` 也是 paralysis + stun）。
⚠️ 卡面原本寫「麻痺」而 statusId 是 `paralysis` ＝ **癱瘓**（麻痺是另一份文件 `numbness`），已把卡面改成癱瘓並寫出它擋住哪幾格 —— `paralysis.json` 自己就說「擋住哪幾格不在這個標記上，由施加它的那張卡決定」。
⛔ **0.75 秒是我定的數字，不是 owner 給的**；它跟著兩條 hook 的 3 秒 ICD 走，所以上限是每 3 秒一次。

  </details>

### 📝 安茲・烏爾・恭之杖 `staff-of-ainz-ooal-gown`

- ❔ `[七寶玉解放] 七種行動各點亮 1 顆寶玉，最多 7 顆，整場不熄：Q／W／E／R／EX／天生技／普攻（同一種做再多次也只算一顆）` — 未知標籤 [七寶玉解放] —— 這支工具沒有規則檢查它
- ❔ `[七寶玉解放] 每顆使你造成的傷害／治療／護盾 +5%（7 顆 = +35%）` — 未知標籤 [七寶玉解放] —— 這支工具沒有規則檢查它
- ❔ `[自主迎擊] 七顆全亮的狀態下施放技能，即進入 7 秒「自主迎擊」，整場只會發生一次` — 未知標籤 [自主迎擊] —— 這支工具沒有規則檢查它
- ❔ `[自主迎擊] 期間每次施放基礎技能（Q／W／E）有 35%機率，法杖於 0.5 秒後免費再施放同一招一次（同等威力）` — 未知標籤 [自主迎擊] —— 這支工具沒有規則檢查它

  <details><summary>authoringNote</summary>

  owner 裁決③：保住「七」＝ Q/W/E/R/EX ＋普攻＋道具主動 ＝ 7 種行動。
[七寶玉]「每完成一次不同的有效技能行動點亮 1 顆寶玉，最多 7 顆」= passive[0..6]，**一種行動一條 hook、一個自己的 stackKey + maxStacks 1** —— 所以同一種行動做一百次仍然只點亮一顆，而七條加起來就是上限 7。⛔ 不用 maxStacks 7 的單一疊層：那會讓「只按 Q 七次」就全亮，而規格說的是**不同的**行動。
「每顆使技能效果 +5%」= 每顆各 outputDamagePct / outputHealingPct / outputShieldPct **flat 0.05**（0 = ×1，七顆 = +35%）。線性不是複利：文案寫「+5%」。
⚠️ 降級①：輸出倍率三兄弟**沒有 scope**（`scopeSlot` 只開給 cdr），所以「技能效果」實際上連**普攻**也一起放大。引擎沒有「只放大技能」的旋鈕。
⚠️ 降級②（最重要）：第 7 顆本來要掛「道具主動」，而 `sim/systems/CommandSystem.ts` 的 `useItem` 今天是 **deferred feature、accepted but inert**，⛔ 沒有任何事件 —— 照原案寫下去那一顆**永遠點不亮**，於是「七顆全亮」是一句死承諾（失敗形態②）。⇒ 第 7 顆改掛**天生技的主動施放**（`abilitySlot:"PASSIVE"`，約 57 位英雄的天生技是 active），它同樣是「引擎分得出來的第 7 種行動」。天生技是純被動的英雄仍然只點得到 6 顆。`useItem` 接上之後把那一條的 `on` 換掉即可。
[自主迎擊]「七顆全亮後進入 7 秒」= passive[7]：`condition.status{minStacks:7}` 讀的就是七顆寶玉共用的那個 statusId（`statusStacks` 把七份來源相加），`maxTriggers: 1` 讓它一場只發生一次（= 文案的「後」是一個一次性的轉場）。7 秒 = 那份 buff 的 duration，而它用 `hooks` 帶著限時觸發器 —— 到期跟著 buff 自己的 expiresAtTick，沒有第二個時鐘。
「非終極技能」= Q/W/E。引擎的「終極」判準是 `slot === "R"`（WorldHookSystem 的 onUltimateCast），而 owner 在 #57 把技能分成基礎／終極兩類，所以取 基礎 = Q/W/E；EX 沒有代放（它是寶具槽，另一件事）。
「0.5 秒後再施放一次」= `delayed{delaySec:0.5}` → `proxyCast{slot, payCosts:"none", targetMode:"inherit"}`（不扣魔、不轉冷卻，否則每次施法都會把自己那一格鎖住）。`emitCastEvents` 留空 = false ⇒ 代放**不發** onAbilityCast，所以它既不會再點亮寶玉、也不會遞迴觸發自己。
⚠️ 降級③：「以 **35% 效果**」寫不出來 —— `proxyCast` **沒有強度比例欄位**，而 `scaleEffects` 只在職業限定閘不符時才折。⇒ 降級成 **35% 機率代放一次全額**（`chance: 0.35`）：期望輸出相同、方差不同。要真的做成 35% 強度需要新機制。
⭐ **2026-08-18 逐句徹查**：實作沒有改，**description 改成實作真的會做的事**（第〇·六守則：實作對就改描述）。四處原本在說謊：① 原文「不同的有效**技能**行動」而第 7 種是**普攻**，且 7 種是哪 7 種讀者無從得知 ⇒ 逐項列出。② 原文「每顆使**技能**效果 +5%」而輸出倍率三兄弟**沒有 scope**，普攻／DoT／道具觸發一起放大 ⇒ 改成「你造成的傷害／治療／護盾」。③ 原文「七顆全亮**後**進入 7 秒」沒說那是 `maxTriggers: 1` 的**一場一次**，而寶玉是 match-permanent ⇒ 第二回合起這一段不會再發生，必須寫出來。④ 原文「以 **35%效果**」是 35% **機率**（見降級③）⇒ 改成機率並註明同等威力。

  </details>

### 📝 石鬼面 `stone-mask`

- ❔ `[究極肉體] 生命首次低於 50%時啟動至回合結束：最大生命 ×1.25、生命回復 ×3、全能吸血 +25%、攻速 ×1.25、移速 ×1.15` — 未知標籤 [究極肉體] —— 這支工具沒有規則檢查它
- ✅ `[疊層] 究極肉體啟動後，生命每再掉一階（低於 50%／40%／30%／20%／10%）各再使生命回復 ×1.10，五階合計 ×1.61` — [疊層] ← applyBuff

  <details><summary>authoringNote</summary>

  [究極肉體]「生命首次低於 50%時啟動至回合結束」= passive[0]：onDamageTaken + condition hp/percent < 0.5。「至回合結束」= permanent + permanentScope:"round"（⛔ 不猜秒數，回合長度是相位機決定的；拆除點是 `clearRoundScoped`，host 在 enterCombat 跑）。「首次」= stackKey + maxStacks:1 —— 一份來源，第二次觸發只把層數夾回 1；permanent 不回寫到期 tick。⚠️ `clearForFreshBody`（死亡/復活共用）只清 status/shields/dot，**不清 buff 來源**，所以中途死掉再站起來這一份仍在（＝文案的「至回合結束」）。
逐句：最大生命 ×1.25 = maxHealth pctMult 0.25；生命回復 ×3 = healthRegen pctMult 2.0；全能吸血 +25% = lifesteal flat 0.25 **加** spellVamp flat 0.25（這個 repo 的「全能吸血」就是這兩條，⛔ 沒有第三條屬性）；攻速 ×1.25 = as pctMult 0.25；移速 ×1.15 = ms pctMult 0.15。
[疊層] ⭐ **2026-08-18 逐句徹查時重做**（被取代的舊做法全文 + 完整理由：`docs/legacy/_item-authoring-notes-full.md` 的「石鬼面 (#55)」）。現在是 passive[1..5]，**五道獨立的門檻 hook**，形狀與 #69 兎月【雙弦月】的五道階梯逐字相同：
· 每道的 condition = all[〔究極肉體〕在身上, `hp percent < 0.5 / 0.4 / 0.3 / 0.2 / 0.1`]，各給 healthRegen pctMult 0.10。
· **各自一個 stackKey + maxStacks 1** ⇒ 一階只算一次；五份獨立來源的 pctMult 相乘（statPipeline 的 Π(1+v)）= 1.10^5 = **×1.6105**，與描述的「五階合計 ×1.61」逐字相符。
⭐ 為什麼換掉舊做法：舊版量的是「受到一次傷害」而描述寫「每損失 **10%生命**」（量尺不對），而且它靠一個**我自己補的** `internalCooldown: 1` 節流才不會被一發 DoT 灌滿。門檻階梯讓描述逐字為真，⛔ 而且不需要任何新機制、也不需要任何我發明的常數。強度一分未減。
⚠️ 走 stackKey 而不是複利路徑：複利路徑的額度用 `buff:hook:<來源>#` **前綴**數，而同一件道具的每一條 hook 共用同一個 origin（`fireHooks` 的 `hook:${src.id}`）—— 六道會共用一本帳。stackKey 的 id 是 `buff:stack:…`，六道各自獨立。
⚠️ 觸發點是 onDamageTaken，所以「掉到門檻以下」要**由一次傷害造成**才會結算。

  </details>

### 📝 火把師父 `torch-master`

- ❔ `[熟練度解放] 每次命中敵方英雄累積 1 層熟練度，最多 20 層，整個回合不會衰退` — 未知標籤 [熟練度解放] —— 這支工具沒有規則檢查它
- ❔ `[熟練度解放] 每層使你造成的傷害／治療／護盾 +2%（20 層 = ×1.40）。普攻與技能共用同一份熟練度` — 未知標籤 [熟練度解放] —— 這支工具沒有規則檢查它

  <details><summary>authoringNote</summary>

  [EX解放] owner 規格 #54（貓耳貓／火把）。逐句：
「每次命中英雄」= 兩條 hook（onBasicAttack / onAbilityHit）+ victim:"enemyChampion"（隊友與小怪都不算）。
「該攻擊來源效果 ×1.02」= 輸出倍率三兄弟 outputDamagePct / outputHealingPct / outputShieldPct 各 **flat 0.02**（0 = ×1）。「效果」讀成三軸而不是只有傷害，與 #58 安茲之杖 對「技能效果」的讀法一致。
「最多 20 層」= maxStacks 20；「整個回合不會衰退」= permanent + **permanentScope:"round"**（⛔ 沒有猜秒數 —— 回合長度是相位機決定的，拆除點是 host 的回合開始）。

⚠️ **降級①（owner 已裁決）**：「普攻與每個技能**各自**擁有獨立熟練度」需要 per-slot 的疊層桶，引擎沒有 —— `applyBuff` 的層數桶是 stackKey（全域）或 origin 前綴（逐道具槽），兩種都分不出 Q/W/E/R。⇒ 降級成**一份共用的熟練度**：兩條 hook 共用同一個 stackKey，普攻與技能一起把同一疊推到 20。要做原案得替每一槽各開一條 hook + 各自的桶（#58 安茲之杖 用的就是那個形狀），但那會讓上限變成 6×20。

⚠️ **降級②（數值，不是機制）**：owner 寫「×1.02 … 20 層約 ×1.49」＝**複利**，而輸出倍率三兄弟**做不到複利** —— 它們的 base 是 0，而管線是 `(base+Σflat)×(1+ΣpctAdd)×Π(1+pctMult)`，所以 0 底的屬性上任何 `pctMult` 都會乘到 0（一條掛得上、永遠是 0 的 modifier ＝ 失敗形態②）。唯一會動的 op 是 `flat`，而 flat 恆為線性。⇒ 每層 +0.02 **線性**，20 層 = ×1.40 而不是 ×1.49。⛔ 沒有改成 0.0243 去湊 ×1.49：owner 給的規則是「每層 ×1.02」，總積是它的註解。description 印的是**真的會發生**的 ×1.40。

⚠️ 輸出倍率沒有 scope（`scopeSlot` 只有冷卻讀得到），所以這 20 層同時放大普攻、技能、DoT、道具觸發與治療護盾。
⚠️ statusId 只是讓 HUD／條件數得到層數，沒有任何 status-effect 文件（`applyBuff.statusId` 不是 ref，不會產生 dangling 警告）。

  </details>

### 📝 終極魔改・不知火 `ultimate-mod-shiranui`

- ❔ `[魔改解放] 攻擊力、攻擊速度、暴擊傷害 各自 ×1.5` — 未知標籤 [魔改解放] —— 這支工具沒有規則檢查它
- ❔ `[上限突破] 攻擊速度上限提升至 10（預設上限為 4）` — 未知標籤 [上限突破] —— 這支工具沒有規則檢查它
- ❔ `[萬象凋零] 普攻命中敵方英雄時，附加全部負面效果各 1 秒：破甲（防禦 −50%）・破魔（魔抗 −50%）・致盲＋詛咒（普攻失手 50%）・燃燒（每 0.5 秒 50 點魔法傷害）・重創＋禁療（治療／吸血／自然回復歸零）・混亂・恐懼・麻痺（攻速 −40%）・癱瘓（不能施法也不能普攻）・纏繞・減速 40%・暈眩` — 未知標籤 [萬象凋零] —— 這支工具沒有規則檢查它
- ❔ `[溢出] 任一屬性首次達到一般上限時，這三項再 ×1.15，最多 3 次` — 未知標籤 [溢出] —— 這支工具沒有規則檢查它

  <details><summary>authoringNote</summary>

  【owner 2026-08-18 裁決】「提高攻速上限至10 另外**攻擊附加全部負面效果**就好」。

[上限突破] = `as capRaise 10.0`。原本三條 capRaisePct 有兩條是空頭（`ad` 的 unlocked===base、`critDamage` 根本不在 `config.stat-caps@1`），只有 `as` 解得開（4→10）。

⭐ **2026-08-18 第二輪修正 —— 14 個 applyStatus 原本一格機制欄位都沒有。** applyStatus 收得下任何 statusId 字串，但 `sim/components.ts::StatusEffect` 只認得固定那幾格；沒填就只是一個字串：狀態列照樣畫圖示、玩家看到「他被暈了」就不敢上，而對方完全自由。⛔ 比沒效果更糟，它會誤導決策。逐個對照 StatusEffect 補上：
· **破甲／破魔／麻痺** → applyStatus **沒有**護甲、魔抗、攻速這三格 ⇒ 走「標記 + 同秒數 applyBuff」（出貨前例：80-02 `godie-h01u.w` 破甲、92-02 `godie-h02v.e` 破魔、52-03 `godie-hapm.e` 麻痺）。armor/mr `pctAdd −0.5`、as `pctAdd −0.4`。⚠️ **stackKey + maxStacks:1 是承重的一格**：不填 stackKey 每一刀 attach 一個新的 ModifierSource，而 statPipeline 對 PercentAdd 會乘 `src.stacks` ⇒ 攻速 10 時一秒疊 10 份，防禦瞬間變負。
· **燃燒** → applyStatus 沒有 dot 欄位 ⇒ 標記 + `dot`（50／0.5 秒，共 1 秒，`refresh`）。⛔ 不可以用 `independent`：普攻 10/s 會在一個受害者身上堆出幾十段燒傷（同 炎龍巨弩 godie-i00i 的風險）。
· **致盲／詛咒** → `missChance 0.5`（`combat/evasion.ts::missChanceOf` 取 MAX，同值所以不會疊成 100%）。**混亂** → `berserk`+`targetsAllies`（同 `godie-h02k.r`）。**恐懼** → `feared`。**纏繞** → `root`。**暈眩** → `stun`。**減速40%** → `moveSpeedMult 0.6`。**癱瘓** → `silenced`+`disarmed`（stun 已含這兩格；分開填是為了 stun 被免控擋掉時還留得下一半）。
· **重創** 0.5/0.5/0.5（owner 裁決⑥的預設）＋**禁療** 0/0/0（`no-heal.json`：禁療就是三格填 0 的重創）。⚠️ `sim/grievousWounds.ts` 的 `stackMode` 出貨是 `"max"` ＝取最小倍率 ⇒ **兩者同時在身上時禁療的 0 蓋過重創的 0.5**，重創那三個數字要等禁療先被拔掉才看得到。

⚠️⚠️ **平衡後果，要 owner 知道**：14 條同時上，其中 `stun`/`root`/`feared`/混亂/癱瘓/麻痺 是行動剝奪，而攻速 10 ＝每秒 10 刀 ⇒ 被鎖定的目標**實質上永遠不能行動**，而且治療、吸血、自然回復全部歸零。**duration 1.0 秒、破甲／破魔 −50%、麻痺 −40%、燃燒 50／0.5 秒、失手 50% 全部是我定的數字，⛔ 不是 owner 給的。** 收斂的旋鈕有三個，三個都是欄位：時長、hook 加 `internalCooldown`（每 N 秒才附加一次）、或把六條行動剝奪從名單移除。

⚠️ 名單刻意排除 named-variant（`burnstun`/`fang-stun`/`ingredient`/`omnislash-lock`/`trial-stun`）—— 那些是別支技能專屬的 stun 別名，借過來會讓戰報指到錯的招式；三段減速只留最強的 `slow40`。

[魔改解放]／[溢出] 未動。完整沿革見 `docs/legacy/_item-authoring-notes-full.md`。

  </details>

### 📝 兎月【雙弦月】 `usagizuki-twin-crescents`

- ❔ `[下剋上] 普攻時比較雙方攻擊力：自身低於目標的 90%／80%／70%／60%／50%，每達成一條算一階，最多 5 階` — 未知標籤 [下剋上] —— 這支工具沒有規則檢查它
- ❔ `[下剋上] 每階暴擊率 +6%、暴擊傷害 ×1.10，持續 3 秒（每次普攻重新計算並延長）` — 未知標籤 [下剋上] —— 這支工具沒有規則檢查它
- ❔ `[滿階] 五階 = 暴擊率 +30%、暴擊傷害 ×1.61` — 未知標籤 [滿階] —— 這支工具沒有規則檢查它

  <details><summary>authoringNote</summary>

  [下剋上]「比較自身與攻擊目標的核心戰鬥屬性，每低於敵方一個差距階級，暴擊率 +6%、暴擊傷害 ×1.10，最多 5 階；五階約 ×1.61」= passive[0..4]，**五道獨立的階梯 hook**，唯一的差別是 condition.other.scale：0.9 / 0.8 / 0.7 / 0.6 / 0.5。
· 一道 = 一個「差距階級」。每一道問的是 `self.ad < scale × target.ad`（⭐ 新的 condition.other：右手邊 = value + scale × 那個讀數，這裡 value 填 0）。差距越大成立的道數越多，劣勢到只剩對方一半時五道同時成立 = 5 階 —— ⛔ 完全不需要計數器，階數是條件自己數出來的。
· 每道各給 critChance flat +0.06 與 critDamage pctMult 0.10。**五份獨立來源**的 pctMult 是相乘的（statPipeline 的 Π(1+v)），所以 1.10^5 = ×1.6105，正好是 owner 的「約 ×1.61」；暴擊率 5×6% = +30%。
· ⭐ 為什麼**每道各給一個 stackKey**（usagizuki-crescent-1..5）而不是走複利路徑：複利路徑的 source id 是 `buff:<origin>#<tick>`，而**同一件道具的五條 hook 共用同一個 origin**（fireHooks 的 `hook:${src.id}`）—— 五道在同一 tick 成立會互相覆蓋，只剩一份活著，而畫面上跟正常一模一樣（失敗形態②）。逐道一個 key 讓五份來源各自獨立；maxStacks: 1 則讓同一道不會自我疊加（每一階只算一次）。
· duration 3 秒而不是 permanent：這一條比的是**當下這個攻擊目標**，換到一個比自己弱的目標時它必須掉下來。每次普攻都會把同 key 的到期時間整份往後推，所以持續打同一個強敵時它是連續的。
⚠️ 降級：原文「核心戰鬥**屬性**」是複數，這裡只比 `ad` 一條。condition 的 stat 葉一次只讀一條屬性，引擎沒有「多條屬性合成一個差距階級」的聚合；用 any 把 ap 也接上會讓物理英雄靠對方的 AP 差距白拿滿階，用 all 則幾乎永不成立。要真的做成複合指標需要一顆新的條件葉。
⭐ **2026-08-18 逐句徹查**：實作沒有改，**description 改成實作真的會做的事**。三處原本是無效／讀不出來的說明：① 「核心戰鬥屬性」讀者無從得知是哪些，而實際只有**攻擊力** ⇒ 明寫。② 「一個差距階級」在遊戲裡沒有任何地方定義得出來 ⇒ 把五道門檻（90/80/70/60/50%）直接印在卡面上。③ 整句讀起來像**常駐**條件，實際是普攻時掛上、**3 秒**到期、每次普攻延長 ⇒ 寫出來。順帶補上滿階的暴擊率 +30%（原本只印了暴擊傷害那一半）。

  </details>

### 📝 晨曦之光 `godie-i016`

- ✅ `[看穿] 看穿隱形` — [看穿] ← __vision__
- ✅ `[格擋] 30%機率 抵擋致命一擊(超過現存生命的傷害)` — [格擋] ← __block__
- ✅ `每秒回魔+8` — manaRegen 對得上
- ❔ `冷卻縮減+30%` — 無法分類（純敘述？還是漏掉的機制？）
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
⭐ 2026-08-18 稽核：五句兩個方向都對得上，資料零改動。[重創] 的 `lifesteal pctMult -0.5` **確實有效**（吸血靠 flat 進 base 桶，⛔ 不是 base=0 那族陷阱），方向也對（`onDamageTaken` 的 owner 是被打的人、target 是攻擊者）。⚠️ **沒有 statusId** ⇒ 狀態列沒有「重創」圖示 —— 四件同型一起改，送 owner。

  </details>

### 📝 天生牙 `godie-i031`

- ✅ `[復活] 殺死任一個敵方英雄單位，將復活我方所有英雄` — [復活] ← revive
- ✅ `[回復] 殺死任一個敵方單位，回復我們全部英雄 1%生命` — [回復] ← restore
- ❔ `[淨化] 每 10 秒移除周圍隊友身上的減益` — 未知標籤 [淨化] —— 這支工具沒有規則檢查它
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
要收，改上面那兩個欄位其中一個就好，不用改程式。 ｜ [淨化]（A4b/#278）：`radius: 9.17` 是這個 repo 既有的道具靈氣半徑（7 件帶 auras 的道具裡 6 件用它），不是新發明的數字。⚠️ 這一條用 `shape: "circle"` 而不是同一份文件另外兩條 hook 的 `target: "allies"`（全隊語意）—— 因為 owner 授權的那一行寫的是「**周圍**隊友」。半徑吃 combatEnv.abilityRange。

  </details>

### ✅ 死之王的意志 `godie-i060`

- ✅ `AP+174` — ap 對得上
- ✅ `[斬殺] 可直接斬殺生命低於 3%的敵方單位` — [斬殺] ← damage
- ✅ `[緩慢] 周圍敵方 總移動速度 減半` — [緩慢] ← __aura__
- ✅ `額外 [死之王套裝] 同時裝備死之王長槍、意志、神盾，則總 AP 額外 + 300%` — 套裝加成 = item@1.sets（一套只發一次，見 sim/economy/itemSets.ts） ← __itemSet__

  <details><summary>authoringNote</summary>

  ⭐ 2026-08-18 逐句稽核（第一·五守則）：四句效能全部對得上，**資料一個字都沒改**，只更正了下面這份備註自己說謊的地方。

「AP+174」= modifiers ap flat 174。
[緩慢]「周圍敵方 總移動速度 減半」= auras[0]（affects enemy，ms **pctMult -0.5** = ×0.5 = 減半）。⭐ 選 pctMult 而不是 pctAdd 是因為文案寫的是「**總**移動速度」—— 管線 `(base+Σflat)×(1+ΣpctAdd)×Π(1+pctMult)` 的最後一段乘的正是總值。radius 9.17 是**文案沒有給**的欄位（= w3x 500 距離單位的標準換算，與靈壓同一個數）。
[斬殺]「可直接斬殺生命低於 3%的敵方單位」= passive[0]，不需要任何新的 effect kind。
· 「生命低於 3%」= condition {subject:"target", stat:"hp", mode:"percent", op:"<", value:0.03}（sim/content/condition.ts；「低於」是嚴格小於，與鍊金術之盾 godie-i06q 的 5% 寫法一致）。
· 「直接斬殺」= 目標**最大生命 35%** 的真實傷害。對一個已經低於 3% 最大生命的身體，那是十倍以上的致死量；0.35 是 HP_PCT_DAMAGE_MAX（content/schema/effect.ts）的上界，也就是這個原語能給的最大保證。
· ⚠️ 觸發事件選 onBasicAttack 而不是 onDamageDealt，是一個**決策**，理由是終止性：onDamageDealt 會被斬殺自己打出的那一發再次觸發（damage.ts:771），而 combatResolveSystem 的「死了就丟包」守衛是 `!hp.alive`，而 alive 要等 DeathSystem（slot 9）才翻，所以同一 tick 內會多跑幾輪空轉。onBasicAttack 完全沒有這條回路，而且與出貨的 幻之匕首（godie-i039，「3%機率造成敵方 20%生命傷害」）同一個事件。`on` 本身就是後台欄位：想讓技能傷害也能斬殺，把它改成 onDamageDealt 即可。
· 【2026-08-01 落地】[死之王套裝]「同時裝備死之王長槍、意志、神盾，則總 AP 額外 + **300%**」= sets 的 ap pctAdd **3**。⚠️ 2026-08-18 更正：這一句在三份套裝文件的備註裡都寫成「+ 100%」（同一段複製三份），而卡面與資料從來都是 300% —— 說謊的是備註不是實作（第三守則）。三份文件各自帶一份**一模一樣**的 sets 區塊（item@1.sets，pieces 三件、requiredPieces 省略 = 全部）。獎勵不是掛在每一件上，而是 sim/economy/itemSets.ts 依 set id 掛**一個** `item-set:` 來源 —— 每件各掛一份就會變成 pctAdd 9.0（+900%）。重算點在 economy/itemSource.ts 的 attachItemSource / detachItemSource，所以買 / 賣 / 反悔 / 三選一 / 商店預覽全都會重跑，不必各自記得。守衛：sim/lichkingSet.test.ts（出貨文件）與 sim/economy/itemSets.test.ts（機制）。
· ⚠️ 這裡原本記的補法（在 modifier entry 上加 requiresItems 閘，再讓 shop.ts 的三個 attachSource 呼叫點各自重跑一次）**沒有採用**：那個形狀要在四個呼叫點各記得一次，而漏掉一個正是它自己預告的「買齊會亮、抽到不會亮」。改成把重算收進 attach/detach 這一道**唯一的縫**，呼叫點一個都不必改。

  </details>

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
  · ✅ **owner 2026-08-01「0.3秒就可以了」→ duration: 0.3。** 舊註解寫「持續秒數是 owner 沒給的數字，出貨 1 秒是保守值」—— 那句話從這天起是假的，已刪（第三守則）。30 Hz 下 `Math.round(0.3/(1/30))` = **正好 9 tick**，不是被 round 吃掉的邊界值。行為守衛在 `pigButcher.shipped.test.ts`：斷言「第 9 tick 還被按住、第 10 tick 自由」，不是「欄位等於 0.3」。文案沒有寫秒數，所以 description 不動，`legendary49OwnerText.test.ts` 維持綠。
  · ⚠️ **internalCooldown: 3 秒仍然是 owner 沒給的數字**（保守值）：ICD 封住攻速上限那一端。0.3 秒控場配 3 秒 ICD = 上線率上限 10%。
  · ⚠️ **「變成食材」的視覺沒有做。** championForm 換的是**施法者自己**的 transform.counterpartId（sim/effects/championForm.ts：主詞永遠是 ctx.caster），指不到別人也指不到非英雄模型。要做需要一格 ENTITY_FLAG（⚠️ 2026-08-18：`ENTITY_FLAG_FREE_BITS` 已是**空陣列**，16 顆用光，這條路關了）或一個新的狀態視覺事件 + 客戶端消費者。目前玩家看到的是既有暈眩表現。
· [格擋]「30%機率 抵擋致命一擊」= block{damageTypes:[physical,magic,true],chance:.3,fraction:1,lethalOnly:true} —— 與 晨曦之光 godie-i016 同一句話同一組值，理由寫在那一份，不重複。w3x 這一格是 A03U◄ANss Spell Shield **Cool 100**；owner 改寫時把那一行刪掉，之後在 2026-08-01 裁定 **internalCooldown: 1 秒**（出貨值，見 block.internalCooldown）。
  · ⚠️ **2026-08-01 owner 推翻了原本的多來源規則。** 舊註解寫「取 chance×fraction 最大者…帶兩件格擋不會比一件強」—— 那已經**不是**現在的行為。owner 裁定「獨立判斷兩次，拿第一次擋掉剩餘繼續算下一次」，所以每個來源各抽各的骰、各自從**剩餘**傷害再削一次：本件 + 晨曦之光 兩件 30% 實測是 **51%**（1−0.7²），三件是 65.7%。規則是欄位 blockRules.stacking（出貨 "independent"，舊行為 "best" 仍可切）。機制在 sim/combat/block.ts。

  </details>

### 📝 再誕之淚珠 `teardrop-of-rebirth`

- ❔ `[再誕] 每回合一次，死亡 3 秒後以 100%生命、100%魔力復活` — 未知標籤 [再誕] —— 這支工具沒有規則檢查它
- ❔ `[再誕] 復活後 6 秒內總傷害、治療與護盾 ×1.25、移速 ×1.20` — 未知標籤 [再誕] —— 這支工具沒有規則檢查它

  <details><summary>authoringNote</summary>

  [再誕]「每回合一次」= passive[0] 的 condition `not status teardrop-of-rebirth-spent` ＋ effects[0] 掛上那個標記：applyBuff modifiers:[]（純標記，沒有數值）+ statusId + permanent + permanentScope:"round"。⭐ 這是「每回合一次」唯一不用猜秒數的寫法，而且**兩半都是量得到的**：`clearForFreshBody`（死亡/復活共用的那支）只清 status/shields/dot，**不清 buff 來源**，所以這個標記跨得過持有者自己這一次死亡；`clearRoundScoped` 在下一回合開打前才把它拔掉。⛔ 刻意**不用** revive 的 `teamCharge:"requireAndSpend"` —— 那是**全隊共用的復活圈額度**，用它等於「隊友用過復活圈就沒有淚珠」，那不是 owner 寫的東西。
「死亡 3 秒後」= onDeath（這個事件的持有者依定義就是剛死的那個）→ delayed delaySec 3。⚠️ `dropDeadTargets:false` 是**承重的一行**：那一格的預設是 true（跳過死掉的目標），而這裡的目標依定義就是一具屍體 —— 少了它整張卡一次都不會生效。`stopOnCasterDeath:false` 是預設值，明寫是因為這張卡的施法者就是死人。
「以 100%生命、100%魔力復活」= revive hpPct 1 / manaPct 1。⚠️ 兩格**不可以省略**：省略會落到 `config.arena-rules@1` 的 reviveCircles 出貨值 0.5/0.5，也就是半血半魔。
「復活後 6 秒內總傷害、治療與護盾 ×1.25」= ⭐ 新的輸出倍率三軸 outputDamagePct / outputHealingPct / outputShieldPct 各 **flat 0.25**，duration 6。⛔ 不可以寫 pctMult：這三條的底值是 0，讀取點（sim/stats/outputMult.ts）是 `1 + final[stat]`，乘一個 0 還是 0。三格分開填正是 owner 這一句「傷害、治療與護盾」三樣都要的寫法。
「移速 ×1.20」= ms pctMult 0.20。
⚠️ 增益排在 revive **後面**，這樣它落在已經站起來的身體上。
⭐ **2026-08-18 逐句徹查補上的一格**：那份增益現在帶 `condition{stat:hp, percent, > 0}`。文案寫的是「**復活後** 6 秒內」，而在這一格之前**復活成功與否根本沒被檢查** —— 火圈全閉合時 `reviveChampionAt` 會回 null（#195），於是那 6 秒倍率會掛在一具**還躺著的屍體**上（失敗形態②：卡片、後台、JSON 全都對，玩家什麼都沒拿到）。`DeathSystem` 死亡那一 tick 明寫 `hp.hp = 0`，而復活成功是 100%，所以「hp% > 0」逐字就是「真的站起來了」。⚠️ 求值時機是承重的：`runEffects` 逐一 `applyEffect`，revive 是 effects[0]、這一格是 effects[1]，所以條件讀到的是**復活跑完之後**的身體。
⚠️ 仍然存在的取捨（引擎題，不是這張卡的）：復活被拒時**那一回合的額度已經扣掉了** —— `teardrop-of-rebirth-spent` 在 onDeath 當下就掛上，⛔ 沒有搬進 delayed 裡是刻意的（搬進去的話回合在 3 秒內結束就等於沒扣過，而那條路更難看出來）。

  </details>
