# 資料搬遷頁稽核：它有效嗎？它包含到所有資料嗎？

**日期** 2026-08-28 · **性質** 唯讀稽核 ＋ 補閘 · **觸發** owner：「我要做一個系統重大搬遷，
我要確定後台資料搬遷頁是否有效並且有包含到所有資料能一起打包備份」

> ⛔ 本次稽核**沒有**連線到 ggd.adms.ai / 34.81.104.163，**沒有**執行任何匯出到正式站。
> 全部結論來自本機原始碼與測試。

---

## TL;DR

| 問題 | 答案 |
|---|---|
| **① 有效嗎** | ⭐ **是。** 76 條 Go 測試全綠（uncached 99s），**往返有被驗過**（`TestMigrationOntoAFreshHost`、`TestReExportPreservesMeaningNotBytes`、`TestSecondImportIsAllUnchanged`、`TestEmailAndUsernameRefsSurvive`）。試算＝契約、寫入前自動備份、digest 不符 409 拒絕，這些都有守衛。 |
| **② 包含到所有資料嗎** | ⛔ **否。** 找到 **8 項**不在備份裡的東西，其中 **2 項是 jsonstore 裡的靜默遺漏**（連「刻意不帶」清單都沒提到），**6 項是 host-only、不在 git 也不在 ZIP**。 |
| **最危險的一項** | ⛔ **`data/review-verdicts/live.json`** —— owner 在線上按過的每一筆批核裁決。它**就在 `DATA_DIR` 裡面**，卻沒有任何規則認領、也沒有被列進「刻意不帶」。搬遷前不跑 `scripts/review-sync.sh` 就**永久消失**。 |

---

## ① 「有效」——它搬得動嗎

### 測試（實跑，不是讀 UI）

```
cd apps/platform && go test -count=1 ./internal/platformarchive/...
ok  github.com/ggd/platform/internal/platformarchive  99.096s
```

**往返（round-trip）確實被驗過** —— 這是我特別去找的，因為「匯出成功」不等於「匯得回來」：

| 測試 | 驗什麼 |
|---|---|
| `TestMigrationOntoAFreshHost` | 全新主機匯入後，資料真的在 |
| `TestReExportPreservesMeaningNotBytes` | 匯入後再匯出一次，語意不變 |
| `TestSecondImportIsAllUnchanged` / `TestNoOpReImportNamesNothingAsAdded` | 重跑同一包**不重寫任何檔案**（初版曾經是假的，已結構性修掉） |
| `TestEmailAndUsernameRefsSurvive` | `accounts/by-email`、`by-username` 兩個索引活著（否則「密碼都對但沒有人登得進去」） |
| `TestPlanVerdictMapEqualsApplyResultMapExactly` | 試算的判定 = 實際寫入的判定，一筆不多 |
| `TestCommitRefusesWhenTheTargetMovedAfterTheDryRun` | 試算後目標變了 → 409，不半匯入 |

### 前端

`apps/admin/src/archive.ts` + `DataMigrationPage.tsx`，守衛 `migrationGate.test.ts` ——
它釘的是**這一頁必須存在於正式 build**（其他後台頁刻意只在 dev 存在）。
這條守衛的存在本身是對的：「只在 localhost 存在的搬遷工具搬不了主機」。

⇒ **①的結論：機制是健全的。問題全部在②。**

---

## ② 表 A —— 宣告側（`scope.go` 的 `Rules()` 說它帶什麼）

| 組 | 預設勾選 | 內容 |
|---|---|---|
| `core` **核心資料** | ⭐ **永遠開**（`NormalizeGroups` 強制） | `accounts` / `accounts/by-username` / `accounts/by-email` / `invites` / `walletmeta` / `curation`(白名單) / `announcements` / `friends` / `rooms/templates` / **`content-overlay`**(後台 override) / `content-overlay-log` / `config`(僅 `combat-env` + `server-ops`) / `rankings/<season>` / `rankings/<season>/champions` |
| `matches` **對戰紀錄** | ⚠️ **opt-in** | `matches/<YYYY>/<MM>` · `match-stats/<YYYY>/<MM>`（覆盤帳本） |
| `history` **個人戰績履歷** | ⚠️ **opt-in** | `history`(jsonl) · `headtohead`(宿敵) |
| `audit` **管理稽核紀錄** | ⚠️ **opt-in** | `admin-audit`(jsonl) |
| `replays` **對戰回放** | ⚠️ **opt-in，而且 UI 主動勸你取消勾選** | `replays`（opaque bytes；超過上傳上限時 `exportBlocker` 叫你改用 `scp -r data/replays/`） |

**刻意不帶（`ExcludedItems()`，10 條，每條都有理由）** ——
`config/ai-provider` · `config/slack-notify` · `journal` · `owner-setup-token` ·
`blizzard-overlay` · `content-backups` · `icon-src-original` · `_index.json` ·
`_migration` · `redis`。

⭐ 這份「刻意不帶」清單的設計是對的：*「它不在備份裡」永遠不可以和「我忘了」長得一樣。*
⛔ **本次找到的兩項靜默遺漏，正是掉進了這個清單漏掉的縫。**

---

## ② 表 B —— 實體側（平台真的會寫的每一個落點，逐一問「它在不在某一組裡」）

> ⭐ 這一頭才是重點。表 A 的問法是「名單上的東西在不在」；表 B 的問法是
> 「**真的存在的東西**在不在名單上」。失敗形態⑫：只走一頭的掃描，結構上看不到
> 「有實體而無宣告」的那一類。

### B-1 平台 jsonstore（`DATA_DIR` = `../data` → `/data`）

| 落點 | 寫入者 | 狀態 |
|---|---|---|
| `data/accounts/**`（含 `$argon2id$` 密碼雜湊） | `internal/account/account.go:362-372` | ✅ core |
| `data/invites/` | `internal/invite/invite.go:581+` | ✅ core |
| `data/walletmeta/`（藍水晶餘額） | `internal/wallet/meta.go:410,525` | ✅ core |
| `data/curation/whitelist.json` | `internal/curation/curation.go:263` | ✅ core |
| `data/announcements/` | `internal/admin/announcements.go:49,70` | ✅ core |
| `data/friends/` | `internal/friend/friend.go:126,129` | ✅ core |
| `data/rooms/templates/` | `internal/room/template.go:54` | ✅ core |
| **`data/content-overlay/`（後台 override，會蓋掉 `content/` 的檔）** | `internal/contentoverlay/contentoverlay.go:632` | ✅ **core** ⭐ |
| `data/content-overlay-log/` | 同上 | ✅ core |
| `data/config/combat-env.json` · `server-ops.json` | `combatenv.go:492` · `opsenv.go:553` | ✅ core（`AllowID` 白名單） |
| `data/config/ai-provider.json` | `internal/ai/ai.go:275` | ⚠️ **刻意排除**（明文金鑰）→ 新主機手動重輸 |
| `data/config/slack-notify.json` | `internal/approvelink/slack.go:104` | ⚠️ **刻意排除**（webhook 密鑰）→ 手動重輸 |
| `data/rankings/<season>/{snapshot,player-snapshot,meta}` | `ranking/service.go:161` · `points.go:210,226` | ✅ core |
| `data/rankings/<season>/champions/` | `ranking/points.go:222` | ✅ core |
| `data/headtohead/` | `ranking/headtohead.go:143` | ✅ history ⚠️ opt-in |
| `data/history/*.jsonl` | `gamelink/settle.go` | ✅ history ⚠️ opt-in |
| `data/matches/<Y>/<M>/` | `gamelink/settle.go:148` · `reaper.go:148` | ✅ matches ⚠️ opt-in |
| `data/match-stats/<Y>/<M>/` | `matchstats/matchstats.go:259`（也由 game-server `analytics/store.ts:94` 寫） | ✅ matches ⚠️ opt-in |
| `data/admin-audit/*.jsonl` | `internal/admin/audit.go` | ✅ audit ⚠️ opt-in |
| `data/journal/`（結算 WAL） | `internal/data/wal/wal.go:58` | ⚠️ 刻意排除（帶過去會重播舊結算） |
| `data/owner-setup-token` | `internal/auth/bootstrap.go:206` | ⚠️ 刻意排除 |
| `data/_migration/backups/*.zip` | 本功能自己 | ⚠️ 刻意排除（底線 ⇒ 永不是合法 collection） |
| **`data/curation/snapshots/<stamp>.json`** | `internal/curation/reset.go:398` | ⛔ **完全不在**（見下） |
| **`data/review-verdicts/live.json`** | `tools/review/stores.mjs:156`（review sidecar） | ⛔ **完全不在**（見下） |

### B-2 平台以外、host-only（不在 git、也不在 ZIP）

| 落點 | 來源 | 狀態 |
|---|---|---|
| `docker/.env`（`REDIS_PASSWORD` · `JWT_SIGNING_SECRET` · `PLATFORM_GAME_SHARED_SECRET`） | `make family-secrets` | ⛔ **完全不在** |
| Caddyfile ＋ TLS 憑證/state | 主機上的檔案，repo 看不到 | ⛔ **完全不在** |
| `~/.config/ggd/backup.env`（備份目的地與憑證） | `tools/deploy/ggd-backup.sh:104` | ⛔ **完全不在** |
| `~/ggd-backups/.state/last-success.json`（監控狀態） | `ggd-backup.sh:201` | ⛔ **完全不在** |
| host **crontab**（備份排程；`cmd_cron` 只印出不安裝） | `ggd-backup.sh:646` | ⛔ **完全不在** |
| `.deploy-prev-commit`（rollback 錨點） | `scripts/host-deploy.sh` | ⛔ 完全不在（影響小） |
| redis AOF（named volume `redis-data`，`--appendonly yes`） | `docker/compose.yaml:34` | ⚠️ **刻意排除**（`reindex` 重建；代價是全員重新登入） |
| `data/blizzard-overlay`（91 MB 素材） | bind mount | ⚠️ 刻意排除（隨映像走） |
| `data/replays/*.jsonl.gz`（246 MB） | `apps/game-server/src/replay/store.ts:374` | ⚠️ 在 `replays` 組但**預設不勾**，UI 勸你改用 `scp` |
| `docs/_review/{approvals.json,verdicts/local.json,material/batches.json}` | `tools/review/*` | ✅ **在 git 裡**，隨 `git clone` 走 —— 不是搬遷損失 |
| `/private/tmp/ggd-live-cache/` | `tools/admin-live/cache.mjs` | ✅ 純快取，可丟 |

---

## ⛔ 完全不在備份裡的清單（owner 搬遷會弄丟的東西）

### 🔴 1. `data/review-verdicts/live.json` —— **最危險的一項**

- **是什麼**：owner 在**線上**批核頁按過的每一筆裁決（通過／否決＋原因）。
- **⭐ 為什麼特別危險**：它**就住在 `DATA_DIR` 裡面**（`docker/compose.yaml:191`
  把 `../data/review-verdicts` 掛給 review sidecar，而平台的 `DATA_DIR` 是同一棵 `../data`）。
  ⇒ 看起來「應該會被一起打包」，實測 `RuleFor("review-verdicts") == nil`，
  ⛔ **而且它也不在「刻意不帶」清單裡** —— 這正是那份清單存在要防止的**靜默遺漏**。
- **它不在 git**：`.gitignore:34` 的 `/data/**` 蓋掉它。
- **唯一的回收管道**：`scripts/review-sync.sh`（`REMOTE_REL=data/review-verdicts/live.json`）。
- ⇒ **搬遷前沒跑那支腳本，owner 按過的線上裁決全部消失，而且沒有任何東西會說話。**

### 🟠 2. `data/curation/snapshots/` —— 白名單重設前的快照

- `internal/curation/reset.go:398` 寫進 `curation/snapshots/<stamp>.json`。
- 為什麼漏掉：`curation` 規則是 `exact("curation")`，而 `export.go:scanCollection`
  **跳過目錄**（`if e.IsDir() { continue }`）⇒ 巢狀集合沒有任何東西枚舉它，匯入端也會拒絕。
- 影響：現行白名單本身走 `core`（新主機功能完整），失去的是「回捲舊主機上做過的重設」。

### 🟠 3. `docker/.env`

`JWT_SIGNING_SECRET` 換掉 ⇒ 全員 session 失效（可接受）；
⛔ 但 `PLATFORM_GAME_SHARED_SECRET` 兩邊對不上 ⇒ **game ↔ platform 串接直接斷**。

### 🟠 4. Caddyfile ＋ TLS 憑證/state

repo 裡沒有 certbot / letsencrypt 任何東西。搬完網域不會自己有 HTTPS。
runbook 只在「上傳被擋」的除錯段提過 Caddy（`platform-migration.md:151`），
⛔ **沒有任何一行說「搬遷時要把它一起帶走」**。

### 🟡 5–7. 備份系統自己：`~/.config/ggd/backup.env` · `~/ggd-backups/.state/last-success.json` · host crontab

搬完之後**離站備份會安靜地停掉**（cron 沒了、目的地設定沒了），
而 `last-success.json` 沒了 ⇒ 監控也不會叫。⭐ 這是「搬遷本身弄壞了搬遷的保險」。

### 🟡 8. `.deploy-prev-commit`

新主機第一次部署失去 rollback 錨點。影響小。

---

## 🧰 搬遷前建議的手動步驟（照順序）

1. ⭐ **先跑 `bash scripts/review-sync.sh`**，把線上的 `data/review-verdicts/live.json`
   拉回本機並 commit。⛔ **這一步一旦跳過就沒有第二次機會。**
2. `scp -r <host>:~/GGD/data/replays/ ./data/replays/`（246 MB，UI 本來就叫你走 scp）
3. `scp -r <host>:~/GGD/data/curation/snapshots/ ...`（表 B-1 的靜默遺漏之一，ZIP 不會帶）
4. **另存 `docker/.env`**（⚠️ 這是密鑰，用 scp 或隨身碟，⛔ 不要走 email／雲端）
5. **另存主機上的 Caddyfile ＋ Caddy 的 data/config 目錄**（TLS 憑證）
6. 另存 `~/.config/ggd/backup.env` 與 `crontab -l`
7. 後台匯出時 ⭐ **四個 opt-in 組全部勾起來**（`matches` / `history` / `audit`；
   `replays` 用第 2 步的 scp 取代）—— ⛔ 預設只有 `core`
8. 匯入後手動重輸：**AI 供應商金鑰**、**Slack webhook**（刻意不帶）
9. 匯入後**重啟平台**（CLI 路徑不連 Redis，`platform-migration.md:161`）
10. 兩邊都刪掉 ZIP 與 `data/_migration/backups/*.zip`（都是憑證等級的東西）

---

## 🚧 補的那一條閘

`apps/platform/internal/platformarchive/coverage_test.go`
→ `TestEveryPlatformCollectionIsCarriedOrDeclaredLeftBehind`

**它從實體推導，⛔ 不是抄一張名單**：用 `go/ast` 解析 `apps/platform/internal/**`
（排除 `platformarchive` 自己）底下每一個字串常數，取名字像 collection 的
（`Col*` / `*Collection*`）、值又是合法 jsonstore 路徑的，逐一問：
**「某條 `Rules()` 認領它，或 `ExcludedItems()` 指名它？」** 兩者皆非 ⇒ 紅，並指名
`<ident> = "<value>" (<檔案>)`。

**量尺自己先兩個方向校準**（CLAUDE.md：單邊校準的尺會在最需要說話時沉默）：
- 掃到 < 12 個常數 ⇒ `t.Fatal`（掃描壞了，不是平台變乾淨了）
- 必須掃到已知存在的 `accounts` ⇒ 否則「它看不到平台」
- 必須對 `definitely-not-a-real-collection` 回 false ⇒ 否則「它永遠不會紅」

**豁免是棘輪且會被印出來**（fail-open 沒錯，靜默才是缺陷）：每次跑都
`t.Logf("KNOWN GAP, not carried by any group: …")`。

### 突變驗證（⭐ 用 `go test -overlay=` 做，全程**沒有動**唯讀的 `scope.go`）

把 2026-08-17 才加進去的 `simple(colHeadToHead, GroupHistory, …)` 那一行拿掉：

| 測試 | 結果 |
|---|---|
| 既有的宣告側 `TestScopeAcceptsEveryCollectionAMigrationNeeds` | 🟢 **PASS（瞎的）** —— `headtohead` 根本不在它那張手寫名單上 |
| ⭐ 新的實體側閘 | 🔴 **FAIL**，訊息逐字指名 `ranking.ColHeadToHead = "headtohead" (../ranking/headtohead.go)` |

⇒ 這就是失敗形態⑫的實證：**只走宣告那一頭的掃描，對「有實體而無宣告」結構上失明。**

### ⚠️ 這條閘管不到什麼（誠實列出）

- ⛔ **非 Go 的寫入端**：`data/review-verdicts/` 是 Node sidecar（`tools/review/stores.mjs`）
  寫的，⇒ **這條閘看不到它**。上面那個 🔴 1 是我人工走實體側找到的，不是閘找到的。
- ⛔ **函式算出來的集合名**（`ranking.snapshotCollection()` / `gamelink.MatchCollection()`
  / `matchstats.Collection()`）：要解 Go 運算式才推得出來。它們的前綴目前都有規則覆蓋，
  但**新增一個函式算出來的集合仍然是隱形的**。
- ⛔ **host-only 的那六項**（`.env` / Caddy / crontab …）：那不是 collection，
  治它的是 runbook 的手動步驟，不是這條閘。
