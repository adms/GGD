package platformarchive

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/google/renameio/v2"
)

// MigrationDir is this feature's private working area under DATA_DIR.
//
// The leading underscore is load-bearing: jsonstore's segmentRe requires an
// alphanumeric FIRST character, so "_migration" can never be a valid collection
// name. Export therefore cannot read it, no archive entry can point into it,
// and a backup can never be swept into the next export. That is a structural
// guarantee, not a filter somebody has to maintain.
const MigrationDir = "_migration"

const (
	stagingSubdir = "staging"
	backupsSubdir = "backups"
)

// backupHeadroom is the fixed slack demanded on top of the estimate.
const backupHeadroom = 256 << 20 // 256 MiB

// backupSafetyFactor multiplies the estimate. 3× covers the archive being
// written, its temp file, and the ordinary churn of a live data dir.
const backupSafetyFactor = 3

// backupStampLayout is the file-name clock format AND the identity of a backup.
// It is second-resolution UTC, which is what makes a backup addressable by the
// console without ever putting an operator-supplied path near the filesystem.
const backupStampLayout = "20060102-150405Z"

// ---------------------------------------------------------------------------
// RETENTION — why these three numbers, and why they are shaped this way.
//
// A pre-import backup is a FULL CREDENTIAL DUMP: it contains every account
// document, and therefore every $argon2id$ hash on the host. Left alone, one is
// written per import and none is ever removed, so DATA_DIR slowly becomes a
// pile of complete password databases. That is the failure this policy exists
// to stop — not disk pressure, which on this deploy is a rounding error.
//
// HOW OFTEN DOES A MIGRATION HAPPEN HERE? This is a ~35-account private family
// deploy. Moving the host is a once-or-twice-a-YEAR event. But an import is
// RETRIED: upload, dry run, hit an identity collision, tick 以封存為準, commit,
// notice the whitelist was stale, commit again. So backups do not trickle in at
// a steady rate — they arrive in BURSTS of two to five within one afternoon,
// then nothing for months.
//
// HOW FAR BACK DOES AN OPERATOR NEED TO REACH? To the state BEFORE the session
// started. That is the OLDEST member of the burst; every later one already
// contains half of the import he is trying to undo.
//
// WHICH IS WHY KEEP-N-MOST-RECENT ALONE IS EXACTLY BACKWARDS. With N=3 and a
// five-attempt afternoon it evicts the pre-session snapshot FIRST, silently, on
// the same day, and what is left is three snapshots of the mess. The failure is
// invisible until the moment it matters and there is no way back from it.
//
// AGE-BASED EXPIRY ALONE has the opposite failure: the pile is unbounded. But
// look at what that degrades into here. EnsureSpace already refuses an import
// unless estimate*3 + 256 MiB is free, BEFORE a byte is written, with a 507 and
// a sentence naming the shortfall — and the console now lists every backup with
// a delete button. So "too many backups" surfaces as a loud, fail-closed,
// pre-write refusal with an obvious fix, while "N evicted my undo" surfaces as
// nothing at all until the day it is fatal.
//
// SO: AGE DECIDES, COUNT ONLY EVER PROTECTS. A backup is removed only when it
// is older than backupTTL *and* at least backupMinKeep newer ones survive it.
// Neither rule can ever remove the last backup, and the count floor is never a
// ceiling.
//
//   - backupTTL = 90 days. Past a quarter the host holds a quarter of new play
//     data, and restoring a pre-migration snapshot would destroy more than it
//     recovers; the migration is either long done or long abandoned. It also
//     comfortably survives "I moved the host in July and only noticed in
//     September". Sizing sanity: core here is on the order of 1 MB (35 accounts
//     plus invites, curation and combat-env), so a quarter's worth of imports
//     lives well inside the 256 MiB the pre-flight already demands as SLACK.
//   - backupMinKeep = 3. One burst's worth of retries plus the pre-session
//     snapshot, so the newest useful states never expire on age either.
//
// THE IN-FLIGHT GUARANTEE FALLS OUT OF THE SHAPE, it is not a separate knob: a
// running import's backup is BY CONSTRUCTION the newest on disk, so it is
// protected twice over — by the TTL (it is seconds old) and by the count floor
// (it is the newest, and the newest backupMinKeep are never candidates). That
// holds no matter how far the clock has drifted, which is what the sweep test
// pins with a clock a year in the future.
//
// (An empty backup — the fresh-host case — carries no credentials and no
// recovery value, so it is tempting to expire it faster. Deliberately not done:
// one rule an operator can hold in his head beats two rules that interact.)
const (
	backupTTL     = 90 * 24 * time.Hour
	backupMinKeep = 3
)

// BackupRetention is the policy, exported so the console can state it in the
// same numbers the sweep enforces instead of hard-coding a second copy.
type BackupRetention struct {
	// TTLDays is how old a backup must be before it is even a candidate.
	TTLDays int `json:"ttlDays"`
	// MinKeep is how many of the newest are never candidates at any age.
	MinKeep int `json:"minKeep"`
}

// Retention returns the live policy.
func Retention() BackupRetention {
	return BackupRetention{TTLDays: int(backupTTL / (24 * time.Hour)), MinKeep: backupMinKeep}
}

// BackupInfo describes one automatic pre-write backup.
type BackupInfo struct {
	// Stamp is the backup's identity — the UTC second it was taken, and the
	// ONLY handle the HTTP surface accepts. A path never travels inbound.
	Stamp        string    `json:"stamp"`
	Path         string    `json:"path"`
	ManifestPath string    `json:"manifestPath"`
	CreatedAt    time.Time `json:"createdAt"`
	Bytes        int64     `json:"bytes"`
	Entries      int       `json:"entries"`
	Groups       []string  `json:"groups"`
	// Reason says WHAT THIS WAS TAKEN BEFORE, in the operator's language. A
	// list of timestamps is not something anybody can act on; "before importing
	// the archive exported from ggd-old at …" is.
	Reason string `json:"reason,omitempty"`
	// Empty is true when the target had nothing to back up — the PRIMARY
	// migration scenario, where the safety net costs nothing.
	Empty bool `json:"empty"`
}

func migrationPath(dataDir string, parts ...string) string {
	return filepath.Join(append([]string{dataDir, MigrationDir}, parts...)...)
}

// backupFileMode / backupDirMode are jsonstore's numbers, RE-STATED rather than
// inherited: nothing in jsonstore owns _migration, so "it is 0640 because
// jsonstore writes 0640" would be a claim about a different code path.
const (
	backupFileMode os.FileMode = 0o640
	backupDirMode  os.FileMode = 0o750
)

// ensureBackupDir creates <data>/_migration/backups and PINS the mode of both
// levels every single time.
//
// The chmod is not redundant with MkdirAll. MkdirAll applies the mode only to
// directories it actually creates, and even then through the umask; on a
// directory that already exists it is a no-op. So a _migration created wide by
// an older build, by a human's `mkdir -p`, or by a `tar -x` that restored a
// 0777 mode would stay wide forever — while holding full credential dumps.
// Re-asserting 0750 on every backup is one syscall and closes that off.
func ensureBackupDir(dataDir string) (string, error) {
	dir := migrationPath(dataDir, backupsSubdir)
	if err := os.MkdirAll(dir, backupDirMode); err != nil {
		return "", err
	}
	for _, p := range []string{migrationPath(dataDir), dir} {
		if err := os.Chmod(p, backupDirMode); err != nil {
			return "", err
		}
	}
	return dir, nil
}

// writeBackupFile writes one backup artefact atomically at exactly 0640.
//
// TWO deliberate options, both of which renameio.WriteFile gets wrong for this
// path:
//
//   - WithStaticPermissions is the only option that actually ENFORCES a mode.
//     renameio.WriteFile applies WithPermissions+WithExistingPermissions, which
//     is umask-dependent on a new file and copies the mode off an existing one
//     — the exact trap apply.go's writeStatic already documents. This file is a
//     credential dump; its mode may not depend on the ambient umask.
//   - WithTempDir keeps the pending file INSIDE the backups directory. Without
//     it renameio probes whether os.TempDir() is on the same mount and, when it
//     is, stages the file in a shared /tmp before renaming it into place. A
//     complete password database must not transit a world-listable directory,
//     however briefly.
func writeBackupFile(dir, path string, write func(f *renameio.PendingFile) error) error {
	pending, err := renameio.NewPendingFile(path,
		renameio.WithTempDir(dir),
		renameio.WithStaticPermissions(backupFileMode))
	if err != nil {
		return err
	}
	defer func() { _ = pending.Cleanup() }()
	if err := write(pending); err != nil {
		return err
	}
	return pending.CloseAtomicallyReplace()
}

// ErrNoSpace is returned when the pre-flight cannot prove there is room.
type ErrNoSpace struct {
	Need, Have int64
	Unknown    bool
}

func (e *ErrNoSpace) Error() string {
	if e.Unknown {
		return "platformarchive: 這個平台無法查詢磁碟餘量，因此拒絕匯入 —— " +
			"半寫的備份比匯入失敗更糟，所以這裡刻意 fail-closed"
	}
	return fmt.Sprintf(
		"platformarchive: 磁碟空間不足：需要約 %d bytes（含備份與安全係數），目前只有 %d bytes，差 %d bytes",
		e.Need, e.Have, e.Need-e.Have)
}

// EnsureSpace refuses when the estimate plus headroom does not fit.
func EnsureSpace(dir string, estimate int64) error {
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return err
	}
	have, ok := FreeBytes(dir)
	if !ok {
		return &ErrNoSpace{Unknown: true}
	}
	need := estimate*backupSafetyFactor + backupHeadroom
	if have < need {
		return &ErrNoSpace{Need: need, Have: have}
	}
	return nil
}

// BackupOptions parameterise BackupTarget. A struct rather than eight positional
// arguments, because the two that matter most (Reason, Now) would otherwise be
// the two easiest to pass in the wrong order.
type BackupOptions struct {
	DataDir    string
	ContentDir string
	ReplayDir  string
	// Groups is what the import will touch; core is always added.
	Groups          []string
	PlatformVersion string
	// Reason states WHAT THIS IS BEING TAKEN BEFORE, in the operator's own
	// language. It is stored in the sidecar and shown on the console, because a
	// bare list of timestamps tells nobody which one to restore.
	Reason string
	Now    func() time.Time
}

// BackupTarget writes a pre-import snapshot of the target host, in the SAME
// format, covering every group the import will touch plus core.
//
// On the primary scenario (a fresh host with an empty data/) this produces an
// essentially empty file: the safety net is free on the day it is not needed
// and paid for only in the dangerous overwrite case.
//
// It also trims the pile afterwards (see the retention comment above). The
// trim runs AFTER the new backup is on disk and never touches it — the newest
// backupMinKeep are not candidates — so an import in flight cannot lose its own
// undo to its own housekeeping.
func BackupTarget(opts BackupOptions) (*BackupInfo, error) {
	now := opts.Now
	if now == nil {
		now = time.Now
	}
	at := now().UTC()
	dir, err := ensureBackupDir(opts.DataDir)
	if err != nil {
		return nil, err
	}

	// Size the target first so the space pre-flight has a real number, and
	// REFUSE before writing a single byte if it will not fit.
	pv, err := BuildPreview(ExportOptions{DataDir: opts.DataDir, ReplayDir: opts.ReplayDir, Groups: opts.Groups})
	if err != nil {
		return nil, err
	}
	want := map[string]bool{}
	norm, err := NormalizeGroups(opts.Groups)
	if err != nil {
		return nil, err
	}
	for _, g := range norm {
		want[g] = true
	}
	var estimate int64
	for _, row := range pv.Groups {
		if want[row.Group] {
			estimate += row.Bytes
		}
	}
	if err := EnsureSpace(dir, estimate); err != nil {
		return nil, err
	}

	stamp := at.Format(backupStampLayout)
	zipPath := filepath.Join(dir, stamp+".zip")
	jsonPath := filepath.Join(dir, stamp+".json")

	var rep *ExportReport
	err = writeBackupFile(dir, zipPath, func(f *renameio.PendingFile) error {
		var exportErr error
		rep, exportErr = Export(f, ExportOptions{
			DataDir:         opts.DataDir,
			ContentDir:      opts.ContentDir,
			ReplayDir:       opts.ReplayDir,
			Groups:          norm,
			PlatformVersion: opts.PlatformVersion,
			Now:             func() time.Time { return at },
			Tool:            "platformarchive/1 (pre-import backup)",
		})
		return exportErr
	})
	if err != nil {
		return nil, fmt.Errorf("platformarchive: 備份失敗，因此一個位元組都沒有寫入：%w", err)
	}
	st, err := os.Stat(zipPath)
	if err != nil {
		return nil, err
	}
	info := &BackupInfo{
		Stamp: stamp,
		Path:  zipPath, ManifestPath: jsonPath, CreatedAt: at,
		Bytes: st.Size(), Entries: rep.Entries, Groups: norm,
		Reason: opts.Reason,
		Empty:  rep.Entries == 0,
	}
	summary, err := json.MarshalIndent(map[string]any{
		"createdAt":   at,
		"groups":      norm,
		"entries":     rep.Entries,
		"bytes":       rep.Bytes,
		"reason":      opts.Reason,
		"collections": rep.Collections,
		"contains":    backupContainsWarning,
		// The command and the two honesty lists come from restore.go so this
		// file, the runbook, the CLI and the console cannot drift apart. The
		// command used to be spelled out here WITHOUT
		// -resolve-collisions=adopt-archive, which is refused (zero writes) in
		// the one case an operator most needs it — see RestoreCommand.
		"restoreWith":     RestoreCommand(filepath.Base(zipPath)),
		"restoreRecovers": RestoreRecovers,
		"restoreLimits":   RestoreLimits,
	}, "", "  ")
	if err != nil {
		return nil, err
	}
	err = writeBackupFile(dir, jsonPath, func(f *renameio.PendingFile) error {
		_, writeErr := f.Write(append(summary, '\n'))
		return writeErr
	})
	if err != nil {
		return nil, err
	}

	// Housekeeping is best-effort on purpose: a backup that succeeded must not
	// be turned into a failed import because an old file could not be unlinked.
	if removed, err := SweepBackups(opts.DataDir, at); err != nil {
		slog.Warn("platformarchive: backup retention sweep failed", "err", err)
	} else if len(removed) > 0 {
		slog.Info("platformarchive: expired backups removed",
			"count", len(removed), "ttlDays", Retention().TTLDays, "minKeep", backupMinKeep)
	}
	return info, nil
}

// backupContainsWarning is written INTO the sidecar, not only shown in the UI:
// the person who finds one of these files six months from now, on a disk, with
// no console in front of them, is exactly the person who needs to be told.
const backupContainsWarning = "此檔含全部帳號文件與 argon2id 密碼雜湊，等同整個平台的憑證。請當作機密處理。"

// backupSidecar is the subset of the sidecar the console re-reads.
type backupSidecar struct {
	Entries int      `json:"entries"`
	Groups  []string `json:"groups"`
	Reason  string   `json:"reason"`
}

// ListBackups enumerates existing backups, newest first.
//
// The sidecar is re-read (not just stat'd) so the console can say WHAT each
// backup was taken before. A missing or unreadable sidecar degrades to the
// timestamp alone rather than dropping the backup from the list — an
// undiscoverable credential dump is the failure this whole listing exists to
// prevent, so nothing may hide a file from it.
//
// That is also why a .zip whose name is NOT a stamp (somebody copied a file in
// here by hand) is still listed, with ModTime standing in for CreatedAt: it is
// a zip sitting in the backups directory and the operator has to be able to see
// it. It cannot be removed through the HTTP surface, because DeleteBackup
// re-parses the stamp and nothing else gets past that — one such file needing
// `rm` on the host is a far better trade than loosening the only thing standing
// between this route and an arbitrary unlink.
func ListBackups(dataDir string) ([]BackupInfo, error) {
	dir := migrationPath(dataDir, backupsSubdir)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return []BackupInfo{}, nil
		}
		return nil, err
	}
	out := []BackupInfo{}
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".zip") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		stamp := strings.TrimSuffix(name, ".zip")
		at, err := time.Parse(backupStampLayout, stamp)
		if err != nil {
			at = info.ModTime().UTC()
		}
		row := BackupInfo{
			Stamp:        stamp,
			Path:         filepath.Join(dir, name),
			ManifestPath: filepath.Join(dir, stamp+".json"),
			CreatedAt:    at.UTC(),
			Bytes:        info.Size(),
			Empty:        info.Size() < 1024,
		}
		var side backupSidecar
		if raw, err := os.ReadFile(row.ManifestPath); err == nil {
			if json.Unmarshal(raw, &side) == nil {
				row.Entries, row.Groups, row.Reason = side.Entries, side.Groups, side.Reason
			}
		}
		out = append(out, row)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out, nil
}

// BackupBytes totals what the pile currently holds, so the console can show a
// number rather than a list somebody has to add up.
func BackupBytes(list []BackupInfo) int64 {
	var n int64
	for _, b := range list {
		n += b.Bytes
	}
	return n
}

// expiredBackups selects what the retention policy removes, given a list that
// is already sorted newest-first.
//
// The two rules and their asymmetry are argued at length above the constants.
// In code they are one line each, and neither can ever empty the directory:
// index >= MinKeep is checked FIRST, so with MinKeep >= 1 the newest backup is
// never a candidate at any age — including the case where it is the only one.
func expiredBackups(list []BackupInfo, now time.Time, policy BackupRetention) []BackupInfo {
	ttl := time.Duration(policy.TTLDays) * 24 * time.Hour
	out := []BackupInfo{}
	for i, b := range list {
		if i < policy.MinKeep {
			continue
		}
		if now.Sub(b.CreatedAt) <= ttl {
			continue
		}
		out = append(out, b)
	}
	return out
}

// SweepBackups applies the retention policy and returns what it removed.
//
// Clock-injectable for the same reason SweepStaging is: a retention rule whose
// only test is "wait 90 days" is a retention rule with no test at all.
func SweepBackups(dataDir string, now time.Time) ([]BackupInfo, error) {
	list, err := ListBackups(dataDir)
	if err != nil {
		return nil, err
	}
	removed := []BackupInfo{}
	for _, b := range expiredBackups(list, now, Retention()) {
		if err := removeBackupFiles(b); err != nil {
			return removed, err
		}
		removed = append(removed, b)
	}
	return removed, nil
}

// removeBackupFiles drops the zip and its sidecar. A missing sidecar is not an
// error — the zip is what holds the credentials, and it is what must go.
func removeBackupFiles(b BackupInfo) error {
	if err := os.Remove(b.Path); err != nil && !os.IsNotExist(err) {
		return err
	}
	if err := os.Remove(b.ManifestPath); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// ErrNoBackup is returned when a stamp does not resolve to a backup.
var ErrNoBackup = errors.New("platformarchive: no such backup")

// validBackupStamp is the ONLY thing the delete route accepts from a caller.
//
// The stamp is re-parsed with the same layout that produced it, so anything
// that is not a real UTC second — "..", a path, a glob, a name with a slash in
// it — cannot even be spelled. No caller-supplied string ever reaches
// filepath.Join without passing through here first.
func validBackupStamp(stamp string) bool {
	if len(stamp) != len(backupStampLayout) {
		return false
	}
	_, err := time.Parse(backupStampLayout, stamp)
	return err == nil
}

// DeleteBackup removes ONE backup by stamp, on the operator's explicit
// instruction.
//
// Deliberately allowed to remove the last one. The automatic sweep must never
// leave the operator without an undo, but a human pressing 刪除 on the page is
// doing the thing this feature exists to make possible: getting a credential
// dump off the disk. Refusing to delete the final backup would mean the console
// could never actually clear them, which is the whole point.
func DeleteBackup(dataDir, stamp string) (*BackupInfo, error) {
	if !validBackupStamp(stamp) {
		return nil, ErrNoBackup
	}
	list, err := ListBackups(dataDir)
	if err != nil {
		return nil, err
	}
	for _, b := range list {
		if b.Stamp != stamp {
			continue
		}
		if err := removeBackupFiles(b); err != nil {
			return nil, err
		}
		return &b, nil
	}
	return nil, ErrNoBackup
}

// Sweep runs BOTH hygiene policies under _migration — staged uploads and
// pre-import backups. This is the entry point boot and stage use; the two
// halves stay separate so each can be tested against its own clock.
func Sweep(dataDir string, now time.Time) error {
	if err := SweepStaging(dataDir, now); err != nil {
		return err
	}
	_, err := SweepBackups(dataDir, now)
	return err
}
