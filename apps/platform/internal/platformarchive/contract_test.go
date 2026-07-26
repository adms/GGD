package platformarchive

import (
	"context"
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"testing"
	"time"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/admin"
	"github.com/ggd/platform/internal/combatenv"
	"github.com/ggd/platform/internal/curation"
	"github.com/ggd/platform/internal/data/jsonstore"
)

// ============================================================================
// THE PLAN IS THE CONTRACT.
//
// The whole safety story of this feature is "look at the dry run, then approve
// it". It was not true. CollectionPlan.Items used to carry only the interesting
// entries, and Apply defaulted every entry it could not find there to
// ResultAdded and re-wrote it — so a re-import of an ALREADY imported archive
// showed the operator plan.Writes=0 and then rewrote every document in the
// target. Measured on this repo's own fixture: plan.Writes=0, Written=169.
//
// The re-import is not an exotic case. It is what a nervous operator does when
// they are unsure whether the first import worked.
//
// The fix is structural: exactly ONE function decides a verdict (planEntry),
// exactly one path carries it to a write (Plan.Executable), and the plan
// enumerates EVERY entry. These tests pin that:
//
//	1. TestReImportWritesNothingItDidNotPromise — the regression, file by file;
//	2. TestPlanVerdictMapEqualsApplyResultMapExactly — the general property over
//	   a randomised mix of fresh / identical / modified / newer-target documents.
//	   This is the real deliverable: it is what stops the class of bug coming
//	   back, whatever shape it takes next time;
//	3. TestPlanDigestCoversPerEntryVerdicts — the 409 guard must notice a
//	   per-entry verdict change, not just a change in the entry SET (otherwise
//	   it would have happily approved this very bug);
//	4. TestApplyRefusesAPlanThatDoesNotMatchTheArchive — an entry the plan never
//	   mentioned is a refusal, never a silent skip and never a silent write.
//
// Everything runs on t.TempDir() fixtures. Nothing here reads, writes or
// contacts a deployed host.
// ============================================================================

// ---------------------------------------------------------------------------
// mtime stamping: how "not written" is told apart from "written with the same
// bytes". A byte comparison cannot make that distinction — re-Putting an
// identical document produces identical bytes — and it is exactly the
// distinction the bug hid behind.
// ---------------------------------------------------------------------------

var untouchedStamp = time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)

// stampTree back-dates every regular file under root, skipping this feature's
// own working area (backups legitimately appear there mid-import).
func stampTree(t *testing.T, root string) {
	t.Helper()
	err := filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			if d.Name() == MigrationDir {
				return filepath.SkipDir
			}
			return nil
		}
		return os.Chtimes(p, untouchedStamp, untouchedStamp)
	})
	if err != nil {
		t.Fatal(err)
	}
}

// wasTouched reports whether a path was created or rewritten since stampTree.
func wasTouched(t *testing.T, path string) bool {
	t.Helper()
	st, err := os.Stat(path)
	if os.IsNotExist(err) {
		return false // never existed and was not created
	}
	if err != nil {
		t.Fatal(err)
		return false
	}
	return st.ModTime().Unix() != untouchedStamp.Unix()
}

// targetPathOf is the file one archive entry lands at, derived through the same
// helpers the writer uses.
func targetPathOf(t *testing.T, tgt *Target, col, id string) string {
	t.Helper()
	if col == ColReplays {
		return filepath.Join(tgt.ReplayDir, id)
	}
	rule := RuleFor(col)
	if rule == nil {
		t.Fatalf("no rule for %q", col)
	}
	if rule.Kind == KindJSONL {
		p, err := jsonlPath(tgt.Store, col, id)
		if err != nil {
			t.Fatal(err)
		}
		return p
	}
	p, err := tgt.Store.Path(col, id)
	if err != nil {
		t.Fatal(err)
	}
	return p
}

// ---------------------------------------------------------------------------
// 1. THE REGRESSION. Import an archive, then import the SAME archive again.
// ---------------------------------------------------------------------------

func TestReImportWritesNothingItDidNotPromise(t *testing.T) {
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
	if plan1.Writes == 0 {
		t.Fatal("the first import must write something, or this test proves nothing")
	}
	assertPlanEqualsApply(t, plan1, res1)

	// ---- THE SECOND IMPORT, byte-identical archive, unchanged target --------
	stampTree(t, dst)

	second := openBytes(t, raw)
	plan2, err := BuildPlan(second, target, PlanOptions{})
	if err != nil {
		t.Fatal(err)
	}
	res2, err := Apply(context.Background(), second, target, ApplyOptions{ExpectDigest: plan2.Digest})
	if err != nil {
		t.Fatalf("second import: %v", err)
	}

	// The aggregate promise…
	if plan2.Writes != 0 || plan2.Unchanged != plan1.Writes {
		t.Fatalf("the dry run of a re-import must be all-unchanged: writes=%d unchanged=%d (first import wrote %d)",
			plan2.Writes, plan2.Unchanged, plan1.Writes)
	}
	assertPlanEqualsApply(t, plan2, res2)

	// …and the promise made good, ENTRY BY ENTRY on the filesystem. This is the
	// assertion the old code failed: every count above can be satisfied by a
	// result struct that lies, but a rewritten file cannot hide its mtime.
	checked := 0
	for _, c := range plan2.Collections {
		for _, it := range c.Items {
			if it.Result != ResultUnchanged {
				t.Errorf("%s/%s: re-importing the same archive produced %q, want %q",
					c.Collection, it.ID, it.Result, ResultUnchanged)
				continue
			}
			p := targetPathOf(t, target, c.Collection, it.ID)
			if wasTouched(t, p) {
				t.Errorf("%s/%s: the plan promised %q and the file was rewritten anyway (%s)",
					c.Collection, it.ID, ResultUnchanged, p)
			}
			checked++
		}
	}
	if checked != plan1.Writes {
		t.Fatalf("checked %d entries, want the %d the first import wrote", checked, plan1.Writes)
	}
	t.Logf("re-import: plan.Writes=%d plan.Unchanged=%d apply.Written=%d apply.Unchanged=%d over %d files",
		plan2.Writes, plan2.Unchanged, res2.Written, res2.Unchanged, checked)
}

// assertPlanEqualsApply is the contract itself, in three forms: the totals, the
// per-collection roll-up, and the per-entry map.
func assertPlanEqualsApply(t *testing.T, plan *Plan, res *ApplyResult) {
	t.Helper()
	if res.Written != plan.Writes {
		t.Errorf("plan promised %d write(s), the commit performed %d", plan.Writes, res.Written)
	}
	if res.Unchanged != plan.Unchanged {
		t.Errorf("plan said %d unchanged, the commit reported %d", plan.Unchanged, res.Unchanged)
	}
	if res.Skipped != plan.Skipped {
		t.Errorf("plan said %d skipped, the commit reported %d", plan.Skipped, res.Skipped)
	}
	added := 0
	for _, c := range plan.Collections {
		added += c.Added
	}
	if res.Added != added {
		t.Errorf("plan said %d added, the commit reported %d", added, res.Added)
	}
	if want, got := plan.VerdictMap(), res.Results; !reflect.DeepEqual(want, got) {
		for col, m := range want {
			for id, verdict := range m {
				if got[col][id] != verdict {
					t.Errorf("%s/%s: plan said %q, the commit did %q", col, id, verdict, got[col][id])
				}
			}
		}
		for col, m := range got {
			for id := range m {
				if _, ok := want[col][id]; !ok {
					t.Errorf("%s/%s: the commit touched an entry the plan never mentioned", col, id)
				}
			}
		}
		t.Fatalf("the per-entry verdict map and the per-entry result map differ")
	}
	if len(res.Warnings) > 0 {
		for _, w := range res.Warnings {
			t.Logf("apply warning: %s", w)
		}
	}
}

// ---------------------------------------------------------------------------
// 2. THE PROPERTY. For ANY mix of target states, the plan's per-entry verdict
//    map equals the apply's per-entry result map exactly.
// ---------------------------------------------------------------------------

// Target states a document can be in before the import. They are the four
// branches of planEntry's policy table plus "absent".
const (
	stateAbsent = iota // → added
	stateSame          // → unchanged
	stateDiffer        // → skipped, or written under allowOverwrite
	stateNewer         // singletons only → blocked, or written under allowOverwrite
	stateCount
)

func TestPlanVerdictMapEqualsApplyResultMapExactly(t *testing.T) {
	src := newLeanSource(t)
	a := openBytes(t, src.raw)

	seen := map[string]int{}
	blockedRuns := 0
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
		for _, c := range plan.Collections {
			for _, it := range c.Items {
				seen[it.Result]++
			}
		}

		stampTree(t, dst)
		res, err := Apply(context.Background(), a, target, ApplyOptions{
			PlanOptions: opts, ExpectDigest: plan.Digest, SkipBackup: true,
		})

		if plan.Blocked {
			// A blocked plan is a ZERO-write. Assert that on the filesystem, not
			// just on the error value.
			blockedRuns++
			if err == nil {
				t.Fatalf("seed %d: a blocked plan must not be applicable", seed)
			}
			for _, c := range plan.Collections {
				for _, it := range c.Items {
					if wasTouched(t, targetPathOf(t, target, c.Collection, it.ID)) {
						t.Fatalf("seed %d: a REFUSED import wrote %s/%s", seed, c.Collection, it.ID)
					}
				}
			}
			continue
		}
		if err != nil {
			t.Fatalf("seed %d (allowOverwrite=%v, states=%v): apply: %v", seed, allowOverwrite, states, err)
		}

		assertPlanEqualsApply(t, plan, res)

		// And the filesystem agrees with both: only the entries the plan said it
		// would write have moved.
		for _, c := range plan.Collections {
			for _, it := range c.Items {
				p := targetPathOf(t, target, c.Collection, it.ID)
				touched := wasTouched(t, p)
				wantTouched := it.Result == ResultAdded || it.Result == ResultWritten
				if touched != wantTouched {
					t.Errorf("seed %d %s/%s: verdict %q, file touched=%v want %v",
						seed, c.Collection, it.ID, it.Result, touched, wantTouched)
				}
			}
		}
	}

	// The property is only worth something if the randomisation actually reached
	// every branch of the verdict table.
	for _, want := range []string{ResultAdded, ResultUnchanged, ResultWritten, ResultSkipped, ResultBlocked} {
		if seen[want] == 0 {
			t.Errorf("the randomised mix never produced a %q verdict — the property proves less than it claims (%v)",
				want, seen)
		}
	}
	if blockedRuns == 0 {
		t.Error("no seed produced a blocked plan; the zero-write branch was never exercised")
	}
	t.Logf("verdicts exercised: %v (blocked plans: %d/24)", seen, blockedRuns)
}

// ---------------------------------------------------------------------------
// leanSource — a small source tree that still covers every entry KIND (doc /
// append-only jsonl / opaque blob) and both document POLICIES (additive /
// singleton), because those are exactly what planEntry branches on.
// ---------------------------------------------------------------------------

type leanDoc struct {
	col      string
	id       string
	val      map[string]any
	kind     EntryKind
	newerVal map[string]any // the "target edited it after the export" variant
	raw      []byte         // jsonl / replay bytes
}

type leanSource struct {
	dir  string
	docs []leanDoc
	raw  []byte
}

const leanAccounts = 4

func newLeanSource(t *testing.T) *leanSource {
	t.Helper()
	dir := t.TempDir()
	store, err := jsonstore.New(dir)
	if err != nil {
		t.Fatal(err)
	}
	base := time.Date(2026, 7, 26, 14, 3, 11, 0, time.UTC)
	s := &leanSource{dir: dir}

	addDoc := func(col, id string, val, newer map[string]any) {
		mustPut(t, store, col, id, val)
		s.docs = append(s.docs, leanDoc{col: col, id: id, val: val, newerVal: newer, kind: KindDoc})
	}

	for i := range leanAccounts {
		id := fmt.Sprintf("u_lean%04d", i)
		username := fmt.Sprintf("lean%02d", i)
		addDoc(account.ColAccounts, id, map[string]any{
			"id": id, "username": username, "mmr": 1000 + i,
			"passwordHash": "$argon2id$v=19$m=65536,t=1,p=2$c29tZXNhbHQ$lean" + fmt.Sprint(i),
		}, nil)
		// Identity refs: always either absent or pointing at the SAME account, so
		// this property test never trips the (separately tested) collision path.
		addDoc(account.ColByUsername, username, map[string]any{"id": id}, nil)
	}

	// The two singleton policies, with the "target is NEWER than the archive"
	// variant that blocks an import by default.
	addDoc(curation.Collection, curation.DocID, map[string]any{
		"version": curation.SchemaVersion, "updatedAt": base,
		"champions": []any{"godie-a001"},
	}, map[string]any{
		"version": curation.SchemaVersion, "updatedAt": base.Add(48 * time.Hour),
		"champions": []any{"godie-a001", "godie-a002"},
	})
	addDoc(combatenv.Collection, combatenv.DocID, map[string]any{
		"multipliers": map[string]any{"damageDealt": 0.5}, "updatedAt": base,
	}, map[string]any{
		"multipliers": map[string]any{"damageDealt": 0.9}, "updatedAt": base.Add(48 * time.Hour),
	})

	// Append-only (jsonl) and opaque (replay) entries.
	mustAppend(t, store, admin.ColAudit, "2026-07-26", admin.AuditEntry{
		AdminID: "u_lean0000", Action: "seed", TS: base,
	})
	jsonlBytes, err := os.ReadFile(filepath.Join(dir, admin.ColAudit, "2026-07-26.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	s.docs = append(s.docs, leanDoc{
		col: admin.ColAudit, id: "2026-07-26", kind: KindJSONL, raw: jsonlBytes,
	})

	mustMkdir(t, filepath.Join(dir, ColReplays))
	for i := range 2 {
		name := fmt.Sprintf("m_lean%02d.jsonl.gz", i)
		body := []byte("lean-replay-body-" + fmt.Sprint(i))
		mustWrite(t, filepath.Join(dir, ColReplays, name), body)
		s.docs = append(s.docs, leanDoc{col: ColReplays, id: name, kind: KindOpaque, raw: body})
	}

	var buf writerTo
	if _, err := Export(&buf, ExportOptions{
		DataDir: dir, Groups: []string{"all"}, Hostname: "lean-host",
		Now: func() time.Time { return base },
	}); err != nil {
		t.Fatalf("lean export: %v", err)
	}
	s.raw = buf.b
	return s
}

// seedTarget plants a randomly chosen state for every document and returns the
// choices, so a failure message can name the exact scenario.
func (s *leanSource) seedTarget(t *testing.T, dst string, rng *rand.Rand) map[string]int {
	t.Helper()
	store, err := jsonstore.New(dst)
	if err != nil {
		t.Fatal(err)
	}
	out := map[string]int{}
	for _, d := range s.docs {
		state := rng.Intn(stateCount)
		if state == stateNewer && d.newerVal == nil {
			state = stateDiffer // "newer" only means something for the singletons
		}
		out[d.col+"/"+d.id] = state
		if state == stateAbsent {
			continue
		}
		switch d.kind {
		case KindDoc:
			switch state {
			case stateSame:
				mustPut(t, store, d.col, d.id, d.val)
			case stateNewer:
				mustPut(t, store, d.col, d.id, d.newerVal)
			default:
				alt := map[string]any{}
				for k, v := range d.val {
					alt[k] = v
				}
				alt["mmr"] = 4242 // additive docs: differs, and never "newer"
				if _, isRef := alt["id"]; isRef && len(d.val) == 1 {
					// An identity ref with a DIFFERENT id would be a collision,
					// which has its own test and would block every seed. Keep the
					// id and differ on a harmless field instead.
					alt["note"] = "target-side edit"
				}
				mustPut(t, store, d.col, d.id, alt)
			}
		case KindJSONL:
			p, err := jsonlPath(store, d.col, d.id)
			if err != nil {
				t.Fatal(err)
			}
			mustMkdir(t, filepath.Dir(p))
			body := d.raw
			if state != stateSame {
				body = append(append([]byte{}, d.raw...), []byte("{\"op\":\"target-only\"}\n")...)
			}
			mustWrite(t, p, body)
		default:
			mustMkdir(t, filepath.Join(dst, ColReplays))
			body := d.raw
			if state != stateSame {
				body = append(append([]byte{}, d.raw...), []byte("-target-side-tail")...)
			}
			mustWrite(t, filepath.Join(dst, ColReplays, d.id), body)
		}
	}
	return out
}

// ---------------------------------------------------------------------------
// 3. THE DIGEST must cover the per-entry verdicts, not merely the entry set.
// ---------------------------------------------------------------------------

func TestPlanDigestCoversPerEntryVerdicts(t *testing.T) {
	src := newLeanSource(t)
	a := openBytes(t, src.raw)

	// Two targets that differ ONLY in WHICH document is the modified one. The
	// entry set is identical and every aggregate count is identical; only the
	// per-entry verdicts are swapped. If the digest cannot tell them apart, the
	// 409 guard cannot either — and it would have approved the very bug this
	// change fixes.
	accA := src.docs[0]
	accB := src.docs[2]
	if accA.col != account.ColAccounts || accB.col != account.ColAccounts {
		t.Fatalf("fixture drift: expected two account docs, got %q and %q", accA.col, accB.col)
	}

	digestFor := func(modified, same leanDoc) (*Plan, string) {
		dst := t.TempDir()
		store, err := jsonstore.New(dst)
		if err != nil {
			t.Fatal(err)
		}
		for _, d := range src.docs {
			if d.kind != KindDoc || d.col != account.ColAccounts {
				continue
			}
			switch d.id {
			case modified.id:
				alt := map[string]any{}
				for k, v := range d.val {
					alt[k] = v
				}
				alt["mmr"] = 4242
				mustPut(t, store, d.col, d.id, alt)
			case same.id:
				mustPut(t, store, d.col, d.id, d.val)
			}
		}
		target, err := NewTarget(dst, "")
		if err != nil {
			t.Fatal(err)
		}
		p, err := BuildPlan(a, target, PlanOptions{})
		if err != nil {
			t.Fatal(err)
		}
		return p, p.Digest
	}

	planA, digestA := digestFor(accA, accB)
	planB, digestB := digestFor(accB, accA)

	// Same shape, by construction — assert it rather than assume it, or the test
	// would pass for the wrong reason.
	countsOf := func(p *Plan) [4]int { return [4]int{p.Writes, p.Unchanged, p.Skipped, p.BlockedEntries} }
	if countsOf(planA) != countsOf(planB) {
		t.Fatalf("the two plans must have identical aggregates: %v vs %v", countsOf(planA), countsOf(planB))
	}
	idsOf := func(p *Plan) []string {
		out := []string{}
		for _, c := range p.Collections {
			for _, it := range c.Items {
				out = append(out, c.Collection+"/"+it.ID)
			}
		}
		sort.Strings(out)
		return out
	}
	if !reflect.DeepEqual(idsOf(planA), idsOf(planB)) {
		t.Fatal("the two plans must cover the identical entry set")
	}
	if reflect.DeepEqual(planA.VerdictMap(), planB.VerdictMap()) {
		t.Fatal("the two plans must differ in their per-entry verdicts")
	}

	if digestA == digestB {
		t.Fatalf("the digest ignores per-entry verdicts: both plans hash to %s", digestA)
	}
}

// ---------------------------------------------------------------------------
// 4. A plan that does not describe the archive is a REFUSAL, never a silent
//    skip and never a silent extra write.
// ---------------------------------------------------------------------------

func TestApplyRefusesAPlanThatDoesNotMatchTheArchive(t *testing.T) {
	src := newLeanSource(t)
	a := openBytes(t, src.raw)
	dst := t.TempDir()
	target, err := NewTarget(dst, "")
	if err != nil {
		t.Fatal(err)
	}
	plan, err := BuildPlan(a, target, PlanOptions{})
	if err != nil {
		t.Fatal(err)
	}

	// Drop one entry from the plan, exactly as the old code effectively did for
	// every unchanged entry.
	trimmed := *plan
	trimmed.Collections = append([]CollectionPlan{}, plan.Collections...)
	dropped := ""
	for i := range trimmed.Collections {
		c := &trimmed.Collections[i]
		if c.Collection != account.ColAccounts || len(c.Items) < 2 {
			continue
		}
		dropped = c.Items[0].ID
		c.Items = append([]ItemPlan{}, c.Items[1:]...)
		break
	}
	if dropped == "" {
		t.Fatal("fixture drift: no accounts collection with two entries")
	}
	if _, err := trimmed.Executable(a); err == nil {
		t.Fatal("a plan missing an entry the archive carries must be refused, not silently completed")
	}

	// And an entry the archive does not carry.
	extra := *plan
	extra.Collections = append([]CollectionPlan{}, plan.Collections...)
	for i := range extra.Collections {
		c := &extra.Collections[i]
		if c.Collection != account.ColAccounts {
			continue
		}
		c.Items = append(append([]ItemPlan{}, c.Items...), ItemPlan{ID: "u_ghost0000", Result: ResultAdded})
		break
	}
	if _, err := extra.Executable(a); err == nil {
		t.Fatal("a plan naming an entry the archive does NOT carry must be refused")
	}

	// Nothing above wrote anything.
	if ids, err := target.Store.Scan(account.ColAccounts); err != nil || len(ids) != 0 {
		t.Fatalf("resolving a bad plan wrote %d account(s) (err=%v)", len(ids), err)
	}
}
