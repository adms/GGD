package gamelink

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/presence"
)

// fieldPractice is the pending-hash column StartMatch stamps on a practice
// match (GH#343). It is written in client.go and read here, and nowhere else.
//
// It exists because a practice room can only ever END here: `endlessCombat`
// means the game-server never calls finishMatch, so no result callback arrives
// and the reaper is what closes the match out. Everything else about a practice
// match is already free of consequences (ReapStuck never calls Settler.Apply,
// so no currency / MMR / season points / history is touched) — the ONE thing
// that leaked was the settlement FILE, one 「abandoned」 row per practice
// session in data/matches/YYYY/MM/ (GH#349).
const fieldPractice = "practice"

// ReapStuck marks every pending match whose deadline passed as abandoned:
// a done-marker is set (so a late result callback is ignored), an abandoned
// match record is written (EXCEPT for practice matches — see fieldPractice),
// humans return to the lobby and the room is disposed. Returns the reaped
// match ids.
//
// REAPING A LIVE MATCH IS DATA LOSS — an abandoned result on a real player's
// record, everyone yanked back to the lobby mid-fight — so this function is
// written to be maximally reluctant and maximally loud:
//
//   - the deadline is re-read per match immediately before acting, so a
//     heartbeat that lands between the range scan and the reap wins the race
//     instead of losing it;
//   - a match whose own liveness columns contradict its deadline is REPAIRED
//     and left alone, not killed on the strength of the stale number;
//   - a match that has never been heartbeated at all is still reaped (otherwise
//     an un-instrumented game-server leaks pending entries forever) but at
//     ERROR, naming the missing signal — because if this ever kills someone's
//     game again there must be a line in the log that says so.
func (s *Service) ReapStuck(ctx context.Context, now time.Time) ([]string, error) {
	mids, err := s.rdb.R.ZRangeByScore(ctx, redisx.KeyMatchesPending(), &redis.ZRangeBy{
		Min: "-inf", Max: strconv.FormatInt(now.Unix(), 10),
	}).Result()
	if err != nil {
		return nil, err
	}
	var reaped []string
	grace := s.livenessGrace()
	for _, mid := range mids {
		// RACE GUARD. Between the scan above and this line the game-server may
		// have heartbeated this exact match and pushed its deadline into the
		// future. Without the re-read, a beat that arrives during the reaper's
		// own pass is simply ignored and a live match dies anyway — which is the
		// worst possible outcome of a mechanism built to prevent that.
		score, err := s.rdb.R.ZScore(ctx, redisx.KeyMatchesPending(), mid).Result()
		if errors.Is(err, redis.Nil) {
			continue // settled or reaped by another pass
		}
		if err != nil {
			return reaped, err
		}
		if int64(score) > now.Unix() {
			slog.Info("reaper: match renewed while the sweep was running; leaving it alone",
				"matchId", mid, "deadlineIn", time.Until(time.Unix(int64(score), 0)).Round(time.Second))
			continue
		}

		pend, _ := s.rdb.R.HGetAll(ctx, redisx.KeyMatchPending(mid)).Result()
		beats, lastBeat, tracked := beatsOf(pend)

		// EVIDENCE BEATS THE CLOCK. If this match has a recent heartbeat, its
		// deadline is simply wrong — a ZADD that failed, a clock step, a restart
		// mid-write. Killing a match on a number the match's own record
		// contradicts is exactly the failure being fixed, so repair the deadline
		// from the evidence and let the next sweep judge it again. If the beats
		// really have stopped, lastBeat stops moving and this becomes a genuine
		// reap one grace later — it cannot loop forever.
		if tracked && now.Sub(lastBeat) < grace {
			if err := s.spareLiveMatch(ctx, mid, pend, now, score, beats, lastBeat, grace, false); err != nil {
				return reaped, err
			}
			continue
		}

		fresh, err := s.rdb.SetNX(ctx, redisx.KeyMatchDone(mid), "abandoned", 0)
		if err != nil {
			return reaped, err
		}
		if fresh {
			// LAST LOOK BEFORE THE DESTRUCTIVE PART. Everything below this point
			// is irreversible for a player — an abandoned settlement on disk,
			// presence yanked to the lobby, the room disposed — and it takes
			// long enough (a file write, an HTTP dispose) for a heartbeat to
			// land underneath it. Re-reading the liveness columns now that the
			// done-latch is held costs one HGETALL and makes the decision as
			// fresh as it can be; a beat that arrived in the meantime releases
			// the latch again so the match's real result can still settle.
			if confirm, err := s.rdb.R.HGetAll(ctx, redisx.KeyMatchPending(mid)).Result(); err == nil && len(confirm) > 0 {
				// Only ADOPT a non-empty re-read: an empty one means the record
				// is gone, and overwriting `pend` with it would settle a match
				// with no seats in it.
				pend = confirm
			}
			beats, lastBeat, tracked = beatsOf(pend)
			if tracked && now.Sub(lastBeat) < grace {
				if err := s.rdb.R.Del(ctx, redisx.KeyMatchDone(mid)).Err(); err != nil {
					return reaped, err
				}
				if err := s.spareLiveMatch(ctx, mid, pend, now, score, beats, lastBeat, grace, true); err != nil {
					return reaped, err
				}
				continue
			}
			var seats []Seat
			if raw := pend["seats"]; raw != "" {
				_ = json.Unmarshal([]byte(raw), &seats)
			}
			resultSeats := make([]ResultSeat, 0, len(seats))
			humans := 0
			for _, seat := range seats {
				resultSeats = append(resultSeats, ResultSeat{AccountID: seat.AccountID, Team: seat.Team, IsBot: seat.IsBot})
				if !seat.IsBot {
					humans++
					_ = s.pres.Set(ctx, seat.AccountID, presence.StateInLobby)
				}
			}
			st := Settlement{
				MatchID: mid, RoomID: pend["roomId"], Mode: "PairedDuels",
				Status: "abandoned", Seats: resultSeats, EndedAt: now,
			}
			// GH#349: a practice session leaves NO row in the match store.
			//
			// ⭐ 修在**來源**，⛔ 不是在查詢端過濾：這筆記錄一旦寫下去，每一個
			// 讀 data/matches/ 的東西（運維、稽核、匯出、未來的統計）都要各自
			// 記得濾掉它，而漏掉的那一個不會報錯，只會多算。不寫，就沒有人需要
			// 記得。⚠️ 其餘的收尾一項都不能省 —— 玩家要回大廳、房間要拆、
			// pending 鍵要清、而且它仍然算一次 reap（下面的 reaped）。
			practice := pend[fieldPractice] == "1"
			if !practice {
				if err := s.settle.store.Put(MatchCollection(now), mid, st); err != nil {
					return reaped, err
				}
			}
			if st.RoomID != "" && s.settle.rooms != nil {
				_ = s.settle.rooms.Dispose(ctx, st.RoomID)
			}
			s.logReap(mid, pend, now, beats, lastBeat, tracked, humans, practice)
			reaped = append(reaped, mid)
		}
		pipe := s.rdb.R.TxPipeline()
		pipe.ZRem(ctx, redisx.KeyMatchesPending(), mid)
		pipe.Del(ctx, redisx.KeyMatchPending(mid))
		if _, err := pipe.Exec(ctx); err != nil {
			return reaped, err
		}
	}
	return reaped, nil
}

// spareLiveMatch abandons the reap of a match whose own liveness columns
// contradict its deadline, repairs the deadline from the evidence, and says so
// at ERROR. It is deliberately loud: the two states can only disagree because
// something went wrong (a ZADD that did not land, a clock step, a beat racing
// the sweep), and this repo's defining failure mode is a wrong thing that
// produces no error. `underLatch` distinguishes the two moments it can happen.
func (s *Service) spareLiveMatch(ctx context.Context, mid string, pend map[string]string,
	now time.Time, staleScore float64, beats int, lastBeat time.Time, grace time.Duration, underLatch bool) error {
	repaired := lastBeat.Add(grace)
	when := "before the done-latch"
	if underLatch {
		when = "AFTER the done-latch was taken — the latch has been released so the real result can still settle"
	}
	slog.Error("reaper: deadline disagreed with liveness — REFUSING to reap a match that is still reporting",
		"matchId", mid, "roomId", pend["roomId"], "gameRoomId", pend[fieldGameID],
		"beats", beats, "lastBeatAgo", now.Sub(lastBeat).Round(time.Second),
		"grace", grace, "staleDeadline", time.Unix(int64(staleScore), 0).UTC(),
		"repairedDeadline", repaired.UTC(), "detectedAt", when,
		"cause", "the pending ZSET score was not advanced by a heartbeat that WAS recorded on the match hash")
	return s.rdb.R.ZAdd(ctx, redisx.KeyMatchesPending(), redis.Z{
		Score: float64(repaired.Unix()), Member: mid,
	}).Err()
}

// logReap says which of the two reasons a match was just written off, because
// they mean opposite things to an operator. "The game-server was reporting and
// stopped" is the reaper doing its job. "The platform never heard anything about
// this match" is the reaper GUESSING, and a guess is what wrote abandoned
// results onto live family matches — so it is an error even when it happens to
// be right.
func (s *Service) logReap(mid string, pend map[string]string, now time.Time,
	beats int, lastBeat time.Time, tracked bool, humans int, practice bool) {
	age := ""
	if ms, err := strconv.ParseInt(pend["startedAt"], 10, 64); err == nil && ms > 0 {
		age = now.Sub(time.UnixMilli(ms)).Round(time.Second).String()
	}
	if practice {
		// A practice room is SUPPOSED to end this way — it never finishes on its
		// own — so this is neither of the two verdicts below. It is logged at
		// INFO and it names the absence, because "no match record was written"
		// must have a stated cause rather than being something an operator
		// discovers by finding nothing.
		slog.Info("reaped a PRACTICE match — no settlement record written",
			"matchId", mid, "roomId", pend["roomId"], "gameRoomId", pend[fieldGameID],
			"ranFor", age, "humanSeats", humans,
			"why", "practice rooms run endlessCombat and never finishMatch, so the reaper is their normal exit",
			"effect", "presence returned to lobby and the room disposed; data/matches/ is untouched (GH#349)")
		return
	}
	if tracked {
		slog.Warn("reaped a match whose game-server stopped reporting",
			"matchId", mid, "roomId", pend["roomId"], "gameRoomId", pend[fieldGameID],
			"ranFor", age, "beats", beats,
			"silentFor", now.Sub(lastBeat).Round(time.Second), "grace", s.livenessGrace(),
			"humanSeats", humans, "verdict", "dead: liveness was established and then ceased")
		return
	}
	slog.Error("reaped a match on the BLIND deadline — no liveness heartbeat was ever received for it",
		"matchId", mid, "roomId", pend["roomId"], "gameRoomId", pend[fieldGameID],
		"ranFor", age, "blindDeadline", s.pendTTL, "humanSeats", humans,
		"risk", "this match may have been alive; every human seat just took an ABANDONED result",
		"cause", "the game-server never POSTed /api/v1/internal/matches/heartbeat for this match — "+
			"an old game-server build, a wrong GGD_PLATFORM_URL, or a mismatched PLATFORM_GAME_SHARED_SECRET",
		"fix", "restore the heartbeat; the blind deadline is a leak-stopper, not a match timer")
}

// ReaperInterval is the sweep period the reaper WILL actually use, given the
// interval a caller asked for and the liveness grace. Exported because the
// owner-facing ops inventory states this number (「巡檢每 N」 and the worst-case
// detection time derived from it), and a page that quotes the caller's
// unclamped request instead of the effective value is the same class of lie
// #187 was: it said 「回收檢查每 7 分 30 秒」 while the reaper ran on something
// else entirely. One function, both consumers.
func ReaperInterval(every, grace time.Duration) time.Duration {
	if lim := grace / 3; every <= 0 || every > lim {
		return lim
	}
	return every
}

// StartReaper runs ReapStuck on an interval until ctx is done.
//
// The caller's interval is CLAMPED to a third of the liveness grace. Callers
// derive it from the blind MatchPendingTTL, which is now measured in hours; left
// alone, a dead room would sit for up to that interval after its grace expired
// and the grace would mean nothing. A third means a match is judged at least
// three times inside its own grace window, so the reaper's resolution is set by
// the liveness signal rather than by the fallback constant.
func (s *Service) StartReaper(ctx context.Context, every time.Duration) {
	every = ReaperInterval(every, s.livenessGrace())
	slog.Info("match reaper started", "interval", every, "livenessGrace", s.livenessGrace(),
		"blindDeadline", s.pendTTL,
		"worstCaseDetection", s.livenessGrace()+every)
	go func() {
		t := time.NewTicker(every)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				if _, err := s.ReapStuck(ctx, s.now()); err != nil {
					slog.Error("reaper", "err", err)
				}
			}
		}
	}()
}
