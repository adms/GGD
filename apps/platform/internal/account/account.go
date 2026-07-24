// Package account holds the durable account model and its repository
// (JSON truth + Redis uniqueness indexes).
package account

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"

	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/keyedmutex"
	"github.com/ggd/platform/internal/data/redisx"
)

// Collection names under DATA_DIR.
const (
	ColAccounts   = "accounts"
	ColByUsername = "accounts/by-username"
	ColByEmail    = "accounts/by-email"
)

// Approval statuses for the private-deploy gate (#126). A friends-only deploy
// registers new accounts as StatusPending; an admin must approve them before
// they may log in to play. StatusDenied is a terminal rejection.
//
// The zero value ("") is intentional: accounts written before the gate existed
// — and every account created while the gate is DISABLED — lack the field and
// are grandfathered as playable (see IsApproved). The gate therefore only ever
// blocks accounts that were explicitly stamped pending/denied, so turning it on
// never strands the bootstrap admin or existing players.
const (
	StatusPending  = "pending"
	StatusApproved = "approved"
	StatusDenied   = "denied"
)

// RoleAdmin is the authorization role every admin route requires.
//
// It lives in this package — the one both internal/auth and internal/admin
// already import — rather than in internal/admin, because auth must be able to
// GRANT it at registration time (the first-account owner bootstrap) and auth
// cannot import admin: admin imports auth for its AdminOnly middleware, so the
// reverse edge would be an import cycle. admin.RoleAdmin remains as an alias,
// so every existing reference keeps compiling and reading naturally.
const RoleAdmin = "admin"

// Account is the durable truth for one player. PasswordHash is an encoded
// argon2id string and is never serialized to API responses (see Public).
//
// Wallet fields (M COIN store): a nil OwnedChampions means the wallet was
// never seeded — internal/wallet seeds free champions on first read. Files
// written before the wallet existed simply lack the fields (zero values).
type Account struct {
	ID           string    `json:"id"`
	Username     string    `json:"username"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"passwordHash"`
	MMR          int       `json:"mmr"`
	Games        int       `json:"games"`
	Wins         int       `json:"wins"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`

	// MCoin is the absolute M COIN balance (settlements store absolute
	// post-match balances, mirroring the MMR idempotency pattern).
	MCoin int `json:"mcoin"`

	// SeasonPoints is the absolute cumulative ranked-ladder points for the
	// active season (the visible PLAYER board). Floors at 0. Settlements store
	// the absolute post-match value so WAL replay / duplicate callbacks
	// converge, exactly like MMR — and a Redis wipe rebuilds the board from
	// this field. Files written before the ladder existed lack it (zero value).
	SeasonPoints int `json:"seasonPoints,omitempty"`
	// ChampionPoints maps championId -> absolute cumulative points that account
	// has earned ON that champion this season (the visible CHAMPION boards).
	// nil = never played ranked. An entry's presence means the champion was
	// played at least once (even at 0 points after the floor).
	ChampionPoints map[string]int `json:"championPoints,omitempty"`
	// OwnedChampions holds unlocked champion ids (sorted). nil = unseeded.
	OwnedChampions []string `json:"ownedChampions"`
	// OwnedSkins holds purchased skin ids (sorted).
	OwnedSkins []string `json:"ownedSkins"`
	// EquippedSkins maps championId -> equipped skinId.
	EquippedSkins map[string]string `json:"equippedSkins"`

	// Roles holds authorization roles (e.g. "admin"). nil/empty means a
	// normal player. Additive: files written before roles existed simply lack
	// the field and migrate to the empty set on read (zero value).
	Roles []string `json:"roles,omitempty"`
	// Banned bars the account from login/refresh (an operator action). The
	// zero value (false) means a normal, active account.
	Banned bool `json:"banned,omitempty"`
	// BanReason is the operator-supplied reason surfaced on the 403.
	BanReason string `json:"banReason,omitempty"`

	// Status is the private-deploy approval state (#126): "" (grandfathered),
	// "pending", "approved" or "denied". See the Status* constants and
	// IsApproved. Additive: files written before the gate lack it (zero value).
	Status string `json:"status,omitempty"`

	// ReferralCode is the DISPLAY form (GGD-XXXX-XXXX) of this account's own
	// single-use personal referral code (task #203). It is minted once at
	// registration and stored here purely so the lobby/registration UI can show
	// the owner their code without a store scan — the burnable truth lives in
	// the invite collection (internal/invite), keyed by the normalised code and
	// carrying this account's id as referrerId. Empty on accounts created before
	// the feature, or on a deploy with no invite gate (referrals require it).
	ReferralCode string `json:"referralCode,omitempty"`
}

// IsApproved reports whether the account may log in to play. The zero-value
// status ("") is grandfathered as approved so the private-deploy gate only
// blocks accounts that were explicitly stamped pending or denied — a legacy
// account, or one created while the gate was disabled, is always playable.
func (a Account) IsApproved() bool {
	return a.Status == "" || a.Status == StatusApproved
}

// HasRole reports whether the account carries the given authorization role.
func (a Account) HasRole(role string) bool {
	for _, r := range a.Roles {
		if r == role {
			return true
		}
	}
	return false
}

// Public is the API-safe projection of an Account.
type Public struct {
	ID        string    `json:"id"`
	Username  string    `json:"username"`
	MMR       int       `json:"mmr"`
	Games     int       `json:"games"`
	Wins      int       `json:"wins"`
	CreatedAt time.Time `json:"createdAt"`
	// Status surfaces the private-deploy approval state on the register/login/me
	// responses so the client can show a "pending review" screen. Omitted (zero
	// value) when the gate is disabled or the account predates it.
	Status string `json:"status,omitempty"`
	// Roles surfaces the caller's OWN authorization roles on register/login/me,
	// so a client can tell the moment it becomes the administrator — notably the
	// first-account owner bootstrap, whose grant would otherwise be invisible
	// until the console 403'd or didn't. Omitted for an ordinary player. Not a
	// disclosure: every Public response is either the caller's OWN account
	// (register/login/me) or an admin-gated one (the approve/deny handler), and
	// an admin already reads roles through AccountRow.
	Roles []string `json:"roles,omitempty"`
	// ReferralCode surfaces the caller's OWN personal referral code (task #203)
	// on register/login/me so the lobby (and the pending-review screen) can show
	// it. It is the caller's own code to share, never anyone else's — every
	// Public response is either the caller's own account or an admin-gated one —
	// so it is not a disclosure. Omitted when the account has none.
	ReferralCode string `json:"referralCode,omitempty"`
}

// Public returns the API-safe projection.
func (a Account) Public() Public {
	return Public{ID: a.ID, Username: a.Username, MMR: a.MMR, Games: a.Games, Wins: a.Wins, CreatedAt: a.CreatedAt, Status: a.Status, Roles: a.Roles, ReferralCode: a.ReferralCode}
}

// ErrNotFound is returned when an account does not exist.
var ErrNotFound = errors.New("account: not found")

type ref struct {
	ID string `json:"id"`
}

// NewID mints a ULID account id.
func NewID() string { return ulid.MustNew(ulid.Timestamp(time.Now()), rand.Reader).String() }

// Repo persists accounts to the JSON store with by-username/by-email index
// files, mirroring uniqueness into Redis SETNX indexes.
type Repo struct {
	store *jsonstore.Store
	rdb   *redisx.Client
	locks *keyedmutex.M
}

// NewRepo builds the repository.
func NewRepo(store *jsonstore.Store, rdb *redisx.Client) *Repo {
	return &Repo{store: store, rdb: rdb, locks: keyedmutex.New()}
}

// storeKeyRe mirrors jsonstore's own id rule. An index key that fails it cannot
// be written as a file name, so it must be detected BEFORE any part of an
// account is persisted (see indexKey).
var storeKeyRe = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9@._-]{0,127}$`)

// indexKey maps an index value (a username or an email address) to a key the
// jsonstore can actually name a file after.
//
// Usernames always pass through unchanged — auth's username rule is a strict
// subset of the store's. Emails are the problem: a perfectly ordinary
// RFC-valid address ("me+tag@example.com") contains characters the store
// refuses, and before this function existed such an address failed the LAST of
// Create's three writes, leaving a half-written account behind. Rather than
// narrowing what an address may look like, an unrepresentable value is hashed
// to an opaque, stable, always-valid key. Representable values keep mapping to
// themselves, so every index file written before this existed still resolves.
func indexKey(v string) string {
	v = strings.ToLower(strings.TrimSpace(v))
	if storeKeyRe.MatchString(v) && !strings.Contains(v, "..") {
		return v
	}
	sum := sha256.Sum256([]byte(v))
	return "h" + hex.EncodeToString(sum[:16])
}

// ErrUsernameTaken / ErrEmailTaken are returned by Create when the DURABLE
// store already holds an index entry for the value pointing at a different
// account. Uniqueness used to live only in the Redis SETNX indexes, which made
// it a property of a rebuildable cache: flush Redis and Create would happily
// overwrite accounts/by-username/<name>.json, silently repointing an existing
// username at a brand-new account and locking its owner out. The store now
// enforces it too, so a wiped cache degrades to "registration refused", never
// to "account stolen".
var (
	ErrUsernameTaken = errors.New("account: username already taken")
	ErrEmailTaken    = errors.New("account: email already registered")
)

// Create writes the account JSON plus both index files, atomically from the
// caller's point of view.
//
// Three properties, in order of how badly their absence hurt:
//
//  1. EVERY key is resolved and checked before ANYTHING is written, so an
//     unwritable key can no longer fail the third write after the first two
//     landed.
//  2. Uniqueness is verified against the durable store, not only the Redis
//     reservation the caller made (see ErrUsernameTaken).
//  3. On any failure the writes already made are rolled back, so a failed
//     Create leaves the store exactly as it found it. A half-created account
//     used to remain loginable while being invisible to by-username lookups —
//     and, once the owner bootstrap existed, could carry the admin role.
func (r *Repo) Create(ctx context.Context, a Account) error {
	uKey, eKey := indexKey(a.Username), indexKey(a.Email)

	// (1) Resolve every path first: an invalid key is an error before any write.
	for _, k := range []struct{ col, id string }{
		{ColAccounts, a.ID}, {ColByUsername, uKey}, {ColByEmail, eKey},
	} {
		if _, err := r.store.Path(k.col, k.id); err != nil {
			return err
		}
	}

	// Serialize creations that touch the same index entries (always username
	// before email, so two creations can never deadlock against each other).
	unlockUser := r.locks.Lock("create:" + ColByUsername + "/" + uKey)
	defer unlockUser()
	unlockMail := r.locks.Lock("create:" + ColByEmail + "/" + eKey)
	defer unlockMail()

	// (2) Durable uniqueness.
	if err := r.refFree(ColByUsername, uKey, a.ID, ErrUsernameTaken); err != nil {
		return err
	}
	if err := r.refFree(ColByEmail, eKey, a.ID, ErrEmailTaken); err != nil {
		return err
	}

	// (3) Write, unwinding everything on the first failure. The account object
	// is written LAST so a partial failure can never leave a visible account —
	// which is what the owner bootstrap's "does this deploy have an admin?"
	// question reads.
	written := make([]struct{ col, id string }, 0, 3)
	rollback := func() {
		for _, w := range written {
			if err := r.store.Delete(w.col, w.id); err != nil {
				slog.Error("account: could not roll back a failed create", "collection", w.col, "id", w.id, "err", err)
			}
		}
	}
	if err := r.store.Put(ColByUsername, uKey, ref{ID: a.ID}); err != nil {
		rollback()
		return err
	}
	written = append(written, struct{ col, id string }{ColByUsername, uKey})
	if err := r.store.Put(ColByEmail, eKey, ref{ID: a.ID}); err != nil {
		rollback()
		return err
	}
	written = append(written, struct{ col, id string }{ColByEmail, eKey})
	if err := r.store.Put(ColAccounts, a.ID, a); err != nil {
		rollback()
		return err
	}
	return nil
}

// refFree reports an error when an index entry already exists and names a
// DIFFERENT account. A dangling ref (one whose account is gone) is treated as
// free so a rolled-back or hand-deleted account cannot squat a name forever.
func (r *Repo) refFree(collection, key, id string, taken error) error {
	var rf ref
	err := r.store.Get(collection, key, &rf)
	if errors.Is(err, jsonstore.ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	if rf.ID == "" || rf.ID == id {
		return nil
	}
	if ok, err := r.store.Exists(ColAccounts, rf.ID); err != nil {
		return err
	} else if !ok {
		return nil // dangling ref from a rolled-back create
	}
	return taken
}

// GetByID loads one account.
func (r *Repo) GetByID(ctx context.Context, id string) (Account, error) {
	var a Account
	err := r.store.Get(ColAccounts, id, &a)
	if errors.Is(err, jsonstore.ErrNotFound) {
		return a, ErrNotFound
	}
	return a, err
}

// GetByUsername resolves via the by-username index file.
func (r *Repo) GetByUsername(ctx context.Context, username string) (Account, error) {
	var rf ref
	err := r.store.Get(ColByUsername, indexKey(username), &rf)
	if errors.Is(err, jsonstore.ErrNotFound) {
		return Account{}, ErrNotFound
	}
	if err != nil {
		return Account{}, err
	}
	return r.GetByID(ctx, rf.ID)
}

// GetByEmail resolves via the by-email index file.
func (r *Repo) GetByEmail(ctx context.Context, email string) (Account, error) {
	var rf ref
	err := r.store.Get(ColByEmail, indexKey(email), &rf)
	if errors.Is(err, jsonstore.ErrNotFound) {
		return Account{}, ErrNotFound
	}
	if err != nil {
		return Account{}, err
	}
	return r.GetByID(ctx, rf.ID)
}

// SetRating sets the ABSOLUTE post-match rating and counters (idempotent by
// design: settlement records carry absolute values, so replay converges).
func (r *Repo) SetRating(ctx context.Context, id string, mmr, games, wins int) error {
	unlock := r.locks.Lock(id)
	defer unlock()
	a, err := r.GetByID(ctx, id)
	if err != nil {
		return err
	}
	a.MMR, a.Games, a.Wins = mmr, games, wins
	a.UpdatedAt = time.Now()
	return r.store.Put(ColAccounts, a.ID, a)
}

// SetSeasonPoints sets the ABSOLUTE cumulative player-board points and, when
// championID is non-empty, the ABSOLUTE points on that champion. Idempotent by
// design (settlement records carry absolute values, so replay/duplicates
// converge). The champion map is merged, never replaced, so other champions'
// tracks are preserved.
func (r *Repo) SetSeasonPoints(ctx context.Context, id string, seasonPoints int, championID string, championPoints int) error {
	unlock := r.locks.Lock(id)
	defer unlock()
	a, err := r.GetByID(ctx, id)
	if err != nil {
		return err
	}
	a.SeasonPoints = seasonPoints
	if championID != "" {
		if a.ChampionPoints == nil {
			a.ChampionPoints = map[string]int{}
		}
		a.ChampionPoints[championID] = championPoints
	}
	a.UpdatedAt = time.Now()
	return r.store.Put(ColAccounts, a.ID, a)
}

// ErrInvalidStatus is returned by SetStatus for an unknown status value.
var ErrInvalidStatus = errors.New("account: invalid status")

// ErrInvalidPasswordHash is returned by SetPasswordHash when handed anything
// that is not an encoded argon2id string. It is a backstop, not a policy: the
// only thing that could plausibly be passed here by mistake is a plaintext
// password, and this store must never write one.
var ErrInvalidPasswordHash = errors.New("account: password hash must be an encoded argon2id string")

// SetPasswordHash replaces the stored credential of one account through the
// same locked read-modify-write path every other account mutation uses (so it
// stays single-writer safe against a concurrent MMR/wallet write) and returns
// the updated account.
//
// Verifying the CURRENT password is the caller's job — see
// auth.Service.ChangePassword, which is the only writer.
func (r *Repo) SetPasswordHash(ctx context.Context, id, hash string) (Account, error) {
	if !strings.HasPrefix(hash, "$argon2id$") {
		return Account{}, ErrInvalidPasswordHash
	}
	return r.Update(ctx, id, func(a *Account) error {
		a.PasswordHash = hash
		return nil
	})
}

// SetStatus flips the private-deploy approval status (#126) on one account via
// the locked read-modify-write path and returns the updated account. Only the
// three Status* constants are accepted. Idempotent: re-approving an approved
// account is a no-op write.
func (r *Repo) SetStatus(ctx context.Context, id, status string) (Account, error) {
	switch status {
	case StatusPending, StatusApproved, StatusDenied:
	default:
		return Account{}, ErrInvalidStatus
	}
	return r.Update(ctx, id, func(a *Account) error {
		a.Status = status
		return nil
	})
}

// ApproveIfPending flips a PENDING account to approved and reports whether it
// did (task #203, referral-chain auto-approval). It is the ONLY conditional
// status transition, and the condition is load-bearing security: a referral may
// only ever fast-track a still-pending inviter, so an account an admin has
// already DENIED (or one already approved) is left exactly as it was. A missing
// account is a clean no-op (false, nil) — the referrer of a code may have been
// deleted — so a referral can never resurrect or error on a gone account.
//
// Locked read-modify-write like every other mutation, and it only WRITES in the
// pending case, so re-running it against an approved/denied account touches
// nothing (no UpdatedAt churn, no race with an admin's own decision).
func (r *Repo) ApproveIfPending(ctx context.Context, id string) (bool, error) {
	unlock := r.locks.Lock(id)
	defer unlock()
	a, err := r.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return false, nil
		}
		return false, err
	}
	if a.Status != StatusPending {
		return false, nil
	}
	a.Status = StatusApproved
	a.UpdatedAt = time.Now()
	if err := r.store.Put(ColAccounts, a.ID, a); err != nil {
		return false, err
	}
	return true, nil
}

// Update runs a locked read-modify-write on one account: fn mutates the
// loaded account in place; returning an error aborts without writing. The
// updated account is persisted atomically and returned.
func (r *Repo) Update(ctx context.Context, id string, fn func(*Account) error) (Account, error) {
	unlock := r.locks.Lock(id)
	defer unlock()
	a, err := r.GetByID(ctx, id)
	if err != nil {
		return a, err
	}
	if err := fn(&a); err != nil {
		return a, err
	}
	a.UpdatedAt = time.Now()
	if err := r.store.Put(ColAccounts, a.ID, a); err != nil {
		return a, err
	}
	return a, nil
}

// List returns every account id in the store (boot rebuild).
func (r *Repo) List(ctx context.Context) ([]string, error) {
	return r.store.List(ColAccounts)
}

// Admins returns the ids of every account that carries RoleAdmin, read from the
// account FILES rather than the derived _index.json.
//
// This is the platform's answer to "does this deploy have an administrator?",
// and it is deliberately the expensive one. The cheap alternatives are both
// wrong for a privilege decision: List reads a derived index that reads as
// empty when its file is missing, and Redis is by design wipeable. Reading the
// directory means the only way to see "no admin" is for the account files
// themselves to be absent — at which point there really is no admin.
//
// An unreadable individual account is NOT skipped: it is returned as an error,
// so a caller deciding whether to grant ownership fails closed instead of
// concluding "no admins here" from a permissions problem.
func (r *Repo) Admins(ctx context.Context) ([]string, error) {
	ids, err := r.store.Scan(ColAccounts)
	if err != nil {
		return nil, err
	}
	admins := []string{}
	for _, id := range ids {
		a, err := r.GetByID(ctx, id)
		if err != nil {
			if errors.Is(err, ErrNotFound) {
				continue // raced with a delete
			}
			return nil, err
		}
		if a.HasRole(RoleAdmin) {
			admins = append(admins, a.ID)
		}
	}
	return admins, nil
}

// UsableAdmins returns the admins that could actually sign in right now: not
// banned, and approved under the private-deploy gate. Revoking a role consults
// this so the platform can never be left with admins that all happen to be
// locked out.
func (r *Repo) UsableAdmins(ctx context.Context) ([]string, error) {
	ids, err := r.Admins(ctx)
	if err != nil {
		return nil, err
	}
	usable := []string{}
	for _, id := range ids {
		a, err := r.GetByID(ctx, id)
		if err != nil {
			return nil, err
		}
		if !a.Banned && a.IsApproved() {
			usable = append(usable, a.ID)
		}
	}
	return usable, nil
}
