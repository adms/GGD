# Content whitelist (curation) — TODO

Default-EMPTY, operator-curated enablement of champions / items / abilities. The imported
WC3 roster is far too large to ship wholesale (113 champions / 212 items / 554 abilities), so
**a fresh install enables nothing** — content becomes playable only after an operator selects
it in the admin console (or one-click applies the starter set).

**Storage** (platform, backend half): operational state, not content — durable JSON at
`data/curation/whitelist.json` via the jsonstore (atomic tmp+rename, single writer), optional
Redis mirror. Shape `{ version, updatedAt, champions[], items[], abilities[] }`, default = empty
arrays.

**API** (platform): `GET /api/v1/curation/whitelist` (public, cacheable), `PUT …` (admin,
replace), `POST …/bulk` (admin, `{kind, enable[], disable[]}`), plus a starter bundle.

**Enforcement** (authoritative = game-server): playable + RANDOM champion pool, shop catalogue
and draft/loot filter to the whitelist; `SELECT_CHAMPION` rejects a non-whitelisted champion
with a reason surfaced to the client. Dev bypass: `GGD_WHITELIST_BYPASS=1`.

**Empty-state UX**: zero playable champions → champ-select shows an ACTIONABLE recovery path
(`/admin/` → 內容白名單 → ⭐ 啟用示範組合 → 儲存, or `make seed-demo`), never a broken empty grid.

**Demo starter set** (task #47): a named, reviewable bundle of 12 champions / 30 items / 60
abilities in `apps/platform/internal/curation/starter.go`, applied only by an explicit human
action (console button, `make seed-demo`) or by the opt-in `/seed -starter` which is a NO-OP
unless the whitelist is genuinely empty. Recovery runbook:
[`docs/runbooks/content-whitelist.md`](../runbooks/content-whitelist.md).

Ports (user-pinned): client dev `39527`, admin dev `60721`.

## Admin console — 內容白名單 page (`apps/admin`)

Three tabs 英雄/道具/技能 listing every authored doc (w3x icon thumbnails via the `/content`
mount), a search box, an enabled/disabled/all filter, multi-select (click / shift-range /
select-all-filtered), bulk enable-disable, per-kind 已啟用/總數 counters, a one-click
啟用起始組合 button, and Save that re-reads + verifies the doc before reporting success. All
list/selection/counter/starter/diff logic is pure and unit-tested (`src/curation.ts`); the
content-tree reader (`src/content.ts`) streams id rows then hydrates names/icons.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| wl-admin-01 | Default doc is empty across all kinds; tolerant parse (bare/enveloped/garbage), dedupe+sort | adminui-curation | unit | done |
| wl-admin-02 | Search (ASCII-insensitive + CJK substring) × enabled/disabled/all filter; counter math incl. stale (unknown) ids | adminui-curation-list | unit | done |
| wl-admin-03 | Multi-select: click toggle+anchor, shift-range inclusive, select-all-filtered, prune-hidden | adminui-curation-select | unit | done |
| wl-admin-04 | Bulk enable/disable + single toggle operate on one kind; applyBulk enable-wins-tie | adminui-curation-bulk | unit | done |
| wl-admin-05 | Starter set comes from the PLATFORM (`GET …/whitelist/starter`), not a local heuristic: tolerant parse (bare/enveloped/garbage), full-kit invariant, additive merge | adminui-curation-starter | unit | done |
| wl-admin-08 | Break-glass recovery: enable-all across all kinds (additive, keeps stale ids) and disable-all back to the empty install | adminui-curation-recover | unit | done |
| wl-admin-06 | Save diff (per-kind add/remove) + post-save re-read verification (green tick only when it matches) | adminui-curation-save | unit | done |
| wl-admin-07 | Content-tree reader: index parse, doc→row projection, icon URL resolution, bounded-concurrency streaming load tolerating per-doc failures | adminui-content-load | unit | done |

## Client — champ-select + shop filter (`apps/client`)

`champSelectFilter.ts` gains whitelist helpers (apply to roster, whitelisted random ids, item
filter, empty-state predicate); `whitelist.ts` fetches the doc once per match (unreachable →
NO_FILTER so offline/dev play is unblocked). ChampSelectPanel filters the roster (search + random
run on the whitelisted set), shows the empty-state, and surfaces a rejected pick. ShopPanel
filters its catalogue.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| wl-client-01 | Whitelist restricts the champ-select roster; search runs on top of the allowed set | client-whitelist-filter | unit | done |
| wl-client-02 | Enforced + zero allowed champions triggers the empty-state; non-empty / NO_FILTER never does | client-whitelist-empty | unit | done |
| wl-client-03 | 「隨機英雄」 only ever draws a whitelisted id; empty pool → null | client-whitelist-random | unit | done |
| wl-client-04 | Fetch parse: read doc always enforced (even empty); HTTP/network failure → NO_FILTER; per-match memo | client-whitelist-fetch | unit | done |

## Platform — storage + REST API (`apps/platform/internal/curation`)

`internal/curation`: a `Service`/`Repo` over the jsonstore (`data/curation/whitelist.json`, atomic
tmp+rename, single-writer mutex) with an optional Redis mirror; default-empty (the file is created
lazily on first read but never seeded); `Replace` (PUT), `Bulk` (enable/disable one kind), and a
one-click `ApplyStarterSet` (~10 icon champions + 12 stat-bearing items + the starter EX
abilities). Handlers: public cacheable `GET` + admin-gated `PUT`/`bulk`/`starter` (the admin
`AdminOnly` middleware, audited on every write). Wired in `internal/server/server.go`.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| wl-plat-01 | Fresh install is empty across all kinds; first read lazily creates an empty file, seeds nothing | whitelist-default-empty | unit | done |
| wl-plat-02 | Doc always encodes `[]`, never `null` (consumers iterate without a nil guard) | whitelist-json-arrays | unit | done |
| wl-plat-03 | PUT replace: trim/dedupe/sort input, server-owned version+updatedAt, durable round-trip | whitelist-replace-roundtrip | integration | done |
| wl-plat-04 | Bulk enable/disable one kind, idempotent, other kinds untouched, disable-wins-tie | whitelist-bulk | unit | done |
| wl-plat-05 | Bulk rejects an unknown kind (400) | whitelist-bad-kind | exception | done |
| wl-plat-06 | Strict id validation rejects traversal/space junk (400); a rejected write persists nothing | whitelist-bad-id | security | done |
| wl-plat-07 | Starter set: non-empty, additive union (never removes), idempotent | whitelist-starter | unit | done |
| wl-plat-08 | Save mirrors into Redis; a Redis wipe leaves the JSON truth intact (cache, not authority) | whitelist-redis-mirror | regression | done |
| wl-plat-09 | Hand-edited file with null/missing lists reads back as empty; missing version backfills | whitelist-nil-backfill | unit | done |
| wl-plat-10 | Demo starter set re-verified against the real content tree: ids resolve, icons on disk, own+textured+in-band model, resolvable clips, hero-number-consistent complete kits, buildPriority tolerance (≥4 purchasable rungs), the SHOP gates S1–S4 + the DRAFT gates D1–D4, and ≥1 enabled entry in BOTH weapon tables | whitelist-starter-content | integration | done |
| wl-plat-11 | GET is public + cacheable, returns the empty doc on a fresh install (+ starter preview) | whitelist-api-public-read | integration | done |
| wl-plat-12 | Writes require the admin role: no token → 401, normal user → 403, admin → 200 + durable + public read reflects it | whitelist-api-admin-write | security | done |
| wl-plat-13 | Admin bulk endpoint enables/disables a kind; unknown kind → 400 | whitelist-api-bulk | integration | done |
| wl-plat-14 | Admin one-click starter applies the bundle, lands on the public read, and is audited | whitelist-api-starter | integration | done |
| wl-plat-15 | Bundle shape is self-consistent without the content tree: sorted, deduped, abilities exactly mirror champions × {q,w,e,r,ex} | whitelist-starter-shape | unit | done |
| wl-plat-16 | Empty store → automated seed applies the demo set (12 champs / ≥24 items / full kits, no half-enabled champion) and persists; a second run is a no-op | whitelist-seed-empty | integration | done |
| wl-plat-17 | The lazily-created EMPTY doc still counts as a fresh install (opening the console once must not block the seed) | whitelist-seed-lazy-empty | unit | done |
| wl-plat-18 | Already-curated store is NEVER overwritten or re-expanded by the automated seed; the explicit admin door still unions | whitelist-seed-preserves-curation | security | done |
| wl-plat-19 | The bundle is a suggestion, not a floor: after an operator prunes it, a restart does not resurrect it; disabling everything returns to empty | whitelist-seed-prune-sticks | regression | done |

## Game-server — authoritative enforcement (`apps/game-server/src/curation`)

`curation/whitelist.ts`: a `Whitelist` value object (bypass = allow-all), `fetchWhitelist`
(reads `GET /api/v1/curation/whitelist`, **fails safe to allow-all** on any error so a whitelist
outage never bricks a live match), a short-TTL `WhitelistCache`, and `GGD_WHITELIST_BYPASS=1`.
`MatchRoom.onCreate` resolves a snapshot at match creation; `MatchController` filters the
RANDOM/bot pool, sanitizes shop `buyItem` intents, filters the weapon-draft + gacha loot to the
whitelist, and `selectChampion` returns a typed rejection reason surfaced to the client via
`MSG.REJECT`.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| wl-game-01 | Whitelist value object membership + filters; bypass/allow-all allows everything | wl-value-object | unit | done |
| wl-game-02 | fetch fails SAFE to allow-all on unreachable/500/bad-json; bypass never hits the network | wl-fetch-failsafe | exception | done |
| wl-game-03 | A good 200 doc is enforced (even when empty); WhitelistCache shares one fetch per TTL | wl-fetch-enforced | unit | done |
| wl-game-04 | SELECT_CHAMPION rejects a non-whitelisted champion with a typed reason (not-whitelisted / unknown / wrong-phase / no-seat) | wl-select-reject | security | done |
| wl-game-05 | The RANDOM/bot champion pool is restricted to the whitelist | wl-random-pool | unit | done |
| wl-game-06 | Every auto-picked (bot) champion is whitelisted | wl-random-spawn | integration | done |
| wl-game-07 | Shop catalogue: a non-whitelisted `buyItem` is dropped before the sim; a whitelisted one goes through | wl-shop-filter | security | done |
| wl-game-08 | Weapon-draft/loot offers only ever contain whitelisted items | wl-offer-filter | integration | done |
| wl-game-09 | Bypass / allow-all disables all filtering | wl-bypass | unit | done |
| wl-game-10 | Enforced empty whitelist: bots fall back so the match runs, humans are rejected | wl-empty | integration | done |
| wl-game-11 | Ability whitelist gates the per-hero EX unlock: EX unlocks only when its ability id is whitelisted | wl-ex-gate | integration | done |
| wl-game-12 | The demo starter set (parsed from `starter.go`, one source of truth) resolves in the real registry, filters the roster/catalogue to EXACTLY the seeded ids, spawns every seat, unlocks every seeded EX, and leaves BOTH the quest-rewards (round 2) and legendary-weapons (round 5) drafts rollable | wl-starter-playable | integration | done |
