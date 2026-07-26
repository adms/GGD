package platformarchive

import (
	"context"
	"fmt"
	"math/rand"
	"reflect"
	"sort"
	"strings"
	"testing"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/pkg/testkit"
)

// ============================================================================
// THE GUARD ON THE OPERATOR-FACING ARTEFACT.
//
// Blocker 1's property test pins an INTERNAL map (Plan.VerdictMap ==
// ApplyResult.Results). This file pins the thing an operator is actually told
// to act on: ApplyResult.AddedDocs, the named list behind
// 「多出來的帳號自己去婉拒、多出來的邀請碼撤銷」.
//
// WHY IT NEEDS ITS OWN GUARD. The class of failure was not "a map disagreed
// with a map". It was that an INSTRUCTION was built on a number nobody had
// validated. The list was accumulated in a second pass over the write loop and
// inherited the defaulting bug wholesale: on a no-op re-import of a
// byte-identical archive the plan said 「將寫入 0 筆」 and the receipt said
// added=10, naming every account on the host — including the admin and the
// operator's own children. A non-DBA following the runbook at 1am would have
// been told, by name, to deny their own family.
//
// So the invariant under test is not an implementation detail. It is: THE
// NAMED LIST OF ADDITIONS EQUALS THE SET OF ENTRIES THE APPROVED DRY RUN
// CALLED `added`, ALWAYS. If that ever stops holding, the honest-disclosure
// sentence in the runbook, the CLI and the console all become lies at once.
//
// Everything here runs against synthetic t.TempDir() fixtures. Owner directive
// 2026-07-26: nothing in this feature ever touches the live deploy.
// ============================================================================

// plannedAdditions is the list AddedDocs is supposed to be, derived
// independently from the PLAN — the artefact the operator approved — rather
// than from anything the commit did.
func plannedAdditions(plan *Plan) []DocRef {
	out := []DocRef{}
	for _, c := range plan.Collections {
		for _, it := range c.Items {
			if it.Result == ResultAdded {
				out = append(out, DocRef{Collection: c.Collection, ID: it.ID})
			}
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Collection != out[j].Collection {
			return out[i].Collection < out[j].Collection
		}
		return out[i].ID < out[j].ID
	})
	return out
}

// assertAddedDocsMatchPlan is the invariant, in one place.
func assertAddedDocsMatchPlan(t *testing.T, label string, plan *Plan, res *ApplyResult) {
	t.Helper()
	want := plannedAdditions(plan)
	got := res.AddedDocs
	if got == nil {
		t.Fatalf("%s: AddedDocs is nil. It must always be a list — `[]` is the receipt "+
			"saying \"this import created nothing\", and an absent field reads as \"unknown\".", label)
	}
	if len(got) != res.Added {
		t.Errorf("%s: AddedDocs names %d document(s) but the result counts added=%d. "+
			"The count and the list must be the same fact stated twice, never two facts.",
			label, len(got), res.Added)
	}
	if reflect.DeepEqual(want, got) {
		return
	}
	// Name the exact disagreement — a diff of two slices is unreadable at 1am
	// and this failure message is the next reader's whole context.
	inPlan := map[DocRef]bool{}
	for _, d := range want {
		inPlan[d] = true
	}
	for _, d := range got {
		if !inPlan[d] {
			t.Errorf("%s: AddedDocs names %s/%s, but the approved dry run did NOT call it an addition. "+
				"This is the refuted bug: the operator would be told to 婉拒／撤銷 something the import did not create.",
				label, d.Collection, d.ID)
		}
	}
	inResult := map[DocRef]bool{}
	for _, d := range got {
		inResult[d] = true
	}
	for _, d := range want {
		if !inResult[d] {
			t.Errorf("%s: the dry run called %s/%s an addition but AddedDocs omits it — "+
				"the operator would never learn about that residue.", label, d.Collection, d.ID)
		}
	}
	t.Fatalf("%s: AddedDocs disagrees with the plan (plan=%d, list=%d)", label, len(want), len(got))
}

// TestAddedDocsAgreeWithThePlanForEveryEntry is the property, in the same shape
// as blocker 1's, but pinned on the operator-facing list.
func TestAddedDocsAgreeWithThePlanForEveryEntry(t *testing.T) {
	testkit.Cover(t, "archive-addeddocs-property")
	src := newLeanSource(t)
	a := openBytes(t, src.raw)

	namedRuns, emptyRuns := 0, 0
	for seed := int64(1); seed <= 24; seed++ {
		rng := rand.New(rand.NewSource(seed)) // #nosec G404 -- test fixture shuffling, not crypto.
		allowOverwrite := rng.Intn(2) == 0

		dst := t.TempDir()
		states := src.seedTarget(t, dst, rng)
		target, err := NewTarget(dst, "")
		if err != nil {
			t.Fatal(err)
		}
		opts := PlanOptions{AllowOverwrite: allowOverwrite}
		plan, err := BuildPlan(a, target, opts)
		if err != nil {
			t.Fatalf("seed %d: plan: %v", seed, err)
		}
		res, err := Apply(context.Background(), a, target, ApplyOptions{
			PlanOptions: opts, ExpectDigest: plan.Digest, SkipBackup: true,
		})
		if plan.Blocked {
			if err == nil {
				t.Fatalf("seed %d: a blocked plan must not be applicable", seed)
			}
			continue
		}
		if err != nil {
			t.Fatalf("seed %d: apply: %v", seed, err)
		}

		assertAddedDocsMatchPlan(t, fmt.Sprintf("seed %d (allowOverwrite=%v)", seed, allowOverwrite), plan, res)

		// EVERY name on the list must really be a document the target did NOT
		// hold before the import. This is the check neither the plan nor the
		// result can make on its own: it is answered from the FIXTURE's own
		// record of what it seeded, so it stays true even if both sides of the
		// contract were wrong together — which is precisely how the refuted bug
		// survived (the plan omitted the entry, and apply defaulted it to added).
		for _, d := range res.AddedDocs {
			if states[d.Collection+"/"+d.ID] != stateAbsent {
				t.Errorf("seed %d: AddedDocs names %s/%s, but the target already held that document (state %d)",
					seed, d.Collection, d.ID, states[d.Collection+"/"+d.ID])
			}
		}
		if len(res.AddedDocs) > 0 {
			namedRuns++
		} else {
			emptyRuns++
		}
	}
	if namedRuns == 0 {
		t.Error("no seed produced a non-empty AddedDocs — the property proves nothing about the list's contents")
	}
	t.Logf("seeds with named additions: %d, seeds with none: %d", namedRuns, emptyRuns)
}

// TestNoOpReImportNamesNothingAsAdded is THE refuting scenario, run forwards.
//
// Import an archive; re-import the byte-identical archive onto the untouched
// target. Measured on the branch this replaces:
//
//	plan:    「將寫入 0 筆」, all documents 相同
//	apply:   「✓ 匯入完成：寫入 10 筆（新增 10）」
//	receipt: added=10, addedDocs naming ALL 10 documents, admin included
//
// The re-import is not an exotic case: it is exactly what a nervous operator
// does when unsure whether the first import worked, and the CLI docstring
// explicitly supports it.
func TestNoOpReImportNamesNothingAsAdded(t *testing.T) {
	testkit.Cover(t, "archive-addeddocs-noop-reimport")
	src := newFixture(t)
	raw := src.exportBytes(t, "all")

	dst := t.TempDir()
	target, err := NewTarget(dst, "")
	if err != nil {
		t.Fatal(err)
	}

	first := openBytes(t, raw)
	plan1, err := BuildPlan(first, target, PlanOptions{})
	if err != nil {
		t.Fatal(err)
	}
	res1, err := Apply(context.Background(), first, target, ApplyOptions{ExpectDigest: plan1.Digest})
	if err != nil {
		t.Fatalf("first import: %v", err)
	}
	assertAddedDocsMatchPlan(t, "first import", plan1, res1)
	if len(res1.AddedDocs) == 0 {
		t.Fatal("the first import into an empty host must name its additions, or the second half proves nothing")
	}

	// ---- THE SECOND IMPORT: same bytes, untouched target -------------------
	second := openBytes(t, raw)
	plan2, err := BuildPlan(second, target, PlanOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if plan2.Writes != 0 {
		t.Fatalf("the dry run of a no-op re-import must promise 0 writes, got %d", plan2.Writes)
	}
	res2, err := Apply(context.Background(), second, target, ApplyOptions{ExpectDigest: plan2.Digest})
	if err != nil {
		t.Fatalf("second import: %v", err)
	}

	if res2.Added != 0 {
		t.Errorf("re-importing the identical archive reported added=%d, want 0", res2.Added)
	}
	if len(res2.AddedDocs) != 0 {
		names := []string{}
		for _, d := range res2.AddedDocs {
			names = append(names, d.Collection+"/"+d.ID)
		}
		t.Fatalf("re-importing the identical archive named %d document(s) as ADDED: %s\n"+
			"Every one of these would appear in the runbook's 「自己去婉拒」 list. "+
			"A byte-identical document is `unchanged`, never `added`.",
			len(names), strings.Join(names, ", "))
	}
	assertAddedDocsMatchPlan(t, "no-op re-import", plan2, res2)

	// And the RECEIPT says so in words, because a silent empty list and a
	// missing list look the same to a frightened reader.
	if !hasNote(res2, "沒有新增任何文件") {
		t.Fatalf("the no-op re-import must SAY it added nothing. Notes were:\n%s",
			strings.Join(res2.Notes, "\n"))
	}
	if hasNote(res2, "還原不會移除") || hasNote(res2, "逐筆清單") {
		t.Fatal("the no-op re-import must not print the residue instruction — there is no residue")
	}
}

func hasNote(res *ApplyResult, substr string) bool {
	for _, n := range res.Notes {
		if strings.Contains(n, substr) {
			return true
		}
	}
	return false
}

// TestRestoreNeverNamesTheHostsOwnAccounts is the second half of the refutation.
//
// After running the branch's own restore command, the previous cut's receipt
// reported added=4 and named the host's own admin and children's accounts. That
// is the single most damaging output this feature can produce: the operator has
// just recovered, is reading the receipt for what is left to clean up, and it
// tells them to deny the accounts the restore just gave back.
func TestRestoreNeverNamesTheHostsOwnAccounts(t *testing.T) {
	testkit.Cover(t, "archive-addeddocs-restore-clean")
	dst, store, targetOwner, bad := badAdoptImport(t)

	// Sanity: the bad import DID add things (otherwise the restore having
	// nothing to name would be vacuous).
	if len(bad.AddedDocs) == 0 {
		t.Fatal("the bad import added nothing; the fixture is wrong")
	}

	plan, restore, err := applyBackup(t, dst, bad.Backup.Path, PlanOptions{
		AllowOverwrite: true, ResolveCollisions: ResolveAdoptArchive,
	})
	if err != nil {
		t.Fatalf("the documented restore must succeed: %v", err)
	}
	assertAddedDocsMatchPlan(t, "restore", plan, restore)

	// The host's own owner account is on the target both before and after, so
	// nothing may ever name it as something the restore ADDED.
	for _, d := range restore.AddedDocs {
		if d.Collection == account.ColAccounts && d.ID == targetOwner {
			t.Fatalf("the restore's receipt names the host's OWN admin account (%s) as an addition — "+
				"the operator is being told to 婉拒 themselves", targetOwner)
		}
		if ok, _ := store.Exists(d.Collection, d.ID); !ok {
			t.Errorf("the restore names %s/%s as added, but it is not on the target", d.Collection, d.ID)
		}
	}
	t.Logf("restore added %d document(s): %v", len(restore.AddedDocs), restore.AddedDocs)
}
