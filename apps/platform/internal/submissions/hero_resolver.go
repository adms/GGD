package submissions

import (
	"context"
	"encoding/json"
	"log/slog"
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
		// ⛔⛔ **靜默是這裡最大的缺陷。**
		//
		// ⭐ `active` 非空而一個都沒配上 ⇒ 玩家看到「一個社群英雄都沒有」，
		//   而 `/healthz` 一切正常 —— ⛔ 它與「本來就沒有人發布過」長得一模一樣。
		//
		// ⚠️ ⭐ 而最常見的原因**不是**內容不相容：`heroListTarget` 的
		//   `GameRevision` 來自 `GGD_BUILD_STAMP` ⇒ **每一次部署都換一個新指紋**
		//   ⇒ 已發布的英雄會在下一次部署後靜靜地全部掉出名單。
		//   （證據：`hero_target_drift_test.go` —— 只有 stamp 變了，內容沒變。）
		//
		// ⇒ ⭐ 這裡**不改行為**（回空清單還是 503 是產品決定，見 GH#1147／#1150 的甲乙丙）——
		//   ⛔ 但它不可以再閉嘴。⚠️ 而一行 log 只是**最低限度**：
		//   真正的修法是把 gameVersion 從 build stamp 換成內容相容性版本。
		if len(active) > 0 {
			slog.Warn("hero published roster empty: every published hero mismatched the serving target",
				"published", len(active),
				"target.gameRevision", target.GameRevision,
				"target.contentVersion", target.ContentVersion,
				"target.migrationFingerprint", target.MigrationFingerprint,
				"target.processorFingerprint", target.ProcessorFingerprint,
				"hint", "GameRevision 來自 GGD_BUILD_STAMP —— 一次部署就會讓它們全部掉出名單（GH#1147）")
		}
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
