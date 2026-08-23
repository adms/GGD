# L1 —— 🖤 商店黑閃爍（2026-08-23）

> owner 逐字（2026-08-23）：
> 「**剛進商店 介面有些部分會黑閃爍 選完隨機三選一又回復正常**」

⚠️ 標級照 `lag-hunt_temp_20260823-1549.md` 的規矩：
⭐**M**＝真的跑出數字 · **C**＝逐行讀出貨程式碼確認的結構事實 · ⚠️**I**＝推的。
⛔ 我**沒有**瀏覽器、⛔ 不能連正式站 ⇒ **本報告沒有任何一條「逐幀 profile」等級的證據**。

柵欄：`render/intermission/**` · `render/safeRenderLoop.ts` · `ui/panels/*shop*`。
⚠️ 主 session 給的三條路徑有兩條**不存在**（`render/IntermissionScene.ts`、`ui/shop/**`）——
真正的檔在 `render/intermission/IntermissionScene.ts` 與 `ui/panels/MerchantShop.tsx`。

---

## 0. 先說結論

| | |
|---|---|
| **根因** | ⛔ **沒有量到單一兇手。** 但我把「黑」這件事拆成了兩個**分開的**問題，而且第二個是**確定的** |
| **① 為什麼那一幀沒畫** | 至少 5 條路（context 遷移 / resize 清空 / `safeRenderLoop` 接住的那一幀 / 主執行緒塞住 raster 來不及 / fps 上限吞掉 resize 後的第一幀）。⚠️**I** |
| **② 為什麼「沒畫」長得像「黑」** | ⭐**C，這一條是確定的**：`<canvas>` **沒有 CSS 背景** ⇒ 沒呈現＝透明＝透出去＝黑。⛔ 五條路長得**一模一樣** |
| **這一輪做的** | 修 ②（讓「沒畫」看起來是市集的天空）＋ 關掉 ① 裡兩條會產生黑的路 ＋ 讓 context 掉落**變成量得到的**，⛔ 不再靠猜 |

---

## 1. ⭐ 最重要的發現：**「黑」與「沒畫」是兩件事，而在此之前它們無法分辨**（**C**）

`ui/IntermissionStage.tsx:236` 的 `<canvas>` 只有

```
position:absolute; inset:0; width:100%; height:100%; display:block; outline:none
```

—— ⛔ **沒有 `background`**。而 WebGL canvas 在「這一幀沒有呈現」時是**透明**的
⇒ 透出去就是頁面底色／底下那張已經被停畫的競技場 canvas ＝ **黑**。

⭐ 這解釋了為什麼前一輪（`shop-flicker-blue-rings_temp_20260823-1607.md`）排除了六條假設
卻收斂不了：**六條路的症狀在畫面上逐位元相同**。
⇒ 先把「症狀」與「原因」拆開，才有可能一次一條地關。

---

## 2. 沿著 owner 那半句話追：「選完三選一又回復正常」那一刻發生了什麼（**C**）

⭐ **`offers` 在 render 層有 0 個消費端**（`grep -rn "offers" apps/client/src`）——
⛔ 沒有任何一條路徑讓「三選一還在」影響到那兩顆 Engine。
⇒ 那一刻唯一改變的是 **`AugmentDraftPanel` 整棵子樹卸載**。它掛著的時候獨有：

1. 一片**滿版** scrim（`rgba(6,9,16,0.62)`，`opacity` keyframe ⇒ 被提升成合成層），直接壓在中場 canvas 上
2. 三張 `.ggd-btn--card` —— 而 `.ggd-btn` 每一顆都跑 **3 條無窮動畫**，其中兩條（`box-shadow` 的
   `ggd-btn-bloom`、`background-position` 的 `ggd-btn-glow` ＋ `mask-composite:exclude` ＋ `filter:blur`）
   ⛔ **不是合成器動畫，是每幀主執行緒重繪**
3. ⭐⭐ **一個每快照重繪的訂閱**（下面第 3 節）

⇒ ⚠️**I**：在 `lag-hunt` 已經量到的主執行緒飽和（≥8 條 rAF loop、每幀 3 次強制回流、
30 Hz React 風暴）之上，再疊一個滿版合成層 + 每快照重繪 ⇒ tile 來不及 raster ⇒
Chrome 呈現**未 raster 的 tile ＝ 黑**，而且是**「有些部分」**（tile 是分塊的）。
⛔ 我**沒有**量到這一步，所以它留在 I 級。

---

## 3. 🐛 順手量到的真缺陷（⛔ **沒有修 —— 它在柵欄外**，請主 session 開票）

**`AugmentDraftPanel.tsx:78-81` 是全 client 唯一一個訂閱「每快照都是新陣列」的消費端。**

```ts
const offers = useHud((s) => s.seats.find((v) => v.seatId === s.localSeatId)?.offers ?? null);
```

`net/RoomStore.ts:911` `offers: ss.offers.map(...)` ⇒ **每次 seats 被 patch 就是一個新陣列**，
而 `seats` 的快取鍵是 `JSON.stringify(seats)`（`:917`），裡面含 **`cooldowns` / `mana` /
`statusRemainTicks`** ⇒ ⭐ **中場期間每一個快照都變** ⇒ zustand 預設 `Object.is` ⇒
**整棵三選一子樹以快照率（~30 Hz）重繪，從卡片出現一直到玩家選完為止。**

⭐ **而這個 repo 自己已經知道這個陷阱，而且防了兩次**：

| 檔:行 | 逐字 |
|---|---|
| `ui/IntermissionStage.tsx:67` | 「a scalar count, **never the offers array**, so a fresh-array-per-snapshot cannot re-render the whole market 30× a second」 |
| `ui/IntermissionStage.tsx:83` | 「JSON key rather than the array itself: `seat.items` is a fresh array every snapshot」 |
| `ui/panels/PrepClock.tsx:57` | 訂閱 `.length > 0`（純量）✅ |

⇒ ⛔ **三個鄰居全防了，只有真正畫卡片的那一個沒防。**
修法就是隔壁那個 `ownedKey` 的形狀：訂閱 `offerIds.join("|")`，再用 `useMemo` 取陣列。
⚠️ **它的開／關時機與 owner 描述的症狀逐字吻合**（卡片在＝重繪風暴在；選完＝卸載＝停）。

---

## 4. 這一輪改了什麼（全部在柵欄內，⭐ 三格都是**一行**回頭）

`apps/client/src/render/intermission/IntermissionScene.ts` 新增 `export const INTERMISSION_GPU`：

| 格 | 出貨前 | ⭐ 我挑的 | 治哪一條路 | 一鍵回頭 |
|---|---|---|---|---|
| `canvasBackfill` | （不存在） | **true** | ⭐ **②**：canvas 的 CSS 背景 = `ATMOSPHERE.clearColor`（`#141733`，**算**出來的，⛔ 不抄字面值）⇒ 沒呈現的那一幀是市集天空，⛔ 不是黑 | `false` |
| `lowPowerGpu` | `powerPreference:"low-power"` | **false** | ①：中場是全站唯一一次「兩顆 context 指名**不同** GPU」（競技場 `Renderer.ts:35` 用預設值）⇒ 雙 GPU macOS 上可能為此遷移 context | `true` |
| `restoreContextLoss` | `doNotHandleContextLost:true` | **true** | ①：在此之前 context 一掉 Babylon **不救** ⇒ 那張 canvas **永遠**黑 | `false` |

另外兩處（同一個檔）：

- **`onResize` 之後強制下一幀畫**：`engine.resize()` 會重新配置 backbuffer（＝空的），
  而 fps 上限（`13.67 ms`）有可能吞掉緊接著那一幀 ⇒ 呈現一張清空過的畫面。
  `this.lastRenderMs = 0` 讓它一定畫得出去。（**C**）
- ⭐ **`webglcontextlost` / `webglcontextrestored` 現在會記進 `perfBus.renderLoopErrors`**
  ＋ console.error。那一格非零時 `ui/PerfOverlay.tsx` 的健康度徽章會亮，**⛔ 不受
  `showPerfOverlay` 那個預設關掉的開關管**。
  ⇒ ⭐ **這是「嫌疑犯 🅰 到底是不是真的」下一次可以被量到、而不是再猜第三輪的那條線。**
  （第二守則：fail-open 沒錯，**靜默**才是缺陷。）

⚠️ **`canvasBackfill` 只治症狀，而那正是它的用途**：它讓「黑閃」這個**外觀**消失，
而那條 log 讓**原因**仍然說得出來。⛔ 兩者缺一都不行。

### ⛔ 為什麼是常數而不是 `content/config/*.json`

新增一份 config **一定**會動到 `apps/admin/src/store.ts` 與 `ui/App.tsx` 各一行
（`configDocCoverage.test.ts` 要求），而 CLAUDE.md 逐字稱它們是「**已知唯一真正共用的檔**」
⇒ 併行 lane 必撞。任務說明本身允許「**或至少是一個能一鍵回頭的常數**」，所以走這條。
⭐ 三格都在**同一個 `export const`**，各帶一行「回頭設成什麼」。

---

## 5. 🧪 測試與離開碼

| 指令 | EXIT |
|---|---:|
| `npx vitest run .../intermissionCanvasBackfill.test.ts` | **0**（2/2） |
| `npx vitest run .../IntermissionScene.test.ts .../safeRenderLoop.test.ts` | **0**（16/16，既有的一條都沒紅） |
| `npx tsc --noEmit -p apps/client/tsconfig.json` | **0** |

新守衛 `intermissionCanvasBackfill.test.ts`：**71 行**（體驗層上限 80）。
⭐ **突變驗過（一批一條，挑最承重的）**：註解掉建構子的 `this.paintCanvasBackfill()`
→ `expected undefined to be '#141733'` 紅 → 用 `Edit` 改回（⛔ 不是 `git checkout`）。

⛔ 沒跑 `content:build` / `skills:sync` / `spec:build`（全域鎖）。⛔ 沒有開對抗輪。
⛔ 新增參數是**純常數**，沒有進 config ⇒ 不需要三個住處（見 §4 的理由）。

---

## 6. ➡️ 給主 session 的兩件事

1. ⭐ **開票**：§3 的 `AugmentDraftPanel` 每快照重繪 —— 它是唯一一個開／關時機與 owner
   描述**逐字吻合**的東西，而且修法（`offerIds.join("|")` + `useMemo`）在隔壁檔已經有現成前例。
   ⛔ 我沒改：`ui/panels/AugmentDraftPanel.tsx` 在我的柵欄外。
2. ⭐ **下一次 owner 回報時請他看一眼 fps 藥丸旁的 ⚠️ 徽章**（或 console 的
   `[render:intermission] WebGL context lost`）—— 有 ⇒ 嫌疑犯 🅰 成立、`lowPowerGpu:false`
   這一格就是解；沒有 ⇒ 剩下的是主執行緒 raster 那條（§2 + `lag-hunt` R1–R6），
   而 §3 那張票就是它的第一刀。
