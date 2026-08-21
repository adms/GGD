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

// fakeChampions writes a content tree shaped like content/champions/. `roles`
// is id → transform.role ("" = a champion doc with NO transform block at all,
// which is what most of the roster looks like).
//
// ⛔ The fixture carries NO id from the shipped tree: the gate must derive its
// answer from `transform.role`, so a test that named 悟空 would pass just as
// well against a hand-written list — which is exactly the implementation this
// guard exists to reject.
func fakeChampions(t *testing.T, roles map[string]string) string {
	t.Helper()
	root := t.TempDir()
	dir := filepath.Join(root, "champions")
	require.NoError(t, os.MkdirAll(dir, 0o755))
	// a build product, which must never become an evictable id
	require.NoError(t, os.WriteFile(filepath.Join(dir, "_index.json"), []byte(`[]`), 0o600))
	for id, role := range roles {
		doc := `{"id":"` + id + `","name":"名字 ` + id + `"`
		if role != "" {
			doc += `,"transform":{"role":"` + role + `","normalUnitRawcode":"ABCD","alternateUnitRawcode":"EFGH"}`
		}
		require.NoError(t, os.WriteFile(filepath.Join(dir, id+".json"), []byte(doc+"}"), 0o600))
	}
	return root
}

// whitelist-transform-gate: a 變身態 (transform.role == "alternate") cannot
// survive in the operator whitelist — not on the way IN (Save), not on the way
// OUT (Load/Get) — and the 一鍵清理變身態 button names it before removing it.
//
// owner 2026-08-21:「白名單還是 59 / 10 個變身態在線上仍然選得到 =>
// 幫我後台跳出一鍵清理變身態的按鈕」
func TestTransformedBodiesCannotStayWhitelisted(t *testing.T) {
	testkit.Cover(t, "whitelist-transform-gate")
	ctx := context.Background()
	content := fakeChampions(t, map[string]string{
		"hero-base":  "base",
		"hero-alt":   "alternate",
		"hero-plain": "", // no transform block — the ordinary case
	})
	store, err := jsonstore.New(t.TempDir())
	require.NoError(t, err)
	svc := curation.New(store, nil, curation.WithContentDir(content))
	svc.SetNow(func() time.Time { return time.Date(2026, 8, 21, 12, 0, 0, 0, time.UTC) })

	// (1) THE WAY IN. An admin PUT naming a 變身態 stores only the pickable ones.
	saved, err := svc.Replace(ctx, curation.Doc{
		Champions: []string{"hero-alt", "hero-base", "hero-plain"},
	})
	require.NoError(t, err)
	assert.Equal(t, []string{"hero-base", "hero-plain"}, saved.Champions)

	// (2) ALREADY STORED — what 線上 looks like today. Hand-write the document
	// straight past the service, then read it back through Get.
	require.NoError(t, store.Put(curation.Collection, curation.DocID, curation.Doc{
		Version: 1, Champions: []string{"hero-alt", "hero-base"}, Items: []string{}, Abilities: []string{},
	}))
	got, err := svc.Get(ctx)
	require.NoError(t, err)
	assert.Equal(t, []string{"hero-base"}, got.Champions, "the served answer drops 變身態")
	var onDisk curation.Doc
	require.NoError(t, store.Get(curation.Collection, curation.DocID, &onDisk))
	assert.Equal(t, []string{"hero-base"}, onDisk.Champions, "the stored document was rewritten clean")

	// (3) THE BUTTON. Put the dirty document back and preview it: the dry run
	// NAMES what it would remove (an id alone is not something an operator can
	// agree to), and the real run needs the count they saw.
	require.NoError(t, store.Put(curation.Collection, curation.DocID, curation.Doc{
		Version: 1, Champions: []string{"hero-alt", "hero-base"}, Items: []string{}, Abilities: []string{},
	}))
	plan, err := svc.EvictTransformed(ctx, true, nil, "admin-1")
	require.NoError(t, err)
	assert.True(t, plan.Armed)
	assert.Equal(t, []string{"hero-alt"}, plan.Remove)
	assert.Equal(t, "名字 hero-alt", plan.Names["hero-alt"])

	stale := len(plan.Remove) + 1
	_, err = svc.EvictTransformed(ctx, false, &stale, "admin-1")
	require.Error(t, err, "a stale on-screen count must be a refusal, not a bigger delete")

	n := len(plan.Remove)
	done, err := svc.EvictTransformed(ctx, false, &n, "admin-1")
	require.NoError(t, err)
	assert.Equal(t, []string{"hero-base"}, done.Whitelist.Champions)
	assert.NotEmpty(t, done.SnapshotID, "the pre-click snapshot is the 一鍵 rollback")
}
