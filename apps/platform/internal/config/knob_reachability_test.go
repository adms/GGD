package config

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// #724 / GH#816 AC3 —— every GGD_* knob a SHIPPING service reads must be
// SETTABLE on the deploy we actually run.
//
// WHY. #724 shipped nine platform rollback switches and documented each as "one
// env var and no rebuild". compose passes ONLY what is listed under
// `environment:` — it does not forward the host's environment — so all nine were
// unreachable on a compose deploy, and so were six older ones. Nothing was red:
// the Go tests proved the knob WORKS, and a knob that works in `go test` but
// cannot be set where it runs is the same failure as a knob that does not
// exist. ⭐ The difference between "it is not implemented" and "it is not
// reachable in THIS environment" is invisible unless something reads both
// sides, so this does.
//
// GH#816 AC3 widened it to the GAME service, where the same disease was worse:
// measured 2026-08-29, 46 GGD_* knobs read by shipping game-server code and
// only 3 reachable. Among the 43 was GGD_SNAPSHOT_ZONE_CULL — #760's documented
// one-key rollback, which on ggd.adms.ai could not be turned.
//
// ⭐ TWO HEADS, BOTH WALKED. The old check asked "does this name appear anywhere
// in compose*.yaml"; a platform knob listed only under `game:` would have passed
// while being unreachable by the platform. This resolves the environment PER
// SERVICE, so the question is "does it reach THAT container". (Verified when
// tightening: all 23 platform knobs were already under `platform:`.)
//
// MUTATION (verified): delete GGD_SNAPSHOT_ZONE_CULL from docker/compose.yaml
// → this fails naming that knob and the file that reads it. Same for
// GGD_AUTH_REFRESH_COOKIE on the platform side.
func TestEveryShippedKnobIsReachableInTheDeployEnv(t *testing.T) {
	root := filepath.Join("..", "..", "..", "..")

	// The deploy runs BOTH files together (`-f compose.yaml -f compose.family.yaml`,
	// scripts/host-deploy.sh:98), and compose merges `environment` maps key-wise,
	// so the union per service is what the container actually receives.
	env := composeEnvByService(t, root, "compose.yaml", "compose.family.yaml")

	for _, svc := range []struct {
		compose string   // service key under `services:`
		dirs    []string // repo-relative dirs holding that service's shipping source
		suffix  string
		// How a knob NAME appears in that language. Go: a quoted literal handed
		// to os.Getenv. TS: `env.GGD_X` (covers `process.env.GGD_X`) or a quoted
		// literal in a name table (wsCompression / eventBatch / analytics).
		// Both forms are CODE, so a knob merely NAMED in a comment does not
		// count — checked against an independent comment-stripping pass: both
		// agree on exactly 46 for the game.
		re *regexp.Regexp
	}{
		{
			compose: "platform",
			dirs:    []string{"apps/platform/internal/config", "apps/platform/cmd/platform"},
			suffix:  ".go",
			re:      regexp.MustCompile(`"(GGD_[A-Z0-9_]+)"`),
		},
		{
			compose: "game",
			dirs:    []string{"apps/game-server/src"},
			suffix:  ".ts",
			re:      regexp.MustCompile(`env\.(GGD_[A-Z0-9_]+)|"(GGD_[A-Z0-9_]+)"`),
		},
	} {
		passed := env[svc.compose]
		if len(passed) == 0 {
			t.Fatalf("no `environment:` block parsed for compose service %q — this guard's "+
				"compose parser broke, not the config", svc.compose)
		}

		seen := map[string]bool{}
		for _, src := range shippingSources(t, root, svc.dirs, svc.suffix) {
			b, err := os.ReadFile(src)
			if err != nil {
				t.Fatalf("read %s: %v", src, err)
			}
			for _, m := range svc.re.FindAllStringSubmatch(string(b), -1) {
				key := m[1]
				if key == "" {
					key = m[2]
				}
				if key == "" || seen[key] {
					continue
				}
				seen[key] = true
				if !passed[key] {
					t.Errorf("%s reads %s, but docker/compose*.yaml does not pass it to the %s "+
						"container — it can only be changed by editing YAML and recreating the "+
						"service, which is not the one-env-var rollback it is documented as. Add "+
						`%s: "${%s:-}" under services.%s.environment (empty ⇒ the in-code default). `+
						`⚠️ First confirm the read site treats "" as UNSET; if it uses `+
						"`?? default` the empty string survives as a real value and you must spell "+
						"the default out instead (see GGD_MATCH_STATS_DIR).",
						filepath.Base(src), key, svc.compose, key, key, svc.compose)
				}
			}
		}
		if len(seen) == 0 {
			t.Errorf("found no GGD_* knobs at all for %s — the scan broke, not the config", svc.compose)
		}
	}
}

// shippingSources walks dirs for files this service actually ships. Tests and
// fixtures are excluded: a knob read only by a test is not a deploy knob.
func shippingSources(t *testing.T, root string, dirs []string, suffix string) []string {
	t.Helper()
	var out []string
	for _, dir := range dirs {
		abs := filepath.Join(root, filepath.FromSlash(dir))
		err := filepath.WalkDir(abs, func(p string, d os.DirEntry, err error) error {
			if err != nil {
				return err
			}
			n := d.Name()
			if d.IsDir() {
				return nil
			}
			if !strings.HasSuffix(n, suffix) ||
				strings.HasSuffix(n, "_test"+suffix) ||
				strings.Contains(n, ".test."+strings.TrimPrefix(suffix, ".")) ||
				n == "testSetup"+suffix {
				return nil
			}
			out = append(out, p)
			return nil
		})
		if err != nil {
			t.Fatalf("walk %s: %v (this guard's paths moved)", dir, err)
		}
	}
	if len(out) == 0 {
		t.Fatalf("no %s sources under %v — this guard's paths moved", suffix, dirs)
	}
	return out
}

// composeEnvByService returns service name → set of keys under its
// `environment:`, unioned across files in order.
//
// Hand-rolled rather than pulled through a YAML library because compose's own
// `!override` tag is not plain YAML and adding a direct dependency to reach two
// mapping levels is a worse trade. The shape is fixed and the caller fails loud
// when a service comes back empty, so a parser that stops working stops the
// test rather than passing it.
func composeEnvByService(t *testing.T, root string, files ...string) map[string]map[string]bool {
	t.Helper()
	key := regexp.MustCompile(`^([A-Za-z_][A-Za-z0-9_]*)\s*:`)
	out := map[string]map[string]bool{}
	for _, f := range files {
		b, err := os.ReadFile(filepath.Join(root, "docker", f))
		if err != nil {
			t.Fatalf("read docker/%s: %v (this guard's paths moved)", f, err)
		}
		svc, inEnv := "", false
		for _, line := range strings.Split(string(b), "\n") {
			trimmed := strings.TrimSpace(line)
			if trimmed == "" || strings.HasPrefix(trimmed, "#") {
				continue
			}
			indent := len(line) - len(strings.TrimLeft(line, " "))
			switch {
			case indent == 2 && strings.HasSuffix(trimmed, ":"):
				svc, inEnv = strings.TrimSuffix(trimmed, ":"), false
			case svc != "" && indent == 4:
				inEnv = trimmed == "environment:"
			case inEnv && indent >= 6:
				if m := key.FindStringSubmatch(trimmed); m != nil {
					if out[svc] == nil {
						out[svc] = map[string]bool{}
					}
					out[svc][m[1]] = true
				}
			case indent <= 4:
				inEnv = false
			}
		}
	}
	return out
}
