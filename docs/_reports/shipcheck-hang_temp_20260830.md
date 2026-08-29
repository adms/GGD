# GH#858 —— `ship:check` 併行段卡死 shared/client：⭐ 卡死會遮住真紅

> 2026-08-30 · lane #858 · 完整報告（摘要在回傳值裡）

---

## 0. 一句話

**這不是死結。** 帳本 60 次上架裡 56 次 shared/client 正常跑完 —— 它們只是**長大到超過了一個寫死的 5 分鐘地板**，
被看門狗誤殺；⭐ 而看門狗開火之後 `ship.mjs` **自己卡死了**（殺不到孫行程 ⇒ `close` 事件永遠不來），
**終端上一個字都沒有** ⇒ 人 Ctrl-C 掉它 ⇒ 那一次的紅燈**帳本上什麼都沒留下**。

---

## 1. 基線（⛔ 不是推測，三份獨立證據）

### ① 帳本 `docs/_data/deploy-timings.json`（60 次上架）

| 日期 | `vitest packages/shared` | `vitest apps/client` | ship:total |
|---|---:|---:|---:|
| 08-27 16:13 | 240.8s ✓ | 245.5s ✓ | 397.3s ✓ |
| 08-27 19:47 | 226.9s **code 1** | 231.5s **code 1** | 379.6s |
| 08-28 05:37 | 246.9s **code 1** | 252.2s ✓ | 413.3s |
| 08-28 05:46 | 242.5s **code 1** | 247.6s ✓ | 423.2s |
| 08-28 06:56 | 267.2s **code 1** | 271.5s ✓ | 462.8s |
| 08-28 06:56(b) | 278.2s ✓ | 282.7s ✓ | 463.1s |
| **08-28 11:40** | **332.3s（hung）** | **337.7s（hung）** | 574.8s |
| **08-28 11:51** | **310.7s（hung）** | **315.0s（hung）** | 521.9s |
| **08-28 12:04** | **321.9s（hung）** | **327.1s（hung）** | 553.9s |
| **08-28 12:18** | **341.8s（hung）** | **346.7s（hung）** | 567.2s |

⭐ 讀法（⚠️ 這一欄的分母是「**這一支跑了多久**」，⛔ 不是「它有沒有壞」）：
- 正常區間 **225–283s**，而且**在長大**（08-27 的 226 → 08-28 的 278）。
- 地板是**寫死的 300s** ⇒ 餘裕只剩 **6%**。08-28 中午它被自然成長跨過去，
  於是**連續四次**兩支一起被砍。
- ⭐⭐ **而 05:37 / 05:46 / 06:56 那三次 shared 是 `code 1`** —— 真的有測試在紅。
  被砍之後它**跑不到自己的結論**，那個真紅就變成一句「hung」。
  ⇒ **這就是票文說的「卡死遮住過真紅」，在帳本上是看得到的。**

### ② 現場跑一次（2026-08-30 02:54，`--no-sync`，全 13 支）

```
⚡ 並行段 13 支 · 上限 16 · 每包 5 forks（18 核 ÷ 7 包）
   ✓ vitest apps/test-dashboard 8.2s      ✓ typecheck 56.6s
   ✓ commit-ref-lint 8.6s                 ✓ vitest apps/admin 88.8s
   ✓ visual-proof 11.4s                   ✓ vitest apps/editor 113.4s
   ✓ vitest tools/deploy-timing 11.7s     ✓ go test (platform) 121.8s
   ✓ vitest apps/content-api 19.6s        ✓ vitest apps/game-server 251.2s
   ✗ skills:check 41.5s
   ⟨packages/shared 與 apps/client 從此再也沒有下文⟩
```

`load average` 峰值 **42.21 / 18 核**（我這一條 lane ＋ 其他併行 lane）。

### ③ ⭐⭐ 行程樹 —— **孤兒的直接證據**

看門狗在 300s 開火之後（`ps -Ao pid,ppid,pcpu,etime`）：

```
44966 44964   0.0%  06:29  node tools/parallel-gates/ship.mjs --no-sync   ← 還在等
45266     1  10.0%  06:27  node (vitest)     ← packages/shared，ppid=1
45278     1   0.1%  06:27  node (vitest)     ← apps/client，ppid=1
65207 65143  63.6%  00:04  node (vitest)     ← 它**還在生新的 fork**
```

⭐ **`ppid=1` 就是全部的答案**：直屬子 `npm exec vitest run --root …`
被 `p.kill("SIGKILL")` 殺掉了，而它的兒子 `node (vitest)` 被 init 收養、
**活得好好的、還在繼續生 fork、還在吃 CPU**。

⚠️ **CPU% 是 10–74%，⛔ 不是 0%** ⇒ ⭐ **這不是 CLAUDE.md 記的那種 worker 死結。**
它們是**健康但慢**，而且慢是因為機器 load 42。

---

## 2. 三個缺陷（⛔ 不是一個）

| # | 缺陷 | 證據 | 後果 |
|---|---|---|---|
| **①** | ⭐ **`estMs` 是死參數** —— `run(name,bin,args,estMs=0)` 宣告了它，而**兩個呼叫點都只傳三個引數**（`run(s,"pnpm",[s])` / `run(job.name,job.cmd[0],job.cmd[1])`） | `grep -n "await run(" ship.mjs` | `limit = max(300s, 0×3) = 300s` **永遠**。檔頭寫的「帳本估時×3」**一次都沒發生過** ⇒ 健康的 283s suite 被誤殺 ⇒ **假紅** |
| **②** | ⭐ **`p.kill()` 只殺得到直屬子** —— 樹是 `ship.mjs → npm exec →  node(vitest) → forks`，SIGKILL 只打到 `npm exec` | 上面 ③ 的 `ppid=1`；另加最小重現：SIGKILL 直屬子後 `exit` 有來、**`close` 沒來** | 孫握著 stdout/stderr 的 pipe ⇒ `'close'` 不來 ⇒ Promise 不 resolve ⇒ ⭐ **看門狗開火之後 ship.mjs 靜靜卡死**。帳本那四次記得到，是因為孤兒**剛好自己跑完** ——「300s 開火」與記錄到的 310–347s 之間那 **10–47 秒就是孤兒的指紋** |
| **③** | ⭐ **開火的當下終端一個字都沒有** —— 那句 `⏲️ 看門狗…` 被推進 `out[]`，而 `out[]` **只有 `close` 時**才寫進 log | 現場跑的 `ship.out` 尾巴：最後一行是 `✓ vitest apps/game-server`，⛔ 沒有任何一行說它開火了 | 「卡死」與「還在跑」**長得一模一樣** ⇒ 人 Ctrl-C ⇒ **帳本上什麼都沒有** ⇒ 真紅無聲消失 |

⚠️ 附帶傷害：孤兒**繼續吃 CPU** ⇒ 同儕更慢 ⇒ 更容易也跨過 300s。
⭐ 這解釋了為什麼帳本上 **shared 與 client 每一次都是一起 hung，而且只差 5 秒**。

---

## 3. 為什麼挑 ①（票文的三條路）

| 路 | 判定 |
|---|---|
| **① 逐 suite 看門狗「去驗它為什麼沒生效」** | ⭐ **挑這條。** 它**有生效**（四次開火），但三個地方壞了。⇒ 三個都修 |
| ② 降低併行度 / 把 shared+client 拿出來序列跑 | ⛔ 治症狀。它們是最長的兩支 ⇒ 序列化直接把 wall-clock 加上去（owner 北極星是 3 分鐘出貨）。⭐ **而且它對「卡死看起來像綠燈」一點幫助都沒有** —— 序列跑一樣會卡 |
| ③ 找真正的死結 | ⛔ **沒有死結可找。** 帳本 60 次裡 56 次正常跑完；現場量到孤兒是 10–74% CPU。⭐ 去找一個不存在的死結，是這張票最貴的失敗模式 |

---

## 4. 修法（`tools/parallel-gates/ship.mjs`，三個一起）

| # | 改了什麼 |
|---|---|
| ① | `estimateMs(name)` 從**同一份** `docs/_data/deploy-timings.json` 讀這一支的**中位數**並**真的傳進 `run()`**。地板 5m → **10m**。⚠️ 被砍過的那幾筆名字帶「（hung,…）」⇒ 它們是**另一個 key** ⇒ ⭐ 自動不污染中位數（⛔ 否則上限會每次自己長高） |
| ② | `spawn(..., { detached: true })` ⇒ 子行程自成 **process group**；逾時 `process.kill(-pid, SIGTERM)` → 2s → `SIGKILL`，殺**整棵樹**。⚠️ detached 之後 Ctrl-C 不再自動傳下去 ⇒ 接 `SIGINT/SIGTERM/SIGHUP` + `exit` 把 `LIVE_GROUPS` 一起帶走（⛔ 不然留一地孤兒 vitest） |
| ③ | ⭐⭐ **保證 settle**：`close` 沒來就靠 `exit` ＋ 寬限計時器（20s）收尾；看門狗開火後也開一個硬收尾。⛔ **這支腳本再也不會「等下去」。** 開火訊息**立刻 `process.stderr.write`**，⛔ 不是只進 log。逾時 ⇒ **exit code 124**（非零，且與測試失敗的 1 分得開） |

### 🔙 rollback（這支腳本自己的慣例就是環境變數）

⚠️ 這是 dev 端的 ops 腳本，⛔ 不是玩家看得到的設定 ——
它既有的開關全部是環境變數（`GGD_SHIP_CONCURRENCY` · `GGD_SYNC_CONVERGE=0` · `GGD_QUARANTINE_OFF`），
⭐ 所以這一次照同一個慣例，⛔ 不是硬塞進 `content/config/*.json`：

| 開關 | 退回什麼 |
|---|---|
| `GGD_SHIP_WATCHDOG_FLOOR_MS=300000` | 舊的 5 分鐘地板 |
| `GGD_SHIP_WATCHDOG_MULT=0` | 只看地板（＝缺陷①的行為） |
| `GGD_SHIP_WATCHDOG_GRACE_MS=<ms>` | 調寬限 |
| `GGD_SHIP_WATCHDOG_OFF=1` | 整隻看門狗關掉（⚠️ 回到「等 11 分鐘」那一版） |

---

## 5. 守衛 `packages/shared/src/ops/shipScriptWatchdog.test.ts`

⭐ 跑**出貨的那一支 `ship.mjs`**（⛔ 不自己重寫一份 `run()` 對著它斷言 —— 那是失敗形態⑤的虛構通道），
把地板調到 1ms 讓看門狗**真的**開火，然後問五件事：

1. ⭐⭐ **它會結束**（`r.signal === null`）—— 承重那一條，＝驗收條件本身
2. **非零離開碼**
3. 開火訊息出現在**終端輸出**（缺陷③）
4. 失敗表**指名**那一支（`hung,看門狗殺的`）
5. 訊息裡的**帳本估時 > 0**（缺陷①：`estMs` 沒接上時它永遠是 `帳本估 0s`）

＋ 三條靜態關係：`detached`/`-pid`/`SIGINT` 都在（缺陷②）· 每個 `run()` 呼叫點都帶 `estimateMs(`（缺陷①的接線）·
帳本路徑在 ship.mjs 與 run.mjs **是同一個**（第〇·四：`estimateMs` 開了第二條讀路徑，⛔ 不可以漂）·
⭐ 地板要**大於帳本裡最慢的一支健康 suite**（從帳本推導，⛔ 不抄字面值）。

🚨 **突變**：拿掉 `run()` 裡看門狗開火後的寬限收尾 ⇒ `close` 不來 ⇒ 第 1 條逾時而紅。

---

## 6. ⭐⭐ 票文的主張，在 log 裡拿到實物證據

2026-08-30 那一次現場跑（`--no-sync`）的兩份 log —— **兩支都被標成 `（hung,看門狗殺的）`**：

| suite | 標籤 | log 裡**實際**是什麼 |
|---|---|---|
| `vitest packages/shared` | ✗ hung，416.0s | ⭐ **4 條真的 `FAIL`**：`fieldAdoption.test.ts` ×3 · `legacyIndexFresh.test.ts` · `variantMirrorsSchema.test.ts`（`floatingText`：`driftSpeed` / `driftAngleDeg` / `driftAngleStepDeg` / `driftFrom` —— Zod 收得下而 variant 看不到，第〇·四守則） |
| `vitest apps/client` | ✗ hung，426.0s | ⭐ **`Test Files 670 passed (670)` · `Tests 5912 passed \| 1 skipped`** —— **完全是綠的** |

⇒ ⭐⭐ **同一隻壞掉的看門狗，同時做了兩件相反的壞事**：
- 把**全綠**的 `apps/client` 報成 ✗（**假紅**）
- 把 `packages/shared` 的 **4 條真紅**寫成一句「hung，單獨重跑通常會過」（**真紅被遮住**）

⚠️ 而「hung」這個標籤本身就是**叫人不要看**的意思 —— 腳本的訊息逐字寫著
「單獨重跑通常會過(併行撞車)」。⇒ 沒有人會去打開那份 log。

⭐ 這就是票文那句「**卡死遮住過真紅**」，⛔ 不是推測，是兩份 log。

⚠️ ⛔ 那 4 條 `FAIL` **不在這條 lane 的柵欄內**（`packages/shared/src/content/**`、`src/ops/legacyIndexFresh`），
這一輪**一個字都沒有動**。⭐ 它們需要有人接。

---

## 7. 下一步（⭐ 結構解，⛔ 這一票沒做）

`scripts/watchdog.sh` 已經有**兩樣這裡沒有的東西**：整棵樹的 BFS `kill_tree`，
以及 ⭐ **90 秒 0% CPU 偵測器** —— 那才是真正分得開「卡死」與「只是慢」的尺
（這一次量到孤兒是 **10–74% CPU** ⇒ 它們是**慢**，⛔ 不是卡死；wall 上限分不出這件事）。

⇒ ⭐ 讓 `ship.mjs` 的每一格走 `scripts/watchdog.sh`，殺樹邏輯就收成**一個住處**。
⛔ 這一票沒做：它比驗收條件大，而且 `run()` 仍然需要自己保證 settle（那是 `watchdog.sh` 給不了的性質）。
