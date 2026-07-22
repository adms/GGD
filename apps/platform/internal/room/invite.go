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
}

// InvitePush is the message delivered to the target over the lobby WS.
type InvitePush struct {
	Type   string `json:"type"` // "invite"
	RoomID string `json:"roomId"`
	Room   string `json:"roomName"`
	From   string `json:"from"`
	Token  string `json:"token"`
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
