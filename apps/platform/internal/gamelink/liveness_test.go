package gamelink_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/config"
	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/gamelink"
	"github.com/ggd/platform/internal/gamelink/gamelinktest"
	"github.com/ggd/platform/internal/presence"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// testGrace is what these tests configure as the liveness grace. Real deploys
// take it from config.DefaultLivenessGrace via GGD_MATCH_LIVENESS_GRACE_SEC.
const testGrace = 3 * time.Minute

func livenessTS(t *testing.T) *testutil.TS {
	t.Helper()
	return testutil.New(t, func(c *config.Config) { c.MatchLivenessGrace = testGrace })
}

// deadlineZ is a pending-set entry with an explicit deadline (tests that need to
// corrupt one).
func deadlineZ(matchID string, at time.Time) redis.Z {
	return redis.Z{Score: float64(at.Unix()), Member: matchID}
}

// beat sends a signed heartbeat over the real HTTP surface, exactly as the
// game-server does, and returns the decoded ack.
func beat(t *testing.T, base string, matchIDs ...string) (int, gamelink.HeartbeatAck) {
	t.Helper()
	body, err := json.Marshal(gamelink.HeartbeatRequest{MatchIDs: matchIDs, Phase: "combat", Round: 7})
	require.NoError(t, err)
	ts := strconv.FormatInt(time.Now().Unix(), 10)
	req, err := http.NewRequest(http.MethodPost, base+"/api/v1/internal/matches/heartbeat", bytes.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(gamelink.HeaderTimestamp, ts)
	req.Header.Set(gamelink.HeaderAuth, gamelink.Sign(testutil.GameSecret, ts, body))
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	var ack gamelink.HeartbeatAck
	_ = json.NewDecoder(resp.Body).Decode(&ack)
	return resp.StatusCode, ack
}

// TestLiveMatchSurvivesPastTheOldTTL is THE case that was broken (#187).
//
// With `match.startingTeamLives` at the owner's 8, a match averages 8.73 rounds
// x 226s + 40s champ select = 33.6 minutes, and runs to 42.3 if rounds hit the
// full combatMaxSec. The old code wrote `now + MatchPendingTTL` (30 min) into
// the pending ZSET once and never renewed it, so at minute 30 the reaper wrote
// an ABANDONED result for a match the family was still playing, dumped everyone
// into the lobby and disposed the room.
//
// Here the match runs FORTY-FIVE simulated minutes — past the old 30-minute
// constant with room to spare — heartbeating every 30s the way the game-server
// does. Not one sweep may touch it. Then the beats stop, and it must be reaped
// within one grace: the reaper's real job is unimpaired.
func TestLiveMatchSurvivesPastTheOldTTL(t *testing.T) {
	testkit.Cover(t, "seam-liveness-long-match")
	ts := livenessTS(t)
	ctx := context.Background()
	host, _, rid, matchID := startMatch(ts)

	const (
		beatEvery = 30 * time.Second
		playFor   = 45 * time.Minute // 8 lives at full combatMaxSec, plus headroom
	)
	start := time.Now()
	for elapsed := time.Duration(0); elapsed <= playFor; elapsed += beatEvery {
		now := start.Add(elapsed)
		ack, err := ts.Srv.Gamelink.Heartbeat(ctx, []string{matchID}, now)
		require.NoError(t, err)
		require.Equal(t, []string{matchID}, ack.Renewed, "at %s the game-server said it is still running this match", elapsed)

		reaped, err := ts.Srv.Gamelink.ReapStuck(ctx, now)
		require.NoError(t, err)
		require.Empty(t, reaped,
			"reaped a LIVE match at %s — this is the #187 data loss: an abandoned result on a real player's record", elapsed)
	}

	// Untouched: still pending, still in-match, no abandoned settlement, no room
	// torn down under the players' feet.
	require.True(t, ts.Mini.Exists(redisx.KeyMatchPending(matchID)))
	require.False(t, ts.Mini.Exists(redisx.KeyMatchDone(matchID)))
	require.True(t, ts.Mini.Exists("room:"+rid))
	st, _ := ts.Srv.Presence.Get(ctx, host.ID)
	require.Equal(t, presence.StateInMatch, st, "a live match must not send its players back to the lobby")

	// The beats stop (crash / hang / dispose without a result). One grace later
	// the match is still protected...
	died := start.Add(playFor)
	reaped, err := ts.Srv.Gamelink.ReapStuck(ctx, died.Add(testGrace-time.Second))
	require.NoError(t, err)
	require.Empty(t, reaped, "inside the grace a few dropped heartbeats must not be fatal")

	// ...and just past it, it is reaped — promptly, without waiting for the
	// blind fallback.
	reaped, err = ts.Srv.Gamelink.ReapStuck(ctx, died.Add(testGrace+time.Second))
	require.NoError(t, err)
	require.Equal(t, []string{matchID}, reaped)
	require.False(t, ts.Mini.Exists(redisx.KeyMatchPending(matchID)))
	st, _ = ts.Srv.Presence.Get(ctx, host.ID)
	require.Equal(t, presence.StateInLobby, st)
}

// TestHeartbeatShortensTheBlindDeadline: a match starts on the blind fallback
// (hours, because the platform knows nothing yet) and the FIRST heartbeat
// switches it to evidence mode. That is what keeps the reaper prompt — the
// fallback constant never becomes the detection latency for a real death.
func TestHeartbeatShortensTheBlindDeadline(t *testing.T) {
	testkit.Cover(t, "seam-liveness-first-beat")
	ts := livenessTS(t)
	ctx := context.Background()
	_, _, _, matchID := startMatch(ts)

	blind, err := ts.Srv.Rdb.R.ZScore(ctx, redisx.KeyMatchesPending(), matchID).Result()
	require.NoError(t, err)
	require.InDelta(t, time.Now().Add(ts.Cfg.MatchPendingTTL).Unix(), int64(blind), 5,
		"an unheartbeated match starts on the blind fallback deadline")
	require.Greater(t, ts.Cfg.MatchPendingTTL, 5*testGrace,
		"the blind fallback must be far longer than the grace, or it would be the thing detecting deaths")

	now := time.Now()
	_, err = ts.Srv.Gamelink.Heartbeat(ctx, []string{matchID}, now)
	require.NoError(t, err)

	live, err := ts.Srv.Rdb.R.ZScore(ctx, redisx.KeyMatchesPending(), matchID).Result()
	require.NoError(t, err)
	require.Equal(t, now.Add(testGrace).Unix(), int64(live),
		"once liveness is established the deadline is lastBeat+grace, not the blind constant")
}

// TestUnheartbeatedMatchIsStillReaped: the reaper's actual job. A game-server
// that never reports (old build, wrong URL, wrong secret) must not leak pending
// entries forever — the blind deadline still fires. It is the ONLY path that
// can kill a live match, which is why it logs at ERROR.
func TestUnheartbeatedMatchIsStillReaped(t *testing.T) {
	testkit.Cover(t, "seam-liveness-blind-fallback")
	ts := livenessTS(t)
	ctx := context.Background()
	_, _, _, matchID := startMatch(ts)

	reaped, err := ts.Srv.Gamelink.ReapStuck(ctx, time.Now().Add(ts.Cfg.MatchPendingTTL-time.Minute))
	require.NoError(t, err)
	require.Empty(t, reaped)

	reaped, err = ts.Srv.Gamelink.ReapStuck(ctx, time.Now().Add(ts.Cfg.MatchPendingTTL+time.Minute))
	require.NoError(t, err)
	require.Equal(t, []string{matchID}, reaped)
}

// TestReaperRefusesAMatchWithFresherLiveness: the deadline and the match's own
// heartbeat columns can disagree — a ZADD that failed, a clock step, a crash
// between the two writes. The reaper must believe the evidence, not the stale
// number, and repair the deadline rather than reap.
func TestReaperRefusesAMatchWithFresherLiveness(t *testing.T) {
	testkit.Cover(t, "seam-liveness-deadline-repair")
	ts := livenessTS(t)
	ctx := context.Background()
	_, _, _, matchID := startMatch(ts)

	now := time.Now()
	_, err := ts.Srv.Gamelink.Heartbeat(ctx, []string{matchID}, now)
	require.NoError(t, err)
	// Corrupt ONLY the deadline, leaving the fresh beat on the hash.
	require.NoError(t, ts.Srv.Rdb.R.ZAdd(ctx, redisx.KeyMatchesPending(), deadlineZ(matchID, now.Add(-time.Hour))).Err())

	reaped, err := ts.Srv.Gamelink.ReapStuck(ctx, now)
	require.NoError(t, err)
	require.Empty(t, reaped, "a match that heartbeated seconds ago must survive a stale deadline")

	repaired, err := ts.Srv.Rdb.R.ZScore(ctx, redisx.KeyMatchesPending(), matchID).Result()
	require.NoError(t, err)
	require.Equal(t, now.Add(testGrace).Unix(), int64(repaired), "the deadline is repaired from the evidence")
}

// TestHeartbeatByGameRoomID: the game-server's COMPLETE list of live rooms
// (matchMaker.query) is keyed by Colyseus room id, not by the platform's match
// id, so the beat must land through that key too — otherwise the only working
// signal would be the best-effort recording ids and coverage would silently
// depend on the replay subsystem.
func TestHeartbeatByGameRoomID(t *testing.T) {
	testkit.Cover(t, "seam-liveness-by-room")
	ts := livenessTS(t)
	ctx := context.Background()
	_, _, _, matchID := startMatch(ts)

	gameRoomID, err := ts.Srv.Rdb.R.HGet(ctx, redisx.KeyMatchPending(matchID), "gameRoomId").Result()
	require.NoError(t, err)
	require.NotEmpty(t, gameRoomID, "StartMatch must record the game-server's own room id")

	body, err := json.Marshal(map[string]any{"gameRoomIds": []string{gameRoomID, "room-we-never-created"}})
	require.NoError(t, err)
	hdr := strconv.FormatInt(time.Now().Unix(), 10)
	req, err := http.NewRequest(http.MethodPost, ts.HTTP.URL+"/api/v1/internal/matches/heartbeat", bytes.NewReader(body))
	require.NoError(t, err)
	req.Header.Set(gamelink.HeaderTimestamp, hdr)
	req.Header.Set(gamelink.HeaderAuth, gamelink.Sign(testutil.GameSecret, hdr, body))
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var ack gamelink.HeartbeatAck
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&ack))
	require.Equal(t, []string{matchID}, ack.Renewed, "a beat by game-room id must renew the match that owns that room")

	// And it really moved the deadline off the blind fallback.
	score, err := ts.Srv.Rdb.R.ZScore(ctx, redisx.KeyMatchesPending(), matchID).Result()
	require.NoError(t, err)
	require.InDelta(t, time.Now().Add(testGrace).Unix(), int64(score), 5)
}

// TestHeartbeatCannotBeForgedByAClient: liveness is an assertion only the
// game-server may make. Nothing a browser holds — no session, no access token,
// no unsigned POST — may keep a match alive or reach this route at all.
func TestHeartbeatCannotBeForgedByAClient(t *testing.T) {
	testkit.Cover(t, "seam-liveness-hmac")
	ts := livenessTS(t)
	ctx := context.Background()
	_, _, _, matchID := startMatch(ts)
	u := ts.Register("mallory")

	before, err := ts.Srv.Rdb.R.ZScore(ctx, redisx.KeyMatchesPending(), matchID).Result()
	require.NoError(t, err)

	body := map[string]any{"matchIds": []string{matchID}}
	for _, path := range []string{
		"/api/v1/internal/matches/heartbeat",
		"/api/v1/internal/matches/" + matchID + "/heartbeat",
	} {
		r := ts.Do(http.MethodPost, path, u.Access, body)
		require.Equal(t, http.StatusUnauthorized, r.Status, "a user access token must not assert liveness on %s", path)
		r = ts.Do(http.MethodPost, path, "", body)
		require.Equal(t, http.StatusUnauthorized, r.Status, "an unsigned POST must not assert liveness on %s", path)
	}

	// A signature made with the wrong secret is rejected too.
	raw, _ := json.Marshal(body)
	tsHdr := strconv.FormatInt(time.Now().Unix(), 10)
	req, _ := http.NewRequest(http.MethodPost, ts.HTTP.URL+"/api/v1/internal/matches/heartbeat", bytes.NewReader(raw))
	req.Header.Set(gamelink.HeaderTimestamp, tsHdr)
	req.Header.Set(gamelink.HeaderAuth, gamelink.Sign("not-the-game-secret", tsHdr, raw))
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	resp.Body.Close()
	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)

	after, err := ts.Srv.Rdb.R.ZScore(ctx, redisx.KeyMatchesPending(), matchID).Result()
	require.NoError(t, err)
	require.Equal(t, before, after, "no rejected attempt moved the deadline")

	// The properly signed call, by contrast, works.
	code, ack := beat(t, ts.HTTP.URL, matchID)
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, []string{matchID}, ack.Renewed)
	require.Equal(t, int(testGrace.Seconds()), ack.GraceSecs)
}

// TestHeartbeatCannotResurrectASettledMatch: a beat racing (or trailing) the
// result callback must not put a paid-out match back into the pending set,
// where the reaper would later stamp it abandoned on top of its real result.
func TestHeartbeatCannotResurrectASettledMatch(t *testing.T) {
	testkit.Cover(t, "seam-liveness-no-resurrect")
	ts := livenessTS(t)
	ctx := context.Background()
	host, guest, _, matchID := startMatch(ts)

	resp, err := gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret, result(matchID, host, guest), 0)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	resp.Body.Close()

	code, ack := beat(t, ts.HTTP.URL, matchID)
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, []string{matchID}, ack.Done)
	require.Empty(t, ack.Renewed)

	_, err = ts.Srv.Rdb.R.ZScore(ctx, redisx.KeyMatchesPending(), matchID).Result()
	require.Error(t, err, "a settled match must not reappear in the pending set")

	// And an id this platform has never seen is reported, not invented.
	code, ack = beat(t, ts.HTTP.URL, "m_does_not_exist")
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, []string{"m_does_not_exist"}, ack.Unknown)
	require.False(t, ts.Mini.Exists(redisx.KeyMatchPending("m_does_not_exist")))
}
