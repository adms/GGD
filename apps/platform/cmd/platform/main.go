// Command platform runs the GGD Go platform: HTTP API + lobby WebSocket. On
// boot it rebuilds the Redis hot layer from the data/ JSON truth (Redis wiped
// ⇒ full recovery from JSON alone).
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/ggd/platform/internal/config"
	"github.com/ggd/platform/internal/httpx"
	"github.com/ggd/platform/internal/opstate"
	"github.com/ggd/platform/internal/server"
)

// envTruthy reports whether an env var is set to a truthy value.
func envTruthy(key string) bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(key))) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	cfg, err := config.Load()
	if err != nil {
		slog.Error("config", "err", err)
		os.Exit(1)
	}
	// #174 hardening: a networked deploy with the invite gate on must also close
	// the first-owner claim (GGD_OWNER_BOOTSTRAP_TOKEN=1), or a stranger who
	// reaches the URL before the owner registers could seize admin. Fail closed
	// here rather than serve that window quietly. See FirstOwnerExposureError.
	if err := config.FirstOwnerExposureError(cfg.Addr, cfg.RequireInvite, envTruthy("GGD_OWNER_BOOTSTRAP_TOKEN")); err != nil {
		slog.Error("config", "err", err)
		os.Exit(1)
	}
	// #724/F-05: decide WHOSE "X-Real-Ip" is believed before anything can serve
	// a request. Wired here rather than in internal/server because that package
	// may not so much as name an address token — see devsurface_test.go's
	// no-address-trust invariant.
	trusted := cfg.TrustedProxyCIDRs
	if trusted == nil {
		trusted = httpx.DefaultTrustedProxyCIDRs
	}
	if bad := httpx.SetTrustedProxies(trusted); len(bad) > 0 {
		// Fail LOUD, not closed: a mistyped CIDR shrinks the trusted set, which
		// degrades rate-limit attribution rather than breaking anything, so
		// refusing to boot would be the worse trade. But it must never be
		// silent — a quietly-dropped entry is how every player ends up sharing
		// one bucket with nobody the wiser.
		slog.Error("config: GGD_TRUSTED_PROXY_CIDRS has unparseable entries — they are NOT trusted",
			"rejected", strings.Join(bad, ","), "trustedCount", httpx.TrustedProxyCount())
	}
	slog.Info("config: trusted edge proxies", "count", httpx.TrustedProxyCount())

	srv, err := server.New(cfg, server.Options{})
	if err != nil {
		slog.Error("wire", "err", err)
		os.Exit(1)
	}
	defer srv.Close()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if err := srv.Boot(ctx); err != nil {
		slog.Error("boot rebuild", "err", err)
		os.Exit(1)
	}

	// Refuse to bring up a PLAYER-FACING deploy whose content whitelist enables
	// no champion — the silent failure where every test is green and the family
	// still meets an empty champion select. A loopback-only dev bind is exempt
	// (that empty state is a normal starting point); GGD_ALLOW_EMPTY_WHITELIST=1
	// is the deliberate "boot empty and curate in the console" escape.
	bc, err := opstate.PlayableBootCheck(opstate.BootCheckInput{
		DataDir:            cfg.DataDir,
		Addr:               cfg.Addr,
		FamilyTier:         cfg.FullAssets,
		RequireInvite:      cfg.RequireInvite,
		AllowEmptyOverride: envTruthy("GGD_ALLOW_EMPTY_WHITELIST"),
	})
	if err != nil {
		slog.Error("boot check", "err", err)
		os.Exit(1)
	}
	if bc.Fatal {
		slog.Error("boot check FAILED — refusing to start with an empty whitelist on a player-facing deploy",
			"detail", bc.Message)
		os.Exit(1)
	}
	if bc.ChampionCount == 0 {
		slog.Warn(bc.Message, "playerFacing", bc.PlayerFacing)
	} else {
		slog.Info(bc.Message, "champions", bc.ChampionCount)
	}

	srv.Start(ctx)

	// #724/F-09. Before this only ReadHeaderTimeout was set, so a peer that sent
	// headers promptly and then trickled a body — or read a response one byte a
	// minute — held a connection, a goroutine and its buffers indefinitely, and
	// nothing anywhere would ever time it out.
	//
	// The two surfaces that legitimately outlive these bounds (the lobby
	// WebSocket, the platform-archive stage/export) clear their own deadlines
	// per request via httpx.ClearDeadlines, which is why these numbers can be
	// sized for ordinary JSON instead of for the longest thing in the process.
	httpSrv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           srv.Router(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       cfg.HTTPReadTimeout,
		WriteTimeout:      cfg.HTTPWriteTimeout,
		IdleTimeout:       cfg.HTTPIdleTimeout,
		MaxHeaderBytes:    cfg.HTTPMaxHeaderBytes,
	}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = httpSrv.Shutdown(shutdownCtx)
	}()

	slog.Info("platform listening", "addr", cfg.Addr, "season", cfg.Season, "dataDir", cfg.DataDir, "deployTier", cfg.DeployTier, "fullAssets", cfg.FullAssets)
	// #176(A): the family tier is a PROMISE about bytes the platform does not
	// itself serve, so the one thing it can do is say out loud which promise
	// this process is making. When the edge and the platform disagree the two
	// boot logs disagree too, which is the difference between "a third of the
	// roster is wrong and nobody noticed all evening" and "grep the logs".
	if cfg.FullAssets {
		slog.Warn("deploy tier FAMILY — this deploy promises FULL ASSETS to every peer: " +
			"the Blizzard overlay (556 files / 87,403,869 B) must be mounted at the edge and the client " +
			"must be built with VITE_GGD_FULL_ASSETS=1. The edge refuses to boot without it (see " +
			"nginx/assert-full-assets.sh); if you reached this line and the edge is up, the assets are there.")
	}
	if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("serve", "err", err)
		os.Exit(1)
	}
	slog.Info("platform stopped")
}
