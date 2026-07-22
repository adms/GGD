package gamelink_test

// Couch-play seam tests: guest seat generation (":pN" pseudo-ids) with
// same-team grouping, the seatTokens[] lobby push, and settlement skipping
// guests for MMR + M COIN.

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/gamelink"
	"github.com/ggd/platform/internal/gamelink/gamelinktest"
	"github.com/ggd/platform/internal/room"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

func TestGuestSeatsSameTeamGrouping(t *testing.T) {
	testkit.Cover(t, "couch-guest-seats")
	lookup := func(id string) (account.Account, error) {
		return account.Account{ID: id, Username: "u-" + id, MMR: 1200}, nil
	}

	// h brings 3 couch players, g brings 2, f is solo.
	members := []room.Member{
		{AccountID: "01H", LocalPlayers: 3},
		{AccountID: "01G", LocalPlayers: 2},
		{AccountID: "01F", LocalPlayers: 1},
	}
	seats, botFill := gamelink.BuildSeats(members, lookup, "normal")
	require.Len(t, seats, 12)
	require.Equal(t, 6, botFill.Count, "12 − 6 humans")

	byID := map[string]gamelink.Seat{}
	for _, s := range seats {
		byID[s.AccountID] = s
	}

	// Guest pseudo-ids exist with the right display names.
	require.Equal(t, "u-01H (2P)", byID["01H:p2"].DisplayName)
	require.Equal(t, "u-01H (3P)", byID["01H:p3"].DisplayName)
	require.Equal(t, "u-01G (2P)", byID["01G:p2"].DisplayName)
	require.False(t, byID["01H:p2"].IsBot, "guests are humans, not bots")

	// Couch groups stay on ONE team: h + guests fill a full team; g + guest
	// share a team (f slots into the remaining seat of g's team).
	require.Equal(t, byID["01H"].Team, byID["01H:p2"].Team)
	require.Equal(t, byID["01H"].Team, byID["01H:p3"].Team)
	require.Equal(t, byID["01G"].Team, byID["01G:p2"].Team)
	require.NotEqual(t, byID["01H"].Team, byID["01G"].Team)

	// Every team still has exactly 3 seats.
	perTeam := map[int]int{}
	for _, s := range seats {
		perTeam[s.Team]++
	}
	for team, n := range perTeam {
		require.Equal(t, 3, n, "team %d", team)
	}

	// Oversubscribed groups split only when no team has room: 6 duos = 12
	// humans; the last two duos must spill across the remaining free slots.
	duos := []room.Member{}
	for _, id := range []string{"01A", "01B", "01C", "01D", "01E", "01X"} {
		duos = append(duos, room.Member{AccountID: id, LocalPlayers: 2})
	}
	full, bf := gamelink.BuildSeats(duos, lookup, "normal")
	require.Len(t, full, 12)
	require.Zero(t, bf.Count)
	perTeam = map[int]int{}
	humanCount := 0
	for _, s := range full {
		require.False(t, s.IsBot)
		perTeam[s.Team]++
		humanCount++
	}
	require.Equal(t, 12, humanCount)
	for team, n := range perTeam {
		require.Equal(t, 3, n, "team %d", team)
	}
	// The first four duos are unsplit (first-fit puts each on its own team).
	fullByID := map[string]gamelink.Seat{}
	for _, s := range full {
		fullByID[s.AccountID] = s
	}
	for _, id := range []string{"01A", "01B", "01C", "01D"} {
		require.Equal(t, fullByID[id].Team, fullByID[id+":p2"].Team, "duo %s stays together", id)
	}
}

func TestSeatTokensArrayPush(t *testing.T) {
	testkit.Cover(t, "couch-seattokens-push")
	ts := testutil.New(t)
	host, guest := ts.Register("host"), ts.Register("guest")
	wsHost := ts.MustDialWS(host.Access)
	wsGuest := ts.MustDialWS(guest.Access)

	r := ts.Do(http.MethodPost, "/api/v1/rooms", host.Access, map[string]string{"name": "Couch"})
	rid := r.Body["room"].(map[string]any)["id"].(string)
	require.Equal(t, http.StatusOK,
		ts.Do(http.MethodPatch, "/api/v1/rooms/"+rid+"/local-players", host.Access, map[string]int{"count": 2}).Status)
	ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/join", guest.Access, nil)
	ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/ready", guest.Access, map[string]bool{"ready": true})
	start := ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/start", host.Access, nil)
	require.Equal(t, http.StatusOK, start.Status, string(start.Raw))
	matchID := start.Body["matchId"].(string)

	// The host machine gets an ARRAY of tokens: its own + its guest's.
	hostMsg, err := wsHost.ReadUntil(5*time.Second, func(m map[string]any) bool { return m["type"] == "match_ready" })
	require.NoError(t, err)
	require.Equal(t, matchID, hostMsg["matchId"])
	require.Equal(t, "seat-"+matchID+"-"+host.ID, hostMsg["seatToken"], "compat field stays the owner's token")
	tokens := hostMsg["seatTokens"].([]any)
	require.Len(t, tokens, 2)
	first := tokens[0].(map[string]any)
	second := tokens[1].(map[string]any)
	require.Equal(t, host.ID, first["accountId"], "owner entry first")
	require.Equal(t, "seat-"+matchID+"-"+host.ID, first["seatToken"])
	require.Equal(t, host.ID+":p2", second["accountId"], "guest pseudo-id entry")
	require.Equal(t, "seat-"+matchID+"-"+host.ID+":p2", second["seatToken"])

	// A solo member gets a single-entry array (and the compat field).
	guestMsg, err := wsGuest.ReadUntil(5*time.Second, func(m map[string]any) bool { return m["type"] == "match_ready" })
	require.NoError(t, err)
	guestTokens := guestMsg["seatTokens"].([]any)
	require.Len(t, guestTokens, 1)
	require.Equal(t, guest.ID, guestTokens[0].(map[string]any)["accountId"])
	require.Equal(t, "seat-"+matchID+"-"+guest.ID, guestMsg["seatToken"])

	// The reservation request itself carried the guest seat, non-bot, on the
	// host's team.
	reqs := ts.Node.Requests()
	require.Len(t, reqs, 1)
	var hostSeat, guestSeat *gamelink.Seat
	for i := range reqs[0].Seats {
		s := &reqs[0].Seats[i]
		if s.AccountID == host.ID {
			hostSeat = s
		}
		if s.AccountID == host.ID+":p2" {
			guestSeat = s
		}
	}
	require.NotNil(t, hostSeat)
	require.NotNil(t, guestSeat)
	require.False(t, guestSeat.IsBot)
	require.Equal(t, hostSeat.Team, guestSeat.Team, "couch guests join the owner's team")
	require.Equal(t, 9, reqs[0].BotFill.Count, "12 − 3 humans (2 couch + 1 solo)")
}

func TestSettlementSkipsGuests(t *testing.T) {
	testkit.Cover(t, "couch-settle-skips-guests")
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

	guestID := host.ID + ":p2"
	res := gamelink.ResultRequest{
		MatchID: matchID, Mode: "PairedDuels", MapID: "arena-default",
		Placements: []gamelink.TeamPlace{{Team: 0, Place: 1}, {Team: 1, Place: 2}, {Team: 2, Place: 3}, {Team: 3, Place: 4}},
		Seats: []gamelink.ResultSeat{
			// Host + couch guest win on team 0; solo member places 2nd.
			{AccountID: host.ID, Team: 0},
			{AccountID: guestID, Team: 0},
			{AccountID: guest.ID, Team: 1},
			{AccountID: "bot-02", Team: 0, IsBot: true},
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
	require.Equal(t, http.StatusOK, resp.StatusCode, "guest seats must not break settlement")

	// The owner earns MMR + M COIN exactly once (not once per couch player).
	hostAcc, err := ts.Srv.Accounts.GetByID(ctx, host.ID)
	require.NoError(t, err)
	require.Greater(t, hostAcc.MMR, 1000, "winner gains MMR")
	require.Equal(t, 1, hostAcc.Games)
	hostW, err := ts.Srv.Wallet.Get(ctx, host.ID)
	require.NoError(t, err)
	require.Equal(t, 200, hostW.MCoin, "one placement-1 reward, not two")

	// The guest pseudo-id earned NOTHING anywhere: no rating entry in the
	// match record, no account file, no history, no leaderboard row.
	rec := readMatchRecord(t, ts, matchID)
	require.Contains(t, rec.Ratings, host.ID)
	require.NotContains(t, rec.Ratings, guestID, "guests get no MMR")
	_, err = ts.Srv.Accounts.GetByID(ctx, guestID)
	require.Error(t, err, "no account is conjured for a guest (\":\" ids can't even exist in the store)")
	lines, err := ts.Srv.Store.ReadLines("history", guestID)
	if err == nil {
		require.Empty(t, lines, "no history for guests")
	}
	_, _, found, err := ts.Srv.Ranking.Me(ctx, guestID)
	require.NoError(t, err)
	require.False(t, found, "guests never enter the leaderboard")
}
