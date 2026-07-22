package gamelink

import (
	"context"
	"encoding/json"
	"log/slog"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/presence"
)

// ReapStuck marks every pending match whose deadline passed as abandoned:
// a done-marker is set (so a late result callback is ignored), an abandoned
// match record is written, humans return to the lobby and the room is
// disposed. Returns the reaped match ids.
func (s *Service) ReapStuck(ctx context.Context, now time.Time) ([]string, error) {
	mids, err := s.rdb.R.ZRangeByScore(ctx, redisx.KeyMatchesPending(), &redis.ZRangeBy{
		Min: "-inf", Max: strconv.FormatInt(now.Unix(), 10),
	}).Result()
	if err != nil {
		return nil, err
	}
	var reaped []string
	for _, mid := range mids {
		fresh, err := s.rdb.SetNX(ctx, redisx.KeyMatchDone(mid), "abandoned", 0)
		if err != nil {
			return reaped, err
		}
		pend, _ := s.rdb.R.HGetAll(ctx, redisx.KeyMatchPending(mid)).Result()
		if fresh {
			var seats []Seat
			if raw := pend["seats"]; raw != "" {
				_ = json.Unmarshal([]byte(raw), &seats)
			}
			resultSeats := make([]ResultSeat, 0, len(seats))
			for _, seat := range seats {
				resultSeats = append(resultSeats, ResultSeat{AccountID: seat.AccountID, Team: seat.Team, IsBot: seat.IsBot})
				if !seat.IsBot {
					_ = s.pres.Set(ctx, seat.AccountID, presence.StateInLobby)
				}
			}
			st := Settlement{
				MatchID: mid, RoomID: pend["roomId"], Mode: "PairedDuels",
				Status: "abandoned", Seats: resultSeats, EndedAt: now,
			}
			if err := s.settle.store.Put(MatchCollection(now), mid, st); err != nil {
				return reaped, err
			}
			if st.RoomID != "" && s.settle.rooms != nil {
				_ = s.settle.rooms.Dispose(ctx, st.RoomID)
			}
			slog.Warn("reaped stuck match", "matchId", mid)
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

// StartReaper runs ReapStuck on an interval until ctx is done.
func (s *Service) StartReaper(ctx context.Context, every time.Duration) {
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
