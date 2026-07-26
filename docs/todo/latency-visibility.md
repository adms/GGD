# 延遲可見度 (#272) — TODO

> owner 原話（驗收標準，逐字）：
> **「請你顯示玩家 ping 值在跟版本號一樣都一直畫面上」**

計畫書 `docs/_延遲改進計畫.md` 的 **1-1（伺服器 tick 健康度）** 與 **1-4（連線資訊看得懂）**。
這兩條是同一個主題的兩半：**現在沒有人看得見延遲**——玩家看不見自己的 ping，
我們也看不見伺服器有沒有在丟 tick。

## A · ping 常駐上畫面

**機制完全複製版本徽章，一個新東西都沒發明**：`<body>` portal（逃出 `#hud-root` 的 z-index 10
stacking context）＋ `pointer-events:none`（在任何 z 都吞不掉點擊，這才是「蓋在所有東西上還安全」
的真正依據）＋ 侷限在畫面下緣 `HUD_STAMP_BAND = 10px` 的保留帶。徽章占中央 280px，
**晶片占同一條帶子的左端**。

| 位置 | 改動 |
| --- | --- |
| `apps/client/src/ui/PingChip.tsx`（新） | 元件本體：body portal、`bottom:0 / left:0`、ref 直寫 DOM、250ms 取樣 |
| `apps/client/src/ui/pingReadout.ts`（新） | 純函式：六個誠實狀態、標籤階梯、寬度估算 |
| `apps/client/src/ui/hud/hudLayout.ts` | `HUD_PING_BAND_W`／`hudPingChipBoxPx`／`hudPingBandRect`（宣告成一條可被守衛檢查的帶） |
| `apps/client/src/ui/GlobalChrome.tsx` | `<PingChip />` —— 兩棵 render tree（含 replay 頁）都有 |
| `apps/client/src/net/ConnectionStats.ts` | `ConnectionReport`（pingSamples / pingAgeMs / snapshots）＋ `OFFLINE_SNAPSHOT_GAP_MS` ＋ `reset()` |
| `apps/client/src/perfBus.ts` | `pingSamples` / `pingAgeMs` / `netSnapshots` / `netMode` |
| `apps/client/src/GameApp.ts` | samplePerf 發布上面四個欄位；`connectReplay` 標記 replay；dispose 全部歸零 |

### 為什麼不是「就印一個數字」——六個狀態

`perfBus.pingMs` **單獨拿出來印是會說謊的**：開場到第一次 ack 之間它是 0，
而且在三種日常情況下會**無聲凍結**——玩家站著不動（`IntentSender.update()` 沒有 pending order
就不送封包 → seq 不前進 → ack 不前進）、玩家死亡或實體離場（`GameApp` 的 `if (seat && es)` 直接
不呼叫 `noteAck`）、以及 replay 頁（有快照但沒有人送 input，ack 在結構上不可能存在）。

| 狀態 | 顯示（寬） | 顏色 | 何時 |
| --- | --- | --- | --- |
| `live` | `順暢 42 ms · 抖動 6 ms` | 綠/黃/紅 | 正常 |
| `stale` | `停滯 42 ms（8.3s 前）` | 灰 | 最後一筆 RTT 超過 3s |
| `unmeasured` | `量測中 — ms` | 灰 | 連上了但還沒有一次往返 |
| `lost` | `斷線 4.2s 無封包` | 紅 | 快照流斷了（gap > 2000ms） |
| `replay` | `重播 · 無 RTT` | 灰 | replay 頁 |
| `hidden` | （不畫） | — | 沒有任何快照（登入/大廳），或玩家關掉 `Show ping` |

**單機對 bot 的更正**：沒有「無伺服器」路徑。`RoomConnection.connectDev` 離線時仍然真的
`client.create("match")`（owner 已裁定 bot 也要伺服器權威），所以 bot 局有**真實** RTT，
只是本機 1–3ms。那是誠實的數字，直接顯示。真正的假數字從來不是 bot 局，是第一次 ack 之前的 0。

**顏色不是唯一資訊**：每個狀態都帶一個中文詞（順暢/普通/延遲/停滯/斷線/量測中）。
最窄的視窗（375px 只剩 47.5px）會先丟掉詞、改帶 ASCII 記號（`~` 普通 / `!` 延遲 / `?` 停滯），
**數字是階梯的最後一階，永遠不會先被丟掉**。

**不重繪 HUD**：`ref` 直寫 `textContent` / `style.color`，一個 250ms interval，**零 React state**
（`FpsPill` 已經無條件跑一個 4Hz `setState`，再開一個就是每秒 8 次）。

## B · 伺服器 tick 健康度

`#46` 的 clamp 把「凍結」換成了「無聲的變慢」，而 `plan.dropped` 唯一的出口是一行
`console.warn`——**沒有節流**（30Hz 房間持續落後可以每秒吐 60 行）、沒有計數、沒有端點。

| 位置 | 改動 |
| --- | --- |
| `apps/game-server/src/match/tickHealth.ts`（新） | process 級聚合器：shed 次數/丟掉的 tick 數/最近一次；每 tick 耗時 p50/p95/p99（512 筆 ring buffer，零配置）；log 節流（前 5 次，之後每 300 次） |
| `apps/game-server/src/match/tickLoop.ts` | `TickPlan.droppedTicks`（**只觀測**，steps/accumulator 一位元都沒改） |
| `apps/game-server/src/rooms/MatchRoom.ts` | `tickHealth.noteShed(...)` + `performance.now()` 夾住 `this.ctl.tick()` + 節流過的 `formatShedLog` |
| `apps/game-server/src/index.ts` | `/healthz` 多一個 `sim` 區塊，與 `rooms` / `platform` 平行 |

**為什麼要 p50/p99 而不只是 shed 次數**：`MatchRoom` 用 `TICK_MS/2`（16.7ms）驅動迴圈，
累積器要欠到 ~200ms 才會 shed 一次。**每 tick 都超一點但永遠不到 clamp** 的房間
（例如每 tick 40ms 對 33.3ms 預算＝永遠落後 20%）**shed 次數是 0**，只有耗時分布看得見它。
這正是計畫書判定「乙」最可能的真實形狀。

**一條指令的日誌**：
```
docker logs ggd-game 2>&1 | grep ggd.tick.shed
[ggd.tick.shed] match=m-42 shedTicks=24 shedEvents=1 totalShedTicks=24 behindMs=800 \
  tickP50Ms=12.5 tickP99Ms=41.2 tickMaxMs=63.8 window=512 — sim fell behind real-time; …
```
（#46 的那句話留在行尾，所以計畫書裡既有的 `grep sim fell behind real-time` 指令照樣有效。）

## 順手修掉的三個真 bug

1. **`Show ping` 是死開關**：它只 gate `PerfOverlay` 裡一列，而整個 overlay 在
   `showPerfOverlay=false`（**預設**）時 `return null`。現在晶片吃它，開關第一次真的有作用。
2. **真斷線永遠不會變 `offline`**：`quality()` 只在「從未收過快照」時回 offline。
   加上 `OFFLINE_SNAPSHOT_GAP_MS = 2000`（60 個漏掉的快照）。
3. **shed 的 `console.warn` 沒有節流**：現在由計數器決定要不要印（照抄同檔 `onLoopFault` 的形狀）。

## 守衛用的原始碼掃描，本身是壞的（找到並修好）

`GameApp.batch1Wiring.test.ts` 用兩段式剝註解（先剝 block 再剝 line）。
`GameApp.ts:489` 是 `// render/** may not read it …` —— 那個 `/**` 被第一段當成 block 註解開頭，
**一路吃掉後面 231 行真程式碼**，其中包含 `this.connStats.noteSent(...)`。
本任務的守衛第一次跑就撞上它。修法：`packages/shared/testkit/stripComments.ts`，
單次左到右的交替比對（誰先開誰算），三個守衛都改用它。

## 沒修、有記錄的一個真缺陷

`enemy-team` 這個 slot 在**觸控 + 780×360**（#151 breakpoint）下 y 290–356，
**侵入下緣保留帶 6px**。版本徽章的守衛看不到它，因為徽章帶是**置中**的（x 250–530），
而這個 slot 在 x 10–160。ping 帶在左端，所以是第一個撞上它的東西。
沒有從 `hudLayout` 偷偷把 `touchHeight` 66 改成 60 —— 那會讓守衛變綠而元件照樣畫 66px，
把「看得見的 6px 重疊」換成「登記表在說謊」。列在下表 `pc-09`。

## 驗收表

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| pc-01 | 晶片在**每一棵 render tree**（含 `#replay=`）上，且從 `GlobalChrome` 掛載而非逐棵手掛 | ping-chip-everywhere | integration | done |
| pc-02 | 六個誠實狀態：開場不印 0 ms、凍結標成停滯、斷線與慢分得開、replay 不假裝量得到、無串流就不畫 | ping-honest-states | unit | done |
| pc-03 | 顏色永遠不是唯一資訊；標籤階梯先丟詞後丟單位，**數字是最後一階** | ping-chip-label | unit | done |
| pc-04 | 晶片盒子受限於保留帶（content-box / height=10 / overflow hidden / pointer-events none），CSS 寬度上限＝純函式算出來的同一個數 | ping-chip-box | unit | done |
| pc-05 | ping 帶與版本徽章帶在 8 個守衛視窗下**永不重疊**，且 375px 下真的只有 47.5px（實測值寫進斷言） | ping-chip-band | unit | done |
| pc-06 | **接線**：`noteSent`/`noteAck`/`noteSnapshot` 有生產呼叫者；`perfBus.*` 六行都在；replay 標記與 dispose 歸零都在；`textContent` 真的被寫 | ping-chip-wiring | regression | done |
| pc-07 | `ConnectionStats` 帶 provenance（樣本數／樣本年齡／快照數）且 `reset()` 真的忘掉一切 | ping-provenance | unit | done |
| pc-08 | 「慢」與「斷」分得開：gap > 2000ms → `offline`，且恢復後不鎖死 | conn-offline-vs-slow | unit | done |
| pc-09 | `enemy-team` 觸控 780×360 侵入下緣保留帶 6px（**#107 既有缺陷**，本任務只登記＋界定上限，未修） | ping-band-gutter | regression | in-progress |
| th-01 | shed 事件數／丟掉的 tick 數／最近一次時戳分開計，且 `droppedTicks` 與 `%` 丟掉的完全一致 | tick-health-counters | unit | done |
| th-02 | 每 tick 耗時 p50/p95/p99 抓得到「永遠稍慢但從不 clamp」；壞時鐘不污染分布；max 是全期 | tick-health-percentiles | unit | done |
| th-03 | 日誌節流（前 5 次＋每 300 次）但**計數器一次都不漏**；格式固定可 grep 且保留 #46 原句 | tick-health-log | unit | done |
| th-04 | **接線**：`MatchRoom.loop` 真的餵 `noteShed(matchId, plan.droppedTicks, …)` 與夾住 `ctl.tick()` 的 `noteTick`；clamp 行為一位元未改 | tick-health-wiring | regression | done |
| th-05 | `/healthz` 真的輸出 `sim: tickHealth.snapshot()`，與 `rooms`／`platform` 平行 | tick-health-healthz | integration | done |
