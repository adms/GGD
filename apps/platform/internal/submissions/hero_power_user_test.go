package submissions

import (
	"context"
	"testing"
)

func TestHeroIntakeCertificationRevokedDuringPrepare(t *testing.T) {
	s, b := heroFixture(t)
	testIntakePolicy(s, 5, 1)
	certified := true
	s.SetAccountIntakePolicy(func(_ context.Context, id string, p HeroIntakePolicy) (HeroIntakePolicy, error) {
		if id != "alice" {
			t.Fatal("wrong quota owner")
		}
		if certified {
			p.QuotaPerPlayerPerDay = 2
		}
		return p, nil
	})
	freezeHero(t, s, "v1")
	b.onPrepare = func() { certified = false }
	if _, err := intakeSubmit(s, "hero-proof", "v2"); err == nil {
		t.Fatal("revoked certification admitted an over-quota candidate")
	}
	count, err := s.dailyHeroSubmissions("alice", s.now())
	if err != nil || count != 1 {
		t.Fatalf("rejected candidate consumed quota: %d %v", count, err)
	}
	certified = true
	if _, err := intakeSubmit(s, "hero-proof", "v2"); err != nil {
		t.Fatal("certified quota not applied", err)
	}
}
