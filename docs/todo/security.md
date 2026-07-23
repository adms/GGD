# Security audit follow-ups (#154) — TODO

Actionable follow-ups from the consolidated security audit
[`docs/_security-audit.md`](../_security-audit.md). 26 findings across injection,
DoS/DDoS, auth/session/secrets, and the browser-facing/content-serving surface —
each verified at file:line (not proximity-grepped).

Ownership split: the **game-server wave is landing the `in-progress` items now**
(the `safeNow=true` findings — F-01/03/04/07/14). Everything else is `deferred`
to its reconcile wave (#127 content/edge, #152 client UI, #118/platform-auth,
infra). The four `regression` rows are CI guards over already-verified defenses
(F-23..F-26 — no code defect, keep them from regressing).

Test IDs are `sec-154-*` and map to the SECURITY TEST MATRIX in the audit doc.
Nothing is marked `done`: no fix has landed a covering `cover()` in this
docs-only pass, so the runtime gate would (correctly) reject a premature `done`.

## Fix now — game-server wave (`safeNow=true`)

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| sec-154-01 | Whitelist Colyseus INPUT commands at ingress (`InputMailbox.push`/`MatchRoom.onMessage`): drop unknown `kind`, `slot ∈ {Q,W,E,R,EX}`, `itemSlot` int in range, finite coords; shared `tryGet`/`Object.hasOwn` so a bad id rejects not throws. Kills the prototype-name one-message full-room DoS (F-01). | sec-154-input-shape | injection | in-progress |
| sec-154-03 | Gate `MatchRoom.onCreate` on a server-only proof injected by `/_internal/matches`; abort before any sim state builds; low `seatReservationTime` + `autoDispose` + process-wide max-rooms. Stops the client `create()` room-flood (F-03). | sec-154-room-create-gate | security | in-progress |
| sec-154-04 | Cap `commands[]` per message and total buffered per tick in `InputMailbox.push`; per-session INPUT rate limit in `onMessage`; optional `maxPayload`. Stops the single-message event-loop stall (F-04). | sec-154-input-rate-cap | security | in-progress |
| sec-154-07 | Sanitize/normalize seat `displayName` in `handleInternalMatches` + `onCreate` (bounded charset, strip `<>&"'`, cap len) and reject client-supplied `options.seats` / require a create-only token. Server-side XSS-source backstop (F-07). | sec-154-seat-name-sanitize | injection | in-progress |
| sec-154-14 | Add a game-server boot guard mirroring the platform's `checkRequiredSecrets`: non-dev env with empty `PLATFORM_GAME_SHARED_SECRET` → `process.exit(1)`; remove the `options.accountId` identity fallback outside dev. Closes the fail-open (F-14). | sec-154-gs-boot-secret | security | in-progress |

## Deferred — reconcile waves (`safeNow=false`)

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| sec-154-02 | Per-IP register limiter mirroring Login + weighted semaphore (~`NumCPU/2`) bounding concurrent argon2; keep the global cap as defense-in-depth only. (platform-auth / #118) — argon2id amplifier F-02. | sec-154-argon2-semaphore | security | deferred |
| sec-154-05 | Resolve trusted-proxy in `httpx`: honor `X-Real-Ip`/`X-Forwarded-For` only when `RemoteAddr ∈` a configured CIDR, else `RemoteAddr`; thread it (not into `auth`/`server`/`admin` — `devsurface_test` guard). Closes login rate-limit bypass F-05. | sec-154-trusted-proxy-ip | security | deferred |
| sec-154-06 | `WorldAnchorLayer.makeChampionNode`: write the name via `nameEl.textContent`, `color`/numeric via `element.style`, never string-concat HTML. (client / #152) — DOM-XSS F-06. | sec-154-healthbar-textcontent | injection | deferred |
| sec-154-08 | Validate provider-returned URLs before fetch: require https; reject loopback/link-local/RFC1918/ULA/`169.254.169.254`; constrain to configured provider domain; no auth headers to a foreign host. (platform / #118) — SSRF F-08. | sec-154-ssrf-url-guard | injection | deferred |
| sec-154-09 | Set `ReadTimeout`/`WriteTimeout`/`IdleTimeout` + `MaxHeaderBytes` on the platform `http.Server`; separate handler/deadlines for the long-lived lobby WS. (platform) — slowloris F-09. | sec-154-http-timeouts | security | deferred |
| sec-154-10 | Per-account (+per-IP) lobby-WS cap in `Hub.register`/`handleWS`; `limit_conn` on the lobby WS edge path; read-deadline/heartbeat reaper. (platform + infra) — WS exhaustion F-10. | sec-154-lobby-ws-cap | security | deferred |
| sec-154-11 | Cap total pending/unapproved accounts + TTL/reaper for never-approved reservation keys; shares the per-IP register limiter with sec-154-02. (platform) — unbounded store growth F-11. | sec-154-register-store-cap | security | deferred |
| sec-154-12 | Scope `?token=` to the WS handshake handler; `auth.Middleware` reads the `Authorization` header only; nginx `log_format`/`map` masks `token=`. (platform + infra) — token-in-URL/logs F-12. | sec-154-token-ws-only | security | deferred |
| sec-154-13 | Auth-class framing of the same `ClientIP` root cause as sec-154-05 (F-13) — one trusted-proxy fix closes both; tracked separately for the auth/session test row. | sec-154-clientip-trusted | security | deferred |
| sec-154-15 | Replace the `frame-ancestors 'none'`-only CSP with a real `default-src`/`script-src`/`object-src`/`base-uri` policy tuned for Babylon; coordinate with the client bundle (nonce/inline-style). (infra + client / #127) — CSP F-15. | sec-154-csp-script-src | security | deferred |
| sec-154-16 | Exclude audition/debug HTML from the prod build so `dist/` ships only `index.html`; belt-and-suspenders nginx 404 on the model-budget.html / audition.html debug pages. (client + infra / #127) — attack-surface F-16. | sec-154-dist-html-exclude | security | deferred |
| sec-154-17 | `realpathSync` + re-check containment after `resolve()` in the vite `staticHandler` (content + blizzard-overlay roots); on error `next()`. (vite / #127) — symlink traversal F-17. | sec-154-content-realpath | injection | deferred |
| sec-154-18 | One opaque register conflict for username+email; argon2 before the uniqueness reply (timing parity); per-IP register limiter. (platform) — enumeration F-18. | sec-154-register-generic-conflict | security | deferred |
| sec-154-19 | Mint an `aud` (`ggd-access`) and add `jwt.WithIssuer`/`jwt.WithAudience` to `VerifyAccess`. (platform) — jwt-claim-validation F-19. | sec-154-jwt-aud-iss | security | deferred |
| sec-154-20 | Generate ephemeral local secrets via `make up` (or a boot-time denylist rejecting the known `dev-insecure-*` values in any non-dev env). (infra) — hardcoded secret F-20. | sec-154-weak-secret-denylist | security | deferred |
| sec-154-21 | Move the refresh token to an httpOnly + Secure + SameSite=Strict cookie (access token in memory only); if bearer-in-JSON is kept, the strict `script-src` CSP is a hard prerequisite. (client + platform / #152 + #118) — token storage F-21. | sec-154-refresh-httponly | security | deferred |
| sec-154-22 | Add `X-Content-Type-Options: nosniff` in the vite `staticHandler`; consider 404-ing extensions outside CONTENT_MIME. (vite / #127) — MIME-sniffing F-22. | sec-154-content-nosniff | security | deferred |

## Regression guards — verified defenses (`info`, no defect)

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| sec-154-23 | Keep the `/content` traversal regression test (`../`, encoded `%2e%2e`, absolute → 404); optional `realpath` hardening = sec-154-17. Verified safe F-23. | sec-154-content-traversal-regress | regression | deferred |
| sec-154-24 | CI grep guard: no handler sets `ACAO:*` together with `Access-Control-Allow-Credentials: true`. Verified clean F-24. | sec-154-cors-no-wildcard | regression | deferred |
| sec-154-25 | CI guard: no redis port binding off `127.0.0.1`; no reappearance of the `redis-e2e` harness; compose lint asserts `requirepass`. Verified fixed (#117) F-25. | sec-154-redis-bind-regress | regression | deferred |
| sec-154-26 | Retain boot-fails-on-missing-secret + pending-register-empty-`TokenPair` + deny-revokes-refresh tests. Verified correct (#126) F-26. (Note: guards non-empty, not non-weak — see sec-154-20.) | sec-154-boot-secret-regress | regression | deferred |

## Notes

- **F-05 / F-13 are one root cause** (`httpx.ClientIP` trusting `X-Real-Ip`): the
  single trusted-proxy fix (sec-154-05) closes both; sec-154-13 exists only to
  carry the auth/session-class test row.
- **The #46 tick try/catch is not a mitigation for F-01** — it converts the
  throw into a full-room `disconnect()`. sec-154-01 fixes the input at ingress so
  the throw never happens.
- **Statuses stay off `done`** until each fix lands a passing `cover("<test_id>")`;
  flip `in-progress`→`done` as the game-server wave's tests go green, and
  `deferred`→`in-progress`→`done` as each reconcile wave picks its rows up.
