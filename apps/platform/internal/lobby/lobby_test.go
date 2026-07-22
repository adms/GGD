package lobby_test

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/presence"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

func createRoom(ts *testutil.TS, u testutil.User, name string) string {
	ts.T.Helper()
	r := ts.Do(http.MethodPost, "/api/v1/rooms", u.Access, map[string]string{"name": name})
	require.Equal(ts.T, http.StatusOK, r.Status, string(r.Raw))
	return r.Body["room"].(map[string]any)["id"].(string)
}

func TestWSRequiresAuth(t *testing.T) {
	testkit.Cover(t, "lobby-ws-auth")
	ts := testutil.New(t)

	// No token: handshake rejected.
	_, resp, err := ts.DialWS("")
	require.Error(t, err)
	require.NotNil(t, resp)
	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)

	// Garbage token: rejected.
	_, resp, err = ts.DialWS("not-a-jwt")
	require.Error(t, err)
	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)

	// Valid token: accepted.
	u := ts.Register("alice")
	ws, _, err := ts.DialWS(u.Access)
	require.NoError(t, err)
	ws.Send(map[string]string{"type": "heartbeat"})
	msg, err := ws.Read(3 * time.Second)
	require.NoError(t, err)
	require.Equal(t, "heartbeat_ack", msg["type"])
}

func TestOpenRoomList(t *testing.T) {
	testkit.Cover(t, "lobby-room-list")
	ts := testutil.New(t)
	u := ts.Register("alice")

	rid1 := createRoom(ts, u, "Room One")
	r := ts.Do(http.MethodGet, "/api/v1/lobby/rooms", u.Access, nil)
	require.Equal(t, http.StatusOK, r.Status)
	rooms := r.Body["rooms"].([]any)
	require.Len(t, rooms, 1)
	require.Equal(t, rid1, rooms[0].(map[string]any)["id"])

	// Leaving (last member) disposes the room → gone from the ZSET-backed list.
	ts.Do(http.MethodPost, "/api/v1/rooms/"+rid1+"/leave", u.Access, nil)
	r = ts.Do(http.MethodGet, "/api/v1/lobby/rooms", u.Access, nil)
	require.Empty(t, r.Body["rooms"].([]any))
}

func TestChatBroadcast(t *testing.T) {
	testkit.Cover(t, "lobby-chat-broadcast")
	ts := testutil.New(t)
	a, b := ts.Register("alice"), ts.Register("bob")
	rid := createRoom(ts, a, "Chatty")
	require.Equal(t, http.StatusOK, ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/join", b.Access, nil).Status)

	wsA := ts.MustDialWS(a.Access)
	wsB := ts.MustDialWS(b.Access)

	wsA.Send(map[string]string{"type": "chat", "roomId": rid, "text": "hello team"})
	msg, err := wsB.ReadUntil(5*time.Second, func(m map[string]any) bool { return m["type"] == "chat" })
	require.NoError(t, err)
	require.Equal(t, "hello team", msg["text"])
	require.Equal(t, a.ID, msg["from"])

	// The sender (also a member) receives it too.
	msg, err = wsA.ReadUntil(5*time.Second, func(m map[string]any) bool { return m["type"] == "chat" })
	require.NoError(t, err)
	require.Equal(t, "hello team", msg["text"])
}

func TestChatXSSSanitized(t *testing.T) {
	testkit.Cover(t, "lobby-chat-xss")
	ts := testutil.New(t)
	a, b := ts.Register("alice"), ts.Register("bob")
	rid := createRoom(ts, a, "Escapes")
	ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/join", b.Access, nil)

	wsA := ts.MustDialWS(a.Access)
	wsB := ts.MustDialWS(b.Access)

	// Script payload arrives escaped, never raw.
	wsA.Send(map[string]string{"type": "chat", "roomId": rid, "text": `<script>alert("xss")</script>`})
	msg, err := wsB.ReadUntil(5*time.Second, func(m map[string]any) bool { return m["type"] == "chat" })
	require.NoError(t, err)
	text := msg["text"].(string)
	require.NotContains(t, text, "<script>")
	require.Contains(t, text, "&lt;script&gt;")

	// Stored history is escaped too.
	hist := ts.Do(http.MethodGet, "/api/v1/rooms/"+rid+"/chat", b.Access, nil)
	require.Equal(t, http.StatusOK, hist.Status)
	require.NotContains(t, string(hist.Raw), "<script>")

	// Control characters are rejected on input.
	wsA.Send(map[string]string{"type": "chat", "roomId": rid, "text": "sneaky\x1b[2Jclear"})
	errMsg, err := wsA.ReadUntil(5*time.Second, func(m map[string]any) bool { return m["type"] == "error" })
	require.NoError(t, err)
	require.Equal(t, "bad_request", errMsg["code"])
}

func TestChatRateLimit(t *testing.T) {
	testkit.Cover(t, "lobby-chat-rate-limit")
	ts := testutil.New(t)
	a := ts.Register("alice")
	rid := createRoom(ts, a, "Spam")
	ws := ts.MustDialWS(a.Access)

	for i := 0; i < 8; i++ {
		ws.Send(map[string]string{"type": "chat", "roomId": rid, "text": "spam spam"})
	}
	msg, err := ws.ReadUntil(5*time.Second, func(m map[string]any) bool {
		return m["type"] == "error" && m["code"] == "rate_limited"
	})
	require.NoError(t, err, "rate limit must trip")
	require.Equal(t, "rate_limited", msg["code"])
}

func TestWSDisconnectCleanup(t *testing.T) {
	testkit.Cover(t, "lobby-ws-cleanup")
	ts := testutil.New(t)
	u := ts.Register("alice")
	ws := ts.MustDialWS(u.Access)

	// Connected: presence is in-lobby, hub tracks the conn.
	require.Eventually(t, func() bool {
		st, _ := ts.Srv.Presence.Get(context.Background(), u.ID)
		return st == presence.StateInLobby
	}, 5*time.Second, 20*time.Millisecond)
	require.True(t, ts.Srv.Hub.Connected(u.ID))

	// Drop the socket: hub entry AND presence key must be cleaned up.
	require.NoError(t, ws.Conn.CloseNow())
	require.Eventually(t, func() bool {
		if ts.Srv.Hub.Connected(u.ID) {
			return false
		}
		st, _ := ts.Srv.Presence.Get(context.Background(), u.ID)
		return st == presence.StateOffline
	}, 5*time.Second, 20*time.Millisecond, "disconnect must clear presence and hub state")
}

func TestWSMalformedFrameNotFatal(t *testing.T) {
	testkit.Cover(t, "lobby-ws-malformed")
	ts := testutil.New(t)
	u := ts.Register("alice")
	ws := ts.MustDialWS(u.Access)

	// Garbage JSON → error frame, connection survives.
	require.NoError(t, ws.Conn.Write(context.Background(), 1 /*text*/, []byte("{{{not json")))
	msg, err := ws.ReadUntil(5*time.Second, func(m map[string]any) bool { return m["type"] == "error" })
	require.NoError(t, err)
	require.Equal(t, "bad_request", msg["code"])

	// Unknown type → error frame, connection survives.
	ws.Send(map[string]string{"type": "hack-the-planet"})
	_, err = ws.ReadUntil(5*time.Second, func(m map[string]any) bool { return m["type"] == "error" })
	require.NoError(t, err)

	// Still alive and functional.
	ws.Send(map[string]string{"type": "heartbeat"})
	msg, err = ws.ReadUntil(5*time.Second, func(m map[string]any) bool { return m["type"] == "heartbeat_ack" })
	require.NoError(t, err)
	require.Equal(t, "heartbeat_ack", msg["type"])
}

func TestChatHistoryCapped(t *testing.T) {
	testkit.Cover(t, "lobby-chat-cap")
	ts := testutil.New(t)
	a := ts.Register("alice")
	rid := createRoom(ts, a, "Long")
	ident := auth.Identity{AccountID: a.ID, Username: a.Username}
	ctx := context.Background()

	sent := 0
	for sent < 60 {
		err := ts.Srv.Sessions.SendChat(ctx, ident, rid, "msg")
		if err != nil {
			// Rate limited: jump past the window and retry.
			ts.Mini.FastForward(11 * time.Second)
			continue
		}
		sent++
	}
	n, err := ts.Srv.Rdb.R.XLen(ctx, "room:"+rid+":chat").Result()
	require.NoError(t, err)
	require.LessOrEqual(t, n, int64(50), "chat stream must be trimmed to the cap")
	require.Greater(t, n, int64(0))
}

// TestPresencePushToFriends covers friend-09: a friend's presence delta is
// pushed over the lobby WS.
func TestPresencePushToFriends(t *testing.T) {
	testkit.Cover(t, "presence-push")
	ts := testutil.New(t)
	a, b := ts.Register("alice"), ts.Register("bob")
	// Befriend.
	ts.Do(http.MethodPost, "/api/v1/friends/requests", a.Access, map[string]string{"username": "bob"})
	ts.Do(http.MethodPost, "/api/v1/friends/requests/"+a.ID+"/accept", b.Access, nil)

	wsB := ts.MustDialWS(b.Access)

	// Alice comes online (WS connect sets in-lobby presence) → Bob gets a delta.
	wsA := ts.MustDialWS(a.Access)
	msg, err := wsB.ReadUntil(5*time.Second, func(m map[string]any) bool {
		return m["type"] == "presence" && m["accountId"] == a.ID
	})
	require.NoError(t, err)
	require.Equal(t, presence.StateInLobby, msg["state"])

	// Alice disconnects → Bob sees offline.
	require.NoError(t, wsA.Conn.CloseNow())
	msg, err = wsB.ReadUntil(5*time.Second, func(m map[string]any) bool {
		return m["type"] == "presence" && m["accountId"] == a.ID && m["state"] == presence.StateOffline
	})
	require.NoError(t, err)
	require.Equal(t, presence.StateOffline, msg["state"])
}
