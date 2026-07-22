package lobby

import (
	"context"
	"html"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/httpx"
)

// Chat limits.
const (
	chatMaxLen     = 500
	chatStreamCap  = 50
	chatRateLimit  = 5
	chatRateWindow = 10 * time.Second
)

// ChatMessage is broadcast on chan:room:<id> and stored in the capped stream.
// Text is HTML-escaped before it ever leaves the service (XSS-safe output).
type ChatMessage struct {
	Type     string `json:"type"` // "chat"
	RoomID   string `json:"roomId"`
	From     string `json:"from"`
	FromName string `json:"fromName"`
	Text     string `json:"text"`
	At       int64  `json:"at"`
}

func hasControlChars(s string) bool {
	for _, r := range s {
		if r == '\n' || r == '\t' {
			continue
		}
		if r < 0x20 || r == 0x7f {
			return true
		}
	}
	return false
}

// SendChat validates, sanitizes, rate-limits, persists (capped stream) and
// broadcasts one chat message.
func (s *Sessions) SendChat(ctx context.Context, ident auth.Identity, roomID, text string) error {
	if roomID == "" || text == "" {
		return httpx.BadRequest("roomId and text required")
	}
	if len(text) > chatMaxLen {
		return httpx.BadRequest("message too long")
	}
	if hasControlChars(text) {
		return httpx.BadRequest("control characters are not allowed")
	}
	member, err := s.rooms.IsMember(ctx, ident.AccountID, roomID)
	if err != nil {
		return err
	}
	if !member {
		return httpx.Forbidden("not a member of this room")
	}
	ok, err := s.rdb.RateAllow(ctx, "chat", ident.AccountID, chatRateLimit, chatRateWindow)
	if err != nil {
		return err
	}
	if !ok {
		return httpx.RateLimited("slow down")
	}
	msg := ChatMessage{
		Type: "chat", RoomID: roomID, From: ident.AccountID,
		FromName: html.EscapeString(ident.Username),
		Text:     html.EscapeString(text), // escape-on-output: stored & broadcast escaped
		At:       time.Now().UnixMilli(),
	}
	if err := s.rdb.R.XAdd(ctx, &redis.XAddArgs{
		Stream: redisx.KeyRoomChat(roomID),
		MaxLen: chatStreamCap,
		Approx: false,
		Values: map[string]any{"from": msg.From, "fromName": msg.FromName, "text": msg.Text, "at": msg.At},
	}).Err(); err != nil {
		return err
	}
	return s.rdb.PublishJSON(ctx, redisx.ChanRoom(roomID), msg)
}

// ChatHistory reads the capped stream (members only).
func (s *Sessions) ChatHistory(ctx context.Context, ident auth.Identity, roomID string) ([]ChatMessage, error) {
	member, err := s.rooms.IsMember(ctx, ident.AccountID, roomID)
	if err != nil {
		return nil, err
	}
	if !member {
		return nil, httpx.Forbidden("not a member of this room")
	}
	entries, err := s.rdb.R.XRange(ctx, redisx.KeyRoomChat(roomID), "-", "+").Result()
	if err != nil {
		return nil, err
	}
	out := make([]ChatMessage, 0, len(entries))
	for _, e := range entries {
		m := ChatMessage{Type: "chat", RoomID: roomID}
		if v, ok := e.Values["from"].(string); ok {
			m.From = v
		}
		if v, ok := e.Values["fromName"].(string); ok {
			m.FromName = v
		}
		if v, ok := e.Values["text"].(string); ok {
			m.Text = v
		}
		out = append(out, m)
	}
	return out, nil
}
