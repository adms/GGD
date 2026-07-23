// Package combatenv owns the GLOBAL combat-environment multiplier table
// (task #28 admin 戰鬥系統): one multiplicative factor per combat quantity
// (cooldown, damageDealt, defense, …) that the game-server snapshots into
// every NEWLY CREATED match. Running matches keep the table they started
// with — that is the deterministic-safe "dynamic" config: no restart needed,
// a change applies from the next match.
//
// Design (matches the platform conventions, mirroring internal/ai +
// internal/curation):
//   - Durable truth is ONE JSON file, data/config/combat-env.json, written
//     through the jsonstore (atomic tmp+rename, single writer). Redis only
//     ever holds a rebuildable best-effort mirror.
//   - The key set mirrors COMBAT_ENV_KEYS in
//     packages/shared/src/sim/combatEnv.ts (the sim engine is the source of
//     truth; a key added there must be added to Keys here too).
//   - Writes are admin-gated and STRICTLY validated: unknown keys and factors
//     outside [MinFactor, MaxFactor] are a 400 (mirroring curation's
//     normalizeIDs strictness) so an admin-console typo surfaces immediately.
//   - Reads are public and cacheable: the game-server fetches the table
//     WITHOUT a token at match creation (whitelist precedent) and fails safe
//     to its content defaults when the platform is unreachable.
package combatenv

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"math"
	"sort"
	"strconv"
	"sync"
	"time"

	"github.com/ggd/platform/internal/admin"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/httpx"
)

// Storage identifiers. The document lives at data/config/combat-env.json.
const (
	// Collection is the jsonstore collection (a directory under DATA_DIR).
	Collection = "config"
	// DocID is the single document id inside that collection.
	DocID = "combat-env"
	// RedisKey mirrors the marshalled document for Redis-native consumers.
	// It is a cache: the platform never reads it back as truth.
	RedisKey = "config:combat-env"
	// SchemaVersion is the doc version written by this build.
	SchemaVersion = 1
)

// Factor bounds. A factor outside this range on a PUT is a 400: 0.1..10 spans
// every sane balance experiment while keeping a fat-fingered "100" from
// bricking the next match.
const (
	MinFactor = 0.1
	MaxFactor = 10.0
)

// Keys is the canonical list of combat-env multiplier keys, mirroring
// COMBAT_ENV_KEYS in packages/shared/src/sim/combatEnv.ts. Order matters only
// for readability; membership is what validation enforces.
var Keys = []string{
	"cooldown",
	"damageDealt",
	"defense",
	"attackDamage",
	"abilityPower",
	"maxHealth",
	"healthRegen",
	"maxMana",
	"manaRegen",
	"moveSpeed",
	"attackSpeed",
	"healing",
	"shield",
	"critChance",
	"critDamage",
	"lifesteal",
	"attackRange",
}

var known = func() map[string]struct{} {
	m := make(map[string]struct{}, len(Keys))
	for _, k := range Keys {
		m[k] = struct{}{}
	}
	return m
}()

// KnownKey reports whether k names one of the sim's multiplier quantities.
func KnownKey(k string) bool {
	_, ok := known[k]
	return ok
}

// Doc is the combat-env document. Multipliers is ALWAYS the full table (every
// key present) so clients can render/consume it without backfilling.
type Doc struct {
	Version   int       `json:"version"`
	UpdatedAt time.Time `json:"updatedAt"`
	// Multipliers maps env key -> factor (1.0 = neutral / legacy behavior).
	Multipliers map[string]float64 `json:"multipliers"`
}

// DefaultDoc is the neutral table: every factor 1.0, byte-identical legacy
// combat behavior.
func DefaultDoc() Doc {
	m := make(map[string]float64, len(Keys))
	for _, k := range Keys {
		m[k] = 1.0
	}
	return Doc{Version: SchemaVersion, Multipliers: m}
}

// sanitize backfills missing keys with 1.0, drops unknown keys, and replaces
// non-finite values with 1.0 — tolerance for hand-edited / older files. It
// never rejects: the durable file was already validated at write time.
func (d *Doc) sanitize() {
	out := make(map[string]float64, len(Keys))
	for _, k := range Keys {
		v, ok := d.Multipliers[k]
		if !ok || math.IsNaN(v) || math.IsInf(v, 0) {
			v = 1.0
		}
		out[k] = v
	}
	d.Multipliers = out
	if d.Version == 0 {
		d.Version = SchemaVersion
	}
}

// Repo is the durable store of the combat-env document: JSON truth via
// jsonstore, best-effort Redis mirror.
type Repo struct {
	store *jsonstore.Store
	rdb   *redisx.Client
}

// NewRepo builds the repository. rdb may be nil (no mirror).
func NewRepo(store *jsonstore.Store, rdb *redisx.Client) *Repo {
	return &Repo{store: store, rdb: rdb}
}

// Load reads the JSON truth. A missing file is NOT an error — it is the
// shipped neutral table, reported via the second return value.
func (r *Repo) Load() (Doc, bool, error) {
	var d Doc
	err := r.store.Get(Collection, DocID, &d)
	if errors.Is(err, jsonstore.ErrNotFound) {
		return DefaultDoc(), false, nil
	}
	if err != nil {
		return DefaultDoc(), false, err
	}
	d.sanitize()
	return d, true, nil
}

// Save writes the JSON truth atomically, then mirrors into Redis. A mirror
// failure is logged, never fatal: Redis is rebuildable, the file is the truth.
func (r *Repo) Save(ctx context.Context, d Doc) error {
	if err := r.store.Put(Collection, DocID, d); err != nil {
		return err
	}
	r.mirror(ctx, d)
	return nil
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
		slog.Warn("combatenv: redis mirror failed (JSON truth is intact)", "err", err)
	}
}

// Service applies combat-env policy on top of the repository. The document is
// tiny and single-writer, so one mutex around the read-modify-write cycle is
// all the concurrency control needed.
type Service struct {
	repo  *Repo
	store *jsonstore.Store
	mu    sync.Mutex
	now   func() time.Time
}

// New builds the service. rdb may be nil (mirror disabled).
func New(store *jsonstore.Store, rdb *redisx.Client) *Service {
	return &Service{repo: NewRepo(store, rdb), store: store, now: time.Now}
}

// SetNow overrides the clock seam (tests inject a fixed clock so updatedAt is
// deterministic).
func (s *Service) SetNow(fn func() time.Time) { s.now = fn }

// Get returns the current table — the stored doc, or the neutral default when
// nothing has ever been saved (no lazy create: the neutral table needs no
// file to be correct).
func (s *Service) Get() (Doc, error) {
	doc, _, err := s.GetStored()
	return doc, err
}

// GetStored is Get plus whether the document actually exists on disk. The
// distinction matters to exactly one caller — the PUBLIC read the game-server
// consumes — because that read is MERGED OVER the content defaults with admin
// keys winning per key (see apps/game-server/src/config/combatEnv.ts). Serving
// the defaults-filled table when no operator has ever saved one therefore
// silently overwrites every content-authored multiplier with 1.0: the content
// tree's cooldown 0.25 / damageDealt 0.5 / maxHealth 8.0 / abilityRange 0.6
// would all revert the moment a game-server could reach a fresh platform.
// "Never configured" must stay distinguishable from "configured to neutral".
func (s *Service) GetStored() (Doc, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	doc, stored, err := s.repo.Load()
	if err != nil {
		return DefaultDoc(), false, err
	}
	return doc, stored, nil
}

// Replace overwrites the whole table (PUT semantics). The input may be SPARSE:
// omitted keys reset to the neutral 1.0 (the payload is the complete desired
// state, mirroring curation.Replace). Every present key must be a known
// quantity and every factor within [MinFactor, MaxFactor] — anything else is
// a 400, never silently dropped. version/updatedAt are server-owned.
func (s *Service) Replace(ctx context.Context, in map[string]float64) (Doc, error) {
	for k, v := range in {
		if !KnownKey(k) {
			return DefaultDoc(), httpx.BadRequest("unknown multiplier key: " + truncate(k, 40))
		}
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return DefaultDoc(), httpx.BadRequest("multiplier " + k + " must be a finite number")
		}
		if v < MinFactor || v > MaxFactor {
			return DefaultDoc(), httpx.BadRequest(
				"multiplier " + k + " must be between " +
					strconv.FormatFloat(MinFactor, 'g', -1, 64) + " and " +
					strconv.FormatFloat(MaxFactor, 'g', -1, 64))
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	doc := DefaultDoc()
	for k, v := range in {
		doc.Multipliers[k] = v
	}
	doc.Version = SchemaVersion
	doc.UpdatedAt = s.now().UTC()
	if err := s.repo.Save(ctx, doc); err != nil {
		return DefaultDoc(), err
	}
	return doc, nil
}

// NonNeutral returns the factors that differ from 1.0, sorted by key — the
// compact audit-detail form of a table (an all-neutral save audits as {}).
func NonNeutral(d Doc) map[string]float64 {
	out := map[string]float64{}
	keys := make([]string, 0, len(d.Multipliers))
	for k := range d.Multipliers {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		if d.Multipliers[k] != 1.0 {
			out[k] = d.Multipliers[k]
		}
	}
	return out
}

// Audit appends one line to the shared admin audit log so combat-env changes
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
		slog.Warn("combatenv: audit append failed", "action", action, "err", err)
	}
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
