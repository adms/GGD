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

// Invite is the payload stored at invite:<token> (TTL-bound, single-use).
type Invite struct {
	RoomID string `json:"roomId"`
	From   string `json:"from"`
	To     string `json:"to"`
	// Side is the 陣營意向 (GH#655) the HOST picked when minting this invite:
	// SideAlly ("和我同一隊") or SideEnemy ("坐到對面"). Empty = the pre-#655
	// behaviour, i.e. wherever the packer happens to put them.
	//
	// ⚠️ It rides on the invite rather than being a second request because the
	// choice belongs to the moment the host pressed 邀請 — an accept that had to
	// carry it back would let the invitee overwrite the host's pick.
	Side string `json:"side,omitempty"`
}

// InvitePush is the message delivered to the target over the lobby WS.
//
// ⚠️ The five GH#492 fields below are all `omitempty`, and that is what keeps a
// hand-picked invite (invite.go's CreateInvite) byte-identical to what it has
// always been on the wire: the client tells a RALLY apart from a personal invite
// by `broadcast`, and only a rally opens the modal confirm dialog. A personal
// invite stays the quiet corner toast it was.
type InvitePush struct {
	Type   string `json:"type"` // "invite"
	RoomID string `json:"roomId"`
	Room   string `json:"roomName"`
	From   string `json:"from"`
	Token  string `json:"token"`
	// Broadcast marks a 大廳集合令 (GH#492) — the whole lobby was called, so the
	// client raises a MODAL confirm dialog with a countdown instead of a toast.
	Broadcast bool `json:"broadcast,omitempty"`
	// FromName / FromMMR are the HOST's display name and ladder rating. owner
	// 2026-08-21:「明顯提示姓名與積分」 — the recipient cannot resolve an accountId
	// into either, so they ride on the push.
	FromName string `json:"fromName,omitempty"`
	FromMMR  int    `json:"fromMmr,omitempty"`
	// ExpiresAt is the SERVER-stamped deadline (unix ms) shared by every
	// recipient of one broadcast. ⛔ Never let a browser start its own clock from
	// the frame's arrival: sockets deliver at different times and the match would
	// start while somebody's dialog still shows 4 秒.
	ExpiresAt int64 `json:"expiresAt,omitempty"`
	// WaitSec is the countdown length the deadline was built from — the dialog's
	// progress bar needs the span, not just the end.
	WaitSec float64 `json:"waitSec,omitempty"`
}

// CreateInvite mints a crypto/rand 256-bit single-use token (TTL ttl) for the
// room and pushes it to the target's lobby channel. Host-only.
func (s *Service) CreateInvite(ctx context.Context, actor, roomID, targetID string, ttl time.Duration) (string, error) {
	rm, err := s.requireHost(ctx, actor, roomID)
	if err != nil {
		return "", err
	}
	if targetID == "" || targetID == actor {
		return "", httpx.BadRequest("invalid invite target")
	}
	raw := make([]byte, 32) // 256 bits of entropy
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	token := hex.EncodeToString(raw)
	payload, err := json.Marshal(Invite{RoomID: roomID, From: actor, To: targetID})
	if err != nil {
		return "", err
	}
	if err := s.rdb.R.SetEx(ctx, redisx.KeyInvite(token), payload, ttl).Err(); err != nil {
		return "", err
	}
	_ = s.rdb.PublishJSON(ctx, redisx.ChanLobby(targetID), InvitePush{
		Type: "invite", RoomID: roomID, Room: rm.Name, From: actor, Token: token,
	})
	return token, nil
}

// AcceptInvite redeems a token (GETDEL — single use) and joins the room. If
// the invite was addressed to a specific account, only that account may use
// it.
func (s *Service) AcceptInvite(ctx context.Context, actor, token string) (Room, error) {
	if token == "" || len(token) > 128 {
		return Room{}, httpx.BadRequest("invalid invite code")
	}
	payload, err := s.rdb.GetDel(ctx, redisx.KeyInvite(token))
	if err != nil {
		return Room{}, err
	}
	if payload == "" {
		return Room{}, httpx.NotFound("invite is invalid or expired")
	}
	var inv Invite
	if err := json.Unmarshal([]byte(payload), &inv); err != nil {
		return Room{}, httpx.Internal("corrupt invite")
	}
	if inv.To != "" && inv.To != actor {
		return Room{}, httpx.Forbidden("this invite is not for you")
	}
	return s.Join(ctx, actor, inv.RoomID)
}
