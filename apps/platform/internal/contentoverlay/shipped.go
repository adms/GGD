package contentoverlay

// shipped.go — the READ-ONLY window onto the SHIPPED content tree (`content/`,
// CONTENT_DIR, mounted `../content:/srv/content:ro`).
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
// #189's precedence rule needs to answer one question the overlay alone cannot:
// "has the SHIPPED doc moved underneath this overlay entry since it was
// edited?". Without an answer, a stale overlay entry wins forever and silently,
// which is exactly the "content drifts from the repo and nobody notices" failure
// the task names.
//
// ── WHY WE READ THE INDEX INSTEAD OF HASHING THE DOC OURSELVES ───────────────
// The content hash is `hashDoc` (packages/shared/src/content/hash.ts): sha256
// over safe-stable-stringify, truncated to 12 hex. Re-implementing that in Go
// byte-for-byte is a trap the package header already warns about — one
// disagreement about number formatting or key ordering and every entry reports
// "stale" forever.
//
// So this file does not hash anything. `pnpm content:build` already WROTE the
// hashes: every collection ships a `_index.json` whose entries carry the exact
// `hashDoc` value for each id. We read that. The base recorded at edit time and
// the value compared against later come from the SAME source computed by the
// SAME TypeScript pipeline, so the comparison is self-consistent by construction
// and Go never guesses a hash.
//
// ── WHAT IT NEVER DOES ───────────────────────────────────────────────────────
// It never writes, creates or renames anything under CONTENT_DIR. The tree is a
// read-only bind mount on the host and the git checkout on a dev box; #189's
// whole point is that the durable write goes to `data/`, never here.

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// maxIndexBytes bounds a `_index.json` read. The biggest shipped index today
// (abilities, 668 entries) is ~90 KB; this is generous headroom that still
// refuses to buffer a pathological file.
const maxIndexBytes = 16 << 20

// maxShippedDocBytes bounds a single shipped doc read (the admin "what does the
// repo say?" view). Same order as MaxDocBytes, with slack for pretty-printing.
const maxShippedDocBytes = 2 << 20

// ErrNoContentTree means CONTENT_DIR was not configured or is not readable, so
// "is this overlay entry stale?" is UNANSWERABLE rather than "no".
var ErrNoContentTree = errors.New("contentoverlay: shipped content tree unavailable")

// ShippedTree reads hashes and docs out of the shipped content tree.
//
// Indexes are cached per collection and invalidated on (modtime, size), so a
// `git pull` that rewrites `content/abilities/_index.json` is picked up on the
// next read without a restart — which is the exact event the staleness check
// exists to notice.
type ShippedTree struct {
	dir   string
	mu    sync.Mutex
	cache map[string]*indexCache
}

type indexCache struct {
	modTimeUnixNano int64
	size            int64
	hashes          map[string]string // id -> hashDoc
	paths           map[string]string // id -> repo-relative path from the index
}

// shippedIndex is the on-disk shape written by `pnpm content:build`.
type shippedIndex struct {
	Collection string `json:"collection"`
	Hash       string `json:"hash"`
	Entries    []struct {
		ID   string `json:"id"`
		Path string `json:"path"`
		Hash string `json:"hash"`
		Size int    `json:"size"`
	} `json:"entries"`
}

// NewShippedTree returns a reader rooted at dir. An empty dir yields a tree that
// reports itself unavailable rather than nil, so callers never nil-check.
func NewShippedTree(dir string) *ShippedTree {
	return &ShippedTree{dir: dir, cache: map[string]*indexCache{}}
}

// Dir is the configured root (diagnostics; admin-only surfaces).
func (t *ShippedTree) Dir() string {
	if t == nil {
		return ""
	}
	return t.dir
}

// Available reports whether the tree can be read at all. A host with no
// CONTENT_DIR (or a broken mount) is UNKNOWN, never "nothing is stale".
func (t *ShippedTree) Available() (bool, string) {
	if t == nil || t.dir == "" {
		return false, "CONTENT_DIR is not configured"
	}
	info, err := os.Stat(t.dir)
	if err != nil {
		return false, err.Error()
	}
	if !info.IsDir() {
		return false, t.dir + " is not a directory"
	}
	return true, ""
}

// safeJoin joins a repo-relative content path onto the tree root and re-checks
// containment, so a hand-edited index cannot walk out of CONTENT_DIR.
func (t *ShippedTree) safeJoin(rel string) (string, error) {
	if rel == "" || strings.Contains(rel, "..") || filepath.IsAbs(rel) {
		return "", fmt.Errorf("contentoverlay: unsafe content path %q", truncate(rel, 60))
	}
	p := filepath.Join(t.dir, filepath.FromSlash(rel))
	r, err := filepath.Rel(t.dir, p)
	if err != nil || strings.HasPrefix(r, "..") {
		return "", fmt.Errorf("contentoverlay: content path escapes CONTENT_DIR")
	}
	return p, nil
}

// index loads (and caches) one collection's `_index.json`.
func (t *ShippedTree) index(collection string) (*indexCache, error) {
	if ok, why := t.Available(); !ok {
		return nil, fmt.Errorf("%w: %s", ErrNoContentTree, why)
	}
	if !collectionRe.MatchString(collection) {
		return nil, fmt.Errorf("contentoverlay: invalid collection %q", truncate(collection, 40))
	}
	path, err := t.safeJoin(collection + "/_index.json")
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(path)
	if err != nil {
		// A collection the shipped tree does not have at all is a legitimate,
		// quiet answer: every id in it is overlay-ONLY.
		if os.IsNotExist(err) {
			return &indexCache{hashes: map[string]string{}, paths: map[string]string{}}, nil
		}
		return nil, err
	}

	t.mu.Lock()
	defer t.mu.Unlock()
	if c, ok := t.cache[collection]; ok &&
		c.modTimeUnixNano == info.ModTime().UnixNano() && c.size == info.Size() {
		return c, nil
	}
	if info.Size() > maxIndexBytes {
		return nil, fmt.Errorf("contentoverlay: %s/_index.json is implausibly large", collection)
	}
	// #nosec G304 -- `path` came from safeJoin(): the collection matched
	// collectionRe (no separators, no dots), and a filepath.Rel check re-confirmed
	// containment inside t.dir. The literal "_index.json" is not caller-supplied.
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var idx shippedIndex
	if err := json.Unmarshal(raw, &idx); err != nil {
		return nil, fmt.Errorf("contentoverlay: %s/_index.json is not readable JSON: %w", collection, err)
	}
	c := &indexCache{
		modTimeUnixNano: info.ModTime().UnixNano(),
		size:            info.Size(),
		hashes:          make(map[string]string, len(idx.Entries)),
		paths:           make(map[string]string, len(idx.Entries)),
	}
	for _, e := range idx.Entries {
		c.hashes[e.ID] = e.Hash
		c.paths[e.ID] = e.Path
	}
	t.cache[collection] = c
	return c, nil
}

// Hash returns the SHIPPED content hash for collection/id.
//
// Three outcomes, and the caller must keep them apart:
//
//	(hash, true,  nil) — the shipped tree has this doc, at this hash
//	("",   false, nil) — the shipped tree definitively does NOT have this doc
//	("",   false, err) — UNANSWERABLE (no mount / unreadable index). Never
//	                     collapse this into "not present": that is how a stale
//	                     entry gets reported clean.
func (t *ShippedTree) Hash(collection, id string) (string, bool, error) {
	c, err := t.index(collection)
	if err != nil {
		return "", false, err
	}
	h, ok := c.hashes[id]
	return h, ok, nil
}

// Doc returns the raw bytes of a shipped doc, so the console can show the
// operator what the repo currently says next to what the overlay says. Read
// only; bounded.
func (t *ShippedTree) Doc(collection, id string) ([]byte, error) {
	c, err := t.index(collection)
	if err != nil {
		return nil, err
	}
	rel, ok := c.paths[id]
	if !ok || rel == "" {
		// The index is the authority on layout, but a collection with no index
		// entry may still be a plain <collection>/<id>.json on disk.
		rel = collection + "/" + id + ".json"
	}
	path, err := t.safeJoin(rel)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if info.Size() > maxShippedDocBytes {
		return nil, fmt.Errorf("contentoverlay: shipped doc %s is too large to preview", truncate(rel, 60))
	}
	// #nosec G304 -- `path` came from safeJoin(); see index() for the same
	// containment argument. `rel` is either an index-declared repo-relative path
	// or a value built from the already-validated collection/id pair.
	return os.ReadFile(path)
}
