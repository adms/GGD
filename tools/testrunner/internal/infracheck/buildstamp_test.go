package infracheck

import (
	"strings"
	"testing"

	"github.com/ggd/testrunner/internal/testkit"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestBuildStampThreadedThroughEveryBuildPath — guard for task #66 / defect
// P0-6(a) of docs/_false-completions.md, failure shape S5 ("fixed, but only in
// this environment").
//
// THE DEFECT. apps/client bakes a build stamp into the bundle and the
// VersionBadge shows it at the bottom of every screen, so a screenshot names
// its build. The stamp used to be computed from `git rev-parse` alone, with a
// `catch { return "dev" }`. That works on a laptop and CANNOT work in an image:
// .dockerignore excludes `.git`, and docker/edge.Dockerfile builds on
// node:22-alpine, which has no git binary. So every image ever built baked the
// word "dev", https://ggd.adms.ai/ showed `dev`, and two different images were
// indistinguishable — which is the only reason the badge exists.
// `grep -rn BUILD_STAMP docker deploy Makefile nginx` returned ZERO hits.
//
// THE DETECTION RECIPE, EXECUTED. The audit's recipe for S5 is "every env var /
// build arg must appear in every one of the build tables". This test is that
// grep: the Dockerfile must accept the arg, and EVERY path that builds the edge
// image must pass it. A stamp threaded through one path and not another
// recreates exactly this bug, one deploy later.
func TestBuildStampThreadedThroughEveryBuildPath(t *testing.T) {
	const argName = "GGD_BUILD_STAMP"

	// 1. The image accepts it as a build arg and exposes it to the client build.
	edge := readRepoFile(t, "docker/edge.Dockerfile")
	require.Contains(t, edge, "ARG "+argName,
		"docker/edge.Dockerfile must declare ARG %s — the image has no .git and no git binary", argName)
	require.Contains(t, edge, "ENV "+argName+"=$"+argName,
		"the ARG must become an ENV, or `pnpm --filter @ggd/client build` never sees it")

	// The ARG/ENV pair has to precede the build RUN, otherwise it is inert.
	argIdx := strings.Index(edge, "ARG "+argName)
	runIdx := strings.Index(edge, `pnpm --filter "@ggd/client" build`)
	require.NotEqual(t, -1, runIdx, "client build RUN not found in docker/edge.Dockerfile")
	assert.Less(t, argIdx, runIdx, "ARG %s must be declared BEFORE the client build runs", argName)

	// 2. Every build path passes it. Adding a new one? Add it here too.
	for _, path := range []string{
		"docker/compose.yaml",        // plain local stack
		"docker/compose.family.yaml", // the family/GCP deploy overlay
		"skaffold.yaml",              // kind + helm (make up / make dev)
		"Makefile",                   // computes it from host git and EXPORTs it
	} {
		assert.Contains(t, readRepoFile(t, path), argName,
			"%s builds or drives the edge image but never mentions %s — "+
				"the badge will read UNSTAMPED-BUILD on that path", path, argName)
	}

	// 3. The two compose files must actually wire it into build.args (mentioning
	//    it in a comment is not wiring). Both interpolate from the host env.
	for _, path := range []string{"docker/compose.yaml", "docker/compose.family.yaml"} {
		assert.Contains(t, readRepoFile(t, path), argName+`: "${`+argName,
			"%s must pass %s as a build arg interpolated from the host environment", path, argName)
	}

	// 4. The Makefile is where the value comes from: it must compute it from git
	//    and export it, since compose/skaffold only interpolate what is exported.
	mk := readRepoFile(t, "Makefile")
	assert.Contains(t, mk, "export "+argName,
		"the Makefile must EXPORT %s — compose and skaffold read it from the environment", argName)
	assert.Contains(t, mk, "git rev-parse --short HEAD",
		"the Makefile must compute the stamp from host git (the image cannot)")

	// 5. And the fallback must stay LOUD. "dev" is what made this invisible for
	//    months: it reads like a deliberate label, so nobody questioned it.
	stamp := readRepoFile(t, "apps/client/dev/buildStamp.ts")
	assert.Contains(t, stamp, `UNSTAMPED = "UNSTAMPED-BUILD"`,
		"an unidentifiable build must be visibly broken, not plausibly labelled")
	assert.NotContains(t, stamp, `return "dev"`,
		"the plausible-looking 'dev' fallback is the regression under test")

	testkit.Cover(t, "infra-build-stamp-arg")
}
