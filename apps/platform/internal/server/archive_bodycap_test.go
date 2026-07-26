// Package server_test — archive_bodycap_test.go pins the ONE body-cap
// exemption the platform grants, and its exact boundaries (task #243).
//
// WHY THIS TEST EXISTS AT ALL. #126 wrapped EVERY route in a 1 MiB
// MaxBytesReader. A real migration archive is tens of megabytes, so without an
// exemption the import path 413s on every single attempt — and the failure is
// mute on both sides: MaxBytesReader surfaces as a generic decode error, and
// nginx's own `client_max_body_size 1m` answers before the request even
// reaches Go. The owner would see a bare 413 with no explanation.
//
// The exemption is therefore made as narrow as it can be, and this file is what
// keeps it narrow: EXACTLY one path, matched EXACTLY, with the neighbouring
// routes under the same prefix still capped at 1 MiB.
package server_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/admin"
	"github.com/ggd/platform/internal/platformarchive"
	"github.com/ggd/platform/internal/testutil"
)

func promoteAdmin(t *testing.T, ts *testutil.TS, id string) {
	t.Helper()
	_, err := ts.Srv.Accounts.Update(context.Background(), id, func(a *account.Account) error {
		if !a.HasRole(admin.RoleAdmin) {
			a.Roles = append(a.Roles, admin.RoleAdmin)
		}
		return nil
	})
	require.NoError(t, err)
}

// post sends a raw body through the real router (so every middleware runs) and
// returns the status.
func postRaw(t *testing.T, ts *testutil.TS, path, token string, body []byte) int {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/zip")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	ts.Srv.Router().ServeHTTP(rec, req)
	return rec.Code
}

func TestArchiveStageIsTheOnlyRouteThatAcceptsALargeBody(t *testing.T) {
	ts := testutil.New(t)
	boss := ts.Register("archivebodycapboss")
	promoteAdmin(t, ts, boss.ID)

	// 2 MiB — comfortably over the global 1 MiB cap, comfortably under the
	// archive cap. Garbage bytes: this test is about the CAP, and the archive
	// verifier is expected to refuse the content itself with 422.
	big := bytes.Repeat([]byte("A"), 2<<20)

	got := postRaw(t, ts, platformarchive.StagePath, boss.Access, big)
	assert.NotEqual(t, http.StatusRequestEntityTooLarge, got,
		"the stage route must accept a body larger than 1 MiB — without this every import 413s")
	assert.Equal(t, http.StatusUnprocessableEntity, got,
		"…and must then refuse the CONTENT, because 2 MiB of 'A' is not an archive")

	// The neighbours under the SAME prefix are still capped. A prefix-based
	// exemption would silently enlarge all of them.
	//
	// (/preview is not listed: it reads no body at all, so the cap is never
	// exercised there and asserting on it would test nothing.)
	for _, path := range []string{
		"/api/v1/admin/platform-archive/plan",
		"/api/v1/admin/platform-archive/commit",
		"/api/v1/admin/platform-archive/export",
	} {
		req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(big))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+boss.Access)
		rec := httptest.NewRecorder()
		ts.Srv.Router().ServeHTTP(rec, req)
		assert.NotEqual(t, http.StatusOK, rec.Code, "%s must not accept a 2 MiB body", path)
	}

	// And an unrelated admin route is untouched by the exemption.
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/crystals/grant-all", bytes.NewReader(big))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+boss.Access)
	rec := httptest.NewRecorder()
	ts.Srv.Router().ServeHTTP(rec, req)
	assert.NotEqual(t, http.StatusOK, rec.Code, "an unrelated admin route must stay capped")
}

func TestArchiveRoutesRequireAnAdminSession(t *testing.T) {
	ts := testutil.New(t)
	plain := ts.Register("archiveplainuser")

	paths := []string{
		"/api/v1/admin/platform-archive/preview",
		"/api/v1/admin/platform-archive/export",
		platformarchive.StagePath,
		"/api/v1/admin/platform-archive/plan",
		"/api/v1/admin/platform-archive/commit",
	}
	for _, p := range paths {
		assert.Equal(t, http.StatusUnauthorized, postRaw(t, ts, p, "", []byte("{}")),
			"%s must 401 without a session", p)
		assert.Equal(t, http.StatusForbidden, postRaw(t, ts, p, plain.Access, []byte("{}")),
			"%s must 403 for a non-admin", p)
	}
	// GET status too.
	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/platform-archive/status", nil)
	rec := httptest.NewRecorder()
	ts.Srv.Router().ServeHTTP(rec, req)
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestExportAndCommitDemandThePasswordAgain(t *testing.T) {
	ts := testutil.New(t)
	boss := ts.Register("archivepwboss")
	promoteAdmin(t, ts, boss.ID)

	// No password at all → 400 with an explanation, never a silent success.
	r := ts.Do(http.MethodPost, "/api/v1/admin/platform-archive/export", boss.Access,
		map[string]any{"groups": []string{"core"}})
	require.Equal(t, http.StatusBadRequest, r.Status, "export without a password must be refused: %s", string(r.Raw))
	assert.Contains(t, string(r.Raw), "密碼")

	// A WRONG password → 401, the same generic failure Login returns.
	r = ts.Do(http.MethodPost, "/api/v1/admin/platform-archive/export", boss.Access,
		map[string]any{"groups": []string{"core"}, "confirmPassword": "definitely-not-it"})
	require.Equal(t, http.StatusUnauthorized, r.Status, "a wrong password must 401: %s", string(r.Raw))

	// commit is gated the same way.
	r = ts.Do(http.MethodPost, "/api/v1/admin/platform-archive/commit", boss.Access,
		map[string]any{"stageId": strings.Repeat("a", 64)})
	require.Equal(t, http.StatusBadRequest, r.Status, "commit without a password must be refused")
}

func TestExportWithTheRightPasswordStreamsAZip(t *testing.T) {
	ts := testutil.New(t)
	boss := ts.Register("archiveokboss")
	promoteAdmin(t, ts, boss.ID)

	// testutil derives the password from the username (RegisterRaw).
	body := `{"groups":["core"],"confirmPassword":"correct-horse-archiveokboss"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/platform-archive/export",
		strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+boss.Access)
	rec := httptest.NewRecorder()
	ts.Srv.Router().ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code, "body: %s", rec.Body.String())
	assert.Equal(t, "application/zip", rec.Header().Get("Content-Type"))
	// Cache-Control: no-store is REQUIRED — this response is every password
	// hash on the deploy and must never sit in a proxy or a disk cache.
	assert.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
	assert.Equal(t, "nosniff", rec.Header().Get("X-Content-Type-Options"))
	assert.Contains(t, rec.Header().Get("Content-Disposition"), "ggd-platform-archive-")
	assert.True(t, bytes.HasPrefix(rec.Body.Bytes(), []byte("PK")), "the body must be a ZIP")

	// The call is audited: who, when, what.
	entries, _, err := ts.Srv.Admin.ListAudit(context.Background(), 1, 50)
	require.NoError(t, err)
	found := false
	for _, e := range entries {
		if e.Action == platformarchive.ActionExport && e.AdminID == boss.ID {
			found = true
		}
	}
	assert.True(t, found, "every export must leave an audit line")
}
