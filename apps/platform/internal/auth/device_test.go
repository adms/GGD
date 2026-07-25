package auth_test

import (
	"context"
	"net/http"
	"regexp"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// deviceStart POSTs /auth/device/start (unauth) and returns the decoded grant.
func deviceStart(t *testing.T, ts *testutil.TS) map[string]any {
	t.Helper()
	r := ts.Do(http.MethodPost, "/api/v1/auth/device/start", "", map[string]any{})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	return r.Body
}

// devicePoll POSTs /auth/device/poll (unauth) with a device code.
func devicePoll(t *testing.T, ts *testutil.TS, deviceCode string) testutil.Resp {
	t.Helper()
	return ts.Do(http.MethodPost, "/api/v1/auth/device/poll", "", map[string]string{"deviceCode": deviceCode})
}

// deviceApprove POSTs /auth/device/approve as an authenticated phone.
func deviceApprove(t *testing.T, ts *testutil.TS, token, userCode, decision string) testutil.Resp {
	t.Helper()
	return ts.Do(http.MethodPost, "/api/v1/auth/device/approve", token,
		map[string]string{"userCode": userCode, "decision": decision})
}

// TestDevicePollStateMachine walks the whole grant lifecycle: pending →
// approved (+ real tokens) on approve, and denied on deny.
func TestDevicePollStateMachine(t *testing.T) {
	testkit.Cover(t, "auth-device-poll-state-machine")
	ts := testutil.New(t)
	phone := ts.Register("phoneowner")

	// APPROVE path.
	g := deviceStart(t, ts)
	deviceCode := g["deviceCode"].(string)
	userCode := g["userCode"].(string)

	pend := devicePoll(t, ts, deviceCode)
	require.Equal(t, http.StatusOK, pend.Status)
	require.Equal(t, "authorization_pending", pend.Body["status"])

	ap := deviceApprove(t, ts, phone.Access, userCode, "approve")
	require.Equal(t, http.StatusOK, ap.Status, string(ap.Raw))
	require.Equal(t, true, ap.Body["ok"])

	ok := devicePoll(t, ts, deviceCode)
	require.Equal(t, http.StatusOK, ok.Status, string(ok.Raw))
	require.Equal(t, "approved", ok.Body["status"])
	toks := ok.Body["tokens"].(map[string]any)
	require.NotEmpty(t, toks["accessToken"])
	require.NotEmpty(t, toks["refreshToken"])
	acc := ok.Body["account"].(map[string]any)
	require.Equal(t, phone.ID, acc["id"], "the granted session is the phone's own account")

	// The granted access token is a REAL session: /me works with it.
	me := ts.Do(http.MethodGet, "/api/v1/me", toks["accessToken"].(string), nil)
	require.Equal(t, http.StatusOK, me.Status, string(me.Raw))
	require.Equal(t, phone.ID, me.Body["account"].(map[string]any)["id"])

	// DENY path (fresh grant).
	g2 := deviceStart(t, ts)
	dc2 := g2["deviceCode"].(string)
	den := deviceApprove(t, ts, phone.Access, g2["userCode"].(string), "deny")
	require.Equal(t, http.StatusOK, den.Status, string(den.Raw))
	p2 := devicePoll(t, ts, dc2)
	require.Equal(t, "denied", p2.Body["status"])
}

// TestDeviceUnknownCodeIsExpired proves an unknown device code is
// indistinguishable from an expired one (no live-but-unknown oracle).
func TestDeviceUnknownCodeIsExpired(t *testing.T) {
	testkit.Cover(t, "auth-device-unknown-expired")
	ts := testutil.New(t)
	p := devicePoll(t, ts, "deadbeef00000000000000000000000000000000000000000000000000000000")
	require.Equal(t, http.StatusOK, p.Status)
	require.Equal(t, "expired", p.Body["status"])
}

// TestDeviceExpiryHonored fast-forwards miniredis past the grant TTL and asserts
// the poll returns expired.
func TestDeviceExpiryHonored(t *testing.T) {
	testkit.Cover(t, "auth-device-ttl-expiry")
	ts := testutil.New(t)
	g := deviceStart(t, ts)
	// The grant TTL is 300s; jump the fake clock past it.
	ts.Mini.FastForward(301e9) // 301s in nanoseconds (time.Duration)
	p := devicePoll(t, ts, g["deviceCode"].(string))
	require.Equal(t, "expired", p.Body["status"])
}

// TestDeviceSingleUse fires two concurrent polls at one approved grant: exactly
// one receives tokens, the other gets expired; a third poll after consume is
// also expired.
func TestDeviceSingleUse(t *testing.T) {
	testkit.Cover(t, "auth-device-single-use")
	ts := testutil.New(t)
	phone := ts.Register("singleuse")
	g := deviceStart(t, ts)
	deviceCode := g["deviceCode"].(string)
	require.Equal(t, http.StatusOK,
		deviceApprove(t, ts, phone.Access, g["userCode"].(string), "approve").Status)

	var wg sync.WaitGroup
	results := make([]testutil.Resp, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			results[idx] = devicePoll(t, ts, deviceCode)
		}(i)
	}
	wg.Wait()

	approved, expired := 0, 0
	for _, r := range results {
		switch r.Body["status"] {
		case "approved":
			approved++
			require.NotEmpty(t, r.Body["tokens"].(map[string]any)["accessToken"])
		case "expired":
			expired++
		}
	}
	require.Equal(t, 1, approved, "exactly one poll may consume the approval")
	require.Equal(t, 1, expired, "the other concurrent poll must lose the race")

	// A third poll after consume is expired.
	require.Equal(t, "expired", devicePoll(t, ts, deviceCode).Body["status"])
}

// TestDeviceQRContainsNoSecret is the load-bearing security assertion: the QR
// payload is the verification URL + the short public user-code and nothing else
// — no device code, no access token, no refresh token.
func TestDeviceQRContainsNoSecret(t *testing.T) {
	testkit.Cover(t, "auth-device-qr-no-token")
	ts := testutil.New(t)
	g := deviceStart(t, ts)

	qr := g["verificationUriComplete"].(string)
	// Exactly "https://host/path?code=XXXX-XXXX" — a URL plus a 9-char grouped
	// code, no query junk that could smuggle a token.
	require.Regexp(t, regexp.MustCompile(`^https://[^?]+\?code=[A-Z0-9-]{9}$`), qr)

	// The secret device code and the two token kinds must NOT appear in the QR.
	deviceCode := g["deviceCode"].(string)
	require.NotContains(t, qr, deviceCode, "the QR must not carry the secret device code")
	require.NotContains(t, qr, "accessToken")
	require.NotContains(t, qr, "refreshToken")
	require.NotContains(t, qr, "eyJ", "no JWT (base64url header prefix) in the QR")

	// The user-code inside the QR is exactly the public code — a claim ticket,
	// not a secret.
	require.Contains(t, qr, "code="+g["userCode"].(string))
}

// TestDeviceApproveRequiresAuth is the CSRF/trust-anchor guarantee: approve
// without a bearer token is 401, so a cross-site page (which cannot attach the
// bearer) can never approve.
func TestDeviceApproveRequiresAuth(t *testing.T) {
	testkit.Cover(t, "auth-device-approve-requires-auth")
	ts := testutil.New(t)
	g := deviceStart(t, ts)
	r := deviceApprove(t, ts, "", g["userCode"].(string), "approve")
	require.Equal(t, http.StatusUnauthorized, r.Status, string(r.Raw))
	// And the grant is still pending — the unauthenticated call changed nothing.
	require.Equal(t, "authorization_pending", devicePoll(t, ts, g["deviceCode"].(string)).Body["status"])
}

// TestDeviceApproveUnknownCode returns a 404 that does not leak whether a code
// was live-but-unknown vs never-existed.
func TestDeviceApproveUnknownCode(t *testing.T) {
	testkit.Cover(t, "auth-device-approve-unknown")
	ts := testutil.New(t)
	phone := ts.Register("unknownapprover")
	r := deviceApprove(t, ts, phone.Access, "ZZZZ-ZZZZ", "approve")
	require.Equal(t, http.StatusNotFound, r.Status, string(r.Raw))
}

// TestDeviceDoubleApprove proves the CAS: a second approve of a still-pending
// grant is refused, so an approve cannot race a second approve or a re-approve.
func TestDeviceDoubleApprove(t *testing.T) {
	testkit.Cover(t, "auth-device-double-approve")
	ts := testutil.New(t)
	phone := ts.Register("doubleapprove")
	g := deviceStart(t, ts)
	userCode := g["userCode"].(string)

	require.Equal(t, http.StatusOK, deviceApprove(t, ts, phone.Access, userCode, "approve").Status)
	// Second approve: the grant is no longer pending → unknown/expired 404.
	require.Equal(t, http.StatusNotFound, deviceApprove(t, ts, phone.Access, userCode, "approve").Status)
}

// TestDeviceGateIntegrity proves device login CANNOT hand a session to an
// account that has lost the right to play. The phone approves while approved,
// but an admin denies the account BEFORE the handheld polls; the poll must run
// the same AuthorizePlay guard a login would and refuse — no tokens for a
// non-approved account, ever.
func TestDeviceGateIntegrity(t *testing.T) {
	testkit.Cover(t, "auth-device-gate-integrity")
	ts := testutil.New(t)
	phone := ts.Register("gatetest")
	g := deviceStart(t, ts)
	deviceCode := g["deviceCode"].(string)
	require.Equal(t, http.StatusOK,
		deviceApprove(t, ts, phone.Access, g["userCode"].(string), "approve").Status)

	// The approval landed, but between /start and the poll the account is denied.
	_, err := ts.Srv.Accounts.SetStatus(context.Background(), phone.ID, account.StatusDenied)
	require.NoError(t, err)

	// The poll consumes the approval but the gate refuses to mint a session.
	r := devicePoll(t, ts, deviceCode)
	require.Equal(t, http.StatusForbidden, r.Status, string(r.Raw))
	require.Equal(t, "account_denied", r.ErrCode())
	require.Nil(t, r.Body["tokens"], "a denied account must receive no tokens")
}

// TestDevicePollRateLimit hammers /poll faster than the interval and asserts a
// slow_down eventually appears with a backoff interval.
func TestDevicePollRateLimit(t *testing.T) {
	testkit.Cover(t, "auth-device-poll-rate-limit")
	ts := testutil.New(t)
	g := deviceStart(t, ts)
	deviceCode := g["deviceCode"].(string)

	sawSlowDown := false
	for i := 0; i < 12; i++ {
		r := devicePoll(t, ts, deviceCode)
		require.Equal(t, http.StatusOK, r.Status)
		if r.Body["status"] == "slow_down" {
			sawSlowDown = true
			require.EqualValues(t, 10, r.Body["pollInterval"], "slow_down must tell the client to back off")
			break
		}
	}
	require.True(t, sawSlowDown, "rapid polling must trip slow_down")
}

// TestDeviceStartRateLimit floods /start from one IP (miniredis shares the
// bucket since the test client's RemoteAddr is stable) and asserts a 429.
func TestDeviceStartRateLimit(t *testing.T) {
	testkit.Cover(t, "auth-device-start-rate-limit")
	ts := testutil.New(t)
	throttled := false
	for i := 0; i < 12; i++ {
		r := ts.Do(http.MethodPost, "/api/v1/auth/device/start", "", map[string]any{})
		if r.Status == http.StatusTooManyRequests {
			throttled = true
			break
		}
	}
	require.True(t, throttled, "flooding /auth/device/start from one IP must be throttled")
}

// TestDeviceApproveSprayLockout throttles an authenticated phone spraying
// user-codes: after the lockout limit, its approves are refused even for a code
// it would otherwise be able to decide.
func TestDeviceApproveSprayLockout(t *testing.T) {
	testkit.Cover(t, "auth-device-approve-lockout")
	ts := testutil.New(t)
	phone := ts.Register("sprayer")
	// Burn the approve budget on wrong guesses.
	for i := 0; i < 11; i++ {
		deviceApprove(t, ts, phone.Access, "AAAA-BBBB", "approve")
	}
	// A now-genuine grant still cannot be approved by this locked-out account.
	g := deviceStart(t, ts)
	r := deviceApprove(t, ts, phone.Access, g["userCode"].(string), "approve")
	require.Equal(t, http.StatusNotFound, r.Status, "a sprayed account is locked out")
}
