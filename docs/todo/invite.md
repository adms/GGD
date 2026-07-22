# Invites — TODO

Go platform: `internal/room/invite`. Invite tokens in Redis (TTL 10m) + push to target's lobby WS.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| invite-01 | Create invite token for a room | invite-create | unit | done |
| invite-02 | Accept valid token joins the room | invite-accept | integration | done |
| invite-03 | Expired token is rejected | invite-expired | exception | done |
| invite-04 | Token is single-use / bounded uses | invite-single-use | security | done |
| invite-05 | Invite pushed to target over WS | invite-push | integration | done |
| invite-06 | Cannot forge invite for a room you don't host | invite-authz | security | done |
| invite-07 | Token is unguessable (entropy) | invite-entropy | security | done |
