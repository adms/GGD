package curation_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/curation"
	"github.com/ggd/platform/internal/httpx"
	"github.com/ggd/platform/pkg/testkit"
)

// errCode digs the httpx error code out of a returned error.
func errCode(t *testing.T, err error) string {
	t.Helper()
	require.Error(t, err)
	e, ok := err.(*httpx.E)
	require.True(t, ok, "expected *httpx.E, got %T: %v", err, err)
	return e.Code
}

func errStatus(t *testing.T, err error) int {
	t.Helper()
	e, ok := err.(*httpx.E)
	require.True(t, ok, "expected *httpx.E, got %T: %v", err, err)
	return e.Status
}

// seed puts a whitelist straight onto the service through the shipped Replace
// path, so the "before" state is a document the real API could have produced.
func seed(t *testing.T, svc *curation.Service, champs, items, abilities []string) {
	t.Helper()
	_, err := svc.Replace(context.Background(), curation.Doc{
		Champions: champs, Items: items, Abilities: abilities,
	})
	require.NoError(t, err)
}

// whitelist-reset-equals-starter — THE BEHAVIOUR GUARD.
//
// It asserts the whitelist ID-FOR-ID equals the starter bundle afterwards, not
// that some function was called (failure form ⑥) and not that the counts happen
// to line up (failure form ⑦). Deleting the assignment in Reset, or scoping it
// to the wrong kind, has to make this red.
func TestResetMakesWhitelistEqualStarter(t *testing.T) {
	testkit.Cover(t, "whitelist-reset-equals-starter")
	svc, _, _ := newSvc(t)
	ctx := context.Background()
	starter := curation.StarterSet()

	// A live whitelist that is the starter PLUS three extras of each kind — the
	// shape of the real ggd.adms.ai document (63/104/315 vs 53/70/265).
	seed(t,
		svc,
		append(append([]string{}, starter.Champions...), "extra-champ-a", "extra-champ-b"),
		append(append([]string{}, starter.Items...), "extra-item-a"),
		append(append([]string{}, starter.Abilities...), "extra-champ-a.q"),
	)

	res, err := svc.Reset(ctx, curation.ResetRequest{
		Scopes: []string{curation.KindChampions, curation.KindItems, curation.KindAbilities},
		Expect: map[string]int{"champions": 2, "items": 1, "abilities": 1},
	})
	require.NoError(t, err)

	got, err := svc.Get(ctx)
	require.NoError(t, err)
	assert.Equal(t, starter.Champions, got.Champions, "champions must equal the starter bundle id-for-id")
	assert.Equal(t, starter.Items, got.Items, "items must equal the starter bundle id-for-id")
	assert.Equal(t, starter.Abilities, got.Abilities, "abilities must equal the starter bundle id-for-id")

	// And the plan named the ids, not just counts.
	assert.Equal(t, []string{"extra-champ-a", "extra-champ-b"}, res.Disable["champions"])
	assert.Equal(t, []string{"extra-item-a"}, res.Disable["items"])
	assert.Empty(t, res.Enable["champions"])
	assert.NotEmpty(t, res.SnapshotID, "a real run must leave an undo point")
}

// whitelist-reset-scope — only the SELECTED kinds move. Ticking 英雄 must not
// touch a single item or ability id, which is the whole reason the owner's
// default selection is safe to press.
func TestResetScopeLeavesOtherKindsUntouched(t *testing.T) {
	testkit.Cover(t, "whitelist-reset-scope")
	svc, _, _ := newSvc(t)
	ctx := context.Background()
	starter := curation.StarterSet()

	items := append(append([]string{}, starter.Items...), "extra-item-a", "extra-item-b")
	abilities := append(append([]string{}, starter.Abilities...), "extra-champ-a.ex")
	seed(t, svc, append(append([]string{}, starter.Champions...), "extra-champ-a"), items, abilities)

	before, err := svc.Get(ctx)
	require.NoError(t, err)

	_, err = svc.Reset(ctx, curation.ResetRequest{
		Scopes: []string{curation.KindChampions},
		Expect: map[string]int{"champions": 1},
	})
	require.NoError(t, err)

	after, err := svc.Get(ctx)
	require.NoError(t, err)
	assert.Equal(t, starter.Champions, after.Champions)
	assert.Equal(t, before.Items, after.Items, "items must not move when only 英雄 is scoped")
	assert.Equal(t, before.Abilities, after.Abilities, "abilities must not move when only 英雄 is scoped")
}

// whitelist-reset-refuses-empty-starter — GUARD ①.
//
// The seam exists only so this can be exercised: StarterSet() is a compiled-in
// constant, so without SetStarter the ONLY way to "test" this guard would be to
// grep the source for the if-statement (failure form ⑥).
func TestResetRefusesEmptyStarter(t *testing.T) {
	testkit.Cover(t, "whitelist-reset-refuses-empty-starter")
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	seed(t, svc, []string{"godie-e001", "godie-e002"}, []string{"godie-i000"}, []string{"godie-e001.ex"})
	before, err := svc.Get(ctx)
	require.NoError(t, err)

	svc.SetStarter(func() curation.Doc {
		return curation.Doc{Version: 1, Champions: []string{}, Items: []string{}, Abilities: []string{}}
	})

	_, err = svc.Reset(ctx, curation.ResetRequest{
		Scopes: []string{curation.KindChampions},
		Expect: map[string]int{"champions": 2},
	})
	assert.Equal(t, "starter_empty", errCode(t, err))
	assert.Equal(t, http.StatusInternalServerError, errStatus(t, err))

	// AND NOTHING WAS WRITTEN. A guard that returns an error after clobbering
	// the document is not a guard.
	after, err := svc.Get(ctx)
	require.NoError(t, err)
	assert.Equal(t, before.Champions, after.Champions)
	assert.Equal(t, before.Items, after.Items)
	assert.Equal(t, before.Abilities, after.Abilities)

	// The dry run is refused identically — the console must not be able to
	// preview a plan the server would never execute.
	_, err = svc.Reset(ctx, curation.ResetRequest{Scopes: []string{curation.KindChampions}, DryRun: true})
	assert.Equal(t, "starter_empty", errCode(t, err))
}

// whitelist-reset-refuses-emptying — GUARDS ② and ③.
//
// Two DIFFERENT ways the result can be an empty list, both refused:
//
//	② a starter list that is non-empty but normalizes to nothing (blank ids) —
//	   this is why ① checks the raw list and ② checks the RESULT;
//	③ a scope selection that leaves the document at zero champions.
func TestResetRefusesEmptyingAKind(t *testing.T) {
	testkit.Cover(t, "whitelist-reset-refuses-emptying")
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	seed(t, svc, []string{"godie-e001", "godie-e002"}, []string{"godie-i000"}, []string{"godie-e001.ex"})

	// ② blank-but-present starter entries: passes ①'s length check, normalizes
	// to nothing. Scoped to ITEMS so champions stay populated and guard ③
	// cannot be what catches it — this has to be ② or nothing.
	svc.SetStarter(func() curation.Doc {
		return curation.Doc{Version: 1,
			Champions: []string{"godie-e001"}, Items: []string{"  ", ""}, Abilities: []string{"x.ex"}}
	})
	_, err := svc.Reset(ctx, curation.ResetRequest{
		Scopes: []string{curation.KindItems},
		Expect: map[string]int{"items": 1},
	})
	assert.Equal(t, "would_empty_whitelist", errCode(t, err))
	assert.Equal(t, http.StatusConflict, errStatus(t, err))

	after, err := svc.Get(ctx)
	require.NoError(t, err)
	assert.Equal(t, []string{"godie-i000"}, after.Items, "nothing written")
	assert.Equal(t, []string{"godie-e001", "godie-e002"}, after.Champions)

	// ③ a fresh install (zero champions) resetting only items would WRITE a
	// zero-champion whitelist. Refused: champ-select would be empty and nothing
	// downstream reports it.
	svc2, _, _ := newSvc(t)
	seed(t, svc2, []string{}, []string{"stale-item"}, []string{})
	_, err = svc2.Reset(ctx, curation.ResetRequest{
		Scopes: []string{curation.KindItems},
		Expect: map[string]int{"items": 1},
	})
	assert.Equal(t, "would_empty_whitelist", errCode(t, err))
}

// whitelist-reset-confirm — the typed confirmation is a SERVER precondition.
// The count the operator confirmed is recomputed under the mutex; if the world
// moved underneath, the write is refused rather than silently doing more.
func TestResetConfirmMismatch(t *testing.T) {
	testkit.Cover(t, "whitelist-reset-confirm")
	svc, _, _ := newSvc(t)
	ctx := context.Background()
	starter := curation.StarterSet()

	seed(t, svc, append(append([]string{}, starter.Champions...), "extra-a", "extra-b", "extra-c"),
		starter.Items, starter.Abilities)

	// The console previewed "3", then someone enabled nothing / disabled one…
	_, err := svc.Reset(ctx, curation.ResetRequest{
		Scopes: []string{curation.KindChampions},
		Expect: map[string]int{"champions": 2},
	})
	assert.Equal(t, "confirm_mismatch", errCode(t, err))
	assert.Equal(t, http.StatusConflict, errStatus(t, err))
	assert.Contains(t, err.Error(), "2")
	assert.Contains(t, err.Error(), "3")

	after, err := svc.Get(ctx)
	require.NoError(t, err)
	assert.Contains(t, after.Champions, "extra-a", "a mismatched confirmation must not write")

	// Missing entirely → 400, not a silent zero.
	_, err = svc.Reset(ctx, curation.ResetRequest{Scopes: []string{curation.KindChampions}})
	assert.Equal(t, "bad_request", errCode(t, err))

	// Correct number → it goes through.
	_, err = svc.Reset(ctx, curation.ResetRequest{
		Scopes: []string{curation.KindChampions},
		Expect: map[string]int{"champions": 3},
	})
	require.NoError(t, err)
}

// whitelist-reset-dryrun — the preview writes NOTHING and takes no snapshot,
// while reporting the same disable list the real run would produce.
func TestResetDryRunWritesNothing(t *testing.T) {
	testkit.Cover(t, "whitelist-reset-dryrun")
	svc, store, _ := newSvc(t)
	ctx := context.Background()
	starter := curation.StarterSet()

	seed(t, svc, append(append([]string{}, starter.Champions...), "extra-a"), starter.Items, starter.Abilities)
	before, err := svc.Get(ctx)
	require.NoError(t, err)

	plan, err := svc.Reset(ctx, curation.ResetRequest{
		Scopes: []string{curation.KindChampions}, DryRun: true,
	})
	require.NoError(t, err)
	assert.True(t, plan.DryRun)
	assert.Equal(t, []string{"extra-a"}, plan.Disable["champions"])
	assert.Empty(t, plan.SnapshotID, "a dry run has nothing to undo")
	assert.Equal(t, len(starter.Champions), plan.After["champions"])
	assert.Equal(t, len(before.Champions), plan.Before["champions"])

	after, err := svc.Get(ctx)
	require.NoError(t, err)
	assert.Equal(t, before.Champions, after.Champions, "dry run must not write")

	ids, err := store.Scan(curation.SnapshotCollection)
	require.NoError(t, err)
	assert.Empty(t, ids, "dry run must not snapshot")
}

// whitelist-reset-undo — the reset is REVERSIBLE: the snapshot holds the
// pre-reset document and restoring it puts every id back.
func TestResetSnapshotRestoresExactly(t *testing.T) {
	testkit.Cover(t, "whitelist-reset-undo")
	svc, _, _ := newSvc(t)
	ctx := context.Background()
	starter := curation.StarterSet()

	seed(t, svc, append(append([]string{}, starter.Champions...), "extra-a", "extra-b"),
		append(append([]string{}, starter.Items...), "extra-item"), starter.Abilities)
	before, err := svc.Get(ctx)
	require.NoError(t, err)

	res, err := svc.Reset(ctx, curation.ResetRequest{
		Scopes: []string{curation.KindChampions, curation.KindItems},
		Expect: map[string]int{"champions": 2, "items": 1},
	})
	require.NoError(t, err)
	require.NotEmpty(t, res.SnapshotID)

	list, err := svc.ListSnapshots()
	require.NoError(t, err)
	require.Len(t, list, 1)
	assert.Equal(t, res.SnapshotID, list[0].ID)
	assert.Equal(t, "reset", list[0].Reason)
	assert.Equal(t, len(before.Champions), list[0].Counts["champions"])

	restored, undoID, err := svc.RestoreSnapshot(ctx, res.SnapshotID, "tester")
	require.NoError(t, err)
	assert.NotEmpty(t, undoID, "the undo must itself be undoable")
	assert.Equal(t, before.Champions, restored.Champions)
	assert.Equal(t, before.Items, restored.Items)
	assert.Equal(t, before.Abilities, restored.Abilities)

	live, err := svc.Get(ctx)
	require.NoError(t, err)
	assert.Equal(t, before.Champions, live.Champions, "restore must hit the durable doc, not just the return value")
}

// whitelist-reset-restore-floor — the undo path cannot become a second way to
// empty champ-select.
func TestRestoreRefusesEmptySnapshot(t *testing.T) {
	testkit.Cover(t, "whitelist-reset-restore-floor")
	svc, _, _ := newSvc(t)
	ctx := context.Background()
	starter := curation.StarterSet()

	// First the happy path, so the refusal below cannot pass by accident (a
	// restore that always fails would satisfy the assertion that follows it).
	seed(t, svc, starter.Champions, starter.Items, starter.Abilities)
	res, err := svc.Reset(ctx, curation.ResetRequest{
		Scopes: []string{curation.KindChampions},
		Expect: map[string]int{"champions": 0},
	})
	require.NoError(t, err)
	// Hand-write an empty snapshot through the same path a stale one would take.
	_, _, err = svc.RestoreSnapshot(ctx, res.SnapshotID, "tester")
	require.NoError(t, err, "restoring a healthy snapshot works")

	// ② a snapshot that would empty a POPULATED kind. Champions stay populated
	// on both sides, so only the per-kind guard can catch this.
	svcKind, storeKind, _ := newSvc(t)
	seed(t, svcKind, starter.Champions, starter.Items, starter.Abilities)
	require.NoError(t, storeKind.Put(curation.SnapshotCollection, "20200101-000000Z", curation.Snapshot{
		ID: "20200101-000000Z", Reason: "forged",
		Whitelist: curation.Doc{Version: 1,
			Champions: starter.Champions, Items: []string{}, Abilities: starter.Abilities},
	}))
	_, _, err = svcKind.RestoreSnapshot(ctx, "20200101-000000Z", "tester")
	assert.Equal(t, "would_empty_whitelist", errCode(t, err))
	live, err := svcKind.Get(ctx)
	require.NoError(t, err)
	assert.Equal(t, starter.Items, live.Items, "a refused restore writes nothing")

	// ③ the zero-champion floor, reached where ② cannot fire: the live doc is
	// ALREADY champion-less, so no kind goes populated→empty, and restoring a
	// champion-less snapshot would still leave champ-select empty.
	svcFloor, storeFloor, _ := newSvc(t)
	seed(t, svcFloor, []string{}, []string{"live-item"}, []string{})
	require.NoError(t, storeFloor.Put(curation.SnapshotCollection, "20200102-000000Z", curation.Snapshot{
		ID: "20200102-000000Z", Reason: "forged",
		Whitelist: curation.Doc{Version: 1,
			Champions: []string{}, Items: []string{"snap-item"}, Abilities: []string{}},
	}))
	_, _, err = svcFloor.RestoreSnapshot(ctx, "20200102-000000Z", "tester")
	assert.Equal(t, "would_empty_whitelist", errCode(t, err))
	live, err = svcFloor.Get(ctx)
	require.NoError(t, err)
	assert.Equal(t, []string{"live-item"}, live.Items, "a refused restore writes nothing")
}

// whitelist-reset-warns-half-enabled — resetting ABILITIES without CHAMPIONS
// strands every live champion the starter does not carry: its `.ex` disappears
// and the round-6 EX unlock silently does nothing. The plan has to say so.
func TestResetWarnsHalfEnabled(t *testing.T) {
	testkit.Cover(t, "whitelist-reset-warns-half-enabled")
	svc, _, _ := newSvc(t)
	ctx := context.Background()
	starter := curation.StarterSet()

	// A live champion that the starter does not carry, with its full kit.
	extraKit := []string{"extra-a.q", "extra-a.w", "extra-a.e", "extra-a.r", "extra-a.ex"}
	seed(t, svc, append(append([]string{}, starter.Champions...), "extra-a"),
		starter.Items, append(append([]string{}, starter.Abilities...), extraKit...))

	plan, err := svc.Reset(ctx, curation.ResetRequest{
		Scopes: []string{curation.KindAbilities}, DryRun: true,
	})
	require.NoError(t, err)

	var found *curation.ResetWarning
	for i := range plan.Warnings {
		if plan.Warnings[i].ChampionID == "extra-a" {
			found = &plan.Warnings[i]
		}
	}
	require.NotNil(t, found, "resetting abilities alone must warn about the stranded champion: %+v", plan.Warnings)
	assert.Equal(t, curation.WarnHalfEnabledChampion, found.Code)
	assert.Contains(t, found.Missing, "extra-a.ex")

	// The healthy case produces no warning at all: reset EVERYTHING and the
	// starter's own champions keep their five slots.
	plan, err = svc.Reset(ctx, curation.ResetRequest{
		Scopes: []string{curation.KindChampions, curation.KindAbilities}, DryRun: true,
	})
	require.NoError(t, err)
	assert.Empty(t, plan.Warnings, "the starter bundle is internally complete: %+v", plan.Warnings)
}

// whitelist-reset-scope-validation — an unknown or empty scope is a 400, never
// a silent no-op.
func TestResetScopeValidation(t *testing.T) {
	testkit.Cover(t, "whitelist-reset-scope-validation")
	svc, _, _ := newSvc(t)
	ctx := context.Background()
	seed(t, svc, []string{"godie-e001"}, []string{}, []string{})

	_, err := svc.Reset(ctx, curation.ResetRequest{Scopes: nil, DryRun: true})
	assert.Equal(t, "bad_request", errCode(t, err))

	_, err = svc.Reset(ctx, curation.ResetRequest{Scopes: []string{"heroes"}, DryRun: true})
	assert.Equal(t, "bad_request", errCode(t, err))
}
