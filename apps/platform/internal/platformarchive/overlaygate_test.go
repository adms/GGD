package platformarchive

// overlaygate_test.go — guards for the ZIP import's #283 inspection.
//
// The bypass being covered is real and documented: doc.go carries
// `content-overlay` on purpose and apply.go writes it verbatim, so an archive
// taken off an older host can land documents the write gate would refuse. This
// suite pins BOTH halves of the intended behaviour — the plan names them, and
// the plan still lets the migration through.

import (
	"bytes"
	"context"
	"encoding/json"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/ggd/platform/internal/contentoverlay"
	"github.com/ggd/platform/internal/data/jsonstore"
)

// importInto runs a REAL plan + apply of `a` into a fresh target and hands back
// the target's store. Everything below asserts on what is ON DISK afterwards
// rather than on the return value of the gate — the failure mode being guarded
// is "the poison reached the file", and only the file can prove it did not.
func importInto(t *testing.T, a *Archive) (*jsonstore.Store, *ApplyResult) {
	t.Helper()
	dst := t.TempDir()
	store, err := jsonstore.New(dst)
	if err != nil {
		t.Fatal(err)
	}
	target, err := NewTarget(dst, "")
	if err != nil {
		t.Fatal(err)
	}
	opts := PlanOptions{ResolveCollisions: ResolveAdoptArchive}
	p, err := BuildPlan(a, target, opts)
	if err != nil {
		t.Fatal(err)
	}
	res, err := Apply(context.Background(), a, target, ApplyOptions{
		PlanOptions: opts, ExpectDigest: p.Digest,
	})
	if err != nil {
		t.Fatalf("the migration must SUCCEED even when the overlay carries bad docs: %v", err)
	}
	return store, res
}

// liveOverlayDocs reads the doc map the game would actually load.
func liveOverlayDocs(t *testing.T, store *jsonstore.Store, id string) map[string]json.RawMessage {
	t.Helper()
	var o struct {
		Docs map[string]json.RawMessage `json:"docs"`
	}
	if err := store.Get(contentoverlay.Collection, id, &o); err != nil {
		t.Fatalf("read %s/%s: %v", contentoverlay.Collection, id, err)
	}
	return o.Docs
}

// overlayFixtureWithDocs replaces the fixture's overlay document with one whose
// `docs` map holds exactly these entries, then exports.
func overlayFixtureWithDocs(t *testing.T, docs map[string]any) *Archive {
	t.Helper()
	f := newFixture(t)
	mustPut(t, f.store, contentoverlay.Collection, contentoverlay.DocID, map[string]any{
		"schemaVersion": contentoverlay.SchemaVersion,
		"generation":    4,
		"updatedAt":     time.Date(2026, 7, 26, 14, 3, 11, 0, time.UTC),
		"docs":          docs,
		"deleted":       map[string]bool{},
	})
	return openBytes(t, f.exportBytes(t, "all"))
}

func overlayWarning(t *testing.T, p *Plan) string {
	t.Helper()
	for _, w := range p.Warnings {
		if strings.Contains(w, "#283") {
			return w
		}
	}
	return ""
}

func planFor(t *testing.T, a *Archive) *Plan {
	t.Helper()
	target, err := NewTarget(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	p, err := BuildPlan(a, target, PlanOptions{})
	if err != nil {
		t.Fatal(err)
	}
	return p
}

// A migration carrying overlay docs the #283 gate would refuse is WARNED ABOUT
// BY NAME in the dry run — and is not blocked, because refusing it would mean
// "you cannot move off that host", which is the loss #243 exists to prevent.
func TestImportNamesOverlayDocsTheContentGateWouldRefuse(t *testing.T) {
	a := overlayFixtureWithDocs(t, map[string]any{
		// good — must NOT be named
		"champions/godie-a001": map[string]any{"id": "godie-a001", "schema": "champion@1", "name": "測試英雄"},
		// the collection typo that kills the whole merged tree
		"champion/godie-a002": map[string]any{"id": "godie-a002", "schema": "champion@1"},
		// a doc that calls itself something else
		"champions/godie-a003": map[string]any{"id": "someone-else", "schema": "champion@1"},
		// no schema tag → matches no union branch anywhere
		"items/sword-99": map[string]any{"id": "sword-99"},
		// #277's payload, arriving by ZIP instead of by curl
		"config/base-bonus": map[string]any{
			"id": "base-bonus", "schema": "config.base-bonus@1",
			"bonus": map[string]any{"maxHealth": -9999},
		},
	})
	p := planFor(t, a)

	if p.Blocked {
		t.Fatalf("the import must NOT be blocked by bad overlay content: %v", p.BlockedLines())
	}
	w := overlayWarning(t, p)
	if w == "" {
		t.Fatalf("expected a #283 overlay warning; got warnings=%v", p.Warnings)
	}
	for _, key := range []string{
		"champion/godie-a002",
		"champions/godie-a003",
		"items/sword-99",
		"config/base-bonus",
	} {
		if !strings.Contains(w, key) {
			t.Errorf("the warning must name %q so the operator knows what to clear; got: %s", key, w)
		}
	}
	// the count must be the 4 bad ones, not "everything" — a warning that named
	// the whole overlay would be useless and would also pass a substring check
	if !strings.Contains(w, "4 筆") {
		t.Errorf("expected the warning to count 4 bad docs; got: %s", w)
	}
	if strings.Contains(w, "champions/godie-a001") {
		t.Errorf("the GOOD doc must not be named; got: %s", w)
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// THE GATE ITSELF: what actually lands on the target's disk.
// ═══════════════════════════════════════════════════════════════════════════

// archive-overlay-gate-quarantines: the ZIP import may not write a doc the #283
// gate refuses into the overlay the game LOADS.
//
// This is the guard that closes the bypass. The dry-run warning above is
// advisory — an operator who clicks past it used to end up with poison on the
// new host and NOTHING on screen to say so, because one bad doc makes
// loader.ts discard the entire overlay layer. So the assertion here is on the
// bytes at rest: the bad keys are gone from the live document, and the good
// ones are still there.
func TestImportKeepsRefusedOverlayDocsOutOfTheLiveOverlay(t *testing.T) {
	a := overlayFixtureWithDocs(t, map[string]any{
		"champions/godie-a001": map[string]any{"id": "godie-a001", "schema": "champion@1", "name": "測試英雄"},
		"config/combat-env": map[string]any{
			"id": "combat-env", "schema": "config.combat-env@1",
			"multipliers": map[string]any{"damageDealt": 0.5},
		},
		"champion/godie-a002":  map[string]any{"id": "godie-a002", "schema": "champion@1"},
		"champions/godie-a003": map[string]any{"id": "someone-else", "schema": "champion@1"},
		"items/sword-99":       map[string]any{"id": "sword-99"},
		"config/base-bonus": map[string]any{
			"id": "base-bonus", "schema": "config.base-bonus@1",
			"bonus": map[string]any{"maxHealth": -9999},
		},
	})
	store, res := importInto(t, a)

	live := liveOverlayDocs(t, store, contentoverlay.DocID)
	for _, bad := range []string{
		"champion/godie-a002", "champions/godie-a003", "items/sword-99", "config/base-bonus",
	} {
		if _, present := live[bad]; present {
			t.Errorf("%q passed the ZIP import into the LIVE overlay — one such doc "+
				"discards the whole overlay layer at content-load time", bad)
		}
	}
	// ⚠️ THE OTHER HALF. A gate that wrote an empty overlay would satisfy every
	// assertion above and would be a far worse bug than the one being fixed:
	// the operator's tuning would be silently gone.
	for _, good := range []string{"champions/godie-a001", "config/combat-env"} {
		if _, present := live[good]; !present {
			t.Errorf("%q is legitimate content and MUST survive the migration; live docs = %v",
				good, sortedKeys(live))
		}
	}

	// nothing is destroyed: the archive's original is on disk, complete.
	// The quarantine id is DISCOVERED rather than hardcoded — it is content
	// addressed, and a test that spelled the hash out would be asserting the
	// hash function rather than the guarantee.
	ids, err := store.List(contentoverlay.Collection)
	if err != nil {
		t.Fatal(err)
	}
	quarantined := ""
	for _, id := range ids {
		if strings.HasPrefix(id, contentoverlay.DocID+".rejected-") {
			quarantined = id
		}
	}
	if quarantined == "" {
		t.Fatalf("the archive's original overlay must be kept under a quarantine id; got %v", ids)
	}
	kept := liveOverlayDocs(t, store, quarantined)
	for _, key := range []string{"champion/godie-a002", "champions/godie-a003", "config/base-bonus"} {
		if _, present := kept[key]; !present {
			t.Errorf("the quarantine copy must keep %q verbatim so nothing is lost; got %v",
				key, sortedKeys(kept))
		}
	}

	// and the operator is told, by name, in the apply result
	found := ""
	for _, w := range res.Warnings {
		if strings.Contains(w, "#283") {
			found = w
		}
	}
	if found == "" {
		t.Fatalf("the import result must report the quarantine; warnings=%v", res.Warnings)
	}
	if !strings.Contains(found, "champion/godie-a002") {
		t.Errorf("the report must name what was quarantined; got: %s", found)
	}
}

// archive-overlay-gate-byte-identical: an archive whose overlay is entirely
// clean must be written EXACTLY as it arrived.
//
// Without this the sanitizer would be free to re-serialise every overlay on
// every import, which silently breaks the package's central promise that "the
// dry run is the contract": a byte-identical re-import would stop planning as
// `unchanged`. This is the regression guard for the 99% case.
func TestCleanOverlayIsWrittenByteIdentically(t *testing.T) {
	raw := []byte(`{"schemaVersion":1,"generation":4,"docs":` +
		`{"champions/godie-a001":{"id":"godie-a001","schema":"champion@1"}},"deleted":{}}`)
	clean, refused := sanitizeArchivedOverlay(raw)
	if len(refused) != 0 {
		t.Fatalf("nothing in this overlay is refusable; got %v", refused)
	}
	if !bytes.Equal(raw, clean) {
		t.Errorf("a clean overlay must be passed through untouched\n want %s\n got  %s", raw, clean)
	}
}

// archive-overlay-gate-drops-bases: `bases` is a PARALLEL map keyed by the same
// collection/id. Leaving a base behind for a doc that is no longer in the
// overlay would make the precedence view claim provenance for content that is
// not there.
func TestQuarantineAlsoDropsTheParallelBaseEntry(t *testing.T) {
	raw := []byte(`{"schemaVersion":1,"generation":4,"docs":{` +
		`"champions/godie-a001":{"id":"godie-a001","schema":"champion@1"},` +
		`"champion/godie-a002":{"id":"godie-a002","schema":"champion@1"}},` +
		`"bases":{"champions/godie-a001":{"hash":"h1"},"champion/godie-a002":{"hash":"h2"}},` +
		`"deleted":{}}`)
	clean, refused := sanitizeArchivedOverlay(raw)
	if len(refused) != 1 || refused[0].Key != "champion/godie-a002" {
		t.Fatalf("expected exactly the typo'd collection to be refused; got %v", refused)
	}
	var out struct {
		Docs  map[string]json.RawMessage `json:"docs"`
		Bases map[string]json.RawMessage `json:"bases"`
	}
	if err := json.Unmarshal(clean, &out); err != nil {
		t.Fatalf("the sanitized overlay must still be valid JSON: %v", err)
	}
	if _, present := out.Bases["champion/godie-a002"]; present {
		t.Error("the base for a quarantined doc must go with it")
	}
	if _, present := out.Bases["champions/godie-a001"]; !present {
		t.Error("the surviving doc must keep its base — that is the merge base")
	}
}

// The other half: an archive whose overlay is entirely valid produces NO such
// warning. Without this, the check above would pass for a function that warned
// unconditionally.
func TestImportStaysQuietWhenTheArchivedOverlayIsClean(t *testing.T) {
	a := overlayFixtureWithDocs(t, map[string]any{
		"champions/godie-a001": map[string]any{"id": "godie-a001", "schema": "champion@1", "name": "測試英雄"},
		"config/base-bonus": map[string]any{
			"id": "base-bonus", "schema": "config.base-bonus@1",
			"bonus": map[string]any{"maxHealth": 300},
		},
	})
	p := planFor(t, a)
	if w := overlayWarning(t, p); w != "" {
		t.Fatalf("a clean overlay must produce no #283 warning; got: %s", w)
	}
}

// sortedKeys renders a doc map for a failure message, deterministically.
func sortedKeys(m map[string]json.RawMessage) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
