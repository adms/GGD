package submissions

import (
	"strings"

	"github.com/ggd/platform/internal/httpx"
)

func heroWithdrawn(control *HeroControl, submissionID string) bool {
	for _, operation := range control.Operations {
		if operation.Action == "withdraw" && operation.Status == "withdrawn" && operation.SubmissionID == submissionID {
			return true
		}
	}
	return false
}

// Withdraw is an author action in the existing operation ledger, not an admin
// verdict. The immutable candidate and any previous publication remain intact.
func (s *HeroService) Withdraw(id, accountID string, expectedRevision int) (HeroControl, error) {
	snapshot, err := s.Snapshot(id)
	if err != nil {
		return HeroControl{}, err
	}
	work, err := s.Work(snapshot.WorkID)
	if err != nil {
		return HeroControl{}, err
	}
	if accountID == "" || work.OwnerID != accountID || snapshot.AccountID != accountID {
		return HeroControl{}, httpx.Forbidden("只能撤回自己的待審候選。")
	}
	if expectedRevision < 0 {
		return HeroControl{}, heroConflict("撤回版本不合法。")
	}
	inputDigest := heroHash([]any{"withdraw", id, accountID, expectedRevision})
	operationID := "hero-withdraw-" + strings.TrimPrefix(inputDigest, "sha256:")[:40]
	err = s.updateControl(snapshot.WorkID, func(control *HeroControl) error {
		if prior, ok := control.Operations[operationID]; ok {
			if prior.InputDigest != inputDigest || prior.Status != "withdrawn" {
				return heroConflict("撤回操作紀錄不一致。")
			}
			return nil
		}
		if control.Revision != expectedRevision || control.PendingSubmission != id {
			return heroConflict("待審版本已變更，請重新讀取後再撤回。")
		}
		if _, reviewed := control.Reviews[id]; reviewed || control.Published != nil && control.Published.SubmissionID == id {
			return heroConflict("這份候選已進入審查決定或發布流程，不能撤回待審。")
		}
		if len(control.Operations) >= 1000 {
			return heroConflict("作品操作紀錄已達保留上限。")
		}
		now := s.now().UTC()
		control.Operations[operationID] = HeroPublishOperation{ID: operationID, Action: "withdraw", InputDigest: inputDigest, SubmissionID: id, Status: "withdrawn", ExpectedPublished: publishedVersion(control), ExpectedRevision: expectedRevision, Reason: "作者撤回待審", RequestedBy: accountID, CompletedAt: &now}
		control.PendingSubmission = ""
		control.Revision++
		return nil
	})
	if err != nil {
		return HeroControl{}, err
	}
	return s.Control(snapshot.WorkID)
}
