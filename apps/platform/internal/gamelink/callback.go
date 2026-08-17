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

	// TWO CURRENCIES, TWO RULES, AND THEY ASK DIFFERENT QUESTIONS.
	//
	//   M幣  — the whole 12-seat lobby must be human (owner: 「全部玩家位置都真人
	//          才有 M幣」). It is the scarce cosmetic currency (#118), one coin,
	//          first place only; a bot anywhere means the win was not earned
	//          against people. UNCHANGED.
	//   水晶 — scaled by HOW MANY PEOPLE ARE IN THE LOBBY. owner 2026-08-17, 逐字:
	//          「只要有兩真人(N≥2)參加，不論哪個陣營都可以，所有玩家都 (N+1) 倍，
	//            所以最大 13 倍」「120 × 13 (MAX)、120 × 3 (N=2)、120 (N=1)」
	//
	// ⭐ N IS THE WHOLE LOBBY, ⛔ NOT THE EARNER'S TEAM. That single word is the
	// entire difference from the 2026-08-01 rule it replaces (a per-team test
	// that halved the grant when a bot sat beside you). Under the old rule two
	// friends who joined the SAME lobby but drew OPPOSITE teams each got half —
	// playing together paid worse than soloing bots. Both now get ×3.
	//
	// A disconnect collapses into the bot case: MatchRoom swaps a dropped seat's
	// driver to AI (rooms/MatchRoom.ts:5), so a leaver arrives as isBot and stops
	// counting towards N — which is the right direction, since the lobby really
	// did shrink.
	//
	// ⚠️ A COUCH GUEST COUNTS A HEAD BUT CANNOT BE PAID. `:pN` seats (couch.ts /
	// guest.go) are local players 2..4 sharing one machine — real people, so they
	// raise N for everybody in the lobby, but they have no account file, so the
	// settlement loop below skips them and they receive nothing themselves. The
	// asymmetry is deliberate: four people on one sofa should make the lobby pay
	// like a four-human lobby, and the alternative (not counting them) is the
	// 「打場免費賺」 failure the owner has been removing all batch.
	humanSeat := func(s ResultSeat) bool { return !s.IsBot }
	humansInLobby := 0
	perfectLobby := true
	botsOnTeam := map[int]int{}
	for _, seat := range req.Seats {
		if !humanSeat(seat) {
			perfectLobby = false
			botsOnTeam[seat.Team]++
			continue
		}
		humansInLobby++
	}
	if !perfectLobby {
		slog.Info("no M幣 this match: lobby is not all-human",
			"matchId", req.MatchID, "seats", len(req.Seats), "teamsWithBots", len(botsOnTeam),
			"why", "a bot seat or a disconnected player (leavers arrive as isBot)")
	}
	ladder := s.rank.Ladder()
	// 排名獎勵的規則,跟水晶一樣是**每一場重讀**的(後台存檔不必重開 shard)。
	standingsRules := s.rank.StandingsRulesNow()
	// Group human seats into teams with their current ratings.
	byTeam := map[int][]ranking.PlayerRating{}
	games := map[string]int{}
	wins := map[string]int{}
	mcoin := map[string]int{}
	crystal := map[string]int{}
	points := map[string]int{}
	champID := map[string]string{}
	champPoints := map[string]int{}
	// 賽前的積分,留到迴圈之後才換算 —— 宿敵加成要先看過**整場**的名次才算得出來。
	preSeasonPoints := map[string]int{}
	preChampPoints := map[string]int{}
	standSeats := []standingsSeat{}
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
		// ⚠️ 這裡以前寫著「名次與積分不設閘,因為它們不是貨幣」。owner 2026-08-17
		// 推翻了那一句:「MMR 倍率跟賽季積分也是類似的規則,獎勵大家多打真人賽」。
		// 所以它們現在也吃真人倍率(＋宿敵加成),只是**吃法不同** —— 積分吃滿、
		// MMR 的 K 值只吃一小部分,理由寫在 internal/ranking/standings.go 的檔頭。
		// 換算在迴圈之後做,因為宿敵加成要先知道整場有誰、名次如何。

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
		// 水晶 (task #118, re-ruled 2026-08-17): the free 「打場免費賺」 grant =
		// placement base × the whole-lobby multiplier explained above. Same
		// absolute shape as M幣, but the balance lives in the wallet's own meta
		// collection rather than on the account struct, so it is read through the
		// wallet service the settler already owns (nil in narrow fixtures).
		//
		// ⛔ The `N+1` arithmetic is NOT written here — wallet.CrystalMultiplier
		// owns it, so the number the owner retunes has exactly one home. The
		// rules themselves come from Service.CrystalRulesNow (shipped values with
		// the operator's live 商店經濟 override on top), read per settlement so a
		// console save reaches the very next match with no restart.
		if s.settle != nil && s.settle.wallet != nil {
			rules := s.settle.wallet.CrystalRulesNow()
			grant := rules.RewardFor(placeOf[seat.Team]) * wallet.CrystalMultiplier(humansInLobby, rules)
			crystal[a.ID] = s.settle.wallet.CrystalOf(ctx, a.ID) + grant
		}
		// Visible cumulative points: absolute post-match value = current +
		// placement award, floored at 0 (place 1 +100, 2 +40, 3 −10, 4 −30).
		// Player board always; champion board when the played champion is known.
		// Only HUMAN, non-guest seats reach here — bots and couch guests were
		// skipped above, exactly like MMR.
		place := placeOf[seat.Team]
		cid := seat.ChampionID
		if cid == "" {
			cid = champOf[seat.AccountID]
		}
		champID[a.ID] = cid
		preSeasonPoints[a.ID] = a.SeasonPoints
		preChampPoints[a.ID] = a.ChampionPoints[cid]
		standSeats = append(standSeats, standingsSeat{AccountID: a.ID, Team: seat.Team, Place: place})
	}
	// 真人倍率 + 宿敵加成。⚠️ 讀的是**這一場之前**的對戰紀錄:這一場的勝負要等
	// Settler.Apply 才寫進去,所以同一場裡沒有人會被自己這一場的結果加成到。
	awards := s.standingsAwards(ctx, standingsRules, humansInLobby, standSeats)
	for _, ss := range standSeats {
		aw := awardOf(awards, ss.AccountID)
		points[ss.AccountID] = ladder.AwardPointsScaled(preSeasonPoints[ss.AccountID], ss.Place, aw.PointsPct)
		if champID[ss.AccountID] != "" {
			champPoints[ss.AccountID] = ladder.AwardPointsScaled(preChampPoints[ss.AccountID], ss.Place, aw.PointsPct)
		}
	}
	// Elo 的 K 值。⛔ 這裡要用索引改回 slice 裡的那一份 —— 對 range 變數的副本
	// 寫入會編譯得過、跑得過,而 MMR 的加成整個消失且沒有任何東西會紅。
	for team := range byTeam {
		for i := range byTeam[team] {
			byTeam[team][i].KMulPct = awardOf(awards, byTeam[team][i].AccountID).KMulPct
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
