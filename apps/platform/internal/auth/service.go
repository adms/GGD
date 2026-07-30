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

	// burnInviteOnConflict decides what happens to an invite code that was
	// burned by a registration which then hit a username/email conflict (GH#179,
	// the residual half). false — the zero value, and every deploy's behaviour
	// before this field existed — hands the code back, so a family member who
	// picks a taken name keeps their invite. true keeps it burned.
	//
	// IT IS THE ONLY LEVER ON THE ENUMERATION ORACLE THAT IS STILL OPEN. The
	// #174 gate refuses an un-invited caller identically whatever they submitted,
	// so a stranger learns nothing (measured — see the register_enumeration
	// tests). A caller HOLDING A LIVE CODE is a different story: every
	// conflicting probe returns the code, so one code buys UNBOUNDED "is X
	// registered?" queries (measured: 6 consecutive 409s, code still 未使用).
	// Turning this on prices each probe at one code, which bounds the oracle at
	// the number of codes the operator handed out.
	//
	// It is a KNOB rather than a decision because the two sides trade against
	// each other and only the owner can weigh them: off = an honest typo never
	// costs an invite; on = an invited family member cannot silently enumerate
	// the membership list. Set at the composition root from
	// GGD_BURN_INVITE_ON_CONFLICT via SetBurnInviteOnConflict.
	burnInviteOnConflict bool

	// maxPending bounds how many accounts may sit PENDING under the #126 approval
	// gate at once (sec-154-11). 0 = no cap (the dev/CI default, and what every
	// existing test sees). Register consults it before creating a pending account
	// and refuses once the queue is full, so the approval gate cannot be turned
	// into an engine for unbounded, durable pending-account growth (a disk/Redis
	// DoS). Set at the composition root from GGD_MAX_PENDING via SetMaxPending.
	maxPending int
}

// SetMaxPending installs the #126 pending-registration cap (composition root
// only). n <= 0 disables it, restoring the uncapped behaviour.
func (s *Service) SetMaxPending(n int) { s.maxPending = n }

// SetBurnInviteOnConflict chooses whether a registration that burned an invite
// code and then hit a username/email conflict keeps the code burned (true) or
// hands it back (false, the default and the pre-existing behaviour). See the
// burnInviteOnConflict field for the trade-off it settles. Composition root only.
func (s *Service) SetBurnInviteOnConflict(v bool) { s.burnInviteOnConflict = v }

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
// inviter. StatusOf reports whether a code is still redeemable, which is what
// keeps the account's mirrored copy of its own code honest (#237). See
// invite.Service for the ordering rationale.
type InviteGate interface {
	Redeem(ctx context.Context, code, accountID, username string) error
	Release(ctx context.Context, code, accountID string) error
	MintPersonalReferral(ctx context.Context, referrerID, username string) (string, error)
	ReferrerOf(ctx context.Context, code string) (string, error)
	StatusOf(ctx context.Context, code string) (string, error)
}

// The invite lifecycle strings this package has to name. auth CANNOT import
// internal/invite (import cycle: invite → admin → auth), which is why the gate
// is an interface here at all — so the two statuses this file branches on are
// literals. They are pinned to the invite package's real constants BEHAVIOURALLY
// rather than by a string compare: referral_mirror_test.go lives in package
// auth_test (which may import both) and asserts the wire values it sees against
// invite.StatusActive / invite.StatusRedeemed through the fully-wired server, so
// a rename in either package fails there instead of silently making every code
// read as "not active".
const (
	referralStatusActive  = "active"
	referralStatusUnknown = "unknown"
)

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

// ErrRegistrationConflict is the SINGLE answer /auth/register gives when the
// username or the email address is already in use (GH#179).
//
// WHAT IT DOES CLOSE, EXACTLY. It used to be two answers — "username is already
// taken" and "email is already registered" — behind the same 409. Collapsing
// them means a conflict no longer reveals WHICH of the two values a caller
// submitted was the one already in use. That matters for the case where the
// caller submitted two values they care about at once, and for a shoulder-
// surfed or logged response body.
//
// WHAT IT DOES **NOT** CLOSE, AND THE COMMENT HERE USED TO CLAIM IT DID. This
// does NOT stop /auth/register answering "does this person have an account
// here?". A caller who wants that answer pairs the value under test with a
// counterpart they KNOW is fresh, and reads the status code:
//
//	POST {username:"victim",  email:"throwaway1@x"}  -> 409  victim IS taken
//	POST {username:"nobody",  email:"throwaway2@x"}  -> 201  nobody is free
//	POST {username:"fresh1",  email:"victim@x.com"}  -> 409  that email IS taken
//	POST {username:"fresh2",  email:"nobody@x.com"}  -> 201  that email is free
//
// Merging the two 409s removes only information the caller already had (they
// chose which field was fresh), so the information gain against this attacker
// is ~0. The same is true of the timing parity below: 201 and 409 are already
// separated by the status code, so equalising their latency does not hide the
// answer either. Both improvements are real and are kept — they just are not
// the thing the header used to claim.
//
// WHAT ACTUALLY CLOSES IT on a real deploy is the #174 invite gate, which runs
// BEFORE any of this and refuses an un-invited caller identically whatever they
// submitted. The residual channel, the one that is still open, is a caller
// holding a LIVE invite code — see registerOracleResidual in
// register_enumeration_test.go for the measured behaviour and the knob that
// bounds it (burnInviteOnConflict).
//
// The message must stay field-agnostic regardless: a friendlier "did you mean
// to log in?" that names the email would make the 409 self-describing again,
// which is strictly worse than what we have.
var ErrRegistrationConflict = httpx.Conflict("that username or email address is not available")

// reservationNoopKey names a key that NOTHING in the platform ever writes: it
// pads the rollback DELETE below so the command always names exactly two keys.
// The "idx:reservation-noop:" prefix cannot collide with a real index key —
// redisx.KeyIdxUsername / KeyIdxEmail produce "idx:username:" / "idx:email:" —
// so deleting it is guaranteed to be a no-op on real data.
func reservationNoopKey(id, slot string) string {
	return "idx:reservation-noop:" + slot + ":" + id
}

// releaseReservations hands back the uniqueness reservations THIS registration
// actually took, in a shape that does not depend on which ones it got.
//
// One DELETE, always naming two keys: the reservations we own, and for each one
// we do NOT own, a key that cannot exist. So "the username collided", "the email
// collided" and "both collided" all cost the same round trips — the point of
// GH#179's timing half, applied to the cheap half of the work as well as the
// expensive one.
//
// It must never delete a key it does not own — but NOT for the reason this
// comment used to give. It claimed that deleting a colliding account's index
// entry "would let the next registration take that account's username". THAT IS
// FALSE, and it is false because of a second layer this comment ignored:
// account.Repo.Create re-verifies uniqueness against the DURABLE store
// (refFree, account.go) before it writes anything, under a per-index-key mutex.
// MEASURED with the padding removed and both keys deleted unconditionally: the
// thief's follow-up registration comes back 409, not 201, on both the username
// and the email — see TestReleaseReservationsKeepsOtherAccountsReservations,
// which asserts the non-theft as well as the padding.
//
// What the padding actually buys, stated honestly:
//
//  1. ROUND-TRIP PARITY (above) — the reason it exists at all.
//  2. DEFENCE IN DEPTH. Deleting a live reservation does not hand the value
//     away, but it does drop uniqueness for that value from two independent
//     enforcers to one (the durable refFree) until the next boot rebuilds the
//     index (data/boot/boot.go SETNXs it back). A stranger who can post
//     colliding registrations should not be able to strip the fast layer for
//     every member of the deploy at will.
//  3. COST. Once the reservation is gone, every later attempt on that value
//     runs the full argon2 AND a durable store read before being refused,
//     instead of losing the SETNX.
//
// None of those three are visible in a response body, which is exactly why the
// guard for this function reads the Redis keyspace directly.
func (s *Service) releaseReservations(ctx context.Context, id, username, email string, ownUser, ownMail bool) {
	keys := []string{reservationNoopKey(id, "u"), reservationNoopKey(id, "e")}
	if ownUser {
		keys[0] = redisx.KeyIdxUsername(username)
	}
	if ownMail {
		keys[1] = redisx.KeyIdxEmail(email)
	}
	s.rdb.R.Del(ctx, keys...)
}

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
	// IT RUNS BEFORE THE USERNAME/EMAIL RESERVATION, AND THAT ORDERING IS THE
	// ONLY THING ON A GATED DEPLOY THAT ACTUALLY CLOSES THE #179 ENUMERATION
	// ORACLE. Merging the two 409s into one does NOT close it — an attacker pairs
	// the value under test with a counterpart they know is fresh and reads
	// 201-vs-409 (see ErrRegistrationConflict). What defeats that is refusing an
	// un-invited caller here, identically, before anything is looked up: measured,
	// all four probes come back byte-identical invite_required. Move this block
	// below the SETNX pair and the oracle is live again for any stranger.
	//
	// It also keeps the ~100 ms argon2 hash below the gate, where a caller with
	// no code can never trigger it.
	//
	// RESIDUAL, stated plainly: this protects against callers WITHOUT a code. A
	// caller holding a live code still reads 201-vs-409 freely, because the
	// deferred Release below hands the code back on every conflict. See
	// burnInviteOnConflict for the knob that prices that.
	//
	// ATOMICITY (the create_integrity scar): BURN FIRST, CREATE SECOND, release
	// on every failure. Creating first and burning after would mean a crash in
	// between leaves a LIVE code that has already produced an account — the gate
	// silently leaking a registration, which is unacceptable when it is the only
	// thing keeping strangers out. Burning first fails the other way (a spent
	// code with no account), which is recoverable by minting another. The
	// deferred Release below also gives the code back when a later step (a
	// name/email collision, a store error) stops the account from landing, so a
	// family member who picks a taken name does not lose their invite — unless
	// burnInviteOnConflict is on, which trades that courtesy for a bound on the
	// #179 residual oracle (see the field).
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
		if !inviteBurned || created || s.burnInviteOnConflict {
			return
		}
		if err := s.invites.Release(ctx, opt.InviteCode, id); err != nil {
			slog.Error("auth: could not release the invite code after a failed registration; the operator must mint a new one",
				"err", err, "accountId", id)
		}
	}()

	// ---------------------------------------------------------- PENDING CAP --
	//
	// Under the #126 approval gate a non-owner registration lands PENDING and
	// becomes a DURABLE account file plus PERMANENT (ttl 0) username/email index
	// keys, reclaimed only by the periodic TTL sweep (account.SweepExpiredPending).
	// Without a ceiling, a scripted /auth/register flood with unique usernames
	// grows those files and keys without bound — a disk/Redis DoS (sec-154-11).
	// So before reserving anything, refuse once the queue is full.
	//
	// ORDERING. This runs AFTER the invite gate — an un-invited stranger is
	// already refused above (learning nothing), and a code burned by an invited
	// caller who is now turned away is handed back by the deferred Release, since
	// created is still false — and BEFORE the username/email reservation and the
	// ~100 ms hash, so a capped caller reserves, hashes and reveals NOTHING. The
	// message is identical regardless of which names exist, so it is no oracle.
	// OWNERS ARE EXEMPT: the bootstrap owner is force-approved below, never
	// pending, so it must never be counted out by its own queue.
	if s.requireApproval && !owner && s.maxPending > 0 {
		pending, err := s.accounts.CountByStatus(ctx, account.StatusPending)
		if err != nil {
			// Fail CLOSED: an unreadable store must not wave a registration
			// through as though the queue were empty.
			return account.Account{}, TokenPair{}, err
		}
		if pending >= s.maxPending {
			return account.Account{}, TokenPair{}, httpx.RateLimited("registration temporarily closed - too many accounts awaiting approval")
		}
	}

	// ----------------------------------------------- THE HASH RUNS FIRST --
	//
	// GH#179, the TIMING half. argon2id used to run AFTER the uniqueness
	// reservation, which made the cost of a registration a function of the
	// ANSWER: a name that already existed short-circuited to a 409 in a
	// millisecond, while a free one paid ~100 ms of hashing. That is a
	// side channel that survives any amount of care about the response BODY —
	// a stopwatch reads it just as well as an error message.
	//
	// Hashing here, before anything is looked up, makes the expensive work
	// unconditional: every registration that gets this far pays exactly one
	// argon2id, whether it ends in 201 or 409. It is the REAL hash with the
	// service's real params rather than dummy work against a fixed hash, so the
	// two cannot drift apart the day DefaultParams is raised (the classic way a
	// constant-time defence rots).
	//
	// It stays BELOW the invite gate and the pending cap, so a stranger with no
	// code still cannot make this deploy burn CPU — those two refuse before any
	// hashing happens, exactly as before.
	hash, err := HashPassword(password, s.params)
	if err != nil {
		return account.Account{}, TokenPair{}, err
	}

	// ------------------------------------------------ UNIQUENESS RESERVATION --
	//
	// BOTH reservations are always attempted, even when the first one already
	// lost. Short-circuiting made "the username is taken" one Redis round trip
	// and "the email is taken" three, which reports WHICH FIELD collided in a
	// different unit — the same thing the merged 409 above refuses to say, said
	// in round trips instead of words. (It does NOT hide that a collision
	// happened at all; nothing synchronous here can — see
	// ErrRegistrationConflict.) Taking both and rolling back through releaseReservations
	// (one DELETE, always two keys) keeps the number and shape of the round
	// trips independent of WHICH value collided.
	//
	// The cost is a reservation held for microseconds on a value this
	// registration will not keep, so a concurrent registration of that exact
	// value can lose a race it would otherwise have won and be told to retry.
	// The old code had the same window on the mirror case (username reserved,
	// then released after an email collision); this makes it symmetric.
	okUser, errUser := s.rdb.SetNX(ctx, redisx.KeyIdxUsername(username), id, 0)
	okMail, errMail := s.rdb.SetNX(ctx, redisx.KeyIdxEmail(email), id, 0)
	if errUser != nil || errMail != nil {
		s.releaseReservations(ctx, id, username, email, okUser, okMail)
		if errUser != nil {
			return account.Account{}, TokenPair{}, errUser
		}
		return account.Account{}, TokenPair{}, errMail
	}
	if !okUser || !okMail {
		s.releaseReservations(ctx, id, username, email, okUser, okMail)
		return account.Account{}, TokenPair{}, ErrRegistrationConflict
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
		// The DURABLE store's own uniqueness verdict (reachable when the Redis
		// index has been wiped) collapses onto the SAME generic answer as the
		// reservation above, so which ENFORCER refused is not readable either —
		// otherwise a FLUSHALL would make the cache state itself an oracle, on
		// top of the one register already has. (It does not "close" enumeration;
		// nothing on this path does. See ErrRegistrationConflict.)
		if errors.Is(err, account.ErrUsernameTaken) || errors.Is(err, account.ErrEmailTaken) {
			return account.Account{}, TokenPair{}, ErrRegistrationConflict
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

// PublicAccount projects an account onto the wire.
//
// IT IS THE ONLY WAY AN ACCOUNT LEAVES THIS PACKAGE, and handlers_public_test.go
// scans handlers.go to keep it that way. account.Account.Public() is a pure
// struct projection and cannot reach the invite store, so anything DERIVED has
// to be filled in here — today that is exactly one thing, and it is the whole of
// task #237.
//
// THE BUG IT CLOSES. #203 mints every new account its own single-use personal
// referral code and pins the display form onto the account so the lobby can show
// it. That stored field is a MIRROR of the invite document, written once at
// registration and never touched again — while the document itself is correctly
// burned the instant a friend registers with it (invite.Service.Redeem, under
// the code's keyed mutex, verified durable). Nothing reconciled the two, so
// /me, /login and /register kept handing back a code the gate would refuse, and
// the lobby kept printing it in a copy box under「分享給一位朋友，他就能註冊」.
// The redemption was written; it was never SURFACED.
//
// Deriving here rather than clearing the mirror on the burn path is deliberate:
// a second write is a second thing that can fail halfway (the burn happens
// inside somebody else's registration, whose post-create steps are all
// best-effort by design), whereas a read that consults the document cannot be
// stale and heals the accounts that are ALREADY wrong on the live deploy without
// a migration. Same reasoning as invite.Doc.EffectiveStatus deriving expiry.
func (s *Service) PublicAccount(ctx context.Context, a account.Account) account.Public {
	pub := a.Public()
	if pub.ReferralCode == "" || s.invites == nil {
		// No code to mirror, or no gate to ask: leave the projection alone. A
		// deploy with no invite gate mints no referral codes in the first place.
		return pub
	}
	status, err := s.invites.StatusOf(ctx, pub.ReferralCode)
	if err != nil {
		// Fail CLOSED, like every other read on this gate: an unreadable store
		// may hide a live code for one response, but must never advertise a dead
		// one. StatusOf already returns "unknown" alongside the error; this
		// re-states it so the branch below cannot depend on that.
		slog.Error("auth: could not read the state of an account's own referral code; withholding it for this response",
			"err", err, "accountId", a.ID)
		status = referralStatusUnknown
	}
	pub.ReferralCodeStatus = status
	if status != referralStatusActive {
		// Spent, expired, revoked or unreadable — all of them mean "offering
		// this to a friend produces a 403". The status stays so the UI can say
		// WHY the code is gone instead of silently dropping the panel.
		pub.ReferralCode = ""
	}
	return pub
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

// ErrInvalidCredentials is the single failure surface of Login for anyone who
// has not proved the password — identical for an unknown user, a wrong password
// against a real account, and a wrong password against a pending, denied or
// banned one. The last three are the ones that are easy to lose: they hold only
// because Login compares the hash BEFORE it looks at status (see there).
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
	// THE PASSWORD IS CHECKED FIRST, AND THAT ORDER IS A SECURITY PROPERTY, not
	// a stylistic accident. Everything below this line answers with a status that
	// NAMES the account (account_pending / account_denied / account_banned), so
	// reaching any of it without proving the password would turn /auth/login into
	// exactly the enumeration oracle GH#179 is about — and a worse one than
	// register's, because the #174 invite gate does not cover login. It matters
	// most on the shipped posture: docker/compose.family.yaml sets
	// GGD_REQUIRE_APPROVAL=1, so every account is `pending` from registration
	// until the owner taps approve.
	//
	// Do NOT "fail fast" by hoisting these two blocks above the hash to skip
	// ~100 ms of argon2 on an account that cannot log in anyway. Measured
	// 2026-07-30: that refactor leaks 403 account_pending for a registered name
	// against 401 invalid credentials for a free one, to any anonymous caller.
	// Guarded by TestLoginRefusesTheSameWayWhateverTheAccountStatusIs
	// (login_enumeration_test.go), which is red under exactly that move.
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
