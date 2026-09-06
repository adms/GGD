package submissions

import (
	"encoding/json"
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
