# Couch play (local multiplayer) — TODO

Local couch multiplayer end-to-end: room members carry `localPlayers` (1..4, adjustable
in-room, capacity = Σ localPlayers ≤ 12); start reserves one seat per local player using
guest pseudo-ids `{accountId}:p2`..`:p4` (same team as the owner when possible, display
"Name (2P)", settlement/MMR/M COIN skip guests); the lobby WS `match_ready` push carries an
additive `seatTokens[]` array (old `seatToken` kept for compat); the client opens N
RoomConnections (pad k → connection k via its own IntentSender + GamepadInput), renders ONE
scene through Babylon multi-viewport split-screen (1 full, 2 vertical halves, 3-4 = 2x2 grid
with the empty quadrant showing a scoreboard) with a per-viewport mini-HUD, and dev mode
joins N direct connections from N connected pads (fake-pad injection seam:
`globalThis.__ggdFakePads`).

Simplifications (by design): entity rendering keys off connection 0's state only; client
prediction covers player 1 only — players 2..4 render server-authoritative (~100 ms interp);
world-anchor healthbars project through player 1's camera only.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| couch-01 | Room member localPlayers bounds 1..4 (PATCH /rooms/{id}/local-players; member-only) | couch-localplayers-bounds | unit | done |
| couch-02 | Capacity everywhere = Σ localPlayers ≤ 12 (join, patch, lobby list, leave frees) | couch-capacity-sum | integration | done |
| couch-03 | Start rejects when Σ localPlayers > 12 (race-seeded overcap) | couch-start-overcap | exception | done |
| couch-04 | Guest seat generation (":pN" ids, "(NP)" names) + same-team first-fit grouping | couch-guest-seats | unit | done |
| couch-05 | match_ready pushes seatTokens[] per member (owner first; compat seatToken kept) | couch-seattokens-push | integration | done |
| couch-06 | Settlement skips guests: no MMR, no M COIN, no history/leaderboard/account | couch-settle-skips-guests | integration | done |
| couch-07 | Game server: distinct pseudo-ids of one base account each get their own seat + driver | couch-multi-seat-reserve | unit | done |
| couch-08 | One local connection leaving swaps ONLY that seat to AI | couch-leave-swaps-one | unit | done |
| couch-09 | Split-screen viewport rect math for 1/2/3/4 players (+ CSS mirror) | couch-viewport-rects | unit | done |
| couch-10 | One camera per viewport, each following its own champion (NullEngine) | couch-viewport-follow | unit | done |
| couch-11 | Pad k drives local player k only (routing, sparse indices, button edges) | couch-pad-routing | unit | done |
| couch-12 | Multi-connection intent isolation (pad 2 never leaks into player 1's stream) | couch-intent-isolation | unit | done |
| couch-13 | Guest display names / "×N (本機)" member badges / seat sums | couch-guest-labels | unit | done |
| couch-14 | Lobby reducer: seatTokens[] parsed; malformed arrays dropped, compat path intact | couch-matchready-seattokens | exception | done |
| couch-15 | RoomStore projects couch accountIds → per-player seats + vitals (change-guarded) | couch-localplayers-store | unit | done |
| couch-16 | E2E: 2 pads → 2 connections → live 2-viewport split-screen match | couch-e2e-split | e2e | pending |

couch-16 was verified live with injected fake pads against the real game-server
(dev flow, 2026-07-21) but stays `pending` until a Playwright suite emits its
beacon (same convention as webui-11/12).
