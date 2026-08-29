# GH#816 —— view-gated 集合的**第三個洞**：伺服器端根本沒給 view

> 2026-08-30 · lane #816 · commit 見文末
> ⚠️ 暫存報告（`_temp_` 命名，超過 7 天由 `scripts/temp-sweep.sh` 搬進 legacy）

---

## 0. 先回答票上的問題：「已修」是真的嗎？

⭐ **是真的，而且比票文寫的更完整。** 逐條驗過：

| 票上的 AC | 今天的狀態 | 出處 |
|---|---|---|
| `schema.ts` 檔頭寫出「空的 view 也不會被送」 | ✅ 已寫（`schema.ts:1000-1024`，含「為什麼只在解碼側看得到」） | `503379cae` |
| 一條閘：`apps/client` 直讀 view-gated 集合 = 0 | ✅ `apps/client/src/net/viewGatedReads.test.ts`（掃出貨原始碼現況） | `503379cae` |
| `GGD_SNAPSHOT_ZONE_CULL` 在部署環境轉得到 | ✅ `docker/compose.yaml:177` 已列出；閘 `apps/game-server/src/config/emptyEnvIsUnset.test.ts` | 已在 HEAD |

⇒ ⛔ **不重做**。`4d5a5417` + `503379cae` 兩個 commit 已經把票文列的三條 AC 做完。
⚠️ 但票上**沒有進度標記**（`ticket-progress.sh read 816` = 🆕），所以這一輪先量了基線才動手。

---

## 1. ⭐ 而 #816 的閘**組合起來仍然是空的**（失敗形態⑪）

出貨的兩條閘各自都對，⛔ 但它們中間的接縫沒有人站：

| 閘 | 證明了什麼 | ⛔ 管不到 |
|---|---|---|
| `packages/shared/src/protocol/viewGatedDelivery.test.ts` | 真的 `Encoder`→`Reflection`→`decode`：**空的 view** ⇒ 那一格是 `undefined` | ⛔ 不看房間 |
| `apps/client/src/net/viewGatedEntities.test.ts` | 客戶端讀到缺席時活得下來（`entitiesOf()`） | ⛔ 它的 state 是 `delete state.entities` **自己造的** |

⇒ 兩條都在問「**view 是空的**會怎樣」。
⭐ **沒有人問「view 根本不存在會怎樣」** —— 而那是同一族裡**更嚴重**的一種。

`apps/game-server/src/net/zoneView.ts:36` 逐字寫著：

> `SchemaSerializer.applyPatches` 對 `client.view == null` 的客戶端送的是**共用的**
> `encoder.encode(it)` —— 它只走 `root.changes`。⇒ ⛔ **沒有 view 的客戶端一個實體都收不到**。

⇒ #816 那次至少只壞在 champSelect（實體生出來之後就恢復）；
⭐ **沒有 view 是永久的 —— 整場一個實體都不會出現。**

---

## 2. 🔬 量到的基線（⛔ 不是推理）

把 `apps/game-server/src/rooms/MatchRoom.ts:1095` 的 `this.zoneViews.onJoin(client);`
**整行拿掉**，跑 `apps/game-server/src/{rooms,net}/`：

```
Test Files  44 passed (44)
Tests      216 passed (216)
```

⇒ ⭐ **一個會讓每一位玩家整場看不到任何實體的回歸，216 條測試全綠。**

在此之前這件事只由**三處散文**守著：

| 檔 | 那句話 |
|---|---|
| `packages/shared/src/protocol/schema.ts` | 「所以每一間用 `MatchState` 的房都必須指派 view。今天有兩間」 |
| `apps/game-server/src/net/zoneView.ts` | 「⚠️ 為什麼**每一個** client 都一定要有 view」 |
| `apps/game-server/src/rooms/ReplayRoom.ts` | 「它**不是**可有可無」 |

⛔ **而散文不會變紅**（第三守則）。⚠️ 五個既有測試（`roomHardening` / `accountSingleRoom` /
`matchRoomSeatName` / `roomCombatLifetime` / `eventBatchWire`）**真的呼叫** `MatchRoom.onJoin`
—— 它們的 fake client 連 `view` 這個欄位都沒有。

---

## 3. ⚠️ 順序也算在內 —— 兩間房把同一行放在**相反**的位置

| 房 | 位置 | 風險 |
|---|---|---|
| `ReplayRoom.onJoin` | **第一行**（refusal 的 early-return 之前） | ✅ 安全 |
| `MatchRoom.onJoin` | **最後一行**，前面有 ~50 行座位解析 | ⚠️ 之後任何一個**不呼叫 `client.leave()` 的 early return** 都會送出一個沒有 view 的連線 |

⚠️ 今天 `MatchRoom.onJoin` 的兩條 early return 都有 `client.leave()`（＝拒收，不需要 view），
所以**現在是對的**。⛔ 但那是「現在剛好對」，不是一個被守住的性質 —— 與 #816 票文說的
「它們沒有一起爆掉純粹是因為外圈剛好都有 `entityId > 0` 的 if，那是**巧合，⛔ 不是保證**」同一個形狀。

---

## 4. ⭐ 這一輪加的閘

`apps/game-server/src/rooms/viewAssignedOnJoin.test.ts` —— 三條，**兩個方向都走**：

| # | 問什麼 | ⛔ 不是問 |
|---|---|---|
| ① | `MatchRoom.onJoin` 走完（且沒被踢掉）的連線，`client.view` 是不是一份真的 `StateView` | ⛔ 不是「原始碼裡有沒有 `zoneViews.onJoin` 這串字」（失敗形態⑥） |
| ② | `ReplayRoom` 連**被拒**（refusal early-return）那條路也先給了 view —— ⭐ 驗的是**順序** | ⛔ 不是「有沒有呼叫過」 |
| ③ | ⭐ **反方向**：從出貨原始碼掃出真的 `extends Room<MatchState>` 的類別，比對①②涵蓋的名單 | ⛔ 不是一份手抄的名單（失敗形態⑫：只從「宣告」那一頭走，會漏掉「有實體而無宣告」的） |

⭐ **兩個前置條件都寫成斷言**（⛔ 不是註解）：
- ①② 動手前先斷言 `client.view === undefined` —— 否則量到的是夾具，⛔ 不是房間做的事（單邊的尺）。
- ③ 先斷言掃到的類別數 `> 0` —— regex 失效時它會變成一個永遠綠的空斷言（失敗形態⑨）。

### 突變驗證（三條各自獨立，⛔ 不是一條）

| 突變 | 結果 |
|---|---|
| **A** 拿掉 `MatchRoom.onJoin` 的 `this.zoneViews.onJoin(client)` | ① 紅，指名 MatchRoom |
| **B** 把 `ReplayRoom` 的那一行**移到** refusal early-return 之後 | ② 紅，指名「refusal 之前沒有給 view」 |
| **C** 新增一個 `export class MutationThirdRoom extends Room<MatchState> {}` | ③ 紅，diff 逐字印出 `+ "MutationThirdRoom"` |

⇒ **3/3 紅**，三份訊息各自指著對的東西。全部用 `Edit` 還原，
`git diff` 對兩支出貨檔是**空的**（逐位元組回到 HEAD），臨時檔已刪。

---

## 5. ⚠️ 順手量到、⛔ 沒有當場修的一件事（第七條：⛔ 不開新票）

「哪幾間房用 `MatchState`」這份名單今天有**三個住處**，而只有一個是推導的：

| 住處 | 形狀 |
|---|---|
| `apps/game-server/src/rooms/viewAssignedOnJoin.test.ts`（本輪） | ⭐ **從原始碼推導** ＋ 比對已驗收名單 ⇒ 多一間會紅 |
| `apps/game-server/src/net/eventFanout.test.ts:298` | ⛔ 手抄 `["rooms/MatchRoom.ts", "rooms/ReplayRoom.ts"]` |
| `apps/game-server/src/rooms/seatReservation.test.ts:37` | ⛔ 手抄 `["MatchRoom.ts", "ReplayRoom.ts"]` |

⇒ 後兩者在**多一間房**的時候會**靜默地少驗一間**（⛔ 不會紅）。
⛔ 沒有當場改：`net/` 在本 lane 柵欄外，而 `seatReservation` 驗的是另一件事
（座位保留時間），把它接到本輪的推導上會讓兩條不相干的閘互相耦合。
⇒ ⭐ 已寫進 #816 的留言，⛔ 沒有開新票。

---

## 6. 沒有開關的理由

⭐ **這一條沒有取捨，所以沒有後台開關。** 本輪**零行出貨程式碼改動** ——
只新增一個 `.test.ts`。沒有預設值被挑、沒有行為被改，
⇒ 「留一格可以一鍵回頭的開關」在這裡沒有對象（要回頭就是刪掉這個檔）。

⚠️ 而它守著的那一格開關 `GGD_SNAPSHOT_ZONE_CULL=0` 本來就在（`docker/compose.yaml:177`）。

---

## 7. 用詞紀律

⭐ 本輪**沒有玩家看得到的改動** —— ⛔ 不宣稱「已修」任何玩家可見的東西。
可以宣稱的只有：**一條會紅的閘接上了，突變 3/3 驗過**。
#816 票文主張的三條 AC 經逐條複驗**在 HEAD 上成立**（出處見 §0）。
