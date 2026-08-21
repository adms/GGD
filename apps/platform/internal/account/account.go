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

	// LastSeenAt is the last moment this account did ANYTHING on an
	// authenticated session (task #246): any REST call that passes
	// auth.Middleware, plus the lobby WS connect and its heartbeats. It is
	// deliberately NOT filtered by "importance" — the owner asked for「有做任何
	// session 連線動作都算」— so a client polling in the background keeps it
	// fresh, and the admin console's tooltip says so rather than pretending
	// otherwise.
	//
	// The zero TIME is the "never seen" sentinel — for accounts written before
	// this field existed as well as for one that has never come back since. It
	// carries no `omitempty` because that tag is INERT on time.Time (a struct is
	// never "empty" to encoding/json), and a tag that looks like it omits the
	// zero value while silently emitting it is worse than no tag: the API row
	// that must genuinely distinguish never-seen uses a *time.Time for exactly
	// that reason (see admin.AccountRow.LastSeenAt).
	//
	// Writes go through Repo.SetLastSeen, never Update,
	// because Update also stamps UpdatedAt and that field means something else
	// (see SetLastSeen). Writes are coalesced to at most one per account per
	// minute upstream (auth.Service.TouchLastSeen), so this is ±60s accurate —
	// 1.7% of the one-hour threshold the console renders it against.
	LastSeenAt time.Time `json:"lastSeenAt"`
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
	//
	// IT IS PRESENT ONLY WHILE THE CODE IS STILL REDEEMABLE (task #237). The
	// stored Account.ReferralCode is a mirror of a document in the invite store
	// and is written exactly once; the moment a friend burns it, the stored
	// value names a credential the gate now refuses. Every UI that reads this
	// field puts it in a copy box under the words「分享給一位朋友」, so emitting a
	// spent code is emitting a lie. auth.Service.PublicAccount is the ONE place
	// that fills this projection in, and it drops the code unless the invite
	// store says it is live — see ReferralCodeStatus for what happened to it.
	ReferralCode string `json:"referralCode,omitempty"`
	// ReferralCodeStatus is the DERIVED lifecycle of the account's personal
	// referral code: "active", "redeemed", "expired", "revoked" or "unknown"
	// (the invite package's status vocabulary, which the admin console already
	// renders). Never stored — resolved per response from the invite document,
	// so it cannot drift from the gate the way the mirrored code itself did.
	//
	// It exists so a spent code DISAPPEARS WITH A REASON rather than silently:
	// the panel that offered it can say「已經被使用了」instead of vanishing, which
	// is the difference between the UI telling the truth and the UI telling
	// nothing. Omitted when the account has no code at all, or when the deploy
	// has no invite gate to ask.
	ReferralCodeStatus string `json:"referralCodeStatus,omitempty"`
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

	// postCreate runs AFTER a Create has durably landed. nil = nothing wired
	// (every unit test, and any deploy that turned the feature off).
	postCreate PostCreateHook
}

// PostCreateHook is notified once per account that DURABLY EXISTS.
//
// ---- WHY IT RETURNS NOTHING (GH#499) ----------------------------------------
// owner 2026-08-21:「**每個人創號自動預設有管理員好友**」. The obvious way to hang
// that off registration is a step in auth.Register — but the thing that must be
// impossible is 「帳號沒建成，好友關係卻留下來了」, and a hook placed anywhere
// BEFORE the account file lands can produce exactly that. So the seam is here,
// at the last statement of Create, where the account is already durable:
//
//   - Create failed  → this never runs → no orphan edge, by construction.
//   - Create landed  → the edge is written against an account that exists.
//
// It returns no error ON PURPOSE. A friendship that could not be written is a
// degraded feature (an admin can re-run the backfill); failing the Create would
// destroy an account the caller already paid an argon2id for and — on the
// registration path — already burned an invite code for. Same reasoning as
// auth's own POST-CREATE, ALL BEST-EFFORT block. ⚠️ Best-effort therefore means
// the implementation MUST log loudly on failure: a silent fail-open is the
// defect, not the fail-open itself.
type PostCreateHook interface {
	AfterAccountCreated(ctx context.Context, accountID string)
}

// SetPostCreateHook installs the post-create notification (composition root
// only). Nil disables it. ⛔ This package must never import the hook's
// implementation: internal/friend already imports internal/account, so the
// edge would be an import cycle — the same reason auth takes WalletSeeder as an
// interface instead of importing internal/wallet.
func (r *Repo) SetPostCreateHook(h PostCreateHook) { r.postCreate = h }

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
	// The account is now DURABLE. Everything past this line is best-effort and
	// must not be able to fail the create (see PostCreateHook) — which is also
	// why it sits below the last rollback point rather than beside it.
	if r.postCreate != nil {
		r.postCreate.AfterAccountCreated(ctx, a.ID)
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

// CountByStatus reports how many accounts currently carry exactly the given
// status. It powers the #126 pending-registration CAP (sec-154-11): the approval
// gate manufactures durable pending accounts, so Register consults this before
// creating another and refuses once the queue is full. It is an O(n) List +
// per-id load scan — the right cost at family scale (a few hundred accounts),
// and the same walk searchAccounts already does. A store-read failure is
// returned, not swallowed, so the caller can fail CLOSED (refuse the
// registration) rather than count as empty and wave a flood through.
func (r *Repo) CountByStatus(ctx context.Context, status string) (int, error) {
	ids, err := r.List(ctx)
	if err != nil {
		return 0, err
	}
	n := 0
	for _, id := range ids {
		a, err := r.GetByID(ctx, id)
		if err != nil {
			if errors.Is(err, ErrNotFound) {
				continue // raced with a delete
			}
			return 0, err
		}
		if a.Status == status {
			n++
		}
	}
	return n, nil
}

// DeletePending removes a PENDING account and reclaims its username/email
// reservations — the durable by-username/by-email index files AND the Redis
// SETNX index keys — and reports whether it deleted anything. It is the teardown
// the #126 pending TTL sweep uses (sec-154-11): a pending account that was never
// approved is otherwise a durable jsonstore file plus PERMANENT (ttl 0) Redis
// index keys that never age out.
//
// It REFUSES to touch any account that is not pending: an approved, denied,
// admin or grandfathered account can never be reclaimed by the sweep, even if
// the caller's snapshot was stale by the time the lock was taken.
//
// The account file is removed FIRST so a crash mid-teardown can never leave a
// loginable account whose uniqueness reservations are already gone; a dangling
// index ref (pointing at a now-missing account) is treated as FREE by refFree,
// so a later registration can cleanly reclaim the name. The Redis Del is
// best-effort — Redis is a rebuildable cache and the durable index files are the
// truth — so a Redis hiccup is logged, not fatal.
func (r *Repo) DeletePending(ctx context.Context, id string) (bool, error) {
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
		return false, nil // never reclaim an approved/denied/admin/grandfathered account
	}
	if err := r.store.Delete(ColAccounts, a.ID); err != nil {
		return false, err
	}
	uKey, eKey := indexKey(a.Username), indexKey(a.Email)
	if err := r.store.Delete(ColByUsername, uKey); err != nil {
		slog.Error("account: swept a pending account but could not delete its by-username index", "id", a.ID, "err", err)
	}
	if err := r.store.Delete(ColByEmail, eKey); err != nil {
		slog.Error("account: swept a pending account but could not delete its by-email index", "id", a.ID, "err", err)
	}
	if r.rdb != nil {
		if err := r.rdb.R.Del(ctx, redisx.KeyIdxUsername(a.Username), redisx.KeyIdxEmail(a.Email)).Err(); err != nil {
			slog.Error("account: swept a pending account but could not delete its Redis uniqueness keys (they rebuild from the store on next boot)",
				"id", a.ID, "err", err)
		}
	}
	return true, nil
}

// SweepExpiredPending deletes every PENDING account whose CreatedAt is strictly
// before the cutoff, reclaiming each one's username/email reservations (see
// DeletePending), and returns how many it removed. It is the periodic TTL half
// of the #126 pending CAP+TTL (sec-154-11): the CAP bounds how MANY accounts may
// sit pending at once, and this bounds how LONG an un-actioned one persists, so
// a scripted registration flood behind the approval gate can neither grow
// without limit nor leave durable files + permanent Redis keys that never
// expire. An unreadable individual account is skipped, not fatal, so one bad
// file cannot stall the whole sweep.
func (r *Repo) SweepExpiredPending(ctx context.Context, cutoff time.Time) (int, error) {
	ids, err := r.List(ctx)
	if err != nil {
		return 0, err
	}
	deleted := 0
	for _, id := range ids {
		a, err := r.GetByID(ctx, id)
		if err != nil {
			continue // skip a raced/unreadable row rather than failing the sweep
		}
		if a.Status != StatusPending || !a.CreatedAt.Before(cutoff) {
			continue
		}
		ok, err := r.DeletePending(ctx, id)
		if err != nil {
			slog.Error("account: pending TTL sweep could not delete an expired account", "id", id, "err", err)
			continue
		}
		if ok {
			deleted++
		}
	}
	return deleted, nil
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

// SetLastSeen stamps the session-activity timestamp (task #246) on one account
// and NOTHING ELSE. It takes the same per-account lock as Update, so it stays
// single-writer safe against a concurrent settlement or operator action.
//
// IT DELIBERATELY DOES NOT GO THROUGH Update. Update unconditionally sets
// UpdatedAt = now, whose meaning is "the account record meaningfully changed" —
// it is surfaced on the admin profile. Routing a liveness ping through it would
// make UpdatedAt ≈ LastSeenAt for every active account and quietly destroy that
// field: an operator could no longer tell "this account was edited an hour ago"
// from "this player refreshed their lobby an hour ago".
//
// A stamp that is not newer than the stored one is a no-op, so an out-of-order
// call (or a replayed one) can never move the timestamp backwards, and the
// common re-stamp inside the same second costs no file write.
func (r *Repo) SetLastSeen(ctx context.Context, id string, t time.Time) error {
	unlock := r.locks.Lock(id)
	defer unlock()
	a, err := r.GetByID(ctx, id)
	if err != nil {
		return err
	}
	t = t.UTC()
	if !t.After(a.LastSeenAt) {
		return nil
	}
	a.LastSeenAt = t
	return r.store.Put(ColAccounts, a.ID, a)
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
