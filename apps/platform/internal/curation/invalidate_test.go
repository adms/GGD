package curation_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/curation"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/redisx"
)

// subscribeContent opens a live subscription on chan:content and returns a
// receiver. Subscribing BEFORE the write is the point: Redis pub/sub has no
// backlog, so a message published with no subscriber is gone.
func subscribeContent(t *testing.T, mr *miniredis.Miniredis) func() redisx.ContentInvalidation {
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

// AN ADMIN EDIT ANNOUNCES ITSELF. Before the bus, Replace() wrote the file and
// the Redis mirror and stopped — a running shard learned about it only when its
// own cache TTL happened to expire. Now every durable write publishes a pointer
// on chan:content.
func TestReplacePublishesInvalidation(t *testing.T) {
	svc, _, mr := newSvc(t)
	next := subscribeContent(t, mr)

	doc, err := svc.Replace(context.Background(), curation.Doc{Champions: []string{"sela"}})
	require.NoError(t, err)

	inv := next()
	assert.Equal(t, redisx.ContentKindCuration, inv.Kind)
	assert.Len(t, inv.Version, 12, "the payload carries an etag, not the document")
	assert.True(t, doc.UpdatedAt.Equal(inv.UpdatedAt))
}

// The etag TRACKS THE CONTENT, so a shard can tell "the operator changed
// something" from "the operator re-saved the same thing". Bulk and the starter
// apply go through the same Save(), so they announce too.
func TestBulkAndStarterAnnounceWithMovingEtags(t *testing.T) {
	svc, _, mr := newSvc(t)
	next := subscribeContent(t, mr)
	ctx := context.Background()

	_, err := svc.Replace(ctx, curation.Doc{Champions: []string{"sela"}})
	require.NoError(t, err)
	first := next().Version

	_, err = svc.Bulk(ctx, curation.KindChampions, []string{"godie-e001"}, nil)
	require.NoError(t, err)
	second := next().Version
	assert.NotEqual(t, first, second, "enabling a champion must move the etag")

	// Idempotent re-enable: same resulting document, therefore same etag. A
	// shard seeing the repeat re-fetches and finds nothing new — harmless, and
	// /healthz still reads "converged".
	_, err = svc.Bulk(ctx, curation.KindChampions, []string{"godie-e001"}, nil)
	require.NoError(t, err)
	assert.Equal(t, second, next().Version, "a no-op edit must not fabricate a new version")

	_, err = svc.ApplyStarterSet(ctx)
	require.NoError(t, err)
	assert.Equal(t, redisx.ContentKindCuration, next().Kind)
}

// REDIS MUST STAY OPTIONAL ON THE WRITE SIDE TOO. A platform built without a
// Redis client (rdb == nil) still saves; and a platform whose Redis died still
// saves — the JSON file is the truth and an announcement is a courtesy.
func TestSaveSurvivesWithoutRedis(t *testing.T) {
	ctx := context.Background()

	store, err := jsonstore.New(t.TempDir())
	require.NoError(t, err)
	noRedis := curation.New(store, nil)
	doc, err := noRedis.Replace(ctx, curation.Doc{Champions: []string{"sela"}})
	require.NoError(t, err, "no Redis configured must not fail an admin write")
	assert.Equal(t, []string{"sela"}, doc.Champions)

	store2, err := jsonstore.New(t.TempDir())
	require.NoError(t, err)
	mr := miniredis.RunT(t)
	rdb := redisx.New(mr.Addr(), "")
	t.Cleanup(func() { _ = rdb.Close() })
	deadRedis := curation.New(store2, rdb)
	mr.Close() // the announcement (and the mirror) will now fail

	doc, err = deadRedis.Replace(ctx, curation.Doc{Champions: []string{"sela"}})
	require.NoError(t, err, "a dead Redis must not fail an admin write")
	assert.Equal(t, []string{"sela"}, doc.Champions)

	// And the durable truth is on disk regardless.
	var onDisk curation.Doc
	require.NoError(t, store2.Get(curation.Collection, curation.DocID, &onDisk))
	assert.Equal(t, []string{"sela"}, onDisk.Champions)
}
