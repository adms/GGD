package room

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"time"

	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/httpx"
)

// ---- 大廳集合令 (GH#492) ------------------------------------------------------
//
// owner 2026-08-21 逐字：
//
//	「創建房間最重要的就是拉人進來，請你將**所有線上在大廳的人都跳出確認視窗**是否
//	 進入房間一起開始，同意後就一起進入開始遊戲，**最多等 10 秒**，**包含 vs bot**」
//
// ---- WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT --------------------------
// It is a FAN-OUT of the invite that already exists (invite.go), not a second
// invite system. Every recipient gets their OWN crypto/rand single-use token
// addressed to them, redeemed through the same `POST /rooms/join-by-code` path a
// hand-picked invite uses. That matters for one concrete reason: a broadcast
// that shipped one shared token would be a room key any recipient could forward,
// and the 「only that account may use it」 check in AcceptInvite is what stops it.
//
// ---- ⭐ 2026-08-21: THE DIALOG IS OPT-OUT, WHICH RAISES THE STAKES HERE ------
// owner reversed the semantics the same day: 「你說的是對的，**預設是加入，五秒是
// 讓人按否定的**」. A recipient who presses nothing IS PULLED INTO A MATCH.
// ⇒ every exclusion below stopped being 「一個多餘的視窗」 and became 「一個人被拉走」,
//   which is why the room filter is now 「in ANY open room」 and not just this one.
//   The five-second window is far too short to be somebody's only defence, so the
//   defences are: the server never reaching people who are busy (here), the
//   recipient's own browser refusing to auto-join while nobody is at the keyboard
//   (`ui/platform/userIdle.ts` — presence cannot answer that, see below), and a
//   leave path that still works after the match starts (`ui/LeaveConfirmDialog`).
//
// ---- THE FOUR RULES THE FAN-OUT ENFORCES ------------------------------------
//  1. ⛔ NOBODY IN A MATCH. The roster seam (friend.InLobby) drops
//     presence.StateInMatch before this function ever sees it. owner's wording is
//     「所有線上**在大廳**的人」, and a modal thrown over a live fight is the one
//     outcome that makes this feature worse than not having it. Champion select
//     is on the far side of `room.Start`, so it is in-match too — a player picking
//     a hero is never a recipient.
//  2. NOBODY ALREADY IN A ROOM — ⛔ not just THIS room. Under opt-out, a player
//     sitting in room B waiting for his friends would be AUTO-JOINED out of it in
//     five seconds. The client also refuses (`inRoom` in RallyConfirmDialog), but
//     「我不送」 and 「我送了、希望對方不理」 are different guarantees and only the
//     first one survives a client bug.
//  3. EVERY PUSH CARRIES THE SAME DEADLINE. `expiresAt` is stamped ONCE, here, in
//     server time, and every recipient's countdown is derived from it. Letting
//     each browser start its own 10 s from the moment its socket happened to
//     deliver the frame is how you get a dialog that is still counting down after
//     the match has started.
//  4. ⛔ IDLENESS IS NOT DECIDABLE HERE, SO IT IS NOT DECIDED HERE. presence is a
//     TTL key refreshed by a TIMER-driven heartbeat (lobby/ws.go), so an account
//     staring at the lobby and an account whose owner went to bed are bit-for-bit
//     identical on this side. The 「掛機的人不要被拉進去」 gate therefore lives in the
//     recipient's browser, which is the only place real input events exist — and
//     which is where the auto-join request comes from anyway. ⛔ Do NOT grow a
//     second presence system here to fake it.
//
// ---- WHY THE HOST'S CLIENT OWNS THE COUNTDOWN, NOT A SERVER TIMER ------------
// The rally window ends in `POST /rooms/{id}/start`, called by the host's browser
// when its countdown elapses. A server-side timer would need to survive replica
// restarts and would start matches for hosts who closed the tab — a room whose
// host is gone is exactly the room nobody should be dragged into. The deadline is
// still SERVER-STAMPED (above), so what the client owns is only *when it presses
// start*, which is the same authority it has always had.

// RallyWaitDefaultSec is the fallback wait when a caller sends no waitSec.
// ⚠️ It is a TRANSPORT fallback, not the policy: the shipped value lives in
// `content/config/lobby-rally.json` (+ the Zod DEFAULT_LOBBY_RALLY_POLICY and the
// admin form), and the client sends it explicitly on every call. This constant
// only decides what happens to a request that omitted the field entirely.
const RallyWaitDefaultSec = 5

// Rally wait bounds. ⛔ These are transport guards, NOT policy knobs — the same
// call `maxOnlinePlayers` makes in friend/online.go. A rally that waits an hour
// is a room nobody can start; one that waits 0 s cannot be accepted by anybody.
const (
	rallyWaitMinSec = 1
	rallyWaitMaxSec = 120
)

// maxRallyTargets bounds one broadcast. Each target costs a Redis SETEX plus a
// publish, and the lobby is naturally bounded by the number of registered
// accounts (147 on the family deploy). Truncating is reported, never silent.
const maxRallyTargets = 200

// LobbyAccount is one account the rally may reach. It mirrors friend.LiveAccount
// — declared here so `room` does not import `friend` (that import runs the other
// way round in server.go, and a cycle would be the price of sharing the type).
type LobbyAccount struct {
	ID       string
	Username string
	State    string
	MMR      int
}

// LobbyRoster is the seam to internal/friend: who is sitting in the lobby right
// now. Implemented by *friend.Handlers.
type LobbyRoster interface {
	InLobby(ctx context.Context) ([]LobbyAccount, error)
	// Lookup resolves ONE account (the host) regardless of presence — see the
	// implementation's comment for why InLobby cannot be trusted for that.
	Lookup(ctx context.Context, accountID string) (LobbyAccount, error)
}

// SetRoster injects the lobby-roster seam. nil disables the rally broadcast
// (Rally answers a 503 rather than silently inviting nobody — a broadcast that
// reached zero people and a broadcast that was never wired look identical on a
// screen, and only one of them is a bug).
func (s *Service) SetRoster(r LobbyRoster) { s.roster = r }

// RallyInfo is what a successful broadcast reports back to the host.
type RallyInfo struct {
	// Invited is how many confirm dialogs were actually pushed.
	Invited int `json:"invited"`
	// InLobby is how many lobby accounts were seen BEFORE the room's own members
	// were subtracted, so 「我一個人在線上」 and 「廣播壞了」 are distinguishable.
	InLobby int `json:"inLobby"`
	// Truncated says the lobby was bigger than one broadcast may cover.
	Truncated bool `json:"truncated"`
	// ExpiresAt is the SERVER-stamped deadline (unix ms) every recipient counts
	// down to, and the moment the host's client calls start.
	ExpiresAt int64 `json:"expiresAt"`
	// WaitSec is the clamped wait actually used (the request's value may have
	// been out of the transport bounds).
	WaitSec float64 `json:"waitSec"`
}

// clampRallyWait folds an absent/out-of-range wait onto the transport bounds.
func clampRallyWait(sec float64) float64 {
	if sec <= 0 {
		sec = RallyWaitDefaultSec
	}
	if sec < rallyWaitMinSec {
		return rallyWaitMinSec
	}
	if sec > rallyWaitMaxSec {
		return rallyWaitMaxSec
	}
	return sec
}

// Rally pushes a confirm-dialog invite to every account currently in the lobby.
// Host-only, open-rooms-only. Returns what was actually sent, so the host's UI
// can say 「已通知 3 人」 instead of guessing.
func (s *Service) Rally(ctx context.Context, actor, roomID string, waitSec float64) (RallyInfo, error) {
	rm, err := s.requireHost(ctx, actor, roomID)
	if err != nil {
		return RallyInfo{}, err
	}
	if rm.Status != StatusOpen {
		return RallyInfo{}, httpx.Conflict("room is not open")
	}
	if s.roster == nil {
		return RallyInfo{}, httpx.Internal("lobby roster not configured")
	}
	wait := clampRallyWait(waitSec)
	deadline := time.Now().Add(time.Duration(wait * float64(time.Second)))
	expiresAt := deadline.UnixMilli()

	people, err := s.roster.InLobby(ctx)
	if err != nil {
		return RallyInfo{}, err
	}
	// Rule 2: everyone who is already sitting in a room — THIS one (which may be
	// unlisted, so the scan below cannot see it) or any other open one.
	members, err := s.rdb.R.SMembers(ctx, redisx.KeyRoomMembers(roomID)).Result()
	if err != nil {
		return RallyInfo{}, err
	}
	inRoom, err := s.membersOfOpenRooms(ctx)
	if err != nil {
		return RallyInfo{}, err
	}
	for _, id := range members {
		inRoom[id] = struct{}{}
	}

	// The host's own name + rating ride on every push: the dialog has to say WHO
	// is calling and how strong they are (owner: 明顯提示姓名與積分) and the
	// recipient has no other way to resolve an accountId into either.
	//
	// ⛔ Do NOT read this off `people`: presence is a TTL key, so a host whose
	// lobby socket is reconnecting is absent from his own roster and every
	// recipient's dialog prints a raw ULID instead of a name (measured in the
	// browser, 2026-08-21). Lookup answers from the account file.
	host, err := s.roster.Lookup(ctx, actor)
	if err != nil {
		return RallyInfo{}, err
	}
	hostName, hostMMR := host.Username, host.MMR

	info := RallyInfo{InLobby: len(people), ExpiresAt: expiresAt, WaitSec: wait}
	for _, p := range people {
		if p.ID == actor {
			continue
		}
		if _, already := inRoom[p.ID]; already {
			continue
		}
		if info.Invited >= maxRallyTargets {
			info.Truncated = true
			break
		}
		// The token outlives the countdown by a grace margin on purpose: a player
		// who presses 加入 on the last tick must not be refused by an invite that
		// expired between the click and the request.
		if err := s.pushRallyInvite(ctx, rm, actor, hostName, hostMMR, p.ID, expiresAt, wait,
			time.Duration(wait*float64(time.Second))+rallyTokenGrace); err != nil {
			return RallyInfo{}, err
		}
		info.Invited++
	}
	return info, nil
}

// maxRallyRoomScan bounds the open-room walk rule 2 does. Same window as
// ListOpen's lobby list, for the same reason: the room browser only ever shows
// that many, so a room past it is not one a player could have walked into.
const maxRallyRoomScan = 50

// membersOfOpenRooms is every account currently sitting in ANY open room.
//
// ⭐ It exists because the dialog is OPT-OUT (owner 2026-08-21: 「預設是加入」):
// a player waiting in another room would otherwise be pulled OUT of it by a
// countdown he never asked for. Under the old opt-in dialog this was merely a
// stray modal.
//
// ⚠️ A read error is an ERROR, ⛔ never an empty map: degrading to 「nobody is in a
// room」 would silently restore exactly the behaviour this prevents, and the only
// visible symptom would be a stranger appearing in somebody else's match.
func (s *Service) membersOfOpenRooms(ctx context.Context) (map[string]struct{}, error) {
	ids, err := s.rdb.R.ZRevRange(ctx, redisx.KeyRoomsOpen(), 0, maxRallyRoomScan-1).Result()
	if err != nil {
		return nil, err
	}
	out := make(map[string]struct{}, 16)
	for _, id := range ids {
		mem, err := s.rdb.R.SMembers(ctx, redisx.KeyRoomMembers(id)).Result()
		if err != nil {
			return nil, err
		}
		for _, m := range mem {
			out[m] = struct{}{}
		}
	}
	return out, nil
}

// rallyTokenGrace is how long a rally token outlives the countdown it was minted
// for. It covers the click→request round trip of a last-tick 加入.
const rallyTokenGrace = 20 * time.Second

// pushRallyInvite mints one single-use token for `targetID` and publishes the
// confirm-dialog push on that account's lobby channel.
func (s *Service) pushRallyInvite(ctx context.Context, rm Room, actor, hostName string, hostMMR int,
	targetID string, expiresAt int64, waitSec float64, ttl time.Duration) error {
	raw := make([]byte, 32) // 256 bits of entropy, same as CreateInvite
	if _, err := rand.Read(raw); err != nil {
		return err
	}
	token := hex.EncodeToString(raw)
	payload, err := json.Marshal(Invite{RoomID: rm.ID, From: actor, To: targetID})
	if err != nil {
		return err
	}
	if err := s.rdb.R.SetEx(ctx, redisx.KeyInvite(token), payload, ttl).Err(); err != nil {
		return err
	}
	return s.rdb.PublishJSON(ctx, redisx.ChanLobby(targetID), InvitePush{
		Type: "invite", RoomID: rm.ID, Room: rm.Name, From: actor, Token: token,
		Broadcast: true, FromName: hostName, FromMMR: hostMMR,
		ExpiresAt: expiresAt, WaitSec: waitSec,
	})
}
