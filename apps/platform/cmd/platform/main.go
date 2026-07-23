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
	"syscall"
	"time"

	"github.com/ggd/platform/internal/config"
	"github.com/ggd/platform/internal/server"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	cfg, err := config.Load()
	if err != nil {
		slog.Error("config", "err", err)
		os.Exit(1)
	}
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
	srv.Start(ctx)

	httpSrv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           srv.Router(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = httpSrv.Shutdown(shutdownCtx)
	}()

	slog.Info("platform listening", "addr", cfg.Addr, "season", cfg.Season, "dataDir", cfg.DataDir, "deployTier", cfg.DeployTier)
	if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("serve", "err", err)
		os.Exit(1)
	}
	slog.Info("platform stopped")
}
