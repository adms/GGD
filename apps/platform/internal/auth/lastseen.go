package auth

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/data/redisx"
)

// LastSeenWindow is the coalescing window of the #246 liveness stamp: at most
// ONE durable account write per account per window, no matter how many
// authenticated requests arrive in it.
//
// WHY THE THROTTLE IS LOAD-BEARING, NOT HYGIENE. The owner's rule is「有做任何
// session 連線動作都算」, so every authenticated call counts — and the client
// polls hard: the room view every 2s, the room list every 5s, friends every 10s,
// and the lobby WS heartbeats every 20s. That is ~18–48 stamps per minute per
// active player. Ungated, 35 concurrent accounts would be 630–1,680 durable
// writes/minute (10–28/s) of FULL-FILE rewrites against a single-writer JSON
// store with a WAL. Gated, the same 35 accounts cost at most 35 writes/minute —
// 0.58/s at the absolute ceiling, and a realistic family deploy of 2–6
// concurrent players costs ≤6 writes/minute.
//
// The accuracy this buys back is irrelevant: ±60s of error against the console's
// 60-MINUTE threshold is 1.7%, so the light can never visibly disagree with the
// truth.
const LastSeenWindow = time.Minute

// TouchLastSeen records that this account did something on an authenticated
// session, at most once per LastSeenWindow.
//
// It is a SIDE EFFECT of a request that has already been authorized, never a
// step that request depends on: every failure path returns silently and the
// caller carries on. Callers therefore ignore it entirely — see
// Service.Middleware and lobby.Sessions.handleWS.
//
// FAIL CLOSED ON THE GATE. If the SetNX call errors (Redis down, timeout), the
// durable write is SKIPPED, not attempted. Losing a cosmetic lastSeen stamp
// costs nothing; letting a broken throttle fall open would hand the JSON store
// the exact write storm the throttle exists to prevent, at the moment the deploy
// is already unhealthy.
func (s *Service) TouchLastSeen(ctx context.Context, accountID string) {
	if s == nil || s.rdb == nil || s.accounts == nil || accountID == "" {
		return
	}
	ok, err := s.rdb.SetNX(ctx, redisx.KeySeenGate(accountID), "1", LastSeenWindow)
	if err != nil || !ok {
		return // throttled, or the gate is unavailable — fail closed either way
	}
	// The durable write must outlive the request it rode in on: a client that
	// disconnects mid-flight has still demonstrably been seen, and abandoning a
	// half-done account write on ctx cancellation would be strictly worse than
	// finishing it.
	if err := s.accounts.SetLastSeen(context.WithoutCancel(ctx), accountID, time.Now()); err != nil {
		if errors.Is(err, account.ErrNotFound) {
			return // the account was deleted between auth and here; nothing to stamp
		}
		slog.Warn("auth: could not stamp lastSeen (the online light will read stale for this account)",
			"err", err, "accountId", accountID)
	}
}
