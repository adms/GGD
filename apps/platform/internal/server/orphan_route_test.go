// Package server_test — orphan_route_test.go is the CI form of detection
// recipe S6 in docs/_false-completions.md:
//
//	orphan route = { every route the router registers } − { every route any
//	                first-party front-end actually calls }
//
// WHY THIS SHAPE OF BUG NEEDS A TEST AND NOT A CHECKLIST. A route with a
// complete handler, a green handler test and no caller anywhere in a UI is
// invisible from every angle a normal review looks from: `go test` is green,
// the code reads correctly, and the only thing missing is the one thing no
// test asserts — that a human can reach it. #118's `crystals/earn` hid this way
// (the sole grep hit in the whole repo was its own registration line), and so
// did #126's approval console: approve / deny / pending were wired, audited and
// covered by approval_console_test.go, with no button anywhere.
//
// It is not a hypothetical guard. Its first run found two orphans the five-lane
// audit had missed (the public announcement feed, #53's /ai/music), and its
// second found the match-liveness heartbeat that the reaper's timing is
// calibrated against and that nothing in the repo sends.
//
// THE ONE RULE THAT MAKES THIS WORTH KEEPING: **both sides are computed at
// test time.** The route set comes from chi.Walk over the REAL wired router
// (testutil.New builds the same Server that main.go does), and the caller set
// comes from reading the front-end sources off disk. Nothing here hard-codes
// "the routes that exist today" or "the orphans we know about today" as the
// thing being measured — the two declared lists below are only SUBTRACTED from
// a freshly computed answer, and each of them is itself re-verified every run
// (see the two anti-rot assertions at the bottom of TestNoOrphanRoutes). A new
// route added tomorrow with no caller fails this test without anyone editing
// it. That is the whole point: the audit document should not need writing a
// second time.
//
// THE TWO WAYS OUT, both explicit, neither silent:
//   - nonFrontendCallers — the route is legitimately called by something that
//     is not a front-end (another service, an operator's curl). An entry must
//     NAME the caller file, and the test greps that file: an exemption whose
//     stated caller stops calling fails.
//   - knownOrphans — a debt ledger. The route really is unreachable, the fix
//     is UI work owned by a task. An entry must name the task. The test fails
//     if the entry is no longer an orphan (someone shipped the UI → delete the
//     line) so the ledger can only shrink.
package server_test

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// frontendRoots are the first-party UIs — every surface a human can click.
// Repo-root-relative.
//
// apps/editor/src is in here for the same reason client and admin are: nginx
// serves it at /editor/ same-origin with /api (nginx/nginx.conf:271) and the
// admin console links to it. A route reachable only from the editor is still
// reached by a person. It is NOT a way to launder an exemption — the editor is
// a shipped UI, not a script.
//
// packages/shared/src is in here because UI modules genuinely live there: the
// asset console's data layer holds READINESS_URL = "/api/v1/ai/readiness"
// (packages/shared/src/assetConsole/assetConsoleData.ts:253) and both the
// client and the admin console import it. Caveat worth knowing: shared is also
// imported by the game-server, so a hit there is slightly weaker evidence than
// a hit in an apps/*/src UI. It is included anyway because the alternative —
// reporting a wired route as an orphan — is what destroys a guard's
// credibility; nobody keeps a test that cries wolf.
var frontendRoots = []string{
	"apps/client/src",
	"apps/admin/src",
	"apps/editor/src",
	"packages/shared/src",
}

// nonFrontendCallers: routes that are SUPPOSED to have no UI caller, each with
// the file that does call it. The reason is the point of the entry; the caller
// path is what keeps the reason honest.
var nonFrontendCallers = map[string]struct{ caller, reason string }{
	"POST /api/v1/internal/matches/{matchId}/result": {
		caller: "apps/game-server/src/rooms/MatchRoom.ts",
		reason: "HMAC service-to-service match settlement. It is mounted via " +
			"Gamelink.MountInternal and is deliberately NOT exposed through the " +
			"public edge — a browser caller would be the bug, since a client that " +
			"could post its own result could write its own MMR.",
	},
	// #189 durable content overlay. The game-server fetches the merged-content
	// overlay bundle at BOOT and lays it over the shipped tree (OverlayContentSource,
	// contentOverlay.ts). It is a service-to-service read of public content JSON —
	// the browser never needs it, since the client already loads content from the
	// static /content mount, not from this endpoint.
	"GET /api/v1/content-overlay/bundle": {
		caller: "apps/game-server/src/config/contentOverlay.ts",
		reason: "#189 durable content overlay: the game-server reads the data/ overlay " +
			"bundle at boot and merges it over the shipped content tree so an admin's edit " +
			"survives a git pull. Public content JSON, consumed service-to-service; the " +
			"client loads content from the static /content mount, so no UI calls this.",
	},
	// #209 click-to-approve. There is NO bundled UI on purpose: the owner opens
	// this from the Slack notification on their phone while NOT logged into
	// /admin, so a front-end caller would defeat the whole point. The "caller"
	// that mints the URL is the server itself — approvelink.Service.linkURL builds
	// "/api/v1/approve?token=…" into the Slack message — so the route is reached,
	// just not by a bundled front-end. The token is the gate.
	"GET /api/v1/approve": {
		caller: "apps/platform/internal/approvelink/service.go",
		reason: "#209 click-to-approve CONFIRM page. Reached by the owner tapping the " +
			"Slack link (the URL is minted by approvelink.Service.linkURL in the named " +
			"file), NOT by any bundled UI — the owner is not logged into /admin. The GET " +
			"is read-only/prefetch-safe; the token is the only gate.",
	},
	"POST /api/v1/approve": {
		caller: "apps/platform/internal/approvelink/service.go",
		reason: "#209 click-to-approve ACTION. Posted from the confirm page's form (whose " +
			"action /api/v1/approve and token are emitted by the same file's link builder), " +
			"not by a bundled UI — the owner acts from their phone via the Slack link. " +
			"Single-use token gate; GET/POST split keeps unfurlers from auto-approving.",
	},
}

// knownOrphans: routes that ARE unreachable today. Each line is a debt with an
// owner, not a permission. Deleting a line is the fix; the test makes sure a
// line cannot outlive the problem it describes.
//
// Computed by this test on 2026-07-24. Every entry is pre-existing debt; none
// was introduced by the P0 false-completion fixes. The list is expected to
// shrink and is not allowed to grow silently — a route that is not in it and
// has no caller fails the run.
var knownOrphans = map[string]string{
	// ---- #126 private-deploy approval gate --------------------------------
	// The audit's P1-7 instance. While this file was being written another lane
	// shipped listPendingAccounts/approveAccount/denyAccount in
	// apps/admin/src/api.ts, and the ratchet below immediately demanded those
	// three lines be deleted from this ledger — which is what a shrink-only
	// debt list is supposed to feel like. What is left is the role control.
	"POST /api/v1/admin/accounts/{id}/role": "#126 — no role grant/revoke control in the console. The " +
		"first-owner bootstrap decides ownership by arrival order on a public endpoint, so a wrong grant " +
		"has to be fixable IN the product; until this is wired, taking a role back means hand-editing " +
		"account JSON — exactly what the route was added to stop.",

	// ---- lobby/room features whose backend shipped ahead of the UI ---------
	"GET /api/v1/rooms/templates":       "no room-template picker in the client lobby; templates are only ever the compiled defaults",
	"POST /api/v1/rooms/templates":      "no room-template editor in any UI — a saved template is durable state (data/rooms/templates/<id>.json) that nothing can create",
	"GET /api/v1/rooms/templates/{id}":  "no room-template detail view (its list route above is unreachable too)",
	"POST /api/v1/friends/{accountId}/block": "the friends panel wires list/request/accept/decline/remove " +
		"(client/src/ui/platform/api.ts:105-121) but never block — the one moderation action of the five",

	// ---- match-liveness heartbeat: NOBODY SENDS IT ------------------------
	// Caught by this test the day it was written, on code that had been on main
	// for hours — which is the only evidence that matters for whether the test
	// was worth writing.
	//
	// internal/gamelink/callback.go:42-43 registers both heartbeat forms and
	// internal/config/config.go:180 states as fact that "the game-server
	// heartbeats every 30s"; MatchLivenessGrace is tuned to that number. Grep
	// apps/game-server/src: there is no heartbeat sender. So the reaper's grace
	// window is calibrated against a signal that never arrives, and every match
	// falls through to the blind deadline instead. Two green test suites, a
	// documented protocol, and no client — the exact shape of S6.
	//
	// These are service-to-service routes, so the fix is NOT a UI: when the
	// game-server ships the sender, MOVE these two lines into
	// nonFrontendCallers naming that file. (Anti-rot #2 only watches the
	// front-ends, so it cannot retire a service-to-service entry for you.)
	"POST /api/v1/internal/matches/heartbeat": "the BATCH liveness heartbeat. Registered, HMAC-guarded, " +
		"tested, and sent by nothing in this repo — see the block comment above.",
	"POST /api/v1/internal/matches/{matchId}/heartbeat": "the per-match liveness heartbeat. Same story as " +
		"the batch form above: no sender exists in apps/game-server.",

	// ---- shipped backend, unbuilt front half ------------------------------
	// NOT in the audit document — this test found these on its first run,
	// which is the only evidence that matters for whether it was worth writing.
	//
	// `GET /api/v1/announcements` USED TO BE THE FIRST LINE OF THIS BLOCK, and
	// it is gone because the front half shipped (#259): the lobby fetches the
	// feed on entry (client/src/ui/platform/store.ts refreshAnnouncement, in
	// the same landing fan-out as friends/wallet) and pops it as a dismissible
	// 大廳公告 (client/src/ui/platform/LobbyAnnouncement.tsx). This test is what
	// forced the deletion — it went red with "a front-end calls it now" — which
	// is the shrink-only behaviour the file promises, observed working.
	//
	// Worth recording for the next entry here: the ledger caught the orphan
	// but the ledger is not a test of the FIX. Nothing in it can tell whether
	// the UI that removes an entry actually puts anything on a player's screen,
	// because a single `api.request("/announcements")` anywhere in apps/client
	// retires the line. The companion assertion is
	// client/src/ui/platform/announcements.test.ts, which renders the real
	// LobbyScreen and looks for the operator's own words in the markup.
	"POST /api/v1/ai/music": "#53's 一鍵 BGM pack generation. The provider config UI exists (musicBaseUrl / " +
		"musicModel / musicReady in admin/src/ai.ts) and there is no button that spends it.",

	// ---- #189 durable content overlay -------------------------------------
	// The console adapter this ledger was waiting for SHIPPED: apps/admin/src/
	// ui/ContentOverlayPage.tsx (statically imported, so it exists in the
	// production bundle) drives the whole surface through apps/admin/src/api.ts
	// — status, log, shipped, PUT docs, DELETE docs, DELETE entries. Those six
	// entries are gone from this ledger, which is the shrink-only behaviour the
	// file promises. Only the public probe below is left, and its absence is
	// now a DESIGN decision rather than missing UI.
	"GET /api/v1/content-overlay/head": "#189 — the PUBLIC divergence probe (generation / fingerprint / " +
		"degraded). No UI calls it and that is deliberate: being unauthenticated it blanks updatedBy, so the " +
		"console reads the admin-only /content-overlay/status instead, which carries the per-entry " +
		"'when + by whom' the operator actually needs. Kept as the cheap polling probe for a future " +
		"consumer-side divergence badge (docs/design/content-sync.md §3.1/§4); delete the route if that " +
		"never lands.",
	// ---- #209 Slack-notify config: backend shipped ahead of the toggle UI --
	// The webhook secret + enable flag are settable two ways: the environment
	// (GGD_SLACK_WEBHOOK_URL / GGD_SLACK_NOTIFY_ENABLED), which needs no route,
	// and this admin-gated durable config (mirroring /admin/ai/config). The env
	// path is complete; the console panel that would call these two is the
	// deferred front-half of #209 (see the task's "if the config UI is too big,
	// wire the secret via env" allowance). Wire a panel in apps/admin/src that
	// GETs/PUTs /admin/slack-notify (same shape as admin/src/ai.ts) → delete these
	// two lines.
	"GET /api/v1/admin/slack-notify": "#209 — masked Slack webhook config read. No admin-console panel yet; " +
		"the feature is driven by env (GGD_SLACK_WEBHOOK_URL) meanwhile. Wire a toggle in apps/admin/src like ai.ts.",
	"PUT /api/v1/admin/slack-notify": "#209 — Slack webhook config write (enable + webhook). No admin-console panel " +
		"yet; env drives it meanwhile. Wire a toggle in apps/admin/src like ai.ts and delete this line.",

	// ---- superseded / aspirational ----------------------------------------
	"GET /api/v1/wallet/owns": "superseded, probably deletable: the client reads ownedChampions off the " +
		"GET /wallet payload, so this per-champion probe has no caller. Either wire it or drop it — " +
		"leaving it is what makes the next audit expensive.",
	"POST /api/v1/ai/tts": "aspirational: tools/tts-gen/README.md documents this as the production voice " +
		"path, but tools/tts-gen/src/generate.mjs still shells out to macOS `say` and never calls it. " +
		"Nothing in the repo reaches this endpoint.",
}

// TestNoOrphanRoutes is detection recipe S6, executable.
//
// LOOSE END, stated rather than left silent: the beacon id below has no row in
// docs/todo/*.md yet, so `make todo-check` prints "1 beacon(s) match no TODO
// item" (a warning — it does not fail the gate). Adding the row was skipped on
// purpose: concurrent lanes were editing those files. Register
// `meta-no-orphan-routes` in whichever todo file ends up owning this guard.
func TestNoOrphanRoutes(t *testing.T) {
	testkit.Cover(t, "meta-no-orphan-routes")

	routes := registeredRoutes(t)
	require.Greater(t, len(routes), 50,
		"chi.Walk found only %d routes — the router shape changed and this test is "+
			"measuring nothing", len(routes))

	sources := frontendSources(t)
	require.Greater(t, len(sources), 100,
		"only %d front-end source files found — frontendRoots is stale and every "+
			"route would look like an orphan", len(sources))

	corpus := callerCorpus(sources)
	// ~8 KB on 2026-07-24 across the four roots. The floor is a tripwire for
	// "urlishLiteral stopped matching", not a size target: if extraction breaks,
	// EVERY route becomes an orphan, and 90 bogus findings would bury the one
	// line that explains why.
	require.Greater(t, len(corpus), 4_000,
		"the extracted call-site corpus is only %d bytes — urlishLiteral stopped "+
			"matching real call sites, which would report every route as an orphan",
		len(corpus))

	// Compute, do not recall: for every registered route, is there a call site?
	orphans := make([]string, 0, 8)
	for _, rt := range routes {
		if !calledByAnyFrontend(rt.pattern, corpus) {
			orphans = append(orphans, rt.key())
		}
	}

	// Subtract the two declared lists — AFTER computing, never before.
	unexplained := make([]string, 0, 4)
	for _, key := range orphans {
		if _, ok := nonFrontendCallers[key]; ok {
			continue
		}
		if _, ok := knownOrphans[key]; ok {
			continue
		}
		unexplained = append(unexplained, key)
	}
	sort.Strings(unexplained)

	require.Empty(t, unexplained, orphanFailure(unexplained))

	// ---- anti-rot #1: every nonFrontendCallers entry is still true ----------
	// A stated caller that stopped calling turns the exemption into a lie, and
	// the route silently becomes an orphan with a note saying it isn't one.
	root := repoRoot(t)
	registered := map[string]bool{}
	for _, rt := range routes {
		registered[rt.key()] = true
	}
	for key, ex := range nonFrontendCallers {
		require.True(t, registered[key],
			"nonFrontendCallers names %q, which the router no longer registers — "+
				"delete the entry (or fix the method/pattern if the route moved)", key)
		// A reason-less exemption is the pathology this file exists to catch,
		// one level up: it silences the alarm and records nothing.
		require.Greater(t, len(ex.reason), 40,
			"the nonFrontendCallers entry for %q has no real reason. Write why no UI "+
				"calls it and why that is correct — a bare entry is a silent skip.", key)
		body, err := os.ReadFile(filepath.Join(root, ex.caller))
		require.NoError(t, err,
			"the stated caller for %q (%s) is gone — re-point it or move the "+
				"route to knownOrphans", key, ex.caller)
		_, pattern, _ := strings.Cut(key, " ")
		require.True(t, matchWithBoundary(callSiteRegexp(pattern), string(body)),
			"%s is listed as the caller of %q but does not call it any more.\n"+
				"The exemption is now false: either restore the call, re-point the "+
				"exemption at the real caller, or move the route to knownOrphans "+
				"with a task.", ex.caller, key)
	}

	// ---- anti-rot #2: every knownOrphans entry is still an orphan -----------
	// This is what makes the ledger shrink-only. Wire the UI and this test
	// tells you to delete the line; it never lets a fixed entry sit there and
	// quietly excuse a future regression on the same route.
	orphanSet := map[string]bool{}
	for _, key := range orphans {
		orphanSet[key] = true
	}
	for key, reason := range knownOrphans {
		require.Greater(t, len(reason), 40,
			"the knownOrphans entry for %q has no real reason. Say what is missing and "+
				"who owns it — a bare id in this map is exactly the silent skip that let "+
				"the original 27 false completions through.", key)
		require.True(t, registered[key],
			"knownOrphans names %q, which the router no longer registers — the route "+
				"was renamed or deleted; delete the ledger line", key)
		require.True(t, orphanSet[key],
			"knownOrphans still lists %q, but a front-end calls it now. Fixed — "+
				"delete that line from knownOrphans so the route is guarded again.", key)
	}
}

// orphanFailure is the message a failing run has to be actionable from alone.
func orphanFailure(unexplained []string) string {
	var b strings.Builder
	fmt.Fprintf(&b, "\n%d ORPHAN ROUTE(S): registered by the platform, called by no "+
		"first-party UI.\n\n", len(unexplained))
	for _, key := range unexplained {
		fmt.Fprintf(&b, "    %s\n", key)
	}
	b.WriteString("\nA route nobody can reach is a feature that does not exist, and " +
		"nothing else in CI\nnotices: the handler test passes, the code reads fine, " +
		"and the button was never built.\n" +
		"This is how #118 crystals/earn and #126's approval console shipped 'complete'.\n\n" +
		"Resolve it in exactly one of three ways — pick the true one:\n\n" +
		"  1. WIRE IT. Add the call in apps/client/src, apps/admin/src or apps/editor/src\n" +
		"     (see apps/admin/src/api.ts / apps/client/src/ui/platform/api.ts for the\n" +
		"     house style: one typed wrapper per route). This is the right answer when\n" +
		"     the feature was meant to ship.\n\n" +
		"  2. DELETE IT. If nothing should call it, the handler, its tests and its route\n" +
		"     line are all dead weight — remove them. Fewer routes is fewer attack surface.\n\n" +
		"  3. DECLARE IT, with a reason, in this file:\n" +
		"       • nonFrontendCallers — it IS called, just not by a UI (another service,\n" +
		"         an operator's curl). You must name the caller file; the test greps it,\n" +
		"         so the exemption cannot rot into a lie.\n" +
		"       • knownOrphans — it really is unreachable and the UI is someone's open\n" +
		"         task. Name the task. The test fails once it stops being an orphan, so\n" +
		"         the ledger can only shrink.\n\n" +
		"     Adding a bare entry with no reason is the same failure this test exists to\n" +
		"     catch, one level up. Write the reason.\n")
	return b.String()
}

// ---------------------------------------------------------------------------
// route enumeration — from the real router, not from a list
// ---------------------------------------------------------------------------

type route struct{ method, pattern string }

func (r route) key() string { return r.method + " " + r.pattern }

// registeredRoutes walks the fully-wired production router. Using chi.Walk
// rather than grepping the registration sites is deliberate: a route mounted
// by a package's Mount() helper, or reachable only through a Group, is still
// walked, so a feature cannot hide from this test by being modular.
func registeredRoutes(t *testing.T) []route {
	t.Helper()
	ts := testutil.New(t)
	routes, ok := ts.Srv.Router().(chi.Routes)
	require.True(t, ok, "the platform router is no longer a chi.Routes — re-implement "+
		"registeredRoutes against whatever replaced it, do NOT hand-maintain a list")

	var out []route
	err := chi.Walk(routes, func(method, pattern string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		out = append(out, route{method: method, pattern: pattern})
		return nil
	})
	require.NoError(t, err)
	return out
}

// ---------------------------------------------------------------------------
// caller enumeration — from the front-end sources, not from a list
// ---------------------------------------------------------------------------

type sourceFile struct {
	rel  string
	body string
}

// repoRoot resolves the monorepo root from this package's directory. It is
// checked against a landmark so a package move fails loudly here instead of
// silently finding no front-end files (which would report every route as an
// orphan — a failure that looks like 87 bugs instead of one wrong path).
func repoRoot(t *testing.T) string {
	t.Helper()
	wd, err := os.Getwd() // …/apps/platform/internal/server
	require.NoError(t, err)
	root := filepath.Dir(filepath.Dir(filepath.Dir(filepath.Dir(wd))))
	_, err = os.Stat(filepath.Join(root, "pnpm-workspace.yaml"))
	require.NoError(t, err, "repoRoot resolved to %q, which is not the monorepo root — "+
		"this package moved; fix the parent-count here", root)
	return root
}

// frontendSources reads every non-test front-end source file.
//
// Test files are EXCLUDED on purpose: a route exercised only by a front-end
// unit test is exactly as unreachable as one exercised by nothing, and letting
// a test count as a caller would re-open the hole this whole file is about.
func frontendSources(t *testing.T) []sourceFile {
	t.Helper()
	root := repoRoot(t)
	var out []sourceFile
	for _, rel := range frontendRoots {
		dir := filepath.Join(root, rel)
		info, err := os.Stat(dir)
		require.NoError(t, err, "frontend root %s is missing — if a UI moved, "+
			"update frontendRoots; a missing root would make every route look orphaned", rel)
		require.True(t, info.IsDir(), "%s is not a directory", rel)

		err = filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				return err
			}
			name := d.Name()
			if d.IsDir() {
				if name == "node_modules" || name == "dist" || name == "__tests__" {
					return filepath.SkipDir
				}
				return nil
			}
			if !isFrontendSource(name) {
				return nil
			}
			body, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			r, _ := filepath.Rel(root, path)
			out = append(out, sourceFile{rel: r, body: string(body)})
			return nil
		})
		require.NoError(t, err)
	}
	return out
}

func isFrontendSource(name string) bool {
	switch {
	case strings.HasSuffix(name, ".test.ts"), strings.HasSuffix(name, ".test.tsx"),
		strings.HasSuffix(name, ".spec.ts"), strings.HasSuffix(name, ".spec.tsx"),
		strings.HasSuffix(name, ".d.ts"):
		return false
	case strings.HasSuffix(name, ".ts"), strings.HasSuffix(name, ".tsx"),
		strings.HasSuffix(name, ".js"), strings.HasSuffix(name, ".jsx"):
		return true
	}
	return false
}

// urlishLiteral extracts the only part of a front-end file that can possibly be
// a call: a '/' that begins a string literal (or follows a `${…}` closing
// brace), up to the end of that literal.
//
// This is a speed optimisation with a correctness dividend. Running ~90 route
// regexps across ~9 MB of TSX costs several seconds; running them across the
// ~100 KB of extracted path literals is instant. The dividend: comments and
// prose are dropped BEFORE matching, because a route named in a doc comment has
// no quote in front of it — the same rule callSiteRegexp enforces, applied once
// instead of ninety times.
var urlishLiteral = regexp.MustCompile(`["'` + "`" + `}]/[^"'` + "`" + "\n]{0,300}")

// callerCorpus is every path literal in every front-end file, one per line.
// Newline-separated so a route can never match across two unrelated literals.
func callerCorpus(sources []sourceFile) string {
	var b strings.Builder
	for _, s := range sources {
		for _, lit := range urlishLiteral.FindAllString(s.body, -1) {
			b.WriteString(lit)
			b.WriteByte('\n')
		}
	}
	return b.String()
}

func calledByAnyFrontend(pattern, corpus string) bool {
	return matchWithBoundary(callSiteRegexp(pattern), corpus)
}

// pathSegmentByte reports whether c could continue a URL path — used to reject
// a prefix match (`/wallet` inside `/wallet/owns`) without lookahead, which
// Go's RE2 engine does not have.
func pathSegmentByte(c byte) bool {
	return c == '/' || c == '-' || c == '_' ||
		(c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
}

var callSiteCache = map[string]*regexp.Regexp{}

// callSiteRegexp turns a chi pattern into "what a call to it looks like in TS".
//
// Two properties matter and both are load-bearing:
//
//   - It must START at a string boundary — a quote, a backtick, or the `}` that
//     closes a `${base}` interpolation. Without that, a route named in a doc
//     comment ("// POST /ai/tts — synthesize speech") would count as a caller,
//     and this test would pass on a route that only exists in prose. That is
//     the failure mode of the naive grep in the audit document.
//   - A `{param}` segment matches anything that is not a path separator or a
//     quote, so the real call shape `/admin/accounts/${encodeURIComponent(id)}/ban`
//     matches `/admin/accounts/{id}/ban` without the test knowing anything
//     about how the caller builds ids.
//
// The `/api/v1` prefix is optional AND splittable (`(?:/api)?(?:/v1)?`)
// because the repo genuinely spells it three ways: the two API clients bake
// the whole prefix into a base URL and pass only the suffix; some direct
// fetch() sites spell the full path (READINESS_URL); and the console-hub
// health check splits it at the version — `${api}/v1/healthz`, where `api`
// already ends in /api (admin/src/config.ts:71). Requiring the literal
// "/api/v1" would have reported healthz as an orphan, which is the sort of
// false positive that gets a guard deleted.
func callSiteRegexp(pattern string) *regexp.Regexp {
	if re, ok := callSiteCache[pattern]; ok {
		return re
	}
	suffix := strings.TrimPrefix(pattern, "/api/v1")
	var parts []string
	for _, seg := range strings.Split(suffix, "/") {
		if strings.HasPrefix(seg, "{") && strings.HasSuffix(seg, "}") {
			parts = append(parts, `[^/"'`+"`"+`]+`)
			continue
		}
		parts = append(parts, regexp.QuoteMeta(seg))
	}
	re := regexp.MustCompile(`["'` + "`" + `}](?:/api)?(?:/v1)?` + strings.Join(parts, "/"))
	callSiteCache[pattern] = re
	return re
}

// matchWithBoundary is re.MatchString plus the TRAILING boundary: the match
// must not be followed by another path character. Without it `/wallet` would
// be "called" by every `/wallet/owns` mention, and a route could be declared
// reachable by a longer route that merely starts the same way.
func matchWithBoundary(re *regexp.Regexp, body string) bool {
	for _, loc := range re.FindAllStringIndex(body, -1) {
		end := loc[1]
		if end >= len(body) || !pathSegmentByte(body[end]) {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------------
// the detector's own test
// ---------------------------------------------------------------------------

// TestOrphanCallSiteMatching pins what "a front-end calls this route" means.
//
// This exists because there is exactly one cheap way to defeat TestNoOrphanRoutes:
// when it goes red, widen callSiteRegexp until the complaint disappears. Loosen
// the leading boundary and a route MENTIONED IN A COMMENT counts as called;
// drop the trailing boundary and `/wallet` is "called" by `/wallet/owns`. Both
// look like harmless tidying in a diff and both silently switch the guard off.
// These cases make that edit fail loudly instead.
//
// Costs nothing — pure string matching, no server, no I/O.
func TestOrphanCallSiteMatching(t *testing.T) {
	testkit.Cover(t, "meta-no-orphan-routes")

	cases := []struct {
		name    string
		pattern string
		source  string
		want    bool
		why     string
	}{
		{
			name:    "plain literal, prefix baked into the API client's base",
			pattern: "/api/v1/curation/whitelist",
			source:  `api.request<unknown>("/curation/whitelist", { auth: false })`,
			want:    true,
			why:     "the house style: ApiClient holds /api/v1, call sites pass the suffix",
		},
		{
			name:    "full path spelled out in a shared constant",
			pattern: "/api/v1/ai/readiness",
			source:  `export const READINESS_URL = "/api/v1/ai/readiness";`,
			want:    true,
			why:     "packages/shared/src/assetConsole spells the whole path",
		},
		{
			name:    "prefix split at the version by an interpolated base",
			pattern: "/api/v1/healthz",
			source:  "healthUrl: `${api}/v1/healthz`,",
			want:    true,
			why:     "admin/src/config.ts builds it this way; a literal /api/v1 requirement would false-positive",
		},
		{
			name:    "path parameter built by the caller",
			pattern: "/api/v1/admin/accounts/{id}/ban",
			source:  "api.request(`/admin/accounts/${encodeURIComponent(id)}/ban`, { body })",
			want:    true,
			why:     "the test must not care how a caller renders an id",
		},
		{
			name:    "query string after the path",
			pattern: "/api/v1/admin/accounts",
			source:  "api.request(`/admin/accounts?${qs.toString()}`)",
			want:    true,
			why:     "'?' ends the path; it is not another segment",
		},
		{
			name:    "MENTIONED IN A COMMENT is not called",
			pattern: "/api/v1/ai/tts",
			source:  " * POST /api/v1/ai/tts  authed (tooling) — synthesize speech (MP3)",
			want:    false,
			why: "THE central case. Every orphan in this repo is documented somewhere; " +
				"a naive grep passes on prose and reports nothing. The match must start at " +
				"a string boundary.",
		},
		{
			name:    "a longer route does not call its own prefix",
			pattern: "/api/v1/wallet",
			source:  `api.request("/wallet/owns?champion=vex")`,
			want:    false,
			why:     "without the trailing boundary, GET /wallet/owns would vouch for GET /wallet",
		},
		{
			name:    "a trailing-slash route is not called by its deeper siblings",
			pattern: "/api/v1/rooms/{id}/",
			source:  "api.request(`/rooms/${encodeURIComponent(roomId)}/join`, { body: {} })",
			want:    false,
			why:     "chi registers /rooms/{id}/ and /rooms/{id}/join separately; so must this",
		},
		{
			name:    "…but the trailing-slash route IS matched by its own call",
			pattern: "/api/v1/rooms/{id}/",
			source:  "api.request(`/rooms/${encodeURIComponent(roomId)}/`)",
			want:    true,
			why:     "the room-detail GET",
		},
		{
			name:    "a param does not swallow a path separator",
			pattern: "/api/v1/admin/accounts/{id}",
			source:  `api.request("/admin/announcements")`,
			want:    false,
			why:     "{id} must match one segment, not an arbitrary tail",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := matchWithBoundary(callSiteRegexp(tc.pattern), tc.source)
			require.Equal(t, tc.want, got,
				"pattern %q vs source %q: expected called=%v.\n%s\n"+
					"If you are here because TestNoOrphanRoutes went red and you were "+
					"adjusting the matcher: don't. Fix the route, delete the route, or "+
					"declare it — see this file's header.", tc.pattern, tc.source, tc.want, tc.why)
		})
	}
}
