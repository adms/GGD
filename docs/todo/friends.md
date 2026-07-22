# Friends & presence — TODO

Go platform: `internal/friend` + `internal/presence`. Write-through to both `data/friends/<id>.json`
files (locked in ULID order); presence via Redis + Pub/Sub.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| friend-01 | Send friend request | friend-request-send | unit | done |
| friend-02 | Accept request adds both sides (write-through) | friend-accept-bidirectional | integration | done |
| friend-03 | Decline request removes it | friend-decline | unit | done |
| friend-04 | Remove friend clears both sides | friend-remove-bidirectional | integration | done |
| friend-05 | Block prevents new requests | friend-block | unit | done |
| friend-06 | Cannot friend yourself | friend-self-reject | exception | done |
| friend-07 | Duplicate request is idempotent | friend-request-dedupe | unit | done |
| friend-08 | Presence flips online/offline via heartbeat TTL | presence-heartbeat | integration | done |
| friend-09 | Friend online-delta pushed over lobby WS | presence-push | integration | done |
| friend-10 | Cannot act on another user's friend list (IDOR) | friend-authz-idor | security | done |
| friend-11 | Concurrent accept/remove keeps files consistent | friend-concurrency | regression | done |
