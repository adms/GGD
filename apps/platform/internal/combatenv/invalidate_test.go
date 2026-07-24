package combatenv_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/combatenv"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/redisx"
)

// nextInvalidation subscribes to chan:content BEFORE the write (pub/sub has no
// backlog) and returns a blocking receiver.
func nextInvalidation(t *testing.T, mr *miniredis.Miniredis) func() redisx.ContentInvalidation {
	t.Helper()
	ctx := context.Background()
	c := redisx.New(mr.Addr(), "")
	t.Cleanup(func() { _ = c.Close() })
	sub := c.R.Subscribe(ctx, redisx.ChanContent())
	t.Cleanup(func() { _ = sub.Close() })
	_, err := sub.Receive(ctx)
	require.NoError(t, err)
	return func() redisx.ContentInvalidation {
		t.Helper()
		select {
		case m := <-sub.Channel():
			var inv redisx.ContentInvalidation
			require.NoError(t, json.Unmarshal([]byte(m.Payload), &inv))
			return inv
		case <-time.After(3 * time.Second):
			t.Fatal("no content invalidation published within 3s")
			return redisx.ContentInvalidation{}
		}
	}
}

// TUNING 戰鬥系統 ANNOUNCES ITSELF. This is the case from the bug report: the
// owner changes a multiplier in the console and the running shard keeps using
// the old table. The write now publishes a kind + etag.
func TestCombatEnvReplacePublishesInvalidation(t *testing.T) {
	store, err := jsonstore.New(t.TempDir())
	require.NoError(t, err)
	mr := miniredis.RunT(t)
	rdb := redisx.New(mr.Addr(), "")
	t.Cleanup(func() { _ = rdb.Close() })
	svc := combatenv.New(store, rdb, "")

	next := nextInvalidation(t, mr)
	doc, err := svc.Replace(context.Background(), map[string]float64{"damageDealt": 0.5})
	require.NoError(t, err)

	inv := next()
	assert.Equal(t, redisx.ContentKindCombatEnv, inv.Kind)
	assert.Len(t, inv.Version, 12)
	assert.True(t, doc.UpdatedAt.Equal(inv.UpdatedAt))

	// The multiplier itself does NOT ride the bus: the shard re-fetches
	// GET /api/v1/combat-env so there is exactly one ingestion path.
	var raw map[string]any
	payload, err := json.Marshal(inv)
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal(payload, &raw))
	assert.NotContains(t, raw, "multipliers")
}

// A platform with no Redis at all still tunes. The owner's laptop is the
// reference deployment for this.
func TestCombatEnvReplaceWorksWithoutRedis(t *testing.T) {
	store, err := jsonstore.New(t.TempDir())
	require.NoError(t, err)
	svc := combatenv.New(store, nil, "")
	doc, err := svc.Replace(context.Background(), map[string]float64{"damageDealt": 0.5})
	require.NoError(t, err)
	assert.InDelta(t, 0.5, doc.Multipliers["damageDealt"], 1e-9)
}
