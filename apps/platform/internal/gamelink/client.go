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
	// Owned is the account's PLAYABLE champion set — every free champion plus its
	// unlocked priced champions (see PlayableChampions). The game-server enforces
	// it authoritatively at champ-select lock-in so an unowned champion cannot be
	// selected, MANUAL or RANDOM, even by a crafted client (task #201). Bots and
	// couch guests carry nil (omitted on the wire), which leaves that seat's
	// ownership unenforced game-server side (fail-open — never an empty roster,
	// #130). Guests inherit their owning member's set.
	Owned []string `json:"owned,omitempty"`
}

// PlayableChampions returns the champion ids an account may select: every free
// (price 0 / unpriced) champion plus every unlocked priced champion. This is
// the exact rule wallet.Service.OwnsChampion enforces per-champion, hoisted to
// the whole set so the game-server can gate champ-select the same way the store
// gates a purchase.
//
// A nil `owned` slice (an account written before the wallet existed, or one that
// never opened champ-select and so was never seeded) yields precisely the free
// set — which is the #130 onboarding floor: a brand-new account is never handed
// an empty selectable roster and left to spawn dead. The result is sorted and
// de-duplicated so it is stable on the wire and in tests.
func PlayableChampions(free, owned []string) []string {
	set := make(map[string]struct{}, len(free)+len(owned))
	for _, id := range free {
		if id != "" {
			set[id] = struct{}{}
		}
	}
	for _, id := range owned {
		if id != "" {
			set[id] = struct{}{}
		}
	}
	out := make([]string, 0, len(set))
	for id := range set {
		out = append(out, id)
	}
	sort.Strings(out)
	return out
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
	// RogueliteMobs is the per-room 肉鴿殭屍模式 toggle (#215), *bool so an omitted
	// value (nil) reaches the game server as absent === ON. The JSON tag MUST
	// match the game server's InternalMatchRequest.rogueliteMobs byte-for-byte;
	// a typo would drop the field and mask an intended OFF as an ON.
	RogueliteMobs *bool `json:"rogueliteMobs,omitempty"`
	// Practice 是練習模式（GH#343）：單人沙盒、不結算、測試碼可用。
	// ⚠️ JSON tag 必須逐位元組是 `practice` —— game server 那一端讀的是
	// `InternalMatchRequest.practice`，再由 `MatchRoom.onCreate` 的
	// `options.practice === true` 決定這一場是不是練習房。tag 打錯不會有人報錯：
	// 欄位靜靜地消失，玩家拿到的是一間**會結算、沒有測試碼**的普通房，而
	// 客戶端仍然畫著練習模式的樣子。守衛：`practice_wire_test.go` 讀的是真的
	// JSON 字串鍵，不是這個 struct。
	Practice bool `json:"practice,omitempty"`
	// The #288 host-set pacing knobs (選角 / 商店 / 每回合秒數 + 總回合數),
	// embedded so they inline into this JSON body under the SAME field names the
	// room hash and the client form use. Every field is a pointer: nil is absent
	// on the wire, which the game server reads as "use the shipped
	// config.match@1 value" — including the 320s vs-bot champ select. Values are
	// forwarded UNVALIDATED by design; the bounds table lives in
	// packages/shared/src/roomSettings.ts and the game server is the one
	// authority that applies it (see room.MatchSettings for why).
	room.MatchSettings
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
	// pendTTL is the BLIND deadline used only until the first liveness
	// heartbeat arrives for a match; liveGrace is the evidence-based one that
	// replaces it from then on. See liveness.go.
	pendTTL   time.Duration
	liveGrace time.Duration
	skew      time.Duration
	now       func() time.Time
}

// New builds the gamelink service. cat supplies the M COIN placement rewards
// applied at settlement (wallet.EmptyCatalog() grants nothing). liveGrace is how
// long a match outlives its last game-server heartbeat (zero picks
// defaultLivenessGrace).
func New(rdb *redisx.Client, accounts *account.Repo, pres *presence.Service, rank *ranking.Service,
	journal *wal.WAL, settler *Settler, cat wallet.Catalog, secret, gameAddr, callbackBase string,
	pendTTL, liveGrace, skew time.Duration) *Service {
	return &Service{
		rdb: rdb, accounts: accounts, pres: pres, rank: rank, journal: journal, settle: settler,
		cat:    cat,
		http:   &http.Client{Timeout: 10 * time.Second},
		secret: secret, gameAddr: gameAddr,
		callback: callbackBase, pendTTL: pendTTL, liveGrace: liveGrace, skew: skew,
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

// attachOwnership fills Seat.Owned for every human seat with the account's
// playable champion set (task #201). Guests (":pN") share their owning member's
// set; a per-base cache means the owner + its couch guests cost one account read.
// A read error leaves that seat's Owned nil (unenforced) so a transient account
// miss cannot brick the whole match at champ-select.
func (s *Service) attachOwnership(ctx context.Context, seats []Seat) {
	free := s.cat.FreeChampions()
	cache := map[string][]string{}
	for i := range seats {
		if seats[i].IsBot {
			continue
		}
		base, _ := SplitGuestID(seats[i].AccountID)
		playable, ok := cache[base]
		if !ok {
			if a, err := s.accounts.GetByID(ctx, base); err == nil {
				playable = PlayableChampions(free, a.OwnedChampions)
			} else {
				playable = nil // unenforced on a lookup miss (fail-open)
			}
			cache[base] = playable
		}
		seats[i].Owned = playable
	}
}

// StartMatch implements room.MatchStarter: reserve seats on the game server,
// track the pending match for the reaper, and push each human its seat token.
func (s *Service) StartMatch(ctx context.Context, rm room.Room, members []room.Member) (room.StartInfo, error) {
	matchID := "m_" + ulid.MustNew(ulid.Timestamp(s.now()), rand.Reader).String()
	seats, botFill := BuildSeats(members, func(id string) (account.Account, error) {
		return s.accounts.GetByID(ctx, id)
	}, rm.BotDifficulty)

	// Task #201: stamp each HUMAN seat with the account's playable champion set so
	// the game-server can reject a lock-in of an unowned champion. Resolved from
	// the SAME loaded catalog (free roster) + the account's unlocked list; couch
	// guests inherit their owning member's set (base id). Bots get nothing and
	// stay unenforced. A lookup failure leaves the seat unenforced rather than
	// bricking the match — the game-server treats absent ownership as fail-open.
	s.attachOwnership(ctx, seats)

	req := MatchRequest{
		MatchID: matchID, Mode: "PairedDuels", MapID: rm.MapID,
		Seats: seats, BotFill: botFill,
		CallbackURL: s.callback + "/api/v1/internal/matches/" + matchID + "/result",
		// Forward the per-room #215 toggle; nil stays nil === ON on the wire.
		RogueliteMobs: rm.RogueliteMobs,
		// 練習模式（GH#343）跟著房間走。只有 StartSolo 建的單人房會是 true
		// （room.Create 主動清掉它），所以這條線上不需要再擋一次。
		//
		// ⚠️ 已知副作用，寫在這裡是因為它就發生在這條路的下游：練習房的
		// `endlessCombat` 讓它永遠不會 finishMatch，所以結束時沒有人送結果回來，
		// pending 記錄最後會被 `reaper.go` 的 ReapStuck 收掉 —— 而 ReapStuck
		// ⛔ 不呼叫 Settler.Apply，它直接寫一筆 Status:"abandoned"。
		// ⇒ 每一場練習都會在 data/matches-YYYY-MM/ 留下一筆 abandoned 記錄，
		// 而它**不動任何貨幣、MMR、賽季積分或戰績**（那五條路全部收斂在 Apply）。
		// 也就是說「完全沒有獎勵積分」仍然成立，多出來的只有一行歷史。
		Practice: rm.Practice,
		// Forward the #288 pacing knobs wholesale — one assignment for all four,
		// so a new knob added to room.MatchSettings cannot be left behind here.
		MatchSettings: rm.MatchSettings,
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

	// Track the pending match for the reaper. The deadline written here is the
	// BLIND one (s.pendTTL): at this instant the platform has no evidence about
	// this match beyond "the game-server accepted it". The first heartbeat
	// (liveness.go) replaces it with lastBeat+grace and every later beat pushes
	// it forward, so how long the match runs — 3 lives or 12 — stops being any
	// constant's business. Recording the Colyseus room id here is what lets an
	// operator (and the reaper's logs) tie a stuck platform record to the actual
	// room on the game server.
	pend := map[string]any{"roomId": rm.ID, "startedAt": s.now().UnixMilli()}
	s.recordGameRoom(pend, mr.ColyseusRoomID)
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
