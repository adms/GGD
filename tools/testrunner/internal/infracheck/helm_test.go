package infracheck

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/testrunner/internal/testkit"
)

// TestHelmTemplateRenders — docs/todo/infra.md infra-06 (infra-helm-template).
func TestHelmTemplateRenders(t *testing.T) {
	// Prod-shaped defaults.
	prod := helmRender(t, "")
	testkit.Cover(t, "infra-helm-template")

	docs := splitDocs(prod)
	for _, want := range [][]string{
		{"kind: Deployment", "name: ggd-platform"},
		{"kind: Service", "name: ggd-platform"},
		{"kind: Deployment", "name: ggd-game"},
		{"kind: Service", "name: ggd-game", "sessionAffinity: ClientIP"},
		{"kind: StatefulSet", "name: ggd-redis"},
		{"kind: Deployment", "name: ggd-edge"},
		{"kind: ConfigMap", "name: ggd-edge-nginx"},
		{"kind: Secret", "name: ggd-secrets"},
		{"kind: PersistentVolumeClaim", "name: ggd-platform-data", "ReadWriteOnce"},
		{"kind: Job", "name: ggd-seed", "helm.sh/hook"},
	} {
		_, ok := findDoc(docs, want...)
		assert.True(t, ok, "rendered manifests must contain a doc with %v", want)
	}

	// The local profile must also render, and switch data/content to hostPath.
	local := helmRender(t, "values-local.yaml")
	assert.Contains(t, local, "path: \"/ggd/data\"")
	assert.Contains(t, local, "path: \"/ggd/content\"")
	assert.NotContains(t, local, "kind: PersistentVolumeClaim\nmetadata:\n  name: ggd-platform-data",
		"local profile uses the kind hostPath, not the data PVC")

	// Ingress stays disabled by default.
	assert.NotContains(t, prod, "kind: Ingress")
}

// TestPlatformSingleWriter — docs/todo/infra.md infra-07 (infra-single-writer).
//
// The data/ JSON store allows exactly one writer. This is a REAL automated
// check, not eyeballing: it asserts the template source AND (when a renderer
// is available) the rendered manifests.
func TestPlatformSingleWriter(t *testing.T) {
	// 1. Template source: hard-coded, not values-driven.
	tmpl := readRepoFile(t, "deploy/helm/ggd/templates/platform-deployment.yaml")
	assert.Contains(t, tmpl, "replicas: 1", "platform replicas must be hard-coded to 1")
	assert.NotContains(t, tmpl, "replicas: {{", "platform replicas must NOT be templated/scalable")
	assert.Contains(t, tmpl, "type: Recreate", "platform must use the Recreate strategy")

	pvc := readRepoFile(t, "deploy/helm/ggd/templates/platform-pvc.yaml")
	assert.Contains(t, pvc, "ReadWriteOnce", "data PVC must be RWO")

	// 2. Rendered manifests (both profiles).
	for _, values := range []string{"", "values-local.yaml"} {
		rendered := helmRender(t, values)
		doc, ok := findDoc(splitDocs(rendered), "kind: Deployment", "name: ggd-platform")
		require.True(t, ok, "platform deployment must render (values=%q)", values)
		assert.Contains(t, doc, "replicas: 1", "values=%q", values)
		assert.Contains(t, doc, "type: Recreate", "values=%q", values)
	}
	testkit.Cover(t, "infra-single-writer")
}

// TestContentAPIDevOnly — docs/todo/infra.md infra-05 (infra-content-api-dev-only).
func TestContentAPIDevOnly(t *testing.T) {
	// Helm: prod-shaped defaults must not deploy content-api (or testrunner)…
	prod := splitDocs(helmRender(t, ""))
	for _, name := range []string{"ggd-content-api", "ggd-testrunner"} {
		for _, kind := range []string{"kind: Deployment", "kind: Service"} {
			_, found := findDoc(prod, kind, "name: "+name)
			assert.False(t, found, "%s %s must NOT render in the prod profile", kind, name)
		}
	}
	_, devCM := findDoc(prod, "kind: ConfigMap", "name: ggd-edge-dev")
	assert.False(t, devCM, "the edge dev-route ConfigMap must not render in prod")

	// …while the dev/local profile does deploy content-api.
	local := helmRender(t, "values-local.yaml")
	_, ok := findDoc(splitDocs(local), "kind: Deployment", "name: ggd-content-api")
	assert.True(t, ok, "dev profile must deploy content-api")
	_, ok = findDoc(splitDocs(local), "kind: ConfigMap", "name: ggd-edge-dev")
	assert.True(t, ok, "dev profile mounts the /content-api/ edge route include")

	// Nginx: the base config must not know the route at all — it only exists
	// as a dev-mounted include.
	base := readRepoFile(t, "nginx/nginx.conf")
	assert.NotContains(t, base, "location /content-api/")
	assert.Contains(t, base, "include /etc/nginx/ggd-dev/*.conf;",
		"base config wires dev routes via a glob include that matches nothing in prod")
	devConf := readRepoFile(t, "nginx/dev/content-api.conf")
	assert.Contains(t, devConf, "location /content-api/")

	testkit.Cover(t, "infra-content-api-dev-only")
}

// TestSecretsInjectedViaEnv — guard for docs/todo/infra.md infra-09
// (infra-secrets-env). NOTE: infra-09 stays `pending` until image-level
// scanning (gitleaks over built images) lands; this test pins the config-level
// half: no secret material in Dockerfiles, injection strictly via Secret env.
func TestSecretsInjectedViaEnv(t *testing.T) {
	secretNames := []string{"JWT_SIGNING_SECRET", "PLATFORM_GAME_SHARED_SECRET", "REDIS_PASSWORD"}

	for _, df := range []string{
		"docker/platform.Dockerfile", "docker/game.Dockerfile", "docker/edge.Dockerfile",
		"docker/content-api.Dockerfile", "docker/testrunner.Dockerfile",
	} {
		content := readRepoFile(t, df)
		for _, line := range strings.Split(content, "\n") {
			trimmed := strings.TrimSpace(line)
			if !strings.HasPrefix(trimmed, "ENV ") && !strings.HasPrefix(trimmed, "ARG ") {
				continue
			}
			for _, name := range secretNames {
				assert.NotContains(t, trimmed, name,
					"%s must not bake %s into the image (env-inject at deploy time)", df, name)
			}
		}
	}

	// The platform deployment consumes the one Secret via envFrom.
	rendered := helmRender(t, "")
	doc, ok := findDoc(splitDocs(rendered), "kind: Deployment", "name: ggd-platform")
	require.True(t, ok)
	assert.Contains(t, doc, "secretRef:", "platform must consume secrets via envFrom secretRef")

	sec, ok := findDoc(splitDocs(rendered), "kind: Secret", "name: ggd-secrets")
	require.True(t, ok)
	for _, name := range secretNames {
		assert.Contains(t, sec, name, "the Secret must carry %s", name)
	}

	testkit.Cover(t, "infra-secrets-env")
}

// TestHelmChartNginxCopyInSync — nginx/nginx.conf is the source of truth; the
// chart ships a copy (charts cannot read outside their dir). Fails on drift
// (`make helm-sync-nginx` refreshes).
func TestHelmChartNginxCopyInSync(t *testing.T) {
	assert.Equal(t,
		readRepoFile(t, "nginx/nginx.conf"),
		readRepoFile(t, "deploy/helm/ggd/files/nginx.conf"),
		"deploy/helm/ggd/files/nginx.conf drifted from nginx/nginx.conf — run `make helm-sync-nginx`")
	assert.Equal(t,
		readRepoFile(t, "nginx/dev/content-api.conf"),
		readRepoFile(t, "deploy/helm/ggd/files/content-api.dev.conf"),
		"deploy/helm/ggd/files/content-api.dev.conf drifted — run `make helm-sync-nginx`")
}
