package contentoverlay

// validate.go — THE SERVER-SIDE CONTENT GATE (task #283).
//
// ── WHAT #283 FOUND ──────────────────────────────────────────────────────────
// The package header used to claim the overlay was validated elsewhere. Half of
// that was true (the admin console gained a Zod gate in dc3c12ad), and the half
// that mattered was not: the gate lived in the BROWSER. The attack/accident
// surface is the HTTP endpoint, and `PUT /api/v1/content-overlay/docs/{c}/{id}`
// with an admin JWT accepted literally anything shaped like `{...}`:
//
//	champions/godie-e001  {"hello":"world"}                       accepted
//	champion/godie-e001   {"id":"godie-e001"}                     accepted (missing "s")
//	config/arena-rules    {"mobWaves":{"boss":{"heroHpMult":"abc"}}}  accepted
//	config/stat-caps      {"caps":{"attackSpeed":1e400}}          accepted, and 1e400
//	                                                              landed in the file
//
// ── WHY THAT IS WORSE THAN IT LOOKS: LOADING IS ALL-OR-NOTHING ───────────────
// packages/shared/src/content/loader.ts collects every error and then throws ONE
// ContentLoadError. Both consumers (apps/game-server/src/index.ts,
// apps/client/src/content/bootContent.ts) catch it and retry with the SHIPPED
// TREE AND NO OVERLAY. So a single bad doc does not fail-safe that doc — it
// discards THE WHOLE OVERLAY LAYER. Base bonuses, stat caps, voxel bodies, mob
// waves, every tuned value, all silently back to the repo's numbers, while the
// console cheerfully reports "已寫入 (generation N)". Nothing on screen says so.
//
// ── THE DESIGN CALL: STRUCTURAL GATE, NOT A PORTED SCHEMA ────────────────────
// The schemas are ~10k lines of Zod (discriminated unions, refinements, cross
// doc refs) and they are the TypeScript's to own. Transcribing them into Go
// structs is the option that LOOKS thorough and rots: the dangerous direction of
// drift is OVER-rejection, where the gate starts refusing docs the loader would
// have accepted and the console becomes unusable for content that is fine. A
// gate that can break saving is a worse bug than the one it fixes.
//
// So this file enforces a deliberate SUBSET, and states the contract:
//
//	⇒ EVERYTHING THIS GATE REJECTS, THE TYPESCRIPT LOADER ALSO REJECTS.
//	  (Two knowing exceptions, both listed below and both proven not to fire on
//	  any of the 1808 docs in content/ — see TestEveryShippedDocPassesTheGate.)
//
// Go is therefore the "can this possibly be content?" layer, never the schema
// authority. The console's Zod gate stays where it is and stays first.
//
// ── THE ONE THING GO COPIES FROM TS, AND HOW IT IS KEPT HONEST ───────────────
// KnownCollections mirrors COLLECTIONS in packages/shared/src/content/schema/
// index.ts. Thirteen strings. It is copied rather than derived because Go cannot
// run Zod, and it MUST be copied because the `champion` vs `champions` typo is
// exactly the write that kills the whole layer (OverlayContentSource merges the
// unknown collection into the manifest, and loader.ts rejects the manifest).
//
// Drift is caught mechanically, not by discipline:
// TestKnownCollectionsMatchTheSharedSchemaTable reads index.ts and fails the
// moment TypeScript adds, renames or removes a collection. Same trick, same
// reason, as internal/opsenv's keysync_test.go.
//
// ── WHERE THE PER-FIELD TYPE CHECK COMES FROM (no transcription at all) ──────
// The interesting rule needs no schema table: an overlay doc is a REPLACEMENT
// for a shipped doc, so the shipped doc IS the contract. For every path present
// in both, the JSON kind must match. `content/` is validated against the Zod
// schemas by `pnpm content:build`, so this comparison inherits the real schema
// for free and cannot drift — there is nothing to transcribe.
//
//	shipped config/arena-rules . mobWaves.boss.heroHpMult = 3      (number)
//	incoming                   . mobWaves.boss.heroHpMult = "abc"  (string) → 400
//
// Deliberately NOT checked: paths the shipped doc does not have (an operator
// adding a field is legitimate), array element structure beyond homogeneous
// primitive arrays (effect arrays are heterogeneous unions and index-by-index
// comparison would false-reject a reorder), and every value RANGE (that is the
// schemas' job, and the console's per-field bounds).
//
// ── THE TWO KNOWING SUPERSETS ────────────────────────────────────────────────
//  1. Non-finite numbers. `1e400` is valid JSON; JSON.parse turns it into
//     Infinity and z.number() accepts Infinity. It has no legitimate use in
//     content and it poisons the sim into NaN. Rejected, with the field named.
//  2. `schema` must keep the shipped doc's value when a shipped doc exists.
//     Changing the tag re-points the doc at a different union branch; in
//     practice it means an operator saved the wrong table onto this key.
//
// ── WHAT IS DELIBERATELY NOT GATED ───────────────────────────────────────────
// DeleteDoc and RevertDoc take no document and stay open on ANY collection that
// matches the key regex. An overlay written before this gate existed may hold a
// doc the gate would now refuse, and the operator must always be able to remove
// it. A gate you cannot back out of is a trap.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"sort"
	"strconv"
	"strings"

	"github.com/ggd/platform/internal/httpx"
)

// maxDocDepth bounds nesting. The deepest doc in content/ today is 11 levels
// (content/champions/godie-hpb1.json), so this is ~3x headroom. The point is not
// to stop Go — encoding/json survives 10,000 levels — it is that the CONSUMERS
// are recursive TypeScript (safe-stable-stringify in hashDoc, structuredClone in
// the merge), and a 10,000-deep doc is a stack overflow in the browser.
const maxDocDepth = 32

// KnownCollections is the closed set of collections an overlay doc may target.
//
// MIRROR OF packages/shared/src/content/schema/index.ts (COLLECTIONS).
// Sorted so the rejection message is stable. If you change this list, the change
// belongs in index.ts FIRST — TestKnownCollectionsMatchTheSharedSchemaTable
// compares the two and fails on any difference in either direction.
var KnownCollections = []string{
	"abilities",
	"ability-templates",
	"arenas",
	"augments",
	"champions",
	"config",
	"items",
	"loot-tables",
	// GH#328 —— **漏了 13 天**。`maps` 在 2026-08-03 隨 GH#324 進了 shared 的
	// COLLECTIONS，這份鏡像沒跟上，於是後台**存不進任何地圖文件**（overlay 直接
	// 拒絕一個合法的 collection）。⚠️ 這正是「兩份清單各自維護」的標準壞法：
	// 兩邊分開看都是對的，只有**比對**看得出來 ——
	// 而 `TestKnownCollectionsMatchTheSharedSchemaTable` 就是那個比對。
	"maps",
	"models",
	"projectiles",
	"skins",
	"status-effects",
	"vfx",
}

var knownCollectionSet = func() map[string]bool {
	m := make(map[string]bool, len(KnownCollections))
	for _, c := range KnownCollections {
		m[c] = true
	}
	return m
}()

// IsKnownCollection reports whether a collection has a schema on the TypeScript
// side, i.e. whether the merged content tree can survive a doc written into it.
func IsKnownCollection(collection string) bool { return knownCollectionSet[collection] }

// ValidateDoc is the whole gate, as a pure function so it can be run over the
// entire shipped corpus in a test without touching a store.
//
// `doc` is the compacted body being written. `shipped` is the repo's bytes for
// the same collection/id, or nil when the shipped tree has no such doc or could
// not be read — nil DOWNGRADES the check, it never rejects. A host with no
// CONTENT_DIR still gets the envelope rules; it just cannot do the per-field
// comparison, and saying "I cannot tell" is the only honest answer there.
func ValidateDoc(collection, id string, doc []byte, shipped []byte) error {
	if !knownCollectionSet[collection] {
		return httpx.BadRequest(fmt.Sprintf(
			"未知的 collection「%s」—— 內容樹沒有這個名字，寫進去會讓整層 overlay 被丟掉。可用的是：%s",
			truncate(collection, 40), strings.Join(KnownCollections, ", ")))
	}

	body, err := decodeJSONAny(doc)
	if err != nil {
		return httpx.BadRequest("內容不是合法的 JSON：" + truncate(err.Error(), 80))
	}
	obj, ok := body.(map[string]any)
	if !ok {
		return httpx.BadRequest("內容必須是一個 JSON 物件 {...}，收到的是" + kindOf(body))
	}
	if d := depthOf(obj); d > maxDocDepth {
		return httpx.BadRequest(fmt.Sprintf(
			"巢狀太深（%d 層，上限 %d 層）—— 讀取端是遞迴的 TypeScript，會爆堆疊", d, maxDocDepth))
	}

	if err := checkEnvelopeID(obj, id); err != nil {
		return err
	}
	gotSchema, err := checkEnvelopeSchema(obj)
	if err != nil {
		return err
	}
	if err := checkFiniteNumbers(obj, ""); err != nil {
		return err
	}
	if err := checkBoundedFields(collection, id, obj); err != nil {
		return err
	}

	if len(shipped) == 0 {
		return nil
	}
	base, err := decodeJSONAny(shipped)
	if err != nil {
		// The REPO's copy is unreadable. That is not this operator's fault and
		// must not block their edit; precedence.go/status already surfaces a
		// broken content tree.
		slog.Warn("contentoverlay: shipped doc is unreadable — writing without the per-field check",
			"collection", collection, "id", id, "err", err)
		return nil
	}
	baseObj, ok := base.(map[string]any)
	if !ok {
		return nil
	}
	if baseSchema, ok := baseObj["schema"].(string); ok && baseSchema != gotSchema {
		return httpx.BadRequest(fmt.Sprintf(
			"schema 欄位是「%s」，但 content/%s/%s.json 的是「%s」—— 換了 schema 等於換了一份文件，"+
				"多半是把別頁的表格存到這個 id 上了",
			truncate(gotSchema, 48), collection, id, truncate(baseSchema, 48)))
	}
	return conformObject(obj, baseObj, "")
}

// ---------------------------------------------------------------- envelope --

// checkEnvelopeID enforces `doc.id == the key it is being written under`.
//
// This is the mismatch no schema can catch, because both halves are individually
// valid: the merged tree INDEXES BY THE KEY while every consumer reads the
// FIELD, so a doc stored at champions/godie-e001 that calls itself
// "someone-else" is a champion that exists twice under two names and resolves
// through neither. All 1808 docs in content/ satisfy id == filename stem.
func checkEnvelopeID(obj map[string]any, id string) error {
	raw, present := obj["id"]
	if !present {
		return httpx.BadRequest("缺少「id」欄位 —— 每一份內容文件都要有 id，而且要等於寫入的 key")
	}
	got, ok := raw.(string)
	if !ok {
		return httpx.BadRequest("欄位「id」必須是字串，收到的是" + kindOf(raw))
	}
	if got != id {
		return httpx.BadRequest(fmt.Sprintf(
			"文件的 id 是「%s」，但要寫到「%s」—— 兩者必須一致",
			truncate(got, 64), truncate(id, 64)))
	}
	return nil
}

// checkEnvelopeSchema requires a non-empty `schema` tag. Every collection schema
// in packages/shared pins it with `z.literal("<tag>@1")` (vfx is a two-branch
// union, config a 16-branch discriminated union ON THIS FIELD), so a doc without
// it cannot parse anywhere. The VALUE is not judged here — only its presence and
// type — because the accepted tag set is per-collection TypeScript knowledge and
// copying it is exactly the drift this gate refuses to take on.
func checkEnvelopeSchema(obj map[string]any) (string, error) {
	raw, present := obj["schema"]
	if !present {
		return "", httpx.BadRequest(
			"缺少「schema」欄位 —— 每一份內容文件都要標明自己的 schema（例如 champion@1 / config.base-bonus@1）")
	}
	got, ok := raw.(string)
	if !ok {
		return "", httpx.BadRequest("欄位「schema」必須是字串，收到的是" + kindOf(raw))
	}
	if got == "" {
		return "", httpx.BadRequest("欄位「schema」不能是空字串")
	}
	return got, nil
}

// ----------------------------------------------------------------- numbers --

// checkFiniteNumbers rejects a JSON number that is not a finite float64.
//
// `1e400` is legal JSON and Go keeps it verbatim in a json.RawMessage, so it
// used to land in overlay.json unchanged; JSON.parse then hands the sim
// Infinity, and one Infinity turns every derived stat into NaN. Named field,
// because "somewhere in your 400-line doc" is not an error message.
func checkFiniteNumbers(v any, path string) error {
	switch t := v.(type) {
	case map[string]any:
		for _, k := range sortedMapKeys(t) {
			if err := checkFiniteNumbers(t[k], joinPath(path, k)); err != nil {
				return err
			}
		}
	case []any:
		for i, el := range t {
			if err := checkFiniteNumbers(el, fmt.Sprintf("%s[%d]", pathOrRoot(path), i)); err != nil {
				return err
			}
		}
	case json.Number:
		f, err := strconv.ParseFloat(t.String(), 64)
		if err != nil || math.IsInf(f, 0) || math.IsNaN(f) {
			return httpx.BadRequest(fmt.Sprintf(
				"欄位「%s」的數值 %s 不是有限的浮點數 —— 讀進 JavaScript 會變成 Infinity，"+
					"之後每一個衍生數值都會是 NaN",
				pathOrRoot(path), truncate(t.String(), 24)))
		}
	}
	return nil
}

// --------------------------------------------------------- bounded fields --

// BaseBonusMin / BaseBonusMax mirror BASE_BONUS_MIN / BASE_BONUS_MAX in
// packages/shared/src/sim/baseBonus.ts, keyed by the `Stat` enum's STRING values
// from packages/shared/src/sim/stats/statTypes.ts.
//
// ── WHY THIS ONE TABLE IS COPIED WHEN THE SCHEMAS ARE NOT (task #277) ────────
// The package's rule is "do not transcribe TypeScript into Go". The line is not
// "never copy" — it is: copy only a table that is (a) small, (b) a single flat
// literal in one TS file, and (c) mechanically comparable by a cross-language
// test. `COLLECTIONS` qualifies. This does. `zChampionDoc` does not, and never
// will. TestBaseBonusBoundsMatchTheSharedTable parses BOTH TS files and fails on
// any difference, so this cannot drift silently.
//
// ── WHY IT IS WORTH COPYING AT ALL ──────────────────────────────────────────
// `config/base-bonus` is the one doc where a single bad number is GLOBALLY
// catastrophic and where the damage arrives twice over. #277: `maxHealth:-9999`
// gives all 115 champions negative starting HP. Then the deeper one: the Zod
// schema derives its own .min/.max from these same bounds, so the doc does not
// merely get clamped on read — the CONTENT LOAD FAILS, and a failed load drops
// the WHOLE overlay layer (see the header). One out-of-range number in one
// field silently reverts every tuned value on the host.
//
// The console has enforced these bounds since dc3c12ad and the sim clamps on
// read; this is the layer in between, the one anything holding an admin JWT can
// reach directly.
const BaseBonusMin = 0

var BaseBonusMax = map[string]float64{
	// ⚠️ 2026-08-18：這六格是 v0.20.x 的「加成型屬性」家族（G17 冷卻流逝速度 +
	// 20 件 [EX解放] 寶具用到的輸出/治療/護盾/單發上限/不可迴避）。它們在
	// `BASE_BONUS_MAX` 裡待了一整批而 Go 這一份沒跟上 ——
	// `TestBaseBonusBoundsMatchTheSharedTable` 一直是紅的，也就是說這六格在
	// **後台寫入路徑上完全沒有上界**（#277 那一族：一個負數或離譜數字直接落地，
	// 而 Zod 從這些界推導 .min/.max ⇒ 內容載入整份失敗、覆蓋層全部回退）。
	"cooldownDrainRate": 5,
	"maxHitPctMaxHp":    5,
	"outputDamagePct":   5,
	"outputHealingPct":  5,
	"outputShieldPct":   5,
	"unavoidablePct":    5,
	"maxHealth":         20000,
	"maxMana":           20000,
	"healthRegen":       200,
	"manaRegen":         200,
	"ad":                2000,
	"ap":                2000,
	"armor":             500,
	"mr":                500,
	"critDamage":        10,
	"range":             50,
	"as":                3.8,
	"ms":                12,
	"critChance":        1,
	"cdr":               0.99, // 2026-08-10 owner：「天花板可以是 0.99」，另配秒數地板 0.1
	"lifesteal":         2, // ⚠️ 與 content/config/stat-caps.json 的 base 同值(owner 調過)；drift 測試在守
	"evasion":           0.8,
	"spellVamp":         0.8, // 2026-08-10 新增的技能吸血，區間與 lifesteal 同
}

// checkBoundedFields applies the per-field numeric bounds Go knows about.
//
// Deliberately keyed on collection+id rather than on a schema tag: the tag lives
// inside the doc and a caller controls it, while the KEY is the thing the write
// is addressed to. Unknown stat keys are ignored on purpose — zBaseBonusTable's
// `.catchall(z.number().finite())` accepts them and normalizeBaseBonus drops
// them, and a typo'd key must not take the content tree down.
func checkBoundedFields(collection, id string, obj map[string]any) error {
	if collection != "config" || id != "base-bonus" {
		return nil
	}
	bonus, ok := obj["bonus"].(map[string]any)
	if !ok {
		// wrong-typed `bonus` is the shipped-conformance check's business, and
		// the Zod schema's; not this one's.
		return nil
	}
	for _, stat := range sortedMapKeys(bonus) {
		max, known := BaseBonusMax[stat]
		if !known {
			continue
		}
		num, ok := bonus[stat].(json.Number)
		if !ok {
			continue // type errors are reported by the conformance walk
		}
		v, err := num.Float64()
		if err != nil {
			continue // already reported by checkFiniteNumbers
		}
		if v < BaseBonusMin || v > max {
			return httpx.BadRequest(fmt.Sprintf(
				"欄位「bonus.%s」的 %s 超出允許範圍 %g ~ %g —— 超範圍的基礎加成會讓"+
					"整層 overlay 載入失敗，全部後台設定一起失效（不是只有這一格）",
				stat, num.String(), float64(BaseBonusMin), max))
		}
	}
	return nil
}

// ------------------------------------------------- conformance to shipped --

// conformObject compares the incoming doc against the repo's doc, path by path.
// Only keys present in BOTH are judged: a key the shipped doc does not have is
// an operator adding a field, which is legitimate and unjudgeable here.
func conformObject(got, base map[string]any, path string) error {
	for _, k := range sortedMapKeys(base) {
		gv, present := got[k]
		if !present {
			continue
		}
		if err := conformValue(gv, base[k], joinPath(path, k)); err != nil {
			return err
		}
	}
	return nil
}

func conformValue(got, base any, path string) error {
	// A JSON null on either side is unjudgeable: `.nullable()` fields are real,
	// and "the repo happens to have null here" says nothing about the type.
	if got == nil || base == nil {
		return nil
	}
	gk, bk := kindOf(got), kindOf(base)
	if gk != bk {
		return httpx.BadRequest(fmt.Sprintf(
			"欄位「%s」型別不對：出貨的內容是%s，這次寫入是%s", path, bk, gk))
	}
	switch g := got.(type) {
	case map[string]any:
		b, ok := base.(map[string]any)
		if !ok {
			return nil
		}
		return conformObject(g, b, path)
	case []any:
		b, ok := base.([]any)
		if !ok {
			return nil
		}
		// Only HOMOGENEOUS PRIMITIVE arrays are judged. `effects: [...]` is a
		// heterogeneous discriminated union and comparing index-by-index would
		// reject a legitimate reorder or insertion; `number[]` never becomes
		// `string[]`, so that one is safe and worth catching.
		want, ok := homogeneousPrimitiveKind(b)
		if !ok {
			return nil
		}
		for i, el := range g {
			if el == nil {
				continue
			}
			if k := kindOf(el); k != want {
				return httpx.BadRequest(fmt.Sprintf(
					"欄位「%s[%d]」型別不對：出貨的內容整個陣列都是%s，這次寫入是%s", path, i, want, k))
			}
		}
	}
	return nil
}

// homogeneousPrimitiveKind returns the single primitive kind every element of
// `arr` has, or ok=false when the array is empty, mixed, or holds
// objects/arrays.
func homogeneousPrimitiveKind(arr []any) (string, bool) {
	if len(arr) == 0 {
		return "", false
	}
	want := ""
	for _, el := range arr {
		switch el.(type) {
		case json.Number, string, bool:
		default:
			return "", false
		}
		k := kindOf(el)
		if want == "" {
			want = k
		} else if want != k {
			return "", false
		}
	}
	return want, true
}

// ----------------------------------------------------------------- helpers --

// decodeJSONAny parses into `any` with UseNumber, so a number keeps its exact
// source text (1e400 stays "1e400" instead of silently becoming +Inf) and can be
// range-checked deliberately.
func decodeJSONAny(b []byte) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(b))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		return nil, err
	}
	return v, nil
}

// kindOf names a JSON value's type in the operator's language.
func kindOf(v any) string {
	switch v.(type) {
	case nil:
		return "null"
	case bool:
		return "布林值"
	case json.Number, float64:
		return "數字"
	case string:
		return "字串"
	case []any:
		return "陣列"
	case map[string]any:
		return "物件"
	}
	return "未知型別"
}

func depthOf(v any) int {
	switch t := v.(type) {
	case map[string]any:
		deepest := 0
		for _, el := range t {
			if d := depthOf(el); d > deepest {
				deepest = d
			}
		}
		return deepest + 1
	case []any:
		deepest := 0
		for _, el := range t {
			if d := depthOf(el); d > deepest {
				deepest = d
			}
		}
		return deepest + 1
	}
	return 0
}

// sortedMapKeys keeps every walk deterministic. Go randomises map iteration, and
// a doc with two problems must not report a different field on every attempt —
// an operator fixing what the message named would otherwise be chasing a
// moving target.
func sortedMapKeys(m map[string]any) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func joinPath(path, key string) string {
	if path == "" {
		return key
	}
	return path + "." + key
}

func pathOrRoot(path string) string {
	if path == "" {
		return "(根)"
	}
	return path
}
