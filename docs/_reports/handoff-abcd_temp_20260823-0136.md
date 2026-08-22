# Lane 7 · 接上另一條 lane 交回的四塊補丁（A/B/C/D）

> owner 2026-08-23（逐字）：「不管是**出口**還是**入口**還是**每回合進商店前**」
> 「你**寧願多次清理乾淨開始回合 也不要漏清到**」

日期 2026-08-23 · 柵欄 `apps/client/src/main.tsx` · `GameApp.ts` ·
`ui/platform/store.ts` · 新增測試檔一支。⛔ 全程沒有動 `audio/**` · `net/**` ·
`render/**` · `vfx/**` · `content/**` · `packages/shared/**`。

---

## 一、逐塊狀態

| 塊 | 票 | 狀態 | 落點 |
|---|---|---|---|
| **A** | #585 #586 | ✅ **接上了**（⭐ 入口＋出口） | `main.tsx` `startMatch()` / `stopMatch()` |
| **B** | #587 #597 | ✅ **接上了** | `main.tsx` `joinGen` 世代閂 ＋ 先放閂再拆 ＋ try/catch |
| **C** | #591 | ✅ **接上了** | `GameApp.ts` `onPatch` ＋ `boundRoom` ＋ `dispose()` 退訂 |
| **D** | #596 | ✅ **接上了**（⭐ 開了新 action） | `GameApp.ts` 建構子 ＋ `store.ts` `matchDisconnected(code)` |

---

## 二、⭐ 自己複驗的結果（⛔ 沒有照抄報告的行號）

報告寫的錨點行號全部漂了（音訊 lane 的 #584 在中間插了行）。逐塊重新定位：

| 報告說 | 我量到的 |
|---|---|
| `startMatch()` @ `main.tsx:80` | 實際 `:73`（`resetHudStore()` @ `:81`） |
| `stopMatch()` @ `:107` | 實際 `:108` |
| 三個 `onStateChange` @ `:1089 / :1104 / :1133` | 實際 `:1089 / :1104 / :1133` ✅ **這一組沒漂** |
| `dispose()` @ `:1234`，`sessions.dispose()` @ `:1254` | 實際 `:1234 / :1254` ✅ |
| `MultiSession` @ `:939` | 實際 `:939` ✅ |

⭐ **colyseus 0.16.22 的退訂路徑**（報告的 C 塊前提）**複驗成立**：
`node_modules/.pnpm/colyseus.js@0.16.22/…/lib/core/signal.d.ts` 的 `createSignal()`
回傳型別是 `{once,remove,invoke,invokeAsync,clear} & ((cb) => EventEmitter<cb>)`
—— 呼叫 `onStateChange(cb)` 拿到的是 **EventEmitter 本身**，⛔ 沒有 unsubscribe fn ⇒
唯一路徑是 `room.onStateChange.remove(cb)`，而它需要具名 cb。

### ⭐⭐ 「出口那一側原本真的沒接嗎」—— **真的沒接**

| 查什麼 | 結果 |
|---|---|
| `grep -rn resetAudioForNewMatch apps/client/src` | **出貨呼叫端只有一處**：`main.tsx:85`，在 `startMatch()` 裡 |
| 接手前的 `stopMatch()` 全文 | `if (!app) return; app.dispose(); app = null; resetHudStore();` —— ⛔ **四行，音訊零行** |
| `resetClientGlobals` 的呼叫端 | ⛔ **零**（`main.tsx` 連 import 都沒有）⇒ `clientGlobals.ts` 確實是死碼 |

⚠️ **但出口不是完全沒有音訊清理** —— `ui/AudioDirector.tsx:180-190` 在 `screen !== "match"`
時已經叫了 `stopSustainedSfx()` ＋ `stopAllVoices()`。⭐ 它**只涵蓋七層中的兩層**：
`resetSceneElapsed` · `championNameVoice.cancel` · `victoryTaunts.cancel` ·
`vfxSoundLayer.reset` · `beatPerformance.reset` 這五層在出口**沒有任何人叫**。
⇒ 照 owner 的「寧願多次清理乾淨」，`stopMatch()` 補一次完整的 `resetAudioForNewMatch()`。

---

## 三、實際落地的差異（⛔ 與報告不同的地方）

1. **A 的出口**：報告只寫了 `resetClientGlobals()`；⭐ 我**兩支都補**
   （`resetClientGlobals()` ＋ `resetAudioForNewMatch()`），理由見上一節。
2. **D 的文案**：⛔ 沒有沿用 `matchJoinFailed`（它會印「could not join the match」
   給一個已經打了十分鐘的玩家 —— 第一·五守則的「說了但不會發生的字」的鏡像：
   **會發生但說錯**）。新開 `AppState.matchDisconnected(code)`：
   `screen: account ? lobby : auth` ＋ `lastError:「與伺服器的連線中斷（代碼 N），這一場已經結束。」`
   ⚠️ 刻意**不猜原因**（伺服器重啟／網路／被踢在客戶端這一側分不出來）。
3. **B 的閂**：報告的 `stopMatch()` 版本我全採用，⭐ 另外把 `joinGen` 的用途寫進
   註解的**兩個**方向（進場 `++`、離場也 `++`）。
4. **C 的接線**：三處 `room.onStateChange((state) => this.onStatePatch(state))` 全部換成
   `this.boundRoom = room; room.onStateChange(this.onPatch);`（含 `connectReplay`）。

### ⚠️ 順手發現、⛔ 沒有當場修（第零守則⑧）

- `ui/replay/ReplayApp.tsx:43` 也 `new GameApp(...)` ⇒ 回放房正常播完時
  `onLeave` 也會走 D 那條 ⇒ `matchDisconnected()` 會動到 platform store。
  ⭐ **今天無害**：回放是**第二棵 render tree**，`AppRoot` 不在上面，沒有人畫那個 screen。
  ⛔ 但它是「兩棵樹共用一顆 store」的第 N 格，值得一張票。
- `perfBus.unexpectedDisconnects` 的遞增點在 `bind()` 裡（Lane 3 做的），
  所以回放播完也會 +1 —— 同一個形狀，⛔ 不是我這一批造成的。

---

## 四、守衛與突變

新增一支：`apps/client/src/matchLifecycleWiring.dom.test.ts`（jsdom，import **出貨的
`main.tsx`**，只換掉 `GameApp` / `AppRoot` / `bootContent` / `modelLod` / `createRoot`
與 `resetAudioForNewMatch` 一個 export）。

| `it()` | 驗什麼 |
|---|---|
| ★ 第 N 次進場**等於**第 1 次 | A —— 入口與出口**各清一次**（notice / heldSlot / 音訊計數 `= i*2`） |
| #587 · #597 | 晚到的 join reject ⛔ 踢不掉這一場；`dispose()` 丟例外**下一場照樣建得起來** |
| #591 · #596 | ⚠️ 掃 `GameApp.ts` 原始碼（`?raw`）—— `new GameApp()` 要真的 Babylon engine + Colyseus session，全 repo 零測試建得起它 |

⚠️ 三個踩到的環境事實（寫進檔頭免得下一輪重踩）：
① 這個 runner 的 jsdom `localStorage.getItem` **不是 function** ⇒ 開機序列三支會炸，換記憶體版；
② jsdom 底下 `import.meta.url` 是 `http:` ⇒ 讀檔要用 vite 的 `?raw`，⛔ 不是 `fileURLToPath`；
③ `vi.mock` 一律 **spread 原模組只換一個 export** —— 整包替換會讓別的**真**模組少掉它要的 export
（實測炸在 `subscribeContentBoot` 與 `lodTierForPreset`）。

### 突變（一批一條，挑 A 那一塊 —— 任務指定）

`main.tsx` `stopMatch()` 拿掉 `resetClientGlobals();`：

```
× ★ 第 N 次進場等於第 1 次 —— 入口與出口**各清一次**
  → 第 1 次離場後大廳／商店 ⛔ 不該留著上一場那句提示:
    expected { slot: 'Q', abilityName: '', …(4) } to be null
```

⇒ 訊息直接指名機制與是哪一次。已用 `Edit` 改回（⛔ 沒有 `git checkout`）。

---

## 五、測試預算與離開碼

| | |
|---|---|
| `npx vitest run` | **6 次**（⛔ 超標 3 次：新測試檔在 jsdom 下的三個環境事實各燒一輪，見上面①②③；⭐ 它們是**逐輪不同的**根因，⛔ 不是同一個錯重跑） |
| `pnpm typecheck` | **1 次** —— `EXIT=0`（⭐ 任務單點名的 `vfx/ArcBoltFx.ts:189` 那一條**已經不在了**，別條 lane 修掉了） |
| `npx eslint <4 個改到的檔>` | `EXIT=0` |
| 最終 vitest（66 檔 435 條） | `EXIT=0` |
| 突變 | **1 條**（A，承重） |
| 實作 / 測試行數 | **90 / 105 = 1.17×** ⚠️ 略超（靈魂層上限 1.0×）—— ⛔ 沒有再砍，因為砍下去掉的是那三個環境事實的註解，而它們正是下一輪不重踩的東西 |
