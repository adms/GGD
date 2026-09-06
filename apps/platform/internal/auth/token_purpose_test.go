package auth_test

// GH#180 — an access token must say what it is FOR, and be refused everywhere
// else.
//
// The scar: MintAccess stamped `iss` and VerifyAccess never read it, so the
// claim was decoration. Meanwhile #209 started HMAC-ing one-tap approve links
// with the SAME JWT_SIGNING_SECRET, which retired the assumption the access
// token rested on — "a valid MAC under this key means a session". These tests
// pin the replacement: the purpose is an explicit `aud` claim, both shipped
// verifiers require it AND the issuer, and the two uses of the shared secret
// cannot stand in for one another in either direction.
//
// Everything here forges with the deploy's REAL secret (testutil.JWTSecret) —
// a wrong-key forgery is already covered by TestForgedTokenRejected in
// auth_test.go and would prove nothing about purpose binding. The point is that
// a correctly-signed token is still refused when it was signed for another job.

import (
	"net/http"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/approvelink"
	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// approveTokenDomain is approvelink's HMAC domain string, duplicated here
// because it is unexported there. It is used ONLY as a realistic "some other
// purpose signed with the same secret" audience — the cross-package binding
// itself is checked behaviourally in TestApproveLinkAndAccessTokenAreNotInterchangeable,
// which drives the real Signer, so a rename over there fails that test rather
// than silently making this literal meaningless.
const approveTokenDomain = "ggd:approve:v1"

// forge signs claims with the deploy's real JWT secret and the real algorithm.
func forge(t *testing.T, claims jwt.MapClaims) string {
	t.Helper()
	tok, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(testutil.JWTSecret))
	require.NoError(t, err)
	return tok
}

// baseClaims is a token that is valid in every respect except the field the
// caller overrides — so a rejection can only be attributed to that field.
func baseClaims(accountID, username string) jwt.MapClaims {
	now := time.Now()
	return jwt.MapClaims{
		"sub":      accountID,
		"username": username,
		"iss":      auth.TokenIssuer,
		"aud":      []string{auth.AccessAudience},
		"iat":      now.Unix(),
		"exp":      now.Add(15 * time.Minute).Unix(),
	}
}

// TestAccessTokenIsStampedWithPurpose reads the claims back off the token the
// SHIPPED mint actually handed a client. Without this, mint and verify could
// drop `aud` together and every rejection test below would still pass — the
// classic "the guard tests the guard" hole.
func TestAccessTokenIsStampedWithPurpose(t *testing.T) {
	testkit.Cover(t, "auth-token-purpose-stamped")
	testkit.Cover(t, "sec-154-jwt-aud-iss")
	ts := testutil.New(t)
	u := ts.Register("stamped")

	var claims jwt.MapClaims
	_, err := jwt.NewParser().ParseWithClaims(u.Access, &claims, func(*jwt.Token) (any, error) {
		return []byte(testutil.JWTSecret), nil
	})
	require.NoError(t, err)

	assert.Equal(t, auth.TokenIssuer, claims["iss"], "the shipped mint must stamp iss")
	aud, err := claims.GetAudience()
	require.NoError(t, err)
	assert.Contains(t, []string(aud), auth.AccessAudience, "the shipped mint must stamp aud")
}

// TestForeignPurposeTokensAreRefused is the core GH#180 guard.
//
// It sweeps BOTH shipped verifiers — auth.Middleware (every REST route) and the
// lobby WS handshake, which calls VerifyAccess itself — because "fixed in one
// place" is how this family of bug survives. Each forged token is otherwise
// perfect: same secret, same algorithm, same subject, unexpired.
func TestForeignPurposeTokensAreRefused(t *testing.T) {
	testkit.Cover(t, "auth-token-purpose-refused")
	testkit.Cover(t, "sec-154-jwt-aud-iss")
	ts := testutil.New(t)
	u := ts.Register("purpose")

	noAud := baseClaims(u.ID, u.Username)
	delete(noAud, "aud")
	noIss := baseClaims(u.ID, u.Username)
	delete(noIss, "iss")

	wrongAud := baseClaims(u.ID, u.Username)
	wrongAud["aud"] = []string{approveTokenDomain}
	emptyAud := baseClaims(u.ID, u.Username)
	emptyAud["aud"] = []string{}
	wrongIss := baseClaims(u.ID, u.Username)
	wrongIss["iss"] = "evil-platform"

	cases := []struct {
		name   string
		claims jwt.MapClaims
	}{
		// The reason the aud claim exists: a token minted for #209's approve
		// flow, signed with the very same key, must not open a session.
		{"audience of another purpose", wrongAud},
		// A token from before #180 existed. Refusing it is the deliberate
		// no-grace-period choice — see VerifyAccess.
		{"no audience at all", noAud},
		{"empty audience list", emptyAud},
		{"issuer of another platform", wrongIss},
		{"no issuer at all", noIss},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			tok := forge(t, tc.claims)

			me := ts.Do(http.MethodGet, "/api/v1/me", tok, nil)
			assert.Equal(t, http.StatusUnauthorized, me.Status,
				"REST middleware accepted it: %s", string(me.Raw))

			_, resp, err := ts.DialWS(tok)
			assert.Error(t, err, "the lobby handshake accepted it")
			if resp != nil {
				assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
			}
		})
	}

	// The control: the SAME shape, correctly addressed, still works on both
	// surfaces — so the rejections above are about the purpose, not about the
	// forging harness being broken (failure ④).
	good := forge(t, baseClaims(u.ID, u.Username))
	me := ts.Do(http.MethodGet, "/api/v1/me", good, nil)
	require.Equal(t, http.StatusOK, me.Status, "a correctly-addressed token must still work: %s", string(me.Raw))
	_, _, err := ts.DialWS(good)
	require.NoError(t, err, "a correctly-addressed token must still open the lobby WS")
}

// TestApproveLinkAndAccessTokenAreNotInterchangeable drives the two REAL
// token systems that share JWT_SIGNING_SECRET against each other, in both
// directions, through the endpoints that actually consume them.
//
// This is the behavioural half of the guard above: it uses approvelink's real
// Signer with the real deploy secret rather than a literal, so if either format
// or either domain string changes, this test — not a stale constant — decides
// whether the two uses are still separated.
func TestApproveLinkAndAccessTokenAreNotInterchangeable(t *testing.T) {
	testkit.Cover(t, "auth-token-purpose-cross-use")
	ts := testutil.New(t)
	u := ts.Register("crossuse")

	signer := approvelink.NewSigner([]byte(testutil.JWTSecret), 0)
	approveTok, err := signer.Sign(u.ID, approvelink.ActionApprove)
	require.NoError(t, err)

	// Direction 1: an approve-link token must not be a session.
	me := ts.Do(http.MethodGet, "/api/v1/me", approveTok, nil)
	assert.Equal(t, http.StatusUnauthorized, me.Status,
		"an approve-link token opened a session: %s", string(me.Raw))
	_, wsResp, wsErr := ts.DialWS(approveTok)
	assert.Error(t, wsErr, "an approve-link token opened the lobby WS")
	if wsResp != nil {
		assert.Equal(t, http.StatusUnauthorized, wsResp.StatusCode)
	}

	// Direction 2: a session must not approve accounts. Checked twice — against
	// the verifier directly, and against the live token-gated endpoint, because
	// the endpoint is what an attacker would actually reach.
	_, verr := signer.Verify(u.Access)
	assert.Error(t, verr, "the approve-link verifier accepted an access token")

	page := ts.Do(http.MethodGet, "/api/v1/approve?token="+u.Access, "", nil)
	assert.NotEqual(t, http.StatusOK, page.Status,
		"the approve endpoint accepted an access token: %s", string(page.Raw))
}
