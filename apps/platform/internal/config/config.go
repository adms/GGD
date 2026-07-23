// Package config loads platform configuration from environment variables.
package config

import (
	"fmt"
	"log/slog"
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
	// copyright-restricted and single-player content must NOT be served) or
	// "private" (loopback/LAN — full content). Read from GGD_DEPLOY_TIER and
	// DEFAULTS TO "public" so an outward deploy is safe by omission (any value
	// other than an explicit private marker is treated as public).
	//
	// The AUTHORITATIVE enforcement is at the content-serving layer — the vite
	// dev middleware and nginx (apps/client/vite.config.ts, nginx/**), which
	// classify each request's SOCKET peer with the same loopback|lan|public
	// rule (packages/shared/src/envTier.ts). The platform serves no
	// copyright-restricted content itself; it only records the operator's
	// declared tier so it is logged at boot and can be surfaced. A friends-only
	// LAN deploy sets GGD_DEPLOY_TIER=private (alongside GGD_REQUIRE_APPROVAL).
	// See docs/copyright-content-gate.md.
	DeployTier string

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

// normalizeDeployTier maps GGD_DEPLOY_TIER to "private" or "public" for the
// #127 content gate. An explicit private marker (private|loopback|lan) selects
// "private"; ANYTHING ELSE — including an empty/unset value — is "public". That
// is the fail-safe direction for a copyright gate: an outward deploy that
// forgets to declare a tier defaults to refusing the restricted content, never
// to leaking it.
func normalizeDeployTier(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "private", "loopback", "lan":
		return "private"
	default:
		return "public"
	}
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
