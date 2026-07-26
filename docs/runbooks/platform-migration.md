# 平台資料搬遷 runbook（task #243）

**一句話**：舊主機匯出一個 ZIP，新主機匯入，家人用**原本的帳號密碼**直接登入。

**這個 ZIP 是憑證**。裡面有每一位家人的密碼雜湊、可以直接拿去註冊的邀請碼，以及
管理員權限。用 `scp` 或隨身碟傳，**不要 email、不要聊天軟體、不要雲端硬碟**。搬完
兩邊都刪掉。

> ZIP 的**檔案清單是明文的**。就算一個檔都不解開，`unzip -l` 就能看到全家人的
> 使用者名稱和 email —— 因為登入解析就是拿它們當檔名。這件事沒有工程解，只能講明。

---

## 0. 它和 `opstate`（#179）是兩個東西

| | `opstate` / `make family-restore` | `platformarchive` / 本文件 |
|---|---|---|
| 帶什麼 | 內容白名單 + 戰鬥系統 + 系統運維 | **整棵 data 樹**：帳號（含密碼雜湊）、邀請碼、水晶、排行榜、內容覆蓋層… |
| 刻意不帶 | 帳號、邀請碼 | AI 金鑰、Slack webhook、journal、擁有者權杖、素材包 |
| 用途 | 讓新部署「可以玩」 | 讓新部署「就是原本那一台」 |

`ggd-operator-state` v1 完全沒有動，`make family-restore` 仍然指向它。兩者格式不同、
Kind 不同，互相塞不進去（會被明確拒絕，不會半匯入）。

---

## 1. 主場景：搬到一台全新主機

### 1-1. 在舊主機匯出

```bash
# 在 repo 根目錄（laptop 直接讀 data/）
make archive-export                       # → ggd-platform-archive.zip（只有核心資料）
make archive-export GROUPS=matches,history  # 想連對戰紀錄一起帶

# 或者從跑著的家用主機匯出（走 stdout，不在主機上留檔）
make family-archive-export
```

先看一眼裡面有什麼（**不會寫入任何東西**）：

```bash
make archive-inspect ARCHIVE=ggd-platform-archive.zip
```

`inspect` 會逐條印出「刻意沒帶走的東西」和理由。看到 `blizzard-overlay` 在那份清單
裡是**正確的** —— 素材跟著部署映像走，新主機一開始看起來很空是正常的。

### 1-2. 傳到新主機

```bash
scp ggd-platform-archive.zip user@new-host:~/GGD/
```

### 1-3. 在新主機匯入 —— **先不要註冊任何帳號**

全新主機上還沒有任何帳號，也就沒有人能登入後台，所以**第一次匯入一定走指令**：

```bash
make family-archive-apply ARCHIVE=ggd-platform-archive.zip
docker compose -f docker/compose.yaml -f docker/compose.family.yaml --env-file docker/.env restart platform
```

重啟平台之後，直接用**舊主機的帳號密碼**登入。

> **為什麼「先不要註冊」很重要**：新主機上為了能登入後台而註冊的那個帳號，
> 使用者名稱幾乎必然和舊主機的同一個人撞名。撞名時匯入會**整包拒絕**（見 §3），
> 你就得走 `-resolve-collisions=adopt-archive` 這條最危險的路徑。空的目標零衝突。

### 1-4. 匯入後還要手動做的事

- **AI 供應商金鑰** —— 到後台「AI 生成設定」重新輸入（刻意不隨檔案移動）。
- **Slack webhook** —— 到「系統」重新輸入。
- **素材包 blizzard-overlay** —— 跟著部署映像走（#177），不在這包裡。

---

## 2. 後台按鈕（目標已經有正確的管理員時）

後台 →「系統」→ **📦 資料搬遷**。三個分頁：匯出 / 匯入 / 狀態。

- **匯出**與**匯入的最後一步**都會要求**再輸入一次你自己的登入密碼**。判例是
  變更密碼那條路由：光有 session 不構成憑證動作的授權。一次匯出就等於整台部署
  的每一個密碼雜湊。
- 這一頁需要登入。**localhost 免登入（#162）不延伸到這裡** —— 沒有真帳號就沒有
  密碼可以再確認。本機測試請用種子管理員登入。
- 匯入是 **上傳 → 試算 → 確認** 三步。試算**不寫入任何東西**；確認寫入時，伺服器會
  重新計算一次試算並和你核准過的 digest 比對，不一致就 409 拒絕（「你預覽之後目標
  主機變了，請重跑一次」）。
- **試算就是契約。** 試算會逐筆列出每一個文件的判定（新增／覆蓋／相同／略過／擋下），
  commit 只會執行那份清單，一筆不多。所以「將寫入 0 筆」是可以照字面相信的：
  重跑一次已經匯入過的封存**不會重寫任何檔案**。
  （這曾經是假的：#243 初版的試算只列出「值得注意」的項目，commit 把清單裡沒有的
  entry 一律當成新增重寫，於是重跑一次同一包會在「將寫入 0 筆」之後改寫全部 169 個
  文件。修法是結構性的：判定只由 `planEntry` 產生一次，只經由 `Plan.Executable`
  變成寫入，`plan.go` / `apply.go` 沒有第二個地方能自己決定判定。）
- 寫入前會**自動備份**目標主機現有資料到 `data/_migration/backups/<UTC ts>.zip`。
  **備份失敗就不寫入**，磁碟空間不足也不寫入。
- 匯入完成後的畫面會把「試算承諾寫入 N 筆」和「實際寫入 M 筆」並列。兩者不一致時
  會轉紅並要你去看備份；稽核紀錄 `archive.commit_end` 也同時記下
  `promisedWrites` 與 `written`。

---

## 3. 身分衝突（最容易踩到的一格）

**症狀**：試算顯示「使用者名稱 `takuro` 在這台主機上已經被另一個帳號佔用」，整包
被擋下。

**原因**：目標主機上先註冊了一個帳號，用了同一個使用者名稱／email。

**如果放著不管會怎樣**：舊帳號的文件被寫進去，但使用者名稱仍然指向新建的空帳號 ——
**密碼是對的，登進去是空的**，而且沒有任何訊息。所以預設是整包拒絕，不是略過。

**解法（擇一）**：

1. **最好的解法**：把目標主機的 data/ 清成全新的，重跑 §1-3。
2. 勾選「以封存為準」 / CLI `-resolve-collisions=adopt-archive`。之後那個使用者
   名稱會解析到**封存裡的帳號**。被擠掉的帳號**不會被刪除**（本功能永遠不刪任何
   東西），只是不再能用這個名稱登入 —— 你會需要用**舊主機的帳號密碼**重新登入後台。

---

## 4. 覆蓋一台已經有資料的主機（次要、危險情境）

預設**不覆蓋任何既有文件**：目標已有、且內容不同的文件會被列在「略過」欄並逐一列名。
要真的覆蓋才勾「允許覆蓋既有資料」/ CLI `-allow-overwrite`。

三個政策例外，即使勾了也不會變：

- **管理稽核紀錄 `admin-audit`**：目標已有當天的檔案就**一律略過**，永不覆寫也
  永不合併。覆寫等於偽造目標主機自己的稽核軌跡（而且會蓋掉記錄「這次匯入」的那行）。
- **個人戰績履歷 / 內容覆蓋層歷程**：同上，append-only 檔案不重寫。
- **對戰回放**：同名不同大小一律略過。

**封存永遠只做加法。它從不刪除任何東西。**

---

## 5. 疑難排解

**上傳直接 413，平台的 log 什麼都沒有** ⇒ 邊緣擋掉了。三個地方各有一個上限：

1. `nginx/nginx.conf` —— 有一條 `location = /api/v1/admin/platform-archive/stage`
   把 `client_max_body_size` 放寬到 512m。這條在 repo 裡，重新部署就會生效。
2. 平台 —— `server.maxArchiveUploadBytes`（512 MiB），只對那一條精確路徑放寬。
3. **家用主機的 nginx 前面還有 Caddy。** Caddy 預設**沒有** request body 上限，
   但如果你或別人在 Caddyfile 設過 `request_body max_size`，就是它擋的。
   這是主機上的檔案，本 repo 看不到 —— 請去主機上查 `Caddyfile`。

**「磁碟空間不足」（507）** ⇒ 匯入前會要求「估算備份大小 × 3 + 256 MiB」的餘量。
半寫的備份是最糟的狀態，所以這裡刻意 fail-closed。先清 `data/_migration/backups/`
的舊備份。

**匯入成功但某人登入到錯的帳號** ⇒ 這是 §3 的身分衝突。重啟平台**修不好**
（開機用 `SetNX`，不覆寫既有索引）。後台的匯入路徑會用 `SET` 直接重寫索引；
CLI 路徑不連 Redis，所以 CLI 匯入後**一定要重啟平台**。

**對戰回放搬不過去** ⇒ 回放是 game-server 的檔案，在另一個掛載點
（`compose.family.yaml` 另外掛 `../data/replays:/data/replays` 給 game 容器）。
建議 `scp -r data/replays/` 直接搬，比走 HTTP 快也穩。

**要還原一次失敗的匯入** ⇒ 每次匯入前的自動備份就在 `data/_migration/backups/`，
旁邊的 `.json` 寫著還原指令：

```bash
docker compose … exec -T platform /platformarchive apply \
    -in - -data /data -content /srv/content -allow-overwrite < <backup>.zip
```

---

## 6. 稽核

每一個動作都會寫進共用的 `data/admin-audit/<date>.jsonl`，後台「Audit log」看得到：

`archive.export` / `archive.stage` / `archive.plan` / `archive.backup` /
`archive.commit_begin` / `archive.commit_end` / `archive.commit_failed` /
`archive.discard`。

`commit_begin` 是在**第一次寫入之前**落地的 —— 行程中途死掉時，稽核仍然看得到
「有人動手了」。
