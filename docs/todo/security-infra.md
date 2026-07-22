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
