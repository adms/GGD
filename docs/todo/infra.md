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
| infra-02 | Nginx routes /, /editor, /content, /api, /ws | infra-nginx-routes | integration | done |
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
