# Victory settlement — TODO

Per-player match stats + rating (S+..C-) + per-match ranking, the control-freeze once the
match outcome is decided, and the match-end settlement payload the server sends clients.

Sim/server half: deterministic `PlayerMatchStats` accumulator wired into the existing
combat/death/heal/ability/flower/economy paths (part of world state + digest); the pure
`grade()` + `perMatchRanks()` rating functions; the input FREEZE at `resolution`/`matchEnd`;
and the `matchSettlement` MSG.EVENT payload.

Client half: the FRONTAL low-angle hero-shot camera (render/settlementCamera + CameraRig
.setSettlement, driven off `state.outcomeDecided` in GameApp, input frozen to mirror the
server), the redesigned settlement screen (MatchEndPanel — big colored grade, per-stat
breakdown + data-driven reflection hints, full per-player ranking table), and the
"查看戰績變化" leaderboard rank-delta wiring (ranking.ts computeRankDelta + store additive
transition + LeaderboardPanel banner).

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| settle-01 | Two seeded runs → identical per-player scoreboards + digest | settle-stats-deterministic | determinism | done |
| settle-02 | Every counter increments on the right sim event (damage/heal/cc/kill/assist/ability/flower/gold/xp/time) | settle-stats-events | unit | done |
| settle-03 | 12-step grade ladder S+..C- maps scores at the band boundaries | settle-grade-boundaries | unit | done |
| settle-04 | Role normalisation: same statline grades per role weighting | settle-grade-role | unit | done |
| settle-05 | Lobby normalisation: same statline scores vs a weak/strong lobby | settle-grade-lobby | unit | done |
| settle-06 | Per-match rank 1..N by composite score, ties broken deterministically | settle-rank-order | unit | done |
| settle-07 | Control frozen after the outcome is decided — human input ignored, hero idle | settle-freeze | integration | done |
| settle-08 | Match-end payload: graded + ranked per-player scoreboard + winner | settle-payload | integration | done |
| settle-09 | Settlement payload identical across two seeded runs | settle-payload-deterministic | determinism | done |
| settle-c01 | Settlement camera positions IN FRONT of the model (facing side, low angle, looks at hero) | settle-cam-front | unit | done |
| settle-c02 | Settlement camera dollies IN over time (distance shrinks) | settle-cam-dolly | unit | done |
| settle-c03 | CameraRig settlement freeze: front-view hero shot, movement/pan input ignored, idempotent re-set, clear restores follow | settle-cam-freeze | integration | done |
| settle-c04 | Grade → tier / colour (S gold … C grey) / headline mapping | settle-grade-color | unit | done |
| settle-c05 | Stat formatters + breakdown (accuracy "—" on no skillshots, KDA, ticks→s, labelled rows) | settle-stat-format | unit | done |
| settle-c06 | Data-driven reflection hints (low-accuracy tip … role praise), capped, never empty | settle-hints | unit | done |
| settle-c07 | Ranking table builder sorts by rank (seat tie-break, pure) + local-card / winner lookup | settle-rank-table | unit | done |
| settle-c08 | Post-match rank delta (points gain / rank climb / tier change / null-safe) for 查看戰績變化 | settle-delta | unit | done |
| settle-c09 | Auto-scroll target offset centers the player's row, clamped at the first/last row + eased duration scaled by distance | settle-scroll-center | unit | done |
| settle-c10 | Auto-scroll skipped when the row is already fully visible (small list / top rank) — highlight only | settle-scroll-skip | unit | done |
| settle-c11 | Auto-scroll timeline: pinned at rank 1 for the hold, eased travel, lands exactly centered once | settle-scroll-timeline | unit | done |
| settle-c12 | Manual wheel / touch / drag / scroll-key input cancels the auto-scroll instantly and detaches (typing does not) | settle-scroll-cancel | unit | done |
| settle-c13 | prefers-reduced-motion: no animation — rendered already scrolled to the centered offset | settle-scroll-reduced | unit | done |
| settle-c14 | Auto-scroll runs exactly once per match (cancelled runs never retrigger; next match re-arms) | settle-scroll-once | unit | done |
