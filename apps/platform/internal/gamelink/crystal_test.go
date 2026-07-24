package gamelink_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/gamelink/gamelinktest"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/internal/wallet"
	"github.com/ggd/platform/pkg/testkit"
)

// TestCrystalsEarnedOnSettlement is the acceptance test for the crystal half of
// task #118: 水晶 are granted for PLAYING A MATCH, scaled by final placement,
// and they arrive through the HMAC-signed settlement callback — the only path
// that exists. Bots and couch guests earn nothing.
func TestCrystalsEarnedOnSettlement(t *testing.T) {
	testkit.Cover(t, "crystal-earn-settlement")
	ts := testutil.New(t)
	ctx := context.Background()
	host, guest, _, matchID := startMatch(ts)

	// Pre-existing balance: the grant ADDS to it (the journalled value is the
	// absolute post-match total).
	require.NoError(t, ts.Srv.Wallet.SetCrystalAbsolute(ctx, host.ID, 55))

	resp, err := gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret, resultWithGuests(matchID, host, guest), 0)
	require.NoError(t, err)
	resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	// Host's team placed 1st, guest's team 2nd.
	hostW, err := ts.Srv.Wallet.Get(ctx, host.ID)
	require.NoError(t, err)
	require.Equal(t, 55+wallet.CrystalPlace1/2, hostW.Crystal,
		"winner: 55 + HALF the place-1 grant — the fixture seats bots on his team (anti-farm)")
	guestW, err := ts.Srv.Wallet.Get(ctx, guest.ID)
	require.NoError(t, err)
	require.Equal(t, wallet.CrystalPlace2/2, guestW.Crystal,
		"second place: HALF the place-2 grant — same reason")

	// Every placement pays something: 「打場免費賺」 must hold for last place too.
	require.Positive(t, wallet.CrystalPlace4, "last place must still earn crystals")

	// The match record journals the ABSOLUTE post-match balances, and conjures
	// no entries for bots or couch guests.
	rec := readMatchRecord(t, ts, matchID)
	require.Equal(t, 55+wallet.CrystalPlace1/2, rec.Ratings[host.ID].Crystal)
	require.Equal(t, wallet.CrystalPlace2/2, rec.Ratings[guest.ID].Crystal)
	require.NotContains(t, rec.Ratings, "guest-77:p")
	require.NotContains(t, rec.Ratings, "bot-02")
}

// TestCrystalSettlementIdempotent: a duplicate result callback and a WAL replay
// must not mint a second grant. This is the property that makes settlement a
// safe place to grant a currency at all.
func TestCrystalSettlementIdempotent(t *testing.T) {
	testkit.Cover(t, "crystal-settle-idempotent")
	ts := testutil.New(t)
	ctx := context.Background()
	host, guest, _, matchID := startMatch(ts)
	res := resultWithGuests(matchID, host, guest)

	resp1, err := gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret, res, 0)
	require.NoError(t, err)
	resp1.Body.Close()
	require.Equal(t, http.StatusOK, resp1.StatusCode)
	w1, err := ts.Srv.Wallet.Get(ctx, host.ID)
	require.NoError(t, err)
	require.Equal(t, wallet.CrystalPlace1/2, w1.Crystal)

	// Duplicate callback: acknowledged, grants NOTHING again.
	resp2, err := gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret, res, 0)
	require.NoError(t, err)
	// map[string]any, not map[string]string: the ack now also carries the
	// numeric `settled` / `humanSeats` counts the game server logs (see
	// resultAck in callback.go — a bare {"status":"ok"} is what let a
	// zero-seat settlement pass for success).
	var body map[string]any
	require.NoError(t, json.NewDecoder(resp2.Body).Decode(&body))
	resp2.Body.Close()
	require.Equal(t, "duplicate", body["status"])
	w2, err := ts.Srv.Wallet.Get(ctx, host.ID)
	require.NoError(t, err)
	require.Equal(t, wallet.CrystalPlace1/2, w2.Crystal, "duplicate must not double-grant crystals")

	// Boot replay (WAL) converges to the same absolute balance too.
	require.NoError(t, ts.Srv.Journal.AppendIntent(matchID, readMatchRecord(t, ts, matchID)))
	require.NoError(t, ts.Srv.Boot(ctx))
	w3, err := ts.Srv.Wallet.Get(ctx, host.ID)
	require.NoError(t, err)
	require.Equal(t, wallet.CrystalPlace1/2, w3.Crystal, "WAL replay applies the absolute balance idempotently")
}

// TestLegacySettlementDoesNotWipeCrystals: match records written before the
// Crystal field existed decode with Crystal == 0. Replaying one must LEAVE the
// player's balance alone, not zero it — the whole point of Apply's `> 0` guard.
func TestLegacySettlementDoesNotWipeCrystals(t *testing.T) {
	testkit.Cover(t, "crystal-legacy-replay-safe")
	ts := testutil.New(t)
	ctx := context.Background()
	host, guest, _, matchID := startMatch(ts)

	resp, err := gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret, resultWithGuests(matchID, host, guest), 0)
	require.NoError(t, err)
	resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	// Rewrite the journalled record the way an older build would have: every
	// rating keeps its M COIN and points, but carries no crystal value.
	rec := readMatchRecord(t, ts, matchID)
	for id, r := range rec.Ratings {
		r.Crystal = 0
		rec.Ratings[id] = r
	}
	require.NoError(t, ts.Srv.Journal.AppendIntent(matchID, rec))
	require.NoError(t, ts.Srv.Boot(ctx))

	w, err := ts.Srv.Wallet.Get(ctx, host.ID)
	require.NoError(t, err)
	require.Equal(t, wallet.CrystalPlace1/2, w.Crystal,
		"replaying a pre-crystal settlement record must not wipe the balance")
}
