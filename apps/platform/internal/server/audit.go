package server

import (
	"context"
	"time"

	"github.com/ggd/platform/internal/admin"
	"github.com/ggd/platform/internal/data/jsonstore"
)

// authAuditSink lets internal/auth append to the SAME append-only audit log the
// operator console reads, without importing internal/admin.
//
// The dependency only runs one way — admin imports auth for its AdminOnly gate —
// so auth declares an Auditor interface and the composition root (this package,
// which already imports both) satisfies it. The entry is written exactly as
// admin.Service.audit writes one: an admin.AuditEntry NDJSON line under
// admin.ColAudit keyed by the UTC date, so admin.ListAudit picks it up with no
// special case.
type authAuditSink struct {
	store *jsonstore.Store
	now   func() time.Time
}

// Audit implements auth.Auditor. detail is action-specific and, for the
// self-service password change, deliberately carries no credential material.
func (a authAuditSink) Audit(ctx context.Context, actorID, action, targetID string, detail map[string]any) error {
	now := a.now().UTC()
	return a.store.AppendLine(admin.ColAudit, now.Format("2006-01-02"), admin.AuditEntry{
		AdminID:  actorID,
		Action:   action,
		TargetID: targetID,
		Detail:   detail,
		TS:       now,
	})
}
