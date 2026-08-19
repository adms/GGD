package curation_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/curation"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/pkg/testkit"
)

// fakeContent writes an archive tree shaped like content/_legacy/. The fixture
// is a DIRECTORY (filenames are what the gate derives from), and each kind also
// gets an `_index.json` build product, which must NOT become an evictable id.
func fakeContent(t *testing.T, archived map[string][]string) string {
	t.Helper()
	root := t.TempDir()
	for kind, ids := range archived {
		dir := filepath.Join(root, "_legacy", kind)
		require.NoError(t, os.MkdirAll(dir, 0o755))
		for _, name := range append(append([]string{}, ids...), "_index") {
			require.NoError(t, os.WriteFile(filepath.Join(dir, name+".json"), []byte("{}"), 0o600))
		}
	}
	return root
}

// whitelist-legacy-gate: an id whose document has been archived under
// content/_legacy/ cannot survive in the operator whitelist — not on the way in
// (Save), not on the way out (Load/Get), and not the ones already stored before
// the archive happened. GH#479 left three of those checked on a real box and
// recorded the fix as 「請 owner 去後台取消勾選」 — a 判準, which this replaces.
func TestLegacyArchivedIdsCannotStayWhitelisted(t *testing.T) {
	testkit.Cover(t, "whitelist-legacy-gate")
	ctx := context.Background()
	content := fakeContent(t, map[string][]string{
		"champions": {"godie-gone"},
		"items":     {"item-gone"},
		"abilities": {"godie-gone.ex"},
	})
	store, err := jsonstore.New(t.TempDir())
	require.NoError(t, err)
	svc := curation.New(store, nil, curation.WithContentDir(content))
	svc.SetNow(func() time.Time { return time.Date(2026, 8, 20, 12, 0, 0, 0, time.UTC) })

	// (1) THE WAY IN. An admin PUT naming archived ids stores only the live one.
	saved, err := svc.Replace(ctx, curation.Doc{
		Champions: []string{"godie-gone", "godie-live"},
		Items:     []string{"item-gone"},
		Abilities: []string{"godie-gone.ex"},
	})
	require.NoError(t, err)
	assert.Equal(t, []string{"godie-live"}, saved.Champions)
	assert.Empty(t, saved.Items)
	assert.Empty(t, saved.Abilities)

	// (2) ALREADY STORED. Hand-write the pre-archive document straight past the
	// service (this is what GH#479 left on disk), then read it back.
	require.NoError(t, store.Put(curation.Collection, curation.DocID, curation.Doc{
		Version: 1, Champions: []string{"godie-gone", "godie-live"}, Items: []string{}, Abilities: []string{},
	}))
	got, err := svc.Get(ctx)
	require.NoError(t, err)
	assert.Equal(t, []string{"godie-live"}, got.Champions, "the served answer drops archived ids")

	// …and the SELF-HEAL persisted it, so the lie does not survive on disk to be
	// copied to the next machine by `opstate export`.
	var onDisk curation.Doc
	require.NoError(t, store.Get(curation.Collection, curation.DocID, &onDisk))
	assert.Equal(t, []string{"godie-live"}, onDisk.Champions, "the stored document was rewritten clean")
}

// ⛔ NO SECOND TEST for the fail-open direction (no content tree ⇒ evict nothing):
// the other 14 tests here build a Service without one and assert their ids survive.
