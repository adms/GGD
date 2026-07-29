package platformarchive

import (
	"bytes"
	"encoding/json"
	"fmt"
	"reflect"
	"testing"
	"time"

	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/matchstats"
)

// ============================================================================
// #207 — the match-stats records must survive a MOVE, version stamp and all,
// and one bad record may never cost the batch.
//
// These tests exercise the real Export → Open → Apply path against a real
// temp-dir data tree. Nothing here reads, copies or contacts the live deploy
// (fixture_test.go's standing rule).
// ============================================================================

const statsMonth = "2026/07"

func statsEndedAt() time.Time { return time.Date(2026, 7, 26, 14, 3, 11, 0, time.UTC) }

func statsCollection() string { return matchstats.CollectionPrefix + "/" + statsMonth }

// statsRecord builds a stored record the way matchstats.Service.Put does, with
// a full four-field version stamp.
func statsRecord(matchID string, ledger json.RawMessage) matchstats.Record {
	return matchstats.Record{
		Schema:  matchstats.Schema,
		MatchID: matchID,
		Version: matchstats.Versions{
			Record: matchstats.RecordVersion, Game: "game-7",
			Platform: "v0.9.13", Content: "content-42",
		},
		EndedAt:    statsEndedAt(),
		ReceivedAt: statsEndedAt().Add(time.Minute),
		Ledger:     ledger,
	}
}

func statsLedger(matchID string) json.RawMessage {
	return json.RawMessage(`{"matchId":"` + matchID + `",` +
		`"picks":[{"seatId":0,"teamId":0,"zone":0,"championId":"godie-a001","source":"manual","selectOpenTick":0,"lockTick":90}],` +
		`"casts":[{"castId":0,"seatId":0,"round":1,"tick":120,"abilityId":"godie-a001-01","damageToHeroes":410}],` +
		`"rounds":[{"round":1,"seatId":0,"teamId":0,"kills":2,"deaths":0}],` +
		`"teams":[{"teamId":0,"seatIds":[0,1,2],"memberScores":[10,8,6],"total":24}]}`)
}

// importArchiveBytes opens an exported archive and runs the REAL plan + apply
// into a fresh, EMPTY target — the primary #243 migration scenario. It reuses
// overlaygate_test.go's importInto so both gates are exercised through one
// sequence, which is also the sequence the console runs.
func importArchiveBytes(t *testing.T, raw []byte) (*jsonstore.Store, *ApplyResult) {
	t.Helper()
	a, err := OpenReaderAt(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		t.Fatalf("open archive: %v", err)
	}
	defer func() { _ = a.Close() }()
	return importInto(t, a)
}

// ---------------------------------------------------------------------------
// ROUND TRIP — the completion criterion: export → import → equivalent, INCLUDING
// the version stamp.
// ---------------------------------------------------------------------------

func TestMatchStatsRoundTripPreservesTheVersionStamp(t *testing.T) {
	f := newFixture(t)
	want := map[string]matchstats.Record{}
	for i := range 3 {
		id := fmt.Sprintf("m_%04d", i)
		rec := statsRecord(id, statsLedger(id))
		mustPut(t, f.store, statsCollection(), id, rec)
		want[id] = rec
	}

	store, _ := importArchiveBytes(t, f.exportBytes(t, "all"))

	for id, src := range want {
		var got matchstats.Record
		if err := store.Get(statsCollection(), id, &got); err != nil {
			t.Fatalf("%s did not survive the move: %v", id, err)
		}
		if got.Version != src.Version {
			t.Errorf("%s version stamp changed: %+v → %+v\n"+
				"the stamp is the reason this data is kept at all — a record that arrives on the "+
				"new host without its build identity cannot be compared against anything",
				id, src.Version, got.Version)
		}
		if got.Schema != src.Schema || !got.EndedAt.Equal(src.EndedAt) || !got.ReceivedAt.Equal(src.ReceivedAt) {
			t.Errorf("%s envelope changed: %+v", id, got)
		}
		// MEANING, not bytes: import re-indents through jsonstore.Put, so the
		// comparison is canonical (doc.go's rule).
		if !sameJSON(t, src.Ledger, got.Ledger) {
			t.Errorf("%s ledger changed across the move:\n src=%s\n got=%s", id, src.Ledger, got.Ledger)
		}
	}
}

func TestMatchStatsAreCarriedByTheMatchesGroup(t *testing.T) {
	f := newFixture(t)
	mustPut(t, f.store, statsCollection(), "m_0001", statsRecord("m_0001", statsLedger("m_0001")))

	// core only — the ledgers must NOT be in it…
	coreOnly := f.exportBytes(t)
	if hasCollection(t, coreOnly, statsCollection()) {
		t.Error("match-stats travelled in a core-only export; it belongs to the opt-in matches group")
	}
	// …and WITH the matches group they must be.
	withMatches := f.exportBytes(t, GroupMatches)
	if !hasCollection(t, withMatches, statsCollection()) {
		t.Error("match-stats did not travel with 對戰紀錄 — an operator who takes the match records " +
			"and not the ledgers lands on a host whose review screen is empty for every match it lists")
	}
}

// ---------------------------------------------------------------------------
// ONE BAD RECORD MAY NEVER COST THE BATCH (the v0.9.13 overlay lesson).
// ---------------------------------------------------------------------------

func TestOneBadStatsRecordDoesNotCostTheBatch(t *testing.T) {
	f := newFixture(t)
	for i := range 4 {
		id := fmt.Sprintf("m_%04d", i)
		mustPut(t, f.store, statsCollection(), id, statsRecord(id, statsLedger(id)))
	}
	// m_0002 claims to be a DIFFERENT match: filed under one id, calling itself
	// another. Left alone it would attribute this match's play to m_9999.
	bad := statsRecord("m_9999", statsLedger("m_9999"))
	mustPut(t, f.store, statsCollection(), "m_0002", bad)

	store, res := importArchiveBytes(t, f.exportBytes(t, "all"))

	for _, id := range []string{"m_0000", "m_0001", "m_0003"} {
		var got matchstats.Record
		if err := store.Get(statsCollection(), id, &got); err != nil {
			t.Fatalf("%s must still be imported: %v", id, err)
		}
		if got.MatchID != id {
			t.Fatalf("%s decoded as %q", id, got.MatchID)
		}
	}
	// The bad one must NOT be live…
	var live matchstats.Record
	if err := store.Get(statsCollection(), "m_0002", &live); err == nil {
		t.Errorf("the mislabelled record went live as m_0002 (it calls itself %q)", live.MatchID)
	}
	// …but it must be ON DISK, verbatim, under a quarantine id.
	ids, err := store.Scan(statsCollection())
	if err != nil {
		t.Fatal(err)
	}
	quarantined := ""
	for _, id := range ids {
		if matchstats.IsQuarantineID(id) {
			quarantined = id
		}
	}
	if quarantined == "" {
		t.Fatalf("nothing was quarantined; ids on target = %v — the bad record's bytes were LOST", ids)
	}
	var kept matchstats.Record
	if err := store.Get(statsCollection(), quarantined, &kept); err != nil {
		t.Fatal(err)
	}
	if kept.MatchID != "m_9999" || kept.Version != bad.Version {
		t.Errorf("the quarantined copy is not verbatim: %+v", kept)
	}
	if len(res.Warnings) == 0 {
		t.Error("the operator was never told a record was quarantined")
	}
}

func TestABadLedgerElementIsTrimmedAndTheRecordStillLands(t *testing.T) {
	f := newFixture(t)
	// One cast with no abilityId — unattributable to a skill — among two good ones.
	ledger := json.RawMessage(`{"matchId":"m_0001",` +
		`"casts":[{"castId":0,"seatId":0,"abilityId":"a"},{"castId":1,"seatId":0},{"castId":2,"seatId":0,"abilityId":"c"}]}`)
	mustPut(t, f.store, statsCollection(), "m_0001", statsRecord("m_0001", ledger))

	store, res := importArchiveBytes(t, f.exportBytes(t, "all"))

	var got matchstats.Record
	if err := store.Get(statsCollection(), "m_0001", &got); err != nil {
		t.Fatalf("the record must still land: %v", err)
	}
	var body struct {
		Casts []map[string]any `json:"casts"`
	}
	if err := json.Unmarshal(got.Ledger, &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Casts) != 2 {
		t.Fatalf("casts = %d, want 2 (the unattributable one removed)", len(body.Casts))
	}
	if len(got.Dropped) != 1 || got.Dropped[0].Path != "casts[1]" {
		t.Errorf("the loss must be recorded ON the record so the console can flag it: %+v", got.Dropped)
	}
	if got.Version.Platform != "v0.9.13" {
		t.Errorf("trimming a record must not disturb its version stamp: %+v", got.Version)
	}
	if len(res.Warnings) == 0 {
		t.Error("the operator was never told elements were removed")
	}
}

// ---------------------------------------------------------------------------
// BYTE STABILITY — without it this gate is a migration regression.
// ---------------------------------------------------------------------------

func TestCleanStatsRecordIsWrittenByteIdentically(t *testing.T) {
	raw, err := json.Marshal(statsRecord("m_0001", statsLedger("m_0001")))
	if err != nil {
		t.Fatal(err)
	}
	clean, dropped, ok := sanitizeArchivedStats("m_0001", raw)
	if !ok {
		t.Fatal("a clean record must pass")
	}
	if len(dropped) != 0 {
		t.Fatalf("nothing should be dropped, got %+v", dropped)
	}
	if !bytes.Equal(raw, clean) {
		t.Error("a clean record must be written byte for byte — otherwise every no-op re-import " +
			"is planned as a rewrite and the dry run stops being a contract")
	}
}

func TestQuarantineCopiesAreNotReJudgedOnTheNextHop(t *testing.T) {
	// A record that was already quarantined on the previous host must be moved
	// verbatim, not quarantined again (which would grow a new id per hop).
	e := Entry{Collection: statsCollection(), ID: matchstats.QuarantineIDFor("m_0001", []byte("x"))}
	if isMatchStatsEntry(e) {
		t.Error("a *.rejected-* copy must be moved verbatim, never re-judged")
	}
	live := Entry{Collection: statsCollection(), ID: "m_0001"}
	if !isMatchStatsEntry(live) {
		t.Error("a live record must go through the gate")
	}
}

// ---------------------------------------------------------------------------
// THE DERIVED CAP. matchstats cannot import this package, so the cross-check
// lives here — the one place that can see both constants.
// ---------------------------------------------------------------------------

func TestRecordCapFitsTheArchive(t *testing.T) {
	if matchstats.MaxRecordBytes > MaxDocEntryBytes {
		t.Fatalf("matchstats.MaxRecordBytes (%d) exceeds MaxDocEntryBytes (%d) — "+
			"the platform would accept records the migration archive cannot carry, and the "+
			"operator would find out at移機 time",
			matchstats.MaxRecordBytes, MaxDocEntryBytes)
	}
}

func TestTheStatsRuleIsInScopeAndInTheMatchesGroup(t *testing.T) {
	r := RuleFor(statsCollection())
	if r == nil {
		t.Fatal("match-stats/YYYY/MM is not in the scope allowlist — the archive would refuse " +
			"the WHOLE bundle rather than skip it")
	}
	if r.Group != GroupMatches {
		t.Errorf("group = %q, want %q", r.Group, GroupMatches)
	}
	if r.Kind != KindDoc || r.Policy != PolicyAdditive {
		t.Errorf("kind/policy = %v/%v", r.Kind, r.Policy)
	}
	// It must NOT be swallowed by the `matches/YYYY/MM` rule, and vice versa.
	if RuleFor("matches/2026/07").Name == r.Name {
		t.Error("match-stats and matches resolved to the same rule")
	}
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

func sameJSON(t *testing.T, a, b []byte) bool {
	t.Helper()
	var x, y any
	if err := json.Unmarshal(a, &x); err != nil {
		t.Fatalf("decode a: %v", err)
	}
	if err := json.Unmarshal(b, &y); err != nil {
		t.Fatalf("decode b: %v", err)
	}
	return reflect.DeepEqual(x, y)
}

func hasCollection(t *testing.T, raw []byte, col string) bool {
	t.Helper()
	a, err := OpenReaderAt(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		t.Fatalf("open archive: %v", err)
	}
	defer func() { _ = a.Close() }()
	_, ok := a.ByCollection[col]
	return ok
}
