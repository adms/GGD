package approvelink

import (
	"context"
	"time"

	"github.com/ggd/platform/internal/data/redisx"
)

// Consumer records that a token has been used, once. It is the single-use half
// of the token model, split behind an interface so the pure token logic can be
// unit-tested with an in-memory implementation and the real one is Redis.
type Consumer interface {
	// Consume atomically marks key used for ttl and reports whether THIS call was
	// the first to do so (true = first use, proceed; false = already used, a
	// replay to refuse). It must be atomic: two concurrent POSTs of the same
	// token may both reach here, and exactly one must get true.
	Consume(ctx context.Context, key string, ttl time.Duration) (firstUse bool, err error)
	// Consumed reports, WITHOUT side effect, whether key was already used — the
	// read the prefetch-safe GET confirm page uses to say "already used" without
	// spending the token.
	Consumed(ctx context.Context, key string) (bool, error)
}

// consumeGrace is added to the token TTL when sizing the single-use marker, so
// the "used" record always outlives the token it guards: a token cannot expire
// out of the marker and become replayable in its final moments.
const consumeGrace = time.Hour

// redisKeyPrefix namespaces the single-use markers. Redis is wipeable, which is
// an accepted bound here: a flush inside the token's ~48h window could let one
// already-used link be clicked again, but re-applying the same decision is
// idempotent (re-approving an approved account is a no-op) and the owner can
// re-decide in the console, so the worst case is "a spent link works twice",
// never "a forged link works".
const redisKeyPrefix = "approve:used:"

// redisConsumer is the production Consumer, backed by the platform's Redis. It
// reuses SetNX (atomic set-if-absent, the same primitive the owner-claim and
// refresh-token single-use are built on) and the Exists companion.
type redisConsumer struct{ rdb *redisx.Client }

func (c redisConsumer) Consume(ctx context.Context, key string, ttl time.Duration) (bool, error) {
	return c.rdb.SetNX(ctx, redisKeyPrefix+key, "1", ttl)
}

func (c redisConsumer) Consumed(ctx context.Context, key string) (bool, error) {
	return c.rdb.Exists(ctx, redisKeyPrefix+key)
}
