# Infra & one-click K8s — TODO

Nginx edge, Docker images, Helm umbrella chart, kind + Skaffold, `make up`,
plus the test harness itself (tools/testrunner + apps/test-dashboard) and the
repo-wide build hygiene every other suite depends on.

Verification notes: infra-02/03/05/06/07 are enforced by automated guards in
`tools/testrunner/internal/infracheck` (helm render — dockerized helm fallback —
and a real nginx container with stub dists); infra-11/12 by the testrunner's Go
unit tests; infra-13 by the dashboard's vitest suite; infra-14 by
`packages/shared/src/staleArtifacts.test.ts`, which walks packages/, apps/ and
tools/ from the @ggd/shared suite. infra-09 has a config-level guard (no secrets
in Dockerfiles, envFrom secretRef) but stays pending until image-level scanning
lands.

**infra-14 is not tidiness.** Vite resolves an extensionless import with `.js`
ahead of `.ts`, so a compiled `foo.js` left beside `foo.ts` — which a bare
`tsc <file>` emits, for that file and everything it imports, because naming a
file on the command line makes tsc ignore the project `noEmit` — wins every
relative import while bare `@ggd/shared/*` specifiers keep resolving to the
source through the package `exports` map. The sim's module-level registries
then exist twice: `registerAll()` fills one instance and `Champions.get()` reads
the other and throws `content not registered: <id>` with content that loaded
perfectly. `vitest.shared.ts` pins `.ts` first for the test runs, but the dev
server and the production build keep Vite's default order — so the artifacts
must simply not exist, and this gate is what says so out loud.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| infra-01 | `make up` brings the full stack on a kind cluster | infra-make-up | e2e | pending |
| infra-02 | Nginx routes /, /content, /api, /ws — and, since #241, does NOT route /editor in the prod layout (it falls through to the client SPA; the location moved to the dev-only include) | infra-nginx-routes | integration | done |
| infra-03 | `?h=` requests get immutable cache header | infra-cache-immutable | integration | done |
| infra-04 | WS upgrade proxied to Colyseus (long timeout) | infra-ws-proxy | integration | pending |
| infra-05 | content-api NOT exposed in prod profile | infra-content-api-dev-only | security | done |
| infra-06 | Helm renders valid manifests (helm template) | infra-helm-template | unit | done |
| infra-07 | Platform is single-writer (replicas:1, Recreate) | infra-single-writer | unit | done |
| infra-08 | Redis wiped → platform rebuilds from data/ JSON | infra-redis-recovery | regression | pending |
| infra-09 | Secrets injected via env, never baked into images | infra-secrets-env | security | pending |
| infra-10 | data/ persists across restarts (PVC / kind mount) | infra-data-persist | integration | pending |
| infra-11 | Testrunner runs fixed category order, regression always last | infra-testrunner-regression-last | unit | done |
| infra-12 | Testrunner executes only allow-listed suites.yaml commands | infra-testrunner-allowlist | security | done |
| infra-13 | Test dashboard store tracks run lifecycle from SSE events | infra-dashboard-store | unit | done |
| infra-14 | No compiled `.js`/`.jsx`/`.mjs`/`.cjs` (or its `.map`) shadows a `.ts`/`.tsx` source anywhere in packages/, apps/ or tools/ — a stray `tsc <file>` artifact would win extensionless imports and split the sim's registries into two instances | build-hygiene-no-stale-js | regression | done |
| infra-15 | `GGD_BUILD_STAMP` is threaded from host git into EVERY build path (task #66, defect P0-6(a), shape S5): `docker/edge.Dockerfile` declares the ARG→ENV before the client build, `docker/compose.yaml` + `docker/compose.family.yaml` interpolate it into `build.args`, `skaffold.yaml` expands it for the kind/helm path, and the Makefile computes it (`git rev-parse --short HEAD` + `-dirty` + UTC date) and EXPORTs it so all three read one value — the image itself cannot compute a stamp (no `.git`, no git binary), which is why every container build previously baked `"dev"` | infra-build-stamp-arg | unit | done |

## `/editor/` was public, unauthenticated, and useless (#241)

The content-authoring SPA was COPYd into the edge image unconditionally and
nginx served it at `/editor/` as plain static with **no authentication**, so on
the family deploy anyone who typed the URL got the collection lists, the
schema-derived form for every champion / ability / item, the 鑄技工坊 template
gallery, the 3D model and VFX inspectors and the AI-icon / AI-fill controls.

It was never a WRITE hole — `apps/editor/src/api/client.ts` dead-folds
`WRITES_ENABLED` to `false` in a `vite build`, and `/content-api/` is
deliberately absent from the production nginx — which is exactly why deleting
the surface costs nothing: it was 100% non-functional in production and 100%
visible.

**The fix is exposure, not an environment gate.** It is deliberately NOT a
`$remote_addr` rule: owner decision #239 retired that whole approach, and the
edge sits behind Caddy so `$remote_addr` is the proxy anyway. Instead the route
moved to `nginx/dev/editor.conf` (the same `/etc/nginx/ggd-dev/` mechanism that
already keeps `/content-api/` out of prod) and the bundle became opt-in at image
build time (`GGD_INCLUDE_EDITOR`, default `0`). Verified on a real build: the
default image ships **0 files** under `/usr/share/nginx/html/editor/`, the
`--build-arg GGD_INCLUDE_EDITOR=1` image ships 347.

**After this change an unauthenticated visitor to a production deploy can reach:**
`/` (game client), `/admin/` (the console — unchanged, still an operator surface
with its own loopback-or-session rule and the `/etc/nginx/ggd-admin/` hook),
`/content/**`, `/api/**` (minus `/api/v1/internal/**`), `/ws/`, `/colyseus/`,
`/healthz`. They **cannot** reach `/editor/` (falls through to the client SPA),
`/content-api/**` (never routed), or any editor JS/CSS chunk (not in the image).

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| infra-40 | `/editor/` is not a production surface, in BOTH halves: `nginx/nginx.conf` and its Helm copy carry no `location /editor/` (nor the `= /editor` redirect) while keeping the `ggd-dev` include that turns it on for a dev box, and `docker/edge.Dockerfile` builds/copies the bundle only behind `ARG GGD_INCLUDE_EDITOR="0"` via an always-present `/dist-out/editor` staging dir — plus no compose/skaffold path sets it to `"1"`. Either half alone leaves a door open, so both are asserted | infra-editor-not-exposed | security | done |
| infra-25 | ONE badge definition, framework-free (task #245): `@ggd/shared/versionBadge` is the single source for how a raw stamp resolves (absent/blank => the honest `dev`, never a blank box or the string `undefined`), which stamp wins when a dev server reports a fresher one, the DOM markers guards grep for, and the exact box — geometry, colours, the reserved band (`VERSION_BADGE_BAND_PX` / `_W_PX`, which `ui/hud/hudLayout` re-exports as `HUD_STAMP_BAND` rather than restating, so the badge's own geometry and the #107 reservation cannot disagree) and `VERSION_BADGE_Z`, which must out-rank the client's tallest declared layer (`HUD_Z.modal` 2147483600) while staying under the int32 ceiling. It imports NOTHING (no React, no DOM types) because `@ggd/shared` is also the Colyseus game server's dependency | version-badge-core | unit | done |
