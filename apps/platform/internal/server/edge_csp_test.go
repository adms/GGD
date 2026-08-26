package server_test

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// #724/F-15 + F-05. The edge config is the one part of this repo whose mistakes
// are invisible until a browser meets them, so the properties that must not
// silently regress get a test instead of a comment. It lives here because this
// package already reads nginx.conf (see orphan_route_test.go's repoRoot).
//
// Values are NOT pinned — the policy will grow. What is pinned is the SHAPE:
// every CSP site carries the enforced directives, every site also ships the
// Report-Only measurement, and the two sites agree with each other.
func TestEdgeConfigCSPAndRealIP(t *testing.T) {
	body, err := os.ReadFile(filepath.Join(repoRoot(t), "nginx", "nginx.conf"))
	require.NoError(t, err, "nginx/nginx.conf moved — re-point this guard")
	src := string(body)

	enforced := regexp.MustCompile(`add_header Content-Security-Policy "([^"]*)"`).FindAllStringSubmatch(src, -1)
	require.Len(t, enforced, 2, "both CSP sites (server level + /admin/) must be present")
	report := regexp.MustCompile(`add_header Content-Security-Policy-Report-Only "([^"]*)"`).FindAllStringSubmatch(src, -1)
	require.Len(t, report, 2, "each CSP site must also ship the Report-Only policy — "+
		"it is the instrument that tells us when the full policy can be enforced")

	for _, m := range enforced {
		for _, d := range []string{"frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"} {
			assert.Contains(t, m[1], d,
				"every enforced CSP must carry %q — a page without it can be reframed, "+
					"plugin-injected, or have every relative script URL re-based", d)
		}
	}
	for _, m := range report {
		for _, d := range []string{"default-src", "script-src", "connect-src", "worker-src"} {
			assert.Contains(t, m[1], d, "the Report-Only policy must exercise %q", d)
		}
		assert.NotContains(t, m[1], "'unsafe-eval'",
			"neither app nor Babylon's core calls eval — allowing it would give the "+
				"measurement a blind spot exactly where XSS lands")
	}
	// nginx does not merge add_header across levels, so the /admin/ location has
	// to restate the parent's. Restating is how they drift.
	assert.Equal(t, enforced[0][1], enforced[1][1], "the two enforced CSP values drifted")
	assert.Equal(t, report[0][1], report[1][1], "the two Report-Only CSP values drifted")

	// F-05's edge half. Behind Caddy every address-keyed rule here is one global
	// bucket unless the real peer is recovered — and recovering it is only SAFE
	// with the non-recursive rule, which takes the address the trusted proxy
	// appended rather than anything the caller wrote earlier in the chain.
	assert.Contains(t, src, "real_ip_header X-Forwarded-For;")
	assert.Contains(t, src, "real_ip_recursive off;")
	assert.GreaterOrEqual(t, strings.Count(src, "set_real_ip_from "), 1,
		"real_ip_header without set_real_ip_from trusts nobody and silently does nothing")
}
