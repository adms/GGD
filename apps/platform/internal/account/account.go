// Package account holds the durable account model and its repository
// (JSON truth + Redis uniqueness indexes).
package account

import (
	"context"
	"crypto/rand"
	"errors"
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
}

// Public returns the API-safe projection.
func (a Account) Public() Public {
	return Public{ID: a.ID, Username: a.Username, MMR: a.MMR, Games: a.Games, Wins: a.Wins, CreatedAt: a.CreatedAt}
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

// Create writes the account JSON plus both index files. Uniqueness must have
// been reserved (Redis SETNX) by the caller beforehand.
func (r *Repo) Create(ctx context.Context, a Account) error {
	if err := r.store.Put(ColAccounts, a.ID, a); err != nil {
		return err
	}
	if err := r.store.Put(ColByUsername, strings.ToLower(a.Username), ref{ID: a.ID}); err != nil {
		return err
	}
	return r.store.Put(ColByEmail, strings.ToLower(a.Email), ref{ID: a.ID})
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
	err := r.store.Get(ColByUsername, strings.ToLower(username), &rf)
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
	err := r.store.Get(ColByEmail, strings.ToLower(email), &rf)
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
