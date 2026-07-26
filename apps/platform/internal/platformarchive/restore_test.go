package platformarchive

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/admin"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/pkg/testkit"
)

// ============================================================================
// THE RECOVERY PATH. These tests exist because the runbook used to offer a
// restore command that, in the one case where the operator most needs it, is
// REFUSED and writes nothing at all.
//
// Setup, in the operator's words: "I imported the wrong file onto a host that
// already had real accounts." The host had one admin account with the same
// username as somebody in the archive, so the import blocked; the operator
// reached for -resolve-collisions=adopt-archive, which repointed the username at
// the ARCHIVE's account and left them unable to sign in as themselves. That is
// exactly the moment they read §5.5.
//
// Everything below runs against a synthetic t.TempDir() fixture. Owner
// directive 2026-07-26: nothing in this feature ever touches the live deploy.
// ============================================================================

// badAdoptImport reproduces that setup and returns the target dir, its store,
// the account id the TARGET owned before the import, and the import's result.
func badAdoptImport(t *testing.T) (string, *jsonstore.Store, string, *ApplyResult) {
	t.Helper()
	src := newFixture(t)
	raw := src.exportBytes(t, "all")

	dst := t.TempDir()
	store, err := jsonstore.New(dst)
	if err != nil {
		t.Fatal(err)
	}
	const targetOwner = "u_TARGET_OWNER"
	mustPut(t, store, account.ColAccounts, targetOwner, account.Account{
		ID: targetOwner, Username: "player00", Email: "player00@example.test",
		PasswordHash: "$argon2id$v=19$m=65536,t=1,p=2$dGFyZ2V0$targetownerhash",
		Roles:        []string{admin.RoleAdmin}, Status: account.StatusApproved,
	})
	mustPut(t, store, account.ColByUsername, "player00", map[string]string{"id": targetOwner})
	mustPut(t, store, account.ColByEmail, "player00@example.test", map[string]string{"id": targetOwner})

	target, err := NewTarget(dst, "")
	if err != nil {
		t.Fatal(err)
	}
	a := openBytes(t, raw)
	opts := PlanOptions{ResolveCollisions: ResolveAdoptArchive}
	plan, err := BuildPlan(a, target, opts)
	if err != nil {
		t.Fatal(err)
	}
	res, err := Apply(context.Background(), a, target, ApplyOptions{
		PlanOptions: opts, ExpectDigest: plan.Digest,
	})
	if err != nil {
		t.Fatalf("the bad import itself must succeed (that is what makes it bad): %v", err)
	}
	if res.Backup == nil || res.Backup.Empty {
		t.Fatal("a populated target must produce a NON-empty automatic backup")
	}
	return dst, store, targetOwner, res
}

func refID(t *testing.T, store *jsonstore.Store, col, key string) string {
	t.Helper()
	var ref struct {
		ID string `json:"id"`
	}
	if err := store.Get(col, key, &ref); err != nil {
		t.Fatalf("get %s/%s: %v", col, key, err)
	}
	return ref.ID
}

// applyBackup re-applies a backup zip with the given options and returns the
// plan it computed plus whatever Apply did.
func applyBackup(t *testing.T, dst, zipPath string, opts PlanOptions) (*Plan, *ApplyResult, error) {
	t.Helper()
	bk, err := Open(zipPath)
	if err != nil {
		t.Fatalf("open backup: %v", err)
	}
	defer func() { _ = bk.Close() }()
	target, err := NewTarget(dst, "")
	if err != nil {
		t.Fatal(err)
	}
	plan, err := BuildPlan(bk, target, opts)
	if err != nil {
		t.Fatalf("plan the restore: %v", err)
	}
	res, err := Apply(context.Background(), bk, target, ApplyOptions{
		PlanOptions: opts, ExpectDigest: plan.Digest,
	})
	return plan, res, err
}

// TestTheBackupDoesContainWhatAnAdoptRestoreNeeds.
//
// The worry was that the automatic backup might not capture what an
// adopt-archive rollback needs. It does, and structurally so: `core` is always
// in the plan's groups (NormalizeGroups forces it), and core carries accounts
// AND both identity-ref collections. So the target's own username→account
// mapping — the exact thing adopt-archive overwrote — is in the file.
func TestTheBackupDoesContainWhatAnAdoptRestoreNeeds(t *testing.T) {
	testkit.Cover(t, "archive-restore-backup-scope")
	_, _, targetOwner, res := badAdoptImport(t)

	bk, err := Open(res.Backup.Path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = bk.Close() }()

	for _, col := range []string{account.ColAccounts, account.ColByUsername, account.ColByEmail} {
		if len(bk.ByCollection[col]) == 0 {
			t.Fatalf("the pre-import backup carries no %s — an adopt rollback is impossible without it", col)
		}
	}
	// And the ref inside it still points at the TARGET's own account.
	for _, e := range bk.ByCollection[account.ColByUsername] {
		if e.ID != "player00" {
			continue
		}
		id, err := refAccountID(bk, e)
		if err != nil {
			t.Fatal(err)
		}
		if id != targetOwner {
			t.Fatalf("backup's by-username/player00 → %q, want the target's own %q", id, targetOwner)
		}
		return
	}
	t.Fatal("the backup has a by-username collection but not the colliding key")
}

// TestRestoreWithoutAdoptArchiveIsRefusedAndWritesNothing is the actual defect
// the recovery rework started from. The old runbook and the old backup sidecar
// both said "re-apply with -allow-overwrite". After an adopt import that is not
// merely incomplete, it is REFUSED: the backup's own refs collide with the refs
// the bad import installed, planIdentity blocks, and zero bytes are written.
func TestRestoreWithoutAdoptArchiveIsRefusedAndWritesNothing(t *testing.T) {
	testkit.Cover(t, "archive-restore-flagless-refused")
	dst, store, targetOwner, res := badAdoptImport(t)
	afterBadImport := refID(t, store, account.ColByUsername, "player00")
	if afterBadImport == targetOwner {
		t.Fatal("the bad import did not actually displace the username; the fixture is wrong")
	}

	plan, _, err := applyBackup(t, dst, res.Backup.Path, PlanOptions{AllowOverwrite: true})
	if !plan.Blocked {
		t.Fatal("REGRESSION or FIX: -allow-overwrite alone no longer blocks. " +
			"If the planner changed, re-check that RestoreCommand still needs both flags.")
	}
	if err == nil {
		t.Fatal("a blocked restore must return an error, not silently do nothing")
	}
	if now := refID(t, store, account.ColByUsername, "player00"); now != afterBadImport {
		t.Fatalf("a refused restore changed the target: %q → %q", afterBadImport, now)
	}
}

// TestDocumentedRestoreCommandIsTheOneThatWorks pins the fix: the command this
// package hands the operator carries BOTH flags, and that command really does
// give them their own account back.
func TestDocumentedRestoreCommandIsTheOneThatWorks(t *testing.T) {
	testkit.Cover(t, "archive-restore-command-works")
	cmd := RestoreCommand("/data/_migration/backups/x.zip")
	for _, flag := range []string{"-allow-overwrite", "-resolve-collisions=adopt-archive"} {
		if !strings.Contains(cmd, flag) {
			t.Fatalf("RestoreCommand is missing %s: %s", flag, cmd)
		}
	}

	dst, store, targetOwner, res := badAdoptImport(t)
	_, restore, err := applyBackup(t, dst, res.Backup.Path, PlanOptions{
		AllowOverwrite: true, ResolveCollisions: ResolveAdoptArchive,
	})
	if err != nil {
		t.Fatalf("the documented restore must succeed: %v", err)
	}
	if got := refID(t, store, account.ColByUsername, "player00"); got != targetOwner {
		t.Fatalf("after the documented restore player00 → %q, want the host's own %q", got, targetOwner)
	}
	if got := refID(t, store, account.ColByEmail, "player00@example.test"); got != targetOwner {
		t.Fatalf("after the documented restore the email ref → %q, want %q", got, targetOwner)
	}
	// The account document itself is back to the target's own version, hash and
	// all — otherwise the ref would resolve to a login nobody can pass.
	var acc account.Account
	if err := store.Get(account.ColAccounts, targetOwner, &acc); err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(acc.PasswordHash, "targetownerhash") {
		t.Fatalf("the restored admin account has the wrong password hash: %q", acc.PasswordHash)
	}
	// A restore is itself an import, so it took its own backup first.
	if restore.Backup == nil || restore.Backup.Empty {
		t.Fatal("the restore must itself have taken a non-empty backup before writing")
	}
}

// TestRestoreDoesNotRemoveWhatTheImportAdded is the DISCLOSURE under test.
//
// Option (B), chosen deliberately: the restore stays non-deleting, and every
// surface says so. This test is what makes that sentence checkable rather than
// aspirational — it asserts the residue is really there afterwards, and that
// the operator was handed its NAME so "deal with those yourself" is actionable.
func TestRestoreDoesNotRemoveWhatTheImportAdded(t *testing.T) {
	testkit.Cover(t, "archive-restore-never-deletes")
	dst, store, _, res := badAdoptImport(t)

	// Pick an account the bad import ADDED.
	added := ""
	for _, d := range res.AddedDocs {
		if d.Collection == account.ColAccounts {
			added = d.ID
			break
		}
	}
	if added == "" {
		t.Fatal("the import added no account; AddedDocs is not being populated")
	}
	if ok, _ := store.Exists(account.ColAccounts, added); !ok {
		t.Fatalf("AddedDocs names %s but it is not on the target", added)
	}

	if _, _, err := applyBackup(t, dst, res.Backup.Path, PlanOptions{
		AllowOverwrite: true, ResolveCollisions: ResolveAdoptArchive,
	}); err != nil {
		t.Fatal(err)
	}

	if ok, _ := store.Exists(account.ColAccounts, added); !ok {
		t.Fatal("the restore DELETED an added account. This feature must never delete; " +
			"if a deleting restore was added deliberately, the runbook, the CLI help, " +
			"RestoreRecovers and RestoreLimits all have to change with it.")
	}
	// And the disclosure says exactly that, so the operator was not surprised —
	// AND names the concrete controls, so it is an instruction, not a shrug.
	joined := strings.Join(RestoreLimits, "\n")
	for _, want := range []string{"不會刪", "婉拒", "撤銷", "addedDocs"} {
		if !strings.Contains(joined, want) {
			t.Errorf("RestoreLimits must mention %q — otherwise the residue sentence is a shrug:\n%s", want, joined)
		}
	}
	// The recovery half must state the two things that are genuinely undone.
	rec := strings.Join(RestoreRecovers, "\n")
	for _, want := range []string{"蓋掉", "指回"} {
		if !strings.Contains(rec, want) {
			t.Errorf("RestoreRecovers must state what IS recovered (%q):\n%s", want, rec)
		}
	}
}

// TestImportReceiptNamesEveryAddedDocument pins the receipt on disk. The
// console closes; this file is what is left at 1am.
func TestImportReceiptNamesEveryAddedDocument(t *testing.T) {
	testkit.Cover(t, "archive-import-receipt")
	_, _, _, res := badAdoptImport(t)

	raw, err := os.ReadFile(res.Backup.ManifestPath)
	if err != nil {
		t.Fatalf("the backup sidecar must exist: %v", err)
	}
	var doc struct {
		RestoreWith     string   `json:"restoreWith"`
		RestoreRecovers []string `json:"restoreRecovers"`
		RestoreLimits   []string `json:"restoreLimits"`
		Import          *struct {
			Added     int      `json:"added"`
			AddedDocs []DocRef `json:"addedDocs"`
		} `json:"import"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatalf("sidecar is not valid JSON: %v", err)
	}
	if doc.Import == nil {
		t.Fatal("the sidecar has no import section — the receipt never landed")
	}
	if doc.Import.Added != res.Added {
		t.Fatalf("receipt says added=%d, result says %d", doc.Import.Added, res.Added)
	}
	if !reflectDeepEqualDocRefs(doc.Import.AddedDocs, res.AddedDocs) {
		t.Fatalf("the durable receipt disagrees with the in-memory result:\non disk: %v\nin memory: %v",
			doc.Import.AddedDocs, res.AddedDocs)
	}
	if !strings.Contains(doc.RestoreWith, "-resolve-collisions=adopt-archive") {
		t.Fatalf("the sidecar's restore command omits the flag that makes it work: %q", doc.RestoreWith)
	}
	if len(doc.RestoreLimits) != len(RestoreLimits) || len(doc.RestoreRecovers) != len(RestoreRecovers) {
		t.Fatal("the sidecar must carry the FULL honesty lists, not a summary of them")
	}
	// The sidecar is 0640 like everything else this package writes: it lists
	// every username and email the import touched.
	st, err := os.Stat(res.Backup.ManifestPath)
	if err != nil {
		t.Fatal(err)
	}
	if st.Mode().Perm() != 0o640 {
		t.Fatalf("sidecar mode = %v, want 0640", st.Mode().Perm())
	}
}

func reflectDeepEqualDocRefs(a, b []DocRef) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// TestFreshHostImportStillRecordsItsAdditions guards the PRIMARY scenario: the
// receipt must not depend on the target being populated.
func TestFreshHostImportStillRecordsItsAdditions(t *testing.T) {
	testkit.Cover(t, "archive-import-receipt-freshhost")
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
	res, err := Apply(context.Background(), a, target, ApplyOptions{ExpectDigest: plan.Digest})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.AddedDocs) != res.Added || res.Added == 0 {
		t.Fatalf("AddedDocs = %d, Added = %d", len(res.AddedDocs), res.Added)
	}
	if _, err := os.Stat(res.Backup.ManifestPath); err != nil {
		t.Fatalf("even an empty-host backup keeps its sidecar: %v", err)
	}
}
