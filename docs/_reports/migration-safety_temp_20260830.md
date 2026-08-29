# 搬遷安全：#857 備份完整性 ＋ #860 Redis 停機前快照

> 2026-08-30 · HEAD `8ea49fff9` · lane 柵欄：`scripts/` · `docker/` · `packages/shared/src/ops/*.test.ts`
> ⛔ 全程沒有碰正式站，沒有停過任何 Redis。所有驗證在 localhost 或 `--dry-run`。

---

## 0. 基線（⭐ 動手之前量到的，⛔ 不是票文轉述）

兩張票的進度標記都是 `🆕 沒有進度標記`。

```
$ ls -1 data/ | wc -l                      → 13 個目錄
$ grep -rn "redis-snapshot" scripts/       → 呼叫端只有 host-deploy / host-migrate / site-export
$ grep -c "redis" packages/shared/src/ops/hostDeployScript.test.ts   → 0
```

⇒ 一句話：**兩張票主張的「現況」今天都還成立，而且各自比票文寫的多一個洞。**

---

## 1. #857 —— 備份少了東西，而它長得跟完整的一樣

### 1.1 量到的：`site-export.sh` 的清單 vs `data/` 的實體

| 目錄 | 大小 | 在清單裡？ |
|---|---:|---|
| accounts · matches · walletmeta · friends · journal · admin-audit · curation · review-verdicts | — | ✓ CARRY |
| blizzard-overlay | 91M | ✓ CRITICAL_BULK |
| replays | 256M | ✓ BULK |
| **match-stats** | **14M** | ⛔ **不在任何清單裡** |
| **icon-src-original** | **16M** | ⛔ 不在任何清單裡 |
| **content-backups** | 16K | ⛔ 不在任何清單裡 |

### 1.2 ⭐ 最重要的一個：`match-stats`

**三份出貨的東西都說它該被帶走，而真正用來搬機器的那支腳本沒帶：**

| 出處 | 說什麼 |
|---|---|
| `docs/runbooks/offsite-backup.md:37` | 逐字列為 **❌ 不可再生**（「後台覆盤帳本空白」） |
| `apps/platform/internal/platformarchive/scope.go:318` | ZIP 那條路**刻意**帶 `match-stats/<YYYY>/<MM>`（#207 分析帳本） |
| 實體 | 14 MB 真的躺在 `data/match-stats/` |

⇒ ⭐ **兩條備份路徑對同一份資料給出相反的答案，而沒有任何東西會紅。**

### 1.3 ⭐ 順手量到的第二個矛盾：`journal` 剛好**相反**

| 出處 | 說什麼 |
|---|---|
| `scope.go:161` ExcludedItems | 「結算 WAL：沒有 commit marker 的 intent 會在新主機開機時**重播舊結算**」 |
| runbook `:43` 與 `:93`（兩處） | 同一句話，⚠️ 刻意不帶 |
| `site-export.sh` CARRY | ⛔ **無條件帶走它** |
| `site-import.sh` | 全檔零處理 ⇒ 照樣還原 ⇒ **重複結算** |

⇒ 三比一。已改成**預設不帶**，並留一格開關 `GGD_EXPORT_CARRY_JOURNAL=1`（鑑識用）。

### 1.4 根因（⛔ 不是誰粗心）

`CARRY` 是一張手寫名單，而它的迴圈是「**名單上的每一格，實體在不在？**」
—— ⭐ 只從**宣告**那一頭走。⚠️ 那個形狀**結構上**看不見反方向的缺陷：
**實體在，而名單上沒有它。**（CLAUDE.md 失敗形態⑫）

### 1.5 修法

1. `match-stats` 進 CARRY。
2. 新增 `LEAVE_BEHIND=(名字|理由)` —— **刻意不帶**的每一格都要寫得出一個
   **可以被反駁的**理由（`content-backups` · `icon-src-original` · `redis-snapshots` ·
   `backup-status.json` · `journal`）。⭐ 判準與 `scope.go` 的 `ExcludedItems()` 同一條：
   **「它不在備份裡」永遠不可以和「我忘了」長得一樣。**
3. 腳本裡新增 **§1.2 反方向掃描**：`data/` 底下任何一格不在四張名單裡 ⇒ **die**
   （逃生口 `GGD_EXPORT_ALLOW_UNDECLARED=1`，⭐ 而它會被記進 MANIFEST）。
4. MANIFEST 新增 `left_behind.<名字>=<理由>` 與 `undeclared_at_source=` ——
   ⭐ 讓匯入端分得出「**來源刻意不帶**」與「**路上掉了**」。

---

## 2. #860 —— 保護在，但不在今天走的那條路上

### 2.1 兩個洞，兩個都在綠燈下

| # | 哪裡 | 是什麼 |
|---|---|---|
| ① | **`mini-deploy.sh`** | ⭐ **3 條 `up -d` 路徑，零快照。** GGD 在 2026-08-29 搬到 mini ⇒ 保護留在了**已經不是主力的那個環境**（GCP）裡 |
| ② | **`host-deploy.sh` 回滾路徑** | 回滾段自己有一個 `docker compose up -d`（＝停掉重建 Redis），而快照在它**下面 19 行** ⇒ ⭐ 快照發生在 Redis 已經被重建**之後**，等於沒有 |

⚠️ ②最危險的地方是它**看起來完全正確**：腳本裡有快照、部署那條路的順序也對
⇒ 失敗形態⑪「兩條各自對的路，**接縫**沒有人站著」。
⭐ 而回滾正是事情已經在出錯的那一刻 —— 最需要那份保險的時候。

### 2.2 修法

1. `host-deploy.sh`：快照區塊**移到回滾段之上** ⇒ 兩條路都被涵蓋。
2. `mini-deploy.sh`：新增 `redis_snapshot_before_shutdown()` **一個函式**，
   deploy 與 tunnel 兩條會重建全部服務的路徑各叫它一次。
   ⭐ 寫成函式而不是抄三段 —— 第〇·七守則的「一行接線」病。
   ⭐ 落點預設 `~/ggd-redis-snapshots`（⛔ **不在 `data/` 底下** ——
   那裡的每個目錄都會被 platform 當成 collection 枚舉，而 `scope.go`
   只排除了 `redis`，⛔ 沒有 `redis-snapshots`）。
3. `redis-snapshot.sh` 新增 **`verify` 子指令（還原演練）** ——
   票文自己寫著「我只驗過『備份得出來』，**沒有**驗過『還原得回去』」。
   演練把快照**複製**一份（owner：cp 不是 mv）掛進一個**用完就丟**的 redis，
   真的 load，再問 `DBSIZE` 與 owner 點名的 `lb:*` / `wallet:*`。
   ⭐ 含反方向校準：一個**一定不存在**的前綴必須數到 0，否則整組結論作廢。

---

## 3. 閘（⛔ 這才是「不會再發生」的那一半）

| 檔 | 問什麼 |
|---|---|
| `packages/shared/src/ops/siteExportCarriesEveryDataDir.test.ts` | runbook 說「❌ 不可再生」的每一格有沒有被帶走 · `data/` 每個目錄有沒有被宣告過 · 刻意不帶的有沒有理由 |
| `packages/shared/src/ops/redisSnapshotBeforeShutdown.test.ts` | 每一條**會重建 redis 的路徑**上，快照有沒有跑在它前面 · 還原演練在不在 |

### ⭐ 突變驗證（四條，全部紅，而且**指名**）

| 突變 | 結果 |
|---|---|
| 把 `match-stats` 從 CARRY 拿掉 | 🔴 2 條紅，訊息逐字指名 `match-stats` |
| 把 `icon-src-original` 的理由清空 | 🔴「⛔ 這幾格沒有理由：icon-src-original\|」 |
| 拿掉 mini-deploy 的快照呼叫 | 🔴 `mini-deploy.sh:248 (cmd_deploy) —— ⛔ 這條路上重建容器之前沒有快照` |
| 把 host-deploy 的快照搬回回滾段下面 | 🔴 `host-deploy.sh:258 (top-level) —— ⛔ …` |

### ⛔⛔ 而**寫閘的過程本身抓到三個「假綠燈」**（⭐ 值得記下來）

1. **偵測器把 `up -d --scale caddy=0` 判成「只動 caddy」** ——
   `--scale caddy=0` 是**旗標**，那一行其實會重建每一個服務 ⇒ tunnel 那條路會被靜默放行。
   ⭐ 是「量尺先自證」那一條斷言當場抓到的。
2. **第一次突變沒紅**：守衛比對的是「檔案裡有沒有提到 `redis_snapshot_before_shutdown`」
   —— ⭐ 而**函式定義那一行自己就滿足了條件**（失敗形態⑥）。
3. **修掉②之後突變還是沒紅**：改用行號先後，⚠️ 而 bash 有**函式** ——
   helper 的**函式體**住在檔案第 89 行（很前面）⇒「有一個 :89 的快照呼叫」永遠成立
   ⇒ ⭐ **把三個呼叫點全部刪光，守衛照樣是綠的**。
   ⇒ 最終改成**依函式分組**（同一條路 ＝ 同一個 scope），第三次才真的紅。

⇒ ⭐ **一條沒有做過突變驗證的守衛，這一輪會有 3/4 的機率是瞎的。**

---

## 4. 跑過的閘

| 指令 | 結果 |
|---|---|
| `npx vitest run <兩支新守衛> hostDeployScript.test.ts` | 🟢 21 passed |
| `npx tsc --noEmit -p packages/shared/tsconfig.json` | 🟢 EXIT=0（0 行輸出） |
| `bash -n` × 4 支腳本 | 🟢 |
| `site-export.sh --dry-run`（本機，⛔ 零位元組寫入） | 🟢 含新的 §1.2 |

⚠️ **背景 typecheck 的通知說 exit 0，而 log 裡是 `EXIT=1`** ——
⭐ CLAUDE.md 記載的第②種變形當場重現。⇒ 讀 log，⛔ 不要信通知。

### 測試預算（第零守則⑦自檢）

實作新增 **115** 行（扣註解）· 測試 **146** 行純程式 ＝ **1.27×**。
同類既有守衛 `hostDeployScript.test.ts` 是 198 行純程式。⇒ 在配比之內。

---

## 5. ⛔ 未驗收（⭐ 用詞紀律：鏈路已接上，⛔ 不是「做完」）

| 項 | 為什麼還不算驗收 |
|---|---|
| `redis-snapshot.sh verify` 的**成功路徑** | 這台 Mac 上 **docker daemon 沒有在跑**（`~/.orbstack/run/docker.sock` 不存在）⇒ ⛔ 從來沒有真的起過那個一次性容器。只驗過兩條**錯誤**路徑（沒有快照 / 目錄不存在）都會正確 die |
| `mini-deploy.sh` 的快照呼叫 | ⛔ 沒有對 mini 跑過（那需要 `GGD_MINI_USER` 與一次真的部署）。⭐ 語法、函式解析、閘都綠 |
| `host-deploy.sh` 回滾路徑 | ⛔ 沒有真的跑過回滾（那會動正式站） |

⇒ **下一個人第一件事**：在一台**有 docker 而且有 ggd-redis-1** 的機器上跑
`bash scripts/redis-snapshot.sh && bash scripts/redis-snapshot.sh verify`。
⭐ 那一條跑綠，#860 才從「鏈路已接上」變成「已驗收」。

## 6. ⚠️ 沒有做的（⭐ 誠實列出來）

- **離站落點仍未決定** —— `offsite-backup.sh` 的 `GGD_BACKUP_DEST` 還是空的，
  ⇒ ⭐ **今天仍然沒有任何一份備份離開過這台機器**（#857 留言記載已停 31 天）。
  這一格需要 owner 挑（另一台機器 / 外接碟 / R2），⛔ 不是我能決定的。
- `docs/runbooks/platform-migration.md` 的四項搬遷前手動步驟 —— **文件在我的柵欄外**。
- `docs/守則犯錯.md` 的兩筆（上面 §3 的假綠燈）—— 同上，`scripts/rule-slip.sh`
  會寫 `docs/`，而那是併行 lane 的共用檔。⇒ 交回主 session。
