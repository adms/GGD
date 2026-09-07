package submissions

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"time"

	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/httpx"
)

const (
	CollectionHeroWorks     = "hero-works"
	CollectionHeroSnapshots = "hero-submission-snapshots"
	KindHero                = "complete-hero"
	MaxHeroDraftBytes       = 2 * 1024 * 1024
	MaxHeroArchiveBytes     = 64 * 1024 * 1024
)

type HeroSource struct {
	WorkID        string `json:"workId"`
	SubmissionID  string `json:"submissionId"`
	PackageDigest string `json:"packageDigest"`
	AuthorID      string `json:"authorId"`
}
type HeroWork struct {
	Schema        string          `json:"schema"`
	ID            string          `json:"id"`
	OwnerID       string          `json:"ownerId"`
	DraftRevision int             `json:"draftRevision"`
	DraftDigest   string          `json:"draftDigest"`
	Draft         json.RawMessage `json:"draft"`
	Source        *HeroSource     `json:"source,omitempty"`
	CreatedAt     time.Time       `json:"createdAt"`
	UpdatedAt     time.Time       `json:"updatedAt"`
}
type HeroFile struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
	Bytes  int    `json:"bytes"`
}
type HeroStoredVersion struct {
	Schema         string     `json:"schema"`
	WorkID         string     `json:"workId"`
	VersionID      string     `json:"versionId"`
	ProjectID      string     `json:"projectId"`
	PackageDigest  string     `json:"packageDigest"`
	SnapshotDigest string     `json:"snapshotDigest"`
	Files          []HeroFile `json:"files"`
}
type HeroInspection struct {
	Schema        string          `json:"schema"`
	PackageDigest string          `json:"packageDigest"`
	Project       json.RawMessage `json:"project"`
	Manifest      json.RawMessage `json:"manifest"`
	Icons         json.RawMessage `json:"icons"`
	Diagnostics   json.RawMessage `json:"diagnostics"`
}
type HeroSnapshot struct {
	Schema                string            `json:"schema"`
	ID                    string            `json:"id"`
	WorkID                string            `json:"workId"`
	AccountID             string            `json:"accountId"`
	Version               HeroStoredVersion `json:"version"`
	Inspection            HeroInspection    `json:"inspection"`
	AllowAttributionRemix bool              `json:"allowAttributionRemix"`
	Source                *HeroSource       `json:"source,omitempty"`
	SubmittedAt           time.Time         `json:"submittedAt"`
}

// Main owns compilation, asset normalization, immutable objects, and revalidation.
// The platform owns identities, draft CAS, review, and publication eligibility.
type HeroBridge interface {
	Inspect(context.Context, []byte) (HeroInspection, error)
	Prepare(context.Context, string, string, []byte) (HeroStoredVersion, error)
	Package(context.Context, string, string) ([]byte, error)
	File(context.Context, string, string, string) ([]byte, string, error)
}
type HeroService struct {
	store               *jsonstore.Store
	bridge              HeroBridge
	now                 func() time.Time
	intakePolicy        func() (HeroIntakePolicy, error)
	accountIntakePolicy func(context.Context, string, HeroIntakePolicy) (HeroIntakePolicy, error)
}

func NewHeroService(store *jsonstore.Store, bridge HeroBridge) *HeroService {
	return &HeroService{store: store, bridge: bridge, now: time.Now}
}
func heroHash(value any) string {
	data, _ := json.Marshal(value)
	hash := sha256.Sum256(data)
	return "sha256:" + hex.EncodeToString(hash[:])
}
func heroKey(id string) string          { return "hero-work-" + id }
func heroConflict(message string) error { return httpx.Err(409, "hero_conflict", message) }
func validHeroID(id string) bool        { return idRe.MatchString(id) && !strings.Contains(id, "..") }
func (s *HeroService) requireBridge() error {
	if s.bridge == nil {
		return httpx.Err(503, "hero_importer_unavailable", "完整英雄匯入服務尚未設定。")
	}
	return nil
}

func (s *HeroService) Work(id string) (HeroWork, error) {
	var work HeroWork
	if !validHeroID(id) {
		return work, httpx.BadRequest("作品 ID 格式錯誤。")
	}
	if err := s.store.Get(CollectionHeroWorks, id, &work); err != nil {
		if errors.Is(err, jsonstore.ErrNotFound) {
			return work, httpx.NotFound("找不到作品。")
		}
		return work, err
	}
	if work.Schema != "ggd-hero-work@1" || work.ID != id || work.DraftDigest != heroHash(work.Draft) {
		return work, httpx.Err(503, "hero_work_corrupt", "作品資料無法驗證。")
	}
	return work, nil
}

func (s *HeroService) SaveDraft(accountID, id string, expectedRevision int, payload json.RawMessage, source *HeroSource) (HeroWork, error) {
	var out HeroWork
	if accountID == "" || !validHeroID(id) || expectedRevision < 0 || len(payload) == 0 || len(payload) > MaxHeroDraftBytes {
		return out, httpx.BadRequest("草稿身分、版本或大小不合法。")
	}
	var draft struct {
		Project struct {
			Schema    string `json:"schema"`
			ProjectID string `json:"projectId"`
		} `json:"project"`
	}
	if err := json.Unmarshal(payload, &draft); err != nil || draft.Project.Schema != "ggd-hero-project@2" || draft.Project.ProjectID != id {
		return out, httpx.BadRequest("草稿必須屬於這個英雄作品。")
	}
	if err := s.checkDraftModelAssets(accountID, payload); err != nil {
		return out, err
	}
	var verifiedSource *HeroSource
	existing, existingErr := s.Work(id)
	if existingErr != nil {
		var domain *httpx.E
		if !errors.As(existingErr, &domain) || domain.Status != 404 {
			return out, existingErr
		}
	}
	if existingErr == nil {
		if existing.OwnerID != accountID {
			return out, httpx.Forbidden("只能保存自己的作品。")
		}
		if source != nil && (existing.Source == nil || source.WorkID != existing.Source.WorkID || source.SubmissionID != existing.Source.SubmissionID) {
			return out, heroConflict("建立後不能替換作品來源。")
		}
		verifiedSource = existing.Source
	}
	if source != nil && existingErr != nil {
		original, err := s.Snapshot(source.SubmissionID)
		if err != nil {
			return out, err
		}
		control, err := s.Control(original.WorkID)
		if err != nil {
			return out, err
		}
		if original.WorkID != source.WorkID || control.Published == nil || control.Published.SubmissionID != original.ID || !original.AllowAttributionRemix {
			return out, httpx.Forbidden("這個來源版本未授權署名改作。")
		}
		verifiedSource = &HeroSource{WorkID: original.WorkID, SubmissionID: original.ID, PackageDigest: original.Version.PackageDigest, AuthorID: original.AccountID}
	}
	err := s.store.Update(CollectionHeroWorks, id, func(raw json.RawMessage) (any, error) {
		var work HeroWork
		if len(raw) > 0 {
			if err := json.Unmarshal(raw, &work); err != nil {
				return nil, err
			}
			if work.OwnerID != accountID {
				return nil, httpx.Forbidden("只能保存自己的作品；請由允許改作的來源建立新作品。")
			}
			if source != nil && heroHash(work.Source) != heroHash(verifiedSource) {
				return nil, heroConflict("建立後不能替換作品來源。")
			}
		} else {
			work = HeroWork{Schema: "ggd-hero-work@1", ID: id, OwnerID: accountID, CreatedAt: s.now().UTC(), Source: verifiedSource}
		}
		if work.DraftRevision != expectedRevision {
			return nil, heroConflict("雲端草稿已更新，本機草稿仍保留；請比較或另存副本。")
		}
		work.Draft = append(json.RawMessage(nil), payload...)
		work.DraftDigest = heroHash(work.Draft)
		work.DraftRevision++
		work.UpdatedAt = s.now().UTC()
		out = work
		return work, nil
	})
	return out, err
}

func (s *HeroService) Snapshot(id string) (HeroSnapshot, error) {
	var snapshot HeroSnapshot
	if !validHeroID(id) {
		return snapshot, httpx.BadRequest("投稿 ID 格式錯誤。")
	}
	if err := s.store.Get(CollectionHeroSnapshots, id, &snapshot); err != nil {
		return snapshot, httpx.NotFound("找不到不可變投稿。")
	}
	if snapshot.Schema != "ggd-hero-submission@1" || snapshot.ID != id || snapshot.Version.PackageDigest != snapshot.Inspection.PackageDigest || snapshot.Version.ProjectID != snapshot.WorkID {
		return snapshot, httpx.Err(503, "hero_snapshot_corrupt", "投稿快照無法驗證。")
	}
	return snapshot, nil
}

func (s *HeroService) Submit(ctx context.Context, accountID, workID, operationID string, archive []byte, allowRemix bool) (HeroSnapshot, error) {
	var out HeroSnapshot
	if err := s.requireBridge(); err != nil {
		return out, err
	}
	work, err := s.Work(workID)
	if err != nil {
		return out, err
	}
	if accountID == "" || work.OwnerID != accountID {
		return out, httpx.Forbidden("只能投稿自己的作品。")
	}
	if !validHeroID(operationID) || len(archive) == 0 || len(archive) > MaxHeroArchiveBytes {
		return out, httpx.BadRequest("投稿操作或 ZIP 大小不合法。")
	}
	policy, err := s.IntakePolicyForAccount(ctx, accountID)
	if err != nil {
		return out, err
	}
	if !policy.Enabled {
		return out, httpx.Forbidden("目前 UGC 政策未開放投稿；本機草稿仍可保存。")
	}
	if len(archive) > max(policy.MaxBytes, heroArchiveLimit(policy, true)) {
		return out, httpx.BadRequest("英雄 ZIP 超過目前投稿政策的大小上限。")
	}
	inspection, err := s.bridge.Inspect(ctx, archive)
	if err != nil {
		return out, err
	}
	var project struct {
		ProjectID    string `json:"projectId"`
		Presentation struct {
			UploadedModel json.RawMessage `json:"uploadedModel"`
		} `json:"presentation"`
	}
	if json.Unmarshal(inspection.Project, &project) != nil || project.ProjectID != work.ID || inspection.Schema != "ggd-hero-package-inspection@1" {
		return out, httpx.BadRequest("套件不屬於這個作品。")
	}
	hasUploadedModel := len(project.Presentation.UploadedModel) > 0 && string(project.Presentation.UploadedModel) != "null"
	if hasUploadedModel && !policy.ModelUploadsEnabled {
		return out, httpx.Forbidden("目前未開放上傳模型的新投稿。")
	}
	unlock := submissionIntakeLocks.Lock(s.store.Root() + "\x00" + accountID)
	defer unlock()
	// Re-read after waiting/validation: an operator can tighten or disable intake
	// while the package is being checked. No placement or quota write occurs first.
	policy, err = s.IntakePolicyForAccount(ctx, accountID)
	if err != nil {
		return out, err
	}
	if !policy.Enabled {
		return out, httpx.Forbidden("投稿政策已關閉，請保留草稿稍後再試。")
	}
	if hasUploadedModel && !policy.ModelUploadsEnabled {
		return out, httpx.Forbidden("模型投稿已關閉，請保留本機草稿。")
	}
	if len(archive) > heroArchiveLimit(policy, hasUploadedModel) {
		return out, httpx.BadRequest("英雄 ZIP 超過目前投稿政策的大小上限。")
	}
	id := "hero-" + strings.TrimPrefix(heroHash([]string{workID, inspection.PackageDigest}), "sha256:")[:59]
	if err := s.checkHeroQuota(accountID, workID, id, policy); err != nil {
		return out, err
	}
	version, err := s.bridge.Prepare(ctx, workID, "submission-"+operationID, archive)
	if err != nil {
		return out, err
	}
	if version.Schema != "ggd-work-version@1" || version.WorkID != workID || version.ProjectID != workID || version.PackageDigest != inspection.PackageDigest || version.VersionID != version.PackageDigest || version.SnapshotDigest == "" {
		return out, httpx.Err(503, "hero_receipt_mismatch", "匯入收據與投稿不一致。")
	}
	policy, err = s.IntakePolicyForAccount(ctx, accountID)
	if err != nil {
		return out, err
	}
	if !policy.Enabled {
		return out, httpx.Forbidden("投稿政策已關閉，請保留草稿稍後再試。")
	}
	if len(archive) > heroArchiveLimit(policy, hasUploadedModel) {
		return out, httpx.BadRequest("英雄 ZIP 超過目前投稿政策的大小上限。")
	}
	if err := s.checkHeroQuota(accountID, workID, id, policy); err != nil {
		return out, err
	}
	if hasUploadedModel && !policy.ModelUploadsEnabled {
		return out, httpx.Forbidden("模型投稿已關閉，請保留本機草稿。")
	}
	out = HeroSnapshot{Schema: "ggd-hero-submission@1", ID: id, WorkID: workID, AccountID: accountID, Version: version, Inspection: inspection, AllowAttributionRemix: allowRemix, Source: work.Source, SubmittedAt: s.now().UTC()}
	err = s.store.Update(CollectionHeroSnapshots, id, func(raw json.RawMessage) (any, error) {
		if len(raw) > 0 {
			var prior HeroSnapshot
			if err := json.Unmarshal(raw, &prior); err != nil {
				return nil, err
			}
			if prior.AccountID != accountID || prior.AllowAttributionRemix != allowRemix || heroHash(prior.Version) != heroHash(version) || heroHash(prior.Inspection) != heroHash(inspection) {
				return nil, heroConflict("同一投稿版本不能改寫內容或改作授權。")
			}
			out = prior
			return prior, nil
		}
		return out, nil
	})
	if err != nil {
		return out, err
	}
	// The ordinary materials collection remains the intake index; its hero payload is immutable.
	material := Material{Version: SchemaVersion, ID: id, AccountID: accountID, Kind: KindHero, Origin: OriginPlayer, Digest: version.PackageDigest, Payload: string(inspection.Project), CreatedAt: out.SubmittedAt, UpdatedAt: out.SubmittedAt}
	if err := s.store.Update(CollectionMaterial, id, func(raw json.RawMessage) (any, error) {
		if len(raw) > 0 {
			var prior Material
			if err := json.Unmarshal(raw, &prior); err != nil {
				return nil, err
			}
			if heroHash(prior) != heroHash(material) {
				return nil, heroConflict("不可變投稿材料衝突。")
			}
			return prior, nil
		}
		return material, nil
	}); err != nil {
		return out, err
	}
	err = s.updateControl(workID, func(control *HeroControl) error {
		if heroWithdrawn(control, id) {
			return heroConflict("這份候選已撤回；請在草稿建立新修訂，重新檢查後再投稿。")
		}
		for _, existing := range control.Submissions {
			if existing == id {
				return nil
			}
		}
		if len(control.Submissions) >= 1000 {
			return heroConflict("作品投稿歷史已達保留上限，需要管理員封存。")
		}
		control.Submissions = append(control.Submissions, id)
		if !out.SubmittedAt.Before(control.PendingSubmittedAt) {
			control.PendingSubmission = id
			control.PendingSubmittedAt = out.SubmittedAt
		}
		control.Revision++
		return nil
	})
	return out, err
}

func (s *HeroService) ListWorks(accountID string) ([]HeroWork, error) {
	ids, err := s.store.Scan(CollectionHeroWorks)
	if err != nil {
		return nil, err
	}
	out := []HeroWork{}
	for _, id := range ids {
		work, err := s.Work(id)
		if err != nil {
			return nil, err
		}
		if work.OwnerID == accountID {
			out = append(out, work)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].UpdatedAt.After(out[j].UpdatedAt) })
	return out, nil
}
