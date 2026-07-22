# Operations admin backend + admin console — TODO

The operator-facing admin surface: a Go module (`internal/admin`) exposing player
management (search/ban/unban, M COIN grants, MMR maintenance), match-history
inspection, durable announcements and an append-only audit log — every route
gated on the `admin` account role; plus the `@ggd/admin` console SPA (a Console
Hub that links + health-pings every service URL, and management pages for
players/matches/announcements/audit).

Storage follows the platform convention (data/ JSON truth + rebuildable Redis).
Account mutations reuse the existing locked read-modify-write paths
(`account.Repo.Update`/`SetRating`, `wallet.SetMCoinAbsolute`,
`ranking.Add`), so they stay single-writer safe. Timestamps come from a clock
seam (no wall-clock in the audit/announcement paths).

**First admin:** register an account normally, set `ADMIN_BOOTSTRAP_USERNAME=<that
username>`, and restart the platform — boot grants it the `admin` role
idempotently. (Or grant the role on the account JSON directly.)

## Backend (`apps/platform/internal/admin`)

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| admin-01 | Pagination/role helpers are pure & correct; AccountRow carries no hash | admin-pagination-unit | unit | done |
| admin-02 | Every admin route rejects a valid non-admin token with 403 (table) | admin-role-gate | security | done |
| admin-03 | Admin surface is not an IDOR vector: no token → 401, normal token → 403, role grant enables | admin-authz-idor | security | done |
| admin-04 | Ban refuses login with 403 `account_banned` + reason | admin-ban-blocks-login | integration | done |
| admin-05 | Unban restores login | admin-unban-restores | integration | done |
| admin-06 | Banned account cannot rotate a still-live refresh token (403 `account_banned`) | admin-banned-no-refresh | security | done |
| admin-07 | Ban lives on the JSON truth: survives a full Redis wipe | admin-ban-survives-redis-wipe | regression | done |
| admin-08 | M COIN adjust moves the wallet AND writes an audit line with the delta | admin-mcoin-audited | integration | done |
| admin-09 | M COIN adjust clamps at zero (never negative) | admin-mcoin-clamp | exception | done |
| admin-10 | Absolute MMR set re-ZADDs the ladder → reflected on the public leaderboard | admin-mmr-leaderboard | integration | done |
| admin-11 | Account search filters by substring and paginates | admin-search-pagination | integration | done |
| admin-12 | Search + profile never leak the password hash | admin-no-hash-leak | security | done |
| admin-13 | Announcement create/list/update/delete lifecycle | admin-announcement-crud | integration | done |
| admin-14 | Updating/deleting a missing announcement is a clean 404 | admin-announcement-notfound | exception | done |
| admin-15 | Public feed exposes ACTIVE announcements only (no operator metadata) | admin-public-feed-active | integration | done |
| admin-16 | Mutations append audit entries (newest first) with the acting admin id | admin-audit-append | integration | done |
| admin-17 | `ADMIN_BOOTSTRAP_USERNAME` grants the admin role idempotently on boot | admin-bootstrap-grant | integration | done |
| admin-18 | Settled matches are listable/gettable and filterable by account | admin-match-history | integration | done |

## Admin console SPA (`apps/admin`, `@ggd/admin`)

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| admin-19 | Session refresh-once-on-401 + role guard (admin ping → not-authorized) | adminui-session-guard | unit | done |
| admin-20 | Console Hub health-ping reducer (up/down/checking transitions) | adminui-hub-health | unit | done |
| admin-21 | Hub link config resolves dev defaults + PROD same-origin preset | adminui-hub-config | unit | done |
| admin-22 | Players table filter (substring, case-insensitive) | adminui-players-filter | unit | done |
| admin-23 | Ban / M COIN action state machines (success/403/404 via mock fetch) | adminui-action-machines | unit | done |
| admin-24 | Announcement form validation + active toggle | adminui-announcement-form | unit | done |

## 內容管理 — content CRUD in the console (task #102)

The 英雄 / 技能 / 武器道具 management pages, and the authorisation model that
makes "localhost 視同管理者" safe on a machine that deliberately publishes a
dev server to the LAN.

**THE RULE: authorisation by REACHABILITY, not by DETECTION.** Nothing decides
whether a caller "is local"; a non-local caller cannot open the socket.
Peer-checking is the second layer, never the first. This matters here because a
vite proxy LAUNDERS the source address — a phone hitting the LAN-published game
server (`client-lan`, `--host 0.0.0.0`, verified at http://192.168.0.106:39527)
produces a request that arrives at the proxied service from 127.0.0.1. So:

- the **Go platform gains no address-based trust at all**. `/api/v1/admin/*`
  keeps argon2id + alg-pinned HS256 + `AdminOnly`; there is no dev-admin route,
  no loopback bypass, no second mux. Laundering an address into it buys the
  same 401 it buys today. (Hardening only: `PLATFORM_ADDR=127.0.0.1:8080` in
  `.claude/launch.json` closes the *direct* LAN path; the code default stays
  `:8080` so k8s is unaffected.)
- the **`/content-api` route is deleted from the game client**, not guarded —
  a guarded route is one plugin-reorder away from being live. A 404 tripwire
  covers the whole prefix so a re-added proxy entry still cannot reach :8787.
- the **admin console owns the proxy**, because its vite server binds
  `127.0.0.1` *and refuses to start with a non-loopback `--host`* — the vite
  equivalent of `apps/content-api/src/index.ts`'s bind refusal.

⚠ LANDMINE: `internal/httpx/middleware.go` `ClientIP()` returns `X-Real-Ip`
BEFORE falling back to `RemoteAddr`. Correct for rate limiting, catastrophic in
a trust decision, and it looks right in review. `admin-31` is the only thing
standing between a future contributor and that hole.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| admin-25 | Browse / view / edit / save 英雄・技能・武器道具 from the console; the write module is the ONLY mutating content path and is `import.meta.env.DEV` dead-folded out of a production build | content-admin-gate | security | done |
| admin-26 | The LAN-published game client has no `/content-api` proxy and 404s the whole prefix (route deleted, not guarded) | content-admin-no-lan-route | security | done |
| admin-27 | The console's vite server refuses to bind a non-loopback host, including the bare `--host` flag (resolved `true`) | content-admin-loopback-bind | security | done |
| admin-28 | A save dry-run validates EVERY step before writing ANY, and reports the new `contentVersion` (cv_…) so a running match's desync is stated, not silent | content-admin-save | integration | done |
| admin-29 | The mirror rule: editing a Q/W/E/R ability writes the standalone doc AND its champion's embedded twin (the sim reads the embedded one); one invalid step aborts the pair | content-admin-mirror-write | integration | done |
| admin-30 | A partial failure names what landed and its undo snapshots — there is no VCS (#65), so a silent half-write is unrecoverable | content-admin-partial-write | exception | done |
| admin-31 | `internal/{admin,auth,server}` reference no caller address (`X-Real-Ip` / `X-Forwarded-For` / `httpx.ClientIP` / `RemoteAddr`), with one bounded exemption: the login rate-limit bucket key, which may never be branched on | content-admin-no-address-trust | security | done |
| admin-32 | The `:8080` router 404s every dev-shaped path, authenticated and not — so a second loopback listener could never put dev routes back on the LAN-proxied port | content-admin-no-dev-routes | security | done |
| admin-33 | The form spec's editable paths resolve in REAL content docs, and whatever it does not render is NAMED (`uncoveredKeys`) rather than hidden | content-admin-fields | unit | done |
| admin-34 | The per-field edit model is SHARED, not duplicated: dot-path get/set that never mutates the source, empty input means ABSENT (key removed) not `""`, typed parse rejects instead of coercing, leaf diff of exactly what a save would overwrite, and the mirror plan — all in `@ggd/shared/content/editModel` so the console and the codex cannot drift apart | content-edit-model | unit | done |

### Runbook — after ANY vite config change, or after starting a dev server with `--host`

```
make lan-probe          # or ./tools/lan-probe.sh 192.168.0.106
```

Every other guard here asserts something about SOURCE. This one asserts
something about the RUNNING MACHINE, which is the only place the property
actually lives: "can a device on the wifi reach a write surface?" is answered by
sockets, not by files. It probes this box through its own LAN address, so it
walks the same path a phone would. Verified passing on 2026-07-22:
`/content-api` on :39527 → 404 on every verb, :60721 and :8787 connection-refused
from the LAN, the game's `/api/v1/healthz` still 200, and the laundered
`/api/v1/admin/accounts` still 401.

## 模型預算 + ICON 生成追蹤 — the two asset consoles (task #102)

Re-homed into 後台管理 as **consumers**. Neither page measures anything: two
implementations of "how many triangles" or "how many icons are missing" would
diverge within a day and then BOTH numbers are worthless, which defeats the
reason they were asked for (「讓我知道你真的有在作事」). So the measurement layers are
imported rather than copied. They were built inside `apps/client` and first
consumed across the app boundary by relative path; now that two apps count from
them, the PURE ones live in `packages/shared` — which both apps already depend
on — and the client's own pages read the same files through the same
`@ggd/shared/…` specifiers. One definition, two consumers:

| what | who owns it | consumed from |
| --- | --- | --- |
| coverage arithmetic, live index-hash re-poll, icon byte scan | #97 | `@ggd/shared/codex/{codexCoverage,codexPlan,codexIcons,codexTypes}` |
| the exclusion / blocked / backlog classification | #72 | `content/config/icon-plan.json`, read through #97's `codexPlan` |
| style spec, freshness compare, cost estimate, authorisation, provider readiness | #101 | `@ggd/shared/assetConsole/assetConsoleData` + the React hook `apps/client/src/ui/assets/useAssetConsole.ts` + `apps/client/dev/iconConsoleStamp.ts` (mounted on the admin dev server too) |
| per-model tris / textures / VRAM / draw calls / usage / same-screen budget | #99 | its published report — probed across `BUDGET_CANDIDATE_URLS`, or an operator-pinned URL |

That coupling is deliberate: if #97/#99/#101 rename something, this build BREAKS
rather than quietly rendering last week's numbers. Two threads are still pulled
across the app boundary by relative path, both by choice: the React hooks that
do the I/O (`useAssetConsole.ts`) — moving those would give `@ggd/shared` a
React dependency it does not otherwise have — and the dev-server freshness
endpoint (`apps/client/dev/iconConsoleStamp.ts`), which is build tooling and not
shippable code. `apps/admin/src/ui/theme.ts` still owns its styling outright:
nothing about the look is imported from the client. #99's report has not landed
yet, so 模型預算 currently lists the 116 live model docs with every metric marked
「未量測」 and names what to run — a budget page that fills its columns with zeroes
is worse than an empty one, because zeroes get believed.

**No API key is displayed, accepted, logged or stored.** Provider state comes
from the platform's public readiness projection (booleans + a reason code); the
page's remedy for "no provider" is a link to AI 生成設定.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| admin-35 | 模型預算 reads #99's report and never measures: the reader tolerates alternate field spellings, an ABSENT metric stays null and prints 「未量測」 (never 0), and a non-report document is refused | adminui-model-budget | unit | done |
| admin-36 | A value is only "within budget" when a real limit came with the report — a missing limit or a missing measurement is `unknown`, never `ok`; per-screen limits beat report-wide ones and neither is invented | adminui-model-budget-limits | unit | done |
| admin-37 | ICON 生成追蹤's numbers come out of #97's own `computeIconCoverage` over #72's own plan (dropped leaves the denominator, blocked stays in it, a declared-but-unfetchable icon is demoted), and tier counts are never invented without a plan | adminui-icon-tracking | unit | done |
| admin-38 | The one thing the consolidated page owns: whether its feeds AGREE. Missing plan, stale plan, missing/drifted style spec, mismatched content digests, an unreachable platform vs a 404 platform (different fixes), an unscanned byte pass — each produces a note, and no note ever carries key material | adminui-icon-tracking-notes | unit | done |
