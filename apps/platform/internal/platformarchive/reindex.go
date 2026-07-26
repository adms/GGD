package platformarchive

import (
	"context"
	"strings"

	"github.com/redis/go-redis/v9"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/ranking"
)

// Reindexer rebuilds the Redis hot layer after an import.
//
// ############################################################################
// DO NOT "SIMPLIFY" THIS INTO boot.Rebuild. TWO INDEPENDENT REASONS.
//
//  1. boot.Rebuild uses SetNX for idx:username / idx:email
//     (internal/data/boot/boot.go). SetNX writes only when the key is ABSENT.
//     On a fresh host with an empty Redis that is fine — which is exactly why
//     the bug hides. On a host that ever had an account (including the
//     bootstrap owner somebody registers so they can open the console at all),
//     idx:username:<name> ALREADY points at the OLD account id, SetNX declines
//     to touch it, and RESTARTING THE PLATFORM DOES NOT FIX IT either, because
//     the restart runs the same SetNX. The symptom is a correct password
//     signing you into the wrong account, or into nothing. opstate's
//     "restart the platform or run /seed" advice is simply wrong in that case.
//     So this writer uses SET (and DEL for a displaced mapping), which is the
//     only thing that converges.
//
//  2. boot.Rebuild's FIRST step replays pending WAL settlement intents.
//     Triggering an arbitrary-time settlement replay from an HTTP handler is
//     an unacceptable side effect of "I imported some files".
//
// ############################################################################
type Reindexer struct {
	Rdb    *redisx.Client
	Season string
}

// Rebuild re-points the uniqueness indexes and re-adds the leaderboard entries
// for the accounts this import wrote. It is deliberately SCOPED to those
// accounts: an import is additive, so the target's untouched accounts keep the
// hot-layer state they already had.
func (r *Reindexer) Rebuild(ctx context.Context, t *Target, res *ApplyResult) error {
	if r == nil || r.Rdb == nil {
		return nil
	}
	pipe := r.Rdb.R.Pipeline()

	// A displaced login key must be DELeted before it is re-SET, so a stale
	// value cannot survive a partially applied pipeline.
	for _, d := range res.DisplacedRefs {
		key := d.Key
		switch d.Collection {
		case account.ColByUsername:
			pipe.Del(ctx, redisx.KeyIdxUsername(strings.ToLower(key)))
		case account.ColByEmail:
			pipe.Del(ctx, redisx.KeyIdxEmail(strings.ToLower(key)))
		}
	}

	accounts, err := AccountDocs(t, res.AccountIDs)
	if err != nil {
		return err
	}
	for _, a := range accounts {
		if a.Username != "" {
			pipe.Set(ctx, redisx.KeyIdxUsername(strings.ToLower(a.Username)), a.ID, 0)
		}
		if a.Email != "" {
			pipe.Set(ctx, redisx.KeyIdxEmail(strings.ToLower(a.Email)), a.ID, 0)
		}
		// Board membership mirrors boot.Rebuild's arithmetic exactly (games > 0
		// gates the two account-level boards; champion boards are keyed on map
		// presence, so a 0-point entry is still restored).
		if a.Games > 0 {
			pipe.ZAdd(ctx, redisx.KeyLeaderboard(r.Season, ranking.Mode),
				redis.Z{Score: float64(a.MMR), Member: a.ID})
			pipe.ZAdd(ctx, redisx.KeyLeaderboard(r.Season, ranking.ModePlayer),
				redis.Z{Score: float64(a.SeasonPoints), Member: a.ID})
		}
		for champID, pts := range a.ChampionPoints {
			pipe.ZAdd(ctx, redisx.KeyLeaderboard(r.Season, ranking.ModeChampion(champID)),
				redis.Z{Score: float64(pts), Member: a.ID})
		}
	}
	_, err = pipe.Exec(ctx)
	return err
}
