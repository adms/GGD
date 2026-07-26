package platformarchive

import (
	"encoding/json"
	"fmt"
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

// BackupInfo describes one automatic pre-write backup.
type BackupInfo struct {
	Path         string    `json:"path"`
	ManifestPath string    `json:"manifestPath"`
	CreatedAt    time.Time `json:"createdAt"`
	Bytes        int64     `json:"bytes"`
	Entries      int       `json:"entries"`
	Groups       []string  `json:"groups"`
	// Empty is true when the target had nothing to back up — the PRIMARY
	// migration scenario, where the safety net costs nothing.
	Empty bool `json:"empty"`
}

func migrationPath(dataDir string, parts ...string) string {
	return filepath.Join(append([]string{dataDir, MigrationDir}, parts...)...)
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

// BackupTarget writes a pre-import snapshot of the target host, in the SAME
// format, covering every group the import will touch plus core.
//
// On the primary scenario (a fresh host with an empty data/) this produces an
// essentially empty file: the safety net is free on the day it is not needed
// and paid for only in the dangerous overwrite case.
func BackupTarget(dataDir, contentDir, replayDir string, groups []string, now func() time.Time, platformVersion string) (*BackupInfo, error) {
	if now == nil {
		now = time.Now
	}
	at := now().UTC()
	dir := migrationPath(dataDir, backupsSubdir)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return nil, err
	}

	// Size the target first so the space pre-flight has a real number, and
	// REFUSE before writing a single byte if it will not fit.
	pv, err := BuildPreview(ExportOptions{DataDir: dataDir, ReplayDir: replayDir, Groups: groups})
	if err != nil {
		return nil, err
	}
	want := map[string]bool{}
	norm, err := NormalizeGroups(groups)
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

	stamp := at.Format("20060102-150405") + "Z"
	zipPath := filepath.Join(dir, stamp+".zip")
	jsonPath := filepath.Join(dir, stamp+".json")

	pending, err := renameio.NewPendingFile(zipPath, renameio.WithStaticPermissions(0o640))
	if err != nil {
		return nil, err
	}
	defer func() { _ = pending.Cleanup() }()

	rep, err := Export(pending, ExportOptions{
		DataDir:         dataDir,
		ContentDir:      contentDir,
		ReplayDir:       replayDir,
		Groups:          norm,
		PlatformVersion: platformVersion,
		Now:             func() time.Time { return at },
		Tool:            "platformarchive/1 (pre-import backup)",
	})
	if err != nil {
		return nil, fmt.Errorf("platformarchive: 備份失敗，因此一個位元組都沒有寫入：%w", err)
	}
	if err := pending.CloseAtomicallyReplace(); err != nil {
		return nil, err
	}
	st, err := os.Stat(zipPath)
	if err != nil {
		return nil, err
	}
	info := &BackupInfo{
		Path: zipPath, ManifestPath: jsonPath, CreatedAt: at,
		Bytes: st.Size(), Entries: rep.Entries, Groups: norm,
		Empty: rep.Entries == 0,
	}
	summary, err := json.MarshalIndent(map[string]any{
		"createdAt":   at,
		"groups":      norm,
		"entries":     rep.Entries,
		"bytes":       rep.Bytes,
		"collections": rep.Collections,
		"restoreWith": "docker compose … exec -T platform /platformarchive apply -in - -data /data -content /srv/content -allow-overwrite < " + filepath.Base(zipPath),
	}, "", "  ")
	if err != nil {
		return nil, err
	}
	if err := renameio.WriteFile(jsonPath, append(summary, '\n'), 0o640); err != nil {
		return nil, err
	}
	return info, nil
}

// ListBackups enumerates existing backups, newest first.
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
		at, err := time.Parse("20060102-150405Z", stamp)
		if err != nil {
			at = info.ModTime().UTC()
		}
		out = append(out, BackupInfo{
			Path:         filepath.Join(dir, name),
			ManifestPath: filepath.Join(dir, stamp+".json"),
			CreatedAt:    at.UTC(),
			Bytes:        info.Size(),
			Empty:        info.Size() < 1024,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out, nil
}
