// Package server is the composition root: it wires config → stores → services
// → HTTP routes into one runnable unit (also used directly by tests).
package server

import (
	"context"
	"log/slog"
	"net/http"

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
	Cfg      config.Config
	Rdb      *redisx.Client
	Store    *jsonstore.Store
	Journal  *wal.WAL
	Accounts *account.Repo
	Auth     *auth.Service
	Friends  *friend.Service
	Presence *presence.Service
	Rooms    *room.Service
	Ranking  *ranking.Service
	Gamelink *gamelink.Service
	Wallet   *wallet.Service
	Admin     *admin.Service
	Curation  *curation.Service
	CombatEnv *combatenv.Service
	AI        *ai.Service
	Hub      *lobby.Hub
	Sessions *lobby.Sessions

	router chi.Router
	cancel context.CancelFunc
}

// Options tweak construction for tests.
type Options struct {
	// Argon2Params overrides hashing cost (tests use light params).
	Argon2Params *argon2id.Params
}

// New wires everything. Call Start to run background loops, Router for the
// HTTP handler and Close on shutdown.
func New(cfg config.Config, opts Options) (*Server, error) {
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

	authSvc, err := auth.New(accounts, rdb, cfg.JWTSecret, cfg.AccessTokenTTL, cfg.RefreshTokenTTL, opts.Argon2Params)
	if err != nil {
		return nil, err
	}
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
	walletSvc := wallet.New(accounts, rdb, cat)

	settler := gamelink.NewSettler(store, rdb, accounts, pres, rank, rooms, walletSvc)
	glink := gamelink.New(rdb, accounts, pres, rank, journal, settler, cat,
		cfg.GameSharedSecret, cfg.GameServerAddr, cfg.InternalURL,
		cfg.MatchPendingTTL, cfg.HMACSkew)
	rooms.SetStarter(glink)
	rooms.SetOwnership(walletSvc)

	adminSvc := admin.New(accounts, walletSvc, rank, friends, store, rdb, cfg.AdminBootstrapUsername)
	curationSvc := curation.New(store, rdb)
	combatEnvSvc := combatenv.New(store, rdb)
	aiSvc := ai.New(store, rdb)

	hub := lobby.NewHub(rdb, friends)
	sessions := lobby.NewSessions(hub, authSvc, pres, rooms, rdb)

	s := &Server{
		Cfg: cfg, Rdb: rdb, Store: store, Journal: journal, Accounts: accounts,
		Auth: authSvc, Friends: friends, Presence: pres, Rooms: rooms,
		Ranking: rank, Gamelink: glink, Wallet: walletSvc, Admin: adminSvc,
		Curation: curationSvc, CombatEnv: combatEnvSvc, AI: aiSvc, Hub: hub, Sessions: sessions,
	}
	s.buildRouter(templates)
	return s, nil
}

func (s *Server) buildRouter(templates *room.Templates) {
	r := chi.NewRouter()
	r.Use(httpx.Recoverer, httpx.RequestLogger)

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
	})

	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		httpx.WriteError(w, httpx.NotFound("no such route"))
	})
	s.router = r
}

// Router returns the HTTP handler.
func (s *Server) Router() http.Handler { return s.router }

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
	// Idempotently grant the configured bootstrap account the admin role.
	return s.Admin.EnsureBootstrapAdmin(ctx)
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
