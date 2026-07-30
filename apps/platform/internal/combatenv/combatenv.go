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
	"os"
	"path/filepath"
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

// Bounds for the eight 三圍 COEFFICIENTS (task #248). They are not ×factors:
// they say how much stat one point of strength/agility/intelligence is worth,
// so their shipped values (23 hp per STR, 15 mana per INT) sit ABOVE MaxFactor,
// and 0 is a meaningful setting ("turn this derivation axis off") where a 0
// damage multiplier is not. Mirrors ATTRIBUTE_COEF_MAX in the shared sim.
const (
	MinAttrCoef = 0.0
	MaxAttrCoef = 100.0
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
	// abilityRange scales ability reach/AoE (task #136). It was added to
	// packages/shared and to the content tree but not here, so the console could
	// not see or edit it — see the drift guard in keysync_test.go.
	"abilityRange",
	// itemCooldown scales an ITEM passive's internal cooldown only (#189).
	// Ships at 1.0 — before #189 nothing scaled item ICDs at all, so 1.0 is the
	// value that changes no existing behaviour. It is a ×factor, not a
	// coefficient, so it keeps the [MinFactor, MaxFactor] band.
	"itemCooldown",
	// The eight 三圍 coefficients (task #248). Not ×factors — see AttrDefaults.
	"strToMaxHealth",
	"strToHealthRegen",
	"strToAttackDamage",
	"agiToArmor",
	"agiToAttackSpeed",
	"intToMaxMana",
	"intToManaRegen",
	"intToAbilityPower",
	// #221 owner 2026-07-30. 第二個 owner 自己發明的軸(與 intToAbilityPower 同類),
	// 魔獸三代沒有魔抗這根屬性 —— 所以它沒有可以對照的原作值。
	//
	// ⚠️ 這一格漏掉不是「少一個欄位」而已:sanitizeFrom / sanitize / baseDoc /
	// DefaultDoc 全部是 `for _, k := range Keys` **重建整張 map**,所以不在這裡的 key
	// 會被平台從它服務的每一張表**丟掉** —— 後台看不到、改不了,對操作者等同寫死。
	// 這正是 keysync_test.go 檔頭記的 #136 abilityRange 事故。
	"intToMagicResist",
}

// AttrDefaults is the SHIPPED value of each 三圍 coefficient (task #248),
// mirroring ATTRIBUTE_ENV_DEFAULTS in packages/shared/src/sim/combatEnv.ts.
// Membership here is also what makes a key a "coefficient": it gets the
// [MinAttrCoef, MaxAttrCoef] bounds instead of the ×factor ones, and its
// neutral/reset value is this number rather than 1.0.
//
// Getting this wrong is not cosmetic. A missing key falls back to 1.0 in
// sanitize(), and "力量 → 生命 = 1" would give every champion roughly 4% of its
// intended health — so keysync_test.go asserts this map against the shared
// literal, key for key and value for value.
//
// PROVENANCE lives on the shared literal (ATTRIBUTE_ENV_DEFAULTS) — file and
// field per coefficient. Seven of the eight are IMPORTED from the source map's
// own war3mapMisc.txt (which overrides four of Blizzard's MiscGame.txt numbers)
// or from Blizzard's table where the map is silent; only intToAbilityPower is
// the owner's design. Do not "correct" these back to the WC3 defaults from
// memory — 25 / 0.05 / 0.30 / 0.05 are Blizzard's, and this map is not on them.
var AttrDefaults = map[string]float64{
	"strToMaxHealth":    23,   // war3mapMisc.txt StrHitPointBonus  (Blizzard 25)
	"strToHealthRegen":  0.04, // war3mapMisc.txt StrRegenBonus     (Blizzard 0.05)
	"strToAttackDamage": 1,    // war3mapMisc.txt StrAttackBonus    (Blizzard 1.0)
	"agiToArmor":        0.15, // war3mapMisc.txt AgiDefenseBonus   (Blizzard 0.30)
	"agiToAttackSpeed":  0.02, // Blizzard MiscGame.txt AgiAttackSpeedBonus (map silent)
	"intToMaxMana":      15,   // war3mapMisc.txt IntManaBonus      (Blizzard 15)
	"intToManaRegen":    0.07, // war3mapMisc.txt IntRegenBonus     (Blizzard 0.05)
	"intToAbilityPower": 1,    // OWNER'S DESIGN — no WC3 source exists
	"intToMagicResist":  0.6,  // OWNER'S DESIGN — no WC3 source exists (#221)
}

// IsAttrCoef reports whether k is one of the eight 三圍 coefficients.
func IsAttrCoef(k string) bool {
	_, ok := AttrDefaults[k]
	return ok
}

// DefaultFor is a key's shipped value: 1.0 for a ×factor, the imported
// (map/Blizzard) or owner-designed coefficient for a 三圍 key.
func DefaultFor(k string) float64 {
	if v, ok := AttrDefaults[k]; ok {
		return v
	}
	return 1.0
}

// Bounds is the legal [min, max] a PUT accepts for one key.
func Bounds(k string) (float64, float64) {
	if IsAttrCoef(k) {
		return MinAttrCoef, MaxAttrCoef
	}
	return MinFactor, MaxFactor
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

// DefaultDoc is the shipped table: every ×factor 1.0 (byte-identical legacy
// combat behavior) and every 三圍 coefficient at its imported/design value. It is
// the floor, NOT what an operator should be shown — see contentDefaults and
// Service.baseDoc.
func DefaultDoc() Doc {
	m := make(map[string]float64, len(Keys))
	for _, k := range Keys {
		m[k] = DefaultFor(k)
	}
	return Doc{Version: SchemaVersion, Multipliers: m}
}

// contentDoc is the shape of content/config/combat-env.json.
type contentDoc struct {
	Schema      string             `json:"schema"`
	Multipliers map[string]float64 `json:"multipliers"`
}

// loadContentDefaults reads the CONTENT-AUTHORED multiplier table from
// <contentDir>/config/combat-env.json — the same document the game-server
// applies as its base layer (apps/game-server/src/config/combatEnv.ts).
//
// Why the platform needs it: this table is a MERGE of content defaults and the
// operator override, and the console edits the override. Before this, the
// platform only knew the neutral 1.0 table, so the 戰鬥系統 page rendered every
// slider at 1.0 no matter what the content tree actually said — and because a
// PUT is complete-desired-state (omitted keys reset to the base), saving any
// single change wrote 1.0 over EVERY content-authored value. An operator who
// nudged one number silently destroyed the whole tuning. Seeding from content
// makes the page show what is really in effect and makes a save preserve it.
//
// Never fatal: an unreadable or malformed file leaves the neutral table, which
// is exactly the behaviour that existed before, and is logged once.
func loadContentDefaults(contentDir string) map[string]float64 {
	out := make(map[string]float64, len(Keys))
	if contentDir == "" {
		return out
	}
	path := filepath.Join(contentDir, "config", "combat-env.json")
	// #nosec G304 -- operator-configured CONTENT_DIR joined with two string
	// literals; the empty-contentDir case returned above. No request data here.
	raw, err := os.ReadFile(path)
	if err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			slog.Warn("combatenv: could not read content defaults; falling back to the neutral table",
				"path", path, "err", err)
		}
		return out
	}
	var d contentDoc
	if err := json.Unmarshal(raw, &d); err != nil {
		slog.Warn("combatenv: malformed content defaults; falling back to the neutral table",
			"path", path, "err", err)
		return out
	}
	for _, k := range Keys {
		if v, ok := d.Multipliers[k]; ok && !math.IsNaN(v) && !math.IsInf(v, 0) {
			out[k] = v
		}
	}
	return out
}

// baseDoc is the table an operator starts from: content-authored values where
// the content tree has an opinion, 1.0 everywhere else.
func (s *Service) baseDoc() Doc {
	doc := DefaultDoc()
	for k, v := range s.contentDefaults {
		doc.Multipliers[k] = v
	}
	return doc
}

// sanitize backfills missing keys from base, drops unknown keys, and replaces
// non-finite values — tolerance for hand-edited / older files. It never
// rejects: the durable file was already validated at write time. base carries
// the content-authored values so a doc written before a key existed picks up
// the content value rather than a bare 1.0.
func (d *Doc) sanitizeFrom(base map[string]float64) {
	out := make(map[string]float64, len(Keys))
	for _, k := range Keys {
		v, ok := d.Multipliers[k]
		if !ok || math.IsNaN(v) || math.IsInf(v, 0) {
			v = DefaultFor(k)
			if bv, has := base[k]; has {
				v = bv
			}
		}
		out[k] = v
	}
	d.Multipliers = out
	if d.Version == 0 {
		d.Version = SchemaVersion
	}
}

// sanitize backfills missing keys with their shipped default, drops unknown
// keys, and replaces non-finite values — tolerance for hand-edited / older
// files. It never rejects: the durable file was already validated at write
// time. NOTE the backfill is `DefaultFor`, not a bare 1.0: a doc written before
// #248 carries no 三圍 coefficients, and filling those with 1 would ship a
// roster at ~4% of its intended health.
func (d *Doc) sanitize() {
	out := make(map[string]float64, len(Keys))
	for _, k := range Keys {
		v, ok := d.Multipliers[k]
		if !ok || math.IsNaN(v) || math.IsInf(v, 0) {
			v = DefaultFor(k)
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

// Load reads the JSON truth. A missing file is NOT an error — it means no
// operator has ever saved, reported via the second return value, and the
// caller substitutes its base table. base supplies the content-authored values
// used to backfill a doc that predates a key.
func (r *Repo) Load(base Doc) (Doc, bool, error) {
	var d Doc
	err := r.store.Get(Collection, DocID, &d)
	if errors.Is(err, jsonstore.ErrNotFound) {
		return base, false, nil
	}
	if err != nil {
		return base, false, err
	}
	d.sanitizeFrom(base.Multipliers)
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
	// AND TELL THE RUNNING SHARDS. The Set above only helps a consumer that
	// polls Redis; the game-server reads GET /api/v1/combat-env over HTTP and
	// CACHES it, so without this announcement an operator's 戰鬥系統 edit reaches
	// a running shard only when its TTL happens to expire. Same contract as
	// curation: an etag, never the document — the shard re-fetches through the
	// one ingestion path #48 hardened (see redisx/contentbus.go).
	//
	// DELETED ONCE ALREADY, BY ACCIDENT (#250). Commit 7dd31bf ("sweep gosec")
	// removed these eight lines while adding an unrelated #nosec annotation
	// twenty lines above. Nothing about the mutation broke — the file still
	// saved, the mirror still wrote, the console still answered 200 — so the
	// only witness was TestCombatEnvReplacePublishesInvalidation going red, and
	// that red was then written off in docs/todo/admin.md as "this machine has
	// no Redis" (it does not need one; the test runs miniredis in-process). The
	// combat-env bus was dead in every build from that commit onward. If this
	// block ever looks like dead weight in a sweep: it is the whole reason the
	// owner does not have to restart a shard after nudging a multiplier.
	//
	// Best-effort by contract: the durable file is already written above, so a
	// failure here means "picked up on the next TTL", never "the edit was lost".
	if err := r.rdb.PublishContentInvalidation(
		ctx, redisx.ContentKindCombatEnv, redisx.ContentETag(data), d.UpdatedAt,
	); err != nil {
		slog.Warn("combatenv: content-invalidation publish failed (shards refresh on their TTL)", "err", err)
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
	// contentDefaults is the content-authored table (see loadContentDefaults).
	// It is the base an operator edits FROM, so a save preserves whatever the
	// content tree set rather than flattening it to 1.0.
	contentDefaults map[string]float64
}

// New builds the service. rdb may be nil (mirror disabled). contentDir points
// at the read-only content/ tree; an empty or unreadable one just means the
// neutral table is the base.
func New(store *jsonstore.Store, rdb *redisx.Client, contentDir string) *Service {
	return &Service{
		repo:            NewRepo(store, rdb),
		store:           store,
		now:             time.Now,
		contentDefaults: loadContentDefaults(contentDir),
	}
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
	base := s.baseDoc()
	doc, stored, err := s.repo.Load(base)
	if err != nil {
		return base, false, err
	}
	return doc, stored, nil
}

// ContentDefaults exposes the content-authored base table (a copy) so tests and
// callers can assert what an operator is editing FROM.
func (s *Service) ContentDefaults() map[string]float64 {
	out := make(map[string]float64, len(s.contentDefaults))
	for k, v := range s.contentDefaults {
		out[k] = v
	}
	return out
}

// Replace overwrites the whole table (PUT semantics). The input may be SPARSE:
// omitted keys reset to the CONTENT-AUTHORED value (1.0 only where content has
// no opinion) — the payload is the complete desired state, mirroring
// curation.Replace. Resetting to the content value rather than to a bare 1.0
// is what stops a one-slider edit in the console from flattening the whole
// tuning: the operator is editing a DELTA over content, not authoring the
// table from nothing. Every present key must be a known quantity and every
// factor within [MinFactor, MaxFactor] — anything else is a 400, never
// silently dropped. version/updatedAt are server-owned.
func (s *Service) Replace(ctx context.Context, in map[string]float64) (Doc, error) {
	for k, v := range in {
		if !KnownKey(k) {
			return DefaultDoc(), httpx.BadRequest("unknown multiplier key: " + truncate(k, 40))
		}
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return DefaultDoc(), httpx.BadRequest("multiplier " + k + " must be a finite number")
		}
		lo, hi := Bounds(k)
		if v < lo || v > hi {
			return DefaultDoc(), httpx.BadRequest(
				"multiplier " + k + " must be between " +
					strconv.FormatFloat(lo, 'g', -1, 64) + " and " +
					strconv.FormatFloat(hi, 'g', -1, 64))
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	// Start from the CONTENT-authored table, not the neutral one: an omitted
	// key means "leave it as content set it", not "flatten it to 1.0".
	doc := s.baseDoc()
	for k, v := range in {
		doc.Multipliers[k] = v
	}
	doc.Version = SchemaVersion
	doc.UpdatedAt = s.now().UTC()
	if err := s.repo.Save(ctx, doc); err != nil {
		return s.baseDoc(), err
	}
	return doc, nil
}

// NonNeutral returns the entries that differ from their SHIPPED default,
// sorted by key — the compact audit-detail form of a table (a save that
// changes nothing audits as {}). "Shipped default", not 1.0: the eight 三圍
// coefficients ship at 25 / 15 / 0.05 …, and measuring them against 1 would
// stamp eight phantom changes onto every audit line.
func NonNeutral(d Doc) map[string]float64 {
	out := map[string]float64{}
	keys := make([]string, 0, len(d.Multipliers))
	for k := range d.Multipliers {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		if d.Multipliers[k] != DefaultFor(k) {
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
