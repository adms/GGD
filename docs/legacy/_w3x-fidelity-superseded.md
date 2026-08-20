# w3x 保真度資料：被 owner 新版設計取代的部分（存檔，⛔ 不要刪）

> owner 2026-08-12 裁決（逐字）：
> 「**(c) 分開**，但預設**一律以我新版的優先**，除非我的設計有明顯的缺失你可以來問我」
>
> 「分開」的意思就是這一份檔案：**新版贏，但原作資料另外存起來**。
> `packages/shared/src/sim/abilities/nativeFidelity.test.ts` 的斷言已經改成驗新規格，
> 所以 task #78「1:1 對照 w3x」在這幾支上的**結論**不再住在測試裡 —— 它住在這裡。
>
> 用途：
> 1. 有一天 owner 想把某一支「調回原作」，這裡有現成的 w3a/JASS 數值，不必重跑 #78。
> 2. 新版設計如果被判定有缺失（他允許來問），這是「原作怎麼做」的對照組。
> 3. 它同時是一份**警告**：下面每一列都曾經是一條會紅的守衛，現在不是了。
>
> 資料來源：`nativeFidelity.test.ts` 改動前的註解與斷言 + 該次重製前的內容文件
> （`git show <重製前 commit>:content/abilities/<id>.json`）。

---

## 1. `godie-h01u.q` — 80-01 天下無雙

| | 內容 |
|---|---|
| **原作（w3x / JASS）** | JASS `skill1` → **A0N5**（`Iatt` 攻擊力加成）lv2 = **+25 AD**；**A0N4**（`Idef` 防禦加成）lv2 = **-3 armor**。逐階**取代**不是疊加：lv5 = **+100 AD / -12 armor**。**常駐被動**，不可施放。 |
| **重製前的出貨文件** | `passive.ranks = [{ad +25, armor -3}, {ad +50, armor -6}, {ad +75, armor -9}, {ad +100, armor -12}]`（純 `modifiers`，永久） |
| **新規格（owner 2026-08-12，贏）** | `[被動][普攻時][層數累積]`「每次 [普通攻擊時] 都會增加 10% [攻擊速度] 並可[疊加]，持續1秒，若沒有繼續攻擊則[疊加]的 [攻擊速度] 增益歸零。」→ `passive.ranks[0].hooks[0] = { on: "onBasicAttack", target: "self", effects: [applyBuff{as pctAdd 0.1, duration 1, statusId "rage"}] }` |
| **性質變化** | 常駐 → 觸發；AD/護甲 → 攻速；逐階取代 → **只有一階**（`maxRank 4` 但 `passive.ranks` 只有一列，`rankBlock` 夾到最後一列） |
| **失去的守衛** | 「逐階**取代**不是疊加」這條（rank 4 讀到 0.60 就是 bug）在新版沒有對應物 —— 新版只有一列，不存在疊階錯誤。 |

## 2. `godie-h01u.passive` — 80-00 飛將神弓

| | 內容 |
|---|---|
| **原作（w3x）** | **A0AU**：擊殺時 **+10 AD**，限時。 |
| **重製前的出貨文件** | `hooks[0] = { on: "onKill", target: "self", victim: "champion", effects: [applyBuff{ad flat 10, duration 10}] }` |
| **新規格（owner 2026-08-12，贏）** | `hooks[0] = { on: "onKill", target: "self", effects: [applyBuff{as pctAdd 0.01, range flat 0.01, duration 99999}] }`（≒永久、每殺一層） |
| **性質變化** | +10 AD／10 秒 → **+1% 攻速 + 0.01 攻擊距離／永久**；`victim: "champion"` 的限制拿掉了（小怪也算） |
| ⚠️ **順手抓到的一個謊** | 舊測試的註解寫「it is a **15 s** buff, so run past it」，但**出貨文件寫的是 10 秒**。註解與資料從一開始就不一致（CLAUDE.md 第三守則）。斷言剛好因為 15 > 10 而通過，所以沒有人發現。 |

## 3. `godie-h01u.e` — 80-03 鬼神烈戟

| | 內容 |
|---|---|
| **原作（w3x / JASS）** | 以**自己為圓心**的範圍傷害（`perRank 350 / 550 / 750 / 950`，magic），命中者吃 w3a **增加防禦 -3 / -6 / -9 / -12**，**持續 3 秒**。魔耗 250/350/450/550。 |
| **重製前的出貨文件** | `effects = [damage{perRank 350..950, magic}, applyBuff{armor -3..-12, duration 3, perRank}]` |
| **新規格（owner 2026-08-12，贏）** | `[主動][指向][範圍][衝刺][AP加成]`「[衝刺] 一段距離並造成一[直線][範圍] 150/200/250/300 + 30% [AP] 傷害。(若對方在 [破甲] 狀態，則額外造成 100% [AP] 傷害)」→ `effects = [dash{toPoint, speed 30, maxDistance 10}, damageLine{perRank 150..300 + 0.3 AP, length 10, width 2}]` + `passive.hooks[0] = { on:"onAbilityHit", abilitySlot:"E", condition:{status, target, statusId:"armor-break"}, effects:[damage{50 + 1.0 AP}] }`。魔耗改 150/200/250/300。 |
| **性質變化（最大的一項）** | **破甲從「這一招施加的」變成「這一招要讀的條件」** —— 方向整個反過來。現在施加 `armor-break` 的是 **W 弒鬼神**（`applyStatus{armor-break, 1s}`），E 只是吃它的加成。 |
| **失去的守衛** | 「以自己為圓心的圓 → 前後左右都中」與「護甲掉了 3 秒後回來」兩條。新測試改驗「線上的中、線外的完全沒事」與「E 自己**不再**削護甲」。 |

## 4. `godie-edem.r` — 45-04 哥哥

| | 內容 |
|---|---|
| **原作（w3x）** | **Aamk**（屬性強化）系：**靈敏度加成 12 / 24 / 36** → armor **+3.6 / +7.2 / +10.8**、攻速 **+24% / +48% / +72%**。**常駐屬性被動**。 |
| **重製前的出貨文件** | `passive.ranks = [{armor +3.6, as pctAdd 0.24}, {armor +7.2, as 0.48}, {armor +10.8, as 0.72}]` |
| **新規格（owner 2026-08-12，贏）** | `[被動][技能命中時][身上有某狀態時][範圍][AP加成]`「當「千鳥」命中帶有[燃燒]標記的敵人時引發忍術「麒麟」雷電大爆炸，對目標[周圍][小範圍]敵人造成 400/700/1000 + 300% [AP] 傷害。」→ `hooks[0] = { on:"onAbilityHit", abilitySlot:"E", target:"event", condition:{status, target, tag:"burn"}, effects:[damageArea{400/700/1000 + AP, radius 3, maxTargets 6}] }` |
| **性質變化** | 常駐三圍被動 → **條件觸發的追加爆炸**。這支現在完全依賴 `condition.target-status@1` 這個機制（CLAUDE.md 第〇·五守則的那個「一個條件葉解鎖 12 支」）。 |
| ⚠️ **產出與規格的差異（不是我改的，記著）** | 規格寫 **300% [AP]**，產出的 JSON 寫 `ratios: [{stat:"ap", coeff: 1.0}]` ＝ **100%**。這是產生器 `tools/skill-remake/batch1.py` 的事，這一輪不動內容也不動產生器，所以只記錄不修。 |
| **失去的守衛** | 「Aamk 是三圍不是傷害核彈」這條 #78 的結論。⚠️ 這條原本擋的是**匯入器**把 Aamk 誤讀成傷害 —— 那個匯入器缺陷的守衛現在只剩 `godie-e00q`（力量強化 / 魔力增幅）兩條，**佐助這一條沒了**。 |

---

## 這一輪**沒有**動到的 Aamk / 保真度守衛（還活著）

| 測試 | 驗什麼 |
|---|---|
| `力量強化 grants STR (ad + maxHealth) and deals NO damage` | `godie-e00q.q` —— Aamk 誤讀成核彈的主守衛 |
| `魔力增幅 grants the Rhpt upgrade's mana pool, not 80 magic damage` | `godie-e00q.r` |
| `染血的柴刀 AOcr` 兩條 · `魔力應援 AOae` · `魔力激發 A0ST` · `鋼鐵尾巴 AHbh` | 常駐被動 / 光環 / 觸發機率 |
| `十萬伏特 ANfl` · `火遁-豪火龍之術` · `把你給MikuMiku掉` · `世界第一的公主殿下` · `鬼隱之擊` · `神聖結界` | 範圍解析 / 反轉機制 / 逐階欄位 |

---

## §N　三圍係數的 owner 覆寫（2026-08-13）

> 第〇·六守則：優先序階梯第 1 層（owner 的新版設計）贏過第 5 層（w3x 原始設定），
> 但「⭐ **『分開』不是『丟掉』**」—— 被取代的原作數值要另存。這一節就是那份另存。
>
> ⚠️ 守衛 `packages/shared/src/sim/attributeCoefficients.test.ts` 的
> `{ overrides }` 那一種**真的會讀這個檔**：原作值沒有記在這裡就紅。

| 係數 | w3x 欄位 | **原作值** | 現在出貨 | 為什麼改 |
|---|---|--:|--:|---|
| `strToAttackDamage` | `StrAttackBonus`（`war3mapMisc.txt`，Blizzard 也是 1.0）| **1.0** | **0.4** | 普攻壓垮技能，見下 |
| `agiToAttackSpeed` | `AgiAttackSpeedBonus`（地圖未覆寫，回退 Blizzard）| **0.02** | **0.01** | 等級上限 30 → 99，見下 |
| `intToManaRegen` | `IntRegenBonus`（`war3mapMisc.txt`；Blizzard 0.05）| **0.07** | **0.21** | 回魔節奏，見下（2026-08-20，GH#446）|

### 為什麼改 `intToManaRegen`：滿魔要 42 秒（2026-08-20）

owner 2026-08-20（逐字）：

> 「那我覺得**智慧影響回魔可以增加更多**、**初始回魔也增加少許**，
>  同時**20 秒的限制可以調高到 30 秒**」

⚠️ 這是他在 2026-08-19 講過的同一件事的第二步。第一步（把 `refillSeconds: 15`
做成一條**硬地板**）被他自己退掉了：「時間是**建議原則 不是死程式邏輯**」。
⇒ 這一次調的是**智慧那根軸**，⛔ 不是重新打開地板 ——
地板會把每一位英雄拉到同一個滿魔時間、**與他的智力無關**，
而 owner 這一則要的正是「**智慧**影響回魔增加更多」（保留智力的差距）。

量到的（71 隻裸裝，走出貨管線，LV30 / LV50 / LV99 三個錨點）：

| | `intToManaRegen` | `base-bonus.manaRegen` | 中位滿魔 | 超過 30 秒 |
|---|--:|--:|---|---|
| **調前** | 0.07 | 0 | 42.1 / 38.0 / 34.5 秒 | **68 / 66 / 62 隻** |
| **調後** | **0.21** | **10** | **15.8 / 14.1 / 13.2 秒** | **1 / 1 / 1 隻** |

⭐ owner 的新門檻（30 秒）三個錨點都只剩 **1 隻**超標；**建議值 15 秒**在 LV50／LV99
達成，LV30 是 **15.8 秒**（超 5%）—— ⛔ 沒有為了那 5% 再加碼係數。
⚠️ 剩下那一隻是 `godie-h02k` 熊貓，而他是**結構性**的例外：INT 2、intGrowth 0
⇒ 智慧那根軸對他逐位元是 0（調後仍是 38.8 / 36.4 / 34.0 秒，全部來自扁平的 base-bonus）。
他只吃得到扁平的 `config.base-bonus@1`。逐隻的表在 `docs/魔力回復例外清單.md`。
⚠️ 沒有撞到 `stat-caps` 的 `manaRegen` 上限 **926**：撞到的仍然只有 `godie-h020`
莉娜一隻（調前調後都是），⛔ 所以這一批**沒有動上限**。

### 為什麼改 `agiToAttackSpeed`：等級外插

owner 2026-08-13：

> 「我覺得問題應該是**敏捷提升攻擊速度的屬性該調整**吧，畢竟**之前等級上限只有 30**」

⚠️ 暴雪設計 `AgiAttackSpeedBonus = 0.02` 的時候，英雄上限是 **10 級**。
地圖把它拉到 30，GGD 拉到 **99** —— 而攻速是九條三圍推導裡**唯一的乘法列**
（`scaleBase`），所以只有它在等級外插下是**指數**放大的：

| 等級 | 敏捷中位 | 倍率 `1 + 敏×0.02` |
|--:|--:|--:|
| 30（地圖上限）| 70 | 2.39× |
| 99（GGD）| **197** | **4.95×** |

結果 L99 攻速中位數是 **12.2**，而系統上限是 **4** —— 超過 3 倍，
每個人的攻速都死在天花板上。0.01 之後 L99 倍率降到 2.97×，中位 7.34。

⚠️ 代價：**低等級的敏捷英雄變弱**（L18 倍率 1.94× → 1.47×）。
⚠️ owner 選 0.01 而不是 0.005，理由是他自己立的「計算最多取小數點兩位」。

### 為什麼改：普攻壓垮了技能

owner 2026-08-13：

> 「現在的玩法**普通攻擊太有利了**，可以一直輸出，**不用卡冷卻 MP 消耗吟唱**，
>  技能傷害爆發力對於玩家及 NPC **造成不了顯著一擊＝雞肋**」

量到的（法師，等級 99）：

| | |
|---|--:|
| 普攻每秒 | **1,328**（AD 332 × 攻速上限 4）|
| 技能一發中位 | **388**（base 200 + AP 係數 0.60 × AP 314）|
| ⇒ 一發技能等於普攻幾秒 | **0.29 秒** |

而主力技能的冷卻多半是 8~15 秒。

⭐ **關鍵發現：削 AD 比補 AP 有效** —— 普攻是**乘法**（AD × 攻速），技能是**加法**。
`strToAttackDamage` 1→0.5 一動，比值就從 0.58 推到 0.76，比 `intToAbilityPower`
從 2 拉到 3 的效果還大。

### 這一格不是單獨改的

owner 從六組配套裡選了最激進的一組（三格一起動，全部在 `combat-env.json`）：

| 係數 | 原本 | 現在 | 出處 |
|---|--:|--:|---|
| `strToAttackDamage` | 1.0 | **0.4** | ⚠️ w3x 匯入 → **本節** |
| `intToAbilityPower` | 1 | **4** | owner 自己的設計（w3x 沒有法強這根軸）|
| `multipliers.attackDamage` | 1.0 | **0.6** | GGD 自己的全域倍率 |

結果：法師普攻 1,328 → **566/秒**，技能一發 388 → **954**，
⇒ 一發技能 = **普攻 1.68 秒**。

⚠️ 只有 `strToAttackDamage` 這一格偏離原作，另外兩格本來就是 GGD 自己的。

### ⚠️ 這一批只動數值

owner 點名的「普攻**不用卡冷卻 MP 消耗吟唱**」是**結構**問題 ——
數值調整碰不到它。要真正對稱，還需要給普攻一個機會成本（另一批）。

---

## 70-00 芬多精：**光環也治療白木自己**（2026-08-13）

owner 逐字：

> 「70-00 follow new rule not w3a. **healing friend and self**.」

| 層 | 來源 | 說什麼 |
|---:|---|---|
| **1** | **owner 新版說明** | 友軍**與自己**都回血 ⇒ `includeSelf: true` ✅ **採用** |
| 5 | w3x 原始設定 | ⛔ 被取代 —— 見下 |

### ⛔ 被取代的原作事實（存這裡，⛔ 不要讓它無聲消失）

w3a `A0GM`「70-00 芬多精(效果)」的 `base = Aoar`，只寫了 `area{1} = 250` 與
`data{1}{1} = 0.05`，`targets_allowed` 是**空的** ⇒ 由 stock 那一列作主。
Blizzard 的 `Units\AbilityData.slk`：

```
Aoar  targs1 = ground,air,organic,vuln,invu,friend,neutral
```

—— **沒有 `self`**。而且那不是筆誤：stock 的友方光環（Devotion `Adev`、
Command `Acoa`、Endurance、Brilliance、Trueshot、Thorns、Unholy、Vampiric
與每一個 `ItemAura*`）**全部帶 `self`**，不帶的恰好是據點型的回復光環
`Aoar`(Ward) 與 `Aabr`(Statue)；而 `AIgx` —— 同一個回復光環由**英雄**以道具攜帶時
—— 又把 `self` 加回來。Blizzard 是**刻意**區分「發出光環的東西會不會治療自己」的，
而 70-00 原作站在「不會」那一邊。

⇒ ⭐ **GGD 站在「會」那一邊，因為那是 owner 的設計。** 考證留著，是為了下次有人
問「原作是不是這樣」時不必再挖一次 MPQ。

### 這一筆同時解鎖了什麼

`70-00 紮根` 的「[力量]增加10點」原本因為打壞 `auraIncludeSelf` 而被撤回
（見 `tools/skill-remake/batch1.py` 那一列的註解）。裁決之後兩件事一起落地：
光環含自己 ✅、力量+10 ✅。

---

## 15-00 `godie-emfr.passive` 真·不死不滅：**加門檻、砍一半**（2026-08-18，GH#369）

owner 逐字：

> 「魔法老師 天生技 **真不死不滅** 改成 **生命回復 2%，魔力消耗 1%，
>  只有在生命低於 50% 以下才會觸發**，記得**技能說明跟 JSON 都要改**」

⚠️ 這一支**被取代兩次**，所以這裡存的是**兩份**原始資料 —— 上一次的取代
（2026-08-12 的 90 支重製）當時沒有留下對照，這一列把它補回來。

| 層 | 來源 | 說什麼 |
|---:|---|---|
| **1** | **owner 2026-08-18 新版說明** | 回復 2% / 燒魔 1% / **HP ≤ 50% 才觸發** ✅ **採用（預設啟動）** |
| 1（舊） | owner 2026-08-12 的 90 支重製稿 | 回復 5% / 燒魔 5% / **無條件常駐** ⛔ 被取代 —— 見下 |
| 5 | w3x 原始設定 | 完全是另一支技能 ⛔ 早在 08-12 就被取代 —— 見下 |

### ⛔ 被取代①：2026-08-12 重製稿的數值（上一版出貨值）

```jsonc
// content/abilities/godie-emfr.passive.json，2026-08-12 → 2026-08-18
"description": "[被動][週期][回復][燒魔]\n\n「為了拯救我的學生，以及打噴嚏」\n每秒[回復] 5%[最大生命]，但每秒也[燒魔]魔力 5%。",
"passive": { "ranks": [{ "hooks": [{
  "on": "onInterval", "internalCooldown": 1.0, "target": "self",
  // ⛔ 沒有 condition —— 滿血也在跳，而且滿血跳的那一下 restore 被 maxHp 夾掉 = 純燒魔
  "effects": [{ "kind": "restore",   "healthPct": 0.05, "applyTo": "self" },
              { "kind": "spendMana", "amount": { "flat": 0.0 }, "pctMaxMana": 0.05, "applyTo": "self" }]
}]}]}
```

**性質變化**：常駐 →「殘血才啟動」的**逃生型**續戰。
每秒的收支從 `+5% HP / −5% MP` 變成 `+2% HP / −1% MP` ——
⭐ 回血速度砍成 4 成，但**魔力的每秒單價砍成 1/5**，所以同一池魔力撐得住的秒數
從 20 秒變成 100 秒；配上門檻之後它不再是「開局到終場一直在漏魔」。

### ⛔ 被取代②：w3x 原作（`A0UG`，早在 2026-08-12 就換掉了）

`docs/legacy/_ability-fidelity-ledger.json` 的 `godie-emfr.passive` 那一筆：

| 欄 | w3x 值 |
|---|---|
| 名稱 | **15-00 天生法術書**（⛔ 不是「真·不死不滅」） |
| rawcode | `A0UG`（`builtin.verdict` = ✔） |
| castType / range / cooldown | `targeted` / `3.67` / `60` |
| JASS | **無 JASS 觸發**（`jass.verdict` = 「—」） |
| 效果 | `applyBuff`（`usesGenericPlaceholder: true` —— 匯入器填的通用佔位） |
| 原文案 | 「記載多個涅吉可以使用的技能。**暫定契約**（60秒冷卻）：與我方英雄暫定契約⋯**執行契約**（60秒冷卻）：執行契約增強契約人的能力，每秒消耗25點魔力，增加契約人 20% 跑速、75% 攻速、20% 攻擊力。」 |

⇒ 原作是一支**指向友軍的契約增益**（而且是每秒 25 點**絕對值**魔力，不是百分比），
跟現在這支「自己殘血時的自我續戰」在機制上沒有交集。
考證留著，是為了下次有人問「原作的 15-00 是什麼」時不必再挖一次 MPQ。

### 失去的守衛

沒有 —— 這兩份都沒有專屬測試釘住過（`nativeFidelity.test.ts` 沒有 15-00 那一列）。
新守衛：`packages/shared/src/sim/abilities/emfrThresholdPassive.test.ts`
驗的是**機制**（門檻之上不跳 / 門檻之下跳），⛔ 不抄 2% / 1% / 50% 這三個數字
（第二守則：數字住在 JSON，測試裡再抄一份就是第四個住處）。

---

## 34-04 `godie-osam.r` 奧義˙蒼龍破：**從 JASS 重建**（2026-08-19，GH#393）

owner 逐字：

> 「34-04 **JASS 應該有安排位置移動播放的多次特效搭配傷害**」

### 出貨前是什麼

| | |
|---|---|
| 模板 | `tpl-single-strike`（一發點爆） |
| castType / range | `targeted` / `11.0` |
| 特效 | `w3xFamilyArt.ts` 的 `family: "shockwaveRing"`（地上一個圓環），tint 青色 |

⛔ **卡片寫「一直線」，遊戲裡是一個原地的圓環。轉幾度都不會讓圓變成線。**

### JASS 實測（第 3 層）—— `A0FP`

`tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j`：

* `Trig_BlueDragonWave_Conditions` **j:38857** — `GetSpellAbilityId() == 'A0FP'`
* `Trig_BlueDragonWave_Actions` **j:38872-38884**

```jass
set udg_BlueDargon = 1
loop
    exitwhen udg_BlueDargon > 12
    call CreateNUnitsAtLoc( 1, 'n00N', …,
         PolarProjectionBJ(GetUnitLoc(caster), udg_BlueDargon*12.00, udg_BlueDargon*30.00), … )
    call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
    call TriggerSleepAction( 0.03 )
    set udg_BlueDargon = udg_BlueDargon + 1
endloop
call ForGroupBJ( …'n00N'…, function Trig_BlueDragonWave_Func003A )   // ↓
call TriggerSleepAction( 2.00 )
call ForGroupBJ( …'n00N'…, function Trig_BlueDragonWave_Func005A )   // KillUnit + RemoveUnit
```

`Func003A`（**j:38863-38865**）：

```jass
call IssuePointOrderLocBJ( GetEnumUnit(), "smart",
     PolarProjectionBJ(GetUnitLoc(caster), 800.00, GetUnitFacing(caster)) )
```

| 項 | 值 | 從哪裡讀到 |
|---|---|---|
| **段數** | **12** | `exitwhen udg_BlueDargon > 12` |
| **生成間距** | r = i×12u，θ = i×30°（**一圈螺旋**，最遠 144u） | `PolarProjectionBJ(…, i*12, i*30)` |
| **每段延遲** | **0.03 s** | `TriggerSleepAction(0.03)` |
| **行進終點** | 施法者**面向**方向 **800u** 處 | `Func003A` |
| **行進速度** | 522（`n00N` 的 `move_speed`）⇒ 800u 約 **1.53 s** | `OBJECTS.json` units.n00N |
| **每段特效** | `n00N` =「**閃電**」，`Abilities\Spells\Other\Monsoon\MonsoonBoltTarget.mdl`，scale 2.0，`Aloc`（locust） | 同上 |
| **存活** | 2.0 s 定時生命，之後 `KillUnit`+`RemoveUnit` | `UnitApplyTimedLifeBJ(2.00,'BTLF')` |
| **每段傷害** | **0** —— `n00N` 沒有攻擊、沒有 `UnitDamageTarget` | 整段 JASS 沒有任何傷害呼叫 |

### ⚠️ JASS 與說明打架的地方（第 3 層 vs 第 4 層）

**傷害不在 JASS 裡。** A0FP 的 `base` 是 **`AUcs` = Dreadlord Carrion Swarm**（`STOCK_ABILITIES.json` 的 `comments` 逐字），
也就是暴雪原生的**直線錐形核爆**；JASS 那 12 隻 dummy 是**純視覺**。所以原作真正的結構是
「原生一發線傷 ＋ 12 隻沿線飛的閃電演出」，⛔ **不是**「12 段各結算一次」。

w3a 原始欄位（第 5 層，`OBJECTS.json` abilities.A0FP）：

| 欄 | Lv1 / Lv2 / Lv3 | 意思（Carrion Swarm 的欄位語意） |
|---|---|---|
| `data.1`（DataA） | **600 / 900 / 1200** | 傷害 |
| `data.2`（DataB） | 99999 | 總傷害上限（＝無上限） |
| `data.3`（DataC） | **900 / 1000 / 1100** | 最終區域寬度（＝文案的「作用範圍」） |
| `data.4`（DataD） | 375 | 距離 |
| `area` | 350 | 起始區域寬度 |
| `cast_range` | 600 | 施法距離 |

⚠️ 原作文案自己也不一致：Lv2 的 ubertip 寫「範圍 1100」而 `DataC` 是 1000。

### ✅ 採用（預設啟動，第 1 層贏）

owner 的裁決把「12 次移動特效」讀成**逐段結算**，這比原作的「一發線傷＋演出」更貼卡面的
「一直線上的敵人」，而且它是**同一個機制**的參數（`tpl-traveling-wave` → `delayed.advance`）。

| 參數 | 值 | 怎麼推出來的 |
|---|---|---|
| `stepCount` | **12** | JASS 的 12 |
| `stepSize` | **67** wc3u | 800 ÷ 12 |
| `stepIntervalSec` | **0.13** s | 800 ÷ 522 ÷ 12 ≈ 0.128（⛔ 不是 JASS 的 0.03 —— 那是**生成**間隔，不是**推進**節奏） |
| `aoePerStep` | **350** wc3u | w3a 的起始 `area`（波本身的粗細；⛔ 不取 `DataC` 900，那是終端扇形寬度，會讓「直線」變成一把大扇子） |
| `stepVfx` | `fx.fam.bolt-strike.lightning.s115` | `n00N` 就叫「閃電」，模型是 `MonsoonBoltTarget` |
| `hitOncePerTarget` | **true**（家族固定） | 卡片寫的是**一次** 600；原作 11-04/27-01/60-01 三支自己就帶去重表 |
| `castType` | `targeted` → **`skillshot`** | JASS 讀的是 `GetUnitFacing(caster)`，**從頭到尾沒有用過指定目標** |
| `range` | 11.0 → **14.7** | 800u ÷ 54.5（顯示的射程＝真的打得到的距離） |

### ⛔ 被取代的原作數值（存在這裡，不要再挖一次 MPQ）

* `castType: "targeted"` + `range: 11.0`（＝ w3a `cast_range` 600 ÷ 54.5）
* 傷害幾何：**單發** Carrion Swarm，起始寬 350 → 終端寬 900/1000/1100，距離 375
* 12 隻 dummy 的**生成螺旋** r=i×12 / θ=i×30°（採用版只保留「沿線推進」，
  ⛔ 沒有重現那一圈螺旋 —— 它的最遠半徑 144u ≈ 2.6 GGD 單位，在 GGD 的尺度下
  肉眼分不出來，而它會讓前兩段的判定圓歪出線外）
* 特效家族 `shockwaveRing` / `thunderclapcaster` / tint `[0,255,255]`
  —— 那一列仍然留在 `apps/client/src/render/vfx/w3xFamilyArt.ts`，
  ⛔ **刻意不改**：那張表是**證據**（「w3a 的 casterArt 欄位當年填的是什麼」），
  而且它是 `w3xFamilyArt.test.ts` 從 `MODEL_USAGE.json` + `VFX_BINDINGS.json`
  **重新推導**出來的，手改一列就是紅。玩家看到的線由技能 JSON 的 `stepVfx` 決定。

### 失去的守衛

沒有 —— 這一支從來沒有專屬測試。
新守衛：`packages/shared/src/sim/effects/travelingWaveAdvance.test.ts`
驗的是**機制**（N 段真的落在 N 個**不同**的位置、各結算一次、同一個人只吃一次），
⛔ 不抄 12 / 67 / 0.13 / 350 這四個數字（第二守則：數字住在 JSON）。

---

## 70-04 `godie-e00s.r` 千年練成：**原作真的召喚 4/6/8 具身體**（2026-08-19，GH#404）

> ⚠️ 這一節與上面每一節都不同：上面那些是「新版設計贏，原作另存」。
> 這一節是「**原作是對的，而我們今天做不到**」—— 卡片上的「[召喚]／招喚樹精」
> 被拿掉是為了不說謊（第一·五守則出路②），⛔ 不是因為原作不該有召喚。
> 這張表存在的唯一目的：**owner 點頭那一天，接的人不必再挖一次 MPQ。**

### 原作證據鏈（第 5 層 w3a，三段全部對得起來）

| 環節 | rawcode | base | 關鍵欄位 |
|---|---|---|---|
| 技能本體 | `A0GN` 70-04 千年練成 | `ANr3` = **Rain of Chaos**（stock `comments`） | `DataA` = 子技能 `A0GO`；`DataB` = **4 / 6 / 8 / 16**（rank 1–4）；`Dur` = 1.0 / 0.8 / 0.6（顆與顆之間的間隔）；冷卻 70s；魔耗 240/420/600/900；`cast_range` 1200 |
| 召喚子技能 | `A0GO`「招喚樹精」 | `ANin` = **Inferno** | `UnitID1` = **`n00Q`**；`DataA` = **180**（誕生傷害）；`area` = **340**（誕生傷害半徑）；`Dur`/`HeroDur` = 0.1（ANin 的這一格是**落地暈眩**，stock 是 4/2 ⇒ 作者把暈眩砍到幾乎沒有） |
| 被召喚的身體 | `n00Q`「千年練成樹精」 | `ninf`（Infernal） | HP **450**、護甲 **2**、攻擊 **100**、攻擊距離 **180**、`move_speed` **0**（不會走 ⇒ GGD 的 `champion@1.immobile: true`）、`scale` 1.5、model `Abilities\Spells\NightElf\EntangleMine\Roots.mdl`、abilities `A05X` / `Aspo` / `Adtg` / `A0AT` |

⭐ **`DataB` = 4/6/8 正是 GGD 卡片上那三個數字** —— 也就是說新版規格的「總共 4/6/8 棵樹精」
不是重新設計的數，它就是原作的顆數。⇒ 這一支的召喚**不是**被 owner 的新設計取代掉的。

### EX 那一支（`A0ZO` / `A0ZQ` 70-002 樹海降臨）

召的是 `n01M`：同一具身體但 HP **4500**、護甲 **10**，子技能 `A0ZP` 誕生傷害 **360**，
顆數 **8 / 12 / 16**。逐項對上它自己的 tooltip：
「召喚的樹精將獲得十倍之血量及五倍之裝甲，召喚傷害及數量也將是千年煉成的兩倍」。

### ⛔ 為什麼今天沒接（缺的不是數值，是一具身體）

* `summon.championId` 是 `zRef("champions")`，而 `champion@1.modelKey` 是**硬 ref**
  （`zRef("models")`，⛔ 不是 soft）⇒ 需要一份新的 `model@1` + 一顆 GLB。
* 出貨樹裡 `summon` 這個 kind 有引擎、有 schema、有文件，而 **`content/` 0 份在用** ——
  沒有任何 body-only 的 `champion@1` 可以抄形狀。
* 新身體還要被選人畫面／白名單排除，否則它會變成一位可選英雄。
* ⇒ 第一·五守則出路③：**升級成 owner 的決定**，⛔ 不自己挑數字。

### 接上去要填什麼（owner 點頭後照抄，⛔ 不要重新發明）

| `summon` 欄位 | 值 | 出處 |
|---|---|---|
| `count` | `4 / 6 / 8`（逐階） | w3a `A0GN.DataB` = 卡片數字 |
| `at` | `point` | 每一棵掛在 `randomArea` 的落點上 |
| `championId` | **待建**（樹精身體） | ⛔ owner 決定要不要做這具身體 |
| `immobile`（身體） | `true` | `n00Q.move_speed = 0` |
| 身體 HP / 護甲 / AD / 射程 | 450 / 2 / 100 / 180 wc3u | `n00Q`（⚠️ 射程要換算成 GGD 單位） |
| `durationSec` | **無**（＝永久） | ⚠️ 原作沒有這一格：`ANin` 的 `Dur` 是落地暈眩不是壽命 ⇒ Rain of Chaos 的常駐形態。**永久 × 每 90 秒 4–8 具**在 GGD 是一次真的平衡改動 ⇒ 這一格必須 owner 裁 |
| `maxAlive` / `onCap` | 待定 | 同上 |

### 這一輪實際做的（可一鍵回頭）

`tools/skill-remake/batch1.py` 的 70-04 那一列：`[召喚]` 標籤與「招喚」兩字退場，
內文改成「隨機竄出樹精…每棵樹精在**誕生的瞬間**造成…（樹精只在誕生那一瞬間現身，
不會留下來作戰）」——⭐ 這個寫法跟原作 tooltip 的「每棵樹精**誕生時**可以造成 180 點傷害」
是同一個重心，所以它不是把設計改小，是把**做到的那一半**講清楚。
70-002 的 `[召喚]` 標籤同時退場（它的內文從頭到尾沒提召喚），
`tools/skill-remake/tag_gate.py` 的 `("godie-e00s.ex","召喚")` 豁免一起刪除，
並且 `召喚` 這個標籤從此**只認 `summon`**（⛔ 不再收 `randomArea` 當近似）。

⚠️ 同時量到的：出貨 `content/items` 與 `content/augments` **沒有任何一件**吃召喚物，
所以「召喚流派玩家少一顆」的代價今天是 **0**。⛔ 那是「現在可以這樣」的理由，
不是「這樣就對了」的理由。

---

## GH#414 · 同編號技能兩份文件數值打架 —— 被取代的那一半（2026-08-19）

守衛 `packages/shared/src/content/skillTierLadder.test.ts` 的第②條（「同一支技能，
兩份文件的數值必須一致」）第一次跑就抓到 **5 組**。⚠️ owner 自己點名的
04-03 龍破斬就在裡面（`godie-h020.e` 8.25 vs `godie-hjai.e` **6.0**）——
同一支技能兩個半徑，而 `content:build` 與全套測試從頭到尾都是綠的。

⭐ 判決照第〇·六守則的階梯（JASS 第 3 層 > w3a 第 5 層），⛔ 不是挑好看的那個。
被取代的值記在這裡 —— **測試可以跟著設計走，知識不可以無聲消失。**

| 技能 | 文件 | 舊值 | 新值 | 依據 |
|---|---|---:|---:|---|
| 04-03 龍破斬 `radius` | `godie-hjai.e` | **6.0** | 8.25 | w3a `area=450` **且** JASS「終點爆發: 收集450」——**兩層一致**，⇒ 450 × 11/600 |
| 12-01 仙氣．引 `range` | `godie-e007.q` | **8.34** | 4.0 | ⭐ 對面那一份是**產生器產出**的（owner 新版技能說明＝第 1 層）⇒ 它贏，w3a 的 455 不採用 |
| 12-002 仙氣發勁 `range` | `godie-e007.ex` | **7.65** | 2.0 | 同上（`godie-ewar.ex` 是 `tools/skill-remake/batch1.py` 的輸出） |
| 04-02 炸彈陣 `range` | `godie-h020.w` | **14.67** | 11.0 | ⚠️ w3x **兩層都沒有** `cast_range` ⇒ 見下面那一段 |
| 90-00 `range` | `godie-h02r.passive` | **11.0** | 8.25 | ⚠️ 同上 |

### ⭐ 12 系那兩列：方向與其他列**相反**，而那是對的

⚠️ 第一版我把 `godie-ewar.q` / `godie-ewar.ex` 改成 w3a 的值 —— **改錯了兩次**：
① 那兩份是 `tools/skill-remake/batch1.py` 的**產生器輸出**（GH#319 的守衛當場紅），
手改會在下一次重生成時被無聲覆寫；
② 更根本的是**階梯讀反了** —— 產生器編碼的是 **owner 的新版技能說明（第 1 層）**，
而 w3a 是**第 5 層**。⇒ 第 1 層贏，所以要動的是**另一份**（`godie-e007.*`）。

⭐ 這正是第〇·六守則存在的理由：「GGD 是重製不是移植，設計贏過考古」。

### ⚠️ 最後兩列的依據不是考古，是 owner 的一句話

04-02 與 90-00 在 w3a 沒有 `cast_range`、JASS 也沒寫距離 —— **兩個值都是後來編的**，
階梯到第 5 層就沒東西可問了。⇒ 規則改用 owner 2026-08-19 的原話：

> 「**可施展技能的距離普遍超遠**」

**沒有原作證據而兩份打架時，留較短的那一份。** 這是一條規則不是一次擲硬幣，
而且它與 owner 講的方向同號。⛔ 兩個值都被記在上表，改回去是改一格 JSON。

### ⛔ 沒有被動的那一類（⚠️ 刻意不修）

同一次掃描還列出 **11 組** `N vs 0` 的組合（92-03 狂草泥馬、09-03 超級賽亞人、
79-02 斬擊…）。那些**不是**打架：`0` 那一份的 `castType` 是 `self`，
一支自身施放的技能本來就沒有施法距離。⇒ 守衛只比對**兩邊都非零**的情況，
⛔ 不把「沒有這個量」當成「另一個值」。

---

## 特效家族：owner 的設計覆寫（GH#431，2026-08-20）

⚠️ 這一節與上面每一節**同一條規矩**（第〇·六守則）：被取代的原作值要另存 ——
**測試可以跟著設計走，知識不可以無聲消失**。

⭐ 但它的存放方式比上面那些更緊：覆寫寫在 `content/config/vfx-ability-art.json`
的 **`bindings.<id>.owner`**，而被取代的原作證據**原封留在隔壁的 `bindings.<id>.family`**。
⇒ 兩個值永遠在同一列相鄰的兩格，⛔ 沒有任何一半只存在於這份文件裡；
反捏造守衛（`w3xFamilyArt.test.ts`，從 `MODEL_USAGE.json` 重新推導）因此**一格都沒有放寬**。

| 技能 | 原作證據（第 5 層，仍在 `family` 格） | owner 的設計（第 1 層，`owner` 格） | 依據 |
|---|---|---|---|
| **65-04 天譴**（飛鼠）`godie-udea.r` | `shockwaveRing` · `thunderclapcaster` · `A04C` · `w3a-override/ability.casterArt` · tint `[0,255,255]` | `lightColumn`（tint 沿用證據的青色） | owner 2026-08-19：「立起來的光柱也有其他技能會用到 **例如飛鼠天譴**」 |

**落地的差別**：`fx.fam.shockwave-ring.w3x-00ffff.s150`（貼地衝擊環）→
`fx.fam.light-column.w3x-00ffff.s150`（`column` primitive，`gravityY +7.5` 往上長，
⛔ 不在 `DIRECTIONAL_PRIMITIVES` 裡 ⇒ 永遠直立）。
`shockwaveRing` 仍有 **90** 支技能在用，所以舊那一份文件不是孤兒。

⚠️ **一格 `owner` 覆寫必填 `why`**（schema 硬性）—— 一格沒有理由的覆寫，
半年後沒有人分得出是設計還是手滑，於是它會被「修回原作」。
