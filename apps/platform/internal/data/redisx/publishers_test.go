package redisx_test

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/data/redisx"
)

// repoRoot walks up from the test's working directory until it finds the
// pnpm-workspace file at the monorepo root.
func repoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	require.NoError(t, err)
	for i := 0; i < 12; i++ {
		if _, err := os.Stat(filepath.Join(dir, "pnpm-workspace.yaml")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	t.Fatal("could not locate the repo root (no pnpm-workspace.yaml above the test)")
	return ""
}

// TestEveryContentKindStillHasAPublisher.
//
// THE BUG THIS EXISTS TO KILL, and it is not a hypothetical — it already
// happened. ContentInvalidation is a fire-and-forget announcement, so a
// publisher that goes missing breaks NOTHING that a human or an HTTP client can
// observe: the durable JSON file is still written, the Redis mirror is still
// set, the admin console still answers 200 OK. The only symptom is that a
// running game-server keeps serving a stale document until its TTL expires —
// which is exactly the pre-bus behaviour the bus was built to end, and which
// looks to the owner like "the console didn't save".
//
// Commit 7dd31bf ("sweep gosec — 37 findings to 0") deleted the eight-line
// publish out of combatenv.Repo.mirror while adding an unrelated #nosec comment
// twenty lines above it in the same file. The combat-env half of the bus was
// dead in every build from that commit until #250. One test did notice
// (combatenv's TestCombatEnvReplacePublishesInvalidation), but a red test with
// a plausible-sounding excuse next to it — it was logged as "needs a Redis on
// this machine", which was never true — buys silence for as long as anyone is
// willing to keep reading the excuse.
//
// So the kinds are checked STRUCTURALLY, not one-test-per-feature: every value
// in the frozen ContentKind* wire contract must be named at a
// PublishContentInvalidation call site somewhere in non-test platform code. A
// mechanical sweep can still delete a publisher, but it can no longer do so
// quietly.
//
// What this deliberately does NOT check: that the publish is on the right code
// path, or fires at the right moment. That is behaviour, and behaviour belongs
// in each owner package's own test (combatenv/invalidate_test.go,
// curation, opsenv, contentoverlay). This is the floor beneath those — the
// check that the call site still exists at all.
func TestEveryContentKindStillHasAPublisher(t *testing.T) {
	// The frozen wire contract, mirrored by apps/game-server/src/config/
	// contentBus.ts. Written as the Go identifier -> the wire string so a
	// rename on either side shows up here.
	kinds := map[string]string{
		"ContentKindCuration":       redisx.ContentKindCuration,
		"ContentKindCombatEnv":      redisx.ContentKindCombatEnv,
		"ContentKindServerOps":      redisx.ContentKindServerOps,
		"ContentKindContentOverlay": redisx.ContentKindContentOverlay,
	}

	// identifier -> the files that pass it to PublishContentInvalidation.
	publishers := map[string][]string{}

	root := filepath.Join(repoRoot(t), "apps", "platform", "internal")
	fset := token.NewFileSet()
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		file, perr := parser.ParseFile(fset, path, nil, 0)
		if perr != nil {
			return perr
		}
		rel, _ := filepath.Rel(repoRoot(t), path)
		ast.Inspect(file, func(n ast.Node) bool {
			call, ok := n.(*ast.CallExpr)
			if !ok {
				return true
			}
			sel, ok := call.Fun.(*ast.SelectorExpr)
			if !ok || sel.Sel.Name != "PublishContentInvalidation" {
				return true
			}
			// The kind is the argument after ctx. Accept either a bare
			// identifier or the usual redisx.ContentKindX qualified form.
			if len(call.Args) < 2 {
				return true
			}
			switch arg := call.Args[1].(type) {
			case *ast.SelectorExpr:
				publishers[arg.Sel.Name] = append(publishers[arg.Sel.Name], rel)
			case *ast.Ident:
				publishers[arg.Name] = append(publishers[arg.Name], rel)
			}
			return true
		})
		return nil
	})
	require.NoError(t, err)

	// Not vacuous: if the walk found no publishers at all the assertions below
	// would all fail for the wrong reason, so say so plainly.
	require.NotEmpty(t, publishers,
		"the AST walk over %s found no PublishContentInvalidation call at all — this guard "+
			"is broken, not the platform", root)

	for ident, wire := range kinds {
		assert.NotEmptyf(t, publishers[ident],
			"no non-test file under apps/platform/internal passes %s (%q) to "+
				"PublishContentInvalidation, so nothing on the platform announces that document "+
				"any more. Running game-servers will keep serving a stale copy until their TTL "+
				"expires, and NOTHING ELSE will look wrong — the file still saves, the mirror "+
				"still writes, the console still answers 200. This is precisely how the "+
				"combat-env publish stayed deleted from 7dd31bf until #250. Restore the call "+
				"site; do not delete this expectation.", ident, wire)
	}

	// A kind that gained a publisher but was never added to the map above would
	// pass silently, so surface the reverse direction too.
	var unknown []string
	for ident := range publishers {
		if _, ok := kinds[ident]; !ok {
			unknown = append(unknown, ident)
		}
	}
	sort.Strings(unknown)
	assert.Emptyf(t, unknown,
		"these identifiers are published on chan:content but are not in this test's copy of the "+
			"wire contract: %v. Add them here AND to CONTENT_KINDS in "+
			"apps/game-server/src/config/contentBus.ts, or the shard will treat them as unknown.",
		unknown)
}
