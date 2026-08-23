# L4 —— vitest pool = forks / maxForks 16

owner 2026-08-23 逐字：

> 「**我的本地端機器是 M5 Max 128G 非常高效能，請你盡量壓榨多執行緒跟記憶體
>   在本地端最大加速完成任務**」

並對「① worker 數：forks 16，⛔ 不要 threads」回覆：

> 「**以上都同意**」

---

## 機器規格（實測，`sysctl` / `node`）

| | |
|---|---|
| CPU | **Apple M5 Max** |
| `hw.ncpu` / `hw.physicalcpu` | **18 / 18** |
| `os.availableParallelism()` | **18** |
| RAM (`hw.memsize`) | **137,438,953,472 B = 128 GiB** |
| OS | macOS **26.4**（build 25E246） |
| vitest | **2.1.9** |

⚠️ **18 核，不是 16。** 這一格很重要，因為 vitest 2.x 的 `maxForks` 預設值是
`availableParallelism() - 1` = **17**。⇒ 指定 `maxForks: 16` 在這台機器上是
**比預設少一個 worker**，⛔ 不是「從預設拉上去」。

---

## 改了什麼（4 個檔，⭐ 純新增 29 行、0 行刪除）

| 檔 | 加了什麼 |
|---|---|
| `packages/shared/vitest.config.ts` | `pool: "forks"` + `poolOptions.forks {maxForks:16, minForks:4}` |
| `apps/game-server/vitest.config.ts` | 同上 |
| `apps/client/vite.config.ts` → `test` 區塊 | 同上 |
| `apps/admin/vite.config.ts` → `test` 區塊 | 同上 |

⛔ `apps/platform` **沒有** vitest —— 它是純 Go（`go.mod` / `cmd` / `internal`），無檔可動。

### ⚠️ 為什麼 client / admin 寫在 `vite.config.ts` 而不是新開 `vitest.config.ts`

新開一份 `vitest.config.ts` 會**取代**同目錄的 `vite.config.ts`，於是：

* `apps/client` 會弄丟 `setupFiles: ["./src/testSetup.vfxContent.ts"]`（GH#384 的逐技能特效綁定）
* `apps/admin` / `apps/client` 會弄丟 `include: ["src/**/*.test.ts"]`

⇒ 那是 CLAUDE.md **失敗形態③**（可以刪掉而測試全綠）的完美形狀：檔案照收、
測試照綠，只是特效綁定沒有人交進來。所以這一格加在既有的 `test` 區塊裡。

### ⭐ 為什麼 `pool: "forks"` 即使是預設也要明寫

`forks` **本來就是** vitest 2.x 的預設 pool，所以這一行**不改變任何行為**。
它的價值是**讓「有人把它換成 threads」變成一個看得見的決定** ——
這個 repo 有 Babylon 的 headless mock 與 CJS/ESM 混用，threads 會炸。

---

## 量到的（`packages/shared`：491 個測試檔 · 3,877 條測試）

⚠️ **⛔ 這四次不是乾淨的 A/B —— 全部都在其他 lane 同時跑的機器上量的。**

| # | 誰 | `maxForks` | wall-clock | vitest `Duration` | user CPU | sys CPU | 達到的 %cpu |
|---|---|---:|---:|---:|---:|---:|---:|
| 1 | 另一條 lane (L5) | 預設 **17** | 68.55s | 67.25s | 756.64s | 144.79s | **1314%** |
| 2 | **改之前**（本 lane 基準線） | 預設 **17** | **66.08s** | **64.98s** | 736.37s | 141.50s | **1328%** |
| 3 | **改之後**（出貨值） | **16** | **71.09s** | **70.05s** | 728.93s | 141.24s | **1224%** |
| 4 | 探針（CLI 覆寫） | **18** | 83.42s | 81.83s | 733.19s | 150.22s | **1059%** |

### ⭐ 最重要的一個發現：**wall-clock 的差異是「撞車」，⛔ 不是這顆旋鈕**

**user CPU 四次幾乎一模一樣**：728.93 / 733.19 / 736.37 / 756.64 秒（全距 **±3.7%**）。
⇒ 這套 suite 就是 **≈730 CPU-秒**的工作量，`maxForks` 不論設 16 / 17 / 18 都沒有改變它。

**變的是「這台機器分給我多少」**：達到的 `%cpu` 從 1328% 一路掉到 1059%，
而 wall-clock 正好跟著它反向走。第 4 次跑的時候我同步取樣了 load average：

```
16:43:33 load= 24.19      ← 開跑時就已經有別的 lane 在跑
16:43:48 load= 42.37
16:44:03 load= 52.76
16:44:18 load= 68.21
16:44:33 load= 72.58
16:44:48 load= 84.56      ← 18 核的機器，load 84
```

⇒ ⛔ **「16 比預設慢 5 秒」這句話我不敢講** —— 第 3 次跑的時候別的 lane 拿走了多少
CPU，我沒有量。唯一能證明的是：**在 6+ 條 lane 併行的機器上，vitest 的 wall-clock
不具可比性**，⭐ 穩定的量測值是 **user CPU-秒**。

### ⭐ 天花板在哪（這個才是「還能壓榨多少」的答案）

```
≈730 CPU-秒 ÷ 18 核 = 40.6 秒   ← 完美平行的理論下限
最好的一次實測 = 64.98 秒        ⇒ 平行效率 ≈ 62%
```

⇒ ⭐ **剩下的 38% ⛔ 不在 worker 數上**。`Duration` 的分項指出真正的去處：
`collect 316.75s` + `prepare 114.83s` = **431 CPU-秒（59%）花在載入與轉譯**，
真正跑測試只有 `tests 349.32s`。⇒ 下一個值得動的是**模組轉譯/隔離**
（例如 `isolate` 或 transform 快取），⛔ 不是把 16 調成 17。
⚠️ 那超出本 lane 柵欄，也超出 owner 這次同意的範圍 —— **⛔ 我沒有動它**。

---

## 3 個**先前就紅**的測試（⛔ 不是這次改動造成的）

四次跑（含改動前的基準線與另一條 lane 的）**全部都是同樣的 3 紅 / 488 綠**：

| 檔 | 為什麼 |
|---|---|
| `src/ops/codexContractNumbers.test.ts` | 產生器 `--check` stale |
| `src/ops/legacyIndexFresh.test.ts` | 同上 |
| `src/ops/readmeListsFresh.test.ts` | 同上 |

⇒ 三支都是「產生的文件過期」型的閘，修法是 `pnpm skills:sync`。
⛔ **本 lane 禁止跑 `skills:sync`（全域鎖）**，由主 session 統一跑一次。

---

## 給主 session 的三個 follow-up（⛔ 全部在本 lane 柵欄外，我沒有動）

1. ⭐ **要一次乾淨的 A/B**：等所有 lane 收工後，在**沒有其他負載**的機器上重跑
   16 vs 17。這次的數字被撞車蓋過去了。
2. **`16` 這個字面值現在有 4 個住處**（4 份 config 各一份）。正解是抽進
   `vitest.shared.ts` 匯出一格 `FORK_POOL`（⇒ 一個住處，CLAUDE.md 第〇·四）——
   `vitest.shared.ts` 不在本 lane 柵欄內。
3. **根 `vitest.config.ts` 與 `tools/*/vitest.config.ts` 還是預設 pool**。
   根設定會被「沒有自己 config 的每一個 package」繼承（見該檔 GH#428 的檔頭），
   所以那一格影響面最大 —— 同樣不在本 lane 柵欄內。
