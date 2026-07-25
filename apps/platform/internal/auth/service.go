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

	// wallet is the wallet-seed hook (task #204): after a new account lands,
	// Register asks it to grant the one-time 藍水晶 welcome balance. nil means
	// no seed (a bare unit-test service, or a deploy that configured 0).
	// Injected as an interface for the same reason — auth must not import
	// internal/wallet — via SetWalletSeeder.
	wallet WalletSeeder
	// notifier is the #209 pending-registration notifier (Slack). nil means OFF
	// — the dev/CI default and what every existing test sees. When set, Register
	// tells it each time an account lands PENDING so an out-of-band channel can
	// alert the owner with a one-tap approve link. Injected as an interface for
	// the same reason as invites: the implementation (internal/approvelink)
	// imports internal/admin, which imports this package, so auth can never
	// import it — the composition root hands it in (SetPendingNotifier).
	notifier PendingNotifier
	// deviceVerificationURI is where the phone approves a QR device-login
	// (#197/#199). Empty falls back to defaultVerificationURI. Set at the
	// composition root via SetDeviceVerificationURI. See device.go.
	deviceVerificationURI string
}

// PendingNotifier is told when a registration lands PENDING under the #126
// approval gate, so an out-of-band channel (Slack, #209) can alert the owner and
// hand them a one-tap approve link.
//
// CONTRACT: NotifyPending is called for its SIDE EFFECT only and MUST NOT be
// able to break registration. Register invokes it fire-and-forget (its own
// goroutine, off a detached context, with a panic recover), so a notifier that
// blocks, errors or panics never delays or fails the account creation that
// already succeeded. Implementations own their own timeout and logging.
type PendingNotifier interface {
	NotifyPending(a account.Account)
}

// SetPendingNotifier installs the pending-registration notifier (composition
// root only). nil disables it.
func (s *Service) SetPendingNotifier(n PendingNotifier) { s.notifier = n }

// InviteGate is the invite-code half of registration, implemented by
// internal/invite. Redeem BURNS a code for accountID or returns the 403 the
// client shows; Release gives a burned code back when the account it was burned
// for never landed. MintPersonalReferral mints the new account's own single-use
// referral code (task #203) and ReferrerOf reports which account a code was
// minted for (empty for an admin code) so a referral can fast-track its
// inviter. See invite.Service for the ordering rationale.
type InviteGate interface {
	Redeem(ctx context.Context, code, accountID, username string) error
	Release(ctx context.Context, code, accountID string) error
	MintPersonalReferral(ctx context.Context, referrerID, username string) (string, error)
	ReferrerOf(ctx context.Context, code string) (string, error)
}

// WalletSeeder grants a brand-new account its one-time welcome balance (task
// #204). Implemented by internal/wallet; returns the amount actually granted (0
// when nothing was seeded — an existing record, or a 0-configured amount).
type WalletSeeder interface {
	SeedNewAccountCrystals(ctx context.Context, accountID string) (int, error)
}

// SetInviteGate installs the invite-code gate (composition root only). nil
// disables it.
func (s *Service) SetInviteGate(g InviteGate) { s.invites = g }

// SetWalletSeeder installs the new-account wallet seed hook (composition root
// only). nil disables the welcome grant.
func (s *Service) SetWalletSeeder(w WalletSeeder) { s.wallet = w }

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

	// First-account owner bootstrap: while a deploy has NO administrator, a
	// registration claims ownership. The grant is written into the account's
	// first persisted state (not a create-then-promote follow-up), so there is
	// no window in which it exists un-promoted and the value returned below
	// already reflects it. It also FORCES approved: under the #126 gate a
	// pending owner could never be approved — nobody exists to approve it —
	// which would brick the deploy permanently. See bootstrap.go.
	//
	// It is evaluated HERE, before the invite gate, the uniqueness reservation
	// and the ~100 ms hash, because the invite exemption below keys off its
	// answer: "is this deploy still ownerless" must be ONE evaluation, not two
	// that can drift.
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
	//     already grants admin cannot be stronger than that window. (A networked
	//     gated deploy refuses to boot without GGD_OWNER_BOOTSTRAP_TOKEN=1, which
	//     makes even this first registration present the 0600 owner token — see
	//     config.FirstOwnerExposureError — so the window is not a footrace there.)
	//  3. It CLOSES ITSELF. The instant the owner's account file lands,
	//     Admins() is non-empty, claimOwnership returns false for everyone, and
	//     every subsequent registration needs a code — no restart, no action.
	//  4. It FAILS CLOSED. claimOwnership returns false when it cannot read the
	//     store, so an unreadable store means "assume an admin exists" ⇒ a code
	//     is REQUIRED. (Opposite direction to the ownership grant, same meaning.)
	//
	// IT RUNS BEFORE THE USERNAME/EMAIL RESERVATION, deliberately. If the
	// uniqueness reservation ran first, an un-invited stranger could read the
	// 409-"already taken" vs 403-"invite required" split as an ORACLE telling
	// them which family usernames and emails exist. Gating first means a caller
	// without a valid code is refused having reserved — and revealed — nothing,
	// and it also keeps the ~100 ms argon2 hash below the gate.
	//
	// ATOMICITY (the create_integrity scar): BURN FIRST, CREATE SECOND, release
	// on every failure. Creating first and burning after would mean a crash in
	// between leaves a LIVE code that has already produced an account — the gate
	// silently leaking a registration, which is unacceptable when it is the only
	// thing keeping strangers out. Burning first fails the other way (a spent
	// code with no account), which is recoverable by minting another. The
	// deferred Release below also gives the code back when a later step (a
	// name/email collision, a store error) stops the account from landing, so a
	// family member who picks a taken name does not lose their invite.
	inviteBurned := false
	created := false
	if s.invites != nil && !owner {
		if err := s.invites.Redeem(ctx, opt.InviteCode, id, username); err != nil {
			// Nothing reserved yet — refuse without touching the index.
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

	// ---- POST-CREATE, ALL BEST-EFFORT ---------------------------------------
	//
	// Everything below runs AFTER the account durably exists and MUST NOT fail
	// the registration: the account is already the valuable thing, and the
	// invite code is already (correctly) burned. A hiccup here degrades a
	// feature — no welcome crystals, no personal code, a still-pending inviter —
	// each of which an admin can resolve by hand, whereas failing the whole
	// request would strand a created account behind a spent code. So each step
	// logs loudly and carries on.
	s.seedWelcomeCrystals(ctx, a.ID)
	s.approveReferrerOf(ctx, owner, opt.InviteCode, a.ID)
	if code := s.mintReferralCode(ctx, a.ID, a.Username); code != "" {
		a.ReferralCode = code
	}

	// A pending account gets NO session — issuing a token here would hand it the
	// very access the gate exists to withhold. The caller returns the account
	// (Status "pending") with an empty token pair, which the client reads as the
	// "awaiting approval" state.
	if !a.IsApproved() {
		// #209: alert the owner out of band with a one-tap approve link. Fire-
		// and-forget — a Slack failure must never turn a successful registration
		// into a failed one (see notifyPending / PendingNotifier).
		s.notifyPending(a)
		return a, TokenPair{}, nil
	}
	pair, err := s.issueTokens(ctx, a)
	return a, pair, err
}

// seedWelcomeCrystals grants the one-time 藍水晶 welcome balance (task #204).
// Idempotent and never re-granting inside the wallet service; here it is purely
// best-effort with a loud log on failure.
func (s *Service) seedWelcomeCrystals(ctx context.Context, accountID string) {
	if s.wallet == nil {
		return
	}
	granted, err := s.wallet.SeedNewAccountCrystals(ctx, accountID)
	if err != nil {
		slog.Error("auth: could not seed a new account's welcome crystals; it was created without them",
			"err", err, "accountId", accountID)
		return
	}
	if granted > 0 {
		slog.Info("auth: seeded welcome 藍水晶 for a new account", "accountId", accountID, "crystals", granted)
	}
}

// approveReferrerOf fast-tracks the INVITER of a referral registration from
// pending → approved (task #203). It runs only for a non-owner registration on
// a gated deploy, reads the referrer off the code that was just burned, and
// approves it only if it is still pending (account.ApproveIfPending enforces
// that — a denied or already-approved inviter is untouched, so admin's veto
// stands). SELF-REFERRAL GUARD: a code minted for account X can only be
// redeemed by a LATER, different registration (X already exists), but the
// explicit referrer != new-account check makes that impossible-by-construction
// fact also impossible-by-code.
func (s *Service) approveReferrerOf(ctx context.Context, owner bool, code, newAccountID string) {
	if s.invites == nil || owner || strings.TrimSpace(code) == "" {
		return
	}
	referrerID, err := s.invites.ReferrerOf(ctx, code)
	if err != nil {
		slog.Error("auth: could not read the referrer of a redeemed code; the inviter stays pending",
			"err", err, "accountId", newAccountID)
		return
	}
	if referrerID == "" || referrerID == newAccountID {
		return // an admin-minted code, or (defensively) a self-referral
	}
	approved, err := s.accounts.ApproveIfPending(ctx, referrerID)
	if err != nil {
		slog.Error("auth: referral could not approve the inviter; they stay pending for admin review",
			"err", err, "inviter", referrerID, "via", newAccountID)
		return
	}
	if approved {
		slog.Info("auth: referral chain auto-approved a pending inviter",
			"inviter", referrerID, "via", newAccountID)
	}
}

// mintReferralCode mints the new account's own single-use personal referral
// code (task #203) and persists its display form onto the account so /me and
// the register response can show it. Best-effort: a failure just means this
// account has no code to share yet (an admin can still approve it), so it is
// logged and skipped rather than failing the registration. Returns the display
// code (empty on any failure or when the gate is off).
func (s *Service) mintReferralCode(ctx context.Context, accountID, username string) string {
	if s.invites == nil {
		return ""
	}
	code, err := s.invites.MintPersonalReferral(ctx, accountID, username)
	if err != nil {
		slog.Error("auth: could not mint a new account's personal referral code",
			"err", err, "accountId", accountID)
		return ""
	}
	if _, err := s.accounts.Update(ctx, accountID, func(ac *account.Account) error {
		ac.ReferralCode = code
		return nil
	}); err != nil {
		slog.Error("auth: minted a referral code but could not store it on the account",
			"err", err, "accountId", accountID, "code", code)
		// The code exists and is usable; it just is not pinned to the account
		// for display. Still return it so THIS response can show it.
	}
	return code
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

// AuthorizePlay re-checks the DURABLE account state behind an access token
// that has already been verified, and returns the same 403 a login would have.
// A missing/unreadable account is refused too (fail closed).
//
// WHY THIS EXISTS. An access token is a SIGNED BEARER TOKEN, not a session
// lookup: once minted it is valid for its whole TTL no matter what happens to
// the account. Login and Refresh both refuse a banned or non-approved account,
// so the ONLY hole is the window between an operator's decision and the natural
// expiry of a token that was already in the player's hands — up to 15 minutes
// in which a just-denied or just-banned account can still enter the lobby, join
// a room and start a match. On a family deploy that window is the difference
// between "declining someone" and "declining someone, who then plays a game
// anyway", which is not what the owner asked for when he tapped 拒絕.
//
// It is called at the LOBBY WEBSOCKET HANDSHAKE rather than in auth.Middleware.
// The handshake is the door to actually playing, and it is crossed once per
// connection, so the durable read costs one account load per connect instead of
// one per REST call. Cheap where it matters, absent where it would be a tax.
func (s *Service) AuthorizePlay(ctx context.Context, accountID string) error {
	a, err := s.accounts.GetByID(ctx, accountID)
	if err != nil {
		if errors.Is(err, account.ErrNotFound) {
			return httpx.Unauthorized("account no longer exists")
		}
		return err
	}
	if a.Banned {
		return ErrBanned(a.BanReason)
	}
	if !a.IsApproved() {
		return ErrNotApproved(a.Status)
	}
	return nil
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
