package gamelink_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/contentoverlay"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/gamelink"
	"github.com/ggd/platform/internal/gamelink/gamelinktest"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/internal/wallet"
	"github.com/ggd/platform/pkg/testkit"
)

// crystal_lobby_test.go — owner 2026-08-17:
//
//	「只要有兩真人(N≥2)參加，不論哪個陣營都可以，所有玩家都 (N+1) 倍，
//	  所以最大 13 倍」
//
// ⛔ NOTHING HERE ASSERTS A SHIPPED NUMBER. Every expectation is derived from
// wallet.DefaultCrystalRules(), because the four bases and the three knobs are
// the operator's to retune (三個住處 + drift 守衛 already guard the values). What
// this file guards is the MECHANISM: that N is the whole lobby, that the clamp
// is real, and that a couch guest raises N without being paid.

// lobby builds a finished 4-team result with the given seats. matchID is
// arbitrary: settlement only needs a signed body with placements and seats, so
// a synthetic id lets one fixture stand in for lobbies that would otherwise
// take twelve registrations to assemble.
func lobby(matchID string, seats []gamelink.ResultSeat) gamelink.ResultRequest {
	return gamelink.ResultRequest{
		MatchID: matchID, Mode: "PairedDuels", MapID: "arena-default",
		Placements: []gamelink.TeamPlace{{Team: 0, Place: 1}, {Team: 1, Place: 2}, {Team: 2, Place: 3}, {Team: 3, Place: 4}},
		Seats:      seats,
		EndedAt:    time.Now().UnixMilli(),
	}
}

// botsFilling appends `n` bot seats spread over the four teams.
func botsFilling(seats []gamelink.ResultSeat, n int) []gamelink.ResultSeat {
	for i := 0; i < n; i++ {
		seats = append(seats, gamelink.ResultSeat{AccountID: fmt.Sprintf("bot-%02d", i), Team: i % 4, IsBot: true})
	}
	return seats
}

// The multipliers the two SHARED fixtures in this package earn, derived rather
// than written down so the older suites next door stop asserting the retired
// per-team halving without acquiring a hard-coded 3 or 5 of their own.
//
//	`result` (gamelink_test.go)          — 2 accounts + 10 bots            -> N=2
//	`resultWithGuests` (mcoin_test.go)   — 2 accounts + 1 couch guest +
//	                                       1 unknown account + 8 bots      -> N=4
func resultMultiplier() int {
	return wallet.CrystalMultiplier(2, wallet.DefaultCrystalRules())
}

func resultWithGuestsMultiplier() int {
	return wallet.CrystalMultiplier(4, wallet.DefaultCrystalRules())
}

func settle(t *testing.T, ts *testutil.TS, req gamelink.ResultRequest) {
	t.Helper()
	resp, err := gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret, req, 0)
	require.NoError(t, err)
	resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)
}

func crystalsOf(t *testing.T, ts *testutil.TS, accountID string) int {
	t.Helper()
	w, err := ts.Srv.Wallet.Get(context.Background(), accountID)
	require.NoError(t, err)
	return w.Crystal
}

// TestCrystalScalesWithTheWholeLobbyNotTheTeam is the load-bearing guard, and
// the second case is the one that could not pass under the rule this replaced:
// two humans on OPPOSITE teams. The 2026-08-01 rule asked "does YOUR team hold a
// bot", so both of them were on bot-filled teams and both took a halved grant —
// playing together paid worse than playing alone. Under the owner's rule they
// are simply two people in one lobby, so both take x3.
func TestCrystalScalesWithTheWholeLobbyNotTheTeam(t *testing.T) {
	testkit.Cover(t, "crystal-lobby-multiplier")
	ts := testutil.New(t)
	alice, bob := ts.Register("alice"), ts.Register("bob")
	rules := wallet.DefaultCrystalRules()

	// ① N = 1 (one human, eleven bots): no multiplier at all. This is the
	// owner's 「120 (N=1)」 — soloing bots must pay exactly what it paid before
	// this rule existed.
	settle(t, ts, lobby("m-solo", botsFilling(
		[]gamelink.ResultSeat{{AccountID: alice.ID, Team: 0}}, 11)))
	require.Equal(t, rules.RewardFor(1)*1, crystalsOf(t, ts, alice.ID),
		"one human against bots takes the BASE grant — multiplier 1, unchanged from before")

	// ② N = 2, on DIFFERENT teams: x(2+1) for BOTH, winner and loser alike.
	settle(t, ts, lobby("m-duo", botsFilling([]gamelink.ResultSeat{
		{AccountID: alice.ID, Team: 0}, // place 1
		{AccountID: bob.ID, Team: 1},   // place 2 — the enemy team
	}, 10)))
	wantAlice := rules.RewardFor(1)*1 + rules.RewardFor(1)*wallet.CrystalMultiplier(2, rules)
	require.Equal(t, wantAlice, crystalsOf(t, ts, alice.ID),
		"two humans in one lobby pay x(N+offset) even when they are on OPPOSING teams — "+
			"「不論哪個陣營」. A halved grant here means the per-team rule came back")
	require.Equal(t, rules.RewardFor(2)*wallet.CrystalMultiplier(2, rules), crystalsOf(t, ts, bob.ID),
		"the loser is in the same lobby, so the loser gets the same multiplier")
	require.Greater(t, wallet.CrystalMultiplier(2, rules), 1,
		"fixture sanity: if the shipped rules gave two humans no multiplier, the case above "+
			"would pass against the OLD behaviour too")
}

// TestCouchGuestRaisesTheMultiplierButEarnsNothing pins the asymmetry the rule
// deliberately carries: `:pN` seats are real people sharing one machine, so they
// make the lobby pay like a bigger lobby, but they have no account file and
// therefore no balance to credit.
func TestCouchGuestRaisesTheMultiplierButEarnsNothing(t *testing.T) {
	testkit.Cover(t, "crystal-couch-guest-headcount")
	ts := testutil.New(t)
	alice := ts.Register("alice")
	rules := wallet.DefaultCrystalRules()

	req := lobby("m-couch", botsFilling([]gamelink.ResultSeat{
		{AccountID: alice.ID, Team: 0},
		{AccountID: alice.ID + ":p2", Team: 0}, // the person on the sofa
	}, 10))
	settle(t, ts, req)

	require.Equal(t, rules.RewardFor(1)*wallet.CrystalMultiplier(2, rules), crystalsOf(t, ts, alice.ID),
		"the couch guest is a PERSON, so N is 2 and the whole lobby is multiplied")
	rec := readMatchRecord(t, ts, "m-couch")
	require.NotContains(t, rec.Ratings, alice.ID+":p2",
		"…but a guest has no account file, so nothing is credited to the seat itself")
}

// TestCrystalMultiplierIsClampedByTheOperatorsCeiling proves the ceiling is a
// real clamp AND that it is LIVE: the value comes from the 商店經濟 override the
// console writes, read at settlement, with no restart in between.
func TestCrystalMultiplierIsClampedByTheOperatorsCeiling(t *testing.T) {
	testkit.Cover(t, "crystal-multiplier-clamp")
	ts := testutil.New(t)
	alice := ts.Register("alice")

	// A full twelve-human lobby. Only alice has an account; the other eleven
	// seats are people without one (couch guests / unknown accounts), which is
	// exactly what N counts.
	seats := []gamelink.ResultSeat{{AccountID: alice.ID, Team: 0}}
	for i := 0; i < 11; i++ {
		seats = append(seats, gamelink.ResultSeat{AccountID: fmt.Sprintf("sofa-%02d:p2", i), Team: (i + 1) % 4})
	}

	// Shipped ceiling (13) does not bite at N=12: the owner's 「120 × 13 (MAX)」.
	settle(t, ts, lobby("m-full", seats))
	rules := wallet.DefaultCrystalRules()
	full := crystalsOf(t, ts, alice.ID)
	require.Equal(t, rules.RewardFor(1)*wallet.CrystalMultiplier(12, rules), full)

	// Now the operator lowers the ceiling. Same lobby, same match shape, and the
	// grant must obey the new ceiling on the very next settlement.
	const ceiling = 5
	writeStoreOverride(t, ts, ceiling)
	settle(t, ts, lobby("m-full-capped", seats))
	require.Equal(t, full+rules.RewardFor(1)*ceiling, crystalsOf(t, ts, alice.ID),
		"maxMultiplier must CLAMP a twelve-human lobby, and an operator's save must reach the "+
			"next settlement without a restart")
}

// writeStoreOverride saves a 商店經濟 override carrying only a lowered crystal
// ceiling, through the same durable document the console's PUT writes.
func writeStoreOverride(t *testing.T, ts *testutil.TS, maxMultiplier int) {
	t.Helper()
	store, err := jsonstore.New(ts.Cfg.DataDir)
	require.NoError(t, err)
	o := contentoverlay.EmptyOverlay()
	o.Docs[wallet.OverlayStoreKey] = json.RawMessage(fmt.Sprintf(`{
      "id": "store",
      "schema": "config.store@1",
      "championUnlockCost": 900,
      "freeChampionIds": [],
      "crystalRewards": { "maxMultiplier": %d },
      "mcoinRewards": { "placement1": 1, "placement2": 0, "placement3": 0, "placement4": 0 }
    }`, maxMultiplier))
	require.NoError(t, store.Put(wallet.OverlayCollection, wallet.OverlayDocID, o))
}
