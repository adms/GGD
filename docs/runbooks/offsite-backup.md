# 離機備份 Runbook（GH#123）

> `data/` 是家人的帳號、密碼雜湊、藍水晶、排行榜、邀請碼與對戰回放。
>
> ⚠️ **備份不是 `cp -r ./data`。** 那句話曾經寫在 `data/.gitkeep` 的註解裡，而它錯了兩層：
> ① 在部署主機上，執行期檔案屬於**容器的 uid**，主機端直接複製會拿到 `Permission denied`；
> ② 複製到同一顆磁碟上根本不算備份。
>
> ⚠️⚠️ **而且那個註解本身就是一顆部署地雷 —— 2026-07-31 真的引爆過。**
> `data/.gitkeep` 是一個**被 git 追蹤、卻住在容器擁有的 bind mount 裡**的檔案。
> v0.9.16 只改了它的註解，主機 `git pull` 就死在
> `error: unable to unlink old 'data/.gitkeep': Permission denied` ——
> 而那台機器的 `sudo` 要密碼，所以連 `chown` 都做不了。
> **規則：`data/` 底下那個 `.gitkeep` 是佔位符，不要往裡面寫任何會變動的內容。**
> 要寫說明就寫在這一份 runbook 裡。
> 它現在只存在於 **一台** GCP VM 的 **一顆** 磁碟上。這份文件是把它弄出去的做法。
>
> 指令都是給 **owner 在正式機上跑** 的。⛔ 測試一律在 localhost 或暫存目錄。

---

## 0. 現況（2026-07-30 實查，不是轉述）

`grep -rniE "gsutil|gcloud storage|rclone|restic|borg|aws s3|offsite"` 對
`apps/ docker/ deploy/ .github/ Makefile package.json` **零命中**；
`.github/workflows/` 只有 `ci.yml`；全 repo 沒有任何 `*.timer` / `*.service` / crontab。
**在這份 runbook 之前，離機備份是零。**

### `data/` 底下有什麼（本機 2026-07-30 量測）

| 目錄 | 大小 | 可再生？ | 掉了會怎樣 |
|---|---:|---|---|
| `accounts/` | 240 KB | ❌ **不可再生** | 家人登不進去。密碼雜湊在這裡 |
| `walletmeta/` | (含在上面量測外) | ❌ **不可再生** | 藍水晶餘額與最愛歸零 |
| `curation/` | 12 KB | ❌ 不可再生 | 白名單沒了 → 平台**拒絕以空名單對外開機** |
| `matches/` | 24 KB | ❌ 不可再生 | 對戰紀錄／排行榜來源沒了 |
| `match-stats/` | 76 KB | ❌ 不可再生 | 後台覆盤帳本空白 |
| `admin-audit/` | 4 KB | ❌ 不可再生 | 稽核紀錄斷掉 |
| `replays/` | **126 MB** | ❌ 不可再生 | 錄影沒了（owner 明列為不可再生） |
| `blizzard-overlay/` | **91 MB** | ✅ 可再生 | 從 laptop `make family-ship HOST=…` 重推 |
| `icon-src-original/` | 16 MB | ✅ 可再生 | 本機素材產線存檔，主機上根本沒有 |
| `content-backups/` | 16 KB | ✅ 可再生 | dev content-api 的本機備份，主機沒跑 |
| `journal/` | 4 KB | ⚠️ 刻意不帶 | 結算 WAL；帶去新主機會重播舊結算 |
| **合計** | **233 MB** | | |

> ⚠️ 這是 **owner 的 laptop** 的數字，不是正式機的。正式機沒有
> `icon-src-original` / `content-backups`，`replays` 會隨場次成長，
> `accounts` 會隨家人成長。要量正式機請看 §6 的第一條指令。

### 為什麼備份包只有 **15 MB** 而不是 233 MB

`platformarchive` 只帶**平台真值**，而且 ZIP 會壓縮：

| 內容 | 未壓縮 | ZIP 後 |
|---|---:|---:|
| `-groups core`（帳號／水晶／白名單／邀請碼／設定…） | 18,609 B | **21,822 B** |
| `-groups all`（再加對戰／履歷／稽核／126 MB 回放） | 131,953,069 B | **15,028,782 B** |

（本機實測，2026-07-30。`core` 的 ZIP 比未壓縮大，是因為 58 個小 JSON 各自的
ZIP header 比檔案本身還佔空間 —— 這是正常的，不是錯誤。）

**每天一包 15 MB、留 30 份 = 450 MB。** GCS Standard（asia-east1）約
US$0.02/GB/月 ⇒ **每月不到 US$0.01**。成本不是這件事的考量。

---

## 1. 這件事跟 #243 的關係（不要重做已經有的東西）

**#243 已經做完了「格式」與「還原路徑」**：
`apps/platform/internal/platformarchive/`（export / inspect / plan / apply /
backup / restore）＋ 烤進映像的 `/platformarchive` 執行檔＋後台按鈕。
它知道哪些是真值、哪些是衍生、哪些是**絕對不能帶走的密鑰**
（`config/ai-provider`、`config/slack-notify`）。

**#243 沒有的，就是 #123 標題那兩件事**：

|  | #243 | 這份 runbook |
|---|---|---|
| 觸發 | 人按按鈕 | cron |
| 落點 | **同一顆磁碟**（`data/_migration/backups/`） | **離開這台機器** |
| 保留 | 為「一年一兩次移機」調的（TTL 90 天 / MinKeep 3） | 為「每天一次」另訂 |

所以 `tools/deploy/ggd-backup.sh` **呼叫** #243 的匯出器，不自己序列化資料。
理由寫在腳本檔頭：自己再寫一份等於多一條**沒有人驗證過的還原路徑**。

### ⚠️ 備份包**不含**的東西，以及各自怎麼辦

| 沒帶走 | 為什麼 | 掉了怎麼救 |
|---|---|---|
| `config/ai-provider` | 明文 API key | 到後台「AI 生成設定」重新輸入 |
| `config/slack-notify` | Slack webhook 是密鑰 | 到後台重新輸入 |
| `docker/.env` | 不是平台資料，是主機密鑰 | `make family-secrets` 重生（**代價：全家被登出一次**） |
| `journal/` | 結算 WAL，重播會重算舊結算 | 不需要救 |
| `owner-setup-token` | 一次性擁有者宣告權杖 | 新主機自己會產一顆 |
| `blizzard-overlay/` | 91 MB 素材，隨部署走 | laptop `make family-ship HOST=…` |

**這是刻意的**，不是漏掉。把 API key 每天丟一份到 bucket 是把單點故障換成
長期外洩。要備份 `docker/.env` 的話，用隨身碟手動做一次就夠了 —— 它幾乎不變。

---

## 2. 一次性設定（owner 在正式機跑）

### 2a. 建 bucket 並授權 —— ⚠️ 這裡有一個會讓你以為「授權好了」的坑

GCE VM 預設的 access scope 常常是 **`devstorage.read_only`**。
IAM 角色給對了，`gcloud storage cp` 還是會 403，而且錯誤訊息長得像權限問題，
不像 scope 問題。**IAM 與 scope 兩個都要對，缺一個就是 403。**

在**你自己的電腦**（有 gcloud、已登入該專案）跑：

```sh
PROJECT=$(gcloud config get-value project)
BUCKET=ggd-backup-$PROJECT          # 名字全球唯一，可自己改
ZONE=asia-east1-b                   # 換成 VM 實際的 zone
VM=<VM 名稱>                        # gcloud compute instances list 查

# 1) 建 bucket（同區、單一區域、開版本控制）
gcloud storage buckets create "gs://$BUCKET" \
  --project="$PROJECT" --location=asia-east1 --uniform-bucket-level-access
gcloud storage buckets update "gs://$BUCKET" --versioning

# 2) 查 VM 掛的 service account
SA=$(gcloud compute instances describe "$VM" --zone "$ZONE" \
     --format='value(serviceAccounts[0].email)')
echo "VM service account: $SA"

# 3) 只在這個 bucket 上給寫入權（不是專案層級）
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:$SA" --role="roles/storage.objectAdmin"

# 4) ⚠️ 檢查 scope。輸出若沒有 devstorage.read_write 或 cloud-platform，往下做
gcloud compute instances describe "$VM" --zone "$ZONE" \
  --format='value(serviceAccounts[0].scopes)'
```

若 scope 不夠（**要停機，約 1 分鐘，家人會斷線**）：

```sh
gcloud compute instances stop "$VM" --zone "$ZONE"
gcloud compute instances set-service-account "$VM" --zone "$ZONE" \
  --service-account="$SA" --scopes=cloud-platform
gcloud compute instances start "$VM" --zone "$ZONE"
```

**預期輸出**：`buckets create` 印 `Creating gs://…/`；
`add-iam-policy-binding` 印更新後的 policy（含剛加的那一行）；
scope 那行最後要看得到 `devstorage.read_write` 或 `cloud-platform`。

**出錯怎麼辦**
- `AlreadyExists` → bucket 名字被別人用了，換一個。
- `does not have storage.buckets.create` → 你的帳號沒權限，不是 VM 的問題。
- 停機這步做不了（家人正在打）→ 改用 §2a-alt。

#### 2a-alt. 不想改 scope：改推到你自己的電腦

不需要任何雲端憑證。在 **VM** 上產一把只給備份用的 key，把公鑰放進你電腦的
`~/.ssh/authorized_keys`，然後：

```
GGD_BACKUP_DEST=rsync
GGD_BACKUP_DEST_URI=you@your-mac.local:/Users/you/ggd-offsite
```

代價：你的電腦要開著才收得到，而且錯過的那天**不會自己補**（`status` 會叫）。

### 2b. 在正式機放設定檔

```sh
ssh can@<host>
cd ~/GGD && git pull --ff-only origin main

mkdir -p ~/.config/ggd
cp docker/backup.env.example ~/.config/ggd/backup.env
chmod 600 ~/.config/ggd/backup.env
```

編輯 `~/.config/ggd/backup.env`，**至少**改這兩行：

```sh
GGD_BACKUP_DEST=gcs
GGD_BACKUP_DEST_URI=gs://ggd-backup-<PROJECT>/ggd
```

> 用 `~/.config/ggd/` 不是 `/etc/ggd/`：這台主機的 `sudo` 要密碼，
> 寫 `/etc` 的步驟你在 ssh 裡做不完。腳本兩個位置都會找，`/etc` 優先。

確認讀進去了：

```sh
~/GGD/tools/deploy/ggd-backup.sh config
```

**預期輸出**（重點三行）：

```
config file : /home/can/.config/ggd/backup.env
dest        : gcs
dest uri    : gs://ggd-backup-<PROJECT>/ggd
```

**出錯怎麼辦**：`config file : (none …)` = 檔案沒在那兩個路徑，或沒有讀取權限。

### 2c. 手動跑第一次

```sh
~/GGD/tools/deploy/ggd-backup.sh run
```

**預期輸出**：

```
→ exporting (source=auto, groups=all) → /home/can/ggd-backups/ggd-platform-20260730T…Z.zip
  （這裡會夾雜 platformarchive 自己的中文報告：帳號 N 個、白名單 1 個、未帶走…）
→ reading the archive back with `platformarchive inspect`
→ shipping off-machine: gcs gs://ggd-backup-…/ggd/ggd-platform-20260730T…Z.zip
✓ verified off-machine: 15028782 B at gs://…
✓ backup complete — /home/can/ggd-backups/.state/last-success.json updated
```

**出錯怎麼辦**

| 訊息 | 意思 | 怎麼修 |
|---|---|---|
| `GGD_BACKUP_DEST is 'none' — refusing to run` | 設定檔沒被讀到，或沒改 | 回 §2b，先跑 `config` |
| `exec into the running platform failed; falling back…` | 平台容器沒跑 —— **這不是錯誤**，備份會用一次性容器完成 | 順便查 `docker compose … ps` |
| `archive is N B, below GGD_BACKUP_MIN_BYTES` | 匯出串流被截斷 | 看 `docker compose … logs platform` |
| `the archive does not parse` | 拿到的不是合法封存檔 | 同上；**不要**關掉 `GGD_BACKUP_INSPECT** |
| `nothing is readable at gs://… after the copy` | 上傳「成功」但物件不在 → **就是 §2a 的 scope 坑** | 回 §2a 第 4 步 |
| `size mismatch off-machine` | 上傳只到一半 | 直接重跑一次；連續兩次就是網路 |

### 2c-bis. 確認「沒有東西被靜默跳過」（第一次一定要做）

匯出器在 platform 容器裡跑，使用者是 distroless 的 `nonroot`（uid 65532）；
但 `data/replays` 是 **game** 容器（`node`，uid 1000）寫的。
理論上檔案是 0644、目錄是 host 建的 0755，所以讀得到 —— **但那是推論，不是量測。**
比一次數字：

```sh
# 主機上實際有幾個回放
docker run --rm -v /home/can/GGD/data/replays:/r:ro alpine sh -c 'ls -1 /r | wc -l'

# 剛剛那包帶了幾個
DC="docker compose -f docker/compose.yaml -f docker/compose.family.yaml --env-file docker/.env"
$DC exec -T platform /platformarchive inspect -in - \
  < ~/ggd-backups/$(ls -1 ~/ggd-backups | grep '\.zip$' | sort | tail -1) | grep -i 回放
```

**預期輸出**：兩個數字一樣。

**不一樣怎麼辦**：權限問題。在 `backup.env` 把 `GGD_BACKUP_SOURCE=run`
（一次性容器）先試一次；還是不行就把回放改成另一條路線（rsync 整個
`data/replays`），並回報 —— 這代表「匯出器讀不到 game 寫的檔案」，
是 #243 的 scope 假設在這台主機上不成立。

> 順帶一提：`GGD_BACKUP_SOURCE=run` 走的是 `docker compose run --rm`，
> 而 compose 有可能把進度訊息混進輸出。**這正是 `GGD_BACKUP_INSPECT=1`
> 存在的理由** —— 真的被混到，封存檔會解析失敗、整次 run 以非零退出，
> 而不是把一包壞檔案送上雲端。不要為了「安靜一點」把它關掉。

### 2d. 裝排程

```sh
~/GGD/tools/deploy/ggd-backup.sh cron        # 印出要貼的那一行
crontab -e                                   # 貼進去存檔
crontab -l                                   # 確認
```

**預期輸出**（`cron` 子指令）：

```
# GGD off-machine backup (GH#123). Install with: crontab -e
# Output goes to a log AND to `… status`, which is what you actually check.
17 4 * * * /home/can/GGD/tools/deploy/ggd-backup.sh run >> $HOME/ggd-backup.log 2>&1
```

> 排程時間改 `GGD_BACKUP_SCHEDULE`，不要改腳本 —— `cron` 子指令是從設定讀的。
> `cron` 只**印**，不會幫你裝：一個會自己改 crontab 的腳本是下次除錯的地雷。

### 2e. 讓 bucket 自己管保留（建議）

```sh
cat > /tmp/lifecycle.json <<'JSON'
{"lifecycle":{"rule":[
  {"action":{"type":"Delete"},"condition":{"age":60}},
  {"action":{"type":"Delete"},"condition":{"isLive":false,"numNewerVersions":3}}
]}}
JSON
gcloud storage buckets update "gs://$BUCKET" --lifecycle-file=/tmp/lifecycle.json
rm /tmp/lifecycle.json
```

然後在 `backup.env` 設 `GGD_BACKUP_KEEP_REMOTE=0`。

**為什麼**：lifecycle 規則在 VM 死掉之後**還會繼續生效**，腳本不會。
保留策略應該住在還活著的那一邊。

---

## 3. 平常怎麼確認它還活著

```sh
~/GGD/tools/deploy/ggd-backup.sh status; echo "EXIT=$?"
```

**預期輸出**：

```
last verified backup: 20260730T041701Z  (6h ago)
  at: gs://ggd-backup-…/ggd/ggd-platform-20260730T041701Z.zip
  bytes: 15028782
✓ fresh
EXIT=0
```

`EXIT=1` 有兩種：`no verified backup has ever completed`（從沒成功過）
或 `STALE`（超過 `GGD_BACKUP_MAX_AGE_HOURS`，預設 36 小時）。

> **這一行才是真正的監控。** cron 的 log 只證明它「跑過」；
> `status` 讀的 `last-success.json` **只有在離機那份被讀回來驗證過之後才會寫**。

每次 deploy 的第 6 步（線上實打）之後順手跑一次，成本 0.2 秒。

---

## 4. 還原演練 —— 沒驗證過的備份等於沒有備份

### 4a. 半年一次的例行演練（不碰正式資料）

```sh
~/GGD/tools/deploy/ggd-backup.sh verify --deep
```

它會：抓**離機**那份最新的 → `inspect` 解析 → `apply` 進一個 `mktemp -d` 的
暫存 DATA_DIR → 數帳號。全程不碰 `~/GGD/data`，結束自動刪暫存。

**預期輸出（最後兩行）**：

```
✓ restore drill: 19 account document(s) came back
✓ verify passed
```

`✗ the restore produced NO account documents` = 那包救不了你，**當成 T0 處理**。

### 4b. 真的從備份重建一台乾淨主機

前提：新機器有 docker、有 repo、`data/` 是空的。

```sh
# 0) 在新機器上取得備份（從 laptop 或直接從 bucket）
gcloud storage cp gs://ggd-backup-<PROJECT>/ggd/ggd-platform-<最新>.zip ./restore.zip

# 1) repo + 密鑰。密鑰是新的一組，不要從舊機複製
git clone <repo> ~/GGD && cd ~/GGD
make family-secrets            # 沒有 make 就照 Makefile 的 family-secrets 手抄

# 2) 素材疊加層（91 MB，不在備份包裡，從 laptop 推）
#    在 LAPTOP 上：make family-ship HOST=user@newhost

# 3) 建映像並先只起 redis
DC="docker compose -f docker/compose.yaml -f docker/compose.family.yaml --env-file docker/.env"
$DC build && $DC up -d redis

# 4) ⚠️ 在任何人註冊之前先匯入 —— 這樣不會有身分衝突要解
$DC run --rm --no-deps -T --entrypoint /platformarchive platform \
    apply -in - -data /data -content /srv/content < ./restore.zip

# 5) 起全部服務。開機時 Redis 索引與排行榜會從帳號 JSON 重建
$DC up -d

# 6) 驗
$DC logs platform | tail -30
$DC logs game | grep "curation:"        # 應該印 "curation: N champion(s) enabled"
docker run --rm -v ~/GGD/data:/d:ro alpine sh -c 'ls /d/accounts/*.json | wc -l'
```

**預期輸出**：第 4 步印 `+ accounts/…` 逐筆清單與 `匯入前備份完成…`；
第 6 步的帳號數要等於備份當下的數字（`status` 那份 JSON 有記）。

**出錯怎麼辦**
- 匯入被拒、說有身分衝突 → 你在第 4 步之前已經註冊過了。
  重來一次並加 `-allow-overwrite -resolve-collisions=adopt-archive`（見
  `docs/runbooks/platform-migration.md` §5.5）。
- 登得進去但英雄選單是空的 → 白名單沒進去，或素材沒推。先看 `curation:` 那行。
- AI 生成／Slack 通知不動 → **正常**，那兩把金鑰刻意不在包裡（§1）。

### 4c. 已經自動化的部分

`tools/deploy/test/ggd-backup.test.ts` 每次 `make test` 都會跑一次
**真的匯出 → 真的離機 → 真的還原 → 數帳號 → 比對藍水晶餘額**
（用 `/private/tmp` 的假 `data/`，不碰任何真實資料）。
所以「還原路徑壞掉」不必等到半年一次的演練才發現。

---

## 5. 每個決策點在哪裡調

全部在 `~/.config/ggd/backup.env`，改完**存檔就生效**（cron 每次重讀）。

| 想改什麼 | 改哪一個 | 預設 |
|---|---|---|
| 多久一次 | `GGD_BACKUP_SCHEDULE`（改完重跑 §2d） | `17 4 * * *` |
| 備份哪些資料 | `GGD_BACKUP_GROUPS` | `all` |
| 存到哪 | `GGD_BACKUP_DEST` / `_DEST_URI` | `none`（**刻意的**） |
| 離機留幾份 | `GGD_BACKUP_KEEP_REMOTE`（`0` = 交給 bucket lifecycle） | `30` |
| 本機留幾份 | `GGD_BACKUP_KEEP_LOCAL` | `3` |
| 多久沒備份要叫 | `GGD_BACKUP_MAX_AGE_HOURS` | `36` |
| 匯出器怎麼跑 | `GGD_BACKUP_SOURCE` | `auto` |

**為什麼是檔案不是後台頁**：後台的設定存在 `data/` 裡 —— 把「備份的設定」
放進「備份要救的東西」裡面，等於要先還原成功才找得到備份在哪。
而且這支腳本在**所有容器之外**、由 cron 執行，它連不上平台 API；
平台本身壞掉的那一晚，正是備份最必須照跑的那一晚。
（另見 #241：後台寫的設定不保證每個消費端讀得到。守則的但書就是
「先確認讀的那一側真的讀得到」，這裡讀的那一側是 `/bin/sh`。）

**後台整合（提案，尚未實作）**：在後台加一張**唯讀**的「備份狀態」卡片，顯示
`last-success.json` 的 stamp / bytes / destUri 與是否 stale。需要平台端一個
`GET /api/v1/admin/backup-status` 讀 `$GGD_BACKUP_STATE/last-success.json`，
而 `internal/server/server.go` 目前有別的工作流在改 —— 見 openQuestions。

---

## 6. 想知道正式機真正的數字時

```sh
# data/ 各目錄大小（用容器讀，避開 uid 不符 + sudo 要密碼）
docker run --rm -v /home/can/GGD/data:/d:ro alpine sh -c 'du -sh /d/* ; echo ---; du -sh /d'

# 帳號數
docker run --rm -v /home/can/GGD/data:/d:ro alpine sh -c 'ls /d/accounts/*.json | wc -l'

# 離機那邊實際存了幾份、多大
gcloud storage ls -l "gs://ggd-backup-<PROJECT>/ggd/"
```

> ⚠️ **不要用主機的 `tar` 直接打包 `data/`**：執行期檔案的 owner 是容器內的
> uid，ssh 使用者 `can` 會拿到 `Permission denied`，而 `sudo` 在這台要密碼。
> 上面每一條都是走「丟一個容器進去用 root 讀」，這是這台主機上唯一穩的做法。
> `ggd-backup.sh` 也是同一個理由才透過容器裡的 `/platformarchive` 匯出。

---

## 7. 相關檔案

- `tools/deploy/ggd-backup.sh` — 腳本本體（檔頭有完整設計理由）
- `docker/backup.env.example` — 設定範本
- `tools/deploy/test/ggd-backup.test.ts` — 守衛（含還原演練）
- `apps/platform/internal/platformarchive/` — #243 的封存格式與還原路徑
- `docs/runbooks/platform-migration.md` — 手動移機（含匯入出錯的解法）
- `docs/family-deploy.md` — 主機部署
