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

// Factor bounds. A factor outside this range on a PUT is a 400.
//
// ⚠️ CORRECTED 2026-08-10. The ceiling was 10.0 with the note "0.1..10 spans
// every sane balance experiment". That claim was FALSE the day owner tuned
// manaRegen 8 -> 16: the shipped content file passed (shared's Zod band is
// 0..100) but every admin-console save of the 戰鬥系統 page would have answered
// 400, i.e. the operator's own tuned value locked him out of the page that
// tunes it. Nothing went red — the two bands disagreed silently.
//
// The ceiling's real job is catching a STRAY ZERO, and a stray zero on a small
// factor (0.2 -> 2) is inside ANY band loose enough to let an operator double a
// knob, so it was never catchable here. What IS catchable is a stray zero on a
// large one: 16 -> 160. 50 admits the shipped 16 with 3x headroom and still
// rejects 160.
//
// ⛔ Do not read this as "bounds are pointless" — the FLOOR still stops a 0 (a
// zero damage multiplier bricks a match) and the ceiling still stops 160.
const (
	MinFactor = 0.1
	MaxFactor = 50.0
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
	"abilityDamage", // 系統技能倍率（僅 ability 起源）— owner 2026-08-23
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
	// 金錢發放倍率 ×5 (owner 2026-08-04「金錢發放有點太浮濫了…分為 回合發放倍率,
	// 打殭屍發放倍率, 擊敗英雄發放倍率, 完成任務發放倍率」, 同日追加「普通殭屍
	// 的確也可以單獨倍率, 預設改成 0.5」—— 打殭屍那一格因此拆成 mob / elite).
	//
	// ⚠️ 它們的下限是 0,不是 MinFactor(0.1) —— 「這一類完全不發」是 owner 指名
	// 要能設定的狀態。見 GoldFactors / Bounds。上限 MaxGoldFactor(10) 是防呆:
	// 手滑打成 100 會讓一隻殭屍等於一整套裝備。
	//
	// ⚠️ goldEliteKill 收的是 特殊殭屍 + 殭屍王 (不是 goldQuest)。殭屍王是全場
	// 最大的一筆金源, 而 #262/#263 都還 pending —— 掛在 完成任務 那一格等於掛在
	// 一個沒人會去轉的旋鈕上。
	"goldRoundPayout",
	"goldMobKill",
	"goldEliteKill",
	"goldHeroKill",
	"goldQuest",
	// ── 2026-08-10 owner ×3 ────────────────────────────────────────────────
	// 「config 加一格 moveSpeedByAttackType 預設為(近戰/遠戰) 0.8/0.6」+
	// 「加一格 magicResistMult 預設 0.2」.
	//
	// moveSpeedMelee / moveSpeedRanged 是 owner 那一格 moveSpeedByAttackType 落成
	// 兩個純量 —— 這張表(以及 sim 的 CombatEnvMultipliers、Zod、後台表格、線上
	// JSON)全部是扁平的 key→float，一個巢狀物件要在五個地方多一種形狀，才能講出
	// 兩列已經講完的事。
	//
	// 三個都是普通 ×factor，所以 Bounds 走 [MinFactor, MaxFactor]。
	// ⚠️ 2026-08-10：那個區間是 [0.1, 50]，不是註解原本寫的 [0.1, 10]（推導見 MaxFactor）。
	// ⛔ 這裡刻意**不抄數字** —— 抄一份就是第四個住處，而它一定會跟上面那兩個分岔。
	// 出貨值 (0.8 / 0.6 / 0.2) 住在 content/config/combat-env.json，不是 DefaultFor
	// —— 缺席一律 1.0，舊的 config / overlay 因此逐位元不變。
	"moveSpeedMelee",
	"moveSpeedRanged",
	"magicResistMult",
	// owner 2026-08-22：每點力量 +0.1% 暴擊率 · 每點敏捷 +0.02% 迴避率。
	// append-only：TS 那一份（sim/combatEnv.ts COMBAT_ENV_KEYS）逐元素鏡射這裡。
	"strToCritChance",
	"agiToEvasion",
}

// Bounds for the five 金錢發放 factors. They are ×factors like the eighteen
// legacy rows — their neutral value IS 1.0, so DefaultFor needs no entry — but
// their FLOOR is 0: 「完全不發」 is a setting the owner asked for, whereas a 0
// damage multiplier is a broken match, which is the only reason MinFactor is
// 0.1. Mirrors GOLD_FACTOR_MIN / GOLD_FACTOR_MAX in packages/shared.
//
// NOTE two of the five SHIP below 1.0 (goldMobKill 0.5, goldEliteKill 0.1) —
// that lives in content/config/combat-env.json, which loadContentDefaults reads,
// NOT in DefaultFor. DefaultFor stays the neutral floor exactly like every other
// ×factor, so a platform with no content tree still serves a table that changes
// nothing.
const (
	MinGoldFactor = 0.0
	MaxGoldFactor = 10.0
)

// GoldFactors is the membership test that gives a key the gold band. Kept as a
// set (not a prefix check on "gold") so a future key that merely READS as an
// economy row cannot silently inherit a 0 floor it was never reviewed for.
var GoldFactors = map[string]struct{}{
	"goldRoundPayout": {},
	"goldMobKill":     {},
	"goldEliteKill":   {},
	"goldHeroKill":    {},
	"goldQuest":       {},
}

// IsGoldFactor reports whether k is one of the five 金錢發放 factors.
func IsGoldFactor(k string) bool {
	_, ok := GoldFactors[k]
	return ok
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
	"strToAttackDamage": 0.4,  // owner 2026-08-13 從 1 調降（原 war3mapMisc.txt StrAttackBonus 1.0）
	"agiToArmor":        0.15,
	"strToCritChance":   0,
	"agiToEvasion":      0,    // war3mapMisc.txt AgiDefenseBonus   (Blizzard 0.30)
	"agiToAttackSpeed":  0.01, // ⚠️ 這一格是 MULTIPLICATIVE —— 見 shared 的說明
	"intToMaxMana":      15,   // war3mapMisc.txt IntManaBonus      (Blizzard 15)
	"intToManaRegen":    0.21, // war3mapMisc.txt IntRegenBonus 0.07 ×3（owner 2026-08-20, GH#446）
	"intToAbilityPower": 6.5,    // OWNER'S DESIGN — no WC3 source exists
	"intToMagicResist":  0,    // ⭐ owner 2026-08-16「**拆掉智慧→魔抗**」（屬性表第二版）
}

// ⚠️ 2026-08-16 —— 上面四格是**跟著 shared 改的**，⛔ 不是這裡自己調的：
//
//	strToAttackDamage  1   → 0.4    agiToAttackSpeed  0.02 → 0.01
//	intToAbilityPower  1   → 6.5    intToMagicResist  0.6  → 0（拆掉）
//
// 平行 session 在 `3d26ac15`（十定位 × 十一屬性第二版）改了
// `packages/shared/src/sim/combatEnv.ts` 的 ATTRIBUTE_ENV_DEFAULTS，這份鏡像沒跟上。
//
// ⭐ 這跟同一天的英雄名單事故是**同一種病**：一張表兩份抄寫，分開看兩邊都「對」，
// 只有**比對**看得出來。抓到它的正是那個比對（`keysync_test.go`）——
// ⇒ 它紅的時候不要改測試，去看 shared 那一份寫什麼。
//
// ⚠️ 2026-08-24（GH#633）—— 又漂了兩格，⛔ 同樣是**跟著 shared 改的**：
//
//	intToManaRegen  0.07 → 0.21   （owner 2026-08-20「智慧影響回魔可以增加更多」GH#446）
//	intToAbilityPower 6.5 → 4     （2026-08-22 系統倍率折進基礎層那一批）
//
// ⭐ 而那個**比對這一次沒有叫** —— 它先撞死在自己的 `require.Len(shared, 9)` 上：
// shared 早就長到 11 格，所以測試在還沒比對任何一個「值」之前就 FAIL 了，
// 而它報的是「應該有 9 個」這種與缺陷無關的訊息（第二守則失敗形態④）。
// ⇒ 那個字面 `9` 就是這張表的**第四個住處**。已經拆掉，見 keysync_test.go。
//
// ⚠️ 而且 `go test` **不在 `pnpm ship:check` 裡**（它只跑 vitest suites），
// 所以這條紅了幾天沒有人看見。`tools/testrunner/suites.yaml` 的 `platform-go`
// 是 enabled 的，但那是另一支 runner。⇒ 要不要把它接進出貨閘是主 session 的決定。

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
	if IsGoldFactor(k) {
		return MinGoldFactor, MaxGoldFactor
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
//
// ⚠️ READ ONCE, AT PROCESS START — AND `--content-only` DOES NOT RESTART THIS
// PROCESS (noted 2026-08-04, for whoever tunes the gold knobs next).
//
// There is exactly one call site in the whole tree: Service.New, from
// server.go's boot. So the map below is a SNAPSHOT of content/config at the
// moment the platform started. content/ is a live bind-mount that `git pull`
// updates, and `scripts/host-deploy.sh --content-only` deliberately restarts
// only the game shard — so after a content-only deploy:
//
//	· a real MATCH reads the NEW value. The game-server merges
//	  `{...content, ...adminOverride}` itself (apps/game-server/src/config/
//	  combatEnv.ts) off the same bind-mount, and it was restarted.
//	· the 後台 戰鬥系統 page shows the OLD one, because the "base an operator
//	  edits from" is this stale map — and every un-overridden key renders from
//	  it.
//
// Concretely: edit `goldMobKill` / `goldEliteKill` in content/config/
// combat-env.json, deploy with --content-only, and the console will keep
// showing the previous numbers (and a save would write them back as the
// operator override, pinning the stale value for real). It is not wrong
// enough to be a fail-loud condition — the game is correct — but it is a
// display that lies, which is the exact shape of defect the 顯示真實值 rule
// exists for.
//
// Two honest ways out when this starts costing time: re-read the file per
// GetStored (cheap; it is a few hundred bytes), or make --content-only bounce
// the platform too. Neither is done here because both are behaviour changes
// beyond the lane that found it.
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
