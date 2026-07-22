package jsonstore_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/pkg/testkit"
)

type doc struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	N    int    `json:"n"`
}

// TestAtomicWrite proves the account-JSON write path is atomic: writes go
// through tmp+rename (no partial/tmp files ever visible), a failed write
// leaves the previous content intact, and concurrent writers never produce
// torn JSON.
func TestAtomicWrite(t *testing.T) {
	testkit.Cover(t, "auth-atomic-write")
	s, err := jsonstore.New(t.TempDir())
	require.NoError(t, err)

	require.NoError(t, s.Put("accounts", "01A", doc{ID: "01A", Name: "alice", N: 1}))

	// Simulated failure mid-write: an unmarshalable value errors out and the
	// existing file must be untouched (no partial file).
	err = s.Put("accounts", "01A", map[string]any{"bad": make(chan int)})
	require.Error(t, err)
	var got doc
	require.NoError(t, s.Get("accounts", "01A", &got))
	require.Equal(t, "alice", got.Name, "failed write must not corrupt the object")

	// Concurrent writers on the same object: the file must always be one
	// complete JSON document (rename is atomic).
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			_ = s.Put("accounts", "01A", doc{ID: "01A", Name: "alice", N: n})
		}(i)
	}
	wg.Wait()
	data, err := os.ReadFile(filepath.Join(s.Root(), "accounts", "01A.json"))
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal(data, &got), "object file must never be torn")

	// No tmp litter: only final .json files remain in the collection dir.
	entries, err := os.ReadDir(filepath.Join(s.Root(), "accounts"))
	require.NoError(t, err)
	for _, e := range entries {
		require.True(t, strings.HasSuffix(e.Name(), ".json"),
			"unexpected non-final file %q left behind", e.Name())
	}
}

// TestPathTraversalRejected fuzzes hostile ids/collections: nothing may
// escape the data root.
func TestPathTraversalRejected(t *testing.T) {
	root := t.TempDir()
	s, err := jsonstore.New(root)
	require.NoError(t, err)

	hostile := []string{
		"../evil", "..", "a/../../b", "/etc/passwd", "a/b", `a\b`,
		"..%2f..%2fetc", ".hidden", "", "con\x00trol", "name\nnewline",
	}
	for _, id := range hostile {
		require.ErrorIs(t, s.Put("accounts", id, doc{}), jsonstore.ErrInvalidKey, "id=%q", id)
		var d doc
		require.ErrorIs(t, s.Get("accounts", id, &d), jsonstore.ErrInvalidKey, "id=%q", id)
		require.ErrorIs(t, s.Delete("accounts", id), jsonstore.ErrInvalidKey, "id=%q", id)
	}
	for _, col := range []string{"../outside", "a/../b", "/abs", "", "x\x00y", ".."} {
		require.Error(t, s.Put(col, "ok", doc{}), "collection=%q", col)
	}
	// Nothing escaped the root.
	parent := filepath.Dir(root)
	entries, err := os.ReadDir(parent)
	require.NoError(t, err)
	for _, e := range entries {
		require.NotEqual(t, "evil.json", e.Name())
	}
}

func TestCRUDAndIndex(t *testing.T) {
	s, err := jsonstore.New(t.TempDir())
	require.NoError(t, err)

	require.NoError(t, s.Put("things", "b", doc{ID: "b"}))
	require.NoError(t, s.Put("things", "a", doc{ID: "a"}))
	ids, err := s.List("things")
	require.NoError(t, err)
	require.Equal(t, []string{"a", "b"}, ids, "index is sorted")

	require.NoError(t, s.Delete("things", "a"))
	ids, err = s.List("things")
	require.NoError(t, err)
	require.Equal(t, []string{"b"}, ids)

	var d doc
	require.ErrorIs(t, s.Get("things", "a", &d), jsonstore.ErrNotFound)

	// Nested collections (matches/YYYY/MM) work.
	require.NoError(t, s.Put("matches/2026/07", "m1", doc{ID: "m1"}))
	ids, err = s.List("matches/2026/07")
	require.NoError(t, err)
	require.Equal(t, []string{"m1"}, ids)
}

func TestAppendLines(t *testing.T) {
	s, err := jsonstore.New(t.TempDir())
	require.NoError(t, err)
	require.NoError(t, s.AppendLine("history", "acct1", map[string]any{"matchId": "m1"}))
	require.NoError(t, s.AppendLine("history", "acct1", map[string]any{"matchId": "m2"}))
	lines, err := s.ReadLines("history", "acct1")
	require.NoError(t, err)
	require.Len(t, lines, 2)
}
