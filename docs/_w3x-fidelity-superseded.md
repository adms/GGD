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
