package gamelink_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/gamelink"
	"github.com/ggd/platform/internal/gamelink/gamelinktest"
	"github.com/ggd/platform/internal/presence"
	"github.com/ggd/platform/internal/room"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/internal/wallet"
	"github.com/ggd/platform/pkg/testkit"
)

// startMatch drives the full happy path: two humans, room, ready, start.
// Returns (host, guest, roomID, matchID).
func startMatch(ts *testutil.TS) (testutil.User, testutil.User, string, string) {
	t := ts.T
	t.Helper()
	host, guest := ts.Register("host"), ts.Register("guest")
	r := ts.Do(http.MethodPost, "/api/v1/rooms", host.Access, map[string]string{"name": "Seam"})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	rid := r.Body["room"].(map[string]any)["id"].(string)
	require.Equal(t, http.StatusOK, ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/join", guest.Access, nil).Status)
	require.Equal(t, http.StatusOK, ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/ready", guest.Access, map[string]bool{"ready": true}).Status)
	r = ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/start", host.Access, nil)
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	return host, guest, rid, r.Body["matchId"].(string)
}

// result builds a completed 4-team result where the host's team wins.
func result(matchID string, host, guest testutil.User) gamelink.ResultRequest {
	return gamelink.ResultRequest{
		MatchID: matchID, Mode: "PairedDuels", MapID: "arena-default",
		Placements: []gamelink.TeamPlace{{Team: 0, Place: 1}, {Team: 1, Place: 2}, {Team: 2, Place: 3}, {Team: 3, Place: 4}},
		Seats: []gamelink.ResultSeat{
			// Host's team wins (place 1); guest's team comes second.
			{AccountID: host.ID, Team: 0}, {AccountID: guest.ID, Team: 1},
			{AccountID: "bot-02", Team: 0, IsBot: true},
			{AccountID: "bot-03", Team: 0, IsBot: true}, {AccountID: "bot-04", Team: 1, IsBot: true},
			{AccountID: "bot-05", Team: 1, IsBot: true}, {AccountID: "bot-06", Team: 2, IsBot: true},
			{AccountID: "bot-07", Team: 2, IsBot: true}, {AccountID: "bot-08", Team: 2, IsBot: true},
			{AccountID: "bot-09", Team: 3, IsBot: true}, {AccountID: "bot-10", Team: 3, IsBot: true},
			{AccountID: "bot-11", Team: 3, IsBot: true},
		},
		EndedAt: time.Now().UnixMilli(),
	}
}

func TestTeamsAndBotCount(t *testing.T) {
	testkit.Cover(t, "seam-teams-botcount")
	lookup := func(id string) (account.Account, error) {
		return account.Account{ID: id, Username: "u-" + id, MMR: 1050}, nil
	}
	members := []room.Member{{AccountID: "01B"}, {AccountID: "01A"}, {AccountID: "01C"}, {AccountID: "01D"}, {AccountID: "01E"}}
	seats, botFill := gamelink.BuildSeats(members, lookup, "hard")

	require.Len(t, seats, 12, "always exactly 12 seats")
	require.Equal(t, 7, botFill.Count, "botFill = 12 − humans")
	require.Equal(t, "hard", botFill.Difficulty)

	humans, bots := 0, 0
	for i, s := range seats {
		require.Equal(t, i/3, s.Team, "teams fill 3 at a time")
		require.Equal(t, i%3, s.Slot)
		if s.IsBot {
			bots++
		} else {
			humans++
			require.Equal(t, 1050, s.MMR)
		}
	}
	require.Equal(t, 5, humans)
	require.Equal(t, 7, bots)
	// Humans are assigned deterministically in ULID order.
	require.Equal(t, "01A", seats[0].AccountID)
	require.Equal(t, "01E", seats[4].AccountID)
	// Full lobby ⇒ zero bots.
	var full []room.Member
	for i := 0; i < 12; i++ {
		full = append(full, room.Member{AccountID: fmt.Sprintf("01H%02d", i)})
	}
	_, bf := gamelink.BuildSeats(full, lookup, "normal")
	require.Zero(t, bf.Count)
}

func TestReserveAcceptedByFakeNode(t *testing.T) {
	testkit.Cover(t, "seam-reserve-ok")
	ts := testutil.New(t)
	host, guest, _, matchID := startMatch(ts)

	reqs := ts.Node.Requests()
	require.Len(t, reqs, 1, "fake node accepted exactly one HMAC-signed request")
	require.Zero(t, ts.Node.Rejected())
	req := reqs[0]
	require.Equal(t, matchID, req.MatchID)
	require.Equal(t, "PairedDuels", req.Mode)
	require.Len(t, req.Seats, 12)
	require.Equal(t, 10, req.BotFill.Count)
	require.Contains(t, req.CallbackURL, "/api/v1/internal/matches/"+matchID+"/result")

	humanIDs := map[string]bool{}
	for _, s := range req.Seats {
		if !s.IsBot {
			humanIDs[s.AccountID] = true
		}
	}
	require.Equal(t, map[string]bool{host.ID: true, guest.ID: true}, humanIDs)
}

func TestHMACRejected(t *testing.T) {
	testkit.Cover(t, "seam-hmac-reject")
	ts := testutil.New(t)
	host, guest, _, matchID := startMatch(ts)
	res := result(matchID, host, guest)
	body, _ := json.Marshal(res)

	url := ts.HTTP.URL + "/api/v1/internal/matches/" + matchID + "/result"
	post := func(mutate func(*http.Request)) int {
		req, err := http.NewRequest(http.MethodPost, url, strings.NewReader(string(body)))
		require.NoError(t, err)
		mutate(req)
		resp, err := http.DefaultClient.Do(req)
		require.NoError(t, err)
		defer resp.Body.Close()
		_, _ = io.Copy(io.Discard, resp.Body)
		return resp.StatusCode
	}
	ts0 := strconv.FormatInt(time.Now().Unix(), 10)

	// Absent headers.
	require.Equal(t, http.StatusUnauthorized, post(func(r *http.Request) {}))
	// Wrong secret.
	require.Equal(t, http.StatusUnauthorized, post(func(r *http.Request) {
		r.Header.Set(gamelink.HeaderTimestamp, ts0)
		r.Header.Set(gamelink.HeaderAuth, gamelink.Sign("wrong-secret", ts0, body))
	}))
	// Signature over a different body (tamper).
	require.Equal(t, http.StatusUnauthorized, post(func(r *http.Request) {
		r.Header.Set(gamelink.HeaderTimestamp, ts0)
		r.Header.Set(gamelink.HeaderAuth, gamelink.Sign(testutil.GameSecret, ts0, []byte(`{"matchId":"other"}`)))
	}))
	// Garbage signature.
	require.Equal(t, http.StatusUnauthorized, post(func(r *http.Request) {
		r.Header.Set(gamelink.HeaderTimestamp, ts0)
		r.Header.Set(gamelink.HeaderAuth, "zzzz-not-hex")
	}))

	// Outbound direction: the fake node rejects a bad signature too.
	req, _ := http.NewRequest(http.MethodPost, ts.Node.URL()+"/_internal/matches", strings.NewReader("{}"))
	req.Header.Set(gamelink.HeaderTimestamp, ts0)
	req.Header.Set(gamelink.HeaderAuth, "bogus")
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	resp.Body.Close()
	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	require.Equal(t, 1, ts.Node.Rejected())

	// And nothing was settled by any of the rejects.
	require.False(t, ts.Mini.Exists("match:result:done:"+matchID))
}

func TestReplaySkewRejected(t *testing.T) {
	testkit.Cover(t, "seam-replay-skew")
	ts := testutil.New(t)
	host, guest, _, matchID := startMatch(ts)
	res := result(matchID, host, guest)

	// 60s in the past: outside the 30s skew guard.
	resp, err := gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret, res, time.Now().Add(-60*time.Second).Unix())
	require.NoError(t, err)
	resp.Body.Close()
	require.Equal(t, http.StatusUnauthorized, resp.StatusCode, "stale timestamp must be rejected (replay defense)")

	// 60s in the future is equally invalid.
	resp, err = gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret, res, time.Now().Add(60*time.Second).Unix())
	require.NoError(t, err)
	resp.Body.Close()
	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)

	// Fresh timestamp passes.
	resp, err = gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret, res, 0)
	require.NoError(t, err)
	resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestSeatTokenPush(t *testing.T) {
	testkit.Cover(t, "seam-seat-token-push")
	ts := testutil.New(t)
	host, guest := ts.Register("host"), ts.Register("guest")
	wsHost := ts.MustDialWS(host.Access)
	wsGuest := ts.MustDialWS(guest.Access)

	r := ts.Do(http.MethodPost, "/api/v1/rooms", host.Access, map[string]string{"name": "Seam"})
	rid := r.Body["room"].(map[string]any)["id"].(string)
	ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/join", guest.Access, nil)
	ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/ready", guest.Access, map[string]bool{"ready": true})
	start := ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/start", host.Access, nil)
	require.Equal(t, http.StatusOK, start.Status, string(start.Raw))
	matchID := start.Body["matchId"].(string)

	// Each human receives its OWN seat token over its own WS.
	hostMsg, err := wsHost.ReadUntil(5*time.Second, func(m map[string]any) bool { return m["type"] == "match_ready" })
	require.NoError(t, err)
	guestMsg, err := wsGuest.ReadUntil(5*time.Second, func(m map[string]any) bool { return m["type"] == "match_ready" })
	require.NoError(t, err)

	require.Equal(t, matchID, hostMsg["matchId"])
	require.Equal(t, matchID, guestMsg["matchId"])
	require.Equal(t, "seat-"+matchID+"-"+host.ID, hostMsg["seatToken"])
	require.Equal(t, "seat-"+matchID+"-"+guest.ID, guestMsg["seatToken"])
	require.NotEqual(t, hostMsg["seatToken"], guestMsg["seatToken"])
	require.NotEmpty(t, hostMsg["endpoint"])
}

func TestResultHMACAccepted(t *testing.T) {
	testkit.Cover(t, "seam-result-hmac")
	ts := testutil.New(t)
	host, guest, _, matchID := startMatch(ts)

	resp, err := gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret, result(matchID, host, guest), 0)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)
	// map[string]any: the result ack also carries the numeric settled/humanSeats
	// counts (resultAck in callback.go).
	var body map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	require.Equal(t, "ok", body["status"])
	require.True(t, ts.Mini.Exists("match:result:done:"+matchID))
}

func TestResultIdempotent(t *testing.T) {
	testkit.Cover(t, "seam-result-idempotent")
	ts := testutil.New(t)
	host, guest, _, matchID := startMatch(ts)
	res := result(matchID, host, guest)

	resp1, err := gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret, res, 0)
	require.NoError(t, err)
	resp1.Body.Close()
	require.Equal(t, http.StatusOK, resp1.StatusCode)

	after1, err := ts.Srv.Accounts.GetByID(context.Background(), host.ID)
	require.NoError(t, err)

	// Duplicate delivery: acknowledged as duplicate, changes NOTHING.
	resp2, err := gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret, res, 0)
	require.NoError(t, err)
	// map[string]any: the result ack also carries the numeric settled/humanSeats
	// counts (resultAck in callback.go).
	var body map[string]any
	require.NoError(t, json.NewDecoder(resp2.Body).Decode(&body))
	resp2.Body.Close()
	require.Equal(t, "duplicate", body["status"])

	after2, err := ts.Srv.Accounts.GetByID(context.Background(), host.ID)
	require.NoError(t, err)
	require.Equal(t, after1.MMR, after2.MMR, "duplicate must not re-apply MMR")
	require.Equal(t, after1.Games, after2.Games, "duplicate must not re-count games")

	// History holds exactly one line for the match.
	lines, err := ts.Srv.Store.ReadLines("history", host.ID)
	require.NoError(t, err)
	require.Len(t, lines, 1)
}

func TestResultPersists(t *testing.T) {
	testkit.Cover(t, "seam-result-persist")
	ts := testutil.New(t)
	host, guest, _, matchID := startMatch(ts)
	res := result(matchID, host, guest)
	resp, err := gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret, res, 0)
	require.NoError(t, err)
	resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	// Match JSON truth at data/matches/YYYY/MM/<matchId>.json.
	now := time.Now().UTC()
	path := filepath.Join(ts.Cfg.DataDir, "matches",
		fmt.Sprintf("%04d", now.Year()), fmt.Sprintf("%02d", int(now.Month())), matchID+".json")
	data, err := os.ReadFile(path)
	require.NoError(t, err, "match record must exist at %s", path)
	var rec gamelink.Settlement
	require.NoError(t, json.Unmarshal(data, &rec))
	require.Equal(t, matchID, rec.MatchID)
	require.Equal(t, "completed", rec.Status)
	require.Len(t, rec.Seats, 12)
	require.Contains(t, rec.Ratings, host.ID, "record stores ABSOLUTE post-match MMR")

	// History appended for both humans.
	for _, u := range []testutil.User{host, guest} {
		lines, err := ts.Srv.Store.ReadLines("history", u.ID)
		require.NoError(t, err)
		require.Len(t, lines, 1)
		require.Contains(t, string(lines[0]), matchID)
	}

	// WAL has intent + commit for the match.
	logs, err := filepath.Glob(filepath.Join(ts.Cfg.DataDir, "journal", "*.log"))
	require.NoError(t, err)
	require.NotEmpty(t, logs)
	journal, err := os.ReadFile(logs[0])
	require.NoError(t, err)
	require.Contains(t, string(journal), `"stage":"intent"`)
	require.Contains(t, string(journal), `"stage":"commit"`)
}

func TestResultUpdatesRanking(t *testing.T) {
	testkit.Cover(t, "seam-result-ranking")
	ts := testutil.New(t)
	ctx := context.Background()
	host, guest, _, matchID := startMatch(ts)

	resp, err := gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret, result(matchID, host, guest), 0)
	require.NoError(t, err)
	resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	// The host's team won, the guest's placed second: winner gains MMR,
	// loser drops — absolutely, in account JSON.
	hostAcc, err := ts.Srv.Accounts.GetByID(ctx, host.ID)
	require.NoError(t, err)
	require.Greater(t, hostAcc.MMR, 1000)
	require.Equal(t, 1, hostAcc.Games)
	require.Equal(t, 1, hostAcc.Wins)
	guestAcc, err := ts.Srv.Accounts.GetByID(ctx, guest.ID)
	require.NoError(t, err)
	require.Less(t, guestAcc.MMR, 1000)
	require.Zero(t, guestAcc.Wins)

	// Leaderboard ZSET matches the account truth.
	_, mmr, found, err := ts.Srv.Ranking.Me(ctx, host.ID)
	require.NoError(t, err)
	require.True(t, found)
	require.Equal(t, hostAcc.MMR, mmr)

	// Presence returned to the lobby.
	st, err := ts.Srv.Presence.Get(ctx, host.ID)
	require.NoError(t, err)
	require.Equal(t, presence.StateInLobby, st)
}

func TestReaper(t *testing.T) {
	testkit.Cover(t, "seam-reaper")
	ts := testutil.New(t)
	ctx := context.Background()
	host, guest, rid, matchID := startMatch(ts)

	// Before the deadline: nothing to reap.
	reaped, err := ts.Srv.Gamelink.ReapStuck(ctx, time.Now())
	require.NoError(t, err)
	require.Empty(t, reaped)

	// Past the pending TTL: the match is reaped as abandoned.
	future := time.Now().Add(ts.Cfg.MatchPendingTTL + time.Minute)
	reaped, err = ts.Srv.Gamelink.ReapStuck(ctx, future)
	require.NoError(t, err)
	require.Equal(t, []string{matchID}, reaped)

	// Abandoned record written; pending keys gone; room disposed.
	col := filepath.Join(ts.Cfg.DataDir, "matches",
		fmt.Sprintf("%04d", future.UTC().Year()), fmt.Sprintf("%02d", int(future.UTC().Month())))
	data, err := os.ReadFile(filepath.Join(col, matchID+".json"))
	require.NoError(t, err)
	require.Contains(t, string(data), `"abandoned"`)
	require.False(t, ts.Mini.Exists("match:pending:"+matchID))
	require.False(t, ts.Mini.Exists("room:"+rid))

	// Humans are back in the lobby, MMR untouched.
	st, _ := ts.Srv.Presence.Get(ctx, host.ID)
	require.Equal(t, presence.StateInLobby, st)
	acc, _ := ts.Srv.Accounts.GetByID(ctx, host.ID)
	require.Equal(t, 1000, acc.MMR)
	require.Zero(t, acc.Games)

	// A late result callback after reaping is treated as a duplicate.
	resp, err := gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret, result(matchID, host, guest), 0)
	require.NoError(t, err)
	// map[string]any: the result ack also carries the numeric settled/humanSeats
	// counts (resultAck in callback.go).
	var body map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	resp.Body.Close()
	require.Equal(t, "duplicate", body["status"])
	acc, _ = ts.Srv.Accounts.GetByID(ctx, host.ID)
	require.Zero(t, acc.Games, "late result must not settle an abandoned match")
}

func TestInternalRouteNotPublic(t *testing.T) {
	testkit.Cover(t, "seam-internal-private")
	ts := testutil.New(t)
	u := ts.Register("alice")

	// The game server's /_internal surface does not exist on the platform:
	// nothing an edge-proxied client can reach.
	for _, path := range []string{"/_internal/matches", "/_internal", "/api/v1/_internal/matches"} {
		r := ts.Do(http.MethodPost, path, u.Access, map[string]string{})
		require.Equal(t, http.StatusNotFound, r.Status, "%s must not exist on the platform", path)
	}

	// The platform's own internal callback is HMAC-only: a valid USER access
	// token grants nothing.
	r := ts.Do(http.MethodPost, "/api/v1/internal/matches/m_x/result", u.Access, map[string]any{"matchId": "m_x"})
	require.Equal(t, http.StatusUnauthorized, r.Status, "bearer tokens must not satisfy the internal HMAC guard")
	// And unauthenticated requests are rejected outright.
	r = ts.Do(http.MethodPost, "/api/v1/internal/matches/m_x/result", "", map[string]any{"matchId": "m_x"})
	require.Equal(t, http.StatusUnauthorized, r.Status)
}

// TestWALReplayOnBoot: crash between apply-start and commit ⇒ boot replays
// the intent idempotently (absolute MMR).
func TestWALReplayOnBoot(t *testing.T) {
	ts := testutil.New(t)
	ctx := context.Background()
	host, guest, _, matchID := startMatch(ts)
	res := result(matchID, host, guest)

	// Simulate a crash: journal the intent but never apply/commit.
	st := gamelink.Settlement{
		MatchID: matchID, Mode: "PairedDuels", Status: "completed",
		Placements: res.Placements, Seats: res.Seats,
		Ratings: map[string]gamelink.RatingAfter{
			host.ID:  {MMR: 1016, Games: 1, Wins: 1},
			guest.ID: {MMR: 1016, Games: 1, Wins: 1},
		},
		EndedAt: time.Now(),
	}
	require.NoError(t, ts.Srv.Journal.AppendIntent(matchID, st))

	// Boot (crash recovery) applies it...
	require.NoError(t, ts.Srv.Boot(ctx))
	acc, err := ts.Srv.Accounts.GetByID(ctx, host.ID)
	require.NoError(t, err)
	require.Equal(t, 1016, acc.MMR)
	require.Equal(t, 1, acc.Games)

	// ...exactly once: a second boot replays nothing new (absolute values).
	require.NoError(t, ts.Srv.Boot(ctx))
	acc, err = ts.Srv.Accounts.GetByID(ctx, host.ID)
	require.NoError(t, err)
	require.Equal(t, 1016, acc.MMR)
	require.Equal(t, 1, acc.Games)
	lines, err := ts.Srv.Store.ReadLines("history", host.ID)
	require.NoError(t, err)
	require.Len(t, lines, 1, "history stays single-entry across replays")
}

// TestBotOnYourTeamHalvesCrystals is the anti-farm rule, both tiers. Owner:
// 「全部玩家位置都真人才有 M幣；如果是自己隊伍 3 人都是真人那可以拿水晶，
//
//	若有 bot 只能拿一半水晶」
//
// The `result` fixture is 2 humans + 10 bots, and BOTH humans sit on a team
// with bots — which is what a real family lobby looks like. So: half crystals,
// zero M幣, and the match still counts for standings.
func TestBotOnYourTeamHalvesCrystals(t *testing.T) {
	testkit.Cover(t, "crystal-antifarm-half-on-bot-team")
	ts := testutil.New(t)
	ctx := context.Background()
	host, guest, _, matchID := startMatch(ts)
	require.NoError(t, ts.Srv.Wallet.SetCrystalAbsolute(ctx, host.ID, 55))

	resp, err := gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret, result(matchID, host, guest), 0)
	require.NoError(t, err)
	resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	// Host placed 1st with two bots beside him → half of the place-1 grant.
	hostW, err := ts.Srv.Wallet.Get(ctx, host.ID)
	require.NoError(t, err)
	require.Equal(t, 55+wallet.CrystalPlace1*resultMultiplier(), hostW.Crystal, "two humans in the lobby = x(N+1) 水晶")
	require.Equal(t, 0, hostW.MCoin, "a bot anywhere in the lobby means no M幣, even for 1st")

	// Half of every placement is still worth having — 「打場免費賺」 must not
	// round away to nothing for the family member who keeps losing.
	require.Positive(t, wallet.CrystalPlace4, "last place must still be > 0")

	// The match still COUNTED: standings are not currency.
	a, err := ts.Srv.Accounts.GetByID(ctx, host.ID)
	require.NoError(t, err)
	require.Equal(t, 1, a.Games, "only the currency is gated, not the record")
}
