package contentoverlay_test

// precedence_test.go — the executable form of #189's two hardest promises:
//
//	requirement 2: the merge precedence rule, INCLUDING what happens when the
//	               shipped bundle moves underneath an overlay entry;
//	requirement 5: a corrupt/half-written overlay file degrades to the shipped
//	               tree instead of taking the platform down.
//
// Both are tested against real bytes on a real temp filesystem — a fake shipped
// content tree with a real `_index.json`, and literal garbage written into the
// durable overlay file — because both failure modes are about what is ON DISK,
// and a mocked store would have proved nothing about either.

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/admin"
	"github.com/ggd/platform/internal/contentoverlay"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/pkg/testkit"
)

// shippedEntry mirrors one row of a content collection's _index.json.
type shippedEntry struct {
	ID   string `json:"id"`
	Path string `json:"path"`
	Hash string `json:"hash"`
	Size int    `json:"size"`
}

// writeShippedIndex writes a collection index exactly as `pnpm content:build`
// would. The hashes are opaque to Go — that is the whole point of reading them
// rather than recomputing them (see shipped.go).
func writeShippedIndex(t *testing.T, contentDir, collection string, entries []shippedEntry) {
	t.Helper()
	dir := filepath.Join(contentDir, collection)
	require.NoError(t, os.MkdirAll(dir, 0o750))
	body, err := json.MarshalIndent(map[string]any{
		"collection": collection, "hash": "collhash", "entries": entries,
	}, "", "  ")
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(filepath.Join(dir, "_index.json"), body, 0o600))
}

func writeShippedDoc(t *testing.T, contentDir, rel, body string) {
	t.Helper()
	p := filepath.Join(contentDir, filepath.FromSlash(rel))
	require.NoError(t, os.MkdirAll(filepath.Dir(p), 0o750))
	require.NoError(t, os.WriteFile(p, []byte(body), 0o600))
}

// newSvcWithContent builds a service over a temp data dir AND a temp shipped
// content tree, returning both roots so a test can move the shipped tree
// underneath the overlay the way a `git pull` does.
func newSvcWithContent(t *testing.T) (*contentoverlay.Service, string, string) {
	t.Helper()
	dataDir := t.TempDir()
	contentDir := t.TempDir()
	store, err := jsonstore.New(dataDir)
	require.NoError(t, err)
	svc := contentoverlay.New(store, nil, contentoverlay.WithContentDir(contentDir))
	svc.SetNow(func() time.Time { return time.Date(2026, 7, 26, 9, 0, 0, 0, time.UTC) })
	return svc, dataDir, contentDir
}

func entryFor(t *testing.T, st contentoverlay.Status, key string) contentoverlay.StatusEntry {
	t.Helper()
	for _, e := range st.Entries {
		if e.Key == key {
			return e
		}
	}
	t.Fatalf("no status entry for %q (have %d)", key, len(st.Entries))
	return contentoverlay.StatusEntry{}
}

// ---------------------------------------------------------------------------
// requirement 2 — precedence, and the shipped bundle moving underneath
// ---------------------------------------------------------------------------

// content-overlay-precedence-stale: THE headline case. An admin edits 陰陽師's
// Q; a later `git pull` rewrites the shipped doc. The overlay STILL WINS (the
// operator's edit is never silently discarded) but the entry is marked stale,
// counted, and reported — which is the difference between "documented rule" and
// "content drifts from the repo and nobody notices".
func TestStaleWhenShippedMovesUnderneath(t *testing.T) {
	testkit.Cover(t, "content-overlay-precedence-stale")
	svc, _, contentDir := newSvcWithContent(t)
	ctx := context.Background()

	writeShippedIndex(t, contentDir, "abilities", []shippedEntry{
		{ID: "godie-e001.q", Path: "abilities/godie-e001.q.json", Hash: "aaaaaaaaaaaa", Size: 100},
	})
	writeShippedDoc(t, contentDir, "abilities/godie-e001.q.json", `{"id":"godie-e001.q","damage":100}`)

	_, err := svc.PutDoc(ctx, "abilities", "godie-e001.q",
		json.RawMessage(`{"id":"godie-e001.q","damage":250}`), "admin-1")
	require.NoError(t, err)

	// before the pull: the base matches the shipped tree → clean, unflagged
	st, err := svc.Status(ctx)
	require.NoError(t, err)
	e := entryFor(t, st, "abilities/godie-e001.q")
	assert.Equal(t, contentoverlay.StateClean, e.State)
	assert.False(t, e.Flagged)
	assert.Equal(t, "aaaaaaaaaaaa", e.BaseHash)
	assert.Equal(t, "aaaaaaaaaaaa", e.ShippedHash)
	assert.Equal(t, 0, st.FlaggedCount)

	// …a git pull rewrites the shipped doc (the index carries the new hash).
	// The mtime+size cache must not hide it, so the index really is rewritten.
	writeShippedIndex(t, contentDir, "abilities", []shippedEntry{
		{ID: "godie-e001.q", Path: "abilities/godie-e001.q.json", Hash: "bbbbbbbbbbbb", Size: 140},
	})

	st, err = svc.Status(ctx)
	require.NoError(t, err)
	e = entryFor(t, st, "abilities/godie-e001.q")
	assert.Equal(t, contentoverlay.StateStale, e.State, "the shipped doc moved under the edit")
	assert.True(t, e.Flagged)
	assert.Equal(t, "aaaaaaaaaaaa", e.BaseHash, "the base is what the repo said WHEN EDITED")
	assert.Equal(t, "bbbbbbbbbbbb", e.ShippedHash, "…and this is what it says now")
	assert.Equal(t, 1, st.FlaggedCount)
	assert.Equal(t, "admin-1", e.EditedBy, "requirement 6: by whom")
	assert.False(t, e.EditedAt.IsZero(), "requirement 6: when")

	// THE RULE ITSELF: stale or not, the overlay still wins. The merged tree the
	// consumers fetch is unchanged — nothing was dropped behind the operator's
	// back just because the repo moved.
	o, err := svc.Get(ctx)
	require.NoError(t, err)
	var still map[string]any
	require.NoError(t, json.Unmarshal(o.Docs["abilities/godie-e001.q"], &still))
	assert.EqualValues(t, 250, still["damage"], "the operator's edit still wins after the pull")
}

// content-overlay-precedence-states: the rest of the state table, each with the
// on-disk situation that produces it.
func TestPrecedenceStateTable(t *testing.T) {
	testkit.Cover(t, "content-overlay-precedence-states")
	svc, _, contentDir := newSvcWithContent(t)
	ctx := context.Background()

	// champions ships ONE doc; the operator will edit it and also add a new one.
	writeShippedIndex(t, contentDir, "champions", []shippedEntry{
		{ID: "shipped-hero", Path: "champions/shipped-hero.json", Hash: "hhhhhhhhhhhh", Size: 10},
	})
	_, err := svc.PutDoc(ctx, "champions", "shipped-hero", json.RawMessage(`{"a":1}`), "admin-1")
	require.NoError(t, err)
	_, err = svc.PutDoc(ctx, "champions", "brand-new", json.RawMessage(`{"a":2}`), "admin-1")
	require.NoError(t, err)
	_, err = svc.DeleteDoc(ctx, "champions", "shipped-hero-2", "admin-1")
	require.NoError(t, err)

	st, err := svc.Status(ctx)
	require.NoError(t, err)
	// an id the shipped tree never had, and still does not → added, not flagged
	assert.Equal(t, contentoverlay.StateAdded, entryFor(t, st, "champions/brand-new").State)
	assert.False(t, entryFor(t, st, "champions/brand-new").Flagged)
	// a tombstone over an id the shipped tree does not have → moot, informational
	assert.Equal(t, contentoverlay.StateTombstoneMoot, entryFor(t, st, "champions/shipped-hero-2").State)
	assert.True(t, entryFor(t, st, "champions/shipped-hero-2").Tombstone)

	// now the pull: shipped-hero is DELETED from the repo, shipped-hero-2 is
	// added, and a doc appears with the id the operator had invented.
	writeShippedIndex(t, contentDir, "champions", []shippedEntry{
		{ID: "shipped-hero-2", Path: "champions/shipped-hero-2.json", Hash: "kkkkkkkkkkkk", Size: 10},
		{ID: "brand-new", Path: "champions/brand-new.json", Hash: "cccccccccccc", Size: 10},
	})

	st, err = svc.Status(ctx)
	require.NoError(t, err)
	// the doc this edit was based on is gone from the repo
	assert.Equal(t, contentoverlay.StateOrphan, entryFor(t, st, "champions/shipped-hero").State)
	assert.True(t, entryFor(t, st, "champions/shipped-hero").Flagged)
	// the operator's "new" doc now HIDES a real shipped doc it never saw
	assert.Equal(t, contentoverlay.StateShadow, entryFor(t, st, "champions/brand-new").State)
	assert.True(t, entryFor(t, st, "champions/brand-new").Flagged)
	// the tombstone is doing real work again
	assert.Equal(t, contentoverlay.StateTombstone, entryFor(t, st, "champions/shipped-hero-2").State)
	assert.Equal(t, 2, st.FlaggedCount)
}

// content-overlay-precedence-unknown-base: an overlay written before baseHash
// existed (or on a host with no readable content tree) must report
// "unknown-base" and be FLAGGED — csync-03's rule that a missing base
// downgrades to conflict rather than picking a side. Asserting "not clean" is
// the whole point: assuming clean is precisely how a stale entry hides.
func TestUnknownBaseIsFlaggedNeverAssumedClean(t *testing.T) {
	testkit.Cover(t, "content-overlay-precedence-unknown-base")
	dataDir := t.TempDir()
	contentDir := t.TempDir()
	store, err := jsonstore.New(dataDir)
	require.NoError(t, err)

	// A LEGACY overlay file: the exact shape the previous pass wrote — docs and
	// deleted, no `bases` key at all.
	require.NoError(t, os.MkdirAll(filepath.Join(dataDir, "content-overlay"), 0o750))
	require.NoError(t, os.WriteFile(
		filepath.Join(dataDir, "content-overlay", "overlay.json"),
		[]byte(`{"schemaVersion":1,"generation":7,"updatedAt":"2026-07-20T00:00:00Z",`+
			`"updatedBy":"old-admin","docs":{"items/sword-01":{"id":"sword-01"}},"deleted":{}}`),
		0o600))
	writeShippedIndex(t, contentDir, "items", []shippedEntry{
		{ID: "sword-01", Path: "items/sword-01.json", Hash: "zzzzzzzzzzzz", Size: 10},
	})

	svc := contentoverlay.New(store, nil, contentoverlay.WithContentDir(contentDir))
	st, err := svc.Status(context.Background())
	require.NoError(t, err)
	e := entryFor(t, st, "items/sword-01")
	assert.Equal(t, contentoverlay.StateUnknownBase, e.State)
	assert.True(t, e.Flagged, "an unjudgeable entry must be flagged, never assumed clean")
	assert.NotEqual(t, contentoverlay.StateClean, e.State)

	// …and the legacy file still LOADS: the new field is additive, so an old
	// overlay keeps working (and keeps winning) rather than failing to parse.
	o, err := svc.Get(context.Background())
	require.NoError(t, err)
	assert.Equal(t, 7, o.Generation)
	assert.Contains(t, o.Docs, "items/sword-01")
}

// content-overlay-precedence-no-content-tree: with no CONTENT_DIR the service
// must say "cannot tell", not "all clean".
func TestNoContentTreeYieldsUnknownNotClean(t *testing.T) {
	testkit.Cover(t, "content-overlay-precedence-unknown-base")
	store, err := jsonstore.New(t.TempDir())
	require.NoError(t, err)
	svc := contentoverlay.New(store, nil) // no WithContentDir
	ctx := context.Background()

	_, err = svc.PutDoc(ctx, "items", "sword-01", json.RawMessage(`{"id":"sword-01"}`), "admin-1")
	require.NoError(t, err)

	st, err := svc.Status(ctx)
	require.NoError(t, err)
	assert.False(t, st.Shipped.Available)
	assert.NotEmpty(t, st.Shipped.Detail, "the console must be able to explain WHY it cannot tell")
	assert.Equal(t, contentoverlay.StateUnknownBase, entryFor(t, st, "items/sword-01").State)
	assert.Equal(t, 1, st.FlaggedCount)
}

// ---------------------------------------------------------------------------
// requirement 5 — a corrupt overlay must never take the platform down
// ---------------------------------------------------------------------------

// content-overlay-corrupt-degrades: literal garbage in the durable file. Every
// read must SUCCEED with the empty overlay (i.e. the shipped content tree),
// report degraded, and preserve the original bytes — not 500, and above all not
// fail a boot.
func TestCorruptOverlayDegradesToShippedTree(t *testing.T) {
	testkit.Cover(t, "content-overlay-corrupt-degrades")
	svc, dataDir, _ := newSvcWithContent(t)
	ctx := context.Background()

	// a real overlay first, so there is something to lose
	_, err := svc.PutDoc(ctx, "items", "sword-01", json.RawMessage(`{"id":"sword-01"}`), "admin-1")
	require.NoError(t, err)

	overlayPath := filepath.Join(dataDir, "content-overlay", "overlay.json")
	const garbage = "\x00\xffthis is not json at all {{{"
	require.NoError(t, os.WriteFile(overlayPath, []byte(garbage), 0o600))

	// 1. reads DEGRADE rather than error — this is the boot path for both the
	//    platform (Head/Get) and the game-server (which fetches /bundle).
	hd, err := svc.Head(ctx)
	require.NoError(t, err, "a corrupt overlay must not turn every read into a 500")
	assert.True(t, hd.Degraded)
	assert.Equal(t, 0, hd.DocCount)

	o, err := svc.Get(ctx)
	require.NoError(t, err)
	assert.Empty(t, o.Docs, "degraded == the shipped content tree, unmodified")
	assert.Empty(t, o.Deleted)

	// 2. the problem is SURFACED, with the detail an operator needs
	st, err := svc.Status(ctx)
	require.NoError(t, err)
	require.NotNil(t, st.Degraded)
	assert.NotEmpty(t, st.Degraded.Reason)
	assert.Equal(t, len(garbage), st.Degraded.Bytes)
	assert.NotEmpty(t, st.DataPath, "the operator is shown WHERE the durable file is")

	// 3. the original bytes are preserved verbatim — degrading must not destroy
	//    durable state, even unreadable durable state
	require.NotEmpty(t, st.Degraded.Quarantine)
	var q struct {
		RawBase64 string `json:"rawBase64"`
		Bytes     int    `json:"bytes"`
	}
	require.NoError(t, err)
	raw, err := os.ReadFile(filepath.Join(dataDir, "content-overlay", st.Degraded.Quarantine+".json"))
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal(raw, &q))
	decoded, err := base64.StdEncoding.DecodeString(q.RawBase64)
	require.NoError(t, err)
	assert.Equal(t, garbage, string(decoded), "the quarantined copy must be byte-exact")

	// 4. and the host RECOVERS: a new write replaces the broken file and clears
	//    the degraded flag, with no manual repair step.
	hd, err = svc.PutDoc(ctx, "items", "sword-02", json.RawMessage(`{"id":"sword-02"}`), "admin-1")
	require.NoError(t, err)
	assert.False(t, hd.Degraded)
	hd, err = svc.Head(ctx)
	require.NoError(t, err)
	assert.False(t, hd.Degraded)
	assert.Equal(t, 1, hd.DocCount)
}

// content-overlay-corrupt-truncated: the half-written case specifically — the
// failure a crash mid-write would produce if writes were not atomic. Same
// contract: degrade, do not error.
func TestTruncatedOverlayDegrades(t *testing.T) {
	testkit.Cover(t, "content-overlay-corrupt-degrades")
	svc, dataDir, _ := newSvcWithContent(t)
	ctx := context.Background()

	_, err := svc.PutDoc(ctx, "items", "sword-01", json.RawMessage(`{"id":"sword-01"}`), "admin-1")
	require.NoError(t, err)
	overlayPath := filepath.Join(dataDir, "content-overlay", "overlay.json")
	full, err := os.ReadFile(overlayPath)
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(overlayPath, full[:len(full)/2], 0o600))

	hd, err := svc.Head(ctx)
	require.NoError(t, err)
	assert.True(t, hd.Degraded)

	// a WRONGLY-TYPED but well-formed file is the other half of the same
	// contract (json.UnmarshalTypeError, not SyntaxError)
	require.NoError(t, os.WriteFile(overlayPath, []byte(`{"schemaVersion":1,"docs":42}`), 0o600))
	hd, err = svc.Head(ctx)
	require.NoError(t, err)
	assert.True(t, hd.Degraded, "a type-mismatched overlay degrades too, not only a syntax error")
}

// ---------------------------------------------------------------------------
// requirement 4 — every write is audited, as a guarantee
// ---------------------------------------------------------------------------

// content-overlay-audited: put / delete / revert each leave a line in the shared
// admin audit log, naming the operator and the key.
func TestEveryMutationLeavesAnAuditLine(t *testing.T) {
	testkit.Cover(t, "content-overlay-audited")
	svc, dataDir, contentDir := newSvcWithContent(t)
	ctx := context.Background()
	writeShippedIndex(t, contentDir, "items", []shippedEntry{
		{ID: "sword-01", Path: "items/sword-01.json", Hash: "ssssssssssss", Size: 10},
	})

	_, err := svc.PutDoc(ctx, "items", "sword-01", json.RawMessage(`{"id":"sword-01"}`), "admin-7")
	require.NoError(t, err)
	_, err = svc.DeleteDoc(ctx, "items", "sword-99", "admin-7")
	require.NoError(t, err)
	_, err = svc.RevertDoc(ctx, "items", "sword-01", "admin-7")
	require.NoError(t, err)

	body, err := os.ReadFile(filepath.Join(dataDir, admin.ColAudit, "2026-07-26.jsonl"))
	require.NoError(t, err, "overlay edits must land in the SHARED audit log, not a private one")
	lines := strings.Split(strings.TrimSpace(string(body)), "\n")
	actions := make([]string, 0, len(lines))
	for _, ln := range lines {
		var e admin.AuditEntry
		require.NoError(t, json.Unmarshal([]byte(ln), &e))
		assert.Equal(t, "admin-7", e.AdminID)
		actions = append(actions, e.Action)
	}
	assert.Equal(t, []string{
		"content-overlay.put", "content-overlay.delete", "content-overlay.revert",
	}, actions)
}

// content-overlay-audit-fail-closed: if the audit line cannot be written, the
// content change is REFUSED. This is the deliberate behaviour change over the
// previous best-effort shape — a host that cannot record who changed the
// content must not change the content.
func TestUnauditableMutationIsRefused(t *testing.T) {
	testkit.Cover(t, "content-overlay-audited")
	dataDir := t.TempDir()
	store, err := jsonstore.New(dataDir)
	require.NoError(t, err)
	svc := contentoverlay.New(store, nil)
	ctx := context.Background()

	// Make the audit collection unwritable by parking a FILE where its directory
	// has to be: AppendLine's MkdirAll then fails, which is the realistic
	// "cannot write the audit trail" condition.
	require.NoError(t, os.WriteFile(filepath.Join(dataDir, admin.ColAudit), []byte("x"), 0o600))

	_, err = svc.PutDoc(ctx, "items", "sword-01", json.RawMessage(`{"id":"sword-01"}`), "admin-1")
	require.Error(t, err, "an unauditable content change must fail, not proceed quietly")
	assert.Contains(t, err.Error(), "unaudited")

	// …and nothing was written: the durable overlay is untouched.
	exists, err := store.Exists(contentoverlay.Collection, contentoverlay.DocID)
	require.NoError(t, err)
	assert.False(t, exists)
}

// ---------------------------------------------------------------------------
// revert — the non-destructive exit from a stale entry
// ---------------------------------------------------------------------------

// content-overlay-revert: RevertDoc drops the overlay's opinion entirely, so the
// merged tree falls back to the shipped doc. It must NOT leave a tombstone —
// that would hide the repo's version too, which is the opposite of the intent.
func TestRevertFallsBackToShippedWithoutTombstoning(t *testing.T) {
	testkit.Cover(t, "content-overlay-revert")
	svc, _, contentDir := newSvcWithContent(t)
	ctx := context.Background()
	writeShippedIndex(t, contentDir, "items", []shippedEntry{
		{ID: "sword-01", Path: "items/sword-01.json", Hash: "ssssssssssss", Size: 10},
	})

	_, err := svc.PutDoc(ctx, "items", "sword-01", json.RawMessage(`{"id":"sword-01","dmg":9}`), "admin-1")
	require.NoError(t, err)

	hd, err := svc.RevertDoc(ctx, "items", "sword-01", "admin-1")
	require.NoError(t, err)
	assert.Equal(t, 0, hd.DocCount)
	assert.Equal(t, 0, hd.DeletedCount, "revert must not tombstone — that would hide the shipped doc")

	o, err := svc.Get(ctx)
	require.NoError(t, err)
	assert.NotContains(t, o.Docs, "items/sword-01")
	assert.NotContains(t, o.Deleted, "items/sword-01")
	assert.NotContains(t, o.Bases, "items/sword-01")

	st, err := svc.Status(ctx)
	require.NoError(t, err)
	assert.Empty(t, st.Entries, "nothing is overlaid any more")

	// reverting nothing is a 400, not a silent no-op that advances a generation
	_, err = svc.RevertDoc(ctx, "items", "sword-01", "admin-1")
	assert.Error(t, err)
}

// ---------------------------------------------------------------------------
// requirement 3 — the path that survives a rebuild
// ---------------------------------------------------------------------------

// content-overlay-data-path: the durable file must live under the jsonstore ROOT
// (DATA_DIR, i.e. the `../data:/data` bind mount), not anywhere else. That path
// IS the acceptance criterion for "survives docker compose build && up -d", so
// it is asserted rather than described.
func TestDurableFileLivesUnderDataDir(t *testing.T) {
	testkit.Cover(t, "content-overlay-durable")
	svc, dataDir, _ := newSvcWithContent(t)
	ctx := context.Background()

	_, err := svc.PutDoc(ctx, "items", "sword-01", json.RawMessage(`{"id":"sword-01"}`), "admin-1")
	require.NoError(t, err)

	want := filepath.Join(dataDir, "content-overlay", "overlay.json")
	_, err = os.Stat(want)
	require.NoError(t, err, "the overlay must be at DATA_DIR/content-overlay/overlay.json")

	st, err := svc.Status(ctx)
	require.NoError(t, err)
	assert.Equal(t, want, st.DataPath, "the console shows the real path, not a guess")

	// the generation history lands next to it, also under DATA_DIR
	_, err = os.Stat(filepath.Join(dataDir, "content-overlay-log", "2026-07-26.jsonl"))
	require.NoError(t, err)

	// …and it is READABLE, which it never was before: the log had no reader
	// anywhere in the repo, so #189's "see what changed" had nothing behind it.
	lines, err := svc.ReadLog(3, 50)
	require.NoError(t, err)
	require.Len(t, lines, 1)
	assert.Equal(t, "put", lines[0].Op)
	assert.Equal(t, "items/sword-01", lines[0].Key)
	assert.Equal(t, "admin-1", lines[0].By)
}

// content-overlay-shipped-view: the admin console can read the SHIPPED version
// of a doc to put next to the overlaid one, and the reader cannot be walked out
// of CONTENT_DIR.
func TestShippedDocReadIsBoundedToContentDir(t *testing.T) {
	testkit.Cover(t, "content-overlay-shipped-view")
	svc, _, contentDir := newSvcWithContent(t)
	writeShippedIndex(t, contentDir, "items", []shippedEntry{
		{ID: "sword-01", Path: "items/sword-01.json", Hash: "ssssssssssss", Size: 10},
	})
	writeShippedDoc(t, contentDir, "items/sword-01.json", `{"id":"sword-01","dmg":1}`)

	doc, hash, err := svc.ShippedDoc("items", "sword-01")
	require.NoError(t, err)
	assert.Equal(t, "ssssssssssss", hash)
	assert.Contains(t, string(doc), `"dmg":1`)

	// an id the shipped tree does not have is "not present", not an error
	doc, _, err = svc.ShippedDoc("items", "nope")
	require.NoError(t, err)
	assert.Nil(t, doc)

	// traversal attempts are rejected by validateKey before any file is touched
	_, _, err = svc.ShippedDoc("items", "../../etc/passwd")
	assert.Error(t, err)
	_, _, err = svc.ShippedDoc("../secrets", "x")
	assert.Error(t, err)
}
