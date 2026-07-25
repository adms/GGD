package wallet

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"sort"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/httpx"
)

// Meta-progression tuning (task #118). Crystal (水晶) is the FREE soft currency:
// it is granted for PLAYING A MATCH and spent to unlock champions.
//
// WHO MAY GRANT IT. Two paths, both server-side and both un-loopable:
//
//  1. Match settlement — the HMAC-authenticated server-to-server result
//     callback (gamelink.handleResult), which is per-matchId idempotent
//     (redisx.KeyMatchDone SetNX) and journaled with ABSOLUTE post-match
//     balances so WAL replay converges. This is the repeatable earn.
//  2. The one-time NEW-ACCOUNT welcome seed (task #204, SeedNewAccountCrystals)
//     — a fixed 藍水晶 grant written ONCE at registration, guarded by "this
//     account has no walletmeta record yet" so it can never re-grant. It is
//     reachable only from the registration path (auth.Register), which already
//     rate-limits and gates account creation, so it mints exactly one balance
//     per account that comes into existence.
//
// There is deliberately NO client-callable earn route: a bare authenticated
// self-grant with no per-match key is a minting hole (a client can simply loop
// it). The welcome seed is not that hole — it fires from account creation, not
// from a request the account can repeat.
//
// BALANCE MODEL — the assumed play rate is written down so the owner can
// retune from the same numbers rather than from a bare constant.
//
// CORRECTED TWICE IN ONE DAY, WHICH IS THE POINT (#187). This block used to
// claim seven rounds and twenty-five minutes, derived here by hand, while the
// ops page said a match was fifteen minutes. Both were wrong and neither knew about the other. Then
// the elimination model itself was replaced — 3 shared "lives" became a 20-point
// TEAM HEALTH pool draining 2/4/6 with a per-round escalation from round 7 and a
// High Stakes round every 4th round from round 5 that pays each winner +15.
//
//	REFERENCE POINT — 4 teams x 20 starting Team Health:
//	one match  = champ-select 40s + ~11.6 rounds x (~180s combat + 40s
//	             intermission + 6s resolution) ~= 44 minutes.
//	             (content/config/config.match.json: combatMaxSec 240,
//	             fireRing.startSec 180 so a round typically resolves near 3
//	             minutes; every round going the full 240 is ~56 minutes.)
//	one family evening ~= 1-2 hours ~= 1-3 matches.
//
// THAT IS A REFERENCE POINT, NOT A LIVE READING, and it is deliberately the
// CONSERVATIVE one: it comes from a model that treats every duel as a coin flip,
// which the game-server lane measured as ~25% longer than the real controller
// (median 12 rounds vs 9). The live figure is COMPUTED and shown on the ops page
// (後台 系統運維 → 「一場對戰實際多長（推導值）」, derived in
// apps/platform/internal/opsenv/matchlength.go). Nothing in this comment is
// allowed to be the second answer to that question again: opsenv's
// matchlength_test.go re-derives the two numbers above from the same model and
// fails if they drift, and fails again if the LIVE config moves match length far
// enough from this reference that the grants below stop meaning what they say.
//
// Target feel: about ONE champion unlocked per evening — earned, not a grind,
// not a giveaway. CrystalUnlockCost is 300 and is MIRRORED BY THE CLIENT
// button label (apps/client/.../champselect/walletMeta.ts CRYSTAL_UNLOCK_COST),
// so the tuning lever is the GRANT, not the cost:
//
//	place 1  120  -> 2.5 matches per unlock (~1.8h of play)
//	place 2   90
//	place 3   70
//	place 4   60  -> 5.0 matches per unlock (~3.7h of play)
//	average   85  -> 3.5 matches per unlock (~2.6h of play)
//
// THE HOURS MOVED; THE GRANTS DID NOT. They were computed against the old
// 25-minute figure and read ~1h / ~2h / ~1.5h. A longer match is worth the same
// crystals, so 「about one champion per evening」 no longer holds at the average
// — it is now closer to one champion per two evenings. Whether to raise the
// grants is a BALANCE decision for the owner, not a side effect of correcting a
// comment, so it is deliberately NOT being made here and is flagged instead.
// What is fixed is that the number that decision would be made from is no
// longer wrong.
//
// Last place still earns: 「水晶（打場免費賺）」 is free THROUGH PLAY, not free
// through winning. The 2:1 winner:loser spread makes placement matter without
// stalling the family member who keeps losing. Across the 36 priced champions
// the full roster is a long-term goal (~126 matches at the average), which is
// why the starter roster in content/config/store.json is a generous 12.
const (
	// CrystalUnlockCost is the DEFAULT crystal price to unlock one champion.
	// The authoritative per-champion price is content/config/store.json
	// (championPrices); this constant is the value the client mirrors in its
	// 「解鎖 (N 水晶)」 label, and server.go warns at boot if any priced
	// champion disagrees with it.
	CrystalUnlockCost = 300

	// CrystalPlace1..4 are the per-match crystal grants by final team
	// placement. See the balance model above.
	//
	// 吃雞 (1st) is DOUBLE, by the owner's instruction: 「如果是該場次吃雞，水晶
	// 則 2 倍領取」. Written as base × CrystalWinMultiplier rather than a bare
	// 240 so the intent survives a retune — change the base and the win bonus
	// scales with it, instead of the two silently drifting apart.
	crystalPlace1Base    = 120
	CrystalWinMultiplier = 2
	CrystalPlace1        = crystalPlace1Base * CrystalWinMultiplier // 240
	CrystalPlace2        = 90
	CrystalPlace3        = 70
	CrystalPlace4        = 60

	// MCoinWinGrant is the M COIN a 吃雞 earns, by the owner's instruction:
	// 「並且可以領到 1 枚 M幣」. ONE coin, and only for first place.
	//
	// This REPLACES a per-placement table of 200/120/80/50 that contradicted
	// #118's own premise — 「M幣改由後台發放的造型幣（非購買）」, echoed by
	// GrantMCoin's own doc comment ("admin-granted, never purchased"). A
	// currency that every match minted 200 of is not a scarce cosmetic; it was
	// never a stated intent, just a number nobody revisited. The store doc is
	// still the authority (Catalog.RewardFor reads it); this constant is what
	// that doc now carries.
	MCoinWinGrant = 1
)

// crystalRewards maps final team placement (1 = winner) -> crystal grant.
var crystalRewards = map[int]int{1: CrystalPlace1, 2: CrystalPlace2, 3: CrystalPlace3, 4: CrystalPlace4}

// CrystalRewardFor returns the per-match crystal grant for a final team
// placement. An unknown or zero placement grants nothing — same shape (and
// same safety property) as Catalog.RewardFor for M COIN.
func CrystalRewardFor(place int) int { return crystalRewards[place] }

// ColWalletMeta is the jsonstore collection holding per-account meta
// progression (crystals + favourites). Kept OFF the account struct because a
// parallel wave owns internal/account; keyed by accountId.
const ColWalletMeta = "walletmeta"

// roleAdmin is the authorization role required to grant M COIN. Mirrors
// admin.RoleAdmin as a literal to avoid an import cycle (admin imports wallet).
const roleAdmin = "admin"

// keyMeta is the Redis mirror key for one account's meta progression.
func keyMeta(accountID string) string { return "walletmeta:" + accountID }

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

// CrystalOf returns the account's current crystal balance (0 when it has none
// yet). Read-only; used by match settlement to compute the ABSOLUTE post-match
// balance it journals.
func (s *Service) CrystalOf(ctx context.Context, accountID string) int {
	return s.loadMeta(ctx, accountID).Crystal
}

// SeedNewAccountCrystals grants the one-time 藍水晶 welcome balance to a
// brand-new account (task #204) and returns how many it granted (0 when it did
// nothing). It is called ONCE, from the registration path, right after the
// account file lands.
//
// It is IDEMPOTENT and — the load-bearing property — it never re-grants to an
// existing account. The test is "does this account already have a durable
// walletmeta record?": a fresh account has none (loadMeta seeds only the Redis
// mirror on a miss, never the store; only a spend or a settlement grant writes
// the store record), so the seed lands exactly once. Any account that has ever
// spent, favourited or earned a crystal already has a record and is skipped, so
// turning this on cannot top up veterans, and a duplicated/retried registration
// cannot double-grant.
//
// A zero (or negative) configured amount is a clean no-op, which is what the
// dev/CI wiring uses so the settlement suite keeps its zero-crystal baseline.
func (s *Service) SeedNewAccountCrystals(ctx context.Context, accountID string) (int, error) {
	if s.newAccountCrystals <= 0 || s.store == nil {
		return 0, nil
	}
	unlock := s.metaLocks.Lock(accountID)
	defer unlock()

	exists, err := s.store.Exists(ColWalletMeta, accountID)
	if err != nil {
		return 0, err
	}
	if exists {
		return 0, nil // already has a meta record — never re-grant
	}
	m := meta{Crystal: s.newAccountCrystals}
	m.normalize()
	if err := s.store.Put(ColWalletMeta, accountID, m); err != nil {
		return 0, err
	}
	s.cacheMeta(ctx, accountID, m)
	return s.newAccountCrystals, nil
}

// BackfillWelcomeCrystals is a ONE-OFF migration (task #204 follow-up): grant the
// one-time 藍水晶 welcome balance to every EXISTING account that never received it
// (accounts created before #204 shipped, who have 0 crystals and cannot unlock a
// champion). It simply calls SeedNewAccountCrystals for each id, so it inherits
// that method's load-bearing idempotency: an account that already has a walletmeta
// record (seeded, earned, spent or favourited) is skipped and NEVER topped up, and
// a re-run grants nobody. Triggered once via GGD_BACKFILL_WELCOME_CRYSTALS=1 on a
// single deploy, then the flag is removed. Returns counts and the first error seen.
func (s *Service) BackfillWelcomeCrystals(ctx context.Context, accountIDs []string) (granted, skipped int, firstErr error) {
	for _, id := range accountIDs {
		n, err := s.SeedNewAccountCrystals(ctx, id)
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		if n > 0 {
			granted++
		} else {
			skipped++
		}
	}
	return granted, skipped, firstErr
}

// SetCrystalAbsolute writes an ABSOLUTE crystal balance. This is the ONLY
// grant path, and it is reachable only from match settlement — see the
// "WHO MAY GRANT IT" note at the top of this file.
//
// Absolute (not delta) for the same reason SetMCoinAbsolute is: the settlement
// record and the WAL carry post-match values, so a duplicate result callback
// or a boot replay converges instead of double-granting. The tradeoff is that a
// spend racing the same account's settlement inside that millisecond-wide
// window would be overwritten; the settlement path is per-matchId idempotent
// and fires while the player is still on the結算 screen, so the exposure is the
// same one M COIN and MMR already accept, and it is the safe direction: the
// alternative (delta grants) is the minting hole this replaces.
func (s *Service) SetCrystalAbsolute(ctx context.Context, accountID string, crystal int) error {
	if crystal < 0 {
		crystal = 0
	}
	_, err := s.mutateMeta(ctx, accountID, func(m *meta) error {
		m.Crystal = crystal
		return nil
	})
	return err
}

// UnlockChampion spends the champion's crystal price (content/config/store.json
// championPrices — CrystalUnlockCost is only the default the client mirrors) to
// add a priced champion to the account's owned roster. Unknown champions are
// 404; free champions and already-owned champions are 409; underfunded is 402
// (nothing deducted). On a lost race for ownership the crystals are refunded.
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
		if m.Crystal < price {
			return ErrInsufficientCrystal()
		}
		m.Crystal -= price
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
		_, _ = s.mutateMeta(ctx, accountID, func(m *meta) error { m.Crystal += price; return nil })
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
