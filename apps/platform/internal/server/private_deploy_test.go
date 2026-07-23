// private_deploy_test.go covers the #126 private-deploy gate and go-live
// hardening: registration → pending → admin-approved before play, plus HSTS, an
// explicit request-body cap, a registration throttle and a boot-time guard that
// refuses to start on a missing required secret.
package server_test

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/config"
	"github.com/ggd/platform/internal/server"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// registerRaw posts a registration without the token assertions ts.Register
// makes (a gated deploy hands back an empty token pair), returning the response.
func registerRaw(ts *testutil.TS, name string) testutil.Resp {
	return ts.Do(http.MethodPost, "/api/v1/auth/register", "", map[string]string{
		"username": name, "email": name + "@example.com", "password": "correct-horse-" + name,
	})
}

func loginRaw(ts *testutil.TS, name string) testutil.Resp {
	return ts.Do(http.MethodPost, "/api/v1/auth/login", "", map[string]string{
		"username": name, "password": "correct-horse-" + name,
	})
}

// sec-infra-approval-gate: a gated deploy stamps new accounts pending, refuses
// their login, and an admin approve/deny flips whether they can play.
func TestPrivateDeployApprovalGate(t *testing.T) {
	testkit.Cover(t, "sec-infra-approval-gate")
	t.Setenv("GGD_REQUIRE_APPROVAL", "1")
	ts := testutil.New(t)

	// The admin registers pending too (chicken-and-egg): promote + approve it
	// out of band, exactly as an operator seeds the first admin on a real deploy.
	boss := registerRaw(ts, "boss")
	require.Equal(t, http.StatusCreated, boss.Status, string(boss.Raw))
	bossAcc := boss.Body["account"].(map[string]any)
	require.Equal(t, account.StatusPending, bossAcc["status"], "new account must be pending")
	bossTokens := boss.Body["tokens"].(map[string]any)
	require.Empty(t, bossTokens["accessToken"], "a pending account gets no session token")
	bossID := bossAcc["id"].(string)
	grantAdminRole(t, ts, bossID)
	_, err := ts.Srv.Accounts.SetStatus(context.Background(), bossID, account.StatusApproved)
	require.NoError(t, err)

	bossLogin := loginRaw(ts, "boss")
	require.Equal(t, http.StatusOK, bossLogin.Status, string(bossLogin.Raw))
	bossAccess := bossLogin.Body["tokens"].(map[string]any)["accessToken"].(string)

	// A fresh player is pending and cannot log in to play.
	friend := registerRaw(ts, "friend")
	require.Equal(t, http.StatusCreated, friend.Status)
	friendID := friend.Body["account"].(map[string]any)["id"].(string)

	blocked := loginRaw(ts, "friend")
	assert.Equal(t, http.StatusForbidden, blocked.Status, string(blocked.Raw))
	assert.Equal(t, "account_pending", blocked.ErrCode())

	// Admin approval flips it to playable.
	appr := ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+friendID+"/approve", bossAccess, nil)
	require.Equal(t, http.StatusOK, appr.Status, string(appr.Raw))
	assert.Equal(t, account.StatusApproved, appr.Body["account"].(map[string]any)["status"])

	nowIn := loginRaw(ts, "friend")
	require.Equal(t, http.StatusOK, nowIn.Status, string(nowIn.Raw))
	require.NotEmpty(t, nowIn.Body["tokens"].(map[string]any)["accessToken"], "approved account can now play")

	// Deny is terminal and distinguishable from pending.
	rando := registerRaw(ts, "rando")
	randoID := rando.Body["account"].(map[string]any)["id"].(string)
	deny := ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+randoID+"/deny", bossAccess, nil)
	require.Equal(t, http.StatusOK, deny.Status, string(deny.Raw))
	denied := loginRaw(ts, "rando")
	assert.Equal(t, http.StatusForbidden, denied.Status)
	assert.Equal(t, "account_denied", denied.ErrCode())
}

// sec-infra-approval-requires-admin: the approval routes are AdminOnly — a
// normal (non-admin) token cannot approve anyone.
func TestApprovalRoutesAreAdminOnly(t *testing.T) {
	testkit.Cover(t, "sec-infra-approval-requires-admin")
	ts := testutil.New(t) // gate OFF: these accounts are approved, tokens issued
	nonAdmin := ts.Register("plebeian")
	target := ts.Register("victim")

	r := ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+target.ID+"/approve", nonAdmin.Access, nil)
	assert.Equal(t, http.StatusForbidden, r.Status, string(r.Raw))
	assert.Equal(t, "admin_required", r.ErrCode())

	// Unauthenticated is a 401, never a silent pass.
	r = ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+target.ID+"/approve", "", nil)
	assert.Equal(t, http.StatusUnauthorized, r.Status)
}

// sec-infra-boot-secret: server.New refuses to boot when a required secret is
// unset, so no weak/empty default ever reaches a live listener.
func TestBootFailsOnMissingSecret(t *testing.T) {
	testkit.Cover(t, "sec-infra-boot-secret")

	_, err := server.New(config.Config{GameSharedSecret: "x"}, server.Options{})
	require.Error(t, err, "empty JWT_SIGNING_SECRET must fail boot")
	assert.Contains(t, err.Error(), "JWT_SIGNING_SECRET")

	_, err = server.New(config.Config{JWTSecret: "x"}, server.Options{})
	require.Error(t, err, "empty PLATFORM_GAME_SHARED_SECRET must fail boot")
	assert.Contains(t, err.Error(), "PLATFORM_GAME_SHARED_SECRET")
}

// sec-infra-edge-headers: every response carries HSTS, and an oversized request
// body is rejected rather than buffered.
func TestHardeningHeadersAndBodyCap(t *testing.T) {
	testkit.Cover(t, "sec-infra-edge-headers")
	ts := testutil.New(t)

	resp, err := ts.HTTP.Client().Get(ts.HTTP.URL + "/api/v1/healthz")
	require.NoError(t, err)
	resp.Body.Close()
	assert.NotEmpty(t, resp.Header.Get("Strict-Transport-Security"), "HSTS must be set on every response")

	// A body past the 1 MiB cap is rejected (413 from the cap, or 400 when the
	// JSON decoder hits the capped reader first) — never processed as 2xx.
	big := bytes.Repeat([]byte("a"), 2<<20)
	req, err := http.NewRequest(http.MethodPost, ts.HTTP.URL+"/api/v1/auth/register", bytes.NewReader(big))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	over, err := ts.HTTP.Client().Do(req)
	require.NoError(t, err)
	over.Body.Close()
	assert.Contains(t, []int{http.StatusRequestEntityTooLarge, http.StatusBadRequest}, over.StatusCode,
		"oversized body must be rejected, got %d", over.StatusCode)
}

// sec-infra-register-throttle: the app-layer global registration cap trips
// after N attempts (belt-and-suspenders to the edge's per-IP register limit).
func TestRegisterRateLimit(t *testing.T) {
	testkit.Cover(t, "sec-infra-register-throttle")
	t.Setenv("GGD_REGISTER_RATE_LIMIT", "3")
	ts := testutil.New(t)

	limited := false
	var last testutil.Resp
	for i := 0; i < 6; i++ {
		last = registerRaw(ts, fmt.Sprintf("flood%d", i))
		if last.Status == http.StatusTooManyRequests {
			limited = true
			break
		}
	}
	require.True(t, limited, "registration throttle must trip after the configured cap")
	assert.Equal(t, "rate_limited", last.ErrCode())
}
