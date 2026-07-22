// Package config loads platform configuration from environment variables.
package config

import (
	"fmt"
	"os"
	"strconv"
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

// Load reads configuration from the environment, applying defaults.
func Load() (Config, error) {
	cfg := Config{
		Addr:                   getenv("PLATFORM_ADDR", ":8080"),
		RedisAddr:              getenv("REDIS_ADDR", "127.0.0.1:6379"),
		RedisPassword:          os.Getenv("REDIS_PASSWORD"),
		DataDir:                getenv("DATA_DIR", "./data"),
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
	return cfg, nil
}
