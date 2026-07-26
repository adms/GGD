package platformarchive

import (
	"context"
	"io"
	"log/slog"
	"os"
	"time"

	"github.com/ggd/platform/internal/admin"
	"github.com/ggd/platform/internal/data/jsonstore"
)

// Audit action names. archive.commit_begin is written BEFORE the first write on
// purpose: if the process dies mid-import, the trail still shows that somebody
// started one. That is the WAL lesson bought at its cheapest price.
const (
	ActionExport       = "archive.export"
	ActionPreview      = "archive.preview"
	ActionStage        = "archive.stage"
	ActionPlan         = "archive.plan"
	ActionBackup       = "archive.backup"
	ActionCommitBegin  = "archive.commit_begin"
	ActionCommitEnd    = "archive.commit_end"
	ActionCommitFailed = "archive.commit_failed"
	ActionDiscard      = "archive.discard"
)

// Reauthenticator re-proves that the caller holds their own password.
// Implemented by *auth.Service (ReauthPassword); an interface so this package
// can be tested without a Redis-backed auth service.
type Reauthenticator interface {
	ReauthPassword(ctx context.Context, accountID, password, scope string) error
}

// ReauthScope is the rate-limit bucket for archive password re-confirmation,
// kept separate from password-change so the two budgets never interfere.
const ReauthScope = "archive-reauth"

// Deps is everything the service needs, injected by the composition root.
type Deps struct {
	Store      *jsonstore.Store
	DataDir    string
	ContentDir string
	// ReplayDir may be empty (defaults to <DataDir>/replays, or
	// GGD_ARCHIVE_REPLAY_DIR).
	ReplayDir string
	// PlatformVersion stamps exported archives (GGD_PLATFORM_VERSION).
	PlatformVersion string
	Auth            Reauthenticator
	Reindex         *Reindexer
	Now             func() time.Time
}

// Service is the admin-facing archive surface. Every validation lives HERE, not
// in the handlers, so the CLI and the HTTP path cannot drift apart.
type Service struct {
	deps Deps
}

// New wires a service and sweeps any expired staging slot.
func New(d Deps) *Service {
	if d.Now == nil {
		d.Now = time.Now
	}
	s := &Service{deps: d}
	if err := SweepStaging(d.DataDir, d.Now()); err != nil {
		slog.Warn("platformarchive: staging sweep failed at boot", "err", err)
	}
	return s
}

func (s *Service) now() time.Time { return s.deps.Now().UTC() }

// audit appends one line to the SHARED admin audit collection. Best-effort,
// exactly like curation.Audit: a failed audit write never fails the operation
// that already happened.
func (s *Service) audit(actorID, action, target string, detail map[string]any) {
	entry := admin.AuditEntry{
		AdminID: actorID, Action: action, TargetID: target, Detail: detail, TS: s.now(),
	}
	if err := s.deps.Store.AppendLine(admin.ColAudit, entry.TS.Format("2006-01-02"), entry); err != nil {
		slog.Warn("platformarchive: audit append failed", "action", action, "err", err)
	}
}

func (s *Service) exportOptions(groups []string) ExportOptions {
	return ExportOptions{
		DataDir:         s.deps.DataDir,
		ContentDir:      s.deps.ContentDir,
		ReplayDir:       s.deps.ReplayDir,
		Groups:          groups,
		PlatformVersion: s.deps.PlatformVersion,
		Now:             s.deps.Now,
	}
}

// Preview sizes each group. Read-only.
func (s *Service) Preview() (*Preview, error) {
	return BuildPreview(s.exportOptions(nil))
}

// Hostname is the exporting machine's name, used in the download file name.
func (s *Service) Hostname() string {
	h, err := os.Hostname()
	if err != nil || h == "" {
		return "ggd"
	}
	return h
}

// Export streams an archive to w after re-confirming the caller's password.
//
// onReady runs exactly once, AFTER the password check and BEFORE the first
// byte. The HTTP handler uses it to write the download headers, so a wrong
// password can still come back as a JSON 401 rather than as a 200 attachment
// containing an error message.
func (s *Service) Export(ctx context.Context, actorID, password string, groups []string, w io.Writer, onReady func()) (*ExportReport, error) {
	if err := s.deps.Auth.ReauthPassword(ctx, actorID, password, ReauthScope); err != nil {
		return nil, err
	}
	if onReady != nil {
		onReady()
	}
	rep, err := Export(w, s.exportOptions(groups))
	if err != nil {
		return nil, err
	}
	s.audit(actorID, ActionExport, "platform-archive", map[string]any{
		"groups":  rep.Groups,
		"entries": rep.Entries,
		"bytes":   rep.Bytes,
		"collections": func() []string {
			out := []string{}
			for _, c := range rep.Collections {
				out = append(out, c.Name)
			}
			return out
		}(),
	})
	return rep, nil
}

// StageResult is what stage returns to the console.
type StageResult struct {
	Stage    *Stage    `json:"stage"`
	Manifest *Manifest `json:"manifest"`
	Warnings []string  `json:"warnings"`
}

// Stage accepts an upload, verifies it completely, and writes nothing outside
// _migration/staging.
func (s *Service) Stage(actorID string, body io.Reader, declaredLen int64) (*StageResult, error) {
	st, err := StageUpload(s.deps.DataDir, body, declaredLen, s.now())
	if err != nil {
		return nil, err
	}
	a, err := Open(st.Path)
	if err != nil {
		// A rejected upload does not linger on disk: it is a credential-bearing
		// file that failed verification, so there is no reason to keep it.
		_ = os.Remove(st.Path)
		return nil, err
	}
	defer func() { _ = a.Close() }()
	s.audit(actorID, ActionStage, st.ID, map[string]any{
		"bytes":    st.Bytes,
		"entries":  a.Manifest.Totals.Entries,
		"sourceOf": a.Manifest.Source.Host,
	})
	return &StageResult{Stage: st, Manifest: a.Manifest, Warnings: a.Warnings}, nil
}

// Status is the console's third tab.
type Status struct {
	Stage      *Stage       `json:"stage"`
	Backups    []BackupInfo `json:"backups"`
	FreeBytes  int64        `json:"freeBytes"`
	FreeKnown  bool         `json:"freeKnown"`
	ReplayDir  string       `json:"replayDir"`
	StageTTLHr int          `json:"stageTtlHours"`
}

// Status reports the staging slot, existing backups and disk headroom.
func (s *Service) Status() (*Status, error) {
	st, err := CurrentStage(s.deps.DataDir, s.now())
	if err != nil {
		return nil, err
	}
	backups, err := ListBackups(s.deps.DataDir)
	if err != nil {
		return nil, err
	}
	free, known := FreeBytes(s.deps.DataDir)
	return &Status{
		Stage: st, Backups: backups, FreeBytes: free, FreeKnown: known,
		ReplayDir:  ReplayDirFor(s.deps.DataDir, s.deps.ReplayDir),
		StageTTLHr: int(StageTTL / time.Hour),
	}, nil
}

// Plan computes a dry run against a staged archive. It writes nothing.
func (s *Service) Plan(actorID, stageID string, opts PlanOptions) (*Plan, error) {
	a, st, err := OpenStage(s.deps.DataDir, stageID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = a.Close() }()
	t, err := s.target()
	if err != nil {
		return nil, err
	}
	plan, err := BuildPlan(a, t, opts)
	if err != nil {
		return nil, err
	}
	s.audit(actorID, ActionPlan, st.ID, map[string]any{
		"writes": plan.Writes, "blocked": plan.Blocked, "digest": plan.Digest,
	})
	return plan, nil
}

// Discard drops the staging slot.
func (s *Service) Discard(actorID, stageID string) error {
	if err := DiscardStage(s.deps.DataDir, stageID); err != nil {
		return err
	}
	s.audit(actorID, ActionDiscard, stageID, nil)
	return nil
}

func (s *Service) target() (*Target, error) {
	return NewTarget(s.deps.DataDir, s.deps.ReplayDir)
}

// Commit re-verifies, re-plans, re-confirms the password, backs up and writes.
func (s *Service) Commit(ctx context.Context, actorID, password, stageID, expectDigest string, opts PlanOptions) (*ApplyResult, error) {
	if err := s.deps.Auth.ReauthPassword(ctx, actorID, password, ReauthScope); err != nil {
		return nil, err
	}
	// RE-VERIFY the staged file rather than trusting the stage-time result: it
	// has been sitting on a filesystem in between.
	a, st, err := OpenStage(s.deps.DataDir, stageID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = a.Close() }()
	t, err := s.target()
	if err != nil {
		return nil, err
	}
	applyOpts := ApplyOptions{
		PlanOptions:     opts,
		ExpectDigest:    expectDigest,
		ContentDir:      s.deps.ContentDir,
		PlatformVersion: s.deps.PlatformVersion,
		Now:             s.deps.Now,
		AuditBegin: func(plan *Plan, backup *BackupInfo) {
			detail := map[string]any{"writes": plan.Writes, "digest": plan.Digest}
			if backup != nil {
				detail["backup"] = backup.Path
				s.audit(actorID, ActionBackup, st.ID, map[string]any{
					"path": backup.Path, "bytes": backup.Bytes, "entries": backup.Entries,
				})
			}
			s.audit(actorID, ActionCommitBegin, st.ID, detail)
		},
		AuditEnd: func(res *ApplyResult, err error) {
			detail := map[string]any{"written": res.Written, "added": res.Added}
			if res.Backup != nil {
				detail["backup"] = res.Backup.Path
			}
			if err != nil {
				detail["err"] = err.Error()
				s.audit(actorID, ActionCommitFailed, st.ID, detail)
				return
			}
			detail["durationMs"] = res.Duration.Milliseconds()
			s.audit(actorID, ActionCommitEnd, st.ID, detail)
		},
	}
	if s.deps.Reindex != nil {
		applyOpts.Reindex = func(ctx context.Context, res *ApplyResult) error {
			return s.deps.Reindex.Rebuild(ctx, t, res)
		}
	}
	return Apply(ctx, a, t, applyOpts)
}
