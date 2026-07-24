// Package contentoverlay owns the DURABLE CONTENT OVERLAY (task #189): the one
// place on the family host where an admin content edit can survive.
//
// ── WHY IT EXISTS ────────────────────────────────────────────────────────────
// On ggd.adms.ai the shipped content/ tree is a READ-ONLY bind mount of the git
// checkout (docker/compose.yaml). Anything written into it vanishes on the next
// `git pull`, and the dev content-api that backs the localhost editor is not
// even running there. So the 內容管理 console on the host had nowhere durable to
// write — an edit applied for one match's cache TTL and was gone.
//
// This overlay is that durable place. It lives under DATA_DIR (`../data:/data`,
// RW, gitignored), so it is the ONE store a git pull cannot erase. The runtime
// content a player sees is the shipped tree with this overlay laid on top:
//
//	merged = shipped(content/) ⊕ overlay(data/content-overlay/)
//
// The merge itself happens in the consumers (client + game-server) through the
// shared, pure `mergeOverlay` in packages/shared — this package only owns the
// durable store and the HTTP surface that serves it.
//
// ── SAVE IS LOCAL, INSTANT, NEVER-FAIL (docs/design/content-sync.md §2) ───────
// A write here appends a generation to a single-writer, atomically-rewritten
// JSON file. It never contacts a peer and never blocks on the network. The
// two-console SYNC engine (the tick-box arbitration table) is deliberately a
// separate, later piece of work — #189 is only the durable store it needs to
// exist first.
//
// ── WHAT THIS PACKAGE DOES NOT DO ────────────────────────────────────────────
// It does not validate content against the Zod schemas — those live in
// TypeScript and cannot run here. The admin console validates before it writes
// (the shared schemas it already bundles), and the game loader validates again
// on ingest and fail-safes a bad doc. This store keeps opaque, structurally
// sane JSON and is not the schema authority. It also never touches content/.
package contentoverlay

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/ggd/platform/internal/admin"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/httpx"
)

// Storage identifiers. The overlay lives at data/content-overlay/overlay.json,
// with an append-only generation log alongside it.
const (
	// Collection is the jsonstore collection (a directory under DATA_DIR).
	Collection = "content-overlay"
	// DocID is the single document holding the whole current overlay.
	DocID = "overlay"
	// LogCollection holds the append-only generation history (one file per day).
	LogCollection = "content-overlay-log"
	// SchemaVersion is the doc version written by this build.
	SchemaVersion = 1
)

// Bounds. The overlay only ever holds docs an admin has EDITED on this host, a
// handful in practice; these guard against a buggy/hostile call blowing up the
// durable file, never a real workload.
const (
	// MaxDocs caps how many overlaid docs the store will hold.
	MaxDocs = 5000
	// MaxDocBytes caps one content doc. A champion doc with embedded abilities is
	// the largest real case and sits well under this.
	MaxDocBytes = 512 * 1024
)

// collectionRe and idRe are the accepted shapes of a content key. Deliberately
// strict — these become map keys other services trust, and the id shape matches
// the curation whitelist so an ability's dotted slot suffix (godie-e001.ex)
// passes.
var (
	collectionRe = regexp.MustCompile(`^[a-z][a-z0-9-]{0,31}$`)
	idRe         = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$`)
)

// key joins a collection and id into the overlay map key ("champions/godie-e001").
func key(collection, id string) string { return collection + "/" + id }

// validateKey checks a collection/id pair. Returns a 400-shaped error on a bad
// shape so a typo in the console surfaces immediately rather than silently.
func validateKey(collection, id string) error {
	if !collectionRe.MatchString(collection) {
		return httpx.BadRequest("invalid collection: " + truncate(collection, 40))
	}
	if !idRe.MatchString(id) {
		return httpx.BadRequest("invalid id: " + truncate(id, 40))
	}
	return nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// Overlay is the whole durable overlay document.
//
// Docs upserts a content doc over the shipped tree; Deleted tombstones a shipped
// doc so the merged tree drops it. A key present in Docs is never also in
// Deleted (a write to one clears the other). Both maps are ALWAYS non-nil so the
// JSON encodes `{}` (never `null`) and consumers can range without a nil check.
type Overlay struct {
	SchemaVersion int                        `json:"schemaVersion"`
	Generation    int                        `json:"generation"`
	UpdatedAt     time.Time                  `json:"updatedAt"`
	UpdatedBy     string                     `json:"updatedBy"`
	Docs          map[string]json.RawMessage `json:"docs"`
	Deleted       map[string]bool            `json:"deleted"`
}

// EmptyOverlay is a fresh host: nothing overlaid, generation 0.
func EmptyOverlay() Overlay {
	return Overlay{
		SchemaVersion: SchemaVersion,
		Generation:    0,
		Docs:          map[string]json.RawMessage{},
		Deleted:       map[string]bool{},
	}
}

// Head is the cheap probe consumers poll to learn whether the overlay advanced,
// without downloading any doc (docs/design/content-sync.md §3.1 / §4).
//
// Fingerprint is a Go-side content hash of the overlay body (docs + deletions),
// NOT the TypeScript `contentVersion`: matching the cross-language hashDoc
// byte-for-byte is a trap, and it is not this endpoint's job. Consumers recompute
// the real cv_ after merging in TS; this fingerprint answers only "did the
// overlay content change?" — stable across restarts and restores.
type Head struct {
	SchemaVersion int       `json:"schemaVersion"`
	Generation    int       `json:"generation"`
	Fingerprint   string    `json:"fingerprint"`
	DocCount      int       `json:"docCount"`
	DeletedCount  int       `json:"deletedCount"`
	UpdatedAt     time.Time `json:"updatedAt"`
	UpdatedBy     string    `json:"updatedBy"`
}

// fingerprint hashes ONLY the content (docs + deletions), so two hosts that
// converge on the same overlay report the same fingerprint even at different
// generation numbers. Go's json.Marshal sorts map keys, so this is deterministic.
func (o Overlay) fingerprint() string {
	body, err := json.Marshal(struct {
		Docs    map[string]json.RawMessage `json:"docs"`
		Deleted map[string]bool            `json:"deleted"`
	}{Docs: o.Docs, Deleted: o.Deleted})
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])[:12]
}

// Head derives the probe document from the overlay.
func (o Overlay) Head() Head {
	return Head{
		SchemaVersion: SchemaVersion,
		Generation:    o.Generation,
		Fingerprint:   o.fingerprint(),
		DocCount:      len(o.Docs),
		DeletedCount:  len(o.Deleted),
		UpdatedAt:     o.UpdatedAt,
		UpdatedBy:     o.UpdatedBy,
	}
}

// logEntry is one appended line in the generation history.
type logEntry struct {
	Generation int       `json:"generation"`
	At         time.Time `json:"at"`
	By         string    `json:"by"`
	Op         string    `json:"op"`  // "put" | "delete"
	Key        string    `json:"key"` // "collection/id"
}

// Service owns the durable overlay. The document is small and single-writer, so
// one mutex around the read-modify-write cycle is the whole concurrency story
// (same shape as internal/curation).
type Service struct {
	store *jsonstore.Store
	rdb   *redisx.Client
	mu    sync.Mutex
	now   func() time.Time
}

// New builds the service. rdb may be nil (no invalidation bus).
func New(store *jsonstore.Store, rdb *redisx.Client) *Service {
	return &Service{store: store, rdb: rdb, now: time.Now}
}

// SetNow overrides the clock seam (tests inject a fixed clock).
func (s *Service) SetNow(fn func() time.Time) { s.now = fn }

// load reads the durable overlay. A missing file is the empty state, not an
// error. Backfills nil maps from a hand-edited/older file.
func (s *Service) load() (Overlay, error) {
	var o Overlay
	err := s.store.Get(Collection, DocID, &o)
	if errors.Is(err, jsonstore.ErrNotFound) {
		return EmptyOverlay(), nil
	}
	if err != nil {
		return EmptyOverlay(), err
	}
	if o.Docs == nil {
		o.Docs = map[string]json.RawMessage{}
	}
	if o.Deleted == nil {
		o.Deleted = map[string]bool{}
	}
	if o.SchemaVersion == 0 {
		o.SchemaVersion = SchemaVersion
	}
	return o, nil
}

// Get returns the whole current overlay (also the transport BUNDLE the
// consumers fetch and merge). Never seeds anything.
func (s *Service) Get(ctx context.Context) (Overlay, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.load()
}

// Head returns the cheap probe document (generation / fingerprint / counts).
func (s *Service) Head(ctx context.Context) (Head, error) {
	o, err := s.Get(ctx)
	if err != nil {
		return Head{}, err
	}
	return o.Head(), nil
}

// PutDoc upserts one content doc into the overlay and advances the generation.
// The doc is stored as the exact (compacted) bytes the caller sent — this store
// is not the schema authority (see the package header). Clears any tombstone on
// the same key: writing a doc un-deletes it.
func (s *Service) PutDoc(ctx context.Context, collection, id string, doc json.RawMessage, by string) (Head, error) {
	if err := validateKey(collection, id); err != nil {
		return Head{}, err
	}
	compact, err := compactObject(doc)
	if err != nil {
		return Head{}, err
	}
	if len(compact) > MaxDocBytes {
		return Head{}, httpx.BadRequest("content doc too large")
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	o, err := s.load()
	if err != nil {
		return Head{}, err
	}
	k := key(collection, id)
	if _, exists := o.Docs[k]; !exists && len(o.Docs) >= MaxDocs {
		return Head{}, httpx.BadRequest("overlay is full")
	}
	o.Docs[k] = compact
	delete(o.Deleted, k)
	return s.commit(ctx, o, by, "put", k)
}

// DeleteDoc tombstones a doc so the merged tree drops it, and advances the
// generation. Removing a doc that was only ADDED by the overlay (not present in
// the shipped tree) simply drops the overlay entry; tombstoning it is harmless
// and keeps the intent explicit for the sync engine, so both are recorded.
func (s *Service) DeleteDoc(ctx context.Context, collection, id string, by string) (Head, error) {
	if err := validateKey(collection, id); err != nil {
		return Head{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	o, err := s.load()
	if err != nil {
		return Head{}, err
	}
	k := key(collection, id)
	if len(o.Deleted) >= MaxDocs {
		return Head{}, httpx.BadRequest("overlay is full")
	}
	delete(o.Docs, k)
	o.Deleted[k] = true
	return s.commit(ctx, o, by, "delete", k)
}

// commit stamps, persists, logs and announces a new overlay generation. Caller
// holds the mutex. The durable write is the only step that may fail the call;
// the log line and the invalidation are best-effort (they cannot lose data).
func (s *Service) commit(ctx context.Context, o Overlay, by, op, k string) (Head, error) {
	o.SchemaVersion = SchemaVersion
	o.Generation++
	o.UpdatedAt = s.now().UTC()
	o.UpdatedBy = by
	if err := s.store.Put(Collection, DocID, o); err != nil {
		return Head{}, err
	}
	// append-only history (undo/audit trail) — best effort
	if err := s.store.AppendLine(LogCollection, o.UpdatedAt.Format("2006-01-02"), logEntry{
		Generation: o.Generation, At: o.UpdatedAt, By: by, Op: op, Key: k,
	}); err != nil {
		slog.Warn("contentoverlay: generation-log append failed (overlay itself is written)", "err", err)
	}
	s.announce(ctx, o)
	return o.Head(), nil
}

// announce publishes a content-invalidation so a running shard re-fetches the
// merged content for its NEXT match, instead of waiting out its cache TTL. The
// payload is the overlay fingerprint — the shard re-reads the authoritative
// bundle, never trusting anything in the message. Best-effort by contract: the
// durable file is already written.
func (s *Service) announce(ctx context.Context, o Overlay) {
	if s.rdb == nil {
		return
	}
	if err := s.rdb.PublishContentInvalidation(
		ctx, redisx.ContentKindContentOverlay, o.fingerprint(), o.UpdatedAt,
	); err != nil {
		slog.Warn("contentoverlay: invalidation publish failed (shards refresh on their TTL)", "err", err)
	}
}

// Audit appends one line to the shared admin audit log so overlay edits show up
// on the console's audit page next to every other operator action. Best-effort.
func (s *Service) Audit(adminID, action string, detail map[string]any) {
	entry := admin.AuditEntry{
		AdminID:  adminID,
		Action:   action,
		TargetID: Collection,
		Detail:   detail,
		TS:       s.now().UTC(),
	}
	if err := s.store.AppendLine(admin.ColAudit, entry.TS.Format("2006-01-02"), entry); err != nil {
		slog.Warn("contentoverlay: audit append failed", "action", action, "err", err)
	}
}

// compactObject validates that b is a JSON OBJECT and returns its compacted
// bytes (whitespace stripped). A doc is always a `{...}` object; an array,
// scalar or malformed body is a 400 so the console learns immediately.
func compactObject(b []byte) (json.RawMessage, error) {
	trimmed := strings.TrimSpace(string(b))
	if trimmed == "" || trimmed[0] != '{' {
		return nil, httpx.BadRequest("content doc must be a JSON object")
	}
	var probe map[string]json.RawMessage
	if err := json.Unmarshal(b, &probe); err != nil {
		return nil, httpx.BadRequest("content doc is not valid JSON: " + truncate(err.Error(), 80))
	}
	// re-marshal from the probe so the stored bytes are canonical (Go sorts keys)
	// and independent of the caller's whitespace/key order.
	out, err := json.Marshal(probe)
	if err != nil {
		return nil, httpx.BadRequest("content doc could not be normalised")
	}
	return out, nil
}

// sortedKeys is a small helper used by tests and callers that want a stable
// listing of the overlaid keys.
func sortedKeys(m map[string]json.RawMessage) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// Keys returns the overlaid doc keys in sorted order (diagnostics / tests).
func (o Overlay) Keys() []string { return sortedKeys(o.Docs) }
