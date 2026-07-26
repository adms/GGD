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

		// #241: /editor/ is NOT a production route any more. It must NOT serve
		// the editor tree even when that tree is present on disk (it is, in this
		// container — mounted below — precisely so this assertion proves the
		// LOCATION is gone rather than the files merely being absent).
		status, _, body = c.get(t, "/editor/")
		assert.Equal(t, 200, status, "unknown paths fall through to the SPA")
		assert.NotContains(t, body, "GGD editor stub",
			"/editor/ must not be routed in the prod layout — see nginx/dev/editor.conf")
		assert.Contains(t, body, "GGD client stub")

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

	// #241: the editor rides the same dev-only include. Mounting nginx/dev/ is
	// what turns it on — and it is the only thing that does.
	status, _, body := c.get(t, "/editor/")
	assert.Equal(t, 200, status)
	assert.Contains(t, body, "GGD editor stub", "/editor/ must be served in the dev layout")

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
