// Package server_test — devsurface_test.go asserts what the Go platform must
// NEVER grow (task #102).
//
// THE DESIGN, IN ONE LINE: the platform gains no address-based trust at all.
//
// Why that is the whole point rather than a nicety. The user tests the game
// from a phone: `client-lan` in .claude/launch.json runs the game's vite dev
// server with --host 0.0.0.0, verified reachable at http://192.168.0.106:39527
// on shared wifi, and that server PROXIES /api straight to this platform. A
// proxy hop replaces the caller's address with its own, so every request a
// phone makes arrives here from 127.0.0.1. Any "is the caller local?" check on
// this binary would therefore be inverted: it would say "local" about exactly
// the caller it exists to exclude, and hand a device on the wifi full
// unauthenticated admin.
//
// So there is deliberately NO dev-admin route, NO loopback bypass, NO second
// mux and NO dev listener on the Go binary. `/api/v1/admin/*` keeps argon2id +
// alg-pinned HS256 + AdminOnly (which reloads the account on every request, so
// a revoked role takes effect immediately). Laundering the source address into
// this service buys an attacker precisely what it buys them today: a 401.
//
// The "localhost = may edit content" convenience the user asked for lives
// entirely in apps/content-api — a dev-only Node service that binds loopback,
// refuses to start otherwise, and re-checks the socket peer per request — and
// is reached only through the admin console's loopback-bound vite server.
// See apps/admin/src/contentGate.test.ts for that half.
//
// These two tests are what keep the above true after everyone here has
// forgotten why it was arranged this way.
package server_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/admin"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// devPathPrefixes enumerates the shapes a future "just for local dev" route
// would plausibly take. Every one of them must 404 on the router that answers
// on :8080 — the port the LAN-published vite server proxies to.
//
// A second listener bound to 127.0.0.1 would NOT make these safe if it served
// this same router: the routes would still answer on :8080. That is the trap
// inside "just add a loopback listener", and this table is what closes it.
var devPathPrefixes = []string{
	"/api/v1/dev-admin/accounts",
	"/api/v1/dev/admin",
	"/api/v1/local-admin",
	"/api/v1/localhost-admin",
	"/api/v1/debug/admin",
	"/api/v1/content-api/manifest",
	"/api/v1/content/champions/godie-e001",
	"/dev-admin",
	"/debug/pprof/",
}

// devPathsUnderAdmin live INSIDE the authenticated /admin prefix, where an
// unauthenticated probe gets 401 from the middleware before routing resolves.
// A 401 does not prove absence, so these are checked with a real admin token:
// only then does 404 mean "this route does not exist" rather than "you are not
// allowed to find out".
var devPathsUnderAdmin = []string{
	"/api/v1/admin/dev",
	"/api/v1/admin/local",
	"/api/v1/admin/debug",
	"/api/v1/admin/content",
}

// content-admin-no-dev-routes: the production router has no dev surface.
func TestProdRouterHasNoDevAdmin(t *testing.T) {
	testkit.Cover(t, "content-admin-no-dev-routes")
	ts := testutil.New(t)
	router := ts.Srv.Router()

	for _, path := range devPathPrefixes {
		for _, method := range []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete} {
			// RemoteAddr is loopback here — the laundered case — precisely so a
			// failure means "the route exists", never "the peer was wrong".
			req := httptest.NewRequest(method, path, nil)
			req.RemoteAddr = "127.0.0.1:54321"
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)
			assert.Equal(t, http.StatusNotFound, rec.Code,
				"%s %s must not exist on the LAN-proxied router", method, path)
		}
	}

	// The real admin surface still answers — and still refuses. A test that
	// only proved absence could be satisfied by deleting the admin API.
	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/accounts", nil)
	req.RemoteAddr = "127.0.0.1:54321"
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusUnauthorized, rec.Code,
		"a loopback peer with no token must still be 401 — loopback is not a credential")
	assert.Contains(t, rec.Body.String(), "unauthorized")

	// …and with a REAL admin token, the dev-shaped subpaths still 404. This is
	// the half that actually proves absence under the authenticated prefix.
	boss := ts.Register("devsurfaceboss")
	grantAdminRole(t, ts, boss.ID)
	for _, path := range devPathsUnderAdmin {
		r := ts.Do(http.MethodGet, path, boss.Access, nil)
		assert.Equal(t, http.StatusNotFound, r.Status,
			"authenticated admin GET %s must 404 — no dev route may exist here", path)
	}
	// the same token DOES reach the genuine admin surface, so the 404s above
	// are about the paths, not about a broken token
	r := ts.Do(http.MethodGet, "/api/v1/admin/accounts?query=&page=1&pageSize=1", boss.Access, nil)
	require.Equal(t, http.StatusOK, r.Status, "admin token must still work: %s", string(r.Raw))
}

// grantAdminRole promotes an account on the JSON truth. AdminOnly reloads the
// account per request, so the existing token gains admin rights immediately —
// which is itself the property that makes revocation instant.
func grantAdminRole(t *testing.T, ts *testutil.TS, id string) {
	t.Helper()
	_, err := ts.Srv.Accounts.Update(context.Background(), id, func(a *account.Account) error {
		if !a.HasRole(admin.RoleAdmin) {
			a.Roles = append(a.Roles, admin.RoleAdmin)
		}
		return nil
	})
	require.NoError(t, err)
}

// forbiddenTokens are the ways a trust decision could start reading an address.
//
// httpx.ClientIP is the landmine: it returns X-Real-Ip BEFORE falling back to
// RemoteAddr. That is correct for its actual job (rate limiting, where a
// best-effort attribution beats none) and catastrophic in an authorisation
// decision — and it looks entirely reasonable in review. Naming it here is the
// only thing standing between a future contributor and a silent hole.
var forbiddenTokens = []string{
	"X-Real-Ip",
	"X-Real-IP",
	"x-real-ip",
	"X-Forwarded-For",
	"x-forwarded-for",
	"httpx.ClientIP",
	"RemoteAddr",
}

// authPackages are the packages that decide who may do what. None of them may
// so much as mention a caller address.
var authPackages = []string{"admin", "auth", "server"}

// THE ONE EXEMPTION, stated precisely rather than waved through.
//
// internal/auth/handlers.go passes httpx.ClientIP(r) into svc.Login, where it
// is a RATE-LIMIT BUCKET KEY (rdb.RateAllow) and nothing else. That is a
// legitimate best-effort use: a forged header there buys an attacker a fresh
// bucket, i.e. it degrades a throttle, and it can never grant a permission.
//
// The exemption is bounded three ways so it cannot quietly widen:
//   - exactly one occurrence in exactly one file;
//   - it must appear as an argument to h.svc.Login(, never in a condition;
//   - the ip parameter must never be COMPARED anywhere in the service.
//
// Anything else — a second call site, an `if ClientIP(r) == …` — fails.
const (
	clientIPExemptFile = "handlers.go"
	clientIPExemptPkg  = "auth"
)

// content-admin-no-address-trust: authorisation never reads an address.
func TestAuthPackagesNeverReadAnAddress(t *testing.T) {
	testkit.Cover(t, "content-admin-no-address-trust")
	wd, err := os.Getwd() // .../apps/platform/internal/server
	require.NoError(t, err)
	internal := filepath.Dir(wd)

	for _, pkg := range authPackages {
		dir := filepath.Join(internal, pkg)
		entries, err := os.ReadDir(dir)
		require.NoError(t, err, "internal/%s must exist", pkg)
		checked := 0
		for _, e := range entries {
			name := e.Name()
			if e.IsDir() || !strings.HasSuffix(name, ".go") {
				continue
			}
			// Test files are exempt: THIS file names every forbidden token on
			// purpose, and the negative tests set req.RemoteAddr directly.
			if strings.HasSuffix(name, "_test.go") {
				continue
			}
			body, err := os.ReadFile(filepath.Join(dir, name))
			require.NoError(t, err)
			src := string(body)
			checked++
			exempt := pkg == clientIPExemptPkg && name == clientIPExemptFile
			for _, tok := range forbiddenTokens {
				if exempt && tok == "httpx.ClientIP" {
					continue // checked far more precisely below
				}
				assert.NotContains(t, src, tok,
					"internal/%s/%s must not reference %q — authorisation here is by "+
						"credential, never by address (see this file's header)", pkg, name, tok)
			}
		}
		require.Greater(t, checked, 0, "internal/%s had no non-test .go files to check", pkg)
	}

	// The exemption, pinned. A second call site or a comparison fails here.
	handlers, err := os.ReadFile(filepath.Join(internal, clientIPExemptPkg, clientIPExemptFile))
	require.NoError(t, err, "the ClientIP exemption's file moved — re-point it")
	hsrc := string(handlers)
	require.Equal(t, 1, strings.Count(hsrc, "httpx.ClientIP("),
		"internal/auth/handlers.go may call httpx.ClientIP exactly ONCE (login rate limiting)")
	assert.Contains(t, hsrc, "h.svc.Login(r.Context(), req.Username, req.Password, httpx.ClientIP(r))",
		"the single ClientIP call must be the Login rate-limit key, nothing else")

	// …and downstream, the ip is a bucket key, never a predicate.
	service, err := os.ReadFile(filepath.Join(internal, "auth", "service.go"))
	require.NoError(t, err)
	ssrc := string(service)
	assert.Contains(t, ssrc, `s.rdb.RateAllow(ctx, "login", ip`,
		"the login ip must be used as a rate-limit bucket key")

	// It may be compared to "" — that is an "is there one at all?" check, and
	// skipping a throttle is not granting a permission. It may NOT be compared
	// to any other literal: `if ip == "127.0.0.1"` is the whole class of bug
	// this file exists to make impossible, and it would read as reasonable.
	for _, m := range regexp.MustCompile(`\bip\s*[!=]=\s*"([^"]*)"`).FindAllStringSubmatch(ssrc, -1) {
		assert.Equal(t, "", m[1],
			"internal/auth/service.go compares the caller ip against %q — a forged "+
				"header may cost you a throttle, never a permission", m[1])
	}
	for _, loopback := range []string{"127.0.0.1", `"::1"`, "IsLoopback"} {
		assert.NotContains(t, ssrc, loopback,
			"internal/auth/service.go must not know what loopback looks like")
	}
	// …and no prefix/suffix trickery around the comparison ban
	assert.NotContains(t, ssrc, "HasPrefix(ip")
	assert.NotContains(t, ssrc, "Contains(ip")
}

// content-admin-no-address-trust: the landmine still exists, still only for
// rate limiting. If ClientIP is ever deleted or moved this test fails loudly
// rather than letting the ban above quietly become vacuous.
func TestClientIPLandmineIsStillWhereWeThinkItIs(t *testing.T) {
	testkit.Cover(t, "content-admin-no-address-trust")
	wd, err := os.Getwd()
	require.NoError(t, err)
	body, err := os.ReadFile(filepath.Join(filepath.Dir(wd), "httpx", "middleware.go"))
	require.NoError(t, err, "httpx/middleware.go moved — re-point the ban list above")
	src := string(body)
	require.Contains(t, src, "func ClientIP(", "ClientIP moved or was renamed")
	// It really does prefer the forgeable header — which is why no
	// authorisation package may call it.
	assert.Contains(t, src, "X-Real-Ip")
}
