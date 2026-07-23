package auth_test

// Self-service change-password: POST /api/v1/account/password.
//
// Every password in this file is a throwaway literal minted for the test that
// uses it. Nothing here names a real account or a real credential.

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

const changePasswordPath = "/api/v1/account/password"

// registeredPassword mirrors testutil.TS.Register's derivation so a test can
// present the account's real current password.
func registeredPassword(username string) string { return "correct-horse-" + username }

// storedHash reads the argon2id hash straight off the JSON truth.
func storedHash(t *testing.T, ts *testutil.TS, id string) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(ts.Cfg.DataDir, "accounts", id+".json"))
	require.NoError(t, err)
	var stored map[string]any
	require.NoError(t, json.Unmarshal(data, &stored))
	hash, _ := stored["passwordHash"].(string)
	require.True(t, strings.HasPrefix(hash, "$argon2id$"), "hash: %q", hash)
	return hash
}

// auditLog concatenates every line of the append-only admin audit log.
func auditLog(t *testing.T, ts *testutil.TS) string {
	t.Helper()
	files, err := filepath.Glob(filepath.Join(ts.Cfg.DataDir, "admin-audit", "*.jsonl"))
	require.NoError(t, err)
	var sb strings.Builder
	for _, f := range files {
		data, err := os.ReadFile(f)
		require.NoError(t, err)
		sb.Write(data)
	}
	return sb.String()
}

// TestChangePasswordRequiresSession: no token, no route. The change-password
// endpoint lives behind the same middleware as /me.
func TestChangePasswordRequiresSession(t *testing.T) {
	testkit.Cover(t, "auth-change-password-session")
	ts := testutil.New(t)
	ts.Register("pwanon")
	r := ts.Do(http.MethodPost, changePasswordPath, "", map[string]string{
		"currentPassword": registeredPassword("pwanon"), "newPassword": "brand-new-passphrase-1",
	})
	require.Equal(t, http.StatusUnauthorized, r.Status, string(r.Raw))
}

// TestChangePasswordRequiresCurrentPassword is THE test this feature exists for:
// a valid session on its own must never be able to change a password, or a
// stolen token could lock the owner out of their own account for good.
func TestChangePasswordRequiresCurrentPassword(t *testing.T) {
	testkit.Cover(t, "auth-change-password-current-required")
	ts := testutil.New(t)
	u := ts.Register("pwsession")

	// Session only — no currentPassword in the body.
	omitted := ts.Do(http.MethodPost, changePasswordPath, u.Access, map[string]string{
		"newPassword": "brand-new-passphrase-1",
	})
	require.Equal(t, http.StatusUnauthorized, omitted.Status, string(omitted.Raw))
	require.Equal(t, "unauthorized", omitted.ErrCode())

	// …and the same session with a WRONG current password is byte-identical, so
	// the endpoint is not an oracle for "does that old password exist".
	wrong := ts.Do(http.MethodPost, changePasswordPath, u.Access, map[string]string{
		"currentPassword": "not-the-current-password", "newPassword": "brand-new-passphrase-1",
	})
	require.Equal(t, http.StatusUnauthorized, wrong.Status)
	require.JSONEq(t, string(wrong.Raw), string(omitted.Raw),
		"a missing and a wrong current password must be indistinguishable")

	// The original password still works: nothing was changed.
	login := ts.Do(http.MethodPost, "/api/v1/auth/login", "", map[string]string{
		"username": "pwsession", "password": registeredPassword("pwsession"),
	})
	require.Equal(t, http.StatusOK, login.Status, string(login.Raw))
}

// TestChangePasswordWrongCurrentIsRateLimited: brute-forcing the current
// password through a hijacked session is throttled, per account.
func TestChangePasswordWrongCurrentIsRateLimited(t *testing.T) {
	testkit.Cover(t, "auth-change-password-rate-limit")
	ts := testutil.New(t)
	u := ts.Register("pwbrute")

	var last testutil.Resp
	limited := false
	for i := 0; i < 12; i++ {
		last = ts.Do(http.MethodPost, changePasswordPath, u.Access, map[string]string{
			"currentPassword": "guess-number-" + strings.Repeat("x", i+1),
			"newPassword":     "brand-new-passphrase-1",
		})
		if last.Status == http.StatusTooManyRequests {
			limited = true
			break
		}
		require.Equal(t, http.StatusUnauthorized, last.Status, string(last.Raw))
	}
	require.True(t, limited, "current-password guessing must be rate limited")
	require.Equal(t, "rate_limited", last.ErrCode())

	// The throttle holds even for the CORRECT password — the budget is spent.
	blocked := ts.Do(http.MethodPost, changePasswordPath, u.Access, map[string]string{
		"currentPassword": registeredPassword("pwbrute"), "newPassword": "brand-new-passphrase-1",
	})
	require.Equal(t, http.StatusTooManyRequests, blocked.Status)
}

// TestChangePasswordUsesRegistrationValidator: the new password must clear the
// EXACT same shape rules registration enforces — one policy, not two. Each case
// is asserted against /auth/register as well, so this cannot pass by accident
// with a second, divergent validator.
func TestChangePasswordUsesRegistrationValidator(t *testing.T) {
	testkit.Cover(t, "auth-change-password-validator")
	ts := testutil.New(t)
	u := ts.Register("pwweak")

	bad := []string{
		"short",                      // under 8
		strings.Repeat("p", 200),     // over 128
		"has\x00a-control-character", // control char
		"",                           // empty
	}
	for i, pw := range bad {
		r := ts.Do(http.MethodPost, changePasswordPath, u.Access, map[string]string{
			"currentPassword": registeredPassword("pwweak"), "newPassword": pw,
		})
		require.Equal(t, http.StatusBadRequest, r.Status, "case %d: %s", i, string(r.Raw))
		require.Equal(t, "bad_request", r.ErrCode())

		// Registration refuses the very same string, with the very same code.
		reg := ts.Do(http.MethodPost, "/api/v1/auth/register", "", map[string]string{
			"username": "shapeprobe", "email": "shapeprobe@example.com", "password": pw,
		})
		require.Equal(t, http.StatusBadRequest, reg.Status,
			"case %d must be refused by registration too", i)
		require.Equal(t, "bad_request", reg.ErrCode())
	}

	// An invalid new password must not have burned the account's credential.
	require.Equal(t, http.StatusOK, ts.Do(http.MethodPost, "/api/v1/auth/login", "", map[string]string{
		"username": "pwweak", "password": registeredPassword("pwweak"),
	}).Status)
}

// TestChangePasswordRejectsNoOp: setting the current password again is refused.
func TestChangePasswordRejectsSamePassword(t *testing.T) {
	testkit.Cover(t, "auth-change-password-same")
	ts := testutil.New(t)
	u := ts.Register("pwsame")
	current := registeredPassword("pwsame")

	r := ts.Do(http.MethodPost, changePasswordPath, u.Access, map[string]string{
		"currentPassword": current, "newPassword": current,
	})
	require.Equal(t, http.StatusBadRequest, r.Status, string(r.Raw))
	require.Equal(t, "bad_request", r.ErrCode())
}

// TestChangePasswordHappyPath: the stored hash is replaced (the old one no
// longer verifies), the new password logs in, the old one does not.
func TestChangePasswordHappyPath(t *testing.T) {
	testkit.Cover(t, "auth-change-password-ok")
	ts := testutil.New(t)
	u := ts.Register("pwrotate")
	oldPassword := registeredPassword("pwrotate")
	newPassword := "a-different-throwaway-passphrase-9"

	before := storedHash(t, ts, u.ID)

	r := ts.Do(http.MethodPost, changePasswordPath, u.Access, map[string]string{
		"currentPassword": oldPassword, "newPassword": newPassword,
	})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	require.Equal(t, "ok", r.Body["status"])
	require.Equal(t, true, r.Body["sessionsRevoked"])
	fresh := r.Body["tokens"].(map[string]any)
	require.NotEmpty(t, fresh["accessToken"])
	require.NotEmpty(t, fresh["refreshToken"])

	// The credential was re-hashed with argon2id, and no plaintext hit the disk.
	after := storedHash(t, ts, u.ID)
	require.NotEqual(t, before, after, "the stored hash must be replaced")
	accountJSON, err := os.ReadFile(filepath.Join(ts.Cfg.DataDir, "accounts", u.ID+".json"))
	require.NoError(t, err)
	require.NotContains(t, string(accountJSON), newPassword)
	require.NotContains(t, string(accountJSON), oldPassword)

	// The OLD password no longer verifies…
	old := ts.Do(http.MethodPost, "/api/v1/auth/login", "", map[string]string{
		"username": "pwrotate", "password": oldPassword,
	})
	require.Equal(t, http.StatusUnauthorized, old.Status, string(old.Raw))

	// …and the NEW one does.
	fresh2 := ts.Do(http.MethodPost, "/api/v1/auth/login", "", map[string]string{
		"username": "pwrotate", "password": newPassword,
	})
	require.Equal(t, http.StatusOK, fresh2.Status, string(fresh2.Raw))

	// The pair handed back by the change is live: it refreshes.
	rot := ts.Do(http.MethodPost, "/api/v1/auth/refresh", "", map[string]string{
		"refreshToken": fresh["refreshToken"].(string),
	})
	require.Equal(t, http.StatusOK, rot.Status, string(rot.Raw))
}

// TestChangePasswordRevokesOtherSessions: a session opened before the change —
// the stolen-token case — dies at its next rotation.
func TestChangePasswordRevokesOtherSessions(t *testing.T) {
	testkit.Cover(t, "auth-change-password-revoke")
	ts := testutil.New(t)
	u := ts.Register("pwkick")
	current := registeredPassword("pwkick")

	// A second, independent session (think: the attacker's).
	second := ts.Do(http.MethodPost, "/api/v1/auth/login", "", map[string]string{
		"username": "pwkick", "password": current,
	})
	require.Equal(t, http.StatusOK, second.Status)
	otherRefresh := second.Body["tokens"].(map[string]any)["refreshToken"].(string)

	r := ts.Do(http.MethodPost, changePasswordPath, u.Access, map[string]string{
		"currentPassword": current, "newPassword": "yet-another-throwaway-pass-7",
	})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))

	// The other session's refresh token is gone.
	dead := ts.Do(http.MethodPost, "/api/v1/auth/refresh", "", map[string]string{"refreshToken": otherRefresh})
	require.Equal(t, http.StatusUnauthorized, dead.Status, string(dead.Raw))

	// So is the caller's ORIGINAL refresh token — it was replaced by the fresh
	// pair the response carries.
	deadSelf := ts.Do(http.MethodPost, "/api/v1/auth/refresh", "", map[string]string{"refreshToken": u.Refresh})
	require.Equal(t, http.StatusUnauthorized, deadSelf.Status, string(deadSelf.Raw))

	// Redis holds exactly the one live token: the newly issued one.
	live, err := ts.Srv.Rdb.HasLiveRefresh(t.Context(), u.ID)
	require.NoError(t, err)
	require.True(t, live)
}

// TestChangePasswordAudited: the change lands in the append-only admin audit
// log, and that entry carries no credential material.
func TestChangePasswordAudited(t *testing.T) {
	testkit.Cover(t, "auth-change-password-audit")
	ts := testutil.New(t)
	u := ts.Register("pwaudit")
	oldPassword := registeredPassword("pwaudit")
	newPassword := "an-auditable-throwaway-pass-3"

	require.Empty(t, auditLog(t, ts), "no audit lines before the change")

	r := ts.Do(http.MethodPost, changePasswordPath, u.Access, map[string]string{
		"currentPassword": oldPassword, "newPassword": newPassword,
	})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))

	log := auditLog(t, ts)
	require.NotEmpty(t, log, "the change must be audited")

	var entry map[string]any
	require.NoError(t, json.Unmarshal([]byte(strings.TrimSpace(log)), &entry))
	require.Equal(t, "password_change", entry["action"])
	require.Equal(t, u.ID, entry["adminId"])
	require.Equal(t, u.ID, entry["targetId"])
	require.NotEmpty(t, entry["ts"])
	detail := entry["detail"].(map[string]any)
	require.Equal(t, true, detail["self"])
	require.Equal(t, true, detail["sessionsRevoked"])

	// NOTHING secret in the line: neither password, no hash, no token.
	require.NotContains(t, log, oldPassword)
	require.NotContains(t, log, newPassword)
	require.NotContains(t, log, "argon2")
	require.NotContains(t, log, "passwordHash")
	require.NotContains(t, log, r.Body["tokens"].(map[string]any)["refreshToken"].(string))
}
