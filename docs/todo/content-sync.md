# 兩台後台的內容同步 (two-console content sync) — TODO

Design: [../design/content-sync.md](../design/content-sync.md) (owner 裁示 2026-07-25).
Prerequisite: **#189** — the durable `data/content-overlay/` store. Until it lands there is
nothing on the family host to sync *with*: `content/` is a `:ro` mount of the git checkout
(`docker/compose.yaml:69-72`) and the production admin bundle does not even compile the
內容管理 page in (`apps/admin/src/ui/App.tsx:73`).

Save is local, instant and never fails. Sync is a separate deliberate action with a
per-item tick-box table and per-FIELD arbitration. There is exactly one save-time prompt,
and it is not "do you want to sync".

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| csync-01 | Save never contacts the peer: a save with the peer host unreachable still writes, returns, and reports success — no timeout, no retry, no modal | content-sync-save-offline-first | integration | pending |
| csync-02 | Three-way classifier is a pure function of (base, local, peer) — no fs, no clock — and classifies A-only / B-only / true-conflict / create / delete-vs-edit, defaulting the tick only for the single-sided classes | content-sync-classify | unit | pending |
| csync-03 | Missing `base` (never synced, or new doc) downgrades every two-sided difference to TRUE CONFLICT rather than picking a side | content-sync-no-base-is-conflict | unit | pending |
| csync-04 | Field-level arbitration: two edits to different fields of the same champion merge into one doc carrying BOTH; arrays arbitrate whole, never per-element | content-sync-field-arbitration | unit | pending |
| csync-05 | A merged ability re-applies the MIRROR RULE on both sides — `content/abilities/<cid>.<slot>.json` and the champion's embedded `abilities[<slot>]` agree after the merge | content-sync-merge-mirror | regression | pending |
| csync-06 | Submit is atomic and two-way: one invalid row fails the WHOLE batch (nothing written on either side); a valid batch leaves both stores on the same generation with identical `hashDoc` per row | content-sync-submit-atomic | integration | pending |
| csync-07 | Divergence indicator is honest when the peer is unreachable — it reports the peer side as UNKNOWN, never `0` and never "已同步", while the local unsynced count stays exact (it needs no network) | content-sync-divergence-offline-honest | integration | pending |
| csync-08 | The one prompt fires only when the peer changed the SAME doc AND an overlapping field since `lastSyncedHash`; disjoint fields, disjoint docs, and an unreachable peer produce no prompt, and dismissing it still saves | content-sync-overwrite-prompt-trigger | integration | pending |
| csync-09 | Sync state is a `data/` sidecar, never the doc: writing a doc through either path updates `data/content-sync/state.json` and leaves `hashDoc`/`contentVersion` unmoved by the metadata alone | content-sync-sidecar-not-in-doc | unit | pending |
| csync-10 | Both write paths (content-api on localhost, `internal/contentoverlay` on the host) produce byte-compatible sidecar state, so the classifier cannot tell which machine it runs on | content-sync-sidecar-parity | integration | pending |
| csync-11 | Transport envelope refuses an unknown `Kind`/version and verifies the per-part sha256 before anything is applied; a truncated or tampered snapshot is rejected whole | content-sync-envelope-refusal | security | pending |
| csync-12 | Only an admin may SUBMIT a merge (it writes both machines); a non-admin session may fetch and view the table but is refused at apply | content-sync-apply-admin-only | security | pending |

## #189 的前置：耐久覆蓋層 + 合併優先權（2026-07-26 落地）

規則寫在 [../design/content-sync.md](../design/content-sync.md) §6.5。
這一批就是 csync-01…12 一直在等的那個「第二個 store」，外加它自己的優先權契約。

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| ovl-01 | 出貨 bundle 在覆蓋 entry 底下被換掉（git pull）→ 該筆標成 `stale` 並計入 `flaggedCount`，但**覆蓋仍然生效**，合併樹不變 | content-overlay-precedence-stale | unit | done |
| ovl-02 | 其餘狀態表：`added` / `shadow` / `orphan` / `tombstone` / `tombstone-moot` 各自由真實磁碟情境產生 | content-overlay-precedence-states | unit | done |
| ovl-03 | 缺 base（舊 overlay 檔沒有 `bases`，或 `CONTENT_DIR` 讀不到）→ `unknown-base` 且**標記**，絕不當成 `clean`（csync-03 的唯讀版） | content-overlay-precedence-unknown-base | unit | done |
| ovl-04 | 損毀／寫到一半的 `overlay.json` → 讀取降級成空覆蓋（＝純出貨內容）、`degraded=true`、原始 bytes 完整隔離保存，平台照常開機；下一次成功寫入自動復原 | content-overlay-corrupt-degrades | unit | done |
| ovl-05 | put / delete / revert 每一筆都在 `data/admin-audit/` 留一行；**寫不進 audit 就拒絕改內容**（fail-closed，不是 best-effort） | content-overlay-audited | unit | done |
| ovl-06 | `revert` 移除覆蓋 entry 而**不留 tombstone**，合併樹回到出貨 doc；對沒有覆蓋的 key revert 是 400 而不是無聲推進 generation | content-overlay-revert | unit | done |
| ovl-07 | 耐久檔案落在 `DATA_DIR/content-overlay/overlay.json`（＝ compose 的 `../data:/data` bind mount），generation log 落在隔壁且**可讀** | content-overlay-durable | unit | done |
| ovl-08 | 出貨 doc 唯讀檢視綁死在 `CONTENT_DIR` 內，`../` 在碰到檔案之前就被擋掉 | content-overlay-shipped-view | security | done |
| ovl-09 | console 對看不懂的 state 一律降級成 `unknown-base`＋標記，永不畫成綠色；每個標記狀態的說明都要講出「仍然生效」 | content-overlay-console-states | unit | done |
| ovl-10 | console 編輯器的 JSON／key 驗證與平台的 `collectionRe`/`idRe` 一致（含 `godie-e001.ex` 這種點號 slot 尾碼） | content-overlay-console-edit | unit | done |
| ovl-11 | 這個新寫入端全部走平台 `/content-overlay/…`（admin JWT），**從不提及 `/content-api` 或 8787**；頁面是靜態 import 所以正式 build 一定含它，且被 session gate 保護 | content-overlay-console-not-content-api | security | done |

**還沒做（#189 的範圍外，另開）**：`apps/client/src/content/bootContent.ts` 沒有把來源包進
`OverlayContentSource`，所以覆蓋只改到 game-server 的 sim，**改不到大廳／選角／圖鑑的畫面**，
而且 client 的 `cv_`（出貨）會和 game-server 的 `cv_`（合併）不一致。
另外 `apps/game-server/src/config/contentBus.ts` 的 `CONTENT_KINDS` 不含 `content-overlay`，
所以覆蓋寫入發出的失效訊息會被每個 shard 丟掉 —— 內容改動仍需重啟 game container。
兩者都在 `apps/client` / `apps/game-server`，這一批的 scope lock 之外。
