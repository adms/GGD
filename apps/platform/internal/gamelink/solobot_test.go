package gamelink_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/gamelink"
	"github.com/ggd/platform/internal/gamelink/gamelinktest"
	"github.com/ggd/platform/internal/room"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/internal/wallet"
	"github.com/ggd/platform/pkg/testkit"
)

// SOLO BOT MATCH (task #188) — the acceptance suite for 「play offline with bot
// 也要開放給有註冊的玩家在大廳一鍵開房直接玩」.
//
// The lobby already had a "Play vs bots" button and it was a lie: it joined the
// game-server directly, so no platform match existed — no record, no MMR, no
// 水晶, no ladder row. Eight accounts read games:0 next to 51 stored replays.
// These tests exist to make that specific failure impossible to reintroduce:
// the assertions are about the match COUNTING, not about a button existing.

// soloResult turns the seats the platform actually reserved (read back off the
// fake game-server) into the result callback that match would produce, with the
// player's own team winning. Deriving it from the reservation rather than
// hand-writing 12 seats is the point: if BuildSeats ever stops putting the
// human on the team this claims, the test notices.
func soloResult(t *testing.T, req gamelink.MatchRequest, playerID string) gamelink.ResultRequest {
	t.Helper()
	playerTeam := -1
	for _, s := range req.Seats {
		if s.AccountID == playerID {
			playerTeam = s.Team
		}
	}
	require.GreaterOrEqual(t, playerTeam, 0, "the reservation must seat the player")

	// Player's team first; the rest take 2..4 in team order.
	placements := []gamelink.TeamPlace{{Team: playerTeam, Place: 1}}
	place := 2
	for team := 0; team < gamelink.TotalSeats/3; team++ {
		if team == playerTeam {
			continue
		}
		placements = append(placements, gamelink.TeamPlace{Team: team, Place: place})
		place++
	}
	seats := make([]gamelink.ResultSeat, 0, len(req.Seats))
	for _, s := range req.Seats {
		seats = append(seats, gamelink.ResultSeat{AccountID: s.AccountID, Team: s.Team, IsBot: s.IsBot})
	}
	return gamelink.ResultRequest{
		MatchID: req.MatchID, Mode: req.Mode, MapID: req.MapID,
		Placements: placements, Seats: seats, EndedAt: time.Now().UnixMilli(),
	}
}

// startSolo presses the lobby's one button and returns (player, matchID).
func startSolo(ts *testutil.TS, name string, body any) (testutil.User, string) {
	ts.T.Helper()
	u := ts.Register(name)
	r := ts.Do(http.MethodPost, "/api/v1/rooms/solo", u.Access, body)
	require.Equal(ts.T, http.StatusOK, r.Status, string(r.Raw))
	return u, r.Body["matchId"].(string)
}

// TestSoloBotMatchIsARealMatch: one click reserves a real 12-seat match on the
// game server — one human, eleven bots — with the callback URL that is the only
// way a result can ever be settled. Without that URL this is the old debug
// shortcut with a nicer label.
func TestSoloBotMatchIsARealMatch(t *testing.T) {
	testkit.Cover(t, "solo-bot-real-match")
	ts := testutil.New(t)
	player, matchID := startSolo(ts, "solo", nil)

	reqs := ts.Node.Requests()
	require.Len(t, reqs, 1, "one click must reserve exactly one match on the game server")
	req := reqs[0]
	require.Equal(t, matchID, req.MatchID)
	require.Len(t, req.Seats, gamelink.TotalSeats, "a match is always 12 seats")
	require.Equal(t, 11, req.BotFill.Count, "one human, eleven bots")

	humans := []gamelink.Seat{}
	for _, s := range req.Seats {
		if !s.IsBot {
			humans = append(humans, s)
		}
	}
	require.Len(t, humans, 1)
	require.Equal(t, player.ID, humans[0].AccountID, "the seat belongs to the player, not a dev pseudo-id")

	// THE line that separates a match from a debug room.
	require.Equal(t, ts.Cfg.InternalURL+"/api/v1/internal/matches/"+matchID+"/result", req.CallbackURL)
}

// TestSoloBotMatchSettles is the whole point of the task: the match RECORDS,
// RATES, and pays the half-crystal rate the anti-farm rule already defines.
func TestSoloBotMatchSettles(t *testing.T) {
	testkit.Cover(t, "solo-bot-settles")
	ts := testutil.New(t)
	ctx := context.Background()
	player, matchID := startSolo(ts, "solo", nil)

	before, err := ts.Srv.Accounts.GetByID(ctx, player.ID)
	require.NoError(t, err)
	require.Equal(t, 0, before.Games, "fixture sanity: nothing played yet")

	res := soloResult(t, ts.Node.Requests()[0], player.ID)
	resp, err := gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret, res, 0)
	require.NoError(t, err)
	var ack map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&ack))
	resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.Equal(t, "ok", ack["status"])
	require.EqualValues(t, 1, ack["settled"], "the platform must credit the one human seat")

	// It COUNTS: a game played, a win recorded, a rating that moved.
	after, err := ts.Srv.Accounts.GetByID(ctx, player.ID)
	require.NoError(t, err)
	require.Equal(t, 1, after.Games, "a bot match must add to the games played")
	require.Equal(t, 1, after.Wins)
	require.Positive(t, after.SeasonPoints, "the ladder row is the visible half of 'it counted'")
	// HIDDEN MMR IS DELIBERATELY UNMOVED, and this is not the anti-farm rule —
	// it falls out of Elo itself (ranking/elo.go: fewer than two teams holding a
	// human is not a rated contest). Beating eleven bots says nothing about how
	// this player ranks against his family, so the number that MATCHES him
	// against them must not move. Games, wins, season points and crystals all
	// do. Asserted rather than left implicit, because "it counted" and "it
	// changed your matchmaking rating" are different promises.
	require.Equal(t, before.MMR, after.MMR,
		"a match with no rated opponent must not move the hidden matchmaking rating")

	// It PAYS, at the x1 floor: one human in the lobby means no multiplier.
	w, err := ts.Srv.Wallet.Get(ctx, player.ID)
	require.NoError(t, err)
	require.Equal(t, wallet.CrystalPlace1, w.Crystal,
		"soloing bots pays the BASE grant with no lobby multiplier (owner 2026-08-17: 「120 (N=1)」)")
	require.Positive(t, w.Crystal, "…but it must still pay something: 「打場免費賺」")
	require.Equal(t, 0, w.MCoin, "M幣 needs an all-human lobby; a bot match can never mint one")

	// And it is on the record, which is what "it happened" means here.
	rec := readMatchRecord(t, ts, matchID)
	require.Equal(t, "completed", rec.Status)
	require.Contains(t, rec.Ratings, player.ID)
	require.Equal(t, wallet.CrystalPlace1, rec.Ratings[player.ID].Crystal)
}

// TestSoloBotMatchIsOneClick: the player presses one button and the seat token
// arrives on the lobby WS — the same push a normal room start sends, so the
// client enters the match through the path it already has. No room to create,
// no ready-up, no lobby detour. (Champion select is not skipped: it happens
// INSIDE the match on the game-server's 40s timer, which is what keeps #130's
// spawn-dead trap closed.)
func TestSoloBotMatchIsOneClick(t *testing.T) {
	testkit.Cover(t, "solo-bot-one-click")
	ts := testutil.New(t)
	player := ts.Register("solo")
	ws := ts.MustDialWS(player.Access)

	r := ts.Do(http.MethodPost, "/api/v1/rooms/solo", player.Access, nil)
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	matchID := r.Body["matchId"].(string)
	require.EqualValues(t, 11, r.Body["botFill"])

	msg, err := ws.ReadUntil(5*time.Second, func(m map[string]any) bool { return m["type"] == "match_ready" })
	require.NoError(t, err, "one click must deliver a seat token, or the player sits in the lobby forever")
	require.Equal(t, matchID, msg["matchId"])
	require.Equal(t, "seat-"+matchID+"-"+player.ID, msg["seatToken"])
	require.NotEmpty(t, msg["endpoint"])

	// Optional refinements still ride the same one click.
	r = ts.Do(http.MethodPost, "/api/v1/rooms/solo", player.Access,
		map[string]string{"mapId": "arena-lava", "botDifficulty": "hard"})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	reqs := ts.Node.Requests()
	last := reqs[len(reqs)-1]
	require.Equal(t, "arena-lava", last.MapID)
	require.Equal(t, "hard", last.BotFill.Difficulty)
}

// TestSoloBotRoomIsNotAdvertised: the solo room exists for the milliseconds
// between create and start. Listing it would let a stranger join in that window
// and be dragged into somebody else's solo match.
func TestSoloBotRoomIsNotAdvertised(t *testing.T) {
	testkit.Cover(t, "solo-bot-unlisted")
	ts := testutil.New(t)
	player, _ := startSolo(ts, "solo", nil)

	r := ts.Do(http.MethodGet, "/api/v1/lobby/rooms", player.Access, nil)
	require.Equal(t, http.StatusOK, r.Status)
	require.Empty(t, r.Body["rooms"].([]any), "a solo bot room must never appear in the lobby browser")

	members, _ := ts.Mini.ZMembers(redisx.KeyRoomsOpen())
	require.Empty(t, members)
}

// TestSoloBotMatchHeartbeats: the #187 reaper renews a platform match's deadline
// from game-server heartbeats. A solo match is a platform match, so it must be
// renewable by id — otherwise the owner's bot game is torn down mid-play and
// stamped ABANDONED, which is the failure this repo just finished removing.
func TestSoloBotMatchHeartbeats(t *testing.T) {
	testkit.Cover(t, "solo-bot-liveness")
	ts := testutil.New(t)
	ctx := context.Background()
	_, matchID := startSolo(ts, "solo", nil)

	// The pending record the reaper reads, with the Colyseus room id that lets
	// a room-keyed beat resolve to this match.
	gameRoomID, err := ts.Srv.Rdb.R.HGet(ctx, redisx.KeyMatchPending(matchID), "gameRoomId").Result()
	require.NoError(t, err)
	require.NotEmpty(t, gameRoomID)

	// A long solo match, still beating well past the BLIND deadline: this is the
	// owner playing 8-life bot games, which run ~34 minutes against a 30-minute
	// blind deadline. The beat must be what decides, or the game is torn down
	// mid-play and stamped ABANDONED.
	stillPlaying := time.Now().Add(ts.Cfg.MatchPendingTTL + 5*time.Minute)
	ack, err := ts.Srv.Gamelink.Heartbeat(ctx, []string{matchID}, stillPlaying)
	require.NoError(t, err)
	require.Equal(t, []string{matchID}, ack.Renewed, "a solo match must be renewable like any other")
	require.Empty(t, ack.Unknown)

	reaped, err := ts.Srv.Gamelink.ReapStuck(ctx, stillPlaying.Add(time.Minute))
	require.NoError(t, err)
	require.Empty(t, reaped, "a heartbeating solo match must not be reaped mid-play")

	// …and when the beats stop, it is reaped like anything else.
	reaped, err = ts.Srv.Gamelink.ReapStuck(ctx, stillPlaying.Add(time.Hour))
	require.NoError(t, err)
	require.Equal(t, []string{matchID}, reaped)
}

// TestSoloBotMatchNeedsAnAccount: 有註冊的玩家. The gate is the router's
// (authed + PlayableOnly), not the button's — a client-side check is decoration.
func TestSoloBotMatchNeedsAnAccount(t *testing.T) {
	testkit.Cover(t, "solo-bot-registered-only")
	ts := testutil.New(t)

	r := ts.Do(http.MethodPost, "/api/v1/rooms/solo", "", nil)
	require.Equal(t, http.StatusUnauthorized, r.Status, "a visitor with no account gets nothing: %s", string(r.Raw))
	r = ts.Do(http.MethodPost, "/api/v1/rooms/solo", "not-a-real-token", nil)
	require.Equal(t, http.StatusUnauthorized, r.Status, string(r.Raw))
	require.Empty(t, ts.Node.Requests(), "no match may be reserved for an unauthenticated caller")
}

// TestSoloBotRoomNameIsHonest: the room is created with a name, so the pending
// set and the match record say what this match was instead of showing a blank.
func TestSoloBotRoomNameIsHonest(t *testing.T) {
	ts := testutil.New(t)
	ctx := context.Background()
	_, matchID := startSolo(ts, "solo", nil)

	roomID, err := ts.Srv.Rdb.R.HGet(ctx, redisx.KeyMatchPending(matchID), "roomId").Result()
	require.NoError(t, err)
	rm, err := ts.Srv.Rooms.Get(ctx, roomID)
	require.NoError(t, err)
	require.Equal(t, room.SoloRoomName, rm.Name)
	require.Equal(t, room.StatusInMatch, rm.Status)
}
