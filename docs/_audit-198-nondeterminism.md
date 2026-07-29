# #198 稽核 — sim 非決定性獵捕

> 唯讀稽核，**沒有動任何產品程式碼**。所有探測腳本寫在 `/private/tmp/ggd198/`。
> 日期 2026-07-30。量測機器：darwin 25.4.0 / Node v25.9.0 / repo HEAD `658eb191`。

---

## 摘要（先講結論）

1. **「同樣輸入跑兩次結果不同」我重現不出來。** 30 組（seed × 陣容）× 2400 tick ×
   各跑兩遍、**逐 tick** 比對 `SimWorld.digest()` → **0 次分歧**。跨行程、暖狀態
   （先跑別的世界再跑目標世界）也完全一致。castability 掃描連跑 3 次，306 格
   verdict **一格不差**。
2. **真正壞掉的不是 sim，是偵測器。** `SimWorld.digest()` 的 mixer 只保留
   `value × 4096` 的 **低 24 bit**，所以：
   - `mix(this.rng.state)` **只折進 RNG 狀態的 12 個 bit**（32 bit → 4096 種）。
     兩個 rng 狀態差 4096 的世界，**digest 完全一樣**（已在真的 `SimWorld` 上驗證）。
   - `hp / damageDealt / gold / xp` 這種上千的欄位，**差整數倍 4096 就隱形**。
   - `apps/game-server/src/replay/digest.ts` 的 `hostDigest` 用同一套 mixer，
     所以它自己 docblock 說「要補上 gold 盲點」的那個 gold，**差 4096 一樣看不到**。
3. **`digest()` 是「插入歷史」的函數，不是「狀態」的函數。** 六個 Map 以插入序
   折進雜湊；其中 `mobKills` 在真實對局裡**確實**不是 id 序（實測 `[6,3,4,1,5,2]`）。
4. **`purity.test.ts` 檔案覆蓋範圍其實夠**（84 檔 = sim/ 的完整 import 閉包，
   外溢只有 `constants.ts` / `ids.ts`，兩個都乾淨），**但它掃的是字串不是行為**：
   21 個變異案例只擋掉 5 個。Map 迭代序、遞減計數器、`Math["random"]()`、
   解構 `const {random} = Math` 全部通過。
5. **castability ratchet 現在有 6 格空隙**：floor 寫死 `300`，但版控名單已是 51 人
   → 51 × 6 = **306**，我實測 306 格全綠。**六支技能可以全死掉而閘門不紅。**
   而且 `WORKING_CELL_FLOOR` 的註解白紙黑字寫「51 tracked champions × 6 slots = 300」
   —— 這句算術是錯的（第三守則：註解會說謊）。

---

## 一、重現嘗試（結果：重現不出來）

### 1.1 探測工具

| 檔案 | 做什麼 |
|---|---|
| `/private/tmp/ggd198/harness.ts` | 建一個**真的很熱鬧**的 `SimWorld`：6 位真英雄（12 級、QWER+EX 全學）、真火圈、真守衛塔、真殭屍波（round 6）、真花、真復活圈、真投幣；腳本化 intent（每 20 tick 輪流放一招、每 37/53 tick 下移動／攻擊移動令） |
| `/private/tmp/ggd198/stress.ts` | 10 seed × 3 陣容 × 2400 tick，各跑兩遍，**逐 tick** 比 digest |
| `/private/tmp/ggd198/run2.ts` | 跨行程 / 暖狀態比對 |
| `/private/tmp/ggd198/sweep.ts` + `sweeprun.ts` | 把 `castabilitySweep.test.ts` 的 `testSlot` / `testBasic` **原樣重寫**（呼叫的全是出貨函式：`spawnChampion` / `rankUpAbility` / `learnEx` / `castAbility` / `isPassiveOnly` / `world.step`），差別只在不寫 `docs/_castability-128.md` |

重跑指令：

```bash
cd /private/tmp/ggd198
npx tsx stress.ts        # TICKS=2400，30 組配對
WHICH=solo npx tsx run2.ts   # 跑兩次比 final digest
WHICH=warm npx tsx run2.ts
N=3 npx tsx sweeprun.ts
```

### 1.2 量到的數字

```
pairs=30  ticks=2400  divergences=0
```

而且這 30 組不是空轉 —— run A 的事件統計（10 seed × 3 陣容合計）：

| 事件 | 次數 | | 事件 | 次數 |
|---|---:|---|---|---:|
| fireRingTick | 54,030 | | death | 1,313 |
| fireRingDamage | 34,107 | | killCombo / mobSlain | 1,132 |
| damage / hitImpact | 10,008 | | projectileSpawn | 991 |
| attackWindup | 3,995 | | levelUp | 119 |
| basicAttack | 2,863 | | knockdown | 77 |
| mobSpawn | 1,732 | | reviveCircleSpawn | 60 |

死亡、擊殺、復活、守衛塔開火、火圈燒、投射物、擊倒都真的發生了。

跨行程 / 暖狀態（900 tick，seed 1234）：

```
proc1 solo  final=ee33455d  ents=25  ev=2009
proc2 solo  final=ee33455d  ents=25  ev=2009
proc3 warm  final=ee33455d  ents=25  ev=2009   ← 先跑兩個不相干的世界才跑目標
```

castability 掃描（51 人 × 6 格 = 306）：

```
run 0: working=306 / 306
run 1: working=306 / 306
run 2: working=306 / 306
diffs run0 vs run1: 0
diffs run0 vs run2: 0
```

### 1.3 歷史上那份報告的「飄動」是白名單假象，不是非決定性

`docs/_castability-128.md` 逐 commit 的總數：

| commit | 數字 | 解釋 |
|---|---|---|
| `8b405869`（HEAD） | 358/366 | 61 人（含營運白名單）× 6 |
| `90eca5e6` | 298/306 | 51 人 × 6 |
| `418ed9f4` | 292/300 | 50 人 × 6 |

**300 / 306 / 366 的來回跳動 = 有沒有 `data/curation/whitelist.json`**，
`docs/_session-handover.md` 第六節已經記過這個陷阱。
唯一一次「同尺寸翻面」是 `1783d479`（291/300, FAIL 1）→ `418ed9f4`（292/300, FAIL 0），
但兩者之間夾著 #247 的 leap 實作（`git diff --stat` 有
`sim/movement/leap.ts` +255、`sim/systems/LeapSystem.ts` +173），
**是內容修好了，不是抖動**。

> 所以：#198 標題說的「ratchet 暴露出來的非決定性」，我沒有找到證據。
> 這條任務應該**重新定義範圍**（見第五節）。

---

## 二、真正的缺陷：偵測器本身

### 2.1 digest 的 mixer 只折 24 bit（`SimWorld.ts:800-812`）

```ts
const mix = (n: number): void => {
  const q = Math.round(n * 4096);
  h ^= q & 0xff;         h = Math.imul(h, 0x01000193);
  h ^= (q >>> 8) & 0xff; h = Math.imul(h, 0x01000193);
  h ^= (q >>> 16) & 0xff; h = Math.imul(h, 0x01000193);
};
```

只取 3 個 byte ⇒ 有效範圍是 `q ∈ [0, 2²⁴)` ⇒ **原始值的週期是 2²⁴ / 4096 = 4096.0**。
任何兩個相差 4096 整數倍的數值，對雜湊的貢獻**完全相同**。

實測（`/private/tmp/ggd198/mixblind.mjs`）：

```
COLLIDES  hp 3000 vs 3000+4096
COLLIDES  damageDealt 50000 vs 54096
COLLIDES  xp 12345 vs 16441
differs   hp 3000 vs 3001            ← 對照組
```

座標打不到（競技場半徑 42），但 **hp / maxHp / damageDealt / damageTaken /
goldEarned / xp / largestSingleHit** 全都在幾千～幾萬的量級，4096 的差距在一場
比賽裡是**平常會發生的量**。

### 2.2 最嚴重的一項：`mix(this.rng.state)` 只看得到 12 個 bit

`rng.state` 是滿 32 bit。`q = state × 4096` 先被 `ToUint32` 截成 `(state << 12) mod 2³²`，
再只取低 3 個 byte ⇒ **只有 `state` 的 bit 0–11 存活**。

實測（`/private/tmp/ggd198/rngbits.mjs`）：

```
distinct hashes from 200000 distinct 32-bit rng states: 4096
rng-state bits the digest can SEE: 0..11  (12 of 32)
```

在**真的** `SimWorld` 上驗證（`/private/tmp/ggd198/rngreal.ts`）：

```
a.rng 1234   b.rng 5330 (= a + 4096)   c.rng 1235
digest a 4d311060
digest b 4d311060   *** RNG DIVERGENCE INVISIBLE ***
digest c cc9d0bb0   detected (control)
```

⚠️ 這直接反駁 `apps/game-server/src/replay/digest.ts` 檔頭那句
「`SimWorld.digest()` is a real detector — an rng-order divergence surfaces on the
very tick it happens, because `mix(this.rng.state)` is folded in」。
**一次「多抽一次 rng、狀態還沒轉成任何可見結果」的分歧，有 1/4096 的機率當場隱形。**
如果那一 tick 的分歧**只有** rng（例如某個 `chance()` 判定的次序差），rng term 就是唯一訊號。

### 2.3 `hostDigest` 繼承同一個盲點

`apps/game-server/src/replay/digest.ts:37-50` 的 `Mixer.num` 是同一套算式
（多了個 `| 0`，結果一樣）。實測：

```
gold 500 vs 4596   : COLLIDES (hostDigest blind)
xp 20000 vs 24096  : COLLIDES (hostDigest blind)
gold 500 vs 501    : differs (control)
```

`hostDigest` 的檔頭寫它存在的理由就是「+500 gold 從沒被偵測到」。
**它補上了 gold 欄位，但沒補上量測精度 —— 差 4096 金幣還是看不到。**

### 2.4 `digest()` 折的是插入序，不是狀態

`digest()` 對六個 Map 用**未排序**的 `for…of`（`SimWorld.ts:894 / 920 / 925 / 935 /
941 / 949 / 960 / 973 / 979`）。只有 `recentDamagers` 被明確排序過
（`SimWorld.ts:994-1001`，註解也寫了為什麼）。

實測（`/private/tmp/ggd198/orderprobe.ts`）—— 兩個世界**狀態逐鍵相同**，只有寫入順序不同：

| Map | 狀態相同 | asc digest | 打亂 digest | 結論 |
|---|---|---|---|---|
| `mobKills` | ✔ | `9fa59f08` | `14833418` | **順序相依** |
| `matchStats` | ✔ | `1aceb3e9` | `52866911` | **順序相依** |
| `coinBudget` | ✔ | `5601f610` | `26fd60d0` | **順序相依** |
| `reviveCharges` | ✔ | `5601f610` | `26fd60d0` | **順序相依** |
| `coin` | ✔ | `93941f61` | `6a98ef61` | **順序相依** |
| `mob` | ✔ | `d2388760` | `e37fbe60` | **順序相依** |

這在「同一份輸入從 tick 0 重跑」的情境下無害（插入序會被完整重播），但它讓
digest **不能**用來比對「用不同路徑到達同一狀態」的兩份世界（熱接、快照重建、
未來任何 mid-match resume）。

### 2.5 哪些 Map 的插入序真的不是 id 序（實測）

`/private/tmp/ggd198/run3.ts`：跑滿 1500 tick 後掃 31 個 Map 的 key 是否遞增。

```
OUT  mobKills   n=6  [6,3,4,1,5,2]
OUT  killCombo  n=6  [6,3,4,1,5,2]
其餘 29 個 Map：ASC
```

- `mobKills` **有折進 digest**（`SimWorld.ts:979`）→ 上述 2.4 的風險是**真的會發生**，
  不是理論。它的插入序是「誰先殺到第一隻殭屍」。
- `killCombo` 刻意不折（`SimWorld.ts:206-217` 有寫理由），OK。
- `coinBudget` 目前實測是遞增的，但那是我的 harness 依 id 順序餵 `fighters`。
  出貨路徑 `MatchController.enterCombat` 是**依 pairing / zone / side / seat 順序**
  堆 `fighters`（`apps/game-server/src/match/MatchController.ts` 約 1071–1180），
  再交給 `beginCombatCoins`（`coins.ts` 逐個 `coinBudget.set`）。
  **這條沒有實測到，列為待驗（見第六節）。**

---

## 三、`purity.test.ts` 守得住什麼、守不住什麼

### 3.1 檔案覆蓋範圍：其實是夠的（意外的好消息）

`purity.test.ts` 只掃 `packages/shared/src/sim/**`。我從 sim 的每個非測試檔做了
**完整 import 遞移閉包**（`/private/tmp/ggd198/closure.mjs`）：

```
files reachable from sim/**: 86
OUTSIDE sim/ (NOT scanned by purity.test.ts): 2
    src/constants.ts
    src/ids.ts
BANNED-TOKEN HITS IN THOSE UNSCANNED FILES: 0
```

`sim/**` 有 84 個非測試檔，閉包只外溢兩個檔，兩個都乾淨。
（`../../content/registries` 之類只被**測試檔**引用，不進出貨路徑。）

`apps/game-server/src` 的 tick 路徑也掃了，`Math.random` / `Date.now` 只出現在
seed 產生（`MatchRoom.ts:228`）、健康度遙測（`MatchRoom.ts:469/478/481`）、
HMAC / 快取 TTL —— 都不進 sim 決策。`ai/Tier0Brain.ts` 乾淨。
`tickLoop.ts` 的丟 tick 只影響「什麼時候跑」，不影響「跑出什麼」，它 docblock 的說法成立。

### 3.2 但它掃的是**原始碼字串**，不是行為（第⑥種故障）

用 `purity.test.ts` 一模一樣的剝註解器 + ban list 跑 21 個變異
（`/private/tmp/ggd198/guardmut.mjs`）：

| 擋到？ | 變異 |
|---|---|
| ✅ | `Math.random()` ／ `globalThis.Math.random()` ／ `x ** 2` ／ `Math.pow` ／ `new Date` |
| ❌ | `Math["random"]()` |
| ❌ | `const { random } = Math; random()` |
| ❌ | `const M = Math; M.random()` |
| ❌ | `const u = "a//b"; const r = Math.random();`（`//` 剝除器把同一行後半吃掉） |
| ❌ | `crypto.getRandomValues` ／ `crypto.randomUUID` |
| ❌ | `Date()`（沒有 `new`） ／ `process.hrtime.bigint()` |
| ❌ | `queueMicrotask` |
| ❌ | `toLocaleString` ／ `localeCompare`（**locale 相依排序**） |
| ❌ | **未排序 Map 迭代**（`for (const [id, v] of world.someMap)`） |
| ❌ | **遞減計數器**（`inst.cooldownRemainingTicks--`） |
| ❌ | `Object.keys(o)` 迭代 |

**5 擋 / 16 漏。**

好消息：上述漏網之魚**目前沒有一個真的出現在 `sim/**`**（`localeCompare` / `Intl` /
`toLocale` / `crypto.` / `process.hrtime` / `queueMicrotask` 全部 0 命中；
字串裡藏 `//` 導致剝除器吃掉真程式碼的情況也 0 命中）。
所以現況是安全的 —— 但**這道閘不會告訴你什麼時候不安全了**。

### 3.3 專案自己的規矩，這道閘完全沒在守

`CLAUDE.md`：「到期一律用**絕對 tick**，不是遞減計數器。」實際上有 **8 處遞減**：

```
sim/systems/BasicAttackSystem.ts:260   w.ticksLeft--
sim/systems/MobSystem.ts:171           mob.attackCdTicks--
sim/systems/CastResolveSystem.ts:42    cast.ticksLeft--
sim/systems/RecoverySystem.ts:56       rec.ticksLeft--
sim/abilities/abilitySystem.ts:349     inst.cooldownRemainingTicks--
sim/abilities/abilitySystem.ts:351     ab.exSlot.cooldownRemainingTicks--
sim/abilities/abilitySystem.ts:357     ab.passiveSlot.cooldownRemainingTicks--
sim/abilities/abilitySystem.ts:358     ab.basicAttackCdTicks--
```

同樣地「Map 迭代要先排序」也沒守：`sim/**` 有 **60+ 處**未排序的 Map 迭代
（它們今天靠「插入序 == id 遞增序」這個**不成文不變式**成立，而這個不變式
在 `mobKills` / `killCombo` 上**已經破了**）。

---

## 四、順手抓到的：castability ratchet 有 6 格空隙

`packages/shared/src/sim/castabilitySweep.test.ts`

```ts
const ROSTER_SIZE = 51;           // :92
const WORKING_CELL_FLOOR = 300;   // :116
```

`:93-95` 的註解寫：

> RATCHET FLOOR — working cells (✅ PASS + 🟣 verified PASSIVE) over the **51
> tracked champions × 6 slots = 300**.

**51 × 6 = 306，不是 300。** 這個 floor 是 50 人時代（50 × 6 = 300）棘輪上來的，
GH#29 把名單加到 51（`docs/_castability-128.md` 的歷史也記了 50→51）之後**沒有跟著調**。
測試自己的錯誤訊息（`:615`）反而算對了：`over ${ROSTER_SIZE}×6=${ROSTER_SIZE*6}`
→ 印出 `51×6=306`，然後拿去跟 `300` 比。

我用出貨函式重跑掃描，實測 **306 / 306 全綠**。
⇒ **今天有 6 格技能可以整個死掉，`expect(...).toBeGreaterThanOrEqual(300)` 還是綠的。**

---

## 五、修法建議與工程量

| # | 修什麼 | 檔案領域 | 量 | 為什麼 |
|---|---|---|---|---|
| **A** | **digest mixer 補到 32 bit**：加上第 4 個 byte（`(q >>> 24) & 0xff`），並把 `rng.state` 改成拆成兩個 16-bit 分別 mix（不要乘 4096） | `packages/shared/src/sim/SimWorld.ts` + `apps/game-server/src/replay/digest.ts` | **S** | 這是投資報酬率最高的一條。⚠️ 會**改變所有既有 golden digest**（`PRE_COIN_GOLDEN_DIGEST = 0x9d9048c5` 等），要一起重新 baseline，而且要在 commit 說清楚「舊 golden 失效是刻意的」 |
| **B** | **`digest()` 的六個 Map 迭代前排序**（照 `recentDamagers` 已有的寫法） | `SimWorld.ts:894-983` | **S** | 讓 digest 變成「狀態的函數」而不是「插入歷史的函數」。同樣會動 golden |
| **C** | **`mobKills` 改成 id 序寫入**，或在 digest 排序（B 已涵蓋） | `sim/systems/MobSystem.ts` | **S** | 這是唯一實測到**真的**亂序又**真的**進 digest 的 Map |
| **D** | **purity 閘從「掃字串」升級成「掃行為 + 掃結構」**：<br>① 加一條 **AST/regex 規則**：`sim/**` 內任何 `for (… of world.<map>)` 必須先 `.sort()`，例外走雙向 allow-list（過期列也要紅）<br>② 加一條 **runtime 守衛**：跑一場 2000-tick 的熱鬧對局兩遍，逐 tick 比 digest（把 `/private/tmp/ggd198/harness.ts` 收編成 testkit）<br>③ ban list 補 `Math\[` / `crypto\.` / `localeCompare` / `toLocale` / `process.hrtime` / `queueMicrotask` / `\bDate\(` | `packages/shared/src/sim/purity.test.ts`（+ 新的 `sim/determinism.test.ts`） | **M** | 現行 `sim-04` 只跑**沒有 stats、沒有技能、沒有戰鬥**的 6 個空實體（`SimWorld.test.ts:21-68`）—— 它對本次稽核跑的那 30 組全綠的東西**一句話都沒說**。這是第③種故障：把 `SimWorld.test.ts` 的斷言刪掉，真正的風險面一樣沒人看 |
| **E** | **`WORKING_CELL_FLOOR` 300 → 306**，並修掉「51 × 6 = 300」那句假算術 | `sim/castabilitySweep.test.ts:92-116` | **S** | 一行 + 一段註解。改之前先跑一次確認今天真的是 306 |
| **F** | 遞減計數器 → 絕對 tick（8 處） | `sim/abilities/abilitySystem.ts`、`sim/systems/{BasicAttack,CastResolve,Recovery,Mob}System.ts` | **M** | 不是今天的 bug，是**規矩債**。真正會咬人的時機是任何 mid-match resume / 熱接。建議跟 #175 重播的下一輪一起做，不要單獨動 |
| **G** | **重新定義 #198 的範圍**：把 issue 標題從「獵捕非決定性」改成「digest 是假的偵測器 + purity 閘只掃字串」 | GitHub issue | **S** | 目前這張單的前提（有非決定性）我證不出來；照原標題做下去會一直找不到東西 |

**建議順序：E（一行、馬上）→ A + B + C（同一個 PR，一次把 golden 重新 baseline）→ D → F。**

---

## 六、還沒答的問題

1. **#198 原本是看到什麼才開的？** 我把 `docs/` 全文搜過 `#198`，四處引用全部指向
   同一件事（`godie-u00n.r` 的 `WINDOW = 26` 觀測盲點，`castabilitySweep.test.ts:136-142`），
   **沒有任何一處記錄過實際觀察到的分歧**。需要 owner 或上一輪的 session 補一句
   「當時是怎麼看出來的」，否則這張單的前提無法驗證。
2. **`coinBudget` / `reviveCharges` 在真實 `MatchController` 下的插入序是不是 id 序？**
   我只在自建 harness（依 id 餵 `fighters`）驗到 ASC。出貨路徑是 pairing 序，
   要一支 `MatchController` 等級的探針才能定案。**這條會直接影響修法 B 的優先級。**
3. **`hostDigest` 對 `ctl.offers`（string key，插入序）的迭代**同樣是順序相依 ——
   同 2.4，但我沒有實測它在真實對局裡會不會亂序。
4. **火圈的浮點累加**：`fireRingTicks` 是整數 tick，`currentFireRingRadius` 在
   `hostDigest` 裡被 `Math.round(… * 4096)`。半徑量級 ~42，遠低於 4096 週期，
   應該安全，但沒有針對 `combatTicks` / `mobTicks` 這類長期累加做過極端值探測。
5. **跨平台**：本次全部在同一台 darwin/arm64 + 同一個 Node 上跑。
   「同一 seed 在 Linux 容器 vs macOS 開發機」沒有測過 —— 那是重播真正要跨的邊界
   （deploy 到 ggd.adms.ai 就會跨），而 `Math.sqrt` 雖然是 IEEE 正確捨入，
   `Math.round` / 除法都安全，但沒有實測就不該宣稱。**建議 D② 的守衛做成可以錄
   digest 序列存檔，在 CI 的 Linux runner 上跟本機比。**

---

## 附錄：探測腳本清單（全在 `/private/tmp/ggd198/`，不在 repo 內）

| 檔案 | 作用 |
|---|---|
| `harness.ts` | 熱鬧世界 + 腳本 intent + 逐 tick digest |
| `stress.ts` | 30 組（seed × 陣容）× 2400 tick 雙跑比對 |
| `run1.ts` / `run2.ts` | 同行程 / 跨行程 / 暖狀態比對 |
| `run3.ts` | 31 個 Map 的插入序不變式掃描 |
| `sweep.ts` / `sweeprun.ts` | castability 掃描重寫（不寫 docs），連跑 N 次比 verdict |
| `orderprobe.ts` | 證明 digest 對六個 Map 的插入序相依 |
| `mixblind.mjs` | digest mixer 的 24-bit 截斷（週期 4096） |
| `rngbits.mjs` / `rngreal.ts` | `mix(rng.state)` 只折 12 bit（真 SimWorld 驗證） |
| `hostmix.mjs` | `hostDigest` 繼承同一個截斷 |
| `guardmut.mjs` | purity ban list 的 21 個變異 |
| `closure.mjs` | sim 的 import 遞移閉包 vs purity 掃描範圍 |
