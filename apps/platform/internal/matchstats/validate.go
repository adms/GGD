package matchstats

// validate.go — THE MATCH-LEDGER WRITE GATE (task #207).
//
// ── WHAT IT IS MODELLED ON, AND WHY ─────────────────────────────────────────
// internal/contentoverlay/validate.go argued the case already and the same
// argument applies here unchanged:
//
//	⇒ a STRUCTURAL gate, never a transcription of the TypeScript types.
//
// The ledger's seven arrays are defined in
// packages/shared/src/sim/stats/matchLedger.ts and they are still being
// extended by four downstream lanes. A Go mirror of `AbilityCastRecord` would
// look thorough and would rot in the ONE direction that hurts: OVER-rejection,
// where the platform starts 400-ing ledgers the game-server legitimately sends
// because a field was added last week. Data the operator can never get back is
// a worse bug than data that is loosely typed on disk.
//
// So this file answers exactly two questions:
//
//	1. ALLOWLIST — is every top-level key of the ledger a section this build
//	   knows? An unknown section is refused by NAME, so `cast` (missing the s)
//	   fails loudly instead of being stored and silently read as zero casts by
//	   every consumer. This is the direct analogue of contentoverlay's
//	   `champion` vs `champions` case, which is the write that kills a layer.
//
//	2. ID COMPARISON — does `ledger.matchId` equal the id the record is being
//	   stored under? Both halves are individually valid, which is precisely why
//	   no schema catches it: a ledger filed under match A that calls itself
//	   match B produces a review screen that attributes one match's casts to
//	   another, and nothing anywhere looks wrong.
//
// Plus the two envelope rules contentoverlay found worth having: non-finite
// numbers (legal JSON, `Infinity` in JavaScript, NaN in every derived stat) and
// a depth bound (the consumers are recursive TypeScript).
//
// ── THE PER-ELEMENT CHECK IS A FLOOR, NOT A SCHEMA ──────────────────────────
// Each section is an array of objects, and every consumer INDEXES those objects
// by one or two keys — `casts` by seatId+abilityId, `rounds` by round+seatId,
// `offers` by seatId+kind. An element missing its index keys is not "partly
// useful data", it is a row that cannot be attributed to anybody. Those keys,
// and only those, are required. Everything else about an element is passed
// through untouched, so adding a field on the TypeScript side needs no change
// here.
//
// ── AND A REFUSED ELEMENT COSTS ONLY ITSELF ─────────────────────────────────
// Sanitize DROPS the offending element and keeps going. A match is 12 seats ×
// ~8 rounds of casts; refusing the submission over one of them would discard
// the other three thousand. Every drop is reported back and stored in the
// record's `dropped` list, so the loss is on the screen instead of hiding in a
// number that is quietly 1 too small.

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"

	"github.com/ggd/platform/internal/httpx"
)

// maxLedgerDepth bounds nesting. The deepest real shape is
// lineups[].sides[].championIds[] — 5 levels — so 24 is generous headroom while
// still refusing the pathological input that overflows a recursive reader.
const maxLedgerDepth = 24

// maxNamedDrops bounds how many refusals are spelled out in one message. A
// game-server sending garbage should produce a readable sentence, not a wall.
const maxNamedDrops = 8

// Sections is the CLOSED set of top-level keys a ledger may carry.
//
// MIRROR OF MatchLedgerSnapshot in packages/shared/src/sim/stats/matchLedger.ts.
// Sorted, so the refusal message is stable. It is copied rather than derived
// because Go cannot read TypeScript, and it MUST be copied because a mistyped
// section name is otherwise stored and read as "this match had none of those".
// TestSectionsMatchTheSharedSnapshot parses matchLedger.ts and fails on any
// difference in either direction — the same mechanism contentoverlay uses for
// KnownCollections and opsenv uses for its key table.
var Sections = []string{
	"casts",
	"itemTxns",
	"lineups",
	"offers",
	"picks",
	"rounds",
	"teams",
	"uncast",
}

// requiredKeys is, per section, the keys every consumer indexes that section by.
// An element without them cannot be attributed to a seat / round / ability, so
// it is not partial data — it is a row with no subject.
//
// `kind` values: "number", "string", "array". Nothing else is judged.
var requiredKeys = map[string][]requiredKey{
	"picks":    {{"seatId", "number"}, {"championId", "string"}},
	"lineups":  {{"round", "number"}, {"zone", "number"}, {"sides", "array"}},
	"casts":    {{"castId", "number"}, {"seatId", "number"}, {"abilityId", "string"}},
	"itemTxns": {{"seatId", "number"}, {"itemId", "string"}},
	"offers":   {{"seatId", "number"}, {"round", "number"}, {"kind", "string"}},
	"rounds":   {{"round", "number"}, {"seatId", "number"}},
	"teams":    {{"teamId", "number"}, {"seatIds", "array"}},
	// ⭐ GH#1015（2026-09-06）：普攻／hook／mark 那些「沒有 cast」的傷害，每（座位, 回合, 家族）累加一列。
	"uncast": {{"seatId", "number"}, {"round", "number"}, {"family", "string"}},
}

type requiredKey struct {
	name string
	kind string
}

var sectionSet = func() map[string]bool {
	m := make(map[string]bool, len(Sections))
	for _, s := range Sections {
		m[s] = true
	}
	return m
}()

// IsKnownSection reports whether a top-level ledger key is one this build
// knows how to store and read back.
func IsKnownSection(name string) bool { return sectionSet[name] }

// Sanitize is the whole gate.
//
// It returns the ledger to store and the elements it refused. An error is
// returned ONLY for an envelope failure — a body that is not an object, an
// unknown section, a matchId that disagrees with the key, a non-finite number
// or a doc too deep to read back. Those are unfixable by dropping rows.
//
// ⚠️ THE BYTES ARE RETURNED UNCHANGED WHEN NOTHING IS DROPPED. A clean ledger
// — the overwhelmingly common case — is stored exactly as it arrived, so a
// re-export and re-import of an untouched record is byte-stable and the
// migration contract stays "this is a faithful copy" rather than "this is what
// our re-serializer made of it". TestCleanLedgerIsStoredByteIdentically pins it.
func Sanitize(matchID string, raw []byte) (clean []byte, dropped []Dropped, err error) {
	if len(raw) > MaxRecordBytes {
		return nil, nil, httpx.BadRequest(fmt.Sprintf(
			"戰績帳本 %d bytes 超過上限 %d bytes —— 超過上限的紀錄寫得進去卻匯不出去（#243 的每份文件上限），"+
				"換機時會被留在舊主機上", len(raw), MaxRecordBytes))
	}
	body, derr := decodeJSONAny(raw)
	if derr != nil {
		return nil, nil, httpx.BadRequest("戰績帳本不是合法的 JSON：" + truncate(derr.Error(), 80))
	}
	obj, ok := body.(map[string]any)
	if !ok {
		return nil, nil, httpx.BadRequest("戰績帳本必須是一個 JSON 物件 {...}，收到的是" + kindOf(body))
	}
	if d := depthOf(obj); d > maxLedgerDepth {
		return nil, nil, httpx.BadRequest(fmt.Sprintf(
			"巢狀太深（%d 層，上限 %d 層）—— 讀取端是遞迴的 TypeScript，會爆堆疊", d, maxLedgerDepth))
	}
	if err := checkEnvelopeMatchID(obj, matchID); err != nil {
		return nil, nil, err
	}
	if err := checkKnownSections(obj); err != nil {
		return nil, nil, err
	}
	if err := checkFiniteNumbers(obj, ""); err != nil {
		return nil, nil, err
	}

	dropped = refusedElements(obj)
	if len(dropped) == 0 {
		return raw, nil, nil
	}
	out, merr := json.Marshal(pruned(obj, dropped))
	if merr != nil {
		// Re-serialising what we just decoded cannot normally fail. If it does,
		// storing the ORIGINAL is strictly better than losing the match: the bad
		// elements are still named in `dropped`, so a reader is warned.
		return raw, dropped, nil
	}
	return out, dropped, nil
}

// checkEnvelopeMatchID enforces `ledger.matchId == the id it is filed under`.
//
// The mismatch no schema can catch: both halves are individually valid, and the
// review screen would attribute one match's play to another with nothing
// looking wrong on either side.
func checkEnvelopeMatchID(obj map[string]any, matchID string) error {
	raw, present := obj["matchId"]
	if !present {
		return httpx.BadRequest("戰績帳本缺少「matchId」欄位 —— 它必須等於這場對戰的 id")
	}
	got, ok := raw.(string)
	if !ok {
		return httpx.BadRequest("欄位「matchId」必須是字串，收到的是" + kindOf(raw))
	}
	if got != matchID {
		return httpx.BadRequest(fmt.Sprintf(
			"帳本自稱是「%s」，但要存到「%s」—— 兩者必須一致，否則覆盤會把這場的資料算到另一場頭上",
			truncate(got, 64), truncate(matchID, 64)))
	}
	return nil
}

// checkKnownSections is the ALLOWLIST. `matchId` is the envelope; every other
// top-level key must be a section this build knows, and must be an array.
func checkKnownSections(obj map[string]any) error {
	for _, k := range sortedMapKeys(obj) {
		if k == "matchId" {
			continue
		}
		if !sectionSet[k] {
			return httpx.BadRequest(fmt.Sprintf(
				"未知的區段「%s」—— 這個 build 不認識它，存下去會被每個讀取端當成「這場沒有這種資料」。可用的是：%s",
				truncate(k, 40), strings.Join(Sections, ", ")))
		}
		if _, ok := obj[k].([]any); !ok {
			return httpx.BadRequest(fmt.Sprintf(
				"區段「%s」必須是陣列，收到的是%s", k, kindOf(obj[k])))
		}
	}
	return nil
}

// refusedElements walks every section and returns the elements that cannot be
// attributed to anybody. Section order is Sections' order and element order is
// the array's, so the same input always reports the same list.
func refusedElements(obj map[string]any) []Dropped {
	var out []Dropped
	for _, name := range Sections {
		arr, ok := obj[name].([]any)
		if !ok {
			continue
		}
		for i, el := range arr {
			if reason := elementProblem(name, el); reason != "" {
				out = append(out, Dropped{Path: fmt.Sprintf("%s[%d]", name, i), Reason: reason})
			}
		}
	}
	return out
}

// elementProblem returns "" when the element is storable, else the reason.
func elementProblem(section string, el any) string {
	m, ok := el.(map[string]any)
	if !ok {
		return "不是物件，是" + kindOf(el)
	}
	for _, req := range requiredKeys[section] {
		v, present := m[req.name]
		if !present {
			return fmt.Sprintf("缺少「%s」—— 覆盤是用它來歸屬這一列的，沒有它這一列沒有主體", req.name)
		}
		if got := jsonKind(v); got != req.kind {
			return fmt.Sprintf("「%s」應該是%s，收到的是%s", req.name, zhKind(req.kind), kindOf(v))
		}
	}
	return ""
}

// pruned rebuilds the ledger without the refused elements. Keys are copied
// shallowly; only the touched sections are rebuilt.
func pruned(obj map[string]any, dropped []Dropped) map[string]any {
	byIndex := map[string]map[int]bool{}
	for _, d := range dropped {
		section, idx, ok := parsePath(d.Path)
		if !ok {
			continue
		}
		if byIndex[section] == nil {
			byIndex[section] = map[int]bool{}
		}
		byIndex[section][idx] = true
	}
	out := make(map[string]any, len(obj))
	for k, v := range obj {
		drop := byIndex[k]
		arr, isArr := v.([]any)
		if drop == nil || !isArr {
			out[k] = v
			continue
		}
		kept := make([]any, 0, len(arr))
		for i, el := range arr {
			if drop[i] {
				continue
			}
			kept = append(kept, el)
		}
		out[k] = kept
	}
	return out
}

// parsePath splits "casts[7]" back into ("casts", 7).
func parsePath(p string) (section string, idx int, ok bool) {
	open := strings.IndexByte(p, '[')
	if open < 0 || !strings.HasSuffix(p, "]") {
		return "", 0, false
	}
	n, err := strconv.Atoi(p[open+1 : len(p)-1])
	if err != nil {
		return "", 0, false
	}
	return p[:open], n, true
}

// checkFiniteNumbers rejects a JSON number that is not a finite float64.
//
// `1e400` is legal JSON and Go keeps it verbatim in the decoded text, so it
// would land on disk unchanged; JSON.parse then hands the console Infinity, and
// one Infinity turns every average, every percentage and every S~D score
// derived from it into NaN. Named field, because "somewhere in your ledger" is
// not an error message. (Identical judgement to contentoverlay's.)
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
					"由它算出來的平均值、命中率、S~D 評分全部會是 NaN",
				pathOrRoot(path), truncate(t.String(), 24)))
		}
	}
	return nil
}

// DropSummary renders a bounded, operator-facing sentence for a drop list.
func DropSummary(dropped []Dropped) string {
	if len(dropped) == 0 {
		return ""
	}
	named := dropped
	suffix := ""
	if len(named) > maxNamedDrops {
		named = named[:maxNamedDrops]
		suffix = fmt.Sprintf("（另有 %d 筆）", len(dropped)-maxNamedDrops)
	}
	lines := make([]string, 0, len(named))
	for _, d := range named {
		lines = append(lines, fmt.Sprintf("%s —— %s", d.Path, d.Reason))
	}
	return strings.Join(lines, "；") + suffix
}

// ----------------------------------------------------------------- helpers --

// decodeJSONAny parses into `any` with UseNumber, so a number keeps its exact
// source text (1e400 stays "1e400" instead of silently becoming +Inf).
func decodeJSONAny(b []byte) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(b))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		return nil, err
	}
	return v, nil
}

// jsonKind names a JSON value's type in the vocabulary requiredKeys uses.
func jsonKind(v any) string {
	switch v.(type) {
	case json.Number, float64:
		return "number"
	case string:
		return "string"
	case bool:
		return "bool"
	case []any:
		return "array"
	case map[string]any:
		return "object"
	}
	return "null"
}

func zhKind(kind string) string {
	switch kind {
	case "number":
		return "數字"
	case "string":
		return "字串"
	case "array":
		return "陣列"
	case "bool":
		return "布林值"
	case "object":
		return "物件"
	}
	return "null"
}

// kindOf names a JSON value's type in the operator's language.
func kindOf(v any) string { return zhKind(jsonKind(v)) }

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

// sortedMapKeys keeps every walk deterministic. Go randomises map iteration,
// and a ledger with two problems must not name a different field on every
// attempt.
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

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}

// shortHash is the 12-hex-char content hash the quarantine ids are keyed on.
func shortHash(raw []byte) string {
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])[:12]
}
