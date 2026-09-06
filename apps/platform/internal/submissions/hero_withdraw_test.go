package submissions

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/ggd/platform/internal/data/jsonstore"
)

func TestHeroWithdrawPreservesPublicationAndSurvivesRestart(t *testing.T) {
	s, _ := heroFixture(t)
	first := freezeHero(t, s, "v1")
	publishHero(t, s, first, "publish-v1")
	next := freezeHero(t, s, "v2")
	before := controlOf(t, s)
	withdrawn, err := s.Withdraw(next.ID, "alice", before.Revision)
	if err != nil {
		t.Fatal(err)
	}
	if withdrawn.PendingSubmission != "" || withdrawn.Revision != before.Revision+1 || heroHash(withdrawn.Published) != heroHash(before.Published) || heroHash(withdrawn.History) != heroHash(before.History) || withdrawn.PublicationEpoch != before.PublicationEpoch || heroHash(withdrawn.Submissions) != heroHash(before.Submissions) || heroHash(withdrawn.Reviews) != heroHash(before.Reviews) {
		t.Fatalf("withdrawal changed reviewed content or publication: %+v", withdrawn)
	}
	saved, err := s.Snapshot(next.ID)
	if err != nil || heroHash(saved) != heroHash(next) {
		t.Fatal("immutable candidate changed", err)
	}
	store, err := jsonstore.New(s.store.Root())
	if err != nil {
		t.Fatal(err)
	}
	reopened := NewHeroService(store, nil)
	view, err := reopened.Review(next.ID)
	if err != nil || view.Status != "withdrawn" || view.Decision != nil {
		t.Fatalf("withdrawal is not an admin verdict: %+v %v", view, err)
	}
	retry, err := reopened.Withdraw(next.ID, "alice", before.Revision)
	if err != nil || heroHash(retry) != heroHash(withdrawn) {
		t.Fatal("retry was not idempotent", err)
	}
	third := freezeHero(t, s, "v3")
	current := controlOf(t, s)
	retry, err = s.Withdraw(next.ID, "alice", before.Revision)
	if err != nil || retry.PendingSubmission != third.ID || heroHash(retry) != heroHash(current) {
		t.Fatal("old retry removed new candidate", err)
	}
}

func TestHeroWithdrawCannotResurrectOrReviewCandidate(t *testing.T) {
	s, _ := heroFixture(t)
	snapshot := freezeHero(t, s, "v1")
	before := controlOf(t, s)
	if _, err := s.Withdraw(snapshot.ID, "alice", before.Revision); err != nil {
		t.Fatal(err)
	}
	withdrawn := controlOf(t, s)
	if _, err := s.Submit(context.Background(), "alice", "hero-proof", "retry-after-withdraw", []byte("v1"), true); err == nil {
		t.Fatal("withdrawn candidate resubmitted")
	}
	if _, err := s.DecideHero(snapshot.ID, "returned", "too late", "admin", withdrawn.Revision, nil); err == nil {
		t.Fatal("withdrawn candidate reviewed")
	}
	if _, err := s.Publish(context.Background(), snapshot.ID, "publish-after-withdraw", "publish", "too late", "admin", withdrawn.Revision); err == nil {
		t.Fatal("withdrawn candidate published")
	}
	if heroHash(controlOf(t, s)) != heroHash(withdrawn) {
		t.Fatal("failed actions changed control")
	}
}

func TestHeroWithdrawAndDecisionCASRace(t *testing.T) {
	for i := 0; i < 12; i++ {
		s, _ := heroFixture(t)
		snapshot := freezeHero(t, s, "v1")
		revision := controlOf(t, s).Revision
		s.now = time.Now // The fixture's incrementing clock is intentionally single-threaded.
		start := make(chan struct{})
		var wait sync.WaitGroup
		var withdrawalError, decisionError error
		wait.Add(2)
		go func() { defer wait.Done(); <-start; _, withdrawalError = s.Withdraw(snapshot.ID, "alice", revision) }()
		go func() {
			defer wait.Done()
			<-start
			_, decisionError = s.DecideHero(snapshot.ID, "returned", "adjust Q", "admin", revision, nil)
		}()
		close(start)
		wait.Wait()
		if (withdrawalError == nil) == (decisionError == nil) {
			t.Fatalf("exactly one CAS must win: withdraw=%v review=%v", withdrawalError, decisionError)
		}
		view, err := s.Review(snapshot.ID)
		if err != nil {
			t.Fatal(err)
		}
		if withdrawalError == nil && (view.Status != "withdrawn" || view.Decision != nil) || decisionError == nil && view.Status != "returned" {
			t.Fatalf("wrong winner: %+v", view)
		}
	}
}

func TestHeroWithdrawRejectsPublishingOrReviewedCandidate(t *testing.T) {
	for _, status := range []string{"returned", "rejected", "publish-failed", "published"} {
		t.Run(status, func(t *testing.T) {
			s, bridge := heroFixture(t)
			snapshot := freezeHero(t, s, "v1")
			if status == "returned" || status == "rejected" {
				if _, err := s.DecideHero(snapshot.ID, status, "reviewed", "admin", controlOf(t, s).Revision, nil); err != nil {
					t.Fatal(err)
				}
			} else {
				bridge.failPrepare = status == "publish-failed"
				_, err := s.Publish(context.Background(), snapshot.ID, "publish", "publish", "checked", "admin", controlOf(t, s).Revision)
				if (err != nil) != bridge.failPrepare {
					t.Fatal(err)
				}
			}
			before := controlOf(t, s)
			if _, err := s.Withdraw(snapshot.ID, "alice", before.Revision); err == nil {
				t.Fatal("reviewed candidate withdrawn")
			}
			if heroHash(controlOf(t, s)) != heroHash(before) {
				t.Fatal("failed withdrawal changed control")
			}
		})
	}
	s, bridge := heroFixture(t)
	snapshot := freezeHero(t, s, "v1")
	bridge.onInspect = func() {
		if _, err := s.Withdraw(snapshot.ID, "alice", controlOf(t, s).Revision); err == nil {
			t.Error("in-flight approved publication was withdrawn")
		}
	}
	publishHero(t, s, snapshot, "inflight-publish")
}

func TestHeroWithdrawHTTPAuthorIdentityAndDisabledIntake(t *testing.T) {
	s, _ := heroFixture(t)
	snapshot := freezeHero(t, s, "v1")
	enabled := false // Turning off intake must not trap an author's existing pending work.
	router := heroHTTP(t, s, &enabled)
	path := "/hero-submissions/" + snapshot.ID + "/withdraw"
	body, _ := json.Marshal(map[string]any{"expectedRevision": controlOf(t, s).Revision})
	for _, test := range []struct {
		actor, body string
		code        int
	}{
		{"", string(body), 401}, {"bob", string(body), 403}, {"admin", string(body), 403},
		{"alice", `{"expectedRevision":0}`, 409}, {"alice", `{"expectedRevision":-1}`, 409},
		{"alice", `{"expectedRevision":1,"accountId":"admin"}`, 400},
		{"alice", string(body), 200}, {"alice", string(body), 200},
	} {
		response := heroRequest(router, "POST", path, test.actor, test.body)
		if response.Code != test.code {
			t.Fatalf("%s %s: %d %s", test.actor, test.body, response.Code, response.Body.String())
		}
	}
}
