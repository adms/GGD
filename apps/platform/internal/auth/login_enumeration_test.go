package auth_test

// GH#179, the neighbour nobody checked.
//
// docs/_security-audit.md F-18 dismisses /auth/login in one line — "Login is a
// separate question and is fine: unknown user pays the same argon2 against
// dummyHash and returns the identical invalid credentials body". Half of that
// sentence had a guard and half of it did not.
//
//   - The BODY half is guarded by TestLoginConstantShape (auth_test.go) — but
//     only for the unknown-vs-wrong-password pair, which is the ONLY pair a
//     deploy without the #126 approval gate has. See the second test below for
//     the pairs the family deploy actually has, which were unguarded.
//   - The ARGON2 half was guarded by NOTHING. Measured 2026-07-30: delete the
//     `argon2id.ComparePasswordAndHash(password, s.dummyHash)` line on the
//     account.ErrNotFound branch of Service.Login — removing the equalisation
//     outright — and `go test ./internal/auth/...` stays entirely GREEN.
//     TestLoginConstantShape cannot see it, and says so in its own doc comment:
//     "Wall-clock timing is not asserted".
//
// That is failure form ③: the implementation can be deleted, the feature is
// gone, and the suite is still green. The dummy hash exists for exactly one
// reason — an unknown username must not come back faster than a real one — and
// "it is in the source" is not evidence that it runs.
//
// This file adds the missing half, in the shape that is already proven to have
// teeth on the registration side (TestRegisterConflictPaysTheHash): measure the
// harness's own resolution first, then assert against that margin, so a green
// result cannot come from a stopwatch too coarse to see the thing.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"testing"
	"time"

	"github.com/alexedwards/argon2id"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/config"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

const loginPath = "/api/v1/auth/login"

// loginFrom posts one login from its OWN source address, because Service.Login
// is per-IP rate limited (loginRateLimit = 10/minute) and a census of a dozen
// probes off one address would turn most of them into a 429 that never reaches
// the credential path — the test would then be measuring the rate limiter.
// httpx.ClientIP honours X-Real-Ip, which is how the real deploy learns the
// caller behind nginx.
func loginFrom(t *testing.T, ts *testutil.TS, seq int, username, password string) testutil.Resp {
	t.Helper()
	data, err := json.Marshal(map[string]string{"username": username, "password": password})
	require.NoError(t, err)
	req, err := http.NewRequest(http.MethodPost, ts.HTTP.URL+loginPath, bytes.NewReader(data))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Real-Ip", fmt.Sprintf("198.51.100.%d", seq%250+1))

	resp, err := ts.HTTP.Client().Do(req)
	require.NoError(t, err)
	raw, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	_ = resp.Body.Close()
	out := testutil.Resp{Status: resp.StatusCode, Raw: raw}
	_ = json.Unmarshal(raw, &out.Body)
	return out
}

// TestLoginUnknownUserPaysTheHash pins the timing half of the login
// anti-enumeration property: a login for an account that DOES NOT EXIST must
// burn the same argon2id work as one for an account that does, so a stopwatch
// cannot answer "is this person registered?" that the response body refuses to.
//
// WHY IT IS NOT A FAKE GUARD. A bare lower bound on a latency is satisfiable by
// any unrelated slow step, so the test measures its own floor first: `noHash`
// times a request rejected by the JSON decoder, which never enters
// Service.Login and therefore never hashes. If that floor is not comfortably
// below one argon2id, the harness cannot resolve the quantity being asserted
// and the test FAILS AS INCONCLUSIVE rather than passing for free.
//
// MUTATION that must make it red: delete
// `argon2id.ComparePasswordAndHash(password, s.dummyHash)` from the
// account.ErrNotFound branch of Service.Login. Verified 2026-07-30 — before
// this test existed that deletion was invisible to the whole package.
func TestLoginUnknownUserPaysTheHash(t *testing.T) {
	testkit.Cover(t, "auth-login-unknown-user-pays-argon2")
	if testing.Short() {
		t.Skip("timing measurement")
	}
	ts := testutil.New(t)
	ts.Register("frank") // frank / frank@example.com

	// The unit: one argon2id at exactly the parameters this deploy hashes with,
	// read from the same params the service was built with so that raising the
	// cost cannot silently rescale the guard.
	hashCost := medianOf(t, 7, func(int) time.Duration {
		start := time.Now()
		_, err := argon2id.CreateHash("timing-probe-password", testutil.LightArgon2)
		require.NoError(t, err)
		return time.Since(start)
	})

	// Each probe arrives from its OWN source address. Service.Login is per-IP
	// rate limited (loginRateLimit = 10 / minute) and this test needs 45
	// requests, so sharing one IP would turn most samples into a 429 that never
	// reaches the credential path — the test would then be timing the rate
	// limiter and calling it argon2. httpx.ClientIP honours X-Real-Ip, which is
	// how the real deploy learns the caller behind nginx.
	const samples = 15
	probeSeq := 0
	post := func(body any, wantStatus int) time.Duration {
		probeSeq++
		var rd io.Reader
		if body != nil {
			data, err := json.Marshal(body)
			require.NoError(t, err)
			rd = bytes.NewReader(data)
		}
		req, err := http.NewRequest(http.MethodPost, ts.HTTP.URL+loginPath, rd)
		require.NoError(t, err)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Real-Ip", fmt.Sprintf("203.0.113.%d", probeSeq%250+1))

		start := time.Now()
		resp, err := ts.HTTP.Client().Do(req)
		require.NoError(t, err)
		raw, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		_ = resp.Body.Close()
		d := time.Since(start)
		require.Equal(t, wantStatus, resp.StatusCode, string(raw))
		return d
	}

	// A JSON string where the handler wants an object: httpx.DecodeJSON refuses
	// it and Service.Login is never called, so this is the cost of the transport
	// and nothing else.
	noHashProbe := func(int) time.Duration {
		return post("not-a-login-object", http.StatusBadRequest)
	}
	unknownProbe := func(i int) time.Duration {
		return post(map[string]string{
			"username": fmt.Sprintf("no-such-person-%d", i),
			"password": "some-password-123",
		}, http.StatusUnauthorized)
	}
	wrongPwProbe := func(int) time.Duration {
		return post(map[string]string{
			"username": "frank", // exists
			"password": "not-franks-password",
		}, http.StatusUnauthorized)
	}

	// Interleaved and order-balanced, for the same reason the registration
	// timing test is: a machine that gets busy halfway through must skew every
	// series equally instead of manufacturing a difference between them, and
	// position within an iteration is itself worth a measurable offset.
	noHash := make([]time.Duration, 0, samples)
	unknown := make([]time.Duration, 0, samples)
	wrongPw := make([]time.Duration, 0, samples)
	for i := range samples {
		noHash = append(noHash, noHashProbe(i))
		if i%2 == 0 {
			unknown = append(unknown, unknownProbe(i))
			wrongPw = append(wrongPw, wrongPwProbe(i))
		} else {
			wrongPw = append(wrongPw, wrongPwProbe(i))
			unknown = append(unknown, unknownProbe(i))
		}
	}

	medNoHash, medUnknown, medWrongPw := median(noHash), median(unknown), median(wrongPw)
	t.Logf("one argon2id = %v | no-hash rejection = %v | unknown user = %v | wrong password = %v",
		hashCost, medNoHash, medUnknown, medWrongPw)

	// (0) Resolution check — refuse to conclude anything the harness cannot see.
	require.Less(t, medNoHash, hashCost/2,
		"inconclusive: the harness cannot resolve one argon2id (%v) against its own overhead (%v)",
		hashCost, medNoHash)

	// (1) THE ASSERTION THAT CATCHES THE DELETION. An unknown username must not
	// short-circuit to a 401 without hashing.
	floor := medNoHash + hashCost/2
	assert.Greater(t, medUnknown, floor,
		"an unknown username skips the argon2 work — its 401 comes back faster than a real account's, "+
			"which answers 'is this person registered?' in milliseconds")

	// (2) Sanity: the real-account path pays it too, so (1) is a statement about
	// equalisation and not just about login being slow in general.
	assert.Greater(t, medWrongPw, floor, "a wrong password against a REAL account skips the hash")

	// (3) And the two sit on top of each other. Half a hash is the tolerance
	// because half a hash is the smallest signal worth anything to an attacker.
	assert.Less(t, absDur(medUnknown-medWrongPw), hashCost/2,
		"whether the account exists is readable from the login response time")
}

// TestLoginRefusesTheSameWayWhateverTheAccountStatusIs pins the ORDERING inside
// Service.Login: the argon2 comparison must run BEFORE the ban check and before
// the #126 approval check.
//
// WHY THAT ORDERING IS THE WHOLE ANTI-ENUMERATION PROPERTY ON THIS DEPLOY. The
// family build runs GGD_REQUIRE_APPROVAL=1 (docker/compose.family.yaml), so
// EVERY account is `pending` from the moment it registers until the owner taps
// approve, and a denied or banned account keeps its status forever. Check the
// status first and /auth/login answers "does this person have an account here?"
// to anyone, with no password and no invite code:
//
//	POST {username:"victim", password:"anything"} -> 403 account_pending
//	POST {username:"nobody", password:"anything"} -> 401 invalid credentials
//
// That is the same oracle GH#179 is about, on the endpoint F-18 dismissed in
// one line as "a separate question, and is fine" — and it is a WORSE one than
// register's, because the #174 invite gate does not cover login at all.
//
// MEASURED 2026-07-30, BEFORE THIS TEST EXISTED: move the `a.Banned` and
// `!a.IsApproved()` blocks in Service.Login above the
// `argon2id.ComparePasswordAndHash(password, a.PasswordHash)` line — a
// completely natural "fail fast, skip the expensive hash" refactor — and
// `go test ./internal/auth/... ./internal/server/... ./internal/admin/...` stays
// ENTIRELY GREEN. The existing pending/denied/banned login tests
// (approval_compose_test.go, referral_chain_test.go, admin_test.go) all log in
// with the CORRECT password, so they observe the same 403 either way: failure
// form ④, an assertion pointed somewhere other than the defect.
//
// The test therefore asserts on the WRONG-password answers, which is where the
// ordering is observable, and carries the correct-password answers as positive
// controls so it cannot be satisfied by a service that has simply stopped
// enforcing the gates.
func TestLoginRefusesTheSameWayWhateverTheAccountStatusIs(t *testing.T) {
	testkit.Cover(t, "auth-login-status-not-an-oracle")
	ts := testutil.NewFreshDeploy(t, func(c *config.Config) { c.RequireApproval = true })

	owner := ts.Register("owner") // first account: admin + force-approved
	require.NotEmpty(t, owner.Access, "fixture: the owner must get a session")

	admin := func(path string, body any) {
		t.Helper()
		r := ts.Do(http.MethodPost, path, owner.Access, body)
		require.Equal(t, http.StatusOK, r.Status, "%s: %s", path, string(r.Raw))
	}

	// Four accounts, one per status the gates can produce.
	approved := ts.Register("approveduser")
	admin("/api/v1/admin/accounts/"+approved.ID+"/approve", nil)
	ts.Register("pendinguser") // left in the queue
	denied := ts.Register("denieduser")
	admin("/api/v1/admin/accounts/"+denied.ID+"/deny", nil)
	banned := ts.Register("banneduser")
	admin("/api/v1/admin/accounts/"+banned.ID+"/approve", nil)
	admin("/api/v1/admin/accounts/"+banned.ID+"/ban", map[string]any{"reason": "cheating"})

	// ---- the census: a WRONG password against each status ---------------------
	seq := 0
	probe := func(username string) testutil.Resp {
		seq++
		r := loginFrom(t, ts, seq, username, "definitely-not-the-password")
		t.Logf("wrong password, %-14s -> HTTP %d %s", username, r.Status, r.ErrCode())
		return r
	}
	census := map[string]testutil.Resp{
		"unknown account":  probe("nosuchperson"),
		"pending account":  probe("pendinguser"),
		"denied account":   probe("denieduser"),
		"banned account":   probe("banneduser"),
		"approved account": probe("approveduser"),
	}

	unknown := census["unknown account"]
	require.Equal(t, http.StatusUnauthorized, unknown.Status,
		"fixture: an unknown account must be 401, not %s", string(unknown.Raw))
	for name, r := range census {
		assert.Equal(t, http.StatusUnauthorized, r.Status,
			"%s: the status code alone says the account exists: %s", name, string(r.Raw))
		assert.Equal(t, string(unknown.Raw), string(r.Raw),
			"%s: distinguishable from an unknown account — that difference IS the oracle", name)
		assert.NotContains(t, []string{"account_pending", "account_denied", "account_banned"}, r.ErrCode(),
			"%s: the refusal names the account's status to a caller who never proved the password", name)
	}

	// ---- positive controls ----------------------------------------------------
	//
	// Without these the assertions above would also pass on a Login that had
	// simply stopped enforcing the ban and the approval gate, which is the
	// opposite failure and a far worse one.
	for _, tc := range []struct {
		name, username, password string
		wantStatus               int
		wantCode                 string
	}{
		{"pending, correct password", "pendinguser", "correct-horse-pendinguser", http.StatusForbidden, "account_pending"},
		{"denied, correct password", "denieduser", "correct-horse-denieduser", http.StatusForbidden, "account_denied"},
		{"banned, correct password", "banneduser", "correct-horse-banneduser", http.StatusForbidden, "account_banned"},
		{"approved, correct password", "approveduser", "correct-horse-approveduser", http.StatusOK, ""},
	} {
		seq++
		r := loginFrom(t, ts, seq, tc.username, tc.password)
		assert.Equal(t, tc.wantStatus, r.Status, "%s: %s", tc.name, string(r.Raw))
		assert.Equal(t, tc.wantCode, r.ErrCode(), "%s: %s", tc.name, string(r.Raw))
	}
}
