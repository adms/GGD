package config

import (
	"testing"
	"time"
)

// #187: the reaper tore down live matches because MatchPendingTTL (30 min) was
// read as "how long a match may run". It was sized against a match that could
// not exceed ~18 minutes with startingLives hardcoded to 3; the owner's
// startingTeamLives=8 averages 33.6 minutes and reaches 42.3 at full
// combatMaxSec. These tests pin the shape of the fix so a later "simplification"
// cannot quietly restore the coupling.

// The blind fallback must NOT be tunable to "long enough for a match" territory
// by accident, and must be far away from any real match length — its only job is
// to stop pending entries leaking when no liveness signal exists at all.
func TestBlindDeadlineIsNotAMatchTimer(t *testing.T) {
	setEnv(t, map[string]string{
		"PLATFORM_ADDR":               "127.0.0.1:8080",
		"JWT_SIGNING_SECRET":          "devsecret",
		"PLATFORM_GAME_SHARED_SECRET": "devseam",
	})
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	// 42.3 minutes is the measured worst case at 8 lives and combatMaxSec 240;
	// 12 lives is 43.2. A blind fallback under an hour is once again a match
	// timer, and the next lives bump silently re-arms #187.
	if cfg.MatchPendingTTL < time.Hour {
		t.Fatalf("MatchPendingTTL=%v is inside the range of a real match — "+
			"a 12-life match measures 43.2 min, so this would reap live games again", cfg.MatchPendingTTL)
	}
	// And it must be far longer than the liveness grace: if they were close, the
	// fallback would be doing the detecting and the heartbeat would be decoration.
	if cfg.MatchPendingTTL < 5*cfg.MatchLivenessGrace {
		t.Fatalf("MatchPendingTTL=%v is not clearly longer than the liveness grace %v",
			cfg.MatchPendingTTL, cfg.MatchLivenessGrace)
	}
}

// The grace is what a real death costs in detection latency, so it must stay
// small — but never so small that a couple of dropped 30s heartbeats look like
// a crash.
func TestLivenessGraceDefaultAndBounds(t *testing.T) {
	setEnv(t, map[string]string{
		"PLATFORM_ADDR":               "127.0.0.1:8080",
		"JWT_SIGNING_SECRET":          "devsecret",
		"PLATFORM_GAME_SHARED_SECRET": "devseam",
	})
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.MatchLivenessGrace != DefaultLivenessGrace {
		t.Fatalf("MatchLivenessGrace=%v, want the compiled default %v", cfg.MatchLivenessGrace, DefaultLivenessGrace)
	}
	if DefaultLivenessGrace < 4*(30*time.Second) {
		t.Fatalf("the grace %v tolerates fewer than four missed 30s heartbeats", DefaultLivenessGrace)
	}
}

// A mistyped or hostile GGD_MATCH_LIVENESS_GRACE_SEC must not become the new
// #187: neither a zero that reaps everything instantly nor a 30-minute value
// that turns the grace back into a match timer.
func TestLivenessGraceEnvIsClampedNotObeyed(t *testing.T) {
	for _, tc := range []struct {
		raw  string
		want time.Duration
	}{
		{"", DefaultLivenessGrace},
		{"nonsense", DefaultLivenessGrace},
		{"0", MinLivenessGrace},
		{"-1", MinLivenessGrace},
		{"1", MinLivenessGrace},
		{"120", 2 * time.Minute},
		{"99999", MaxLivenessGrace},
	} {
		t.Setenv("GGD_MATCH_LIVENESS_GRACE_SEC", tc.raw)
		got := getenvSeconds("GGD_MATCH_LIVENESS_GRACE_SEC", DefaultLivenessGrace, MinLivenessGrace, MaxLivenessGrace)
		if got != tc.want {
			t.Fatalf("GGD_MATCH_LIVENESS_GRACE_SEC=%q -> %v, want %v", tc.raw, got, tc.want)
		}
	}
}
