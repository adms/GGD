package platformarchive

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// StageTTL is how long an uploaded archive survives before it is swept.
const StageTTL = 24 * time.Hour

// ErrStageBusy is returned when a DIFFERENT archive is already staged.
var ErrStageBusy = errors.New("platformarchive: another archive is already staged")

// ErrNoStage is returned when a stageId does not resolve.
var ErrNoStage = errors.New("platformarchive: no such staged archive")

// Stage is one uploaded archive waiting for a plan or a commit.
type Stage struct {
	// ID is the sha256 of the uploaded bytes. Using the content hash as the id
	// makes re-uploading the SAME file idempotent instead of filling the disk.
	ID         string    `json:"id"`
	Path       string    `json:"path"`
	Bytes      int64     `json:"bytes"`
	UploadedAt time.Time `json:"uploadedAt"`
	ExpiresAt  time.Time `json:"expiresAt"`
}

func stagingDir(dataDir string) string { return migrationPath(dataDir, stagingSubdir) }

// stageIDRe keeps a caller-supplied stage id from ever reaching the filesystem
// as anything but 64 lowercase hex characters.
func validStageID(id string) bool {
	if len(id) != 64 {
		return false
	}
	for _, r := range id {
		if !(r >= '0' && r <= '9') && !(r >= 'a' && r <= 'f') {
			return false
		}
	}
	return true
}

// SweepStaging removes expired uploads. Called at boot and before each stage.
func SweepStaging(dataDir string, now time.Time) error {
	dir := stagingDir(dataDir)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	for _, e := range entries {
		info, err := e.Info()
		if err != nil {
			continue
		}
		age := now.Sub(info.ModTime())
		switch {
		case strings.HasPrefix(e.Name(), ".incoming-") && age > time.Hour:
			// An abandoned upload (client hung up mid-stream).
			_ = os.Remove(filepath.Join(dir, e.Name()))
		case strings.HasSuffix(e.Name(), ".zip") && age > StageTTL:
			// An archive is a credential-bearing file. It does not live on the
			// host indefinitely because somebody forgot to press 丟棄.
			_ = os.Remove(filepath.Join(dir, e.Name()))
		}
	}
	return nil
}

// CurrentStage returns the single live staging slot, if any.
func CurrentStage(dataDir string, now time.Time) (*Stage, error) {
	dir := stagingDir(dataDir)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".zip") {
			continue
		}
		id := strings.TrimSuffix(name, ".zip")
		if !validStageID(id) {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		if now.Sub(info.ModTime()) > StageTTL {
			continue
		}
		return &Stage{
			ID: id, Path: filepath.Join(dir, name), Bytes: info.Size(),
			UploadedAt: info.ModTime().UTC(), ExpiresAt: info.ModTime().Add(StageTTL).UTC(),
		}, nil
	}
	return nil, nil
}

// StageUpload streams an upload into the single staging slot.
//
// The bytes are hashed WHILE being written, so the stage id is the content hash
// and nothing has to be re-read to compute it. It writes into _migration only —
// no collection is touched, which is what lets stage be a safe operation for an
// operator to perform before deciding anything.
func StageUpload(dataDir string, body io.Reader, declaredLen int64, now time.Time) (*Stage, error) {
	dir := stagingDir(dataDir)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return nil, err
	}
	// Sweep, not SweepStaging: an upload is the moment an operator is about to
	// create ANOTHER credential-bearing file under _migration, which makes it
	// the right moment to expire the ones that are past their retention.
	if err := Sweep(dataDir, now); err != nil {
		return nil, err
	}

	// Disk pre-flight BEFORE the upload lands: the staged copy plus the backup
	// this import will later want. Refusing here costs the operator an upload;
	// refusing later costs them a full-disk host.
	if declaredLen > 0 {
		if err := EnsureSpace(dir, declaredLen); err != nil {
			return nil, err
		}
	}

	// The final name is the CONTENT HASH, which is not known until the last
	// byte has arrived — so this writes a `.incoming-*` temp file and renames.
	// (renameio's PendingFile binds its destination at construction time and
	// cannot be redirected, hence the hand-rolled temp+rename here. The mode is
	// set explicitly for the same reason jsonstore.writeAtomic does it.)
	tmp, err := os.CreateTemp(dir, ".incoming-*.tmp")
	if err != nil {
		return nil, err
	}
	tmpName := tmp.Name()
	committed := false
	defer func() {
		_ = tmp.Close()
		if !committed {
			_ = os.Remove(tmpName)
		}
	}()
	if err := tmp.Chmod(0o640); err != nil {
		return nil, err
	}

	sum := sha256.New()
	n, err := io.Copy(io.MultiWriter(tmp, sum), io.LimitReader(body, MaxUploadBytes+1))
	if err != nil {
		return nil, err
	}
	if n > MaxUploadBytes {
		return nil, fmt.Errorf("platformarchive: 上傳超過 %d bytes 的上限", int64(MaxUploadBytes))
	}
	if err := tmp.Sync(); err != nil {
		return nil, err
	}
	if err := tmp.Close(); err != nil {
		return nil, err
	}
	id := hex.EncodeToString(sum.Sum(nil))
	final := filepath.Join(dir, id+".zip")

	// One slot at a time. A DIFFERENT archive already staged is a conflict the
	// operator has to resolve explicitly — two people importing at once is the
	// one concurrency case with no safe merge.
	if cur, err := CurrentStage(dataDir, now); err != nil {
		return nil, err
	} else if cur != nil && cur.ID != id {
		return nil, fmt.Errorf("%w: 目前已有一包在 %s 上傳的封存（%s）等待處理。"+
			"請先用 DELETE /admin/platform-archive/stage/%s 丟棄它",
			ErrStageBusy, cur.UploadedAt.Format(time.RFC3339), cur.ID[:12], cur.ID)
	}

	if _, err := os.Stat(final); err == nil {
		// Re-uploading the same bytes: idempotent, keep the existing slot.
		return statStage(final, id)
	}
	if err := os.Rename(tmpName, final); err != nil {
		return nil, err
	}
	committed = true
	return statStage(final, id)
}

func statStage(path, id string) (*Stage, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	return &Stage{
		ID: id, Path: path, Bytes: info.Size(),
		UploadedAt: info.ModTime().UTC(), ExpiresAt: info.ModTime().Add(StageTTL).UTC(),
	}, nil
}

// OpenStage re-opens and RE-VERIFIES a staged archive. Commit calls this rather
// than trusting the verification done at stage time: the staged file lives on
// disk, and the probability of it having been touched in between is not zero.
func OpenStage(dataDir, id string) (*Archive, *Stage, error) {
	if !validStageID(id) {
		return nil, nil, ErrNoStage
	}
	path := filepath.Join(stagingDir(dataDir), id+".zip")
	st, err := statStage(path, id)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil, ErrNoStage
		}
		return nil, nil, err
	}
	a, err := Open(path)
	if err != nil {
		return nil, st, err
	}
	return a, st, nil
}

// DiscardStage removes a staged archive.
func DiscardStage(dataDir, id string) error {
	if !validStageID(id) {
		return ErrNoStage
	}
	// #nosec G703 -- `id` 在上面兩行就被 validStageID 擋過：長度必須剛好 64、
	// 每個字元必須落在 [0-9a-f]。`/`、`\`、`.`、`..`、NUL 全部進不來，所以
	// filepath.Join 的結果一定落在 stagingDir 底下。gosec 的 taint 分析追不進
	// validStageID（它回傳 bool 而不是 sanitized 字串），OpenStage 用同一個
	// 守衛、同一個 Join，只因為 sink 不是 os.Remove 就沒被標。
	err := os.Remove(filepath.Join(stagingDir(dataDir), id+".zip"))
	if err != nil && os.IsNotExist(err) {
		return ErrNoStage
	}
	return err
}
