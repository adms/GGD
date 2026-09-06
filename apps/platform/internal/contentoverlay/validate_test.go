package contentoverlay_test

// validate_test.go — the guards for the #283 write gate (validate.go).
//
// The order below is deliberate. The FIRST test is the regression one, because
// the way a gate like this fails in practice is not "it let something through",
// it is "it started refusing content that was always fine and nobody could save
// anything any more". Everything after it is a rejection guard, and every
// rejection guard names the field it expects to see in the message — an error
// that says "invalid" without saying WHERE is not an error an operator can act
// on, and a test that only asserts `err != nil` would pass for the wrong reason.

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/contentoverlay"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/pkg/testkit"
)

// ---------------------------------------------------------------- helpers --

// repoRoot walks out of apps/platform/internal/contentoverlay to the checkout.
func repoRoot(t *testing.T) string {
	t.Helper()
	root, err := filepath.Abs(filepath.Join("..", "..", "..", ".."))
	require.NoError(t, err)
	require.FileExists(t, filepath.Join(root, "pnpm-workspace.yaml"),
		"expected the monorepo root at %s", root)
	return root
}

func realContentDir(t *testing.T) string {
	t.Helper()
	dir := filepath.Join(repoRoot(t), "content")
	require.DirExists(t, dir)
	return dir
}

// newSvcOnRealContent builds a service whose SHIPPED TREE IS THE REPO'S OWN
// content/. Writes still go to a temp data dir — content/ is only ever read.
func newSvcOnRealContent(t *testing.T) *contentoverlay.Service {
	t.Helper()
	store, err := jsonstore.New(t.TempDir())
	require.NoError(t, err)
	svc := contentoverlay.New(store, nil, contentoverlay.WithContentDir(realContentDir(t)))
	svc.SetNow(func() time.Time { return time.Date(2026, 7, 29, 9, 0, 0, 0, time.UTC) })
	return svc
}

// shippedDocs walks content/<collection>/*.json for the real corpus.
func shippedDocs(t *testing.T, collection string) map[string][]byte {
	t.Helper()
	dir := filepath.Join(realContentDir(t), collection)
	entries, err := os.ReadDir(dir)
	require.NoError(t, err)
	out := map[string][]byte{}
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".json") || strings.HasPrefix(name, "_") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, name)) // #nosec G304 -- repo fixture
		require.NoError(t, err)
		out[strings.TrimSuffix(name, ".json")] = raw
	}
	return out
}

// ------------------------------------------------- 1. THE REGRESSION GUARD --

// content-overlay-gate-accepts-shipped: EVERY doc the repo ships must still be
// writable through the gate, unchanged.
//
// This is the guard that matters most and the one a hand-ported schema could not
// have passed for long. It runs the REAL 1800-doc corpus — the exact bytes an
// operator gets when they open a doc in the console, edit one number and press
// save — through the exact function PutDoc calls, twice: once as a brand-new
// overlay doc (no shipped counterpart in view) and once compared against the
// repo's own copy, which is the "operator re-saves what is already there" case.
func TestEveryShippedDocPassesTheGate(t *testing.T) {
	testkit.Cover(t, "content-overlay-gate-accepts-shipped")
	checked := 0
	for _, collection := range contentoverlay.KnownCollections {
		docs := shippedDocs(t, collection)
		require.NotEmpty(t, docs, "content/%s must ship documents", collection)
		for id, raw := range docs {
			// (a) written blind — the gate has no shipped doc to compare against
			require.NoError(t, contentoverlay.ValidateDoc(collection, id, raw, nil),
				"content/%s/%s.json must be writable with no shipped comparison", collection, id)
			// (b) written over itself — every path compared, nothing may differ
			require.NoError(t, contentoverlay.ValidateDoc(collection, id, raw, raw),
				"content/%s/%s.json must be writable over its own shipped copy", collection, id)
			checked++
		}
	}
	// A gate that silently checked NOTHING would also pass the loop above.
	assert.Greater(t, checked, 1500, "expected the whole content corpus, got %d docs", checked)
}

// content-overlay-gate-allows-real-edits: the three shapes a real console save
// takes must all go through the FULL PutDoc path against the REAL content tree.
//
// Separate from the corpus sweep on purpose: that one proves the pure function
// is permissive, this one proves the permissiveness survives the wiring, the
// shipped-tree lookup and the durable write.
func TestRealConsoleEditsStillSave(t *testing.T) {
	testkit.Cover(t, "content-overlay-gate-allows-real-edits")
	svc := newSvcOnRealContent(t)
	ctx := context.Background()

	// (a) the 基礎加成 page's doc, edited the way the page edits it
	bonus := json.RawMessage(`{"id":"base-bonus","schema":"config.base-bonus@1","bonus":{"maxHealth":420}}`)
	_, err := svc.PutDoc(ctx, "config", "base-bonus", bonus, "admin-1")
	require.NoError(t, err, "the 基礎加成 page must still be able to save")

	// (b) a champion doc with a field the shipped doc does NOT have — adding a
	// key is a legitimate edit and must not be judged
	champ := shippedDocs(t, "champions")["godie-e001"]
	require.NotEmpty(t, champ)
	var obj map[string]any
	require.NoError(t, json.Unmarshal(champ, &obj))
	obj["someBrandNewField"] = "後台加的"
	extended, err := json.Marshal(obj)
	require.NoError(t, err)
	_, err = svc.PutDoc(ctx, "champions", "godie-e001", extended, "admin-1")
	require.NoError(t, err, "adding a field the repo does not have must stay legal")

	// (c) an overlay-ONLY doc: the repo has never had this id, so there is
	// nothing to conform to and only the envelope applies
	_, err = svc.PutDoc(ctx, "champions", "godie-brand-new",
		json.RawMessage(`{"id":"godie-brand-new","schema":"champion@1","name":"新英雄"}`), "admin-1")
	require.NoError(t, err, "creating a doc the repo does not ship must stay legal")

	// (d) a doc that OMITS keys the repo's copy has. `hitFeel`, `transform` and
	// `icon` are all `.optional()` in packages/shared/src/content/schema/
	// champion.ts, so dropping them is a legitimate edit and the loader takes it.
	//
	// ⚠️ THIS CASE EXISTS BECAUSE MUTATION TESTING FOUND IT MISSING. conformObject
	// skips keys the incoming doc does not carry (`if !present { continue }`), and
	// NOTHING pinned that: flipping it to a rejection left the whole suite green,
	// because every other case here happens to write a key set identical to the
	// repo's. The branch is load-bearing — this gate cannot tell an optional field
	// from a required one (that is the schemas' knowledge, deliberately not
	// transcribed), so judging absence would refuse legitimate saves.
	for _, drop := range []string{"hitFeel", "transform", "icon"} {
		var partial map[string]any
		require.NoError(t, json.Unmarshal(champ, &partial))
		require.Contains(t, partial, drop, "the repo's godie-e001 must still carry %q for this case to mean anything", drop)
		delete(partial, drop)
		body, err := json.Marshal(partial)
		require.NoError(t, err)
		_, err = svc.PutDoc(ctx, "champions", "godie-e001", body, "admin-1")
		require.NoError(t, err, "omitting the optional field %q must not be refused", drop)
	}

	hd, err := svc.Head(ctx)
	require.NoError(t, err)
	assert.Equal(t, 3, hd.DocCount)
}

// ---------------------------------------------------- 2. THE DRIFT GUARD ---

// content-overlay-gate-collections-in-sync: KnownCollections is the ONE thing
// Go takes from TypeScript, so it is the one thing that can rot. Since GH#998 it
// is GENERATED (collections_gen.go, `pnpm collections:build`) and
// `pnpm collections:check` compares it byte-for-byte inside skills:check — but
// that gate only runs where node runs. This test is the Go-side last line: it
// reads COLLECTIONS out of packages/shared/src/content/schema/index.ts
// INDEPENDENTLY of the generator and fails on any difference in either
// direction, so "edited index.ts, never ran the generator" is red in the
// go-platform CI job too. ⛔ Do not delete it because the generator exists
// (GH#998 AC-3).
//
// Same technique, same reason, as internal/opsenv/keysync_test.go: the combat-env
// key lists drifted silently once already, and "remember to update the Go list"
// is not a mechanism.
func TestKnownCollectionsMatchTheSharedSchemaTable(t *testing.T) {
	testkit.Cover(t, "content-overlay-gate-collections-in-sync")
	path := filepath.Join(repoRoot(t), "packages", "shared", "src", "content", "schema", "index.ts")
	raw, err := os.ReadFile(path) // #nosec G304 -- repo source, the authority for this table
	require.NoError(t, err, "%s is the source of truth for the collection set and must be readable", path)
	src := string(raw)

	start := strings.Index(src, "export const COLLECTIONS = {")
	require.GreaterOrEqual(t, start, 0, "could not find `export const COLLECTIONS = {` in %s", path)
	end := strings.Index(src[start:], "\n} as const")
	require.Greater(t, end, 0, "could not find the end of the COLLECTIONS object in %s", path)
	block := src[start : start+end]

	// top-level keys only: two-space indent, optionally quoted ("status-effects")
	re := regexp.MustCompile(`(?m)^\s{2}"?([a-z][a-z0-9-]{0,31})"?:\s*\{`)
	var fromTS []string
	for _, m := range re.FindAllStringSubmatch(block, -1) {
		fromTS = append(fromTS, m[1])
	}
	// If the file's shape ever changes so the regex matches nothing, this test
	// must FAIL rather than quietly agree with an empty list.
	require.GreaterOrEqual(t, len(fromTS), 10,
		"parsed only %v out of %s — the file's shape changed, fix this parser", fromTS, path)

	sort.Strings(fromTS)
	fromGo := append([]string(nil), contentoverlay.KnownCollections...)
	sort.Strings(fromGo)
	assert.Equal(t, fromTS, fromGo,
		"KnownCollections (collections_gen.go) has drifted from COLLECTIONS in %s — "+
			"run `pnpm collections:build` and commit collections_gen.go (⛔ do not edit it by hand); "+
			"a collection Go does not know is a collection the console cannot save into", path)
}

// content-overlay-gate-base-bonus-bounds-in-sync: the second (and last) table
// Go copies from TypeScript. Parses BOTH source files — the Stat enum for the
// JSON key strings, and BASE_BONUS_MIN/MAX for the numbers — and fails on any
// difference. Renaming a stat, retuning a ceiling or adding a stat all land
// here.
func TestBaseBonusBoundsMatchTheSharedTable(t *testing.T) {
	testkit.Cover(t, "content-overlay-gate-base-bonus-bounds-in-sync")
	root := repoRoot(t)

	statsPath := filepath.Join(root, "packages", "shared", "src", "sim", "stats", "statTypes.ts")
	statsSrc := mustReadRepoFile(t, statsPath)
	enumBlock := sliceBetween(t, statsSrc, "export enum Stat {", "\n}", statsPath)
	enum := map[string]string{}
	for _, m := range regexp.MustCompile(`(?m)^\s{2}(\w+)\s*=\s*"([^"]+)",`).FindAllStringSubmatch(enumBlock, -1) {
		enum[m[1]] = m[2]
	}
	require.GreaterOrEqual(t, len(enum), 10, "parsed only %d Stat members from %s", len(enum), statsPath)

	bonusPath := filepath.Join(root, "packages", "shared", "src", "sim", "baseBonus.ts")
	bonusSrc := mustReadRepoFile(t, bonusPath)
	maxBlock := sliceBetween(t, bonusSrc, "export const BASE_BONUS_MAX", "});", bonusPath)
	fromTS := map[string]float64{}
	for _, m := range regexp.MustCompile(`\[Stat\.(\w+)\]:\s*([0-9.]+),`).FindAllStringSubmatch(maxBlock, -1) {
		key, ok := enum[m[1]]
		require.True(t, ok, "BASE_BONUS_MAX names Stat.%s which the enum does not have", m[1])
		v, err := strconv.ParseFloat(m[2], 64)
		require.NoError(t, err)
		fromTS[key] = v
	}
	require.GreaterOrEqual(t, len(fromTS), 10,
		"parsed only %d entries out of BASE_BONUS_MAX in %s — the file's shape changed, fix this parser",
		len(fromTS), bonusPath)

	assert.Equal(t, fromTS, contentoverlay.BaseBonusMax,
		"BaseBonusMax in validate.go has drifted from BASE_BONUS_MAX in %s", bonusPath)

	minM := regexp.MustCompile(`export const BASE_BONUS_MIN\s*=\s*([0-9.-]+);`).FindStringSubmatch(bonusSrc)
	require.Len(t, minM, 2, "could not find BASE_BONUS_MIN in %s", bonusPath)
	assert.Equal(t, minM[1], strconv.Itoa(contentoverlay.BaseBonusMin))
}

func mustReadRepoFile(t *testing.T, path string) string {
	t.Helper()
	raw, err := os.ReadFile(path) // #nosec G304 -- repo source, the authority for this table
	require.NoError(t, err, "%s is a source of truth for this gate and must be readable", path)
	return string(raw)
}

func sliceBetween(t *testing.T, src, from, to, path string) string {
	t.Helper()
	i := strings.Index(src, from)
	require.GreaterOrEqual(t, i, 0, "could not find %q in %s", from, path)
	j := strings.Index(src[i:], to)
	require.Greater(t, j, 0, "could not find %q after %q in %s", to, from, path)
	return src[i : i+j]
}

// ------------------------------------------------ 3. THE REJECTION GUARDS --

// content-overlay-gate-rejects-out-of-range-bonus (#277): 「後台基礎加成零驗證:
// 負值會讓全英雄一開場就死」. The console has blocked this since dc3c12ad — in
// the BROWSER. This is the same rule at the endpoint anyone with an admin JWT
// can reach, which is where the original report's `curl` lived.
func TestGateRejectsOutOfRangeBaseBonus(t *testing.T) {
	testkit.Cover(t, "content-overlay-gate-rejects-out-of-range-bonus")
	svc := newSvcOnRealContent(t)
	ctx := context.Background()

	// the exact payload from the #277 report
	_, err := svc.PutDoc(ctx, "config", "base-bonus",
		json.RawMessage(`{"id":"base-bonus","schema":"config.base-bonus@1","bonus":{"maxHealth":-9999}}`), "admin-1")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "bonus.maxHealth", "name the field")
	assert.Contains(t, err.Error(), "-9999")
	assert.Contains(t, err.Error(), "20000", "…and the range it broke")

	// over the ceiling is the same rule
	_, err = svc.PutDoc(ctx, "config", "base-bonus",
		json.RawMessage(`{"id":"base-bonus","schema":"config.base-bonus@1","bonus":{"as":9}}`), "admin-1")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "bonus.as")

	// …and the legal values on both edges still write. This half matters: the
	// bound is a bound, and 0 is a REAL value (「這一項沒有贈禮」), not a clear.
	for _, body := range []string{
		`{"id":"base-bonus","schema":"config.base-bonus@1","bonus":{"maxHealth":0}}`,
		`{"id":"base-bonus","schema":"config.base-bonus@1","bonus":{"maxHealth":20000,"as":3.8}}`,
		`{"id":"base-bonus","schema":"config.base-bonus@1","bonus":{"maxHealth":300}}`,
		// an unknown key rides along, exactly as zBaseBonusTable's .catchall allows
		`{"id":"base-bonus","schema":"config.base-bonus@1","bonus":{"typo":5}}`,
	} {
		_, err := svc.PutDoc(ctx, "config", "base-bonus", json.RawMessage(body), "admin-1")
		require.NoError(t, err, "must still accept %s", body)
	}
}

// content-overlay-gate-rejects-wrong-type: the #283 headline case. A string
// where the shipped doc has a number is refused, and the message NAMES THE PATH.
//
// Before the gate this write returned 200, and the next content load threw
// SchemaValidationError — which discards the WHOLE overlay layer, so base
// bonuses, stat caps and voxel bodies all silently reverted too, with nothing on
// screen to say why.
func TestGateRejectsWrongFieldTypeAndNamesThePath(t *testing.T) {
	testkit.Cover(t, "content-overlay-gate-rejects-wrong-type")
	svc := newSvcOnRealContent(t)
	ctx := context.Background()

	rules := shippedDocs(t, "config")["arena-rules"]
	require.NotEmpty(t, rules)
	var obj map[string]any
	require.NoError(t, json.Unmarshal(rules, &obj))
	waves, ok := obj["mobWaves"].(map[string]any)
	require.True(t, ok, "config/arena-rules must still carry mobWaves")
	boss, ok := waves["boss"].(map[string]any)
	require.True(t, ok, "config/arena-rules.mobWaves must still carry boss")
	require.IsType(t, float64(0), boss["heroHpMult"], "heroHpMult must still be a number in the repo")
	boss["heroHpMult"] = "abc"
	body, err := json.Marshal(obj)
	require.NoError(t, err)

	_, err = svc.PutDoc(ctx, "config", "arena-rules", body, "admin-1")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "mobWaves.boss.heroHpMult",
		"the operator has to be told WHICH field is wrong")
	assert.Contains(t, err.Error(), "數字")
	assert.Contains(t, err.Error(), "字串")

	// and nothing was written
	hd, err := svc.Head(ctx)
	require.NoError(t, err)
	assert.Equal(t, 0, hd.Generation)
}

// content-overlay-gate-rejects-unknown-collection: `champion` (no "s") used to
// be accepted and then killed the whole merged tree, because
// OverlayContentSource merges the unknown name into the manifest and loader.ts
// rejects the manifest. It is refused here, and the message lists the real ones.
func TestGateRejectsUnknownCollection(t *testing.T) {
	testkit.Cover(t, "content-overlay-gate-rejects-unknown-collection")
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	for _, bad := range []string{"champion", "experiments", "abilitys"} {
		_, err := svc.PutDoc(ctx, bad, "godie-e001",
			json.RawMessage(`{"id":"godie-e001","schema":"champion@1"}`), "admin-1")
		require.Error(t, err, "collection %q must be refused", bad)
		assert.Contains(t, err.Error(), bad)
		assert.Contains(t, err.Error(), "champions", "the message must list the collections that DO exist")
	}
	// the correctly-spelled one still works — this is the half that proves the
	// check is discriminating rather than just always failing
	_, err := svc.PutDoc(ctx, "champions", "godie-e001",
		json.RawMessage(`{"id":"godie-e001","schema":"champion@1"}`), "admin-1")
	require.NoError(t, err)
}

// content-overlay-gate-rejects-id-mismatch: a doc stored under one key that
// calls itself another. No schema can catch this — both halves are individually
// valid — and the merged tree indexes by KEY while every consumer reads FIELD.
func TestGateRejectsIdMismatch(t *testing.T) {
	testkit.Cover(t, "content-overlay-gate-rejects-id-mismatch")
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	_, err := svc.PutDoc(ctx, "champions", "godie-e001",
		json.RawMessage(`{"id":"someone-else","schema":"champion@1"}`), "admin-1")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "someone-else")
	assert.Contains(t, err.Error(), "godie-e001")

	// a missing id is the same class of problem, and says so
	_, err = svc.PutDoc(ctx, "champions", "godie-e001",
		json.RawMessage(`{"schema":"champion@1"}`), "admin-1")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "id")

	// a non-string id names the type it got
	_, err = svc.PutDoc(ctx, "champions", "godie-e001",
		json.RawMessage(`{"id":7,"schema":"champion@1"}`), "admin-1")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "id")
	assert.Contains(t, err.Error(), "數字")
}

// content-overlay-gate-rejects-shapeless: `{"hello":"world"}` — the shape a
// fat-fingered curl or a stale editor tab produces. Every collection schema is
// an envelope of {id, schema, …}, so a doc carrying neither is refused.
//
// ⚠️ Each case asserts the SPECIFIC message, not just "some error mentioning
// id". Mutation testing caught that: with the presence branch deleted, a missing
// `id` still errored (nil fails the string assert) and a test that only looked
// for the substring "id" stayed green — so it was not testing the branch it
// claimed to. "缺少" and "必須是字串" are different instructions to the operator
// and the test now tells them apart.
func TestGateRejectsStructurallyWrongObject(t *testing.T) {
	testkit.Cover(t, "content-overlay-gate-rejects-shapeless")
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	_, err := svc.PutDoc(ctx, "champions", "godie-e001",
		json.RawMessage(`{"hello":"world"}`), "admin-1")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "缺少「id」", "a missing id must say it is MISSING")

	// an empty object is the same
	_, err = svc.PutDoc(ctx, "champions", "godie-e001", json.RawMessage(`{}`), "admin-1")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "缺少「id」")

	// id present, schema absent → the message must name the OTHER envelope field
	_, err = svc.PutDoc(ctx, "champions", "godie-e001",
		json.RawMessage(`{"id":"godie-e001"}`), "admin-1")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "缺少「schema」", "a missing schema must say it is MISSING")

	// present-but-blank schema is a different failure with a different message —
	// `""` matches no union branch
	_, err = svc.PutDoc(ctx, "champions", "godie-e001",
		json.RawMessage(`{"id":"godie-e001","schema":""}`), "admin-1")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "schema")
	assert.Contains(t, err.Error(), "空字串")

	// a non-string schema names the type it got
	_, err = svc.PutDoc(ctx, "champions", "godie-e001",
		json.RawMessage(`{"id":"godie-e001","schema":{"v":1}}`), "admin-1")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "schema")
	assert.Contains(t, err.Error(), "物件")
}

// content-overlay-gate-rejects-schema-swap: saving the 戰鬥系統 multiplier table
// onto the 基礎加成 key. Both docs are individually valid `config` docs; what is
// wrong is that they are not the same KIND of doc, and the repo's copy says so.
func TestGateRejectsSchemaSwapAgainstShipped(t *testing.T) {
	testkit.Cover(t, "content-overlay-gate-rejects-schema-swap")
	svc := newSvcOnRealContent(t)
	ctx := context.Background()

	_, err := svc.PutDoc(ctx, "config", "base-bonus",
		json.RawMessage(`{"id":"base-bonus","schema":"config.combat-env@1","multipliers":{}}`), "admin-1")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "schema")
	assert.Contains(t, err.Error(), "config.base-bonus@1", "the message must say what the repo expects")
	assert.Contains(t, err.Error(), "config.combat-env@1", "…and what was sent")
}

// content-overlay-gate-rejects-infinity: `1e400` is legal JSON that JavaScript
// reads as Infinity. It used to land in overlay.json verbatim; one Infinity in a
// stat turns every derived number into NaN.
func TestGateRejectsNonFiniteNumbers(t *testing.T) {
	testkit.Cover(t, "content-overlay-gate-rejects-infinity")
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	_, err := svc.PutDoc(ctx, "config", "stat-caps",
		json.RawMessage(`{"id":"stat-caps","schema":"config.stat-caps@1","caps":{"attackSpeed":1e400}}`), "admin-1")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "caps.attackSpeed", "name the field, not just 'somewhere'")

	// negative overflow and array elements are the same rule
	_, err = svc.PutDoc(ctx, "config", "stat-caps",
		json.RawMessage(`{"id":"stat-caps","schema":"config.stat-caps@1","xs":[1,2,-1e999]}`), "admin-1")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "xs[2]")

	// a large-but-finite number is NOT this rule's business — bounds belong to
	// the schemas and to the console's per-field limits
	_, err = svc.PutDoc(ctx, "config", "stat-caps",
		json.RawMessage(`{"id":"stat-caps","schema":"config.stat-caps@1","caps":{"attackSpeed":1e300}}`), "admin-1")
	require.NoError(t, err)
}

// content-overlay-gate-rejects-oversize: the byte cap, exercised through the
// real PutDoc path (the handler's LimitReader is a second, earlier cap).
func TestGateRejectsOversizePayload(t *testing.T) {
	testkit.Cover(t, "content-overlay-gate-rejects-oversize")
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	huge := `{"id":"godie-e001","schema":"champion@1","junk":"` +
		strings.Repeat("x", contentoverlay.MaxDocBytes) + `"}`
	_, err := svc.PutDoc(ctx, "champions", "godie-e001", json.RawMessage(huge), "admin-1")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "too large")

	// just under the cap still writes — the cap is a cap, not a wall
	ok := `{"id":"godie-e001","schema":"champion@1","junk":"` +
		strings.Repeat("x", contentoverlay.MaxDocBytes-4096) + `"}`
	_, err = svc.PutDoc(ctx, "champions", "godie-e001", json.RawMessage(ok), "admin-1")
	require.NoError(t, err)
}

// content-overlay-gate-rejects-deep: a doc nested past the limit. The consumers
// are recursive TypeScript (hashDoc's stringify, the merge's clone), so depth is
// a browser stack overflow, not a Go problem.
func TestGateRejectsExcessiveNesting(t *testing.T) {
	testkit.Cover(t, "content-overlay-gate-rejects-deep")
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	deep := `{"id":"godie-e001","schema":"champion@1","n":` +
		strings.Repeat(`{"n":`, 200) + `1` + strings.Repeat(`}`, 200) + `}`
	_, err := svc.PutDoc(ctx, "champions", "godie-e001", json.RawMessage(deep), "admin-1")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "巢狀")

	// the deepest real doc in content/ is 11 levels — normal nesting is fine
	shallow := `{"id":"godie-e001","schema":"champion@1","n":` +
		strings.Repeat(`{"n":`, 11) + `1` + strings.Repeat(`}`, 11) + `}`
	_, err = svc.PutDoc(ctx, "champions", "godie-e001", json.RawMessage(shallow), "admin-1")
	require.NoError(t, err)
}

// ------------------------------------------------------ 4. THE ESCAPE HATCH --

// content-overlay-gate-has-an-exit: an overlay written BEFORE this gate existed
// (or imported from an old host by the #243 ZIP) may hold a doc the gate would
// now refuse. Removing it must always be possible, or the gate is a trap: the
// operator would be left with a doc that breaks every content load and no way to
// take it out.
func TestDeleteAndRevertStayOpenOnDocsTheGateWouldRefuse(t *testing.T) {
	testkit.Cover(t, "content-overlay-gate-has-an-exit")
	dir := t.TempDir()
	store, err := jsonstore.New(dir)
	require.NoError(t, err)
	ctx := context.Background()

	// seed the durable file the way a pre-gate build (or a restored ZIP) would:
	// straight into the store, bypassing PutDoc entirely
	require.NoError(t, store.Put(contentoverlay.Collection, contentoverlay.DocID, map[string]any{
		"schemaVersion": contentoverlay.SchemaVersion,
		"generation":    3,
		"docs": map[string]json.RawMessage{
			"experiments/thing": json.RawMessage(`{"nope":true}`),
			"champions/legacy":  json.RawMessage(`{"id":"other","schema":"champion@1"}`),
		},
		"deleted": map[string]bool{},
	}))
	svc := contentoverlay.New(store, nil)

	// the gate refuses to WRITE either of them again…
	_, err = svc.PutDoc(ctx, "experiments", "thing", json.RawMessage(`{"nope":true}`), "admin-1")
	require.Error(t, err)

	// …but REVERT clears the unknown-collection entry
	_, err = svc.RevertDoc(ctx, "experiments", "thing", "admin-1")
	require.NoError(t, err, "an operator must always be able to remove a bad entry")
	// …and DELETE tombstones the mismatched one
	_, err = svc.DeleteDoc(ctx, "champions", "legacy", "admin-1")
	require.NoError(t, err)

	o, err := svc.Get(ctx)
	require.NoError(t, err)
	_, stillThere := o.Docs["experiments/thing"]
	assert.False(t, stillThere)
	_, stillADoc := o.Docs["champions/legacy"]
	assert.False(t, stillADoc)
}

// ------------------------------------------- 5. DEGRADE, NEVER FALSE-REJECT --

// content-overlay-gate-degrades-without-content: on a host with no readable
// CONTENT_DIR the per-field comparison is UNANSWERABLE. It must fall back to the
// envelope rules, not to refusing everything — the overlay is the only durable
// write path those hosts have.
func TestGateDegradesWhenTheContentTreeIsUnreadable(t *testing.T) {
	testkit.Cover(t, "content-overlay-gate-degrades-without-content")
	svc, _, _ := newSvc(t) // built with NewShippedTree("") — no content tree at all
	ctx := context.Background()

	// a doc whose types disagree with the repo cannot be judged here, so it goes
	// through: "I cannot tell" must not become "no"
	_, err := svc.PutDoc(ctx, "config", "arena-rules",
		json.RawMessage(`{"id":"arena-rules","schema":"config.arena-rules@1","mobWaves":{"boss":{"heroHpMult":"abc"}}}`),
		"admin-1")
	require.NoError(t, err)

	// the envelope rules still apply, though — they need no content tree
	_, err = svc.PutDoc(ctx, "config", "arena-rules",
		json.RawMessage(`{"id":"wrong-id","schema":"config.arena-rules@1"}`), "admin-1")
	require.Error(t, err)
}

// content-overlay-gate-array-kinds: homogeneous primitive arrays are judged
// element-wise; heterogeneous ones (effect unions) are deliberately not, because
// index-by-index comparison would refuse a legitimate reorder.
func TestGateJudgesHomogeneousArraysOnly(t *testing.T) {
	testkit.Cover(t, "content-overlay-gate-array-kinds")
	base := []byte(`{"id":"x","schema":"config.demo@1","nums":[1,2,3],"mixed":[{"k":1},"s"]}`)

	// a string in a number[] is refused, by index
	err := contentoverlay.ValidateDoc("config", "x",
		[]byte(`{"id":"x","schema":"config.demo@1","nums":[1,"two",3]}`), base)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "nums[1]")

	// a heterogeneous array is left alone entirely
	require.NoError(t, contentoverlay.ValidateDoc("config", "x",
		[]byte(`{"id":"x","schema":"config.demo@1","mixed":[7,{"k":2}]}`), base))

	// but the array/object kind itself is still checked
	err = contentoverlay.ValidateDoc("config", "x",
		[]byte(`{"id":"x","schema":"config.demo@1","nums":"1,2,3"}`), base)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "nums")
}
