package gamelink

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
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
	// 0. 練習房**絕對不可以**在這裡被結算（GH#349 後續，owner 2026-08-20「do it」）。
	//
	// 今天它一次都不會發生：game server 的 `MatchRoom.settleToPlatform` 對練習房
	// 整條 return，連結算回呼都不發。
	// ⛔ 但「今天不會發生」不是一道閘 —— 它是**另一個 repo 的另一個檔案裡的一行
	// early return**。`endlessCombat` 一旦被關掉、或練習房長出任何結束條件，
	// 這條路就會開始發水晶／M 幣／MMR／賽季積分／對戰紀錄，而且**沒有任何東西會說**。
	//
	// ⭐ 這道閘刻意是 **fail-LOUD** 的。本檔原本有一句「⛔ 不要在這裡再放一道
	// 『假的』練習房閘 —— 那會讓人以為這條路擋得住」，那個顧慮是對的，但它針對的是
	// **靜默**的閘。走到這裡代表上游的不變式已經破了，所以它用 error 級別喊出來，
	// ⛔ 而不是安靜地 return nil 假裝一切正常。
	//
	// ⚠️ 讀不到 Redis 也拒絕：不知道就不付錢。一次沒發到的練習房結算等於零損失，
	// 一次錯發的貨幣是**不可逆**的（水晶與 M 幣沒有回收路徑）。
	if practice, known := s.isPracticeMatch(ctx, st.MatchID); practice || !known {
		slog.Error("settlement arrived for a match that must not pay out — refusing",
			"matchId", st.MatchID, "roomId", st.RoomID,
			"practice", practice, "pendingReadable", known,
			"why", "practice rooms never reach Settler.Apply; an upstream invariant broke")
		return s.finishPending(ctx, st)
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
	// 4.5 對戰紀錄(head-to-head,owner 2026-08-17):同一場裡每一對敵對真人,
	// 名次高的算贏。
	//
	// ⚠️ 它是**累加**的,不像上面每一項都是絕對值,所以冪等要自己顧:
	// RecordHeadToHead 用每一列記著的最近 matchId 去重。會走第二次的是開機 WAL
	// 重播(data/boot),而那條路一定帶同一個 matchId。
	//
	// ⚠️ 練習房不會到這裡 —— 兩層:game server 的 MatchRoom.settleToPlatform 對練習
	// 房整條 return(另一個 repo),而且 Apply 開頭第 0 步現在有一道 **fail-loud** 的閘。
	// ⛔ 不要在這裡再放第三道:重複的閘只會讓人不確定哪一道在生效。
	if err := s.recordHeadToHead(ctx, st, placeOf); err != nil {
		return err
	}
	// 5..6. Pending-match cleanup + room disposal.
	return s.finishPending(ctx, st)
}

// finishPending clears the pending-match bookkeeping and disposes the room.
//
// It is shared by the normal settlement path and the practice-room refusal
// above ON PURPOSE: refusing to PAY a match must never mean refusing to CLEAN
// UP after it. A practice room that is denied payout but left in the pending
// ZSET would be re-reaped forever, and its room would never be disposed.
func (s *Settler) finishPending(ctx context.Context, st Settlement) error {
	pipe := s.rdb.R.TxPipeline()
	pipe.ZRem(ctx, redisx.KeyMatchesPending(), st.MatchID)
	pipe.Del(ctx, redisx.KeyMatchPending(st.MatchID))
	if _, err := pipe.Exec(ctx); err != nil {
		return err
	}
	if st.RoomID != "" && s.rooms != nil {
		_ = s.rooms.Dispose(ctx, st.RoomID)
	}
	return nil
}

// isPracticeMatch reads the practice flag StartMatch stamped on the pending
// hash (see fieldPractice in reaper.go).
//
// ⚠️ It reads Redis, and Redis being down must NOT turn into "pay out a
// practice match": a read error means we do not KNOW, and the safe answer for
// an unknown is the one that cannot mint currency. So an error reads as
// practice=false only when the hash genuinely exists without the flag; a
// failed read is reported to the caller, which refuses.
func (s *Settler) isPracticeMatch(ctx context.Context, matchID string) (practice bool, known bool) {
	pend, err := s.rdb.R.HGetAll(ctx, redisx.KeyMatchPending(matchID)).Result()
	if err != nil {
		return false, false
	}
	if len(pend) == 0 {
		// No pending hash at all: this is a WAL replay or a duplicate
		// callback of an already-cleaned match. Those are the idempotent
		// paths every step below is built for, so let them through.
		return false, true
	}
	return pend[fieldPractice] == "1", true
}

// recordHeadToHead 把這一場每一對**敵對且都有帳號**的真人記進對戰紀錄。
//
// 誰算數的判準跟 Apply 的主迴圈一模一樣:非 bot,而且 st.Ratings 裡有這個 id。
// 後半句才是關鍵 —— 沙發客(`:pN`)與沒有帳號檔的座位是真人、會推高全場的真人倍率,
// 但他們沒有帳號可以掛紀錄,而 Ratings 正是「這個座位真的有帳號」的那份名單。
//
// 錯誤是往上回的,⛔ 不吞:沒有 commit 的 intent 會在開機時重播,而重播對這一項是
// 安全的(已寫好的那幾對被去重,失敗的那一對重試)。
func (s *Settler) recordHeadToHead(ctx context.Context, st Settlement, placeOf map[int]int) error {
	if s.rank == nil {
		return nil
	}
	seats := make([]ResultSeat, 0, len(st.Seats))
	for _, seat := range st.Seats {
		if seat.IsBot {
			continue
		}
		if _, ok := st.Ratings[seat.AccountID]; !ok {
			continue
		}
		seats = append(seats, seat)
	}
	for i := 0; i < len(seats); i++ {
		for j := i + 1; j < len(seats); j++ {
			a, b := seats[i], seats[j]
			pa, pb := placeOf[a.Team], placeOf[b.Team]
			if a.Team == b.Team || pa == pb {
				continue // 同隊、或同名次:沒有勝負可記
			}
			winner, loser := a.AccountID, b.AccountID
			if pb < pa {
				winner, loser = b.AccountID, a.AccountID
			}
			if err := s.rank.RecordHeadToHead(ctx, st.MatchID, winner, loser, st.EndedAt); err != nil {
				return err
			}
		}
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
