package submissions

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func intakeCandidate(t *testing.T, s *HeroService, b *workflowBridge, workID, key string) {
	t.Helper()
	if _, err := s.SaveDraft("alice", workID, 0, heroDraft(workID), nil); err != nil {
		t.Fatal(err)
	}
	b.inspections[key] = HeroInspection{Schema: "ggd-hero-package-inspection@1", PackageDigest: heroHash(key), Project: json.RawMessage(`{"projectId":"` + workID + `"}`), Manifest: json.RawMessage(`{}`), Icons: json.RawMessage(`[]`), Diagnostics: json.RawMessage(`[]`)}
}
func intakeSubmit(s *HeroService, workID, key string) (HeroSnapshot, error) {
	return s.Submit(context.Background(), "alice", workID, "submit-"+key, []byte(key), true)
}
func testIntakePolicy(s *HeroService, pending, daily int) {
	s.SetIntakePolicy(func() (HeroIntakePolicy, error) {
		return HeroIntakePolicy{Enabled: true, MaxPendingPerPlayer: pending, QuotaPerPlayerPerDay: daily, MaxBytes: 262144}, nil
	})
}

func TestHeroIntakeCountsCurrentCandidatesAndLegacyQueue(t *testing.T) {
	s, b := heroFixture(t)
	testIntakePolicy(s, 2, 20)
	freezeHero(t, s, "v1")
	second := freezeHero(t, s, "v2")
	legacy := New(s.store)
	legacy.SetDigestRecompute(func() bool { return false })
	m := mat("legacy", "digest")
	m.AccountID = "alice"
	if _, err := legacy.Submit(m); err != nil {
		t.Fatal(err)
	}
	intakeCandidate(t, s, b, "hero-other", "other")
	if _, err := intakeSubmit(s, "hero-other", "other"); err == nil {
		t.Fatal("pending limit bypassed")
	}
	if _, placed := b.archives[heroHash("other")]; placed {
		t.Fatal("over-quota candidate placed before rejection")
	}
	if _, err := s.Withdraw(second.ID, "alice", controlOf(t, s).Revision); err != nil {
		t.Fatal(err)
	}
	if _, err := intakeSubmit(s, "hero-other", "other"); err != nil {
		t.Fatal("withdrawal did not release the pending slot", err)
	}
	if count, err := pendingSubmissions(s.store, "alice", "", ""); err != nil || count != 2 {
		t.Fatalf("historical hero materials counted as pending: %d %v", count, err)
	}
	// A lost derived index must not reset the quota.
	for _, collection := range []string{CollectionMaterial, CollectionHeroWorks, CollectionHeroSnapshots} {
		if err := os.Remove(filepath.Join(s.store.Root(), collection, "_index.json")); err != nil {
			t.Fatal(err)
		}
	}
	intakeCandidate(t, s, b, "hero-third", "third")
	if _, err := intakeSubmit(s, "hero-third", "third"); err == nil {
		t.Fatal("missing index granted capacity")
	}
}

func TestHeroIntakeDailyQuotaSurvivesWithdrawRestartAndExactRetries(t *testing.T) {
	s, b := heroFixture(t)
	testIntakePolicy(s, 2, 2)
	first := freezeHero(t, s, "v1")
	second := freezeHero(t, s, "v2")
	if _, err := s.Withdraw(second.ID, "alice", controlOf(t, s).Revision); err != nil {
		t.Fatal(err)
	}
	reopened := NewHeroService(s.store, b)
	testIntakePolicy(reopened, 2, 2)
	reopened.now = func() time.Time { return time.Date(2026, 9, 6, 23, 59, 0, 0, time.UTC) }
	if retry, err := intakeSubmit(reopened, "hero-proof", "v1"); err != nil || retry.ID != first.ID {
		t.Fatal("exact historical retry charged again", err)
	}
	if _, err := intakeSubmit(reopened, "hero-proof", "v3"); err == nil {
		t.Fatal("withdrawal or restart reset the daily quota")
	}
	reopened.now = func() time.Time { return time.Date(2026, 9, 7, 0, 0, 0, 0, time.UTC) }
	if _, err := intakeSubmit(reopened, "hero-proof", "v3"); err != nil {
		t.Fatal("new UTC day remained blocked", err)
	}
}

func TestHeroIntakeConcurrentLastSlotHasOneWinner(t *testing.T) {
	for _, limits := range [][2]int{{1, 20}, {20, 1}} {
		s, b := heroFixture(t)
		testIntakePolicy(s, limits[0], limits[1])
		intakeCandidate(t, s, b, "hero-a", "candidate-a")
		intakeCandidate(t, s, b, "hero-b", "candidate-b")
		s.now = time.Now
		other := NewHeroService(s.store, b)
		testIntakePolicy(other, limits[0], limits[1])
		other.now = time.Now
		var errs [2]error
		var wait sync.WaitGroup
		start := make(chan struct{})
		wait.Add(2)
		go func() { defer wait.Done(); <-start; _, errs[0] = intakeSubmit(s, "hero-a", "candidate-a") }()
		go func() { defer wait.Done(); <-start; _, errs[1] = intakeSubmit(other, "hero-b", "candidate-b") }()
		close(start)
		wait.Wait()
		if (errs[0] == nil) == (errs[1] == nil) {
			t.Fatalf("quota %v must have one winner: %v", limits, errs)
		}
		if len(b.archives) != 1 {
			t.Fatal("rejected request placed a second version")
		}
	}
}

func TestHeroIntakeCrashReservationCannotBypassPendingQuota(t *testing.T) {
	s, b := heroFixture(t)
	testIntakePolicy(s, 1, 2)
	freezeHero(t, s, "v1")
	// Simulate durable snapshot/material but no committed pending pointer.
	if err := s.store.Delete(CollectionPromotion, heroKey("hero-proof")); err != nil {
		t.Fatal(err)
	}
	intakeCandidate(t, s, b, "hero-other", "other")
	if _, err := intakeSubmit(s, "hero-other", "other"); err != nil {
		t.Fatal(err)
	}
	if _, err := intakeSubmit(s, "hero-proof", "v1"); err == nil {
		t.Fatal("orphan snapshot bypassed current pending cap")
	}
}

func TestHeroIntakeMissingDisabledSizeAndPolicyChangeFailBeforePlacement(t *testing.T) {
	for _, scenario := range []string{"missing", "disabled", "size", "changed"} {
		t.Run(scenario, func(t *testing.T) {
			s, b := heroFixture(t)
			policy := HeroIntakePolicy{Enabled: true, MaxPendingPerPlayer: 5, QuotaPerPlayerPerDay: 20, MaxBytes: 262144}
			s.SetIntakePolicy(func() (HeroIntakePolicy, error) { return policy, nil })
			switch scenario {
			case "missing":
				s.SetIntakePolicy(nil)
			case "disabled":
				policy.Enabled = false
			case "size":
				policy.MaxBytes = 1
			case "changed":
				b.onInspect = func() { policy.Enabled = false }
			}
			if _, err := intakeSubmit(s, "hero-proof", "v1"); err == nil {
				t.Fatal("invalid policy allowed intake")
			}
			if len(b.archives) != 0 || len(controlOf(t, s).Submissions) != 0 {
				t.Fatal("rejected request left an accepted candidate")
			}
		})
	}
}

func TestHeroIntakePolicyHTTPIsAuthenticatedAndReflectsBothSwitches(t *testing.T) {
	s, _ := heroFixture(t)
	enabled := true
	router := heroHTTP(t, s, &enabled)
	if got := heroRequest(router, "GET", "/hero-submissions/policy", "", "").Code; got != 401 {
		t.Fatal(got)
	}
	for _, intakeEnabled := range []bool{true, false} {
		enabled = intakeEnabled
		response := heroRequest(router, "GET", "/hero-submissions/policy", "alice", "")
		var policy HeroIntakePolicy
		if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &policy) != nil || policy.Enabled != enabled || policy.MaxPendingPerPlayer != 5 {
			t.Fatal(response.Body.String())
		}
	}
}

func TestHeroIntakePolicyClosureDuringPreparationDoesNotEnterReviewQueue(t *testing.T) {
	s, b := heroFixture(t)
	policy := HeroIntakePolicy{Enabled: true, MaxPendingPerPlayer: 5, QuotaPerPlayerPerDay: 20, MaxBytes: 262144}
	s.SetIntakePolicy(func() (HeroIntakePolicy, error) { return policy, nil })
	b.onPrepare = func() { policy.Enabled = false }
	if _, err := intakeSubmit(s, "hero-proof", "v1"); err == nil {
		t.Fatal("disabled policy accepted a candidate")
	}
	if len(controlOf(t, s).Submissions) != 0 {
		t.Fatal("policy closure failed to stop the pending pointer")
	}
	ids, err := s.store.Scan(CollectionHeroSnapshots)
	if err != nil || len(ids) != 0 {
		t.Fatal("rejected candidate consumed durable daily quota", err)
	}
}
