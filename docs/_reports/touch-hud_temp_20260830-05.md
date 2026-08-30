# lane 觸控 HUD（#800 · #873）—— 2026-08-30

> ⚠️ 用詞紀律：本文一律「**鏈路已接上，⛔ 未驗收**」——
> ⛔ 沒有真手機上的像素證據，只有幾何與 SSR 標記的證據。

## 0. 基線（⭐ 動手前自己量的，⛔ 不是抄票文）

跑 `npx vitest run apps/client/src/ui/hud/touchControlsCollision.test.ts
apps/client/src/ui/hud/hudBottomCluster.test.ts` ⇒ **兩本帳本都是綠的**。

| 票 | AC | 動手前的實況 |
|---|---|---|
| #800 | AC1 `KNOWN` 空 | ✅ 已經空了（`equipment.touchOrder` 5→0 那次） |
| #800 | AC2 `TOUCH_PLATE_KNOWN` 空 | ✅ 已經空了（**推導**的 RotateOverlay 豁免） |
| #800 | AC3 量法零改動 | ✅ |
| #873 | `gold-level×attack` 三列 | ⛔ **在**：`88×86` × 844×390 / 852×393 / 780×360 |

⇒ ⭐ **#800 的頭條（88×38）早就修掉了**；今天真正還在的是 #873 的 88×86
（＝攻擊鈕 88×88 的 **97.7%**）與 `CLUSTER_RESIDUAL` 的 15 列殘量。

## 1. #873 —— 做了什麼（commit `c003c9568`，**在 main 上**）

### 根因（三層，⛔ 不是「誰粗心」）

| 層 | 事實 |
|---|---|
| **幾何** | 觸控下 `gold-level` 是 120×116 錨在 `right:10/bottom:10`；攻擊鈕錨在距角落 `attackCenter(84)`，邊長 88 ⇒ 攻擊鈕**整顆落在面板矩形內** |
| **畫在上面** | `HUD_Z.slot(25)` > TouchControls 根節點 `zIndex:20`，兩者同在 `#hud-root`（z-index:10，**開一個 stacking context**）；底色 `PANEL_BG` **88% 不透明** |
| **⛔ 不吃觸控** | `pointer-events` 可繼承，`#hud-root` 宣告 `none` 而兩邊都沒覆寫 ⇒ ⭐ **按得到、看不到**（⛔ 不是 `028aa3bf` 那種吃觸控的缺陷） |

⭐ **根因的第四層是一句過期的散文**：`hudLayout.ts` 的 `gold-level` 逐字寫著
「on coarse pointers this is the ONLY slot left in the bottom-right corner …
so **height is free**」—— 而 minimap 與 equipment **正是為了讓開觸控技能叢集**才搬走的
（`touchControlsRect.ts` 檔頭逐字「bottom-right IS the ability arc」）。
⇒ 它獨占了一個**已經被讓出來給別人**的角落。⭐ 註解數對了誰**離開**，⛔ 沒數它們**讓給誰**。

### 修法：⛔ 不換角落，**縮成一條**

觸控保留高度 **116 → 30**。⭐ **30 是算出來的上界**：
`attackCenter(84) − attackSize/2(44) = 40`（攻擊鈕近緣距底），槽位從 `HUD_EDGE(10)` 起算
⇒ **40 − 10 = 30**。⛔ 不是挑一個好看的數字。

⭐ **AC2「量法一個字都沒改」成立**：`touchControlsRect.ts` 與 `hudSlotRect` 在這次 diff 裡
是零改動 —— 動的是**保留高度**與**元件畫的東西**，⭐ 兩邊一起動
（⛔ 只縮保留不縮畫面 = 失敗形態①）。

### ⚠️ 「換一個角落」為什麼不是解 —— 780×360 上量到的

| 角落 | 觸控下用掉 | 可用 |
|---|---:|---|
| top-left | **350** | 360（#759 的預算是 350，含徽章帶） ⇒ 滿 |
| top-right | **300** | 而 `recall` 上緣在 y 64 ⇒ **真正空著只有 54px** |
| bottom-left | registry 只用 66 | ⛔ 但畫面上被 top-left 的 350 從上面吃光 |
| bottom-right | — | ⭐ **就是叢集本身** |

⇒ ⭐ 票文的「收起／縮小才是可行解」是對的。

### 開關（第一守則／常設指令「留後台開關」）

`goldLevelTouchLayout: "strip" | "column"`，**預設 = `strip`**（優先權大的更新預設啟動）。

| 住處 | 狀態 |
|---|---|
| 值（`hudLayout.GOLD_LEVEL_TOUCH_H`＋`GOLD_LEVEL_TOUCH_LAYOUT_DEFAULT`） | ✅ ⭐ 一個住處，`GoldLevel.tsx` 讀同一個 |
| 欄位表（`HUD_CLUSTER_FIELDS`）＋ 轉發（`applyHudClusterOverride`） | ✅ |
| `content/config/hud-layout.json` ＋ Zod ＋ admin | ⛔ **今天不存在**（`hudBottomCluster.ts` WIRING STATUS 記了很久的既有缺口），且在本 lane 柵欄外 |

⇒ 今天翻它是 `applyHudClusterOverride({ goldLevelTouchLayout: "column" })`，⛔ 還不是後台一格。

### 守衛與突變

- `CLUSTER_RESIDUAL` **刪掉三列**（帳本「只能變短」檢查就是驗收器）
- 新增（`hudBottomCluster.test.ts`）：
  1. ⭐ **兩個方向都量** —— 條狀零重疊 **且** 翻回 `column` 時尺**必須量得到**那個已知的
     88×86（⛔ 單邊校準的尺會在它最需要說話的時候沉默）
  2. **畫的裝得進 30px**（`flex-direction:row` ＋ 頭像邊長 ＋ 內距 = 保留高度，⛔ 兩邊都不抄字面值）
  3. **失敗形態⑧**：`applyHudClusterOverride` 真的把形狀轉發到 `hudSlotRect`
- ⭐ `roundReportLayout.test.ts` **翻邊了，而那是好事**：375×667 直立機上回合報告卡
  在此之前**畫不出來**，空出 86px 之後放得下了；⛔ 而「藏起來」那條逃生路仍是活的
  —— 用出貨可回頭的那一格（`column`）當場重現它 ⇒ 那條分支⛔ 不是死碼。

**突變（2026-08-30）**：`GOLD_LEVEL_TOUCH_H.strip` 30 → 116 ⇒ **3 條紅**，逐字指名
`新的重疊 844x390/gold-level×attack = 88×86`（852×393 · 780×360 同）。改回來即綠。

## 2. #800 —— ⭐ 量到它的 AC 已經滿了，殘量在**算術地板**上 ⇒ ⛔ 沒有動它

### 殘量的算術（重新驗過）

右欄可用高度是**推導**的：`recall` 上緣 = `attackCenter(84) + arcRadius(122) +
RECALL_LIFT(46) + RECALL_SIZE(44) = 296` ⇒ 780×360 上右欄空著的是 **y 10..64 = 54px**，
而那一疊有 **300px** ⇒ 放得下**一個** 44px 控制項，那裡有六個。

- 與攻擊鈕的水平交集 = `min(w − 30, 88)`，30 = `attackCenter(84) − attackSize/2(44) − HUD_EDGE(10)`
  ⇒ ⭐ **任何寬過 30px 的右對齊 slot 只要夠深就一定壓到攻擊鈕**，而 44 是 HIG 下限 ⇒ ⛔ 縮不下去
- `leave` ↔ `settings` 對調：780×360 上 1,776 px² > 現在 1,416 px² ⇒ **更差**
- ⇒ 上一輪那次窮舉 6! = 720 種排法的結論**仍然成立**

### ⚠️ 順帶量到的（⛔ 沒開新票，寫進 #800 留言）

**`cheats` 那 3 列（4,500 px²，殘量的 31%）在正式站上是「幻影」**：
`ui/cheats.ts` 的 `cheatButtonVisible()` 要求 `classifyEnvTier(hostname) === "loopback"`
⇒ **ggd.adms.ai 上那顆鈕根本不畫**。⛔ 但它的 **52px 保留是靜態的**，於是 `leave` 與
`settings` 在**每一台**手機上都被往下推到技能弧上，⭐ 為一個看不見的東西讓位。

模擬（⛔ 沒落地）把它移出觸控右欄：

| | 列數 | 總面積 | **落在攻擊鈕上** |
|---|---:|---:|---:|
| 今天 | 15 | 14,594 px² | **2,438 px²** |
| 移出 `cheats` | 12 | 10,155 px² | **224 px²（−91%）** |

⛔ **落不了地而不動核心模型**：registry 沒有「這塊 chrome 在觸控下不存在」這個詞彙；
搬去 bottom-left 會**跨角落**撞上 top-left 那一疊，而**沒有守衛看得到跨角落**
⇒ 那是把碰撞偷渡過閘。正解是一格 `touchAbsent` ＋ `CheatConsole` 觸控下不畫 ＋ 一格
rollback 開關 —— 一次改到核心版面模型的動作，⛔ 不塞進同一個 pass。

## 3. 跑過的閘

| 指令 | 結果 |
|---|---|
| `npx vitest run apps/client/src/ui/hud/touchControlsCollision.test.ts hudBottomCluster.test.ts`（基線 ＋ 收尾） | 綠 |
| `npx vitest run --dir apps/client` | **670/671 檔綠** —— 唯一紅的是 `render/vfx/generateFamilyContent.test.ts`（GH#427/#835 的內容漂移，⛔ 與本 lane 無關：它零 import `ui/`） |
| `pnpm typecheck` | **EXIT=0** |
| 突變（`GOLD_LEVEL_TOUCH_H.strip` 30→116） | 3 條紅並指名，改回即綠 |

## 4. 誠實的殘量

- ⛔ **沒有真手機的像素證據** ⇒ 用詞只到「鏈路已接上」。
- 三住處只落了 client 那一個（另外兩個檔在柵欄外，而且 `config.hud-layout@1` 今天不存在）。
- **最小 HUD 縮放檔位**上 `attackCenter` 被 `HUD_STAMP_BAND+44` 夾到 32 ⇒ 那個檔位任何
  bottom-right 槽位都會重疊。既有條件（`touchMetrics` 的 `anchorFloor`），⛔ 不是這次造成的；
  帳本跑在出貨預設「中」檔位。
- #800 的 15 列殘量原封不動（⭐ 它是 owner 看得到的取捨，價目表在上面第 2 節）。
