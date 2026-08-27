package config

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// #724 —— every GGD_* knob this platform reads must be SETTABLE on the deploy
// we actually run.
//
// WHY. #724 shipped nine rollback switches and documented each as "one env var
// and no rebuild". compose passes ONLY what is listed under `environment:` — it
// does not forward the host's environment — so all nine were unreachable on a
// compose deploy, and so were six older ones. Nothing was red: the Go tests
// proved the knob WORKS, and a knob that works in `go test` but cannot be set
// where it runs is the same failure as a knob that does not exist. ⭐ The
// difference between "it is not implemented" and "it is not reachable in THIS
// environment" is invisible unless something reads both sides, so this does.
//
// MUTATION (verified): delete GGD_AUTH_REFRESH_COOKIE from docker/compose.yaml
// → this fails naming that knob.
func TestEveryPlatformKnobIsReachableInTheDeployEnv(t *testing.T) {
	root := filepath.Join("..", "..", "..", "..")
	knobRe := regexp.MustCompile(`"(GGD_[A-Z0-9_]+)"`)

	var sources []string
	for _, dir := range []string{filepath.Join(root, "apps", "platform", "internal", "config"), filepath.Join(root, "apps", "platform", "cmd", "platform")} {
		entries, err := os.ReadDir(dir)
		if err != nil {
			t.Fatalf("read %s: %v (this guard's paths moved)", dir, err)
		}
		for _, e := range entries {
			if n := e.Name(); strings.HasSuffix(n, ".go") && !strings.HasSuffix(n, "_test.go") {
				sources = append(sources, filepath.Join(dir, n))
			}
		}
	}

	var env strings.Builder
	for _, f := range []string{"compose.yaml", "compose.family.yaml"} {
		b, err := os.ReadFile(filepath.Join(root, "docker", f))
		if err != nil {
			t.Fatalf("read docker/%s: %v (this guard's paths moved)", f, err)
		}
		env.Write(b)
	}
	deployEnv := env.String()

	seen := map[string]bool{}
	for _, src := range sources {
		b, err := os.ReadFile(src)
		if err != nil {
			t.Fatalf("read %s: %v", src, err)
		}
		for _, m := range knobRe.FindAllStringSubmatch(string(b), -1) {
			key := m[1]
			if seen[key] {
				continue
			}
			seen[key] = true
			if !strings.Contains(deployEnv, key+":") {
				t.Errorf("%s reads %s, but no docker/compose*.yaml passes it to the platform "+
					"container — it can only be changed by editing YAML and recreating the service, "+
					"which is not the one-env-var rollback it is documented as. Add "+
					`%s: "${%s:-}" to the platform service (empty ⇒ the in-code default).`,
					filepath.Base(src), key, key, key)
			}
		}
	}
	if len(seen) == 0 {
		t.Fatal("found no GGD_* knobs at all — the scan broke, not the config")
	}
}
