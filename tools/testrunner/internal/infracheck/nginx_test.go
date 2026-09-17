package infracheck

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/testrunner/internal/testkit"
)

// TestNginxConfigSyntax — `nginx -t` inside the real unprivileged image, for
// both the prod layout and the dev layout (with the /content-api/ include).
func TestNginxConfigSyntax(t *testing.T) {
	if !haveDocker(t) {
		t.Skip("docker unavailable — cannot run nginx -t (leave nginx items unverified here)")
	}
	dockerPull(t, nginxImage)
	root := repoRoot(t)

	base := []string{
		"run", "--rm",
		"--add-host", "platform:127.0.0.1",
		"--add-host", "game:127.0.0.1",
		"--add-host", "content-api:127.0.0.1",
		"-v", filepath.Join(root, "nginx", "nginx.conf") + ":/etc/nginx/nginx.conf:ro",
	}
	// prod layout: no dev include dir mounted (glob matches nothing).
	out, err := docker(t, append(append([]string{}, base...), nginxImage, "nginx", "-t")...)
	require.NoError(t, err, "nginx -t (prod layout) failed:\n%s", out)
	assert.Contains(t, out, "syntax is ok")

	// dev layout: nginx/dev mounted at the glob path.
	dev := append(append([]string{}, base...),
		"-v", filepath.Join(root, "nginx", "dev")+":/etc/nginx/ggd-dev:ro",
		nginxImage, "nginx", "-t")
	out, err = docker(t, dev...)
	require.NoError(t, err, "nginx -t (dev layout) failed:\n%s", out)
	assert.Contains(t, out, "syntax is ok")
}

// TestNginxEdgeRouting — docs/todo/infra.md infra-02 (infra-nginx-routes) and
// infra-03 (infra-cache-immutable), plus the runtime half of infra-05.
//
// Boots the real config in a real container with stub client/editor dists and
// a stub content store. Proxied routes point at dead loopback upstreams, so a
// 502 proves nginx matched the location AND attempted the proxy (a miss would
// fall through to the SPA and return 200/404 instead).
func TestNginxEdgeRouting(t *testing.T) {
	c := startNginx(t, false) // prod layout

	t.Run("static and proxy routes", func(t *testing.T) {
		status, _, body := c.get(t, "/")
		assert.Equal(t, 200, status)
		assert.Contains(t, body, "GGD client stub")

		// SPA fallback for client routes.
		status, _, body = c.get(t, "/lobby/room/123")
		assert.Equal(t, 200, status)
		assert.Contains(t, body, "GGD client stub")

		// ⭐⭐ GH#1270: /editor/ IS a production route now — and it must serve the
		// PLAYER bundle. Two failure modes are asserted at once:
		//   · the #1270 defect — falling through to the game SPA (HTTP 200 + login page)
		//   · the #241 defect — serving the content-authoring console publicly
		// The authoring tree is mounted in this container precisely so the second
		// assertion proves the ROUTE points elsewhere, not that the files are absent.
		status, _, body = c.get(t, "/editor/")
		assert.Equal(t, 200, status)
		assert.Contains(t, body, "GGD hero-forge stub",
			"/editor/ must serve the player bundle in the prod layout (GH#1270)")
		assert.NotContains(t, body, "GGD client stub",
			"/editor/ must NOT fall through to the game SPA — that was the #1270 defect")
		assert.NotContains(t, body, "GGD editor stub",
			"/editor/ must NOT serve the authoring console — that was the #241 defect")

		// ⭐ 深連結：`/editor/hero-forge` 是玩家真的會打開的那一個（票 #1270 的 AC）。
		status, _, body = c.get(t, "/editor/hero-forge")
		assert.Equal(t, 200, status)
		assert.Contains(t, body, "GGD hero-forge stub", "SPA 深連結要回玩家版 index.html")
		assert.NotContains(t, body, "GGD client stub")

		status, hdr, body := c.get(t, "/content/champions/sela.json")
		assert.Equal(t, 200, status)
		assert.Contains(t, body, `"champion@1"`)
		assert.Equal(t, "application/json", hdr.Get("Content-Type"))

		// Proxied routes: 502 (dead upstream) proves the location matched.
		status, _, _ = c.get(t, "/api/v1/healthz")
		assert.Equal(t, 502, status, "/api/ must proxy to platform")
		status, _, _ = c.get(t, "/ws/")
		assert.Equal(t, 502, status, "/ws/ must proxy to game")
		status, _, _ = c.get(t, "/colyseus/")
		assert.Equal(t, 502, status, "/colyseus/ must proxy to game")

		status, _, _ = c.get(t, "/healthz")
		assert.Equal(t, 200, status)

		testkit.Cover(t, "infra-nginx-routes")
	})

	t.Run("hash-addressed content is immutable, manifest is not", func(t *testing.T) {
		// ?h=<hash> → immutable for a year.
		_, hdr, _ := c.get(t, "/content/champions/sela.json?h=abc123def456")
		assert.Equal(t, "public, max-age=31536000, immutable", hdr.Get("Cache-Control"))

		// No hash → revalidate.
		_, hdr, _ = c.get(t, "/content/champions/sela.json")
		assert.Equal(t, "no-cache", hdr.Get("Cache-Control"))

		// manifest.json and _index.json never cache — even with a stray ?h=.
		_, hdr, _ = c.get(t, "/content/manifest.json?h=zzz")
		assert.Equal(t, "no-cache", hdr.Get("Cache-Control"))
		_, hdr, _ = c.get(t, "/content/champions/_index.json?h=zzz")
		assert.Equal(t, "no-cache", hdr.Get("Cache-Control"))

		testkit.Cover(t, "infra-cache-immutable")
	})

	t.Run("security headers", func(t *testing.T) {
		_, hdr, _ := c.get(t, "/")
		assert.Equal(t, "nosniff", hdr.Get("X-Content-Type-Options"))
		assert.Contains(t, hdr.Get("Content-Security-Policy"), "frame-ancestors 'none'")

		_, hdr, _ = c.get(t, "/content/champions/sela.json")
		assert.Equal(t, "nosniff", hdr.Get("X-Content-Type-Options"),
			"locations overriding Cache-Control must re-add nosniff")
	})

	t.Run("content-api route does not exist in prod layout", func(t *testing.T) {
		status, _, body := c.get(t, "/content-api/champions")
		assert.NotEqual(t, 502, status, "/content-api/ must NOT be proxied in prod")
		assert.Equal(t, 200, status, "unknown paths fall through to the SPA")
		assert.Contains(t, body, "GGD client stub")
	})
}

// TestNginxEdgeDevLayout — with nginx/dev mounted, /content-api/ IS proxied.
func TestNginxEdgeDevLayout(t *testing.T) {
	c := startNginx(t, true) // dev layout

	status, _, _ := c.get(t, "/content-api/champions")
	assert.Equal(t, 502, status, "/content-api/ must proxy in the dev layout (dead upstream → 502)")

	// ⭐ GH#1270：路由只有**一個住處**（nginx/nginx.conf），dev 與 prod 的差別是
	//   `/usr/share/nginx/html/hero-forge/` 裡的**位元組**（dev 映像放完整編輯器）。
	//   ⇒ 這個容器掛的是玩家版 stub，所以 dev layout 這裡看到的也是它；
	//   ⛔ 而「dev 才有」那一半今天由 `docker/edge.Dockerfile` 的 GGD_INCLUDE_EDITOR 決定
	//   （`editor_exposure_test.go` 逐行守著）。
	status, _, body := c.get(t, "/editor/")
	assert.Equal(t, 200, status)
	assert.Contains(t, body, "GGD hero-forge stub", "/editor/ 服務的是 hero-forge 那棵樹")

	// WebSocket upgrade headers are configured for the game routes; a plain
	// HTTP request still proxies (Colyseus speaks HTTP on the same port).
	conf := readRepoFile(t, "nginx/nginx.conf")
	for _, needle := range []string{
		"proxy_set_header Upgrade $http_upgrade;",
		"proxy_set_header Connection $connection_upgrade;",
		"proxy_read_timeout 3600s;",
		"proxy_buffering off;",
	} {
		if !strings.Contains(conf, needle) {
			t.Errorf("nginx.conf must contain %q for WS proxying", needle)
		}
	}
}
