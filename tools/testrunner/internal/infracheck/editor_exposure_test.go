package infracheck

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/testrunner/internal/testkit"
)

// TestContentEditorNotExposedInProduction — task #241.
//
// THE DEFECT. apps/editor is the content-authoring console: schema-derived
// forms for every champion / ability / item, the 鑄技工坊 template gallery, the
// 3D model and VFX inspectors, the AI-icon and AI-fill controls. Its dist was
// COPYd into docker/edge.Dockerfile unconditionally and nginx served it at
// `/editor/` as plain static with NO authentication, so on the family deploy
// any visitor who typed the URL got the whole thing. Nothing asked who they
// were, and nothing in CI would have noticed if it stayed that way.
//
// It was never a WRITE hole — apps/editor/src/api/client.ts dead-folds
// WRITES_ENABLED to false in a `vite build`, and `/content-api/` is deliberately
// absent from the production nginx — which is exactly why removing it costs
// nothing: the surface was 100% non-functional in production and 100% visible.
//
// THE FIX HAS TWO HALVES AND BOTH MUST HOLD.
//  1. The BYTES: docker/edge.Dockerfile only builds/copies the editor when
//     --build-arg GGD_INCLUDE_EDITOR=1, default 0.
//  2. The ROUTE: `location /editor/` lives in nginx/dev/editor.conf, mounted at
//     /etc/nginx/ggd-dev/ only in the dev profile — the same mechanism that
//     already keeps /content-api/ out of prod.
//
// Either half alone still leaves a door: the route without the files 404s
// (harmless but confusing), the files without the route are dead weight in
// every image and one config edit away from being served again. So this test
// asserts both, plus the three things that would quietly undo them.
//
// WHAT THIS IS NOT. It is NOT an environment/IP gate. The owner retired that
// whole approach on 2026-07-26 (#239) after deciding on full openness, and a
// $remote_addr rule at this edge would be wrong regardless because the app sits
// behind Caddy — $remote_addr is the proxy, not the visitor. The runtime half
// (a real request proving the location is gone) is in nginx_test.go.
func TestContentEditorNotExposedInProduction(t *testing.T) {
	// ---- 1. the route is not in the production config (either copy) ---------
	for _, path := range []string{"nginx/nginx.conf", "deploy/helm/ggd/files/nginx.conf"} {
		conf := readRepoFile(t, path)
		assert.NotContains(t, conf, "location /editor/ {",
			"%s must NOT route /editor/ — it is unauthenticated static and belongs in "+
				"nginx/dev/editor.conf (task #241)", path)
		assert.NotContains(t, conf, "location = /editor {",
			"%s must NOT redirect to /editor/ either — a 301 into a route that should "+
				"not exist is still an advertisement for it", path)
		// The dev-only include is what carries it; losing that line would make
		// the editor unreachable even in the dev profile.
		assert.Contains(t, conf, "include /etc/nginx/ggd-dev/*.conf;",
			"%s must keep the dev-only include — it is how /editor/ and /content-api/ "+
				"reach a dev box", path)
	}

	// ---- 2. the dev-only fragment exists and carries the route --------------
	dev := readRepoFile(t, "nginx/dev/editor.conf")
	assert.Contains(t, dev, "location /editor/ {",
		"nginx/dev/editor.conf is where the editor route lives now")
	assert.Contains(t, dev, "location = /editor { return 301 /editor/; }",
		"the no-trailing-slash redirect moves with it, or /editor 404s on a dev box")

	// ---- 3. the bytes are opt-in at image build time ------------------------
	const arg = "GGD_INCLUDE_EDITOR"
	edge := readRepoFile(t, "docker/edge.Dockerfile")
	require.Contains(t, edge, `ARG `+arg+`="0"`,
		"docker/edge.Dockerfile must declare %s defaulting to 0 — OFF is the safe default", arg)
	assert.NotContains(t, edge, "COPY --from=build /repo/apps/editor/dist/",
		"the final stage must NOT copy apps/editor/dist directly — that bakes the "+
			"authoring console into every image regardless of "+arg)
	assert.Contains(t, edge, "COPY --from=build /dist-out/editor/",
		"the final stage must copy the staging dir, which is empty unless "+arg+"=1")
	// The staging dir has to be created unconditionally or the COPY has no
	// source and the DEFAULT build — the one that matters — fails outright.
	assert.Contains(t, edge, "mkdir -p /dist-out/editor",
		"/dist-out/editor must exist in both configurations")
	// ...and the editor build must sit inside the conditional, not beside the
	// client/admin builds.
	assert.NotContains(t, edge, `pnpm --filter "@ggd/client" build && pnpm --filter "@ggd/editor" build`,
		"the editor build must be inside the "+arg+" conditional, not chained to the client build")
	condIdx := strings.Index(edge, `if [ "${`+arg+`}" = "1" ]`)
	editorIdx := strings.Index(edge, `pnpm --filter "@ggd/editor" build`)
	require.NotEqual(t, -1, condIdx, "the %s conditional is missing", arg)
	require.NotEqual(t, -1, editorIdx, "the editor build RUN is missing")
	assert.Less(t, condIdx, editorIdx, "the editor build must come AFTER the %s test", arg)

	// ---- 4. no deploy path silently turns it back on ------------------------
	// A build path that sets GGD_INCLUDE_EDITOR=1 ships the console again. The
	// family overlay is the one that reaches real people, so it is asserted by
	// name rather than by a wildcard that a new file could slip past.
	for _, path := range []string{
		"docker/compose.yaml",
		"docker/compose.family.yaml",
		"skaffold.yaml",
	} {
		assert.NotContains(t, readRepoFile(t, path), arg+`: "1"`,
			"%s must not build the edge image with the content editor included", path)
	}

	testkit.Cover(t, "infra-editor-not-exposed")
}
