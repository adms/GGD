// Package room implements Redis-only ephemeral rooms (hash + members set +
// rooms:open ZSET), host-authorized settings/start, ready-up tracking, invite
// tokens and durable room templates.
package room

import (
	"context"
	"crypto/rand"
	"errors"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/oklog/ulid/v2"
	"github.com/redis/go-redis/v9"

	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/httpx"
	"github.com/ggd/platform/internal/presence"
)

// MaxPlayers is fixed by the game mode: 4 teams x 3 seats.
const MaxPlayers = 12

// MaxLocalPlayers caps couch play at 4 pads on one machine.
const MaxLocalPlayers = 4

// Statuses.
const (
	StatusOpen    = "open"
	StatusInMatch = "in-match"
)

// Room is the ephemeral room state stored as a Redis hash.
type Room struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	HostID        string `json:"hostId"`
	MapID         string `json:"mapId"`
	Mode          string `json:"mode"`
	BotDifficulty string `json:"botDifficulty"`
	Status        string `json:"status"`
	CreatedAt     int64  `json:"createdAt"`
}

// Settings are the host-editable knobs.
type Settings struct {
	Name          string `json:"name,omitempty"`
	MapID         string `json:"mapId,omitempty"`
	BotDifficulty string `json:"botDifficulty,omitempty"`
}

// Member is one room member with ready state. LocalPlayers (1..4) is how many
// couch players share that member's machine; each extra one occupies a seat.
type Member struct {
	AccountID    string `json:"accountId"`
	Ready        bool   `json:"ready"`
	IsHost       bool   `json:"isHost"`
	LocalPlayers int    `json:"localPlayers"`
}

// StartInfo is what a successful start hands back to the host.
type StartInfo struct {
	MatchID string `json:"matchId"`
	BotFill int    `json:"botFill"`
}

// MatchStarter is the seam to internal/gamelink (avoids an import cycle).
type MatchStarter interface {
	StartMatch(ctx context.Context, rm Room, members []Member) (StartInfo, error)
}

// ChampionOwnership is the seam to internal/wallet: start is rejected when a
// member picked a priced champion they do not own.
type ChampionOwnership interface {
	OwnsChampion(ctx context.Context, accountID, championID string) (bool, error)
}

// ErrNotFound is returned for unknown/expired rooms.
var ErrNotFound = httpx.NotFound("room not found")

// Service owns room lifecycle in Redis.
type Service struct {
	rdb     *redisx.Client
	pres    *presence.Service
	starter MatchStarter
	owns    ChampionOwnership
}

// New builds the room service. starter may be set later via SetStarter.
func New(rdb *redisx.Client, pres *presence.Service) *Service {
	return &Service{rdb: rdb, pres: pres}
}

// SetStarter injects the gamelink seam.
func (s *Service) SetStarter(st MatchStarter) { s.starter = st }

// SetOwnership injects the wallet champion-ownership seam. nil disables the
// champ-select ownership gate.
func (s *Service) SetOwnership(o ChampionOwnership) { s.owns = o }

func newRoomID() string {
	return "r_" + ulid.MustNew(ulid.Timestamp(time.Now()), rand.Reader).String()
}

// Get loads one room hash.
func (s *Service) Get(ctx context.Context, roomID string) (Room, error) {
	m, err := s.rdb.R.HGetAll(ctx, redisx.KeyRoom(roomID)).Result()
	if err != nil {
		return Room{}, err
	}
	if len(m) == 0 {
		return Room{}, ErrNotFound
	}
	created, _ := strconv.ParseInt(m["createdAt"], 10, 64)
	return Room{
		ID: m["id"], Name: m["name"], HostID: m["hostId"], MapID: m["mapId"],
		Mode: m["mode"], BotDifficulty: m["botDifficulty"], Status: m["status"], CreatedAt: created,
	}, nil
}

func (s *Service) write(ctx context.Context, rm Room) error {
	return s.rdb.R.HSet(ctx, redisx.KeyRoom(rm.ID), map[string]any{
		"id": rm.ID, "name": rm.Name, "hostId": rm.HostID, "mapId": rm.MapID,
		"mode": rm.Mode, "botDifficulty": rm.BotDifficulty, "status": rm.Status,
		"createdAt": rm.CreatedAt,
	}).Err()
}

// Create makes a new open room hosted by actor and joins them.
func (s *Service) Create(ctx context.Context, actor string, st Settings) (Room, error) {
	if st.Name == "" {
		st.Name = "New Room"
	}
	if sanitizeErr := validateName(st.Name); sanitizeErr != nil {
		return Room{}, sanitizeErr
	}
	rm := Room{
		ID: newRoomID(), Name: st.Name, HostID: actor,
		MapID: firstNonEmpty(st.MapID, "arena-default"), Mode: "PairedDuels",
		BotDifficulty: firstNonEmpty(st.BotDifficulty, "normal"),
		Status:        StatusOpen, CreatedAt: time.Now().UnixMilli(),
	}
	if err := s.write(ctx, rm); err != nil {
		return Room{}, err
	}
	pipe := s.rdb.R.TxPipeline()
	pipe.SAdd(ctx, redisx.KeyRoomMembers(rm.ID), actor)
	pipe.ZAdd(ctx, redisx.KeyRoomsOpen(), redis.Z{Score: float64(rm.CreatedAt), Member: rm.ID})
	if _, err := pipe.Exec(ctx); err != nil {
		return Room{}, err
	}
	return rm, nil
}

// Join adds actor to the room, enforcing capacity.
func (s *Service) Join(ctx context.Context, actor, roomID string) (Room, error) {
	rm, err := s.Get(ctx, roomID)
	if err != nil {
		return Room{}, err
	}
	if rm.Status != StatusOpen {
		return Room{}, httpx.Conflict("room is not open")
	}
	isMember, err := s.rdb.R.SIsMember(ctx, redisx.KeyRoomMembers(roomID), actor).Result()
	if err != nil {
		return Room{}, err
	}
	if isMember {
		return rm, nil // idempotent
	}
	// Capacity counts SEATS (Σ localPlayers), not members: a couch member
	// with 3 pads occupies 3 of the 12 seats.
	seats, err := s.seatSum(ctx, roomID)
	if err != nil {
		return Room{}, err
	}
	if seats+1 > MaxPlayers {
		return Room{}, httpx.Conflict("room is full")
	}
	if err := s.rdb.R.SAdd(ctx, redisx.KeyRoomMembers(roomID), actor).Err(); err != nil {
		return Room{}, err
	}
	return rm, nil
}

// Leave removes actor; the last member leaving disposes the room. If the host
// leaves, the (ULID-)first remaining member inherits host.
func (s *Service) Leave(ctx context.Context, actor, roomID string) error {
	rm, err := s.Get(ctx, roomID)
	if err != nil {
		return err
	}
	pipe := s.rdb.R.TxPipeline()
	pipe.SRem(ctx, redisx.KeyRoomMembers(roomID), actor)
	pipe.HDel(ctx, redisx.KeyRoomReady(roomID), actor)
	pipe.HDel(ctx, redisx.KeyRoomChampions(roomID), actor)
	pipe.HDel(ctx, redisx.KeyRoomLocal(roomID), actor)
	if _, err := pipe.Exec(ctx); err != nil {
		return err
	}
	left, err := s.rdb.R.SMembers(ctx, redisx.KeyRoomMembers(roomID)).Result()
	if err != nil {
		return err
	}
	if len(left) == 0 {
		return s.Dispose(ctx, roomID)
	}
	if rm.HostID == actor {
		sort.Strings(left)
		rm.HostID = left[0]
		return s.write(ctx, rm)
	}
	return nil
}

// Dispose deletes every key of a room.
func (s *Service) Dispose(ctx context.Context, roomID string) error {
	pipe := s.rdb.R.TxPipeline()
	pipe.Del(ctx, redisx.KeyRoom(roomID), redisx.KeyRoomMembers(roomID), redisx.KeyRoomReady(roomID),
		redisx.KeyRoomChampions(roomID), redisx.KeyRoomChat(roomID), redisx.KeyRoomLocal(roomID))
	pipe.ZRem(ctx, redisx.KeyRoomsOpen(), roomID)
	_, err := pipe.Exec(ctx)
	return err
}

// Members lists room members with ready state, host first then ULID order.
func (s *Service) Members(ctx context.Context, roomID string) ([]Member, error) {
	rm, err := s.Get(ctx, roomID)
	if err != nil {
		return nil, err
	}
	ids, err := s.rdb.R.SMembers(ctx, redisx.KeyRoomMembers(roomID)).Result()
	if err != nil {
		return nil, err
	}
	ready, err := s.rdb.R.HGetAll(ctx, redisx.KeyRoomReady(roomID)).Result()
	if err != nil {
		return nil, err
	}
	local, err := s.rdb.R.HGetAll(ctx, redisx.KeyRoomLocal(roomID)).Result()
	if err != nil {
		return nil, err
	}
	sort.Strings(ids)
	out := make([]Member, 0, len(ids))
	for _, id := range ids {
		out = append(out, Member{
			AccountID: id, Ready: ready[id] == "1", IsHost: id == rm.HostID,
			LocalPlayers: parseLocalPlayers(local[id]),
		})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].IsHost && !out[j].IsHost })
	return out, nil
}

// parseLocalPlayers normalizes a stored hash value into 1..MaxLocalPlayers.
func parseLocalPlayers(v string) int {
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 {
		return 1
	}
	if n > MaxLocalPlayers {
		return MaxLocalPlayers
	}
	return n
}

// SeatSum returns Σ localPlayers over the members — the number of the room's
// 12 seats already claimed by humans.
func SeatSum(members []Member) int {
	sum := 0
	for _, m := range members {
		sum += m.LocalPlayers
	}
	return sum
}

// seatSum loads members and totals their claimed seats.
func (s *Service) seatSum(ctx context.Context, roomID string) (int, error) {
	members, err := s.Members(ctx, roomID)
	if err != nil {
		return 0, err
	}
	return SeatSum(members), nil
}

// SetLocalPlayers records how many couch players share actor's machine
// (1..MaxLocalPlayers), enforcing the room-wide seat capacity.
func (s *Service) SetLocalPlayers(ctx context.Context, actor, roomID string, count int) error {
	if count < 1 || count > MaxLocalPlayers {
		return httpx.BadRequest("localPlayers must be between 1 and 4")
	}
	rm, err := s.Get(ctx, roomID)
	if err != nil {
		return err
	}
	if rm.Status != StatusOpen {
		return httpx.Conflict("room is not open")
	}
	if err := s.requireMember(ctx, actor, roomID); err != nil {
		return err
	}
	members, err := s.Members(ctx, roomID)
	if err != nil {
		return err
	}
	sum := 0
	for _, m := range members {
		if m.AccountID == actor {
			sum += count
		} else {
			sum += m.LocalPlayers
		}
	}
	if sum > MaxPlayers {
		return httpx.Conflict("not enough free seats for that many local players")
	}
	return s.rdb.R.HSet(ctx, redisx.KeyRoomLocal(roomID), actor, strconv.Itoa(count)).Err()
}

// requireMember errors unless actor is in the room.
func (s *Service) requireMember(ctx context.Context, actor, roomID string) error {
	ok, err := s.rdb.R.SIsMember(ctx, redisx.KeyRoomMembers(roomID), actor).Result()
	if err != nil {
		return err
	}
	if !ok {
		return httpx.Forbidden("not a member of this room")
	}
	return nil
}

// IsMember reports room membership (used by lobby chat).
func (s *Service) IsMember(ctx context.Context, actor, roomID string) (bool, error) {
	return s.rdb.R.SIsMember(ctx, redisx.KeyRoomMembers(roomID), actor).Result()
}

// SetReady flips actor's ready flag.
func (s *Service) SetReady(ctx context.Context, actor, roomID string, ready bool) error {
	if err := s.requireMember(ctx, actor, roomID); err != nil {
		return err
	}
	v := "0"
	if ready {
		v = "1"
	}
	return s.rdb.R.HSet(ctx, redisx.KeyRoomReady(roomID), actor, v).Err()
}

// PickChampion records actor's champ-select pick for the room. Ownership is
// enforced at start time (the wallet may change between pick and start).
func (s *Service) PickChampion(ctx context.Context, actor, roomID, championID string) error {
	if err := s.requireMember(ctx, actor, roomID); err != nil {
		return err
	}
	return s.rdb.R.HSet(ctx, redisx.KeyRoomChampions(roomID), actor, championID).Err()
}

// Picks returns the accountId -> championId champ-select picks of a room.
func (s *Service) Picks(ctx context.Context, roomID string) (map[string]string, error) {
	return s.rdb.R.HGetAll(ctx, redisx.KeyRoomChampions(roomID)).Result()
}

func (s *Service) requireHost(ctx context.Context, actor, roomID string) (Room, error) {
	rm, err := s.Get(ctx, roomID)
	if err != nil {
		return Room{}, err
	}
	if rm.HostID != actor {
		return Room{}, httpx.Forbidden("only the host may do this")
	}
	return rm, nil
}

// UpdateSettings lets the host edit room settings.
func (s *Service) UpdateSettings(ctx context.Context, actor, roomID string, st Settings) (Room, error) {
	rm, err := s.requireHost(ctx, actor, roomID)
	if err != nil {
		return Room{}, err
	}
	if st.Name != "" {
		if err := validateName(st.Name); err != nil {
			return Room{}, err
		}
		rm.Name = st.Name
	}
	if st.MapID != "" {
		rm.MapID = st.MapID
	}
	if st.BotDifficulty != "" {
		rm.BotDifficulty = st.BotDifficulty
	}
	if err := s.write(ctx, rm); err != nil {
		return Room{}, err
	}
	return rm, nil
}

// Start validates preconditions (host-only, every human ready), computes
// botFill = 12 − humans and hands off to the gamelink seam. On success the
// room closes (leaves rooms:open) and members flip to in-match presence.
func (s *Service) Start(ctx context.Context, actor, roomID string) (StartInfo, error) {
	rm, err := s.requireHost(ctx, actor, roomID)
	if err != nil {
		return StartInfo{}, err
	}
	if rm.Status != StatusOpen {
		return StartInfo{}, httpx.Conflict("room already started")
	}
	members, err := s.Members(ctx, roomID)
	if err != nil {
		return StartInfo{}, err
	}
	for _, m := range members {
		if !m.Ready && m.AccountID != rm.HostID {
			return StartInfo{}, httpx.Conflict("all players must be ready")
		}
	}
	// Seat-capacity gate: Σ localPlayers can never exceed the 12 seats.
	// (The join/local-players paths enforce this too; this guards races.)
	if SeatSum(members) > MaxPlayers {
		return StartInfo{}, httpx.Conflict("too many local players for 12 seats")
	}
	// Champ-select ownership gate: a member who picked a priced champion
	// they do not own blocks the start with a clear error.
	if s.owns != nil {
		picks, err := s.Picks(ctx, roomID)
		if err != nil {
			return StartInfo{}, err
		}
		for _, m := range members {
			champ := picks[m.AccountID]
			if champ == "" {
				continue
			}
			ok, err := s.owns.OwnsChampion(ctx, m.AccountID, champ)
			if err != nil {
				return StartInfo{}, err
			}
			if !ok {
				return StartInfo{}, httpx.Err(http.StatusConflict, "champion_not_owned",
					"player "+m.AccountID+" does not own champion "+champ)
			}
		}
	}
	if s.starter == nil {
		return StartInfo{}, httpx.Internal("match starter not configured")
	}
	info, err := s.starter.StartMatch(ctx, rm, members)
	if err != nil {
		return StartInfo{}, err
	}
	rm.Status = StatusInMatch
	if err := s.write(ctx, rm); err != nil {
		return StartInfo{}, err
	}
	if err := s.rdb.R.ZRem(ctx, redisx.KeyRoomsOpen(), roomID).Err(); err != nil {
		return StartInfo{}, err
	}
	for _, m := range members {
		_ = s.pres.Set(ctx, m.AccountID, presence.StateInMatch)
	}
	return info, nil
}

// OpenRoom is one lobby-list row.
type OpenRoom struct {
	Room
	Players int `json:"players"`
	Max     int `json:"max"`
}

// ListOpen reads the rooms:open ZSET (newest first), skipping vanished rooms.
func (s *Service) ListOpen(ctx context.Context) ([]OpenRoom, error) {
	ids, err := s.rdb.R.ZRevRange(ctx, redisx.KeyRoomsOpen(), 0, 49).Result()
	if err != nil {
		return nil, err
	}
	out := make([]OpenRoom, 0, len(ids))
	for _, id := range ids {
		rm, err := s.Get(ctx, id)
		if err != nil {
			if errors.Is(err, ErrNotFound) {
				_ = s.rdb.R.ZRem(ctx, redisx.KeyRoomsOpen(), id).Err()
				continue
			}
			return nil, err
		}
		n, err := s.seatSum(ctx, id)
		if err != nil {
			return nil, err
		}
		out = append(out, OpenRoom{Room: rm, Players: n, Max: MaxPlayers})
	}
	return out, nil
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

func validateName(name string) error {
	if len(name) > 48 {
		return httpx.BadRequest("name too long")
	}
	for _, r := range name {
		if r < 0x20 || r == 0x7f {
			return httpx.BadRequest("control characters are not allowed")
		}
	}
	return nil
}
