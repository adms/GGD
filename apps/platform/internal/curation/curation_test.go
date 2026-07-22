package curation_test

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/curation"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/pkg/testkit"
)

// newSvc builds a curation Service over a temp jsonstore + miniredis mirror,
// with a fixed clock so updatedAt is deterministic.
func newSvc(t *testing.T) (*curation.Service, *jsonstore.Store, *miniredis.Miniredis) {
	t.Helper()
	dir := t.TempDir()
	store, err := jsonstore.New(dir)
	require.NoError(t, err)
	mr := miniredis.RunT(t)
	rdb := redisx.New(mr.Addr(), "")
	t.Cleanup(func() { _ = rdb.Close() })
	svc := curation.New(store, rdb)
	svc.SetNow(func() time.Time { return time.Date(2026, 7, 21, 12, 0, 0, 0, time.UTC) })
	return svc, store, mr
}

// whitelist-default-empty: a fresh install has NOTHING enabled. The first read
// returns three empty arrays and lazily creates the file (so operators can see
// and hand-edit it) — but the file is empty; nothing is ever seeded.
func TestDefaultEmpty(t *testing.T) {
	testkit.Cover(t, "whitelist-default-empty")
	svc, store, _ := newSvc(t)
	ctx := context.Background()

	// Nothing on disk yet.
	exists, err := store.Exists(curation.Collection, curation.DocID)
	require.NoError(t, err)
	require.False(t, exists, "no whitelist file before the first read")

	doc, err := svc.Get(ctx)
	require.NoError(t, err)
	assert.Equal(t, 1, doc.Version)
	assert.Empty(t, doc.Champions)
	assert.Empty(t, doc.Items)
	assert.Empty(t, doc.Abilities)
	assert.Equal(t, 0, doc.Total())

	// The lazy create wrote the empty doc to the JSON truth...
	exists, err = store.Exists(curation.Collection, curation.DocID)
	require.NoError(t, err)
	require.True(t, exists, "read lazily creates the empty whitelist file")

	// ...and that file is genuinely empty (not seeded with any content).
	path, err := store.Path(curation.Collection, curation.DocID)
	require.NoError(t, err)
	raw, err := os.ReadFile(path)
	require.NoError(t, err)
	var onDisk curation.Doc
	require.NoError(t, json.Unmarshal(raw, &onDisk))
	assert.Empty(t, onDisk.Champions)
	assert.Empty(t, onDisk.Items)
	assert.Empty(t, onDisk.Abilities)
}

// whitelist-json-arrays: the document always encodes `[]`, never `null`, so
// every consumer can iterate the lists without a nil guard.
func TestJSONNeverNull(t *testing.T) {
	testkit.Cover(t, "whitelist-json-arrays")
	svc, _, _ := newSvc(t)
	doc, err := svc.Get(context.Background())
	require.NoError(t, err)
	raw, err := json.Marshal(doc)
	require.NoError(t, err)
	s := string(raw)
	assert.Contains(t, s, `"champions":[]`)
	assert.Contains(t, s, `"items":[]`)
	assert.Contains(t, s, `"abilities":[]`)
	assert.NotContains(t, s, "null")
}

// whitelist-replace-roundtrip: PUT replaces the whole doc; input is trimmed,
// de-duplicated and sorted; a reload returns exactly what was stored.
func TestReplaceRoundTrip(t *testing.T) {
	testkit.Cover(t, "whitelist-replace-roundtrip")
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	doc, err := svc.Replace(ctx, curation.Doc{
		Champions: []string{"godie-e002", "  godie-e001  ", "godie-e001", ""},
		Items:     []string{"godie-i05t"},
		Abilities: []string{},
	})
	require.NoError(t, err)
	assert.Equal(t, []string{"godie-e001", "godie-e002"}, doc.Champions, "trimmed, deduped, sorted")
	assert.Equal(t, []string{"godie-i05t"}, doc.Items)
	assert.Empty(t, doc.Abilities)
	assert.Equal(t, time.Date(2026, 7, 21, 12, 0, 0, 0, time.UTC), doc.UpdatedAt)

	// Reload from a fresh service over the same store: durable truth persisted.
	got, err := svc.Get(ctx)
	require.NoError(t, err)
	assert.Equal(t, doc.Champions, got.Champions)
	assert.Equal(t, doc.Items, got.Items)
}

// whitelist-bulk: enable/disable one kind at a time, idempotently, leaving the
// other kinds untouched; disable wins over a contradictory enable.
func TestBulkEnableDisable(t *testing.T) {
	testkit.Cover(t, "whitelist-bulk")
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	// Enable three champions.
	doc, err := svc.Bulk(ctx, curation.KindChampions, []string{"godie-e001", "godie-e002", "godie-e007"}, nil)
	require.NoError(t, err)
	assert.Equal(t, []string{"godie-e001", "godie-e002", "godie-e007"}, doc.Champions)

	// Re-enabling is a no-op (idempotent) and enabling items does not disturb
	// champions.
	doc, err = svc.Bulk(ctx, curation.KindItems, []string{"godie-i05t", "godie-e001"}, nil)
	require.NoError(t, err)
	assert.Equal(t, []string{"godie-e001", "godie-i05t"}, doc.Items)
	assert.Len(t, doc.Champions, 3, "editing items leaves champions untouched")

	// Disable one champion; disable also wins when an id is in both lists.
	doc, err = svc.Bulk(ctx, curation.KindChampions,
		[]string{"godie-e008", "godie-e002"}, // enable e008, (re)enable e002
		[]string{"godie-e002", "godie-e007"}) // but disable e002 + e007
	require.NoError(t, err)
	assert.Equal(t, []string{"godie-e001", "godie-e008"}, doc.Champions,
		"e007 removed, e002 disabled despite being in enable (disable wins), e008 added")
}

// whitelist-bad-kind: the bulk endpoint rejects an unknown kind with a 400.
func TestBulkBadKind(t *testing.T) {
	testkit.Cover(t, "whitelist-bad-kind")
	svc, _, _ := newSvc(t)
	_, err := svc.Bulk(context.Background(), "weapons", []string{"x"}, nil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "kind must be one of")
}

// whitelist-bad-id: an id that fails the strict id shape is a 400 (a console
// typo surfaces immediately instead of silently persisting junk).
func TestRejectsBadID(t *testing.T) {
	testkit.Cover(t, "whitelist-bad-id")
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	_, err := svc.Replace(ctx, curation.Doc{Champions: []string{"../etc/passwd"}})
	require.Error(t, err)

	_, err = svc.Bulk(ctx, curation.KindChampions, []string{"has space"}, nil)
	require.Error(t, err)

	// A rejected mutation must not have partially written anything.
	doc, err := svc.Get(ctx)
	require.NoError(t, err)
	assert.Empty(t, doc.Champions)
}

// whitelist-starter: the one-click starter set is a real, non-empty bundle
// that unions in (never removes) and is idempotent.
func TestApplyStarterSet(t *testing.T) {
	testkit.Cover(t, "whitelist-starter")
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	// Pre-enable one champion the starter set does not include.
	_, err := svc.Bulk(ctx, curation.KindChampions, []string{"godie-zzz9"}, nil)
	require.NoError(t, err)

	doc, err := svc.ApplyStarterSet(ctx)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(doc.Champions), 10, "starter set enables ~10 champions")
	assert.NotEmpty(t, doc.Items)
	assert.NotEmpty(t, doc.Abilities)
	assert.Contains(t, doc.Champions, "godie-zzz9", "starter set unions in, never removes")
	assert.Contains(t, doc.Champions, "godie-e001")

	// Idempotent: applying again does not grow the lists.
	n := len(doc.Champions)
	doc2, err := svc.ApplyStarterSet(ctx)
	require.NoError(t, err)
	assert.Len(t, doc2.Champions, n, "re-applying the starter set is a no-op")
}

// whitelist-seed-empty: the AUTOMATED door (cmd/seed -starter). A genuinely
// fresh install — no file at all, or a lazily-created empty one — gets the demo
// bundle, and the result is immediately playable: 12 champions, a stocked shop,
// and every champion's FULL kit (no half-enabled champion).
func TestApplyStarterSetIfEmptySeedsFreshInstall(t *testing.T) {
	testkit.Cover(t, "whitelist-seed-empty")
	svc, store, _ := newSvc(t)
	ctx := context.Background()

	// Nothing on disk: the store is genuinely unset.
	exists, err := store.Exists(curation.Collection, curation.DocID)
	require.NoError(t, err)
	require.False(t, exists)

	doc, applied, err := svc.ApplyStarterSetIfEmpty(ctx)
	require.NoError(t, err)
	require.True(t, applied, "a fresh install gets the starter set")
	assert.GreaterOrEqual(t, len(doc.Champions), 12)
	assert.GreaterOrEqual(t, len(doc.Items), 24)
	assert.Len(t, doc.Abilities, len(doc.Champions)*5, "every champion contributes Q/W/E/R/EX")

	// No half-enabled champion: every seeded champion's five ability ids are on.
	enabled := make(map[string]struct{}, len(doc.Abilities))
	for _, id := range doc.Abilities {
		enabled[id] = struct{}{}
	}
	for _, champ := range doc.Champions {
		for _, slot := range []string{"q", "w", "e", "r", "ex"} {
			_, ok := enabled[champ+"."+slot]
			assert.Truef(t, ok, "seeded champion %q is missing ability %s.%s", champ, champ, slot)
		}
	}

	// It landed in the durable JSON truth, not just in the returned value.
	got, err := svc.Get(ctx)
	require.NoError(t, err)
	assert.Equal(t, doc.Champions, got.Champions)

	// Idempotent-by-guard: the SECOND run is now a no-op, because the first one
	// made the whitelist non-empty.
	_, applied2, err := svc.ApplyStarterSetIfEmpty(ctx)
	require.NoError(t, err)
	assert.False(t, applied2, "a restart must not re-apply the starter set")
}

// whitelist-seed-lazy-empty: the lazy-create in Get() writes an EMPTY file.
// That file must still count as "genuinely empty" — otherwise merely opening
// the console once would permanently block the automated seed.
func TestApplyStarterSetIfEmptyAfterLazyCreate(t *testing.T) {
	testkit.Cover(t, "whitelist-seed-lazy-empty")
	svc, store, _ := newSvc(t)
	ctx := context.Background()

	_, err := svc.Get(ctx) // lazily creates the empty doc
	require.NoError(t, err)
	exists, err := store.Exists(curation.Collection, curation.DocID)
	require.NoError(t, err)
	require.True(t, exists, "the empty file now exists")

	_, applied, err := svc.ApplyStarterSetIfEmpty(ctx)
	require.NoError(t, err)
	assert.True(t, applied, "an existing but EMPTY doc is still a fresh install")
}

// whitelist-seed-preserves-curation: an operator who has already curated must
// NEVER have their choices overwritten or re-expanded by the automated seed —
// not even when their selection is a single champion, and not even when it is
// a deliberate prune of a previously-applied bundle.
func TestApplyStarterSetIfEmptyPreservesCuration(t *testing.T) {
	testkit.Cover(t, "whitelist-seed-preserves-curation")
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	// An operator enabled exactly one champion and one item.
	_, err := svc.Bulk(ctx, curation.KindChampions, []string{"godie-e001"}, nil)
	require.NoError(t, err)
	_, err = svc.Bulk(ctx, curation.KindItems, []string{"godie-i05t"}, nil)
	require.NoError(t, err)

	doc, applied, err := svc.ApplyStarterSetIfEmpty(ctx)
	require.NoError(t, err)
	assert.False(t, applied, "an already-curated whitelist is left alone")
	assert.Equal(t, []string{"godie-e001"}, doc.Champions, "operator's roster untouched")
	assert.Equal(t, []string{"godie-i05t"}, doc.Items, "operator's shop untouched")
	assert.Empty(t, doc.Abilities)

	// And it is still untouched on disk.
	got, err := svc.Get(ctx)
	require.NoError(t, err)
	assert.Equal(t, []string{"godie-e001"}, got.Champions)

	// The EXPLICIT door still works — a human clicking the console button gets
	// the union regardless of the guard.
	full, err := svc.ApplyStarterSet(ctx)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(full.Champions), 12)
	assert.Contains(t, full.Champions, "godie-e001", "union never removes")
}

// whitelist-seed-prune-sticks: the bundle is a SUGGESTION, not a floor. After
// an operator prunes it back down, the automated seed must not resurrect it.
func TestStarterSetIsNotAFloor(t *testing.T) {
	testkit.Cover(t, "whitelist-seed-prune-sticks")
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	seeded, applied, err := svc.ApplyStarterSetIfEmpty(ctx)
	require.NoError(t, err)
	require.True(t, applied)

	// The operator keeps ONE champion and disables the rest.
	drop := make([]string, 0, len(seeded.Champions))
	for _, id := range seeded.Champions {
		if id != "godie-e001" {
			drop = append(drop, id)
		}
	}
	doc, err := svc.Bulk(ctx, curation.KindChampions, nil, drop)
	require.NoError(t, err)
	require.Equal(t, []string{"godie-e001"}, doc.Champions)

	// A restart does NOT bring the other 11 back.
	after, applied2, err := svc.ApplyStarterSetIfEmpty(ctx)
	require.NoError(t, err)
	assert.False(t, applied2)
	assert.Equal(t, []string{"godie-e001"}, after.Champions)

	// Disabling EVERYTHING returns the install to empty — and only then does the
	// automated door open again (documented, deliberate).
	_, err = svc.Bulk(ctx, curation.KindChampions, nil, []string{"godie-e001"})
	require.NoError(t, err)
	empty, err := svc.Get(ctx)
	require.NoError(t, err)
	assert.Empty(t, empty.Champions, "the bundle is a suggestion, not a floor")
}

// whitelist-redis-mirror: Save writes the JSON truth AND mirrors into Redis; a
// Redis flush leaves the JSON truth intact and the next read still succeeds
// (Redis is a rebuildable cache, never authoritative).
func TestRedisMirror(t *testing.T) {
	testkit.Cover(t, "whitelist-redis-mirror")
	svc, store, mr := newSvc(t)
	ctx := context.Background()

	_, err := svc.Bulk(ctx, curation.KindChampions, []string{"godie-e001"}, nil)
	require.NoError(t, err)

	// Mirror present in Redis...
	require.True(t, mr.Exists(curation.RedisKey), "Save mirrors the doc into Redis")
	mirrored, err := mr.Get(curation.RedisKey)
	require.NoError(t, err)
	var md curation.Doc
	require.NoError(t, json.Unmarshal([]byte(mirrored), &md))
	assert.Equal(t, []string{"godie-e001"}, md.Champions)

	// ...but the JSON file is the truth: wipe Redis, the doc survives.
	mr.FlushAll()
	require.False(t, mr.Exists(curation.RedisKey))
	path, err := store.Path(curation.Collection, curation.DocID)
	require.NoError(t, err)
	_, statErr := os.Stat(path)
	require.NoError(t, statErr, "JSON truth survives a Redis wipe")

	doc, err := svc.Get(ctx)
	require.NoError(t, err)
	assert.Equal(t, []string{"godie-e001"}, doc.Champions)
}

// whitelist-nil-backfill: a hand-edited file with null/missing lists reads
// back as empty (never a nil slice that a consumer would choke on).
func TestNilBackfill(t *testing.T) {
	testkit.Cover(t, "whitelist-nil-backfill")
	svc, store, _ := newSvc(t)
	ctx := context.Background()

	// Hand-write a partial file (no arrays, no version).
	path, err := store.Path(curation.Collection, curation.DocID)
	require.NoError(t, err)
	require.NoError(t, os.MkdirAll(filepath.Dir(path), 0o755))
	require.NoError(t, os.WriteFile(path, []byte(`{"updatedAt":"2026-01-01T00:00:00Z"}`), 0o644))

	doc, err := svc.Get(ctx)
	require.NoError(t, err)
	assert.NotNil(t, doc.Champions)
	assert.NotNil(t, doc.Items)
	assert.NotNil(t, doc.Abilities)
	assert.Equal(t, 1, doc.Version, "missing version backfills to the current schema")
}
