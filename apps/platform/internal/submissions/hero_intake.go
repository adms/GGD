package submissions

import (
	"context"
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
	PowerUserQuotaPerDay int  `json:"-"`
	Enabled              bool `json:"enabled"`
	MaxPendingPerPlayer  int  `json:"maxPendingPerPlayer"`
	QuotaPerPlayerPerDay int  `json:"quotaPerPlayerPerDay"`
	MaxBytes             int  `json:"maxBytes"`
	ModelUploadsEnabled  bool `json:"modelUploadsEnabled"`
	ModelMaxBytes        int  `json:"modelMaxBytes"`

	// ⭐⭐ GH#1157 —— **已發布英雄的「收據」要對哪幾欄。**
	//
	// ⛔ 在此之前是**四欄結構相等**,而四欄裡有三欄每天轉幾十次:
	//   實測(2026-09-10):只改 `content/config/ugc.json` 的一個 `note` **字串**、
	//   跑一次 `pnpm content:build` ⇒ `contentVersion` 與 `processorFingerprint`
	//   **兩欄同時轉** ⇒ ⭐ 已上架的社群英雄全部對不上 ⇒ **玩家那邊消失,而且沒有訊息**。
	//
	// ⭐ 逐欄問「它變的時候,那名英雄真的壞了嗎」:
	//   · `gameVersion`          每次部署變 —— ⛔ 不,部署不會改那名英雄的 JSON
	//   · `contentVersion`       每次 content:build 變 —— ⛔ 不,別人的內容與他無關
	//   · `processorFingerprint` 匯入器實作變 —— ⛔ 不,他**已經匯入完了**
	//   · ⭐ `migrationFingerprint` schema 遷移集合變 —— ⭐ **會**,舊文件需要被轉換
	//
	// ⇒ 出貨 `migration`。⭐ `strict` 是**一鍵 rollback**(逐位元組等於舊行為)。
	HeroTargetMatch HeroTargetMatch `json:"heroTargetMatch"`
}

// ⭐ 收據比對的三檔。⛔ 字串值與 `config.ugc@1` 的 enum **逐字相同**（唯一住處）。
type HeroTargetMatch string

const (
	// ⭐ 出貨:只比 `migrationFingerprint` —— 四欄裡唯一在回答「這名英雄需不需要轉換」的那一欄。
	HeroTargetMatchMigration HeroTargetMatch = "migration"
	// 想讓每次部署都重新驗一次時用。
	HeroTargetMatchGameAndMigration HeroTargetMatch = "game-and-migration"
	// ⭐ **一鍵 rollback** —— 四欄全等,逐位元組等於 2026-09-10 之前的行為。
	HeroTargetMatchStrict HeroTargetMatch = "strict"
)

// ⭐⭐ **唯一的判準。** ⛔ 四個比對點都呼叫它,⛔ 不各自寫一份 if
// （第〇·四守則:同一份知識只有一個住處）。
//
// ⭐ 回傳第二個值是**哪一欄不合** —— 因為 `hero_resolver.go` 的空清單在此之前是
// **靜默**的,而 CLAUDE.md 逐字說「fail-open 沒錯,**靜默**才是缺陷」。
func (m HeroTargetMatch) Matches(row, target heroListTarget) (bool, string) {
	if row.MigrationFingerprint != target.MigrationFingerprint {
		return false, "migrationFingerprint"
	}
	switch m {
	case HeroTargetMatchStrict:
		if row.GameRevision != target.GameRevision {
			return false, "gameRevision"
		}
		if row.ContentVersion != target.ContentVersion {
			return false, "contentVersion"
		}
		if row.ProcessorFingerprint != target.ProcessorFingerprint {
			return false, "processorFingerprint"
		}
	case HeroTargetMatchGameAndMigration:
		if row.GameRevision != target.GameRevision {
			return false, "gameRevision"
		}
	}
	return true, ""
}

func heroArchiveLimit(policy HeroIntakePolicy, uploadedModel bool) int {
	if uploadedModel && policy.ModelUploadsEnabled && policy.ModelMaxBytes >= 4096 && policy.ModelMaxBytes <= MaxHeroArchiveBytes {
		return policy.ModelMaxBytes
	}
	return policy.MaxBytes
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

func (s *HeroService) SetAccountIntakePolicy(resolve func(context.Context, string, HeroIntakePolicy) (HeroIntakePolicy, error)) {
	s.accountIntakePolicy = resolve
}

func (s *HeroService) IntakePolicyForAccount(ctx context.Context, accountID string) (HeroIntakePolicy, error) {
	policy, err := s.IntakePolicy()
	if err != nil || s.accountIntakePolicy == nil {
		return policy, err
	}
	return s.accountIntakePolicy(ctx, accountID, policy)
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
