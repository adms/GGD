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
// WHO MAY GRANT IT. Three paths, all server-side and all un-loopable:
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
//  3. An OPERATOR GRANT from the admin console (task #225, AddCrystal) — a
//     single-account or all-accounts 藍水晶 grant an administrator issues by
//     hand. It is deliberately NOT in this package's HTTP surface: the routes
//     live in internal/admin behind the AdminOnly middleware (a usable admin:
//     roled, unbanned, approved) and EVERY grant appends an admin audit line.
//     internal/wallet cannot write that audit itself (admin imports wallet —
//     see roleAdmin below), which is exactly why the endpoint belongs there and
//     this file exposes only the locked mutation.
//
// There is deliberately NO client-callable earn route: a bare authenticated
// self-grant with no per-match key is a minting hole (a client can simply loop
// it). Neither the welcome seed nor the operator grant is that hole — one fires
// from account creation, the other from an admin-gated, audited console action;
// neither is a request a player's own token can repeat.
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
//	one match  = champ-select 20s + ~11.6 rounds x (~60s combat + 25s
//	             intermission + 6s resolution) ~= 18 minutes.
//	             (content/config/config.match.json: combatMaxSec 180,
//	             fireRing.startSec 60 so a round typically resolves near 1
//	             minute; every round going the full 180 is ~41 minutes.)
//	one family evening ~= 1-2 hours ~= 3-7 matches.
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
// not a giveaway. The unlock price SHIPS at 300 in content/config/store.json
// (`championUnlockCost`) and the operator can move it live from 後台 → 商店經濟
// (task #241); the numbers below are derived against the shipped 300, so an
// operator who changes it has changed this table's conclusions too. The client
// reads the live value off GET /wallet (`crystalUnlockCost`) rather than
// compiling in a copy. The tuning lever is still the GRANT, not the cost:
//
//	place 1  240  -> 1.25 matches per unlock (~0.4h of play)
//	place 2   90  -> 3.3  matches per unlock (~1.0h of play)
//	place 3   70  -> 4.3  matches per unlock (~1.3h of play)
//	place 4   60  -> 5.0  matches per unlock (~1.5h of play)
//	average  115  -> 2.6  matches per unlock (~0.8h of play)
//
// THE MATCH GOT SHORTER; THE GRANTS DID NOT MOVE, AND THAT IS THE DECISION —
// NOT AN OVERSIGHT (#250). Read the history in order, because the obvious
// "fix" here is the wrong one:
//
//	#118 tuned these grants against a ~25-minute match.
//	Then the reference block above was corrected to ~44 minutes, and this
//	paragraph used to say 「one champion per evening」 had become one champion
//	per TWO evenings, with raising the grants flagged as an open question.
//	Then #132 and #153 tuned the ROUND down — combatMaxSec 240 -> 100,
//	fireRing.startSec 180 -> 60, champ-select 40s -> 20s. The same ~11.6
//	rounds now take ~18 minutes, so the play-hours landed back on the ~1h /
//	~2h / ~1.5h the grants were originally tuned against and
//	「about one champion per evening」 holds again at the average.
//	The 44 was never re-derived, so this file went on claiming a match length
//	that had not existed for two content revisions.
//	AND IT HAPPENED AGAIN (GH#292). The block above then said 21 minutes for
//	a while, because two later balance edits — intermissionSec 40 -> 25
//	(「商店 40→25 秒」) and combatMaxSec 100 -> 180 — moved the typical round
//	from 106s to 91s without anyone re-deriving this comment. THIS is the
//	whole reason matchlength_test.go re-computes the two numbers above: the
//	number that goes stale is never the one somebody is looking at, and 3
//	minutes of drift is exactly the size that survives a reading and dies in
//	a test. The typical round is now 25 + 60 + 6 = 91s; the long one, if
//	every round runs to combatMaxSec, is 25 + 180 + 6 = 211s.
//
// The owner was shown the resulting gap — the economy pays out per match at a
// rate set for a match twice as long — and ruled:
//
//	「藍水晶本來就是獎勵 有人抱怨我們再來改」
//
// So the grants below are DELIBERATELY UNCHANGED. 藍水晶 is a reward, not a
// throttle; the faster payout is the intended feel until a player complains.
// The defect this task fixed was the COMMENT, which was still describing a
// 44-minute match that no longer exists — not the payout, which is doing what
// the owner wants.
//
// IF YOU ARE HERE TO "REBALANCE THE ECONOMY": cutting these numbers reverses an
// explicit owner decision, and TestCrystalGrantsAreTheOwnersDecision in
// meta_pin_test.go will stop you and say so. Bring the owner a new decision
// first; do not infer one from arithmetic.
//
// Last place still earns: 「水晶（打場免費賺）」 is free THROUGH PLAY, not free
// through winning. The 4:1 first:last spread (吃雞 doubling included) makes
// placement matter without stalling the family member who keeps losing. Across
// the 41 priced champions of the first open roster the full set is a long-term
// goal (~107 matches at the average), which is why content/config/store.json
// keeps 12 champions on `freeChampionIds` as a generous starter roster.
const (
	// CrystalUnlockCost is a FALLBACK, NOT THE PRICE (2026-07-30). The live
	// number is `championUnlockCost`: shipped in content/config/store.json,
	// loaded into Catalog.UnlockCost at boot, and OVERRIDDEN PER REQUEST by
	// whatever 後台 → 商店經濟 has saved into the durable content overlay
	// (economy.go). Service.UnlockCost() is the only honest answer; a save is
	// live on the very next request, with no restart and no page reload.
	//
	// ⚠️ AN EARLIER VERSION OF THIS COMMENT SAID「takes effect on the next
	// content load」 (task #241). There was no such load: LoadCatalog ran once
	// at boot and nothing rewrote content/ — the console's save went to a file
	// the wallet never read. That sentence is the reason nobody noticed for a
	// day, so it is written down rather than quietly deleted.
	//
	// This constant is what the code falls back to when no store doc can be
	// read at all (EmptyCatalog — a platform booted without CONTENT_DIR). It is
	// also the number the balance model above is written against, so it must
	// keep tracking the SHIPPED value in content/config/store.json: it is not a
	// second opinion, it is a stale copy that has to be kept honest, and
	// TestCrystalUnlockCostMatchesShippedStoreDoc fails if it drifts.
	//
	// Anything that needs the real price must ask the SERVICE (UnlockCost() /
	// EffectiveCatalog()). Reaching for this constant — or for the boot-time
	// Catalog — in a pricing decision reintroduces exactly the hard-coding this
	// task removed.
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
// from the meta record, dropping favourites the catalog no longer knows.
//
// It also stamps the CURRENT flat unlock cost. That belongs here, after the
// Redis mirror has been read, precisely because the mirror can hold a wallet
// serialised under the OLD price: an operator who edits 商店經濟 must not have
// the change hidden behind a warm cache entry, and re-stamping is free.
//
// THE STAMP IS THE WHOLE GUARD (task #241). This one line is what carries an
// operator's price edit to the player: `crystalUnlockCost` rides every GET
// /wallet payload and the champ-select 「🔓 解鎖 (N 水晶)」 button prints it
// (apps/client/src/ui/panels/champselect/walletMeta.ts). Reading s.cat here —
// which is what it did until #241 — pins it to whatever content/config/store.json
// said at BOOT, so the console could save 111, answer「✓ 已寫入」, redisplay 111
// on reload (it reads the overlay), and still charge everybody 900 forever.
// If you change this back to s.cat, TestOperatorPriceEditReachesGetWallet in
// economy_api_test.go goes red and says so.
func (s *Service) overlayMeta(ctx context.Context, accountID string, w *Wallet) {
	m := s.loadMeta(ctx, accountID)
	w.Crystal = m.Crystal
	w.CrystalUnlockCost = s.UnlockCost()
	w.Favourites = s.liveFavourites(m.Favourites)
}

// UnlockCost is the flat 藍水晶 price of one champion unlock in force right now:
// content/config/store.json → championUnlockCost, with the operator's live
// 商店經濟 override laid over it (economy.go). Exported so a caller that needs
// the number outside a wallet projection asks the service instead of reaching
// for the CrystalUnlockCost fallback constant or for the boot-time catalog.
func (s *Service) UnlockCost() int { return s.effective().UnlockCost }

// liveFavourites filters a stored favourite list down to champions the CURRENT
// catalog still carries.
//
// WHY VALIDATE ON READ RATHER THAN MIGRATE (task #249). ToggleFavourite already
// rejects an unknown champion, so nothing can WRITE a bad pin — but the roster
// moves underneath the stored list. When #249 swapped ten first-open-roster
// slots from a 變身 alternate to its base unit, any player who had pinned one of
// the ten alternates was left holding an id champ-select no longer renders: a
// silent dead entry, and one that costs a favourite slot's worth of ordering.
//
// A one-shot migration would have to DELETE those entries from the durable
// record, which is irreversible and wrong for this data: a champion can leave
// and re-enter the catalog (the operator whitelist is editable, and the #119
// transform work may yet make an alternate pickable again). Filtering on read
// is idempotent, needs no migration step, cannot lose a pin that becomes valid
// again, and puts the check on the ONE path every surface reads through.
//
// An EMPTY catalog is not evidence that a favourite is dead — the platform
// boots with no content mounted (LoadCatalog returns an empty catalog and a nil
// error), and filtering then would blank every player's pins on a
// misconfiguration. So an empty catalog passes everything through unchanged.
func (s *Service) liveFavourites(stored []string) []string {
	if len(stored) == 0 {
		return []string{}
	}
	if len(s.cat.ChampionPrices) == 0 {
		return append([]string{}, stored...)
	}
	out := make([]string, 0, len(stored))
	for _, id := range stored {
		if _, ok := s.cat.ChampionPrice(id); ok {
			out = append(out, id)
		}
	}
	return out
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

// AddCrystal applies a delta to an account's crystal balance under the
// per-account meta lock and returns the resulting balance (task #225).
//
// This is the ADDITIVE counterpart to SetCrystalAbsolute, and it exists so the
// operator grant is not a read-modify-write spread across two calls. Computing
// `CrystalOf(...) + amount` and handing the sum to SetCrystalAbsolute would race
// a match settlement (which writes its own absolute post-match balance) and a
// concurrent unlock spend — a bulk grant across every account widens that window
// to however long the loop runs. mutateMeta takes the same lock every other
// mutation takes, so the read and the write cannot be separated.
//
// Absolute is still right for settlement (a replayed callback must converge);
// additive is right here because an operator grant has no idempotency key and
// two grants of 500 mean 1000. The balance floors at 0 via meta.normalize, so a
// negative delta cannot push an account below zero — but a negative delta is
// NOT how crystals are taken away through the console: the handler rejects
// non-positive amounts, precisely because flooring would silently turn "-999999"
// into "wipe this player's balance".
func (s *Service) AddCrystal(ctx context.Context, accountID string, delta int) (int, error) {
	m, err := s.mutateMeta(ctx, accountID, func(m *meta) error {
		m.Crystal += delta
		return nil
	})
	if err != nil {
		return 0, err
	}
	return m.Crystal, nil
}

// UnlockChampion spends the champion's crystal price — the FLAT
// `championUnlockCost` in force right now (shipped content/config/store.json
// with the operator's 商店經濟 override on top), or 0 when the champion is on
// that doc's `freeChampionIds` — to
// add a priced champion to the account's owned roster. Unknown champions are
// 404; free champions and already-owned champions are 409; underfunded is 402
// (nothing deducted). On a lost race for ownership the crystals are refunded.
//
// The price is resolved ONCE, here, and the same number is what gets deducted —
// so a save landing mid-request can change what the next unlock costs but never
// what this one charges versus what it checked affordability against.
func (s *Service) UnlockChampion(ctx context.Context, accountID, championID string) (Wallet, error) {
	price, priced := s.effective().ChampionPrice(championID)
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

// GrantMCoin USED TO LIVE HERE and was deleted by task #214.
//
// It was the service half of `POST /wallet/admin/grant-mcoin`: it checked
// caller.HasRole("admin") and nothing else — no ban check, no #126 approval
// check, no amount bounds — and, decisively, it could write NO audit line,
// because internal/admin owns the audit writer and admin imports wallet, so the
// reverse edge is an import cycle. The result was an operator currency door
// that left no trail while the sibling door (/admin/accounts/{id}/mcoin) logged
// every move.
//
// The audited replacement is admin.Service.AdjustMCoin. Do NOT reintroduce a
// grant path in this package: the cycle that blocked the audit line is still
// there, so any M幣 mutation added here would be unauditable for the same
// reason. wallet.Service.SetMCoinAbsolute stays exported as the low-level write
// that admin.Service.AdjustMCoin drives.
