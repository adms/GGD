package opstate

import (
	"testing"
	"time"
)

// A player-facing deploy with an empty whitelist must be FATAL.
func TestBootCheckRefusesEmptyOnFamilyHost(t *testing.T) {
	dst := t.TempDir()
	writeWhitelist(t, dst, []string{}, []string{}, []string{}, time.Now())
	res, err := PlayableBootCheck(BootCheckInput{
		DataDir:    dst,
		Addr:       ":8080", // wildcard bind — reachable
		FamilyTier: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !res.Fatal {
		t.Fatal("an empty whitelist on a family/networked deploy must refuse boot")
	}
	if !contains(res.Message, "empty champion select") {
		t.Fatalf("the refusal must explain the consequence; got %q", res.Message)
	}
}

// A wildcard/networked bind alone (no family tier) is enough to arm the check.
func TestBootCheckRefusesEmptyOnNetworkedBind(t *testing.T) {
	dst := t.TempDir()
	writeWhitelist(t, dst, []string{}, nil, nil, time.Now())
	res, _ := PlayableBootCheck(BootCheckInput{DataDir: dst, Addr: "0.0.0.0:8080"})
	if !res.Fatal {
		t.Fatal("a networked bind with an empty whitelist must refuse boot")
	}
}

// A loopback-only dev bind must stay frictionless: empty whitelist, no refusal.
func TestBootCheckAllowsEmptyOnLoopbackDev(t *testing.T) {
	dst := t.TempDir()
	writeWhitelist(t, dst, []string{}, nil, nil, time.Now())
	for _, addr := range []string{"127.0.0.1:8080", "localhost:8080", "[::1]:8080"} {
		res, err := PlayableBootCheck(BootCheckInput{DataDir: dst, Addr: addr})
		if err != nil {
			t.Fatal(err)
		}
		if res.Fatal {
			t.Fatalf("loopback dev bind %q must not refuse an empty whitelist", addr)
		}
		if res.PlayerFacing {
			t.Fatalf("loopback dev bind %q must not be judged player-facing", addr)
		}
	}
}

// The explicit override lets a networked host boot empty on purpose.
func TestBootCheckOverrideAllowsEmpty(t *testing.T) {
	dst := t.TempDir()
	writeWhitelist(t, dst, []string{}, nil, nil, time.Now())
	res, err := PlayableBootCheck(BootCheckInput{
		DataDir:            dst,
		Addr:               ":8080",
		FamilyTier:         true,
		AllowEmptyOverride: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Fatal {
		t.Fatal("GGD_ALLOW_EMPTY_WHITELIST must permit an empty boot")
	}
}

// A populated whitelist is never fatal, on any bind.
func TestBootCheckPassesWithRoster(t *testing.T) {
	dst := t.TempDir()
	writeWhitelist(t, dst, []string{"godie-e001"}, nil, nil, time.Now())
	res, err := PlayableBootCheck(BootCheckInput{DataDir: dst, Addr: ":8080", FamilyTier: true})
	if err != nil {
		t.Fatal(err)
	}
	if res.Fatal {
		t.Fatal("a populated whitelist must never refuse boot")
	}
	if res.ChampionCount != 1 {
		t.Fatalf("champion count wrong: %d", res.ChampionCount)
	}
}
