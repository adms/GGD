package auth_test

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

func TestRegisterOK(t *testing.T) {
	testkit.Cover(t, "auth-register-ok")
	ts := testutil.New(t)
	r := ts.Do(http.MethodPost, "/api/v1/auth/register", "", map[string]string{
		"username": "alice", "email": "alice@example.com", "password": "hunter2hunter2",
	})
	require.Equal(t, http.StatusCreated, r.Status, string(r.Raw))
	acc := r.Body["account"].(map[string]any)
	require.Equal(t, "alice", acc["username"])
	require.NotEmpty(t, acc["id"])
	require.EqualValues(t, 1000, acc["mmr"])
	toks := r.Body["tokens"].(map[string]any)
	require.NotEmpty(t, toks["accessToken"])
	require.NotEmpty(t, toks["refreshToken"])
	// /me works with the fresh access token.
	me := ts.Do(http.MethodGet, "/api/v1/me", toks["accessToken"].(string), nil)
	require.Equal(t, http.StatusOK, me.Status)
}

func TestRegisterDupUsername(t *testing.T) {
	testkit.Cover(t, "auth-register-dup-username")
	ts := testutil.New(t)
	ts.Register("bob")
	r := ts.Do(http.MethodPost, "/api/v1/auth/register", "", map[string]string{
		"username": "bob", "email": "other@example.com", "password": "hunter2hunter2",
	})
	require.Equal(t, http.StatusConflict, r.Status)
	require.Equal(t, "conflict", r.ErrCode())
}

func TestRegisterDupEmail(t *testing.T) {
	testkit.Cover(t, "auth-register-dup-email")
	ts := testutil.New(t)
	ts.Register("carol")
	r := ts.Do(http.MethodPost, "/api/v1/auth/register", "", map[string]string{
		"username": "carol2", "email": "carol@example.com", "password": "hunter2hunter2",
	})
	require.Equal(t, http.StatusConflict, r.Status)
	require.Equal(t, "conflict", r.ErrCode())
	// The username reservation must have been rolled back: carol2 can retry.
	r = ts.Do(http.MethodPost, "/api/v1/auth/register", "", map[string]string{
		"username": "carol2", "email": "carol2@example.com", "password": "hunter2hunter2",
	})
	require.Equal(t, http.StatusCreated, r.Status)
}

func TestPasswordStoredArgon2id(t *testing.T) {
	testkit.Cover(t, "auth-password-argon2id")
	ts := testutil.New(t)
	u := ts.Register("dave")
	data, err := os.ReadFile(filepath.Join(ts.Cfg.DataDir, "accounts", u.ID+".json"))
	require.NoError(t, err)
	var stored map[string]any
	require.NoError(t, json.Unmarshal(data, &stored))
	hash, _ := stored["passwordHash"].(string)
	require.True(t, strings.HasPrefix(hash, "$argon2id$"), "hash: %q", hash)
	require.NotContains(t, string(data), "correct-horse-dave", "plaintext must never touch disk")
	// And the hash never leaks over the API.
	me := ts.Do(http.MethodGet, "/api/v1/me", u.Access, nil)
	require.NotContains(t, string(me.Raw), "argon2")
	require.NotContains(t, string(me.Raw), "passwordHash")
}

func TestLoginOK(t *testing.T) {
	testkit.Cover(t, "auth-login-ok")
	ts := testutil.New(t)
	ts.Register("erin")
	r := ts.Do(http.MethodPost, "/api/v1/auth/login", "", map[string]string{
		"username": "erin", "password": "correct-horse-erin",
	})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	toks := r.Body["tokens"].(map[string]any)
	require.NotEmpty(t, toks["accessToken"])
	require.NotEmpty(t, toks["refreshToken"])
	// Login by email works too.
	r = ts.Do(http.MethodPost, "/api/v1/auth/login", "", map[string]string{
		"username": "erin@example.com", "password": "correct-horse-erin",
	})
	require.Equal(t, http.StatusOK, r.Status)
}

// TestLoginConstantShape asserts the anti-enumeration property: an unknown
// username and a wrong password produce byte-identical responses (status,
// code, body) — a client cannot tell whether the account exists. (Wall-clock
// timing is not asserted; the service burns an argon2id verification against
// a dummy hash on the unknown-user path to equalize work.)
func TestLoginConstantShape(t *testing.T) {
	testkit.Cover(t, "auth-login-timing")
	ts := testutil.New(t)
	ts.Register("frank")

	unknown := ts.Do(http.MethodPost, "/api/v1/auth/login", "", map[string]string{
		"username": "who-is-this", "password": "some-password-123",
	})
	wrongpw := ts.Do(http.MethodPost, "/api/v1/auth/login", "", map[string]string{
		"username": "frank", "password": "not-franks-password",
	})
	require.Equal(t, http.StatusUnauthorized, unknown.Status)
	require.Equal(t, wrongpw.Status, unknown.Status)
	require.JSONEq(t, string(wrongpw.Raw), string(unknown.Raw),
		"unknown-user and wrong-password responses must be indistinguishable")
}

func TestRefreshRotation(t *testing.T) {
	testkit.Cover(t, "auth-refresh-rotate")
	ts := testutil.New(t)
	u := ts.Register("grace")

	// Rotate: old refresh yields a new pair.
	r1 := ts.Do(http.MethodPost, "/api/v1/auth/refresh", "", map[string]string{"refreshToken": u.Refresh})
	require.Equal(t, http.StatusOK, r1.Status, string(r1.Raw))
	newRefresh := r1.Body["tokens"].(map[string]any)["refreshToken"].(string)
	require.NotEqual(t, u.Refresh, newRefresh, "refresh token must rotate")

	// Reuse of the retired token is detected...
	r2 := ts.Do(http.MethodPost, "/api/v1/auth/refresh", "", map[string]string{"refreshToken": u.Refresh})
	require.Equal(t, http.StatusUnauthorized, r2.Status)
	require.Contains(t, strings.ToLower(string(r2.Raw)), "reuse")

	// ...and revokes the whole family: the new token is dead too.
	r3 := ts.Do(http.MethodPost, "/api/v1/auth/refresh", "", map[string]string{"refreshToken": newRefresh})
	require.Equal(t, http.StatusUnauthorized, r3.Status)
}

func TestJWTTamperRejected(t *testing.T) {
	testkit.Cover(t, "auth-jwt-tamper")
	ts := testutil.New(t)
	u := ts.Register("henry")
	other := ts.Register("henry2")

	// 1. Payload swap: replace the sub claim, keep the original signature.
	parts := strings.Split(u.Access, ".")
	require.Len(t, parts, 3)
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	require.NoError(t, err)
	tampered := strings.Replace(string(payload), u.ID, other.ID, 1)
	parts[1] = base64.RawURLEncoding.EncodeToString([]byte(tampered))
	forged := strings.Join(parts, ".")
	r := ts.Do(http.MethodGet, "/api/v1/me", forged, nil)
	require.Equal(t, http.StatusUnauthorized, r.Status, "tampered payload must be rejected")

	// 2. Token signed with the wrong key.
	wrongKey := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"sub": u.ID, "exp": 9999999999})
	forged2, err := wrongKey.SignedString([]byte("attacker-key"))
	require.NoError(t, err)
	r = ts.Do(http.MethodGet, "/api/v1/me", forged2, nil)
	require.Equal(t, http.StatusUnauthorized, r.Status, "wrong-key signature must be rejected")

	// 3. alg=none downgrade.
	noneTok, err := jwt.NewWithClaims(jwt.SigningMethodNone, jwt.MapClaims{"sub": u.ID, "exp": 9999999999}).
		SignedString(jwt.UnsafeAllowNoneSignatureType)
	require.NoError(t, err)
	r = ts.Do(http.MethodGet, "/api/v1/me", noneTok, nil)
	require.Equal(t, http.StatusUnauthorized, r.Status, "alg=none must be rejected")

	// Control: the untampered token still works.
	r = ts.Do(http.MethodGet, "/api/v1/me", u.Access, nil)
	require.Equal(t, http.StatusOK, r.Status)
}

func TestLoginRateLimit(t *testing.T) {
	testkit.Cover(t, "auth-rate-limit")
	ts := testutil.New(t)
	ts.Register("ivy")
	var last testutil.Resp
	limited := false
	for i := 0; i < 12; i++ {
		last = ts.Do(http.MethodPost, "/api/v1/auth/login", "", map[string]string{
			"username": "ivy", "password": "wrong-password",
		})
		if last.Status == http.StatusTooManyRequests {
			limited = true
			break
		}
		require.Equal(t, http.StatusUnauthorized, last.Status)
	}
	require.True(t, limited, "per-IP login rate limit must kick in")
	require.Equal(t, "rate_limited", last.ErrCode())
}

func TestRegisterInputValidation(t *testing.T) {
	testkit.Cover(t, "auth-input-validation")
	ts := testutil.New(t)
	cases := []map[string]string{
		{"username": "ab", "email": "a@b.co", "password": "longenough1"},                                   // too short
		{"username": strings.Repeat("a", 30), "email": "a@b.co", "password": "longenough1"},                // too long
		{"username": "UPPER", "email": "a@b.co", "password": "longenough1"},                                // uppercase
		{"username": "good1", "email": "not-an-email", "password": "longenough1"},                          // bad email
		{"username": "good2", "email": "a@" + strings.Repeat("x", 260) + ".co", "password": "longenough1"}, // oversized email
		{"username": "good3", "email": "a@b.co", "password": "short"},                                      // short pw
		{"username": "good4", "email": "a@b.co", "password": strings.Repeat("p", 200)},                     // oversized pw
	}
	for i, c := range cases {
		r := ts.Do(http.MethodPost, "/api/v1/auth/register", "", c)
		require.Equal(t, http.StatusBadRequest, r.Status, "case %d: %s", i, string(r.Raw))
		require.Equal(t, "bad_request", r.ErrCode())
	}
	// Not-JSON body.
	req, _ := http.NewRequest(http.MethodPost, ts.HTTP.URL+"/api/v1/auth/register", strings.NewReader("{{{{"))
	resp, err := ts.HTTP.Client().Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestUsernameInjectionRejected(t *testing.T) {
	testkit.Cover(t, "auth-username-injection")
	ts := testutil.New(t)
	hostile := []string{
		"../../etc/passwd", "a\r\nSET x y", "user\x00name", "<script>a</script>",
		"user\nname", "user name", "a;b", "𝕦𝕟𝕚", "user\tname",
	}
	for _, name := range hostile {
		r := ts.Do(http.MethodPost, "/api/v1/auth/register", "", map[string]string{
			"username": name, "email": "inj@example.com", "password": "longenough1",
		})
		require.Equal(t, http.StatusBadRequest, r.Status, "username %q must be rejected", name)
	}
	// Nothing hostile reached the data dir.
	_, err := os.Stat(filepath.Join(ts.Cfg.DataDir, "accounts", "by-username"))
	if err == nil {
		entries, err := os.ReadDir(filepath.Join(ts.Cfg.DataDir, "accounts", "by-username"))
		require.NoError(t, err)
		require.LessOrEqual(t, len(entries), 1) // at most _index.json
	}
}
