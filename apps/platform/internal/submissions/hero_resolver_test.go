package submissions

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
)

func TestCommunityResolverRequiresCurrentManualPublication(t *testing.T) {
	s, bridge := heroFixture(t)
	for version, inspection := range bridge.inspections {
		inspection.Project = json.RawMessage(`{"projectId":"hero-proof","brief":{"name":"完整英雄"}}`)
		bridge.inspections[version] = inspection
	}
	first := freezeHero(t, s, "v1")
	if _, err := s.ResolvePublished([]string{"hero-proof"}); err == nil {
		t.Fatal("unreviewed candidate selectable")
	}
	firstControl := publishHero(t, s, first, "publish-v1")
	pins, err := s.ResolvePublished([]string{"hero-proof"})
	if err != nil || len(pins) != 1 || pins[0].SubmissionID != first.ID || pins[0].PackageDigest != first.Version.PackageDigest {
		t.Fatalf("wrong fixed pointer: %v %+v", err, pins)
	}
	second := freezeHero(t, s, "v2")
	if next, err := s.ResolvePublished([]string{"hero-proof"}); err != nil || next[0].SubmissionID != first.ID {
		t.Fatal("pending candidate replaced published version")
	}
	publishHero(t, s, second, "publish-v2")
	if next, err := s.ResolvePublished([]string{"hero-proof"}); err != nil || next[0].SubmissionID != second.ID {
		t.Fatal("new rooms did not select new published version")
	}
	if pins[0].SubmissionID != firstControl.Published.SubmissionID {
		t.Fatal("old room pin mutated")
	}
	if _, err := s.ResolvePublished([]string{"hero-proof", "hero-proof"}); err == nil {
		t.Fatal("duplicate work accepted")
	}
	if _, err := s.Unpublish("hero-proof", "withdraw", "下架驗收", "admin", controlOf(t, s).Revision); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ResolvePublished([]string{"hero-proof"}); err == nil {
		t.Fatal("withdrawn work revived from history")
	}
}

// A transport fixture supplies release identity; durable submissions, approval,
// publication pointers and withdrawal use the actual service.
type rosterBridge struct {
	*workflowBridge
	target json.RawMessage
}

func (b *rosterBridge) Target(context.Context) (json.RawMessage, error) { return b.target, nil }
func (b *rosterBridge) Build(context.Context, []byte) ([]byte, error)   { panic("unused") }

func TestOfficialRosterIncludes37AndPinsOnlyCurrentCompatiblePublications(t *testing.T) {
	s, b := heroFixture(t)
	s.bridge = &rosterBridge{b, json.RawMessage(`{"schema":"ggd-content-target-profile@1","gameVersion":"game","base":{"contentVersion":"content"},"migrationFingerprint":"migration","authoringProcessor":{"fingerprint":"processor"}}`)}
	s.SetIntakePolicy(func() (HeroIntakePolicy, error) {
		return HeroIntakePolicy{Enabled: true, MaxPendingPerPlayer: 50, QuotaPerPlayerPerDay: 100, MaxBytes: 262144}, nil
	})
	for n := 0; n < 37; n++ {
		id := fmt.Sprintf("hero-%02d", n)
		b.inspections[id] = HeroInspection{Schema: "ggd-hero-package-inspection@1", PackageDigest: heroHash(id), Project: json.RawMessage(fmt.Sprintf(`{"projectId":%q,"brief":{"name":%q}}`, id, id)), Manifest: json.RawMessage(`{"base":{"gameRevision":"game","contentVersion":"content"},"migrationFingerprint":"migration","authoringProcessor":{"fingerprint":"processor"}}`), Icons: json.RawMessage(`[]`), Diagnostics: json.RawMessage(`[]`)}
		if _, err := s.SaveDraft("alice", id, 0, heroDraft(id), nil); err != nil {
			t.Fatal(err)
		}
		snap, err := s.Submit(context.Background(), "alice", id, "submit-"+id, []byte(id), false)
		if err != nil {
			t.Fatal(err)
		}
		control, err := s.Control(id)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = s.Publish(context.Background(), snap.ID, "publish-"+id, "publish", "checked", "admin", control.Revision); err != nil {
			t.Fatal(err)
		}
	}
	pins, err := s.ResolveRoster(context.Background())
	if err != nil || len(pins) != 37 {
		t.Fatalf("37 published heroes missing: %d %v", len(pins), err)
	}
	// Saving a draft does not change the active version, even when intake closes.
	s.SetIntakePolicy(func() (HeroIntakePolicy, error) { return HeroIntakePolicy{}, nil })
	if _, err = s.SaveDraft("alice", "hero-00", 1, heroDraft("hero-00"), nil); err != nil {
		t.Fatal(err)
	}
	next, err := s.ResolveRoster(context.Background())
	if err != nil || len(next) != 37 || next[0] != pins[0] {
		t.Fatal("draft or intake changed active version", err)
	}
	control, err := s.Control("hero-00")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.Unpublish("hero-00", "down", "checked", "admin", control.Revision); err != nil {
		t.Fatal(err)
	}
	next, err = s.ResolveRoster(context.Background())
	if err != nil || len(next) != 36 {
		t.Fatal("withdrawn hero remained selectable", err)
	}
	// Historical pins survive and are not mutated by new room resolution.
	if pins[0].WorkID != "hero-00" {
		t.Fatal("previous match pin changed")
	}
	s.bridge.(*rosterBridge).target = json.RawMessage(`{"schema":"ggd-content-target-profile@1","gameVersion":"next-game","base":{"contentVersion":"content"},"migrationFingerprint":"migration","authoringProcessor":{"fingerprint":"processor"}}`)
	if next, err = s.ResolveRoster(context.Background()); err != nil || len(next) != 0 {
		t.Fatal("incompatible release entered match", err)
	}
	s.bridge.(*rosterBridge).target = json.RawMessage(`{}`)
	if _, err = s.ResolveRoster(context.Background()); err == nil {
		t.Fatal("missing target silently accepted")
	}
}
