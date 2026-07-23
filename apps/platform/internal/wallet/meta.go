package wallet

import (
	"context"
	"encoding/json"
	"errors"
	"math/rand"
	"net/http"
	"sort"
	"time"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/httpx"
)

// Meta-progression tuning (task #118). Crystal (水晶) is the FREE soft currency:
// a small random amount is granted every match, and champions are UNLOCKED by
// spending it. The unlock cost is pitched at roughly 20 matches of the average
// grant ((CrystalMatchMin+CrystalMatchMax)/2 == 15; 15*20 == 300).
const (
	// CrystalMatchMin/Max bound the per-match crystal grant (inclusive).
	CrystalMatchMin = 10
	CrystalMatchMax = 20
	// CrystalUnlockCost is the crystal price to unlock one champion (~20 matches).
	CrystalUnlockCost = 300
)

// ColWalletMeta is the jsonstore collection holding per-account meta
// progression (crystals + favourites). Kept OFF the account struct because a
// parallel wave owns internal/account; keyed by accountId.
const ColWalletMeta = "walletmeta"

// roleAdmin is the authorization role required to grant M COIN. Mirrors
// admin.RoleAdmin as a literal to avoid an import cycle (admin imports wallet).
const roleAdmin = "admin"

// keyMeta is the Redis mirror key for one account's meta progression.
func keyMeta(accountID string) string { return "walletmeta:" + accountID }

// defaultCrystalRoll is the production per-match grant: a uniform draw in
// [CrystalMatchMin, CrystalMatchMax]. Tests replace it via SetCrystalRoll for
// deterministic amounts.
var seededRand = rand.New(rand.NewSource(time.Now().UnixNano()))

func defaultCrystalRoll() int {
	return CrystalMatchMin + seededRand.Intn(CrystalMatchMax-CrystalMatchMin+1)
}

// SetCrystalRoll overrides the per-match crystal grant function (tests seed it
// so match rewards are deterministic).
func (s *Service) SetCrystalRoll(fn func() int) { s.crystalRoll = fn }

// meta is the durable per-account meta-progression record.
type meta struct {
	Crystal    int      `json:"crystal"`
	Favourites []string `json:"favourites"`
}

func (m *meta) normalize() {
	if m.Crystal < 0 {
		m.Crystal = 0
	}
	if m.Favourites == nil {
		m.Favourites = []string{}
	}
}

// ErrInsufficientCrystal is the 402-style error for underfunded unlocks.
func ErrInsufficientCrystal() *httpx.E {
	return httpx.Err(http.StatusPaymentRequired, "insufficient_crystal", "not enough crystals")
}

// loadMeta reads the meta record, preferring the Redis mirror and falling back
// to the jsonstore truth (seeding a zero record when absent). Best-effort
// re-warms the mirror.
func (s *Service) loadMeta(ctx context.Context, accountID string) meta {
	var m meta
	if s.rdb != nil {
		if data, err := s.rdb.R.Get(ctx, keyMeta(accountID)).Bytes(); err == nil && json.Unmarshal(data, &m) == nil {
			m.normalize()
			return m
		}
	}
	if s.store != nil {
		if err := s.store.Get(ColWalletMeta, accountID, &m); err != nil && !errors.Is(err, jsonstore.ErrNotFound) {
			// A malformed/unreadable meta file must not zero a player's crystals
			// silently on every read; fall through to a zero record only for a
			// genuine miss. Any other error is surfaced by returning zero here
			// but NOT caching it, so the next read retries.
			return meta{Favourites: []string{}}
		}
	}
	m.normalize()
	s.cacheMeta(ctx, accountID, m)
	return m
}

// cacheMeta write-throughs the meta mirror (best-effort; never authoritative).
func (s *Service) cacheMeta(ctx context.Context, accountID string, m meta) {
	if s.rdb == nil {
		return
	}
	if data, err := json.Marshal(m); err == nil {
		_ = s.rdb.R.Set(ctx, keyMeta(accountID), data, 0).Err()
	}
}

// mutateMeta runs fn under the per-account meta lock (read-modify-write on the
// jsonstore truth), persists, and refreshes the mirror. fn may return an
// *httpx.E to abort cleanly.
func (s *Service) mutateMeta(ctx context.Context, accountID string, fn func(*meta) error) (meta, error) {
	unlock := s.metaLocks.Lock(accountID)
	defer unlock()

	var m meta
	if s.store != nil {
		if err := s.store.Get(ColWalletMeta, accountID, &m); err != nil && !errors.Is(err, jsonstore.ErrNotFound) {
			return meta{}, err
		}
	}
	m.normalize()
	if err := fn(&m); err != nil {
		return meta{}, err
	}
	m.normalize()
	if s.store != nil {
		if err := s.store.Put(ColWalletMeta, accountID, m); err != nil {
			return meta{}, err
		}
	}
	s.cacheMeta(ctx, accountID, m)
	return m, nil
}

// overlayMeta populates the crystal + favourites fields of a wallet projection
// from the meta record.
func (s *Service) overlayMeta(ctx context.Context, accountID string, w *Wallet) {
	m := s.loadMeta(ctx, accountID)
	w.Crystal = m.Crystal
	w.Favourites = m.Favourites
	if w.Favourites == nil {
		w.Favourites = []string{}
	}
}

// EarnMatchCrystals grants one match's worth of crystals to the account and
// returns the updated wallet. The amount comes from crystalRoll (seeded in
// tests). This is the free, per-match soft-currency drip.
func (s *Service) EarnMatchCrystals(ctx context.Context, accountID string) (Wallet, error) {
	amount := s.crystalRoll()
	if amount < 0 {
		amount = 0
	}
	if _, err := s.mutateMeta(ctx, accountID, func(m *meta) error {
		m.Crystal += amount
		return nil
	}); err != nil {
		return Wallet{}, err
	}
	return s.Get(ctx, accountID)
}

// UnlockChampion spends CrystalUnlockCost crystals to add a priced champion to
// the account's owned roster. Unknown champions are 404; free champions and
// already-owned champions are 409; underfunded is 402 (nothing deducted). On a
// lost race for ownership the crystals are refunded.
func (s *Service) UnlockChampion(ctx context.Context, accountID, championID string) (Wallet, error) {
	price, priced := s.cat.ChampionPrice(championID)
	if !priced {
		return Wallet{}, httpx.NotFound("unknown champion: " + championID)
	}
	if price == 0 {
		return Wallet{}, httpx.Err(http.StatusConflict, "already_owned", "champion is free — already owned")
	}

	// Fast-path ownership check for a clean 409 without touching crystals.
	a, err := s.accounts.GetByID(ctx, accountID)
	if err != nil {
		return Wallet{}, err
	}
	if contains(a.OwnedChampions, championID) {
		return Wallet{}, httpx.Err(http.StatusConflict, "already_owned", "champion already owned")
	}

	// Deduct crystals first (locked RMW on the meta truth).
	if _, err := s.mutateMeta(ctx, accountID, func(m *meta) error {
		if m.Crystal < CrystalUnlockCost {
			return ErrInsufficientCrystal()
		}
		m.Crystal -= CrystalUnlockCost
		return nil
	}); err != nil {
		return Wallet{}, err
	}

	// Grant ownership; the account write is the authoritative gate, so refund
	// crystals if it turns out the champion is already owned (concurrent unlock)
	// or the write fails. Routed through mutate so the wallet cache is refreshed
	// with the new roster (a bare account write would leave a stale mirror).
	errAlreadyOwned := errors.New("already owned")
	_, err = s.mutate(ctx, accountID, func(ac *account.Account) error {
		if contains(ac.OwnedChampions, championID) {
			return errAlreadyOwned
		}
		ac.OwnedChampions = append(ac.OwnedChampions, championID)
		sort.Strings(ac.OwnedChampions)
		return nil
	})
	if err != nil {
		_, _ = s.mutateMeta(ctx, accountID, func(m *meta) error { m.Crystal += CrystalUnlockCost; return nil })
		if errors.Is(err, errAlreadyOwned) {
			return Wallet{}, httpx.Err(http.StatusConflict, "already_owned", "champion already owned")
		}
		return Wallet{}, err
	}
	return s.Get(ctx, accountID)
}

// ToggleFavourite pins or unpins a champion in champ-select. Favourites are
// stored sorted; the champion must exist in the store catalog. Idempotent:
// pinning a pinned champion (or unpinning an unpinned one) is a no-op success.
func (s *Service) ToggleFavourite(ctx context.Context, accountID, championID string, favourite bool) (Wallet, error) {
	if _, ok := s.cat.ChampionPrice(championID); !ok {
		return Wallet{}, httpx.NotFound("unknown champion: " + championID)
	}
	if _, err := s.mutateMeta(ctx, accountID, func(m *meta) error {
		has := contains(m.Favourites, championID)
		switch {
		case favourite && !has:
			m.Favourites = append(m.Favourites, championID)
			sort.Strings(m.Favourites)
		case !favourite && has:
			out := m.Favourites[:0]
			for _, id := range m.Favourites {
				if id != championID {
					out = append(out, id)
				}
			}
			m.Favourites = out
		}
		return nil
	}); err != nil {
		return Wallet{}, err
	}
	return s.Get(ctx, accountID)
}

// GrantMCoin adds delta M COIN (造型幣) to a target account on behalf of an
// admin. M COIN is admin-granted, never purchased (task #118 / #126). The
// caller MUST carry the admin role — a non-admin caller is a 403 and nothing
// changes. The balance floors at 0. Returns the target's new balance.
func (s *Service) GrantMCoin(ctx context.Context, callerID, targetID string, delta int) (int, error) {
	caller, err := s.accounts.GetByID(ctx, callerID)
	if err != nil {
		return 0, err
	}
	if !caller.HasRole(roleAdmin) {
		return 0, httpx.Err(http.StatusForbidden, "forbidden", "admin role required")
	}
	target, err := s.accounts.GetByID(ctx, targetID)
	if err != nil {
		return 0, err
	}
	next := target.MCoin + delta
	if next < 0 {
		next = 0
	}
	if err := s.SetMCoinAbsolute(ctx, targetID, next); err != nil {
		return 0, err
	}
	return next, nil
}
