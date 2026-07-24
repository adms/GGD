package contentoverlay_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/contentoverlay"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/pkg/testkit"
)

// newSvc builds an overlay Service over a temp jsonstore + miniredis, with a
// fixed clock so updatedAt is deterministic.
func newSvc(t *testing.T) (*contentoverlay.Service, *jsonstore.Store, *miniredis.Miniredis) {
	t.Helper()
	dir := t.TempDir()
	store, err := jsonstore.New(dir)
	require.NoError(t, err)
	mr := miniredis.RunT(t)
	rdb := redisx.New(mr.Addr(), "")
	t.Cleanup(func() { _ = rdb.Close() })
	svc := contentoverlay.New(store, rdb)
	svc.SetNow(func() time.Time { return time.Date(2026, 7, 25, 12, 0, 0, 0, time.UTC) })
	return svc, store, mr
}

// overlay-default-empty: a fresh host has an empty overlay at generation 0.
func TestDefaultEmpty(t *testing.T) {
	testkit.Cover(t, "content-overlay-default-empty")
	svc, store, _ := newSvc(t)
	ctx := context.Background()

	// nothing on disk yet — reads do NOT lazily create (unlike curation): an
	// empty overlay is the identity element, so there is nothing to persist.
	exists, err := store.Exists(contentoverlay.Collection, contentoverlay.DocID)
	require.NoError(t, err)
	assert.False(t, exists)

	hd, err := svc.Head(ctx)
	require.NoError(t, err)
	assert.Equal(t, 0, hd.Generation)
	assert.Equal(t, 0, hd.DocCount)
	assert.Equal(t, 0, hd.DeletedCount)

	o, err := svc.Get(ctx)
	require.NoError(t, err)
	assert.Empty(t, o.Docs)
	assert.Empty(t, o.Deleted)
}

// content-overlay-put: an upsert advances the generation, stores the exact doc
// in the bundle, and reports a non-empty fingerprint.
func TestPutDoc(t *testing.T) {
	testkit.Cover(t, "content-overlay-put")
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	doc := json.RawMessage(`{"id":"godie-e001","schema":"champion","name":"改過的英雄"}`)
	hd, err := svc.PutDoc(ctx, "champions", "godie-e001", doc, "admin-1")
	require.NoError(t, err)
	assert.Equal(t, 1, hd.Generation)
	assert.Equal(t, 1, hd.DocCount)
	assert.Equal(t, 0, hd.DeletedCount)
	assert.NotEmpty(t, hd.Fingerprint)
	assert.Equal(t, "admin-1", hd.UpdatedBy)

	o, err := svc.Get(ctx)
	require.NoError(t, err)
	stored, ok := o.Docs["champions/godie-e001"]
	require.True(t, ok)
	// the stored bytes round-trip to the same object the admin sent
	var got, want map[string]any
	require.NoError(t, json.Unmarshal(stored, &got))
	require.NoError(t, json.Unmarshal(doc, &want))
	assert.Equal(t, want, got)

	// re-editing the SAME key advances the generation but not the doc count
	hd2, err := svc.PutDoc(ctx, "champions", "godie-e001", json.RawMessage(`{"id":"godie-e001","name":"再改一次"}`), "admin-1")
	require.NoError(t, err)
	assert.Equal(t, 2, hd2.Generation)
	assert.Equal(t, 1, hd2.DocCount)
	assert.NotEqual(t, hd.Fingerprint, hd2.Fingerprint) // content changed
}

// content-overlay-delete: a delete tombstones the key so the merged tree drops
// it; a later put on the same key un-deletes it.
func TestDeleteThenPutClearsTombstone(t *testing.T) {
	testkit.Cover(t, "content-overlay-delete")
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	_, err := svc.PutDoc(ctx, "items", "sword-01", json.RawMessage(`{"id":"sword-01"}`), "admin-1")
	require.NoError(t, err)

	hd, err := svc.DeleteDoc(ctx, "items", "sword-01", "admin-1")
	require.NoError(t, err)
	assert.Equal(t, 0, hd.DocCount)
	assert.Equal(t, 1, hd.DeletedCount)

	o, err := svc.Get(ctx)
	require.NoError(t, err)
	assert.True(t, o.Deleted["items/sword-01"])
	_, present := o.Docs["items/sword-01"]
	assert.False(t, present)

	// writing the doc again clears the tombstone (the sync engine relies on a key
	// never being in both maps at once)
	_, err = svc.PutDoc(ctx, "items", "sword-01", json.RawMessage(`{"id":"sword-01","restored":true}`), "admin-1")
	require.NoError(t, err)
	o, err = svc.Get(ctx)
	require.NoError(t, err)
	assert.False(t, o.Deleted["items/sword-01"])
	_, present = o.Docs["items/sword-01"]
	assert.True(t, present)
}

// content-overlay-durable: the overlay survives a NEW Service over the same
// store — this is the whole point of #189 (a git pull cannot erase data/).
func TestDurableAcrossReload(t *testing.T) {
	testkit.Cover(t, "content-overlay-durable")
	dir := t.TempDir()
	store, err := jsonstore.New(dir)
	require.NoError(t, err)
	ctx := context.Background()

	svc1 := contentoverlay.New(store, nil) // nil rdb: no bus, still durable
	_, err = svc1.PutDoc(ctx, "abilities", "godie-e001.ex", json.RawMessage(`{"id":"godie-e001.ex"}`), "admin-1")
	require.NoError(t, err)

	// a fresh service over the SAME directory sees the write
	store2, err := jsonstore.New(dir)
	require.NoError(t, err)
	svc2 := contentoverlay.New(store2, nil)
	o, err := svc2.Get(ctx)
	require.NoError(t, err)
	assert.Equal(t, 1, o.Generation)
	_, ok := o.Docs["abilities/godie-e001.ex"]
	assert.True(t, ok)
}

// content-overlay-fingerprint-stable: identical overlay content yields the same
// fingerprint regardless of generation — so a peer probe can detect convergence.
func TestFingerprintStableForSameContent(t *testing.T) {
	testkit.Cover(t, "content-overlay-fingerprint-stable")
	svcA, _, _ := newSvc(t)
	svcB, _, _ := newSvc(t)
	ctx := context.Background()

	doc := json.RawMessage(`{"id":"x","v":1}`)
	// host A writes it twice (generation 2); host B writes it once (generation 1)
	_, err := svcA.PutDoc(ctx, "config", "x", doc, "a")
	require.NoError(t, err)
	hdA, err := svcA.PutDoc(ctx, "config", "x", doc, "a")
	require.NoError(t, err)
	hdB, err := svcB.PutDoc(ctx, "config", "x", doc, "b")
	require.NoError(t, err)

	assert.NotEqual(t, hdA.Generation, hdB.Generation)
	assert.Equal(t, hdA.Fingerprint, hdB.Fingerprint) // same content → same fp
}

// content-overlay-rejects-garbage: bad keys and non-object bodies are 400s, not
// silent writes — a typo in the console must surface immediately.
func TestRejectsGarbage(t *testing.T) {
	testkit.Cover(t, "content-overlay-rejects-garbage")
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	_, err := svc.PutDoc(ctx, "Champions/../x", "id", json.RawMessage(`{}`), "a")
	assert.Error(t, err)
	_, err = svc.PutDoc(ctx, "champions", "bad id!", json.RawMessage(`{}`), "a")
	assert.Error(t, err)
	_, err = svc.PutDoc(ctx, "champions", "ok", json.RawMessage(`[1,2,3]`), "a")
	assert.Error(t, err)
	_, err = svc.PutDoc(ctx, "champions", "ok", json.RawMessage(`not json`), "a")
	assert.Error(t, err)

	// nothing was written by any of the rejected calls
	hd, err := svc.Head(ctx)
	require.NoError(t, err)
	assert.Equal(t, 0, hd.Generation)
}

// content-overlay-announces: a write publishes a content-overlay invalidation on
// chan:content so a running shard re-fetches for its next match.
func TestAnnouncesOnWrite(t *testing.T) {
	testkit.Cover(t, "content-overlay-announces")
	svc, _, mr := newSvc(t)
	ctx := context.Background()

	sub := redisx.New(mr.Addr(), "")
	t.Cleanup(func() { _ = sub.Close() })
	ps := sub.R.Subscribe(ctx, redisx.ChanContent())
	t.Cleanup(func() { _ = ps.Close() })
	// drain the subscribe confirmation
	_, err := ps.Receive(ctx)
	require.NoError(t, err)

	_, err = svc.PutDoc(ctx, "champions", "godie-e001", json.RawMessage(`{"id":"godie-e001"}`), "admin-1")
	require.NoError(t, err)

	msg, err := ps.ReceiveMessage(ctx)
	require.NoError(t, err)
	var inv redisx.ContentInvalidation
	require.NoError(t, json.Unmarshal([]byte(msg.Payload), &inv))
	assert.Equal(t, redisx.ContentKindContentOverlay, inv.Kind)
	assert.NotEmpty(t, inv.Version)
}
