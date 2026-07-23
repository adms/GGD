package opstate

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/ggd/platform/internal/combatenv"
	"github.com/ggd/platform/internal/curation"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/opsenv"
)

// ---- fixtures --------------------------------------------------------------

// writeWhitelist stores a curation doc directly into a DATA_DIR.
func writeWhitelist(t *testing.T, dataDir string, champs, items, abilities []string, updatedAt time.Time) {
	t.Helper()
	store, err := jsonstore.New(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	doc := curation.Doc{
		Version:   curation.SchemaVersion,
		UpdatedAt: updatedAt,
		Champions: champs, Items: items, Abilities: abilities,
	}
	if err := store.Put(curation.Collection, curation.DocID, doc); err != nil {
		t.Fatal(err)
	}
}

// writeConfigDoc stores a raw config doc (combat-env / server-ops).
func writeConfigDoc(t *testing.T, dataDir, docID string, body map[string]any) {
	t.Helper()
	store, err := jsonstore.New(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Put(ConfigCollection, docID, body); err != nil {
		t.Fatal(err)
	}
}

// contentTree writes a minimal content/ tree with the given ids so the catalog
// can verify against it. manifestVersion stamps manifest.json.
func contentTree(t *testing.T, champs, items, abilities []string, manifestVersion string) string {
	t.Helper()
	dir := t.TempDir()
	for sub, ids := range map[string][]string{
		"champions": champs, "items": items, "abilities": abilities,
	} {
		if err := os.MkdirAll(filepath.Join(dir, sub), 0o755); err != nil {
			t.Fatal(err)
		}
		for _, id := range ids {
			if err := os.WriteFile(filepath.Join(dir, sub, id+".json"), []byte(`{"id":"`+id+`"}`), 0o644); err != nil {
				t.Fatal(err)
			}
		}
	}
	man, _ := json.Marshal(map[string]any{"contentVersion": manifestVersion})
	if err := os.WriteFile(filepath.Join(dir, "manifest.json"), man, 0o644); err != nil {
		t.Fatal(err)
	}
	return dir
}

func readWhitelist(t *testing.T, dataDir string) curation.Doc {
	t.Helper()
	store, err := jsonstore.New(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	doc, _, err := curation.NewRepo(store, nil).Load()
	if err != nil {
		t.Fatal(err)
	}
	return doc
}

func configExists(t *testing.T, dataDir, docID string) bool {
	t.Helper()
	store, err := jsonstore.New(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	ok, err := store.Exists(ConfigCollection, docID)
	if err != nil {
		t.Fatal(err)
	}
	return ok
}

var fixedNow = func() time.Time { return time.Date(2026, 7, 23, 12, 0, 0, 0, time.UTC) }

// ---- 1. round-trip fidelity: whitelist ------------------------------------

func TestRoundTripWhitelist(t *testing.T) {
	src := t.TempDir()
	champs := []string{"godie-e001", "godie-e002", "godie-e007"}
	items := []string{"godie-i002", "godie-i003"}
	abilities := []string{"godie-e001.q", "godie-e001.w", "godie-e001.ex"}
	writeWhitelist(t, src, champs, items, abilities, fixedNow())

	content := contentTree(t, champs, items, abilities, "cv_test")

	bundle, _, err := Export(ExportOptions{DataDir: src, ContentDir: content, Now: fixedNow})
	if err != nil {
		t.Fatalf("export: %v", err)
	}

	dst := t.TempDir()
	rep, err := Restore(bundle, RestoreOptions{DataDir: dst, ContentDir: content})
	if err != nil {
		t.Fatalf("restore: %v", err)
	}
	if !rep.Changed {
		t.Fatal("expected the restore to change the target")
	}
	got := readWhitelist(t, dst)
	if len(got.Champions) != 3 || len(got.Items) != 2 || len(got.Abilities) != 3 {
		t.Fatalf("restored whitelist wrong: %+v", got)
	}
	for i, id := range champs {
		if got.Champions[i] != id {
			t.Fatalf("champion %d: want %s got %s", i, id, got.Champions[i])
		}
	}
}

// ---- 2. combat-env: unconfigured stays unconfigured -----------------------

func TestCombatEnvUnconfiguredRoundTrip(t *testing.T) {
	src := t.TempDir()
	writeWhitelist(t, src, []string{"godie-e001"}, nil, nil, fixedNow())
	// NO data/config/combat-env.json written — this is the "never configured"
	// state. content dir absent so no id verification interferes.

	bundle, rep, err := Export(ExportOptions{DataDir: src, Now: fixedNow})
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	if bundle.CombatEnv == nil || bundle.CombatEnv.Configured {
		t.Fatalf("combat-env should export as unconfigured, got %+v", bundle.CombatEnv)
	}
	if bundle.CombatEnv.Doc != nil {
		t.Fatal("an unconfigured part must carry no document (the structural invariant)")
	}
	foundNote := false
	for _, n := range rep.Notes {
		if contains(n, "NEVER CONFIGURED") {
			foundNote = true
		}
	}
	if !foundNote {
		t.Fatalf("export report should say combat-env is unconfigured; notes=%v", rep.Notes)
	}

	dst := t.TempDir()
	rrep, err := Restore(bundle, RestoreOptions{DataDir: dst})
	if err != nil {
		t.Fatalf("restore: %v", err)
	}
	if configExists(t, dst, CombatEnvDoc) {
		t.Fatal("restore of an unconfigured combat-env MUST NOT create data/config/combat-env.json — that would mask future content re-tunes")
	}
	// The public endpoint semantics: GetStored reports not-stored, so the
	// game-server receives multipliers:{} and content tuning survives.
	assertConfigActionSkipped(t, rrep, PartCombatEnv)
}

// ---- 3. combat-env: configured-to-neutral is preserved AS configured -------

func TestCombatEnvConfiguredNeutralIsDistinct(t *testing.T) {
	src := t.TempDir()
	writeWhitelist(t, src, []string{"godie-e001"}, nil, nil, fixedNow())
	// He DELIBERATELY set everything to 1.0 — a stored doc, all-neutral. This
	// must survive as "configured", NOT collapse into "never configured".
	neutral := map[string]any{
		"version":   1,
		"updatedAt": fixedNow().Format(time.RFC3339Nano),
		"multipliers": map[string]float64{
			"cooldown": 1.0, "damageDealt": 1.0, "maxHealth": 1.0,
		},
	}
	writeConfigDoc(t, src, CombatEnvDoc, neutral)

	bundle, _, err := Export(ExportOptions{DataDir: src, Now: fixedNow})
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	if bundle.CombatEnv == nil || !bundle.CombatEnv.Configured {
		t.Fatal("a stored all-neutral table must export as CONFIGURED")
	}

	dst := t.TempDir()
	if _, err := Restore(bundle, RestoreOptions{DataDir: dst}); err != nil {
		t.Fatalf("restore: %v", err)
	}
	if !configExists(t, dst, CombatEnvDoc) {
		t.Fatal("a configured (even all-neutral) combat-env MUST be written on restore")
	}
	// And crucially, the platform now reports it as stored=true.
	store, _ := jsonstore.New(dst)
	svc := combatenv.New(store, nil, "")
	_, stored, err := svc.GetStored()
	if err != nil {
		t.Fatal(err)
	}
	if !stored {
		t.Fatal("after restoring a configured table the platform must report stored=true (configured != never-configured)")
	}
}

// ---- 4. dead ids are reported by name -------------------------------------

func TestDeadIDsReported(t *testing.T) {
	src := t.TempDir()
	// Bundle references godie-e001 (live) + godie-DEAD (gone from content).
	writeWhitelist(t, src, []string{"godie-e001", "godie-dead"}, []string{"i-live", "i-dead"}, nil, fixedNow())
	srcContent := contentTree(t, []string{"godie-e001", "godie-dead"}, []string{"i-live", "i-dead"}, nil, "cv_old")
	bundle, _, err := Export(ExportOptions{DataDir: src, ContentDir: srcContent, Now: fixedNow})
	if err != nil {
		t.Fatalf("export: %v", err)
	}

	// Target content tree no longer has godie-dead / i-dead.
	dstContent := contentTree(t, []string{"godie-e001"}, []string{"i-live"}, nil, "cv_new")
	dst := t.TempDir()
	rep, err := Restore(bundle, RestoreOptions{DataDir: dst, ContentDir: dstContent})
	if err != nil {
		t.Fatalf("restore: %v", err)
	}
	if rep.Dead.Total() != 2 {
		t.Fatalf("expected 2 dead ids, got %d (%+v)", rep.Dead.Total(), rep.Dead)
	}
	if !containsID(rep.Dead.Champions, "godie-dead") || !containsID(rep.Dead.Items, "i-dead") {
		t.Fatalf("dead ids not named: %+v", rep.Dead)
	}
	// The dead ids must NOT have been enabled on the target.
	got := readWhitelist(t, dst)
	if containsID(got.Champions, "godie-dead") {
		t.Fatal("a dead champion id must not be written into the target whitelist")
	}
	if len(got.Champions) != 1 {
		t.Fatalf("only the live champion should be enabled, got %v", got.Champions)
	}

	// -strict turns the same drop into a hard error.
	dst2 := t.TempDir()
	_, err = Restore(bundle, RestoreOptions{DataDir: dst2, ContentDir: dstContent, Strict: true})
	if err == nil {
		t.Fatal("expected -strict to fail on dead ids")
	}
}

// ---- 5. idempotency --------------------------------------------------------

func TestRestoreIdempotent(t *testing.T) {
	src := t.TempDir()
	writeWhitelist(t, src, []string{"godie-e001", "godie-e002"}, []string{"i1"}, nil, fixedNow())
	content := contentTree(t, []string{"godie-e001", "godie-e002"}, []string{"i1"}, nil, "cv")
	bundle, _, err := Export(ExportOptions{DataDir: src, ContentDir: content, Now: fixedNow})
	if err != nil {
		t.Fatal(err)
	}
	dst := t.TempDir()
	r1, err := Restore(bundle, RestoreOptions{DataDir: dst, ContentDir: content})
	if err != nil {
		t.Fatal(err)
	}
	if !r1.Changed {
		t.Fatal("first restore should change")
	}
	r2, err := Restore(bundle, RestoreOptions{DataDir: dst, ContentDir: content})
	if err != nil {
		t.Fatal(err)
	}
	if r2.Changed {
		t.Fatal("second restore of the same bundle must be a no-op (idempotent)")
	}
	if !actionHasResult(r2, PartCuration, ResultUnchanged) {
		t.Fatalf("expected curation=unchanged on the second restore, got %+v", r2.Actions)
	}
}

// idempotency must ignore a rewritten updatedAt: same content, newer stamp.
func TestRestoreIdempotentIgnoresTimestamp(t *testing.T) {
	src := t.TempDir()
	writeWhitelist(t, src, []string{"godie-e001"}, nil, nil, fixedNow())
	bundle, _, err := Export(ExportOptions{DataDir: src, Now: fixedNow})
	if err != nil {
		t.Fatal(err)
	}
	dst := t.TempDir()
	// Target already enables the same content, but with a DIFFERENT updatedAt.
	writeWhitelist(t, dst, []string{"godie-e001"}, nil, nil, fixedNow().Add(-time.Hour))
	rep, err := Restore(bundle, RestoreOptions{DataDir: dst})
	if err != nil {
		t.Fatal(err)
	}
	if rep.Changed {
		t.Fatal("same content with a different timestamp must be unchanged, not rewritten")
	}
}

// ---- 6. newer host state is protected -------------------------------------

func TestRestoreDoesNotClobberNewerWhitelist(t *testing.T) {
	// Bundle exported at T. Host curated at T+1h. A re-run must REFUSE.
	src := t.TempDir()
	writeWhitelist(t, src, []string{"godie-e001"}, nil, nil, fixedNow())
	bundle, _, err := Export(ExportOptions{DataDir: src, Now: fixedNow})
	if err != nil {
		t.Fatal(err)
	}
	dst := t.TempDir()
	writeWhitelist(t, dst, []string{"godie-e001", "godie-e099"}, nil, nil, fixedNow().Add(time.Hour))

	rep, err := Restore(bundle, RestoreOptions{DataDir: dst})
	if err == nil {
		t.Fatal("expected restore to refuse overwriting newer host state")
	}
	if !rep.Blocked {
		t.Fatalf("expected Blocked, got %+v", rep.Actions)
	}
	// The host edit survives untouched.
	got := readWhitelist(t, dst)
	if !containsID(got.Champions, "godie-e099") {
		t.Fatal("the host's newer edit must be preserved when blocked")
	}

	// -force overrides.
	rep2, err := Restore(bundle, RestoreOptions{DataDir: dst, Force: true})
	if err != nil {
		t.Fatalf("forced restore: %v", err)
	}
	if !rep2.Changed {
		t.Fatal("forced restore should write")
	}
	if containsID(readWhitelist(t, dst).Champions, "godie-e099") {
		t.Fatal("-force should have replaced the host whitelist with the bundle's")
	}
}

// A virgin host whose empty whitelist was lazily created with a NOW timestamp
// must NOT be treated as "newer state" — that is the deploy this tool exists
// for, and blocking it would be the cruelest possible bug.
func TestRestoreNotBlockedByLazyEmptyWhitelist(t *testing.T) {
	src := t.TempDir()
	writeWhitelist(t, src, []string{"godie-e001"}, nil, nil, fixedNow())
	bundle, _, err := Export(ExportOptions{DataDir: src, Now: fixedNow})
	if err != nil {
		t.Fatal(err)
	}
	dst := t.TempDir()
	// Empty whitelist, but stamped in the FUTURE (lazy-create on first boot).
	writeWhitelist(t, dst, []string{}, []string{}, []string{}, fixedNow().Add(24*time.Hour))
	rep, err := Restore(bundle, RestoreOptions{DataDir: dst})
	if err != nil {
		t.Fatalf("restore should not be blocked by an empty host whitelist: %v", err)
	}
	if rep.Blocked {
		t.Fatal("an EMPTY host whitelist must never count as newer state to protect")
	}
	if !rep.Changed {
		t.Fatal("the roster should have been restored over the empty host whitelist")
	}
}

// ---- 7. bundle referencing dead ids under strict + checksum ---------------

func TestChecksumDetectsTampering(t *testing.T) {
	src := t.TempDir()
	writeWhitelist(t, src, []string{"godie-e001"}, nil, nil, fixedNow())
	bundle, _, err := Export(ExportOptions{DataDir: src, Now: fixedNow})
	if err != nil {
		t.Fatal(err)
	}
	raw, err := bundle.Marshal()
	if err != nil {
		t.Fatal(err)
	}
	// Flip a champion id in the serialized bytes.
	tampered := []byte(replaceFirst(string(raw), "godie-e001", "godie-x999"))
	b2, err := Parse(tampered)
	if err != nil {
		t.Fatal(err)
	}
	ok, err := b2.VerifyChecksum()
	if ok || err == nil {
		t.Fatal("checksum should reject a tampered bundle")
	}
}

// ---- 8. structural invariant: absence cannot carry a document -------------

func TestValidateRejectsAbsentWithDocument(t *testing.T) {
	b := &Bundle{
		Kind: Kind, BundleVersion: BundleVersion,
		CombatEnv: &ConfigPart{Configured: false, Doc: json.RawMessage(`{"multipliers":{}}`)},
	}
	if err := b.Validate(); err == nil {
		t.Fatal("a part claiming configured=false while carrying a document must be rejected")
	}
}

func TestValidateRejectsNewerBundleVersion(t *testing.T) {
	b := &Bundle{Kind: Kind, BundleVersion: BundleVersion + 1}
	if err := b.Validate(); err == nil {
		t.Fatal("a bundle from a newer format must be refused, not guessed at")
	}
}

// ---- 9. export refuses an empty whitelist unless allowed ------------------

func TestExportRefusesEmptyWhitelist(t *testing.T) {
	src := t.TempDir()
	writeWhitelist(t, src, []string{}, []string{}, []string{}, fixedNow())
	_, _, err := Export(ExportOptions{DataDir: src, Now: fixedNow})
	if err == nil {
		t.Fatal("exporting an empty-roster whitelist should fail without -allow-empty")
	}
	// With allow-empty it succeeds.
	b, _, err := Export(ExportOptions{DataDir: src, Now: fixedNow, AllowEmptyWhitelist: true})
	if err != nil {
		t.Fatalf("allow-empty export: %v", err)
	}
	if b.Curation == nil || len(b.Curation.Doc.Champions) != 0 {
		t.Fatal("allow-empty should still carry the (empty) whitelist")
	}
}

// ---- 10. server-ops round-trips like combat-env ---------------------------

func TestServerOpsConfiguredRoundTrip(t *testing.T) {
	src := t.TempDir()
	writeWhitelist(t, src, []string{"godie-e001"}, nil, nil, fixedNow())
	writeConfigDoc(t, src, ServerOpsDoc, map[string]any{
		"version":   1,
		"updatedAt": fixedNow().Format(time.RFC3339Nano),
		"values":    map[string]float64{"maxRooms": 8},
	})
	bundle, _, err := Export(ExportOptions{DataDir: src, Now: fixedNow, Parts: []string{"all"}})
	if err != nil {
		t.Fatal(err)
	}
	if bundle.ServerOps == nil || !bundle.ServerOps.Configured {
		t.Fatal("server-ops should export configured")
	}
	dst := t.TempDir()
	if _, err := Restore(bundle, RestoreOptions{DataDir: dst}); err != nil {
		t.Fatal(err)
	}
	store, _ := jsonstore.New(dst)
	svc := opsenv.New(store, nil)
	_, stored, err := svc.GetStored()
	if err != nil {
		t.Fatal(err)
	}
	if !stored {
		t.Fatal("restored server-ops should report stored")
	}
}

// ---- helpers ---------------------------------------------------------------

func assertConfigActionSkipped(t *testing.T, rep *RestoreReport, part string) {
	t.Helper()
	for _, a := range rep.Actions {
		if a.Part == part {
			if a.Result != ResultSkipped {
				t.Fatalf("%s should be skipped, got %s", part, a.Result)
			}
			return
		}
	}
	t.Fatalf("no action recorded for %s", part)
}

func actionHasResult(rep *RestoreReport, part, result string) bool {
	for _, a := range rep.Actions {
		if a.Part == part && a.Result == result {
			return true
		}
	}
	return false
}

func containsID(ids []string, id string) bool {
	for _, x := range ids {
		if x == id {
			return true
		}
	}
	return false
}

func contains(haystack, needle string) bool {
	return len(needle) == 0 || (len(haystack) >= len(needle) && indexOf(haystack, needle) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

func replaceFirst(s, old, new string) string {
	i := indexOf(s, old)
	if i < 0 {
		return s
	}
	return s[:i] + new + s[i+len(old):]
}
