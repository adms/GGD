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
