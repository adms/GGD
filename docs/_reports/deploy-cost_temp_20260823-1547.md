# 上線成本稽核 —— 那一小時到底花在哪裡

> owner 2026-08-23 逐字：
> 「[重要] **跑太久了吧 已經超過一小時 改一個小地方 上線成本這麼高**
>  請你**深入分析檢討是否有更好做法** 不然這樣**無法邊測試邊玩邊改**，
>  或是其他**輕量級動態線上上架方式 (hotfix, patch) 設計與建議**」

⭐ 所有數字都是 2026-08-23 當天量到的。⛔ 量不到的一律標「⛔ 沒量到」，⛔ 沒有估計值混進來。

---

## 0. 一句話結論

⭐ **那一小時裡，「部署」只佔 3 分 11 秒（5.4%）。**
⛔ **而那 3 分 11 秒本來連跑都不用跑 —— owner 那四格旋鈕裡有三格，機制上完全不需要部署，
而且那個機制早就做好、正在線上健康地跑著、⭐ 使用次數是 0。**

---

## 1. 量到的：那一小時的時間軸

| 時刻 | 事件 | 來源 |
|---|---|---|
| 14:14 | owner「[緊急] 技能兩三發就會死 / 又變得 lag」 | `docs/_daily/2026-08-23.md` |
| 14:27 | owner「幫我調整後台系統倍率：**英雄登場初始等級 6, 生命+1200, 初始魔抗+20%, 生命倍率x12**」 | 同上 |
| 15:01:38 | commit `a15b16b5` —— **修 7 條被出貨值釘死的測試** | `git log` |
| 15:20:40 | commit `5d7d0777` —— 四格旋鈕落地（59 檔） | `git log` |
| 15:20:52 | tag `v0.25.6` | `git for-each-ref` |
| 15:22:59 | 部署開始 | `/private/tmp/deploy256.log` birth time |
| 15:26:10 | 部署結束、後置驗證全綠 | 同上 mtime |

⇒ **owner 開口 → 玩家拿到 = 59 分鐘。**

### 這 59 分鐘的機械成分（全部量到）

| 段 | 秒 | 佔 59 分 |
|---|---:|---:|
| `pnpm skills:check`（36 支閘） | 45.6 | 1.3% |
| `pnpm typecheck`（全 workspace，平行） | 38.9 | 1.1% |
| `vitest` 七包全跑（序列） | 223.3 | 6.3% |
| **本機閘小計** | **307.8（5m08s）** | **8.7%** |
| 遠端 `host-deploy.sh`（完整部署） | 191（3m11s） | 5.4% |
| **機械小計** | **498.8（8m19s）** | **14.1%** |
| **其餘（分析 / 實作 / 修測試 / 寫報告 / 開票）** | **≈ 3,061（51m）** | **85.9%** |

⭐ **所以「加速部署」最多只買得到 5.4%。** 真正的槓桿在另外兩個地方，下面兩節。

---

## 2. 量到的：遠端部署逐段拆解

三份今天還在的部署 log（七次部署只留下三份）：

| log | 起 | 訖 | 總計 | 模式 |
|---|---|---|---:|---|
| `deploy255.log` | 08:41:47 | 08:44:29 | **162s** | 完整 build |
| `deploy256.log` | 15:22:59 | 15:26:10 | **191s** | 完整 build |
| `ggd-deploy6.log`（08-21 對照） | 04:16:26 | 04:19:07 | **161s** | 完整 build |

⇒ ⭐ **完整部署 = 162–191 秒，⛔ 不是一小時。**

### build 內部（`deploy256.log` 的 BuildKit `DONE` 秒數）

| 步 | 是什麼 | 秒 |
|---|---|---:|
| **#49** | `pnpm --filter "@ggd/game-server" deploy /out` | **119.7** |
| #52 | client + admin 的 vite build | 27.7 |
| #54 | `brotli` 預壓縮 | 19.2 |
| #35 | `pnpm install`（game） | 15.9 |
| #43 | `pnpm install`（edge） | 14.4 |
| #67 | 匯出 game 映像 | 13.4 |
| #62 | 匯出 edge 映像 | 2.2 |
| #39 | 匯出 platform 映像（**全 cache**） | 1.6 |

⭐ **#49 在三份 log 裡分別是 123.2 / 119.8 / 119.7 秒 —— 幾乎逐秒相同。**
⇒ 它**每一次都 cache miss**，因為 `COPY packages/shared/ packages/shared/` 幾乎每個 commit 都動。
⇒ ⭐ **它一個人佔了整個 build 的約 70%**，而它做的事只是把 node_modules 複製成一份
self-contained `/out`（映像 655MB），⛔ 而 runtime 其實是 `tsx` 直接跑原始碼
（`docker/game.Dockerfile` 檔頭自己寫著這件事）。

### 起 + 驗

| 段 | 秒 | 來源 |
|---|---:|---|
| `docker compose up -d` → 後置驗證全部跑完 | **~9** | log 內 `time="2026-08-23T07:26:01Z"` → mtime 15:26:10 |
| game shard 從容器啟動到 `listening on :2567` | **3.99** | `StartedAt 07:26:06.404` → log `07:26:10.395` |

⇒ ⭐ **後置驗證只要 ~9 秒。⛔ 它不是成本，⛔ 不要動它。**

### 這台機器（唯讀觀察）

```
nproc = 4          Mem = 15 GB
docker root = /data/docker，可用 290G
Build Cache 45.53GB · Images 19.43GB（reclaimable 17.97GB）
ggd-game 655MB · ggd-edge 101MB · ggd-platform 66.4MB
:prev 三個 tag 都在（7 小時前）
```

⚠️ **這台是 4 核。** 記憶裡寫的「線上 24core/128GB」在這台上量不到 ——
`pnpm deploy /out` 要 120 秒、`pnpm install` 要 15 秒，都與 4 核相符。

---

## 3. ⭐ 核心發現：三格旋鈕根本不需要部署，而那條路今天一次都沒被用

### 3.1 引擎裡**已經有**兩條動態上架路，而且都是活的

**① content-bus（Redis `chan:content`）—— 不重啟、不部署，下一場生效**

`apps/game-server/src/config/contentBus.ts`：

```ts
export const CONTENT_KINDS = ["curation", "combat-env", "server-ops"] as const;
```

線上 shard 開機日誌逐字：

```
2026-08-23T07:26:10.400Z [content-bus] subscribed to chan:content on redis:6379 —
  admin edits to curation / combat-env / server-ops now reach this shard without a restart
```

⇒ ⭐ **`combat-env` 就是 owner 那一整族系統倍率的住處。**
後台「戰鬥系統」頁 → `PUT /admin/combat-env`（`apps/admin/src/api.ts:701`）
→ 平台耐久寫入 → 發 `kind: "combat-env"` → 跑著的 shard 重抓 → **下一場比賽生效**。
（⛔ 進行中的比賽不受影響 —— 那是刻意的，`MatchRoom.onCreate` 把表凍住。）

**② durable content overlay —— 不重建映像，重啟 shard 即可**

`data/content-overlay/overlay.json`，後台「基礎加成 / 屬性上限 / 戰鬥手感 / 對戰設定」頁
都走 `putOverlayDoc`。client 每次載入頁面都會抓 overlay
（`apps/client/src/content/bootContent.ts:142`），shard 在開機時抓
（`apps/game-server/src/config/contentOverlay.ts`）。

### 3.2 ⛔ 而它們今天一次都沒被用 —— 量到的，不是推測

線上 `/healthz` 的 `platform.content`（15:40 唯讀量測）：

```json
"state": "subscribed", "connectedAt": "2026-08-23T07:26:10.400Z", "unknownKinds": 0,
"documents": {
  "curation":    { "refreshes": 0, "announcedVersion": "", "documentUpdatedAt": null },
  "combat-env":  { "refreshes": 0, "announcedVersion": "", "documentUpdatedAt": null },
  "server-ops":  { "refreshes": 0, "announcedVersion": "", "documentUpdatedAt": null }
}
```

host 上的耐久 overlay 目錄：

```
data/content-overlay/
└── .git/          ← 只有 jsonstore 自己建的空 git，⛔ 沒有 overlay.json
```

⇒ ⭐ **content-bus 自開機以來搬過 0 筆。**
⇒ ⭐ **durable overlay 在正式站上從來沒有被寫過。**
（對照組：`data/curation/whitelist.json` mtime 2026-08-21 20:52 —— 上架名單那一頁**有**被用過，
所以這不是「後台壞掉」，是**這幾頁沒有人走**。）

### 3.3 owner 那四格逐格判定

| 旋鈕 | 落在哪一份 | key 是新的嗎 | 需要什麼 |
|---|---|---|---|
| **生命倍率 8 → 12** | `config/combat-env.json` `multipliers.maxHealth` | ⛔ 既有 | ⭐ **後台存檔，下一場生效。0 部署 0 重啟** |
| **生命 650 → 1200** | `config/base-bonus.json` `bonus.maxHealth` | ⛔ 既有 | 後台存檔 → overlay → **重啟 shard（3.99s）**＋玩家重整 |
| **初始魔抗 → 25** | `config/base-bonus.json` `bonus.mr` | ⛔ 既有（`zBaseBonusTable` 由 `ALL_STATS` 生成，`mr` 一直都在，後台那一列早就畫得出來） | 同上 |
| **英雄登場等級 1 → 6** | `config/config.match.json` `progression.heroStartLevel` | ⭐ **新欄位**（`schema/config/match.ts` +36 行） | ✅ **必須重建映像**（Zod 在映像裡、admin 那一格也在映像裡） |

⇒ ⭐ **四格裡三格不需要 build。實際做的是一次完整部署。**

---

## 4. ⭐ 第二個槓桿：出貨值住在測試裡，讓「不部署」變成做不到

### 4.1 量到的：HEAD 現在是紅的，14 條

15:37–15:42 逐包跑完，`apps/game-server` 7 條紅、`apps/admin` 7 條紅：

```
apps/game-server  src/match/arenaRules.test.ts   → AssertionError: expected 8 to be 3
apps/game-server  src/match/settlement.test.ts   ×3
apps/game-server  src/match/match.test.ts        ×1
apps/game-server  src/match/practiceCheats.test.ts ×1
apps/admin        src/baseBonus.test.ts          → expected 1200 to be 650
apps/admin        src/baseBonusPage.test.ts      ×2（650 / 「歸零後不是出貨預設 650」）
apps/admin        src/matchConfig.test.ts        ×2（expected 21 to be 22）
apps/admin        src/matchConfigSave.test.ts    ×1
apps/admin        src/navSections.test.ts        ×1
```

⭐ **每一條的訊息裡都是 owner 今天改的那個數字**（`3` = 舊的起始等級、`650` = 舊的生命贈禮、
`22` → `21` = matchConfig 欄位數）。
⇒ 這正是第二守則說的「出貨值住進測試 = 第四個住處，而它沒有守衛」。

### 4.2 這件事今天的實際帳單

commit `a15b16b5`（15:01）整個存在的理由就是修這一族：
「**七條斷言把出貨數值抄成了第四個住處**」。它修的是 `packages/shared` 的 7 條，
⛔ **`apps/game-server` 的 7 條與 `apps/admin` 的 7 條沒有修 —— 而那一版還是上線了。**

⇒ ⭐ **這才是「改一格數字要一小時」的真正機制：**

```
owner 改一格倍率
  → 14 條測試用「看起來完全不相干」的訊息紅
  → 要一個人去讀每一條、判斷是真壞還是抄了字面值、逐條改寫
  → 那件事本身就是一個 commit（今天 15:01 那個）
  → 而它讓「後台存檔就好」永遠不可能發生，因為紅燈逼你走完整條 commit→sync→test→deploy
```

⇒ ⭐ **只要測試不抄出貨值，改一格倍率就會是「一條都不紅」——
於是第 3 節那條「後台存檔、下一場生效」的路才真的能用。**
⛔ 這一項比任何 build 加速都值錢，而且它是既有守則的**執行**，⛔ 不是新規則。

### 4.3 ⚠️ 順帶量到：跑閘的當下工作樹被別的 session 改了

15:37 第一次跑 `packages/shared` → 3877 全綠。
15:43 第二次跑 → `buildIndexesValidates.test.ts` 2 條紅。
中間 `git status` 從「4 個 docs 檔被改」變成
「`packages/shared/src/content/schema/config/weather.ts` 被改」。

⇒ ⭐ **「跑完全套再 commit」在多 lane 併行下本身就是 racy 的** ——
你驗的那棵樹和你 commit 的那棵樹不是同一棵。這是第〇·七守則②（撞車重災區）在測試閘上的樣子。

---

## 5. 設計：四級上架路（⭐ 分級，⛔ 不是「全部少跑一點」）

⛔ 每一級都跑**同一套後置驗證**（只要 ~9 秒）。⛔ 沒有任何一級削弱既有的閘。

### T0 —— 系統倍率／上架名單／運維旋鈕：**~10 秒，0 部署 0 重啟**

適用：`config/combat-env.json` · curation 白名單 · server-ops 的**既有 key**。

```
1) 開 https://ggd.adms.ai/admin → 戰鬥系統 → 改那一格 → 儲存
2) 驗（唯讀，5 秒）：
   ssh -A can@34.81.104.163 "curl -s localhost:2567/healthz" \
     | python3 -c 'import json,sys; d=json.load(sys.stdin)["platform"]["content"]["documents"]["combat-env"]; print(d["refreshes"], d["lastRefreshOk"], d["appliedVersion"])'
   → refreshes 要 +1、lastRefreshOk 要 true
3) 玩家：下一場比賽自動吃到（⛔ 進行中的那一場不變，這是刻意的）
```

⛔ 不能用：新 key、schema 改動、公式改動、admin 沒有那一格。

### T1 —— 其他既有 key 的內容值：**~30 秒，0 build**

適用：`base-bonus` / `stat-caps` / `combat-feel` / `match-config` / 任何 `content/**` 的既有 key。

```
1) 後台對應頁 → 儲存（putOverlayDoc → data/content-overlay/overlay.json）
2) ssh -A can@34.81.104.163 'docker restart ggd-game-1'      # 量到 3.99s 重新 listening
3) ssh -A can@34.81.104.163 'cd /home/can/GGD && bash scripts/host-deploy.sh --verify-only'
4) 玩家：重整分頁（client 每次載入都抓 overlay）
```

⚠️ ⛔ **`--verify-only` 會在錄影目錄不可寫時 die 而不自動修**（刻意的，修法要重啟會踢人）——
所以第 2 步的 restart 要在第 3 步之前。

### T2 —— `content/**` 已進 git：**~20–30 秒，0 build**

適用：技能 JSON、特效綁定、音效綁定 —— ⛔ 且**沒有動 `schema/`**。

```
pnpm content:build && git commit -F msg.txt -- content/ … && git push
ssh -A can@34.81.104.163 'cd /home/can/GGD && bash scripts/host-deploy.sh --content-only'
```

量到的零件：`docker restart ggd-game-1` 3.99s ＋ 後置驗證 ~9s ＋ pull（⛔ 沒單獨量到，log 裡與磁碟閘混在一起）。

⛔ **不能用的紅線**：`packages/shared/src/content/schema/**` 只要動了一個 byte 就必須走 T3 ——
那正是 2026-08-02 生產故障的形狀（新內容 + 舊映像 → 內容整份載入失敗 → 退回 2 隻骨架）。

### T3 —— 完整部署：**162–191 秒（量到）**

適用：TS/Go 程式、Zod schema、admin UI、新欄位、`ENTITY_FLAG` 之類的協定改動。

```
ssh -A can@34.81.104.163 'cd /home/can/GGD && bash scripts/host-deploy.sh' > /private/tmp/deploy.log 2>&1
```

### ⭐ 分級必須是**閘**，⛔ 不是判準

元規則已經記了四次「判準 0/4 全破」。⇒ 級別要從 diff **推導**：

```bash
bash scripts/deploy-tier.sh              # 印出 T0/T1/T2/T3 + 理由
bash scripts/deploy-tier.sh --check T1   # 選低了就回非零
```

可以逐字檢查的規則：

| diff 碰到 | 級別 |
|---|---|
| `apps/**/src/**` · `packages/shared/src/**` · `docker/**` · `nginx/**` | **T3** |
| `content/**` 且 ⛔ 沒碰 `schema/` | T2 |
| 只有 `content/config/*.json`，且**key 集合逐一相同**（只有值變） | T1 |
| 上一列，且那份是 `combat-env` / `curation` / `server-ops` | **T0** |

---

## 6. 測試那一段：按**路徑**切，⛔ 不要用 `--changed`

### ⚠️ `vitest --changed` 量到 **0% 節省**

```
npx vitest run --root packages/shared --changed HEAD~1
→ Test Files 491（全部）   Duration 64.7s
```

對照全跑 66.4s ⇒ ⭐ **省 1.7 秒。⛔ 不要採用。**
（原因：模組圖從 barrel 扇出到全部；而且真正的相依是 `content/**/*.json` ——
那些是**執行時 `readFileSync` 讀的**，本來就不在模組圖裡。⇒ 它還會給你「我跑過了」的假象。）

### ⭐ 正確的切法：diff 的**路徑**決定跑哪幾包（量到的秒數）

| 改了什麼 | 跑哪幾包 | 秒 |
|---|---|---:|
| `apps/admin/**` | admin | **12.4** |
| `apps/client/**` | client | **69.1** |
| `content/{abilities,champions,items}/**` | shared + game-server | **109.3** |
| `content/config/*.json` 的值 | shared + game-server + admin | **121.7** |
| `packages/shared/src/sim/**` | shared + game-server + client | **178.4** |
| **commit 前 / T3 部署前** | **全部七包** | **223.3** |

逐包量到的原始數字：

| 包 | 秒 | 測試檔 | 測試數 |
|---|---:|---:|---:|
| `apps/client` | 69.1 | 588 | 5,637 |
| `packages/shared` | 66.4 | 491 | 3,877 |
| `apps/game-server` | 42.9 | — | 842（**7 紅**） |
| `apps/editor` | 26.5 | 19 | 134 |
| `apps/admin` | 12.4 | — | 1,207（**7 紅**） |
| `apps/content-api` | 4.1 | 2 | 48 |
| `apps/test-dashboard` | 1.9 | 1 | 7 |

⭐ 這**不是**放寬 —— 出貨前那一次仍然是 223 秒全跑。
它換掉的是**開發迴圈**：從「每次 223 秒」變成「12–122 秒」。
第零守則⏱ 的「一批 ≤3 次 vitest」額度不變。

### 其他閘（量到）

| | 秒 |
|---|---:|
| `pnpm skills:check`（36 支） | **45.6** |
| `pnpm typecheck`（全 workspace，平行） | **38.9** |
| `pnpm content:build` | ⛔ 沒直接量（全域鎖）。由 `buildIndexesValidates.test.ts` 內真的跑起來的那一趟推得 **≈ 9.7s** |
| `pnpm skills:sync` | ⛔ 沒量（全域鎖，⛔ 不可跑） |

`skills:check` 最慢的五支：`msgledger:check` 4.9 · `audit:check` 3.6 ·
`skillremake:docs:check` 3.1 · `skillremake:json:check` 3.0 · `spec:check` 1.9。
⇒ ⭐ **它整包只要 45.6 秒，⛔ 它不是瓶頸。**

---

## 7. 問題 4：本機用出貨內容跑一場 —— ⭐ 已經有了，3.4 秒

```bash
npx vitest run --root apps/game-server src/match/arenaRules.test.ts \
  -t "12 bots pick from the full roster"
```

`apps/game-server/src/match/arenaRules.test.ts:744`：
`new ContentLoader(new FsContentSource(CONTENT_DIR)).load()` —— 讀的是**真的 `content/`**，
12 個 bot 從完整名單選角，一路 tick 到 `matchEnd`，斷言四個名次都在、每個座位等級 ≥4。

| 量到 | |
|---|---|
| 「12 bots … play to matchEnd」 | **3,378 ms** |
| 「same seed → identical result」（決定性） | **4,979 ms** |

⇒ ⭐ **「改一格倍率會不會讓一場打不完 / 幾發打死 / 名次算錯」，本機 3.4 秒有答案。
⛔ 不必先部署，⛔ 也不必請 owner 打一場。**

---

## 8. 回滾與藍綠

### `--rollback` 量到的組成：**≈ 20–25 秒，⛔ 不 build**

```
docker tag ggd-{edge,game,platform}:prev → :latest    （瞬間；三個 :prev 現在都在，7 小時前）
git checkout <prev-commit> -- content/                 （瞬間）
docker compose up -d                                   （容器 recreate，量到 shard 3.99s 重新 listening）
同一套後置驗證                                          （~9s）
```

### ⛔ 不建議在這台做藍綠 / 金絲雀

| 理由 | 量到的事實 |
|---|---|
| 機器太小 | **4 vCPU / 15 GB**；game 映像 655MB，再開一組要一倍記憶體與一次額外 build |
| 收益已經有了 | `--rollback` **20–25 秒**、⛔ 不 build —— 藍綠買的就是這個 |
| 金絲雀對這個形狀沒意義 | 單 shard、單房（`rooms.active` 量到 1）；沒有可以分流的族群 |

---

## 9. 各條路的成本 / 風險 / 什麼情況下不能用

| # | 路 | 成本 | 風險 | ⛔ 不能用的情況 |
|---|---|---|---|---|
| 1 | **後台 T0（content-bus）** | ~10s | ⚠️ **repo 與線上會漂**（CLAUDE.md 已記：override 蓋掉 `content/`） | 新 key · schema 改動 · 公式改動 |
| 2 | **後台 T1（durable overlay）** | ~30s | 同上，且 client 要重整才看得到 | 新欄位 · admin 沒那一格 |
| 3 | **`--content-only`** | ~20–30s | ⚠️ 動到 `schema/` 就是 2026-08-02 事故的形狀 | `packages/shared/src/content/schema/**` 有任何改動 |
| 4 | **按路徑挑測試** | 省 100–210s／輪 | ⚠️ 挑錯包＝漏跑 ⇒ **必須由腳本從 diff 推導** | 出貨前那一次 ⛔ 不適用（全跑） |
| 5 | `vitest --changed` | ⛔ **量到 0% 節省** | ⭐ 製造「我跑過了」的假象 | ⛔ **一律不用** |
| 6 | **selective `docker compose build <svc>`** | 只改 client 可省 #49 的 **119.7s** | ⚠️ 必須保留同一套後置驗證（映像↔內容是**配對**性質） | 動到 `packages/shared` 時（兩個映像都要重建） |
| 7 | 重寫 `pnpm deploy /out` 那一層 | ⛔ **沒量到會快多少** | 動 runtime 打包方式，風險高 | ⛔ 在量到之前不要當成承諾 |
| 8 | 藍綠 / 金絲雀 | 一倍資源 + 一次額外 build | 4 核機器扛不動 | ⛔ 這台不建議 |

---

## 10. ⭐ 建議的落地順序（⛔ 不排版次，今天可做）

| 序 | 做什麼 | 為什麼排在這 | 買到什麼 |
|---:|---|---|---|
| **1** | **修掉那 14 條抄出貨值的測試**（game-server 7 + admin 7），⛔ 不放寬斷言，從 config 推導或改成驗機制 —— `packages/shared` 已經有現成做法（commit `a15b16b5`） | ⭐ **不修這個，T0/T1 永遠用不了**：改一格倍率就會紅一片，紅了就得走完整條路 | 讓「後台存檔取代部署」從理論變成可執行 |
| **2** | 加一條掃描守衛：`apps/game-server` / `apps/admin` 的斷言不可以出現 `content/config/*.json` 裡的字面值 | 判準治不了（元規則）——這是第 1 項的閘，⛔ 不然下週又長回來 | 第 1 項不會回頭 |
| **3** | `scripts/deploy-tier.sh`（＋ `--check`）從 diff 推導 T0/T1/T2/T3 | 分級靠人判斷 = 判準 = 會失效 | 每次改動自動落到最便宜那一級 |
| **4** | **對帳閘**：把線上 `GET /content-overlay/bundle` 與 `GET /admin/combat-env` 撈回來比對 repo，不一致就紅 | ⚠️ **這是 T0/T1 的安全帶** —— 沒有它，T0/T1 會製造「線上與 repo 兩份真相」，正是 2026-08-02 的形狀 | 讓走後台變成安全的，⛔ 不是有債的 |
| **5** | 把「按路徑挑測試」寫成一支腳本（`scripts/test-for-diff.sh`） | 第零守則⏱ 的節奏規則現在沒有工具 | 開發迴圈 223s → 12–122s |
| 6 | 量 `pnpm deploy /out` 的替代方案（`COPY --from=build /repo`） | ⛔ 現在沒量到，⛔ 不要先承諾 | 可能省 build 的 70% |
| 7 | selective `docker compose build <service>` | 只有在 1–5 做完之後才輪得到（它只買 5.4% 裡的一部分） | 只改 client 時省 ~120s |

---

## 11. ⛔ 我明確**不**建議的（每一條都會削弱既有的閘）

1. ⛔ **不要**縮短或跳過 `host-deploy.sh` 的後置驗證 —— 量到只要 ~9 秒，
   而它是 2026-08-01 / 08-02 兩次「全綠而線上整個掛掉」之後補的，第五項（映像↔內容配對）尤其。
2. ⛔ **不要**用 `vitest --changed` —— 量到 0% 節省，而它會讓人以為驗過了。
3. ⛔ **不要**放寬任何 `--check` 的比對（CLAUDE.md 記了四次「一條被放寬的閘等於沒有閘」）。
4. ⛔ **不要**為了快而在 `--content-only` 裡塞 schema 改動 —— 那是 2026-08-02 的生產故障。
5. ⛔ **不要**在這台做藍綠 —— 4 核 / 15GB，而 `--rollback` 20 秒已經給了同樣的東西。

---

## 12. 順手量到的兩件事（⛔ 我沒有修，也沒開票 —— 這是唯讀分析）

| # | 是什麼 | 證據 |
|---|---|---|
| 1 | **`/data/match-stats` 不可寫，比賽沒有被分析** —— 與 GH#170 的 `/data/replays` 是**同型**故障（bind mount 擁有者不是容器 uid），⛔ 而 `host-deploy.sh` 只自動修 replays 那一個 | shard log `2026-08-23T07:36:42.019Z [match-stats] could not open a file for m_01M0PRSQJK35CP4Y9SYHK7T137; this match will not be analysed Error: EACCES: permission denied, mkdir '/data/match-stats'` |
| 2 | **`board:check` 與 `msgledger:check` 目前回非零** | `/private/tmp/dcost/checks.tsv` rc=1 兩支 |

---

## 附錄：量測方法與原始檔

| 量什麼 | 怎麼量 | 落在哪 |
|---|---|---|
| 遠端部署總時間 | `stat -f '%SB / %Sm'` 三份 deploy log 的 birth→mtime | `/private/tmp/deploy{,255,256}.log` |
| build 逐段 | BuildKit `^#N DONE Xs` | 同上 |
| shard 開機 | `docker inspect .State.StartedAt` vs `docker logs --timestamps` | 唯讀 ssh |
| content-bus 使用次數 | `curl localhost:2567/healthz` → `platform.content.documents` | 唯讀 ssh |
| overlay 是否被寫過 | `ls -laR data/content-overlay` | 唯讀 ssh |
| 36 支閘逐支 | 逐支 `pnpm -s <check>` 前後取時間 | `/private/tmp/dcost/checks.tsv` |
| 七包 vitest | 逐包 `npx vitest run --root <p>` | `/private/tmp/dcost/tests.tsv` + `vitest_*.log` |
| typecheck | `pnpm typecheck` | `/private/tmp/dcost/tsc.tsv` |
| `--changed` | `npx vitest run --root packages/shared --changed HEAD~1` | `/private/tmp/dcost/vitest_changed.log` |

⛔ **沒量到的**：`pnpm skills:sync` 與 `pnpm content:build` 的實測秒數（全域鎖，本次唯讀分析禁跑）；
`git pull` 在 host 上單獨的秒數（log 裡與磁碟閘混在一起）；
`pnpm deploy /out` 替代方案能省多少。
