// Package curation owns the CONTENT WHITELIST: the operator-curated set of
// champion / item / ability ids that are actually enabled in the product.
//
// The imported WC3 roster is far larger than what should ship enabled, so the
// whitelist is DEFAULT-EMPTY: a fresh install has nothing turned on and an
// operator opts content in from the admin console (or one-click applies the
// starter set, see starter.go). Nothing here seeds content implicitly.
//
// This is OPERATIONAL STATE, not content: the durable truth is one JSON file
// at data/curation/whitelist.json written through the platform jsonstore
// (tmp+rename, single writer), and Redis only ever holds a rebuildable mirror
// for consumers that already speak Redis. The content tree itself is never
// mutated.
//
// Consumers:
//   - game-server: filters the playable/RANDOM champion pools, the shop
//     catalogue and the draft/loot offers, and rejects SELECT_CHAMPION for a
//     non-whitelisted champion (see apps/game-server/src/curation/whitelist.ts).
//   - client + admin console: render only whitelisted entries.
package curation

import (
	"context"
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

// Storage identifiers. The document lives at data/curation/whitelist.json.
const (
	// Collection is the jsonstore collection (a directory under DATA_DIR).
	Collection = "curation"
	// DocID is the single document id inside that collection.
	DocID = "whitelist"
	// RedisKey mirrors the marshalled document for Redis-native consumers.
	// It is a cache: the platform never reads it back as truth.
	RedisKey = "curation:whitelist"
	// SchemaVersion is the doc version written by this build.
	SchemaVersion = 1
)

// Kinds of curated content. These are the only accepted `kind` values on the
// bulk endpoint.
const (
	KindChampions = "champions"
	KindItems     = "items"
	KindAbilities = "abilities"
)

// MaxIDsPerKind bounds one list so a malicious/buggy admin call cannot blow up
// the durable file. The full imported roster is ~113 champions / ~212 items /
// ~555 abilities, so this leaves generous headroom.
const MaxIDsPerKind = 4000

// idRe is the accepted shape of a content id: champion ids look like
// "godie-e001" / "sela", ability ids carry a dotted slot suffix
// ("godie-e001.ex"). Deliberately strict — these ids end up in file content
// that other services trust.
var idRe = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$`)

// Doc is the whitelist document. Every list is ALWAYS non-nil so the JSON
// encodes `[]` (never `null`) — clients can iterate without a nil check.
type Doc struct {
	Version   int       `json:"version"`
	UpdatedAt time.Time `json:"updatedAt"`
	Champions []string  `json:"champions"`
	Items     []string  `json:"items"`
	Abilities []string  `json:"abilities"`
}

// EmptyDoc is the default state of a fresh install: nothing enabled.
func EmptyDoc() Doc {
	return Doc{
		Version:   SchemaVersion,
		Champions: []string{},
		Items:     []string{},
		Abilities: []string{},
	}
}

// Total counts every enabled id across the three kinds.
func (d Doc) Total() int { return len(d.Champions) + len(d.Items) + len(d.Abilities) }

// list returns a pointer to the slice for the given kind (nil for an unknown
// kind).
func (d *Doc) list(kind string) *[]string {
	switch kind {
	case KindChampions:
		return &d.Champions
	case KindItems:
		return &d.Items
	case KindAbilities:
		return &d.Abilities
	}
	return nil
}

// ValidKind reports whether kind names one of the three curated lists.
func ValidKind(kind string) bool {
	switch kind {
	case KindChampions, KindItems, KindAbilities:
		return true
	}
	return false
}

// normalizeIDs trims, validates, de-duplicates and sorts a list of ids.
// Empty entries are dropped; an invalid id is a 400 (never silently ignored,
// so a typo in the admin console surfaces immediately).
func normalizeIDs(kind string, in []string) ([]string, error) {
	out := make([]string, 0, len(in))
	seen := make(map[string]struct{}, len(in))
	for _, raw := range in {
		id := strings.TrimSpace(raw)
		if id == "" {
			continue
		}
		if !idRe.MatchString(id) {
			return nil, httpx.BadRequest("invalid " + kind + " id: " + truncate(id, 40))
		}
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	if len(out) > MaxIDsPerKind {
		return nil, httpx.BadRequest("too many " + kind + " ids")
	}
	sort.Strings(out)
	return out, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// options carries the optional wiring shared by NewRepo and New.
type options struct{ contentDir string }

// Option configures a curation Repo/Service.
type Option func(*options)

// WithContentDir hands the content tree to the whitelist's GATE — the single
// funnel every read and write passes through (see transformevict.go). Two rules
// hang off it today and neither has a hand-written id:
//
//	· legacyevict.go   — the doc was archived under content/_legacy/  (GH#479)
//	· transformevict.go — it is a 變身態, `transform.role == "alternate"`
//	                      (owner 2026-08-21「幫我後台跳出一鍵清理變身態的按鈕」)
//
// Without it the gate is inert and logs that it is — the platform wires
// cfg.ContentDir in internal/server/server.go.
func WithContentDir(dir string) Option { return func(o *options) { o.contentDir = dir } }

func resolve(opts []Option) options {
	var o options
	for _, fn := range opts {
		fn(&o)
	}
	return o
}

// Repo is the durable store of the whitelist document: JSON truth via
// jsonstore, best-effort Redis mirror.
type Repo struct {
	store *jsonstore.Store
	rdb   *redisx.Client
	// gate evicts un-curatable ids on BOTH sides of the funnel — see Load/Save.
	gate WhitelistGate
}

// NewRepo builds the repository. rdb may be nil (no mirror).
func NewRepo(store *jsonstore.Store, rdb *redisx.Client, opts ...Option) *Repo {
	return &Repo{store: store, rdb: rdb, gate: LoadWhitelistGate(resolve(opts).contentDir)}
}

// Load reads the JSON truth, with retired content already evicted. A missing
// file is NOT an error — it is the default-empty state, reported via the
// second return value.
func (r *Repo) Load() (Doc, bool, error) {
	d, existed, _, err := r.load()
	return d, existed, err
}

// load is Load plus WHAT THE LEGACY GATE DROPPED. Only Service.Get wants the
// third value — it is the one caller that can durably self-heal the stored
// document and tell a human about it (see Service.Get).
func (r *Repo) load() (Doc, bool, []string, error) {
	d, existed, err := r.loadRaw()
	if err != nil {
		return d, existed, nil, err
	}
	d, removed := r.gate.Evict(d)
	return d, existed, removed, nil
}

func (r *Repo) loadRaw() (Doc, bool, error) {
	var d Doc
	err := r.store.Get(Collection, DocID, &d)
	if errors.Is(err, jsonstore.ErrNotFound) {
		return EmptyDoc(), false, nil
	}
	if err != nil {
		return EmptyDoc(), false, err
	}
	// Backfill hand-edited / older files: nil lists read as empty, a missing
	// version reads as the current one.
	if d.Champions == nil {
		d.Champions = []string{}
	}
	if d.Items == nil {
		d.Items = []string{}
	}
	if d.Abilities == nil {
		d.Abilities = []string{}
	}
	if d.Version == 0 {
		d.Version = SchemaVersion
	}
	return d, true, nil
}

// Save writes the JSON truth atomically, then mirrors into Redis. A mirror
// failure is logged, never fatal: Redis is rebuildable, the file is the truth.
//
// ⭐ The LEGACY GATE runs here as well as in Load, and that is the half that
// makes a retired id UNSTORABLE rather than merely unserved: an admin PUT/bulk
// (or a restore from an old ops bundle) that names one is dropped on the way to
// disk, so it cannot come back the next time the gate happens to be inert.
func (r *Repo) Save(ctx context.Context, d Doc) error {
	_, err := r.save(ctx, d)
	return err
}

// save is Save returning THE DOCUMENT THAT WAS ACTUALLY STORED.
//
// ⚠️ Every mutation must answer with this rather than with its own input: the
// gate below rewrites the document on its way to disk, so returning the input
// would make the admin console (and the HTTP response it renders) show ids that
// are not on disk and will not be served — a whitelist that reads back
// differently from what it stored is worse than one that refuses the write.
func (r *Repo) save(ctx context.Context, d Doc) (Doc, error) {
	d, removed := r.gate.Evict(d)
	if len(removed) > 0 {
		slog.Warn("curation: refused to store whitelist entries the content tree says are not curatable "+
			"(archived under content/_legacy/, or a 變身態)",
			"count", len(removed), "removed", removed, "reasons", r.gate.Reasons(removed))
	}
	if err := r.store.Put(Collection, DocID, d); err != nil {
		return d, err
	}
	r.mirror(ctx, d)
	return d, nil
}

func (r *Repo) mirror(ctx context.Context, d Doc) {
	if r.rdb == nil {
		return
	}
	data, err := json.Marshal(d)
	if err != nil {
		return
	}
	if err := r.rdb.R.Set(ctx, RedisKey, string(data), 0).Err(); err != nil {
		slog.Warn("curation: redis mirror failed (JSON truth is intact)", "err", err)
	}
	// AND TELL THE RUNNING SHARDS. The mirror above only helps a consumer that
	// polls Redis; the game-server reads over HTTP and caches, so before this
	// announcement an operator's whitelist edit reached a RUNNING shard only
	// when its short TTL happened to expire. The payload is the etag of exactly
	// the bytes we just wrote — the shard re-fetches the authoritative document
	// rather than trusting anything in this message (see redisx/contentbus.go).
	// Best-effort: the durable file is already written, so a failure here means
	// "picked up on the next TTL", not "lost".
	if err := r.rdb.PublishContentInvalidation(
		ctx, redisx.ContentKindCuration, redisx.ContentETag(data), d.UpdatedAt,
	); err != nil {
		slog.Warn("curation: content-invalidation publish failed (shards refresh on their TTL)", "err", err)
	}
}

// Service applies whitelist policy on top of the repository. The document is
// tiny and single-writer, so one mutex around the read-modify-write cycle is
// all the concurrency control needed.
type Service struct {
	repo  *Repo
	store *jsonstore.Store
	mu    sync.Mutex
	now   func() time.Time
	// starter is the source of the built-in bundle, behind a seam so tests can
	// inject one. See SetStarter in reset.go for why the seam has to exist.
	starter func() Doc
}

// New builds the service. rdb may be nil (mirror disabled). Pass
// WithContentDir to arm the gate (see transformevict.go).
func New(store *jsonstore.Store, rdb *redisx.Client, opts ...Option) *Service {
	repo := NewRepo(store, rdb, opts...)
	repo.gate.LogBootSummary()
	return &Service{repo: repo, store: store, now: time.Now, starter: StarterSet}
}

// SetNow overrides the clock seam (tests inject a fixed clock so updatedAt is
// deterministic).
func (s *Service) SetNow(fn func() time.Time) { s.now = fn }

// Get returns the current whitelist. On a fresh install the file does not
// exist yet: the empty document is created LAZILY (so operators can see and
// hand-edit it) and returned — nothing is ever seeded into it.
//
// ⭐ IT ALSO SELF-HEALS THE STORED DOCUMENT. A whitelist written before a
// champion/item/ability was archived keeps pointing at content/_legacy/ — the
// three ids GH#479 left checked on this box are exactly that. Load already
// strips them from the ANSWER, but a document that gets re-cleaned on every
// read is a permanent lie on disk that the next `opstate export` copies to the
// next machine. So when the gate actually drops something, the cleaned document
// is written back ONCE and the drop is recorded as an ADMIN AUDIT ENTRY —
// visible on the console's 稽核 page, the same channel every other whitelist
// mutation uses, ⛔ not a log line nobody reads (CLAUDE.md「fail-open 沒錯,
// 靜默才是缺陷」). After that first write the gate finds nothing and says
// nothing, so this cannot become per-request noise.
func (s *Service) Get(ctx context.Context) (Doc, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	doc, existed, evicted, err := s.repo.load()
	if err != nil {
		return EmptyDoc(), err
	}
	if !existed || len(evicted) > 0 {
		doc.UpdatedAt = s.now().UTC()
		if err := s.repo.Save(ctx, doc); err != nil {
			// A read must not fail because the lazy create / self-heal failed;
			// the cleaned document is still the correct answer.
			slog.Warn("curation: could not persist the whitelist", "evicted", len(evicted), "err", err)
		} else if len(evicted) > 0 {
			slog.Warn("curation: dropped whitelist entries archived under content/_legacy/",
				"count", len(evicted), "removed", evicted)
			s.Audit("system", "curation.legacy-evict", map[string]any{
				"removed": evicted,
				"count":   len(evicted),
				"reasons": s.repo.gate.Reasons(evicted),
				"trigger": "auto-self-heal",
				"why": "`legacy-archived` = the doc lives under content/_legacy/ and can no longer load, " +
					"so keeping it checked only shrank champ-select / the shop / the EX hotkey silently; " +
					"`transformed-body` = transform.role == \"alternate\", a body reached only by casting " +
					"the transform ability, so it is never a pickable champion",
			})
		}
	}
	return doc, nil
}

// Replace overwrites the whole document (PUT semantics). Input is normalized
// (trimmed, de-duplicated, sorted) and validated; version/updatedAt are owned
// by the server, never by the caller.
func (s *Service) Replace(ctx context.Context, in Doc) (Doc, error) {
	champs, err := normalizeIDs(KindChampions, in.Champions)
	if err != nil {
		return EmptyDoc(), err
	}
	items, err := normalizeIDs(KindItems, in.Items)
	if err != nil {
		return EmptyDoc(), err
	}
	abilities, err := normalizeIDs(KindAbilities, in.Abilities)
	if err != nil {
		return EmptyDoc(), err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	doc := Doc{
		Version:   SchemaVersion,
		UpdatedAt: s.now().UTC(),
		Champions: champs,
		Items:     items,
		Abilities: abilities,
	}
	stored, err := s.repo.save(ctx, doc)
	if err != nil {
		return EmptyDoc(), err
	}
	return stored, nil
}

// Bulk enables and/or disables ids of ONE kind, leaving the other kinds
// untouched. Disable wins over enable for an id present in both lists (the
// least surprising resolution of a contradictory request). Enabling an
// already-enabled id is a no-op, so the call is idempotent and safe to retry.
func (s *Service) Bulk(ctx context.Context, kind string, enable, disable []string) (Doc, error) {
	if !ValidKind(kind) {
		return EmptyDoc(), httpx.BadRequest(`kind must be one of "champions", "items", "abilities"`)
	}
	add, err := normalizeIDs(kind, enable)
	if err != nil {
		return EmptyDoc(), err
	}
	remove, err := normalizeIDs(kind, disable)
	if err != nil {
		return EmptyDoc(), err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	doc, _, err := s.repo.Load()
	if err != nil {
		return EmptyDoc(), err
	}
	target := doc.list(kind)

	removeSet := make(map[string]struct{}, len(remove))
	for _, id := range remove {
		removeSet[id] = struct{}{}
	}
	merged := make([]string, 0, len(*target)+len(add))
	seen := make(map[string]struct{}, len(*target)+len(add))
	for _, id := range append(append([]string{}, *target...), add...) {
		if _, dropped := removeSet[id]; dropped {
			continue
		}
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		merged = append(merged, id)
	}
	if len(merged) > MaxIDsPerKind {
		return EmptyDoc(), httpx.BadRequest("too many " + kind + " ids")
	}
	sort.Strings(merged)
	*target = merged
	doc.Version = SchemaVersion
	doc.UpdatedAt = s.now().UTC()
	stored, err := s.repo.save(ctx, doc)
	if err != nil {
		return EmptyDoc(), err
	}
	return stored, nil
}

// ApplyStarterSet unions the built-in starter set into the whitelist (never
// removes anything) so a fresh install is one click away from being playable.
// Idempotent.
func (s *Service) ApplyStarterSet(ctx context.Context) (Doc, error) {
	starter := s.starter()
	s.mu.Lock()
	defer s.mu.Unlock()
	doc, _, err := s.repo.Load()
	if err != nil {
		return EmptyDoc(), err
	}
	doc.Champions = union(doc.Champions, starter.Champions)
	doc.Items = union(doc.Items, starter.Items)
	doc.Abilities = union(doc.Abilities, starter.Abilities)
	doc.Version = SchemaVersion
	doc.UpdatedAt = s.now().UTC()
	stored, err := s.repo.save(ctx, doc)
	if err != nil {
		return EmptyDoc(), err
	}
	return stored, nil
}

// ApplyStarterSetIfEmpty is the AUTOMATED door (cmd/seed -starter, K8s
// post-install, CI, a fresh dev box). It applies the starter bundle ONLY when
// the whitelist is genuinely unset — no champions enabled — and reports
// whether it wrote anything.
//
// The emptiness guard is the whole point: an operator who has already curated
// (even down to a single champion, even by DISABLING everything the bundle
// suggested) must never have their choices re-expanded behind their back on
// the next restart. The check and the write share the same mutex, so a
// concurrent admin edit cannot slip between them.
//
// applied=false is a normal outcome, not an error.
func (s *Service) ApplyStarterSetIfEmpty(ctx context.Context) (doc Doc, applied bool, err error) {
	s.mu.Lock()
	cur, existed, loadErr := s.repo.Load()
	s.mu.Unlock()
	if loadErr != nil {
		return EmptyDoc(), false, loadErr
	}
	// "Genuinely empty" = no champion is enabled. Items/abilities alone cannot
	// make a match playable, but a curated champion list always means a human
	// has been here — including the case where they deliberately pruned the
	// bundle back down.
	if existed && len(cur.Champions) > 0 {
		return cur, false, nil
	}
	applied2, err := s.ApplyStarterSet(ctx)
	if err != nil {
		return EmptyDoc(), false, err
	}
	return applied2, true, nil
}

func union(a, b []string) []string {
	seen := make(map[string]struct{}, len(a)+len(b))
	out := make([]string, 0, len(a)+len(b))
	for _, id := range append(append([]string{}, a...), b...) {
		if id == "" {
			continue
		}
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	sort.Strings(out)
	return out
}

// Audit appends one line to the shared admin audit log so whitelist changes
// show up in the console's audit page next to every other operator action.
// Best-effort: a failed audit write never fails the mutation itself.
func (s *Service) Audit(adminID, action string, detail map[string]any) {
	entry := admin.AuditEntry{
		AdminID:  adminID,
		Action:   action,
		TargetID: Collection + "/" + DocID,
		Detail:   detail,
		TS:       s.now().UTC(),
	}
	if err := s.store.AppendLine(admin.ColAudit, entry.TS.Format("2006-01-02"), entry); err != nil {
		slog.Warn("curation: audit append failed", "action", action, "err", err)
	}
}
