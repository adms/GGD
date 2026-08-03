# 錄影到底有沒有在寫？（GH#170 runbook）

> 這一份是**給 owner 在正式機上貼指令用的**。改法與程式碼在
> `apps/game-server/src/replay/replayHealth.ts`。
>
> ⚠️ 這裡每一條指令都要在 **ggd.adms.ai 那台機器上**跑。不要在本機跑然後以為
> 結果一樣 —— 這張單的整個重點就是「本機有錄影不代表正式機有」。

---

## 0. 一句話：這張單在講什麼

GH#170 說「正式機錄影可能仍在靜靜失敗」。**量過了，是真的可能，而且比單子寫得更糟。**

把 `GGD_REPLAY_DIR` 指到一個這個 process 建不了檔的目錄
（＝ docker bind mount 由 root 建立、容器卻用 `USER node` 跑，就是這個形狀），
然後打一場：

| 東西 | 修之前的結果 |
|---|---|
| `MatchRecorder.open()` | **回傳一個看起來很正常的 recorder**（不是 null） |
| 磁碟上的檔案 | 一個都沒有 |
| 唯一的輸出 | **一整場一行** `console.error` |
| `GET /healthz` | `{ ok: true, … }` —— 從頭到尾沒變過 |
| 後台「對戰回放」 | 空的表格 —— 讀起來像「還沒人打」，不像「所有錄影都掉了」 |

為什麼 `open()` 會成功：`mkdir(recursive)` 對已存在的目錄是 no-op，而
`createWriteStream` 是**非同步**開 fd 的 —— EACCES 在 `open()` 回傳之後才到。

---

## 1. 三十秒健檢（先跑這個）

在正式機上：

```bash
curl -s localhost:2567/healthz | jq '{ok, replay}'
```

> `:2567` 是 game 容器對 host 綁的 port（`docker/compose.family.yaml` 裡
> `127.0.0.1:2567:2567`）。**只綁在 loopback，所以要在那台機器上跑，不能從外面打。**
> 如果 `jq` 沒裝：`curl -s localhost:2567/healthz | python3 -m json.tool`

### 一切正常長這樣

```json
{
  "ok": true,
  "replay": {
    "ok": true,
    "reason": null,
    "dir": "/data/replays",
    "writable": true,
    "opened": 4,
    "recorded": 4,
    "bytesWritten": 5217834,
    "consecutiveFailures": 0,
    "lastFailure": null
  }
}
```

### 壞掉長這樣 —— 這就是 GH#170 的簽名

```json
{
  "ok": false,
  "replay": {
    "ok": false,
    "reason": "replay directory is not writable: EACCES: permission denied, open '/data/replays/.write-probe-1-…'",
    "dir": "/data/replays",
    "writable": false,
    "opened": 12,
    "recorded": 0,
    "bytesWritten": 0
  }
}
```

**看兩個數字就夠：`writable` 和 `bytesWritten`。**
`opened` 一直加、`bytesWritten` 卡在 0 = 每一場都開了錄影、一個 byte 都沒落地。

`writable` 不是問權限位元，是**開機時真的建一個檔再刪掉**的結果
（`probeReplayDirWritable()`）。`access(W_OK)` 在唯讀 mount 和磁碟滿的時候都會
回答「可以」，所以不能用。

---

## 2. `writable: false` 的時候怎麼修

### 2-1 先看是誰的問題

```bash
# 容器裡看到的
docker compose -f docker/compose.family.yaml exec game sh -c \
  'id; ls -ld /data/replays; touch /data/replays/.t && echo "WRITE OK" && rm /data/replays/.t'

# host 上看到的
ls -ld ~/GGD/data/replays
```

預期：容器裡 `id` 印 `uid=1000(node)`（`docker/game.Dockerfile` 的 `USER node`）。
如果 host 那一行印的**不是** uid 1000，那就是這張單講的那個坑 —— 目錄是別人的，
容器裡的 `node` 寫不進去。2026-08-03 在線上量到的實際擁有者是 **65532**，
那是**更早的映像**用的 uid（目錄不存在時由 docker daemon 建，之後就一直是那個）。

### 2-2 修

⚠️ **`scripts/host-deploy.sh` 從 2026-08-03（GH#269）起會自己做這一段。**
部署時 `replay.writable` 不是 `true`，腳本會自己 chown → 重啟 →
**重讀 `/healthz` 重驗**，仍然不過才回非零。下面是同一件事的手動版，
給「不想跑整支部署腳本」的時候用：

```bash
docker exec -u root ggd-game-1 chown -R 1000:1000 /data/replays
docker exec -u root ggd-game-1 chmod 755 /data/replays
docker restart ggd-game-1
```

> **不需要 host 的 sudo。** 這是**容器自己的 root** 改**容器自己的掛載點**，
> 走的是 docker 權限（跑得動 compose 的人本來就有），不是主機提權。
> owner 2026-08-03 對「請你在主機上跑一次 sudo」的回覆是「**無法**」——
> 所以在這個專案裡，任何以 `sudo` 開頭的修法等於「不會被執行」。
>
> `1000` 是 `node` 在 `node:22-alpine` 裡的 uid。不要用 `chmod 777` ——
> 錄影檔帶著每一個玩家的顯示名稱。

### 2-3 確認修好了

```bash
docker compose -f docker/compose.family.yaml logs --tail=50 game | grep '\[replay\]'
curl -s localhost:2567/healthz | jq '.replay.writable'
```

開機那一行現在會直接說：

```
[replay] recordings in /data/replays (writable=true)
```

壞的時候會是一行大聲的：

```
[ggd.replay] phase=probe dir=/data/replays writable=false — NO MATCH ON THIS SHARD WILL BE RECORDED. …
```

---

## 3. 打完一場之後驗「這一場真的錄到了」

```bash
# 1) 計數器有沒有動
curl -s localhost:2567/healthz | jq '.replay | {opened, recorded, bytesWritten, consecutiveFailures}'

# 2) 檔案真的在
docker compose -f docker/compose.family.yaml exec game ls -lt /data/replays | head

# 3) 後台列得出來（從那台機器上打，走 platform 的 admin proxy）
```

`recorded` 要 +1，而且目錄裡要多一個 `<matchId>.jsonl.gz`。
**只看 `opened` 沒有用** —— 那是 GH#170 唯一會動的數字。

---

## 4. 出事的時候 grep 什麼

```bash
docker compose -f docker/compose.family.yaml logs game 2>&1 | grep ggd.replay
```

每一行都是固定格式，帶著這一次的事件**和累計值**：

```
[ggd.replay] phase=write id=m_01KYA… dir=/data/replays consecutive=3 failures=3 \
  opened=3 recorded=0 bytesWritten=0 ok=false err="EACCES: permission denied" \
  — recording failed; the match is unaffected
```

`phase` 有這幾種：

| phase | 意思 | 算不算「錄不到」 |
|---|---|---|
| `probe` | 開機寫入探測失敗 | ✅ 直接判定不健康 |
| `open` | 連 stream 都開不起來 | ✅ |
| `collision` | 同一個 id 有兩個 writer（拒絕第二個） | ✅ |
| `write` | 打到一半 stream 錯了 ← **GH#170 量到的那個** | ✅ |
| `backlog` | 裝置跟不上，自己主動放棄 | ✅ |
| `seal` | 收尾（footer/close）丟例外 | ✅ |
| `compress` | gzip 失敗 | ❌ 未壓縮的 `.jsonl` 還在，還是能播 |
| `prune` | 保留策略清理失敗 | ❌ 跟錄影本身無關 |

日誌有節流（前 5 筆，之後每 50 筆），**但計數器每一筆都算**
—— 這是 #272 學到的：沒節流的 warn 跟沒有 warn 一樣沒用。

---

## 5. 後台可調的三個開關

都是 `docker/compose.family.yaml` 的 `game.environment`，改完 `restart game`。

| 環境變數 | 預設 | 它決定什麼 |
|---|---|---|
| `GGD_REPLAY_UNHEALTHY_AFTER` | `3` | **連續**幾場錄不到才算不健康。1 次可能只是那一場磁碟滿；3 次連續是部署壞了。範圍 1–1000，超出自動夾住。 |
| `GGD_REPLAY_REQUIRED` | `1`（要） | 這台 shard 錄影算不算必要。設 `0` 之後 `ok` 不會因為錄影而變 false，但 `reason` **還是會照講** —— 藏起來就等於把 GH#170 重新做一遍。 |
| `GGD_REPLAY_HEALTHZ_STATUS` | `200` | 錄影壞掉時 `/healthz` 回的 HTTP 狀態碼。 |

### ⚠️ 為什麼預設是 200 而不是 503

`Recorder.ts` 的契約是「**壞掉的錄影絕對不可以弄壞一場遊戲**」。
如果哪天有人把 liveness probe 接到這個狀態碼上，一個寫不進去的 mount 就會開始
**殺掉一台上面有十二個家人在打的 shard** —— 正好把那條契約反過來。

所以：**body 永遠說實話，狀態碼預設不動**。
真的接了**監控**（不是 liveness）探針的人，才把它設成 `503`。

> 現況查證：helm 的 game deployment 用的是 `tcpSocket` 探 WS port
> （`deploy/helm/ggd/templates/game-deployment.yaml`，註解寫著 `/healthz` 還沒
> 保證存在），family 的 compose 根本沒有 probe。所以**今天沒有任何東西**會因為
> 這個狀態碼而重啟。

---

## 6. ⚠️ 本機的 `data/replays` 不是證據

本機量到 95 個檔，聽起來很健康。實際上：

- 71 個是 `dev-*`（本機開發時的 dev 路徑）
- 剩下的一堆是**測試產物** —— `m.jsonl`、`m-bare.jsonl`、`seat-name.jsonl`、
  `sec-room.jsonl`、`verify-555000999.jsonl.gz`、`m-legacy.jsonl`…
- 只有 3 個 `m_*.jsonl.gz` 看起來像真的打完的比賽

`apps/game-server/src/analytics/testSetup.ts` 的檔頭自己就寫了：
「`data/replays/` 已經發生過 —— 那裡 95 個檔幾乎全是測試產物」。
**#207 已經替 `data/match-stats/` 加了 `GGD_MATCH_STATS ??= "0"` 的閘，
但 `data/replays/` 至今沒有對應的閘**（見 openQuestions）。

結論：**本機那 95 個檔，一個都不能拿來證明正式機在錄。**
唯一的證據是第 1 節那個 curl。

---

## 7. 開關本身（owner 2026-08-02「請幫我預設打開」）

在 2026-08-02 之前，錄影**完全沒有開關** —— `MatchRoom.onCreate()` 無條件開錄影
檔，落地間隔 `500` 與保留量 `200/30` 寫死在程式裡。所以「預設打開」在程式上一直
是真的，owner 之所以覺得它是關的，是第 1 節那個 EACCES。

現在它是一份可調的內容文件：**後台 → 系統設定 → 對戰錄影**
（`content/config/replay.json`，schema `config.replay@1`）。

| 欄位 | 出貨 | 它決定什麼 |
|---|---|---|
| `enabled` | `true` | 錄不錄。⚠️ **讀不到文件也是 `true`** —— fail-open，理由見 `packages/shared/src/content/replayPolicy.ts` 檔頭：內容載入失敗不可以順手把錄影關掉。 |
| `flushIntervalMs` | `500` | 多久把緩衝交給磁碟一次 ＝ **程序被硬砍時最多丟幾秒**。範圍 50–10000。 |
| `retainMaxFiles` | `200` | 磁碟上最多留幾份。 |
| `retainMaxAgeDays` | `30` | 超過幾天一律刪（與上一格取先觸發的）。 |

⚠️ **要重啟 game shard 才生效**（`Configs` 是開機時載入的登錄表），和
`config.stat-caps@1` 同一個狀態。逐台 shard 的逃生門是 `GGD_REPLAY_ENABLED=0`，
它壓過內容。

### 「玩到一半就離開」到底怎麼落地的

錄影檔是**邊打邊寫**的：`.jsonl` 從第一 tick 就在磁碟上，每 `flushIntervalMs`
交出一段。所以中途離場／斷線本來就有一份可播的錄影，只是沒有結尾那一行，
後台列表標成「未完成」。

2026-08-02 補掉的是**最後一段**：`MatchRoom.onDispose()` 以前是
`onDispose(): void` + `void rec?.abandon()`（射後不理），而 Colyseus 的
`gracefullyShutdown()` 會 `await` 這個方法 —— 所以 SIGTERM（`docker compose
restart`、部署、OOM）之後，程序可以在最後一次 flush 落地之前就結束。現在它回傳
Promise 並等到串流真的關好。守衛：
`apps/game-server/src/replay/replayDefaultAndLeave.test.ts`。

### 為什麼 bind mount 會是 root 的（第 2 節那個坑的根因）

`docker/compose.family.yaml` 把 host 的 `data/replays` mount 到 `/data/replays`。
**那個目錄不存在時是 docker daemon 用 root 建的**，而 `docker/game.Dockerfile`
第 61 行是 `USER node`（`node:22-alpine` 裡 `node` 是 uid 1000）。
root:root 0755 的目錄，uid 1000 建檔就是 EACCES。

`scripts/host-deploy.sh` 把 `/healthz` 的 `replay.writable` 列為**後置條件**。
2026-08-03（GH#269）起它不只是回報，而是**自己修完再重驗**：

```bash
docker exec -u root ggd-game-1 chown -R 1000:1000 /data/replays
docker exec -u root ggd-game-1 chmod 755 /data/replays
docker restart ggd-game-1 && sleep 12
# 然後重讀 /healthz —— 重驗還是不過才 die（那時候根因就不是擁有者了：
# 查唯讀掛載 / 磁碟或 inode 滿 / SELinux）
```

⚠️ 這一段原本寫著「修法本身仍然要 owner 手動跑，**因為它需要 sudo**」。
那句話是假的（第三守則）：`docker exec -u root` 走的是 docker 權限，不是主機提權。
而它的代價是真的 —— owner 2026-08-03 對「請你跑一次 sudo」的回覆是「**無法**」，
所以那個修法從來沒有被自動化，而**手動 chown 一次只治那一次**（擁有者是舊映像
留下來的 65532，換映像／重建目錄它就回來），這個缺陷因此復發過。

⚠️ **重驗那一步才是重點，不是 chown。** 只修不重讀 `/healthz`，就是把一個沒驗證
的修法當成成功 —— 跟這張單第 1 節在講的是同一個形態。
守衛：`packages/shared/src/ops/hostDeployScript.test.ts`（三個突變都驗過會紅）。
