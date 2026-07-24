package admin

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/gamelink"
)

// TestWalkMatchesDoesNotFollowSymlinks is the G122 regression: filepath.WalkDir
// lstats, so it will not DESCEND a symlink, but os.ReadFile FOLLOWS one. Before
// the fix, a link planted at data/matches/YYYY/MM/<id>.json pointing anywhere on
// the filesystem was read and — if the target happened to unmarshal into a
// Settlement with a non-empty matchId — surfaced to an admin.
//
// Planting the link needs filesystem write inside the platform container (the
// only writer of this tree is the settlement path via jsonstore.resolve, which
// admits no caller-chosen name), so this is defense in depth rather than a
// reachable hole. The guard costs two lines, so it is taken rather than
// annotated away.
func TestWalkMatchesDoesNotFollowSymlinks(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink semantics")
	}
	root := t.TempDir()
	store, err := jsonstore.New(root)
	require.NoError(t, err)
	s := &Service{store: store}

	// A genuine settlement, written the way the settlement path writes them.
	real := gamelink.Settlement{MatchID: "real-match", EndedAt: time.Now()}
	require.NoError(t, store.Put("matches/2026/07", "real-match", real))

	// A file OUTSIDE the store that would parse as a Settlement, plus a symlink
	// to it planted inside the matches tree.
	outside := filepath.Join(t.TempDir(), "outside.json")
	leaked, err := json.Marshal(gamelink.Settlement{MatchID: "leaked-secret", EndedAt: time.Now()})
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(outside, leaked, 0o600))
	require.NoError(t, os.Symlink(outside, filepath.Join(root, "matches", "2026", "07", "linked.json")))

	got, err := s.walkMatches()
	require.NoError(t, err)

	ids := make([]string, 0, len(got))
	for _, m := range got {
		ids = append(ids, m.MatchID)
	}
	require.Contains(t, ids, "real-match", "regular match records must still be read")
	require.NotContains(t, ids, "leaked-secret",
		"a symlink inside data/matches must not be followed out of the tree")
}
