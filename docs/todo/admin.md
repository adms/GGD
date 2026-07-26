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

**First admin — nothing to configure.** While a deploy has NO administrator, a
registration claims ownership: that account is granted the `admin` role and
forced to `approved` status in the same write that creates it, and the register
response already carries both (see `internal/auth/bootstrap.go`, tests
`auth-13`..`auth-21`). Whoever installs the platform simply registers first and
picks their own password — no default credential ships in this repo, and there
is no forced-change window to get wrong. The window shuts by itself the moment
an admin exists.

**The gate is "does any account carry the `admin` role?"**, read from the
account FILES (a directory scan, not `_index.json`, and not Redis). It is
deliberately NOT "the store is empty": every way an account can land without a
promotion — a half-failed create, a client that hung up, a concurrent loser
winning the race to disk — would make that rule terminal, leaving a deploy with
accounts, no admin, and no way to ever get one. Under this rule those cases
simply retry. The Redis `bootstrap:owner` key is only a short-TTL mutex that
serialises simultaneous first registrations; it is released either way and can
never decide the outcome, so a Redis flush cannot mint a second owner and a
crash cannot block the first.

**Hardening (`GGD_OWNER_BOOTSTRAP_TOKEN=1`).** The open claim is a footrace on a
public endpoint: on a network the operator does not control, a stranger could
register first. With this set, boot mints a one-time token into the log and
`DATA_DIR/owner-setup-token` (0600), and only a registration presenting it (as
`bootstrapToken` in the register body) may claim ownership. Registrations
without it still succeed as ordinary players, so nothing bricks. A loopback
check is NOT used and must not be added: the LAN-published vite dev server
proxies remote clients to this binary, so every one of them arrives as
127.0.0.1 — see `internal/server/devsurface_test.go`.

**Recovery — the ROLE:** `ADMIN_BOOTSTRAP_USERNAME=<username>` still works — set
it and restart, and boot makes that (already registered) account a USABLE admin
idempotently: it grants the role, forces `approved` and clears any ban. All
three matter, because a rescued account that is pending (under the #126 gate) or
banned (by a squatter who won the claim) cannot obtain a token, and a rescue
that cannot log in is not a rescue. Once in, `POST
/api/v1/admin/accounts/{id}/role` grants or revokes the role on any account
(audited; it refuses to remove the last admin who can still sign in), so a wrong
grant is fixable in the product rather than by hand-editing account JSON.

**Recovery — the PASSWORD (`cmd/ownerreset`).** The line above rescues a ROLE and
cannot touch a credential, which left the actual lockout unaddressed: a
single-owner deploy whose owner forgot the password they picked had no in-product
way back, and hand-editing `data/accounts/<id>.json` does not help either — the
field holds an argon2id hash nobody can type. `apps/platform/cmd/ownerreset` is
that path:

```
go -C apps/platform run ./cmd/ownerreset -list                 # who are the admins?
go -C apps/platform run ./cmd/ownerreset -username <name>      # prompts twice, echo off
go -C apps/platform run ./cmd/ownerreset -username <name> -generate
```

It writes the durable store + Redis directly, so it works whether or not the
platform is up, and **no restart is needed** when it is: every credential read is
an `os.ReadFile` of the account file (`jsonstore` caches nothing; Login,
`auth.Middleware` and `AdminOnly` all re-read per request). It revokes every live
refresh token through the seam ban/deny use, forces `approved`, clears any ban,
re-hashes through the SAME `auth.HashPassword` registration uses, and writes an
audit line (`owner_password_reset`, actor `host:ownerreset`) with no secret in it.
Redis must be reachable — refresh tokens live nowhere else, so a reset that
could not revoke them would silently leave every stolen session alive; it refuses
up front instead. Already-minted ACCESS tokens still expire on their own clock
(≤ `AccessTokenTTL`, 15m), which is the platform's normal revocation latency.

**WHY IT IS A COMMAND AND NOT AN ENDPOINT.** The authorisation is proof of HOST
ACCESS — the same currency `GGD_OWNER_BOOTSTRAP_TOKEN`'s 0600 file trades in,
except a process the operator started needs no token to prove where it runs. A
loopback-gated endpoint was rejected: the LAN-published vite dev server proxies
every phone on the wifi into this binary as 127.0.0.1, so "loopback" here means
"anyone on the network", and it would hand out the administrator's password.
`internal/ownerreset/surface_test.go` pins that nothing serving HTTP even LINKS
the package (no route to find, not merely a guarded one) and that neither it nor
its command reads a caller address; `internal/server/devsurface_test.go` keeps
the same ban over `internal/{auth,admin,server}`. The password is never a flag —
argv is world-readable via `ps` and lands in shell history — so it comes from a
no-echo TTY prompt or `-generate`, and a `-password …`-shaped argument is refused
with an explanation *before* `flag.Parse`.

⚠ `DATA_DIR` defaults to a RELATIVE path. Run the command with the SAME
`DATA_DIR` the platform runs with, or it opens an empty store beside the real one
and reports "no administrator". It prints the directory it opened at startup for
exactly this reason.

⚠ NOT IN THE CONTAINER IMAGE YET. `docker/platform.Dockerfile` builds `/platform`
and `/seed` only, so on a k8s deploy this command is reachable only from a
checkout, not via `kubectl exec`. Adding `-o /out/ownerreset ./cmd/ownerreset`
alongside the existing two lines is all it needs (see `admin-40`).

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
| admin-40 | Ship `/ownerreset` in the platform container image so a k8s deploy can `kubectl exec` it — `docker/platform.Dockerfile` builds `/platform` and `/seed` only, leaving cluster installs recoverable from a checkout only. Owned by whoever owns `docker/`; the Go command itself is done (`auth-26`..`auth-33`) | ownerreset-in-image | integration | pending |

## Admin console SPA (`apps/admin`, `@ggd/admin`)

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| admin-19 | Session refresh-once-on-401 + role guard (admin ping → not-authorized) | adminui-session-guard | unit | done |
| admin-20 | Console Hub health-ping reducer (up/down/checking transitions) | adminui-hub-health | unit | done |
| admin-21 | Hub link config resolves dev defaults + PROD same-origin preset | adminui-hub-config | unit | done |
| admin-22 | Players table filter (substring, case-insensitive) | adminui-players-filter | unit | done |
| admin-23 | Ban / M COIN action state machines (success/403/404 via mock fetch) | adminui-action-machines | unit | done |
| admin-24 | Announcement form validation + active toggle | adminui-announcement-form | unit | done |
| admin-41 | 帳號審核 (#126): the approval console. The backend (`/admin/accounts/pending`, `…/{id}/approve`, `…/{id}/deny`) shipped complete and tested with NO caller — `AccountRow` had no `status`, so a pending relative was invisible in Players and could only be let in by curl. The console half classifies all FIVE states (`pending`/`approved`/`denied`/grandfathered `""`/status-absent — the last two must not collapse), renders approval AND ban as independent badges everywhere accounts are listed, offers one-tap 通過 with a confirm-gated 婉拒 that says how it differs from 停權, and badges the queue depth on the nav rail from any page | adminui-account-approval | unit | done |
| admin-39 | The login screen carries a 「忘記密碼 / 無法登入」 runbook (Traditional Chinese) naming the exact `cmd/ownerreset` commands, the machine to run them on, and the `DATA_DIR` trap — and it is GUIDANCE: the module imports nothing, calls nothing, names no API path, and the screen adds no reset request or token field | adminui-login-recovery | security | done |

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

## 上線燈號 + 邀請碼排版 (#246)

Two console changes the owner asked for on the same day, both additive.

**上線燈號.** The Players table gains ONE column answering 「1小時內曾經有動作的
玩家」. Two independent signals, deliberately not merged: `lastSeenAt` (the last
authenticated session activity of any kind, stamped platform-side — see auth-43)
and `presence` (the live lobby socket, read from Redis at render time). The
second is the NARROWER claim, not the stronger one — the lobby socket opens the
moment a player reaches the menu — so the tooltip renders 對戰中 / 大廳中 rather
than one ambiguous 「目前連線中」. Presence is best-effort: an unreadable Redis
leaves the field unset and the row shows the last-seen line alone.

Two honesty requirements ride along. Background polling counts as activity (the
owner's explicit choice), so a parked tab keeps someone lit — stated once in a
legend under the table instead of on every row. And the table now refreshes
itself every 30s with a visible 資料時間 stamp, because a liveness light frozen
at page-load reads as authoritative while quietly ageing.

**邀請碼排版.** The crowding had two causes and CSS was only one of them. Since
#203 the list is a MIXED feed — one auto-minted personal referral code per
registration, interleaved newest-first with the operator's own — so a 來源 filter
(defaulting to 後台發出) does most of the work, with per-source counts on the
chips and the hidden count spelled out. Then the columns: 8 → 6, by folding 來源
into 備註 and 到期 into 狀態. Nothing was deleted and the code itself is never
truncated — `GGD-XXXX-XXXX` is the one value the page exists to convey.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| admin-42 | The online light answers 「1小時內有動作」 and nothing more: the hour threshold is inclusive at the boundary, a missing/unparseable stamp reads as never (not as offline), a live socket outranks the timestamp and names 對戰中 vs 大廳中 separately, and an ABSENT presence field says nothing about connectivity while the last-seen half still works | adminui-players-seen | unit | done |
| admin-43 | The 邀請碼 來源 split is a VIEW filter, never a content cut: the two source views partition the list exactly, an untagged row from an older server counts as 後台 (the direction that cannot hide the owner's own codes), and `summarize` gained per-source counts without changing the three it already returned | adminui-invites-source | unit | done |
