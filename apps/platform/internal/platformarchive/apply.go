package platformarchive

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/google/renameio/v2"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/data/jsonstore"
)

// ErrPlanChanged is returned when the plan recomputed at commit time differs
// from the one the operator approved.
var ErrPlanChanged = errors.New("platformarchive: the target changed since the dry run")

// ErrBlocked is returned when a plan contains any refusal.
var ErrBlocked = errors.New("platformarchive: the plan is blocked")

// ApplyOptions parameterise Apply.
type ApplyOptions struct {
	PlanOptions
	// ExpectDigest, when non-empty, must equal the digest of the plan computed
	// against the target RIGHT NOW. This is the mechanism that makes "what you
	// approved is what gets written" true rather than merely intended.
	ExpectDigest string
	// ContentDir + PlatformVersion stamp the automatic backup.
	ContentDir      string
	PlatformVersion string
	// SkipBackup is for tests ONLY. The service and the CLI never set it: an
	// import that did not back up first is the one failure mode with no undo.
	SkipBackup bool
	Now        func() time.Time
	// Reindex, when non-nil, rebuilds the Redis hot layer after the writes.
	// See reindex.go for why this is NOT boot.Rebuild.
	Reindex func(ctx context.Context, res *ApplyResult) error
	// AuditBegin/AuditEnd are called around the first write. AuditBegin MUST
	// land BEFORE anything is written, so a process that dies mid-import still
	// leaves "somebody started this" in the trail.
	AuditBegin func(plan *Plan, backup *BackupInfo)
	AuditEnd   func(res *ApplyResult, err error)
}

// ApplyResult is the full account of what an import did.
type ApplyResult struct {
	Plan   *Plan       `json:"plan"`
	Backup *BackupInfo `json:"backup,omitempty"`
	// Written counts documents actually written (added + overwritten). It MUST
	// equal Plan.Writes, and Added/Unchanged/Skipped must equal the plan's own
	// counts entry for entry: the dry run is the contract, not an estimate.
	Written int `json:"written"`
	Added   int `json:"added"`
	// Unchanged and Skipped count the entries deliberately left alone, so the
	// result is a complete account of every entry the plan considered rather
	// than only of the ones that moved.
	Unchanged int `json:"unchanged"`
	Skipped   int `json:"skipped"`
	// Results is the per-entry account of what the commit ACTUALLY did,
	// collection → id → result. For a write it is OBSERVED (did the target hold
	// this document immediately before the Put?), not copied from the plan, so
	// comparing it with Plan.VerdictMap() is a real check rather than a
	// restatement. Not serialised: Plan travels inside this struct already and
	// carries the same listing.
	Results map[string]map[string]string `json:"-"`
	// AccountIDs are the accounts whose documents were written — the input to
	// the Redis re-index.
	AccountIDs []string `json:"accountIds,omitempty"`
	// DisplacedRefs are identity refs that were repointed under adopt-archive:
	// the OLD mapping must be DELeted from Redis before the new one is SET.
	DisplacedRefs []DisplacedRef `json:"displacedRefs,omitempty"`
	Duration      time.Duration  `json:"duration"`
	Notes         []string       `json:"notes"`
	Warnings      []string       `json:"warnings"`
}

// DisplacedRef records one login key that changed owner.
type DisplacedRef struct {
	Collection string `json:"collection"`
	Key        string `json:"key"`
	OldID      string `json:"oldAccountId"`
	NewID      string `json:"newAccountId"`
}

func (r *ApplyResult) note(format string, args ...any) {
	r.Notes = append(r.Notes, fmt.Sprintf(format, args...))
}

func (r *ApplyResult) warn(format string, args ...any) {
	r.Warnings = append(r.Warnings, fmt.Sprintf(format, args...))
}

// record files one entry's ACTUAL outcome into Results.
func (r *ApplyResult) record(col, id, result string) {
	if r.Results == nil {
		r.Results = map[string]map[string]string{}
	}
	m := r.Results[col]
	if m == nil {
		m = map[string]string{}
		r.Results[col] = m
	}
	m[id] = result
}

// targetHas reports whether the target already holds this entry RIGHT NOW,
// using the same three storage shapes writeEntry writes through.
func targetHas(t *Target, rule *Rule, e Entry) (bool, error) {
	switch rule.Kind {
	case KindDoc:
		return t.Store.Exists(e.Collection, e.ID)
	case KindJSONL:
		return jsonlExists(t.Store, e.Collection, e.ID)
	default:
		_, err := os.Stat(filepath.Join(t.ReplayDir, e.ID))
		if err == nil {
			return true, nil
		}
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
}

// writeOrder is the order collections are written in, and it is not cosmetic:
// the account documents must exist before the refs that resolve to them, or a
// crash between the two leaves a username pointing at nothing.
func writeOrder(cols []string) []string {
	rank := func(c string) int {
		switch {
		case c == account.ColAccounts:
			return 0
		case c == account.ColByUsername:
			return 1
		case c == account.ColByEmail:
			return 2
		case c == ColReplays:
			return 4
		default:
			return 3
		}
	}
	out := append([]string{}, cols...)
	sort.SliceStable(out, func(i, j int) bool {
		if rank(out[i]) != rank(out[j]) {
			return rank(out[i]) < rank(out[j])
		}
		return out[i] < out[j]
	})
	return out
}

// Apply imports an archive into a target.
//
// THE SEQUENCE IS THE WHOLE DESIGN. Steps 1–5 write NOTHING and any failure in
// them is a guaranteed zero-write; only step 7 touches the target:
//
//  1. re-verify the archive (already done by Open/OpenReaderAt);
//  2. recompute the plan against the target as it is NOW;
//  3. compare it to the digest the operator approved → 409 on any difference;
//  4. refuse if anything is Blocked;
//  5. resolve the plan onto the archive — this fixes the ENTIRE write list, and
//     its verdicts, before anything else happens;
//  6. take the automatic backup, refusing on a failure or on low disk;
//  7. write the audit "commit_begin" line;
//  8. write, accounts first, then the refs, then everything else;
//  9. rebuild the Redis hot layer WITHOUT boot.Rebuild (see reindex.go).
func Apply(ctx context.Context, a *Archive, t *Target, opts ApplyOptions) (*ApplyResult, error) {
	now := opts.Now
	if now == nil {
		now = time.Now
	}
	started := now()

	plan, err := BuildPlan(a, t, opts.PlanOptions)
	if err != nil {
		return nil, err
	}
	if opts.ExpectDigest != "" && opts.ExpectDigest != plan.Digest {
		return nil, fmt.Errorf("%w: 你預覽之後目標主機的資料變了，請重新試算一次再匯入 "+
			"(approved %s, now %s)", ErrPlanChanged, opts.ExpectDigest, plan.Digest)
	}
	if plan.Blocked {
		return nil, fmt.Errorf("%w: %v", ErrBlocked, plan.BlockedLines())
	}

	// THE WRITE LIST IS THE PLAN. Resolved here, before the backup, so that a
	// plan that does not line up with the archive is a guaranteed zero-write.
	planned, err := plan.Executable(a)
	if err != nil {
		return nil, err
	}

	res := &ApplyResult{Plan: plan, Results: map[string]map[string]string{}}

	if !opts.SkipBackup {
		groups := map[string]bool{}
		for _, c := range plan.Collections {
			groups[c.Group] = true
		}
		list := []string{}
		for _, g := range AllGroups {
			if groups[g] {
				list = append(list, g)
			}
		}
		backup, err := BackupTarget(BackupOptions{
			DataDir:         t.Store.Root(),
			ContentDir:      opts.ContentDir,
			ReplayDir:       t.ReplayDir,
			Groups:          list,
			PlatformVersion: opts.PlatformVersion,
			Reason:          backupReason(a),
			Now:             now,
		})
		if err != nil {
			return nil, err
		}
		res.Backup = backup
		if backup.Empty {
			res.note("匯入前備份完成（這台主機原本是空的，備份因此幾乎是空檔）：%s", backup.Path)
		} else {
			res.note("匯入前備份完成：%s（%d 個檔案 / %d bytes）", backup.Path, backup.Entries, backup.Bytes)
		}
	}

	if opts.AuditBegin != nil {
		opts.AuditBegin(plan, res.Backup)
	}

	accountIDs := map[string]bool{}

	// ONE PASS OVER THE PLAN. Nothing here decides anything: every entry the
	// commit considers arrived from Plan.Executable carrying the verdict the dry
	// run showed the operator, and the only thing left to choose is which of the
	// five verdicts to perform.
	for _, pw := range planned {
		e := pw.Entry
		switch pw.Verdict {
		case ResultAdded, ResultWritten:
			// fall through to the write below
		case ResultUnchanged:
			res.Unchanged++
			res.record(pw.Collection, e.ID, ResultUnchanged)
			continue
		case ResultSkipped:
			res.Skipped++
			res.record(pw.Collection, e.ID, ResultSkipped)
			continue
		case ResultBlocked:
			// Unreachable: a blocked plan is refused above, before the backup.
			// Kept explicit so a future verdict cannot fall into the default.
			err := fmt.Errorf("%w: %s/%s", ErrBlocked, pw.Collection, e.ID)
			applyFailed(opts, res, err)
			return res, err
		default:
			err := fmt.Errorf("platformarchive: 未知的試算結果 %q（%s/%s）—— 拒絕匯入",
				pw.Verdict, pw.Collection, e.ID)
			applyFailed(opts, res, err)
			return res, err
		}

		// OBSERVED, not assumed: whether this is an add or an overwrite is read
		// off the target immediately before the write, so ApplyResult.Results is
		// an independent account that can DISAGREE with the plan rather than a
		// restatement of it.
		existed, err := targetHas(t, pw.Rule, e)
		if err != nil {
			applyFailed(opts, res, err)
			return res, err
		}
		if err := writeEntry(a, t, pw.Rule, e); err != nil {
			res.warn("寫入 %s 失敗：%v", e.Name, err)
			applyFailed(opts, res, err)
			return res, fmt.Errorf("platformarchive: 寫到一半失敗（%s）—— 備份在 %s：%w",
				e.Name, backupPathOf(res), err)
		}
		observed := ResultAdded
		if existed {
			observed = ResultWritten
		}
		if observed != pw.Verdict {
			// The target moved between the plan and this write. Nothing is undone
			// (that would be a second, unplanned write), but it is said out loud:
			// a silent difference here is exactly the class of bug this rework
			// exists to kill.
			res.warn("%s/%s：試算說「%s」，實際寫入時目標的狀態是「%s」—— 目標主機在匯入途中被改動了。",
				pw.Collection, e.ID, pw.Verdict, observed)
		}
		res.record(pw.Collection, e.ID, observed)
		res.Written++
		if observed == ResultAdded {
			res.Added++
		}
		if pw.Collection == account.ColAccounts {
			accountIDs[e.ID] = true
		}
		if isIdentityRef(pw.Collection) && pw.Verdict == ResultWritten {
			newID, err := refAccountID(a, e)
			if err != nil {
				return res, err
			}
			old := ""
			for _, c := range plan.Collisions {
				if c.Collection == pw.Collection && c.Key == e.ID {
					old = c.TargetID
				}
			}
			res.DisplacedRefs = append(res.DisplacedRefs, DisplacedRef{
				Collection: pw.Collection, Key: e.ID, OldID: old, NewID: newID,
			})
		}
	}

	for id := range accountIDs {
		res.AccountIDs = append(res.AccountIDs, id)
	}
	sort.Strings(res.AccountIDs)

	if opts.Reindex != nil {
		if err := opts.Reindex(ctx, res); err != nil {
			res.warn("Redis 熱層重建失敗：%v —— 請重啟平台。帳號文件已經寫好了。", err)
		} else {
			res.note("使用者名稱／email 索引與排行榜已即時重建，帳號現在就能登入。")
		}
	}

	res.note("建議接著做（保險，非必要）：docker compose … restart platform")
	res.note("不在這包裡、需要手動處理的：AI 供應商金鑰、Slack webhook（請到對應頁面重新輸入）；" +
		"素材包 blizzard-overlay 隨部署映像走。")
	res.note("請現在把兩台主機上的 ZIP 都刪掉。")
	res.Duration = now().Sub(started)
	if opts.AuditEnd != nil {
		opts.AuditEnd(res, nil)
	}
	return res, nil
}

// backupReason names the import a backup was taken before, from the archive's
// own manifest. Six months later the operator is looking at a directory of
// timestamps; this is the sentence that tells him which one is the state he
// wants back.
func backupReason(a *Archive) string {
	if a == nil || a.Manifest == nil {
		return "匯入前的自動備份"
	}
	host := a.Manifest.Source.Host
	if host == "" {
		host = "（未知主機）"
	}
	return fmt.Sprintf("匯入「%s」於 %s 匯出的封存（%d 個檔案）之前",
		host, a.Manifest.ExportedAt.UTC().Format("2006-01-02 15:04 UTC"), a.Manifest.Totals.Entries)
}

func applyFailed(opts ApplyOptions, res *ApplyResult, err error) {
	if opts.AuditEnd != nil {
		opts.AuditEnd(res, err)
	}
}

func backupPathOf(res *ApplyResult) string {
	if res.Backup == nil {
		return "(未建立)"
	}
	return res.Backup.Path
}

// writeEntry writes one archive member. EVERY path here goes through
// jsonstore.Put (0640 files / 0750 dirs, and _index.json rebuilt from what was
// actually written) or renameio.WithStaticPermissions(0640). The archive's own
// mode is NEVER applied.
func writeEntry(a *Archive, t *Target, rule *Rule, e Entry) error {
	data, err := a.ReadEntry(e)
	if err != nil {
		return err
	}
	switch rule.Kind {
	case KindDoc:
		return t.Store.Put(e.Collection, e.ID, json.RawMessage(data))
	case KindJSONL:
		p, err := jsonlPath(t.Store, e.Collection, e.ID)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(p), 0o750); err != nil {
			return err
		}
		return writeStatic(p, data)
	default:
		if err := os.MkdirAll(t.ReplayDir, 0o750); err != nil {
			return err
		}
		return writeStatic(filepath.Join(t.ReplayDir, e.ID), data)
	}
}

// writeStatic is jsonstore's writeAtomic, for the two file kinds jsonstore does
// not own (whole-file .jsonl and opaque replay blobs).
//
// renameio.WriteFile is deliberately NOT used: it always applies
// WithExistingPermissions, which copies the mode off an existing target and
// silently overrides the mode argument — the exact trap jsonstore.writeAtomic
// documents. WithStaticPermissions is the option that actually enforces 0640.
func writeStatic(path string, data []byte) error {
	t, err := renameio.NewPendingFile(path, renameio.WithStaticPermissions(0o640))
	if err != nil {
		return err
	}
	defer func() { _ = t.Cleanup() }()
	if _, err := t.Write(data); err != nil {
		return err
	}
	return t.CloseAtomicallyReplace()
}

// AccountDocs decodes the account documents an import wrote, for the re-index.
func AccountDocs(t *Target, ids []string) ([]account.Account, error) {
	out := make([]account.Account, 0, len(ids))
	for _, id := range ids {
		var acc account.Account
		if err := t.Store.Get(account.ColAccounts, id, &acc); err != nil {
			if errors.Is(err, jsonstore.ErrNotFound) {
				continue
			}
			return nil, err
		}
		out = append(out, acc)
	}
	return out, nil
}
