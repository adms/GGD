package gamelink

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/httpx"
	"github.com/ggd/platform/internal/ranking"
	"github.com/ggd/platform/internal/wallet"
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
	// LIVENESS (#187). The same HMAC channel, for the same reason: the
	// game-server is the only party that knows a room is still ticking, and this
	// is the only way it can say so that a client cannot forge. Batch form for
	// the game-server's periodic sweep, single form for a per-room beat. See
	// liveness.go for why the reaper renews a deadline instead of guessing one.
	r.Post("/internal/matches/heartbeat", s.handleHeartbeat)
	r.Post("/internal/matches/{matchId}/heartbeat", s.handleHeartbeat)
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
	// CONTRACT GUARD (tasks #6 / #25). A finished match always has team
	// placements and seats; a body without them settles NOBODY. That is exactly
	// what the game-server used to send — it posted its own MatchResult, whose
	// `teams[]` nesting shares only `matchId` and `mode` with this struct — and
	// because the settlement of zero seats is a perfectly valid no-op, every
	// callback was HMAC-verified, applied, answered 200 "ok" and credited
	// nothing. Rejecting the empty case turns that silence into a 400 the
	// game-server logs, and it happens BEFORE the idempotency latch below so a
	// malformed body cannot also poison the match id against a corrected retry.
	if len(req.Placements) == 0 || len(req.Seats) == 0 {
		httpx.WriteError(w, httpx.BadRequest(
			"result callback has no placements/seats — nothing to settle; expected "+
				`{"placements":[{"team":n,"place":n}],"seats":[{"accountId":"…","team":n,"isBot":bool}]}`))
		return
	}

	// Idempotency: first writer wins; duplicates are acknowledged as such.
	fresh, err := s.rdb.SetNX(r.Context(), redisx.KeyMatchDone(req.MatchID), "1", 0)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	if !fresh {
		httpx.WriteJSON(w, http.StatusOK, resultAck{Status: "duplicate"})
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
	// SAY WHAT WAS ACTUALLY PAID. `settled` is the number of accounts whose
	// rating / M COIN / 水晶 this call moved; `humanSeats` is how many it was
	// offered. The game-server logs both, so "settled 0 of 2" is visible in the
	// log of the process that just finished the match rather than being
	// indistinguishable from success. A bare {"status":"ok"} was what let a
	// completely mis-shaped payload look healthy for the entire project.
	human := 0
	for _, seat := range req.Seats {
		if !seat.IsBot && !isGuestSeat(seat.AccountID) {
			human++
		}
	}
	if human > 0 && len(st.Ratings) == 0 {
		slog.Warn("match settled but credited nobody",
			"matchId", st.MatchID, "humanSeats", human,
			"hint", "every non-bot seat is a guest or has no account file on this platform")
	}
	httpx.WriteJSON(w, http.StatusOK, resultAck{Status: "ok", Settled: len(st.Ratings), HumanSeats: human})
}

// resultAck is the reply to a result callback. Settled/HumanSeats exist so the
// game-server can log what the platform actually did with the match instead of
// logging its own hope (see MatchRoom.settleToPlatform).
type resultAck struct {
	Status     string `json:"status"`
	Settled    int    `json:"settled"`
	HumanSeats int    `json:"humanSeats"`
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

	// ANTI-FARM, two tiers. Owner's rule, after he refined it:
	//   「全部玩家位置都真人才有 M幣；如果是自己隊伍 3 人都是真人那可以拿水晶，
	//     若有 bot 只能拿一半水晶」
	//
	//   M幣  — the whole 12-seat lobby must be human. It is the scarce cosmetic
	//          currency (#118), one coin, first place only; a bot anywhere means
	//          the win was not earned against people.
	//   水晶 — judged on the EARNER'S OWN TEAM, not the lobby. Three humans on
	//          your team pays in full; a bot beside you halves it.
	//
	// Why the split matters: 4 teams × 3 = 12 seats, so a lobby-wide rule would
	// mean a family of five never earns a crystal — 「打場免費賺」 would exist and
	// never happen, which is the exact failure this batch has been removing. The
	// per-team rule still kills the real exploit (soloing bots forever pays half
	// at most) while a family that fills one team together earns in full.
	//
	// A disconnect collapses into the same check: MatchRoom swaps a dropped
	// seat's driver to AI (rooms/MatchRoom.ts:5), so a leaver arrives as isBot.
	// A COUCH GUEST IS A PERSON. `:pN` seats (couch.ts / guest.go) are local
	// players 2..4 sharing one machine and one gamepad each — the owner's family
	// on the sofa. They earn nothing individually because they have no account
	// file, but they are emphatically not bots, and counting them as such would
	// mean four people playing together in one room get NO M幣 and HALF 水晶.
	// That is the opposite of what the anti-farm rule is for: it exists to stop
	// someone soloing bots, not to punish playing with people.
	humanSeat := func(s ResultSeat) bool { return !s.IsBot }
	perfectLobby := true
	botsOnTeam := map[int]int{}
	for _, seat := range req.Seats {
		if !humanSeat(seat) {
			perfectLobby = false
			botsOnTeam[seat.Team]++
		}
	}
	if !perfectLobby {
		slog.Info("no M幣 this match: lobby is not all-human",
			"matchId", req.MatchID, "seats", len(req.Seats), "teamsWithBots", len(botsOnTeam),
			"why", "a bot seat or a disconnected player (leavers arrive as isBot)")
	}
	ladder := s.rank.Ladder()
	// Group human seats into teams with their current ratings.
	byTeam := map[int][]ranking.PlayerRating{}
	games := map[string]int{}
	wins := map[string]int{}
	mcoin := map[string]int{}
	crystal := map[string]int{}
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
		// Ratings, wins and season points above are deliberately NOT gated:
		// those are standings, not currency, and nothing is farmed by inflating
		// a number that ranks you against the same people. Only the two
		// spendable currencies below are.

		// M幣: whole lobby must be human.
		//
		// ⚠️ The gated branch writes the CURRENT balance, it does not skip.
		// These are ABSOLUTE values — a missing map entry decodes as 0 and
		// `Apply` would set the balance TO zero, wiping the player's coins. A
		// test caught exactly that. The same hazard is already documented for
		// crystals ("a real grant is never 0"); this is the second instance, so
		// treat "skip an absolute write" as a wipe wherever it appears here.
		mcoin[a.ID] = a.MCoin
		if perfectLobby {
			mcoin[a.ID] = a.MCoin + s.cat.RewardFor(placeOf[seat.Team])
		}
		// 水晶 (task #118): the free 「打場免費賺」 grant. Full if this seat's OWN
		// team is three humans, HALVED if a bot (or a leaver) sits beside them.
		// Same absolute shape as M幣, but the balance lives in the wallet's own
		// meta collection rather than on the account struct, so it is read
		// through the wallet service the settler already owns (nil in narrow
		// fixtures). Integer halving rounds DOWN — a half-grant is meant to
		// sting slightly, and every place-1..4 value stays positive at half.
		if s.settle != nil && s.settle.wallet != nil {
			grant := wallet.CrystalRewardFor(placeOf[seat.Team])
			if botsOnTeam[seat.Team] > 0 {
				grant /= 2
			}
			crystal[a.ID] = s.settle.wallet.CrystalOf(ctx, a.ID) + grant
		}
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
			MMR: mmr, Games: games[aid], Wins: wins[aid], MCoin: mcoin[aid], Crystal: crystal[aid],
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
