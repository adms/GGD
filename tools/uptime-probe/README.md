# `@ggd/uptime-probe` — 外部健康探測（GH#124）

> 「`/healthz` 沒有會通知人的外部探測 —— 服務掛了要等家人來說才知道。」

這個工具每 15 分鐘（晚上）／每小時（其他時間）從 **GitHub Actions** 打
`ggd.adms.ai` 的幾個端點，連續失敗才發 Slack。

- 探測腳本：`src/`（決策核心在 `probe.ts`，完全沒有 I/O）
- 可調參數：`probe.config.json` ← **要改的是這一個**
- 排程：`.github/workflows/uptime.yml`
- 守衛：`src/*.test.ts`，跟著 `pnpm -r test` 一起跑（CI 的 `unit` job）

---

## 一、owner 要做的四件事（runbook）

> ⛔ 下面沒有任何一步需要 ssh 進正式機。整套東西不跑在 GCP 上 —— 這正是重點：
> **在被監控的機器上跑監控，等於沒有監控。**

### 1. 準備一個 Slack incoming webhook

可以直接**重用 #209 註冊通知那一條**（就是 `docker/.env` 裡的
`GGD_SLACK_WEBHOOK_URL`），也可以另開一條專給告警用。建議另開，理由是待審註冊
可以慢慢看，服務掛了要立刻看到 —— 分兩條才能在 Slack 端設不同的通知強度。

在 <https://api.slack.com/apps> → 你的 app → Incoming Webhooks → Add New Webhook。

### 2. 把它存成 GitHub Actions secret

在瀏覽器做，**不要貼進任何檔案、也不要貼進聊天視窗**：

```
https://github.com/adms/GGD/settings/secrets/actions
→ New repository secret
   Name:   GGD_UPTIME_WEBHOOK_URL
   Secret: https://hooks.slack.com/services/…（貼上）
```

> 已經設了 `GGD_SLACK_WEBHOOK_URL` 的話，這一步可以跳過 —— 探測會自動 fallback
> 到它。兩個都沒設：探測照跑、照樣讓 job 變紅，但**不會有人被通知**，而且 log
> 會明講這件事。

### 3. 決定誰會被吵醒

`probe.config.json` → `notify.mention`：

| 值 | 效果 |
|---|---|
| `""`（預設） | 安靜貼在頻道裡，不推播 |
| `"<!channel>"` | 頻道所有人被 ping（手機會響） |
| `"<@U01ABCDEF>"` | 只 ping 你一個人 |

改完 commit + push 就生效，不用 deploy。

### 4. 開 workflow + 驗一次

Actions 分頁 →「uptime」→ 如果是灰的就按 **Enable workflow**。
然後手動跑一次確認接線是通的：

```
Actions → uptime → Run workflow
   dry_run: ✅ 打勾   ← 只探測、不會真的發 Slack
```

看 log 應該長這樣：

```
[probe] webhook from $GGD_UPTIME_WEBHOOK_URL
[probe] --dry-run: no Slack POST will be made
─── 探測結果 ───
OK    edge               邊緣 nginx — HTTP 200 OK
OK    client             遊戲前端 — HTTP 200 OK
OK    platform           平台 API — HTTP 200 OK
OK    platform-store     平台資料層（白名單讀取） — HTTP 200 OK
OK    content-manifest   內容清單 — HTTP 200 OK
OK    admin-guard        後台仍然要求登入 — HTTP 401 OK
[probe] nothing to notify
```

**出錯怎麼辦：**

| log 裡看到 | 意思 | 怎麼修 |
|---|---|---|
| `NO WEBHOOK — nothing can be notified` | secret 沒設或名字打錯 | 回到第 2 步，注意大小寫 |
| `AN ALERT WAS DUE AND COULD NOT BE SENT` | 有事要講但沒有管道 | 同上。訊息內容仍在 log 裡 |
| `notify: slack 404: no_team` / `403` | webhook 失效或被撤銷 | 在 Slack 重新產一條，更新 secret |
| `DOWN  admin-guard … HTTP 200, expected 401` | **不是掛掉，是資安退化** | 後台 API 對外開了，優先處理 |
| `DOWN  content-manifest … body is not JSON` | 內容檔沒掛上，SPA fallback 回了 HTML | 檢查 `content/` 的 bind-mount |
| workflow 變灰、不再自動跑 | GitHub 對 60 天沒動靜的 repo 自動停排程 | Actions 分頁按 Enable |

真的要收一封告警確認端到端是通的，就把 `probe.config.json` 裡
`admin-guard` 的 `expectStatus` 暫時改成 `999`、跑一次 workflow（不打 dry_run）、
收到 Slack 之後改回來。**不要**為了測試去動正式機。

---

## 二、本機怎麼跑（⛔ 不要對著正式站跑）

```bash
pnpm --filter @ggd/uptime-probe test        # 守衛
pnpm --filter @ggd/uptime-probe typecheck
```

要手動探測的話一律加 `--dry-run`，或者自己寫一份指向 `127.0.0.1` 的 config：

```bash
pnpm --filter @ggd/uptime-probe probe -- \
  --config /private/tmp/my-probe.json --state /private/tmp/state.json --dry-run
```

離開碼：`0` 全好、`1` 有 `page` 目標掛了（或告警送不出去）、`2` config 壞了。

---

## 三、設計上的四個決定，以及理由

### 1. 為什麼從 GitHub Actions 探測

| 選項 | 判決 |
|---|---|
| **GitHub Actions** | ✅ 已經是部署的來源、在機器外、secret 是一等公民、不用多養機器 |
| 那台 GCP VM 自己 | ❌ **VM 掛了探測也掛了** —— 沉默和健康長得一模一樣 |
| owner 的 Mac | ❌ 會睡、會被帶出門 |
| 另一台 VM | ❌ 要錢，而且它自己也需要被監控 |

**接受的殘留風險**：GitHub Actions 自己掛掉時，監控跟著掛，而且沒有人會說。
這是最便宜方案的代價，寫下來是為了它是「知道的」而不是「漏掉的」。

### 2. 為什麼是「一次執行內連續 N 次」而不是「連續 N 次排程」

Actions 的 job 沒有記憶，而且 cron 是 best-effort（會被延遲）。「連續 3 次排程失敗」
在這種環境下不是一個可以推理的量。改成一次 job 內打 `attempts` 次、間隔
`attemptDelayMs`，門檻就是一段以秒計、每次都一樣的窗口 —— 目前是
**3 次 × 20 秒**，一次網路抖動吸得掉，真的掛了 40 秒後就叫人。

健康的目標只打 **1 次**就結束（第一次成功就 return），所以重試預算只在出事時才付。

### 3. 為什麼參數在 committed JSON 而不是後台頁

專案守則是「編輯器可調優先」，這裡是**刻意的例外**，理由只有一條：

> ⚠️ **探測不能依賴被探測的東西。**

後台的設定存在平台的 jsonstore 裡，就在 `ggd.adms.ai` 上。一個要先跟
`ggd.adms.ai` 拿間隔、閾值、通知對象的探測，會在 `ggd.adms.ai` 掛掉的那一刻
一起瞎掉 —— 正好是這張單存在的理由。（#241 是同一個形狀的下一層：Go 這一側
消費的 config 接不上 content-overlay。）

所以每個決策點**還是欄位**，只是欄位放在 runner 開工前就已經在手上的檔案裡。
唯一的 secret（webhook）不在裡面，走環境變數。

### 4. 排程同時是一筆帳

repo 是 **private**，Actions 分鐘要錢，而且**每個 job 都往上取整到整分鐘**。所以
`*/15` 改成 `*/5` 不是「快三倍」，是「貴三倍」：

| 間隔 | 次/月 | 至少幾分鐘 |
|---|---|---|
| 每 5 分 | 8,640 | ≥8,640 |
| 每 15 分 | 2,880 | ≥2,880 |
| 每 30 分 | 1,440 | ≥1,440 |
| 每小時 | 720 | ≥720 |

現在的兩條 cron：台北 18:00–23:59 每 15 分（24 次）＋ 其餘 18 小時每小時
（18 次）＝ **42 次/天 ≈ 1,260 分鐘/月**，Free 方案 2,000 分鐘還剩下給 `ci.yml`。
`src/scheduleDrift.test.ts` 會把 workflow 的 cron、config 的 cron、跟宣稱的
42 次/天三者對起來 —— 改了 cron 忘了改預估值，測試就紅。

---

## 四、探什麼，以及「只回 200 等於沒探測」

| id | 端點 | 真的證明了什麼 |
|---|---|---|
| `edge` | `/healthz` | **只有** edge 容器活著。`nginx.conf:559` 自己回 `200 ok`，根本沒碰到後面 |
| `client` | `/` | SPA 外殼真的被送出（比對 `id="hud-root"`） |
| `platform` | `/api/v1/healthz` | ⚠️ **只有** Go 行程活著 + router 解得開 |
| `platform-store` | `/api/v1/curation/whitelist` | 一路走到**持久層**，而且白名單不是空的 |
| `content-manifest` | `/content/manifest.json` | 內容真的掛著（parse 得動 JSON，不是 SPA fallback 的 HTML） |
| `admin-guard` | `/api/v1/admin/accounts` | **回歸檢查**：期望 401。回 200 = 後台 API 對外開了 |
| `game-sim` | *(尚不存在)* | ❌ 停用中，見下 |

`apps/platform/internal/server/server.go:511` 的 `/healthz` 回的是**寫死的**
`{"status":"ok"}`：

```go
api.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
    httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
})
```

它**不可能**在行程還活著的時候失敗，不管後面的 redis / jsonstore /
content overlay 壞成什麼樣。這就是 CLAUDE.md 第③種失敗形態的基礎設施版：
「可以從渲染樹刪掉但測試還是全綠」，換成「服務可以壞掉但探測還是綠的」。

所以 `platform-store` 與 `content-manifest` 是**補償**：它們斷言的是服務**算出來的**
東西，不是狀態碼。真正的修法（讓 healthz 自己說實話）在
`apps/platform/internal/server/`，那是別人的領域，寫在這張單的 openQuestions 裡。

`game-sim` 那筆停用中且 URL 是佔位的：`apps/game-server/src/index.ts:187` 的
`/healthz` 內容很豐富（`rooms` / `sim.p50-p95-p99` / `shedEvents` /
`platform.degraded` / 每份文件的 content 新鮮度），但 `nginx.conf` 只把
`/colyseus/` 與 `/ws/` 代理到 `game:2567`，**叢集外讀不到**。斷言已經照
#124 第 3 點寫好了，等 edge 開一條路由，把 `enabled` 改成 `true` 就上線。

---

## 五、`severity`：page vs warn

- `page` → 進 Slack、把 job 弄紅。
- `warn` → **永遠不會自己觸發通知**，只會在別的東西掛掉時附在同一則訊息後面
  （「⚠️ 同時觀察到」）。

這是為了 #124 的第 3 點：`sim.p99Ms` 與 `shedEvents` 要看得見，但「tick 稍微慢」
不該在半夜三點打電話給人。要升級成會叫人，把那筆的 `severity` 改成 `page`。

## 六、告警不會洗版

`repeatAlertAfterMinutes`（預設 60）：同一個目標持續掛著時，最多每 60 分鐘再叫
一次。恢復時發一則 ✅ 並把記憶清掉。

記憶存在 GitHub Actions cache（`uptime-state-*`）。**cache miss 是安全的**：沒有
記憶就當成剛掛，於是會叫 —— 失憶的監控應該變大聲，不是變安靜。

## 七、secret 不會進 log

GitHub Actions 的 log 是留著的，而 Slack incoming webhook 是一條**bearer URL**：
誰拿到誰就能永遠往你的頻道貼東西，而且不能縮限、不能設到期。

`src/notify.ts` 的 `makeRedactor` 會把 (1) 整條 URL、(2) 它的每一段路徑、
(3) 任何 `hooks.slack.com/services/…` 通通換成 `***`，而**工具送出的每一行**
（含 crash 時的 stack trace）都會先過它。`notify.test.ts` 用一條真實形狀的假
webhook 驅動一次失敗的 POST，斷言輸出裡連 token 片段都找不到。

GitHub 自己也會遮蔽 registered secret，但那是第二層，不是第一層。
