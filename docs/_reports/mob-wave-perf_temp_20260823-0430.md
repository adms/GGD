# 殭屍波多的關卡卡頓 —— 深度量測報告

> owner 2026-08-23（逐字）：
> 「這次清理完雖然**順很多**，但是到了**殭屍波多的關卡後還是開始卡頓**
>  （**不一定是殭屍波問題**），請你**深度思考分析優化方法**」

⭐ 全部是**量到的**（真的跑 `MatchController` + `SimWorld.step` + `projectSnapshot`
+ Colyseus `Encoder`），⛔ 不是讀程式碼推論。探針在 `/private/tmp/ggd-mobperf/`。

---

## 0. 量測條件（⚠️ 讀數字之前先讀這一節）

| | |
|---|---|
| 機器 | 本機 M 系列 Mac（⚠️ 線上 GCP VM 單核約慢 2–3×，下面所有 ms 請乘上去看） |
| 世界 | 真的 `MatchController`（12 個 bot 座位 · 3v3v3v3）進 combat，2 個 zone |
| 小怪 | 真的 `mobRulesFromConfig(content/config/arena-rules.json 的 mobWaves)`，round 9 |
| 掃描方式 | `maxAlivePerZone` 從 5 掃到 200（× 2 zone），量穩態 400–600 tick |
| tick 預算 | `TICK_HZ = 30` ⇒ **33.3 ms**；`SNAPSHOT_HZ = 30`（每一 tick 都廣播） |
| ⚠️ 污染 | 量測期間另一條 lane 正在改 `MovementSystem.ts` / 新增 `navRoute.ts`，sim 那一欄可能已經漂了 |

**出貨的尖峰**：`mobWaves.schedule` round 9 = `maxAlivePerZone: 50`、`mobsPerWaveCap: 25`，
zone 數固定 **2**（每一張 arena 都是 2 個 zone，royale 是 1）
⇒ **100 隻小怪 + 12 位英雄 ≈ 112 個實體**（再加金幣/花/守衛/復活圈約 130）。

---

## 1. ⭐ 量到的曲線：實體數 → ms/tick

| `maxAlivePerZone` | 實體 | sim P50 | sim P99 | `projectSnapshot` P50 | encode P50 | 快照 B/s | 事件/tick |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 5 | 22 | 0.206 | 1.791 | 0.131 | 0.019 | 20 K | 1.5 |
| 20 | 52 | 0.267 | 1.226 | 0.159 | 0.027 | 41 K | 3.2 |
| **50 ← 出貨尖峰** | **112** | **0.590** | **1.447** | **0.237** | **0.044** | **83 K** | **5.4** |
| 100 | 212 | 1.600 | 2.741 | 0.333 | 0.075 | 155 K | 7.2 |
| 200 | 412 | 4.362 | 5.653 | 0.661 | 0.317 | 300 K | 8.7 |

**曲線形狀**：實體 32→612 是 19×，sim P50 是 **54×** ⇒ 明確的 **O(N²)**
（212→612 是 2.9×，sim 是 6.1× ≈ N^2.0）。
⭐ 但**在出貨的尖峰上，二次項還沒發威**：112 個實體整條伺服器管線是
`0.590 + 0.237 + 0.044 ≈ 0.87 ms / 33.3 ms` ⇒ **一間房只用掉 2.6% 的 tick 預算**。
即使線上慢 3×，也只有 7.8%。

### ⇒ 結論①：**在出貨的上限下，game-server 不是瓶頸**（一間房）

⚠️ **但它會被房數乘掉**：`DEFAULT_MAX_ROOMS = 50`，而 Colyseus 一個 process 是
**單一 event loop**。50 間房同時打 round 9 ⇒ 50 × 0.87 ≈ **43 ms > 33.3 ms**。
⇒ 單人測試看不到，滿載時每一間房都會一起卡。這是「per-room 成本」值得壓的唯一理由。

---

## 2. ⭐ 瓶頸在哪一層 —— 逐層拆解

### 2a. sim（`--cpu-prof`，112 實體，1,500 tick）

| 佔 `SimWorld.step` | 誰 | 備註 |
|---:|---|---|
| **41 %** | `movementSystem` | 其中 **255 ms 是 `spatialHash.queryAABB`** |
| 21 %（self） | `spatialHash.queryAABB` | 每一次呼叫配一個 `Set` + `[...seen]` + `.sort()` |
| 15 % | `orderSystem`（含 `acquireTarget` 11 %） | |
| 14 % | `mobSystem` | |
| 2 % | `rebuildGrid` | |

⭐ **二次項幾乎全部在移動/碰撞的廣域查詢，⛔ 不在殭屍 AI。**
`mobSystem` 的「每隻小怪掃一遍 `world.team`」看起來是 O(N²)，實測**不貴**：
100 隻小怪的候選幾乎全部在第一個比較（`cteam.teamId === myTeam`）就被踢掉，
只有 12 位英雄會走到昂貴的 `isMobTargetable` + 兩次 Map 查詢。

### 2b. 快照（⭐ 這裡抓到一個真的缺陷 —— 見第 3 節）

`projectSnapshot` 每 tick 對每個實體寫 17 個欄位（112 實體 = 1,904 次 setter），
但**真的變的只有 ~437 個**（x/z/fx/fz 各 ~110、hp ~10）。
Colyseus 的 setter 自己會比對，所以線上位元組是對的：
**112 實體的 delta = 2,781 B/tick = 83 KB/s**（一份，廣播給 12 個 socket）。
⇒ ⭐ **頻寬不是問題。**

### 2c. 客戶端

⛔ 這條 lane 的柵欄外（`apps/client/**` 由另外兩條 lane 佔用），沒有量。
⭐ 但**排除法指向它**：伺服器在出貨上限下有 ~35× 餘裕，而畫面上多出來的是
**100 隻蒙皮小怪的 draw call / 骨骼 / 材質**，而且今天已知還有兩個**未修**的每回合洩漏
（#561 `modelTint` 深拷貝貼圖 +72 張/回合、地面貼圖快取無上限 44 個 Texture）——
兩者都是「**回合越後面越慢**」的形狀，正好對上 owner 的描述。

---

## 3. ⭐ 抓到的真缺陷：**出貨的完整快照塞不進 Colyseus 的預設緩衝區**

`@colyseus/schema@3.0.76` 的 `Encoder.BUFFER_SIZE` 預設 = `Buffer.poolSize` = **8,192 B**，
`SchemaSerializer` 用同一個數字配 `fullEncodeBuffer`。而**出貨的完整快照**（`encodeAll`，
也就是 `getFullState()` 在**每一位玩家加入／重連**時走的那一趟）實測：

| 場上實體 | 完整快照 | 每 tick delta |
|---:|---:|---:|
| 62（`maxAlivePerZone: 50` × 1 zone） | **10,053 B** ⛔ 超過 8,192 | 1,379 B |
| 112（出貨尖峰） | **15,062 B** ⛔ | 2,781 B |
| 412（上限調到 200/區） | ≈ 42 KB ⛔ | **9,987 B** ⛔ ← 連 delta 都每 tick 爆 |

**溢位的代價**（讀 `@colyseus/schema/encoder/Encoder.js` 的 resize 分支）：
整趟編碼作廢 → `Buffer.alloc(newSize, oldBuffer)`（歸零 + memcpy）→ **從頭再編一次**
→ 再往 stderr 印一段**五行**的 `console.warn`（Docker 裡是同步寫入）。

⚠️ **為什麼沒有任何守衛紅**：溢位路徑**功能上是正確的** —— 線路上的位元組一個都沒錯，
壞掉的只有「多久」。這正是 CLAUDE.md 第二守則的 fail-open 形狀：
⛔ 沒有東西會紅，只有一行沒有人讀的 warn。

實測（把 `Encoder.BUFFER_SIZE` 從 8 KB 調到 64 KB，同一份世界）：

| 實體 | encode P50（8 KB） | encode P50（64 KB） | 每 tick 溢位次數（8 KB） |
|---:|---:|---:|---:|
| 412 | 0.310 ms | **0.143 ms（−54 %）** | 300 / 300 |

---

## 4. 我挑的優化（owner 2026-08-23：「沒做完以前別問我了自己判斷 但是留後台開關可以簡易 rollback」）

### ✅ 已落地：快照編碼緩衝區由旋鈕決定

| | |
|---|---|
| **檔** | `apps/game-server/src/net/snapshot.ts` |
| **旋鈕** | **`GGD_SNAPSHOT_BUFFER_KB`**（出貨預設 **64**，下界 8＝函式庫原值，上界 1024） |
| **一鍵 rollback** | `GGD_SNAPSHOT_BUFFER_KB=8` + 重啟 shard ⇒ **逐位元回到今天的行為** |
| **為什麼是 64 不是 16** | `maxAlivePerZone` 是**一格後台欄位**；剛好夠今天的 15 KB 會在 owner 把上限調到 200/區的那天無聲退回雙倍編碼 |
| **記憶體代價** | 每間房 2 份緩衝區 × 64 KB ⇒ 50 間房 ≈ **6.4 MB**（線上 128 GB） |
| **決定性** | 零 —— 純傳輸，和 `config/snapshotRate.ts` 同族；sim 一個位元都沒動 |
| **守衛** | `apps/game-server/src/net/snapshotBuffer.test.ts` |

⚠️ **為什麼是環境變數而不是後台欄位**：這一條 lane 明文禁止跑
`pnpm content:build`，而新增／修改 `content/config/*.json` 一定要重建 `bundle.json`
（否則 `shippedBundleIsCurrent` 會紅、線上內容載入會整份失敗）。
`GGD_SNAPSHOT_HZ` / `GGD_MAX_ROOMS` 在同一個目錄已經是這個形狀。
⭐ **要升級成後台欄位的話**：把 `snapshotBufferKb` 加進
`apps/game-server/src/config/serverOps.ts` 的 `SERVER_OPS_KEYS`
（+ `apps/platform/internal/opsenv` 那一半，有 Go drift 測試在守），一次就到位。

### ⛔ 評估後**沒有**做的（附理由，⛔ 不是「還沒排到」）

| 候選 | 為什麼不做 |
|---|---|
| `mobSystem` 索敵改成「只掃英雄」（O(mobs×all) → O(mobs×champs)） | ⭐ **量到它不貴**（見 2a）。而且要做到逐位元相同必須處理「[陣營轉換] 讓一隻小怪中途換隊」「召喚物在迴圈中途加進 `world.team`」兩種失效，風險 > 收益 |
| `spatialHash.queryAABB` 去掉 `Set` + `sort` 的每次配置 | ⭐ **這是最大的單一槓桿（step 的 21 %）**，而且輸出可以逐位元相同 —— ⛔ 但它的唯一大戶是 `MovementSystem`，而那個檔**這條 lane 明文不准動**（另一條 lane 正在改它 + 新增 `navRoute.ts`）。⇒ **留給主 session 派工**，測量數字在上面 |
| 降低小怪的快照更新頻率 / 分區剔除 | 頻寬量出來只有 83 KB/s（不是問題），而分區剔除需要 per-client `@view` 過濾＝一次 schema 協定變更（APPEND-ONLY 風險），CP 值不對 |
| 調 `MAX_CATCHUP_TICKS` | ⭐ **先不要動 —— 現在就查得到有沒有在丟 tick**（見第 5 節），而不是猜 |

---

## 5. ⭐ 下一次 owner 說「卡頓」時，**一句話分辨伺服器還是客戶端**

`tickHealth` 已經接上 `/healthz`（`apps/game-server/src/match/tickHealth.ts`
→ `healthz.ts:81`，`MatchRoom.ts:779` 真的在餵 `noteTick`）。所以：

```bash
curl -s http://127.0.0.1:2567/healthz | python3 -m json.tool | sed -n '/"sim"/,/}/p'
```

| 欄位 | 怎麼讀 |
|---|---|
| `p50Ms` / `p95Ms` / `p99Ms` / `maxMs` | 每一 tick 真的花多久（滾動 512 筆）。**p99 逼近 33 ms ⇒ 伺服器** |
| `shedEvents` / `shedTicks` / `shedBehindMs` | clamp 丟掉了幾個 tick。**> 0 ⇒ 伺服器落後過** |
| 全部很小而玩家說卡 | ⇒ **客戶端**（渲染／貼圖洩漏），與第 2c 節一致 |

⚠️ 我沒有跑這一條 —— 它要打線上，而規則是「⛔ 永遠不要在正式站上測」。
⭐ 但它幾秒就有答案，而且**它才是把這題收斂掉的那一步**：
在此之前所有人（包括我）都只能靠推論猜是哪一層。

---

## 6. 探針（可重跑）

| 檔 | 做什麼 |
|---|---|
| `/private/tmp/ggd-mobperf/bench.ts` | `SimWorld.step` 的 ms/tick vs 實體數（P50/P99/max） |
| `/private/tmp/ggd-mobperf/bench-snap.ts` | sim + `projectSnapshot` + encode + delta bytes + 事件量 |
| `/private/tmp/ggd-mobperf/bench-fields.ts` | 每 tick **真的變**的 `EntityState` 欄位（逐欄） |
| `/private/tmp/ggd-mobperf/probe3.ts` | 完整快照的位元組數 + 溢位次數 |

⚠️ 全部 read-only、in-process，⛔ 沒有起伺服器、⛔ 沒有碰正式站。
⚠️ 量 delta 的時候**一定要呼叫 `encoder.discardChanges()`** —— 少了它變更會累積，
量出來的每 tick 位元組會被高估 **5.4×**（我第一版就踩了，數字整組作廢重量）。
