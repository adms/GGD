package platformarchive

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"time"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/data/jsonstore"
)

// Plan results. The first five are opstate/restore.go's vocabulary, kept
// verbatim so the two tools read the same way in a report. ResultAdded is the
// one addition: opstate only ever replaced whole parts, this writes documents.
const (
	ResultAdded     = "added"
	ResultWritten   = "written"
	ResultUnchanged = "unchanged"
	ResultSkipped   = "skipped"
	ResultBlocked   = "blocked"
)

// ResolveAdoptArchive makes the archive's identity refs win over the target's.
const ResolveAdoptArchive = "adopt-archive"

// PlanOptions parameterise Plan and Commit.
type PlanOptions struct {
	// Groups restricts the import to these groups (core is always included).
	// Empty means "every group the archive carries".
	Groups []string
	// AllowOverwrite permits replacing an EXISTING target document whose
	// content differs. Off by default: the target is by definition the machine
	// where people have been playing.
	AllowOverwrite bool
	// ResolveCollisions is "" (refuse) or ResolveAdoptArchive.
	ResolveCollisions string
}

// ItemPlan is one document's verdict — the unit of the plan's contract.
type ItemPlan struct {
	ID     string `json:"id"`
	Result string `json:"result"`
	Detail string `json:"detail,omitempty"`
}

// Notable reports whether the operator needs to READ this entry rather than
// merely count it. The console renders the notable ones by default and hides
// the rest behind a toggle — but the plan itself always carries all of them,
// because the plan is what the commit executes.
func (it ItemPlan) Notable() bool {
	return it.Result != ResultAdded && it.Result != ResultUnchanged
}

// CollectionPlan is the per-collection roll-up the console renders as one row.
type CollectionPlan struct {
	Collection string `json:"collection"`
	ZH         string `json:"zh"`
	Group      string `json:"group"`
	Policy     Policy `json:"policy"`
	Added      int    `json:"added"`
	Unchanged  int    `json:"unchanged"`
	Written    int    `json:"written"`
	Skipped    int    `json:"skipped"`
	Blocked    int    `json:"blocked"`
	// Items is the COMPLETE per-document verdict list for this collection: every
	// entry the archive carries in it, sorted by id, INCLUDING the boring
	// ResultAdded and ResultUnchanged ones.
	//
	// IT IS COMPLETE BECAUSE IT IS THE CONTRACT. Apply derives nothing of its
	// own; it resolves these entries back onto the archive (Plan.Executable) and
	// performs exactly the verdicts recorded here. The first draft of this file
	// listed only the "interesting" entries and let Apply default everything else
	// to ResultAdded — so a re-import of an already-imported archive promised
	// plan.Writes=0 and then re-wrote every single document. Do not shrink this
	// list again to save payload; filter it in the UI instead (the console does).
	Items []ItemPlan `json:"items,omitempty"`
}

// IdentityCollision is the single most dangerous case in a migration, and it
// gets its own first-class report section rather than hiding inside a count.
//
// A fresh host almost always has ONE account already: the owner registered it
// so that somebody could log into the console at all. Its username/email are
// almost certainly the same person's as on the old host. Treating the
// by-username ref as an ordinary "skipped" would write the OLD account document
// while leaving the username pointing at the NEW empty account — a host where
// the password is correct and the account behind it is empty, with no message
// anywhere.
type IdentityCollision struct {
	Collection string `json:"collection"`
	Key        string `json:"key"`
	TargetID   string `json:"targetAccountId"`
	ArchiveID  string `json:"archiveAccountId"`
	Resolved   bool   `json:"resolved"`
}

// Plan is the dry run. Computing it writes nothing.
type Plan struct {
	Collections []CollectionPlan    `json:"collections"`
	Collisions  []IdentityCollision `json:"collisions"`
	Notes       []string            `json:"notes"`
	Warnings    []string            `json:"warnings"`
	// Writes is how many documents commit would write (added + overwritten).
	// ApplyResult.Written MUST come out equal to it — that equality is the whole
	// promise of the dry run, and TestReImportWritesNothingItDidNotPromise pins
	// it on the case that used to break it.
	Writes int `json:"writes"`
	// Unchanged, Skipped and BlockedEntries complete the account: together with
	// Writes they add up to every entry the commit will consider. Without them a
	// reader cannot tell "0 writes because there is nothing to do" from "0 writes
	// because the archive is empty".
	Unchanged      int `json:"unchanged"`
	Skipped        int `json:"skipped"`
	BlockedEntries int `json:"blockedEntries"`
	// Blocked is true when anything refuses. A blocked plan cannot be committed.
	Blocked bool `json:"blocked"`
	// TargetPopulated is true when the target already holds accounts — i.e.
	// this is the SECONDARY, dangerous "overwrite an existing host" scenario
	// rather than the primary "fresh host" one.
	TargetPopulated bool `json:"targetPopulated"`
	// Digest is sha256 over the canonical plan. Commit re-computes the plan and
	// refuses (409) if it no longer matches what the operator approved.
	Digest string `json:"digest"`
}

func (p *Plan) note(format string, args ...any) {
	p.Notes = append(p.Notes, fmt.Sprintf(format, args...))
}
func (p *Plan) warn(format string, args ...any) {
	p.Warnings = append(p.Warnings, fmt.Sprintf(format, args...))
}

// Target is the host being imported INTO.
type Target struct {
	Store *jsonstore.Store
	// ReplayDir is where opaque replay bytes land.
	ReplayDir string
}

// NewTarget opens the destination data dir.
func NewTarget(dataDir, replayDir string) (*Target, error) {
	store, err := jsonstore.New(dataDir)
	if err != nil {
		return nil, err
	}
	return &Target{Store: store, ReplayDir: ReplayDirFor(store.Root(), replayDir)}, nil
}

// BuildPlan computes what an import WOULD do. It never writes.
//
// It is also the pre-flight that makes "never a partial write" achievable: every
// name is resolved through the REAL writer's rules (jsonstore's resolve, via
// Store.Path) here, so a name the store would refuse is discovered before the
// first Put rather than halfway through the account collection.
func BuildPlan(a *Archive, t *Target, opts PlanOptions) (*Plan, error) {
	if a == nil {
		return nil, errors.New("platformarchive: no archive")
	}
	groups := map[string]bool{GroupCore: true}
	if len(opts.Groups) == 0 {
		for _, g := range a.Manifest.GroupsPresent() {
			groups[g] = true
		}
	} else {
		norm, err := NormalizeGroups(opts.Groups)
		if err != nil {
			return nil, err
		}
		for _, g := range norm {
			groups[g] = true
		}
	}

	p := &Plan{}
	existingAccounts, err := t.Store.Scan(account.ColAccounts)
	if err != nil {
		return nil, err
	}
	p.TargetPopulated = len(existingAccounts) > 0
	if p.TargetPopulated {
		p.warn("這台主機上已經有 %d 個帳號。這不是「換主機」的情境，是「覆蓋現有主機」—— "+
			"預設不覆蓋任何既有文件。", len(existingAccounts))
	}

	// Replay writability is probed HERE, not halfway through the copy: the
	// directory belongs to the game-server and compose bind-mounts it
	// separately, and a silent EACCES on that path has bitten this repo before.
	replayWritable := true
	if _, ok := a.ByCollection[ColReplays]; ok && groups[GroupReplays] {
		if err := probeWritable(t.ReplayDir); err != nil {
			replayWritable = false
			p.warn("對戰回放目錄 %s 不可寫（%v）—— 這是 game-server 的目錄。"+
				"整組回放已擋下，請改用 scp 搬運。", t.ReplayDir, err)
		}
	}

	for _, col := range a.Collections() {
		rule := RuleFor(col)
		if rule == nil {
			return nil, reject("集合 %q 不在允許清單內", col)
		}
		if !groups[rule.Group] {
			continue
		}
		cp := CollectionPlan{Collection: col, ZH: rule.ZH, Group: rule.Group, Policy: rule.Policy}
		for _, e := range a.ByCollection[col] {
			item, err := planEntry(a, t, rule, e, opts, replayWritable)
			if err != nil {
				return nil, err
			}
			switch item.Result {
			case ResultAdded:
				cp.Added++
				p.Writes++
			case ResultWritten:
				cp.Written++
				p.Writes++
			case ResultUnchanged:
				cp.Unchanged++
				p.Unchanged++
			case ResultSkipped:
				cp.Skipped++
				p.Skipped++
			case ResultBlocked:
				cp.Blocked++
				p.BlockedEntries++
				p.Blocked = true
			default:
				return nil, fmt.Errorf("platformarchive: 內部錯誤：%s/%s 得到未知的試算結果 %q",
					col, e.ID, item.Result)
			}
			// EVERY entry is recorded, verdict and all. See CollectionPlan.Items.
			cp.Items = append(cp.Items, item)
		}
		p.Collections = append(p.Collections, cp)
	}

	if err := planIdentity(a, t, opts, p); err != nil {
		return nil, err
	}

	p.note("封存只做新增與（你勾選時的）覆蓋，永遠不刪除任何東西。來源沒有的東西不代表目標該失去它。")
	if !a.ChecksumVerified {
		p.warn("這包沒有 checksum，完整性未經驗證。")
	}
	digest, err := planDigest(p)
	if err != nil {
		return nil, err
	}
	p.Digest = digest
	return p, nil
}

// PlannedWrite pairs ONE recorded verdict with the archive member it names.
type PlannedWrite struct {
	Collection string
	Rule       *Rule
	Entry      Entry
	// Verdict is the plan's verdict, verbatim. Apply performs it; it never
	// second-guesses it and it never invents one for an entry the plan omitted.
	Verdict string
}

// Executable resolves the plan back onto the archive it was computed from, in
// write order (accounts before the refs that resolve to them).
//
// THIS IS THE ONLY WAY APPLY LEARNS WHAT TO DO. There is exactly one function in
// this package that decides a verdict — planEntry — and exactly one path from it
// to a write, through the plan. That is what makes "the dry run is the contract"
// a structural property instead of a promise two code paths have to keep
// separately (they did not: an entry missing from the plan used to be defaulted
// to ResultAdded and re-written).
//
// Any disagreement between the plan's entry set and the archive's is a HARD
// ERROR. Silently skipping an unplanned entry and silently writing one are both
// ways for the commit to differ from what the operator approved, and this
// function refuses both. It writes nothing, so a refusal here is a zero-write.
func (p *Plan) Executable(a *Archive) ([]PlannedWrite, error) {
	if a == nil {
		return nil, errors.New("platformarchive: no archive")
	}
	cols := make([]string, 0, len(p.Collections))
	byCol := make(map[string]*CollectionPlan, len(p.Collections))
	for i := range p.Collections {
		col := p.Collections[i].Collection
		if _, dup := byCol[col]; dup {
			return nil, fmt.Errorf("platformarchive: 內部錯誤：試算裡有兩筆 %q", col)
		}
		cols = append(cols, col)
		byCol[col] = &p.Collections[i]
	}
	out := make([]PlannedWrite, 0, p.Writes+p.Unchanged+p.Skipped)
	for _, col := range writeOrder(cols) {
		cp := byCol[col]
		rule := RuleFor(col)
		if rule == nil {
			return nil, reject("集合 %q 不在允許清單內", col)
		}
		entries := make(map[string]Entry, len(a.ByCollection[col]))
		for _, e := range a.ByCollection[col] {
			entries[e.ID] = e
		}
		if len(cp.Items) != len(entries) {
			return nil, fmt.Errorf("platformarchive: 試算與封存不一致 —— 集合 %q 的試算有 %d 筆、"+
				"封存有 %d 筆。請重新試算後再匯入（一個位元組都沒有寫入）",
				col, len(cp.Items), len(entries))
		}
		for _, it := range cp.Items {
			e, ok := entries[it.ID]
			if !ok {
				return nil, fmt.Errorf("platformarchive: 試算列出了 %s/%s，但封存裡沒有這個項目。"+
					"請重新試算後再匯入（一個位元組都沒有寫入）", col, it.ID)
			}
			out = append(out, PlannedWrite{Collection: col, Rule: rule, Entry: e, Verdict: it.Result})
		}
	}
	return out, nil
}

// VerdictMap is the plan as collection → id → result. It is what the commit's
// own per-entry account (ApplyResult.Results) is compared against.
func (p *Plan) VerdictMap() map[string]map[string]string {
	out := make(map[string]map[string]string, len(p.Collections))
	for _, c := range p.Collections {
		m := make(map[string]string, len(c.Items))
		for _, it := range c.Items {
			m[it.ID] = it.Result
		}
		out[c.Collection] = m
	}
	return out
}

// planEntry is the per-document policy table from the design, in code.
func planEntry(a *Archive, t *Target, rule *Rule, e Entry, opts PlanOptions, replayWritable bool) (ItemPlan, error) {
	item := ItemPlan{ID: e.ID}

	if rule.Kind == KindOpaque {
		if !replayWritable {
			item.Result, item.Detail = ResultBlocked, "回放目錄不可寫"
			return item, nil
		}
		dst := filepath.Join(t.ReplayDir, e.ID)
		st, err := os.Stat(dst)
		switch {
		case os.IsNotExist(err):
			item.Result = ResultAdded
		case err != nil:
			return item, err
		case st.Size() == e.Declared:
			item.Result, item.Detail = ResultUnchanged, "目標已有同樣大小的回放"
		default:
			item.Result, item.Detail = ResultSkipped, "目標已有同名但不同大小的回放，不覆寫"
		}
		return item, nil
	}

	// THE AUTHORITATIVE NAME CHECK. Store.Path runs jsonstore's own resolve():
	// collection segments, id shape, `..`, absolute paths and root containment,
	// using the SAME rules the writer will use. Do not re-implement it more
	// strictly here — see entryIDRe.
	if _, err := t.Store.Path(e.Collection, e.ID); err != nil {
		return item, reject("項目 %q 無法解析成目標路徑：%v", e.Name, err)
	}

	if rule.Kind == KindJSONL {
		// APPEND-ONLY: an existing target file is ALWAYS kept. Never overwrite
		// (that forges the target's own audit trail — including the very line
		// recording this import) and never merge (merging means REWRITING an
		// append-only file, which is the one thing it must never suffer).
		exists, err := jsonlExists(t.Store, e.Collection, e.ID)
		if err != nil {
			return item, err
		}
		if !exists {
			item.Result = ResultAdded
			return item, nil
		}
		same, err := sameJSONLFile(t.Store, e.Collection, e.ID, a, e)
		if err != nil {
			return item, err
		}
		if same {
			item.Result = ResultUnchanged
			return item, nil
		}
		item.Result = ResultSkipped
		item.Detail = "目標已有這個 append-only 檔案：一律略過，永不覆寫也永不合併（來源那份仍在封存裡）"
		return item, nil
	}

	// KindDoc.
	archiveRaw, err := a.ReadEntry(e)
	if err != nil {
		return item, err
	}
	var targetRaw json.RawMessage
	err = t.Store.Get(e.Collection, e.ID, &targetRaw)
	if errors.Is(err, jsonstore.ErrNotFound) {
		item.Result = ResultAdded
		return item, nil
	}
	if err != nil {
		return item, err
	}
	if sameDoc(targetRaw, archiveRaw) {
		item.Result = ResultUnchanged
		return item, nil
	}
	if rule.Policy == PolicySingleton {
		// Newer-target protection, the same rule opstate/restore.go applies to
		// the whitelist and the config docs: a routine re-run of the migration
		// must not silently undo an evening of editing on the target.
		targetAt, archiveAt := rawUpdatedAt(targetRaw), rawUpdatedAt(archiveRaw)
		if targetAt.After(archiveAt) && !opts.AllowOverwrite {
			item.Result = ResultBlocked
			item.Detail = fmt.Sprintf(
				"目標的這份文件在 %s 被改過，比封存匯出時間（%s）還新 —— 不覆寫。"+
					"請從目標主機先匯出一份，或勾選「允許覆蓋既有資料」。",
				targetAt.Format(time.RFC3339), archiveAt.Format(time.RFC3339))
			return item, nil
		}
	}
	// The identity refs are the ONE place "adopt-archive" acts: the operator
	// explicitly chose to let the archive's account own this username/email.
	// Without this branch adopt-archive would be a no-op that unblocks the
	// import and then leaves the ref pointing at the target's account — the
	// exact "password correct, wrong account" outcome the option exists to fix.
	if isIdentityRef(e.Collection) && opts.ResolveCollisions == ResolveAdoptArchive {
		item.Result = ResultWritten
		item.Detail = "以封存為準：這個使用者名稱／email 之後解析到封存裡的帳號"
		return item, nil
	}
	if !opts.AllowOverwrite {
		item.Result = ResultSkipped
		item.Detail = "目標已有一份不同的文件，預設保留目標的版本"
		return item, nil
	}
	item.Result = ResultWritten
	item.Detail = "以封存的版本覆蓋目標既有的文件"
	return item, nil
}

// planIdentity is the account-identity check, run as its own first-class pass.
func planIdentity(a *Archive, t *Target, opts PlanOptions, p *Plan) error {
	adopt := opts.ResolveCollisions == ResolveAdoptArchive
	for _, col := range []string{account.ColByUsername, account.ColByEmail} {
		for _, e := range a.ByCollection[col] {
			archiveID, err := refAccountID(a, e)
			if err != nil {
				return err
			}
			var targetRef struct {
				ID string `json:"id"`
			}
			err = t.Store.Get(col, e.ID, &targetRef)
			if errors.Is(err, jsonstore.ErrNotFound) {
				continue
			}
			if err != nil {
				return err
			}
			if targetRef.ID == archiveID {
				continue
			}
			p.Collisions = append(p.Collisions, IdentityCollision{
				Collection: col, Key: e.ID, TargetID: targetRef.ID,
				ArchiveID: archiveID, Resolved: adopt,
			})
		}
	}
	if len(p.Collisions) == 0 {
		return nil
	}
	if !adopt {
		p.Blocked = true
		p.warn("有 %d 個使用者名稱／email 在這台主機上已經被別的帳號佔用。"+
			"若不處理，匯入會做出「密碼正確、但登進去是空帳號」的結果 —— 所以預設整包拒絕。",
			len(p.Collisions))
		return nil
	}
	p.warn("已選擇「以封存為準」：%d 個使用者名稱／email 之後會解析到封存裡的帳號。"+
		"被擠掉的帳號不會被刪除，只是不再能用那個名稱登入 —— 你會需要用舊主機的帳號密碼重新登入本後台。",
		len(p.Collisions))
	return nil
}

// isIdentityRef reports whether a collection holds login-resolution refs.
func isIdentityRef(col string) bool {
	return col == account.ColByUsername || col == account.ColByEmail
}

func refAccountID(a *Archive, e Entry) (string, error) {
	raw, err := a.ReadEntry(e)
	if err != nil {
		return "", err
	}
	var rf struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(raw, &rf); err != nil {
		return "", reject("項目 %q 不是有效的帳號索引文件：%v", e.Name, err)
	}
	if rf.ID == "" {
		return "", reject("項目 %q 的帳號索引沒有 id", e.Name)
	}
	return rf.ID, nil
}

// sameDoc compares two documents on MEANING, not bytes.
//
// Bytes cannot be used: jsonstore.Put re-indents with MarshalIndent, so a
// document that round-tripped through an import never matches its archive
// bytes. Unlike opstate's sameConfigDoc this does NOT strip updatedAt — account
// documents have no server-rewritten timestamp, and stripping it from the
// config docs would make a genuine re-save look identical.
func sameDoc(a, b json.RawMessage) bool {
	var ma, mb any
	if json.Unmarshal(a, &ma) != nil || json.Unmarshal(b, &mb) != nil {
		return false
	}
	return reflect.DeepEqual(ma, mb)
}

func rawUpdatedAt(raw json.RawMessage) time.Time {
	var probe struct {
		UpdatedAt time.Time `json:"updatedAt"`
	}
	if json.Unmarshal(raw, &probe) != nil {
		return time.Time{}
	}
	return probe.UpdatedAt
}

// jsonlPath derives the .jsonl path for a collection/id pair. It validates
// through Store.Path (the .json sibling) first, so the same resolve() rules
// apply — jsonstore exposes no ext-parameterised resolver.
func jsonlPath(store *jsonstore.Store, col, id string) (string, error) {
	p, err := store.Path(col, id)
	if err != nil {
		return "", err
	}
	return p + "l", nil // "<...>.json" + "l"
}

func jsonlExists(store *jsonstore.Store, col, id string) (bool, error) {
	p, err := jsonlPath(store, col, id)
	if err != nil {
		return false, err
	}
	_, err = os.Stat(p)
	if err == nil {
		return true, nil
	}
	if os.IsNotExist(err) {
		return false, nil
	}
	return false, err
}

func sameJSONLFile(store *jsonstore.Store, col, id string, a *Archive, e Entry) (bool, error) {
	p, err := jsonlPath(store, col, id)
	if err != nil {
		return false, err
	}
	st, err := os.Stat(p)
	if err != nil {
		return false, err
	}
	if st.Size() != e.Declared {
		return false, nil
	}
	have, err := os.ReadFile(p) // #nosec G304 -- path came from Store.Path (jsonstore resolve).
	if err != nil {
		return false, err
	}
	want, err := a.ReadEntry(e)
	if err != nil {
		return false, err
	}
	return string(have) == string(want), nil
}

// probeWritable creates and removes a temp file, because "the directory exists"
// and "the platform user may write into it" are different questions and the
// second one is the one that has failed here before.
func probeWritable(dir string) error {
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return err
	}
	f, err := os.CreateTemp(dir, ".archive-probe-*")
	if err != nil {
		return err
	}
	name := f.Name()
	_ = f.Close()
	return os.Remove(name)
}

// planDigest is sha256 over the plan's canonical JSON with the digest field
// emptied. Commit compares it and refuses on any difference: what the operator
// approved and what gets written are then the same thing by construction.
func planDigest(p *Plan) (string, error) {
	clone := *p
	clone.Digest = ""
	// Sort so map iteration order can never move the digest.
	sort.Slice(clone.Collections, func(i, j int) bool {
		return clone.Collections[i].Collection < clone.Collections[j].Collection
	})
	sort.Slice(clone.Collisions, func(i, j int) bool {
		if clone.Collisions[i].Collection != clone.Collisions[j].Collection {
			return clone.Collisions[i].Collection < clone.Collisions[j].Collection
		}
		return clone.Collisions[i].Key < clone.Collisions[j].Key
	})
	data, err := json.Marshal(&clone)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:]), nil
}

// BlockedLines renders every refusal for the operator.
func (p *Plan) BlockedLines() []string {
	out := []string{}
	for _, c := range p.Collections {
		for _, it := range c.Items {
			if it.Result == ResultBlocked {
				out = append(out, fmt.Sprintf("%s/%s: %s", c.Collection, it.ID, it.Detail))
			}
		}
	}
	for _, c := range p.Collisions {
		if !c.Resolved {
			out = append(out, fmt.Sprintf("%s/%s: 已被帳號 %s 佔用，封存要指向 %s",
				c.Collection, c.Key, c.TargetID, c.ArchiveID))
		}
	}
	return out
}
