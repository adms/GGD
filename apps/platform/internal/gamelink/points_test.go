package gamelink_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/gamelink"
	"github.com/ggd/platform/internal/gamelink/gamelinktest"
	"github.com/ggd/platform/internal/ranking"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// resultWithChampions is the standard 4-team result with the champion each
// human seat played attached, so the per-champion boards get credited.
func resultWithChampions(matchID string, host, guest testutil.User, hostChamp, guestChamp string) gamelink.ResultRequest {
	res := result(matchID, host, guest)
	for i := range res.Seats {
		switch res.Seats[i].AccountID {
		case host.ID:
			res.Seats[i].ChampionID = hostChamp
		case guest.ID:
			res.Seats[i].ChampionID = guestChamp
		}
	}
	return res
}

// TestSettlementAwardsPoints is the end-to-end award: one ranked result credits
// the visible PLAYER board and the (account, champion) board of every human
// seat by team placement, alongside the untouched hidden MMR ladder.
func TestSettlementAwardsPoints(t *testing.T) {
	testkit.Cover(t, "rank-points-settlement")
	ts := testutil.New(t)
	ctx := context.Background()
	host, guest, _, matchID := startMatch(ts)

	resp, err := gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret,
		resultWithChampions(matchID, host, guest, "sela", "thorne"), 0)
	require.NoError(t, err)
	resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	// Account JSON is the durable truth: host placed 1st (+100), guest 2nd (+40).
	hostAcc, err := ts.Srv.Accounts.GetByID(ctx, host.ID)
	require.NoError(t, err)
	require.Equal(t, 100, hostAcc.SeasonPoints)
	require.Equal(t, 100, hostAcc.ChampionPoints["sela"])
	guestAcc, err := ts.Srv.Accounts.GetByID(ctx, guest.ID)
	require.NoError(t, err)
	require.Equal(t, 40, guestAcc.SeasonPoints)
	require.Equal(t, 40, guestAcc.ChampionPoints["thorne"])

	// Both visible boards agree with the record.
	rows, total, err := ts.Srv.Ranking.PlayerPage(ctx, "", 20, 0)
	require.NoError(t, err)
	require.EqualValues(t, 2, total)
	require.Equal(t, host.ID, rows[0].AccountID)
	require.Equal(t, 100, rows[0].Points)
	require.NotEmpty(t, rows[0].Tier)
	sela, _, err := ts.Srv.Ranking.ChampionPage(ctx, "sela", 20, 0)
	require.NoError(t, err)
	require.Len(t, sela, 1, "only the host played sela")
	require.Equal(t, 100, sela[0].Points)
	thorne, _, err := ts.Srv.Ranking.ChampionPage(ctx, "thorne", 20, 0)
	require.NoError(t, err)
	require.Len(t, thorne, 1)
	require.Equal(t, guest.ID, thorne[0].AccountID)
	require.Equal(t, 40, thorne[0].Points)

	// The hidden MMR ladder still moved, independently of the points track.
	require.Greater(t, hostAcc.MMR, 1000)
	require.Less(t, guestAcc.MMR, 1000)

	// The settlement record carries the ABSOLUTE cumulative points so a Redis
	// wipe (or a WAL replay) recovers exactly.
	rec := readMatchRecord(t, ts, matchID)
	require.Equal(t, 100, rec.Ratings[host.ID].Points)
	require.Equal(t, "sela", rec.Ratings[host.ID].ChampionID)
	require.Equal(t, 100, rec.Ratings[host.ID].ChampionPoints)
	require.Equal(t, 40, rec.Ratings[guest.ID].Points)
}

// TestPointsAccumulateAcrossMatches proves the ladder is CUMULATIVE (not
// zero-sum) across matches and floors at 0 after enough last places.
func TestPointsAccumulateAcrossMatches(t *testing.T) {
	testkit.Cover(t, "rank-points-cumulative")
	ts := testutil.New(t)
	ctx := context.Background()
	host, guest, _, matchID := startMatch(ts)

	// Match 1: host 1st (+100), guest 2nd (+40).
	resp, err := gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret,
		resultWithChampions(matchID, host, guest, "sela", "sela"), 0)
	require.NoError(t, err)
	resp.Body.Close()

	// Match 2 (same seats, fresh matchId): host 1st again, guest 2nd again.
	res2 := resultWithChampions(matchID+"-2", host, guest, "sela", "sela")
	resp, err = gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret, res2, 0)
	require.NoError(t, err)
	resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	hostAcc, err := ts.Srv.Accounts.GetByID(ctx, host.ID)
	require.NoError(t, err)
	require.Equal(t, 200, hostAcc.SeasonPoints, "100+100 accumulates across the season")
	require.Equal(t, 200, hostAcc.ChampionPoints["sela"])
	guestAcc, err := ts.Srv.Accounts.GetByID(ctx, guest.ID)
	require.NoError(t, err)
	require.Equal(t, 80, guestAcc.SeasonPoints)

	// Three last places (−30 each) drive the guest's 80 points below zero — the
	// floor holds it at 0.
	for i := 3; i <= 5; i++ {
		res := resultWithChampions(fmt.Sprintf("%s-%d", matchID, i), host, guest, "sela", "sela")
		// Flip placements: the guest's team finishes 4th.
		res.Placements = []gamelink.TeamPlace{{Team: 0, Place: 1}, {Team: 1, Place: 4}, {Team: 2, Place: 2}, {Team: 3, Place: 3}}
		resp, err := gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret, res, 0)
		require.NoError(t, err)
		resp.Body.Close()
	}
	guestAcc, err = ts.Srv.Accounts.GetByID(ctx, guest.ID)
	require.NoError(t, err)
	require.Equal(t, 0, guestAcc.SeasonPoints, "80−30−30−30 floors at 0, never negative")
	require.Equal(t, 0, guestAcc.ChampionPoints["sela"])

	rows, _, err := ts.Srv.Ranking.PlayerPage(ctx, "", 20, 0)
	require.NoError(t, err)
	require.Equal(t, host.ID, rows[0].AccountID)
	require.Equal(t, 500, rows[0].Points, "five wins = 500 points")
	require.Equal(t, guest.ID, rows[1].AccountID)
	require.Equal(t, 0, rows[1].Points)
	require.Equal(t, ranking.TierIron, rows[1].Tier)
	require.Equal(t, "IV", rows[1].Division)
}

// TestSettlementPointsIdempotent is the double-delivery regression: a duplicate
// callback (and a WAL-style re-apply of the stored settlement) awards points
// exactly once, because the record stores absolute cumulative values.
func TestSettlementPointsIdempotent(t *testing.T) {
	testkit.Cover(t, "rank-points-idempotent")
	ts := testutil.New(t)
	ctx := context.Background()
	host, guest, _, matchID := startMatch(ts)
	res := resultWithChampions(matchID, host, guest, "sela", "thorne")

	resp, err := gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret, res, 0)
	require.NoError(t, err)
	resp.Body.Close()

	// Duplicate delivery of the same matchId: acknowledged, awards nothing.
	resp, err = gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret, res, 0)
	require.NoError(t, err)
	var body map[string]string
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	resp.Body.Close()
	require.Equal(t, "duplicate", body["status"])

	hostAcc, err := ts.Srv.Accounts.GetByID(ctx, host.ID)
	require.NoError(t, err)
	require.Equal(t, 100, hostAcc.SeasonPoints, "duplicate callback must not double-award")
	require.Equal(t, 100, hostAcc.ChampionPoints["sela"])

	// WAL replay: re-applying the stored settlement converges on the same
	// absolute values instead of adding another +100.
	require.NoError(t, ts.Srv.Journal.AppendIntent(matchID, readMatchRecord(t, ts, matchID)))
	require.NoError(t, ts.Srv.Boot(ctx))

	hostAcc, err = ts.Srv.Accounts.GetByID(ctx, host.ID)
	require.NoError(t, err)
	require.Equal(t, 100, hostAcc.SeasonPoints, "replayed settlement must not double-award")
	require.Equal(t, 100, hostAcc.ChampionPoints["sela"])
	rows, total, err := ts.Srv.Ranking.PlayerPage(ctx, "", 20, 0)
	require.NoError(t, err)
	require.EqualValues(t, 2, total)
	require.Equal(t, 100, rows[0].Points)
	sela, _, err := ts.Srv.Ranking.ChampionPage(ctx, "sela", 20, 0)
	require.NoError(t, err)
	require.Equal(t, 100, sela[0].Points, "champion board is idempotent too")
}

// TestPointsSkipGuestsAndBots: only HUMAN, non-guest seats earn ladder points —
// the same rule the hidden MMR ladder uses.
func TestPointsSkipGuestsAndBots(t *testing.T) {
	testkit.Cover(t, "rank-points-guests-excluded")
	ts := testutil.New(t)
	ctx := context.Background()
	host, guest := ts.Register("host"), ts.Register("guest")

	r := ts.Do(http.MethodPost, "/api/v1/rooms", host.Access, map[string]string{"name": "Couch"})
	rid := r.Body["room"].(map[string]any)["id"].(string)
	require.Equal(t, http.StatusOK,
		ts.Do(http.MethodPatch, "/api/v1/rooms/"+rid+"/local-players", host.Access, map[string]int{"count": 2}).Status)
	ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/join", guest.Access, nil)
	ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/ready", guest.Access, map[string]bool{"ready": true})
	start := ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/start", host.Access, nil)
	require.Equal(t, http.StatusOK, start.Status, string(start.Raw))
	matchID := start.Body["matchId"].(string)

	guestID := host.ID + ":p2" // couch-guest pseudo-id: no account, earns nothing
	res := gamelink.ResultRequest{
		MatchID: matchID, Mode: "PairedDuels", MapID: "arena-default",
		Placements: []gamelink.TeamPlace{{Team: 0, Place: 1}, {Team: 1, Place: 2}, {Team: 2, Place: 3}, {Team: 3, Place: 4}},
		Seats: []gamelink.ResultSeat{
			{AccountID: host.ID, Team: 0, ChampionID: "sela"},
			{AccountID: guestID, Team: 0, ChampionID: "sela"},
			{AccountID: guest.ID, Team: 1, ChampionID: "thorne"},
			{AccountID: "bot-02", Team: 0, IsBot: true, ChampionID: "sela"},
			{AccountID: "bot-04", Team: 1, IsBot: true}, {AccountID: "bot-05", Team: 1, IsBot: true},
			{AccountID: "bot-06", Team: 2, IsBot: true}, {AccountID: "bot-07", Team: 2, IsBot: true},
			{AccountID: "bot-08", Team: 2, IsBot: true}, {AccountID: "bot-09", Team: 3, IsBot: true},
			{AccountID: "bot-10", Team: 3, IsBot: true}, {AccountID: "bot-11", Team: 3, IsBot: true},
		},
		EndedAt: time.Now().UnixMilli(),
	}
	resp, err := gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret, res, 0)
	require.NoError(t, err)
	resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	// The owner earns the +100 exactly once — not once per couch seat.
	hostAcc, err := ts.Srv.Accounts.GetByID(ctx, host.ID)
	require.NoError(t, err)
	require.Equal(t, 100, hostAcc.SeasonPoints)
	require.Equal(t, 100, hostAcc.ChampionPoints["sela"])

	// Neither the guest pseudo-id nor any bot reaches either board.
	rows, total, err := ts.Srv.Ranking.PlayerPage(ctx, "", 50, 0)
	require.NoError(t, err)
	require.EqualValues(t, 2, total, "two accounts on the board: the two humans")
	for _, row := range rows {
		require.NotContains(t, row.AccountID, ":p", "couch guests earn no ladder points")
		require.False(t, strings.HasPrefix(row.AccountID, "bot-"), "bots earn no ladder points")
	}
	sela, _, err := ts.Srv.Ranking.ChampionPage(ctx, "sela", 50, 0)
	require.NoError(t, err)
	require.Len(t, sela, 1, "the guest's and the bot's sela seats credit nobody")
	require.Equal(t, host.ID, sela[0].AccountID)
}
