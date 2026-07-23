// Package auth implements register/login/refresh/logout with argon2id
// hashing, HS256 access JWTs and rotating opaque refresh tokens in Redis.
package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/alexedwards/argon2id"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/httpx"
)

var (
	usernameRe = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{2,23}$`)
	emailRe    = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)
)

const (
	loginRateLimit  = 10
	loginRateWindow = time.Minute
	startingMMR     = 1000
)

// Params tunes argon2id hashing (tests may use lighter params).
var DefaultParams = argon2id.DefaultParams

// Service implements the auth flows.
type Service struct {
	accounts   *account.Repo
	rdb        *redisx.Client
	jwtSecret  []byte
	accessTTL  time.Duration
	refreshTTL time.Duration
	params     *argon2id.Params
	dummyHash  string // verified against on unknown-user login (constant-shape failure)

	// auditor is the append-only audit sink used by ChangePassword. nil means
	// "no audit log wired" (a bare service in a unit test). See password.go.
	auditor Auditor

	// requireApproval turns on the private-deploy gate (#126): new registrations
	// are stamped pending and receive NO tokens, and login/refresh refuse any
	// non-approved account. When false (dev/CI default) registration approves
	// immediately, preserving the open-signup flow the rest of the suite assumes.
	requireApproval bool

	// ownerBootstrap is the first-account owner policy. The zero value disables
	// it (an established deploy, or a bare service in a unit test). See
	// bootstrap.go.
	ownerBootstrap OwnerBootstrap

	// invites is the registration invite-code gate (#174). nil means the gate
	// is OFF — the dev/CI default and what every existing test sees. When it is
	// set, a registration that is not the first-owner claim must burn a valid
	// code (see Register). Injected as an interface because internal/invite
	// imports internal/admin which imports this package: auth can never import
	// invite, so the composition root hands it in (SetInviteGate), exactly like
	// SetAuditor / SetOwnerBootstrap.
	invites InviteGate
}

// InviteGate is the invite-code half of registration, implemented by
// internal/invite. Redeem BURNS a code for accountID or returns the 403 the
// client shows; Release gives a burned code back when the account it was burned
// for never landed. See invite.Service for the ordering rationale.
type InviteGate interface {
	Redeem(ctx context.Context, code, accountID, username string) error
	Release(ctx context.Context, code, accountID string) error
}

// SetInviteGate installs the invite-code gate (composition root only). nil
// disables it.
func (s *Service) SetInviteGate(g InviteGate) { s.invites = g }

// New builds the auth service. params may be nil for defaults. requireApproval
// enables the private-deploy approval gate.
func New(accounts *account.Repo, rdb *redisx.Client, jwtSecret string, accessTTL, refreshTTL time.Duration, params *argon2id.Params, requireApproval bool) (*Service, error) {
	if params == nil {
		params = DefaultParams
	}
	dummy, err := argon2id.CreateHash("dummy-password-for-constant-time", params)
	if err != nil {
		return nil, err
	}
	return &Service{
		accounts:        accounts,
		rdb:             rdb,
		jwtSecret:       []byte(jwtSecret),
		accessTTL:       accessTTL,
		refreshTTL:      refreshTTL,
		params:          params,
		dummyHash:       dummy,
		requireApproval: requireApproval,
	}, nil
}

// TokenPair is what login/register/refresh hand back.
type TokenPair struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	ExpiresIn    int    `json:"expiresIn"` // seconds
}

func hasControl(s string) bool {
	for _, r := range s {
		if unicode.IsControl(r) {
			return true
		}
	}
	return false
}

// ValidatePassword is the platform's ONE password policy. Registration and the
// self-service change-password flow both go through this function so a password
// that would be refused at sign-up can never be installed later (and so the two
// can never drift apart into two policies).
func ValidatePassword(password string) error {
	if hasControl(password) {
		return httpx.BadRequest("control characters are not allowed")
	}
	if len(password) < 8 || len(password) > 128 {
		return httpx.BadRequest("password must be 8-128 characters")
	}
	return nil
}

// HashPassword is the platform's ONE password-hashing entry point: it applies
// ValidatePassword and then argon2id with `params`, where nil means the
// registration parameters (DefaultParams) exactly as auth.New reads it.
//
// It is exported because the hashing cost is a SECURITY PARAMETER and this repo
// now has a second writer of password hashes — cmd/ownerreset, the host-side
// recovery command, which runs in its own process and so cannot reach a
// Service's private params field. Copying `argon2id.CreateHash(pw, someParams)`
// into that command would create a second, silently divergent cost setting: the
// day DefaultParams is raised, accounts rescued by the CLI would keep being
// written at the old cost and nothing would say so. Register and ChangePassword
// both go through here, so "the parameters registration uses" is a fact about
// one function rather than a claim about three call sites.
func HashPassword(password string, params *argon2id.Params) (string, error) {
	if err := ValidatePassword(password); err != nil {
		return "", err
	}
	if params == nil {
		params = DefaultParams
	}
	return argon2id.CreateHash(password, params)
}

// ValidateRegistration checks username/email/password shape without touching
// any store. The password half is ValidatePassword — see there.
func ValidateRegistration(username, email, password string) error {
	if hasControl(username) || hasControl(email) {
		return httpx.BadRequest("control characters are not allowed")
	}
	if !usernameRe.MatchString(username) {
		return httpx.BadRequest("username must match ^[a-z0-9][a-z0-9_-]{2,23}$")
	}
	if len(email) > 254 || !emailRe.MatchString(email) {
		return httpx.BadRequest("invalid email address")
	}
	return ValidatePassword(password)
}

// RegisterOptions carries the parts of a registration that are not credentials.
type RegisterOptions struct {
	// BootstrapToken is the one-time owner token from DATA_DIR/owner-setup-token
	// (printed in the boot log). It is only consulted on a deploy that has no
	// administrator AND has GGD_OWNER_BOOTSTRAP_TOKEN turned on. Empty otherwise.
	BootstrapToken string
	// InviteCode is the registration invite code (#174), as typed. The service
	// normalises it (case, spaces, hyphens) — see invite.Normalize. Only
	// consulted when an invite gate is installed AND this registration is not
	// the first-owner claim.
	InviteCode string
}

// registerSideworkTimeout bounds the Redis work Register does on a context that
// deliberately outlives the caller's request (see the WithoutCancel note below).
const registerSideworkTimeout = 5 * time.Second

// Register creates an account, enforcing uniqueness atomically via Redis
// SETNX before the JSON write.
//
// CONTEXT NOTE. Every store/Redis step below runs on a context DETACHED from
// the caller's request. Registration is a multi-step write — reserve username,
// reserve email, hash (~100ms of argon2id), decide ownership, create, issue
// tokens — and the JSON store takes no context at all, so it cannot be
// cancelled halfway. If the Redis half honoured the request context while the
// file half did not, a client that hung up mid-hash (an aborted fetch, a
// navigation, a short client timeout) would leave the reservations un-rolled-
// back and the ownership decision unevaluated while the account still landed.
// Detaching makes the whole sequence complete or fail as one, on its own clock.
func (s *Service) Register(ctx context.Context, username, email, password string, opt RegisterOptions) (account.Account, TokenPair, error) {
	username = strings.TrimSpace(username)
	email = strings.TrimSpace(strings.ToLower(email))
	if err := ValidateRegistration(username, email, password); err != nil {
		return account.Account{}, TokenPair{}, err
	}
	id := account.NewID()

	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), registerSideworkTimeout)
	defer cancel()

	okUser, err := s.rdb.SetNX(ctx, redisx.KeyIdxUsername(username), id, 0)
	if err != nil {
		return account.Account{}, TokenPair{}, err
	}
	if !okUser {
		return account.Account{}, TokenPair{}, httpx.Conflict("username is already taken")
	}
	okMail, err := s.rdb.SetNX(ctx, redisx.KeyIdxEmail(email), id, 0)
	if err != nil {
		s.rdb.R.Del(ctx, redisx.KeyIdxUsername(username))
		return account.Account{}, TokenPair{}, err
	}
	if !okMail {
		s.rdb.R.Del(ctx, redisx.KeyIdxUsername(username))
		return account.Account{}, TokenPair{}, httpx.Conflict("email is already registered")
	}

	// First-account owner bootstrap: while a deploy has NO administrator, a
	// registration claims ownership. The grant is written into the account's
	// first persisted state (not a create-then-promote follow-up), so there is
	// no window in which it exists un-promoted and the value returned below
	// already reflects it. It also FORCES approved: under the #126 gate a
	// pending owner could never be approved — nobody exists to approve it —
	// which would brick the deploy permanently. See bootstrap.go.
	//
	// It is evaluated HERE, before the invite gate and before the ~100 ms hash,
	// because the invite exemption below keys off its answer: "is this deploy
	// still ownerless" must be ONE evaluation, not two that can drift.
	owner, releaseClaim := s.claimOwnership(ctx, id, opt.BootstrapToken)
	defer releaseClaim()

	// ---------------------------------------------------------- INVITE GATE --
	//
	// THE FIRST ACCOUNT IS EXEMPT, keyed off the SAME predicate the owner
	// bootstrap just answered. Four reasons, in order of importance:
	//
	//  1. Requiring a code for the first account is a DEADLOCK, structurally
	//     identical to the one bootstrap.go documents for the approval gate:
	//     only an admin can mint a code, and a fresh deploy has no admin. A
	//     deploy that demanded one would be bricked before the owner reached it.
	//  2. Exempting it WIDENS NOTHING. The window it opens is the *same* window
	//     that already hands out platform ownership. An attacker who wins that
	//     footrace does not need a code — they get the admin role and can mint
	//     codes for themselves. An invite gate layered on top of a window that
	//     already grants admin cannot be stronger than that window.
	//  3. It CLOSES ITSELF. The instant the owner's account file lands,
	//     Admins() is non-empty, claimOwnership returns false for everyone, and
	//     every subsequent registration needs a code — no restart, no action.
	//  4. It FAILS CLOSED. claimOwnership returns false when it cannot read the
	//     store, so an unreadable store means "assume an admin exists" ⇒ a code
	//     is REQUIRED. (Opposite direction to the ownership grant, same meaning.)
	//
	// The residual exposure — a stranger registering in the seconds before the
	// owner does, on a deploy already reachable from outside — is closed by an
	// existing switch and no new code: GGD_OWNER_BOOTSTRAP_TOKEN=1 makes even
	// the first registration present the 0600 DATA_DIR/owner-setup-token, so the
	// unauthenticated window is zero-width. That is the recommended env for the
	// family build.
	//
	// ATOMICITY (the create_integrity scar): BURN FIRST, CREATE SECOND, release
	// on every failure. Creating first and burning after would mean a crash in
	// between leaves a LIVE code that has already produced an account — the gate
	// silently leaking a registration, which is unacceptable when it is the only
	// thing keeping strangers out. Burning first fails the other way (a spent
	// code with no account), which is recoverable by minting another.
	inviteBurned := false
	created := false
	if s.invites != nil && !owner {
		if err := s.invites.Redeem(ctx, opt.InviteCode, id, username); err != nil {
			s.rdb.R.Del(ctx, redisx.KeyIdxUsername(username), redisx.KeyIdxEmail(email))
			return account.Account{}, TokenPair{}, err
		}
		inviteBurned = true
	}
	defer func() {
		if !inviteBurned || created {
			return
		}
		if err := s.invites.Release(ctx, opt.InviteCode, id); err != nil {
			slog.Error("auth: could not release the invite code after a failed registration; the operator must mint a new one",
				"err", err, "accountId", id)
		}
	}()

	hash, err := HashPassword(password, s.params)
	if err != nil {
		s.rdb.R.Del(ctx, redisx.KeyIdxUsername(username), redisx.KeyIdxEmail(email))
		return account.Account{}, TokenPair{}, err
	}
	now := time.Now()
	// Private-deploy gate: a gated deploy stamps new accounts pending (an admin
	// must approve before they can play); otherwise they are approved on sight.
	status := account.StatusApproved
	if s.requireApproval {
		status = account.StatusPending
	}
	var roles []string
	if owner {
		roles = []string{account.RoleAdmin}
		status = account.StatusApproved
	}
	a := account.Account{
		ID: id, Username: username, Email: email, PasswordHash: hash,
		MMR: startingMMR, Status: status, Roles: roles, CreatedAt: now, UpdatedAt: now,
	}
	if err := s.accounts.Create(ctx, a); err != nil {
		// Roll the reservations back so a retry can succeed. The owner claim is
		// released by the deferred call above — and because the gate is "does an
		// admin exist" rather than "was a claim ever taken", a failed create
		// costs this deploy nothing: the retry can still become the owner.
		s.rdb.R.Del(ctx, redisx.KeyIdxUsername(username), redisx.KeyIdxEmail(email))
		if errors.Is(err, account.ErrUsernameTaken) {
			return account.Account{}, TokenPair{}, httpx.Conflict("username is already taken")
		}
		if errors.Is(err, account.ErrEmailTaken) {
			return account.Account{}, TokenPair{}, httpx.Conflict("email is already registered")
		}
		return account.Account{}, TokenPair{}, err
	}
	// The account file has landed. From here the invite code stays burned: the
	// deferred release above is now a no-op.
	created = true
	if owner {
		s.consumeOwnerToken()
		logFirstOwner(a)
	}
	// A pending account gets NO session — issuing a token here would hand it the
	// very access the gate exists to withhold. The caller returns the account
	// (Status "pending") with an empty token pair, which the client reads as the
	// "awaiting approval" state.
	if !a.IsApproved() {
		return a, TokenPair{}, nil
	}
	pair, err := s.issueTokens(ctx, a)
	return a, pair, err
}

// ErrNotApproved is the 403 returned when an account with valid credentials is
// not yet playable under the private-deploy gate. The code distinguishes the
// still-pending case from a terminal denial so the client can message each.
func ErrNotApproved(status string) *httpx.E {
	if status == account.StatusDenied {
		return httpx.Err(http.StatusForbidden, "account_denied", "this account's registration was declined")
	}
	return httpx.Err(http.StatusForbidden, "account_pending", "your account is awaiting admin approval")
}

// ErrInvalidCredentials is the single failure surface of Login — identical for
// unknown user and wrong password (no user enumeration).
var ErrInvalidCredentials = httpx.Unauthorized("invalid credentials")

// ErrBanned is the 403 returned when a banned account authenticates with
// otherwise-valid credentials (or refreshes a still-live token). The reason is
// the operator-supplied ban reason, when present.
func ErrBanned(reason string) *httpx.E {
	msg := "this account has been banned"
	if reason != "" {
		msg += ": " + reason
	}
	return httpx.Err(http.StatusForbidden, "account_banned", msg)
}

// Login verifies credentials. Unknown users still pay an argon2id
// verification against a dummy hash so the response shape/latency does not
// reveal existence.
func (s *Service) Login(ctx context.Context, usernameOrEmail, password, ip string) (account.Account, TokenPair, error) {
	if ip != "" {
		ok, err := s.rdb.RateAllow(ctx, "login", ip, loginRateLimit, loginRateWindow)
		if err != nil {
			return account.Account{}, TokenPair{}, err
		}
		if !ok {
			return account.Account{}, TokenPair{}, httpx.RateLimited("too many login attempts")
		}
	}
	if hasControl(usernameOrEmail) || len(usernameOrEmail) > 254 || len(password) > 128 {
		// Same failure surface as a wrong password.
		_, _ = argon2id.ComparePasswordAndHash("x", s.dummyHash)
		return account.Account{}, TokenPair{}, ErrInvalidCredentials
	}

	var a account.Account
	var err error
	if strings.Contains(usernameOrEmail, "@") {
		a, err = s.accounts.GetByEmail(ctx, usernameOrEmail)
	} else {
		a, err = s.accounts.GetByUsername(ctx, usernameOrEmail)
	}
	if err != nil {
		if errors.Is(err, account.ErrNotFound) {
			// Constant-shape failure: burn the same argon2 work as a real
			// verification, return the same error body.
			_, _ = argon2id.ComparePasswordAndHash(password, s.dummyHash)
			return account.Account{}, TokenPair{}, ErrInvalidCredentials
		}
		return account.Account{}, TokenPair{}, err
	}
	match, err := argon2id.ComparePasswordAndHash(password, a.PasswordHash)
	if err != nil || !match {
		return account.Account{}, TokenPair{}, ErrInvalidCredentials
	}
	// Credentials are valid — a banned account still cannot obtain tokens.
	if a.Banned {
		return account.Account{}, TokenPair{}, ErrBanned(a.BanReason)
	}
	// Private-deploy gate: a pending/denied account cannot log in to play until
	// an admin approves it. Grandfathered (zero-status) accounts pass.
	if !a.IsApproved() {
		return account.Account{}, TokenPair{}, ErrNotApproved(a.Status)
	}
	pair, err := s.issueTokens(ctx, a)
	return a, pair, err
}

// Refresh rotates a refresh token: the presented token is atomically retired
// and a new pair is issued. Replaying a retired token revokes the whole
// account session family.
func (s *Service) Refresh(ctx context.Context, refreshToken string) (TokenPair, error) {
	aid, err := s.rdb.ConsumeRefresh(ctx, refreshToken, s.refreshTTL)
	if err != nil {
		if errors.Is(err, redisx.ErrRefreshReuse) {
			return TokenPair{}, httpx.Unauthorized("refresh token reuse detected; all sessions revoked")
		}
		if errors.Is(err, redisx.ErrRefreshUnknown) {
			return TokenPair{}, httpx.Unauthorized("invalid refresh token")
		}
		return TokenPair{}, err
	}
	a, err := s.accounts.GetByID(ctx, aid)
	if err != nil {
		return TokenPair{}, httpx.Unauthorized("invalid refresh token")
	}
	// A ban applied after a token was issued is enforced here too, so a
	// lingering refresh token cannot resurrect a banned session.
	if a.Banned {
		return TokenPair{}, ErrBanned(a.BanReason)
	}
	// Likewise a denial applied after login (an admin revoking an approval)
	// cannot be outlived by a still-valid refresh token.
	if !a.IsApproved() {
		return TokenPair{}, ErrNotApproved(a.Status)
	}
	return s.issueTokens(ctx, a)
}

// Logout revokes the presented refresh token.
func (s *Service) Logout(ctx context.Context, refreshToken string) error {
	return s.rdb.RevokeRefresh(ctx, refreshToken)
}

// Account exposes the account repo for handlers (GET /me).
func (s *Service) Account(ctx context.Context, id string) (account.Account, error) {
	return s.accounts.GetByID(ctx, id)
}

func (s *Service) issueTokens(ctx context.Context, a account.Account) (TokenPair, error) {
	access, err := s.MintAccess(a)
	if err != nil {
		return TokenPair{}, err
	}
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return TokenPair{}, err
	}
	refresh := hex.EncodeToString(raw)
	if err := s.rdb.StoreRefresh(ctx, refresh, a.ID, s.refreshTTL); err != nil {
		return TokenPair{}, err
	}
	return TokenPair{
		AccessToken:  access,
		RefreshToken: refresh,
		ExpiresIn:    int(s.accessTTL / time.Second),
	}, nil
}
