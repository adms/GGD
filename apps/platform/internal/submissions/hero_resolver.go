package submissions

import (
	"context"
	"encoding/json"
	"sort"
	"strings"

	"github.com/ggd/platform/internal/community"
	"github.com/ggd/platform/internal/httpx"
)

// Same bounded roster as shared/content/communityRoom.ts. This bounds version
// metadata, not players in a match; the asset budget remains independently enforced.
const MaxPublishedRosterHeroes = 256

// ResolveRoster selects the current approved versions for every ordinary match.
// Drafts and historical publications never become selectable. An older release
// stays in the admin history until rebuilt, without breaking unrelated matches.
func (s *HeroService) ResolveRoster(ctx context.Context) ([]community.HeroPin, error) {
	ids, err := s.store.Scan(CollectionHeroWorks)
	if err != nil {
		return nil, err
	}
	sort.Strings(ids)
	active := []HeroReviewView{}
	for _, id := range ids {
		control, err := s.Control(id)
		if err != nil {
			return nil, err
		}
		if control.Published == nil {
			continue
		}
		view, err := s.Review(control.Published.SubmissionID)
		if err != nil {
			return nil, err
		}
		active = append(active, view)
	}
	if len(active) == 0 {
		return []community.HeroPin{}, nil
	}
	bridge, ok := s.bridge.(HeroAuthoringBridge)
	if !ok {
		return nil, httpx.Err(503, "hero_importer_unavailable", "無法確認已發布英雄的遊戲版本。")
	}
	raw, err := bridge.Target(ctx)
	if err != nil {
		return nil, err
	}
	var profile struct {
		Schema      string `json:"schema"`
		GameVersion string `json:"gameVersion"`
		Base        struct {
			ContentVersion string `json:"contentVersion"`
		} `json:"base"`
		MigrationFingerprint string `json:"migrationFingerprint"`
		AuthoringProcessor   struct {
			Fingerprint string `json:"fingerprint"`
		} `json:"authoringProcessor"`
	}
	if json.Unmarshal(raw, &profile) != nil || profile.Schema != "ggd-content-target-profile@1" || profile.GameVersion == "" || profile.Base.ContentVersion == "" || profile.MigrationFingerprint == "" || profile.AuthoringProcessor.Fingerprint == "" {
		return nil, httpx.Err(503, "hero_target_unavailable", "已發布英雄的目標版本資料不完整。")
	}
	target := heroListTarget{profile.GameVersion, profile.Base.ContentVersion, profile.MigrationFingerprint, profile.AuthoringProcessor.Fingerprint}
	selected := []string{}
	for _, view := range active {
		row := heroListRow(view)
		if row.Target == nil {
			return nil, httpx.Err(503, "hero_publication_corrupt", "已發布英雄缺少版本相容性資料。")
		}
		if *row.Target == target {
			selected = append(selected, row.WorkID)
		}
	}
	if len(selected) == 0 {
		return []community.HeroPin{}, nil
	}
	return s.ResolvePublished(selected)
}

// ResolvePublished freezes the active, manually approved pointer. Historical
// versions are deliberately not candidates for new matches after withdrawal.
func (s *HeroService) ResolvePublished(workIDs []string) ([]community.HeroPin, error) {
	if len(workIDs) == 0 || len(workIDs) > MaxPublishedRosterHeroes {
		return nil, httpx.BadRequest("已發布英雄名單為空或超過版本載入上限。")
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
