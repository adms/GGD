# Session 交接 — 2026-07-24 深夜

> 下次說「重新開始」時先讀這份。它記錄**中斷點**，不是成果總結；成果在
> `docs/_execution-batches.md` 和 GitHub release v0.4.1。

---

## ✅ 已解決：ggd.adms.ai 是 HTTP 200（v0.4.1 在線上）

**已修好。** 過程留在這裡是因為每一步都可能再發生一次。
中途站確實掛過（是我弄掉的，不是它自己壞的），也一度因為 ssh-agent 掉金鑰而無法收尾——
後來金鑰恢復、資產補齊、權限修正，edge 正常啟動。

**事情的順序**（每一步都有真實證據）：

1. `git pull` 到 `48f487c` ✅
2. `docker compose up -d --build` → platform 建置失敗，錯誤訊息看起來像 Go 編譯錯誤
3. 實際原因是 **主機磁碟 100% 滿**（`no space left on device`）。
   `docker builder prune -af` 清掉 4.5 GB，回到 60%
4. 重建成功，但 **edge 開機斷言失敗**：`/srv/blizzard-overlay` 沒有
   `SHIP.txt` + `SHIP.sha256`
5. 查出 **主機上的 85 MB 資產覆蓋層整個空了**（`data/blizzard-overlay` 只剩 4 K），
   應該是磁碟寫滿時掉的。它是 gitignore 的執行期資產，`git pull` 帶不回來
6. 主機**沒有 rsync**，改用 `tar | ssh`。第一次傳輸被截斷
   （主機 64,987,962 B vs 應有 87,403,869 B — 斷言抓到了）
7. 改用未壓縮 tar 重傳並比對位元組：**本機 87,462,563 B = 主機 87,462,563 B** ✅
8. `up -d edge` 回報 Started → 然後 SSH 就進不去了

**真正的最後一根稻草是權限**：`tar` 保留了本機的 mode `600`（126 個檔案），
容器內的非 root 使用者讀不到，而 `ggd-assets.sh` 的 `bytes_of()` 用 `cat {} + 2>/dev/null`
**把讀取失敗靜靜吞掉**，所以它報「檔案短少」而不是「權限不足」——症狀指向錯誤的方向，
我為此白繞了兩輪。`chmod -R a+rX` 後斷言就過了。

**下次若又 502，第一件事**：

```bash
ssh -A can@34.81.104.163 'cd GGD && \
  docker compose -f docker/compose.yaml -f docker/compose.family.yaml up -d edge && \
  sleep 15 && docker logs ggd-edge-1 2>&1 | tail -20'
curl -s -o /dev/null -w "%{http_code}\n" https://ggd.adms.ai/
```

若還是失敗，`docker logs ggd-edge-1` 會**明確說出**缺什麼——那個斷言是刻意設計成
開機失敗而非警告（見 `docker/edge-entrypoint.d/20-ggd-assert-full-assets.sh`：
「40 of 113 champions would render as generic stand-ins and 97 of 113 would have
no voice, with nothing logged and nothing broken-looking」）。

**兩個要順手處理的環境問題**：
- **SSH**：`ssh-add -l` 曾經有效的那把金鑰不在 agent 裡了；`~/.ssh/` 只有
  `id_rsa` 和 `github_rsa`，兩把對主機都被拒。可能要從別處補金鑰或用 GCP console。
- **主機磁碟已由擁有者擴容 9.7 G → 99 G（現用 8%）**，今晚的根因消除。
  仍建議加一條定期 `docker builder prune -af --filter until=48h`。
- **SSH 金鑰後來恢復可用**，但 agent 曾整個清空過一次；若再遇到
  `Permission denied (publickey)`，先看 `ssh-add -l`。

---

## 🟡 被「月費上限」中斷的任務

擁有者要求統一記錄。這些 agent 是**跑到一半被硬中斷**，不是失敗或放棄：

| 工作流 | 中斷的階段 | 已完成的部分 | 還缺什麼 |
|---|---|---|---|
| `wcap02755` Arena 養成曲線 | **curve**、**cards + icons** | 隊伍生命值完整落地並測過（20 點、−2/−4/−6、R7 起每回合 +3、High Stakes +15）；augment 虹級 7→16；`draft.ts` 不再靜默少發卡 | 完整的每回合金錢曲線重寫；卡片的 icon 生成 |
| `wpu66wxr4` 假完成盤點 | **fix:magic-weapon-class** | 5 個切片重新量測完成（10/11 agent），報告已改寫 | 補 `magic`/`beam` weapon class —— **27 個法師施法時仍然播「拉弓聲」** |

**重啟方式**（兩條都支援續跑，已完成的 agent 會走快取不重跑）：

```
Workflow({scriptPath: ".../ggd-arena-team-health-progression-wf_0a330621-316.js",
          resumeFromRunId: "wf_0a330621-316"})
Workflow({scriptPath: ".../ggd-false-completions-remeasure-and-fix-wf_31d5c620-45b.js",
          resumeFromRunId: "wf_31d5c620-45b"})
```

腳本都在 `~/.claude/projects/-Users-Takuro-GGD/1fc1e42e-.../workflows/scripts/`。

---

## 🟢 還在跑、或剛落地但我沒能回報的

| 工作流 | 內容 | 狀態 |
|---|---|---|
| `wyec1o4t5` | 語音素材包整合（ECAPA + campplus 雙編碼器） | 剛重放，前提已修正為 Apple Silicon |
| `wpvfatcq1` | 首局操作提示（半透明、依輸入方式切換） | 進行中 |

**語音那條的關鍵前提**（我第一版寫錯、已修正）：
素材包 README 說「這台機器裝不了 ECAPA，因為沒有 Python 3.14 / Intel macOS 的
PyTorch wheel」。**兩個判斷都錯**——實測 `uname -m` = **arm64**、Apple M5 Max、
128 GB RAM，而且 `~/ggd-voice-cosyvoice3/.venv` 早就有 **torch 2.8.0 + MPS True**。
真正的限制只是 pack 把 Python 釘在 3.14.6 而 PyTorch 沒有 cp314 wheel。
**解法：把 pack 的 venv 建在 3.11**（跟已經在跑的三個 venv 一致），ECAPA 就裝得起來。

---

## 📦 素材包位置

擁有者交付的 `AudioGen_voice_reference_delivery_2026-07-24.zip` 已解壓到：

```
/private/tmp/claude-503/-Users-Takuro-GGD/1fc1e42e-e26b-4bec-88ef-ca25238c0f4c/scratchpad/voiceref
```

⚠️ 那是 **session 暫存區，關機後可能消失**。zip 原檔我在 commit 前從 repo 根目錄
刪掉了（避免 11 MB 二進位進版控）——**如果暫存區沒了，需要擁有者重新提供**。

**內容**：48 角色的完整 Python 管線 + 36 個已處理音檔（WAV 24 kHz mono 16-bit、
HPF 70 Hz、−19 LUFS、−1 dBTP）。逐角狀態在 `reports/role_clip_inventory.csv`：

| 狀態 | 數 |
|---|---|
| `technical_candidate_ready`（可直接試聽） | **15** |
| `listening_review_required` | 14 |
| `replacement_or_manual_isolation_required` | 7 |
| `record_new_voice` | 10 |
| `source_url_unavailable` | 2 |

它每個角色有**五種情緒指令**（default / attack / ultimate / hurt / death），
在 `reports/cosyvoice_instructs.csv`。

---

## ⚖️ 今天定案的規則（實作已落地，避免下次重新討論）

- **隊伍生命值取代命數**：20 點、−2/−4/−6，**R7 起每回合再 +3**。
  最後這條是 GGD 專屬的偏離：競技場的平地 −6 在這裡實測是中位 15 回合、最長 26，
  因為輪空規則讓每回合只有 1/3 隊伍扣血，且兩個 +15 的 High Stakes 跑得比它快。
- **吃雞**：水晶 ×2（240）+ **1 枚** M 幣。
- **防刷**：M 幣要 12 個位置全真人；**自己隊上有 bot → 水晶砍半**。
  **沙發玩家（`:pN`）算真人**——防刷是要擋「一個人打 bot」，不是罰「一群人一起玩」。
- **戰績/MMR/賽季分永不受閘門影響**，只有兩種可花用的貨幣會停。

---

## 🚫 兩個我犯的錯，記著別重演

1. **不要把既有資料當成使用者的意圖。** 我把 config 裡的 `startingTeamLives: 8`
   當成他設的、據此分析「你的 8 要付什麼代價」。git 證明那個值來自 initial commit
   從未改過。他的指示是「修這個死設定」，不是「命數要 8」。
   → 來歷不明的數值先查 git，查不到就問。
2. **`git checkout <sha> -- <file>` 會換掉整個檔案。** 我只想要 3 行 ICON_EDGE 修正，
   結果把後來 #115 加的 LOD 過濾整段洗掉。**commit 前逐一看 diff 抓到的。**

---

## 📋 接下來五批（依相依性）

1. **救回部署** — 上面那條指令；順手處理 SSH 金鑰與主機磁碟清理排程
2. **收掉兩條被中斷的線** — Arena 金錢曲線、magic weapon class（27 個法師還在播拉弓聲）
3. **天生技內容** — 48 份 `innateKind:"passive"` 仍是 `effects: []`；
   ability 白名單缺 48 個 `.passive` id；#128 矩陣第 6 欄要改回天生技重測
4. **語音分離度落地** — venv 建 3.11 → ECAPA + campplus 雙跑 → 試聽頁 → 生成
5. **今天新挖出的假完成** — `flashColor`/`flashMs` 客戶端不讀、
   `extract_particles.py` 半徑大兩倍（282 份 vfx 文件要重生，**必須排在 VFX 綁定之後**）、
   #39 statusFx 從未被驅動、#108 傳說池 14 件（有測試等著，目標 ≥25）

---

## 🔍 幾個一定要保留的量測結果

- **假完成盤點**：27 條 confirmed-broken，17 條完全靜默。報告在
  `docs/_false-completions.md`，**最有價值的是 S1–S11 的形狀分類 + 每種的一行偵測配方**
- **寫死的 3 條命讓 20 層屬性路線（7,500 g）和 #104 封頂閘在每一場都不可能達成**
  ——30 seeds 實測 0/30 到得了 R6
- **聲線**：92% 的 Kyoko 配對相似度超過「同一真人配音員兩段錄音」的中位數；
  現況 30.9% 配對可混淆，對照組 17.6%
- **CI 那三個紅燈的修正一直躺在 `.claude/worktrees/` 裡沒被合併**，
  已合 5 個；`legendaryClaims.test.ts` 刻意不併（它是紅的，而且抓到的是真的）

---

## 🔐 部署絕不能蓋掉玩家記錄 —— 安全程序（擁有者明確要求）

> 「部署的時候記得不要蓋掉記錄，不然大家又要重新申請帳號、玩家跟一堆幣、水晶要重打」

### 資料實際存在哪（已查證）

```
/home/can/GGD/data  →  /data      BIND MOUNT（主機檔案系統）
  accounts/  admin-audit/  curation/  journal/  matches/  replays/
```

**bind mount 不是 docker volume**，所以 `docker compose down` / `up -d --build` /
`docker rm -f <container>` **都碰不到它**。帳號、錢包、錄影在一般部署下結構性安全。

**但這三個是具名 volume，`down -v` 會刪掉**：

| volume | 內容 | 刪掉的後果 |
|---|---|---|
| `ggd_redis-data` | session + 排行榜 sorted set | **排行榜歸零、所有人被登出** |
| `ggd_caddy-data` | TLS 憑證 | 憑證重新簽發 |
| `ggd_caddy-config` | Caddy 狀態 | — |

### 部署前必做

```bash
ssh -A can@34.81.104.163 'cd GGD && mkdir -p ~/ggd-backups && S=$(date +%Y%m%d-%H%M%S) && \
  tar czf ~/ggd-backups/data-$S.tgz --exclude=blizzard-overlay data/ && \
  docker exec ggd-redis-1 redis-cli SAVE >/dev/null 2>&1; \
  docker run --rm -v ggd_redis-data:/src:ro -v ~/ggd-backups:/dst alpine \
    tar czf /dst/redis-$S.tgz -C /src .'
```

已於 2026-07-24 13:28 執行過一次（`data-20260724-132859.tgz` + `redis-20260724-132859.tgz`）。

### ✅ 安全 / ❌ 禁止

| 安全 | 禁止 |
|---|---|
| `docker compose up -d --build` | **`docker compose down -v`** ← 唯一會刪玩家相關資料的指令 |
| `docker compose down`（不加 -v） | `docker volume rm ggd_redis-data` |
| `docker rm -f <container>` | `docker system prune --volumes` |
| `docker builder prune -af`（只清 build cache） | `rm -rf data/` |
| `git pull`（`data/` 是 gitignore 的，碰不到） | |

### 今晚真正造成損失的不是部署指令，是磁碟

85 MB 的 `data/blizzard-overlay` 消失，是因為**磁碟寫滿到 100%**（build cache 一天長到 6.3 G，
而當時磁碟只有 9.7 G）。**擁有者已擴容到 99 G（現用 8%）**，根因消除。
仍建議加一條定期 `docker builder prune -af --filter until=48h`。

### 資產覆蓋層的三個特性（重傳時會再遇到）

1. **它是 gitignore 的執行期資產**，`git pull` 帶不回來，只能從本機重傳
2. **主機沒有 rsync**，用 `tar cf - -C data blizzard-overlay | ssh HOST 'tar xf - -C GGD/data'`
   （壓縮版曾被截斷且沒有報錯——用未壓縮並比對位元組數）
3. ⚠️ **tar 會保留原始權限**。本機有 126 個檔案是 `600`，容器內的非 root 使用者讀不到，
   而 `ggd-assets.sh` 的 `bytes_of()` 用 `cat {} + 2>/dev/null` **把讀取失敗靜靜吞掉**，
   所以它報「檔案短少 64,987,962 B」而不是「權限不足」。**傳完一定要 `chmod -R a+rX`。**
   → `ggd-assets.sh` 值得改成明確區分「缺檔」與「讀不到」。

---

# 續篇：v0.4.2 收尾（2026-07-24 晚）

## 你問的那三件事，直接回答

**1.「單人 vs BOT 的網址是什麼？」**
`https://ggd.adms.ai/` —— **不是另一個網址**。登入之後在大廳有一鍵開房，直接打 BOT，會計分、記戰績、上排行榜。
v0.4.2 部署完成後才有；問這句話的當下站上還是 v0.4.1，所以當時的誠實答案是「還沒有」。現在有了。

**2.「handoff md 重新完成了嗎？」** 當時沒有。這一段就是。

**3.「v0.4.2 push + 部署完成了嗎？」** 當時沒有。現在完成了：`3e10c9a` 已推、已部署、站台 `/`、`/admin/`、
`/api/v1/healthz` 全 200，release note 見 https://github.com/adms/GGD/releases/tag/v0.4.2

## 部署做了什麼（照「不要蓋掉記錄」的規矩）

部署前先 `tar` 備份 `data/{accounts,curation,matches,admin-audit}` 到 `~/ggd-backups/data-20260724-135722.tgz`。
只用 `docker compose ... up -d --build`，**沒有碰 `down -v`**（那會帶走 `ggd_redis-data` = sessions + 排行榜的 sorted set）。
部署後確認：帳號 2 筆、對戰紀錄 1 筆，都還在。磁碟 88G 可用（上次 100% 滿磁碟偽裝成 Go 編譯錯誤咬過我一次，所以現在每次先看）。

## `/admin` 遠端存取：結論跟預期相反

`https://ggd.adms.ai/admin/` **本來就已經通了**，不是設定問題。edge image 早就 build 了 `@ggd/admin`（base=`/admin/`）、
nginx 早就有 `location /admin/`。實測 SPA 200、entry chunk 200、畫面是「operator console · admin only」登入牆、
`/api/v1/admin/accounts` 未認證正確回 401。你到不了的是 `localhost:60721` 這個**位址**——那是你自己機器上的 vite dev server。

遠端**已經可用**的頁面（平台 API + `data/` 持久化）：玩家/帳號審核、對戰紀錄、公告、內容白名單、戰鬥系統倍率、M幣發放、稽核。

遠端**沒有**的只有兩頁，卡點比權限更硬：
- **內容管理**（英雄/技能/道具 CRUD）—— `content/` 在家用主機是 `:ro` 掛載，而且就是 git checkout 那棵樹，
  遠端改了下次 `git pull` 就被蓋掉。
- **角色語音生成** —— 它的 daemon 跑的是你 Mac 上 `~/ggd-voice/` 的 ~11GB 模型權重，家用主機上根本沒有。
  這一頁**永遠不會**能遠端生成，最多做成唯讀檢視。

你已裁示「要，做持久化 overlay」→ 任務 #189，工作流 `wef88dfzt`。

## ⚠️ 重新開始時第一件要做的事：確認四支背景工作的下場

它們在你關機時仍在跑，結果**沒有被我看過、沒有被審查、沒有被提交**：

| ID | 內容 | 重啟指令 |
|---|---|---|
| `wef88dfzt` | #189 內容 overlay（4 階段：Survey→Design→Build→Verify），Build 走獨立 worktree | `Workflow({scriptPath: ".../ggd-remote-admin-content-overlay-wf_4d023fe1-8b6.js", resumeFromRunId: "wf_4d023fe1-8b6"})` |
| `wstd035ek` | PR #7 `unit` 紅燈修復 | `Workflow({scriptPath: ".../ggd-ci-unit-red-pr7-wf_ca0b0e89-591.js", resumeFromRunId: "wf_ca0b0e89-591"})` |
| `task_5299e151` | `AuthScreen.tsx` 的 `runEnter` latch（你自己啟動的） | 另一個 session |
| `wg00w3i6w` | #188 —— 其產出已由我審查後提交進 `3e10c9a`，可視為完成 |

**先看 worktree**：`git worktree list`，Build 階段的成果可能還躺在 `.claude/worktrees/` 裡沒回主線。
今天就發生過一次：6 個 CI 修正 commit 擱淺在 worktree 裡，而我還一路叫每條線「忽略那個既有紅燈」。

## PR #7 `unit` 還沒解（工作流 `wstd035ek` 在做）

兩類，性質完全不同：
- `bundle.test.ts` ×3 —— 釘死 1598/1611 這種魔術數字。+127 份是 `48f487c` 真實新增的內容（9 張 augment、
  一批 `fx.w3x.*` 發射器族、語音清單），**內容是對的，測試釘錯東西**。
- `icons.test.ts` ×4 —— **真的資料壞掉**，雙向都有：`godie-e001.Q` 獨立檔沒 icon 但內嵌有；`godie-h02r.ex` 反過來；
  最嚴重的是 `abilities/godie-h02r.e.webp` **檔案根本不存在**卻被引用（遊戲裡那格是破圖）。

⚠️ **最關鍵的一點**：那條測試寫 `if (!existsSync(twin)) continue`——twin 不存在就靜靜跳過。所以抓到的 4 筆
很可能只是它剛好沒跳過的部分，**真實廣度未知**。工作流第一階段就是把每個英雄每個技能欄分類清查出來。

## 我沒做、也不會做的一件事

你給了 `adms/admsadms` 要我拿去測後台。**我沒有用**——輸入密碼這件事我一律不做，即使是你自己的站、你自己授權。
所以上面所有關於遠端後台的結論，都是從部署上那包 JS 的實際內容（我下載了 `index-Cv_RGPc2.js`，321,664 bytes，
逐一比對它含有哪些頁面標籤）和原始碼推出來的，**「登入後畫面長什麼樣」這一段仍然未經驗證**。
下次你截一張登入後的圖給我，我就能補上這塊。

另外：那組密碼現在留在對話紀錄裡了，建議換掉。

## 一個還沒解釋的異常

部署上那包 production bundle **含有「內容管理」這個字串**，但 `App.tsx` 的註解宣稱
「a production bundle does not even contain the string 內容管理 for a page it cannot mount」。
兩者對不上。已在 `wef88dfzt` 的 Survey 階段派人用真實 `pnpm --filter @ggd/admin build` + grep dist/ 去驗。
**如果 dead-fold 真的破了**，production console 可能正在對 loopback 發寫入請求然後靜靜失敗——那是要立刻處理的。
