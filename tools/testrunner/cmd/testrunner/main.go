// Command testrunner is the GGD test-orchestration service.
//
// Server mode (default): serves the REST/SSE API for apps/test-dashboard on
// 127.0.0.1:8799.
//
// CLI mode (-once): runs a plan to completion, streaming lines to stdout, and
// exits non-zero on failure — used by `make test` and CI.
//
// Safety: binds loopback by default, refuses APP_ENV=production, and only ever
// executes commands declared in suites.yaml (allow-list; argv exec, no shell).
package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/ggd/testrunner/internal/api"
	"github.com/ggd/testrunner/internal/config"
	"github.com/ggd/testrunner/internal/runner"
	"github.com/ggd/testrunner/internal/scheduler"
)

func main() {
	var (
		addr     = flag.String("addr", "127.0.0.1:8799", "listen address (keep loopback outside CI/k8s)")
		root     = flag.String("root", "", "repo root (default: auto-detect via pnpm-workspace.yaml)")
		suites   = flag.String("suites", "", "path to suites.yaml (default: <root>/tools/testrunner/suites.yaml)")
		once     = flag.Bool("once", false, "CLI mode: run once and exit with the run's status")
		mode     = flag.String("mode", "all", "-once scope: all|category|suite")
		category = flag.String("category", "", "-once: category to run when -mode=category")
		suiteID  = flag.String("suite", "", "-once: suite id to run when -mode=suite")
	)
	flag.Parse()

	if err := config.RefuseProduction(os.Getenv); err != nil {
		log.Fatal(err)
	}

	repoRoot := *root
	if repoRoot == "" {
		wd, err := os.Getwd()
		if err != nil {
			log.Fatal(err)
		}
		repoRoot, err = config.FindRepoRoot(wd)
		if err != nil {
			log.Fatal(err)
		}
	}
	suitesPath := *suites
	if suitesPath == "" {
		suitesPath = filepath.Join(repoRoot, "tools", "testrunner", "suites.yaml")
	}
	reg, err := config.Load(suitesPath)
	if err != nil {
		log.Fatal(err)
	}
	mgr := runner.NewManager(reg, runner.Options{RepoRoot: repoRoot})

	if *once {
		os.Exit(runOnce(mgr, scheduler.Request{Mode: *mode, Category: *category, SuiteID: *suiteID}))
	}

	srv := &http.Server{
		Addr:              *addr,
		Handler:           api.NewServer(mgr, repoRoot),
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Printf("testrunner: repo=%s suites=%s listening on http://%s", repoRoot, suitesPath, *addr)
	log.Fatal(srv.ListenAndServe())
}

func runOnce(mgr *runner.Manager, req scheduler.Request) int {
	run, err := mgr.Start(req, false)
	if err != nil {
		fmt.Fprintln(os.Stderr, "testrunner:", err)
		return 2
	}
	snap := run.Snapshot()
	if len(snap.Suites) == 0 {
		fmt.Printf("testrunner: no enabled suites for %s %s%s — nothing to run\n", req.Mode, req.Category, req.SuiteID)
	}

	from := 0
	for {
		evs, changed, finished := run.Events(from)
		for _, ev := range evs {
			printEvent(ev)
		}
		from += len(evs)
		if finished {
			if evs, _, _ := run.Events(from); len(evs) == 0 {
				break
			}
			continue
		}
		<-changed
	}

	final := run.Snapshot()
	fmt.Printf("testrunner: run %s finished: %s\n", final.ID, final.Status)
	if final.Status == runner.StatusPass {
		return 0
	}
	return 1
}

func printEvent(ev runner.Event) {
	switch ev.Type {
	case runner.EventSuiteStart:
		fmt.Printf("\n=== %s ===\n", ev.SuiteID)
	case runner.EventLine:
		fmt.Printf("  [%s] %s\n", ev.SuiteID, ev.Text)
	case runner.EventSuiteEnd:
		note := ""
		if ev.Text != "" {
			note = " (" + ev.Text + ")"
		}
		fmt.Printf("=== %s: %s in %dms%s ===\n", ev.SuiteID, ev.Status, ev.DurationMs, note)
	case runner.EventRunEnd:
		if ev.Gate != nil {
			switch {
			case ev.Gate.Ran && ev.Gate.Ok:
				fmt.Println("todo-gate: PASS")
			case ev.Gate.Ran:
				fmt.Println("todo-gate: FAIL")
			default:
				fmt.Printf("todo-gate: skipped (%s)\n", ev.Gate.Reason)
			}
		}
	}
}
