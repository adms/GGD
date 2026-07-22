package gamelink

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/oklog/ulid/v2"
	"github.com/redis/go-redis/v9"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/data/wal"
	"github.com/ggd/platform/internal/httpx"
	"github.com/ggd/platform/internal/presence"
	"github.com/ggd/platform/internal/ranking"
	"github.com/ggd/platform/internal/room"
	"github.com/ggd/platform/internal/wallet"
)

// TotalSeats is 4 teams x 3 slots.
const TotalSeats = 12

// Seat is one seat in the reservation request.
type Seat struct {
	AccountID   string `json:"accountId"`
	DisplayName string `json:"displayName"`
	Team        int    `json:"team"`
	Slot        int    `json:"slot"`
	Champion    string `json:"champion"`
	MMR         int    `json:"mmr"`
	IsBot       bool   `json:"isBot"`
}

// BotFill describes AI backfill for the game server.
type BotFill struct {
	Count      int    `json:"count"`
	Difficulty string `json:"difficulty"`
}

// MatchRequest is the outbound POST /_internal/matches body.
type MatchRequest struct {
	MatchID     string  `json:"matchId"`
	Mode        string  `json:"mode"`
	MapID       string  `json:"mapId"`
	Seats       []Seat  `json:"seats"`
	BotFill     BotFill `json:"botFill"`
	CallbackURL string  `json:"callbackUrl"`
}

// Reservation is one human's seat token.
type Reservation struct {
	AccountID string `json:"accountId"`
	SeatToken string `json:"seatToken"`
}

// MatchResponse is the game server's reply.
type MatchResponse struct {
	MatchID        string        `json:"matchId"`
	ColyseusRoomID string        `json:"colyseusRoomId"`
	Reservations   []Reservation `json:"reservations"`
	Endpoint       string        `json:"endpoint"`
}

// SeatPush is delivered to each human over the lobby WS. SeatToken stays the
// member's OWN token (compat with older clients); SeatTokens carries one entry
// per local player on that member's machine (owner first, then :p2..:p4).
type SeatPush struct {
	Type       string        `json:"type"` // "match_ready"
	MatchID    string        `json:"matchId"`
	Endpoint   string        `json:"endpoint"`
	SeatToken  string        `json:"seatToken"`
	SeatTokens []Reservation `json:"seatTokens,omitempty"`
}

// Service implements the seam. It satisfies room.MatchStarter.
type Service struct {
	rdb      *redisx.Client
	accounts *account.Repo
	pres     *presence.Service
	rank     *ranking.Service
	journal  *wal.WAL
	settle   *Settler
	cat      wallet.Catalog
	http     *http.Client
	secret   string
	gameAddr string
	callback string
	pendTTL  time.Duration
	skew     time.Duration
	now      func() time.Time
}

// New builds the gamelink service. cat supplies the M COIN placement rewards
// applied at settlement (wallet.EmptyCatalog() grants nothing).
func New(rdb *redisx.Client, accounts *account.Repo, pres *presence.Service, rank *ranking.Service,
	journal *wal.WAL, settler *Settler, cat wallet.Catalog, secret, gameAddr, callbackBase string,
	pendTTL, skew time.Duration) *Service {
	return &Service{
		rdb: rdb, accounts: accounts, pres: pres, rank: rank, journal: journal, settle: settler,
		cat:    cat,
		http:   &http.Client{Timeout: 10 * time.Second},
		secret: secret, gameAddr: gameAddr,
		callback: callbackBase, pendTTL: pendTTL, skew: skew,
		now: time.Now,
	}
}

// SetNow overrides the clock (tests).
func (s *Service) SetNow(fn func() time.Time) { s.now = fn }

// BuildSeats deterministically assigns humans (members in ULID order, each
// expanded into its couch group: owner + ":p2".."p4" guest pseudo-ids) to
// teams/slots and backfills bots so that every match has exactly 12 seats.
// A couch group is packed onto ONE team whenever a team has enough free slots
// (first-fit); oversubscribed leftovers spill into the remaining free slots.
// Exported for the seam unit tests.
func BuildSeats(members []room.Member, lookup func(id string) (account.Account, error), difficulty string) ([]Seat, BotFill) {
	const teamSize = 3
	teamCount := TotalSeats / teamSize

	sorted := make([]room.Member, len(members))
	copy(sorted, members)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].AccountID < sorted[j].AccountID })

	// Expand each member into its couch group.
	groups := make([][]Seat, 0, len(sorted))
	humans := 0
	for _, m := range sorted {
		n := m.LocalPlayers
		if n < 1 {
			n = 1
		}
		if n > room.MaxLocalPlayers {
			n = room.MaxLocalPlayers
		}
		owner := Seat{AccountID: m.AccountID}
		if a, err := lookup(m.AccountID); err == nil {
			owner.DisplayName = a.Username
			owner.MMR = a.MMR
		}
		g := []Seat{owner}
		for k := 2; k <= n; k++ {
			guest := Seat{AccountID: GuestID(m.AccountID, k), MMR: owner.MMR}
			if owner.DisplayName != "" {
				guest.DisplayName = fmt.Sprintf("%s (%dP)", owner.DisplayName, k)
			} else {
				guest.DisplayName = fmt.Sprintf("(%dP)", k)
			}
			g = append(g, guest)
		}
		humans += n
		groups = append(groups, g)
	}

	// First-fit team packing, then spill leftovers into any free slot.
	teams := make([][]Seat, teamCount)
	var overflow []Seat
	for _, g := range groups {
		placed := false
		for t := 0; t < teamCount; t++ {
			if teamSize-len(teams[t]) >= len(g) {
				teams[t] = append(teams[t], g...)
				placed = true
				break
			}
		}
		if !placed {
			overflow = append(overflow, g...)
		}
	}
	for _, s := range overflow {
		for t := 0; t < teamCount; t++ {
			if len(teams[t]) < teamSize {
				teams[t] = append(teams[t], s)
				break
			}
		}
	}

	// Flatten in team/slot order; empty slots become bots.
	seats := make([]Seat, 0, TotalSeats)
	for t := 0; t < teamCount; t++ {
		for sl := 0; sl < teamSize; sl++ {
			idx := t*teamSize + sl
			if sl < len(teams[t]) {
				s := teams[t][sl]
				s.Team, s.Slot = t, sl
				seats = append(seats, s)
			} else {
				seats = append(seats, Seat{
					AccountID:   fmt.Sprintf("bot-%02d", idx),
					DisplayName: fmt.Sprintf("Bot %02d", idx),
					Team:        t, Slot: sl, IsBot: true,
				})
			}
		}
	}
	return seats, BotFill{Count: TotalSeats - humans, Difficulty: difficulty}
}

// StartMatch implements room.MatchStarter: reserve seats on the game server,
// track the pending match for the reaper, and push each human its seat token.
func (s *Service) StartMatch(ctx context.Context, rm room.Room, members []room.Member) (room.StartInfo, error) {
	matchID := "m_" + ulid.MustNew(ulid.Timestamp(s.now()), rand.Reader).String()
	seats, botFill := BuildSeats(members, func(id string) (account.Account, error) {
		return s.accounts.GetByID(ctx, id)
	}, rm.BotDifficulty)

	req := MatchRequest{
		MatchID: matchID, Mode: "PairedDuels", MapID: rm.MapID,
		Seats: seats, BotFill: botFill,
		CallbackURL: s.callback + "/api/v1/internal/matches/" + matchID + "/result",
	}
	body, err := json.Marshal(req)
	if err != nil {
		return room.StartInfo{}, err
	}
	ts := strconv.FormatInt(s.now().Unix(), 10)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, s.gameAddr+"/_internal/matches", bytes.NewReader(body))
	if err != nil {
		return room.StartInfo{}, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set(HeaderTimestamp, ts)
	httpReq.Header.Set(HeaderAuth, Sign(s.secret, ts, body))

	resp, err := s.http.Do(httpReq)
	if err != nil {
		return room.StartInfo{}, httpx.Err(http.StatusBadGateway, "game_unreachable", "game server unreachable")
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return room.StartInfo{}, httpx.Err(http.StatusBadGateway, "game_rejected",
			fmt.Sprintf("game server rejected the match (%d)", resp.StatusCode))
	}
	var mr MatchResponse
	if err := json.Unmarshal(respBody, &mr); err != nil {
		return room.StartInfo{}, httpx.Err(http.StatusBadGateway, "game_bad_response", "malformed game server response")
	}

	// Track the pending match for the reaper.
	pend := map[string]any{"roomId": rm.ID, "startedAt": s.now().UnixMilli()}
	if seatsJSON, err := json.Marshal(seats); err == nil {
		pend["seats"] = string(seatsJSON)
	}
	pipe := s.rdb.R.TxPipeline()
	pipe.HSet(ctx, redisx.KeyMatchPending(matchID), pend)
	pipe.ZAdd(ctx, redisx.KeyMatchesPending(), redis.Z{
		Score:  float64(s.now().Add(s.pendTTL).Unix()),
		Member: matchID,
	})
	if _, err := pipe.Exec(ctx); err != nil {
		return room.StartInfo{}, err
	}

	// Push each member its reservation(s) over the lobby WS channel. Couch
	// guests (":pN" pseudo-ids) have no WS of their own — their tokens ride
	// the owning member's push as seatTokens[] entries (owner first).
	byBase := map[string][]Reservation{}
	baseOrder := []string{}
	for _, r := range mr.Reservations {
		base, _ := SplitGuestID(r.AccountID)
		if _, ok := byBase[base]; !ok {
			baseOrder = append(baseOrder, base)
		}
		byBase[base] = append(byBase[base], r)
	}
	for _, base := range baseOrder {
		entries := byBase[base]
		sort.SliceStable(entries, func(i, j int) bool {
			_, pi := SplitGuestID(entries[i].AccountID)
			_, pj := SplitGuestID(entries[j].AccountID)
			return pi < pj
		})
		_ = s.rdb.PublishJSON(ctx, redisx.ChanLobby(base), SeatPush{
			Type: "match_ready", MatchID: matchID, Endpoint: mr.Endpoint,
			SeatToken: entries[0].SeatToken, SeatTokens: entries,
		})
	}
	return room.StartInfo{MatchID: matchID, BotFill: botFill.Count}, nil
}
