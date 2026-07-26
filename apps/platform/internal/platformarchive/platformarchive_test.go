package platformarchive

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/admin"
	"github.com/ggd/platform/internal/curation"
	"github.com/ggd/platform/internal/data/jsonstore"
)

func openBytes(t *testing.T, raw []byte) *Archive {
	t.Helper()
	a, err := OpenReaderAt(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		t.Fatalf("open archive: %v", err)
	}
	t.Cleanup(func() { _ = a.Close() })
	return a
}

// ---------------------------------------------------------------------------
// THE PRIMARY SCENARIO: old host → NEW host with an empty data/.
// ---------------------------------------------------------------------------

func TestMigrationOntoAFreshHost(t *testing.T) {
	src := newFixture(t)
	raw := src.exportBytes(t, "all")
	a := openBytes(t, raw)

	dst := t.TempDir()
	target, err := NewTarget(dst, "")
	if err != nil {
		t.Fatal(err)
	}
	plan, err := BuildPlan(a, target, PlanOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if plan.Blocked {
		t.Fatalf("a fresh host must never block: %v", plan.BlockedLines())
	}
	if plan.TargetPopulated {
		t.Fatal("an empty data dir must not report as populated")
	}
	if plan.Writes == 0 {
		t.Fatal("nothing would be written")
	}

	res, err := Apply(context.Background(), a, target, ApplyOptions{
		PlanOptions:  PlanOptions{},
		ExpectDigest: plan.Digest,
	})
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	if res.Backup == nil || !res.Backup.Empty {
		t.Fatal("the pre-import backup of an EMPTY host must exist and be empty")
	}

	// Every account, and both identity refs, must have landed.
	store, err := jsonstore.New(dst)
	if err != nil {
		t.Fatal(err)
	}
	for _, col := range []string{account.ColAccounts, account.ColByUsername, account.ColByEmail} {
		ids, err := store.Scan(col)
		if err != nil {
			t.Fatal(err)
		}
		if len(ids) != fixtureAccounts {
			t.Fatalf("%s = %d docs, want %d", col, len(ids), fixtureAccounts)
		}
		// _index.json is REBUILT by Put, never carried.
		listed, err := store.List(col)
		if err != nil {
			t.Fatal(err)
		}
		if len(listed) != fixtureAccounts {
			t.Fatalf("%s index = %d, want %d — Put must rebuild it", col, len(listed), fixtureAccounts)
		}
	}

	// The password hash survived verbatim — the whole point of the migration.
	var got account.Account
	if err := store.Get(account.ColAccounts, src.accountID[0], &got); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(got.PasswordHash, "$argon2id$") {
		t.Fatalf("password hash did not survive: %q", got.PasswordHash)
	}

	// The whitelist came across, so the new host is PLAYABLE.
	var wl curation.Doc
	if err := store.Get(curation.Collection, curation.DocID, &wl); err != nil {
		t.Fatal(err)
	}
	if len(wl.Champions) != 2 {
		t.Fatalf("whitelist champions = %d, want 2", len(wl.Champions))
	}

	// The traps are still absent on the TARGET.
	for _, p := range []string{"owner-setup-token", "journal", "blizzard-overlay", "content-backups"} {
		if _, err := os.Stat(filepath.Join(dst, p)); err == nil {
			t.Errorf("%s must not exist on the target", p)
		}
	}
	if _, err := os.Stat(filepath.Join(dst, "config", "ai-provider.json")); err == nil {
		t.Error("the AI provider secret must not have been imported")
	}
}

// ---------------------------------------------------------------------------
// IDEMPOTENCY: a second import of the same archive changes nothing.
// ---------------------------------------------------------------------------

func TestSecondImportIsAllUnchanged(t *testing.T) {
	src := newFixture(t)
	raw := src.exportBytes(t, "all")

	dst := t.TempDir()
	target, err := NewTarget(dst, "")
	if err != nil {
		t.Fatal(err)
	}
	a := openBytes(t, raw)
	plan, err := BuildPlan(a, target, PlanOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := Apply(context.Background(), a, target, ApplyOptions{ExpectDigest: plan.Digest}); err != nil {
		t.Fatal(err)
	}

	a2 := openBytes(t, raw)
	plan2, err := BuildPlan(a2, target, PlanOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if plan2.Writes != 0 {
		t.Fatalf("a repeat import would write %d document(s); it must write none", plan2.Writes)
	}
	for _, c := range plan2.Collections {
		if c.Added+c.Written+c.Skipped+c.Blocked != 0 {
			t.Errorf("%s: added=%d written=%d skipped=%d blocked=%d — all must be unchanged",
				c.Collection, c.Added, c.Written, c.Skipped, c.Blocked)
		}
	}
	if plan2.Blocked {
		t.Fatalf("a repeat import must not block: %v", plan2.BlockedLines())
	}
}

// ---------------------------------------------------------------------------
// RE-EXPORT: the archive round-trips SEMANTICALLY, not byte-for-byte.
// ---------------------------------------------------------------------------

func TestReExportPreservesMeaningNotBytes(t *testing.T) {
	src := newFixture(t)
	raw := src.exportBytes(t)
	a := openBytes(t, raw)

	dst := t.TempDir()
	target, err := NewTarget(dst, "")
	if err != nil {
		t.Fatal(err)
	}
	plan, _ := BuildPlan(a, target, PlanOptions{})
	if _, err := Apply(context.Background(), a, target, ApplyOptions{ExpectDigest: plan.Digest}); err != nil {
		t.Fatal(err)
	}

	var buf writerTo
	if _, err := Export(&buf, ExportOptions{DataDir: dst, Hostname: "target-host",
		Now: func() time.Time { return time.Date(2026, 7, 26, 14, 3, 11, 0, time.UTC) }}); err != nil {
		t.Fatal(err)
	}
	b := openBytes(t, buf.b)

	if a.Manifest.CountFor(account.ColAccounts) != b.Manifest.CountFor(account.ColAccounts) {
		t.Fatal("the account count changed across a round trip")
	}
	// Semantics: identical. Bytes/hashes: NOT guaranteed, because Put reindents.
	// This assertion exists so nobody later "fixes" the docs by claiming hash
	// equality is a valid success check.
	origDoc := readDoc(t, a, account.ColAccounts, src.accountID[0])
	roundDoc := readDoc(t, b, account.ColAccounts, src.accountID[0])
	if !sameDoc(origDoc, roundDoc) {
		t.Fatal("the account document changed MEANING across a round trip")
	}
}

func readDoc(t *testing.T, a *Archive, col, id string) json.RawMessage {
	t.Helper()
	for _, e := range a.ByCollection[col] {
		if e.ID != id {
			continue
		}
		b, err := a.ReadEntry(e)
		if err != nil {
			t.Fatal(err)
		}
		return b
	}
	t.Fatalf("%s/%s not in archive", col, id)
	return nil
}

// ---------------------------------------------------------------------------
// THE SECONDARY, DANGEROUS SCENARIO: a populated target.
// ---------------------------------------------------------------------------

func TestPopulatedTargetKeepsItsOwnDocumentsByDefault(t *testing.T) {
	src := newFixture(t)
	raw := src.exportBytes(t)
	dst := newFixture(t) // a DIFFERENT populated host (same ids, different data)

	// Make one account genuinely differ on the target.
	var acc account.Account
	if err := dst.store.Get(account.ColAccounts, dst.accountID[3], &acc); err != nil {
		t.Fatal(err)
	}
	acc.MMR = 9999
	mustPut(t, dst.store, account.ColAccounts, dst.accountID[3], acc)

	target, err := NewTarget(dst.dir, "")
	if err != nil {
		t.Fatal(err)
	}
	a := openBytes(t, raw)
	plan, err := BuildPlan(a, target, PlanOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if !plan.TargetPopulated {
		t.Fatal("a populated target must be reported as such")
	}
	found := false
	for _, c := range plan.Collections {
		if c.Collection != account.ColAccounts {
			continue
		}
		if c.Skipped != 1 {
			t.Fatalf("accounts skipped = %d, want 1", c.Skipped)
		}
		for _, it := range c.Items {
			if it.ID == dst.accountID[3] && it.Result == ResultSkipped {
				found = true
			}
		}
	}
	if !found {
		t.Fatal("the differing account must be listed BY NAME as skipped")
	}

	// With allowOverwrite it becomes a write.
	plan2, err := BuildPlan(a, target, PlanOptions{AllowOverwrite: true})
	if err != nil {
		t.Fatal(err)
	}
	if plan2.Writes != 1 {
		t.Fatalf("allowOverwrite writes = %d, want 1", plan2.Writes)
	}
}

// ---------------------------------------------------------------------------
// IDENTITY COLLISION — the migration's sharpest edge.
// ---------------------------------------------------------------------------

func TestIdentityCollisionBlocksByDefaultAndAdoptsOnRequest(t *testing.T) {
	src := newFixture(t)
	raw := src.exportBytes(t)

	// The realistic setup: the fresh host has ONE account, registered so that
	// somebody could log into the console — with the SAME username.
	dst := t.TempDir()
	store, err := jsonstore.New(dst)
	if err != nil {
		t.Fatal(err)
	}
	newOwner := "u_NEWOWNER"
	mustPut(t, store, account.ColAccounts, newOwner, account.Account{
		ID: newOwner, Username: "player00", Email: "player00@example.test",
		PasswordHash: "$argon2id$v=19$m=1,t=1,p=1$x$y", Roles: []string{admin.RoleAdmin},
	})
	mustPut(t, store, account.ColByUsername, "player00", map[string]string{"id": newOwner})
	mustPut(t, store, account.ColByEmail, "player00@example.test", map[string]string{"id": newOwner})

	target, err := NewTarget(dst, "")
	if err != nil {
		t.Fatal(err)
	}
	a := openBytes(t, raw)

	plan, err := BuildPlan(a, target, PlanOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if !plan.Blocked {
		t.Fatal("a username owned by a different account must BLOCK the import")
	}
	if len(plan.Collisions) != 2 {
		t.Fatalf("collisions = %d, want 2 (username + email)", len(plan.Collisions))
	}
	if _, err := Apply(context.Background(), a, target, ApplyOptions{ExpectDigest: plan.Digest}); err == nil {
		t.Fatal("a blocked plan must not be applicable")
	}

	// adopt-archive resolves it, and the displaced account is NOT deleted.
	plan2, err := BuildPlan(a, target, PlanOptions{ResolveCollisions: ResolveAdoptArchive})
	if err != nil {
		t.Fatal(err)
	}
	if plan2.Blocked {
		t.Fatalf("adopt-archive must clear the block: %v", plan2.BlockedLines())
	}
	res, err := Apply(context.Background(), a, target, ApplyOptions{
		PlanOptions:  PlanOptions{ResolveCollisions: ResolveAdoptArchive},
		ExpectDigest: plan2.Digest,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.DisplacedRefs) != 2 {
		t.Fatalf("displaced refs = %d, want 2", len(res.DisplacedRefs))
	}
	var ref struct {
		ID string `json:"id"`
	}
	if err := store.Get(account.ColByUsername, "player00", &ref); err != nil {
		t.Fatal(err)
	}
	if ref.ID != src.accountID[0] {
		t.Fatalf("username now resolves to %q, want the archive's %q", ref.ID, src.accountID[0])
	}
	if ok, _ := store.Exists(account.ColAccounts, newOwner); !ok {
		t.Fatal("the displaced account must NOT be deleted — this feature never deletes anything")
	}
}

// ---------------------------------------------------------------------------
// FAILURE MODE #4 — an existing append-only file is never overwritten.
// ---------------------------------------------------------------------------

func TestAuditLogIsNeverOverwritten(t *testing.T) {
	src := newFixture(t)
	raw := src.exportBytes(t, "audit")

	dst := t.TempDir()
	store, err := jsonstore.New(dst)
	if err != nil {
		t.Fatal(err)
	}
	mustAppend(t, store, admin.ColAudit, "2026-07-26", admin.AuditEntry{
		AdminID: "target-own-admin", Action: "target-only-line",
	})
	before, err := os.ReadFile(filepath.Join(dst, admin.ColAudit, "2026-07-26.jsonl"))
	if err != nil {
		t.Fatal(err)
	}

	target, err := NewTarget(dst, "")
	if err != nil {
		t.Fatal(err)
	}
	a := openBytes(t, raw)
	plan, err := BuildPlan(a, target, PlanOptions{AllowOverwrite: true}) // even with the flag
	if err != nil {
		t.Fatal(err)
	}
	if _, err := Apply(context.Background(), a, target, ApplyOptions{
		PlanOptions: PlanOptions{AllowOverwrite: true}, ExpectDigest: plan.Digest,
	}); err != nil {
		t.Fatal(err)
	}
	after, err := os.ReadFile(filepath.Join(dst, admin.ColAudit, "2026-07-26.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(before, after) {
		t.Fatal("the target's own audit file was rewritten — that forges its trail")
	}
}

// ---------------------------------------------------------------------------
// THE DIGEST CONTRACT: what you approved is what gets written.
// ---------------------------------------------------------------------------

func TestCommitRefusesWhenTheTargetMovedAfterTheDryRun(t *testing.T) {
	src := newFixture(t)
	raw := src.exportBytes(t)
	dst := t.TempDir()
	target, err := NewTarget(dst, "")
	if err != nil {
		t.Fatal(err)
	}
	a := openBytes(t, raw)
	plan, err := BuildPlan(a, target, PlanOptions{})
	if err != nil {
		t.Fatal(err)
	}

	// Somebody registers on the target between the dry run and the commit.
	store, _ := jsonstore.New(dst)
	mustPut(t, store, account.ColAccounts, src.accountID[1], account.Account{
		ID: src.accountID[1], Username: "someone-else", MMR: 1,
	})

	_, err = Apply(context.Background(), a, target, ApplyOptions{ExpectDigest: plan.Digest})
	if err == nil || !strings.Contains(err.Error(), "重新試算") {
		t.Fatalf("commit must refuse with a re-plan message, got %v", err)
	}
	// And nothing was written: the account the target already had is untouched.
	var got account.Account
	if err := store.Get(account.ColAccounts, src.accountID[1], &got); err != nil {
		t.Fatal(err)
	}
	if got.Username != "someone-else" {
		t.Fatal("a refused commit wrote something")
	}
}

// ---------------------------------------------------------------------------
// STAGING
// ---------------------------------------------------------------------------

func TestStageIsIdempotentAndRefusesASecondArchive(t *testing.T) {
	src := newFixture(t)
	raw := src.exportBytes(t)
	dst := t.TempDir()
	now := time.Now().UTC()

	st, err := StageUpload(dst, bytes.NewReader(raw), int64(len(raw)), now)
	if err != nil {
		t.Fatal(err)
	}
	st2, err := StageUpload(dst, bytes.NewReader(raw), int64(len(raw)), now)
	if err != nil {
		t.Fatalf("re-uploading the SAME bytes must be idempotent: %v", err)
	}
	if st.ID != st2.ID {
		t.Fatal("the same bytes must produce the same stage id")
	}

	other := src.exportBytes(t, "audit")
	if _, err := StageUpload(dst, bytes.NewReader(other), int64(len(other)), now); err == nil {
		t.Fatal("a second, different archive must conflict")
	}

	if err := DiscardStage(dst, st.ID); err != nil {
		t.Fatal(err)
	}
	if _, _, err := OpenStage(dst, st.ID); err == nil {
		t.Fatal("a discarded stage must not reopen")
	}
}

func TestStagingLivesUnderMigrationAndIsInvisibleToExport(t *testing.T) {
	src := newFixture(t)
	raw := src.exportBytes(t)
	if _, err := StageUpload(src.dir, bytes.NewReader(raw), int64(len(raw)), time.Now()); err != nil {
		t.Fatal(err)
	}
	// _migration starts with an underscore, so jsonstore's segmentRe can never
	// accept it as a collection — the exporter cannot even see it.
	again := src.exportBytes(t, "all")
	if bytes.Contains(again, []byte(MigrationDir)) {
		t.Fatal("a re-export swept in the staging area")
	}
	if segmentRe.MatchString(MigrationDir) {
		t.Fatal("_migration must be structurally impossible as a collection segment")
	}
}
