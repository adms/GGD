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
	if err := os.MkdirAll(abs, 0o755); err != nil {
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
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		unlock()
		return err
	}
	err = renameio.WriteFile(path, data, 0o644)
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
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
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
	if err := os.MkdirAll(filepath.Dir(s.indexPath(collection)), 0o755); err != nil {
		return err
	}
	return renameio.WriteFile(s.indexPath(collection), append(data, '\n'), 0o644)
}
