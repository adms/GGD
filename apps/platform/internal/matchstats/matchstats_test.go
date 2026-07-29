package matchstats_test

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/gamelink"
	"github.com/ggd/platform/internal/matchstats"
)

// ============================================================================
// These tests are written against the two things that can silently go wrong
// with a persistence feature: the data is stored but UNIDENTIFIABLE (no build
// stamp — failure mode ②, "computed but never reaches the consumer", one level
// up), and one bad row takes the batch with it. Everything else is plumbing.
// ============================================================================

func repoRoot(t *testing.T) string {
	t.Helper()
	root, err := filepath.Abs(filepath.Join("..", "..", "..", ".."))
	require.NoError(t, err)
	require.FileExists(t, filepath.Join(root, "pnpm-workspace.yaml"),
		"expected the monorepo root at %s", root)
	return root
}

func newSvc(t *testing.T, opts matchstats.Options) (*matchstats.Service, *jsonstore.Store, string) {
	t.Helper()
	dir := t.TempDir()
	store, err := jsonstore.New(dir)
	require.NoError(t, err)
	return matchstats.New(store, opts), store, dir
}

// ledger builds a small but SHAPE-REALISTIC snapshot: every section present,
// each with one element carrying its index keys.
func ledger(matchID string) []byte {
	return []byte(`{
  "matchId": ` + strconv.Quote(matchID) + `,
  "picks": [{"seatId":0,"teamId":0,"zone":0,"championId":"godie-a001","source":"manual","selectOpenTick":0,"lockTick":90}],
  "lineups": [{"round":1,"zone":0,"sides":[{"teamId":0,"championIds":["godie-a001"],"won":true},{"teamId":1,"championIds":["godie-a002"],"won":false}]}],
  "casts": [{"castId":0,"seatId":0,"round":1,"tick":120,"abilityId":"godie-a001-01","slot":1,"heroHits":2,"mobHits":0,"damageToHeroes":410,"damageToMobs":0,"healingDone":0,"ccTicksApplied":0,"heroKills":1}],
  "itemTxns": [{"seatId":0,"round":1,"tick":30,"kind":"buy","itemId":"item-001","goldDelta":-300}],
  "offers": [{"seatId":0,"round":1,"tick":40,"kind":"augment","offered":["aug-1","aug-2","aug-3"],"picked":"aug-1","declined":["aug-2","aug-3"],"auto":false}],
  "rounds": [{"round":1,"seatId":0,"teamId":0,"zone":0,"championId":"godie-a001","bye":false,"kills":2,"deaths":0,"assists":1}],
  "teams": [{"teamId":0,"seatIds":[0,1,2],"memberScores":[10,8,6],"total":24}]
}`)
}

// ---------------------------------------------------------------------------
// THE VERSION STAMP. Without it the whole feature is a pile of anonymous rows.
// ---------------------------------------------------------------------------

func TestEveryStoredRecordCarriesTheFourVersionStamps(t *testing.T) {
	contentDir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(contentDir, "manifest.json"),
		[]byte(`{"contentVersion":"content-42"}`), 0o600))

	svc, store, _ := newSvc(t, matchstats.Options{
		PlatformVersion: "v0.9.13", ContentDir: contentDir,
		Now: func() time.Time { return time.Date(2026, 7, 30, 9, 0, 0, 0, time.UTC) },
	})
	ended := time.Date(2026, 7, 30, 8, 55, 0, 0, time.UTC)
	clean, dropped, err := matchstats.Sanitize("m_0001", ledger("m_0001"))
	require.NoError(t, err)
	require.Empty(t, dropped)

	rec, err := svc.Put(matchstats.Ingest{
		MatchID: "m_0001", GameVersion: "game-7", EndedAt: ended, Ledger: clean,
	})
	require.NoError(t, err)

	assert.Equal(t, matchstats.RecordVersion, rec.Version.Record)
	assert.Equal(t, "game-7", rec.Version.Game, "the sender's build id must be kept verbatim")
	assert.Equal(t, "v0.9.13", rec.Version.Platform, "the accepting platform stamps its own build")
	assert.Equal(t, "content-42", rec.Version.Content, "contentVersion comes from content/manifest.json")

	// …and it must be ON DISK, not merely on the returned struct. This is the
	// ② check: a value that exists only in the function's return value has not
	// been persisted, and every consumer reads the file.
	var onDisk matchstats.Record
	require.NoError(t, store.Get(matchstats.Collection(ended), "m_0001", &onDisk))
	assert.Equal(t, rec.Version, onDisk.Version)
	assert.Equal(t, matchstats.Schema, onDisk.Schema)
	assert.True(t, onDisk.ReceivedAt.Equal(time.Date(2026, 7, 30, 9, 0, 0, 0, time.UTC)),
		"receivedAt is the platform's clock, distinct from endedAt")
	assert.True(t, onDisk.EndedAt.Equal(ended))
}

func TestAMissingContentManifestLeavesTheStampEmptyRatherThanGuessing(t *testing.T) {
	svc, _, _ := newSvc(t, matchstats.Options{PlatformVersion: "v1", ContentDir: t.TempDir()})
	rec, err := svc.Put(matchstats.Ingest{
		MatchID: "m_1", EndedAt: time.Now(), Ledger: ledger("m_1"),
	})
	require.NoError(t, err)
	assert.Empty(t, rec.Version.Content,
		"an unknown content version must stay empty — a guessed one poisons every later comparison")
}

func TestPutRefusesAZeroEndedAt(t *testing.T) {
	svc, _, _ := newSvc(t, matchstats.Options{})
	_, err := svc.Put(matchstats.Ingest{MatchID: "m_1", Ledger: ledger("m_1")})
	require.Error(t, err,
		"endedAt picks the partition; defaulting it would scatter one match's retries across months")
}

// ---------------------------------------------------------------------------
// PARTITIONING. The review screen joins matches ↔ match-stats by month.
// ---------------------------------------------------------------------------

func TestPartitioningTracksGamelink(t *testing.T) {
	for _, at := range []time.Time{
		time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		time.Date(2026, 7, 30, 23, 59, 59, 0, time.UTC),
		time.Date(2027, 12, 31, 12, 0, 0, 0, time.FixedZone("x", 9*3600)),
	} {
		got := matchstats.Collection(at)
		want := strings.Replace(gamelink.MatchCollection(at), "matches/", matchstats.CollectionPrefix+"/", 1)
		assert.Equal(t, want, got,
			"match-stats must partition exactly like matches — the 後台覆盤 join is by (year, month)")
	}
}

// ---------------------------------------------------------------------------
// ONE BAD ROW MAY NEVER COST THE BATCH — read side.
// ---------------------------------------------------------------------------

func TestListSkipsAnUnreadableRecordInsteadOfBlankingThePage(t *testing.T) {
	svc, store, dir := newSvc(t, matchstats.Options{})
	base := time.Date(2026, 7, 30, 8, 0, 0, 0, time.UTC)
	for i := range 3 {
		id := fmt.Sprintf("m_%04d", i)
		_, err := svc.Put(matchstats.Ingest{
			MatchID: id, EndedAt: base.Add(time.Duration(i) * time.Hour), Ledger: ledger(id),
		})
		require.NoError(t, err)
	}
	// Corrupt exactly one file, the way a half-written disk would.
	p, err := store.Path(matchstats.Collection(base), "m_0001")
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(p, []byte("{ this is not json"), 0o600))
	require.DirExists(t, filepath.Join(dir, matchstats.CollectionPrefix))

	rows, unreadable := svc.List(0)
	assert.Len(t, rows, 2, "the two good records must still be listed")
	assert.Equal(t, 1, unreadable, "and the skipped one must be COUNTED, not swallowed")
	assert.Equal(t, "m_0002", rows[0].MatchID, "newest first")
}

func TestGetFindsARecordAcrossPartitions(t *testing.T) {
	svc, _, _ := newSvc(t, matchstats.Options{})
	june := time.Date(2026, 6, 15, 0, 0, 0, 0, time.UTC)
	july := time.Date(2026, 7, 15, 0, 0, 0, 0, time.UTC)
	_, err := svc.Put(matchstats.Ingest{MatchID: "m_june", EndedAt: june, Ledger: ledger("m_june")})
	require.NoError(t, err)
	_, err = svc.Put(matchstats.Ingest{MatchID: "m_july", EndedAt: july, Ledger: ledger("m_july")})
	require.NoError(t, err)

	got, err := svc.Get("m_june")
	require.NoError(t, err)
	assert.Equal(t, "m_june", got.MatchID)
	_, err = svc.Get("m_nope")
	assert.ErrorIs(t, err, matchstats.ErrNotFound)
}

func TestListIgnoresQuarantinedCopies(t *testing.T) {
	svc, store, _ := newSvc(t, matchstats.Options{})
	ended := time.Date(2026, 7, 30, 8, 0, 0, 0, time.UTC)
	_, err := svc.Put(matchstats.Ingest{MatchID: "m_1", EndedAt: ended, Ledger: ledger("m_1")})
	require.NoError(t, err)
	// A quarantine copy, as the archive import writes it.
	qid := matchstats.QuarantineIDFor("m_1", []byte("whatever"))
	require.True(t, matchstats.IsQuarantineID(qid))
	require.NoError(t, store.Put(matchstats.Collection(ended), qid,
		json.RawMessage(`{"matchId":"m_1"}`)))

	rows, unreadable := svc.List(0)
	assert.Len(t, rows, 1, "a quarantined copy is inert and must never be read as live data")
	assert.Zero(t, unreadable, "…and it is skipped by NAME, so it is not counted as corrupt either")
}

// ---------------------------------------------------------------------------
// THE COPIED TABLE MUST NOT DRIFT (the contentoverlay / opsenv mechanism).
// ---------------------------------------------------------------------------

func TestSectionsMatchTheSharedSnapshot(t *testing.T) {
	path := filepath.Join(repoRoot(t), "packages", "shared", "src", "sim", "stats", "matchLedger.ts")
	raw, err := os.ReadFile(path) // #nosec G304 -- repo source, the authority for this table
	require.NoError(t, err, "%s defines MatchLedgerSnapshot and must be readable", path)
	src := string(raw)

	start := strings.Index(src, "export interface MatchLedgerSnapshot {")
	require.GreaterOrEqual(t, start, 0, "could not find MatchLedgerSnapshot in %s", path)
	end := strings.Index(src[start:], "\n}")
	require.Greater(t, end, 0, "could not find the end of MatchLedgerSnapshot in %s", path)
	block := src[start : start+end]

	re := regexp.MustCompile(`(?m)^\s{2}([A-Za-z][A-Za-z0-9]*)\s*:`)
	var fromTS []string
	for _, m := range re.FindAllStringSubmatch(block, -1) {
		if m[1] == "matchId" {
			continue // the envelope, not a section
		}
		fromTS = append(fromTS, m[1])
	}
	// If the file's shape changes so the regex matches nothing, this must FAIL
	// rather than quietly agree with an empty list.
	require.GreaterOrEqual(t, len(fromTS), 5,
		"parsed only %v out of %s — the file's shape changed, fix this parser", fromTS, path)

	sort.Strings(fromTS)
	fromGo := append([]string(nil), matchstats.Sections...)
	sort.Strings(fromGo)
	assert.Equal(t, fromTS, fromGo,
		"Sections in validate.go has drifted from MatchLedgerSnapshot in %s — "+
			"a section Go does not know is a section every consumer reads back as EMPTY", path)
}

func TestSegmentRuleMatchesJsonstore(t *testing.T) {
	// The partition enumerator copies jsonstore's segment regex. Copying is
	// fine; copying and then WIDENING is how a directory jsonstore refuses
	// becomes a collection name. Compare the two source literals.
	store := filepath.Join(repoRoot(t), "apps", "platform", "internal", "data", "jsonstore", "jsonstore.go")
	mine := filepath.Join(repoRoot(t), "apps", "platform", "internal", "matchstats", "matchstats.go")
	want := findRegexpLiteral(t, store, "segmentRe")
	got := findRegexpLiteral(t, mine, "segmentRe")
	assert.Equal(t, want, got,
		"matchstats' segmentRe no longer matches jsonstore's — this package must never accept "+
			"a path segment the store itself would refuse")
}

func findRegexpLiteral(t *testing.T, path, name string) string {
	t.Helper()
	raw, err := os.ReadFile(path) // #nosec G304 -- repo source
	require.NoError(t, err)
	re := regexp.MustCompile(name + "\\s*=\\s*regexp\\.MustCompile\\(`([^`]*)`\\)")
	m := re.FindStringSubmatch(string(raw))
	require.Len(t, m, 2, "could not find %s in %s", name, path)
	return m[1]
}
