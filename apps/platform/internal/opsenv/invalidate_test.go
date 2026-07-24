package opsenv_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/opsenv"
)

// TestServerOpsReplacePublishesInvalidation: maxRooms is the one knob that is
// genuinely live on a running shard (roomRegistry reads it inside onCreate), so
// announcing the change moves admission on the very next match instead of up to
// a cache TTL later.
func TestServerOpsReplacePublishesInvalidation(t *testing.T) {
	store, err := jsonstore.New(t.TempDir())
	require.NoError(t, err)
	mr := miniredis.RunT(t)
	rdb := redisx.New(mr.Addr(), "")
	t.Cleanup(func() { _ = rdb.Close() })
	svc := opsenv.New(store, rdb, opsenv.Runtime{})

	ctx := context.Background()
	c := redisx.New(mr.Addr(), "")
	t.Cleanup(func() { _ = c.Close() })
	sub := c.R.Subscribe(ctx, redisx.ChanContent())
	t.Cleanup(func() { _ = sub.Close() })
	_, err = sub.Receive(ctx)
	require.NoError(t, err)

	doc, err := svc.Replace(ctx, map[string]float64{"maxRooms": 12})
	require.NoError(t, err)

	select {
	case m := <-sub.Channel():
		var inv redisx.ContentInvalidation
		require.NoError(t, json.Unmarshal([]byte(m.Payload), &inv))
		assert.Equal(t, redisx.ContentKindServerOps, inv.Kind)
		assert.Len(t, inv.Version, 12)
		assert.True(t, doc.UpdatedAt.Equal(inv.UpdatedAt))
	case <-time.After(3 * time.Second):
		t.Fatal("no content invalidation published within 3s")
	}
}

// No Redis configured: the write still lands on the JSON truth.
func TestServerOpsReplaceWorksWithoutRedis(t *testing.T) {
	store, err := jsonstore.New(t.TempDir())
	require.NoError(t, err)
	svc := opsenv.New(store, nil, opsenv.Runtime{})
	doc, err := svc.Replace(context.Background(), map[string]float64{"maxRooms": 12})
	require.NoError(t, err)
	assert.InDelta(t, 12.0, doc.Values["maxRooms"], 1e-9)
}
