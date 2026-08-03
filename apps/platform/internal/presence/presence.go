// Package presence tracks online/in-lobby/in-match state in Redis with a
// heartbeat TTL, fanning deltas out over the chan:presence pub/sub channel.
package presence

import (
	"context"
	"time"

	"github.com/ggd/platform/internal/data/redisx"
)

// States.
const (
	StateOnline  = "online"
	StateInLobby = "in-lobby"
	StateInMatch = "in-match"
	StateOffline = "offline"
)

// Service wraps the Redis presence keys.
type Service struct {
	rdb *redisx.Client
	ttl time.Duration
}

// New builds the presence service.
func New(rdb *redisx.Client, ttl time.Duration) *Service {
	return &Service{rdb: rdb, ttl: ttl}
}

// Set marks an account's state and publishes a delta.
func (s *Service) Set(ctx context.Context, accountID, state string) error {
	return s.rdb.SetPresence(ctx, accountID, state, s.ttl)
}

// Heartbeat refreshes the TTL without a delta.
func (s *Service) Heartbeat(ctx context.Context, accountID string) error {
	return s.rdb.HeartbeatPresence(ctx, accountID, s.ttl)
}

// Get returns the current state ("offline" when the key is absent/expired).
func (s *Service) Get(ctx context.Context, accountID string) (string, error) {
	return s.rdb.GetPresence(ctx, accountID)
}

// GetMany returns the state of every listed account in order, in one round
// trip. Absent/expired keys read as StateOffline. A transport error is
// returned rather than degraded into "everybody offline" — see
// redisx.GetPresenceMany.
func (s *Service) GetMany(ctx context.Context, accountIDs []string) ([]string, error) {
	return s.rdb.GetPresenceMany(ctx, accountIDs)
}

// Clear removes the key and publishes an offline delta.
func (s *Service) Clear(ctx context.Context, accountID string) error {
	return s.rdb.ClearPresence(ctx, accountID)
}
