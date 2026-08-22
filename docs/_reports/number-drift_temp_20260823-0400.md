# 手抄出貨數字造成的紅 —— 全部改成推導（2026-08-23）

觸發：owner 裁決「英雄專屬的初始 AD **+32**」（GH#598，commit `09315c25`，
`content/config/base-bonus.json` 的 `"ad": 32` ＋ `DEFAULT_BASE_BONUS`）。

⭐ 這一輪**只改測試**。⛔ 一份 `content/`、⛔ 一支非測試的 `src/**` 都沒有動。

---

## ⭐ 根因不只一個 —— 量出來的是**三個**

| # | 根因 | 影響幾條 | 是不是「數字過期」 |
|---|---|---:|---|
| ① | **贈禮坐在倍率之後**（`finalizeStat`：`out *= env` → `out += baseBonusFor(...)` → clamp）。所以 `×1.25` / `×1.5` / `−19%` / `+15%` / `+50%` 乘的是**倍率空間**，而測試拿**最終面板值**去乘 | 8 | ✅ 是 |
| ② | ⭐ **AD 變高 → hitstop 變長 → 攻擊者自己被凍得更久 → 每秒揮的刀變少**。`combat/damage.ts`：`impact < 12` 完全不凍，之後每 55 點多凍 1 tick；`BasicAttackSystem` 的 `if (hitstop > 0) continue` 讓攻擊者也停 | 4 | ⛔ **不是** —— 這是真的行為改變 |
| ③ | 另外三條 lane 的落地（`screenFlash` / `uiCues` 頁 / `PassiveIcdChip` / 殭屍王 leap），與 AD 無關 | 5 | ⛔ 不是 |

### ⭐ ② 的量測（一次性量尺，量完就刪）

同一張長凳，只換基礎贈禮的 `ad`：

```
AD gift  0 :  面板2.0→1.9   面板3.0→3.0   面板4.0→3.7
AD gift 32 :  面板2.0→1.8   面板3.0→2.8   面板4.0→3.5     ← 全部掉 ~5%
把兩邊的傷害釘成 chip（<12）之後：
AD gift 32 :  面板1.0→1.0   面板2.0→2.0   面板2.5→2.5  面板3.0→3.0  面板4.0→3.8  面板6.0→6.0
解鎖上限長凳：capped=11 unlocked=18（未釘）→ capped=11 unlocked=30（釘 chip）
虛弱長凳    ：normal=5 weak=5（未釘）→ normal=6 weak=5（釘 chip，但持續時間才是主因）
```

⇒ ⭐ **玩家真的會感覺到**：初始 AD +32 讓「面板攻速 3.0」實際只揮 2.8 刀/秒（−6%）。
⛔ 這不是測試壞了。⛔ 我沒有改任何平衡數字（那是 owner 的旋鈕，第一守則）——
我只是把「傷害多大」這個變數從**量節奏**的長凳上拿掉，並在這裡把它記下來。

---

## 逐檔：改成推導 vs 不得不留字面值

| 檔 | 紅 | 做法 | 分類 |
|---|---:|---|---|
| `sim/pipeline.test.ts` | 3 | `(base − gift + 48) × 1.1 × 1.5 + gift`、`(adBefore − gift) × 1.15 + gift`、Override 後 `1 + gift`。gift 從 `world.baseBonus` 讀 | ⭐ 推導 |
| `sim/balanceTuning.test.ts` | 3 | ①「其餘 13 項都是 0」→ **拿到贈禮的那一圈 = 出貨內容檔列的那一圈**（讀 `base-bonus.json`），其餘每一條 `ALL_STATS` 回 **0**（⛔ 不是 undefined/NaN）。②③ 兩張攻速長凳釘 chip 傷害 | ⭐ 推導 |
| `content/championFormGoku.test.ts` | 3 | 新增 `adBoostSpaceOf()`：最終 AD − 贈禮。三條 `×1.25` 兩邊都在倍率空間比 | ⭐ 推導 |
| `sim/innatePassivePayloads.test.ts` | 2 | 新增 `adInBoostSpace()`；`GIAN_AD_PCT = −0.19` **留字面值** | ⭐ 推導＋1 字面值 |
| `sim/statCapsReach.test.ts` | 1 | `swingsIn()` 兩邊釘 chip 傷害（檔頭寫「唯一決定他揮幾刀的東西就是上限」—— 現在那句話又成立了） | ⭐ 機制 |
| `sim/weakness.test.ts` | 1 | ① 釘 chip 傷害（否則「傷害減半」會**反過來**讓他揮得更快，抵銷要驗的效果）②⭐ 減益持續時間跟著窗口走 —— 原本 30 tick 而窗口 120 tick，**四分之三的量測是在沒有虛弱的狀態下做的** | ⭐ 推導＋修一個真的夾具缺陷 |
| `sim/windOrbAndFormBuffs.test.ts` | 1 | `×1.5` 兩邊扣掉 `baseBonusFor(w.baseBonus, ad)` | ⭐ 推導 |
| `content/fieldAdoption.test.ts` | 1→2 | 6 列新豁免（見下） | ⭐ 逐列理由 |
| `client/render/leapFraming.test.ts` | 2 | ① `harvestContentLeaps()` 只收**英雄**的跳躍（從 `content/champions/` 推導，⛔ 不是手寫排除清單）② JASS 家族從 `[0,250,300,400,600,1000].map(toApex)` **推導**，⛔ 不抄第二份算好的清單 | ⭐ 推導 |
| `client/ui/panels/statPreview.test.ts` | 1 | `0.5 × (adWithItem − gift)` | ⭐ 推導 |
| `admin/navSections.test.ts` | 1 | `SINCE_BASELINE` 補 `uiCues`（GH#576/#573） | 明示清單（該檔的設計就是這樣） |
| `client/ui/hud/versionBadgeBand.test.ts` | 1 | `AbilityBar.tsx bottom:0` 帳本 x5 → **x6**（新的 `PassiveIcdChip`） | 明示帳本（該檔的設計就是這樣） |

**合計 19 條紅 → 0 條。** 其中 **12 條是「改成推導」**，
**3 條留字面值**（各自有理由，見下），**4 條是明示清單/帳本**（那兩個檔的守衛設計就是「一列一個看得見的決定」）。

### ⛔ 不得不留字面值的三個，各自的理由

| 值 | 在哪 | 為什麼不能推導 |
|---|---|---|
| `GIAN_AD_PCT = -0.19` | `innatePassivePayloads.test.ts` | w3a `A07G` `DataA1` —— 它是 **w3x 保真度事實**，⛔ 不是 owner 的平衡旋鈕。90 支重製稿一個字都沒有動它。檔案裡原本就寫著這個理由 |
| `CHIP_AD = 1` | `balanceTuning` / `statCapsReach` / `weakness` | 它 **不釘任何出貨值** —— 它只需要小於 `combat/damage.ts` 的 `HITSTOP_MIN_IMPACT = 12`。⛔ 從 `HITSTOP_MIN_IMPACT` 推導會把一個 sim 內部常數變成測試的公開 API，成本高於收益 |
| `1.25` / `1.5` / `1.15` / `0.5` 這些倍率 | 各檔 | 它們是**被驗的那個機制本身**（技能的倍率），⛔ 不是「出貨數值」。驗倍率就是這條測試存在的理由 |

---

## ⭐ 有沒有哪一條改完就變成假守衛？

**一條半。**

### ① `balanceTuning.test.ts`「拿到贈禮的那一圈」—— **半條**

改成從 `content/config/base-bonus.json` 推導之後，它的「①那一圈相等」
與同一檔的 `出貨的 config.base-bonus@1 內容文件就是後台預設值`
（`expect(normalizeBaseBonus(doc.bonus)).toEqual(DEFAULT_BASE_BONUS)`）**重疊**。

⭐ 但它**沒有**變成假守衛，因為第②半是獨立的：
`toEqual` 比不到**不存在的 key**，而這一條逐一走 `ALL_STATS` 問
「`baseBonusFor()` 對沒有贈禮的屬性回的是乾淨的 `0`，⛔ 不是 `undefined`/`NaN`」。
那是 `baseBonusFor` 這支函式的性質，⛔ 不是那張表的內容。

### ② `leapFraming.test.ts`「apex 屬於 JASS 家族」—— **它本來就比看起來弱**

改成 `[0,250,300,400,600,1000].map(toApex)` 之後，它**還是**能擋住
「有人用平面匯入比例算 apex」（11.0 不在家族裡），但它**擋不住**
「有人手寫一個剛好落在格點上的 apex」。⛔ 這在改之前也一樣 ——
我沒有讓它變弱，只是拿掉了第二份算好的清單。
⭐ 真正在守這件事的是同一檔的 framing 那一條（≤15% 出框 / ≤35% 裁切）。

---

## 🚩 交回去的三件事（⛔ 都不在我的柵欄裡，⛔ 我一個字都沒改）

### 1. ⭐ 殭屍王的「全場陷入黑暗」實際畫出來是**淡灰半秒**

`schema/effects/screenFlash.ts` 的 `scripted` 欄位說明**逐字**寫著
「⚠️ 觸發它的是殭屍王的**全畫面變黑一秒漸變回復**」，
而出貨的 `content/abilities/godie-zombieking.passive.json` 的 `screenFlash`
（`colorRgb [0,0,0]` / `peakAlpha 1.0` / `durationSec 1.0`）**沒有** `scripted: true`。
⇒ 在出貨的 `config.screen-fx@1` 上限（`flashMaxAlpha 0.55` / `flashMaxSec 0.6`）下，
卡片上寫的「全場陷入黑暗」變成淡灰半秒。**每一個零件都對，組合起來是空的**（第一·五守則）。

我把它記成 `fieldAdoption.test.ts` 的一列 **`status: "debt"`**（⛔ 不是 `landing`）——
debt 每一輪印在橫幅上，⛔ 不會過期成沉默。修法是在那份文件上補一格 `scripted: true`
（或由 owner 裁決淡灰才是要的），補上的那一天刪掉那一列。

### 2. ⛔ `apps/client/src/render/screenFx.ts` 的 typecheck 是**紅的**（⛔ 不是我造成的）

```
src/render/screenFx.ts(129,21): error TS2339: Property 'scripted' does not exist on type 'ScreenFlashSpec'
src/render/screenFx.ts(130,21): error TS2339: 同上
```

那個檔**在工作區裡是 `M`**（GH#602 那條 lane 正在飛）。
schema 有 `scripted`、client 讀 `spec.scripted`，而**傳到 client 的那個型別沒有帶它**。
⇒ 這一格是**半接的**。`packages/shared` / `apps/admin` / 其餘 13 個 package 的 typecheck 全綠。

### 3. ⭐ 殭屍王的 leap `apexHeight: 5.0` 沒有人量過它在**玩家的鏡頭**下怎麼框

`leapFraming.test.ts` 的契約逐字是「**你正在看的那個**跳躍者留在畫面上」——
鏡頭鎖在飛行的身體上。**小怪永遠不是那個人**（鏡頭跟的是玩家的英雄），
所以用一個黏在殭屍王身上的鏡頭去量他，量的是一個遊戲永遠不會拍的鏡位
（那個 rig 說 51% 被上緣裁掉，限額 35%）。
⇒ 我把 `harvestContentLeaps()` 收斂成**英雄的跳躍**（從 `content/champions/` 推導）。
⛔ **不要把這讀成「那支 leap 沒問題」** —— 它是全內容裡唯一一個
① 不在 JASS 換算家族裡（`toApex` 產不出 5.0，最大的 `A0RZ` 是 4.0）
② 手寫出來的 apex。**它值得一張票。**

---

## 🔴 這一輪之後仍然紅的 7 條（⛔ 全部在柵欄外，⛔ 全部是 `skills:sync` 的地盤）

`vfxSurfaceInContract` · `abilityProvenance` · `legacyIndexFresh` · `codexContractFresh`
· `styleSpecFresh` · `innateLegendaryDocFresh` · `skillSpecFresh`

它們是**產生器新鮮度閘**，來源是別的 lane 正在寫的 `content/` 與 `docs/`。
⛔ 我沒有跑 `pnpm skills:sync`（CLAUDE.md：同一時間只能有一條工作流跑它，由主 session 最後統一跑）。
⚠️ 其中 3 條（`vfxSurfaceInContract` / `innateLegendaryDocFresh` / `skillSpecFresh`）
在我這一輪**開始時是綠的**，而 `skillAuditFresh` 開始時是紅的、現在綠了 ——
⇒ 它們正隨著別條 lane 的寫入在翻，⛔ 不是我的 diff 造成的。

## ✅ 這一輪的結果

| | |
|---|---|
| `--dir apps` | **825 / 825 檔綠**（7,820 條，7 skipped）· EXIT 0 |
| `--dir packages/shared` | 476 / 483 檔綠（3,851 條）· 剩下的 7 條見上 |
| 我柵欄裡的 12 個檔 | **12 / 12 綠** |
| typecheck | `packages/shared` ✅ · `apps/admin` ✅ · 其餘 13 個 package ✅ · `apps/client` ❌（別人 in-flight 的 `screenFx.ts`，見上） |
| 實作 / 測試比 | **0 行實作**（這一輪照定義只改測試） |
