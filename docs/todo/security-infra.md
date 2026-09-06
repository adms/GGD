# Deploy / edge security hardening (SEC-4) — TODO

Deploy- and edge-layer hardening of the GGD infra surface: no weak default
secrets, the internal result-callback route blocked at the public edge, an
opt-in NetworkPolicy restricting who may reach the platform, and nginx edge
abuse limits (WS connection cap, auth rate limit, HSTS, body-size cap).

Scope is infra only: `deploy/**`, `nginx/**`, `docker/**`, `Makefile`. The
matching platform/game code (HMAC seam, per-IP auth limiter) lives in `apps/**`
and is covered by its own TODO files (`game-seam.md`, `auth.md`).

Status note: the four items are implemented at the config/manifest layer and
verified manually with the commands in **Verification** below. They stay
`pending` (not `done`) because their automated `cover()` beacons belong in
`tools/testrunner/internal/infracheck` (helm-render + real-nginx-container
guards), which is outside this change's ownership — the same convention infra-09
follows for its config-level secret guard. Flip to `done` when the beacon lands.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| sec-infra-01 | No weak default secrets: helm `required` + compose `${VAR:?}` fail the render/boot when a secret is unset; `make up`/`.env` supply strong openssl-generated values (gitignored) | sec-infra-secrets | security | pending |
| sec-infra-02 | Edge denies `/api/v1/internal/**` (result callback) so it is never reachable from the public internet | sec-infra-internal-deny | security | pending |
| sec-infra-03 | Opt-in NetworkPolicy lets only the edge and game pods reach the platform port (in-cluster segmentation) | sec-infra-netpol | security | pending |
| sec-infra-04 | Edge abuse limits: per-IP WS connection cap, auth login/register rate limit, HSTS, explicit 1m body cap | sec-infra-edge-limits | security | pending |

## Private-deploy gate + Go-layer go-live hardening (#126)

Friends-only, no-monetization go-live. Registration is gated behind admin
approval and the achievable edge/app hardening lives in the Go platform. No
real-money/payment code — the M coin store stays admin-granted (#118).

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| sec-infra-05 | Private-deploy approval gate: a new account is `pending` and receives NO session; `login`/`refresh` refuse any non-approved account; approve/deny flips it. Grandfathers zero-status accounts. **Default resolved by `config.resolveRequireApproval`: ON for any non-loopback listen address, OFF on an explicit loopback bind (dev/CI), `GGD_REQUIRE_APPROVAL` overrides either way** — same predicate as the #174 invite gate, asserted identical in `TestBothRegistrationGatesShareOneDefault`. | sec-infra-approval-gate | security | done |
| sec-infra-05b | The flip is admin-only: `POST /admin/accounts/{id}/approve` and `/deny` refuse a non-admin bearer (`TestApprovalRoutesAreAdminOnly`; split from sec-infra-05 — one Test ID per row, GH#1031) | sec-infra-approval-requires-admin | security | done |
| sec-infra-08 | Approval **queue**: `GET /admin/accounts/pending` (oldest first, `total` = full pending count) and `GET /admin/accounts?status=` filter; every account row carries `status` + derived `approved`. Without a queue the gate is unusable — the owner would have to guess that a relative registered, and guess their account id. | sec-infra-approval-queue | security | done |
| sec-infra-09 | Approval decisions are **audited** (`approval_approved` / `approval_denied` with the operator id and an optional `reason`) and go through `admin.Service.SetApproval`, not a bare status write. Letting somebody into a private deploy was the one operator action that left no trace. | sec-infra-approval-audited | security | done |
| sec-infra-10 | Approval cannot **lock the deploy out**: denying the last administrator who can still sign in is refused `409 last_admin`, the same rule `SetAdminRole` applies to role revocation (a deploy where nobody can approve anybody, including the admin who would fix it). | sec-infra-approval-no-lockout | security | done |
| sec-infra-11 | A ban or denial takes effect **immediately**, not when the access token expires: `admin.AdminOnly` requires a *usable* admin (role + not banned + approved) and a denial revokes live refresh tokens. An access token is a signed bearer credential — checking only at login left a ~15-minute window to keep administering after being told no. | sec-infra-approval-revokes-live-session | security | done |
| sec-infra-11b | `auth.PlayableOnly` gates the room/match REST routes and the lobby WS handshake, so a denied player holding a still-valid access token cannot enter the lobby or keep playing (`TestDeniedPlayerCannotEnterTheLobbyWithALiveToken`; split from sec-infra-11 — one Test ID per row, GH#1031) | sec-infra-approval-blocks-play | security | done |
| sec-infra-12 | **No monetization surface**, asserted against the live chi route tree (not a grep): no payment/checkout/billing/subscription/top-up route exists in any package, and a player cannot grant himself M COIN. Both in-game currencies stay closed loops — M COIN is operator-granted (#118), crystals are earned by playing. | sec-infra-no-monetization | security | done |
| sec-infra-13 | The two registration gates **compose, in order**: #174 decides who may create an account, #126 decides who may play. An invited registration still lands `pending`; the code is burned at registration (not at approval), so one invite can never become an unlimited supply of pending accounts; an un-invited stranger never reaches the approval queue at all. The first account is exempt from BOTH — requiring a code nobody can mint, or an approval nobody can give, is a deadlock. | sec-infra-gates-compose | security | done |
| sec-infra-06 | No weak default secrets in the app: `server.New` refuses to boot when `JWT_SIGNING_SECRET` or `PLATFORM_GAME_SHARED_SECRET` is empty (second guard beyond `config.Load`, covering direct-Config callers). | sec-infra-boot-secret | security | done |
| sec-infra-07 | Go-edge hardening middleware: HSTS on every response and an explicit 1 MiB request-body cap (`TestHardeningHeadersAndBodyCap`). | sec-infra-edge-headers | security | done |
| sec-infra-07b | App-layer global registration throttle (`GGD_REGISTER_RATE_LIMIT`, 0 = off) backstopping the edge's per-IP register limit; the per-IP login limit already lives in `auth.Service.Login` (`TestRegisterRateLimit`; split from sec-infra-07 — one Test ID per row, GH#1031) | sec-infra-register-throttle | security | done |

**Why per-IP *register* limiting is edge-owned, not app-owned.** The
`admin`/`auth`/`server` packages are forbidden from reading a caller address —
`internal/server/devsurface_test.go` fails the build if any of them references
`httpx.ClientIP`, `RemoteAddr` or an `X-Forwarded-For`/`X-Real-Ip` header, and
pins the single sanctioned `httpx.ClientIP` call to the login rate-limit key in
`auth/handlers.go`. So per-IP *register* throttling belongs to nginx
(sec-infra-04); the app enforces the per-IP *login* limit plus an
address-free global registration cap.

Owned files: `internal/account/**` (status model), `internal/auth/service.go`
(login/refresh gate + pending registration), `internal/server/server.go`
(middleware + admin approval routes + boot secret guard). The #118 wallet route
group was not touched.

## Environment-tier content gate (copyright) (#127) — **RETIRED 2026-07-26 (#239)**

> **This gate no longer exists and is not coming back.** Every asset under
> `/content/assets/**` is served to anyone with the URL. The owner decided that
> on 2026-07-26, after being shown that static asset routes check no session at
> all (anonymous `curl` of an imported champion GLB against production → 200) —
> the invite code (#174) and the approval queue (#126) gate registration and the
> platform API, not bytes. It had also never fired in production: behind Caddy's
> `reverse_proxy`, `$remote_addr` is always a `172.16/12` container address.
> Full record, including what deliberately survived (the `geo` block, the #176
> boot-assertion trigger file, `classifyEnvTier` for the loopback cheat button):
> [`docs/copyright-content-gate.md`](../copyright-content-gate.md).
>
> The rows below are kept for history. `withdrawn` means "this requirement was
> deliberately dropped", not "still to do" — do not pick one up and re-implement it.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| sec-infra-14 | Environment-tier classifier (`loopback`/`lan`/`public`) — one shared util `@ggd/shared/envTier`, table-tested (46 cases); reuses the loopback rule + adds the private-IP ranges (`10./172.16-31./192.168./169.254.`, IPv6 ULA/link-local, `*.local`); fail-safe `unknown → public`. **The classifier survives #239** (live for the loopback-only cheat button) — only the gate it fed is gone. | copyright-env-tier | unit | done |
| sec-infra-15 | ~~Vite dev/preview middleware (`copyrightTierGate`) refuses the restricted mounts to a public peer (403)~~ — plugin **deleted** 2026-07-26 (#239). `client-lan --host 0.0.0.0` now serves the same bytes the edge does, deliberately. | copyright-vite-gate | security | withdrawn |
| sec-infra-16 | ~~Nginx edge gates the same mounts by `$remote_addr` tier (`geo`+`map`, `if ($ggd_deny_copyright) { return 403; }`)~~ — the `map` and all three `if` guards **deleted** 2026-07-26 (#239). The `geo $ggd_env_tier` block is kept, unread, so the family tier's geo fragment stays parseable and the #176 boot assertion keeps its trigger. What IS still enforced here: no nginx file may reference `$ggd_deny_copyright` (a dangling reference would stop the family edge booting) — asserted in `blizzardOverlayGate.test.ts`. | copyright-nginx-gate | security | withdrawn |
| sec-infra-17 | Platform declares its serving tier via `GGD_DEPLOY_TIER` (`private` or `public`, default **public**), logged at boot. Never a byte-serving gate; **unaffected by #239** and still load-bearing for the empty-whitelist boot refusal and the game-server endpoint check. | copyright-deploy-tier | security | pending |

Why sec-infra-17 stays `pending`: same convention as sec-infra-01..04 — its
automated beacon belongs in a config/container harness outside this change's
ownership. Flip to `done` when the beacon lands. sec-infra-15/16 will never be
done or pending again; they were withdrawn by owner decision, and re-opening
them means re-arming a gate that was deliberately removed.

Owned files: `packages/shared/src/envTier.ts` (+ `.test.ts`),
`apps/client/vite.config.ts`, `nginx/nginx.conf` + `nginx/dev/blizzard-overlay.conf`
(+ synced `deploy/helm/ggd/files/nginx.conf`), `apps/platform/internal/config/config.go`
+ `cmd/platform/main.go`, `docs/copyright-content-gate.md`. Did NOT touch
`apps/game-server/**`, `packages/shared/sim`, `content/**`, or client
`ui`/`render`.

## What changed

- `deploy/helm/ggd/templates/secret.yaml` — `| default "changeme-*"` → Helm
  `required "…" .Values.secrets.*` for all three secrets.
- `deploy/helm/ggd/values.yaml` — corrected the stale comment (empty defaults now
  fail fast, not "render without --set"); added `networkPolicy.enabled: false`.
- `docker/compose.yaml` — all three `${VAR:-dev-insecure-*}` → `${VAR:?set … in
  docker/.env}`; header comment updated. `docker/.env.example` added (no real
  secrets; `docker/.env` is gitignored via the root `.env` rule).
- `Makefile` — `secrets` target already generates strong values with
  `openssl rand`; tightened `redisPassword` from `-hex 16` to `-hex 32`. `up`
  runs `secrets` before `skaffold run -p local`, which loads the gitignored
  `deploy/helm/secrets.local.yaml` via skaffold's `valuesFiles`.
- `nginx/nginx.conf` (source of truth) + `deploy/helm/ggd/files/nginx.conf`
  (synced copy) — internal-deny location, exact-match auth rate-limit locations,
  `limit_conn`/`limit_req` zones, `limit_conn wsconn 20` on `/colyseus` + `/ws`,
  HSTS at the server block, `client_max_body_size 1m` in `http`.
- `deploy/helm/ggd/templates/networkpolicy.yaml` — new, gated on
  `.Values.networkPolicy.enabled`.

## Verification

Run from the repo root; helm v4 + a local nginx binary + docker CLI are assumed.

**sec-infra-secrets**
- `helm template ggd deploy/helm/ggd` → FAILS: `Error: … secret.yaml … secrets.jwtSigningSecret must be set …` (exit 1).
- `helm template ggd deploy/helm/ggd --set secrets.platformGameSharedSecret=x --set secrets.jwtSigningSecret=y --set secrets.redisPassword=z` → renders (exit 0).
- `helm template ggd deploy/helm/ggd -f deploy/helm/ggd/values-local.yaml` → renders (local dev fallbacks; exit 0).
- `helm lint deploy/helm/ggd` → `0 chart(s) failed` (WARNs list the three required values, as intended).
- `docker compose -f docker/compose.yaml config` with the three vars UNSET → FAILS: `required variable REDIS_PASSWORD is missing a value: set REDIS_PASSWORD in docker/.env` (exit 1); with them set to `openssl rand -hex 32` values → renders all services (exit 0), no `dev-insecure` string remains.
- Gitignore: `deploy/**/secrets*.yaml` covers `deploy/helm/secrets.local.yaml`; the root `.env` rule covers `docker/.env`; `/data/**` (keep `.gitkeep`) already covered.

**sec-infra-internal-deny**
- `nginx -t` on the config (mime include + in-cluster upstream hostnames stubbed to loopback for the host-only test) → `syntax is ok` / `test is successful`.
- Rendered edge ConfigMap contains `location /api/v1/internal/ { deny all; return 404; }` ahead of the generic `/api/` proxy (longest-prefix match makes it win regardless of order).

**sec-infra-netpol**
- `helm template … --set networkPolicy.enabled=true --show-only templates/networkpolicy.yaml` → renders a NetworkPolicy whose `podSelector` targets `app.kubernetes.io/name: platform` and whose `ingress.from` allows only `name: edge` and `name: game` on TCP `platform.port` (8080).
- Same command WITHOUT the flag → no NetworkPolicy is emitted (default `enabled: false` keeps local kind working).

**sec-infra-edge-limits**
- The rendered edge ConfigMap / `nginx -t` confirm: `limit_conn_zone … zone=wsconn:10m` + `limit_conn wsconn 20` on `/colyseus` and `/ws`; `limit_req_zone … zone=authlogin:10m rate=10r/m` + `limit_req zone=authlogin burst=5 nodelay` on exact `/api/v1/auth/login` and `/api/v1/auth/register`; `add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always` at the server block; `client_max_body_size 1m` in `http`. WS upgrade headers and 3600s proxy timeouts on the gameplay locations are left intact.

## Notes / follow-ups (out of this change's ownership)

- HSTS: TLS terminates upstream of the edge (ingress/LB), which is the
  authoritative place for the header on public HTTPS responses. It is also set on
  the edge (browsers ignore it over plain HTTP) so the guarantee travels with the
  app if the edge ever becomes the TLS hop.
- Two source comments in `apps/**` — `apps/platform/internal/gamelink/callback.go`
  and `apps/game-server/src/index.ts` — say the internal route is
  "NetworkPolicy-restricted / not exposed at the edge". Before this change those
  claims were aspirational; the edge-deny (sec-infra-02) and NetworkPolicy
  (sec-infra-03) now make them accurate. Left unedited because `apps/**` is owned
  by other active agents.
- The per-IP WS cap (20) and auth rate (10r/m) are conservative defaults; raise
  them for deployments fronting many users behind a shared NAT/egress IP.

### Deploy-config follow-ups for #126 (FLAGGED — pure k8s/helm/nginx, out of the
### Go platform's ownership; not implemented in this change)

These four items are the private-deploy hardening that cannot live in the Go
binary; they belong to `deploy/**`, `nginx/**`, `docker/**`:

1. **helm required-secrets** — chart `required`/compose `${VAR:?}` so a render
   fails when `JWT_SIGNING_SECRET` / `PLATFORM_GAME_SHARED_SECRET` /
   `REDIS_PASSWORD` are unset (sec-infra-01). The app now also fails boot
   (sec-infra-06), but the manifest guard stops a bad deploy earlier.
2. **NetworkPolicy** — only the edge + game pods may reach the platform port
   (sec-infra-03).
3. **Edge denies `/api/v1/internal/**`** — the result-callback route is never
   reachable from the public internet (sec-infra-02).
4. **Per-IP auth login/register rate limit at nginx** (sec-infra-04) — the edge
   owns per-IP register throttling (the Go auth/server packages may not read a
   caller address; see the #126 section above).

For a friends-only private deploy the operator additionally sets
`GGD_REQUIRE_APPROVAL=1` (approval gate on) and may set
`GGD_REGISTER_RATE_LIMIT` (global registration cap).
