// Package config loads platform configuration from environment variables.
package config

import (
	"fmt"
	"log/slog"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Config is the full runtime configuration of the platform binary.
type Config struct {
	// Addr is the HTTP listen address (PLATFORM_ADDR, default ":8080").
	Addr string
	// RedisAddr is the Redis host:port (REDIS_ADDR, default "127.0.0.1:6379").
	RedisAddr string
	// RedisPassword is optional (REDIS_PASSWORD).
	RedisPassword string
	// DataDir is the root of the durable JSON truth (DATA_DIR, default "./data").
	DataDir string
	// ContentDir is the read-only content/ tree (skins, config/store.json)
	// consumed by the store catalog (CONTENT_DIR, default "../../content" —
	// the repo root when running from apps/platform; docker sets /srv/content).
	ContentDir string
	// JWTSecret signs HS256 access tokens (JWT_SIGNING_SECRET).
	JWTSecret string
	// GameSharedSecret is the HMAC secret shared with the Colyseus game server
	// (PLATFORM_GAME_SHARED_SECRET).
	GameSharedSecret string
	// GameServerAddr is the base URL of the game server's internal API
	// (GAME_SERVER_ADDR, default "http://127.0.0.1:2567").
	GameServerAddr string
	// InternalURL is this platform's own base URL as reachable by the game
	// server, used to build the result callback URL
	// (PLATFORM_INTERNAL_URL, default "http://platform:8080").
	InternalURL string
	// Season is the active ranking season (SEASON, default "s1").
	Season string
	// ChallengerFrac is the fraction of the visible points ladder that holds
	// 菁英 Challenger (RANKED_CHALLENGER_FRAC, default 0.10). Apex is a
	// population fraction, not a fixed slot count, so it populates on a small
	// player base.
	ChallengerFrac float64
	// GrandmasterFrac is the fraction just below it that holds 宗師 Grandmaster
	// (RANKED_GRANDMASTER_FRAC, default 0.10).
	GrandmasterFrac float64
	// MinApexGames is how many settled matches an account needs before it is
	// eligible for an apex tier (RANKED_MIN_APEX_GAMES, default 10).
	MinApexGames int
	// AdminBootstrapUsername names an existing account that is granted the
	// "admin" role idempotently on boot (ADMIN_BOOTSTRAP_USERNAME, default
	// empty = no bootstrap). Create the first admin by registering this
	// username normally, setting the env, and restarting.
	AdminBootstrapUsername string
	// DeployTier is the declared serving environment for the copyright /
	// single-player content gate (#127): "public" (outward-facing — the
	// copyright-restricted and single-player content must NOT be served),
	// "private" (loopback/LAN — full content to a loopback/LAN peer) or
	// "family" (#176 — FULL ASSETS to every peer, the owner's household
	// deploy). Read from GGD_DEPLOY_TIER and DEFAULTS TO "public" so an
	// outward deploy is safe by omission (any unrecognised value is public).
	//
	// The AUTHORITATIVE enforcement is at the content-serving layer — the vite
	// dev middleware and nginx (apps/client/vite.config.ts, nginx/**), which
	// classify each request's SOCKET peer with the same loopback|lan|public
	// rule (packages/shared/src/envTier.ts). The platform serves no
	// copyright-restricted content itself; it only records the operator's
	// declared tier so it is logged at boot and can be surfaced. A friends-only
	// LAN deploy sets GGD_DEPLOY_TIER=private (alongside GGD_REQUIRE_APPROVAL).
	// See docs/copyright-content-gate.md and docs/family-deploy.md.
	//
	// THE VOCABULARY IS SHARED, NOT DUPLICATED: packages/shared/src/deployTier.ts
	// is the source of truth for the tier set and the accepted spellings, and
	// deploytier_drift_test.go fails if this file's table stops matching it.
	DeployTier string

	// FullAssets is servesFullAssets(DeployTier) — true only on the family
	// tier. It is a derived field rather than a second env var on purpose:
	// there is exactly one switch, so the boot log, the nginx include set, the
	// client bundle and the edge boot assertion cannot disagree about whether
	// this deploy owes its players the full 84 MB overlay.
	FullAssets bool

	// RequireInvite turns on the registration invite-code gate (#174): every
	// registration except the first-owner claim must burn a code minted in the
	// admin console. Resolved by resolveRequireInvite from GGD_REQUIRE_INVITE
	// and, when that is unset, from the listen address — see there for the
	// default and why it is the safe one.
	RequireInvite bool

	// AccessTokenTTL is the JWT access-token lifetime.
	AccessTokenTTL time.Duration
	// RefreshTokenTTL is the opaque refresh-token lifetime in Redis.
	RefreshTokenTTL time.Duration
	// PresenceTTL is the heartbeat TTL of presence keys.
	PresenceTTL time.Duration
	// InviteTTL is the room-invite token lifetime.
	InviteTTL time.Duration
	// MatchPendingTTL is how long a started match may run before the reaper
	// marks it abandoned.
	MatchPendingTTL time.Duration
	// HMACSkew is the max accepted clock skew on the internal HMAC scheme.
	HMACSkew time.Duration
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// getenvInt reads a non-negative int env var, falling back to def on absence or
// a parse error.
func getenvInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			return n
		}
	}
	return def
}

// DeployTiers is the canonical tier set. MIRROR of DEPLOY_TIERS in
// packages/shared/src/deployTier.ts — deploytier_drift_test.go asserts set
// equality against that file, so adding a tier on one side only turns the Go
// test red instead of shipping a server and a client that disagree.
var DeployTiers = []string{"public", "private", "family"}

// DefaultDeployTier is what an unset/empty/unrecognised GGD_DEPLOY_TIER
// resolves to: deny by omission (#127).
const DefaultDeployTier = "public"

// deployTierAliases is every accepted spelling of GGD_DEPLOY_TIER, lowercased,
// mapped to its canonical tier. MIRROR of DEPLOY_TIER_ALIASES in
// packages/shared/src/deployTier.ts (same drift test).
var deployTierAliases = map[string]string{
	"public":     "public",
	"prod":       "public",
	"production": "public",
	"internet":   "public",
	"private":    "private",
	"loopback":   "private",
	"lan":        "private",
	"family":     "family",
	"home":       "family",
	"household":  "family",
}

// normalizeDeployTier maps GGD_DEPLOY_TIER to a canonical tier for the #127
// content gate and the #176 family tier. A recognised alias selects its tier;
// ANYTHING ELSE — including an empty/unset value or a typo — is "public". That
// is the fail-safe direction for a copyright gate: an outward deploy that
// forgets to declare a tier defaults to refusing the restricted content, never
// to leaking it, and a mistyped "familly" degrades to the safe tier rather
// than to a half-open one.
func normalizeDeployTier(v string) string {
	if tier, ok := deployTierAliases[strings.ToLower(strings.TrimSpace(v))]; ok {
		return tier
	}
	return DefaultDeployTier
}

// ServesFullAssets reports whether a tier serves EVERY asset class to EVERY
// peer — the request-tier gate off, the Blizzard overlay mounted, the imported
// champion GLBs open. MIRROR of servesFullAssets() in
// packages/shared/src/deployTier.ts.
func ServesFullAssets(tier string) bool { return tier == "family" }

// AllowsRestrictedContent reports whether a tier may serve copyright-restricted
// content at all (to a peer the request-tier gate accepts). MIRROR of
// allowsRestrictedContent() in packages/shared/src/deployTier.ts.
func AllowsRestrictedContent(tier string) bool { return tier != "public" }

// resolveRequireInvite decides whether the registration invite-code gate
// (#174) is ON, from GGD_REQUIRE_INVITE and — when that is unset — from the
// platform's OWN listen address.
//
// THE DEFAULT IS ON. Every value of `addr` except an explicit loopback bind
// resolves to true, including the built-in ":8080", "0.0.0.0:8080" and an empty
// string. A deploy that sets nothing at all is therefore GATED: the failure
// mode of forgetting this variable is "my cousin has to ask me for a code",
// not "the internet can register".
//
// The one automatic OFF is an explicit loopback bind (127.0.0.1:*, [::1]:*,
// localhost:*) — the local development configuration in .claude/launch.json.
// A socket bound to loopback cannot accept a packet from another machine, so
// there is no stranger to keep out and the gate would only get in the owner's
// way while he works.
//
// WHY THE BIND ADDRESS AND NOT THE CALLER'S ADDRESS. This reads a value the
// operator chose when starting the process, once, at boot. It is NOT the "is
// the caller on loopback" check that internal/server/devsurface_test.go
// forbids: that one is laundered by the LAN-published vite proxy, which makes
// every phone arrive as 127.0.0.1. Nothing can launder a listen address.
//
// THE ONE CASE THE DEFAULT CANNOT SEE: a reverse proxy (nginx) terminating
// outside and forwarding to a loopback-bound platform. The bind address then
// says "local" while the deploy is public. That deploy MUST set
// GGD_REQUIRE_INVITE=1 — which is why server.New logs the resolved value at
// WARN on every boot, naming the variable, rather than deciding quietly.
func resolveRequireInvite(env, addr string) bool {
	switch strings.ToLower(strings.TrimSpace(env)) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	}
	return !loopbackOnlyAddr(addr)
}

// loopbackOnlyAddr reports whether addr binds a loopback interface only. A
// wildcard bind (":8080", "0.0.0.0:8080", "[::]:8080") is NOT loopback-only —
// it is reachable from the network — and neither is an unparseable value.
func loopbackOnlyAddr(addr string) bool {
	host := strings.TrimSpace(addr)
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	host = strings.Trim(host, "[]")
	if host == "" {
		return false // ":8080" — every interface
	}
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// getenvFloat reads a non-negative float env var, falling back to def on
// absence or a parse error.
func getenvFloat(key string, def float64) float64 {
	if v := os.Getenv(key); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f >= 0 {
			return f
		}
	}
	return def
}

// Storage is the subset of configuration needed to REACH the platform's state:
// the durable JSON truth (DATA_DIR) and the Redis hot layer. It deliberately
// carries no secrets.
//
// It exists so an offline maintenance command — cmd/ownerreset, run by the
// operator on the host — can open exactly the same store and Redis the running
// platform uses WITHOUT JWT_SIGNING_SECRET / PLATFORM_GAME_SHARED_SECRET being
// set. Those two are required to MINT tokens; a command that only rewrites a
// password hash and deletes refresh tokens mints nothing, and demanding them
// would mean an operator recovering a locked-out deploy has to reconstruct
// signing secrets first. Load() is built on top of this, so there is one
// definition of the DATA_DIR default and its absolute-path resolution.
type Storage struct {
	// DataDir is the absolute root of the durable JSON truth.
	DataDir string
	// RedisAddr is the Redis host:port.
	RedisAddr string
	// RedisPassword is optional.
	RedisPassword string
}

// LoadStorage reads DATA_DIR / REDIS_ADDR / REDIS_PASSWORD with the same
// defaults Load applies, and resolves DATA_DIR to an absolute path (see the
// note in Load for why that resolution is load-bearing).
func LoadStorage() (Storage, error) {
	st := Storage{
		DataDir:       getenv("DATA_DIR", "./data"),
		RedisAddr:     getenv("REDIS_ADDR", "127.0.0.1:6379"),
		RedisPassword: os.Getenv("REDIS_PASSWORD"),
	}
	abs, err := filepath.Abs(st.DataDir)
	if err != nil {
		return st, fmt.Errorf("config: DATA_DIR %q: %w", st.DataDir, err)
	}
	st.DataDir = abs
	return st, nil
}

// ---------------------------------------------------------------- secrets ---

// SecretGenCommand is the ONE command an operator is told to run whenever a
// secret is rejected. It is named in every error message below so nobody has
// to invent their own key material (or reach for `echo mypassword`).
const SecretGenCommand = "make family-secrets"

// MinSecretLen is the shortest accepted secret: 32 chars, i.e. exactly what
// `openssl rand -hex 32`… does NOT produce (that is 64 hex chars) — the floor
// is deliberately below the generator's output so a hand-made passphrase of
// reasonable length is still accepted, while every dev value in this repo
// (devsecret=9, devseam=7, dev-insecure-jwt-secret=23) is not.
const MinSecretLen = 32

// MinSecretDistinct rejects long-but-degenerate values ("aaaa…", "abababab…",
// "changemechangemechangemechangeme"). 12 distinct runes is trivially cleared
// by any random hex string (16 symbols) and by any real passphrase.
const MinSecretDistinct = 12

// devSecretDenylist is every literal development / placeholder secret that
// exists in this repository or its docs, plus the usual suspects. Matching is
// case-insensitive and exact — see also devSecretPrefixes for the families.
//
// KEEPING THIS LIST HONEST IS THE POINT. If you add a dev value to
// .claude/launch.json, deploy/helm/**/values-local.yaml or docker/.env.example,
// add it here too: this list is what makes "a dev default can never be reached
// by a deployed process" a checked property rather than a promise.
var devSecretDenylist = []string{
	"devsecret",                           // .claude/launch.json (platform)
	"devseam",                             // .claude/launch.json (game seam)
	"dev-insecure-jwt-secret",             // deploy/helm/ggd/values-local.yaml
	"dev-insecure-seam-secret",            // deploy/helm/ggd/values-local.yaml
	"dev-insecure-redis-password",         // deploy/helm/ggd/values-local.yaml
	"replace-me-with-openssl-rand-hex-32", // docker/.env.example placeholder
	"test-secret", "testsecret", "test",
	"changeme", "change-me", "password", "passwd", "secret", "admin",
	"ggd", "ggd-secret", "local", "localdev", "insecure",
}

// devSecretPrefixes catches the FAMILIES the denylist enumerates one by one,
// so a new `dev-insecure-<whatever>` or `replace-me-<whatever>` is rejected the
// day it is invented rather than the day someone remembers to list it.
var devSecretPrefixes = []string{"dev-insecure", "replace-me", "devsecret", "devseam", "changeme"}

// SecretStrengthError returns a human-readable, ACTIONABLE error when `value`
// is not an acceptable production secret for the variable `name`, or nil.
//
// Every message names the variable AND the one command that produces a real
// value, because the failure mode this guards against is an operator at 1am
// who reaches for the shortest thing that makes the error go away.
func SecretStrengthError(name, value string) error {
	v := strings.TrimSpace(value)
	if v == "" {
		return fmt.Errorf("config: %s is required and unset — refusing to boot a networked deploy without it. Generate one: %s", name, SecretGenCommand)
	}
	low := strings.ToLower(v)
	for _, bad := range devSecretDenylist {
		if low == bad {
			return fmt.Errorf("config: %s is the known DEVELOPMENT value %q — refusing to boot. A deployed process must never read a dev default. Generate a real one: %s", name, v, SecretGenCommand)
		}
	}
	for _, pfx := range devSecretPrefixes {
		if strings.HasPrefix(low, pfx) {
			return fmt.Errorf("config: %s starts with the development/placeholder marker %q — refusing to boot. Generate a real one: %s", name, pfx, SecretGenCommand)
		}
	}
	if len([]rune(v)) < MinSecretLen {
		return fmt.Errorf("config: %s is only %d characters — a networked deploy requires at least %d. Generate one: %s", name, len([]rune(v)), MinSecretLen, SecretGenCommand)
	}
	distinct := map[rune]struct{}{}
	for _, r := range v {
		distinct[r] = struct{}{}
	}
	if len(distinct) < MinSecretDistinct {
		return fmt.Errorf("config: %s is long but uses only %d distinct characters — that is a repeated pattern, not a secret. Generate one: %s", name, len(distinct), SecretGenCommand)
	}
	return nil
}

// checkDeploySecrets applies SecretStrengthError to every secret this process
// reads, but ONLY when the listen socket can accept a packet from another
// machine.
//
// WHY THE LISTEN ADDRESS IS THE TRIGGER. The requirement is "no dev default can
// ever be reached by a DEPLOYED PROCESS". Expressed as a property of the socket
// that is a checkable fact, not a promise: a process bound to 127.0.0.1 has no
// remote reader to protect, so .claude/launch.json's JWT_SIGNING_SECRET=devsecret
// keeps working exactly as it does today; the instant that same environment is
// pointed at ":8080" / "0.0.0.0:…" — which is what every container, systemd
// unit and compose file does — the same values become a boot failure. There is
// deliberately NO env var to switch this off: an escape hatch is the thing that
// gets set once "temporarily" and never unset.
//
// This reuses loopbackOnlyAddr, the same predicate the #174 invite gate
// resolves its default from, so there is one definition of "is this deploy
// networked?" in the process.
//
// REDIS_PASSWORD is included and had NO check of any kind before: an empty
// value was accepted silently, which is exactly the shape of #117 (an
// un-authenticated session store reachable off-box).
func checkDeploySecrets(cfg Config) error {
	if loopbackOnlyAddr(cfg.Addr) {
		return nil
	}
	for _, s := range []struct{ name, value string }{
		{"JWT_SIGNING_SECRET", cfg.JWTSecret},
		{"PLATFORM_GAME_SHARED_SECRET", cfg.GameSharedSecret},
		{"REDIS_PASSWORD", cfg.RedisPassword},
	} {
		if err := SecretStrengthError(s.name, s.value); err != nil {
			return err
		}
	}
	return nil
}

// Load reads configuration from the environment, applying defaults.
func Load() (Config, error) {
	store, err := LoadStorage()
	if err != nil {
		return Config{}, err
	}
	cfg := Config{
		Addr:                   getenv("PLATFORM_ADDR", ":8080"),
		RedisAddr:              store.RedisAddr,
		RedisPassword:          store.RedisPassword,
		DataDir:                store.DataDir,
		ContentDir:             getenv("CONTENT_DIR", "../../content"),
		JWTSecret:              os.Getenv("JWT_SIGNING_SECRET"),
		GameSharedSecret:       os.Getenv("PLATFORM_GAME_SHARED_SECRET"),
		GameServerAddr:         getenv("GAME_SERVER_ADDR", "http://127.0.0.1:2567"),
		InternalURL:            getenv("PLATFORM_INTERNAL_URL", "http://platform:8080"),
		Season:                 getenv("SEASON", "s1"),
		ChallengerFrac:         getenvFloat("RANKED_CHALLENGER_FRAC", 0.10),
		GrandmasterFrac:        getenvFloat("RANKED_GRANDMASTER_FRAC", 0.10),
		MinApexGames:           getenvInt("RANKED_MIN_APEX_GAMES", 10),
		AdminBootstrapUsername: os.Getenv("ADMIN_BOOTSTRAP_USERNAME"),
		DeployTier:             normalizeDeployTier(os.Getenv("GGD_DEPLOY_TIER")),
		FullAssets:             ServesFullAssets(normalizeDeployTier(os.Getenv("GGD_DEPLOY_TIER"))),
		RequireInvite:          resolveRequireInvite(os.Getenv("GGD_REQUIRE_INVITE"), getenv("PLATFORM_ADDR", ":8080")),
		AccessTokenTTL:         15 * time.Minute,
		RefreshTokenTTL:        30 * 24 * time.Hour,
		PresenceTTL:            60 * time.Second,
		InviteTTL:              10 * time.Minute,
		MatchPendingTTL:        30 * time.Minute,
		HMACSkew:               30 * time.Second,
	}
	if cfg.JWTSecret == "" {
		return cfg, fmt.Errorf("config: JWT_SIGNING_SECRET is required")
	}
	if cfg.GameSharedSecret == "" {
		return cfg, fmt.Errorf("config: PLATFORM_GAME_SHARED_SECRET is required")
	}
	// #176(C): the two checks above only catch EMPTY. On a networked bind every
	// secret must additionally be strong and non-dev — see checkDeploySecrets.
	if err := checkDeploySecrets(cfg); err != nil {
		return cfg, err
	}
	// DATA_DIR defaults to the RELATIVE "./data", which means the durable truth
	// of the platform moves with the process's working directory: a systemd unit
	// without WorkingDirectory, a restart from a different shell, or a container
	// whose volume did not mount all silently open an EMPTY store next to a full
	// one. That is not merely lost data — an empty store reads as "this deploy
	// has no administrator", which is the one condition that opens the
	// first-owner claim. LoadStorage resolves it once, above; logging it here
	// makes the path the operator sees the path that is actually used.
	slog.Info("config: data directory resolved", "dataDir", cfg.DataDir)
	return cfg, nil
}
