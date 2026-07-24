package gamelink_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/gamelink"
	"github.com/ggd/platform/internal/gamelink/gamelinktest"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// resultWithGuests builds a completed result where the host's team wins and
// two non-bot guest seats (a ":p" provisional id and an unknown account id)
// fill teams 2 and 3.
func resultWithGuests(matchID string, host, guest testutil.User) gamelink.ResultRequest {
	return gamelink.ResultRequest{
		MatchID: matchID, Mode: "PairedDuels", MapID: "arena-default",
		Placements: []gamelink.TeamPlace{{Team: 0, Place: 1}, {Team: 1, Place: 2}, {Team: 2, Place: 3}, {Team: 3, Place: 4}},
		Seats: []gamelink.ResultSeat{
			{AccountID: host.ID, Team: 0}, {AccountID: guest.ID, Team: 1},
			// Guests: NOT bots, but must not earn (":p" suffix / no account).
			{AccountID: "guest-77:p", Team: 2},
			{AccountID: "01NOSUCHACCOUNT0000000000X", Team: 3},
			{AccountID: "bot-02", Team: 0, IsBot: true}, {AccountID: "bot-03", Team: 0, IsBot: true},
			{AccountID: "bot-04", Team: 1, IsBot: true}, {AccountID: "bot-05", Team: 1, IsBot: true},
			{AccountID: "bot-06", Team: 2, IsBot: true}, {AccountID: "bot-07", Team: 2, IsBot: true},
			{AccountID: "bot-08", Team: 3, IsBot: true}, {AccountID: "bot-09", Team: 3, IsBot: true},
		},
		EndedAt: time.Now().UnixMilli(),
	}
}

func TestEarnOnSettlement(t *testing.T) {
	testkit.Cover(t, "mcoin-earn-settlement")
	ts := testutil.New(t)
	ctx := context.Background()
	host, guest, _, matchID := startMatch(ts)

	// Pre-existing balance: rewards ADD to it (host starts at 500).
	require.NoError(t, ts.Srv.Wallet.SetMCoinAbsolute(ctx, host.ID, 500))

	resp, err := gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret, resultWithGuests(matchID, host, guest), 0)
	require.NoError(t, err)
	resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode, "guest seats must not break settlement")

	// Fixture rewards: placement1=200, placement2=120.
	hostW, err := ts.Srv.Wallet.Get(ctx, host.ID)
	require.NoError(t, err)
	// NOTE: every fixture in this file is a BOT lobby (2 humans + 10 bots), and
	// M幣 now requires an ALL-HUMAN 12-seat lobby (owner: 「全部玩家位置都真人
	// 才有 M幣」). So the balance must not move at all. These assertions used to
	// read 700 = 500 + a 200-per-placement grant; that table minted M COIN every
	// match, which contradicted #118's own 「後台發放的造型幣（非購買）」 premise.
	// The grant is now ONE coin, first place, perfect lobby only.
	require.Equal(t, 500, hostW.MCoin, "bot lobby: balance untouched, no M幣")
	guestW, err := ts.Srv.Wallet.Get(ctx, guest.ID)
	require.NoError(t, err)
	require.Equal(t, 0, guestW.MCoin, "bot lobby: second place earns nothing either")

	// The match record stores the ABSOLUTE post-match balances and has no
	// rating entries for guests; no guest account file was conjured up.
	rec := readMatchRecord(t, ts, matchID)
	require.Equal(t, 500, rec.Ratings[host.ID].MCoin)
	require.Equal(t, 0, rec.Ratings[guest.ID].MCoin)
	require.NotContains(t, rec.Ratings, "guest-77:p")
	require.NotContains(t, rec.Ratings, "01NOSUCHACCOUNT0000000000X")
	_, err = ts.Srv.Accounts.GetByID(ctx, "01NOSUCHACCOUNT0000000000X")
	require.ErrorIs(t, err, account.ErrNotFound)
}

func TestSettlementIdempotentMCoin(t *testing.T) {
	testkit.Cover(t, "mcoin-settle-idempotent")
	ts := testutil.New(t)
	ctx := context.Background()
	host, guest, _, matchID := startMatch(ts)
	require.NoError(t, ts.Srv.Wallet.SetMCoinAbsolute(ctx, host.ID, 500))
	res := resultWithGuests(matchID, host, guest)

	resp1, err := gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret, res, 0)
	require.NoError(t, err)
	resp1.Body.Close()
	require.Equal(t, http.StatusOK, resp1.StatusCode)
	w1, err := ts.Srv.Wallet.Get(ctx, host.ID)
	require.NoError(t, err)
	require.Equal(t, 500, w1.MCoin)

	// Duplicate callback: acknowledged, grants NOTHING again.
	resp2, err := gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret, res, 0)
	require.NoError(t, err)
	// map[string]any: the result ack also carries the numeric settled/humanSeats
	// counts (resultAck in callback.go).
	var body map[string]any
	require.NoError(t, json.NewDecoder(resp2.Body).Decode(&body))
	resp2.Body.Close()
	require.Equal(t, "duplicate", body["status"])
	w2, err := ts.Srv.Wallet.Get(ctx, host.ID)
	require.NoError(t, err)
	require.Equal(t, 500, w2.MCoin, "duplicate must not double-grant M COIN")

	// Boot replay (WAL) converges to the same absolute balance too.
	require.NoError(t, ts.Srv.Journal.AppendIntent(matchID, readMatchRecord(t, ts, matchID)))
	require.NoError(t, ts.Srv.Boot(ctx))
	w3, err := ts.Srv.Wallet.Get(ctx, host.ID)
	require.NoError(t, err)
	require.Equal(t, 500, w3.MCoin, "WAL replay applies the absolute balance idempotently")
}

// readMatchRecord loads the settled match JSON truth.
func readMatchRecord(t *testing.T, ts *testutil.TS, matchID string) gamelink.Settlement {
	t.Helper()
	var rec gamelink.Settlement
	require.NoError(t, ts.Srv.Store.Get(gamelink.MatchCollection(time.Now()), matchID, &rec))
	return rec
}
