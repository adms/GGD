package config

import (
	"strings"
	"testing"
)

// A value that clears every rule: 64 hex chars, 16 distinct symbols. This is
// literally what `openssl rand -hex 32` (and `make family-secrets`) produces.
const strongSecret = "9f3c1a7e0b45d28c6e91f0a3b7d54c8e2f60a91d3c7b58e04f2a6d1c9b30e785"

func TestSecretStrengthAcceptsAGeneratedSecret(t *testing.T) {
	if err := SecretStrengthError("JWT_SIGNING_SECRET", strongSecret); err != nil {
		t.Fatalf("a 64-char openssl-rand-hex-32 value must be accepted, got: %v", err)
	}
	// A human passphrase of adequate length and variety is accepted too — the
	// floor must not be "only my generator's output works", or an operator in a
	// hurry will paste something worse to get past it.
	if err := SecretStrengthError("JWT_SIGNING_SECRET", "correct-horse-battery-staple-7391!"); err != nil {
		t.Fatalf("a long varied passphrase must be accepted, got: %v", err)
	}
}

// THE REQUIREMENT, AS A TEST: every dev value that exists anywhere in this
// repository must fail at boot, and the message must name the variable and the
// one command that produces a real value.
func TestEveryDevValueInTheRepoIsRejected(t *testing.T) {
	cases := []struct{ name, value, where string }{
		{"JWT_SIGNING_SECRET", "devsecret", ".claude/launch.json"},
		{"PLATFORM_GAME_SHARED_SECRET", "devseam", ".claude/launch.json"},
		{"JWT_SIGNING_SECRET", "dev-insecure-jwt-secret", "deploy/helm/ggd/values-local.yaml"},
		{"PLATFORM_GAME_SHARED_SECRET", "dev-insecure-seam-secret", "deploy/helm/ggd/values-local.yaml"},
		{"REDIS_PASSWORD", "dev-insecure-redis-password", "deploy/helm/ggd/values-local.yaml"},
		{"JWT_SIGNING_SECRET", "replace-me-with-openssl-rand-hex-32", "docker/.env.example"},
		{"REDIS_PASSWORD", "replace-me-with-openssl-rand-hex-32", "docker/.env.example"},
		// Case and whitespace must not launder a dev value.
		{"JWT_SIGNING_SECRET", "DevSecret", "case variant"},
		{"PLATFORM_GAME_SHARED_SECRET", "  devseam  ", "whitespace variant"},
		// The family prefixes, so a NEW dev value invented tomorrow is caught.
		{"JWT_SIGNING_SECRET", "dev-insecure-something-nobody-has-written-yet", "prefix rule"},
		{"REDIS_PASSWORD", "replace-me-later-i-promise-really-truly-yes", "prefix rule"},
	}
	for _, c := range cases {
		err := SecretStrengthError(c.name, c.value)
		if err == nil {
			t.Errorf("%s=%q (from %s) was ACCEPTED — a deployed process must never read a dev default",
				c.name, c.value, c.where)
			continue
		}
		msg := err.Error()
		if !strings.Contains(msg, c.name) {
			t.Errorf("error for %s does not name the variable: %s", c.name, msg)
		}
		if !strings.Contains(msg, SecretGenCommand) {
			t.Errorf("error for %s does not name the generator command %q: %s", c.name, SecretGenCommand, msg)
		}
	}
}

func TestSecretStrengthRejectsEmptyShortAndDegenerate(t *testing.T) {
	cases := []struct{ label, value string }{
		{"empty", ""},
		{"whitespace only", "   "},
		{"short", "hunter2"},
		{"just under the floor", strings.Repeat("aZ9!", 7) + "abc"}, // 31 chars
		{"long but one character", strings.Repeat("a", 80)},
		{"long but a repeated pattern", strings.Repeat("ab", 40)},
	}
	for _, c := range cases {
		if err := SecretStrengthError("REDIS_PASSWORD", c.value); err == nil {
			t.Errorf("%s value %q was accepted", c.label, c.value)
		} else if !strings.Contains(err.Error(), "REDIS_PASSWORD") || !strings.Contains(err.Error(), SecretGenCommand) {
			t.Errorf("%s: message must name the variable and the generator: %s", c.label, err)
		}
	}
	// …and the boundary is where it says it is.
	atFloor := strongSecret[:MinSecretLen]
	if err := SecretStrengthError("REDIS_PASSWORD", atFloor); err != nil {
		t.Errorf("a value of exactly MinSecretLen=%d must be accepted, got: %v", MinSecretLen, err)
	}
}

// checkDeploySecrets is gated on the LISTEN ADDRESS, which is the whole
// mechanism behind "no dev default can ever be reached by a deployed process":
// loopback keeps working for .claude/launch.json, and the instant the same
// environment binds a networked socket the same values are a boot failure.
func TestDeploySecretsAreEnforcedByListenAddress(t *testing.T) {
	dev := Config{JWTSecret: "devsecret", GameSharedSecret: "devseam", RedisPassword: ""}

	// The exact addresses .claude/launch.json and the docs use locally.
	for _, addr := range []string{"127.0.0.1:8080", "localhost:8080", "[::1]:8080"} {
		cfg := dev
		cfg.Addr = addr
		if err := checkDeploySecrets(cfg); err != nil {
			t.Errorf("local dev bind %q must keep working with launch.json values, got: %v", addr, err)
		}
	}

	// Every shape of networked bind a deploy actually uses.
	for _, addr := range []string{":8080", "0.0.0.0:8080", "[::]:8080", "192.168.0.10:8080", "", "garbage"} {
		cfg := dev
		cfg.Addr = addr
		err := checkDeploySecrets(cfg)
		if err == nil {
			t.Errorf("networked bind %q accepted the launch.json dev secrets", addr)
			continue
		}
		if !strings.Contains(err.Error(), "JWT_SIGNING_SECRET") {
			t.Errorf("bind %q: first failure should name JWT_SIGNING_SECRET, got: %v", addr, err)
		}
	}
}

// REDIS_PASSWORD had NO check of any kind before #176 — an empty value was
// accepted silently. That is the shape of #117 (an un-authenticated session
// store reachable off-box), so it gets its own test rather than riding along.
func TestNetworkedDeployRejectsAnUnauthenticatedRedis(t *testing.T) {
	cfg := Config{
		Addr:             ":8080",
		JWTSecret:        strongSecret,
		GameSharedSecret: strongSecret,
		RedisPassword:    "", // #117
	}
	err := checkDeploySecrets(cfg)
	if err == nil {
		t.Fatal("a networked deploy with NO redis password booted — this is exactly #117")
	}
	if !strings.Contains(err.Error(), "REDIS_PASSWORD") {
		t.Fatalf("message must name REDIS_PASSWORD: %v", err)
	}

	cfg.RedisPassword = strongSecret
	if err := checkDeploySecrets(cfg); err != nil {
		t.Fatalf("a fully strong config must boot, got: %v", err)
	}
}

// There must be no escape hatch. If someone ever adds GGD_ALLOW_WEAK_SECRETS,
// this test is where it shows up: the function takes only a Config, so the
// only inputs are the addr and the three secrets.
func TestFamilyTierStillEnforcesSecrets(t *testing.T) {
	cfg := Config{
		Addr:             ":8080",
		DeployTier:       "family",
		FullAssets:       true,
		JWTSecret:        "devsecret",
		GameSharedSecret: strongSecret,
		RedisPassword:    strongSecret,
	}
	if err := checkDeploySecrets(cfg); err == nil {
		t.Fatal("the family tier must NOT relax the secret rules — it is the tier that gets published")
	}
}
