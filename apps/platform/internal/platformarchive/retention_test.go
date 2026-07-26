package platformarchive

import (
	"archive/zip"
	"bytes"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/google/renameio/v2"

	"github.com/ggd/platform/pkg/testkit"
)

// ============================================================================
// BACKUP RETENTION (task #243, blocker 3).
//
// Before this file existed, every import wrote data/_migration/backups/<UTC>.zip
// and NOTHING ever removed it: SweepStaging had a branch for staged uploads and
// a branch for abandoned .incoming-*, and none at all for backups. Running it
// with a clock a year in the future removed nothing. Each of those files is a
// complete credential dump — TestARetainedBackupReallyIsACredentialDump below
// proves that rather than asserting it in a comment — so DATA_DIR was quietly
// becoming a pile of password databases.
//
// Everything here uses t.TempDir() fixtures. Nothing reads, writes or contacts
// the live deploy; see the header of fixture_test.go for the owner directive.
// ============================================================================

// plantBackup fakes one backup pair at a chosen instant. The retention rules
// key off the STAMP in the file name, so this is a faithful stand-in for a real
// BackupTarget call and lets a two-year history be built in microseconds.
func plantBackup(t *testing.T, dataDir string, at time.Time) string {
	t.Helper()
	dir, err := ensureBackupDir(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	stamp := at.UTC().Format(backupStampLayout)
	if err := os.WriteFile(filepath.Join(dir, stamp+".zip"), []byte("PK\x05\x06-fake-"+stamp), backupFileMode); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, stamp+".json"), []byte(`{"reason":"planted"}`), backupFileMode); err != nil {
		t.Fatal(err)
	}
	return stamp
}

func stamps(t *testing.T, dataDir string) []string {
	t.Helper()
	list, err := ListBackups(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	out := []string{}
	for _, b := range list {
		out = append(out, b.Stamp)
	}
	return out
}

// ---------------------------------------------------------------------------
// THE FAILURE THE POLICY IS SHAPED AROUND: a retry burst.
// ---------------------------------------------------------------------------

func TestARetryBurstNeverLosesThePreSessionSnapshot(t *testing.T) {
	testkit.Cover(t, "arch-243-retention-burst")
	// The realistic shape of an import here: five commits in one afternoon
	// while the operator works through collisions and the overwrite flag. The
	// FIRST one is the state he would want back — every later one already
	// contains part of the import he is trying to undo.
	dir := t.TempDir()
	afternoon := time.Date(2026, 7, 26, 13, 0, 0, 0, time.UTC)
	first := plantBackup(t, dir, afternoon)
	for i := 1; i < 5; i++ {
		plantBackup(t, dir, afternoon.Add(time.Duration(i)*17*time.Minute))
	}

	// Sweeping at the end of that same afternoon must remove NOTHING. A
	// keep-3-most-recent policy would have deleted `first` here — silently, on
	// the same day, and it is the only one that matters.
	removed, err := SweepBackups(dir, afternoon.Add(3*time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	if len(removed) != 0 {
		t.Fatalf("a same-day retry burst must not be trimmed, removed %d", len(removed))
	}
	got := stamps(t, dir)
	if len(got) != 5 {
		t.Fatalf("backups = %d, want 5", len(got))
	}
	if got[len(got)-1] != first {
		t.Fatalf("the oldest surviving backup = %q, want the pre-session one %q", got[len(got)-1], first)
	}
}

// ---------------------------------------------------------------------------
// AGE DECIDES, COUNT ONLY PROTECTS.
// ---------------------------------------------------------------------------

func TestAgeExpiresBackupsButTheCountFloorAlwaysWins(t *testing.T) {
	testkit.Cover(t, "arch-243-backup-retention")
	dir := t.TempDir()
	base := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	// Eight backups, one per month — every one of them far past the TTL when
	// the sweep runs.
	planted := []string{}
	for i := range 8 {
		planted = append(planted, plantBackup(t, dir, base.AddDate(0, i, 0)))
	}
	now := base.AddDate(3, 0, 0)

	removed, err := SweepBackups(dir, now)
	if err != nil {
		t.Fatal(err)
	}
	if len(removed) != 8-backupMinKeep {
		t.Fatalf("removed %d, want %d (8 minus the floor of %d)", len(removed), 8-backupMinKeep, backupMinKeep)
	}
	got := stamps(t, dir)
	if len(got) != backupMinKeep {
		t.Fatalf("survivors = %d, want the floor %d", len(got), backupMinKeep)
	}
	// The survivors are the NEWEST ones, and the sidecars went with the zips.
	for i := range backupMinKeep {
		want := planted[len(planted)-1-i]
		if got[i] != want {
			t.Fatalf("survivor %d = %q, want %q", i, got[i], want)
		}
	}
	side := filepath.Join(migrationPath(dir, backupsSubdir), planted[0]+".json")
	if _, err := os.Stat(side); !os.IsNotExist(err) {
		t.Fatalf("the sidecar of an expired backup must go with it, stat err = %v", err)
	}
}

func TestABackupInsideTheTTLSurvivesNoMatterHowManyThereAre(t *testing.T) {
	testkit.Cover(t, "arch-243-backup-retention")
	dir := t.TempDir()
	base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	for i := range 20 {
		plantBackup(t, dir, base.Add(time.Duration(i)*time.Hour))
	}
	// One day later: all twenty are young. Nothing is a candidate, because the
	// count is deliberately NOT a ceiling — running out of disk is a loud,
	// pre-write, fail-closed refusal (EnsureSpace), while evicting an undo is
	// silent and permanent.
	removed, err := SweepBackups(dir, base.AddDate(0, 0, 1))
	if err != nil {
		t.Fatal(err)
	}
	if len(removed) != 0 {
		t.Fatalf("removed %d young backups, want 0", len(removed))
	}
	if n := len(stamps(t, dir)); n != 20 {
		t.Fatalf("survivors = %d, want 20", n)
	}
}

// ---------------------------------------------------------------------------
// THE TWO ABSOLUTE RULES.
// ---------------------------------------------------------------------------

func TestTheOnlyBackupIsNeverSwept(t *testing.T) {
	testkit.Cover(t, "arch-243-retention-last")
	dir := t.TempDir()
	only := plantBackup(t, dir, time.Date(2020, 3, 1, 9, 0, 0, 0, time.UTC))

	// The verifier's own reproduction: a clock a year in the future. Now it
	// removes expired backups — but never this one, at any age, because the
	// count floor is checked before the age is.
	for _, now := range []time.Time{
		time.Date(2021, 3, 1, 9, 0, 0, 0, time.UTC),
		time.Date(2099, 3, 1, 9, 0, 0, 0, time.UTC),
	} {
		removed, err := SweepBackups(dir, now)
		if err != nil {
			t.Fatal(err)
		}
		if len(removed) != 0 {
			t.Fatalf("at %s the sweep removed the ONLY backup", now)
		}
		if got := stamps(t, dir); len(got) != 1 || got[0] != only {
			t.Fatalf("the only backup must survive, got %v", got)
		}
	}
}

func TestAnInFlightImportsBackupIsNeverSwept(t *testing.T) {
	testkit.Cover(t, "arch-243-retention-inflight")
	// The guarantee falls out of the shape of the policy rather than out of a
	// separate knob: a running import's backup is by construction the newest on
	// disk, and the newest backupMinKeep are never candidates.
	f := newFixture(t)
	old := time.Date(2019, 1, 1, 0, 0, 0, 0, time.UTC)
	for i := range 6 {
		plantBackup(t, f.dir, old.AddDate(0, i, 0))
	}
	at := time.Date(2026, 7, 26, 14, 3, 11, 0, time.UTC)

	info, err := BackupTarget(BackupOptions{
		DataDir: f.dir,
		Reason:  "匯入前（測試）",
		Now:     func() time.Time { return at },
	})
	if err != nil {
		t.Fatal(err)
	}
	// BackupTarget trims as part of its own housekeeping…
	if _, err := os.Stat(info.Path); err != nil {
		t.Fatalf("BackupTarget's own sweep removed the backup it had just taken: %v", err)
	}
	// …and so does an unrelated sweep running with a clock years ahead, which
	// is the scenario where a naive age-only rule would delete the undo out
	// from under an import that is still writing.
	if _, err := SweepBackups(f.dir, at.AddDate(5, 0, 0)); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(info.Path); err != nil {
		t.Fatalf("a far-future sweep removed the in-flight backup: %v", err)
	}
	if _, err := os.Stat(info.ManifestPath); err != nil {
		t.Fatalf("the in-flight backup's sidecar went missing: %v", err)
	}
}

// ---------------------------------------------------------------------------
// THE SWEEP THE VERIFIER RAN — it now has a backups branch.
// ---------------------------------------------------------------------------

func TestTheSharedSweepCoversBackupsNotOnlyStaging(t *testing.T) {
	testkit.Cover(t, "arch-243-backup-retention")
	dir := t.TempDir()
	base := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	for i := range 5 {
		plantBackup(t, dir, base.AddDate(0, i, 0))
	}
	// SweepStaging alone still means what its name says: staging only.
	if err := SweepStaging(dir, base.AddDate(1, 0, 0)); err != nil {
		t.Fatal(err)
	}
	if n := len(stamps(t, dir)); n != 5 {
		t.Fatalf("SweepStaging must not touch backups, survivors = %d", n)
	}
	// Sweep is the entry point boot and stage call, and it covers both.
	if err := Sweep(dir, base.AddDate(1, 0, 0)); err != nil {
		t.Fatal(err)
	}
	if n := len(stamps(t, dir)); n != backupMinKeep {
		t.Fatalf("Sweep left %d backups, want the floor %d", n, backupMinKeep)
	}
}

// ---------------------------------------------------------------------------
// WHY ANY OF THIS MATTERS.
// ---------------------------------------------------------------------------

func TestARetainedBackupReallyIsACredentialDump(t *testing.T) {
	f := newFixture(t)
	at := time.Date(2026, 7, 26, 14, 3, 11, 0, time.UTC)
	info, err := BackupTarget(BackupOptions{
		DataDir: f.dir, Now: func() time.Time { return at },
		Reason: "匯入前（測試）",
	})
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(info.Path)
	if err != nil {
		t.Fatal(err)
	}
	zr, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, file := range zr.File {
		rc, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		body, err := io.ReadAll(rc)
		_ = rc.Close()
		if err != nil {
			t.Fatal(err)
		}
		if bytes.Contains(body, []byte("$argon2id$")) {
			found = true
		}
	}
	if !found {
		t.Fatal("a pre-import backup no longer carries password hashes — " +
			"if that is deliberate, the retention and the UI warnings need revisiting, not deleting")
	}
	// And the file itself says so, for whoever finds it on a disk with no
	// console in front of them.
	side, err := os.ReadFile(info.ManifestPath)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(side, []byte("argon2id")) {
		t.Fatal("the sidecar must state what the zip contains")
	}
}

// ---------------------------------------------------------------------------
// FILE MODES — asserted, not inherited from jsonstore's reputation.
// ---------------------------------------------------------------------------

func TestBackupFilesAndDirectoriesAreNotReadableByOthers(t *testing.T) {
	testkit.Cover(t, "arch-243-backup-modes")
	f := newFixture(t)
	// Plant the trap first: a _migration created wide by an older build, a
	// human's mkdir, or a restored tarball. MkdirAll is a no-op on it, so
	// without an explicit chmod it would stay 0777 while holding credentials.
	wide := migrationPath(f.dir, backupsSubdir)
	if err := os.MkdirAll(wide, 0o777); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(migrationPath(f.dir), 0o777); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(wide, 0o777); err != nil {
		t.Fatal(err)
	}

	at := time.Date(2026, 7, 26, 14, 3, 11, 0, time.UTC)
	info, err := BackupTarget(BackupOptions{
		DataDir: f.dir, Now: func() time.Time { return at }, Reason: "mode test",
	})
	if err != nil {
		t.Fatal(err)
	}

	// The modes are EXACT, not "at most": both files are written through
	// WithStaticPermissions (an explicit chmod), and both directories are
	// chmod'ed after MkdirAll — so neither depends on the ambient umask, which
	// is exactly why they can be asserted precisely here.
	for _, p := range []string{migrationPath(f.dir), wide} {
		st, err := os.Stat(p)
		if err != nil {
			t.Fatal(err)
		}
		if got := st.Mode().Perm(); got != backupDirMode {
			t.Errorf("%s mode = %04o, want %04o", p, got, backupDirMode)
		}
	}
	for _, p := range []string{info.Path, info.ManifestPath} {
		st, err := os.Stat(p)
		if err != nil {
			t.Fatal(err)
		}
		if got := st.Mode().Perm(); got != backupFileMode {
			t.Errorf("%s mode = %04o, want %04o", p, got, backupFileMode)
		}
		if st.Mode().Perm()&0o007 != 0 {
			t.Errorf("%s is readable by other — it contains every password hash on the host", p)
		}
	}
}

func TestABackupNeverTransitsTheSharedTempDir(t *testing.T) {
	testkit.Cover(t, "arch-243-backup-tmpdir")
	// renameio, left to itself, probes whether os.TempDir() is on the same
	// mount as the destination and — when it is — stages the pending file
	// THERE before renaming it into place. A complete password database must
	// not appear in a world-listable /tmp, however briefly.
	//
	// This is asserted WHILE the file is open, not afterwards: the pending file
	// is renamed away on success, so a post-hoc "is /tmp empty" check would
	// pass whether or not the credentials ever passed through it. Where the
	// bytes were written is the question, and only the open handle can answer.
	dir := t.TempDir()
	probe := t.TempDir()
	t.Setenv("TMPDIR", probe)

	var pendingDir string
	var pendingMode os.FileMode
	err := writeBackupFile(dir, filepath.Join(dir, "20260726-140311Z.zip"), func(f *renameio.PendingFile) error {
		pendingDir = filepath.Dir(f.Name())
		st, err := f.Stat()
		if err != nil {
			return err
		}
		pendingMode = st.Mode().Perm()
		_, err = f.Write([]byte("PK\x05\x06"))
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	if pendingDir != dir {
		t.Fatalf("the pending backup was staged in %q, not in the backups dir %q", pendingDir, dir)
	}
	// And it is already 0640 in flight, not only after the rename.
	if pendingMode != backupFileMode {
		t.Fatalf("the in-flight backup mode = %04o, want %04o", pendingMode, backupFileMode)
	}
}

// ---------------------------------------------------------------------------
// DELIBERATE REMOVAL — the operator's half of the answer.
// ---------------------------------------------------------------------------

func TestDeleteBackupTakesAStampAndNeverAPath(t *testing.T) {
	testkit.Cover(t, "arch-243-backup-delete")
	dir := t.TempDir()
	stamp := plantBackup(t, dir, time.Date(2026, 7, 26, 14, 3, 11, 0, time.UTC))
	other := t.TempDir()
	victim := filepath.Join(other, "secret.zip")
	if err := os.WriteFile(victim, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}

	for _, bad := range []string{
		"..", "../../etc/passwd", "20260726-140311Z/../../x", stamp + ".zip",
		"", "20260726-140311", "not-a-stamp-at-all", "20261326-140311Z",
		filepath.Join("..", "..", filepath.Base(other), "secret"),
	} {
		if _, err := DeleteBackup(dir, bad); err == nil {
			t.Fatalf("DeleteBackup accepted %q", bad)
		}
	}
	if _, err := os.Stat(victim); err != nil {
		t.Fatalf("a file outside the backups dir was touched: %v", err)
	}

	// The real stamp works, and takes the sidecar with it — including when it
	// is the LAST backup, which the automatic sweep may never do but a human
	// pressing 刪除 must be able to.
	b, err := DeleteBackup(dir, stamp)
	if err != nil {
		t.Fatal(err)
	}
	if b.Stamp != stamp {
		t.Fatalf("deleted %q, want %q", b.Stamp, stamp)
	}
	if n := len(stamps(t, dir)); n != 0 {
		t.Fatalf("survivors = %d, want 0 — a deliberate delete must be able to clear the pile", n)
	}
	if _, err := DeleteBackup(dir, stamp); err == nil {
		t.Fatal("deleting the same backup twice must report ErrNoBackup")
	}
}

// ---------------------------------------------------------------------------
// VISIBILITY — the list has to say which one to restore.
// ---------------------------------------------------------------------------

func TestListBackupsSaysWhatEachOneWasTakenBefore(t *testing.T) {
	testkit.Cover(t, "arch-243-backup-visibility")
	f := newFixture(t)
	at := time.Date(2026, 7, 26, 14, 3, 11, 0, time.UTC)
	if _, err := BackupTarget(BackupOptions{
		DataDir: f.dir, Now: func() time.Time { return at },
		Reason: "匯入「ggd-old」於 2026-07-01 09:00 UTC 匯出的封存（420 個檔案）之前",
	}); err != nil {
		t.Fatal(err)
	}
	list, err := ListBackups(f.dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 {
		t.Fatalf("backups = %d, want 1", len(list))
	}
	b := list[0]
	if !strings.Contains(b.Reason, "ggd-old") {
		t.Fatalf("Reason = %q — the list must say what the backup was taken before", b.Reason)
	}
	if b.Entries == 0 {
		t.Fatal("Entries = 0 — the console shows how much a backup holds, and the fixture is not empty")
	}
	if b.Stamp != at.Format(backupStampLayout) {
		t.Fatalf("Stamp = %q, want %q", b.Stamp, at.Format(backupStampLayout))
	}
	if BackupBytes(list) != b.Bytes {
		t.Fatal("BackupBytes must total the pile")
	}
	// A backup whose sidecar was lost still has to appear — an undiscoverable
	// credential dump is the failure this listing exists to prevent.
	if err := os.Remove(b.ManifestPath); err != nil {
		t.Fatal(err)
	}
	again, err := ListBackups(f.dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(again) != 1 || again[0].Stamp != b.Stamp {
		t.Fatalf("a backup with no sidecar dropped out of the list: %v", again)
	}
}

func TestRetentionPolicyIsReportedInTheSameNumbersItEnforces(t *testing.T) {
	testkit.Cover(t, "arch-243-retention-reported")
	r := Retention()
	if r.MinKeep != backupMinKeep {
		t.Fatalf("MinKeep = %d, want %d", r.MinKeep, backupMinKeep)
	}
	if want := int(backupTTL / (24 * time.Hour)); r.TTLDays != want {
		t.Fatalf("TTLDays = %d, want %d", r.TTLDays, want)
	}
	if r.MinKeep < 1 {
		t.Fatal("MinKeep below 1 would let the sweep empty the directory")
	}
	// The floor must be able to hold one retry burst, which is the whole reason
	// count-based eviction is not the primary rule.
	if r.MinKeep < 3 {
		t.Fatal("MinKeep below 3 cannot hold an afternoon's retries")
	}
}
