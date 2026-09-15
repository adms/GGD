package infracheck

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/testrunner/internal/testkit"
)

// TestPlayerHeroForgeProductionBoundary protects both sides of #241/#1270:
// production serves the player Hero Forge, while the internal content editor
// remains an explicit local/dev image opt-in.
func TestPlayerHeroForgeProductionBoundary(t *testing.T) {
	for _, path := range []string{"nginx/nginx.conf", "deploy/helm/ggd/files/nginx.conf"} {
		conf := readRepoFile(t, path)
		assert.Contains(t, conf, "location /editor/ {", "%s must route the player Hero Forge", path)
		assert.Contains(t, conf, "location = /editor { return 301 /editor/; }", "%s must redirect the bare path", path)
		assert.Contains(t, conf, "try_files $uri $uri/ /editor/index.html;", "%s must retain SPA fallback", path)
	}

	dev := readRepoFile(t, "nginx/dev/editor.conf")
	assert.NotContains(t, dev, "location /editor/ {", "the dev include must not duplicate the base route")
	assert.NotContains(t, dev, "location = /editor {", "the dev include must not duplicate the base redirect")

	const arg = "GGD_INCLUDE_EDITOR"
	edge := readRepoFile(t, "docker/edge.Dockerfile")
	require.Contains(t, edge, `ARG `+arg+`="0"`, "the internal editor must remain off by default")
	assert.NotContains(t, edge, "COPY --from=build /repo/apps/editor/dist/", "the final stage must not bypass the selected build")
	assert.Contains(t, edge, "COPY --from=build /dist-out/editor/", "the final stage must copy only the selected build")
	assert.Contains(t, edge, `pnpm --filter "@ggd/editor" build:player`, "the default image must build the player surface")

	condIdx := strings.Index(edge, `if [ "${`+arg+`}" = "1" ]`)
	fullIdx := strings.Index(edge, `pnpm --filter "@ggd/editor" build &&`)
	playerIdx := strings.Index(edge, `pnpm --filter "@ggd/editor" build:player`)
	require.NotEqual(t, -1, condIdx, "the internal editor opt-in conditional is missing")
	require.NotEqual(t, -1, fullIdx, "the full internal editor build is missing")
	require.NotEqual(t, -1, playerIdx, "the player editor build is missing")
	assert.Less(t, condIdx, fullIdx, "the full editor build must remain behind the opt-in")
	assert.Less(t, fullIdx, playerIdx, "the player build must be the default else branch")

	for _, path := range []string{"docker/compose.yaml", "docker/compose.family.yaml", "skaffold.yaml"} {
		assert.NotContains(t, readRepoFile(t, path), arg+`: "1"`, "%s must not enable the internal content editor", path)
	}

	player := readRepoFile(t, "apps/editor/src/PlayerHeroApp.tsx")
	for _, required := range []string{"player-hero-forge", "創作英雄", "我的作品", "HeroPage", "heroOnly"} {
		assert.Contains(t, player, required, "player entry must contain %q", required)
	}
	for _, forbidden := range []string{"ForgePage", "VfxForgePage", "ExportCenterPage", "EditorView", "DocList"} {
		assert.NotContains(t, player, forbidden, "player entry must not import the internal %s surface", forbidden)
	}

	vite := readRepoFile(t, "apps/editor/vite.config.ts")
	assert.Contains(t, vite, `mode === "player"`, "Vite must select the player entry only for the player build")
	assert.Contains(t, vite, `name=\"ggd-app\" content=\"player-hero-forge\"`, "the player HTML needs a deploy-smoke marker")

	testkit.Cover(t, "infra-editor-not-exposed")
}
