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
