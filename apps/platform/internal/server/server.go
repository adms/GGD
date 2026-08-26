// Package server is the composition root: it wires config → stores → services
// → HTTP routes into one runnable unit (also used directly by tests).
package server

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/alexedwards/argon2id"
	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/admin"
	"github.com/ggd/platform/internal/ai"
	"github.com/ggd/platform/internal/approvelink"
	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/combatenv"
	"github.com/ggd/platform/internal/config"
	"github.com/ggd/platform/internal/contentoverlay"
	"github.com/ggd/platform/internal/curation"
	"github.com/ggd/platform/internal/data/boot"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/data/wal"
	"github.com/ggd/platform/internal/friend"
	"github.com/ggd/platform/internal/gamelink"
	"github.com/ggd/platform/internal/httpx"
	"github.com/ggd/platform/internal/invite"
	"github.com/ggd/platform/internal/lobby"
	"github.com/ggd/platform/internal/matchstats"
	"github.com/ggd/platform/internal/opsenv"
	"github.com/ggd/platform/internal/platformarchive"
	"github.com/ggd/platform/internal/presence"
	"github.com/ggd/platform/internal/ranking"
	"github.com/ggd/platform/internal/room"
	"github.com/ggd/platform/internal/wallet"
)

// Server bundles every wired component.
type Server struct {
	Cfg       config.Config
	Rdb       *redisx.Client
	Store     *jsonstore.Store
	Journal   *wal.WAL
	Accounts  *account.Repo
	Auth      *auth.Service
	Friends   *friend.Service
	Presence  *presence.Service
	Rooms     *room.Service
	Ranking   *ranking.Service
	Gamelink  *gamelink.Service
	Wallet    *wallet.Service
	Admin     *admin.Service
	Curation  *curation.Service
	Overlay   *contentoverlay.Service
	CombatEnv *combatenv.Service
	OpsEnv    *opsenv.Service
	Invites   *invite.Service
	AI        *ai.Service
	Approve   *approvelink.Service
	// Archive is #243's whole-platform ZIP export/import.
	Archive *platformarchive.Service
	// MatchStats is #207's per-match analysis ledger store.
	MatchStats *matchstats.Service
	Hub        *lobby.Hub
	Sessions   *lobby.Sessions

	// registerRateLimit is the max /auth/register calls allowed per minute
	// server-wide (0 = disabled). This is an app-layer backstop to the edge's
	// per-IP register throttle (the auth/server packages may not read a caller
	// address — see internal/server/devsurface_test.go — so per-IP register
	// limiting is owned by nginx; this global cap needs no address).
	registerRateLimit int

	// requireApproval is the resolved #126 approval-gate state (the same value
	// handed to auth.New). Start reads it to decide whether the pending-account
	// TTL sweep runs — there are no pending accounts to reap unless the gate is on.
	requireApproval bool
	// pendingApprovalTTL is how long an un-actioned PENDING account lives before
	// the sweep deletes it and reclaims its username/email reservations
	// (sec-154-11). Mirror of cfg.PendingApprovalTTL, read by startPendingSweep.
	pendingApprovalTTL time.Duration

	router chi.Router
	cancel context.CancelFunc
}

// Options tweak construction for tests.
type Options struct {
	// Argon2Params overrides hashing cost (tests use light params).
	Argon2Params *argon2id.Params
	// RequireApproval forces the private-deploy approval gate on (#126)
	// regardless of the environment. It is OR-ed with GGD_REQUIRE_APPROVAL.
	RequireApproval bool
	// RequireInvite forces the registration invite-code gate on (#174)
	// regardless of the environment. It is OR-ed with cfg.RequireInvite, which
	// config.Load resolves from GGD_REQUIRE_INVITE / the listen address. Tests
	// that boot a platform without it get the pre-#174 open-signup flow.
	RequireInvite bool
	// DisableOwnerBootstrap turns the first-account owner grant off for this
	// instance. Real deploys never set it — the grant closes itself as soon as
	// an admin exists (see internal/auth/bootstrap.go). It exists so a test
	// harness can boot a platform that behaves like an ESTABLISHED deploy
	// without having to fabricate a fixture account that would then show up in
	// account counts, search totals and leaderboards.
	DisableOwnerBootstrap bool
}

// requiredSecrets are the secrets that MUST be supplied from the environment;
// booting with any of them empty is a hard error rather than a silent weak
// default. config.Load already guards the real binary — this second guard
// covers server.New callers (tests, embedders) that build a Config directly.
func checkRequiredSecrets(cfg config.Config) error {
	missing := []string{}
	if strings.TrimSpace(cfg.JWTSecret) == "" {
		missing = append(missing, "JWT_SIGNING_SECRET")
	}
	if strings.TrimSpace(cfg.GameSharedSecret) == "" {
		missing = append(missing, "PLATFORM_GAME_SHARED_SECRET")
	}
	if len(missing) > 0 {
		return fmt.Errorf("server: required secret(s) unset: %s — refusing to boot with a weak/empty default", strings.Join(missing, ", "))
	}
	return nil
}

// envEnabled reports whether an env var is set to a truthy value.
func envEnabled(key string) bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(key))) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}

// envInt reads a non-negative int env var, falling back to def on absence or a
// parse error.
func envInt(key string, def int) int {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			return n
		}
	}
	return def
}

// New wires everything. Call Start to run background loops, Router for the
// HTTP handler and Close on shutdown.
func New(cfg config.Config, opts Options) (*Server, error) {
	// Fail fast on a missing required secret — no weak defaults reach a live
	// listener (#126 go-live hardening).
	if err := checkRequiredSecrets(cfg); err != nil {
		return nil, err
	}
	store, err := jsonstore.New(cfg.DataDir)
	if err != nil {
		return nil, err
	}
	journal, err := wal.Open(cfg.DataDir)
	if err != nil {
		return nil, err
	}
	rdb := redisx.New(cfg.RedisAddr, cfg.RedisPassword)
	accounts := account.NewRepo(store, rdb)

	// Private-deploy approval gate (#126): a new account lands PENDING and gets
	// no session until an administrator approves it.
	//
	// Three inputs, OR-ed, because they answer different questions and the
	// safe direction is "any one of them says yes":
	//   - opts.RequireApproval — a test/embedder turning it on explicitly;
	//   - cfg.RequireApproval  — config.resolveRequireApproval's answer, which
	//     DEFAULTS TO ON for any non-loopback listen address (the #127 tiering
	//     predicate, shared with the #174 invite gate);
	//   - GGD_REQUIRE_APPROVAL — read directly as well, so a caller that builds
	//     a Config by hand (testutil, an embedder) still honours the env var it
	//     always honoured. config.Load folds the same variable into
	//     cfg.RequireApproval, so on the real binary these two agree.
	requireApproval := opts.RequireApproval || cfg.RequireApproval || envEnabled("GGD_REQUIRE_APPROVAL")
	authSvc, err := auth.New(accounts, rdb, cfg.JWTSecret, cfg.AccessTokenTTL, cfg.RefreshTokenTTL, opts.Argon2Params, requireApproval)
	if err != nil {
		return nil, err
	}
	// Logged on EVERY boot, at WARN when off, for the same reason the invite
	// gate is: on a family deploy these two lines are the entire answer to "who
	// can get in", and a gate that is off must never be a quiet decision.
	if requireApproval {
		// The approval gate manufactures durable pending accounts, so it must ship
		// WITH the sec-154-11 DoS guard: a CAP on how many may await approval at
		// once, and a TTL sweep that reclaims un-actioned ones. Wire the cap into
		// auth here; the sweep is started in Start (it needs the background ctx).
		authSvc.SetMaxPending(cfg.MaxPending)
		slog.Info("auth: new registrations are PENDING until an admin approves them — approve in the admin console (帳號審核)",
			"addr", cfg.Addr, "override", "GGD_REQUIRE_APPROVAL",
			"maxPending", cfg.MaxPending, "pendingTTL", cfg.PendingApprovalTTL)
	} else {
		slog.Warn("auth: registrations are AUTO-APPROVED — a new account can play immediately",
			"addr", cfg.Addr,
			"why", "GGD_REQUIRE_APPROVAL is off, or unset with a loopback-only listen address",
			"harden", "set GGD_REQUIRE_APPROVAL=1 if anything (nginx, a tunnel, a proxy) forwards to this platform from outside")
	}
	// Self-service password changes land in the same append-only audit log the
	// operator console reads (auth cannot import admin — see audit.go).
	authSvc.SetAuditor(authAuditSink{store: store, now: time.Now})
	// First-account owner bootstrap: while the deploy has no administrator, a
	// registration claims ownership. GGD_OWNER_BOOTSTRAP_TOKEN=1 additionally
	// requires the one-time token from DATA_DIR — the hardening switch for a
	// deploy whose register endpoint is reachable from an untrusted network.
	authSvc.SetOwnerBootstrap(auth.OwnerBootstrap{
		Enabled:      !opts.DisableOwnerBootstrap,
		RequireToken: envEnabled("GGD_OWNER_BOOTSTRAP_TOKEN"),
		DataDir:      store.Root(),
	})
	pres := presence.New(rdb, cfg.PresenceTTL)
	friends := friend.New(store)
	// 管理員預設好友 (GH#499, owner 2026-08-21「每個人創號自動預設有管理員好友」).
	// The hook fires from account.Repo.Create's post-create seam, so a failed
	// registration can never leave an orphan friendship behind.
	accounts.SetPostCreateHook(friends.EnableAdminAutoFriend(accounts, friend.LoadAdminPolicy(cfg.ContentDir)))
	rooms := room.New(rdb, pres)
	templates := room.NewTemplates(store)
	ladder := ranking.DefaultLadderConfig()
	if cfg.ChallengerFrac > 0 {
		ladder.ChallengerFrac = cfg.ChallengerFrac
	}
	if cfg.GrandmasterFrac > 0 {
		ladder.GrandmasterFrac = cfg.GrandmasterFrac
	}
	if cfg.MinApexGames > 0 {
		ladder.MinApexGames = cfg.MinApexGames
	}
	if cfg.MinApexPoints > 0 {
		ladder.MinApexPoints = cfg.MinApexPoints
	}
	if cfg.MinApexLadder > 0 {
		ladder.MinApexLadder = cfg.MinApexLadder
		// GH#352's ladder-size gate ships OFF, so it can only be on because an
		// operator turned it on — and its whole effect is an ABSENCE (nobody is
		// 菁英/宗師), which is indistinguishable from 「nobody qualifies yet」 on
		// every screen that shows the board. Say it once at boot so the empty
		// apex band has a stated cause.
		slog.Info("ranking: apex is gated by ladder size — a board smaller than this crowns nobody",
			"minApexLadder", ladder.MinApexLadder, "knob", "RANKED_MIN_APEX_LADDER")
	}
	rank := ranking.New(rdb, store, accounts, cfg.Season, ladder)

	// Store catalog from the read-only content tree. Missing content is
	// tolerated (empty catalog) so the platform boots without it mounted.
	cat, err := wallet.LoadCatalog(cfg.ContentDir)
	if err != nil {
		return nil, err
	}
	if len(cat.ChampionPrices) == 0 {
		slog.Warn("wallet: no store catalog loaded — store empty, matches grant 0 M COIN",
			"contentDir", cfg.ContentDir)
	} else if unlockable := cat.UnlockableChampions(); len(unlockable) == 0 {
		// Every champion priced at 0 means the whole 水晶 meta-progression loop
		// (task #118) is decorative: nothing to spend crystals on, so the
		// 「解鎖」 button never appears. That is a content mistake, not a
		// deployment mode, so it is loud.
		slog.Warn("wallet: no champion has a crystal price — the 水晶 unlock loop is inert, every champion is a free starter",
			"contentDir", cfg.ContentDir, "champions", len(cat.ChampionPrices),
			"fix", "set championPrices entries > 0 in content/config/store.json")
	} else if drift := cat.PriceDrift(wallet.CrystalUnlockCost); len(drift) > 0 {
		// The champ-select unlock button renders a CLIENT-side constant, so a
		// price that disagrees with it charges a different number than the one
		// the player was shown. Warn rather than fail: the server still charges
		// the store.json price, which is the truth.
		slog.Warn("wallet: champion crystal prices disagree with the cost the client button displays — players will be shown the wrong number",
			"clientLabelCost", wallet.CrystalUnlockCost, "mismatched", drift,
			"fix", "keep championPrices at the client constant, or update CRYSTAL_UNLOCK_COST in apps/client/src/ui/panels/champselect/walletMeta.ts")
	}
	slog.Info("wallet: 水晶 meta-progression",
		"freeStarters", len(cat.FreeChampions()), "unlockable", len(cat.UnlockableChampions()),
		"unlockCost", wallet.CrystalUnlockCost,
		"perMatchGrant", []int{wallet.CrystalPlace1, wallet.CrystalPlace2, wallet.CrystalPlace3, wallet.CrystalPlace4})
	walletSvc := wallet.New(accounts, rdb, store, cat, cfg.NewAccountCrystals)
	// New-account 藍水晶 welcome seed (task #204). auth cannot import wallet, so
	// the seeder is injected exactly like the invite gate. On the real binary
	// cfg.NewAccountCrystals defaults to 1000; the hand-built test config leaves
	// it 0, so the settlement suite keeps its zero-crystal baseline.
	authSvc.SetWalletSeeder(walletSvc)
	if cfg.NewAccountCrystals > 0 {
		slog.Info("wallet: new accounts are seeded a one-time 藍水晶 welcome grant",
			"crystals", cfg.NewAccountCrystals, "override", "GGD_NEW_ACCOUNT_CRYSTALS")
	}
	// ONE-OFF #204 backfill: grant the welcome 藍水晶 to every existing account that
	// never got it (idempotent — veterans with a walletmeta record are skipped).
	// Enabled for a single deploy via GGD_BACKFILL_WELCOME_CRYSTALS=1, then removed.
	if cfg.BackfillWelcomeCrystals {
		bctx := context.Background()
		if ids, lerr := accounts.List(bctx); lerr != nil {
			slog.Error("wallet: welcome-crystal backfill could not list accounts", "err", lerr)
		} else {
			granted, skipped, ferr := walletSvc.BackfillWelcomeCrystals(bctx, ids)
			slog.Info("wallet: ONE-OFF welcome-crystal backfill (GGD_BACKFILL_WELCOME_CRYSTALS)",
				"granted", granted, "skipped", skipped, "total", len(ids),
				"crystalsEach", cfg.NewAccountCrystals, "firstErr", ferr)
		}
	}

	settler := gamelink.NewSettler(store, rdb, accounts, pres, rank, rooms, walletSvc)
	glink := gamelink.New(rdb, accounts, pres, rank, journal, settler, cat,
		cfg.GameSharedSecret, cfg.GameServerAddr, cfg.InternalURL,
		cfg.MatchPendingTTL, cfg.MatchLivenessGrace, cfg.HMACSkew)
	rooms.SetStarter(glink)
	rooms.SetOwnership(walletSvc)
	// 大廳集合令 (GH#492): who a rally broadcast may reach. The enumeration lives
	// in friend (accounts + presence are already there) and is SHARED with
	// GET /lobby/online, so the room browser and the broadcast can never disagree
	// about who counts as a lobby player.
	rooms.SetRoster(lobbyRoster{friend.NewHandlers(friends, accounts, pres)})

	adminSvc := admin.New(accounts, walletSvc, rank, friends, store, rdb, cfg.AdminBootstrapUsername)
	// CONTENT_DIR arms the whitelist's LEGACY GATE: an id whose document has
	// been archived under content/_legacy/ can neither be served nor stored,
	// and a stored one is self-healed + audited on the first read
	// (curation/legacyevict.go, GH#479/#481). Read-only; it never writes under
	// content/.
	curationSvc := curation.New(store, rdb, curation.WithContentDir(cfg.ContentDir))
	// #189 durable content overlay: the data/ store that lets an admin content
	// edit survive a git pull on the host (content/ there is a :ro mount).
	//
	// It is handed CONTENT_DIR so it can answer the one question the overlay
	// alone cannot — "has the SHIPPED doc moved underneath this entry?" — by
	// reading the hashes the TS content build already wrote into each
	// collection's _index.json. Read-only; it never writes under content/.
	overlaySvc := contentoverlay.New(store, rdb, contentoverlay.WithContentDir(cfg.ContentDir))
	// One line in the deploy log about what is overlaid, plus a warning per
	// entry the shipped tree has moved underneath. Never fails a boot.
	overlaySvc.LogBootSummary(context.Background())
	combatEnvSvc := combatenv.New(store, rdb, cfg.ContentDir)
	// The ops inventory DESCRIBES the reaper, so it is handed the same numbers
	// the reaper runs on — including the interval after gamelink's own clamp,
	// via the one function that computes it. A page that states a timing fact
	// it did not get from the mechanism is how #187 got a 2x-wrong duration in
	// front of the owner.
	opsEnvSvc := opsenv.New(store, rdb, opsenv.Runtime{
		ContentDir:         cfg.ContentDir,
		MatchPendingTTL:    cfg.MatchPendingTTL,
		MatchLivenessGrace: cfg.MatchLivenessGrace,
		ReaperInterval:     gamelink.ReaperInterval(reaperInterval(cfg), cfg.MatchLivenessGrace),
	})
	inviteSvc := invite.New(store)
	aiSvc := ai.New(store, rdb)

	// #243 whole-platform migration archive. It is handed the auth service as
	// its Reauthenticator (export and commit re-confirm the caller's OWN
	// password on top of the admin session) and a Reindexer that writes the
	// Redis uniqueness indexes with SET — deliberately NOT boot.Rebuild, which
	// uses SetNX and therefore cannot repair a username index the migration
	// just re-pointed. See internal/platformarchive/reindex.go.
	// #207 per-match analysis ledger. It takes CONTENT_DIR and the build stamp
	// because it VERSION-STAMPS every record it accepts — the whole point of
	// keeping this data is comparing one build against the next, and neither
	// stamp can be reconstructed after the fact. See internal/matchstats.
	matchStatsSvc := matchstats.New(store, matchstats.Options{
		PlatformVersion: os.Getenv("GGD_PLATFORM_VERSION"),
		ContentDir:      cfg.ContentDir,
	})

	archiveSvc := platformarchive.New(platformarchive.Deps{
		Store:           store,
		DataDir:         store.Root(),
		ContentDir:      cfg.ContentDir,
		PlatformVersion: os.Getenv("GGD_PLATFORM_VERSION"),
		Auth:            authSvc,
		Reindex:         &platformarchive.Reindexer{Rdb: rdb, Season: rank.Season()},
	})

	// #209 Slack pending-registration notifier + click-to-approve link. The token
	// is signed with the JWT secret (domain-separated — see approvelink), consumed
	// through Redis for single-use, and applied through admin.SetApprovalFromLink,
	// the SAME "set approved" seam the console uses (audited, session-revoking,
	// last-admin-guarded). The webhook secret comes from either the env or the
	// admin-gated durable config; the public URL builds the absolute link the
	// owner taps from their phone. Wired unconditionally — a nil/disabled config
	// makes NotifyPending a cheap no-op — and injected into auth as the notifier
	// (auth cannot import this package: it imports admin, which imports auth).
	approveSvc := approvelink.New(store, rdb, []byte(cfg.JWTSecret), adminSvc, accounts, approvelink.Options{
		PublicURL:     cfg.PublicURL,
		EnvWebhookURL: cfg.SlackWebhookURL,
		EnvEnabled:    cfg.SlackNotifyEnabled,
	})
	authSvc.SetPendingNotifier(approveSvc)

	// Registration invite-code gate (#174). Installed ONLY when required, so a
	// dev/CI platform keeps the open-signup flow the rest of the suite assumes
	// (auth.Service treats a nil gate as "off"). The resolved value is logged on
	// every boot — this is the only thing keeping strangers off the family
	// deploy, so it must never be a quiet decision. See config.resolveRequireInvite.
	//
	// ⚠️ `cfg.RequireInvite` IS THE PRODUCTION HALF OF THIS OR, AND IT IS THE ONLY
	// ONE. cmd/platform calls server.New(cfg, server.Options{}) — the shipped
	// binary never sets opts.RequireInvite; that field exists so a test can gate
	// one instance without touching the environment. Until GH#236 EVERY test that
	// exercised the gate went through the opts half, so deleting `|| cfg.RequireInvite`
	// left the whole platform module green while turning ggd.adms.ai into open
	// signup with the #179 enumeration oracle wide open (measured 2026-08-04).
	// The guard that now fails on that deletion is
	// auth/register_gate_wiring_test.go — it boots with Options{} and posts the
	// four enumeration probes. Do not "simplify" this condition.
	if opts.RequireInvite || cfg.RequireInvite {
		authSvc.SetInviteGate(inviteSvc)
		// GH#179 residual: with the gate on, an un-invited caller cannot
		// enumerate accounts, but a caller holding a LIVE code can — every
		// conflicting probe hands their code back. This prices each probe at one
		// code. Off by default (an honest typo keeps the invite); logged either
		// way, because it changes what a family member experiences.
		authSvc.SetBurnInviteOnConflict(cfg.BurnInviteOnConflict)
		slog.Info("auth: registration REQUIRES an invite code — mint them in the admin console (邀請碼)",
			"addr", cfg.Addr, "override", "GGD_REQUIRE_INVITE",
			"burnInviteOnConflict", cfg.BurnInviteOnConflict,
			"burnNote", "on = a registration that hits a taken name SPENDS the code (bounds GH#179 enumeration); off = the code is handed back")
	} else {
		slog.Warn("auth: registration is OPEN — anyone who can reach this platform can create an account",
			"addr", cfg.Addr,
			"why", "GGD_REQUIRE_INVITE is off, or unset with a loopback-only listen address",
			"harden", "set GGD_REQUIRE_INVITE=1 if anything (nginx, a tunnel, a proxy) forwards to this platform from outside")
	}

	hub := lobby.NewHub(rdb, friends)
	hub.SetMaxConnsPerAccount(cfg.LobbyMaxConnsPerAccount)
	sessions := lobby.NewSessions(hub, authSvc, pres, rooms, rdb)
	sessions.SetReadLimits(cfg.LobbyWSReadLimitBytes, cfg.LobbyWSIdleTimeout)

	s := &Server{
		Cfg: cfg, Rdb: rdb, Store: store, Journal: journal, Accounts: accounts,
		Auth: authSvc, Friends: friends, Presence: pres, Rooms: rooms,
		Ranking: rank, Gamelink: glink, Wallet: walletSvc, Admin: adminSvc,
		Curation: curationSvc, Overlay: overlaySvc, CombatEnv: combatEnvSvc, OpsEnv: opsEnvSvc, Invites: inviteSvc,
		AI: aiSvc, Approve: approveSvc, Archive: archiveSvc, MatchStats: matchStatsSvc,
		Hub: hub, Sessions: sessions,
		registerRateLimit:  envInt("GGD_REGISTER_RATE_LIMIT", 0),
		requireApproval:    requireApproval,
		pendingApprovalTTL: cfg.PendingApprovalTTL,
	}
	s.buildRouter(templates)
	return s, nil
}

// maxRequestBodyBytes is the explicit request-body cap applied to every route
// (#126 go-live hardening). It matches httpx.DecodeJSON's own cap, so nothing
// that works today is affected; it additionally protects any route that reads
// the raw body without DecodeJSON.
const maxRequestBodyBytes int64 = 1 << 20 // 1 MiB

// maxArchiveUploadBytes is the cap for the ONE route that legitimately carries
// a large body: #243's platform-archive upload. A real migration archive is
// tens of MB (hundreds if the operator opts replays in), so the global 1 MiB
// cap would 413 every single import — with no explanation on either side, since
// MaxBytesReader's error surfaces as a generic decode failure.
//
// RAISING THE GLOBAL CAP INSTEAD WOULD NOT BE ACCEPTABLE: it exists as #126
// go-live hardening and applies to every route precisely so no route has to
// remember to bound itself.
const maxArchiveUploadBytes int64 = 512 << 20 // 512 MiB

// archiveStagePath is the only path exempt from the global body cap.
//
// EXACT match, never a prefix: a prefix exemption would silently enlarge every
// future route added under the same subtree (plan and commit, which take small
// JSON bodies, live right next to it).
const archiveStagePath = platformarchive.StagePath

// maxMatchStatsBytes is the cap for the OTHER route that legitimately carries a
// body over 1 MiB: #207's per-match analysis ledger.
//
// A real ledger is 12 seats × ~8 rounds of casts, item transactions and offers
// — hundreds of KB, and comfortably over 1 MiB for a long match. Under the
// global cap the platform would 413 exactly the matches with the most to
// analyse, and MaxBytesReader's error surfaces as a generic decode failure, so
// the loss would be invisible on both sides.
//
// The ceiling is matchstats.MaxRecordBytes (itself derived from the archive's
// per-document limit) plus one 64 KiB envelope's worth of slack for the JSON
// wrapper around the ledger, so the HTTP layer never rejects a body the storage
// layer would have accepted.
const maxMatchStatsBytes int64 = matchstats.MaxRecordBytes + (64 << 10)

// hstsHeader sets HTTP Strict-Transport-Security on every response. TLS
// terminates upstream of this binary, but the header travels with the app so
// the guarantee holds if the edge ever becomes the TLS hop.
func hstsHeader(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
		next.ServeHTTP(w, r)
	})
}

// capRequestBody wraps every request body in a MaxBytesReader so an oversized
// upload is rejected instead of buffered.
func capRequestBody(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Body != nil {
			limit := maxRequestBodyBytes
			// EXACT matches only, never prefixes — see archiveStagePath.
			switch r.URL.Path {
			case archiveStagePath:
				limit = maxArchiveUploadBytes
			case matchstats.IngestPath:
				limit = maxMatchStatsBytes
			}
			r.Body = http.MaxBytesReader(w, r.Body, limit)
		}
		next.ServeHTTP(w, r)
	})
}

// throttleRegister applies the app-layer global registration cap (0 = off). It
// keys on a fixed bucket, never on a caller address — per-IP register limiting
// is the edge's job (see the registerRateLimit field comment).
//
// A shared bucket is exhaustible by one scripted client, which on an ownerless
// deploy could in principle keep the operator from registering and so from
// claiming ownership. Splitting it per-IP was considered and REJECTED: this
// binary sits behind a LAN-published vite proxy, so every remote client already
// arrives as 127.0.0.1 and would share one bucket anyway — the operator's own
// client included. Per-IP bucketing here would add an address dependency that
// internal/server/devsurface_test.go forbids, in exchange for no protection in
// the topology that actually exists. Per-IP throttling belongs at the edge,
// which is the only hop that can still see distinct callers.
func (s *Server) throttleRegister(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.registerRateLimit > 0 && r.Method == http.MethodPost &&
			strings.HasSuffix(r.URL.Path, "/auth/register") {
			ok, err := s.Rdb.RateAllow(r.Context(), "register", "global", int64(s.registerRateLimit), time.Minute)
			if err == nil && !ok {
				httpx.WriteError(w, httpx.RateLimited("too many registrations right now, please try again shortly"))
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) buildRouter(templates *room.Templates) {
	r := chi.NewRouter()
	r.Use(httpx.Recoverer, httpx.RequestLogger)
	// #126 go-live hardening: HSTS, an explicit body cap and the register
	// throttle wrap every route beneath the loggers.
	r.Use(hstsHeader, capRequestBody, s.throttleRegister)

	r.Route("/api/v1", func(api chi.Router) {
		api.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
			httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
		})

		// Public.
		authHandlers := auth.NewHandlers(s.Auth)
		// #724/F-21 — mirror the refresh token into an httpOnly cookie so the
		// admin console can stop persisting it. One knob rolls both halves back.
		authHandlers.SetRefreshCookie(s.Cfg.AuthRefreshCookie)
		authHandlers.Mount(api)
		ranking.NewHandlers(s.Ranking).MountPublic(api)
		// GH#645 大廳英雄榜：被選用次數排序（勝率附帶）。Aggregated off the
		// durable match records gamelink owns, so it mounts from gamelink,
		// not ranking. No names in the payload → public like /ranking/player.
		gamelink.NewChampionUsage(s.Store).MountPublic(api)
		admin.NewHandlers(s.Admin).MountPublic(api) // active announcement feed
		// content whitelist: public read (game-server + client), admin writes
		curation.NewHandlers(s.Curation, s.Admin.AdminOnly).MountPublic(api)
		// #189 durable content overlay: public read of the merged-content bundle
		// (game-server + client), admin-gated writes on the authed router below.
		contentoverlay.NewHandlers(s.Overlay, s.Admin.AdminOnly).MountPublic(api)
		// combat-env table: public read (game-server per-match snapshot)
		combatenv.NewHandlers(s.CombatEnv, s.Admin.AdminOnly).MountPublic(api)
		// server-ops table: public read (game-server resolves maxRooms +
		// snapshotHz at match creation, no token — same reason as combat-env)
		opsenv.NewHandlers(s.OpsEnv, s.Admin.AdminOnly).MountPublic(api)
		// AI provider READINESS only (booleans; loopback also gets the model,
		// the endpoint host and the operator's next action). No key material —
		// the masked config stays admin-gated on the authed router below. The
		// asset console (#assets) reads this without a login, which is the whole
		// reason it can show live provider state instead of a stale sentence.
		ai.NewHandlers(s.AI, s.Admin.AdminOnly).MountPublic(api)
		// #209 click-to-approve. GET/POST /approve are TOKEN-gated, not
		// session-gated — the owner taps them from their phone, not logged into
		// /admin — so they live on the PUBLIC router. The GET is read-only and
		// prefetch-safe (Slack unfurls it); only the POST mutates. See
		// internal/approvelink.
		approvelink.NewHandlers(s.Approve, s.Admin.AdminOnly).MountPublic(api)
		s.Sessions.Mount(api) // WS authenticates at handshake

		// Internal (HMAC-guarded, not exposed via the public edge).
		s.Gamelink.MountInternal(api)
		// #207 the game-server's per-match analysis ledger. Same HMAC channel
		// as the settlement callback — same sender, same trust — but a separate
		// route and a separate failure domain: a malformed ledger must never be
		// able to block a payout.
		matchstats.NewHandlers(s.MatchStats, s.Admin.AdminOnly,
			s.Cfg.GameSharedSecret, s.Cfg.HMACSkew).MountInternal(api)

		// Authenticated REST.
		api.Group(func(pr chi.Router) {
			pr.Use(s.Auth.Middleware)
			friend.NewHandlers(s.Friends, s.Accounts, s.Presence).Mount(pr)
			// Room/match routes ARE "playing", so they carry the extra
			// PlayableOnly gate: a ban or a #126 denial applied a moment ago
			// must stop this player NOW, not whenever his access token
			// expires. Scoped to its own group so the durable account read
			// costs nothing on the routes around it. Same guard the lobby
			// WebSocket handshake applies — see auth.PlayableOnly.
			pr.Group(func(rr chi.Router) {
				rr.Use(s.Auth.PlayableOnly)
				room.NewHandlers(s.Rooms, templates, s.Cfg.InviteTTL).Mount(rr)
				// GET /lobby/online — the lobby's 線上玩家 roster (owner
				// 2026-08-03). It is the ONE endpoint that hands a caller
				// every other player's name, so it sits behind the same
				// PlayableOnly gate as playing: task #210 is the recorded
				// case of a rejected account with a still-valid token
				// walking past plain token auth. See internal/friend/online.go.
				friend.NewHandlers(s.Friends, s.Accounts, s.Presence).MountPlayable(rr)
				// GET /ranking/me/nemesis — 宿敵榜 (GH#454). Same reasoning as
				// the roster above: it hands the caller other players' names.
				ranking.NewHandlers(s.Ranking).MountPlayable(rr)
			})
			ranking.NewHandlers(s.Ranking).MountAuthed(pr)
			wallet.NewHandlers(s.Wallet).Mount(pr)
			admin.NewHandlers(s.Admin).Mount(pr) // /admin/* — AdminOnly inside
			// /curation/whitelist writes — AdminOnly inside
			curation.NewHandlers(s.Curation, s.Admin.AdminOnly).Mount(pr)
			// #189 /content-overlay/docs/* writes — AdminOnly inside
			contentoverlay.NewHandlers(s.Overlay, s.Admin.AdminOnly).Mount(pr)
			// /admin/combat-env — AdminOnly inside
			combatenv.NewHandlers(s.CombatEnv, s.Admin.AdminOnly).Mount(pr)
			// /admin/server-ops — AdminOnly inside
			opsenv.NewHandlers(s.OpsEnv, s.Admin.AdminOnly).Mount(pr)
			// /ai/icon + /ai/text authed; /admin/ai/config AdminOnly inside
			ai.NewHandlers(s.AI, s.Admin.AdminOnly).Mount(pr)
			// #209 /admin/slack-notify — the Slack webhook config, AdminOnly
			// inside. (The token-gated /approve endpoints are mounted PUBLIC,
			// above.)
			approvelink.NewHandlers(s.Approve, s.Admin.AdminOnly).Mount(pr)
			// /admin/replays — the match-replay browser (task #175). Proxies the
			// game server's private recording API through the admin gate, because
			// recordings carry player names. AdminOnly inside.
			gamelink.NewReplayHandlers(s.Gamelink, s.Admin.AdminOnly).Mount(pr)
			// #636 /admin/damage-board — top single-cast damage board (Redis,
			// written by the game shard at match close). Read-only proxy,
			// AdminOnly inside.
			gamelink.NewDamageBoardHandlers(s.Gamelink, s.Admin.AdminOnly).Mount(pr)
			// #243 /admin/platform-archive/* — the whole-platform ZIP
			// export/import. AdminOnly inside, and the two dangerous verbs
			// (export, commit) additionally re-confirm the caller's OWN
			// password through auth.ReauthPassword. See internal/platformarchive.
			platformarchive.NewHandlers(s.Archive, s.Admin.AdminOnly).Mount(pr)
			// #207 /admin/match-stats — the per-match review index and one
			// full ledger. AdminOnly inside: a ledger names every seat's
			// champion, purchases and declined offers for identifiable
			// accounts, which is player behaviour, not content.
			matchstats.NewHandlers(s.MatchStats, s.Admin.AdminOnly,
				s.Cfg.GameSharedSecret, s.Cfg.HMACSkew).Mount(pr)
		})

		// #126 private-deploy: admin account-approval gate. Registered as its own
		// authed+AdminOnly group so it does NOT touch the #118 wallet route group
		// above. New paths under /admin/accounts/{id}/... — the specific routes
		// win over the mounted /admin subrouter's catch-all.
		api.Group(func(pr chi.Router) {
			pr.Use(s.Auth.Middleware)
			pr.Group(func(ar chi.Router) {
				ar.Use(s.Admin.AdminOnly)
				ar.Post("/admin/accounts/{id}/approve", s.approveAccount)
				ar.Post("/admin/accounts/{id}/deny", s.denyAccount)
				// Role grant/revoke. The first-owner bootstrap decides ownership
				// by arrival order on a public endpoint, so a wrong grant has to
				// be fixable IN the product — before this route the only way to
				// take a role back was hand-editing account JSON.
				ar.Post("/admin/accounts/{id}/role", s.setAccountRole)
			})
		})

		// #174 invite codes: mint / list / revoke. Its own authed group (the
		// package puts AdminOnly around its own routes) so the diff is additive
		// and does not touch the groups above. There is NO public route here on
		// purpose — an invite code is a credential, so nothing about it is
		// readable, or even testable, without an operator session. See
		// internal/invite's package header.
		api.Group(func(pr chi.Router) {
			pr.Use(s.Auth.Middleware)
			invite.NewHandlers(s.Invites, s.Admin.AdminOnly).Mount(pr)
		})
	})

	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		httpx.WriteError(w, httpx.NotFound("no such route"))
	})
	s.router = r
}

// Router returns the HTTP handler.
func (s *Server) Router() http.Handler { return s.router }

// approveAccount flips a pending account to approved so it may log in to play
// (#126). AdminOnly-gated and audited.
func (s *Server) approveAccount(w http.ResponseWriter, r *http.Request) {
	s.setAccountStatus(w, r, account.StatusApproved)
}

// denyAccount marks an account's registration declined and revokes any live
// session, so a previously-approved account is kicked immediately. AdminOnly.
func (s *Server) denyAccount(w http.ResponseWriter, r *http.Request) {
	s.setAccountStatus(w, r, account.StatusDenied)
}

// setAccountRole grants or revokes the admin role. AdminOnly-gated and audited;
// the service refuses to remove the last administrator who can still sign in.
func (s *Server) setAccountRole(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Role  string `json:"role"`
		Grant *bool  `json:"grant"`
	}
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if req.Role != admin.RoleAdmin {
		httpx.WriteError(w, httpx.BadRequest(`role must be "`+admin.RoleAdmin+`"`))
		return
	}
	if req.Grant == nil {
		httpx.WriteError(w, httpx.BadRequest("grant must be true or false"))
		return
	}
	actor, _ := auth.IdentityFrom(r.Context())
	row, err := s.Admin.SetAdminRole(r.Context(), actor.AccountID, chi.URLParam(r, "id"), *req.Grant)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]admin.AccountRow{"account": row})
}

// setAccountStatus is the shared body of approve/deny. It goes through
// admin.Service.SetApproval rather than writing the status directly, so the
// decision is AUDITED, revokes live sessions when it takes access away, and
// cannot strand the deploy without a usable administrator — see SetApproval.
// An optional {"reason": "..."} body is recorded on the audit line; a missing
// or unparseable body is not an error, because deny is also called as a bare
// POST from a console button.
func (s *Server) setAccountStatus(w http.ResponseWriter, r *http.Request, status string) {
	var req struct {
		Reason string `json:"reason"`
	}
	_ = httpx.DecodeJSON(r, &req)
	actor, _ := auth.IdentityFrom(r.Context())
	row, err := s.Admin.SetApproval(r.Context(), actor.AccountID, chi.URLParam(r, "id"), status, req.Reason)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	// The response keeps the pre-existing {"account": …} shape, now carrying the
	// admin row (which is a superset of account.Public for an operator caller:
	// same id/username/status plus the ban/role/mcoin fields the console
	// already renders elsewhere).
	httpx.WriteJSON(w, http.StatusOK, map[string]admin.AccountRow{"account": row})
}

// Boot rebuilds the Redis hot layer from the JSON truth (WAL replay,
// uniqueness indexes, leaderboard) and grants the bootstrap admin role.
func (s *Server) Boot(ctx context.Context) error {
	if err := boot.Rebuild(ctx, boot.Deps{
		Rdb: s.Rdb, Accounts: s.Accounts, Journal: s.Journal,
		Settler: gamelink.NewSettler(s.Store, s.Rdb, s.Accounts, s.Presence, s.Ranking, s.Rooms, s.Wallet),
		Season:  s.Cfg.Season,
	}); err != nil {
		return err
	}
	// The rebuild ZADDs the visible boards behind the ranking service's back,
	// so drop any apex pass cached from the pre-rebuild state.
	s.Ranking.InvalidateApex()
	// Idempotently make the configured bootstrap account a usable admin.
	if err := s.Admin.EnsureBootstrapAdmin(ctx); err != nil {
		return err
	}
	// Report the deploy's ownership state (and mint/clear the one-time owner
	// token). This runs LAST so it sees the bootstrap grant above and reports
	// the deploy as owned rather than reopening the claim window for it.
	if err := s.Auth.PrepareOwnerBootstrap(ctx); err != nil {
		return err
	}
	// 管理員預設好友 的回填 (GH#499). ⭐ Linking only NEW accounts would leave the
	// 198 that already exist without it — i.e. almost everybody. It runs AFTER
	// EnsureBootstrapAdmin above on purpose: that is what makes the admin it has
	// to resolve already carry the role. Backgrounded and non-fatal — a social
	// convenience must never stop the platform booting.
	s.Friends.BackfillAdminFriendsInBackground(ctx)
	return nil
}

// reaperInterval is the sweep period this binary REQUESTS. gamelink clamps it
// to a third of the liveness grace (see gamelink.ReaperInterval), which is what
// actually governs; this exists so the request is written once and both the
// reaper and the page that describes the reaper read the same expression.
func reaperInterval(cfg config.Config) time.Duration { return cfg.MatchPendingTTL / 4 }

// pendingSweepInterval is how often the #126 pending-account TTL sweep runs
// (sec-154-11). The TTL is measured in days, so an hourly pass reclaims an
// expired account well within a day of its deadline while costing one O(n)
// account scan per hour — negligible at family scale.
const pendingSweepInterval = time.Hour

// startPendingSweep runs the #126 pending-account TTL reaper (sec-154-11): on a
// fixed interval it deletes PENDING accounts older than pendingApprovalTTL and
// reclaims their username/email reservations (account.SweepExpiredPending), so
// the approval queue can never accumulate durable files + permanent Redis index
// keys forever. It starts ONLY when the approval gate is on AND a positive TTL
// is configured; otherwise no pending accounts are created and there is nothing
// to reap, so it never starts. A first pass runs immediately at boot so a
// process that restarts more often than the interval still makes progress.
func (s *Server) startPendingSweep(ctx context.Context) {
	if !s.requireApproval || s.pendingApprovalTTL <= 0 {
		return
	}
	sweep := func() {
		cutoff := time.Now().Add(-s.pendingApprovalTTL)
		n, err := s.Accounts.SweepExpiredPending(ctx, cutoff)
		if err != nil {
			slog.Error("auth: pending-account TTL sweep failed", "err", err)
			return
		}
		if n > 0 {
			slog.Info("auth: pending-account TTL sweep reclaimed expired registrations",
				"deleted", n, "ttl", s.pendingApprovalTTL)
		}
	}
	go func() {
		t := time.NewTicker(pendingSweepInterval)
		defer t.Stop()
		sweep()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				sweep()
			}
		}
	}()
}

// Start launches background loops (lobby hub, match reaper, pending-account TTL
// sweep) and waits until the hub subscription is live.
func (s *Server) Start(ctx context.Context) {
	ctx, cancel := context.WithCancel(ctx)
	s.cancel = cancel
	go s.Hub.Run(ctx)
	s.Gamelink.StartReaper(ctx, reaperInterval(s.Cfg))
	s.startPendingSweep(ctx)
	<-s.Hub.Ready()
}

// Close stops background loops, flushes the ranking snapshot and closes Redis.
func (s *Server) Close() {
	if s.cancel != nil {
		s.cancel()
	}
	// ⭐ JOIN the backgrounded 好友回填 before tearing the stores down. It writes
	// account JSON; a write that lands after teardown is either a lost link or
	// an error into a directory that no longer exists (GH#653).
	if s.Friends != nil {
		s.Friends.WaitBackground()
	}
	_ = s.Ranking.Flush(context.Background())
	_ = s.Rdb.Close()
}

// ---- 大廳集合令 seam (GH#492) -------------------------------------------------
//
// `room` may not import `friend` (server.go already wires friend → room, and the
// reverse edge would close a cycle), so the roster crosses the boundary as a
// tiny adapter that re-labels friend.LiveAccount into room.LobbyAccount. The two
// structs are field-for-field identical BY DESIGN: this function is the one place
// a drift between them turns into a compile error rather than a silently empty
// invite list.
type lobbyRoster struct{ h *friend.Handlers }

func (r lobbyRoster) Lookup(ctx context.Context, accountID string) (room.LobbyAccount, error) {
	a, err := r.h.Lookup(ctx, accountID)
	if err != nil {
		return room.LobbyAccount{}, err
	}
	return room.LobbyAccount{ID: a.ID, Username: a.Username, State: a.State, MMR: a.MMR}, nil
}

func (r lobbyRoster) InLobby(ctx context.Context) ([]room.LobbyAccount, error) {
	live, err := r.h.InLobby(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]room.LobbyAccount, 0, len(live))
	for _, a := range live {
		out = append(out, room.LobbyAccount{ID: a.ID, Username: a.Username, State: a.State, MMR: a.MMR})
	}
	return out, nil
}
