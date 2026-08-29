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

// Hub routes Redis pub/sub traffic to connected WebSocket clients.
type Hub struct {
	rdb     *redisx.Client
	friends *friend.Service

	mu    sync.Mutex
	conns map[string]map[*client]bool

	ready     chan struct{}
	readyOnce sync.Once
}

// NewHub builds the hub.
func NewHub(rdb *redisx.Client, friends *friend.Service) *Hub {
	return &Hub{
		rdb: rdb, friends: friends,
		conns: map[string]map[*client]bool{},
		ready: make(chan struct{}),
	}
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

func (h *Hub) register(c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.conns[c.accountID] == nil {
		h.conns[c.accountID] = map[*client]bool{}
	}
	h.conns[c.accountID][c] = true
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
