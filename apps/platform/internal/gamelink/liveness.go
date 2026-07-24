package gamelink

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/redis/go-redis/v9"

	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/httpx"
)

// MATCH LIVENESS (#187) — why the deadline is renewed instead of guessed.
//
// A started match went into the pending ZSET with the score `now + 30 minutes`
// and that score was NEVER touched again. The reaper reads everything scored in
// the past and declares it abandoned: it writes an abandoned settlement, drops
// every human back to the lobby and disposes the room. Nothing in that path ever
// asked whether the match was still being played, because at the time the answer
// could not be no — startingLives was hardcoded to 3, which capped a match at
// ~18 minutes against a 30-minute deadline.
//
// Then `match.startingTeamLives` started taking effect and the owner set it to
// 8. Measured over 30 seeds, 8 lives is 8.73 rounds ≈ 33.6 minutes on average
// (42.3 if rounds run to the full combatMaxSec). The mean match now exceeds the
// deadline, so the family's games are torn down mid-play and everyone is
// credited with an ABANDONED result.
//
// THE THREE CANDIDATE FIXES, and why this is the one:
//
//	(a) Raise the constant. Smallest diff, worst fix. It does not remove the
//	    coupling, it re-tunes it: the deadline is still a number that has to be
//	    ≥ the longest match anyone will ever configure, so the next edit to
//	    startingTeamLives / combatMaxSec / roundIntermissionSec silently re-arms
//	    the same bug. It also degrades the reaper's real job in exact proportion
//	    to how safe you make it — a genuinely dead room now squats for an hour.
//	    One silent failure traded for another.
//	(b) Derive the deadline from the match configuration (lives x rounds x phase
//	    durations + headroom). Cheaper than this, and it does read the right
//	    inputs — but it re-breaks the moment any of those durations changes
//	    somewhere the platform does not look, which is precisely the class of
//	    bug being fixed. It also cannot see a match that legitimately runs long
//	    (a stall, a reconnect storm) and still kills it.
//	(c) THIS: let the thing that knows renew the deadline. The game-server is
//	    the only process that knows whether a room is still ticking, and the
//	    platform already trusts it over an HMAC-signed channel — that is exactly
//	    how the match RESULT arrives (callback.go) and how seats are reserved
//	    (client.go). A heartbeat on that same channel makes match length
//	    irrelevant to every constant in this repo: a 3-life match and a 12-life
//	    match are both "alive until the beats stop".
//
// FORGERY. Liveness is asserted only by a caller that can produce
// HMAC-SHA256(PLATFORM_GAME_SHARED_SECRET, ts + "." + body) inside the skew
// window — the same guard as the result callback, on a route the public edge
// does not proxy. A browser has no such secret, so no client can keep its own
// match alive (nor, in the other direction, end anyone else's). The route is
// covered by the same "a valid USER access token grants nothing here" test as
// the result callback.
//
// FIRST-BEAT SEMANTICS. A match starts with the BLIND deadline
// (cfg.MatchPendingTTL) because the platform has no evidence about it yet, and
// a platform that assumed heartbeats would arrive would murder every match on a
// game-server build that does not send them. The first beat is what switches a
// match into evidence mode: from then on the deadline is lastBeat + grace, so a
// dead room is caught in minutes rather than hours. Coverage can therefore be
// partial without anyone getting hurt — an un-instrumented match degrades to the
// old blind behaviour, never to an early death.

// defaultLivenessGrace applies only when a caller constructs the service with a
// zero grace (narrow unit fixtures). The real default lives in
// config.DefaultLivenessGrace and is what server.go passes.
const defaultLivenessGrace = 3 * time.Minute

// Pending-hash fields written by the liveness path.
const (
	fieldBeats  = "beats"  // how many heartbeats have been accepted
	fieldBeatAt = "beatAt" // unix ms of the most recent one
	fieldGameID = "gameRoomId"
)

// HeartbeatRequest is the inbound liveness callback from the game-server. Only
// MatchIDs (or the single-match path's URL id) is load-bearing; Phase/Round are
// carried purely so the reaper's logs can say what the match was doing when the
// beats stopped.
type HeartbeatRequest struct {
	MatchIDs []string `json:"matchIds"`
	MatchID  string   `json:"matchId"`
	// GameRoomIDs is the same assertion keyed by the game-server's OWN room ids.
	// It exists because the game-server's complete, authoritative list of live
	// rooms (matchMaker.query) is keyed by roomId and does not carry the
	// platform's match id; the platform resolves them against the gameRoomId it
	// recorded at StartMatch. Sending both is the point — matchIds covers what
	// the game-server knows by match, gameRoomIds covers everything it is
	// actually running.
	GameRoomIDs []string `json:"gameRoomIds"`
	Phase       string   `json:"phase"`
	Round       int      `json:"round"`
}

// HeartbeatAck reports what the platform did with each id, so the game-server
// can log a heartbeat that landed on nothing instead of assuming it worked.
// Renewed/Unknown/Done partition the request.
type HeartbeatAck struct {
	Status    string   `json:"status"`
	Renewed   []string `json:"renewed"`
	Unknown   []string `json:"unknown,omitempty"`
	Done      []string `json:"done,omitempty"`
	GraceSecs int      `json:"graceSecs"`
}

// livenessGrace is how long a match outlives its last heartbeat.
func (s *Service) livenessGrace() time.Duration {
	if s.liveGrace <= 0 {
		return defaultLivenessGrace
	}
	return s.liveGrace
}

// renewOutcome is what happened to one id in a heartbeat.
type renewOutcome int

const (
	renewOK      renewOutcome = iota // deadline pushed forward
	renewUnknown                     // no pending record: nothing to renew
	renewDone                        // already settled or reaped
)

// Heartbeat records that the game-server still has these matches running and
// pushes each one's reaper deadline to now+grace. Ids the platform does not
// have pending are reported back rather than created: a heartbeat must never be
// able to resurrect a settled match into the pending set, or a late beat racing
// a result callback would re-arm the reaper on a match that already paid out.
func (s *Service) Heartbeat(ctx context.Context, matchIDs []string, now time.Time) (HeartbeatAck, error) {
	ack := HeartbeatAck{Status: "ok", Renewed: []string{}, GraceSecs: int(s.livenessGrace().Seconds())}
	deadline := now.Add(s.livenessGrace())
	// The two id spaces (match ids and resolved game-room ids) overlap by
	// design, so the same match commonly arrives twice in one beat.
	seen := make(map[string]bool, len(matchIDs))
	for _, mid := range matchIDs {
		if mid == "" || seen[mid] {
			continue
		}
		seen[mid] = true
		out, err := s.renewOne(ctx, mid, now, deadline)
		if err != nil {
			return ack, err
		}
		switch out {
		case renewOK:
			ack.Renewed = append(ack.Renewed, mid)
		case renewUnknown:
			ack.Unknown = append(ack.Unknown, mid)
		case renewDone:
			ack.Done = append(ack.Done, mid)
		}
	}
	if len(ack.Unknown) > 0 {
		// Not fatal, but never silent: the game-server believes it is running a
		// match this platform has no pending record for. That is a split brain
		// (mismatched deploy, flushed Redis, a match started against a different
		// platform) and it means this match will settle into nothing.
		slog.Warn("liveness heartbeat for matches this platform has no pending record of",
			"matchIds", ack.Unknown,
			"consequence", "these matches are not tracked here and their result callback will find no pending record")
	}
	return ack, nil
}

func (s *Service) renewOne(ctx context.Context, mid string, now, deadline time.Time) (renewOutcome, error) {
	done, err := s.rdb.R.Exists(ctx, redisx.KeyMatchDone(mid)).Result()
	if err != nil {
		return renewUnknown, err
	}
	if done > 0 {
		return renewDone, nil
	}
	exists, err := s.rdb.R.Exists(ctx, redisx.KeyMatchPending(mid)).Result()
	if err != nil {
		return renewUnknown, err
	}
	if exists == 0 {
		return renewUnknown, nil
	}
	pipe := s.rdb.R.TxPipeline()
	pipe.HIncrBy(ctx, redisx.KeyMatchPending(mid), fieldBeats, 1)
	pipe.HSet(ctx, redisx.KeyMatchPending(mid), fieldBeatAt, now.UnixMilli())
	// ZAddXX, never a plain ZAdd: a heartbeat may only MOVE a deadline that
	// already exists, never create one. The checks above are a read-then-write,
	// so a reap can land in between; with a plain ZAdd that beat would put the
	// match back into the pending set after it had been settled, and the next
	// sweep would stamp an abandoned result on top of a real one. XX makes that
	// structurally impossible rather than merely unlikely.
	pipe.ZAddXX(ctx, redisx.KeyMatchesPending(), redis.Z{
		Score: float64(deadline.Unix()), Member: mid,
	})
	if _, err := pipe.Exec(ctx); err != nil {
		return renewUnknown, err
	}
	return renewOK, nil
}

// handleHeartbeat serves both the batch form (POST /internal/matches/heartbeat
// with {"matchIds":[…]}) and the single form
// (POST /internal/matches/{matchId}/heartbeat).
func (s *Service) handleHeartbeat(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		httpx.WriteError(w, httpx.BadRequest("unreadable body"))
		return
	}
	if !Verify(s.secret, r.Header.Get(HeaderTimestamp), r.Header.Get(HeaderAuth), body, s.now(), s.skew) {
		httpx.WriteError(w, httpx.Unauthorized("invalid internal signature"))
		return
	}
	var req HeartbeatRequest
	if len(body) > 0 {
		if err := json.Unmarshal(body, &req); err != nil {
			httpx.WriteError(w, httpx.BadRequest("invalid JSON body"))
			return
		}
	}
	ids := req.MatchIDs
	if len(req.GameRoomIDs) > 0 {
		resolved, unresolved, err := s.matchesForGameRooms(r.Context(), req.GameRoomIDs)
		if err != nil {
			httpx.WriteError(w, err)
			return
		}
		ids = append(ids, resolved...)
		if len(unresolved) > 0 {
			// The game-server is running rooms this platform has no pending
			// record for. Harmless on its own (dev rooms created outside
			// /_internal/matches look exactly like this) but never silent, since
			// the other explanation is that the platform lost the record of a
			// real match.
			slog.Warn("liveness heartbeat named game rooms with no pending match record",
				"gameRoomIds", unresolved)
		}
	}
	if urlID := chi.URLParam(r, "matchId"); urlID != "" {
		// Single-match path: the URL is authoritative, and a body that disagrees
		// is a bug in the caller rather than something to silently merge.
		if req.MatchID != "" && req.MatchID != urlID {
			httpx.WriteError(w, httpx.BadRequest("matchId mismatch"))
			return
		}
		ids = []string{urlID}
	} else if req.MatchID != "" {
		ids = append(ids, req.MatchID)
	}
	if len(ids) == 0 {
		// An empty beat is legal and meaningful: it is how a game-server with no
		// live rooms says "I am up and I am running nothing", which is different
		// from silence. Nothing is renewed, and every pending match ages out
		// normally.
		httpx.WriteJSON(w, http.StatusOK, HeartbeatAck{
			Status: "ok", Renewed: []string{}, GraceSecs: int(s.livenessGrace().Seconds())})
		return
	}
	ack, err := s.Heartbeat(r.Context(), ids, s.now())
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, ack)
}

// matchesForGameRooms maps game-server room ids onto the pending match ids that
// claim them, returning the resolved match ids and the room ids nothing claimed.
//
// This walks the pending set rather than keeping a roomId→matchId index: the
// pending set is bounded by the concurrent-match ceiling (50 by default), the
// walk happens once per heartbeat interval, and an index would be a SECOND
// place that can disagree with the truth — which is the failure mode this whole
// change exists to remove.
func (s *Service) matchesForGameRooms(ctx context.Context, roomIDs []string) (resolved, unresolved []string, err error) {
	pending, err := s.rdb.R.ZRange(ctx, redisx.KeyMatchesPending(), 0, -1).Result()
	if err != nil {
		return nil, nil, err
	}
	byRoom := make(map[string]string, len(pending))
	for _, mid := range pending {
		gameID, err := s.rdb.R.HGet(ctx, redisx.KeyMatchPending(mid), fieldGameID).Result()
		if err != nil || gameID == "" {
			continue
		}
		byRoom[gameID] = mid
	}
	for _, rid := range roomIDs {
		if mid, ok := byRoom[rid]; ok {
			resolved = append(resolved, mid)
			continue
		}
		unresolved = append(unresolved, rid)
	}
	return resolved, unresolved, nil
}

// recordGameRoom stores the game-server's own room id on the pending record.
// The platform's `roomId` is the LOBBY room; this is the Colyseus room, which is
// what an operator (and a room-id-keyed heartbeat) actually has in hand.
func (s *Service) recordGameRoom(pend map[string]any, colyseusRoomID string) {
	if colyseusRoomID != "" {
		pend[fieldGameID] = colyseusRoomID
	}
}

// beatsOf reads the liveness columns off a pending hash. ok is false when the
// platform has never received a heartbeat for that match — the case where the
// reaper is working blind.
func beatsOf(pend map[string]string) (beats int, lastBeat time.Time, ok bool) {
	beats, _ = strconv.Atoi(pend[fieldBeats])
	if beats <= 0 {
		return 0, time.Time{}, false
	}
	ms, err := strconv.ParseInt(pend[fieldBeatAt], 10, 64)
	if err != nil || ms <= 0 {
		return beats, time.Time{}, false
	}
	return beats, time.UnixMilli(ms), true
}
