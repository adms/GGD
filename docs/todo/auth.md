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
