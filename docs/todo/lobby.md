# Lobby & chat — TODO

Go platform: `internal/lobby`. One WS per client; open-room list from `rooms:open` ZSET; chat via
Redis Stream + Pub/Sub (non-durable).

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| lobby-01 | WS requires a valid access token | lobby-ws-auth | security | done |
| lobby-02 | Open-room list reflects Redis ZSET | lobby-room-list | integration | done |
| lobby-03 | Chat message broadcast to room members | lobby-chat-broadcast | integration | done |
| lobby-04 | Chat sanitizes/escapes user content (XSS) | lobby-chat-xss | injection | done |
| lobby-05 | Chat rate-limited per account | lobby-chat-rate-limit | security | done |
| lobby-06 | Disconnect clears presence + WS resources | lobby-ws-cleanup | exception | done |
| lobby-07 | Malformed WS frame is rejected, not fatal | lobby-ws-malformed | exception | done |
| lobby-08 | Chat history capped (stream trim) | lobby-chat-cap | unit | done |
| lobby-09 | Lobby entry reads the public announcement feed | lobby-announcement-feed | integration | done |
| lobby-10 | A player in the lobby SEES the current announcement | lobby-announcement-visible | integration | done |
| lobby-11 | Dismissal sticks per announcement id; a new one shows again | lobby-announcement-dismiss | integration | done |
| lobby-12 | Operator line breaks render; text is escaped, never executed | lobby-announcement-readable | unit | done |
| lobby-13 | Popup reserves the build-stamp band and fits a 390px phone | lobby-announcement-chrome | unit | done |
| lobby-14 | An unreachable/garbage feed leaves the lobby unchanged | lobby-announcement-failquiet | exception | done |
