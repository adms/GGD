package submissions

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/httpx"
	"github.com/oklog/ulid/v2"
)

type HeroProblem struct {
	Slot    string `json:"slot,omitempty"`
	Field   string `json:"field,omitempty"`
	Message string `json:"message"`
}
type HeroDecision struct {
	Schema         string        `json:"schema"`
	ID             string        `json:"id"`
	SubmissionID   string        `json:"submissionId"`
	PackageDigest  string        `json:"packageDigest"`
	SnapshotDigest string        `json:"snapshotDigest"`
	Status         string        `json:"status"`
	Reason         string        `json:"reason"`
	Problems       []HeroProblem `json:"problems"`
	DecidedBy      string        `json:"decidedBy"`
	DecidedAt      time.Time     `json:"decidedAt"`
}
type HeroReviewHead struct {
	ID     string `json:"id"`
	Status string `json:"status"`
	Digest string `json:"digest"`
}
type HeroPublished struct {
	SubmissionID string            `json:"submissionId"`
	Version      HeroStoredVersion `json:"version"`
	DecisionID   string            `json:"decisionId"`
	PublishedAt  time.Time         `json:"publishedAt"`
	OperationID  string            `json:"operationId"`
}
type HeroPublishOperation struct {
	ID                string     `json:"id"`
	Action            string     `json:"action"`
	InputDigest       string     `json:"inputDigest"`
	SubmissionID      string     `json:"submissionId"`
	Status            string     `json:"status"`
	ExpectedPublished string     `json:"expectedPublished"`
	ExpectedRevision  int        `json:"expectedRevision"`
	GuardRevision     int        `json:"guardRevision"`
	DecisionID        string     `json:"decisionId"`
	Reason            string     `json:"reason"`
	RequestedBy       string     `json:"requestedBy"`
	Error             string     `json:"error,omitempty"`
	CompletedAt       *time.Time `json:"completedAt,omitempty"`
}
type HeroControl struct {
	Schema             string                          `json:"schema"`
	WorkID             string                          `json:"workId"`
	Revision           int                             `json:"revision"`
	PublicationEpoch   int                             `json:"publicationEpoch"`
	PendingSubmission  string                          `json:"pendingSubmission"`
	PendingSubmittedAt time.Time                       `json:"pendingSubmittedAt"`
	Submissions        []string                        `json:"submissions"`
	Published          *HeroPublished                  `json:"published"`
	Reviews            map[string]HeroReviewHead       `json:"reviews"`
	Operations         map[string]HeroPublishOperation `json:"operations"`
	History            []HeroPublished                 `json:"history"`
}

func emptyHeroControl(workID string) HeroControl {
	return HeroControl{Schema: "ggd-hero-publication@1", WorkID: workID, Reviews: map[string]HeroReviewHead{}, Operations: map[string]HeroPublishOperation{}, History: []HeroPublished{}, Submissions: []string{}}
}
func (s *HeroService) Control(workID string) (HeroControl, error) {
	control := emptyHeroControl(workID)
	err := s.store.Get(CollectionPromotion, heroKey(workID), &control)
	if errors.Is(err, jsonstore.ErrNotFound) {
		return control, nil
	}
	if err != nil {
		return control, err
	}
	if control.Schema != "ggd-hero-publication@1" || control.WorkID != workID || control.Reviews == nil || control.Operations == nil {
		return control, httpx.Err(503, "hero_publication_corrupt", "作品發布紀錄無法驗證。")
	}
	return control, nil
}
func (s *HeroService) updateControl(workID string, change func(*HeroControl) error) error {
	return s.store.Update(CollectionPromotion, heroKey(workID), func(raw json.RawMessage) (any, error) {
		control := emptyHeroControl(workID)
		if len(raw) > 0 {
			if err := json.Unmarshal(raw, &control); err != nil {
				return nil, err
			}
		}
		if control.Schema != "ggd-hero-publication@1" || control.WorkID != workID || control.Reviews == nil || control.Operations == nil {
			return nil, httpx.Err(503, "hero_publication_corrupt", "作品發布紀錄無法驗證。")
		}
		if err := change(&control); err != nil {
			return nil, err
		}
		return control, nil
	})
}
func publishedVersion(control *HeroControl) string {
	return heroHash([]any{control.PublicationEpoch, control.Published})
}
func (s *HeroService) makeDecision(snapshot HeroSnapshot, status, reason, by string, problems []HeroProblem) (HeroDecision, error) {
	if strings.TrimSpace(by) == "" || len(reason) > 4000 || len(problems) > 12 {
		return HeroDecision{}, httpx.BadRequest("需要登入的管理員與有界審查意見。")
	}
	if status != StatusApproved && strings.TrimSpace(reason) == "" {
		return HeroDecision{}, httpx.BadRequest("退回與拒絕必須填寫理由。")
	}
	for _, problem := range problems {
		if len(problem.Message) > 1000 || len(problem.Field) > 256 || len(problem.Slot) > 8 {
			return HeroDecision{}, httpx.BadRequest("欄位問題超過長度限制。")
		}
	}
	decision := HeroDecision{Schema: "ggd-hero-review@1", ID: "hero-review-" + ulid.Make().String(), SubmissionID: snapshot.ID, PackageDigest: snapshot.Version.PackageDigest, SnapshotDigest: snapshot.Version.SnapshotDigest, Status: status, Reason: reason, Problems: problems, DecidedBy: by, DecidedAt: s.now().UTC()}
	err := s.store.Update(CollectionVerdict, decision.ID, func(raw json.RawMessage) (any, error) {
		if len(raw) > 0 {
			return nil, heroConflict("審查紀錄不可覆寫。")
		}
		return decision, nil
	})
	return decision, err
}
func (s *HeroService) Decision(head HeroReviewHead) (HeroDecision, error) {
	var decision HeroDecision
	if err := s.store.Get(CollectionVerdict, head.ID, &decision); err != nil {
		return decision, err
	}
	if heroHash(decision) != head.Digest || decision.Status != head.Status {
		return decision, httpx.Err(503, "hero_review_corrupt", "審查紀錄與固定版本不符。")
	}
	return decision, nil
}

func (s *HeroService) DecideHero(id, status, reason, by string, expectedRevision int, problems []HeroProblem) (HeroControl, error) {
	if status != "returned" && status != StatusRejected {
		return HeroControl{}, httpx.BadRequest("請選退回修改或拒絕；核准需使用完整發布流程。")
	}
	snapshot, err := s.Snapshot(id)
	if err != nil {
		return HeroControl{}, err
	}
	decision, err := s.makeDecision(snapshot, status, reason, by, problems)
	if err != nil {
		return HeroControl{}, err
	}
	err = s.updateControl(snapshot.WorkID, func(control *HeroControl) error {
		if heroWithdrawn(control, id) {
			return heroConflict("作者已撤回這份候選，不能再寫入審查決定。")
		}
		if control.Revision != expectedRevision {
			return heroConflict("審查頁的版本已過期，請重新讀取。")
		}
		if control.Published != nil && control.Published.SubmissionID == id {
			return heroConflict("已發布版本需要先執行下架。")
		}
		control.Reviews[id] = HeroReviewHead{ID: decision.ID, Status: status, Digest: heroHash(decision)}
		control.Revision++
		return nil
	})
	if err != nil {
		return HeroControl{}, err
	}
	return s.Control(snapshot.WorkID)
}

func (s *HeroService) Publish(ctx context.Context, id, operationID, action, reason, by string, expectedRevision int) (HeroControl, error) {
	if err := s.requireBridge(); err != nil {
		return HeroControl{}, err
	}
	if !validHeroID(operationID) || by == "" || (action != "publish" && action != "restore") {
		return HeroControl{}, httpx.BadRequest("發布操作身分不合法。")
	}
	snapshot, err := s.Snapshot(id)
	if err != nil {
		return HeroControl{}, err
	}
	control, err := s.Control(snapshot.WorkID)
	if err != nil {
		return control, err
	}
	inputDigest := heroHash([]any{id, operationID, action, reason, expectedRevision})
	var decision HeroDecision
	if prior, exists := control.Operations[operationID]; exists {
		if prior.InputDigest != inputDigest {
			return control, heroConflict("同一發布操作不能更換輸入。")
		}
		if prior.Status == "published" {
			return control, nil
		}
	} else {
		decision, err = s.makeDecision(snapshot, StatusApproved, reason, by, nil)
		if err != nil {
			return control, err
		}
	}
	var staged HeroPublishOperation
	err = s.updateControl(snapshot.WorkID, func(current *HeroControl) error {
		if prior, exists := current.Operations[operationID]; exists {
			if prior.InputDigest != inputDigest {
				return heroConflict("同一發布操作不能更換輸入。")
			}
			if prior.Status == "published" {
				staged = prior
				return nil
			}
			if publishedVersion(current) != prior.ExpectedPublished || current.Reviews[id].ID != prior.DecisionID {
				return heroConflict("發布基準或人工決定已變更；舊操作不可覆蓋新版本。")
			}
			if prior.Status == "publishing" {
				staged = prior
				return nil
			}
			current.Revision++
			prior.GuardRevision = current.Revision
			prior.Status = "publishing"
			prior.Error = ""
			current.Operations[operationID] = prior
			staged = prior
			return nil
		}
		if len(current.Operations) >= 1000 {
			return httpx.Err(503, "hero_operation_retention", "作品操作紀錄已達保留上限，需要管理員封存後再操作。")
		}
		if current.Revision != expectedRevision {
			return heroConflict("發布基準已更新，請重新讀取審查頁。")
		}
		if action == "publish" && current.PendingSubmission != id {
			return heroConflict("這份已不是目前待審候選。")
		}
		if action == "restore" {
			found := false
			for _, version := range current.History {
				if version.SubmissionID == id {
					found = true
				}
			}
			if !found {
				return heroConflict("只能回復曾成功發布的版本。")
			}
		}
		current.Reviews[id] = HeroReviewHead{ID: decision.ID, Status: StatusApproved, Digest: heroHash(decision)}
		current.Revision++
		staged = HeroPublishOperation{ID: operationID, Action: action, InputDigest: inputDigest, SubmissionID: id, Status: "publishing", ExpectedPublished: publishedVersion(current), ExpectedRevision: expectedRevision, GuardRevision: current.Revision, DecisionID: decision.ID, Reason: reason, RequestedBy: by}
		current.Operations[operationID] = staged
		return nil
	})
	if err != nil {
		return control, err
	}
	if staged.Status == "published" {
		return s.Control(snapshot.WorkID)
	}
	fail := func(cause error) (HeroControl, error) {
		status := "failed"
		var bridgeErr *HeroBridgeError
		if errors.As(cause, &bridgeErr) && bridgeErr.Status == 422 {
			status = "stale"
		}
		writeErr := s.updateControl(snapshot.WorkID, func(current *HeroControl) error {
			op := current.Operations[operationID]
			if op.Status == "published" {
				return nil
			}
			op.Status = status
			op.Error = cause.Error()
			if len(op.Error) > 12000 {
				op.Error = string([]rune(op.Error)[:min(3000, len([]rune(op.Error)))])
			}
			current.Operations[operationID] = op
			current.Revision++
			return nil
		})
		if writeErr != nil {
			return HeroControl{}, writeErr
		}
		latest, _ := s.Control(snapshot.WorkID)
		return latest, httpx.Err(503, "hero_publish_failed", cause.Error())
	}
	archive, err := s.bridge.Package(ctx, snapshot.WorkID, snapshot.Version.VersionID)
	if err != nil {
		return fail(err)
	}
	var checked HeroInspection
	if snapshot.CanonicalTakeover {
		bridge, ok := s.bridge.(HeroTakeoverBridge)
		if !ok {
			return fail(httpx.Err(503, "hero_takeover_unavailable", "英雄 canonical 接管服務未設定。"))
		}
		checked, err = bridge.InspectTakeover(ctx, snapshot.WorkID, archive)
	} else {
		checked, err = s.bridge.Inspect(ctx, archive)
	}
	if err != nil {
		return fail(err)
	}
	if heroHash(checked) != heroHash(snapshot.Inspection) {
		return fail(heroConflict("重驗結果已漂移，不能替换真人審查的快照。"))
	}
	placementID := "hero-publish-" + strings.TrimPrefix(heroHash([]string{snapshot.WorkID, operationID}), "sha256:")[:40]
	var version HeroStoredVersion
	if snapshot.CanonicalTakeover {
		version, err = s.bridge.(HeroTakeoverBridge).PrepareTakeover(ctx, snapshot.WorkID, placementID, archive)
	} else {
		version, err = s.bridge.Prepare(ctx, snapshot.WorkID, placementID, archive)
	}
	if err != nil {
		return fail(err)
	}
	if heroHash(version) != heroHash(snapshot.Version) {
		return fail(heroConflict("發布安置回傳另一份內容。"))
	}
	err = s.updateControl(snapshot.WorkID, func(current *HeroControl) error {
		op := current.Operations[operationID]
		if op.Status == "published" {
			return nil
		}
		if op.InputDigest != inputDigest || current.Revision != staged.GuardRevision || publishedVersion(current) != staged.ExpectedPublished || current.Reviews[id].ID != staged.DecisionID {
			return heroConflict("發布期間候選、審查或可用版本改變；前一版保持可用。")
		}
		now := s.now().UTC()
		published := HeroPublished{SubmissionID: id, Version: version, DecisionID: staged.DecisionID, PublishedAt: now, OperationID: operationID}
		current.Published = &published
		current.PublicationEpoch++
		current.History = append(current.History, published)
		current.Revision++
		op.Status = "published"
		op.CompletedAt = &now
		current.Operations[operationID] = op
		return nil
	})
	if err != nil {
		return fail(err)
	}
	return s.Control(snapshot.WorkID)
}

func (s *HeroService) Unpublish(workID, operationID, reason, by string, expectedRevision int) (HeroControl, error) {
	if !validHeroID(operationID) || by == "" || strings.TrimSpace(reason) == "" || len(reason) > 4000 {
		return HeroControl{}, httpx.BadRequest("下架需要操作 ID、管理員與理由。")
	}
	input := heroHash([]any{"unpublish", workID, operationID, reason, expectedRevision})
	err := s.updateControl(workID, func(control *HeroControl) error {
		if op, ok := control.Operations[operationID]; ok {
			if op.InputDigest != input {
				return heroConflict("同一操作不能更換輸入。")
			}
			return nil
		}
		if control.Revision != expectedRevision {
			return heroConflict("可用版本已變更，請重新讀取。")
		}
		if control.Published == nil {
			return heroConflict("作品目前沒有發布版本。")
		}
		if len(control.Operations) >= 1000 {
			return heroConflict("作品操作紀錄已達保留上限。")
		}
		now := s.now().UTC()
		control.Operations[operationID] = HeroPublishOperation{ID: operationID, Action: "unpublish", InputDigest: input, SubmissionID: control.Published.SubmissionID, Status: "unpublished", ExpectedPublished: publishedVersion(control), ExpectedRevision: expectedRevision, Reason: reason, RequestedBy: by, CompletedAt: &now}
		control.Published = nil
		control.PublicationEpoch++
		control.Revision++
		return nil
	})
	if err != nil {
		return HeroControl{}, err
	}
	return s.Control(workID)
}
