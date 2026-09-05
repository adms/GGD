// bootstrap_test.go covers the first-account owner bootstrap: while a deploy has
// NO administrator, a registration claims ownership (admin role + forced
// approved); as soon as one exists the window is shut. See
// internal/auth/bootstrap.go for the design, and in particular for why the gate
// is "no admin exists" rather than "the store is empty".
package auth_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/config"
	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/server"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// registerRaw posts a registration without the token assertions ts.Register
// makes (an approval-gated deploy hands back an empty token pair).
func registerRaw(ts *testutil.TS, name string) testutil.Resp {
	return registerWith(ts, name, "")
}

// registerWith posts a registration carrying an owner bootstrap token.
func registerWith(ts *testutil.TS, name, token string) testutil.Resp {
	return ts.Do(http.MethodPost, "/api/v1/auth/register", "", map[string]string{
		"username": name, "email": name + "@example.com",
		"password": "correct-horse-" + name, "bootstrapToken": token,
	})
}

func loadAccount(t *testing.T, ts *testutil.TS, id string) account.Account {
	t.Helper()
	a, err := ts.Srv.Accounts.GetByID(context.Background(), id)
	require.NoError(t, err)
	return a
}

// adminIDs returns every account in the store that carries the admin role,
// read the same way the bootstrap gate reads it (the account files).
func adminIDs(t *testing.T, ts *testutil.TS) []string {
	t.Helper()
	ids, err := ts.Srv.Accounts.Admins(context.Background())
	require.NoError(t, err)
	return ids
}

// auth-first-account-owner: the first account on a fresh deploy is granted the
// admin role and approved, and the RESPONSE says so (not a pre-promotion
// snapshot) — the client can act on it immediately, no restart, no second login.
func TestFirstRegisteredAccountBecomesOwner(t *testing.T) {
	testkit.Cover(t, "auth-first-account-owner")
	ts := testutil.NewFreshDeploy(t)

	r := registerRaw(ts, "founder")
	require.Equal(t, http.StatusCreated, r.Status, string(r.Raw))
	acc := r.Body["account"].(map[string]any)
	assert.Equal(t, account.StatusApproved, acc["status"], "the owner must be approved on the spot")
	assert.Equal(t, []any{account.RoleAdmin}, acc["roles"],
		"the register RESPONSE must carry the grant, not a pre-promotion snapshot")
	tokens := r.Body["tokens"].(map[string]any)
	require.NotEmpty(t, tokens["accessToken"], "the owner must get a usable session")

	// Durable truth carries the grant.
	stored := loadAccount(t, ts, acc["id"].(string))
	assert.Equal(t, []string{account.RoleAdmin}, stored.Roles)
	assert.True(t, stored.IsApproved())

	// And the token it was just handed opens the admin console — no restart and
	// no ADMIN_BOOTSTRAP_USERNAME dance in between.
	console := ts.Do(http.MethodGet, "/api/v1/admin/accounts", tokens["accessToken"].(string), nil)
	assert.Equal(t, http.StatusOK, console.Status, string(console.Raw))
}

// auth-second-account-not-owner: the window shuts the moment an admin exists —
// account #2 is an ordinary player with no role and cannot reach the console.
func TestSecondAccountIsNotOwner(t *testing.T) {
	testkit.Cover(t, "auth-second-account-not-owner")
	ts := testutil.NewFreshDeploy(t)

	owner := ts.Register("founder")
	second := ts.Register("latecomer")

	me := ts.Do(http.MethodGet, "/api/v1/me", second.Access, nil)
	require.Equal(t, http.StatusOK, me.Status)
	assert.Nil(t, me.Body["account"].(map[string]any)["roles"], "an ordinary player carries no role")

	assert.Equal(t, []string{account.RoleAdmin}, loadAccount(t, ts, owner.ID).Roles)
	assert.Empty(t, loadAccount(t, ts, second.ID).Roles, "only the FIRST account is promoted")

	r := ts.Do(http.MethodGet, "/api/v1/admin/accounts", second.Access, nil)
	assert.Equal(t, http.StatusForbidden, r.Status, string(r.Raw))
	assert.Equal(t, "admin_required", r.ErrCode())
	assert.Equal(t, []string{owner.ID}, adminIDs(t, ts), "exactly one admin exists")
}

// auth-first-account-owner-approval-gate: THE ANTI-BRICK CASE. With the #126
// private-deploy gate ON, a pending first account could never be approved —
// nobody exists who could approve it — so the owner bootstrap must force
// approved AND issue tokens. Later registrants stay pending as designed.
func TestFirstAccountBeatsApprovalGate(t *testing.T) {
	testkit.Cover(t, "auth-first-account-owner-approval-gate")
	t.Setenv("GGD_REQUIRE_APPROVAL", "1")
	ts := testutil.NewFreshDeploy(t)

	r := registerRaw(ts, "founder")
	require.Equal(t, http.StatusCreated, r.Status, string(r.Raw))
	acc := r.Body["account"].(map[string]any)
	assert.Equal(t, account.StatusApproved, acc["status"],
		"a gated deploy would otherwise brick: pending forever with nobody able to approve")
	access, _ := r.Body["tokens"].(map[string]any)["accessToken"].(string)
	require.NotEmpty(t, access, "the owner must receive a token pair despite the gate")

	stored := loadAccount(t, ts, acc["id"].(string))
	assert.Equal(t, account.StatusApproved, stored.Status)
	assert.True(t, stored.HasRole(account.RoleAdmin))

	// The gate still applies to everyone else...
	next := registerRaw(ts, "friend")
	require.Equal(t, http.StatusCreated, next.Status)
	nextAcc := next.Body["account"].(map[string]any)
	assert.Equal(t, account.StatusPending, nextAcc["status"])
	assert.Empty(t, next.Body["tokens"].(map[string]any)["accessToken"])

	// ...and the owner can actually clear the queue, which is the whole point.
	appr := ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+nextAcc["id"].(string)+"/approve", access, nil)
	require.Equal(t, http.StatusOK, appr.Status, string(appr.Raw))
}

// auth-first-account-owner-race: N genuinely concurrent first registrations
// produce EXACTLY ONE admin — never two (the Redis claim is the referee), never
// zero (the winner always goes on to create its account).
func TestConcurrentFirstRegistrationsProduceOneOwner(t *testing.T) {
	testkit.Cover(t, "auth-first-account-owner-race")
	ts := testutil.NewFreshDeploy(t)

	const n = 8
	type result struct {
		status int
		body   map[string]any
		err    error
	}
	results := make([]result, n)
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			name := fmt.Sprintf("racer%d", i)
			payload, err := json.Marshal(map[string]string{
				"username": name, "email": name + "@example.com", "password": "correct-horse-race",
			})
			if err != nil {
				results[i] = result{err: err}
				return
			}
			req, err := http.NewRequest(http.MethodPost, ts.HTTP.URL+"/api/v1/auth/register", bytes.NewReader(payload))
			if err != nil {
				results[i] = result{err: err}
				return
			}
			req.Header.Set("Content-Type", "application/json")
			<-start // release them all at once
			resp, err := ts.HTTP.Client().Do(req)
			if err != nil {
				results[i] = result{err: err}
				return
			}
			defer resp.Body.Close()
			raw, err := io.ReadAll(resp.Body)
			if err != nil {
				results[i] = result{err: err}
				return
			}
			var body map[string]any
			_ = json.Unmarshal(raw, &body)
			results[i] = result{status: resp.StatusCode, body: body}
		}(i)
	}
	close(start)
	wg.Wait()

	created := 0
	ownerFromResponse := ""
	for i, res := range results {
		require.NoError(t, res.err, "racer%d", i)
		require.Equal(t, http.StatusCreated, res.status, "racer%d: %v", i, res.body)
		created++
		// Cross-check the response projection against the durable truth below.
		acc := res.body["account"].(map[string]any)
		if loadAccount(t, ts, acc["id"].(string)).HasRole(account.RoleAdmin) {
			ownerFromResponse = acc["id"].(string)
		}
	}
	require.Equal(t, n, created, "every concurrent registration must succeed")

	admins := adminIDs(t, ts)
	require.Len(t, admins, 1, "exactly one of %d concurrent first registrations may become admin", n)
	assert.Equal(t, admins[0], ownerFromResponse)

	after := ts.Register("newcomer")
	assert.Empty(t, loadAccount(t, ts, after.ID).Roles)
	assert.Len(t, adminIDs(t, ts), 1)
}

// auth-existing-store-no-owner: a deploy that already has an administrator never
// promotes anyone else, and it does not matter what Redis thinks — the gate is
// the account files. This is the "Redis was wiped" / "someone flushed the cache"
// case: it must not reopen ownership on an owned deploy.
func TestExistingAdminBlocksFurtherPromotion(t *testing.T) {
	testkit.Cover(t, "auth-existing-store-no-owner")
	ts := testutil.NewFreshDeploy(t)

	owner := ts.Register("founder")
	require.Equal(t, []string{account.RoleAdmin}, loadAccount(t, ts, owner.ID).Roles)

	// Wipe the hot layer entirely — Redis is a rebuildable cache and must never
	// be what decides a privilege.
	ts.Mini.FlushAll()

	newcomer := registerRaw(ts, "newcomer")
	require.Equal(t, http.StatusCreated, newcomer.Status, string(newcomer.Raw))
	newAcc := newcomer.Body["account"].(map[string]any)
	assert.Nil(t, newAcc["roles"], "an owned deploy must never promote its next registrant")
	assert.Equal(t, []string{owner.ID}, adminIDs(t, ts), "still exactly one admin")
}

// auth-first-owner-self-heals: the counterpart to the test above, and the reason
// the gate is "no admin exists" rather than "the store is empty". A deploy can
// end up holding accounts but NO administrator (a create that half-failed, a
// registration whose caller hung up, a store restored from a partial backup).
// Under an "empty store" rule that state is terminal. Here the next registration
// simply becomes the owner.
func TestOwnerlessStoreWithAccountsStillPromotes(t *testing.T) {
	testkit.Cover(t, "auth-first-owner-self-heals")
	ts := testutil.NewFreshDeploy(t)

	// An account written the way a pre-feature deploy's store looks: present in
	// the JSON truth, carrying no role.
	legacy := account.Account{
		ID: account.NewID(), Username: "veteran", Email: "veteran@example.com",
		PasswordHash: "$argon2id$placeholder", MMR: 1000,
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	require.NoError(t, ts.Srv.Accounts.Create(context.Background(), legacy))
	require.Empty(t, adminIDs(t, ts), "precondition: accounts exist but nobody is admin")

	rescuer := ts.Register("newcomer")
	assert.Equal(t, []string{account.RoleAdmin}, loadAccount(t, ts, rescuer.ID).Roles,
		"an ownerless deploy must still be claimable — otherwise it is bricked forever")
	assert.Equal(t, []string{rescuer.ID}, adminIDs(t, ts))

	r := ts.Do(http.MethodGet, "/api/v1/admin/accounts", rescuer.Access, nil)
	assert.Equal(t, http.StatusOK, r.Status, string(r.Raw))
}

// auth-first-owner-cancelled-request: a client that hangs up mid-registration
// must not be able to leave the deploy with an account and no owner. The whole
// write sequence runs on a context detached from the request, so an already-
// cancelled caller still produces a complete, PROMOTED account.
func TestCancelledRequestStillProducesAnOwner(t *testing.T) {
	testkit.Cover(t, "auth-first-owner-cancelled-request")
	ts := testutil.NewFreshDeploy(t)

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // the caller is gone before the service does any work

	a, pair, err := ts.Srv.Auth.Register(ctx, "founder", "founder@example.com",
		"correct-horse-founder", auth.RegisterOptions{})
	require.NoError(t, err, "a dead client must not fail the registration half-way")
	assert.Equal(t, []string{account.RoleAdmin}, a.Roles, "the grant must not depend on the caller staying alive")
	assert.Equal(t, account.StatusApproved, a.Status)
	assert.NotEmpty(t, pair.AccessToken)
	assert.Equal(t, []string{a.ID}, adminIDs(t, ts), "the deploy has exactly one, usable, owner")
}

// auth-first-owner-token-gate: GGD_OWNER_BOOTSTRAP_TOKEN=1 turns the open claim
// into a proof-of-operator one. A registration with no token (or a wrong one) is
// an ordinary player; the token printed at boot claims ownership, and it is
// one-shot.
func TestOwnerTokenGate(t *testing.T) {
	testkit.Cover(t, "auth-first-owner-token-gate")
	t.Setenv("GGD_OWNER_BOOTSTRAP_TOKEN", "1")
	ts := testutil.NewFreshDeploy(t)
	require.NoError(t, ts.Srv.Boot(context.Background()))

	tokenPath := filepath.Join(ts.Cfg.DataDir, "owner-setup-token")
	raw, err := os.ReadFile(tokenPath)
	require.NoError(t, err, "boot must mint the one-time owner token on an ownerless deploy")
	token := string(bytes.TrimSpace(raw))
	require.NotEmpty(t, token)
	info, err := os.Stat(tokenPath)
	require.NoError(t, err)
	assert.Equal(t, os.FileMode(0o600), info.Mode().Perm(), "the token must not be world-readable")

	// A stranger who cannot read the platform's filesystem gets a plain account.
	stranger := registerRaw(ts, "stranger")
	require.Equal(t, http.StatusCreated, stranger.Status, string(stranger.Raw))
	assert.Nil(t, stranger.Body["account"].(map[string]any)["roles"])
	wrong := registerWith(ts, "guesser", "deadbeef")
	require.Equal(t, http.StatusCreated, wrong.Status)
	assert.Nil(t, wrong.Body["account"].(map[string]any)["roles"])
	assert.Empty(t, adminIDs(t, ts), "no token, no ownership")

	// The operator, who can read the boot log or the file, claims it.
	owner := registerWith(ts, "founder", token)
	require.Equal(t, http.StatusCreated, owner.Status, string(owner.Raw))
	ownerID := owner.Body["account"].(map[string]any)["id"].(string)
	assert.Equal(t, []any{account.RoleAdmin}, owner.Body["account"].(map[string]any)["roles"])
	assert.Equal(t, []string{ownerID}, adminIDs(t, ts))

	// One-shot: the token is consumed, and the gate is closed anyway.
	_, statErr := os.Stat(tokenPath)
	assert.True(t, os.IsNotExist(statErr), "the token must be consumed once it has produced an owner")
	replay := registerWith(ts, "replayer", token)
	require.Equal(t, http.StatusCreated, replay.Status)
	assert.Equal(t, []string{ownerID}, adminIDs(t, ts), "replaying the token cannot mint a second owner")
}

// auth-bootstrap-username-recovery: ADMIN_BOOTSTRAP_USERNAME remains the
// documented recovery path — and it must produce a USABLE admin, not merely a
// roled one. The gated + banned cases are the ones that used to leave the
// rescued account unable to obtain a token at all.
func TestBootstrapUsernameStillGrantsAdmin(t *testing.T) {
	testkit.Cover(t, "auth-bootstrap-username-recovery")
	ts := testutil.NewFreshDeploy(t, func(c *config.Config) { c.AdminBootstrapUsername = "rescuer" })

	ts.Register("founder")            // takes ownership
	rescuer := ts.Register("rescuer") // an ordinary player until bootstrap runs

	r := ts.Do(http.MethodGet, "/api/v1/admin/accounts", rescuer.Access, nil)
	require.Equal(t, http.StatusForbidden, r.Status, "precondition: not admin yet")

	// This is what server boot calls.
	require.NoError(t, ts.Srv.Admin.EnsureBootstrapAdmin(context.Background()))

	r = ts.Do(http.MethodGet, "/api/v1/admin/accounts", rescuer.Access, nil)
	assert.Equal(t, http.StatusOK, r.Status, "ADMIN_BOOTSTRAP_USERNAME must still grant the admin role")
	assert.Equal(t, []string{account.RoleAdmin}, loadAccount(t, ts, rescuer.ID).Roles)

	// Idempotent, and it does not disturb the owner.
	require.NoError(t, ts.Srv.Admin.EnsureBootstrapAdmin(context.Background()))
	assert.Len(t, adminIDs(t, ts), 2, "the owner and the rescued account, no duplicates")
}

// auth-bootstrap-recovery-usable: the recovery path must UNBLOCK the account it
// rescues. Granting the role alone was inert under the #126 approval gate (the
// rescued account stays pending and login 403s with nobody able to approve it)
// and inert against a ban (a squatter-admin can ban the operator). Both are the
// terminal, zero-usable-admin state this whole feature exists to avoid.
func TestBootstrapRecoveryProducesAUsableAdmin(t *testing.T) {
	testkit.Cover(t, "auth-bootstrap-recovery-usable")
	t.Setenv("GGD_REQUIRE_APPROVAL", "1")
	ts := testutil.NewFreshDeploy(t, func(c *config.Config) { c.AdminBootstrapUsername = "rescuer" })

	// A squatter wins the claim, then bans the operator's pending account.
	squatter := registerRaw(ts, "squatter")
	require.Equal(t, http.StatusCreated, squatter.Status)
	squatterToken := squatter.Body["tokens"].(map[string]any)["accessToken"].(string)

	rescue := registerRaw(ts, "rescuer")
	require.Equal(t, http.StatusCreated, rescue.Status)
	rescuerID := rescue.Body["account"].(map[string]any)["id"].(string)
	assert.Equal(t, account.StatusPending, rescue.Body["account"].(map[string]any)["status"])

	ban := ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+rescuerID+"/ban", squatterToken,
		map[string]string{"reason": "nope"})
	require.Equal(t, http.StatusOK, ban.Status, string(ban.Raw))

	// The operator sets ADMIN_BOOTSTRAP_USERNAME and restarts.
	require.NoError(t, ts.Srv.Admin.EnsureBootstrapAdmin(context.Background()))

	stored := loadAccount(t, ts, rescuerID)
	assert.True(t, stored.HasRole(account.RoleAdmin))
	assert.Equal(t, account.StatusApproved, stored.Status, "a pending admin can never be approved by anyone")
	assert.False(t, stored.Banned, "a banned admin can never sign in")

	login := ts.Do(http.MethodPost, "/api/v1/auth/login", "",
		map[string]string{"username": "rescuer", "password": "correct-horse-rescuer"})
	require.Equal(t, http.StatusOK, login.Status, "the rescued admin must actually be able to log in: %s", string(login.Raw))
	access := login.Body["tokens"].(map[string]any)["accessToken"].(string)

	console := ts.Do(http.MethodGet, "/api/v1/admin/accounts", access, nil)
	assert.Equal(t, http.StatusOK, console.Status, string(console.Raw))
}

// auth-admin-role-revoke: a wrong first-owner grant must be fixable in the
// product. The rescued admin can strip the squatter's role, the demoted account
// loses console access immediately, and the platform refuses to let the last
// usable admin remove itself.
func TestAdminRoleGrantAndRevoke(t *testing.T) {
	testkit.Cover(t, "auth-admin-role-revoke")
	ts := testutil.NewFreshDeploy(t, func(c *config.Config) { c.AdminBootstrapUsername = "operator" })

	squatter := ts.Register("squatter")
	operator := ts.Register("operator")
	require.NoError(t, ts.Srv.Admin.EnsureBootstrapAdmin(context.Background()))

	revoke := ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+squatter.ID+"/role", operator.Access,
		map[string]any{"role": account.RoleAdmin, "grant": false})
	require.Equal(t, http.StatusOK, revoke.Status, string(revoke.Raw))
	assert.Empty(t, loadAccount(t, ts, squatter.ID).Roles)
	assert.Equal(t, []string{operator.ID}, adminIDs(t, ts))

	// The demoted account is locked out on its very next request.
	gone := ts.Do(http.MethodGet, "/api/v1/admin/accounts", squatter.Access, nil)
	assert.Equal(t, http.StatusForbidden, gone.Status)

	// And the platform will not let itself be left with no administrator.
	suicide := ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+operator.ID+"/role", operator.Access,
		map[string]any{"role": account.RoleAdmin, "grant": false})
	assert.Equal(t, http.StatusConflict, suicide.Status, string(suicide.Raw))
	assert.Equal(t, "last_admin", suicide.ErrCode())
	assert.Equal(t, []string{operator.ID}, adminIDs(t, ts), "the last admin survives")

	// Granting works too, and re-opens the revoke.
	grant := ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+squatter.ID+"/role", operator.Access,
		map[string]any{"role": account.RoleAdmin, "grant": true})
	require.Equal(t, http.StatusOK, grant.Status, string(grant.Raw))
	assert.Len(t, adminIDs(t, ts), 2)
}

// gateScript scripts the durable-gate read claimOwnership performs (GH#1006).
// Each call pops the next step; once the script is spent it falls through to
// the real store, so registrations after the replayed interleaving behave
// exactly as shipped.
type gateScript struct {
	mu    sync.Mutex
	steps []func() ([]string, error)
	real  func(context.Context) ([]string, error)
	calls int
}

func (g *gateScript) read(ctx context.Context) ([]string, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.calls++
	if len(g.steps) == 0 {
		return g.real(ctx)
	}
	step := g.steps[0]
	g.steps = g.steps[1:]
	return step()
}

func (g *gateScript) count() int { g.mu.Lock(); defer g.mu.Unlock(); return g.calls }

// auth-first-owner-claim-recheck (GH#1006): the #979 interleaving, replayed
// deterministically. Two first registrations both read "no admin" BEFORE the
// claim; A wins, writes the owner, releases; B then takes the claim. The only
// thing between B and a SECOND admin is a re-read of the durable gate AFTER the
// claim is held. TestConcurrentFirstRegistrationsProduceOneOwner above needs
// the scheduler to produce that order (60 local runs never did; CI did), so
// this scripts the gate instead: read 1 (pre-claim) sees nobody, read 2
// (post-claim) sees the winner — or cannot read at all, which must fail closed
// — and the registrant must NOT be promoted. Mutation: drop the post-claim
// re-read in claimOwnership ⇒ both cases red (the registrant becomes admin).
func TestClaimRechecksDurableGateAfterTakingTheClaim(t *testing.T) {
	testkit.Cover(t, "auth-first-owner-claim-recheck")
	cases := []struct {
		name   string
		reread func() ([]string, error)
	}{
		{"the post-claim re-read sees the winner", func() ([]string, error) {
			return []string{"winner-written-while-we-waited-for-the-claim"}, nil
		}},
		{"the post-claim re-read fails (fail closed)", func() ([]string, error) {
			return nil, errors.New("account store unreadable")
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			g := &gateScript{steps: []func() ([]string, error){
				func() ([]string, error) { return []string{}, nil }, // pre-claim: ownerless
				tc.reread, // post-claim: the world moved while we waited
			}}
			ts := testutil.NewFreshDeployWith(t, func(srv *server.Server) {
				g.real = srv.Accounts.Admins
				auth.ScriptAdminsGate(srv.Auth, g.read)
			})

			r := registerRaw(ts, "latecomer")
			require.Equal(t, http.StatusCreated, r.Status, "declining the grant must never fail the registration: %s", string(r.Raw))
			acc := r.Body["account"].(map[string]any)
			assert.Equal(t, 2, g.count(), "the durable gate must be read AGAIN after the claim is taken")
			assert.Nil(t, acc["roles"], "a registrant whose post-claim re-read sees an admin (or cannot read) must not be promoted")
			assert.Empty(t, loadAccount(t, ts, acc["id"].(string)).Roles)
			assert.False(t, ts.Mini.Exists(redisx.KeyBootstrapOwner()),
				"a declined claim must be released, not left to block the next registrant for the TTL")

			// Declining cost nothing permanent: the script is spent, the real store
			// holds no admin, so the very next registration takes ownership.
			next := ts.Register("founder")
			assert.Equal(t, []string{account.RoleAdmin}, loadAccount(t, ts, next.ID).Roles)
		})
	}
}

// auth-first-owner-seam-test-only (GH#1006, its known risk): the scripted gate
// is a seam on a privilege path, so a shipped binary must have no way to open
// it. Its only setter is bootstrap_export_test.go, which `go build` never
// compiles; this reads the package's NON-test sources and fails if any of them
// assigns the field. Calibrated in both directions: it must also SEE the
// declaration, so a rename cannot turn it into a scan of nothing.
func TestOwnerBootstrapSeamIsTestOnly(t *testing.T) {
	testkit.Cover(t, "auth-first-owner-seam-test-only")
	const seam = "adminsGate"
	entries, err := os.ReadDir(".")
	require.NoError(t, err)
	fset := token.NewFileSet()
	declared, assigned := false, []string{}
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".go") || strings.HasSuffix(e.Name(), "_test.go") {
			continue
		}
		f, err := parser.ParseFile(fset, e.Name(), nil, 0)
		require.NoError(t, err)
		ast.Inspect(f, func(n ast.Node) bool {
			switch x := n.(type) {
			case *ast.Field:
				for _, id := range x.Names {
					declared = declared || id.Name == seam
				}
			case *ast.AssignStmt:
				for _, lhs := range x.Lhs {
					if sel, ok := lhs.(*ast.SelectorExpr); ok && sel.Sel.Name == seam {
						assigned = append(assigned, fset.Position(sel.Pos()).String())
					}
				}
			case *ast.KeyValueExpr:
				if id, ok := x.Key.(*ast.Ident); ok && id.Name == seam {
					assigned = append(assigned, fset.Position(id.Pos()).String())
				}
			}
			return true
		})
	}
	require.True(t, declared, "calibration: the seam field %q must be visible to this scan", seam)
	assert.Empty(t, assigned, "shipped (non-test) code must never set the owner-gate seam")
}
