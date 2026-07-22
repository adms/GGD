# Go⇄Colyseus match seam — TODO

Server-to-server HMAC handoff (`internal/gamelink`) + result callback. Bots are NOT reserved
(spawned by MatchRoom); only human seats get reservations.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| seam-01 | Start computes teams + botCount = 12 − humans | seam-teams-botcount | unit | done |
| seam-02 | HMAC-signed reservation request accepted by (fake) Node | seam-reserve-ok | integration | done |
| seam-03 | Bad/absent HMAC is rejected | seam-hmac-reject | security | done |
| seam-04 | Timestamp skew > 30s rejected (replay defense) | seam-replay-skew | security | done |
| seam-05 | Each client receives its own seatToken over WS | seam-seat-token-push | integration | done |
| seam-06 | Result callback verifies HMAC | seam-result-hmac | security | done |
| seam-07 | Duplicate result callback is idempotent | seam-result-idempotent | regression | done |
| seam-08 | Result writes match JSON (truth) + history append | seam-result-persist | integration | done |
| seam-09 | Result updates per-account MMR + leaderboard | seam-result-ranking | integration | done |
| seam-10 | Stuck match reaped as abandoned after TTL | seam-reaper | exception | done |
| seam-11 | `/_internal` route not reachable via public edge | seam-internal-private | security | done |
