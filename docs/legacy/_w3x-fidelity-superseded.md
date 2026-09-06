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

---

## 五級距全轉：被取代的每一個原作／舊出貨數值（owner 2026-08-21 ①②③④⑦）

⚠️ 同一條規矩（第〇·六守則）：**測試可以跟著設計走，知識不可以無聲消失。**

owner 2026-08-21 逐字：
> ①「**我們也有升階公式討論過不是嗎 除了冷卻以外 傷害跟耗魔是一起變動的**
>  　應該是比較接近 **B 全轉，接受升階只剩 ratios 成長**」
> ②「**[v] A 以級距為準，改 JSON**」　③「**[v] A 都夾**」
> ④「manaCostTier 342 / 78 支免費技 => **那就不要調耗魔阿**」
> ⑦「若不是主動傷害技能 **就免魔力吧 乾脆點**」

⭐ **逐支的原始數值**（冷卻／耗魔／傷害 perRank／原始 range·radius）另存成一份表：
**`docs/legacy/五級距全轉_原始數值_20260821.tsv`**（348 列）。
⛔ 這裡不重複貼 —— 那一份是機器產出的完整快照，這一節只記**階梯上發生了什麼**。

| 軸 | 被取代的是第幾層 | 覆蓋它的是第幾層 |
|---|---|---|
| 傷害基礎值（`flat`/`perRank` → `damageTier`） | 第 5 層（w3x 原始設定）／舊出貨值 | **第 1 層**（owner ①「B 全轉」） |
| 冷卻秒數（→ `cooldownTier`） | 同上 | **第 1 層**（owner ③「A 都夾」） |
| 耗魔逐階陣列（→ 首階單一值） | 同上 | **第 1 層**（owner ①） |
| `range` / `radius`（→ 與級別逐位元相等） | 同上 | **第 1 層**（owner ②） |

### 逐支點名的兩個原作值（測試裡原本釘死它們）

| 技能 | 原作值（第 3–5 層） | 現在（第 1 層） | 為什麼 |
|---|---|---|---|
| **70-00 紮根** `godie-e00s.passive` | w3a `A0O6` `Cool1` = **15 秒** | **30 秒**（變身表·極小） | 它帶 `championForm` ⇒ 走變身那張表，下限 30；owner ③「都夾」 |
| **76-04 三檔.巨人迴旋彈** `godie-u00n.r` / `godie-u00o.r` | `war3map.j:36719` 的 `300+300×level` ⇒ `perRank [600,900,1200]` | `damageTier` **小**（1500 flat） | owner ①「B 全轉」：級距**取代** `flat` 與 `perRank`。JASS 公式本身仍記在 `leapJassFidelity.test.ts` 的檔頭 |

⚠️ 兩條測試現在都**從級距表推導**那個數字（`DEFAULT_COOLDOWN_TIERS` /
`DEFAULT_DAMAGE_TIERS`），⛔ 不再抄字面值 —— owner 改表它們自己跟著動。

---

## GH#417 · 70-04 千年練成「紮根形態」那一份：被取代的 w3x 匯入數值（2026-08-22）

`abilityCodeParity.test.ts`（同編號＝同一支技能＝同樣的機制數值）的 `70.json` 分片上，
**整片 26+3 個鍵都是白木一個人的**：`godie-e00s.*`（本體）與 `godie-e010.*`（紮根形態）
是**同一位英雄的兩個形態**，掛著同一組編號 `70-00`…`70-04`，卻是**兩份各自腐爛的抄本**。

這一輪只動 **70-04**（本輪 lane 名下的檔），把三個鍵從棘輪上拿掉。

### 判決依據（第〇·六守則的階梯，⛔ 不是挑好看的那一邊）

| 這一份 | `provenance` | 階梯層級 |
|---|---|---|
| `godie-e00s.r`（本體） | `owner-spec` | **第 1 層** —— owner 的新版技能說明（`tools/skill-remake/batch1.py` 的輸出） |
| `godie-e010.r`（紮根形態） | `w3x-import` | **第 5 層** —— w3x 原始設定 |

⇒ 第 1 層贏。⛔ 而且方向也**只能**是這一邊：本體那一份是那 90 支重製的產生器輸出，
`packages/shared/src/ops/skillRemakeJsonFresh.test.ts`（GH#319）擋著任何手改 ——
往本體改是「下一次重生成時被無聲覆寫」，不是一個選項。

### 被取代的那一組（改回去＝改三格 JSON）

| 欄位 | **舊值**（`godie-e010.r`，w3x 匯入） | 新值（＝本體 `godie-e00s.r`） |
|---|---|---|
| `cooldown` | **60 / 60 / 60** | 90 / 90 / 90 |
| `cooldownTier` | **中** | 大 |
| `effects[0].count`（樹精顆數） | **4 / 4 / 4** | 4 / 6 / 8（＝卡面數字＝w3a `A0GN.DataB`） |
| `effects[0].effects[].ratios[].coeff`（[AP] 係數） | **0.7**，單發 | 0.3，**兩發**（第二發帶 `victimCondition: status/root` ⇒ [定身] 時傷害加倍） |

⚠️ **這是一次真的平衡改動，兩個方向都有**：紮根形態的大絕冷卻變長（60→90）、
單發 [AP] 係數變小（0.7→0.3），但顆數隨階成長（4/4/4→4/6/8）且對 [定身] 目標翻倍 ——
而 70-03 木束縛之術正是白木自己的 [定身]。⇒ 這一組的意圖是「先綁再炸」，
⛔ 不是等比縮放。owner 若要退回，把上表左欄抄回 `content/abilities/godie-e010.r.json`
與 `content/champions/godie-e010.json` 的 `abilities.R`，並把三個鍵加回
`packages/shared/src/content/abilityCodeParity.baseline/70.json`。

### ⛔ 還沒動的：`70-00` / `70-01` / `70-02` / `70-03`（26 個鍵）

同一片分片上還有 **26 個鍵**是同一個形狀（伸卡球 60 vs 30 秒、木束縛 45 vs 60 秒、
大怒石 被動 vs `applyBuff`…）。⛔ 這一輪**刻意沒有動**：那四支的本體那一份同樣是
產生器輸出，而**紮根形態那四份不在本 lane 名下**（`godie-e010.{q,w,e,passive}.json`）。
⇒ 下一條 lane 照這一節的判決模式一次做完，⛔ 不要一支一輪。

### ⚠️ 與 GH#404 / GH#423 的關係：這一節**沒有**碰召喚

70-04 到今天仍然**沒有任何 `summon`** —— 兩份文件都只有 `randomArea` + `damageArea`，
而卡面也只講「誕生的瞬間」（第一·五守則出路②，見上面 GH#404 那一節）。
真的召喚缺的是**一具身體**：`summon.championId` 是 `zRef("champions")`，
⇒ 需要一份 body-only 的 `champion@1` + 它的 `model@1` + 圖示，
並且要從選人畫面／白名單排除；`durationSec`（原作沒有這個數字）與
`maxAlive` / `onCap` 是 owner 的平衡裁決。⛔ 本 lane 名下沒有這些檔案。

---

## GH#53 · GH#147 · 三支 EX 與一支大絕：被階梯判掉的那一半（2026-08-22）

> owner 2026-08-22 逐字（兩則，同一條階梯）：
>
> 「我們的決策順序明明就是 **重製新說明 > JASS > w3x技能說明 > w3x技能設定**」
>
> 「那你作阿」（#53 三支 EX 的裁決權，⛔ 不要再問）

⚠️ 這一節是**四筆**被取代的原作資料，⛔ 不是四個修好的缺陷。
每一筆都附「怎麼退回」，因為第 3–5 層的知識**不可以無聲消失**。

### ① `godie-e008.ex` — 21-002 天破壤碎：冷卻 **60 → 45**（GH#53 第 3 條之一）

| | 內容 |
|---|---|
| **原作（w3a `A0FF`）** | 各等級冷卻 **{40, 35, 30}** 秒。EX 只有一階 ⇒ 依同批其餘 8 支一致的「取最高階值」規則，來源值是 **40 秒** |
| **被取代的出貨值** | `cooldown [60.0]` / `cooldownTier "極大"` —— ⛔ 這**不是**任何人的決定，是 `tools/w3x-import/gen_ex_content.py:82` 的 `clean_scalar(cooldown, 1, 300, 60.0)` **fallback 預設**（那支匯入器的 `CURATED` 表只有 8 個 rawcode，⛔ 一個帶 cooldown 的都沒有 —— #53 body 已經推翻了「curated marquee」這個理由） |
| **新值（贏）** | `cooldownTier "大"`（單體表 = **45 卡面秒**）/ `cooldown [45.0]` |
| **為什麼是 45 而不是 40** | 第〇·四守則：冷卻是**五級距**（單體 6/15/30/45/60），⛔ 40 不在格點上。取**最近**的一格 —— 與 `lowDamageCells.cooldownTierForSeconds()` 同一條規則（40 距「大」5 秒、距「中」10 秒）。⛔ 不把 40 寫成字面值：那會是 `content/config/cooldown-tiers.json` 的第二個住處 |
| **怎麼退回** | 把 `cooldownTier` 抄回 `"極大"`。⚠️ `cooldown` 那一格是**擺設** —— `resolveCooldownTier()` 在註冊時整條覆寫，級別永遠贏 |

### ② `godie-orkn.ex` — 30-002 變態紳士：卡面那句話**第一次真的發生**（GH#53 第 3 條之二）

⚠️ **這一支我第一版做錯了，記在這裡，⛔ 不要再犯**：我照票面把它整支改成純被動、
砍掉 `championForm` —— 而 `championFormVisibility.test.ts` 的**空洞守衛**當場說話
（可達的變身從 19 掉到 18）。⭐ 那個變身**不是**空的：`content/champions/godie-orkn.json`
的 `transform.counterpartId` 指著 **`godie-o030`「電車癡漢 - 臭作」**，
一整份英雄卡 + 模型 + 六支技能都在，而 **orkn.ex 是它唯一的入口**。
⇒ 判準：**動一個 `championForm` 之前先問「那具身體存在嗎」**，⛔ 不是看 `forms` 欄位是不是 null。

| | 內容 |
|---|---|
| **w3x 說明（第 4 層）** | 「**[被動]／0秒冷卻時間**⋯當臭作變態指數達到顛峰之時，攻擊身上有酒精灌腸效果的敵人將額外敵人現存瑪娜\*20%的爆擊高潮撕裂傷」 |
| **w3x 設定（第 5 層）** | ⭐ **同一個編號底下有兩個 rawcode**：`A0YY`（EX_MAP 對到 orkn.ex 的那一支，`OBJECTS.json` 裡**沒有** cooldown / mana 欄位）與 **`A0YT`**（`transform.triggerAbility`，同名「30-002 變態紳士」，`durationSec 15`、`cooldownSec 60`）。出貨文件把兩支合成了一支 |
| **被取代的出貨文件** | `effects = [championForm{to:"alternate", 15s}, **applyBuff{ad pctAdd 0.35, 6s}**]`，⛔ **沒有** `passive` —— 卡面那整句「攻擊身上有酒精灌腸效果的敵人⋯」逐位元組等於不存在 |
| **新值（贏）** | `championForm` **原封不動留著**（它是 A0YT，第 5 層有它、而且它是 `godie-o030` 的唯一入口）＋ 新增 `passive.ranks[0].hooks[0] = { on:"onBasicAttack", target:"event", condition:{status, subject:"target", statusId:"alcohol-enema"}, effects:[damage{magic, amount{flat 0}, resourcePct{target/mana/current, 0.2}}] }` |
| ⛔ **被拿掉的那一條：`applyBuff{ad +35%, 6s}`** | 它是 `tools/w3x-import/gen_ex_content.py:52` 的 `BUFF_DEFAULT` —— 一個**匯入器預設值**，⛔ 卡面從頭到尾沒有提過「攻擊力 +35%」。第一·五守則：卡片上沒有的東西不該在遊戲裡發生 |
| **標籤照內文修正（owner 2026-08-12 細則①）** | 首行 `[被動]` 與內文的「變態指數達到顛峰」（＝變身）打架 ⇒ **以內文為主、用內文修正標籤**：改成 `[主動][變身][被動][普攻時][身上有某狀態時]`，`0秒冷卻時間` 換成 `{{cd}}秒冷卻時間`（＝ A0YT 的 60 秒，級別「中」·變身表） |
| **同時落地的前置** | `godie-orkn.w`（30-02 酒精灌腸）在此之前**一個狀態都不掛**（`tpl-single-strike` 只有傷害）⇒ 上面那個 condition 會永遠不成立。W 因此 **eject 模板**，改成 `damage + applyStatus{alcohol-enema, 8s, moveSpeedMult 0.9}`，把它自己卡面上的「移動速度降低10%⋯可持續8秒」也一併變成真的 |
| ⚠️ **一個誠實的落差** | 內文說的是「變態指數**達到顛峰之時**」＝ **變身期間**才吃得到那份追加傷害，而條件葉沒有「處於某個變身形態」這一顆（`zConditionLeaf` 只有 chance / stat / kind / status / equipment）⇒ 現在它是**常駐**的。做成「最接近的既有機制」並記下差在哪（GH#147 的同一條處置），⛔ 不是為了遷就引擎去改內文 |
| ⚠️ **仍然沒做的那半句（誠實記著）** | W 的「有20%的機會在攻擊時失手」與「再受到火焰類攻擊時會著火」兩句仍是空的。前者引擎有【致盲】但那是另一份狀態，後者需要「某狀態下受某元素傷害時追加 DoT」這個**還不存在**的條件葉。⛔ 沒有順手做（第零守則⑧） |
| **怎麼退回** | 把 `applyBuff{ad pctAdd 0.35, 6s}` 加回 `effects`、刪掉 `passive`，並把描述抄回舊的那一段 |
| ⭐ **變身態 `godie-o030` 一起改了** | STRICT 鏡像 + `abilityCodeParityForms`：30-02 的 `applyStatus`、30-002 的 `passive`／`targetsEnemies`、以及 30-00 那三格（`effects` / `radius` / `radiusTier`，**上一個 commit `9c9243e3` 只改了本體**）都補上；兩支的 `castTimeSec` 依 `deriveCastTimes` 公式重推（30-00 → 1.233、30-02 → 0.767），30-00 的 `cooldown` 字面值 60 改成級別真正解出來的 **120**（範圍表·極大） |

### ③ `godie-u00j.ex` — 74-002 超新星：主動 → **真被動（連段）**（GH#53 第 3 條之三）

| | 內容 |
|---|---|
| **w3x 說明（第 4 層）** | 「**[被動]／0秒冷卻時間**⋯在八刀一閃施展後瞬間施展獄門，將會招喚超新星造成巨大的範圍**1200**傷害」 |
| **w3x 設定（第 5 層）** | 同 ②：`A0U0` 沒有 cooldown / mana 欄位，出貨的 60 / 120 是匯入器硬編預設 |
| **被取代的出貨文件** | `castType "self"` + `cooldown [60.0]` + `cooldownTier "極大"` + `template tpl-buff-self{ad pctAdd 0.35, 6s}` —— 一支 60 秒的主動增益，⛔ 與「超新星」毫無關係 |
| **新值（贏）** | `cooldown [0.0]`（⛔ 拿掉 `cooldownTier`，形狀抄同樣是被動 EX 的 `godie-e00w.ex`）/ `effects []` / 兩條 hook：①`onAbilityCast` + `abilitySlot "W"` ⇒ 給自己掛 `octuple-slash-window` 2 秒；②`onAbilityCast` + `abilitySlot "Q"` + `condition{status, subject:"self", statusId:"octuple-slash-window"}` ⇒ `damageArea{magic, damageTier "中", radiusTier "大"}` + `spawnVfx` |
| ⚠️ ⛔ `innateKind` 不可以填 | `zAbilityDoc` 的 refine：`innateKind is only meaningful on slot "PASSIVE"`。一支 `slot:"EX"` 的被動就是「有 `passive`、`effects` 空、`cooldown [0]`」，⛔ 沒有第二格宣告 |
| **被取代的原作傷害數字** | **1200**。傷害五級距是 200/500/1000/1500/2000 ⇒ 1200 不在格點上，取**最近**的一格 = **中（1000）**（距中 200、距大 300，與 ① 同一條「取最近」規則）。⛔ 不把 1200 寫進 JSON，也 ⛔ 不留在卡面上 —— 描述那一句已經換成 `{{radius}}` / `{{dmg}}` 佔位符（第〇·四守則） |
| **⭐ 連段窗口 2 秒是 GGD 的數字** | 原作 JASS 的「瞬間」沒有給秒數。2 秒的參考點是同一個機制的既有客戶 07-03 `moon-combo`（**1 秒**，對應 `udg_MoonCombo`）—— 這裡放寬到 2 秒是因為 74-01 獄門帶 **0.8 秒**前搖，1 秒的窗口會讓這條連段幾乎按不出來。⚠️ 它住在 `godie-u00j.ex.json` 的 hook 上，改它是改一格 JSON |
| **怎麼退回** | 抄回上表「被取代的出貨文件」那一列，並刪掉 `content/status-effects/octuple-slash-window.json` |

### ④ GH#147 —— 三條「描述↔JASS 衝突」在新階梯下的結論

⚠️ 這張票的原始裁決是 owner **2026-07-26** 的「一律照 JASS 修」。
owner **2026-08-22** 給了完整階梯（**重製新說明 > JASS > w3x說明 > w3x設定**），
⇒ 只要那一支已經有**重製新說明**，第 1 層就贏過 JASS，⛔ 舊裁決不再適用於它。

| rawcode | 技能 | 結論 | 被取代的 JASS 值（存檔） |
|---|---|---|---|
| `A0JD` | 77-00 浮雲‧旋一閃（`godie-e00w.passive`） | **新說明贏** ⇒ ⛔ 不加敏捷係數 | JASS j:49335 `250 + AGI×5`。新說明（`tools/skill-remake/heroes/godie-e00w.py`，`provenance: owner-spec`）逐字是「造成 {{dmg}}+**130% [AP]** 點傷害並[暈眩]2秒」—— ⛔ 一個字都沒提敏捷。⭐ 於是 #147 body 說的前置（`Stat` enum 沒有 `agi`）**整條不需要**了：那是為了服從第 3 層而生的工作量 |
| `A091` | 05-03 及喀爾度（`godie-h021.e` / `godie-hblm.e`） | **OBSOLETE** | JASS j:28224-28233「吸引本體 + 2×等級錨點 + 250+100×等級 半徑」。⚠️ `godie-h021` 與 `godie-hblm` **都不在 49 位上架名單**（owner 常設：「沒有上架英雄的 issue 就關閉了」），且 `hblm` 已下架 ⇒ 不做 |
| `A0L6` | 78-04 死亡噴射肘擊（`godie-u00v.r`） | **已於 `b38f4f34` 落地（PARTIAL）** | 見下一小節 |

#### `A0L6` 的被取代值（由 `b38f4f34` 那條 lane 交接過來，這裡是它的家）

| 原作（w3x / JASS） | 換算 | 新版（贏） |
|---|---|---|
| 擊退 **800** wc3u（j:50201/50202 的 20 × 40）⚠️ 卡面寫的是 **1000**，JASS 才是 800 | ≡ **14.67** GGD 單位 | `knockback{distanceTier:"極大"}` —— 距離住 `content/config/displacement-tiers.json`，⛔ 不烘進文件 |
| `collideRadius` **300** wc3u（撞停時的 AoE 半徑） | ≡ **5.5** GGD 單位 | ⛔ **沒有落地** —— 引擎沒有「擊退撞停時觸發」這個掛鉤，要等 `grab-hurl` 整族模板 |
| `collideDamage` **STR × 3** | — | ⛔ 同上。卡面那句「若受到撞擊停止，周圍敵人將會受到80% [AP]額外傷害」因此被改寫成講真話的那一句（第一·五守則），⛔ 不是刪掉 |

## 2026-08-24 —— 光束砲一族：`path:"forward"` → `"static"`，並刪掉 20-03 的第二份傷害

### ① 演出：四支經典不再位移（⭐ owner 的描述，⛔ 不是我的偏好）

> owner：「光束砲**原地開火**，只有波飛出去」

逐支撈 JASS 驗證（⛔ 不是憑印象）：`A0D5`(20-03)@32322 · `A03S`(09-04)@31907 ·
`A0GI`(08-03)@47757 · `A05J`(59-04)@28838 —— 四支**一次 `SetUnitPosition` 都沒有**，
它們是**十具 dummy 沿一條線一次擺好**再 `TriggerSleepAction(2)` → `KillUnit`。
對照組 12-04 `A04X`@29587 **真的**每 0.02 秒推進 75 ⇒ 缺的不是我們沒實作位移。

**被取代的舊值**（七份 ability doc 的節點各自寫著）：
`path:"forward"`（20-03 ×2 · 09-04 ×2 · 08-03 ×2）、`path:"toTarget"` + `distance:8.25`（59-04）。
⇒ 現在**七份都不寫 `path`**，值住 `content/ability-templates/tpl-beam-roll.json`。
**rollback＝把 `params.path.default` 改回 `"forward"`**（一格，四支一起回去）。

### ② 傷害：刪掉 20-03 的 `spawnModelFx.onTouch`（⭐⭐ 這一格是**我**裁的，⛔ 不是 owner）

**被刪掉的逐字內容**（`godie-e00l.e.json` / `godie-e002.e.json` 各一份）：

```json
"onTouch": [{ "kind": "damage", "damageType": "magic", "amount": { "damageTier": "小" } }]
```

**我的理由**（一個能被反駁的理由）：
1. 20-03 已經有 `effects[0]` 的 `damageLine`（magic · 級距**中** · length 14 · width 2.0 · ap×1.0）
   蓋住**同一條線**；
2. 原作 `Trig_Excalibur_Actions` 對那條線**只結算一次**傷害；
3. ⇒ 這組 `onTouch` 是**重製時加上去的第二份傷害**，⛔ 沒有任何一層階梯支持它。

**依據**：owner 2026-08-23 常設指令「沒做完以前別問我了自己判斷 但是**留後台開關可以簡易 rollback**」。
**rollback**：後台內容覆蓋層把上面那段 `onTouch` 貼回那兩份文件的 `spawnModelFx` 節點
（⛔ 不需要改程式、⛔ 不需要部署）。

⚠️ 若 owner 認為 20-03 本來就該打兩段，貼回去即可 —— 這份紀錄的存在就是為了讓那件事是**一次貼上**。

---

## 07-03 列、在、前 —— 連續技加成從 **AD×1.25** 換成 **AP 1.3／2.5（分兩段）**

**日期**：2026-09-03（GH#937）

**被取代的原作值**（`tools/ap-conversion/claims.json` 的 `godie-hpb1.e` → `amounts[1]`）：

```json
{ "attrRatios": null, "ratios": [{ "coeff": 1.25, "stat": "ad" }] }
```

⭐ **為什麼退場** —— 照第〇·六守則的階梯（**新版技能說明 > w3x 原始設定**）：

| 層 | 說什麼 |
|---:|---|
| **1** owner 的卡面 | 「在"者、皆、陣"發動後**1 秒內**施展可增加(**130% [AP]**)傷害，**30 級之後**可增加(**250% [AP]**)傷害」 |
| **5** w3x 原始設定 | `ad × 1.25`（單一段，⛔ 沒有等級分段、⛔ 不是 AP） |

⭐ ⭐ **而三者自洽**：`claims.json` 自己記著兩筆 `stacking: "conditional"` 的宣稱 ——
`agi × 5.0` 與 `agi × 10.0`。照 apconv 的換算率（**AP／點 = 0.25**）：

    5.0 × 0.25 = 1.25 ≈ **1.3**  ⇒ 卡面的「130% [AP]」
   10.0 × 0.25 = 2.50           ⇒ 卡面的「250% [AP]」

⇒ ⭐ **卡面、JASS 宣稱、換算率三者完全對得上** —— ⛔ 只有實作漏了那兩段。

⛔⛔ **而 apconv 只套用 `stacking == "base"` 那一筆**（`tools/ap-conversion/apply.py`
的 `base = [c for c in entry["claims"] if c["stacking"] == "base"]`）——
⭐ 它把 conditional 那兩筆**記進 manifest 的 `conditionalPct`** 卻**從來沒有套用過**。
⇒ ⭐ 那就是這一格今天是舊值的機制原因，⛔ 不是誰忘了改。

**rollback**（⛔ 不需要改程式、⛔ 不需要部署）：把上面那個 JSON 片段貼回
`claims.json` 的 `godie-hpb1.e.amounts[1]`，跑 `bash scripts/genrun.sh apconv:build`。
⚠️ 貼回去之後那條 AD 會與 AP 那兩段**同時**生效（`ratios` 相加）——
⭐ 那正是為什麼它現在不在那裡。

---

## 18. `godie-e002.r` ⊕ `godie-e002.ex` — 20-04 永恆的理想鄉 ⊕ 20-002 解放.約束勝利劍MAX

> ⭐ 2026-09-04 —— owner 問「w3x 理想鄉 主動 做了什麼 都寫很清楚阿」之後逐行讀出來的。
> ⛔ 這一列**不是缺陷清單** —— 三項全部是**新版說明贏**（第〇·六守則第 1 層），
> 而守則要求被取代的原作值要另存：**測試可以跟著設計走，⛔ 知識不可以無聲消失**。

### ⭐ 原作的兩個 trigger（`war3map.j:32372` / `:32400`）

`Trig_avalonReady_Actions`（**主動施放 `A0CT`** ⇒ 開視窗）：

```jass
set udg_SaberUnit = GetTriggerUnit()
set udg_IsAvalonReady = true
call EnableTrigger( gg_trg_avalonStart )
call TriggerSleepAction( I2R(( GetUnitAbilityLevelSwapped('A0CT', GetTriggerUnit()) + 1 )) )
call DisableTrigger( gg_trg_avalonStart )
set udg_IsAvalonReady = false
```

`Trig_avalonStart_Conditions`（視窗內被施法時的三個條件，**全要**）：
`GetSpellTargetUnit() == udg_SaberUnit` · 非友軍 ·
⭐ `IsUnitType(GetSpellAbilityUnit(), UNIT_TYPE_HERO) == true`

`Trig_avalonStart_Actions`（爆發）：

```jass
set udg_WildSaber = ( ( 30 * GetHeroLevel(…) ) + ( GetHeroStatBJ(bj_HEROSTAT_STR, …) ) … )
call ForGroupBJ( GetUnitsInRangeOfLocAll(900.00, GetUnitLoc(udg_saber)), Func011A )
  → UnitDamageTargetBJ(…, ATTACK_TYPE_CHAOS, DAMAGE_TYPE_NORMAL)
  → CreateNUnitsAtLoc(1, 'o00G', …) ＋ UnitAddAbilityBJ('A0CS')
  → IssueTargetOrderBJ(…, "chainlightning", GetEnumUnit())
call TriggerSleepAction( 3.00 )   → 清掉 dummy
```

### ⭐ 三項差異，⛔ 三項都是**新版贏**（⛔ 不要「修」它們）

| # | 原作（JASS） | 新版（owner 的卡面，**贏**） | 為什麼新版贏 |
|---|---|---|---|
| ① **視窗長度** | ⭐ `等級 + 1` 秒 ⇒ **2 / 3 / 4** | **2 秒**（固定） | 卡面逐字「在**2秒**內[反彈]」—— 第 1 層**明說**了 |
| ② **觸發者限制** | ⭐ 只吃**英雄**施放的技能 | 不限（任何[魔法傷害]） | 卡面逐字「[反彈]承受的[魔法傷害]」—— ⭐ 那是一句**陳述**，⛔ 不是沉默 |
| ③ **第一段傷害** | `30×英雄等級 + 力量`，**AoE 900 全打**，逐一生 dummy 放連鎖閃電 | 原傷害 **3/5/7 倍** ＋ **300% AP**，打回攻擊者 | 卡面逐字寫著倍率與 AP 加成 |

⚠️ ⭐ **①的縮放軸被換掉了，⛔ 不是被拿掉**：原作用**視窗長度**表達等階成長（2/3/4 秒），
新版用**反彈倍率**（3/5/7 倍）。⇒ 兩者都有「越高階越強」，⛔ 而強在不同的地方。

### ⭐ owner 2026-09-04 逐字確認的兩段結構

> 「理想鄉 是**主動施放** 一段時間內會反彈之後觸發一連串動畫傷害機制」
> 「⭐ 逐一生 dummy 放連鎖閃電 這是**第一段**傷害，有 EX 就會**補上** 17 段 script 演出
>   其實不衝突」

⇒ ⭐ **兩段疊加，⛔ 不是二選一**：
① R 反彈成功 ⇒ 反傷 ＋ 畫面回饋（守衛 `avalonReflectFeedback.test.ts`，⭐ 刻意跑「沒有 EX」那一場）
② EX 解鎖 ⇒ **再補上**七次斬擊 ＋ 約束勝利之劍（守衛 `avalonExFollowup.test.ts`，2026-09-04 補）

### ⚠️ 我在這一支上連錯兩次（留著當反例）

1. 「`effects: []` ⇒ 內容缺陷，該補 effects」—— ⛔ 錯，那會把設計上的被動變成主動
2. 「它本來就是被動 ⇒ 不該能按」—— ⛔ 也錯，**主動那一半住在 R 槽的另一支技能**上

⭐ 兩次的共同成因：我讀了 `isPassiveOnly` 的**程式**，⛔ 卻沒讀那支技能的**說明** ——
而第〇·六守則的第 1 層逐字就是「owner 的新版技能說明」，它排在 JASS 前面。
📋 已記帳（`1-推測當需求 / 憑印象`）。

---

## 19. 光束砲系列 —— 蝗蟲群 dummy ⊕ ReviveHuman.mdl（來源鏈對帳）

> ⭐ 2026-09-04 —— owner：「從原 JASS → 蝗蟲群 unit 設定 → 兩種復活光束 MDL
> 把完整來源鏈重新對帳」。29 個 agent 逐行查完，⭐ 每一格都有行號。

### ⭐ 鏈是成立的，而且結構固定

| 段 | 事實 | 出處 |
|---|---|---|
| **蝗蟲群** | ⛔ **不是 JASS 呼叫** —— `locust` 全 repo **0 次命中**。它是**物件資料**：461 隻單位中 **231 隻**帶 `'Aloc'`（英雄 127 隻中 **0 隻**） | `OBJECTS.json`；GGD 既有普查 `docs/蝗蟲群對應表.md:19` 獨立量到同一個數字 |
| **用途** | 把單位變成**不可選取、不可碰撞的純視覺 dummy** | 同上 |
| **runtime 形狀** | `CreateNUnitsAtLoc(1,'<dummy>',…)` → 選擇性 `SetUnitScalePercent`/`SetUnitTimeScalePercent` → `TriggerSleepAction` → `KillUnit`+`RemoveUnit`（或 `UnitApplyTimedLifeBJ`） | j:26790-26808 · j:31907-31909 · j:32838-32841 |
| ⭐ **每一具都是 1 具** | 六個光束生成點**全部** `CreateNUnitsAtLoc(**1**, …)` —— ⛔ **沒有一處在迴圈裡** | j:26790 · 31907 · 32324 · 32628 · 32916 · 36048 |
| ⭐ **共同結構** | 「**光束本體 1 具 ＋ 砲口閃光 1 具**」；砲口用 h008 FragDriller / h00O / h00N，一律 `350+15×lvl` ＋ timescale ＋ 立刻 `KillUnit` | j:31909 · 32327 · 32918 · 32921 |

### ⛔⛔ 「兩種復活光束」——⭐ 物件層成立，而**只有一種真的會生出來**

| MDL | dummy | 生成點 |
|---|---|---|
| `ReviveHuman.mdl` | h007（特效龜派，tint 255/255/255）· h00S（勝利劍，**255/100/100**）· h01V（81-03 天神烈破，**255/50/100**）· n00V | ⭐ 前三隻**都真的被生** |
| `ReviveDemon.mdl` | n00M（賽飛天使，tint 255/150/150） | ⛔ **war3map.j / wct / wtg / doo 全部 0 次** |
| （同族死資料） | `n00V`（名字逐字「星光炸裂 **delete**」）· `o025` | ⛔ 0 次 |

⇒ ⭐ **ReviveDemon 是「有物件、零生成點」的死資料。**
GGD 側對得上：`tools/w3x-import/out/stock/` 底下**只有** `convert-revivehuman.json`。

⚠️ ⭐ 而 `ReviveHuman` / `ReviveDemon` 這兩個字串在 **JASS 裡 0 次命中** ——
它們只住 `war3map.w3u` 的**單位模型欄位**。
⭐ 真正的英雄復活機制**完全沒有指定 MDL**：`war3map.j:9780` 的
`ReviveHeroLoc(…, true)` 第三參數 `true` ＝ doEyecandy ⇒ 播**引擎內建**的復活演出。
⇒ ⭐⭐ **這兩顆在這張圖上被「挪用」成光束砲的 dummy 模型，⛔ 從來沒有被用在英雄復活上。**

### ⭐ 六個光束生成點（逐行）

| 技能 | trigger | dummy | scale |
|---|---|---|---|
| 90-04 陽光烈焰 | `Trig_SunFire_Actions` j:26790 | h007 | ⭐ `200,200,400`（**非等向**） |
| 09-04 龜派氣功 | `Trig_Turtle_Power_Actions` j:31907 | h007 | `250+15×lvl` 三軸同（等向） |
| 20-03 約束與勝利之劍 | `Trig_Excalibur_Actions` j:32324 | h00S | `250+15×lvl` 等向（黑化分支 j:32322 改生 h00X ＝ NetherStrike.mdl） |
| 20-002 勝利劍 MAX | `Trig_ExcaliburMAX_Actions` j:32628 | h00S | `350,350,350` |
| 03-04 全彈發射 | `Trig_Allbullet_Actions` j:32916 | h007 | `250+15×lvl` |
| 81-03 Divine Buster Ext | `Trig_DivineBusterEx_Actions` j:36048 | h01V | ⚠️ 見下 |

⭐ **兩個不是 ReviveHuman 的例外**：
· 59-04 野戰型陽電子砲 → **h01P ＝ `Awaken.mdl`**（j:47757，`120+30×lvl` 三軸同）
· 08-03 龍鬥氣砲咒文 → ⭐ **唯一真的沿線 N 具的迴圈**（j:28838 `exitwhen udg_Dragon > 10`），
  而 e003 ＝ **`RedDragonMissile.mdl`**（⛔ 不是光束模型）

⭐ **傷害迴圈裡零生成、零特效**（與 CLAUDE.md 第〇·六守則⑥一致）：
20-03 的兩個 `exitwhen … > 6`（j:32335 / j:32346）迴圈體只有
`GetUnitsInRangeOfLocMatching` ＋ `EnumDestructablesInCircleBJ`。

### ⭐ 一個沒有人記錄過的細節：81-03 的 `180,180,300` 是**死碼**

`j:36049` `SetUnitScalePercent(GetLastCreatedUnit(), 180, 180, 300)`
→ `j:36050` 存進 `udg_Nanoha_DBE_Unit3`
→ ⭐ `j:36051` 對**同一隻**再打一次 `((lvl*50)+100, 100, 100)`
⇒ 生效的是 X 軸 `(50×lvl+100)%`、Y/Z ＝ 100%。⛔ 180/180/300 從來沒有生效過。

### ⚠️ 三個**沒有查到定案**的（⛔ 誠實留白，不要當成已知）

1. ⛔ **原作光束是垂直光柱還是橫躺光束** —— JASS 側**沒有任何把 dummy 放倒的呼叫**。
   ⚠️ 若原作其實是「砲口一根光柱 ＋ 沿線一排 FlameStrike」，⭐ 那會推翻
   `tpl-beam-roll` 的 `fxLongAxis`/`scaleAxis` 設計理由。
   ⇒ ⭐ **而這一項不必改**：owner 2026-08-23 逐字「**四個經典總是要看到橫放的光束砲吧**」
   ＝ 第〇·六守則第 1 層，**新版設計贏**。這裡只是把原作那一半存起來。
2. ⛔ WC3 的 `SetUnitScale(u,x,y,z)` 是不是「只讀 x」——repo 裡有兩處散文這樣說
   （`BEAMTRUTH_temp_20260826-1200.md:172` · `BEAMAPPLY2_temp_20260826-1200.md:91`），
   ⛔ 而兩處都沒有一手依據。⚠️ 若成立，j:26791 的 Z=400 在遊戲裡沒有作用。
3. ⛔ owner 說「**小呆 龍鬥氣砲咒文、Rider EX** 等一堆人都有用到這個特效」
   （`docs/_daily/2026-08-26.md` 10:11）—— ⭐ 只驗到 08-03，⛔ **而它用的不是 ReviveHuman**
   （e003 RedDragonMissile ×10）。「小呆」「Rider EX」對應哪一支，⛔ 查不到，需要編號。

## 20. `godie-ucrl.*` ⊕ `godie-u034.*` — 06 小傑（職業獵人-傑 富力士）六格（GH#1020，2026-09-06）

> 出處全部逐行讀自 `tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j`（j:行號）與
> `tools/w3x-import/out/GoDieEX22s/ABILITY_W3A.json`（w3a）。WC3 → sim 距離 ×11/600。
> ⛔ 這一節記的是**被取代或被級距吸收的原作數值**；「哪一層贏」按第〇·六守則。

| 格 | 原作（JASS / w3a） | 出貨（GH#1020 之後） | 為什麼不逐字 |
|---|---|---|---|
| **06-00 猜猜拳 A08Y** | `ANsb` 1 級；CD 45；魔 **140**；施法距離 lv1 **讀不到**（w3a 只有 lv2–4 = 250）；`Trig_XHunterStone_Actions` j:26960：`DistanceBetweenPoints ≤ 250` 石頭 / `≤ 500` 剪刀 / 其餘 布 | `distance` 葉 ≤ **4.58** / ≤ **9.17** / > 9.17；魔 144（小）；**rangeTier 極大（12）** | 施法距離：三段要按得到，lv1 那一格 w3a 缺席 ⇒ 取讓三段都可達的級距 |
| 石頭 | 傷 `350 + 150 × A020(E) lvl` 魔法（j:26967）；擊退 `PolarProjectionBJ(40)` × ≤20 tick = **800 wc3（14.67）**、遇障礙停（j:27083–27099）；相機震動 | 級距 **小** × (1 + **3/7** × E 階)；`knockback distanceTier 極大`（push 表上限 **8**） | 14.67 超過 push 五級距的上限 8（`displacement-tiers.json`）；350 → 小（w3x 250 那一族的級距） |
| 剪刀 | 傷 `250 + 100 × A08W(W) lvl`（j:27004）；`HeroCloudCyd.mdx` 掛 chest | 小 × (1 + **0.4** × W 階) | —— |
| 布 | 傷 `225 + 75 × A08X(Q) lvl`（j:27023）；`GetUnitsInRangeOfLocAll(270)` 全體（含非英雄）；`WispExplode.mdl` | 小 × (1 + **1/3** × Q 階)；`damageArea radiusTier 小（4.5）includeOrigin` | 270 → 4.95 ≈ 小 4.5 |
| **EX 追加（`udg_EX_Mode` j:26890/27010/27030；j:8348 滿 30 級撥 true）** | 石頭：擊退結束後 dummy `A0SN`（`AOws` 戰爭踐踏 1 傷 / 暈 **1 s** / 預設半徑 250）＋ `SetUnitPositionLoc(施法者, 目標落點)`；剪刀：dummy `A0NP`（`ANab` 酸性炸彈：主傷 **60/s**、**8 s**、護甲 0、減速欄位繼承未讀）；布：dummy `A04W`（`AHtc` 雷霆一擊 1 傷、英雄 **5 s**、減速欄位繼承＝ 50%） | `learned:EX` 閘：石頭 `delayed 0.5s → blink targetUnit + 圓 小 stun 1s`；剪刀 `dot 極小 × 0.6 / 1s × 8s`（120/s，＝原作 480/250 的比例 1.92×）；布 `applyStatus slow50 5s` | 1 點傷害（踐踏／雷霆）不進級距 ⇒ 只翻暈眩／減速那一半；酸彈的減速欄位是繼承值、卡面沒說 ⇒ 不加 |
| **06-01 放 A08X（`AEev` 0% 閃避殼）** | `Trig_XHunter2` j:26824：`GetRandomInt(1,20) <= lvl` ⇒ **5/10/15/20%**；dummy `A0Y2`（`AOsh` 震盪波 150 傷、距離 **350**、上限 1000） | hook `chance 0.05/0.10/0.15/0.20`；`damageLine length 6.42`（=350×11/600）小 | ⭐ owner 2026-09-06 14:18：「4(我有給過你優先順序JASS優先不是嗎?)」⇒ 第 3 層贏第 4 層（卡面 4%） |
| **06-02 變 A08W（`AHbh` 狂怒擊）** | 機率 **25%**；額外傷 **75/95/115/135**；暈 0 | hook `chance 0.25`；小（四階同一級） | 75→135 落在同一級距（極小 200 / 小 500） |
| **06-03 強 A020（`Aamk`）** | `Istr` **7/14/21/28/20**（lv5 = 20，原作 typo） | `passive.ranks[].attributes.str` 7/14/21/28/**35** | 卡面「永久性的提昇力量 7 點」（第 4 層）> w3a lv5=20（第 5 層） |
| **06-04 傑桑變化 A0Y1（`AEme`）** | CD 60；魔 **200/300/400**；英雄時長 **7/14/21**；buff B04R | `championForm durationSec [7,14,21]`；魔 **288**（中，單一級距） | `manaCostTier` 是單值級距，沒有逐階；200/300/400 落在 中（288）附近 |
| 變身態隨機猜猜拳（`Trig_XHunter` j:27155） | 攻擊者 = `U034` · 非建築 · 非友軍 · **`GetRandomInt(1,5) == 3`（20%）**；`GetRandomInt(1,100) <= 5 + R2I(敏/10)` 石頭，否則 `GetRandomInt(1,2)` 剪刀／布各半；三變體讀同一組 A020/A08W/A08X 等級；EX 分支同上 | `passive.ranks[0].whileForm:"alternate"` hook `chance 0.2` → `weightedBranch` 權重 `5 + 0.1×敏` / `47.5 − 0.05×敏` ×2 | `R2I` 的向下取整沒翻（差 < 1 個百分點）；卡面「(5+敏捷/10)%」寫的是**石頭**那一段，⛔ 不是整個觸發率 |
| **06-002 殺意 A025（`Amgl`，data 空，JASS 零引用）** | 原作 EX ＝ 玩家旗標 `udg_EX_Mode`，滿 30 級撥 true（j:8330）；追加效果全在猜猜拳的三個分支裡 | `passive.ranks:[{}]`（純鑰匙）；追加住在猜猜拳的 `learned:EX` 段 | 票文「A025 零引用 ⇒ 三條追加從沒發生過」**不成立**：追加發生在 `udg_EX_Mode` 分支（j:26890 / 27010 / 27030），⛔ 不是 A025 |

### ⚠️ 被拿掉的兩個沒有出處的預設（2026-09-06 之前的出貨文件）

| 格 | 出貨過的東西 | 出處 |
|---|---|---|
| 06-01 放 hook | `applyBuff armor +25 / 6s`（自身） | ⛔ JASS / w3a / 卡面**都沒有** |
| 06-02 變 hook | `applyBuff as +0.25 / 3s`（自身） | ⛔ 同上 |

⇒ 兩者都是「模板預設裡的推測」（CLAUDE.md 第一守則的第三個載體），拿掉；要回頭就從這一節抄回去。

### ⛔ 三個誠實留白

1. A08Y lv1 的施法距離 w3a 讀不到 —— 極大（12）是「讓三段都可達」的裁量，⛔ 不是原作值。
2. `A0NP` 酸性炸彈的減速百分比是 `inheritedSemantics`（沒抽到）—— 出貨只做出血。
3. 石頭擊退在原作是逐 tick 40 單位、撞到 `DistanceBetweenPoints(P2,P3) > 8` 就停（j:27083）—— GGD 的 `knockback` 走自己的牆規則（`displacement-tiers.json.wallBlock`）。
