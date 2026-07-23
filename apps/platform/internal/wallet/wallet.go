package wallet

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/keyedmutex"
	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/httpx"
)

// Purchase kinds accepted by Buy.
const (
	KindChampion = "champion"
	KindSkin     = "skin"
)

// Wallet is the API-facing wallet projection of one account.
//
// M COIN (MCoin) is the ADMIN-GRANTED cosmetic currency (task #118 / #126:
// there is no third-party payment — operators grant it, players spend it on
// skins/cosmetics). Crystal (水晶) is the free soft currency earned every match
// and spent to UNLOCK champions. Favourites are the champion ids a player has
// pinned to the top of champ-select. Crystal + Favourites live in the wallet's
// own "walletmeta" collection (NOT on the account struct, which a parallel wave
// owns); Get overlays them onto every response.
type Wallet struct {
	MCoin          int               `json:"mcoin"`
	Crystal        int               `json:"crystal"`
	OwnedChampions []string          `json:"ownedChampions"`
	OwnedSkins     []string          `json:"ownedSkins"`
	EquippedSkins  map[string]string `json:"equippedSkins"`
	Favourites     []string          `json:"favourites"`
}

// Service owns wallet state: the account JSON is the truth, Redis mirrors a
// rebuildable cache (wallet:<accountId>), and every mutation is an atomic
// locked read-modify-write through the jsonstore single writer.
type Service struct {
	accounts *account.Repo
	rdb      *redisx.Client
	store    *jsonstore.Store
	cat      Catalog

	metaLocks   *keyedmutex.M
	crystalRoll func() int
}

// New builds the wallet service around the loaded content catalog. store is
// used for the meta-progression collection (crystals + favourites); it may be
// nil in narrow unit tests that never touch meta.
func New(accounts *account.Repo, rdb *redisx.Client, store *jsonstore.Store, cat Catalog) *Service {
	return &Service{
		accounts:    accounts,
		rdb:         rdb,
		store:       store,
		cat:         cat,
		metaLocks:   keyedmutex.New(),
		crystalRoll: defaultCrystalRoll,
	}
}

// Catalog exposes the loaded content catalog (settlement rewards, tests).
func (s *Service) Catalog() Catalog { return s.cat }

// seed fills absent wallet fields in place: a nil OwnedChampions marks an
// account written before the wallet existed and gets the free starter roster.
// Idempotent — seeded fields are never re-seeded.
func (s *Service) seed(a *account.Account) {
	if a.OwnedChampions == nil {
		a.OwnedChampions = s.cat.FreeChampions()
	}
	if a.OwnedSkins == nil {
		a.OwnedSkins = []string{}
	}
	if a.EquippedSkins == nil {
		a.EquippedSkins = map[string]string{}
	}
}

func toWallet(a account.Account) Wallet {
	w := Wallet{
		MCoin:          a.MCoin,
		OwnedChampions: a.OwnedChampions,
		OwnedSkins:     a.OwnedSkins,
		EquippedSkins:  a.EquippedSkins,
	}
	if w.OwnedChampions == nil {
		w.OwnedChampions = []string{}
	}
	if w.OwnedSkins == nil {
		w.OwnedSkins = []string{}
	}
	if w.EquippedSkins == nil {
		w.EquippedSkins = map[string]string{}
	}
	if w.Favourites == nil {
		w.Favourites = []string{}
	}
	return w
}

// cache write-through: best-effort — Redis is never authoritative.
func (s *Service) cache(ctx context.Context, accountID string, w Wallet) {
	if data, err := json.Marshal(w); err == nil {
		_ = s.rdb.R.Set(ctx, redisx.KeyWallet(accountID), data, 0).Err()
	}
}

// Get returns the wallet, serving the Redis mirror when warm and falling back
// to (and re-warming from) the account JSON truth. First read seeds starter
// champions (all championPrices == 0 entries) and persists the seed.
func (s *Service) Get(ctx context.Context, accountID string) (Wallet, error) {
	var w Wallet
	if data, err := s.rdb.R.Get(ctx, redisx.KeyWallet(accountID)).Bytes(); err == nil && json.Unmarshal(data, &w) == nil {
		// Cache hit for the account-derived part. Crystal/favourites are always
		// re-overlaid from their own truth below, so a stale value here is fine.
	} else {
		a, err := s.accounts.GetByID(ctx, accountID)
		if err != nil {
			return Wallet{}, err
		}
		if a.OwnedChampions == nil { // unseeded: persist the starter roster once
			a, err = s.accounts.Update(ctx, accountID, func(ac *account.Account) error {
				s.seed(ac)
				return nil
			})
			if err != nil {
				return Wallet{}, err
			}
		}
		w = toWallet(a)
	}
	s.overlayMeta(ctx, accountID, &w)
	s.cache(ctx, accountID, w)
	return w, nil
}

// mutate seeds + runs fn under the account lock, persists, and refreshes the
// cache mirror. fn may return an *httpx.E to abort with a clean API error.
func (s *Service) mutate(ctx context.Context, accountID string, fn func(*account.Account) error) (Wallet, error) {
	a, err := s.accounts.Update(ctx, accountID, func(ac *account.Account) error {
		s.seed(ac)
		return fn(ac)
	})
	if err != nil {
		return Wallet{}, err
	}
	w := toWallet(a)
	s.overlayMeta(ctx, accountID, &w)
	s.cache(ctx, accountID, w)
	return w, nil
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

// ErrInsufficient is the 402-style error for underfunded purchases.
func ErrInsufficient() *httpx.E {
	return httpx.Err(http.StatusPaymentRequired, "insufficient_mcoin", "not enough M COIN")
}

// Buy purchases a champion or skin: validate exists → not owned → sufficient
// balance → deduct + append ownership (+ auto-equip skins), all inside one
// locked write-through. Buying something owned is a 409.
func (s *Service) Buy(ctx context.Context, accountID, kind, id string) (Wallet, error) {
	switch kind {
	case KindChampion:
		price, ok := s.cat.ChampionPrice(id)
		if !ok {
			return Wallet{}, httpx.NotFound("unknown champion: " + id)
		}
		return s.mutate(ctx, accountID, func(a *account.Account) error {
			if contains(a.OwnedChampions, id) {
				return httpx.Err(http.StatusConflict, "already_owned", "champion already owned")
			}
			if a.MCoin < price {
				return ErrInsufficient()
			}
			a.MCoin -= price
			a.OwnedChampions = append(a.OwnedChampions, id)
			sort.Strings(a.OwnedChampions)
			return nil
		})
	case KindSkin:
		sk, ok := s.cat.Skins[id]
		if !ok {
			return Wallet{}, httpx.NotFound("unknown skin: " + id)
		}
		return s.mutate(ctx, accountID, func(a *account.Account) error {
			if contains(a.OwnedSkins, id) {
				return httpx.Err(http.StatusConflict, "already_owned", "skin already owned")
			}
			if a.MCoin < sk.MCoinPrice {
				return ErrInsufficient()
			}
			a.MCoin -= sk.MCoinPrice
			a.OwnedSkins = append(a.OwnedSkins, id)
			sort.Strings(a.OwnedSkins)
			a.EquippedSkins[sk.ChampionID] = id // auto-equip on purchase
			return nil
		})
	default:
		return Wallet{}, httpx.BadRequest(`kind must be "champion" or "skin"`)
	}
}

// Equip sets (or, with skinID == nil, clears) the equipped skin of a champion.
// The skin must be owned and must belong to the champion.
func (s *Service) Equip(ctx context.Context, accountID, championID string, skinID *string) (Wallet, error) {
	if championID == "" {
		return Wallet{}, httpx.BadRequest("championId is required")
	}
	if skinID == nil {
		return s.mutate(ctx, accountID, func(a *account.Account) error {
			delete(a.EquippedSkins, championID)
			return nil
		})
	}
	sk, ok := s.cat.Skins[*skinID]
	if !ok {
		return Wallet{}, httpx.NotFound("unknown skin: " + *skinID)
	}
	if sk.ChampionID != championID {
		return Wallet{}, httpx.BadRequest("skin does not belong to that champion")
	}
	return s.mutate(ctx, accountID, func(a *account.Account) error {
		if !contains(a.OwnedSkins, sk.ID) {
			return httpx.Err(http.StatusForbidden, "skin_not_owned", "you do not own this skin")
		}
		a.EquippedSkins[championID] = sk.ID
		return nil
	})
}

// OwnsChampion reports whether the account may play the champion: free (or
// unpriced) champions are always playable; priced ones must be owned.
func (s *Service) OwnsChampion(ctx context.Context, accountID, championID string) (bool, error) {
	price, priced := s.cat.ChampionPrice(championID)
	if !priced || price == 0 {
		return true, nil
	}
	w, err := s.Get(ctx, accountID)
	if err != nil {
		return false, err
	}
	return contains(w.OwnedChampions, championID), nil
}

// SetMCoinAbsolute writes an ABSOLUTE M COIN balance (settlement/WAL replay:
// absolute values keep duplicate application idempotent, like MMR).
func (s *Service) SetMCoinAbsolute(ctx context.Context, accountID string, mcoin int) error {
	_, err := s.mutate(ctx, accountID, func(a *account.Account) error {
		a.MCoin = mcoin
		return nil
	})
	return err
}

// CatalogChampion is one champion row of the store catalog response.
type CatalogChampion struct {
	ID    string `json:"id"`
	Price int    `json:"price"`
	Owned bool   `json:"owned"`
}

// CatalogSkin is one skin row of the store catalog response.
type CatalogSkin struct {
	ID         string `json:"id"`
	ChampionID string `json:"championId"`
	Price      int    `json:"price"`
	ModelKey   string `json:"modelKey"`
	Owned      bool   `json:"owned"`
	Equipped   bool   `json:"equipped"`
}

// CatalogFor renders the store catalog with the caller's ownership flags.
func (s *Service) CatalogFor(ctx context.Context, accountID string) ([]CatalogChampion, []CatalogSkin, error) {
	w, err := s.Get(ctx, accountID)
	if err != nil {
		return nil, nil, err
	}
	champs := []CatalogChampion{}
	for _, id := range s.cat.ChampionIDs() {
		price := s.cat.ChampionPrices[id]
		champs = append(champs, CatalogChampion{
			ID: id, Price: price,
			Owned: price == 0 || contains(w.OwnedChampions, id),
		})
	}
	skins := []CatalogSkin{}
	for _, id := range s.cat.SkinIDs() {
		sk := s.cat.Skins[id]
		skins = append(skins, CatalogSkin{
			ID: sk.ID, ChampionID: sk.ChampionID, Price: sk.MCoinPrice, ModelKey: sk.ModelKey,
			Owned:    contains(w.OwnedSkins, sk.ID),
			Equipped: w.EquippedSkins[sk.ChampionID] == sk.ID,
		})
	}
	return champs, skins, nil
}
