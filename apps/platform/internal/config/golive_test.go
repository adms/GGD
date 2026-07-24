package config

import (
	"strings"
	"testing"
)

// golive_test.go exercises Load() ITSELF — the function the real binary calls —
// rather than the individual predicates the other tests cover. The predicates
// being right does not prove Load calls them, and "the boot path" is the only
// thing an operator actually runs.

// setEnv installs a whole environment for one test (t.Setenv restores it).
func setEnv(t *testing.T, kv map[string]string) {
	t.Helper()
	// Everything Load reads that could leak in from the developer's shell.
	for _, k := range []string{
		"PLATFORM_ADDR", "JWT_SIGNING_SECRET", "PLATFORM_GAME_SHARED_SECRET",
		"REDIS_PASSWORD", "REDIS_ADDR", "DATA_DIR", "CONTENT_DIR",
		"GGD_REQUIRE_INVITE", "GGD_REQUIRE_APPROVAL", "GGD_DEPLOY_TIER",
	} {
		t.Setenv(k, "")
	}
	for k, v := range kv {
		t.Setenv(k, v)
	}
}

// THE GO-LIVE MISTAKE, AS A TEST: the owner copies his working local
// environment onto the family host and changes only the listen address. #176's
// guard must stop that boot dead, naming the variable and the fix.
func TestLoadRefusesLaunchJSONSecretsOnANetworkedBind(t *testing.T) {
	setEnv(t, map[string]string{
		"PLATFORM_ADDR":               ":8080",
		"JWT_SIGNING_SECRET":          "devsecret", // .claude/launch.json
		"PLATFORM_GAME_SHARED_SECRET": "devseam",   // .claude/launch.json
		"REDIS_PASSWORD":              strongSecret,
	})
	_, err := Load()
	if err == nil {
		t.Fatal("Load() accepted the launch.json dev secrets on a networked bind — #176's guard is not on the boot path")
	}
	if !strings.Contains(err.Error(), "JWT_SIGNING_SECRET") || !strings.Contains(err.Error(), SecretGenCommand) {
		t.Fatalf("the message must name the variable and the generator command: %v", err)
	}
}

// The same environment on the local development bind keeps working — the guard
// must not have made .claude/launch.json un-runnable.
func TestLoadKeepsLocalDevelopmentWorking(t *testing.T) {
	setEnv(t, map[string]string{
		"PLATFORM_ADDR":               "127.0.0.1:8080",
		"JWT_SIGNING_SECRET":          "devsecret",
		"PLATFORM_GAME_SHARED_SECRET": "devseam",
	})
	cfg, err := Load()
	if err != nil {
		t.Fatalf("the loopback dev configuration must still boot, got: %v", err)
	}
	// …and on loopback BOTH registration gates are off, so the owner is not
	// minting invite codes and approving accounts to test his own game (#127
	// tiering: a loopback socket has no remote peer to keep out).
	if cfg.RequireInvite {
		t.Error("the invite gate must be off on a loopback-only dev bind")
	}
	if cfg.RequireApproval {
		t.Error("the approval gate must be off on a loopback-only dev bind")
	}
}

// A networked deploy that declares NOTHING about registration comes up with
// BOTH gates on. This is the property that makes forgetting an env var safe:
// the failure mode is "my cousin waits for me", never "the internet is in".
func TestLoadDefaultsBothRegistrationGatesOnWhenNetworked(t *testing.T) {
	for _, addr := range []string{":8080", "0.0.0.0:8080", "192.168.1.20:8080", "[::]:8080"} {
		t.Run(addr, func(t *testing.T) {
			setEnv(t, map[string]string{
				"PLATFORM_ADDR":               addr,
				"JWT_SIGNING_SECRET":          strongSecret,
				"PLATFORM_GAME_SHARED_SECRET": strongSecret + "a",
				"REDIS_PASSWORD":              strongSecret + "b",
			})
			cfg, err := Load()
			if err != nil {
				t.Fatalf("a fully-secreted networked deploy must boot, got: %v", err)
			}
			if !cfg.RequireInvite {
				t.Error("a networked deploy that declares nothing must require an invite code")
			}
			if !cfg.RequireApproval {
				t.Error("a networked deploy that declares nothing must require admin approval")
			}
			// And #127's content gate stays fail-safe on omission.
			if cfg.DeployTier != DefaultDeployTier {
				t.Errorf("undeclared tier must default to %q, got %q", DefaultDeployTier, cfg.DeployTier)
			}
		})
	}
}

// An operator CAN turn the approval gate off deliberately (the family host
// where everyone who has a code is already trusted). That is a decision, not an
// accident, so it must be possible — and it must take an explicit value.
func TestLoadHonoursAnExplicitApprovalOptOut(t *testing.T) {
	setEnv(t, map[string]string{
		"PLATFORM_ADDR":               ":8080",
		"JWT_SIGNING_SECRET":          strongSecret,
		"PLATFORM_GAME_SHARED_SECRET": strongSecret + "a",
		"REDIS_PASSWORD":              strongSecret + "b",
		"GGD_REQUIRE_APPROVAL":        "0",
	})
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.RequireApproval {
		t.Error("an explicit GGD_REQUIRE_APPROVAL=0 must be honoured")
	}
	if !cfg.RequireInvite {
		t.Error("opting out of APPROVAL must not also opt out of INVITES — they are separate gates")
	}
}
