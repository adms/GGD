# Rooms — TODO

Go platform: `internal/room`. Rooms are Redis-only ephemeral (hash + members + `rooms:open` ZSET).
Only room templates are durable JSON.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| room-01 | Create room (host, settings: map/mode/bot-fill) | room-create | unit | done |
| room-02 | Join room up to capacity | room-join | unit | done |
| room-03 | Join rejects when full | room-join-full | exception | done |
| room-04 | Leave room; empty room is disposed | room-leave-dispose | unit | done |
| room-05 | Host-only controls enforced (start, settings) | room-host-authz | security | done |
| room-06 | Ready-up state tracked per member | room-ready | unit | done |
| room-07 | Start requires all humans ready or bot-fill | room-start-preconditions | unit | done |
| room-08 | Open rooms appear in lobby ZSET, closed removed | room-visibility | integration | done |
| room-09 | Save/load a room template (durable JSON) | room-template-roundtrip | integration | done |
