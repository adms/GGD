package lobby

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/httpx"
	"github.com/ggd/platform/internal/presence"
	"github.com/ggd/platform/internal/room"
)

// Sessions owns the WS endpoint and chat plumbing.
type Sessions struct {
	hub   *Hub
	authn *auth.Service
	pres  *presence.Service
	rooms *room.Service
	rdb   *redisx.Client
}

// NewSessions wires the lobby sessions service.
func NewSessions(hub *Hub, authn *auth.Service, pres *presence.Service, rooms *room.Service, rdb *redisx.Client) *Sessions {
	return &Sessions{hub: hub, authn: authn, pres: pres, rooms: rooms, rdb: rdb}
}

// Mount registers the WS endpoint (token-authenticated at handshake) and the
// chat-history REST route on the /api/v1 subrouter.
func (s *Sessions) Mount(r chi.Router) {
	r.Get("/lobby/ws", s.handleWS)
	r.Group(func(pr chi.Router) {
		pr.Use(s.authn.Middleware)
		pr.Get("/rooms/{id}/chat", s.handleChatHistory)
	})
}

// clientMsg is anything the browser sends over the lobby WS.
type clientMsg struct {
	Type   string `json:"type"`
	RoomID string `json:"roomId,omitempty"`
	Text   string `json:"text,omitempty"`
}

type errMsg struct {
	Type    string `json:"type"` // "error"
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (s *Sessions) handleWS(w http.ResponseWriter, r *http.Request) {
	// Authenticate BEFORE upgrading: token via ?token= or Authorization.
	tok := auth.BearerToken(r)
	if tok == "" {
		httpx.WriteError(w, httpx.Unauthorized("missing access token"))
		return
	}
	claims, err := s.authn.VerifyAccess(tok)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	// A valid access token is NOT enough to enter the lobby. The token is a
	// signed bearer credential that keeps asserting whatever was true when it was
	// minted for its whole TTL, so an operator's #126 denial (or a ban) applied a
	// moment ago would otherwise let a just-refused player keep playing until his
	// token happened to expire. Re-read the durable account status at the
	// handshake — the door to actually playing — and answer the same 403 a login
	// would, BEFORE upgrading. Same guard the room/match REST routes carry via
	// auth.PlayableOnly. See auth.Service.AuthorizePlay.
	if err := s.authn.AuthorizePlay(r.Context(), claims.Subject); err != nil {
		httpx.WriteError(w, err)
		return
	}
	ident := auth.Identity{AccountID: claims.Subject, Username: claims.Username}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: []string{"*"}, // the edge enforces origin; skeleton accepts all
	})
	if err != nil {
		return
	}
	defer conn.Close(websocket.StatusInternalError, "closing")

	c := &client{
		accountID: ident.AccountID,
		username:  ident.Username,
		out:       make(chan []byte, 64),
		closed:    make(chan struct{}),
	}
	s.hub.register(c)
	ctx := r.Context()
	_ = s.pres.Set(ctx, ident.AccountID, presence.StateInLobby)

	// Writer.
	go func() {
		for {
			select {
			case <-c.closed:
				return
			case msg := <-c.out:
				if err := conn.Write(ctx, websocket.MessageText, msg); err != nil {
					c.close()
					return
				}
			}
		}
	}()

	// Reader loop: malformed frames get an error reply, never kill the socket.
	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			break
		}
		var msg clientMsg
		if err := json.Unmarshal(data, &msg); err != nil {
			s.replyErr(c, httpx.BadRequest("malformed message"))
			continue
		}
		switch msg.Type {
		case "heartbeat":
			_ = s.pres.Heartbeat(ctx, ident.AccountID)
			c.send([]byte(`{"type":"heartbeat_ack"}`))
		case "chat":
			if err := s.SendChat(ctx, ident, msg.RoomID, msg.Text); err != nil {
				s.replyErr(c, err)
			}
		default:
			s.replyErr(c, httpx.BadRequest("unknown message type"))
		}
	}

	// Cleanup: drop the conn; last conn of the account clears presence.
	c.close()
	if last := s.hub.unregister(c); last {
		_ = s.pres.Clear(context.WithoutCancel(ctx), ident.AccountID)
	}
	// Terminal courtesy close: the read loop has already broken, so the peer is
	// gone by construction and there is no recovery path for a close error.
	// Matches the established style in this file (_ = s.pres.Clear above).
	_ = conn.Close(websocket.StatusNormalClosure, "bye")
}

func (s *Sessions) replyErr(c *client, err error) {
	e := errMsg{Type: "error", Code: "internal", Message: "internal error"}
	if he, ok := err.(*httpx.E); ok {
		e.Code, e.Message = he.Code, he.Message
	}
	data, _ := json.Marshal(e)
	c.send(data)
}

func (s *Sessions) handleChatHistory(w http.ResponseWriter, r *http.Request) {
	ident := auth.MustIdentity(r.Context())
	msgs, err := s.ChatHistory(r.Context(), ident, chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"messages": msgs})
}
