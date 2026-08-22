# Lane 3 · 客戶端房間生命週期八張票（#585 #586 #587 #590 #591 #592 #596 #597）

> owner 2026-08-23（逐字）：「**每次進到房間應該是乾淨的開始**才對」
> 「所以離開 到 進練習模式 也是有問題 沒清理乾淨 因為這都是**獨立該檢查清乾淨的地方**
>  不管是**出口**還是**入口**還是**每回合進商店前**」
> 「你**寧願多次清理乾淨開始回合 也不要漏清到**」

日期 2026-08-23 · 柵欄 `apps/client/src/net/**` · `ui/castFeedback.ts` · `ui/abilityHold.ts` ·
`perfBus.ts` · 新增測試檔。⛔ 全程沒有動 `GameApp.ts` / `main.tsx`（Lane 1 佔用，
實測開工時兩個檔都已經有 Lane 1 的未提交改動）。

---

## 一、逐票狀態

| 票 | 級 | 狀態 | 落點 |
|---|---|---|---|
| **#590** | P1 | ✅ **修了** | `net/RoomConnection.ts` `acceptEvent()` 第一行 ＋ `MSG.REJECT` handler |
| **#592** | P2 | ✅ **修了**（⭐ 本批承重，突變驗過） | `net/RoomConnection.ts` `disposers` ＋ `leave()` 的迴圈 |
| **#596** | P3 | 🟡 **修了一半** | ⭐ 計數器那一半**已落地**在 `bind()` 的 `onLeave` 裡；「回大廳」那一半要 `GameApp.ts` → 見 §二·D |
| **#585** | P0 | 🟡 **零件做好，接線交回** | 新檔 `apps/client/src/clientGlobals.ts`（⛔ **未接線 = 目前是死碼**）→ 見 §二·A |
| **#586** | P0 | 🟡 **零件做好，接線交回** | 同上（同一支 `resetClientGlobals()`） |
| **#587** | P0 | ⛔ **交回主 session** | 全部在 `main.tsx` → 見 §二·B |
| **#597** | P3 | ⛔ **交回主 session** | 全部在 `main.tsx` → 見 §二·B（與 #587 同一塊，合併成一份補丁） |
| **#591** | P1 | ⛔ **交回主 session** | 全部在 `GameApp.ts` → 見 §二·C |

⚠️ ⛔ **一張票都沒有退掉** —— 八張的診斷我逐張複核過，四段（量到的／既有守衛為什麼綠／
修法／守衛）全部成立，⛔ 沒有 #563 那種「票的前提是錯的」。

---

## 二、⛔ 交回主 session 的逐字補丁（照抄即可）

### A · #585 + #586 —— `main.tsx` 兩處各一行（⭐ 這是 P0，⛔ 少了它 `clientGlobals.ts` 是死碼）

零件已經在工作樹裡：`apps/client/src/clientGlobals.ts` 匯出 `resetClientGlobals()`，
它做三件事 —— `resetCastFeedback()` · `cancelHoverGuide()` · `setHeldAbility(null)`。
守衛 `apps/client/src/clientGlobalsBoundary.test.ts` 已綠。

```diff
--- a/apps/client/src/main.tsx
+++ b/apps/client/src/main.tsx
@@
 import { resetHudStore } from "./net/RoomStore";
+import { resetClientGlobals } from "./clientGlobals";
 import { resetAudioForNewMatch } from "./audio";
@@ function startMatch(): void {
   resetHudStore();
+  // GH#585 / GH#586 —— 上一間房的「魔力不足」提示與**按住的技能格**都住在模組層,
+  // 而 HUD 在 screen!=="match" 時整棵 unmount ⇒ ⛔ 沒有任何人清它們。
+  resetClientGlobals();
   resetAudioForNewMatch();
@@ function stopMatch(): void {
   resetHudStore();
+  resetClientGlobals(); // 出口也清一次(owner:「寧願多次清理乾淨 也不要漏清到」)
 }
```

⚠️ Lane 1（GH#584 音訊）已經在 `startMatch()` 加了 `resetAudioForNewMatch()`，
⭐ **但只加在入口、⛔ 沒有加在出口**。這一份補丁刻意兩邊都加。

⭐ **接線之後這一條會變真**：`clientGlobalsBoundary.test.ts` 目前驗的是
`resetClientGlobals()` 本身的行為（可以驗），⛔ 但它驗不到「有沒有人呼叫它」。
建議主 session 接線的同一個 commit 順手在那支測試補一條**掃 `main.tsx` 原始碼**的
接線閘（`expect(MAIN_SRC).toContain("resetClientGlobals()")`）—— ⛔ 這條 lane 不能
先寫，因為它現在就是紅的，會擋住其他併行 lane。

### B · #587 + #597 —— `main.tsx` 的世代閂（同一塊，⭐ 兩張票共用同一顆計數器）

```diff
--- a/apps/client/src/main.tsx
+++ b/apps/client/src/main.tsx
@@
 let app: GameApp | null = null;
+/**
+ * ⭐ GH#587 —— **這是第幾次進場**。⛔ 不是統計:`join.catch` 的閉包會晚到,
+ * 而 `matchJoinFailed()` 是**無條件**把 screen 打回 lobby/auth 的。
+ * 序列:進 A(join 未落地) → 離開 → 進練習模式 B → **A 的 join 才 reject**
+ * → B 被踢回大廳,而且連鎖:screen 離開 match ⇒ 下面的 subscribe 把剛建好的 B
+ * 也 `stopMatch()` 掉。玩家看到的是「剛點進練習模式,畫面自己彈回大廳」。
+ */
+let joinGen = 0;
 
 function startMatch(): void {
@@
   app.start();
+  const gen = ++joinGen;
   const join = platform ? app.connectPlatform(...) : app.connect();
   join.catch((err) => {
+    if (gen !== joinGen) return; // ⭐ 上一場的失敗 ⛔ 不可以踢掉這一場
     console.error("[client] failed to join match:", err);
     const message = err instanceof Error ? err.message : "connection failed";
     appStore.getState().matchJoinFailed(message);
   });
 }
 
 function stopMatch(): void {
-  if (!app) return;
-  app.dispose();
-  app = null;
-  resetHudStore();
+  const a = app;
+  if (!a) return;
+  // ⭐ GH#597 —— **先放閂再拆**。`dispose()` 第一行就是 `if (this.disposed) return`,
+  // 所以半拆的那一顆再也拆不完,而 `app` 永遠不是 null ⇒ `startMatch()` 的
+  // `if (!match || app) return;` 從此永遠 early-return ⇒ 這個分頁只有 F5 能救。
+  app = null;
+  joinGen++; // GH#587:離開也讓上一場的 join.catch 失效
+  try {
+    a.dispose();
+  } catch (err) {
+    console.error("[client] GameApp.dispose() 失敗 —— 這一場沒有拆乾淨", err);
+  }
+  resetHudStore();
+  resetClientGlobals(); // §A
 }
```

⭐ 守衛（#587 ④ + #597 ④ 合併成**一支**）：`apps/client/src/entryLateJoinFailure.dom.test.ts`
—— import 出貨的 `main.tsx`，只 mock `GameApp` / `AppRoot` / `bootContent`。
⚠️ 出貨的 vitest `include` 是 `src/**/*.test.ts`（`.tsx` **不收**），`.dom.test.ts` 收得到；
環境是 `node`，要在檔頭加 `// @vitest-environment jsdom`。
突變點：拿掉 `if (gen !== joinGen) return;` → 紅；拿掉 try/catch → 第二次進場建了 0 個 → 紅。

### C · #591 —— `GameApp.ts` 的 `onStateChange` 退訂

⭐ 已查證：colyseus.js 0.16.22 的 `onStateChange(cb)` 回傳的是 **EventEmitter 本身**
（`core/signal.js::createSignal`），⛔ 不是 unsubscribe fn ⇒ 唯一的退訂路徑是
`room.onStateChange.remove(cb)`，而那需要一個**具名**的 cb（三個註冊點今天全是 inline arrow）。

```diff
--- a/apps/client/src/GameApp.ts
+++ b/apps/client/src/GameApp.ts
@@ class GameApp
   private disposed = false;
+  /** ⭐ GH#591 —— 具名,才 remove 得掉(inline arrow ⛔ 沒有留下參照)。 */
+  private readonly onPatch = (s: MatchState): void => this.onStatePatch(s);
+  /** 掛著 `onPatch` 的那間房 —— `dispose()` 要跟它退訂。 */
+  private boundRoom: Room<MatchState> | null = null;
@@ connect() / connectPlatform() / connectReplay()   ← 三處都一樣(:1089 / :1104 / :1133)
-    room.onStateChange((state) => this.onStatePatch(state));
+    this.boundRoom = room;
+    room.onStateChange(this.onPatch);
     this.onStatePatch(room.state);
@@ dispose()   ← :1234,放在 `this.sessions.dispose();`(:1254)**前面**
+    // ⭐ GH#591 —— 訂閱不退,那個閉包就把已 dispose 的 GameApp(含 Babylon scene)
+    //    釘在 heap 上。GH#570 已經讓寫端無害(`onStatePatch` 第一行的 disposed 閘),
+    //    ⛔ 但無害的訂閱仍然是一份不會被回收的參照。
+    this.boundRoom?.onStateChange.remove(this.onPatch);
+    this.boundRoom = null;
```

守衛（薄，⛔ 不開對抗輪）：`dispose()` 之後斷言那顆 EventEmitter 的 `handlers.length`
回到基準線。⭐ 取得 EventEmitter 的手法可以直接抄
`net/roomLifecycleTeardown.test.ts::leaveHandlers()`（借一次註冊拿到 emitter 再 `remove` 掉）。
突變點：拿掉 `remove(this.onPatch)` → 紅。

### D · #596 的另一半 —— `GameApp.ts` 指派 `onDisconnect`

⭐ **計數器那一半這條 lane 已經做完**（見 §三），所以這裡只剩「回大廳」那條路。
`MultiSession.connections` 是 public，所以一行就夠：

```diff
--- a/apps/client/src/GameApp.ts
+++ b/apps/client/src/GameApp.ts
@@ :939  this.sessions = new MultiSession(accountIds);
+    // ⭐ GH#596 —— 非預期斷線在此之前**沒有一條回大廳的出路**(全 repo 零指派點)。
+    //    ⚠️ `RoomConnection.leave()` 會把它清成 null,所以自己走的那條 ⛔ 不會進來。
+    for (const c of this.sessions.connections) {
+      c.onDisconnect = (code) => appStore.getState().matchJoinFailed(`disconnected (${code})`);
+    }
```

⚠️ `matchJoinFailed` 的文案是「could not join the match: …」，用在斷線上讀起來怪。
⭐ 這是**決策點**（第一守則）⇒ 建議在 `ui/platform/store.ts` 開一支 `matchDisconnected(code)`
（`screen: lobby|auth` + 一句像樣的 `lastError`），⛔ 不要沿用 join 的文案。
⛔ 那個檔不在這條 lane 的柵欄內，所以我沒有動它。

---

## 三、這條 lane 真的落地的東西

### #592 —— `bind()` 的 5 個 handler，`leave()` 逐一拆掉

`apps/client/src/net/RoomConnection.ts`

- 新增 `private readonly disposers: (() => void)[]`
- `bind()` 的 4 個 `onMessage` 全部走 `this.keepDisposer(room.onMessage(...))`
  （colyseus `Room.onMessage()` 直接回傳 nanoevents 的 unbind fn）
- `onLeave` 改成**具名** cb ＋ `this.keepDisposer(() => room.onLeave.remove(onLeave))`
  （⭐ `onLeave` 回傳 EventEmitter，⛔ 沒有 unbind fn）
- `leave()`：`for (const off of this.disposers) off(); this.disposers.length = 0;`

⚠️ `keepDisposer()` 的 `typeof off === "function"` 那一層是給**測試替身**用的（repo 裡的
FakeRoom 多半回 undefined）—— ⛔ 少了它既有的 `eventBatchClient.test.ts` 會在 `leave()` 裡爆。

### #590 —— 在途封包

`acceptEvent()` 第一行 `if (this.room === null) return;`（⭐ 一行同時關掉 `MSG.EVENT`
與 `MSG.EVENT_BATCH` 兩個入口），`MSG.REJECT` handler 同樣一行。
⚠️ 它與 #592 **不重複**：#592 拆掉「之後才到的」，這一行擋的是「handler 拆掉的那一瞬間
**已經排進事件迴圈**」的那一顆 —— 與 `RoomStore.ownerMatchId` 同型的**縱深**那一層。

### #596（一半）—— 非預期斷線要出聲

```ts
const onLeave = (code: number): void => {
  if (this.disposed) return;          // 我自己叫的 leave() ⛔ 不是非預期
  perfBus.unexpectedDisconnects++;
  this.onDisconnect?.(code);
};
```

⭐ **遞增點刻意掛在 `bind()` 裡，⛔ 不是掛在 `onDisconnect` 的指派點上** ——
fail-loud 不可以取決於「有沒有人記得指派」（第二守則）。GH#570 已經把
`perfBus.unexpectedDisconnects` 這一格加好了而**零遞增點**；現在它有了。
`perfBus.ts` 的欄位註解一併改成事實（含「沙發連線一次斷線記 N 筆」這個誠實的量級註記）。

順手：`net/teardown.test.ts:62` 的 `expect(conn.onDisconnect).toBeNull()` 之前
**斷言的其實是「全 repo 沒有人指派 onDisconnect」**（它在守一個缺陷）。
現在 `leave()` 之前先真的指派一個，那條斷言才變成「`leave()` 有把它清掉」。

---

## 四、守衛與突變

新增兩支：

| 檔 | 驗什麼 |
|---|---|
| `apps/client/src/net/roomLifecycleTeardown.test.ts` | ⭐ 用**真的** colyseus `Room` 驅動**出貨的** `bind()` / `leave()`（既有 `teardown.test.ts` 的 `attach()` 直接指派 `conn.room`、**從不呼叫 `bind()`** ⇒ 失敗形態⑤）。三條：#592 逐輪殘留 handler **等於**第 1 輪、#590 在途封包、#596 兩個方向 |
| `apps/client/src/clientGlobalsBoundary.test.ts` | #585 + #586 併在**同一個 `it()`**（體驗層 ≤80 行）：TTL 過了 notice 還在 → reset → null；按住的格子 → reset → null；hover 起手 → **立刻離場** → 等 2× `hoverDelayMs` → 仍然 null |

⭐ 斷言全部是「第 N 輪**等於**第 1 輪」與「等於 0」，⛔ 沒有任何門檻
（門檻會隨出貨 handler 數漂掉）。基準線 `baseline` 是從一顆**沒有 bind 過**的控制房
量出來的，⛔ 不是寫死的 2。

### 突變（一批一條，挑最承重的）

**M1** `RoomConnection.leave()` 的 `for (const off of this.disposers) off();` 拿掉：

```
🔴 第 2 輪的殘留 handler 要等於第 1 輪 …: expected 10 to be 5
```

⇒ 逐輪 **+5**（4 個 `onMessage` + 1 個 `onLeave`），線性成長，訊息直接指名機制。已改回。

---

## 五、測試預算

| | |
|---|---|
| `npx vitest run` | **3 次**（①全部寫完一次 ②突變 ③改回後最終確認 18 檔 105 條全綠） |
| `pnpm typecheck` | **1 次** |
| 突變 | **1 條**（承重的 #592） |
| 實作 / 測試行數 | **184 / 178 = 0.97×** ✅（靈魂層上限 1.0×） |

⚠️ `pnpm typecheck` EXIT=1，**4 個錯全部在別的 lane 正在改的檔**
（`audio/AudioSystem.ts` ×2、`render/roundFxRegistry.test.ts`、`vfx/roundGrowthIsBounded.test.ts`）。
⭐ 我改到的檔**一個錯都沒有**（`grep` 過 log）。

---

## 六、順手發現、⛔ 沒有當場修（第零守則⑧）

1. **`ui/abilityRangeGuide.ts` 的 `hoverSlot` 沒有人清** —— `cancelHoverGuide()` 只殺計時器，
   `hoverSlot` 留著。今天無害（它只在計時器回呼與 `hoverGuideLeave` 裡被讀），
   ⛔ 但它是同一族的第三格。那個檔不在這條 lane 的柵欄內。
2. **`audio/**` 的同族**（`resetRoundEndVoice` / `resetRoundVictoryMemory` /
   `beatPerformance.reset` 這些「寫好了但零出貨呼叫端」）—— ⭐ Lane 1 的 GH#584 正在做，
   工作樹裡已經有 `audio/audioTeardownCoverage.test.ts`。⛔ 我沒有碰。
3. **#585 ④② 的反腐守衛（一張表掃 `apps/client/src` 每一支模組層 `reset*`／`clear*`，
   要嘛在 `resetClientGlobals()` 裡、要嘛在豁免表裡帶理由）尚未做** ——
   它必然會掃到 `audio/**` 與 `main.tsx`，⛔ 兩邊都不在這條 lane 的柵欄內。
   ⭐ 建議在 §二·A 接線之後由主 session 收成一條（形狀抄
   `packages/shared/src/ops/skillsSyncCoversGenerators.test.ts`）。
