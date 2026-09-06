package submissions

import (
	"errors"
	"time"

	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/keyedmutex"
	"github.com/ggd/platform/internal/httpx"
)

// Values come from Main's live config/ugc document, never from Editor constants.
// Hero intake always requires an authenticated owner and human review, regardless
// of the general UGC requireAuth/autoPromote switches.
type HeroIntakePolicy struct {
	Enabled              bool `json:"enabled"`
	MaxPendingPerPlayer  int  `json:"maxPendingPerPlayer"`
	QuotaPerPlayerPerDay int  `json:"quotaPerPlayerPerDay"`
	MaxBytes             int  `json:"maxBytes"`
}

// A bounded set of locks shared by both intake paths and service instances.
// jsonstore already has a single writer process requirement; this does not claim
// a distributed transaction. Keep these separate from jsonstore's object locks.
var submissionIntakeLocks = keyedmutex.New()

func (s *HeroService) SetIntakePolicy(read func() (HeroIntakePolicy, error)) { s.intakePolicy = read }
func (s *HeroService) IntakePolicy() (HeroIntakePolicy, error) {
	if s.intakePolicy == nil {
		return HeroIntakePolicy{}, httpx.Err(503, "hero_policy_unavailable", "無法讀取投稿政策，請稍後重試；本機草稿仍可保存。")
	}
	return s.intakePolicy()
}

// Count authoritative candidates rather than historical hero materials. A missing
// derived index or malformed record cannot silently grant extra intake capacity.
func pendingSubmissions(store *jsonstore.Store, accountID, exceptMaterial, exceptWork string) (int, error) {
	ids, err := store.Scan(CollectionMaterial)
	if err != nil {
		return 0, err
	}
	pending := 0
	for _, id := range ids {
		if id == exceptMaterial {
			continue
		}
		var material Material
		if err := store.Get(CollectionMaterial, id, &material); err != nil {
			return 0, err
		}
		if material.AccountID != accountID || material.Kind == KindHero {
			continue
		}
		var verdict Verdict
		err := store.Get(CollectionVerdict, id, &verdict)
		if err != nil && !errors.Is(err, jsonstore.ErrNotFound) {
			return 0, err
		}
		if verdict.Status == "" || verdict.Status == StatusPending || verdict.Status == StatusApproved && verdict.ApprovedDigest != material.Digest {
			pending++
		}
	}
	heroes := NewHeroService(store, nil)
	works, err := heroes.ListWorks(accountID)
	if err != nil {
		return 0, err
	}
	for _, work := range works {
		if work.ID == exceptWork {
			continue
		}
		control, err := heroes.Control(work.ID)
		if err != nil {
			return 0, err
		}
		id := control.PendingSubmission
		if id == "" {
			continue
		}
		if _, reviewed := control.Reviews[id]; reviewed || heroWithdrawn(&control, id) || control.Published != nil && control.Published.SubmissionID == id {
			continue
		}
		snapshot, err := heroes.Snapshot(id)
		if err != nil {
			return 0, err
		}
		if snapshot.AccountID != accountID || snapshot.WorkID != work.ID {
			return 0, httpx.Err(503, "hero_snapshot_corrupt", "待審候選與作品擁有者不符。")
		}
		pending++
	}
	return pending, nil
}

// UTC calendar days are explicit, durable and independent of Redis/process
// restarts. Every distinct immutable candidate consumes one day's quota even
// after withdrawal/rejection/replacement. An exact retry consumes no new quota.
func (s *HeroService) dailyHeroSubmissions(accountID string, now time.Time) (int, error) {
	ids, err := s.store.Scan(CollectionHeroSnapshots)
	if err != nil {
		return 0, err
	}
	count := 0
	day := now.UTC().Format("2006-01-02")
	for _, id := range ids {
		snapshot, err := s.Snapshot(id)
		if err != nil {
			return 0, err
		}
		if snapshot.AccountID == accountID && snapshot.SubmittedAt.UTC().Format("2006-01-02") == day {
			count++
		}
	}
	return count, nil
}

func (s *HeroService) checkHeroQuota(accountID, workID, submissionID string, policy HeroIntakePolicy) error {
	exists, err := s.store.Exists(CollectionHeroSnapshots, submissionID)
	if err != nil {
		return err
	}
	reservedToday := false
	if exists {
		control, err := s.Control(workID)
		if err != nil {
			return err
		}
		for _, recorded := range control.Submissions {
			if recorded == submissionID {
				return nil
			} // Idempotent; the immutable comparison still verifies bytes.
		}
		// A crash can leave a snapshot before its pending pointer is installed.
		// Resuming that reservation must still compete for a current pending slot.
		snapshot, err := s.Snapshot(submissionID)
		if err != nil {
			return err
		}
		reservedToday = snapshot.AccountID == accountID && snapshot.SubmittedAt.UTC().Format("2006-01-02") == s.now().UTC().Format("2006-01-02")
	}
	pending, err := pendingSubmissions(s.store, accountID, "", workID)
	if err != nil {
		return err
	}
	if pending >= policy.MaxPendingPerPlayer {
		return httpx.RateLimited("待審作品已達目前政策上限；請先等待審查或撤回其他待審稿。")
	}
	daily, err := s.dailyHeroSubmissions(accountID, s.now())
	if err != nil {
		return err
	}
	if reservedToday {
		daily--
	}
	if daily >= policy.QuotaPerPlayerPerDay {
		return httpx.RateLimited("今日英雄投稿已達政策上限；每日 UTC 00:00 重置，原稿仍可編輯。")
	}
	return nil
}
