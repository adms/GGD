package redisx_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/data/redisx"
)

func newBus(t *testing.T) (*redisx.Client, *miniredis.Miniredis) {
	t.Helper()
	mr := miniredis.RunT(t)
	c := redisx.New(mr.Addr(), "")
	t.Cleanup(func() { _ = c.Close() })
	return c, mr
}

// A subscriber on chan:content receives the announcement, and what it receives
// is a POINTER (kind + etag), never the document. That is the whole contract:
// the shard must go back to the authoritative HTTP endpoint.
func TestPublishContentInvalidationDeliversAPointerNotADocument(t *testing.T) {
	c, _ := newBus(t)
	ctx := context.Background()

	sub := c.R.Subscribe(ctx, redisx.ChanContent())
	t.Cleanup(func() { _ = sub.Close() })
	// Wait for the subscription to be live before publishing — pub/sub drops
	// messages that have no subscriber, so this ordering is the test, not noise.
	_, err := sub.Receive(ctx)
	require.NoError(t, err)

	at := time.Date(2026, 7, 24, 9, 30, 0, 0, time.UTC)
	require.NoError(t, c.PublishContentInvalidation(ctx, redisx.ContentKindCuration, "9f2ca1b0d3e4", at))

	msg := waitMsg(t, sub, ctx)
	var got redisx.ContentInvalidation
	require.NoError(t, json.Unmarshal([]byte(msg.Payload), &got))
	assert.Equal(t, "curation", got.Kind)
	assert.Equal(t, "9f2ca1b0d3e4", got.Version)
	assert.True(t, at.Equal(got.UpdatedAt))

	// No document body rode along: the payload has exactly three fields.
	var raw map[string]any
	require.NoError(t, json.Unmarshal([]byte(msg.Payload), &raw))
	assert.Len(t, raw, 3, "payload must stay a pointer: %s", msg.Payload)
	assert.NotContains(t, raw, "champions")
	assert.NotContains(t, raw, "multipliers")
}

// The etag changes when the bytes change and is stable when they do not —
// otherwise "did my change land?" cannot be answered by comparing two strings.
func TestContentETagIsStableAndChangeSensitive(t *testing.T) {
	a := redisx.ContentETag([]byte(`{"champions":["sela"]}`))
	again := redisx.ContentETag([]byte(`{"champions":["sela"]}`))
	b := redisx.ContentETag([]byte(`{"champions":["sela","godie-e001"]}`))

	assert.Equal(t, a, again, "same bytes must fingerprint identically")
	assert.NotEqual(t, a, b, "one added champion must change the etag")
	assert.Len(t, a, 12)

	// ContentETagOf goes through json.Marshal, so it agrees with the ETag the
	// repos compute over their marshalled document.
	doc := struct {
		Champions []string `json:"champions"`
	}{Champions: []string{"sela"}}
	assert.Equal(t, a, redisx.ContentETagOf(doc))
}

// Publishing with nobody listening is a no-op, not an error. A shard that is
// down (or a laptop with no game-server at all) must never make an admin write
// fail.
func TestPublishWithNoSubscribersSucceeds(t *testing.T) {
	c, _ := newBus(t)
	assert.NoError(t, c.PublishContentInvalidation(
		context.Background(), redisx.ContentKindCombatEnv, "abc123abc123", time.Now()))
}

// A dead Redis makes Publish fail — and the CALLER's contract (mirror() in
// curation/combatenv/opsenv) is to log and continue, because the durable JSON
// write already happened. This test pins the error so that contract is
// deliberate rather than accidental.
func TestPublishOnDeadRedisReportsAnErrorForTheCallerToSwallow(t *testing.T) {
	c, mr := newBus(t)
	mr.Close()
	assert.Error(t, c.PublishContentInvalidation(
		context.Background(), redisx.ContentKindServerOps, "deadbeef0000", time.Now()))
}

func waitMsg(t *testing.T, sub *redis.PubSub, ctx context.Context) *redis.Message {
	t.Helper()
	select {
	case m := <-sub.Channel():
		return m
	case <-time.After(3 * time.Second):
		t.Fatal("no invalidation message within 3s")
		return nil
	}
}
