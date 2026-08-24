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
	// RogueliteMobs is the PER-ROOM 肉鴿殭屍模式 toggle (#215). It is a *bool ON
	// PURPOSE: a bare Go bool zero-values to false, which would silently regress
	// every existing room and the whole solo path to OFF. A nil pointer means
	// "unset" === ON (the owner's default-ON directive); only an explicit false
	// disarms the mobs. Forwarded to the game server as *bool as well.
	RogueliteMobs *bool `json:"rogueliteMobs,omitempty"`
	// Practice 是練習模式（GH#343）：單人沙盒、不結算、測試碼可用。
	//
	// ⚠️ 它刻意是**純 bool 而不是 *bool**，跟上面那一格相反。RogueliteMobs 用指標
	// 是因為它的「缺席」要讀成 ON；練習模式的缺席就是「這不是練習房」，零值正好
	// 是對的答案，多一層指標只會多一種讀錯的方式。
	//
	// ⛔ 只有 StartSolo 那條路（listed=false 的單人房）可以把它設成 true：
	// Create() 會主動清成 false，UpdateSettings() 不看它。理由見 Create()。
	Practice bool `json:"practice,omitempty"`
	// MatchSettings are the #288 host-set pacing knobs. Embedded (JSON-inlined)
	// so Room, Settings and gamelink.MatchRequest carry ONE declaration of the
	// four fields — forwarding is `x.MatchSettings = y.MatchSettings`, which is
	// what makes "forgot to forward the fourth field" structurally impossible.
	MatchSettings
}

// MatchSettings are the four per-room 對局節奏 knobs the HOST may set (#288):
// champ-select / shop / per-round seconds, plus the total round cap.
//
// EVERY FIELD IS A POINTER because "omitted" and "set to 0" are different
// answers. `maxRounds: 0` is the host explicitly choosing 無上限; nil means the
// host never touched the knob and the game server must fall back to the shipped
// config.match@1 value — INCLUDING the 320s vs-bot champ select. Absent is never
// a reset, the same guarantee RogueliteMobs above buys with its *bool.
//
// ⛔ THIS LAYER DELIBERATELY DOES NOT VALIDATE — it is a transparent pipe. Do
// not "helpfully" add range checks here. The bounds live in exactly one place,
// packages/shared/src/roomSettings.ts (ROOM_SETTING_LIMITS), and combatMaxSec's
// real floor is DERIVED there from the shipped fire-ring config; Go can import
// neither. Authoritative rejection happens once, in the game server (TS). A
// second validation point is a second copy of the bounds, and the copy that
// drifts will silently refuse settings the host is entitled to — while looking
// exactly like a working system. Same call as #215's RogueliteMobs.
type MatchSettings struct {
	ChampSelectSec  *float64 `json:"champSelectSec,omitempty"`
	IntermissionSec *float64 `json:"intermissionSec,omitempty"`
	CombatMaxSec    *float64 `json:"combatMaxSec,omitempty"`
	MaxRounds       *int     `json:"maxRounds,omitempty"`
}

// merge overlays only the knobs the caller actually sent. A nil field leaves the
// live value alone, so a settings PATCH that changes just the room name can
// never silently reset 每回合時間 back to the shipped default.
func (m *MatchSettings) merge(in MatchSettings) {
	if in.ChampSelectSec != nil {
		m.ChampSelectSec = in.ChampSelectSec
	}
	if in.IntermissionSec != nil {
		m.IntermissionSec = in.IntermissionSec
	}
	if in.CombatMaxSec != nil {
		m.CombatMaxSec = in.CombatMaxSec
	}
	if in.MaxRounds != nil {
		m.MaxRounds = in.MaxRounds
	}
}

// redisFields adds the SET knobs to a room-hash write. A nil knob writes no key
// at all — that absence is precisely what keeps "unset" distinguishable from
// "0" on read-back (HGetAll yields no entry, versus the string "0").
func (m MatchSettings) redisFields(fields map[string]any) {
	if m.ChampSelectSec != nil {
		fields["champSelectSec"] = floatToRedis(*m.ChampSelectSec)
	}
	if m.IntermissionSec != nil {
		fields["intermissionSec"] = floatToRedis(*m.IntermissionSec)
	}
	if m.CombatMaxSec != nil {
		fields["combatMaxSec"] = floatToRedis(*m.CombatMaxSec)
	}
	if m.MaxRounds != nil {
		fields["maxRounds"] = strconv.Itoa(*m.MaxRounds)
	}
}

// matchSettingsFromRedis reads the knobs back out of a room hash.
func matchSettingsFromRedis(h map[string]string) MatchSettings {
	return MatchSettings{
		ChampSelectSec:  parseOptFloat(h, "champSelectSec"),
		IntermissionSec: parseOptFloat(h, "intermissionSec"),
		CombatMaxSec:    parseOptFloat(h, "combatMaxSec"),
		MaxRounds:       parseOptInt(h, "maxRounds"),
	}
}

// Settings are the host-editable knobs.
type Settings struct {
	Name          string `json:"name,omitempty"`
	MapID         string `json:"mapId,omitempty"`
	BotDifficulty string `json:"botDifficulty,omitempty"`
	// Per-room 肉鴿殭屍模式 toggle (#215); nil = unchanged/ON (see Room). *bool so
	// an omitted field on the wire never zero-values a live room to OFF.
	RogueliteMobs *bool `json:"rogueliteMobs,omitempty"`
	// 練習模式（GH#343）。只有 POST /rooms/solo 這條路讀得到它 —— 房間建好之後
	// 就沒有任何入口能翻轉它了（見 Room.Practice 與 Create()）。
	Practice bool `json:"practice,omitempty"`
	// The #288 pacing knobs, same nil = unchanged rule (see MatchSettings).
	MatchSettings
}

// Member is one room member with ready state. LocalPlayers (1..4) is how many
// couch players share that member's machine; each extra one occupies a seat.
type Member struct {
	AccountID    string `json:"accountId"`
	Ready        bool   `json:"ready"`
	IsHost       bool   `json:"isHost"`
	LocalPlayers int    `json:"localPlayers"`
	// Side is the 陣營意向 this member arrived with (GH#655) — SideAlly,
	// SideEnemy, or "" (walked in from the room list / rally: no preference).
	// It is a PREFERENCE, not a pin: PlanSeats honours it when the wanted side
	// has room and falls back to first-fit when it does not (owner:「建議偏好
	// （滿了就讓位）」).
	Side string `json:"side,omitempty"`
	// Team is the team PlanSeats currently puts this member on (0-based).
	//
	// ⭐ This is the GH#655 「⛔ 不是靜靜地換邊」 half: the lobby shows it live, so
	// an invitee whose 同隊 could not be honoured SEES the other team next to
	// their name **before** the match starts, rather than discovering it in
	// champ-select. It is derived, never stored — the same function assigns the
	// real seats at start, so the preview cannot drift from the outcome.
	Team int `json:"team"`
}

// Side values for Member.Side / Invite.Side (GH#655).
const (
	SideAlly  = "ally"
	SideEnemy = "enemy"
)

// NormalizeSide keeps only the two 陣營意向 values; anything else becomes ""
// (= no preference). Unknown input is normalised rather than rejected so an old
// client, a hand-made request, or a corrupted hash can never brick an invite.
func NormalizeSide(v string) string {
	if v == SideAlly || v == SideEnemy {
		return v
	}
	return ""
}

// TeamSize is how many seats one team has; TeamCount is how many teams a match
// has. ⚠️ Both are DERIVED from MaxPlayers so the room and the seat packer can
// never disagree about the shape of a match.
const (
	TeamSize  = 3
	TeamCount = MaxPlayers / TeamSize
)

// Placement is one occupied seat: which member owns it, which of that member's
// couch players sits in it (1 = the member, 2..4 = guests), and where.
type Placement struct {
	AccountID  string
	LocalIndex int
	Team       int
	Slot       int
}

// PlanSeats is THE answer to 「誰坐哪一隊」 — used both by the lobby (to show each
// member their team live) and by gamelink.BuildSeats (to build the real match
// seats). ⭐ One function, so the preview and the outcome cannot drift.
//
// The rules, in order:
//  1. members in ULID order, each expanded into its couch group (owner + guests);
//  2. first-fit: a group lands on the first team with enough free slots, which
//     is what keeps a couch group together;
//  3. leftovers spill into any free slot.
//
// GH#655 adds ONE thing on top, and only when somebody actually expressed a
// preference: the QUEUE ORDER becomes host → 同隊 → 沒意向 → 對面, and an 對面
// group starts its first-fit scan at team 1 instead of team 0. ⛔ It does not
// touch the capacity rules, so a wanted side that is full simply falls through
// to the next team — owner:「建議偏好（滿了就讓位）」.
//
// ⚠️ With no member carrying a Side this function is byte-identical to the
// pre-#655 packing: the reorder is skipped entirely, so every existing room,
// rally and test keeps its exact seats.
func PlanSeats(members []Member) []Placement {
	sorted := make([]Member, len(members))
	copy(sorted, members)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].AccountID < sorted[j].AccountID })

	anySide := false
	for _, m := range sorted {
		if NormalizeSide(m.Side) != "" {
			anySide = true
			break
		}
	}
	if anySide {
		// ⚠️ Stable, so ULID order still decides between two members with the
		// same intent — the packing stays a pure function of the room's state.
		sort.SliceStable(sorted, func(i, j int) bool { return sideRank(sorted[i]) < sideRank(sorted[j]) })
	}

	teams := make([][]Placement, TeamCount)
	var overflow []Placement
	for _, m := range sorted {
		g := couchGroup(m)
		placed := false
		for k := 0; k < TeamCount; k++ {
			t := k
			// 對面：從 1 隊開始掃，掃完一圈才回到 0 隊（＝主揪那一隊）。⭐ 主揪一定
			// 在 0 隊，因為 anySide 時他排在最前面而 first-fit 的第一個團一定進 0 隊。
			if NormalizeSide(m.Side) == SideEnemy {
				t = (k + 1) % TeamCount
			}
			if TeamSize-len(teams[t]) >= len(g) {
				teams[t] = append(teams[t], g...)
				placed = true
				break
			}
		}
		if !placed {
			overflow = append(overflow, g...)
		}
	}
	for _, p := range overflow {
		for t := 0; t < TeamCount; t++ {
			if len(teams[t]) < TeamSize {
				teams[t] = append(teams[t], p)
				break
			}
		}
	}

	out := make([]Placement, 0, MaxPlayers)
	for t := 0; t < TeamCount; t++ {
		for sl, p := range teams[t] {
			p.Team, p.Slot = t, sl
			out = append(out, p)
		}
	}
	return out
}

// sideRank is the GH#655 queue order: host first (so 同隊 means "with the host"),
// then the allies who asked for his team, then everyone with no opinion, then
// the people who asked for the other side.
func sideRank(m Member) int {
	switch {
	case m.IsHost:
		return 0
	case NormalizeSide(m.Side) == SideAlly:
		return 1
	case NormalizeSide(m.Side) == SideEnemy:
		return 3
	default:
		return 2
	}
}

// couchGroup expands one member into its seats (owner + ":pN" guests).
func couchGroup(m Member) []Placement {
	n := m.LocalPlayers
	if n < 1 {
		n = 1
	}
	if n > MaxLocalPlayers {
		n = MaxLocalPlayers
	}
	g := make([]Placement, 0, n)
	for k := 1; k <= n; k++ {
		g = append(g, Placement{AccountID: m.AccountID, LocalIndex: k})
	}
	return g
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
	// roster is the GH#492 大廳集合令 seam (rally.go); nil disables broadcasting.
	roster LobbyRoster
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
		// Absent field (old rooms, ON-by-default) → nil pointer → ON. "1"/"0"
		// otherwise. Never zero-value to false on a missing key.
		RogueliteMobs: parseOptBool(m, "rogueliteMobs"),
		// 練習模式（GH#343）：缺席 = 不是練習房。這裡不需要 parseOptBool 的三態，
		// 因為 false 本來就是那個「沒設過」要得到的答案。
		Practice: m["practice"] == "1",
		// Same rule for the #288 knobs: a missing key stays nil (host never set
		// it) so the game server applies the shipped config.match@1 value.
		MatchSettings: matchSettingsFromRedis(m),
	}, nil
}

func (s *Service) write(ctx context.Context, rm Room) error {
	fields := map[string]any{
		"id": rm.ID, "name": rm.Name, "hostId": rm.HostID, "mapId": rm.MapID,
		"mode": rm.Mode, "botDifficulty": rm.BotDifficulty, "status": rm.Status,
		"createdAt": rm.CreatedAt,
	}
	// Only persist the toggle when the host set it explicitly; a nil pointer
	// leaves the key absent so it reads back as ON (default-ON directive).
	if rm.RogueliteMobs != nil {
		fields["rogueliteMobs"] = boolToRedis(*rm.RogueliteMobs)
	}
	// 練習模式只在 true 的時候留下一格 —— 一般房間的 hash 完全沒有這個鍵，
	// 讀回來就是 false（Get()）。
	if rm.Practice {
		fields["practice"] = "1"
	}
	rm.MatchSettings.redisFields(fields)
	return s.rdb.R.HSet(ctx, redisx.KeyRoom(rm.ID), fields).Err()
}

// parseOptBool reads a "1"/"0" hash field into a *bool; a missing field is nil
// (== unset == ON for the #215 toggle), never a zero-valued false.
func parseOptBool(m map[string]string, key string) *bool {
	v, ok := m[key]
	if !ok {
		return nil
	}
	b := v == "1"
	return &b
}

func boolToRedis(b bool) string {
	if b {
		return "1"
	}
	return "0"
}

// parseOptFloat / parseOptInt are parseOptBool for the #288 numeric knobs: a
// missing key is nil (unset → shipped default), never a zero-valued 0 — and 0
// is a MEANINGFUL value here (maxRounds 0 = 無上限), so the two must not
// collapse. An unparseable value is treated as unset for the same reason: a
// corrupt hash must not read back as "the host chose zero".
func parseOptFloat(m map[string]string, key string) *float64 {
	v, ok := m[key]
	if !ok {
		return nil
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return nil
	}
	return &f
}

func parseOptInt(m map[string]string, key string) *int {
	v, ok := m[key]
	if !ok {
		return nil
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return nil
	}
	return &n
}

// floatToRedis writes the shortest round-tripping decimal, so 22.5 comes back
// as 22.5 and 180 comes back as 180 rather than 1.8e+02.
func floatToRedis(f float64) string {
	return strconv.FormatFloat(f, 'f', -1, 64)
}

// Create makes a new open room hosted by actor, joins them, and lists it in the
// lobby browser.
//
// ⛔ 練習模式（GH#343）在這裡被**主動清成 false**，而且 UpdateSettings() 連碰都
// 不碰它。理由不是潔癖，是那一格旗標同時是**測試碼的鑰匙**（MatchRoom 的
// `cheatsAllowed` 讀 options.practice）：
//   - 允許「開一間 listed 練習房再邀朋友進來」→ 有旁人、開著測試碼、而且不結算。
//   - 允許「把一間有別人的房事後翻成練習房」→ 同一個結果，只是慢一步。
//
// 練習房唯一的入口因此是 StartSolo：它建的是 listed=false 的單人房，房裡永遠
// 只有按下按鈕的那個人。少了這一行，練習模式就從「單人沙盒」變成「作弊房」。
func (s *Service) Create(ctx context.Context, actor string, st Settings) (Room, error) {
	st.Practice = false
	return s.create(ctx, actor, st, true)
}

// create is Create with the lobby listing made explicit. `listed` is false for
// the solo bot match (StartSolo), which is nobody else's room to join.
func (s *Service) create(ctx context.Context, actor string, st Settings, listed bool) (Room, error) {
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
		// Pass the per-room toggle straight through: nil (unset) === ON, so both
		// the solo/bot path (empty Settings) and a normal create default to mobs.
		RogueliteMobs: st.RogueliteMobs,
		// 練習模式（GH#343）。⚠️ 到得了這裡的 true 只可能來自 StartSolo ——
		// Create() 在呼叫之前就把它清掉了。
		Practice: st.Practice,
		// #288: whatever the host sent at create, verbatim. A fresh room has
		// nothing to preserve, so this is a straight copy — every knob the host
		// omitted stays nil and the game server uses the shipped value.
		MatchSettings: st.MatchSettings,
	}
	if err := s.write(ctx, rm); err != nil {
		return Room{}, err
	}
	pipe := s.rdb.R.TxPipeline()
	pipe.SAdd(ctx, redisx.KeyRoomMembers(rm.ID), actor)
	if listed {
		pipe.ZAdd(ctx, redisx.KeyRoomsOpen(), redis.Z{Score: float64(rm.CreatedAt), Member: rm.ID})
	}
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
	// Host flips the #215 toggle post-create: only a non-nil pointer overrides,
	// so a settings PATCH that omits the field leaves the current value intact.
	// (Takes effect for the NEXT match — arenaRules is frozen at match start.)
	if st.RogueliteMobs != nil {
		rm.RogueliteMobs = st.RogueliteMobs
	}
	// #288: same rule for the pacing knobs — only the fields actually sent
	// overwrite. (Also next-match: the game server freezes them at match start.)
	rm.MatchSettings.merge(st.MatchSettings)
	if err := s.write(ctx, rm); err != nil {
		return Room{}, err
	}
	return rm, nil
}

// Start validates preconditions (host-only, every human ready), computes
// botFill = 12 − humans and hands off to the gamelink seam. On success the
// room closes (leaves rooms:open) and members flip to in-match presence.
func (s *Service) Start(ctx context.Context, actor, roomID string) (StartInfo, error) {
	return s.start(ctx, actor, roomID, false)
}

// StartIgnoringReady is Start with the ready gate lifted — the GH#492 rally's
// 「最多等 10 秒」 deadline.
//
// ⚠️ WHY THE GATE HAS TO BE LIFTABLE AT ALL. A rally start is a DEADLINE, not a
// consensus: owner said 「最多等 10 秒⋯時間到就用 bot 補位開始」. Meanwhile the room
// stays listed while it rallies, so a stranger can walk in from the room browser
// at second 9 and never press ready. With the gate in force that lobby-goer
// silently converts the host's countdown into a start that fails forever, and the
// visible symptom is 「按了開始，什麼都沒發生」.
//
// Lifting it costs nothing the room did not already concede: readiness is a
// courtesy flag in the LOBBY, while the real 選角 happens inside the match
// (the champSelect phase), so a not-ready member loses no choice by being taken
// in. Host-only, exactly like Start.
func (s *Service) StartIgnoringReady(ctx context.Context, actor, roomID string) (StartInfo, error) {
	return s.start(ctx, actor, roomID, true)
}

func (s *Service) start(ctx context.Context, actor, roomID string, ignoreNotReady bool) (StartInfo, error) {
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
	if !ignoreNotReady {
		for _, m := range members {
			if !m.Ready && m.AccountID != rm.HostID {
				return StartInfo{}, httpx.Conflict("all players must be ready")
			}
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

// SoloRoomName is what a one-click bot match calls itself. It is a real room
// with a real name because it is a real match — an operator reading the pending
// set or a match record should see what it was, not a blank.
const SoloRoomName = "單機 vs BOT"

// StartSolo is the lobby's one-click bot match: create a private room for actor
// and start it in the SAME call, so the player presses one button and is in a
// match against 11 bots.
//
// WHY IT GOES THROUGH THE ORDINARY ROOM/START PATH INSTEAD OF A SHORTCUT.
// The client already had a "Play vs bots" button; it joined the game-server
// directly, which means the platform never learned the match existed. No
// callbackUrl was handed to the room, so MatchRoom's result callback had nothing
// to post to (it now derives one, but there is still no pending record, no
// reserved seat, no room id) — the match settled into nothing: no record, no
// MMR, no 水晶, no ladder row. That is the difference between a game mode and a
// debug shortcut, and it is the entire point of this function.
//
// Routing it through Start therefore buys, for free and without a second code
// path that can rot out of sync with the first:
//   - a platform-issued matchId and a RESERVED seat (gamelink.StartMatch),
//   - the callbackUrl that makes the result settle (gamelink/callback.go),
//   - the pending record + gameRoomId the #187 liveness reaper reads, so the
//     match heartbeats like any other and is not reaped mid-play,
//   - the seat token pushed over the lobby WS, which is exactly how the client
//     already enters a normal match — so the client change is one API call.
//
// WHAT IT PAYS. The anti-farm rule in gamelink/callback.go decides that, not
// this function: 11 bots mean the lobby is not all-human, so M幣 is zero by
// construction, and the earner's own team has bots on it, so 水晶 pay at HALF
// rate. Rating, wins and season points are never gated. Soloing bots forever is
// therefore worth playing and not worth farming — which is what makes it safe
// to make this button real at all.
//
// The room is created UNLISTED: it exists for the few milliseconds between
// create and start, and a stranger who joined in that window would be dragged
// into somebody else's solo match.
func (s *Service) StartSolo(ctx context.Context, actor string, st Settings) (StartInfo, error) {
	if st.Name == "" {
		st.Name = SoloRoomName
	}
	rm, err := s.create(ctx, actor, st, false)
	if err != nil {
		return StartInfo{}, err
	}
	info, err := s.Start(ctx, actor, rm.ID)
	if err != nil {
		// Nothing survives a failed start: an unlisted room nobody can find is
		// not a lobby the player can fall back into, it is litter.
		_ = s.Dispose(ctx, rm.ID)
		return StartInfo{}, err
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
