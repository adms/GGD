package lobby

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/httpx"
	"github.com/ggd/platform/internal/presence"
	"github.com/ggd/platform/internal/room"
)

// DefaultReadLimitBytes caps ONE inbound lobby frame (#724/F-10). Every message
// this endpoint understands is a small JSON object — the largest is a chat line
// — so a limit three orders of magnitude above them costs nothing and stops a
// peer from making the process allocate an arbitrarily large buffer per frame.
const DefaultReadLimitBytes int64 = 32 << 10 // 32 KiB

// DefaultReadIdleTimeout reaps a socket that has gone silent.
//
// A LOBBY SOCKET HAS NO OTHER LIVENESS SIGNAL. TCP alone will hold a half-open
// connection (peer powered off, laptop lid closed, NAT entry dropped) for
// hours, and each one costs the hub a goroutine pair, an out channel and a file
// descriptor — plus it keeps the account's presence lit, so friends see a
// player who left. Before this the read had no deadline at all.
//
// The value is sized against the client's OWN heartbeat, not against taste:
// LobbySocket beats every 20s, so 90s tolerates four consecutive misses before
// a live player is disturbed — and a disturbed player reconnects automatically
// (LobbySocket's 3s backoff), which is why erring low here is cheap and erring
// high leaves the leak open.
const DefaultReadIdleTimeout = 90 * time.Second

// Sessions owns the WS endpoint and chat plumbing.
type Sessions struct {
	hub   *Hub
	authn *auth.Service
	pres  *presence.Service
	rooms *room.Service
	rdb   *redisx.Client

	readLimit int64
	readIdle  time.Duration
}

// NewSessions wires the lobby sessions service.
func NewSessions(hub *Hub, authn *auth.Service, pres *presence.Service, rooms *room.Service, rdb *redisx.Client) *Sessions {
	return &Sessions{
		hub: hub, authn: authn, pres: pres, rooms: rooms, rdb: rdb,
		readLimit: DefaultReadLimitBytes,
		readIdle:  DefaultReadIdleTimeout,
	}
}

// SetReadLimits overrides the per-frame byte cap and the silence deadline.
// A ZERO idle timeout disables the deadline (pre-#724 behaviour) — the
// operator's way back if a client ever stops heartbeating. A NEGATIVE idle, or
// a non-positive byte limit, means "not configured" and leaves this package's
// default in place, so each default has exactly one home.
func (s *Sessions) SetReadLimits(limitBytes int64, idle time.Duration) {
	if limitBytes > 0 {
		s.readLimit = limitBytes
	}
	if idle >= 0 {
		s.readIdle = idle
	}
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
	// Authenticate BEFORE upgrading: Authorization header, or ?token= — THE ONE
	// route allowed the query fallback, because the browser's WebSocket
	// constructor cannot set headers. Every REST route lost it in #724/F-12; see
	// auth.BearerTokenWS.
	tok := auth.BearerTokenWS(r)
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

	// This socket outlives any server-wide Read/WriteTimeout by design — those
	// are armed on the connection before this handler runs and survive the
	// hijack below, so without this the #724/F-09 timeouts would sever every
	// lobby socket on the clock. See httpx.ClearDeadlines.
	httpx.ClearDeadlines(w)

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: []string{"*"}, // the edge enforces origin; skeleton accepts all
	})
	if err != nil {
		return
	}
	defer conn.Close(websocket.StatusInternalError, "closing")
	conn.SetReadLimit(s.readLimit)

	c := &client{
		accountID: ident.AccountID,
		username:  ident.Username,
		out:       make(chan []byte, 64),
		closed:    make(chan struct{}),
	}
	for _, old := range s.hub.register(c) {
		old.close() // over the per-account cap — its handler unblocks and cleans up
	}
	ctx := r.Context()
	// A client the hub evicted has already left h.conns, but its own handler is
	// still parked in conn.Read and would not notice until the idle deadline.
	// Closing the socket when c.closed fires is what turns "removed from the
	// routing table" into "the file descriptor is actually gone" — without it
	// the cap would bound fan-out and nothing else.
	go func() {
		<-c.closed
		_ = conn.Close(websocket.StatusPolicyViolation, "connection replaced")
	}()
	_ = s.pres.Set(ctx, ident.AccountID, presence.StateInLobby)
	// #246 liveness stamp. This handler is NOT behind auth.Middleware — it does
	// its own token verification above — so without this call a player sitting
	// in a match with the socket open and no REST polling would silently go dark
	// on the admin console's online light. Same one-write-per-minute gate.
	s.authn.TouchLastSeen(ctx, ident.AccountID)

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
	// Each read carries the silence deadline (see DefaultReadIdleTimeout) so a
	// half-open connection is reaped instead of held forever.
	for {
		readCtx, cancelRead := ctx, context.CancelFunc(func() {})
		if s.readIdle > 0 {
			readCtx, cancelRead = context.WithTimeout(ctx, s.readIdle)
		}
		_, data, err := conn.Read(readCtx)
		cancelRead()
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
			// The heartbeat IS session activity (#246), and for a player deep in
			// a match it may be the only traffic there is. Same one-per-minute
			// gate, so a 20s heartbeat cadence still costs one write a minute.
			s.authn.TouchLastSeen(ctx, ident.AccountID)
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
