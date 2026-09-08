package submissions

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/ggd/platform/internal/data/jsonstore"
)

// These tests exercise the durable workflow; Main's real ZIP/compiler tests cover the bridge content.
type workflowBridge struct {
	inspections  map[string]HeroInspection
	archives     map[string][]byte
	failPrepare  bool
	inspectError error
	onInspect    func()
	onPrepare    func()
}

func (b *workflowBridge) Inspect(_ context.Context, archive []byte) (HeroInspection, error) {
	if b.onInspect != nil {
		fn := b.onInspect
		b.onInspect = nil
		fn()
	}
	if b.inspectError != nil {
		return HeroInspection{}, b.inspectError
	}
	return b.inspections[string(archive)], nil
}
func (b *workflowBridge) Prepare(_ context.Context, workID, _ string, archive []byte) (HeroStoredVersion, error) {
	if b.onPrepare != nil {
		fn := b.onPrepare
		b.onPrepare = nil
		fn()
	}
	if b.failPrepare {
		return HeroStoredVersion{}, errors.New("injected placement failure")
	}
	inspection := b.inspections[string(archive)]
	b.archives[inspection.PackageDigest] = archive
	return HeroStoredVersion{Schema: "ggd-work-version@1", WorkID: workID, ProjectID: workID, VersionID: inspection.PackageDigest, PackageDigest: inspection.PackageDigest, SnapshotDigest: heroHash([]string{workID, string(archive)}), Files: []HeroFile{{Path: "compiled/hero.json", SHA256: heroHash(string(archive)), Bytes: len(archive)}}}, nil
}
func (b *workflowBridge) Package(_ context.Context, _, version string) ([]byte, error) {
	return b.archives[version], nil
}
func (b *workflowBridge) File(context.Context, string, string, string) ([]byte, string, error) {
	return nil, "", nil
}
func heroFixture(t *testing.T) (*HeroService, *workflowBridge) {
	t.Helper()
	store, err := jsonstore.New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	b := &workflowBridge{inspections: map[string]HeroInspection{}, archives: map[string][]byte{}}
	for _, version := range []string{"v1", "v2", "v3"} {
		b.inspections[version] = HeroInspection{Schema: "ggd-hero-package-inspection@1", PackageDigest: heroHash(version), Project: json.RawMessage(`{"projectId":"hero-proof","concept":"第一行\n完整台詞"}`), Manifest: json.RawMessage(`{"schema":"fixture"}`), Icons: json.RawMessage(`[]`), Diagnostics: json.RawMessage(`[]`)}
	}
	s := NewHeroService(store, b)
	s.SetIntakePolicy(func() (HeroIntakePolicy, error) {
		return HeroIntakePolicy{Enabled: true, MaxPendingPerPlayer: 5, QuotaPerPlayerPerDay: 20, MaxBytes: 262144}, nil
	})
	clock := time.Date(2026, 9, 6, 0, 0, 0, 0, time.UTC)
	s.now = func() time.Time { clock = clock.Add(time.Second); return clock }
	if _, err := s.SaveDraft("alice", "hero-proof", 0, heroDraft("hero-proof"), nil); err != nil {
		t.Fatal(err)
	}
	return s, b
}
func heroDraft(id string) json.RawMessage {
	return json.RawMessage(`{"project":{"schema":"ggd-hero-project@2","projectId":"` + id + `"},"rawInputs":{"cooldown":{"kind":"number","text":"1e"}}}`)
}
func freezeHero(t *testing.T, s *HeroService, version string) HeroSnapshot {
	t.Helper()
	snapshot, err := s.Submit(context.Background(), "alice", "hero-proof", "submit-"+version, []byte(version), true)
	if err != nil {
		t.Fatal(err)
	}
	return snapshot
}
func controlOf(t *testing.T, s *HeroService) HeroControl {
	t.Helper()
	value, err := s.Control("hero-proof")
	if err != nil {
		t.Fatal(err)
	}
	return value
}
func publishHero(t *testing.T, s *HeroService, snapshot HeroSnapshot, operation string) HeroControl {
	t.Helper()
	value, err := s.Publish(context.Background(), snapshot.ID, operation, "publish", "完整英雄審查通過", "admin", controlOf(t, s).Revision)
	if err != nil {
		t.Fatal(err)
	}
	return value
}

func TestHeroDraftOwnerCASAndRestart(t *testing.T) {
	s, _ := heroFixture(t)
	if _, err := s.SaveDraft("bob", "hero-proof", 1, heroDraft("hero-proof"), nil); err == nil {
		t.Fatal("other account replaced draft")
	}
	if _, err := s.SaveDraft("alice", "hero-proof", 0, heroDraft("hero-proof"), nil); err == nil {
		t.Fatal("stale draft replaced current")
	}
	if _, err := s.SaveDraft("alice", "different-id", 0, heroDraft("hero-proof"), nil); err == nil {
		t.Fatal("mismatched identity accepted")
	}
	store, err := jsonstore.New(s.store.Root())
	if err != nil {
		t.Fatal(err)
	}
	reopened := NewHeroService(store, nil)
	work, err := reopened.Work("hero-proof")
	if err != nil {
		t.Fatal(err)
	}
	if work.OwnerID != "alice" || work.DraftRevision != 1 {
		t.Fatalf("wrong restored work: %+v", work)
	}
	var payload map[string]any
	if json.Unmarshal(work.Draft, &payload) != nil || payload["rawInputs"] == nil {
		t.Fatal("raw input lost")
	}
}

func TestHeroImmutableSubmissionAndOldRequestDoesNotReplaceNewPending(t *testing.T) {
	s, _ := heroFixture(t)
	first := freezeHero(t, s, "v1")
	second := freezeHero(t, s, "v2")
	if _, err := s.Submit(context.Background(), "bob", "hero-proof", "attack", []byte("v1"), true); err == nil {
		t.Fatal("other account submitted work")
	}
	if _, err := s.Submit(context.Background(), "alice", "hero-proof", "change-rights", []byte("v1"), false); err == nil {
		t.Fatal("immutable rights changed")
	}
	replayed := freezeHero(t, s, "v1")
	if replayed.ID != first.ID || controlOf(t, s).PendingSubmission != second.ID {
		t.Fatal("old retry displaced current candidate")
	}
	legacy := New(s.store)
	legacy.SetDigestRecompute(func() bool { return false })
	if _, err := legacy.Submit(Material{ID: first.ID, AccountID: "alice", Kind: "ability", Payload: `{}`, Digest: "new"}); err == nil {
		t.Fatal("legacy write replaced hero snapshot material")
	}
	if _, err := legacy.Decide(first.ID, StatusApproved, "", "admin"); err == nil {
		t.Fatal("legacy approval bypassed hero workflow")
	}
}

func TestHeroPublicationFailureRetryAndIdempotentCompletion(t *testing.T) {
	s, b := heroFixture(t)
	snapshot := freezeHero(t, s, "v1")
	revision := controlOf(t, s).Revision
	b.failPrepare = true
	failed, err := s.Publish(context.Background(), snapshot.ID, "publish-one", "publish", "checked", "admin", revision)
	if err == nil || failed.Published != nil || failed.Reviews[snapshot.ID].Status != StatusApproved || failed.Operations["publish-one"].Status != "failed" {
		t.Fatalf("approval confused with publication: %+v %v", failed, err)
	}
	b.failPrepare = false
	published, err := s.Publish(context.Background(), snapshot.ID, "publish-one", "publish", "checked", "admin", revision)
	if err != nil {
		t.Fatal(err)
	}
	if published.Published == nil || published.Published.Version.VersionID != snapshot.Version.VersionID || len(published.History) != 1 {
		t.Fatal("publication did not point at reviewed version")
	}
	b.inspectError = errors.New("unavailable after completion")
	retry, err := s.Publish(context.Background(), snapshot.ID, "publish-one", "publish", "checked", "other-admin", revision)
	if err != nil || len(retry.History) != 1 {
		t.Fatalf("completed request was applied again: %+v %v", retry, err)
	}
	if _, err := s.Publish(context.Background(), snapshot.ID, "publish-one", "publish", "different input", "admin", revision); err == nil {
		t.Fatal("operation input was replaced")
	}
}

func TestHeroFailedUpgradeKeepsOldVersionAndReturnInvalidatesInflightApproval(t *testing.T) {
	s, b := heroFixture(t)
	first := freezeHero(t, s, "v1")
	publishHero(t, s, first, "publish-v1")
	next := freezeHero(t, s, "v2")
	b.inspectError = &HeroBridgeError{Status: 422, Message: "target changed"}
	failed, err := s.Publish(context.Background(), next.ID, "publish-v2", "publish", "checked", "admin", controlOf(t, s).Revision)
	if err == nil || failed.Published == nil || failed.Published.SubmissionID != first.ID || failed.Operations["publish-v2"].Status != "stale" {
		t.Fatal("failed upgrade removed old version")
	}
	b.inspectError = nil
	b.onInspect = func() {
		_, err := s.DecideHero(next.ID, "returned", "Q 動作需要調整", "reviewer", controlOf(t, s).Revision, []HeroProblem{{Slot: "Q", Field: "presentation.slots.Q.script", Message: "施法時沒有讀到起手動作"}})
		if err != nil {
			t.Error(err)
		}
	}
	_, err = s.Publish(context.Background(), next.ID, "publish-v2b", "publish", "checked", "admin", controlOf(t, s).Revision)
	if err == nil || controlOf(t, s).Published.SubmissionID != first.ID || controlOf(t, s).Reviews[next.ID].Status != "returned" {
		t.Fatal("changed human decision was overwritten by in-flight publication")
	}
}

func TestHeroUnpublishRestoreAndRemixRights(t *testing.T) {
	s, _ := heroFixture(t)
	snapshot := freezeHero(t, s, "v1")
	source := &HeroSource{WorkID: "hero-proof", SubmissionID: snapshot.ID}
	if _, err := s.SaveDraft("bob", "remix-proof", 0, heroDraft("remix-proof"), source); err == nil {
		t.Fatal("unpublished work could be remixed")
	}
	published := publishHero(t, s, snapshot, "publish-v1")
	remix, err := s.SaveDraft("bob", "remix-proof", 0, heroDraft("remix-proof"), source)
	if err != nil || remix.Source.AuthorID != "alice" || remix.Source.PackageDigest != snapshot.Version.PackageDigest {
		t.Fatalf("verified lineage missing: %+v %v", remix, err)
	}
	down, err := s.Unpublish("hero-proof", "down-v1", "需要修正", "admin", published.Revision)
	if err != nil || down.Published != nil || len(down.History) != 1 {
		t.Fatalf("unpublish destroyed historical version: %+v %v", down, err)
	}
	if _, err := s.SaveDraft("eve", "other-remix", 0, heroDraft("other-remix"), source); err == nil {
		t.Fatal("unpublished source accepted new remix")
	}
	if saved, err := s.SaveDraft("bob", "remix-proof", remix.DraftRevision, heroDraft("remix-proof"), remix.Source); err != nil || saved.DraftRevision != remix.DraftRevision+1 || heroHash(saved.Source) != heroHash(remix.Source) {
		t.Fatalf("existing attributed remix cannot keep editing after source unpublish: %+v %v", saved, err)
	}
	restored, err := s.Publish(context.Background(), snapshot.ID, "restore-v1", "restore", "回復完整相容版本", "admin", down.Revision)
	if err != nil || restored.Published == nil || restored.Published.Version.VersionID != snapshot.Version.VersionID {
		t.Fatalf("restore failed: %+v %v", restored, err)
	}
}
