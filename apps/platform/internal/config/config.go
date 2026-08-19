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
	// PublicURL is the deploy's PUBLIC base URL as a human reaches it in a
	// browser (GGD_PUBLIC_URL, e.g. "https://ggd.adms.ai"), with no trailing
	// slash. It is distinct from InternalURL — that one is the container-network
	// name the game server calls and is useless on a phone. Used to build the
	// #209 Slack click-to-approve link, which the owner opens from their device
	// while NOT logged into /admin, so it MUST be absolute and externally
	// reachable. Empty by default; the Slack notifier treats an empty value as
	// "not configured" and declines to build a link rather than emit a relative
	// one that would 404 on a phone.
	PublicURL string
	// SlackWebhookURL is the #209 Slack incoming-webhook URL, read from the
	// environment (GGD_SLACK_WEBHOOK_URL) as one of the two supported ways to
	// supply this secret (the other is the admin-gated durable config, mirroring
	// the AI provider key). It is SERVER-SIDE ONLY — never returned to a client
	// except masked — and is never written to content/. Empty by default.
	SlackWebhookURL string
	// SlackNotifyEnabled is the environment enable toggle for #209 Slack
	// notifications (GGD_SLACK_NOTIFY_ENABLED). It is OR-ed with the durable
	// config's own enabled flag, so either switch turns the feature on.
	SlackNotifyEnabled bool
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
	// MinApexPoints is the minimum cumulative score an apex tier requires
	// (RANKED_MIN_APEX_POINTS). The shipped 1 IS owner's 底線 「沒分數不應該有
	// 位階」 expressed as a number; the knob can only raise it (ranking's
	// apexPointsFloor clamps anything lower back to 1).
	MinApexPoints int
	// MinApexLadder is how many accounts a board needs before ANY apex place is
	// handed out (RANKED_MIN_APEX_LADDER, default 0 = no gate). This is the
	// GH#352 「最少人數」 switch: apex is a population fraction, so on a
	// two-person board the leader is trivially the top 10% and gets 宗師. It
	// ships OFF because 「小榜也要有一個菁英」 is a recorded user directive —
	// turning it on is the owner's call, and this knob is how he makes it
	// without a deploy.
	MinApexLadder int
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

	// RequireApproval turns on the registration APPROVAL gate (#126): a new
	// account lands PENDING and cannot obtain a session until an administrator
	// approves it. Resolved by resolveRequireApproval from GGD_REQUIRE_APPROVAL
	// and, when that is unset, from the listen address — the same predicate the
	// invite gate uses, for the same reason (see there).
	//
	// THE TWO GATES ARE NOT REDUNDANT and neither replaces the other. #174
	// answers "may this person create an account at all" with a credential the
	// owner handed out in advance; #126 answers "may this account play" with a
	// decision the owner makes after seeing who actually arrived. A code that
	// leaks — forwarded in a group chat, screenshotted, guessed off a shoulder —
	// spends itself once and is then a player; with approval on it is a row in a
	// queue the owner can decline. Conversely approval alone would leave
	// registration open to anyone who can reach the URL, which is exactly the
	// flood #174 exists to stop. Defence in depth: burn a code, THEN be seen.
	RequireApproval bool

	// BurnInviteOnConflict keeps an invite code SPENT when the registration that
	// burned it then hit a username/email conflict (GGD_BURN_INVITE_ON_CONFLICT,
	// default OFF = hand the code back, which is what every deploy did before
	// this existed).
	//
	// It is the #179 residual knob. The invite gate closes registration
	// enumeration for a caller with NO code; a caller holding a live one can
	// still ask "is <name> registered?" without limit, because each conflicting
	// probe returns their code. Turning this on makes each probe cost a code.
	// The price is that an honest family member who picks a name already taken
	// has to be sent a new one. Only consulted when RequireInvite is on.
	BurnInviteOnConflict bool

	// MaxPending bounds how many accounts may sit PENDING under the #126 approval
	// gate at once (GGD_MAX_PENDING, default DefaultMaxPending). The gate turns
	// every non-owner registration into a durable account file plus PERMANENT
	// username/email index keys, so without a ceiling a scripted registration
	// flood grows them without bound — a disk/Redis DoS (sec-154-11). Register
	// refuses a new pending account once the queue is full. 0 disables the cap.
	// Only consulted when RequireApproval is on (a pending account is only ever
	// created there).
	MaxPending int

	// PendingApprovalTTL is how long an un-actioned PENDING account survives
	// before the periodic sweep deletes it and reclaims its username/email
	// reservations (GGD_PENDING_TTL in whole days, DefaultPendingTTL, clamped to
	// [MinPendingTTL, MaxPendingTTL]). It is the other half of sec-154-11: the cap
	// bounds how MANY pending accounts exist, this bounds how LONG one persists,
	// so the approval queue cannot accumulate durable files + permanent Redis keys
	// forever. Only swept when RequireApproval is on.
	PendingApprovalTTL time.Duration

	// NewAccountCrystals is the one-time 藍水晶 welcome grant a brand-new account
	// is seeded with (task #204, GGD_NEW_ACCOUNT_CRYSTALS, default 1000). 藍水晶
	// is the earn-by-playing currency that unlocks champions, so a fresh family
	// member starts with enough to unlock their first hero without waiting for a
	// match to settle. Seeded ONCE at registration and never re-granted (see
	// wallet.Service.SeedNewAccountCrystals). 0 disables the seed — which is what
	// the hand-built test config uses, so the settlement suite keeps its "a fresh
	// wallet has zero crystals" baseline.
	NewAccountCrystals int

	// BackfillWelcomeCrystals, when true (GGD_BACKFILL_WELCOME_CRYSTALS=1), runs a
	// ONE-OFF migration at boot: grant the #204 welcome 藍水晶 to every existing
	// account that never received it. Idempotent (wallet.BackfillWelcomeCrystals
	// reuses the seed's never-re-grant guard). Off by default; set for a single
	// deploy, then removed — future one-off grants are handled ad hoc, not here.
	BackfillWelcomeCrystals bool

	// AccessTokenTTL is the JWT access-token lifetime.
	AccessTokenTTL time.Duration
	// RefreshTokenTTL is the opaque refresh-token lifetime in Redis.
	RefreshTokenTTL time.Duration
	// PresenceTTL is the heartbeat TTL of presence keys.
	PresenceTTL time.Duration
	// InviteTTL is the room-invite token lifetime.
	InviteTTL time.Duration
	// MatchPendingTTL is the BLIND FALLBACK deadline for a started match: how
	// long a match may sit in the pending set when the platform has never once
	// heard a liveness heartbeat about it (gamelink.Service.Heartbeat).
	//
	// IT IS NOT A MATCH TIMER, and reading it as one is what broke #187. It was
	// 30 minutes, sized against a match that could not exceed ~18 minutes
	// because startingLives was hardcoded to 3. The moment
	// content/config/config.match.json `match.startingTeamLives` started taking
	// effect and the owner set it to 8, the MEAN match became 33.6 minutes
	// (8.73 rounds x 226s + 40s champ select) — 42.3 minutes if rounds run to
	// the full combatMaxSec 240. The deadline was written once at StartMatch and
	// never renewed, so the reaper tore down matches people were playing and
	// wrote every one of them an ABANDONED result.
	//
	// The fix is not this number. A live match now renews its own deadline from
	// the game-server's HMAC-signed heartbeat (see MatchLivenessGrace), so match
	// LENGTH no longer has any relationship to any constant here. What is left
	// for this value to do is bound the ONE case heartbeats cannot cover: a
	// game-server build that never sends them at all, where the platform has no
	// evidence either way. It exists so those entries cannot accumulate in Redis
	// forever, so it is deliberately far outside any plausible match — and every
	// reap that uses it is logged at ERROR naming the missing signal, because a
	// blind deadline killing a real match is exactly the silent failure this
	// whole change exists to remove.
	MatchPendingTTL time.Duration
	// MatchLivenessGrace is how long a match survives after the LAST heartbeat
	// the game-server sent for it. Once the platform has heard one heartbeat it
	// stops guessing: the deadline becomes lastBeat+grace and is pushed forward
	// by every subsequent beat, so a match of any length lives as long as it is
	// demonstrably being played, and a room that dies (crash, hang, disposed
	// without a result) is reaped within grace + one reaper interval instead of
	// lingering for the blind fallback.
	//
	// The grace must clear several heartbeat intervals so one dropped POST, a GC
	// pause or a brief platform restart cannot look like death. The game-server
	// beats every 30s; 3 minutes tolerates five consecutive misses.
	MatchLivenessGrace time.Duration
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

// Ceilings on the two GH#352 apex gates. Both are MONOTONICALLY RESTRICTIVE —
// higher means fewer people are crowned — so a mistyped extra zero does not
// crash anything, it silently empties the apex band forever, and an empty apex
// band looks exactly like 「nobody is good enough yet」. That is the same shape
// as every other 靜默夾掉 in this repo, so the ceiling exists to catch the typo
// and getenvIntClamped SAYS SO when it bites.
//
// The numbers are typo-catchers, not policy: 100000 points is ~28x the Master
// floor and 10000 accounts is ~68x this deploy's whole account base, so no
// intentional setting is anywhere near them.
const (
	MaxMinApexPoints = 100000
	MaxMinApexLadder = 10000
)

// getenvIntClamped reads a whole-number knob and clamps it to [min,max],
// warning on anything it had to reject. Same contract as getenvSeconds: a
// mistyped bound that silently becomes something else is the failure mode being
// prevented, so absence is quiet and a bad value is loud.
func getenvIntClamped(key string, def, min, max int) int {
	raw := os.Getenv(key)
	if raw == "" {
		return def
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		slog.Warn("config: ignoring unparseable integer", "key", key, "value", raw, "using", def)
		return def
	}
	if n < min || n > max {
		slog.Warn("config: integer out of range, clamping",
			"key", key, "value", n, "min", min, "max", max)
		if n < min {
			return min
		}
		return max
	}
	return n
}

// Bounds on GGD_MATCH_LIVENESS_GRACE_SEC. The floor is not decoration: the
// game-server heartbeats every 30s, so a grace under a minute would reap a
// perfectly healthy match on two dropped POSTs. The ceiling keeps the knob from
// being turned back into the 30-minute constant that caused #187.
const (
	MinLivenessGrace     = 60 * time.Second
	MaxLivenessGrace     = 15 * time.Minute
	DefaultLivenessGrace = 3 * time.Minute
)

// getenvSeconds reads a duration given in whole seconds, clamped to [min,max].
// Absence, garbage and out-of-range values all fall back to def and SAY SO —
// a mistyped deadline that silently becomes zero is the failure mode of every
// other timeout in this repo.
func getenvSeconds(key string, def, min, max time.Duration) time.Duration {
	raw := os.Getenv(key)
	if raw == "" {
		return def
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		slog.Warn("config: ignoring unparseable duration", "key", key, "value", raw, "using", def)
		return def
	}
	d := time.Duration(n) * time.Second
	if d < min || d > max {
		slog.Warn("config: duration out of range, clamping",
			"key", key, "value", d, "min", min, "max", max)
		if d < min {
			return min
		}
		return max
	}
	return d
}

// #126 pending-registration CAP + TTL knobs (sec-154-11).
//
// The cap bounds how MANY accounts may await approval at once; the TTL bounds
// how LONG an un-actioned one lingers before the sweep reclaims it. The TTL
// floor keeps a mistyped tiny value from deleting a relative before the owner
// wakes up to approve them; the ceiling keeps the reaper from becoming
// decorative. Both are only in force when the approval gate is on.
const (
	DefaultMaxPending = 200
	MinPendingTTL     = 24 * time.Hour      // 1 day floor
	MaxPendingTTL     = 90 * 24 * time.Hour // 90 day ceiling
	DefaultPendingTTL = 14 * 24 * time.Hour // 2 weeks
)

// resolvePendingTTL reads GGD_PENDING_TTL as a whole number of DAYS, clamped to
// [MinPendingTTL, MaxPendingTTL]. Absence, garbage and out-of-range values all
// fall back to DefaultPendingTTL and SAY SO — the same fail-loud discipline as
// getenvSeconds, so a mistyped TTL that would silently delete pending accounts
// early can never take effect quietly.
func resolvePendingTTL(raw string) time.Duration {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return DefaultPendingTTL
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		slog.Warn("config: ignoring unparseable GGD_PENDING_TTL (whole days expected)", "value", raw, "using", DefaultPendingTTL)
		return DefaultPendingTTL
	}
	d := time.Duration(n) * 24 * time.Hour
	if d < MinPendingTTL {
		slog.Warn("config: GGD_PENDING_TTL below floor, clamping", "days", n, "min", MinPendingTTL)
		return MinPendingTTL
	}
	if d > MaxPendingTTL {
		slog.Warn("config: GGD_PENDING_TTL above ceiling, clamping", "days", n, "max", MaxPendingTTL)
		return MaxPendingTTL
	}
	return d
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

// getenvTruthy reads an opt-IN boolean env var. Absence, emptiness and any
// unrecognised value all mean false, so a typo turns a hardening switch OFF
// rather than silently ON — the safe direction for a flag whose "on" state
// costs a family member their invite code. It accepts the same vocabulary as
// resolveRequireInvite / cmd/platform's envTruthy, so an operator only has to
// learn one spelling of "yes" across the whole platform.
func getenvTruthy(key string) bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(key))) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}

// resolveRequireApproval decides whether the #126 approval gate is ON, from
// GGD_REQUIRE_APPROVAL and — when that is unset — from the platform's OWN
// listen address. It is deliberately the SAME shape and the SAME predicate as
// resolveRequireInvite: one definition of "is this deploy networked?", so the
// two registration gates cannot end up disagreeing about what a public deploy
// is, and an operator only has to learn the rule once.
//
// THE DEFAULT IS ON for the same reason it is on for invites: the failure mode
// of forgetting the variable must be "my cousin waits for me to tap approve",
// not "a stranger is already in the lobby". Before this existed the gate was
// read straight from the environment in the composition root, so a deploy that
// simply never set GGD_REQUIRE_APPROVAL — the overwhelmingly likely mistake at
// go-live — came up with approval OFF while every other hardening default was
// on. The invite gate would still have stopped a stranger registering, but the
// owner would silently have lost the second gate he asked for, and nothing in
// the log would have said so.
//
// The one automatic OFF is an explicit loopback bind — .claude/launch.json's
// local development configuration (#127 tiering: a loopback socket has no
// remote peer to keep out). Local dev therefore keeps the open-signup flow and
// the owner is never left tapping approve on his own dev accounts.
//
// Like the invite gate, this CANNOT see an nginx terminating outside and
// forwarding to a loopback-bound platform; such a deploy must set
// GGD_REQUIRE_APPROVAL=1, which is why server.New logs the resolved value on
// every boot instead of deciding quietly.
func resolveRequireApproval(env, addr string) bool {
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

// resolveBool reads a plain boolean env value (the truthy/falsey spellings the
// rest of the platform accepts). Anything unrecognised — including empty — is
// false, so a feature guarded by it is OFF unless explicitly switched on.
func resolveBool(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
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

// FirstOwnerExposureError refuses to boot the ONE posture where the #174 invite
// gate is defeated at its own root: a NETWORKED bind, with the gate ON, but the
// first-owner claim left open because GGD_OWNER_BOOTSTRAP_TOKEN is off.
//
// WHY THIS IS FATAL, NOT A WARNING. On a fresh deploy the first registration is
// invite-EXEMPT and is granted the admin role (auth/bootstrap.go — the exemption
// is necessary; requiring a code nobody can mint yet is a deadlock). On a
// loopback-only dev box that footrace has no remote runner and is fine. But the
// instant the deploy is reachable off-box — which is exactly the condition that
// turns the invite gate ON — that same window lets a stranger who reaches the
// URL before the owner does seize PLATFORM OWNERSHIP, mint their own codes, and
// lock the real owner out. The gate keeps strangers from making a PLAYER
// account while leaving the door to an ADMIN account wide open. The one switch
// that closes it, GGD_OWNER_BOOTSTRAP_TOKEN=1, reads like an optional "harden"
// step and is easy to forget — so a networked gated deploy that has not set it
// must not come up at all. Same fail-closed-on-a-networked-bind discipline as
// checkDeploySecrets, and, like it, deliberately NO env var switches it off:
// the owner sets the token (it is already in the recommended deploy command),
// the platform prints it, and he registers with it. On a loopback bind this
// returns nil, so .claude/launch.json is untouched.
func FirstOwnerExposureError(addr string, requireInvite, ownerTokenRequired bool) error {
	if loopbackOnlyAddr(addr) || !requireInvite || ownerTokenRequired {
		return nil
	}
	return fmt.Errorf("config: this deploy is networked (PLATFORM_ADDR=%q) with the invite gate ON but the "+
		"first-owner claim OPEN — a stranger who registers before you do would seize admin. Refusing to boot. "+
		"Set GGD_OWNER_BOOTSTRAP_TOKEN=1 so the first account must present the one-time owner token "+
		"(printed in this log and written to DATA_DIR/owner-setup-token)", addr)
}

// Load reads configuration from the environment, applying defaults.
func Load() (Config, error) {
	store, err := LoadStorage()
	if err != nil {
		return Config{}, err
	}
	cfg := Config{
		Addr:                    getenv("PLATFORM_ADDR", ":8080"),
		RedisAddr:               store.RedisAddr,
		RedisPassword:           store.RedisPassword,
		DataDir:                 store.DataDir,
		ContentDir:              getenv("CONTENT_DIR", "../../content"),
		JWTSecret:               os.Getenv("JWT_SIGNING_SECRET"),
		GameSharedSecret:        os.Getenv("PLATFORM_GAME_SHARED_SECRET"),
		GameServerAddr:          getenv("GAME_SERVER_ADDR", "http://127.0.0.1:2567"),
		InternalURL:             getenv("PLATFORM_INTERNAL_URL", "http://platform:8080"),
		PublicURL:               strings.TrimRight(strings.TrimSpace(os.Getenv("GGD_PUBLIC_URL")), "/"),
		SlackWebhookURL:         strings.TrimSpace(os.Getenv("GGD_SLACK_WEBHOOK_URL")),
		SlackNotifyEnabled:      resolveBool(os.Getenv("GGD_SLACK_NOTIFY_ENABLED")),
		Season:                  getenv("SEASON", "s1"),
		ChallengerFrac:          getenvFloat("RANKED_CHALLENGER_FRAC", 0.10),
		GrandmasterFrac:         getenvFloat("RANKED_GRANDMASTER_FRAC", 0.10),
		MinApexGames:            getenvInt("RANKED_MIN_APEX_GAMES", 10),
		MinApexPoints:           getenvIntClamped("RANKED_MIN_APEX_POINTS", 1, 0, MaxMinApexPoints),
		MinApexLadder:           getenvIntClamped("RANKED_MIN_APEX_LADDER", 0, 0, MaxMinApexLadder),
		AdminBootstrapUsername:  os.Getenv("ADMIN_BOOTSTRAP_USERNAME"),
		DeployTier:              normalizeDeployTier(os.Getenv("GGD_DEPLOY_TIER")),
		FullAssets:              ServesFullAssets(normalizeDeployTier(os.Getenv("GGD_DEPLOY_TIER"))),
		RequireInvite:           resolveRequireInvite(os.Getenv("GGD_REQUIRE_INVITE"), getenv("PLATFORM_ADDR", ":8080")),
		RequireApproval:         resolveRequireApproval(os.Getenv("GGD_REQUIRE_APPROVAL"), getenv("PLATFORM_ADDR", ":8080")),
		BurnInviteOnConflict:    getenvTruthy("GGD_BURN_INVITE_ON_CONFLICT"),
		MaxPending:              getenvInt("GGD_MAX_PENDING", DefaultMaxPending),
		PendingApprovalTTL:      resolvePendingTTL(os.Getenv("GGD_PENDING_TTL")),
		NewAccountCrystals:      getenvInt("GGD_NEW_ACCOUNT_CRYSTALS", 1000),
		BackfillWelcomeCrystals: getenvInt("GGD_BACKFILL_WELCOME_CRYSTALS", 0) == 1,
		AccessTokenTTL:          15 * time.Minute,
		RefreshTokenTTL:         30 * 24 * time.Hour,
		PresenceTTL:             60 * time.Second,
		InviteTTL:               10 * time.Minute,
		// 2 hours, and deliberately NOT "long enough for a match" — see the
		// field doc. This is the no-signal leak-stopper; the live deadline is
		// MatchLivenessGrace, renewed by the game-server.
		MatchPendingTTL:    2 * time.Hour,
		MatchLivenessGrace: getenvSeconds("GGD_MATCH_LIVENESS_GRACE_SEC", DefaultLivenessGrace, MinLivenessGrace, MaxLivenessGrace),
		HMACSkew:           30 * time.Second,
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
