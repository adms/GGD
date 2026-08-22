# 伺服器房間生命週期 —— #588 · #595 · #593（Lane 4）

> owner 2026-08-23（逐字，⭐ 這是裁決）：
> 「**限制一名玩家同時最多只能在一個房間，如果有玩家馬上 kill AI**」

---

## ⛔⛔ 交接給主 session 的**一件事**

**`content/config/config.match.json` 動過了（多一格 `match.disposeEmptyChampSelect: true`），
而這條 lane ⛔ 不准跑 `pnpm content:build`（全域鎖）。**

⇒ 目前 `packages/shared/src/content/bundle.test.ts`（3 條）與
`shippedBundleIsCurrent.test.ts`（4 條）是**紅的**，而且**只有這 7 條**。
逐字驗過失敗原因：`config` collection 的 hash `65666a45bd8f → 10d78589da2a`，
`count` 仍是 84（我加的是**欄位**不是**文件**）⇒ 純粹是打包產物過期。

```bash
pnpm content:build && git add content/    # ← 主 session 統一跑那一次
```

⭐ 因為只加欄位、⛔ 沒加文件，所以**不需要**動 `apps/admin/src/store.ts` /
`ui/App.tsx`（`configDocCoverage.test.ts` 只在**新增 config 文件**時要求那兩行）。
實測那兩個檔一個字都沒碰，`apps/admin` 全套綠。

---

## 逐張票

### 🔴 #588 —— 一個帳號只能在一間房（P0，三項全部落地）

| 項 | 落在哪 | 做了什麼 |
|---|---|---|
| ① 一人一房 | **新** `apps/game-server/src/rooms/accountRooms.ts`（90 行）＋ `MatchRoom.onJoin` / `evictAccount()` | 製程內的 `accountId → 房` 登記表。`onJoin` 先 `claim()`（回傳被頂掉的舊房）再 `evictAccount()`：舊房**同步**收掉座位、reject 還開著的重連窗口、沒有真人剩下就 `disconnect()` |
| ② ⛔ 不讓 AI 接管 | `MatchRoom.releaseSeat()`（取代 `onLeave` 裡的 `seat.setDriver(new AIDriver())`） | 座位留著原本那顆 `HumanDriver`，郵箱清空 ⇒ 每 tick 空 intent ⇒ 站著不動。⛔ 不換 driver 是刻意的：`driverKind` 是名冊與 bot 商店折扣（`botShop.priceMult`）讀的那一格，把一個離線的人翻成 `"ai"` 會讓他回來時中間那幾回合被當成 bot 結算 |
| ③ 選角結束沒真人 → 收房 | `MatchRoom.loop()` + `champSelectLeftEmpty()` + **新** `rooms/emptyRoomPolicy.ts` | 後台一格布林 `match.disposeEmptyChampSelect`，出貨 **true**（owner 明說的那一邊） |

**`AIDriver` 的 import 整個從 `MatchRoom.ts` 移除了**（全檔零引用），檔頭那句
「Disconnect: swap seat driver to AI immediately」也一併改掉 —— 第三守則：
一句過期的檔頭比沒有檔頭更貴。

#### ⚠️ ③ 的三個條件缺一不可

```ts
if (this.humanDrivers.size > 0 || this.seatBySession.size > 0) return false;
if (this.clients.length > 0) return false;
return Object.keys(this.reservedSeats).length === 0;
```

最後一條是**保留席位**。`onCreate` 的 `setSeatReservationTime(120)` 存在的理由
就是「客戶端要先下載 2.8MB 資產才連得上遊戲 socket」，而 PvP 的選角只有 20 秒 ——
少了那一行，一個網路慢的玩家會在**自己還在讀取畫面時**被伺服器把房間收掉。
逐個生產情境走過一遍，⛔ 找不到偽陽性：

| 情境 | 結果 |
|---|---|
| 兩個人都連著 | `clients.length > 0` → 不收 |
| 非自願斷線（60 秒重連窗口） | `allowReconnection` 重新保留席位 → `reservedSeats` 非空 → 不收 ⭐ 窗口活下來 |
| 自願離開（按了「離開」） | 保留席位刪除 + 沒有連線 → **收**（正確） |
| 從來沒有人 join，保留席位 120 秒到期 | Colyseus 自己的 `autoDispose` 早在 ~121 秒就收掉了，我這一格是多餘的第二道 |

#### ⚠️ 誠實的但書：**跨製程那一半沒做**

`accountRooms` 是**製程內**的 Map，⛔ 不是 presence / redis。
出貨現況是單 shard ⇒ 它就是全部；多 shard 時它只擋得住同製程的那一半。
跨製程要走 `matchMaker.remoteRoomCall`，那需要 redis presence 真的接起來 ——
⛔ 我沒有做，理由寫在 `accountRooms.ts` 的檔頭，⭐ 而它仍然嚴格優於今天的
「伺服器對這件事完全沒有意見」。

#### ⭐ 量到的「房間數曲線」

`accountSingleRoom.test.ts` 的承重那一條：同一個 `accountId` 連換 6 間房，
每一輪讀出貨登記表 `roomRegistry.active`（⛔ 不是「presence 裡有那個 key」那種掃屬性）。

| | 曲線 |
|---|---|
| **修好之後** | `[1, 1, 1, 1, 1, 1, 1]` |
| **突變（拿掉 `previousRoom.evictAccount(accountId)`）** | `[1, 2, 3, 4, 5, 6, 7]` ← 紅 |

⚠️ 第一版的守衛是**無上限地 await 舊房的 `disconnect` 事件**，突變之後它只會給
「Test timed out in 5000ms」—— ⛔ 那句話不指名任何東西。改成 250ms 上限之後，
壞掉那一側會走到房間數斷言，訊息長成上面那條曲線。**一條會紅的守衛還不夠，
它紅的時候要說出是什麼壞了。**

---

### ⚪ #595 —— `onCreate` 丟例外時名額永遠不歸還（P3）

Colyseus 0.16.24 `MatchMaker.handleCreateRoom` 逐字讀過：
`room.__init()` 在 `onCreate` **之前**跑（那顆 `patchInterval` 就是它建的），
而 `room._events.once("dispose", …)` 掛在 `await room.onCreate()` **成功之後** ⇒
一個丟出去的 onCreate ⇒ `_dispose()` / `onDispose()` 永遠不跑 ⇒
`roomRegistry.release()` 永遠不跑，**而且**那顆 broadcast timer 永遠不 `clearInterval`
（整個 Room 含 `MatchController` + `SimWorld` 被釘在 heap 上）。

**修法**：`onCreate` 在 `tryAcquire()` 之後只剩三行 —— `try { await this.buildMatch(…) }
catch { await this.releaseRoomResources(); throw }`。
⭐ 收尾邏輯與 `onDispose` **共用同一支** `releaseRoomResources()`，
⛔ 不複製貼上兩份（其中一份只在例外時走，沒有人會發現它腐爛）。
順手收掉的：`accountRooms.releaseAll(this)`、`patchRate = null`、
`ctl` 還沒被指派時的 `undefined`（那正是這條路唯一會走到的狀態）。

守衛 `matchRoomCreateFailure.test.ts`：真的 `room.__init()` + 出貨 `onCreate`，
在 `MatchStatsRecorder.open`（`buildMatch` 無條件的 await 站點）注入例外，
**連跑 6 次**，斷言 `roomRegistry.active` 每一次都回到起點 → `[0,0,0,0,0,0]`。
第二條斷言是**行為**：等 150ms（patchRate ≈ 33ms ⇒ 約 4 個週期），
斷言 6 間房的 `broadcastPatch` **一次都沒被叫**。

---

### ⚪ #593 —— `projectileSystem` 漏掉 `settledZones`（P3）

`ProjectileSystem.ts` 讀完 `world.transform.get(id)` 之後補上與八支同儕逐字同型的一段：

```ts
if (world.settledZones.has(t.zone)) { toDestroy.push(id); continue; }
```

用 `settledZones` ⛔ 不用 `combatActive`，理由與那八支一樣（分區決鬥會提早結束 #216）。

守衛 `projectileSettledZone.test.ts`（96 行，兩條）：
出貨 `sela.q.bolt` + 出貨 `runEffects` + 出貨 `combatResolveSystem`，
斷言 **hp 的方向**（⛔ 不只 `projectile.size` —— 只驗 size 的話，一個「留著但不判定」
的錯誤實作也會過）。第二條反向釘住「還沒結算的分區照樣打得到」，⛔ 免得閘變成把功能關掉。

| | hp |
|---|---|
| 修好之後（zone 已結算） | 1242 → **1242**（一滴都沒掉），`projectile.size` 0 |
| **突變（刪掉那一段）** | 1242 → **1064.19** ← 紅 |

---

## 三個住處（第一守則）—— `match.disposeEmptyChampSelect`

| # | 住處 | 內容 |
|---|---|---|
| ① | `content/config/config.match.json` | `"disposeEmptyChampSelect": true` |
| ② | `packages/shared/src/content/schema/config/match.ts` | `z.boolean().optional()`，⚠️ **缺席 = true** |
| ③ | `apps/admin/src/matchConfig.ts` | `MATCH_FIELD_INFO`（zh / note / live）+ `MATCH_BOOL_LABELS` + `MATCH_GROUPS.clock` |

⚠️ 缺席為什麼是 **true** 而隔壁三個 `.optional()` 布林是 false：約定是**同一條** ——
「一份這一格出現之前的舊文件（耐久覆蓋層裡真的存得到）應該拿到 owner 現在要的行為」。
它們「owner 要的那一邊」剛好是 false，這一格剛好是 true。

⛔ **`champSelectSecVsBot = 320` 一個字都沒動**（owner 的旋鈕）。
⛔ 這一格**不進 `owner-knobs.json`**：它不影響任何一場有人玩的比賽的數值，
只決定一間**沒有人**的房要不要繼續吃 30Hz 的 CPU —— 不是平衡旋鈕。

---

## 測試預算（第零守則⑦）

```
實作 365 行 / 測試 297 行 = 0.81×
```

| | |
|---|---|
| `npx vitest run` | **3 次**（① 新守衛 ② 一次跑完 `apps/game-server` + `apps/admin` + `packages/shared/src/sim` + `packages/shared/src/content` ③ 突變） |
| `pnpm typecheck` | **1 次**，EXIT=0 |
| 突變 | **2 條**（#588 的驅逐 · #593 的閘）。#595 是 P3 基礎建設，照第零守則③**不做突變** |
| 對抗輪 | ⛔ 0 |

批次結果：**649 個檔 / 5,640 條，7 條紅，全部是上面那個 `content:build` 的產物過期。**

---

## ⚠️ 一個已知的 log 噪音（⛔ 不是缺陷）

`settlementRig.test.ts` / `matchRoomStatsWiring.test.ts` 那幾支**手動驅動 loop 的夾具**
現在會印一行

```
[match …] 收房失敗（房間留著） Error: cannot disconnect during onCreate()
```

因為它們的房間沒有接 matchMaker（`_internalState` 停在 `CREATING`），
而 `disconnect()` 在那個狀態會丟。⭐ `closeRoom()` 把它 catch 住（一個收尾動作
⛔ 不可以變成新的故障），那幾支**全部是綠的**。
⚠️ 但它們是**靠 `_internalState` 剛好是 CREATING 才沒被收房**的 ——
哪天有人給那些夾具補上 `_internalState = 1`，它們會紅，而**原因看起來會像是無關的**。
⇒ 已記在這裡，⛔ 沒有開票（第零守則⑧：排序是 owner 的權力）。
