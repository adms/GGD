package auth_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/config"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// #724/F-21 — the load-bearing line: a console must be able to refresh with
// NOTHING in its own storage, because that is the whole reason it is allowed to
// stop persisting the refresh token. If the cookie is not planted, or is
// planted but not accepted back, the admin console signs its operator out on
// every reload — a security fix that locks the user out is worse than the hole.
//
// Driven through a REAL cookie jar against the fully wired server, so the test
// exercises the same round trip a browser does (failure mode ⑤: a hand-built
// payload proves nothing about the shipping channel).

// jarPost posts JSON through a cookie-carrying client and returns status + body
// + the raw response (for Set-Cookie inspection).
func jarPost(t *testing.T, c *http.Client, url string, body any) (int, map[string]any, *http.Response) {
	t.Helper()
	raw, err := json.Marshal(body)
	require.NoError(t, err)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(raw))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	res, err := c.Do(req)
	require.NoError(t, err)
	defer res.Body.Close()
	data, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	out := map[string]any{}
	_ = json.Unmarshal(data, &out)
	return res.StatusCode, out, res
}

func jarClient(t *testing.T) *http.Client {
	t.Helper()
	jar, err := cookiejar.New(nil)
	require.NoError(t, err)
	return &http.Client{Jar: jar}
}

func TestRefreshCookieCarriesTheTokenSoStorageDoesNotHaveTo(t *testing.T) {
	testkit.Cover(t, "auth-refresh-cookie")
	ts := testutil.New(t)
	u := ts.Register("cookieop")
	c := jarClient(t)

	// 1) A normal refresh (token in the body, as every client does today) also
	//    plants the cookie and SAYS it did.
	status, body, res := jarPost(t, c, ts.HTTP.URL+"/api/v1/auth/refresh",
		map[string]string{"refreshToken": u.Refresh})
	require.Equal(t, http.StatusOK, status, body)
	require.Equal(t, true, body["refreshCookie"],
		"the response must TELL the client the cookie is there — httpOnly means the browser can never check for itself")

	var planted *http.Cookie
	for _, ck := range res.Cookies() {
		if ck.Name == auth.RefreshCookieName {
			planted = ck
		}
	}
	require.NotNil(t, planted, "no %s cookie was set", auth.RefreshCookieName)
	require.True(t, planted.HttpOnly, "a refresh cookie readable by JavaScript fixes nothing — that is the localStorage hole with extra steps")
	require.Equal(t, auth.RefreshCookiePath, planted.Path)
	require.Equal(t, http.SameSiteStrictMode, planted.SameSite, "Strict is the CSRF defence for a route that now accepts a cookie as a credential")

	// 2) THE LOAD-BEARING ASSERTION: refresh again with an EMPTY body token.
	//    This is a reloaded admin console — it kept nothing on disk.
	status, body, _ = jarPost(t, c, ts.HTTP.URL+"/api/v1/auth/refresh",
		map[string]string{"refreshToken": ""})
	require.Equal(t, http.StatusOK, status,
		"the cookie must stand in for a token the client no longer stores, or every reload is a sign-out: %v", body)
	tokens, _ := body["tokens"].(map[string]any)
	require.NotEmpty(t, tokens["accessToken"])

	// 3) Signing out hands the credential back. A cookie that survives logout
	//    is worse than localStorage: nothing on screen would ever reveal it.
	status, body, res = jarPost(t, c, ts.HTTP.URL+"/api/v1/auth/logout",
		map[string]string{"refreshToken": ""})
	require.Equal(t, http.StatusOK, status, body)
	var cleared bool
	for _, ck := range res.Cookies() {
		if ck.Name == auth.RefreshCookieName && ck.MaxAge < 0 {
			cleared = true
		}
	}
	require.True(t, cleared, "logout must expire %s", auth.RefreshCookieName)

	status, body, _ = jarPost(t, c, ts.HTTP.URL+"/api/v1/auth/refresh",
		map[string]string{"refreshToken": ""})
	require.Equal(t, http.StatusUnauthorized, status,
		"the refresh token behind the cookie must be revoked by logout, not merely forgotten: %v", body)
}

// The rollback path: GGD_AUTH_REFRESH_COOKIE=0 puts BOTH halves back to the
// pre-#724 behaviour — no cookie, and no flag, so the client keeps persisting
// the token exactly as it did yesterday. A knob nobody verified is a knob that
// does not work on the night it is needed.
func TestRefreshCookieKnobOffRestoresThePreviousBehaviour(t *testing.T) {
	testkit.Cover(t, "auth-refresh-cookie")
	ts := testutil.New(t, func(c *config.Config) { c.AuthRefreshCookie = false })
	u := ts.Register("nocookieop")
	c := jarClient(t)

	status, body, res := jarPost(t, c, ts.HTTP.URL+"/api/v1/auth/refresh",
		map[string]string{"refreshToken": u.Refresh})
	require.Equal(t, http.StatusOK, status, body)
	require.Nil(t, body["refreshCookie"], "with the knob off the flag must be ABSENT, not false-y-but-present")
	for _, ck := range res.Cookies() {
		require.NotEqual(t, auth.RefreshCookieName, ck.Name, "knob off must plant no cookie")
	}

	status, _, _ = jarPost(t, c, ts.HTTP.URL+"/api/v1/auth/refresh",
		map[string]string{"refreshToken": ""})
	require.Equal(t, http.StatusUnauthorized, status, "no cookie ⇒ an empty body token is simply no credential")
}
