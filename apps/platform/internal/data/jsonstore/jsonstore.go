// Package jsonstore is the durable truth of the platform: one JSON file per
// object under DATA_DIR, written atomically (tmp+rename via renameio), guarded
// by sharded keyed mutexes, with a per-collection _index.json.
//
// Layout: <root>/<collection>/<id>.json plus <root>/<collection>/_index.json.
// Collections may be nested paths ("matches/2026/07", "rankings/s1").
package jsonstore

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/google/renameio/v2"

	"github.com/ggd/platform/internal/data/keyedmutex"
)

// ErrNotFound is returned by Get when the object file does not exist.
var ErrNotFound = errors.New("jsonstore: not found")

// ErrInvalidKey is returned for ids/collections that fail validation (path
// traversal, control chars, absolute paths, ...).
var ErrInvalidKey = errors.New("jsonstore: invalid key")

var (
	segmentRe = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$`)
	idRe      = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9@._-]{0,127}$`)
)

// dataFileMode is the mode every durable object file is written with. This tree
// is NOT world-readable on purpose: it holds argon2id password hashes
// (data/accounts/*.json), the plaintext AI provider key
// (data/config/ai-provider.json) and single-use invite codes (data/invites).
// Group read is kept deliberately rather than going to 0600 — the k8s seed Job
// shares the PVC under fsGroup 65532 (deploy/helm/ggd/templates/seed-job.yaml).
const dataFileMode os.FileMode = 0o640

// dataDirMode mirrors dataFileMode for the directories holding those files.
//
// NOTE for the operator: on the Linux family host these directories are owned by
// uid 65532 (the distroless platform user), so 0750 removes host-side traversal
// for a plain ssh session. The documented paths (`docker compose cp` / `exec`,
// i.e. Makefile family-token / family-restore) go through the daemon as root and
// are unaffected, but two host-side dev tools read data/curation/whitelist.json
// directly — tools/reference/gen_reference.py and gen_readme_lists.py — and will
// need `sudo` (or the 65532 group) on a FRESH deploy. MkdirAll only applies this
// mode to directories it actually creates, so an existing tree keeps its modes.
const dataDirMode os.FileMode = 0o750

// writeAtomic replaces path with data atomically, ENFORCING mode.
//
// renameio.WriteFile deliberately cannot do this: it always applies
// WithExistingPermissions, which copies the mode off an already-existing target
// and silently overrides the mode argument (renameio/v2@v2.0.2 tempfile.go:278-284
// assigns cfg.chmod from the existing file). Every account doc written before this
// sweep is 0644 on disk, so renameio.WriteFile(…, 0o640) would leave them 0644
// forever and the tightening would be cosmetic. WithStaticPermissions is the
// option that actually re-tightens the file on its next rewrite.
func writeAtomic(path string, data []byte, mode os.FileMode) error {
	t, err := renameio.NewPendingFile(path, renameio.WithStaticPermissions(mode))
	if err != nil {
		return err
	}
	defer t.Cleanup()
	if _, err := t.Write(data); err != nil {
		return err
	}
	return t.CloseAtomicallyReplace()
}

// Store is an atomic JSON-per-object file store rooted at a directory.
type Store struct {
	root  string
	locks *keyedmutex.M
}

// New creates (if needed) the root directory and returns a Store.
func New(root string) (*Store, error) {
	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(abs, dataDirMode); err != nil {
		return nil, err
	}
	return &Store{root: abs, locks: keyedmutex.New()}, nil
}

// Root returns the absolute root directory.
func (s *Store) Root() string { return s.root }

func validCollection(collection string) bool {
	if collection == "" || strings.Contains(collection, "..") {
		return false
	}
	for _, seg := range strings.Split(collection, "/") {
		if !segmentRe.MatchString(seg) {
			return false
		}
	}
	return true
}

func validID(id string) bool {
	return idRe.MatchString(id) && !strings.Contains(id, "..")
}

func (s *Store) resolve(collection, id, ext string) (string, error) {
	if !validCollection(collection) || !validID(id) {
		return "", fmt.Errorf("%w: %q/%q", ErrInvalidKey, collection, id)
	}
	p := filepath.Join(s.root, filepath.FromSlash(collection), id+ext)
	// Defense in depth: the resolved path must stay inside the root.
	if rel, err := filepath.Rel(s.root, p); err != nil || strings.HasPrefix(rel, "..") {
		return "", fmt.Errorf("%w: escapes root", ErrInvalidKey)
	}
	return p, nil
}

// Path returns the absolute file path an object would live at.
func (s *Store) Path(collection, id string) (string, error) {
	return s.resolve(collection, id, ".json")
}

// Put atomically writes v as <collection>/<id>.json and updates the
// collection index.
func (s *Store) Put(collection, id string, v any) error {
	path, err := s.resolve(collection, id, ".json")
	if err != nil {
		return err
	}
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return fmt.Errorf("jsonstore: marshal %s/%s: %w", collection, id, err)
	}
	data = append(data, '\n')

	unlock := s.locks.Lock(collection + "/" + id)
	if err := os.MkdirAll(filepath.Dir(path), dataDirMode); err != nil {
		unlock()
		return err
	}
	err = writeAtomic(path, data, dataFileMode)
	unlock()
	if err != nil {
		return fmt.Errorf("jsonstore: write %s/%s: %w", collection, id, err)
	}
	return s.updateIndex(collection, id, false)
}

// Get reads <collection>/<id>.json into v.
func (s *Store) Get(collection, id string, v any) error {
	path, err := s.resolve(collection, id, ".json")
	if err != nil {
		return err
	}
	unlock := s.locks.Lock(collection + "/" + id)
	// #nosec G304 -- `path` is not caller-supplied: resolve() above rejected it
	// unless the collection matched segmentRe and the id matched idRe (neither
	// admits `/`, `\`, NUL or any non-ASCII byte), `..` was rejected explicitly,
	// and a filepath.Rel check re-confirmed containment inside s.root. The error
	// is returned before this line, so there is no fallback path.
	data, err := os.ReadFile(path)
	unlock()
	if err != nil {
		if os.IsNotExist(err) {
			return ErrNotFound
		}
		return err
	}
	return json.Unmarshal(data, v)
}

// Exists reports whether the object file exists.
func (s *Store) Exists(collection, id string) (bool, error) {
	path, err := s.resolve(collection, id, ".json")
	if err != nil {
		return false, err
	}
	_, err = os.Stat(path)
	if err == nil {
		return true, nil
	}
	if os.IsNotExist(err) {
		return false, nil
	}
	return false, err
}

// Delete removes the object file and its index entry. Missing files are not
// an error.
func (s *Store) Delete(collection, id string) error {
	path, err := s.resolve(collection, id, ".json")
	if err != nil {
		return err
	}
	unlock := s.locks.Lock(collection + "/" + id)
	err = os.Remove(path)
	unlock()
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	return s.updateIndex(collection, id, true)
}

// List returns the sorted ids recorded in the collection index. A missing
// collection lists as empty.
func (s *Store) List(collection string) ([]string, error) {
	if !validCollection(collection) {
		return nil, fmt.Errorf("%w: %q", ErrInvalidKey, collection)
	}
	unlock := s.locks.Lock("index:" + collection)
	defer unlock()
	ids, err := s.readIndex(collection)
	if err != nil {
		return nil, err
	}
	return ids, nil
}

// Scan returns the sorted ids of the object files that ACTUALLY EXIST on disk,
// by listing the collection directory rather than reading _index.json.
//
// List is the fast path and is correct in normal operation, but it is derived
// state: _index.json is a separate file, and a missing index reads as "empty
// collection" (see readIndex). That fail-OPEN direction is fine for a rebuild
// loop and dangerous for a security decision — anything that must answer "does
// an object exist at all?" has to look at the objects. A missing collection
// directory still lists as empty (a genuinely fresh deploy), but any OTHER
// error is returned rather than swallowed, so a caller can fail closed.
func (s *Store) Scan(collection string) ([]string, error) {
	if !validCollection(collection) {
		return nil, fmt.Errorf("%w: %q", ErrInvalidKey, collection)
	}
	dir := filepath.Join(s.root, filepath.FromSlash(collection))
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil
		}
		return nil, err
	}
	ids := make([]string, 0, len(entries))
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || name == "_index.json" || !strings.HasSuffix(name, ".json") {
			continue
		}
		ids = append(ids, strings.TrimSuffix(name, ".json"))
	}
	sort.Strings(ids)
	return ids, nil
}

// AppendLine appends v as one NDJSON line to <collection>/<id>.jsonl.
// Used for per-account match history.
func (s *Store) AppendLine(collection, id string, v any) error {
	path, err := s.resolve(collection, id, ".jsonl")
	if err != nil {
		return err
	}
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	unlock := s.locks.Lock(collection + "/" + id + ".jsonl")
	defer unlock()
	if err := os.MkdirAll(filepath.Dir(path), dataDirMode); err != nil {
		return err
	}
	// #nosec G304 -- `path` came from resolve(), same containment argument as Get.
	// 0o640 (was 0o644): these are the admin audit trail (data/admin-audit) and
	// per-account match history (data/history), which have no business being
	// world-readable. O_CREATE only applies the mode to a file it creates, so
	// jsonl files written before this sweep keep 0644 until they are recreated.
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, dataFileMode)
	if err != nil {
		return err
	}
	defer f.Close()
	if _, err := f.Write(append(data, '\n')); err != nil {
		return err
	}
	return f.Sync()
}

// ReadLines reads all NDJSON lines of <collection>/<id>.jsonl as raw JSON
// messages. A missing file reads as empty.
func (s *Store) ReadLines(collection, id string) ([]json.RawMessage, error) {
	path, err := s.resolve(collection, id, ".jsonl")
	if err != nil {
		return nil, err
	}
	unlock := s.locks.Lock(collection + "/" + id + ".jsonl")
	// #nosec G304 -- `path` came from resolve(), same containment argument as Get.
	data, err := os.ReadFile(path)
	unlock()
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var out []json.RawMessage
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		out = append(out, json.RawMessage(line))
	}
	return out, nil
}

func (s *Store) indexPath(collection string) string {
	return filepath.Join(s.root, filepath.FromSlash(collection), "_index.json")
}

func (s *Store) readIndex(collection string) ([]string, error) {
	data, err := os.ReadFile(s.indexPath(collection))
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil
		}
		return nil, err
	}
	var ids []string
	if err := json.Unmarshal(data, &ids); err != nil {
		return nil, fmt.Errorf("jsonstore: corrupt index for %s: %w", collection, err)
	}
	return ids, nil
}

func (s *Store) updateIndex(collection, id string, remove bool) error {
	unlock := s.locks.Lock("index:" + collection)
	defer unlock()
	ids, err := s.readIndex(collection)
	if err != nil {
		return err
	}
	present := false
	for _, existing := range ids {
		if existing == id {
			present = true
			break
		}
	}
	switch {
	case remove && present:
		next := ids[:0]
		for _, existing := range ids {
			if existing != id {
				next = append(next, existing)
			}
		}
		ids = next
	case !remove && !present:
		ids = append(ids, id)
		sort.Strings(ids)
	default:
		return nil // no change
	}
	data, err := json.MarshalIndent(ids, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(s.indexPath(collection)), dataDirMode); err != nil {
		return err
	}
	return writeAtomic(s.indexPath(collection), append(data, '\n'), dataFileMode)
}
