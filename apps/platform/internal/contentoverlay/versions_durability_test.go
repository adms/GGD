package contentoverlay_test

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/ggd/platform/internal/contentoverlay"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/stretchr/testify/require"
)

func versionService(t *testing.T) (*contentoverlay.Service, *jsonstore.Store, string) {
	t.Helper()
	store, err := jsonstore.New(t.TempDir())
	require.NoError(t, err)
	path, err := store.Path(contentoverlay.Collection, contentoverlay.DocID)
	require.NoError(t, err)
	svc := contentoverlay.New(store, nil)
	svc.SetNow(func() time.Time { return time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC) })
	return svc, store, path
}

func readVersionBytes(t *testing.T, path string) []byte {
	t.Helper()
	raw, err := os.ReadFile(path)
	require.NoError(t, err)
	return raw
}

func TestVersionsRetainStateBeforeFirstEdit(t *testing.T) {
	svc, store, _ := versionService(t)
	ctx := context.Background()
	original := contentoverlay.EmptyOverlay()
	original.Generation = 7
	original.Docs["champions/godie-e001"] = champDoc("未受版本管理的原文")
	original.Docs["items/other"] = json.RawMessage(`{"id":"other","schema":"item@1","name":"其他資料"}`)
	original.Deleted["items/removed"] = true
	require.NoError(t, store.Put(contentoverlay.Collection, contentoverlay.DocID, original))
	original, err := svc.Get(ctx)
	require.NoError(t, err)
	_, err = svc.PutDoc(ctx, "champions", "godie-e001", champDoc("新版"), "admin")
	require.NoError(t, err)
	versions, err := svc.Versions(ctx, 50)
	require.NoError(t, err)
	require.Empty(t, versions.Unavailable)
	require.Len(t, versions.Entries, 2)
	require.Equal(t, 7, versions.Entries[1].Generation)
	require.Equal(t, 8, versions.Entries[0].Generation)
	_, err = svc.RestoreDoc(ctx, versions.Entries[1].Hash, "champions", "godie-e001", "admin")
	require.NoError(t, err)
	restored, err := svc.Get(ctx)
	require.NoError(t, err)
	require.Equal(t, original.Docs, restored.Docs)
	require.Equal(t, original.Deleted, restored.Deleted)
	require.NotContains(t, restored.Bases, "champions/godie-e001", "an old unknown base must not inherit newer provenance")
	require.Equal(t, 9, restored.Generation)
}

func TestVersionsRetainEmptyBaselineForUndoOfFirstOverride(t *testing.T) {
	svc, _, _ := versionService(t)
	ctx := context.Background()
	_, err := svc.PutDoc(ctx, "champions", "godie-e001", champDoc("首次修改"), "admin")
	require.NoError(t, err)
	versions, err := svc.DocVersions(ctx, "champions", "godie-e001", 50)
	require.NoError(t, err)
	require.Empty(t, versions.Unavailable)
	require.Len(t, versions.Entries, 2)
	require.Equal(t, 0, versions.Entries[1].Generation)
	_, err = svc.RestoreDoc(ctx, versions.Entries[1].Hash, "champions", "godie-e001", "admin")
	require.NoError(t, err)
	restored, err := svc.Get(ctx)
	require.NoError(t, err)
	require.Empty(t, restored.Docs)
	require.Empty(t, restored.Deleted)
	require.Empty(t, restored.Bases)
	require.Equal(t, 2, restored.Generation)
}

func TestVersionStorageFailureCannotOverwriteActiveContent(t *testing.T) {
	svc, _, path := versionService(t)
	ctx := context.Background()
	_, err := svc.PutDoc(ctx, "champions", "godie-e001", champDoc("原版"), "admin")
	require.NoError(t, err)
	before := readVersionBytes(t, path)
	objects := filepath.Join(filepath.Dir(path), ".git", "objects")
	require.NoError(t, os.Rename(objects, objects+".saved"))
	require.NoError(t, os.WriteFile(objects, []byte("unavailable object store"), 0600))
	_, err = svc.PutDoc(ctx, "champions", "godie-e001", champDoc("不應套用"), "admin")
	require.ErrorContains(t, err, "版本無法保存")
	require.Equal(t, before, readVersionBytes(t, path))
	versions, err := svc.Versions(ctx, 50)
	require.NoError(t, err)
	require.NotEmpty(t, versions.Unavailable)
	require.Empty(t, versions.Entries)
}

func TestFailedApplyNeverAppearsAsAnActiveVersion(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("filesystem denial requires an unprivileged account")
	}
	svc, store, path := versionService(t)
	ctx := context.Background()
	_, err := svc.PutDoc(ctx, "champions", "godie-e001", champDoc("已套用"), "admin")
	require.NoError(t, err)
	before := readVersionBytes(t, path)
	versions, err := svc.Versions(ctx, 50)
	require.NoError(t, err)
	dir := filepath.Dir(path)
	repo, err := git.PlainOpen(dir)
	require.NoError(t, err)
	refCount := func() int {
		refs, err := repo.References()
		require.NoError(t, err)
		defer refs.Close()
		n := 0
		require.NoError(t, refs.ForEach(func(ref *plumbing.Reference) error {
			if strings.HasPrefix(ref.Name().String(), "refs/ggd/versions/") {
				n++
			}
			return nil
		}))
		return n
	}
	count := refCount()
	// Objects and refs inside .git remain writable; only the active JSON's
	// atomic replacement fails. This exercises a real failure AFTER prepare.
	require.NoError(t, os.Chmod(dir, 0500))
	defer os.Chmod(dir, 0700)
	_, err = svc.PutDoc(ctx, "champions", "godie-e001", champDoc("尚未套用"), "admin")
	require.Error(t, err)
	require.NoError(t, os.Chmod(dir, 0700))
	require.Greater(t, refCount(), count, "the candidate was actually stored before apply failed")
	require.Equal(t, before, readVersionBytes(t, path))
	reopened := contentoverlay.New(store, nil)
	after, err := reopened.Versions(ctx, 50)
	require.NoError(t, err)
	require.Empty(t, after.Unavailable)
	require.Equal(t, versions, after, "an unapplied candidate must not enter history or move current")
}

func TestActiveVersionSurvivesStaleGitHeadAndClockReversal(t *testing.T) {
	svc, store, path := versionService(t)
	ctx := context.Background()
	_, err := svc.PutDoc(ctx, "champions", "godie-e001", champDoc("第一版"), "admin")
	require.NoError(t, err)
	first, err := svc.Versions(ctx, 50)
	require.NoError(t, err)
	svc.SetNow(func() time.Time { return time.Date(2025, 9, 1, 0, 0, 0, 0, time.UTC) })
	_, err = svc.PutDoc(ctx, "champions", "godie-e001", champDoc("第二版"), "admin")
	require.NoError(t, err)
	current, err := svc.Get(ctx)
	require.NoError(t, err)
	repo, err := git.PlainOpen(filepath.Dir(path))
	require.NoError(t, err)
	head, err := repo.Storer.Reference(plumbing.HEAD)
	require.NoError(t, err)
	require.NoError(t, repo.Storer.SetReference(plumbing.NewHashReference(head.Target(), plumbing.NewHash(first.Entries[0].Hash))))
	reopened := contentoverlay.New(store, nil)
	versions, err := reopened.DocVersions(ctx, "champions", "godie-e001", 50)
	require.NoError(t, err)
	require.Empty(t, versions.Unavailable)
	require.Equal(t, []int{2, 1, 0}, []int{versions.Entries[0].Generation, versions.Entries[1].Generation, versions.Entries[2].Generation})
	require.Equal(t, current.HistoryVersion, versions.Entries[0].Hash)
	require.True(t, versions.Entries[0].Current)
	require.Empty(t, current.PublicBundle().HistoryVersion)
	_, err = reopened.RestoreDoc(ctx, first.Entries[0].Hash, "champions", "godie-e001", "admin")
	require.NoError(t, err)
	after, err := reopened.Versions(ctx, 50)
	require.NoError(t, err)
	require.Equal(t, current.HistoryVersion, after.Entries[1].Hash, "the next commit must parent the actual applied version")
}

func TestChangedActiveDataCannotMasqueradeAsItsPinnedVersion(t *testing.T) {
	svc, store, path := versionService(t)
	ctx := context.Background()
	_, err := svc.PutDoc(ctx, "champions", "godie-e001", champDoc("原版"), "admin")
	require.NoError(t, err)
	current, err := svc.Get(ctx)
	require.NoError(t, err)
	current.Docs["champions/godie-e001"] = champDoc("外部變更")
	require.NoError(t, store.Put(contentoverlay.Collection, contentoverlay.DocID, current))
	before := readVersionBytes(t, path)
	versions, err := svc.Versions(ctx, 50)
	require.NoError(t, err)
	require.NotEmpty(t, versions.Unavailable)
	require.Empty(t, versions.Entries)
	_, err = svc.DeleteDoc(ctx, "champions", "godie-e001", "admin")
	require.ErrorContains(t, err, "版本無法保存")
	require.Equal(t, before, readVersionBytes(t, path))
}

func TestLegacyGitHistoryIsPreservedOnUpgrade(t *testing.T) {
	svc, store, path := versionService(t)
	ctx := context.Background()
	old := contentoverlay.EmptyOverlay()
	old.Generation = 4
	old.UpdatedAt = time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC)
	old.UpdatedBy = "old-admin"
	old.Docs["champions/godie-e001"] = champDoc("舊服務保存")
	require.NoError(t, store.Put(contentoverlay.Collection, contentoverlay.DocID, old))
	old, err := svc.Get(ctx)
	require.NoError(t, err)
	repo, err := git.PlainInit(filepath.Dir(path), false)
	require.NoError(t, err)
	worktree, err := repo.Worktree()
	require.NoError(t, err)
	_, err = worktree.Add("overlay.json")
	require.NoError(t, err)
	legacy, err := worktree.Commit("gen 4 · put · champions/godie-e001", &git.CommitOptions{Author: &object.Signature{Name: old.UpdatedBy, Email: "admin@ggd.local", When: old.UpdatedAt}})
	require.NoError(t, err)
	_, err = svc.PutDoc(ctx, "champions", "godie-e001", champDoc("新服務保存"), "admin")
	require.NoError(t, err)
	versions, err := svc.Versions(ctx, 50)
	require.NoError(t, err)
	require.Empty(t, versions.Unavailable)
	require.Len(t, versions.Entries, 2)
	require.Equal(t, legacy.String(), versions.Entries[1].Hash)
	_, err = svc.RestoreDoc(ctx, legacy.String(), "champions", "godie-e001", "admin")
	require.NoError(t, err)
	restored, err := svc.Get(ctx)
	require.NoError(t, err)
	require.Equal(t, old.Docs, restored.Docs)
}
