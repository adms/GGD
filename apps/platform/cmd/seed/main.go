// Command seed rebuilds the Redis hot layer from the data/ JSON truth without
// starting the HTTP server (used by the K8s post-install hook; idempotent).
//
// It can ALSO apply the demo starter whitelist, but only when explicitly asked:
//
//	seed -starter                        # or GGD_SEED_STARTER_WHITELIST=1
//
// That flag is DEFAULT OFF — without it this binary behaves exactly as it
// always has. With it, the bundle in internal/curation/starter.go is unioned
// into data/curation/whitelist.json ONLY IF the whitelist enables no champion
// yet, and the write is audited as `curation.starter` by "system:seed" so it
// shows up in the console's audit page like any operator action. An operator
// who has already curated is never re-expanded on a restart.
package main

import (
	"context"
	"flag"
	"log/slog"
	"os"

	"github.com/ggd/platform/internal/config"
	"github.com/ggd/platform/internal/server"
)

// starterEnv is the env-var form of -starter, for K8s/CI where adding an env
// var to a manifest is easier than changing the command line.
const starterEnv = "GGD_SEED_STARTER_WHITELIST"

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	starter := flag.Bool("starter", false,
		"apply the demo starter whitelist when (and only when) no champion is enabled yet")
	flag.Parse()
	if os.Getenv(starterEnv) == "1" {
		*starter = true
	}

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

	ctx := context.Background()
	if err := srv.Boot(ctx); err != nil {
		slog.Error("seed rebuild", "err", err)
		os.Exit(1)
	}

	if *starter {
		if err := applyStarter(ctx, srv); err != nil {
			slog.Error("seed starter whitelist", "err", err)
			os.Exit(1)
		}
	}

	slog.Info("seed complete", "dataDir", cfg.DataDir, "season", cfg.Season, "starter", *starter)
}

// applyStarter is the guarded, audited starter application. Runs AFTER Boot so
// the Redis mirror is already wired and the write lands in both places.
func applyStarter(ctx context.Context, srv *server.Server) error {
	svc := srv.Curation
	if svc == nil {
		slog.Warn("seed: curation service unavailable — starter whitelist skipped")
		return nil
	}
	doc, applied, err := svc.ApplyStarterSetIfEmpty(ctx)
	if err != nil {
		return err
	}
	if !applied {
		slog.Info("seed: whitelist already curated — starter set NOT applied (operator choices preserved)",
			"champions", len(doc.Champions), "items", len(doc.Items), "abilities", len(doc.Abilities))
		return nil
	}
	svc.Audit("system:seed", "curation.starter", map[string]any{
		"champions": len(doc.Champions),
		"items":     len(doc.Items),
		"abilities": len(doc.Abilities),
		"source":    "cmd/seed -starter",
	})
	slog.Info("seed: demo starter whitelist applied",
		"champions", len(doc.Champions), "items", len(doc.Items), "abilities", len(doc.Abilities))
	return nil
}
