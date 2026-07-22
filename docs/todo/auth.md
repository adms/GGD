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
