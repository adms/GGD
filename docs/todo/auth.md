# Auth (register/login) — TODO

Go platform: `internal/auth` + `internal/account`. Argon2id hashing, JWT access + opaque refresh
in Redis, atomic account JSON as durable truth. The human enters credentials in the client UI —
the backend never auto-fills.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| auth-01 | Register with unique username + email | auth-register-ok | unit | done |
| auth-02 | Reject duplicate username (atomic SETNX) | auth-register-dup-username | unit | done |
| auth-03 | Reject duplicate email | auth-register-dup-email | unit | done |
| auth-04 | Password stored as argon2id, never plaintext | auth-password-argon2id | security | done |
| auth-05 | Login success returns access + refresh token | auth-login-ok | unit | done |
| auth-06 | Login failure is constant-time (no user-enumeration) | auth-login-timing | security | done |
| auth-07 | Refresh token rotates; reuse is detected & revoked | auth-refresh-rotate | security | done |
| auth-08 | Access JWT tamper is rejected | auth-jwt-tamper | injection | done |
| auth-09 | Login rate-limited per IP | auth-rate-limit | security | done |
| auth-10 | Register rejects malformed/oversized input | auth-input-validation | exception | done |
| auth-11 | Account JSON write is atomic (tmp+rename) | auth-atomic-write | integration | done |
| auth-12 | Username field rejects control/injection chars | auth-username-injection | injection | done |
| auth-13 | First account on an ownerless deploy becomes owner (admin role + approved), reflected in the register response | auth-first-account-owner | integration | done |
| auth-14 | The second account gets no role and no console access | auth-second-account-not-owner | security | done |
| auth-15 | Owner grant beats the approval gate: first account is approved + tokened even with `GGD_REQUIRE_APPROVAL` on (anti-brick) | auth-first-account-owner-approval-gate | regression | done |
| auth-16 | N concurrent first registrations produce EXACTLY one admin (Redis mutex referee) | auth-first-account-owner-race | security | done |
| auth-17 | A deploy that already has an admin never promotes anyone else, even after a full Redis flush | auth-existing-store-no-owner | security | done |
| auth-18 | `ADMIN_BOOTSTRAP_USERNAME` still grants admin as the recovery path | auth-bootstrap-username-recovery | integration | done |
| auth-19 | An ownerless store that already holds accounts is still claimable (no terminal zero-admin state) | auth-first-owner-self-heals | regression | done |
| auth-20 | A cancelled/dead client cannot leave a half-registered, un-promoted account behind | auth-first-owner-cancelled-request | security | done |
| auth-21 | `GGD_OWNER_BOOTSTRAP_TOKEN=1`: only a registration presenting the one-time 0600 token claims ownership, and it is consumed | auth-first-owner-token-gate | security | done |
| auth-22 | Bootstrap recovery yields a USABLE admin — role + approved + unbanned — and can actually log in | auth-bootstrap-recovery-usable | regression | done |
| auth-23 | Admin role is revocable via `/admin/accounts/{id}/role`, and the last usable admin cannot remove itself | auth-admin-role-revoke | security | done |
| auth-24 | A store-unkeyable e-mail (`user+tag@…`) creates ONE complete account, never a half-written one | auth-create-unkeyable-email | security | done |
| auth-25 | Username/e-mail uniqueness is enforced by the durable store, so a Redis wipe cannot repoint an existing name | auth-create-durable-uniqueness | security | done |
| auth-26 | Host-side reset (`cmd/ownerreset`) replaces the stored hash: the old password stops working and the new one logs in, with the platform still running and un-restarted | ownerreset-resets-password | integration | done |
| auth-27 | The reset kills EVERY live refresh token of that account (and no other account's), and refuses to run at all when Redis is unreachable rather than leaving stolen sessions alive | ownerreset-revokes-sessions | security | done |
| auth-28 | A banned + pending administrator comes back USABLE — role kept, ban cleared, forced approved — and can actually sign in | ownerreset-rescues-locked-out-admin | regression | done |
| auth-29 | The password reaches no log line, no audit field, no file under `DATA_DIR`, and no flag: a password-shaped argument is refused with an explanation before `flag.Parse` | ownerreset-no-password-leak | security | done |
| auth-30 | A target with no `admin` role is refused (and nothing is written) unless `-allow-non-admin` is passed explicitly | ownerreset-non-admin-guarded | security | done |
| auth-31 | The reset is recorded in the SAME append-only audit log the console renders, actor `host:ownerreset`, with no credential material in it | ownerreset-audited | integration | done |
| auth-32 | The CLI re-hashes with the parameters REGISTRATION uses (one `auth.HashPassword`, not a second cost setting) | ownerreset-registration-params | regression | done |
| auth-33 | The reset is NOT an endpoint: nothing that serves HTTP links the package, and neither it nor its command reads a caller address | ownerreset-not-an-endpoint | security | done |
| auth-34 | 邀請碼 happy path: admin mints a code in the console, a family member registers with it, and the console shows WHO redeemed it and when | invite-happy-path | integration | done |
| auth-35 | FIRST ACCOUNT is invite-EXEMPT on an ownerless deploy (else the deploy is bricked: only an admin can mint, and there is no admin) — and the exemption closes itself the instant that account file lands | invite-first-account | security | done |
| auth-36 | With no owner claim available (established deploy / unreadable store) EVERY registration needs a code — the gate fails CLOSED | invite-fails-closed | security | done |
| auth-37 | Every rejection reason over HTTP: missing → `invite_required`; unknown, malformed and REVOKED → one identical `invite_invalid`; spent → `invite_used` (the only distinction a family member needs) | invite-reject-http | security | done |
| auth-38 | Concurrent redemption of one single-use code produces EXACTLY one account, and the document names the winner (service level) | invite-redeem-race | security | done |
| auth-39 | Same race over real HTTP through the register handler: N simultaneous registrations, one 201, the rest `invite_used` | invite-redeem-race-http | security | done |
| auth-40 | A spent code stays spent across a platform restart AND a full Redis flush — the truth is DATA_DIR, and this package adds no Redis key at all | invite-durable | security | done |
| auth-41 | Mint / list / revoke are 401 unauthenticated and 403 for an authenticated non-admin — an invite code is a credential, so nothing about it is readable without an operator session | invite-admin-only | security | done |
| auth-42 | Unknown / expired / revoked / already-used are distinguished only as far as the UX needs (service level), and a malformed code is answered without touching the store | invite-reject-reasons | security | done |
| auth-43 | #246 last-seen: ANY authenticated request stamps `lastSeenAt` (registration alone does not — the light is about ACTIVITY, not about having an account), and the stamp never drags `UpdatedAt` with it, because that field means "the record changed" and the console shows it | lastseen-stamped | integration | done |
| auth-44 | The durable write is coalesced to one per account per minute: 25 requests inside one window produce exactly ONE write, and the next window stamps again. Ungated this is 18–48 full-file rewrites/minute PER PLAYER against a single-writer JSON store, so the gate is load-bearing — and it fails CLOSED when Redis errors | lastseen-throttled | regression | done |
| auth-45 | The lobby WebSocket stamps too. It authenticates at the handshake and never passes through `auth.Middleware`, so a player sitting in a match with the socket open and no REST polling would otherwise go dark on the console | lastseen-ws | integration | done |
| auth-46 | #1006 first-owner claim re-checks the durable admin gate AFTER taking the referee claim: with a scripted gate (1st read empty, 2nd read one admin) the registrant does NOT get RoleAdmin, the claim is released, and the next registrant can still take ownership — a deterministic replay of the #979 interleaving, not a timing race | auth-first-owner-claim-recheck | regression | done |
| auth-47 | The scripted-gate seam (`ScriptAdminsGate`) lives only in `_test.go` — go/parser scan of non-test sources finds zero references, so the shipped binary structurally has no such door (calibrated: the scan does see it in the test file) | auth-first-owner-seam-test-only | security | done |
