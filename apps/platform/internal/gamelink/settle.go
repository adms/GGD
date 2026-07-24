package gamelink

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/presence"
	"github.com/ggd/platform/internal/ranking"
	"github.com/ggd/platform/internal/wallet"
)

// ColHistory is the per-account NDJSON history collection (data/history).
const ColHistory = "history"

// TeamPlace is a team's final placement (1 = winner).
type TeamPlace struct {
	Team  int `json:"team"`
	Place int `json:"place"`
}

// ResultSeat is one seat in the result callback.
type ResultSeat struct {
	AccountID string `json:"accountId"`
	Team      int    `json:"team"`
	IsBot     bool   `json:"isBot"`
	// ChampionID is the champion this seat played, used to credit the visible
	// per-champion points board. Optional: when absent, buildSettlement falls
	// back to the champion recorded on the pending-match seats.
	ChampionID string `json:"championId,omitempty"`
}

// RatingAfter is the ABSOLUTE post-match rating of one human. Absolute values
// (including the M COIN balance and the cumulative ladder points) make WAL
// replay idempotent.
type RatingAfter struct {
	MMR   int `json:"mmr"`
	Games int `json:"games"`
	Wins  int `json:"wins"`
	// MCoin is the absolute post-match M COIN balance (placement reward
	// already applied) — same idempotency pattern as MMR.
	MCoin int `json:"mcoin"`
	// Crystal is the absolute post-match 水晶 balance (the free per-match
	// meta-progression grant already applied) — same idempotency pattern as
	// MMR. This settlement callback is the ONLY thing in the system that may
	// grant crystals; see internal/wallet/meta.go. `omitempty` keeps it absent
	// from records written before it existed, and Apply skips a zero value so
	// replaying such a record can never wipe a player's balance.
	Crystal int `json:"crystal,omitempty"`
	// Points is the absolute post-match cumulative PLAYER-board season points
	// (placement award applied, floored at 0). Same idempotency pattern as MMR.
	Points int `json:"points"`
	// ChampionID is the champion this seat played (empty when unknown); its
	// per-champion board is credited with ChampionPoints.
	ChampionID string `json:"championId,omitempty"`
	// ChampionPoints is the absolute post-match cumulative points ON ChampionID
	// (placement award applied, floored at 0).
	ChampionPoints int `json:"championPoints,omitempty"`
}

// Settlement is the full journaled settlement payload — everything Apply
// needs, with absolute post-match values only.
type Settlement struct {
	MatchID    string                 `json:"matchId"`
	RoomID     string                 `json:"roomId,omitempty"`
	Mode       string                 `json:"mode"`
	MapID      string                 `json:"mapId,omitempty"`
	Status     string                 `json:"status"` // completed | abandoned
	Placements []TeamPlace            `json:"placements,omitempty"`
	Seats      []ResultSeat           `json:"seats,omitempty"`
	Ratings    map[string]RatingAfter `json:"ratings,omitempty"`
	EndedAt    time.Time              `json:"endedAt"`
}

// historyLine is one NDJSON row of data/history/<accountId>.jsonl.
type historyLine struct {
	MatchID  string    `json:"matchId"`
	Team     int       `json:"team"`
	Place    int       `json:"place"`
	MMRAfter int       `json:"mmrAfter"`
	At       time.Time `json:"at"`
}

// RoomDisposer breaks the gamelink→room service dependency for settlement.
type RoomDisposer interface {
	Dispose(ctx context.Context, roomID string) error
}

// Settler applies a Settlement to every store. All writes are idempotent, so
// WAL replay after a crash converges.
type Settler struct {
	store    *jsonstore.Store
	rdb      *redisx.Client
	accounts *account.Repo
	pres     *presence.Service
	rank     *ranking.Service
	rooms    RoomDisposer
	wallet   *wallet.Service
}

// NewSettler builds the settler. rooms may be nil (no room cleanup); wallet
// may be nil (no M COIN grants).
func NewSettler(store *jsonstore.Store, rdb *redisx.Client, accounts *account.Repo,
	pres *presence.Service, rank *ranking.Service, rooms RoomDisposer, wal *wallet.Service) *Settler {
	return &Settler{store: store, rdb: rdb, accounts: accounts, pres: pres, rank: rank, rooms: rooms, wallet: wal}
}

// MatchCollection returns the YYYY/MM-partitioned collection for a match.
func MatchCollection(endedAt time.Time) string {
	return fmt.Sprintf("matches/%04d/%02d", endedAt.UTC().Year(), int(endedAt.UTC().Month()))
}

// Apply performs the settlement writes: match JSON truth → history append →
// absolute account rating → leaderboard ZADD → presence back to lobby →
// pending-match cleanup → room disposal.
func (s *Settler) Apply(ctx context.Context, st Settlement) error {
	if st.EndedAt.IsZero() {
		st.EndedAt = time.Now()
	}
	// 1. Match record is the durable truth.
	if err := s.store.Put(MatchCollection(st.EndedAt), st.MatchID, st); err != nil {
		return err
	}
	placeOf := map[int]int{}
	for _, p := range st.Placements {
		placeOf[p.Team] = p.Place
	}
	// 2..4. Per-human: history append (idempotent), absolute rating, ladder.
	for _, seat := range st.Seats {
		if seat.IsBot {
			continue
		}
		r, ok := st.Ratings[seat.AccountID]
		if !ok {
			continue
		}
		if err := s.appendHistoryOnce(seat.AccountID, historyLine{
			MatchID: st.MatchID, Team: seat.Team, Place: placeOf[seat.Team],
			MMRAfter: r.MMR, At: st.EndedAt,
		}); err != nil {
			return err
		}
		if err := s.accounts.SetRating(ctx, seat.AccountID, r.MMR, r.Games, r.Wins); err != nil {
			return err
		}
		// M COIN placement reward: the record carries the ABSOLUTE
		// post-match balance, so replay/duplicates converge like MMR.
		if s.wallet != nil {
			if err := s.wallet.SetMCoinAbsolute(ctx, seat.AccountID, r.MCoin); err != nil {
				return err
			}
			// 水晶 (task #118) — the free meta-progression currency. This is
			// the ONLY grant path in the system; the client has no earn route.
			// Absolute like M COIN, so a duplicate callback or a WAL replay
			// converges instead of minting.
			//
			// The `> 0` guard is load-bearing, not defensive noise: match
			// records written BEFORE this field existed decode with Crystal
			// == 0, and applying that absolutely would wipe every crystal
			// those players had earned the moment the WAL replayed them.
			// A real grant is never 0 (the smallest placement award is
			// wallet.CrystalPlace4), so skipping zero loses nothing.
			if r.Crystal > 0 {
				if err := s.wallet.SetCrystalAbsolute(ctx, seat.AccountID, r.Crystal); err != nil {
					return err
				}
			}
		}
		if err := s.rank.Add(ctx, seat.AccountID, r.MMR); err != nil {
			return err
		}
		// Visible cumulative-points ladder: the account record is the durable
		// truth (a Redis wipe rebuilds both boards from it), and the ZSETs are
		// updated to the same absolute values. Both are idempotent.
		if err := s.accounts.SetSeasonPoints(ctx, seat.AccountID, r.Points, r.ChampionID, r.ChampionPoints); err != nil {
			return err
		}
		if err := s.rank.AddPoints(ctx, seat.AccountID, r.Points); err != nil {
			return err
		}
		if r.ChampionID != "" {
			if err := s.rank.AddChampionPoints(ctx, seat.AccountID, r.ChampionID, r.ChampionPoints); err != nil {
				return err
			}
		}
		_ = s.pres.Set(ctx, seat.AccountID, presence.StateInLobby)
	}
	// 5. Pending-match cleanup.
	pipe := s.rdb.R.TxPipeline()
	pipe.ZRem(ctx, redisx.KeyMatchesPending(), st.MatchID)
	pipe.Del(ctx, redisx.KeyMatchPending(st.MatchID))
	if _, err := pipe.Exec(ctx); err != nil {
		return err
	}
	// 6. Room disposal (members are back in the lobby).
	if st.RoomID != "" && s.rooms != nil {
		_ = s.rooms.Dispose(ctx, st.RoomID)
	}
	return nil
}

// appendHistoryOnce appends the line unless the matchId is already present
// (WAL replay / duplicate callback safety).
func (s *Settler) appendHistoryOnce(accountID string, line historyLine) error {
	existing, err := s.store.ReadLines(ColHistory, accountID)
	if err != nil {
		return err
	}
	for _, raw := range existing {
		var h historyLine
		if json.Unmarshal(raw, &h) == nil && h.MatchID == line.MatchID {
			return nil
		}
	}
	return s.store.AppendLine(ColHistory, accountID, line)
}
