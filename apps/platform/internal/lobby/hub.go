// Package lobby owns the per-client WebSocket connection: presence deltas to
// friends, invite + seat-token pushes, and room chat. All cross-feature
// fan-out arrives via Redis Pub/Sub (chan:presence, chan:lobby:<id>,
// chan:room:<id>), so the hub is multi-replica-ready.
package lobby

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"sync"

	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/friend"
)

type client struct {
	accountID string
	username  string
	// seq is the hub-wide registration order, used to pick the OLDEST socket
	// when an account is over its connection cap. It is assigned under h.mu in
	// register and read only there.
	seq       uint64
	out       chan []byte
	closed    chan struct{}
	closeOnce sync.Once
}

func (c *client) close() { c.closeOnce.Do(func() { close(c.closed) }) }

func (c *client) send(payload []byte) {
	select {
	case c.out <- payload:
	case <-c.closed:
	default: // slow consumer: drop instead of blocking the hub
	}
}

// DefaultMaxConnsPerAccount bounds how many lobby sockets ONE account may hold
// open at once (#724/F-10).
//
// The edge's `limit_conn wsconn` is keyed on an ADDRESS, which is a different
// question and cannot answer this one: a household behind one NAT shares an
// address, and a single authenticated account reconnecting in a loop from many
// addresses is not capped by it at all. Before this, hub.register appended to
// h.conns[accountID] without any ceiling, so one script holding an access token
// could grow that map — and its per-connection goroutines, 64-slot out channels
// and file descriptors — until the process died.
//
// 8 is deliberately far above real use (a player has one game tab, sometimes a
// second) and far below anything that costs the process something, so it never
// fires for a person and always fires for a loop. Over the cap the OLDEST
// socket is evicted rather than the new one refused: the failure this actually
// meets in the wild is a client that reconnected without its previous socket
// being reaped, and refusing the new one there would lock a real player out of
// their own lobby — the one outcome worse than the leak.
const DefaultMaxConnsPerAccount = 8

// Hub routes Redis pub/sub traffic to connected WebSocket clients.
type Hub struct {
	rdb     *redisx.Client
	friends *friend.Service

	mu            sync.Mutex
	conns         map[string]map[*client]bool
	maxPerAccount int
	seq           uint64

	ready     chan struct{}
	readyOnce sync.Once
}

// NewHub builds the hub.
func NewHub(rdb *redisx.Client, friends *friend.Service) *Hub {
	return &Hub{
		rdb: rdb, friends: friends,
		conns:         map[string]map[*client]bool{},
		maxPerAccount: DefaultMaxConnsPerAccount,
		ready:         make(chan struct{}),
	}
}

// SetMaxConnsPerAccount overrides the per-account socket ceiling. 0 disables
// the cap — the pre-#724 behaviour, offered only so the operator has a
// one-setting way back if the ceiling ever bites a real player (see the const's
// doc for why it should not). A NEGATIVE value means "not configured" and
// leaves DefaultMaxConnsPerAccount in place, so the default lives in exactly
// one place rather than being copied into the config package.
func (h *Hub) SetMaxConnsPerAccount(n int) {
	if n < 0 {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	h.maxPerAccount = n
}

// Ready is closed once the pub/sub subscription is live.
func (h *Hub) Ready() <-chan struct{} { return h.ready }

// Run subscribes to all platform channels and dispatches until ctx is done.
func (h *Hub) Run(ctx context.Context) {
	pubsub := h.rdb.R.PSubscribe(ctx, "chan:*")
	defer pubsub.Close()
	if _, err := pubsub.Receive(ctx); err != nil {
		slog.Error("lobby hub subscribe", "err", err)
		return
	}
	h.readyOnce.Do(func() { close(h.ready) })
	ch := pubsub.Channel()
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			h.dispatch(ctx, msg.Channel, []byte(msg.Payload))
		}
	}
}

func (h *Hub) dispatch(ctx context.Context, channel string, payload []byte) {
	switch {
	case channel == redisx.ChanPresence():
		h.onPresence(ctx, payload)
	case strings.HasPrefix(channel, "chan:lobby:"):
		aid := strings.TrimPrefix(channel, "chan:lobby:")
		h.sendTo(aid, payload)
	case strings.HasPrefix(channel, "chan:room:"):
		rid := strings.TrimPrefix(channel, "chan:room:")
		h.onRoomMessage(ctx, rid, payload)
	}
}

// onPresence pushes a presence delta to every connected friend of the account.
func (h *Hub) onPresence(ctx context.Context, payload []byte) {
	var delta redisx.PresenceDelta
	if err := json.Unmarshal(payload, &delta); err != nil {
		return
	}
	doc, err := h.friends.Get(ctx, delta.AccountID)
	if err != nil {
		return
	}
	msg, _ := json.Marshal(map[string]string{
		"type": "presence", "accountId": delta.AccountID, "state": delta.State,
	})
	for friendID := range doc.Friends {
		h.sendTo(friendID, msg)
	}
}

// onRoomMessage fans a room-channel payload (chat) out to connected members.
func (h *Hub) onRoomMessage(ctx context.Context, roomID string, payload []byte) {
	members, err := h.rdb.R.SMembers(ctx, redisx.KeyRoomMembers(roomID)).Result()
	if err != nil {
		return
	}
	for _, aid := range members {
		h.sendTo(aid, payload)
	}
}

func (h *Hub) sendTo(accountID string, payload []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.conns[accountID] {
		c.send(payload)
	}
}

// register adds a socket and enforces the per-account ceiling, returning every
// client it evicted so the caller can tear their connections down. Eviction is
// oldest-first by registration order.
func (h *Hub) register(c *client) []*client {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.conns[c.accountID] == nil {
		h.conns[c.accountID] = map[*client]bool{}
	}
	h.seq++
	c.seq = h.seq
	h.conns[c.accountID][c] = true
	if h.maxPerAccount <= 0 {
		return nil
	}
	var evicted []*client
	for len(h.conns[c.accountID]) > h.maxPerAccount {
		var oldest *client
		for k := range h.conns[c.accountID] {
			if oldest == nil || k.seq < oldest.seq {
				oldest = k
			}
		}
		if oldest == nil {
			break
		}
		delete(h.conns[c.accountID], oldest)
		evicted = append(evicted, oldest)
	}
	return evicted
}

// unregister removes the client; reports whether it was the account's last.
func (h *Hub) unregister(c *client) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.conns[c.accountID], c)
	if len(h.conns[c.accountID]) == 0 {
		delete(h.conns, c.accountID)
		return true
	}
	return false
}

// Connected reports whether an account has at least one live WS.
func (h *Hub) Connected(accountID string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.conns[accountID]) > 0
}
