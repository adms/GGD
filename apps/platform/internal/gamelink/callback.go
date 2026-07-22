package gamelink

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/httpx"
	"github.com/ggd/platform/internal/ranking"
)

// ResultRequest is the inbound result callback body from the game server.
type ResultRequest struct {
	MatchID    string       `json:"matchId"`
	Mode       string       `json:"mode"`
	MapID      string       `json:"mapId"`
	Placements []TeamPlace  `json:"placements"`
	Seats      []ResultSeat `json:"seats"`
	EndedAt    int64        `json:"endedAt"` // unix ms, optional
}

// MountInternal registers the HMAC-guarded internal callback route on the
// /api/v1 subrouter. This route is never exposed through the public edge —
// Nginx only proxies /api to the platform, and NetworkPolicy restricts who
// can reach it; the HMAC is defense in depth.
func (s *Service) MountInternal(r chi.Router) {
	r.Post("/internal/matches/{matchId}/result", s.handleResult)
}

func (s *Service) handleResult(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		httpx.WriteError(w, httpx.BadRequest("unreadable body"))
		return
	}
	ts := r.Header.Get(HeaderTimestamp)
	sig := r.Header.Get(HeaderAuth)
	if !Verify(s.secret, ts, sig, body, s.now(), s.skew) {
		httpx.WriteError(w, httpx.Unauthorized("invalid internal signature"))
		return
	}
	var req ResultRequest
	if err := json.Unmarshal(body, &req); err != nil {
		httpx.WriteError(w, httpx.BadRequest("invalid JSON body"))
		return
	}
	if req.MatchID == "" || req.MatchID != chi.URLParam(r, "matchId") {
		httpx.WriteError(w, httpx.BadRequest("matchId mismatch"))
		return
	}

	// Idempotency: first writer wins; duplicates are acknowledged as such.
	fresh, err := s.rdb.SetNX(r.Context(), redisx.KeyMatchDone(req.MatchID), "1", 0)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	if !fresh {
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "duplicate"})
		return
	}

	st, err := s.buildSettlement(r.Context(), req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	// WAL: intent (absolute values) → apply → commit.
	if err := s.journal.AppendIntent(st.MatchID, st); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if err := s.settle.Apply(r.Context(), st); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if err := s.journal.AppendCommit(st.MatchID); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// pendingChampions reads the champion each account was reserved onto from the
// pending-match seats (recorded at StartMatch), mapping accountId -> championId.
// Returns an empty map when the pending record or its seats are absent.
func (s *Service) pendingChampions(ctx context.Context, matchID string) map[string]string {
	out := map[string]string{}
	raw, err := s.rdb.R.HGet(ctx, redisx.KeyMatchPending(matchID), "seats").Result()
	if err != nil || raw == "" {
		return out
	}
	var seats []Seat
	if err := json.Unmarshal([]byte(raw), &seats); err != nil {
		return out
	}
	for _, st := range seats {
		if st.Champion != "" {
			out[st.AccountID] = st.Champion
		}
	}
	return out
}

// isGuestSeat reports whether a non-bot seat belongs to a couch guest
// (":p2".."p4" pseudo-id, or a legacy bare ":p" suffix) — guests have no
// account and earn nothing.
func isGuestSeat(accountID string) bool { return IsGuestID(accountID) }

// buildSettlement computes absolute post-match ratings via Elo, absolute
// post-match M COIN balances from the placement reward table, and resolves the
// owning room from the pending-match hash. Bot and guest seats (isBot, ":p"
// suffix, or no account file) are skipped: no rating, no M COIN.
func (s *Service) buildSettlement(ctx context.Context, req ResultRequest) (Settlement, error) {
	placeOf := map[int]int{}
	for _, p := range req.Placements {
		placeOf[p.Team] = p.Place
	}
	roomID, _ := s.rdb.R.HGet(ctx, redisx.KeyMatchPending(req.MatchID), "roomId").Result()
	// The champion each account played: prefer the value on the result seat,
	// else the champion recorded on the pending-match seats at reservation.
	champOf := s.pendingChampions(ctx, req.MatchID)
	ladder := s.rank.Ladder()
	// Group human seats into teams with their current ratings.
	byTeam := map[int][]ranking.PlayerRating{}
	games := map[string]int{}
	wins := map[string]int{}
	mcoin := map[string]int{}
	points := map[string]int{}
	champID := map[string]string{}
	champPoints := map[string]int{}
	for _, seat := range req.Seats {
		if seat.IsBot || isGuestSeat(seat.AccountID) {
			continue
		}
		a, err := s.accounts.GetByID(ctx, seat.AccountID)
		if errors.Is(err, account.ErrNotFound) {
			continue // guest without an account file: earns nothing
		}
		if err != nil {
			return Settlement{}, err
		}
		byTeam[seat.Team] = append(byTeam[seat.Team], ranking.PlayerRating{
			AccountID: a.ID, MMR: a.MMR, Games: a.Games,
		})
		games[a.ID] = a.Games + 1
		wins[a.ID] = a.Wins
		if placeOf[seat.Team] == 1 {
			wins[a.ID] = a.Wins + 1
		}
		// Absolute post-match balance = current balance + placement reward.
		mcoin[a.ID] = a.MCoin + s.cat.RewardFor(placeOf[seat.Team])
		// Visible cumulative points: absolute post-match value = current +
		// placement award, floored at 0 (place 1 +100, 2 +40, 3 −10, 4 −30).
		// Player board always; champion board when the played champion is known.
		// Only HUMAN, non-guest seats reach here — bots and couch guests were
		// skipped above, exactly like MMR.
		place := placeOf[seat.Team]
		points[a.ID] = ladder.AwardPoints(a.SeasonPoints, place)
		cid := seat.ChampionID
		if cid == "" {
			cid = champOf[seat.AccountID]
		}
		champID[a.ID] = cid
		if cid != "" {
			champPoints[a.ID] = ladder.AwardPoints(a.ChampionPoints[cid], place)
		}
	}
	teams := make([]ranking.TeamResult, 0, len(byTeam))
	for team, players := range byTeam {
		teams = append(teams, ranking.TeamResult{Team: team, Place: placeOf[team], Players: players})
	}
	newMMR := ranking.ComputeElo(teams)
	ratings := map[string]RatingAfter{}
	for aid, mmr := range newMMR {
		ratings[aid] = RatingAfter{
			MMR: mmr, Games: games[aid], Wins: wins[aid], MCoin: mcoin[aid],
			Points: points[aid], ChampionID: champID[aid], ChampionPoints: champPoints[aid],
		}
	}

	endedAt := time.Now()
	if req.EndedAt > 0 {
		endedAt = time.UnixMilli(req.EndedAt)
	}
	return Settlement{
		MatchID: req.MatchID, RoomID: roomID, Mode: req.Mode, MapID: req.MapID,
		Status: "completed", Placements: req.Placements, Seats: req.Seats,
		Ratings: ratings, EndedAt: endedAt,
	}, nil
}
