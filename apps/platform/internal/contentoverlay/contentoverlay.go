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
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
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
	// Bases records, per key, WHAT THE SHIPPED TREE SAID AT EDIT TIME — the
	// three-way-merge base the owner's 2026-07-24 directive requires
	// (docs/_requirements-audit-gaps.md). It is what turns "overlay wins" from
	// a silent rule into a checkable one; see precedence.go.
	//
	// It is deliberately a PARALLEL map rather than a field on the doc: the
	// content schemas are `.strict()` and hashDoc eats the whole doc, so a
	// metadata field inside the doc would fail validation AND move cv_ on every
	// save (docs/design/content-sync.md §6). A missing entry means UNKNOWN BASE,
	// never "clean" — an overlay written before this field existed must not
	// masquerade as verified.
	Bases map[string]BaseRef `json:"bases,omitempty"`
}

// PublicBundle is the copy of the overlay the UNauthenticated /bundle endpoint
// may serve.
//
// It strips two things, both for the same reason: the merge consumers do not
// need them and they name an operator.
//
//   - UpdatedBy — the editing admin's account ULID (the v0.4.9 leak fix).
//   - Bases — every entry's `by`/`at` provenance. This one is new with the
//     staleness work and TestPublicEndpointsDoNotLeakUpdatedBy caught it
//     immediately: `bases` re-leaked exactly the id `updatedBy` was blanked to
//     hide. The merge (packages/shared/src/content/overlay.ts) reads only
//     `docs` and `deleted`, so nothing downstream loses anything.
//
// Returns a copy; the durable store keeps everything for the audit trail.
func (o Overlay) PublicBundle() Overlay {
	o.UpdatedBy = ""
	o.Bases = nil
	return o
}

// BaseRef is the shipped doc's identity at the moment an operator overlaid it.
//
// Known=false is a first-class answer: the host had no readable content tree
// when the edit landed, so nothing can be concluded later. csync-03 rules that
// a missing base "downgrades every two-sided difference to TRUE CONFLICT rather
// than picking a side" — here that means the entry is FLAGGED, not assumed fine.
type BaseRef struct {
	// Known is false when the shipped tree could not be consulted at edit time.
	Known bool `json:"known"`
	// Shipped is true when a shipped doc existed for this key at edit time
	// (false = the operator ADDED a doc the repo does not have).
	Shipped bool `json:"shipped"`
	// Hash is the shipped `hashDoc` value at edit time (empty when !Shipped).
	Hash string `json:"hash,omitempty"`
	// At / By are the edit's own provenance — the "when + by whom" #189
	// requirement 6 asks for, per entry rather than only for the whole file.
	At time.Time `json:"at"`
	By string    `json:"by"`
}

// EmptyOverlay is a fresh host: nothing overlaid, generation 0.
func EmptyOverlay() Overlay {
	return Overlay{
		SchemaVersion: SchemaVersion,
		Generation:    0,
		Docs:          map[string]json.RawMessage{},
		Deleted:       map[string]bool{},
		Bases:         map[string]BaseRef{},
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
	// Degraded is true when the durable file on disk could not be parsed and the
	// service is serving the EMPTY overlay instead (see Degradation). It is on
	// the public head deliberately: it is a fact about the file, not about any
	// operator, and a consumer that silently loaded the shipped tree when it
	// expected an overlay deserves to be able to say so.
	Degraded bool `json:"degraded"`
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
	store   *jsonstore.Store
	rdb     *redisx.Client
	shipped *ShippedTree
	mu      sync.Mutex
	now     func() time.Time
	// degraded is non-nil while the durable file on disk is unparseable and the
	// service is serving the empty overlay in its place. Written and read under
	// mu (every load() call holds it).
	degraded *Degradation
}

// Degradation records a corrupt/half-written durable file — requirement 5's
// "surface the problem rather than failing to boot", made inspectable instead
// of only logged.
type Degradation struct {
	At     time.Time `json:"at"`
	Reason string    `json:"reason"`
	// Bytes is the size of the unreadable file, so an operator can tell a
	// truncated write ("it stops mid-object") from a wholesale overwrite.
	Bytes int `json:"bytes"`
	// Quarantine is the jsonstore id under `content-overlay` where the original
	// bytes were preserved verbatim. NOTHING is ever deleted to recover.
	Quarantine string `json:"quarantine"`
	// rawHash dedupes: the same corrupt content is quarantined once, not on
	// every read.
	rawHash string
}

// Option configures the service at construction.
type Option func(*Service)

// WithContentDir points the service at the SHIPPED content tree (CONTENT_DIR)
// so it can answer "has the shipped doc moved underneath this overlay entry?".
// Without it every entry reports an UNKNOWN base rather than a clean one.
func WithContentDir(dir string) Option {
	return func(s *Service) { s.shipped = NewShippedTree(dir) }
}

// New builds the service. rdb may be nil (no invalidation bus).
func New(store *jsonstore.Store, rdb *redisx.Client, opts ...Option) *Service {
	s := &Service{store: store, rdb: rdb, now: time.Now, shipped: NewShippedTree("")}
	for _, opt := range opts {
		opt(s)
	}
	return s
}

// SetNow overrides the clock seam (tests inject a fixed clock).
func (s *Service) SetNow(fn func() time.Time) { s.now = fn }

// load reads the durable overlay. A missing file is the empty state, not an
// error. Backfills nil maps from a hand-edited/older file.
//
// ── THE CORRUPTION CONTRACT (#189 requirement 5) ─────────────────────────────
// An unparseable file is NOT an error here. A half-written or garbage
// `overlay.json` degrades to the EMPTY overlay — i.e. to exactly the shipped
// content tree — after preserving the original bytes under a quarantine id and
// logging loudly. The platform boots, the game-server boots, players play the
// shipped content, and the problem is visible on Head (`degraded`) and on the
// admin status page instead of taking the host down.
//
// Any OTHER error (permissions, a dying disk) is still returned: those are not
// "the file says nonsense", they are "the machine is not answering", and
// pretending the overlay is empty would be a lie about durable state.
func (s *Service) load() (Overlay, error) {
	var o Overlay
	err := s.store.Get(Collection, DocID, &o)
	if errors.Is(err, jsonstore.ErrNotFound) {
		s.degraded = nil
		return EmptyOverlay(), nil
	}
	if err != nil {
		if isUnparseable(err) {
			s.enterDegraded(err)
			return EmptyOverlay(), nil
		}
		return EmptyOverlay(), err
	}
	s.degraded = nil
	if o.Docs == nil {
		o.Docs = map[string]json.RawMessage{}
	}
	if o.Deleted == nil {
		o.Deleted = map[string]bool{}
	}
	if o.Bases == nil {
		o.Bases = map[string]BaseRef{}
	}
	if o.SchemaVersion == 0 {
		o.SchemaVersion = SchemaVersion
	}
	return o, nil
}

// isUnparseable distinguishes "the bytes are not a valid Overlay" from every
// other read failure. Both encoding/json error types are matched: a truncated
// write yields a SyntaxError, a hand-edit that turns `docs` into a number
// yields an UnmarshalTypeError, and both mean the same thing operationally.
func isUnparseable(err error) bool {
	var se *json.SyntaxError
	var ute *json.UnmarshalTypeError
	return errors.As(err, &se) || errors.As(err, &ute)
}

// enterDegraded preserves the unreadable bytes and records the degradation.
// Caller holds mu.
//
// The corrupt file is deliberately NOT deleted or repaired: the operator may
// want it, and a store that silently destroys durable state to make itself
// readable is worse than one that is unreadable. The next successful write
// simply replaces it (jsonstore.Put is atomic), by which point the original is
// already safe under its quarantine id.
func (s *Service) enterDegraded(cause error) {
	raw := s.readRaw()
	sum := sha256.Sum256(raw)
	rawHash := hex.EncodeToString(sum[:])[:12]

	if s.degraded != nil && s.degraded.rawHash == rawHash {
		return // same broken bytes, already reported and already quarantined
	}
	quarantine := DocID + ".corrupt-" + rawHash
	d := &Degradation{
		At:         s.now().UTC(),
		Reason:     truncate(cause.Error(), 160),
		Bytes:      len(raw),
		Quarantine: quarantine,
		rawHash:    rawHash,
	}
	// Quarantine as base64 rather than a string: the bytes may not be valid
	// UTF-8, and json.Marshal would silently replace those with U+FFFD — a
	// lossy "backup" is not a backup.
	err := s.store.Put(Collection, quarantine, map[string]any{
		"quarantinedAt": d.At,
		"reason":        d.Reason,
		"bytes":         d.Bytes,
		"rawBase64":     base64.StdEncoding.EncodeToString(raw),
	})
	if err != nil {
		slog.Error("contentoverlay: could not quarantine the corrupt overlay", "err", err)
		d.Quarantine = ""
	}
	s.degraded = d
	slog.Error("contentoverlay: DURABLE OVERLAY IS UNREADABLE — serving the shipped content tree instead",
		"reason", d.Reason, "bytes", d.Bytes, "quarantine", d.Quarantine,
		"collection", Collection, "docId", DocID)
}

// readRaw reads the durable file's bytes directly (for quarantine). Failure is
// not fatal: an empty quarantine is still better than losing the degradation.
func (s *Service) readRaw() []byte {
	path, err := s.store.Path(Collection, DocID)
	if err != nil {
		return nil
	}
	// #nosec G304 -- `path` is jsonstore's own resolved path for a constant
	// collection/id pair, containment-checked inside the store root.
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	return raw
}

// Degraded returns the current degradation, or nil when the durable file reads
// cleanly. Reading it forces a load so the answer is about the file NOW.
func (s *Service) Degraded(ctx context.Context) (*Degradation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, err := s.load(); err != nil {
		return nil, err
	}
	return s.degraded, nil
}

// Get returns the whole current overlay (also the transport BUNDLE the
// consumers fetch and merge). Never seeds anything.
func (s *Service) Get(ctx context.Context) (Overlay, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.load()
}

// Head returns the cheap probe document (generation / fingerprint / counts),
// plus whether the durable file is currently unreadable.
func (s *Service) Head(ctx context.Context) (Head, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	o, err := s.load()
	if err != nil {
		return Head{}, err
	}
	hd := o.Head()
	hd.Degraded = s.degraded != nil
	return hd, nil
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
	o.Bases[k] = s.captureBase(collection, id, by)
	return s.commit(ctx, o, by, "put", k)
}

// captureBase records what the SHIPPED tree said about this key at edit time —
// the three-way-merge base. It is read from the shipped `_index.json`, i.e. from
// the hash the TypeScript content build itself wrote, so Go never re-implements
// hashDoc (see shipped.go).
//
// The console does NOT get to supply this value. It could (it has the shipped
// doc in hand), but then the base would be caller-asserted and a buggy or stale
// console tab could stamp an entry "verified against the current shipped doc"
// when it was verified against a doc from an hour ago. Reading it here means the
// value written and the value compared against later come from the same file on
// the same disk.
func (s *Service) captureBase(collection, id, by string) BaseRef {
	ref := BaseRef{At: s.now().UTC(), By: by}
	hash, present, err := s.shipped.Hash(collection, id)
	if err != nil {
		// UNANSWERABLE, not "absent". Known stays false → the entry is flagged
		// for review rather than silently trusted (csync-03).
		slog.Warn("contentoverlay: no shipped base recorded for this edit (content tree unreadable)",
			"collection", collection, "id", id, "err", err)
		return ref
	}
	ref.Known = true
	ref.Shipped = present
	ref.Hash = hash
	return ref
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
	o.Bases[k] = s.captureBase(collection, id, by)
	return s.commit(ctx, o, by, "delete", k)
}

// RevertDoc REMOVES the overlay's opinion about a key entirely — no doc, no
// tombstone — so the merged tree falls back to whatever the shipped content
// tree says.
//
// This is a genuinely different verb from DeleteDoc and the console needs both.
// DeleteDoc says "this doc should not exist", which keeps overriding the shipped
// tree forever. RevertDoc says "never mind, the repo is right" — the ONLY way to
// clear a stale entry once `git pull` has brought a better version of the doc.
// Without it, an operator faced with a stale entry has no non-destructive exit.
func (s *Service) RevertDoc(ctx context.Context, collection, id string, by string) (Head, error) {
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
	_, hadDoc := o.Docs[k]
	_, hadTombstone := o.Deleted[k]
	if !hadDoc && !hadTombstone {
		return Head{}, httpx.BadRequest("nothing is overlaid at " + truncate(k, 80))
	}
	delete(o.Docs, k)
	delete(o.Deleted, k)
	delete(o.Bases, k)
	return s.commit(ctx, o, by, "revert", k)
}

// commit stamps, audits, persists, logs and announces a new overlay generation.
// Caller holds the mutex.
//
// ── WHY THE AUDIT LINE IS WRITTEN FIRST, AND FAILS THE CALL ──────────────────
// #189 requirement 4 asks that every write "leaves an audit line". That is a
// GUARANTEE, not a hope, so it is enforced here rather than left to each
// handler remembering to call Audit() afterwards (the shape the earlier pass
// had — a handler-side, best-effort call that a future route could simply
// forget). Two consequences, both chosen deliberately:
//
//   - the append happens BEFORE the durable content write, so there can never
//     be a content change with no trace of who made it. The inverse — an audit
//     line for a mutation that then failed to persist — is the safe direction:
//     it over-reports an attempt rather than under-reporting a change.
//   - an audit-append failure ABORTS the mutation (a real error, not a warn).
//     A host that cannot record who changed the content is a host that should
//     not be changing the content.
//
// The generation log and the redis invalidation stay best-effort: neither can
// lose data (the log is a convenience history, and a missed invalidation only
// costs a shard its cache TTL).
func (s *Service) commit(ctx context.Context, o Overlay, by, op, k string) (Head, error) {
	o.SchemaVersion = SchemaVersion
	o.Generation++
	o.UpdatedAt = s.now().UTC()
	o.UpdatedBy = by

	if err := s.audit(by, "content-overlay."+op, map[string]any{
		"key": k, "generation": o.Generation, "docs": len(o.Docs), "deleted": len(o.Deleted),
	}); err != nil {
		return Head{}, fmt.Errorf("contentoverlay: refusing an unaudited content change: %w", err)
	}
	if err := s.store.Put(Collection, DocID, o); err != nil {
		return Head{}, err
	}
	// the durable file now parses again by construction
	s.degraded = nil
	// append-only history (undo/audit trail) — best effort
	if err := s.store.AppendLine(LogCollection, o.UpdatedAt.Format("2006-01-02"), logEntry{
		Generation: o.Generation, At: o.UpdatedAt, By: by, Op: op, Key: k,
	}); err != nil {
		slog.Warn("contentoverlay: generation-log append failed (overlay itself is written)", "err", err)
	}
	s.announce(ctx, o)
	hd := o.Head()
	hd.Degraded = false
	return hd, nil
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

// audit appends one line to the shared admin audit log so overlay edits show up
// on the console's audit page next to every other operator action.
//
// It returns the error rather than swallowing it: commit() treats a failed
// append as a failed mutation (see the block comment there).
func (s *Service) audit(adminID, action string, detail map[string]any) error {
	entry := admin.AuditEntry{
		AdminID:  adminID,
		Action:   action,
		TargetID: Collection,
		Detail:   detail,
		TS:       s.now().UTC(),
	}
	if err := s.store.AppendLine(admin.ColAudit, entry.TS.Format("2006-01-02"), entry); err != nil {
		slog.Error("contentoverlay: audit append failed — mutation refused", "action", action, "err", err)
		return err
	}
	return nil
}

// ReadLog returns the most recent generation-log lines, newest first, across the
// last `days` daily files. This is the ONLY reader of data/content-overlay-log/
// — the file was being written with nothing to show it, which is exactly the
// "cannot debug what you cannot see" gap #189 requirement 6 names.
func (s *Service) ReadLog(days, limit int) ([]LogLine, error) {
	if days <= 0 {
		days = 14
	}
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	out := make([]LogLine, 0, limit)
	day := s.now().UTC()
	for i := 0; i < days && len(out) < limit; i++ {
		lines, err := s.store.ReadLines(LogCollection, day.Format("2006-01-02"))
		day = day.AddDate(0, 0, -1)
		if err != nil {
			// a single unreadable day must not hide the other thirteen
			slog.Warn("contentoverlay: generation-log day unreadable", "err", err)
			continue
		}
		for j := len(lines) - 1; j >= 0 && len(out) < limit; j-- {
			var e LogLine
			if err := json.Unmarshal(lines[j], &e); err != nil {
				continue
			}
			out = append(out, e)
		}
	}
	return out, nil
}

// LogLine is one generation-history entry as the admin surface reports it.
type LogLine struct {
	Generation int       `json:"generation"`
	At         time.Time `json:"at"`
	By         string    `json:"by"`
	Op         string    `json:"op"`
	Key        string    `json:"key"`
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
