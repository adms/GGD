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
		// ⭐⭐ GH#1270 (2026-09-17) — /editor/ IS routed in production now, but it
		// serves the PLAYER bundle (hero-forge only), never the authoring console.
		// The old assertion ("no /editor/ at all") was the right answer to task
		// #241's question; the question changed when the owner asked for a player
		// entry point. What must stay impossible is the AUTHORING console being
		// served publicly — so the assertion moves from "no route" to "the route
		// points at the player bundle, and the console's bytes stay dev-only".
		assert.Contains(t, conf, "alias /usr/share/nginx/html/hero-forge/;",
			"%s must serve the PLAYER bundle at /editor/ (GH#1270) — anything else there "+
				"is either the authoring console (the #241 defect) or the game's SPA "+
				"fallback (the #1270 defect: HTTP 200 showing the login page)", path)
		assert.NotContains(t, conf, "root /usr/share/nginx/html/editor",
			"%s must NOT serve the authoring console tree — that is task #241's defect", path)
		assert.NotContains(t, conf, "alias /usr/share/nginx/html/editor/",
			"%s must NOT alias the authoring console tree either", path)
		// The dev-only include is what carries it; losing that line would make
		// the editor unreachable even in the dev profile.
		assert.Contains(t, conf, "include /etc/nginx/ggd-dev/*.conf;",
			"%s must keep the dev-only include — it is how /editor/ and /content-api/ "+
				"reach a dev box", path)
	}

	// ---- 2. the route has exactly ONE home (GH#1270) -----------------------
	// nginx refuses to start when the same location is declared twice, so the dev
	// fragment must NOT re-declare /editor/ now that nginx.conf owns it. MEASURED:
	// with both present the whole edge answered 500 — even `/`.
	dev := readRepoFile(t, "nginx/dev/editor.conf")
	assert.NotContains(t, dev, "location /editor/ {",
		"nginx/dev/editor.conf must NOT re-declare /editor/ — nginx.conf owns it (GH#1270); "+
			"duplicate locations take the whole edge down")
	assert.NotContains(t, dev, "location = /editor {",
		"same for the no-trailing-slash redirect — one home only")

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
	// ⭐ GH#1270 — the PLAYER bundle is the other half of the route above: without
	// these bytes the location would 404 into the game's SPA fallback again.
	assert.Contains(t, edge, `pnpm --filter "@ggd/editor" build:player`,
		"docker/edge.Dockerfile must build the player bundle unconditionally (GH#1270)")
	assert.Contains(t, edge, "COPY --from=build /dist-out/hero-forge/",
		"the final stage must copy the player bundle — the nginx location aliases it")
	// The staging dir has to be created unconditionally or the COPY has no
	// source and the DEFAULT build — the one that matters — fails outright.
	assert.Contains(t, edge, "mkdir -p /dist-out/editor",
		"/dist-out/editor must exist in both configurations")
	// ...and the editor build must sit inside the conditional, not beside the
	// client/admin builds.
	assert.NotContains(t, edge, `pnpm --filter "@ggd/client" build && pnpm --filter "@ggd/editor" build`,
		"the editor build must be inside the "+arg+" conditional, not chained to the client build")
	condIdx := strings.Index(edge, `if [ "${`+arg+`}" = "1" ]`)
	// ⭐ GH#1270 — `build:player` is DELIBERATELY unconditional, so the search for the
	// AUTHORING build must skip it: look for the exact console build command.
	editorIdx := strings.Index(edge, `pnpm --filter "@ggd/editor" build && cp -a apps/editor/dist/.`)
	require.NotEqual(t, -1, condIdx, "the %s conditional is missing", arg)
	require.NotEqual(t, -1, editorIdx, "the editor build RUN is missing")
	assert.Less(t, condIdx, editorIdx, "the authoring-console build must come AFTER the %s test", arg)

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
