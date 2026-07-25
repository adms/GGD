# Platform web UI — TODO

`apps/client/src/ui/platform` — the pre-match screens inside the game client SPA: auth
(register/login with backend-mirrored validation), session persistence with
refresh-on-401-once, the lobby (friends + presence over the lobby WS, room browser,
room view with ready/champion pick/invites, chat, leaderboard, wallet header), the
M COIN store (catalog, buy with 402/409 surfacing, equip, Babylon 3D skin preview via
`render/StorePreview`), and the seat-token match handoff (`consumeSeatReservation`)
with client-side equipped-skin model substitution. "Play offline vs bots" keeps the
dev direct-join path alive without the platform.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| webui-01 | Auth form validation mirrors backend rules (username/email/password, control chars) | webui-auth-validation | unit | done |
| webui-02 | Session: 401 → refresh once → retry once; failed refresh logs out; single-flight | webui-session-refresh | unit | done |
| webui-03 | API errors surface the `{error:{code,message}}` envelope (incl. non-JSON fallback) | webui-error-envelope | exception | done |
| webui-04 | Lobby WS reducer: presence/invite/chat/match_ready/error → store updates | webui-lobby-reducer | unit | done |
| webui-05 | Malformed/unknown WS frames ignored safely (no throw, no state churn) | webui-lobby-reducer-junk | exception | done |
| webui-06 | Purchase machine: confirm → buy → done(wallet); busy state uninterruptible | webui-store-buy | unit | done |
| webui-07 | 402 insufficient_mcoin surfaced clearly; machine recoverable | webui-store-402 | exception | done |
| webui-08 | 409 already_owned surfaced clearly; network errors retryable | webui-store-409 | exception | done |
| webui-09 | Catalog derivation: champion-grouped rows, owned/equipped badges, doc names | webui-catalog-derive | unit | done |
| webui-10 | Equipped skin → local-seat modelKey override map (owned+matching skins only) | webui-skin-override | unit | done |
| webui-11 | E2E: register two accounts → friend → room → ready → both seat tokens join one match | webui-e2e-flow | e2e | pending |
| webui-12 | E2E: buy + equip skin in store → champion model swaps in-match | webui-e2e-skin | e2e | pending |
| webui-13 | Self-service 修改密碼 (#211): validate confirm-match + platform password shape, POST /account/password with the current password (refreshOn401 off), swap in the fresh token pair, GENERIC failure (no wrong-old-password oracle), 429 → wait | webui-change-password | unit | done |

webui-11/12 were verified live in the browser against the real Go platform +
game-server (2026-07-20) but stay `pending` until a Playwright suite emits their
beacons (see `playwright-e2e` placeholder in `tools/testrunner/suites.yaml`).
