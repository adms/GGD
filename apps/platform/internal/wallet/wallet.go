package wallet

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"sync"

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
	MCoin   int `json:"mcoin"`
	Crystal int `json:"crystal"`
	// CrystalUnlockCost is the FLAT 藍水晶 price of one champion unlock, as
	// configured in content/config/store.json. It rides on every wallet
	// response so the champ-select 「🔓 解鎖 (N 水晶)」 button can print the
	// number the server will actually deduct instead of a compiled-in copy —
	// the copy was the reason the price could only be changed by a rebuild.
	CrystalUnlockCost int               `json:"crystalUnlockCost"`
	OwnedChampions    []string          `json:"ownedChampions"`
	OwnedSkins        []string          `json:"ownedSkins"`
	EquippedSkins     map[string]string `json:"equippedSkins"`
	Favourites        []string          `json:"favourites"`
}

// Service owns wallet state: the account JSON is the truth, Redis mirrors a
// rebuildable cache (wallet:<accountId>), and every mutation is an atomic
// locked read-modify-write through the jsonstore single writer.
type Service struct {
	accounts *account.Repo
	rdb      *redisx.Client
	store    *jsonstore.Store
	cat      Catalog

	// newAccountCrystals is the one-time 藍水晶 welcome grant a brand-new
	// account is seeded with (task #204). It is a POLICY set at the composition
	// root from config (GGD_NEW_ACCOUNT_CRYSTALS) rather than a constant, so the
	// hand-built test config leaves it 0 — every settlement test keeps its
	// baseline of "a fresh wallet has zero crystals" — while the real binary
	// defaults it to 1000. Zero means "seed nothing". See SeedNewAccountCrystals.
	newAccountCrystals int

	metaLocks *keyedmutex.M

	// overlayWarn keeps a broken content-overlay file from logging once per
	// wallet request (see Service.warnOnce in economy.go).
	overlayWarn sync.Once
}

// New builds the wallet service around the loaded content catalog. store is
// used for the meta-progression collection (crystals + favourites); it may be
// nil in narrow unit tests that never touch meta. newAccountCrystals is the
// one-time welcome 藍水晶 grant for a new account (0 disables it).
func New(accounts *account.Repo, rdb *redisx.Client, store *jsonstore.Store, cat Catalog, newAccountCrystals int) *Service {
	if newAccountCrystals < 0 {
		newAccountCrystals = 0
	}
	return &Service{
		accounts:           accounts,
		rdb:                rdb,
		store:              store,
		cat:                cat,
		newAccountCrystals: newAccountCrystals,
		metaLocks:          keyedmutex.New(),
	}
}

// Catalog exposes the SHIPPED content catalog — the boot-time base, with no
// 商店經濟 override applied. Callers that need a PRICE must use EffectiveCatalog
// (or go through the methods on this service, which all do); this accessor is
// for the roster, the skins and the settlement reward table, none of which the
// override touches.
func (s *Service) Catalog() Catalog { return s.cat }

// EffectiveCatalog is the catalog in force right now: shipped, re-priced under
// the operator's live 商店經濟 override. Every price a player is shown or
// charged comes from here.
func (s *Service) EffectiveCatalog() Catalog { return s.effective() }

// seed fills absent wallet fields in place: a nil OwnedChampions marks an
// account written before the wallet existed and gets the free starter roster.
// Idempotent — seeded fields are never re-seeded.
func (s *Service) seed(a *account.Account) {
	if a.OwnedChampions == nil {
		// effective(), not s.cat: adding a champion to the 商店經濟 free list must
		// put it in the next new account's starter roster without a redeploy.
		a.OwnedChampions = s.effective().FreeChampions()
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
// champions (the store doc's freeChampionIds) and persists the seed.
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

// Buy purchases a champion or skin.
//
// SKINS are the M COIN path: validate exists → not owned → sufficient balance →
// deduct + append ownership + auto-equip, inside one locked write-through.
// Buying something owned is a 409.
//
// CHAMPIONS are 藍水晶 and delegate to UnlockChampion (task #227). This method
// used to deduct `a.MCoin` for a champion, which contradicted #118's own model:
// crystals are the earn-by-playing currency that unlocks champions, M幣 is an
// admin-granted cosmetic currency that is never sold. The two paths had drifted
// — champ-select charged 300 crystals via POST /wallet/champions/unlock while
// the lobby store charged 300 M COIN via POST /store/buy for the same champion,
// and a player with crystals but no M幣 (the normal state) simply could not buy
// from the store. Delegating leaves ONE champion-unlock rule on the server, so
// no client can reach a currency-swapped path:
//
//	402 insufficient_crystal (not insufficient_mcoin) when underfunded,
//	409 already_owned for an owned OR free champion (free champions are seeded
//	    owned anyway, and the catalog already marks price==0 as owned so no buy
//	    button is offered),
//	404 for an unknown champion — all identical to what the store's own error
//	    mapping now expects (ui/platform/purchase.ts).
func (s *Service) Buy(ctx context.Context, accountID, kind, id string) (Wallet, error) {
	switch kind {
	case KindChampion:
		return s.UnlockChampion(ctx, accountID, id)
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
//
// ⚠️ OWNERSHIP IS NOT A FUNCTION OF PRICE. The account's OwnedChampions list on
// the account JSON is the answer for every priced champion, so raising (or
// lowering) the flat cost in 後台 → 商店經濟 cannot take a champion away from
// someone who already unlocked it, and cannot hand one to someone who did not.
// The price only decides WHICH BRANCH is taken. Pinned by
// TestUnlockedPlayersSurviveAPriceChange in economy_api_test.go.
func (s *Service) OwnsChampion(ctx context.Context, accountID, championID string) (bool, error) {
	price, priced := s.effective().ChampionPrice(championID)
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

// CatalogFor renders the store catalog with the caller's ownership flags. Prices
// come from the effective catalog, so the lobby store's rows move the moment an
// operator saves 商店經濟 — same read the champ-select 解鎖 button gets.
func (s *Service) CatalogFor(ctx context.Context, accountID string) ([]CatalogChampion, []CatalogSkin, error) {
	w, err := s.Get(ctx, accountID)
	if err != nil {
		return nil, nil, err
	}
	cat := s.effective()
	champs := []CatalogChampion{}
	for _, id := range cat.ChampionIDs() {
		price := cat.ChampionPrices[id]
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
