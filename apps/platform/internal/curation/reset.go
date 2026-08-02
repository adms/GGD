package curation

import (
	"context"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/ggd/platform/internal/httpx"
)

// RESET TO FACTORY — the whitelist's only REPLACE-shaped operation, and the
// only one in this package that can turn content OFF without the operator
// naming a single id.
//
// WHY IT IS ITS OWN ENDPOINT AND NOT `PUT /curation/whitelist`. The PUT路徑
// makes the CALLER compute the target document, which puts three failure modes
// on the wire that this endpoint cannot have:
//
//  1. A read-modify-write cycle split across a network round trip. "Reset the
//     champions but keep my items" means POSTing champions=starter plus
//     items=whatever-I-read-a-minute-ago — so a concurrent edit by anyone else
//     is silently rolled back. Reset does the whole cycle inside s.mu, the same
//     mutex every other mutation here uses.
//  2. A stale starter. The console would be sending ids it cached from
//     GET …/starter; this endpoint reads the starter of the process that is
//     doing the writing.
//  3. Un-auditable intent. `curation.replace` cannot distinguish "the operator
//     hand-curated 40 ids" from "the operator pressed 回到原廠設定"; this writes
//     `curation.reset` with the scopes and the counts.
//
// THE EMPTY-WHITELIST RULE (the reason for the three guards below). A whitelist
// with zero champions is indistinguishable, from the outside, from a healthy
// install: the site loads, the lobby works, `GET /curation/whitelist` returns
// 200 with a well-formed body — and champ-select is empty for every player.
// apps/game-server/src/curation/whitelist.ts fails SAFE (allow-all) only when
// the platform is UNREACHABLE or returns garbage; a syntactically perfect
// `{"champions":[]}` is an operator's legitimate choice as far as it is
// concerned, so it enforces exactly what it was told. Nothing downstream will
// catch this. It has to be caught here.
//
// The guards are stated as POSTCONDITIONS ON THE RESULT, not as validation of
// the input, on purpose. StarterSet() is a compiled-in constant today, so
// "the starter failed to load" is impossible today — which is precisely why an
// input check would be the wrong guard: the day someone makes the starter read
// from content/ or from an overlay, an input check is already obsolete and a
// postcondition still holds.

// ResetScopes is the set of kinds a reset may be applied to. It is the same
// three kinds as everything else here; `ValidKind` is the gate.
//
// The scope is a LIST, not three booleans: an unknown kind must be a 400 rather
// than silently reading as false, and the response echoes the accepted scopes
// so the console can reconcile what it asked for with what ran.

// ResetRequest is the decoded body of POST /curation/whitelist/reset.
type ResetRequest struct {
	// Scopes names the kinds to overwrite with the starter set. Required,
	// non-empty; every entry must be a valid kind.
	Scopes []string `json:"scopes"`
	// DryRun computes and returns the plan without writing anything.
	DryRun bool `json:"dryRun"`
	// Expect is the SECOND CONFIRMATION, server-side: per scope, how many ids
	// the caller believes will be turned off. Required when DryRun is false.
	// Recomputed under the mutex and compared; a mismatch is a 409 rather than
	// a write, so the number the operator confirmed on screen is a genuine
	// precondition and not just a UI promise.
	Expect map[string]int `json:"expect"`
	// Actor is the admin account id recorded on the pre-reset snapshot. Set by
	// the handler from the authenticated identity, never from the body.
	Actor string `json:"-"`
}

// ResetWarning is a non-fatal consequence the caller should show before
// committing. Codes are stable; the console renders them.
type ResetWarning struct {
	Code string `json:"code"`
	// ChampionID is set for "half-enabled-champion".
	ChampionID string `json:"championId,omitempty"`
	// Missing lists the ability ids that would NOT be enabled after the reset.
	Missing []string `json:"missing,omitempty"`
}

// WarnHalfEnabledChampion is emitted when the post-reset document keeps a
// champion enabled while one or more of its five ability documents are not.
// Only `.ex` is gated by the sim today (MatchController.learnEx), so the
// visible symptom is a dead F key at the round-6 EX unlock.
const WarnHalfEnabledChampion = "half-enabled-champion"

// ResetResult is what the endpoint returns for both a dry run and a real run.
// The SAME plan function produces both — a preview computed by a different code
// path than the write is a preview that can lie.
type ResetResult struct {
	DryRun bool     `json:"dryRun"`
	Scopes []string `json:"scopes"`
	// Before/After are per-kind counts of the whole document (all three kinds,
	// not just the selected scopes, so an operator can see what stayed put).
	Before map[string]int `json:"before"`
	After  map[string]int `json:"after"`
	// Disable/Enable are the actual ids that move, per kind. Ids, not counts:
	// the console classifies champions (base body vs transformed body) from
	// them, and that classification must never be duplicated in Go — see below.
	Disable map[string][]string `json:"disable"`
	Enable  map[string][]string `json:"enable"`
	// Warnings are consequences that do not block the write.
	Warnings []ResetWarning `json:"warnings"`
	// SnapshotID identifies the pre-reset copy of the whitelist. Empty on a dry
	// run (nothing was written, so there is nothing to undo).
	SnapshotID string `json:"snapshotId,omitempty"`
	// Whitelist is the resulting document (the would-be result on a dry run).
	Whitelist Doc `json:"whitelist"`
}

// ⚠️ WHAT THIS FILE DELIBERATELY DOES NOT COMPUTE: whether a disabled champion
// id is a 變身態 (a transformed body whose base body a player actually picks).
// That truth is a closed 26-pair w3x table in
// packages/shared/src/content/championForms.ts, which this Go module cannot
// import. Copying it here would produce a second copy that drifts on the next
// re-import while every test in this package stayed green — the whole point of
// returning `Disable` as IDS is that the console answers that question with the
// shipped table at view time.

// SetStarter overrides the starter-set seam. Production uses StarterSet; tests
// inject one to exercise the empty-starter guard, which is otherwise
// unreachable because StarterSet is a compiled-in constant.
//
// ApplyStarterSet goes through the same seam, so a test that fakes the starter
// fakes it for every door.
func (s *Service) SetStarter(fn func() Doc) {
	if fn == nil {
		return
	}
	s.starter = fn
}

// normalizeScopes validates + dedupes + sorts the requested scopes.
func normalizeScopes(in []string) ([]string, error) {
	if len(in) == 0 {
		return nil, httpx.BadRequest(`scopes must name at least one of "champions", "items", "abilities"`)
	}
	seen := make(map[string]struct{}, len(in))
	out := make([]string, 0, len(in))
	for _, raw := range in {
		if !ValidKind(raw) {
			return nil, httpx.BadRequest(`invalid scope "` + truncate(raw, 40) + `"; must be one of "champions", "items", "abilities"`)
		}
		if _, dup := seen[raw]; dup {
			continue
		}
		seen[raw] = struct{}{}
		out = append(out, raw)
	}
	sort.Strings(out)
	return out, nil
}

func counts(d Doc) map[string]int {
	return map[string]int{
		KindChampions: len(d.Champions),
		KindItems:     len(d.Items),
		KindAbilities: len(d.Abilities),
	}
}

// diffIDs returns the ids present in `before` and absent from `after`.
func diffIDs(before, after []string) []string {
	have := make(map[string]struct{}, len(after))
	for _, id := range after {
		have[id] = struct{}{}
	}
	out := []string{}
	for _, id := range before {
		if _, ok := have[id]; !ok {
			out = append(out, id)
		}
	}
	sort.Strings(out)
	return out
}

// halfEnabledWarnings reports champions that stay enabled in `next` while some
// of their five ability documents do not. Pure id arithmetic over the same slot
// table the starter bundle expands (starterAbilitySlots), so it costs nothing
// and cannot disagree with the bundle.
func halfEnabledWarnings(next Doc) []ResetWarning {
	abilities := make(map[string]struct{}, len(next.Abilities))
	for _, id := range next.Abilities {
		abilities[id] = struct{}{}
	}
	out := []ResetWarning{}
	for _, champ := range next.Champions {
		missing := []string{}
		for _, slot := range starterAbilitySlots {
			id := champ + "." + slot
			if _, ok := abilities[id]; !ok {
				missing = append(missing, id)
			}
		}
		if len(missing) > 0 {
			out = append(out, ResetWarning{
				Code: WarnHalfEnabledChampion, ChampionID: champ, Missing: missing,
			})
		}
	}
	return out
}

// Reset replaces the selected kinds with the starter set, leaving every other
// kind byte-for-byte alone. See the file header for why this is not a PUT.
//
// On a real run it snapshots the pre-reset document first (see Snapshot), so
// the operation is undoable, and audits nothing — auditing is the handler's job
// because only it knows the identity.
func (s *Service) Reset(ctx context.Context, req ResetRequest) (ResetResult, error) {
	scopes, err := normalizeScopes(req.Scopes)
	if err != nil {
		return ResetResult{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	starter := s.starter()

	// GUARD ① — the source we are about to copy FROM must not be empty for any
	// selected kind. 500, not 400: the operator cannot fix a broken starter set
	// by changing their request.
	for _, kind := range scopes {
		src := starter.list(kind)
		if src == nil || len(*src) == 0 {
			return ResetResult{}, httpx.Err(http.StatusInternalServerError, "starter_empty",
				"原廠 starter 的「"+kind+"」是空的 —— 拒絕執行，因為這會把白名單清空。"+
					"這是伺服器端的內容缺陷，不是你的操作問題。")
		}
	}

	cur, _, err := s.repo.Load()
	if err != nil {
		return ResetResult{}, err
	}

	next := Doc{
		Version:   SchemaVersion,
		Champions: append([]string(nil), cur.Champions...),
		Items:     append([]string(nil), cur.Items...),
		Abilities: append([]string(nil), cur.Abilities...),
	}
	for _, kind := range scopes {
		src := starter.list(kind)
		normalized, nErr := normalizeIDs(kind, *src)
		if nErr != nil {
			return ResetResult{}, nErr
		}
		*next.list(kind) = normalized
	}

	disable := map[string][]string{}
	enable := map[string][]string{}
	for _, kind := range []string{KindChampions, KindItems, KindAbilities} {
		disable[kind] = diffIDs(*cur.list(kind), *next.list(kind))
		enable[kind] = diffIDs(*next.list(kind), *cur.list(kind))
	}

	// GUARD ② — no kind may go from populated to empty as a RESULT of this
	// operation. 409: a different scope selection is a valid way forward.
	for _, kind := range []string{KindChampions, KindItems, KindAbilities} {
		if len(*next.list(kind)) == 0 && len(*cur.list(kind)) > 0 {
			return ResetResult{}, httpx.Err(http.StatusConflict, "would_empty_whitelist",
				"拒絕執行：這個操作會把「"+kind+"」清空（原本 "+strconv.Itoa(len(*cur.list(kind)))+" 個）。")
		}
	}
	// GUARD ③ — the absolute floor. Zero champions means an empty champ-select
	// for every player, and nothing downstream reports it.
	if len(next.Champions) == 0 {
		return ResetResult{}, httpx.Err(http.StatusConflict, "would_empty_whitelist",
			"拒絕執行：結果會是零英雄的白名單，選人畫面會整個空掉。")
	}

	result := ResetResult{
		DryRun:    req.DryRun,
		Scopes:    scopes,
		Before:    counts(cur),
		After:     counts(next),
		Disable:   disable,
		Enable:    enable,
		Warnings:  halfEnabledWarnings(next),
		Whitelist: next,
	}
	if req.DryRun {
		result.Whitelist.UpdatedAt = cur.UpdatedAt
		return result, nil
	}

	// SECOND CONFIRMATION, enforced here rather than trusted from the UI. The
	// number the operator typed was computed from a read that has since had a
	// network round trip and a human pause in front of it; if anything changed
	// underneath, the screen is lying and the safe answer is to make them look
	// again.
	if req.Expect == nil {
		return ResetResult{}, httpx.BadRequest(`expect is required when dryRun is false (per-scope count of ids that will be disabled)`)
	}
	for _, kind := range scopes {
		want, ok := req.Expect[kind]
		if !ok {
			return ResetResult{}, httpx.BadRequest("expect is missing the scope \"" + kind + "\"")
		}
		if got := len(disable[kind]); want != got {
			return ResetResult{}, httpx.Err(http.StatusConflict, "confirm_mismatch",
				"畫面上的數字已經過期：你確認的是「"+kind+" 關掉 "+strconv.Itoa(want)+
					" 個」，但現在實際會關掉 "+strconv.Itoa(got)+" 個。請重新計算後再試一次。")
		}
	}

	snapID, err := s.saveSnapshot(cur, req.Actor, "reset", scopes)
	if err != nil {
		// The snapshot IS the undo button. Writing the reset without one would
		// make an irreversible change out of a reversible one, so this fails the
		// whole operation rather than proceeding "best effort".
		return ResetResult{}, httpx.Internal("重設前的快照寫入失敗，因此沒有執行重設（保留可還原性）：" + err.Error())
	}

	next.UpdatedAt = s.now().UTC()
	if err := s.repo.Save(ctx, next); err != nil {
		return ResetResult{}, err
	}
	result.Whitelist = next
	result.SnapshotID = snapID
	return result, nil
}

// ------------------------------------------------------------ snapshots ----

// SnapshotCollection is the jsonstore collection holding pre-reset copies of
// the whitelist: data/curation/snapshots/<id>.json.
//
// A NESTED collection rather than `whitelist-snap-*` docs inside `curation`, so
// data/curation/_index.json keeps listing exactly one id ("whitelist"). Several
// host-side tools read that tree directly.
const SnapshotCollection = Collection + "/snapshots"

// snapshotStampLayout is the id format: sortable, filename-safe, second
// resolution (jsonstore ids may not contain ':').
const snapshotStampLayout = "20060102-150405"

// Snapshot is one pre-change copy of the whitelist.
//
// ⚠️ Actor lives HERE and never on Doc. `GET /api/v1/curation/whitelist` is a
// PUBLIC endpoint (Handlers.MountPublic) that every player's client reads, so
// an `updatedBy` field on Doc would publish admin account ids to the world.
// Snapshots are admin-only.
type Snapshot struct {
	ID      string    `json:"id"`
	TakenAt time.Time `json:"takenAt"`
	Actor   string    `json:"actor"`
	// Reason is the operation that took it ("reset", "restore").
	Reason string `json:"reason"`
	// Scopes is the scope selection of the operation that took it.
	Scopes []string `json:"scopes,omitempty"`
	// Whitelist is the document AS IT WAS, before the change.
	Whitelist Doc `json:"whitelist"`
}

// SnapshotSummary is a snapshot without its id lists — what the console lists.
type SnapshotSummary struct {
	ID      string         `json:"id"`
	TakenAt time.Time      `json:"takenAt"`
	Actor   string         `json:"actor"`
	Reason  string         `json:"reason"`
	Scopes  []string       `json:"scopes,omitempty"`
	Counts  map[string]int `json:"counts"`
}

// saveSnapshot writes `doc` as a snapshot and returns its id. Caller holds s.mu.
func (s *Service) saveSnapshot(doc Doc, actor, reason string, scopes []string) (string, error) {
	stamp := s.now().UTC().Format(snapshotStampLayout) + "Z"
	id := stamp
	// Two operations inside the same second must not overwrite each other's
	// undo point.
	for i := 2; i < 100; i++ {
		exists, err := s.store.Exists(SnapshotCollection, id)
		if err != nil {
			return "", err
		}
		if !exists {
			break
		}
		id = stamp + "-" + strconv.Itoa(i)
	}
	snap := Snapshot{
		ID:        id,
		TakenAt:   s.now().UTC(),
		Actor:     actor,
		Reason:    reason,
		Scopes:    scopes,
		Whitelist: doc,
	}
	if err := s.store.Put(SnapshotCollection, id, snap); err != nil {
		return "", err
	}
	return id, nil
}

// ListSnapshots returns the stored snapshots, NEWEST FIRST.
func (s *Service) ListSnapshots() ([]SnapshotSummary, error) {
	ids, err := s.store.Scan(SnapshotCollection)
	if err != nil {
		return nil, err
	}
	sort.Sort(sort.Reverse(sort.StringSlice(ids)))
	out := make([]SnapshotSummary, 0, len(ids))
	for _, id := range ids {
		var snap Snapshot
		if err := s.store.Get(SnapshotCollection, id, &snap); err != nil {
			continue // a corrupt snapshot must not hide the healthy ones
		}
		out = append(out, SnapshotSummary{
			ID: id, TakenAt: snap.TakenAt, Actor: snap.Actor,
			Reason: snap.Reason, Scopes: snap.Scopes, Counts: counts(snap.Whitelist),
		})
	}
	return out, nil
}

// GetSnapshot reads one snapshot in full.
func (s *Service) GetSnapshot(id string) (Snapshot, error) {
	var snap Snapshot
	if err := s.store.Get(SnapshotCollection, id, &snap); err != nil {
		return Snapshot{}, httpx.NotFound("找不到快照 " + truncate(id, 40))
	}
	return snap, nil
}

// RestoreSnapshot puts the whitelist back to a stored snapshot — the undo for
// Reset. It snapshots the CURRENT document first, so undo is itself undoable.
//
// The same empty-whitelist floor applies: a snapshot taken when nothing was
// enabled must not be restorable into a live install, or the undo button
// becomes a second way to empty champ-select.
func (s *Service) RestoreSnapshot(ctx context.Context, id, actor string) (Doc, string, error) {
	snap, err := s.GetSnapshot(id)
	if err != nil {
		return EmptyDoc(), "", err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	cur, _, err := s.repo.Load()
	if err != nil {
		return EmptyDoc(), "", err
	}

	champs, err := normalizeIDs(KindChampions, snap.Whitelist.Champions)
	if err != nil {
		return EmptyDoc(), "", err
	}
	items, err := normalizeIDs(KindItems, snap.Whitelist.Items)
	if err != nil {
		return EmptyDoc(), "", err
	}
	abilities, err := normalizeIDs(KindAbilities, snap.Whitelist.Abilities)
	if err != nil {
		return EmptyDoc(), "", err
	}
	next := Doc{Version: SchemaVersion, Champions: champs, Items: items, Abilities: abilities}

	for _, kind := range []string{KindChampions, KindItems, KindAbilities} {
		if len(*next.list(kind)) == 0 && len(*cur.list(kind)) > 0 {
			return EmptyDoc(), "", httpx.Err(http.StatusConflict, "would_empty_whitelist",
				"拒絕還原：這個快照的「"+kind+"」是空的，還原會把現有的 "+
					strconv.Itoa(len(*cur.list(kind)))+" 個清掉。")
		}
	}
	if len(next.Champions) == 0 {
		return EmptyDoc(), "", httpx.Err(http.StatusConflict, "would_empty_whitelist",
			"拒絕還原：這個快照是零英雄的白名單，選人畫面會整個空掉。")
	}

	undoID, err := s.saveSnapshot(cur, actor, "restore", nil)
	if err != nil {
		return EmptyDoc(), "", httpx.Internal("還原前的快照寫入失敗，因此沒有執行還原：" + err.Error())
	}

	next.UpdatedAt = s.now().UTC()
	if err := s.repo.Save(ctx, next); err != nil {
		return EmptyDoc(), "", err
	}
	return next, undoID, nil
}
