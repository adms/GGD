# Runbook — 外部健康探測與告警（GH#124）

**Symptom this closes:** 服務掛了，要等家人在 LINE 上說「打不開」才知道。

**完整 runbook 在工具旁邊**：[`tools/uptime-probe/README.md`](../../tools/uptime-probe/README.md)
（設 secret、開 workflow、驗一次、每種錯誤怎麼修）。這一頁只放「現在是什麼狀態」
與「哪些事還沒做」，好讓營運面的問題在 `docs/runbooks/` 一次找得到。

---

## 現況一句話

`.github/workflows/uptime.yml` 每 15 分鐘（台北 18:00–23:59）／每小時（其餘時間）
從 **GitHub Actions**（不是那台 GCP VM）打 `ggd.adms.ai` 的 6 個端點，
**連續 3 次 × 20 秒全失敗**才發 Slack。

| 東西 | 在哪 |
|---|---|
| 探測腳本 | `tools/uptime-probe/src/` |
| 可調參數（間隔／閾值／通知對象／目標） | `tools/uptime-probe/probe.config.json` |
| 排程 | `.github/workflows/uptime.yml` |
| 守衛 | `tools/uptime-probe/src/*.test.ts`（CI 的 `unit` job） |
| Webhook | GitHub Actions secret，**不在 repo 裡** |

## 上線前 owner 還沒做的事

1. 設 `GGD_UPTIME_WEBHOOK_URL`（或沿用既有的 `GGD_SLACK_WEBHOOK_URL`）secret。
2. Actions 分頁把 `uptime` workflow 打開。
3. 用 `Run workflow` + `dry_run` 打勾驗一次接線。

沒做這三件事之前，這套東西不會叫任何人 —— 它會照跑、照樣把 job 弄紅，但沒有推播。

## 還沒補上的洞（不是這張單能修的）

- **`/api/v1/healthz` 回的是寫死的 `{"status":"ok"}`**
  （`apps/platform/internal/server/server.go:511`）。探它只證明 Go 行程活著。
  真正的修法要在 `internal/server/` 加相依檢查，那是另一條工作流的領域。
  目前用 `platform-store`（`/api/v1/curation/whitelist`，會走到持久層）與
  `content-manifest`（parse 得動 JSON 才算過）**繞過去補償**。
- **game-server 的 `/healthz` 讀不到。** 它有 `sim.p99Ms` / `shedEvents` /
  `platform.degraded`（`apps/game-server/src/index.ts:187`），但 `nginx.conf`
  只把 `/colyseus/` 與 `/ws/` 代理到 `game:2567`。斷言已經寫好放在
  `probe.config.json` 的 `game-sim` 目標裡、`enabled: false`；edge 開了路由之後
  改一個布林就上線。
- **監控與 GitHub 共用失敗域。** Actions 掛掉時監控跟著掛，而且沒有人會說。
  這是最便宜方案的已知代價。
- **GitHub 會在 repo 連續 60 天沒動靜時自動停掉排程 workflow。**
  真的靜下來的話，Actions 分頁按 Enable。

## 相關

- #209 Slack 待審註冊通知 —— 同一條 webhook 可以重用（`internal/approvelink/slack.go`）
- `tools/lan-probe.sh` —— 手動的 LAN 曝露檢查，不是排程探測
- `docs/_延遲改進計畫.md` 1-1 —— 「線上有沒有在無聲丟 tick」，等 `game-sim` 目標啟用
