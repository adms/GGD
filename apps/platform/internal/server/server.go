// Package server is the composition root: it wires config → stores → services
// → HTTP routes into one runnable unit (also used directly by tests).
package server

import (
	"context"
	"errors"
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
	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/combatenv"
	"github.com/ggd/platform/internal/config"
	"github.com/ggd/platform/internal/curation"
	"github.com/ggd/platform/internal/data/boot"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/data/wal"
	"github.com/ggd/platform/internal/friend"
	"github.com/ggd/platform/internal/gamelink"
	"github.com/ggd/platform/internal/httpx"
	"github.com/ggd/platform/internal/lobby"
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
	CombatEnv *combatenv.Service
	AI        *ai.Service
	Hub       *lobby.Hub
	Sessions  *lobby.Sessions

	// registerRateLimit is the max /auth/register calls allowed per minute
	// server-wide (0 = disabled). This is an app-layer backstop to the edge's
	// per-IP register throttle (the auth/server packages may not read a caller
	// address — see internal/server/devsurface_test.go — so per-IP register
	// limiting is owned by nginx; this global cap needs no address).
	registerRateLimit int

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

	// Private-deploy gate (#126): enabled by Options or GGD_REQUIRE_APPROVAL.
	requireApproval := opts.RequireApproval || envEnabled("GGD_REQUIRE_APPROVAL")
	authSvc, err := auth.New(accounts, rdb, cfg.JWTSecret, cfg.AccessTokenTTL, cfg.RefreshTokenTTL, opts.Argon2Params, requireApproval)
	if err != nil {
		return nil, err
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
	}
	walletSvc := wallet.New(accounts, rdb, store, cat)

	settler := gamelink.NewSettler(store, rdb, accounts, pres, rank, rooms, walletSvc)
	glink := gamelink.New(rdb, accounts, pres, rank, journal, settler, cat,
		cfg.GameSharedSecret, cfg.GameServerAddr, cfg.InternalURL,
		cfg.MatchPendingTTL, cfg.HMACSkew)
	rooms.SetStarter(glink)
	rooms.SetOwnership(walletSvc)

	adminSvc := admin.New(accounts, walletSvc, rank, friends, store, rdb, cfg.AdminBootstrapUsername)
	curationSvc := curation.New(store, rdb)
	combatEnvSvc := combatenv.New(store, rdb, cfg.ContentDir)
	aiSvc := ai.New(store, rdb)

	hub := lobby.NewHub(rdb, friends)
	sessions := lobby.NewSessions(hub, authSvc, pres, rooms, rdb)

	s := &Server{
		Cfg: cfg, Rdb: rdb, Store: store, Journal: journal, Accounts: accounts,
		Auth: authSvc, Friends: friends, Presence: pres, Rooms: rooms,
		Ranking: rank, Gamelink: glink, Wallet: walletSvc, Admin: adminSvc,
		Curation: curationSvc, CombatEnv: combatEnvSvc, AI: aiSvc, Hub: hub, Sessions: sessions,
		registerRateLimit: envInt("GGD_REGISTER_RATE_LIMIT", 0),
	}
	s.buildRouter(templates)
	return s, nil
}

// maxRequestBodyBytes is the explicit request-body cap applied to every route
// (#126 go-live hardening). It matches httpx.DecodeJSON's own cap, so nothing
// that works today is affected; it additionally protects any route that reads
// the raw body without DecodeJSON.
const maxRequestBodyBytes int64 = 1 << 20 // 1 MiB

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
			r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
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
		auth.NewHandlers(s.Auth).Mount(api)
		ranking.NewHandlers(s.Ranking).MountPublic(api)
		admin.NewHandlers(s.Admin).MountPublic(api) // active announcement feed
		// content whitelist: public read (game-server + client), admin writes
		curation.NewHandlers(s.Curation, s.Admin.AdminOnly).MountPublic(api)
		// combat-env table: public read (game-server per-match snapshot)
		combatenv.NewHandlers(s.CombatEnv, s.Admin.AdminOnly).MountPublic(api)
		// AI provider READINESS only (booleans; loopback also gets the model,
		// the endpoint host and the operator's next action). No key material —
		// the masked config stays admin-gated on the authed router below. The
		// asset console (#assets) reads this without a login, which is the whole
		// reason it can show live provider state instead of a stale sentence.
		ai.NewHandlers(s.AI, s.Admin.AdminOnly).MountPublic(api)
		s.Sessions.Mount(api) // WS authenticates at handshake

		// Internal (HMAC-guarded, not exposed via the public edge).
		s.Gamelink.MountInternal(api)

		// Authenticated REST.
		api.Group(func(pr chi.Router) {
			pr.Use(s.Auth.Middleware)
			friend.NewHandlers(s.Friends, s.Accounts, s.Presence).Mount(pr)
			room.NewHandlers(s.Rooms, templates, s.Cfg.InviteTTL).Mount(pr)
			ranking.NewHandlers(s.Ranking).MountAuthed(pr)
			wallet.NewHandlers(s.Wallet).Mount(pr)
			admin.NewHandlers(s.Admin).Mount(pr) // /admin/* — AdminOnly inside
			// /curation/whitelist writes — AdminOnly inside
			curation.NewHandlers(s.Curation, s.Admin.AdminOnly).Mount(pr)
			// /admin/combat-env — AdminOnly inside
			combatenv.NewHandlers(s.CombatEnv, s.Admin.AdminOnly).Mount(pr)
			// /ai/icon + /ai/text authed; /admin/ai/config AdminOnly inside
			ai.NewHandlers(s.AI, s.Admin.AdminOnly).Mount(pr)
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
	})

	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		httpx.WriteError(w, httpx.NotFound("no such route"))
	})
	s.router = r
}

// Router returns the HTTP handler.
func (s *Server) Router() http.Handler { return s.router }

// approveAccount flips a pending account to approved so it may log in to play
// (#126). AdminOnly-gated.
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

func (s *Server) setAccountStatus(w http.ResponseWriter, r *http.Request, status string) {
	id := chi.URLParam(r, "id")
	a, err := s.Accounts.SetStatus(r.Context(), id, status)
	if err != nil {
		if errors.Is(err, account.ErrNotFound) {
			httpx.WriteError(w, httpx.NotFound("account not found"))
			return
		}
		httpx.WriteError(w, err)
		return
	}
	if status == account.StatusDenied {
		// Best effort — the login/refresh approval guard is authoritative even if
		// this revoke races or fails.
		_ = s.Rdb.RevokeAllRefresh(r.Context(), id)
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]account.Public{"account": a.Public()})
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
	return s.Auth.PrepareOwnerBootstrap(ctx)
}

// Start launches background loops (lobby hub, match reaper) and waits until
// the hub subscription is live.
func (s *Server) Start(ctx context.Context) {
	ctx, cancel := context.WithCancel(ctx)
	s.cancel = cancel
	go s.Hub.Run(ctx)
	s.Gamelink.StartReaper(ctx, s.Cfg.MatchPendingTTL/4)
	<-s.Hub.Ready()
}

// Close stops background loops, flushes the ranking snapshot and closes Redis.
func (s *Server) Close() {
	if s.cancel != nil {
		s.cancel()
	}
	_ = s.Ranking.Flush(context.Background())
	_ = s.Rdb.Close()
}
