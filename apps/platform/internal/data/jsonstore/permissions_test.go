package jsonstore_test

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/data/jsonstore"
)

type permDoc struct {
	ID string `json:"id"`
}

// TestObjectFilesAreNotWorldReadable pins the modes of the durable tree. This
// tree holds argon2id password hashes (data/accounts), the plaintext AI provider
// key (data/config/ai-provider.json) and single-use invite codes, so 0644 was
// the wrong default.
//
// The RE-TIGHTENING case is the point of the test. jsonstore used to write via
// renameio.WriteFile, which always applies WithExistingPermissions and therefore
// copies the mode off an already-existing target — silently ignoring the mode
// argument. Against that implementation, "write a 0644 file, then Put over it"
// leaves 0644 forever, so every account doc already on the family host would
// have stayed world-readable no matter what constant the code passed.
func TestObjectFilesAreNotWorldReadable(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("unix file modes")
	}
	root := t.TempDir()
	s, err := jsonstore.New(root)
	require.NoError(t, err)

	require.NoError(t, s.Put("accounts", "01A", permDoc{ID: "01A"}))

	path, err := s.Path("accounts", "01A")
	require.NoError(t, err)
	fi, err := os.Stat(path)
	require.NoError(t, err)
	require.Equal(t, os.FileMode(0o640), fi.Mode().Perm(),
		"account docs carry password hashes and must not be world-readable")

	dfi, err := os.Stat(filepath.Dir(path))
	require.NoError(t, err)
	require.Equal(t, os.FileMode(0o750), dfi.Mode().Perm(),
		"the collection directory must not be world-readable")

	// A doc that already exists at the old world-readable mode must be tightened
	// by the next write, not have its mode inherited.
	require.NoError(t, os.Chmod(path, 0o644))
	require.NoError(t, s.Put("accounts", "01A", permDoc{ID: "01A"}))
	fi, err = os.Stat(path)
	require.NoError(t, err)
	require.Equal(t, os.FileMode(0o640), fi.Mode().Perm(),
		"a pre-existing 0644 doc must be re-tightened on rewrite, not inherited")

	// The per-collection index travels with the objects.
	idx := filepath.Join(filepath.Dir(path), "_index.json")
	ifi, err := os.Stat(idx)
	require.NoError(t, err)
	require.Equal(t, os.FileMode(0o640), ifi.Mode().Perm())
}

// TestAppendLineFilesAreNotWorldReadable covers the NDJSON path: the admin audit
// trail (data/admin-audit) and per-account match history (data/history).
func TestAppendLineFilesAreNotWorldReadable(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("unix file modes")
	}
	root := t.TempDir()
	s, err := jsonstore.New(root)
	require.NoError(t, err)

	require.NoError(t, s.AppendLine("admin-audit", "2026-07-24", permDoc{ID: "x"}))

	path := filepath.Join(root, "admin-audit", "2026-07-24.jsonl")
	fi, err := os.Stat(path)
	require.NoError(t, err)
	require.Equal(t, os.FileMode(0o640), fi.Mode().Perm(),
		"a world-readable admin audit trail is a real finding, not rule noise")

	dfi, err := os.Stat(filepath.Dir(path))
	require.NoError(t, err)
	require.Equal(t, os.FileMode(0o750), dfi.Mode().Perm())
}

// TestStoreRootIsNotWorldReadable covers the DATA_DIR root created by New.
func TestStoreRootIsNotWorldReadable(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("unix file modes")
	}
	root := filepath.Join(t.TempDir(), "data")
	_, err := jsonstore.New(root)
	require.NoError(t, err)

	fi, err := os.Stat(root)
	require.NoError(t, err)
	require.Equal(t, os.FileMode(0o750), fi.Mode().Perm())
}
