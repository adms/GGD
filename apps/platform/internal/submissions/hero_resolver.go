package submissions

import (
	"encoding/json"
	"strings"

	"github.com/ggd/platform/internal/community"
	"github.com/ggd/platform/internal/httpx"
)

// ResolvePublished freezes the active, manually approved pointer. Historical
// versions are deliberately not candidates for new matches after withdrawal.
func (s *HeroService) ResolvePublished(workIDs []string) ([]community.HeroPin, error) {
	if len(workIDs) == 0 || len(workIDs) > 12 {
		return nil, httpx.BadRequest("請選擇 1 至 12 份社群英雄作品。")
	}
	seen := map[string]bool{}
	pins := make([]community.HeroPin, 0, len(workIDs))
	for _, workID := range workIDs {
		if !validHeroID(workID) || seen[workID] {
			return nil, httpx.BadRequest("社群作品身分重複或不合法。")
		}
		seen[workID] = true
		control, err := s.Control(workID)
		if err != nil {
			return nil, err
		}
		if control.Published == nil {
			return nil, httpx.Conflict("所選英雄尚未發布或已下架：" + workID)
		}
		view, err := s.Review(control.Published.SubmissionID)
		if err != nil {
			return nil, err
		}
		if view.Status != "published" || view.Decision == nil || view.Decision.Status != StatusApproved || view.Decision.ID != control.Published.DecisionID || view.Publication.PublicationEpoch != control.PublicationEpoch || view.Snapshot.Version.PackageDigest != control.Published.Version.PackageDigest || view.Snapshot.Version.SnapshotDigest != control.Published.Version.SnapshotDigest {
			return nil, httpx.Conflict("英雄發布狀態已改變，請重新選用：" + workID)
		}
		var project struct {
			Brief struct {
				Name string `json:"name"`
			} `json:"brief"`
		}
		if json.Unmarshal(view.Snapshot.Inspection.Project, &project) != nil || strings.TrimSpace(project.Brief.Name) == "" {
			return nil, httpx.Err(503, "hero_publication_corrupt", "發布英雄缺少名稱。")
		}
		pins = append(pins, community.HeroPin{WorkID: workID, SubmissionID: view.Snapshot.ID, AuthorID: view.Snapshot.AccountID, Name: project.Brief.Name, PackageDigest: view.Snapshot.Version.PackageDigest, SnapshotDigest: view.Snapshot.Version.SnapshotDigest})
	}
	return pins, nil
}
