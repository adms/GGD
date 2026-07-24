package admin

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// ColAudit is the append-only audit collection: one NDJSON file per UTC date
// at data/admin-audit/<YYYY-MM-DD>.jsonl.
const ColAudit = "admin-audit"

// AuditEntry is one audit line. detail is action-specific.
type AuditEntry struct {
	AdminID  string         `json:"adminId"`
	Action   string         `json:"action"`
	TargetID string         `json:"targetId"`
	Detail   map[string]any `json:"detail,omitempty"`
	TS       time.Time      `json:"ts"`
}

// audit appends one entry to today's (clock-seam) audit file.
func (s *Service) audit(ctx context.Context, adminID, action, targetID string, detail map[string]any) error {
	now := s.now().UTC()
	entry := AuditEntry{AdminID: adminID, Action: action, TargetID: targetID, Detail: detail, TS: now}
	return s.store.AppendLine(ColAudit, now.Format("2006-01-02"), entry)
}

// ListAudit reads the whole audit log (all date files), newest first, and
// returns one page. total is the pre-pagination count.
func (s *Service) ListAudit(ctx context.Context, page, pageSize int) (entries []AuditEntry, total int, err error) {
	page, pageSize = normalizePage(page, pageSize)
	dir := filepath.Join(s.store.Root(), ColAudit)
	files, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return []AuditEntry{}, 0, nil
		}
		return nil, 0, err
	}
	all := []AuditEntry{}
	for _, f := range files {
		if f.IsDir() || !strings.HasSuffix(f.Name(), ".jsonl") {
			continue
		}
		// #nosec G304 -- `dir` is <store root>/audit and f.Name() came from the
		// os.ReadDir of that directory above, filtered to *.jsonl. Everything in
		// that tree was written by jsonstore.AppendLine through resolve(), so no
		// request ever chose a name here.
		data, err := os.ReadFile(filepath.Join(dir, f.Name()))
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(data), "\n") {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			var e AuditEntry
			if json.Unmarshal([]byte(line), &e) == nil {
				all = append(all, e)
			}
		}
	}
	sort.Slice(all, func(i, j int) bool { return all[i].TS.After(all[j].TS) })
	total = len(all)
	entries = paginate(all, page, pageSize)
	if entries == nil {
		entries = []AuditEntry{}
	}
	return entries, total, nil
}
