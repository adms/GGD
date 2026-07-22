package ai

import (
	"context"
	"log/slog"

	"github.com/ggd/platform/internal/admin"
)

// auditConfig appends one line to the shared admin audit log so an AI provider
// config change shows up in the console's audit page next to every other
// operator action. The API KEY VALUE is never recorded — only whether a key is
// present, plus the non-secret endpoints/flags. Best-effort: a failed audit
// write never fails the config save itself.
func (s *Service) auditConfig(_ context.Context, adminID string, cfg Public) {
	entry := admin.AuditEntry{
		AdminID:  adminID,
		Action:   "ai.config",
		TargetID: Collection + "/" + DocID,
		Detail: map[string]any{
			"enabled":      cfg.Enabled,
			"hasKey":       cfg.HasKey,
			"imageBaseUrl": cfg.ImageBaseURL,
			"imageModel":   cfg.ImageModel,
			"textBaseUrl":  cfg.TextBaseURL,
			"textModel":    cfg.TextModel,
			"ttsBaseUrl":   cfg.TTSBaseURL,
			"ttsModel":     cfg.TTSModel,
			"musicBaseUrl": cfg.MusicBaseURL,
			"musicModel":   cfg.MusicModel,
		},
		TS: s.now().UTC(),
	}
	if err := s.store.AppendLine(admin.ColAudit, entry.TS.Format("2006-01-02"), entry); err != nil {
		slog.Warn("ai: audit append failed", "action", "ai.config", "err", err)
	}
}
