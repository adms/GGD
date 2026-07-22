package presence_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/presence"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// TestHeartbeatTTL: presence stays online while heartbeats refresh the TTL
// and flips to offline once the TTL lapses without one.
func TestHeartbeatTTL(t *testing.T) {
	testkit.Cover(t, "presence-heartbeat")
	ts := testutil.New(t)
	ctx := context.Background()
	pres := ts.Srv.Presence

	require.NoError(t, pres.Set(ctx, "acct1", presence.StateOnline))
	st, err := pres.Get(ctx, "acct1")
	require.NoError(t, err)
	require.Equal(t, presence.StateOnline, st)

	// A heartbeat inside the window keeps it alive across time.
	ts.Mini.FastForward(ts.Cfg.PresenceTTL / 2)
	require.NoError(t, pres.Heartbeat(ctx, "acct1"))
	ts.Mini.FastForward(ts.Cfg.PresenceTTL - time.Second)
	st, err = pres.Get(ctx, "acct1")
	require.NoError(t, err)
	require.Equal(t, presence.StateOnline, st, "heartbeat must have refreshed the TTL")

	// No heartbeat → TTL expires → offline.
	ts.Mini.FastForward(ts.Cfg.PresenceTTL + time.Second)
	st, err = pres.Get(ctx, "acct1")
	require.NoError(t, err)
	require.Equal(t, presence.StateOffline, st)
}
