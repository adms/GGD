package infracheck

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/ggd/testrunner/internal/config"
	"github.com/stretchr/testify/require"
)

const nginxImage = "nginxinc/nginx-unprivileged:alpine"
const helmImage = "alpine/helm:3.16.2"

func repoRoot(t *testing.T) string {
	t.Helper()
	wd, err := os.Getwd()
	require.NoError(t, err)
	root, err := config.FindRepoRoot(wd)
	require.NoError(t, err)
	return root
}

func readRepoFile(t *testing.T, rel string) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(repoRoot(t), rel))
	require.NoError(t, err, rel)
	return string(data)
}

// ---- docker -----------------------------------------------------------------

var dockerOnce sync.Once
var dockerOK bool

func haveDocker(t *testing.T) bool {
	t.Helper()
	dockerOnce.Do(func() {
		if _, err := exec.LookPath("docker"); err != nil {
			return
		}
		dockerOK = exec.Command("docker", "info").Run() == nil
	})
	return dockerOK
}

func docker(t *testing.T, args ...string) (string, error) {
	t.Helper()
	cmd := exec.Command("docker", args...)
	out, err := cmd.CombinedOutput()
	return string(out), err
}

var pullOnce sync.Map

func dockerPull(t *testing.T, image string) {
	t.Helper()
	once, _ := pullOnce.LoadOrStore(image, &sync.Once{})
	once.(*sync.Once).Do(func() {
		// Best effort — `docker run` pulls on demand anyway; this just keeps
		// the pull latency out of the container start timeout.
		_ = exec.Command("docker", "pull", "-q", image).Run()
	})
}

// ---- helm render (helm binary, or dockerized helm fallback) -------------------

type renderKey struct{ valuesFile string }

// secret.yaml deliberately `required`s every secret (infra-09: nothing secret is
// baked into an image, so values.yaml ships none). Real deploys pass them via
// `make secrets` → the gitignored deploy/helm/secrets.local.yaml; tests pass
// throwaway ones so the prod-shaped render gets far enough to be asserted on.
var dummySecretArgs = []string{
	"--set", "secrets.jwtSigningSecret=test",
	"--set", "secrets.platformGameSharedSecret=test",
	"--set", "secrets.redisPassword=test",
}

var renderCache sync.Map // renderKey -> string
var renderErr sync.Map   // renderKey -> error

// helmRender renders the chart with values.yaml plus an optional extra values
// file (relative to the chart dir, e.g. "values-local.yaml"). Skips the test
// when neither helm nor docker is available.
func helmRender(t *testing.T, extraValues string) string {
	t.Helper()
	key := renderKey{extraValues}
	if v, ok := renderCache.Load(key); ok {
		return v.(string)
	}
	if e, ok := renderErr.Load(key); ok {
		t.Fatalf("helm template failed: %v", e)
	}

	chart := filepath.Join(repoRoot(t), "deploy", "helm", "ggd")
	var out []byte
	var err error
	if _, lookErr := exec.LookPath("helm"); lookErr == nil {
		args := []string{"template", "ggd", chart}
		if extraValues != "" {
			args = append(args, "-f", filepath.Join(chart, extraValues))
		}
		args = append(args, dummySecretArgs...)
		out, err = exec.Command("helm", args...).CombinedOutput()
	} else if haveDocker(t) {
		dockerPull(t, helmImage)
		args := []string{"run", "--rm", "-v", chart + ":/chart:ro", helmImage, "template", "ggd", "/chart"}
		if extraValues != "" {
			args = append(args, "-f", "/chart/"+extraValues)
		}
		args = append(args, dummySecretArgs...)
		out, err = exec.Command("docker", args...).CombinedOutput()
	} else {
		t.Skip("neither helm nor docker available — cannot render the chart (leave infra-06 unverified here)")
	}
	if err != nil {
		renderErr.Store(key, fmt.Errorf("%v\n%s", err, out))
		t.Fatalf("helm template failed: %v\n%s", err, out)
	}
	s := string(out)
	renderCache.Store(key, s)
	return s
}

// splitDocs splits a multi-doc YAML render into individual documents.
func splitDocs(rendered string) []string {
	var docs []string
	for _, d := range strings.Split(rendered, "\n---") {
		if strings.TrimSpace(d) != "" {
			docs = append(docs, d)
		}
	}
	return docs
}

// findDoc returns the doc containing every needle.
func findDoc(docs []string, needles ...string) (string, bool) {
outer:
	for _, d := range docs {
		for _, n := range needles {
			if !strings.Contains(d, n) {
				continue outer
			}
		}
		return d, true
	}
	return "", false
}

// ---- live nginx container ------------------------------------------------------

type nginxContainer struct {
	name string
	base string // http://127.0.0.1:<port>
}

// startNginx boots the edge config in a real unprivileged-nginx container.
// dev=true also mounts nginx/dev/ at /etc/nginx/ggd-dev (the dev profile).
func startNginx(t *testing.T, dev bool) *nginxContainer {
	t.Helper()
	if !haveDocker(t) {
		t.Skip("docker unavailable — cannot verify the nginx edge config here")
	}
	dockerPull(t, nginxImage)
	root := repoRoot(t)

	// Stub dists + content store. /tmp keeps Docker Desktop file sharing happy.
	stage, err := os.MkdirTemp("/tmp", "ggd-nginx-test-*")
	require.NoError(t, err)
	t.Cleanup(func() { _ = os.RemoveAll(stage) })
	mkfile := func(rel, content string) {
		p := filepath.Join(stage, rel)
		require.NoError(t, os.MkdirAll(filepath.Dir(p), 0o755))
		require.NoError(t, os.WriteFile(p, []byte(content), 0o644))
	}
	mkfile("client/index.html", "<html>GGD client stub</html>")
	mkfile("editor/index.html", "<html>GGD editor stub</html>")
	mkfile("content/manifest.json", `{"contentVersion":"cv_stub"}`)
	mkfile("content/champions/_index.json", `[{"id":"sela"}]`)
	mkfile("content/champions/sela.json", `{"id":"sela","schema":"champion@1"}`)

	name := fmt.Sprintf("ggd-nginx-test-%d", time.Now().UnixNano())
	args := []string{
		"run", "-d", "--rm", "--name", name,
		"-p", "127.0.0.1:0:8080",
		// upstream hostnames must resolve at config load; point at loopback
		// (connections will fail → 502, which is exactly what the routing
		// assertions use to prove proxying).
		"--add-host", "platform:127.0.0.1",
		"--add-host", "game:127.0.0.1",
		"--add-host", "content-api:127.0.0.1",
		"-v", filepath.Join(root, "nginx", "nginx.conf") + ":/etc/nginx/nginx.conf:ro",
		"-v", filepath.Join(stage, "client") + ":/usr/share/nginx/html/client:ro",
		"-v", filepath.Join(stage, "editor") + ":/usr/share/nginx/html/editor:ro",
		"-v", filepath.Join(stage, "content") + ":/srv/content:ro",
	}
	if dev {
		args = append(args, "-v", filepath.Join(root, "nginx", "dev")+":/etc/nginx/ggd-dev:ro")
	}
	args = append(args, nginxImage)

	out, err := docker(t, args...)
	require.NoError(t, err, "docker run nginx: %s", out)
	c := &nginxContainer{name: name}
	t.Cleanup(func() { _, _ = docker(t, "stop", "-t", "1", name) })

	portOut, err := docker(t, "port", name, "8080/tcp")
	require.NoError(t, err, portOut)
	// e.g. "0.0.0.0:55001\n[::]:55001" or "127.0.0.1:55001"
	first := strings.TrimSpace(strings.Split(portOut, "\n")[0])
	hostPort := first[strings.LastIndex(first, ":")+1:]
	c.base = "http://127.0.0.1:" + hostPort

	// Readiness.
	deadline := time.Now().Add(30 * time.Second)
	for {
		resp, err := http.Get(c.base + "/healthz")
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == 200 {
				break
			}
		}
		if time.Now().After(deadline) {
			logs, _ := docker(t, "logs", name)
			t.Fatalf("nginx container did not become ready; logs:\n%s", logs)
		}
		time.Sleep(200 * time.Millisecond)
	}
	return c
}

// get fetches a path and returns status, Cache-Control, body prefix.
func (c *nginxContainer) get(t *testing.T, path string) (int, http.Header, string) {
	t.Helper()
	resp, err := http.Get(c.base + path)
	require.NoError(t, err, path)
	defer resp.Body.Close()
	buf := make([]byte, 512)
	n, _ := resp.Body.Read(buf)
	return resp.StatusCode, resp.Header, string(buf[:n])
}
