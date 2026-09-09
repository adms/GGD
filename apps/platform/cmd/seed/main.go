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
	"github.com/ggd/platform/internal/curation"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/server"
)

// starterEnv is the env-var form of -starter, for K8s/CI where adding an env
// var to a manifest is easier than changing the command line.
const starterEnv = "GGD_SEED_STARTER_WHITELIST"

// unionEnv is the env-var form of -starter-union.
//
// ⭐ WHY A SECOND DOOR EXISTS. -starter is guarded by ApplyStarterSetIfEmpty,
// and that guard is right for the case it was built for: an operator who has
// curated must never be re-expanded behind their back on a restart.
//
// ⛔ But it makes the OFFICIAL ROSTER unable to grow. Ship 37 new champions in
// the image, deploy, and the machine's whitelist still enables the old 49 —
// every new champion is invisible in champion select, and NOTHING says so
// (the content bundle is correct, every test is green, /healthz is ok).
// That is failure mode ② — built, shipped, and unreachable by players.
//
// ⇒ This door is the explicit, audited, union-only answer: it adds what the
// image declares official and REMOVES NOTHING, so an operator's disable of a
// champion outside the starter set survives it. It is DEFAULT OFF and must be
// asked for by name — the guard above still governs every other restart.
const unionEnv = "GGD_SEED_STARTER_UNION"

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	starter := flag.Bool("starter", false,
		"apply the demo starter whitelist when (and only when) no champion is enabled yet")
	union := flag.Bool("starter-union", false,
		"union the starter whitelist in even if the operator has already curated (official-roster growth)")
	flag.Parse()
	if os.Getenv(starterEnv) == "1" {
		*starter = true
	}
	if os.Getenv(unionEnv) == "1" {
		*union = true
	}

	// ⭐ -starter-union 走**輕量**路徑（同 cmd/ownerreset）：它只 union 一份
	// 白名單 JSON —— ⛔ 不鑄任何 token、⛔ 不需要遊戲共用密鑰、⛔ 不必 Boot
	// Redis 熱層。⇒ 用 config.Load() 會讓它在**只想補名單**的主機上因為
	// 「JWT_SIGNING_SECRET is required」而拒跑，而那與它要做的事無關。
	if *union && !*starter {
		if err := unionStarterLight(context.Background()); err != nil {
			slog.Error("seed starter whitelist union", "err", err)
			os.Exit(1)
		}
		return
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

	slog.Info("seed complete", "dataDir", cfg.DataDir, "season", cfg.Season,
		"starter", *starter, "starterUnion", *union)
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

// unionStarterLight is the EXPLICIT door (-starter-union): it applies the
// starter bundle unconditionally, union-only, and is audited exactly like an
// operator pressing the button in the console.
//
// ⭐ It opens the SAME state the platform serves (jsonstore under DATA_DIR)
// with the light storage-only config — the same trick cmd/ownerreset uses, and
// for the same reason: this command mints no tokens, so demanding
// JWT_SIGNING_SECRET / PLATFORM_GAME_SHARED_SECRET / REDIS_PASSWORD before it
// may union a list of ids would refuse the job over things the job never uses.
//
// ⭐ It reports the DELTA, not just the totals. "86 champions enabled" reads
// identically whether this call added 37 or added nothing, and a deploy step
// whose success looks the same as its no-op is the silent-fail-open shape this
// codebase has been bitten by before. before/added/after makes the difference
// visible in the deploy log.
func unionStarterLight(ctx context.Context) error {
	st, err := config.LoadStorage()
	if err != nil {
		return err
	}
	// Say WHICH state is about to be touched before touching it: DATA_DIR
	// defaults to a RELATIVE path, so running this from the wrong directory
	// silently opens an empty store beside the real one — and an empty store
	// looks exactly like a deploy that enables nothing.
	slog.Info("seed: opening the platform's state", "dataDir", st.DataDir, "redis", st.RedisAddr)
	store, err := jsonstore.New(st.DataDir)
	if err != nil {
		return err
	}
	rdb := redisx.New(st.RedisAddr, st.RedisPassword)
	defer func() { _ = rdb.Close() }()

	svc := curation.New(store, rdb)
	before, err := svc.Get(ctx)
	if err != nil {
		return err
	}
	doc, err := svc.ApplyStarterSet(ctx)
	if err != nil {
		return err
	}
	added := len(doc.Champions) - len(before.Champions)
	svc.Audit("system:seed", "curation.starter", map[string]any{
		"champions": len(doc.Champions),
		"items":     len(doc.Items),
		"abilities": len(doc.Abilities),
		"source":    "cmd/seed -starter-union",
		"mode":      "union",
	})
	slog.Info("seed: starter whitelist unioned in (union-only — nothing removed)",
		"championsBefore", len(before.Champions), "championsAdded", added,
		"champions", len(doc.Champions), "items", len(doc.Items), "abilities", len(doc.Abilities))
	return nil
}
