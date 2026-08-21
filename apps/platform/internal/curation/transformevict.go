package curation

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/httpx"
)

// ⭐【變身態不可能被勾在營運白名單上】—— owner 2026-08-21 的兩半，第二半。
//
// > 「白名單還是 59 / 10 個變身態在線上仍然選得到 => 幫我後台跳出一鍵清理變身態的按鈕」
//
// ---------------------------------------------------------------------------
// 為什麼這一條要跟 legacyevict.go 走**同一條漏斗**
// ---------------------------------------------------------------------------
// 按鈕本身只清得掉**存量**。GH#249 換掉的那 10 個 alternate id 之所以還在線上，
// 正是因為 `ApplyStarterSet` 是 union-only 永不移除、而 `data/` 在 .gitignore 裡
// —— 也就是說「清一次」不是修好，是**把同一件事推遲到下一次**。所以清理按鈕旁邊
// 必須有一道閘，讓變身態
//
//	· 存不進去（Repo.save）—— 一次 PUT／bulk／舊 ops bundle 還原都塞不回來,
//	· 服務不出去（Repo.load）—— 就算磁碟上還躺著,答案裡也沒有它。
//
// 於是按鈕變成「清理存量」，⛔ 不是唯一防線。
//
// ---------------------------------------------------------------------------
// 判定**推導**自 `transform.role`，⛔ 沒有一行手寫的 id
// ---------------------------------------------------------------------------
// 唯一的真相是內容樹自己：`content/champions/<id>.json` 的
// `transform.role == "alternate"`（schema: packages/shared/src/content/schema/
// champion.ts 的 `zTransformLink`，`z.enum(["base","alternate"])`）。
//
// ⛔ 刻意**不**抄 `packages/shared/src/content/championForms.ts` 的 26 對表：
// 那是 w3x 匯入的**證據**，抄過來就是第二份會各自腐爛的副本（reset.go 的檔頭為了
// 同一個理由拒絕在 Go 這一側判斷變身態）。從 `transform.role` 推導的好處是**以後
// 新增的變身英雄自動適用** —— 內容側寫一份 doc，這道閘當天就認得它。
//
// ⚠️ 這一條與 game-server 的 `Whitelist.allowsChampion`（apps/game-server/src/
// curation/whitelist.ts:130 `isTransformedBody(id) → false`）說的是**同一件事**，
// 但那一端擋的是「服務端不准選」，這一端擋的是「營運資料不准存」。兩端都在，是
// 因為線上白名單那 10 個死 id 每一次 `opstate export` 都會被複製到下一台機器。
//
// ---------------------------------------------------------------------------
// ⚠️ fail-open 的方向，以及誰會知道
// ---------------------------------------------------------------------------
// 讀不到內容樹 → loaded=false → **一個都不剔除**（與 legacyevict.go 同一個方向、
// 同一個理由：fail-closed 的代價是「內容暫時讀不到時整份白名單被清空」）。
// 但 CLAUDE.md：**fail-open 沒錯，靜默才是缺陷** —— 所以
//
//	· 開機印一行 boot summary（掃到幾個 / 或為什麼掃不到），
//	· 真的剔除到東西時走 `curation.legacy-evict` 這條 **admin 稽核紀錄**，
//	· 而且後台那顆按鈕**自己也從 /content/ 推導一份名單**：閘是啞的（平台讀不到
//	  內容樹）而按鈕算得出 10 位時，兩個數字對不起來，畫面上就是紅的。
//	  ⭐ 那是「兩個名詞的關係」，⛔ 不是分別檢查每一半（見 CLAUDE.md 部署協定）。

// transformGateEnv is the ONE-KEY ROLLBACK for the automatic half of this gate.
//
// 第〇·六守則：「優先權大的更新後都是預設啟動」「不能停下來的場合，就做成開關，
// 讓我事後可以用開關一鍵 rollback」。預設 **on**；設成 0/false/off/no 之後
// `Evict` 就不再碰變身態（legacy 那一半不受影響），⛔ 而後台那顆按鈕仍然可用 ——
// 開關關掉的是「自動剔除」，不是「營運者的明確動作」。
const transformGateEnv = "GGD_CURATION_TRANSFORM_GATE"

// transformGateEnabled resolves the switch. Anything other than an explicit
// off-word (including an unset variable) means ON.
func transformGateEnabled() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(transformGateEnv))) {
	case "0", "false", "off", "no":
		return false
	}
	return true
}

// championsDir is where authored champion docs live inside a content tree.
const championsDir = "champions"

// TransformIndex is the set of champion ids whose doc declares
// `transform.role == "alternate"` — the transformed bodies, which are reached
// ONLY by casting the transform ability and are never independently pickable
// (owner 2026-07-26「換成本體，變身態改由技能觸發」).
type TransformIndex struct {
	root   string
	loaded bool
	// enabled is the env switch; it gates Evict, NOT the index itself, so the
	// admin console's explicit button keeps working while the automatic
	// eviction is rolled back.
	enabled bool
	// alternate maps id → display name. The NAME is carried because the audit
	// entry an operator reads months later should say 「超級賽亞人 - 悟空」,
	// not `godie-o00x`.
	alternate map[string]string
}

// championDoc is the minimal shape this gate reads out of a champion document.
// Deliberately tiny: every other field is somebody else's business, and a
// struct that decodes the whole doc would fail on a schema this package has no
// reason to track.
type championDoc struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Transform *struct {
		Role string `json:"role"`
	} `json:"transform"`
}

// LoadTransformIndex scans <contentDir>/champions/*.json once, at construction.
//
// Read ONCE for the same reason LoadLegacyArchive is: content/ is a bind-mount
// that only changes on a deploy, and a deploy restarts the platform. A stale
// index therefore fails in the safe direction (a newly authored transform pair
// survives until the next boot), never in the direction of deleting a live
// operator's choices.
func LoadTransformIndex(contentDir string) TransformIndex {
	idx := TransformIndex{
		root:      filepath.Join(contentDir, championsDir),
		enabled:   transformGateEnabled(),
		alternate: map[string]string{},
	}
	if strings.TrimSpace(contentDir) == "" {
		return idx
	}
	entries, err := os.ReadDir(idx.root)
	if err != nil {
		return idx
	}
	for _, e := range entries {
		name := e.Name()
		// `_index.json` and friends are build products, not authored docs.
		if e.IsDir() || !strings.HasSuffix(name, ".json") || strings.HasPrefix(name, "_") {
			continue
		}
		// #nosec G304 -- path is built from CONTENT_DIR + a directory listing of
		// it, never from request data.
		raw, readErr := os.ReadFile(filepath.Join(idx.root, name))
		if readErr != nil {
			continue
		}
		var doc championDoc
		if json.Unmarshal(raw, &doc) != nil {
			continue
		}
		// The tree was readable and parseable: the gate is ARMED even when this
		// particular champion is a base body. (Keying `loaded` off "found at
		// least one alternate" would make an install with zero transform pairs
		// indistinguishable from an unreadable content tree.)
		idx.loaded = true
		if doc.Transform == nil || doc.Transform.Role != "alternate" {
			continue
		}
		id := strings.TrimSpace(doc.ID)
		if id == "" {
			id = strings.TrimSuffix(name, ".json")
		}
		idx.alternate[id] = strings.TrimSpace(doc.Name)
	}
	return idx
}

// Loaded reports whether a champions tree was actually read. False means this
// index evicts NOTHING (the fail-open direction documented above).
func (t TransformIndex) Loaded() bool { return t.loaded }

// Enabled reports the env switch (the automatic half's rollback).
func (t TransformIndex) Enabled() bool { return t.enabled }

// Size counts the transformed bodies found.
func (t TransformIndex) Size() int { return len(t.alternate) }

// Has reports whether this champion id is a transformed body.
func (t TransformIndex) Has(id string) bool { _, ok := t.alternate[id]; return ok }

// NameOf returns the display name for an indexed id ("" when unknown).
func (t TransformIndex) NameOf(id string) string { return t.alternate[id] }

// Matching returns the champion ids of `ids` that are transformed bodies,
// sorted. Empty when the index is inert — a gate that cannot read the content
// tree must not claim it found nothing to clean.
func (t TransformIndex) Matching(ids []string) []string {
	if !t.loaded {
		return nil
	}
	out := []string{}
	for _, id := range ids {
		if t.Has(id) {
			out = append(out, id)
		}
	}
	sort.Strings(out)
	return out
}

// ------------------------------------------------------------- the funnel ---

// WhitelistGate is THE funnel every whitelist read and write passes through.
// It holds one rule per reason an id must not be curatable:
//
//	legacy — its document was archived under content/_legacy/  (GH#479)
//	forms  — it is a 變身態 (`transform.role == "alternate"`)   (owner 2026-08-21)
//
// ⭐ ONE funnel, not two, and that is 第零守則⑨ (N 個同型 = K 個模板): both rules
// answer the same question in the same place, so `Load`/`Save` never grow a
// second `if` and a third reason costs one struct field.
type WhitelistGate struct {
	legacy LegacyArchive
	forms  TransformIndex
}

// LoadWhitelistGate builds every rule from one content tree.
func LoadWhitelistGate(contentDir string) WhitelistGate {
	return WhitelistGate{
		legacy: LoadLegacyArchive(contentDir),
		forms:  LoadTransformIndex(contentDir),
	}
}

// Transformed exposes the 變身態 rule (the admin button reads it).
func (g WhitelistGate) Transformed() TransformIndex { return g.forms }

// LogBootSummary says, once per process, what the whole funnel is holding —
// including the case where it is holding nothing because the content tree was
// not found.
func (g WhitelistGate) LogBootSummary() {
	g.legacy.LogBootSummary()
	switch {
	case !g.forms.loaded:
		slog.Warn("curation: no content/champions tree found — the whitelist TRANSFORM gate is INERT, "+
			"so a 變身態 can stay checked in the operator whitelist (it is unpickable in game either way)",
			"lookedIn", g.forms.root, "switch", transformGateEnv)
	case !g.forms.enabled:
		slog.Warn("curation: whitelist transform gate is SWITCHED OFF — 變身態 will not be evicted automatically",
			"switch", transformGateEnv+"=0", "wouldHold", g.forms.Size())
	default:
		slog.Info("curation: whitelist transform gate armed",
			"root", g.forms.root, "transformedBodies", g.forms.Size())
	}
}

// Evict runs every rule. The input document is never mutated.
//
// ⚠️ THE FLOOR. If the 變身態 rule would leave ZERO champions enabled while some
// were, it is SKIPPED WHOLESALE and says so. Nothing downstream reports an empty
// whitelist (reset.go's file header explains why: a `{"champions":[]}` is an
// operator's legitimate choice as far as the game-server is concerned), and the
// only way this rule can eat a whole roster is a mis-authored `transform.role`
// on base bodies — in which case the correct behaviour is to hold still and be
// loud, ⛔ not to empty champ-select for every player.
func (g WhitelistGate) Evict(d Doc) (Doc, []string) {
	d, removed := g.legacy.Evict(d)
	if !g.forms.loaded || !g.forms.enabled || len(d.Champions) == 0 {
		return d, removed
	}
	drop := g.forms.Matching(d.Champions)
	if len(drop) == 0 {
		return d, removed
	}
	if len(drop) == len(d.Champions) {
		slog.Error("curation: REFUSING to evict 變身態 — it would empty the champion whitelist; "+
			"check transform.role in content/champions (every enabled champion reads as an alternate body)",
			"champions", len(d.Champions), "switch", transformGateEnv)
		return d, removed
	}
	gone := make(map[string]struct{}, len(drop))
	for _, id := range drop {
		gone[id] = struct{}{}
		removed = append(removed, KindChampions+"/"+id)
	}
	kept := make([]string, 0, len(d.Champions)-len(drop))
	for _, id := range d.Champions {
		if _, dropped := gone[id]; !dropped {
			kept = append(kept, id)
		}
	}
	d.Champions = kept
	sort.Strings(removed)
	return d, removed
}

// Reasons maps the "<kind>/<id>" keys Evict returned to WHY each was dropped,
// so one audit entry can carry both rules without the reader having to guess.
func (g WhitelistGate) Reasons(removed []string) map[string]string {
	out := make(map[string]string, len(removed))
	for _, key := range removed {
		kind, id, ok := strings.Cut(key, "/")
		if ok && kind == KindChampions && g.forms.Has(id) {
			out[key] = "transformed-body"
			continue
		}
		out[key] = "legacy-archived"
	}
	return out
}

// ------------------------------------------------ the one-click clean-up ----

// EvictTransformedResult is what POST /curation/whitelist/evict-transformed
// returns for both a dry run and a real run — the SAME plan code produces both,
// so the list the operator confirms is produced by the code that does the write.
type EvictTransformedResult struct {
	DryRun bool `json:"dryRun"`
	// Armed is false when the platform could not read content/champions/. The
	// console compares it against its OWN derivation and turns red on a
	// disagreement — that pairing is the fail-loud for an inert gate.
	Armed bool `json:"armed"`
	// GateEnabled mirrors GGD_CURATION_TRANSFORM_GATE (the automatic half).
	GateEnabled bool `json:"gateEnabled"`
	// Indexed is how many transformed bodies the content tree declares.
	Indexed int `json:"indexed"`
	// Remove are the champion ids that would be / were turned off, sorted.
	Remove []string `json:"remove"`
	// Names maps those ids to their display names (for the confirmation list).
	Names map[string]string `json:"names"`
	// Before/After are champion counts.
	Before int `json:"before"`
	After  int `json:"after"`
	// SnapshotID is the pre-change undo point. Empty on a dry run.
	SnapshotID string `json:"snapshotId,omitempty"`
	// Whitelist is the resulting document (the would-be result on a dry run).
	Whitelist Doc `json:"whitelist"`
}

// EvictTransformed removes every 變身態 from the champion whitelist.
//
// ⭐ It reads the RAW stored document (`loadRaw`), not `Load`: when the gate is
// armed `Load` has already stripped them, so a plan computed from it would
// always be empty and the button could never report what it cleaned.
//
// `expect` is the SECOND CONFIRMATION, re-checked here under the mutex — the
// count the operator saw on screen has had a network round trip and a human
// pause in front of it, so a mismatch is a 409 rather than a write.
func (s *Service) EvictTransformed(ctx context.Context, dryRun bool, expect *int, actor string) (EvictTransformedResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	cur, _, err := s.repo.loadRaw()
	if err != nil {
		return EvictTransformedResult{}, err
	}
	forms := s.repo.gate.Transformed()
	remove := forms.Matching(cur.Champions)
	names := make(map[string]string, len(remove))
	for _, id := range remove {
		names[id] = forms.NameOf(id)
	}
	res := EvictTransformedResult{
		DryRun:      dryRun,
		Armed:       forms.Loaded(),
		GateEnabled: forms.Enabled(),
		Indexed:     forms.Size(),
		Remove:      remove,
		Names:       names,
		Before:      len(cur.Champions),
		After:       len(cur.Champions) - len(remove),
		Whitelist:   cur,
	}
	if dryRun {
		return res, nil
	}

	if expect == nil {
		return EvictTransformedResult{}, httpx.BadRequest(
			`expect is required when dryRun is false (the number of 變身態 the operator confirmed)`)
	}
	if *expect != len(remove) {
		return EvictTransformedResult{}, httpx.Err(http.StatusConflict, "confirm_mismatch",
			"畫面上的數字已經過期：你確認的是「清掉 "+strconv.Itoa(*expect)+
				" 個變身態」，但現在實際會清掉 "+strconv.Itoa(len(remove))+" 個。請重新整理後再試一次。")
	}
	if len(remove) == 0 {
		return res, nil // nothing to do — not an error, and nothing to audit
	}
	// The same floor Evict holds: this button must never be the second way to
	// empty champ-select.
	if res.After == 0 {
		return EvictTransformedResult{}, httpx.Err(http.StatusConflict, "would_empty_whitelist",
			"拒絕執行：結果會是零英雄的白名單，選人畫面會整個空掉。"+
				"請先確認 content/champions 的 transform.role 是不是標錯了。")
	}

	// The snapshot IS the undo button (identical policy to Reset): an operator
	// gets 還原 back to the pre-click document from the existing 快照 list.
	snapID, snapErr := s.saveSnapshot(cur, actor, "evict-transformed", []string{KindChampions})
	if snapErr != nil {
		return EvictTransformedResult{}, httpx.Internal(
			"清理前的快照寫入失敗，因此沒有執行清理（保留可還原性）：" + snapErr.Error())
	}

	next := cur
	gone := make(map[string]struct{}, len(remove))
	for _, id := range remove {
		gone[id] = struct{}{}
	}
	kept := make([]string, 0, len(cur.Champions)-len(remove))
	for _, id := range cur.Champions {
		if _, dropped := gone[id]; !dropped {
			kept = append(kept, id)
		}
	}
	next.Champions = kept
	next.Version = SchemaVersion
	next.UpdatedAt = s.now().UTC()
	stored, saveErr := s.repo.save(ctx, next)
	if saveErr != nil {
		return EvictTransformedResult{}, saveErr
	}
	res.Whitelist = stored
	res.After = len(stored.Champions)
	res.SnapshotID = snapID
	return res, nil
}

// ---------------------------------------------------------------- handler ---

type evictTransformedReq struct {
	DryRun bool `json:"dryRun"`
	Expect *int `json:"expect"`
}

// evictTransformed — 一鍵清理變身態. `dryRun: true` is the console's PREVIEW and
// runs the identical plan code, so the names the operator confirms come from
// the code that will do the write.
func (h *Handlers) evictTransformed(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context()).AccountID
	var req evictTransformedReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.EvictTransformed(r.Context(), req.DryRun, req.Expect, me)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	if !res.DryRun && len(res.Remove) > 0 {
		// ⭐ THE SAME AUDIT ACTION the automatic gate writes (owner 2026-08-21:
		// 「走既有的稽核路徑」) — one row on the console's 稽核 page, ⛔ not a new
		// log line nobody reads. `reason` is what tells the two apart.
		h.svc.Audit(me, "curation.legacy-evict", map[string]any{
			"removed":    res.Remove,
			"count":      len(res.Remove),
			"names":      res.Names,
			"reason":     "transformed-body",
			"trigger":    "admin-button",
			"snapshotId": res.SnapshotID,
			"why": "變身態（transform.role == \"alternate\"）永遠不是可選英雄，" +
				"勾著它只會讓選人畫面多一格永遠選不到的身體",
		})
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}
