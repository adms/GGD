# 部署計時帳本 + 分級 hotfix —— 工具與分級設計（L6）

> owner 2026-08-23 逐字：
> 「[重要] **跑太久了吧 已經超過一小時 改一個小地方 上線成本這麼高**
>  請你**深入分析檢討是否有更好做法** 不然這樣**無法邊測試邊玩邊改**，
>  或是其他**輕量級動態線上上架方式 (hotfix, patch) 設計與建議**」
> 「**你要記錄一下各單元到底花多少時間做什麼，並且分析如何減少時間**」

⚠️ **這份是「工具 + 分級設計」。逐段量測不在這裡** ——
量測那一份是 [`deploy-cost_temp_20260823-1547.md`](./deploy-cost_temp_20260823-1547.md)（465 行，同日）。
⛔ 我刻意**沒有重量一次**（那會是同一件事做兩遍，第零守則），
這份引用它的數字，並把它第 10 節排序第 3 項的「`deploy-tier.sh`」真的做出來。

---

## 0. ⭐ 一句話結論（新量到的）

**把分級器套回這個 repo 真正的出貨歷史：近 15 個 tag 區間 —— T3 15 個，T0/T1/T2 各 0 個。100% 全量。**

⇒ ⭐ **分級本身省不到任何一秒**，因為每一版都夾帶了程式改動。
⇒ 分級器的價值**不是**「自動變快」，是**讓「只改一格旋鈕」這件事第一次成為可能** ——
它把「這一批可不可以走便宜的路」從**判準**（我覺得只是小改）變成一行**會回非零的指令**。

```
逐 commit（近 200 個）：T3 169 · NOOP 25 · T2 6 · T1 0 · T0 0
逐  版 （近 15 個 tag 區間）：T3 15 · 其餘 0
```

---

## 1. 【A】工具：`tools/deploy-timing/`

```bash
# 量一段（包在既有指令外面，⛔ 不改那些指令；離開碼透明轉發）
node tools/deploy-timing/run.mjs stage local:typecheck -- pnpm typecheck

# ⭐ 機械分級（fail-closed）
node tools/deploy-timing/run.mjs tier --stamp "v0.25.6-2-gc10e8d52"   # 徽章那一行
node tools/deploy-timing/run.mjs tier --deployed <sha> [--head <ref>]

# 把遠端 build 撈進帳本（⛔ 不必 ssh —— 讀一份 host-deploy 的 log 就好）
node tools/deploy-timing/run.mjs ingest /private/tmp/deploy256.log

node tools/deploy-timing/run.mjs report          # 這一小時花在哪
node tools/deploy-timing/run.mjs plan T2         # 某一級跑什麼、省什麼、⛔ 不省什麼
```

帳本 `docs/_data/deploy-timings.json`（累積，最近 60 次；`GGD_DEPLOY_KEEP_RUNS` 可調）。
形狀抄 `tools/parallel-gates/run.mjs` 的 `gate-timings.json`。

### ⭐ `ingest` 是這支工具真正的槓桿

遠端那 191 秒**不可能**用本機的計時器包起來，而 BuildKit 每一步都自己印
`#N DONE Xs`。⇒ 部署完把 log 餵進來就有逐段。**驗過對得上**：

| log | 累計 CPU | wall 下界（最長鏈） | 實測整趟 |
|---|---:|---:|---:|
| `deploy-v0213` | 3.7m | 1.9m | — |
| `deploy255` | 3.4m | 2.3m | 162s |
| `deploy` | 4.7m | 2.4m | — |
| `deploy256` | 3.9m | **2.6m** | **191s** |

⇒ 2.6m 的下界 vs 191s 的實測 ⇒ **build 之外只有 ~35 秒**（pull＋起＋驗）。
⭐ 而 `remote:build:game` 一支就是 **2.4m 中位數（48%）** —— 那支是
`pnpm --filter "@ggd/game-server" deploy /out`，四份 log 分別 123.2 / 119.8 / 119.7 / 99.3 秒，
**幾乎逐秒相同 ⇒ 它每一次都 cache miss**（`COPY packages/shared/` 幾乎每個 commit 都動）。

### ⚠️ 帳本刻意帶時間戳，所以它 ⛔ 永遠不可以掛 `--check`

CLAUDE.md 記著「隨時鐘變動的欄位會讓逐位元組比對永遠不相等 ⇒ `--check` 只能被放寬 ⇒
一條被放寬的閘等於沒有閘」。那條管的是**產生的文件**；這份是**時間序列**，沒有時間就沒有資訊。
⇒ 兩者出路不同：那些不加時鐘，這份加時鐘**並且不掛 `--check` 閘**。（已寫進檔頭。）

---

## 2. 【B】分級：判準是**路徑集合**，⛔ 不是「我覺得只是小改」

⭐ 級別的**唯一**輸入是 `git diff --name-only <線上那一版>..<候選版>`，
規則表住 `tools/deploy-timing/tiers.json`（可編，⛔ 不寫死在程式裡）。

| 級 | 觸發（路徑） | 機制 | 成本 | ⭐ 放棄了什麼保證 |
|---|---|---|---:|---|
| **NOOP** | 只有 `docs/` `tools/` `scripts/` `CLAUDE.md` … | ⛔ 不部署 | **0s** | 無 |
| **T0** | 只有 `content/config/combat-env.json`，且 **key 集合逐一相同** | 後台存檔 → Redis `chan:content` → 跑著的 shard 重抓 | **~10s** | ⚠️ **repo 與線上會漂**（值只在線上，`content/` 沒變）⇒ 必須事後補 push |
| **T1** | 只有 `content/config/*.json`，且 **key 集合逐一相同** | 後台存檔 → durable overlay → `docker restart ggd-game-1` | **~30s** | 同上 ＋ 玩家要重整分頁 |
| **T2** | 只有 `content/**`（⛔ 沒碰 `packages/shared/`） | `host-deploy.sh --content-only` | **~30s** | ⛔ **無**（走 git，五項後置驗證全跑） |
| **T3** | 任何 `packages/shared/` `apps/**` `docker/` `nginx/` `pnpm-lock.yaml` … | `host-deploy.sh` | **191s** | ⛔ 無 |
| **T3 + protocol** | `packages/shared/src/protocol/` | 同上，⛔ 不可逆 | 191s | ⛔ 無，但 ⛔ 絕不可 `--content-only`、煙霧測試強制新分頁 |

省的秒數逐段對照（用 §1 的量測）：

| 級 | 省下哪幾段 | 秒 |
|---|---|---:|
| T2 | `docker build` ×3 全部（其中 game 那條鏈 2.4m 是大頭） | **−161s** |
| T1 | 上面全部 ＋ `git push` ＋ `compose up -d` | **−161s**，且⛔ 不必 commit |
| T0 | 上面全部 ＋ shard 重啟（量到 3.99s） | **−181s** |

### ⭐ 三條讓它 ⛔ 不削弱既有的閘的規則（每一條都是程式，不是散文）

**① 起點是「線上正在服務的那個 commit」，⛔ 不是「我這次改了什麼」。**
拿不到就 **fail-closed 判 T3 並回離開碼 3**（實測過）：

```
⛔ 不知道**線上正在服務哪一個 commit** ⇒ 拒絕分級,判定為 T3(全量重建)。
```

⚠️ 這一條就是把 2026-08-02 關起來的那一條：那次一份 push 裡 content 與 schema 都動了，
而只有 content 被送上去。**用累計 diff 判，那一次必然落 T3。**（守衛第一條就在測它。）

**② 沒有規則吃到的路徑 ⇒ `unknownTier`（T3）。**
新開一個頂層目錄 ⛔ 不可以靜默被當成「只有內容」——
那正是 `configUnionCoversDirectory` 只掃一層資料夾、差點造成線上事故的形狀。

**③ T2 → T1/T0 的降級要比 **key 集合**，⛔ 不是「看起來只改了值」。**
多一個 key ⇒ 後台那一格畫不出來（欄位表烘在 admin 映像裡）⇒ 留在 T2。
實例（今天真的發生）：`heroStartLevel` 是**新欄位** ⇒ 那一格**必須**走 T3；
同一批的 `maxHealth` 倍率是**既有 key** ⇒ 它本來可以走 T0。

**④ ⛔ 每一級都跑同一套後置驗證。** 量到只要 ~9 秒 ——
分級省的是 **build**，⛔ 不是**驗證**。⛔ 沒有任何一級可以少驗一項。

### 【B】對照 task 原本的四級

task 描述的是「改了什麼」，量測報告用的是「怎麼送上去」——**同一個軸**，我合成一把梯子
（⛔ 兩份文件不可以各有一把，那就是資訊不同步）：

| task 說的 | 落在這把梯子的 |
|---|---|
| T0 純 content/config | **T0 / T1 / T2**（再細分成三級：bus 旋鈕 / overlay / 進 git） |
| T1 只改 client | ⛔ **仍然是 T3** —— 見下一節 |
| T2 改 shared/schema | **T3** |
| T3 改協定 | **T3 + protocol rider** |

### ⛔ 「只推靜態資產」的建議：**不要做**（量到的理由）

client bundle 烘在 `ggd-edge` 映像裡。要改成靜態上傳，會多出一個
「**兩個獨立版本化的東西相遇**」的面 —— 那正是 2026-08-01 / 08-02 兩次事故的**唯一**成因類別。
而它買到的是：

| | 秒 |
|---|---:|
| client + admin 的 vite build（#52） | 27.7 |
| brotli 預壓縮（#54） | 19.2 |
| edge 的 `pnpm install`（#43） | 14.4 |
| **合計** | **≈ 61s** |

⇒ 拿「再開一條會靜默失配的路」換 61 秒，⛔ 不划算。
⭐ **同樣的力氣拿去打 `pnpm deploy /out`（一支 2.4m，佔 build 的 ~70%）回報是 2.3 倍**，
而它是**同一個映像內部**的事，⛔ 不新增任何版本配對面。
⚠️ 但它能省多少**我沒有量到** ⇒ ⛔ 不當成承諾（沿用 1547 報告第 9 節第 7 列的立場）。

---

## 3. 守衛（第二守則）

`tools/deploy-timing/tier.test.mjs` —— 9 條，全部驗**分級會不會樂觀**，
⛔ 不驗「表抄得對不對」（那是數字，第零守則說不要測）。

⭐ **突變驗證（一批一條，挑最承重的）**：`tiers.json` 的 `unknownTier` `T3 → T0`
⇒ 「沒有規則吃到的路徑落到 unknownTier」當場紅：

```
× 分級一律 fail-closed > ⛔ 沒有規則吃到的路徑落到 unknownTier
  → expected 'T0' to be 'T3'
```

⚠️ **它現在還不在任何聚合閘裡**（`package.json` 與 `packages/shared/` 都在我的柵欄外）。
⭐ 主 session 只要加**一行**就變成閘：

```jsonc
// package.json scripts
"deploytier:check": "vitest run tools/deploy-timing/tier.test.mjs"
// 然後把 `pnpm deploytier:check` 接進 skills:check
```

⚠️ ⛔ 不接的話會被 `skillsSyncCoversGenerators.test.ts` 抓（它要求每一支 `*:check`
要嘛在聚合裡、要嘛在豁免表裡帶一個能被反駁的理由）—— 那條閘本來就在守這件事。

---

## 4. 我改了什麼、⛔ 沒改什麼

| | |
|---|---|
| 新增 | `tools/deploy-timing/run.mjs`（工具）· `tiers.json`（規則表，可編）· `tier.test.mjs`（守衛）· `docs/_data/deploy-timings.json`（帳本） |
| ⛔ 沒動 | `scripts/release.sh`（唯讀分析）· `scripts/host-deploy.sh` · `package.json` · 任何既有閘 |
| ⛔ 沒做 | 實作分級的**執行**（task 明說「先給設計」）；⛔ 沒 ssh、⛔ 沒 gh 寫入、⛔ 沒跑 `content:build`/`skills:sync` |

⚠️ `pnpm typecheck` 量到 46.8s 且 **exit 1** —— 那是別的 lane 在飛的改動，⛔ 不是這支工具。
帳本誠實記著 `exit 1`（一支會吞掉紅燈的計時器比沒有計時器更糟）。
