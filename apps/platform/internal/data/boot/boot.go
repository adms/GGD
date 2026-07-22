// Package boot rebuilds the Redis hot layer from the data/ JSON truth on
// startup: replay the settlement WAL, restore uniqueness indexes and the
// leaderboard ZSET. Redis wiped ⇒ full recovery from JSON alone.
package boot

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"

	"github.com/redis/go-redis/v9"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/data/wal"
	"github.com/ggd/platform/internal/gamelink"
	"github.com/ggd/platform/internal/ranking"
)

// Deps is everything Rebuild needs.
type Deps struct {
	Rdb      *redisx.Client
	Accounts *account.Repo
	Journal  *wal.WAL
	Settler  *gamelink.Settler
	Season   string
}

// Rebuild replays pending WAL intents, then restores idx:username/idx:email
// and the lb:<season> ZSET from account JSON (account JSON wins on drift).
func Rebuild(ctx context.Context, d Deps) error {
	// 1. WAL replay: any settlement intent without a commit marker is
	// re-applied. Records carry absolute MMR, so replay is idempotent.
	intents, err := d.Journal.PendingIntents()
	if err != nil {
		return err
	}
	for _, in := range intents {
		var st gamelink.Settlement
		if err := json.Unmarshal(in.Payload, &st); err != nil {
			slog.Error("boot: skipping corrupt WAL intent", "matchId", in.MatchID, "err", err)
			continue
		}
		// Ensure the done-marker exists so a late duplicate callback no-ops.
		if _, err := d.Rdb.SetNX(ctx, redisx.KeyMatchDone(st.MatchID), "1", 0); err != nil {
			return err
		}
		if err := d.Settler.Apply(ctx, st); err != nil {
			return err
		}
		if err := d.Journal.AppendCommit(st.MatchID); err != nil {
			return err
		}
		slog.Info("boot: replayed settlement", "matchId", st.MatchID)
	}

	// 2. Uniqueness indexes + leaderboard from account JSON (the truth).
	ids, err := d.Accounts.List(ctx)
	if err != nil {
		return err
	}
	pipe := d.Rdb.R.Pipeline()
	restored := 0
	for _, id := range ids {
		a, err := d.Accounts.GetByID(ctx, id)
		if err != nil {
			slog.Error("boot: unreadable account", "id", id, "err", err)
			continue
		}
		pipe.SetNX(ctx, redisx.KeyIdxUsername(strings.ToLower(a.Username)), a.ID, 0)
		pipe.SetNX(ctx, redisx.KeyIdxEmail(strings.ToLower(a.Email)), a.ID, 0)
		if a.Games > 0 {
			pipe.ZAdd(ctx, redisx.KeyLeaderboard(d.Season, ranking.Mode),
				redis.Z{Score: float64(a.MMR), Member: a.ID})
			// Visible cumulative-points PLAYER board: every ranked account
			// (incl. those floored to 0 points) appears with its season total.
			pipe.ZAdd(ctx, redisx.KeyLeaderboard(d.Season, ranking.ModePlayer),
				redis.Z{Score: float64(a.SeasonPoints), Member: a.ID})
		}
		// Per-champion boards: one entry per champion the account has played
		// (map presence == played, so 0-point entries are restored too).
		for champID, pts := range a.ChampionPoints {
			pipe.ZAdd(ctx, redisx.KeyLeaderboard(d.Season, ranking.ModeChampion(champID)),
				redis.Z{Score: float64(pts), Member: a.ID})
		}
		restored++
	}
	if _, err := pipe.Exec(ctx); err != nil {
		return err
	}
	slog.Info("boot: rebuilt hot layer", "accounts", restored, "replayed", len(intents))
	return nil
}
