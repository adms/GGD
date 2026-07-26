package auth

// Self-service password change.
//
// THE THREAT MODEL, because it drives every ordering decision below.
//
// A session token alone must NOT be enough to change a password. If it were, a
// stolen access token would let an attacker lock the real owner out of their own
// account permanently — the single worst outcome available to a token thief, and
// the reason every requirement here exists. So the endpoint demands the CURRENT
// password in the body on top of a valid session, and that proof is verified
// with the same argon2id comparison Login uses, behind the same generic failure
// (ErrInvalidCredentials) so nothing about the account leaks.
//
// The mirror-image risk is the endpoint becoming a password ORACLE: an attacker
// with a stolen session brute-forcing the current password through it. That is
// why the current-password check sits behind the same kind of Redis rate limiter
// the login path uses — keyed on the ACCOUNT (the thing being guessed at), not
// on a caller address, which this package is forbidden to read at all (see
// internal/server/devsurface_test.go).
//
// On success every live refresh token of the account is revoked and the caller
// is handed a fresh pair, so a stolen session dies at its next rotation while
// the operator who just changed their password stays signed in.

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/alexedwards/argon2id"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/httpx"
)

const (
	// passwordChangeRateLimit throttles current-password verification per
	// account, so a hijacked session cannot brute-force the old password.
	// Tighter than the login limit: a human changes their password once.
	passwordChangeRateLimit  = 5
	passwordChangeRateWindow = time.Minute

	// AuditActionPasswordChange is the audit action name for a self-service
	// password change (the operator console's audit log renders it).
	AuditActionPasswordChange = "password_change"
)

// Auditor appends one line to the platform's append-only admin audit log.
//
// This package cannot import internal/admin — admin imports auth for its
// AdminOnly gate, so the dependency only runs one way — hence the sink is an
// interface injected by the composition root (internal/server wires it over the
// same admin-audit collection the console reads).
type Auditor interface {
	Audit(ctx context.Context, actorID, action, targetID string, detail map[string]any) error
}

// SetAuditor installs the audit sink. Optional: with no auditor a password
// change still succeeds, it is simply not recorded.
func (s *Service) SetAuditor(a Auditor) { s.auditor = a }

// ChangePassword replaces the password of an already-authenticated account.
//
// accountID comes from the verified access token (the caller runs under
// Middleware); currentPassword is the proof of possession that a session alone
// cannot substitute for. On success every refresh token of the account is
// revoked and a FRESH pair is returned for the caller to keep using.
//
// Failure surface, deliberately narrow:
//   - a wrong current password (or an account that vanished) → the exact
//     ErrInvalidCredentials Login returns, so this is not an oracle;
//   - too many attempts → the same 429 the login limiter returns;
//   - a new password that fails ValidatePassword, or that is the current one →
//     400, which only a caller who already proved the current password can see.
func (s *Service) ChangePassword(ctx context.Context, accountID, currentPassword, newPassword string) (TokenPair, error) {
	// 1. Shape-check the NEW password with the registration validator. No secret
	//    is consulted here, so an honest user fixing a typo does not burn the
	//    brute-force budget below.
	if err := ValidatePassword(newPassword); err != nil {
		return TokenPair{}, err
	}
	// 2–3. Length guard, throttle the guess, verify the current password, and
	//    refuse a banned account — in that order, unchanged. Extracted into
	//    ReauthPassword so the platform has ONE proof-of-possession check; see
	//    its doc comment.
	a, err := s.reauth(ctx, accountID, currentPassword, "password-change")
	if err != nil {
		return TokenPair{}, err
	}

	// 4. Reject a no-op change. Checked against the STORED HASH rather than by
	//    comparing the two plaintexts, so the same constant-time primitive does
	//    the work here too. Only reachable once the current password is proven,
	//    so the specific message leaks nothing.
	same, err := argon2id.ComparePasswordAndHash(newPassword, a.PasswordHash)
	if err == nil && same {
		return TokenPair{}, httpx.BadRequest("new password must differ from the current password")
	}

	// 5. Re-hash with the registration parameters and persist through the
	//    account store's locked read-modify-write path. HashPassword is the one
	//    hashing entry point — cmd/ownerreset writes hashes through it too, so
	//    the CLI recovery path and this one cannot drift apart on cost.
	hash, err := HashPassword(newPassword, s.params)
	if err != nil {
		return TokenPair{}, err
	}
	if _, err := s.accounts.SetPasswordHash(ctx, accountID, hash); err != nil {
		return TokenPair{}, err
	}

	// 6. Kill every live session of this account — including the caller's — then
	//    hand the caller a new pair. A refresh token stolen before this point is
	//    now unknown to Redis, so the thief's next rotation is a 401. (The
	//    thief's ACCESS token remains valid until it expires, at most
	//    cfg.AccessTokenTTL; refresh rotation is the platform's revocation seam
	//    and this uses it exactly as ban/deny do.)
	if err := s.rdb.RevokeAllRefresh(ctx, accountID); err != nil {
		return TokenPair{}, err
	}
	pair, err := s.issueTokens(ctx, a)
	if err != nil {
		return TokenPair{}, err
	}

	// 7. Audit. NEVER the password and never the hash — the entry records that a
	//    change happened, by whom, and that sessions were revoked.
	s.auditPasswordChange(ctx, a)
	return pair, nil
}

// ReauthPassword confirms that the caller HOLDS the account's password RIGHT
// NOW, on top of a valid session.
//
// It exists because a session token is not authorisation for a credential
// action. That rule was first bought by /account/password (see this file's
// header: a stolen token must not be enough to lock the owner out), and #243's
// platform-data export/import re-uses it — one export is every password hash
// and every live invite code on the deploy, which is a larger exposure than any
// other route in the product.
//
// scope names the rate-limit bucket, so a different dangerous action gets its
// own budget instead of eating the password-change one. Failure is always the
// generic ErrInvalidCredentials, so this is not an oracle.
func (s *Service) ReauthPassword(ctx context.Context, accountID, password, scope string) error {
	if scope == "" {
		scope = "reauth"
	}
	_, err := s.reauth(ctx, accountID, password, scope)
	return err
}

// reauth is the shared body: length guard, per-account throttle, timing-safe
// argon2id comparison, ban check.
func (s *Service) reauth(ctx context.Context, accountID, password, scope string) (account.Account, error) {
	// An over-long password is a non-starter — refuse it the way Login does
	// rather than paying argon2id for it, while still burning a dummy compare
	// so the timing shape does not change.
	if len(password) > 128 || hasControl(password) {
		_, _ = argon2id.ComparePasswordAndHash("x", s.dummyHash)
		return account.Account{}, ErrInvalidCredentials
	}
	ok, err := s.rdb.RateAllow(ctx, scope, accountID, passwordChangeRateLimit, passwordChangeRateWindow)
	if err != nil {
		return account.Account{}, err
	}
	if !ok {
		return account.Account{}, httpx.RateLimited("too many attempts, please wait a moment")
	}
	a, err := s.accounts.GetByID(ctx, accountID)
	if err != nil {
		if errors.Is(err, account.ErrNotFound) {
			_, _ = argon2id.ComparePasswordAndHash(password, s.dummyHash)
			return account.Account{}, ErrInvalidCredentials
		}
		return account.Account{}, err
	}
	match, err := argon2id.ComparePasswordAndHash(password, a.PasswordHash)
	if err != nil || !match {
		return account.Account{}, ErrInvalidCredentials
	}
	// A banned account may not rotate its own credentials, nor perform any
	// other action that re-proves them.
	if a.Banned {
		return account.Account{}, ErrBanned(a.BanReason)
	}
	return a, nil
}

// auditPasswordChange appends the audit line, best effort: the password has
// already been changed, so a failing audit sink must not return an error that
// would tell the operator to retry with a password that no longer works. It is
// logged loudly instead.
func (s *Service) auditPasswordChange(ctx context.Context, a account.Account) {
	if s.auditor == nil {
		return
	}
	if err := s.auditor.Audit(ctx, a.ID, AuditActionPasswordChange, a.ID, map[string]any{
		"self":            true,
		"sessionsRevoked": true,
	}); err != nil {
		slog.Error("auth: password change audit failed", "accountId", a.ID, "err", err)
	}
}
