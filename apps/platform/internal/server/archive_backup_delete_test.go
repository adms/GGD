// Package server_test — archive_backup_delete_test.go pins the ONE route that
// removes a pre-import backup, through the real router (task #243).
//
// WHY IT MATTERS. Each `data/_migration/backups/<UTC>.zip` is a full credential
// dump: same format as the export, so every account document and every
// $argon2id$ hash on the deploy. The automatic sweep is deliberately
// conservative (it may never remove the last one), which is exactly why the
// operator needs a deliberate delete — and why that delete has to be gated and
// audited like the rest of this surface, and must never accept anything but a
// UTC stamp.
package server_test

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

func deleteAs(t *testing.T, ts *testutil.TS, path, token string) int {
	t.Helper()
	req := httptest.NewRequest(http.MethodDelete, path, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	ts.Srv.Router().ServeHTTP(rec, req)
	return rec.Code
}

func TestBackupDeleteIsAdminGatedAndStampOnly(t *testing.T) {
	testkit.Cover(t, "arch-243-backup-delete")
	ts := testutil.New(t)
	plain := ts.Register("archivebackupplain")
	boss := ts.Register("archivebackupboss")
	promoteAdmin(t, ts, boss.ID)

	const real = "/api/v1/admin/platform-archive/backups/20260726-140311Z"

	assert.Equal(t, http.StatusUnauthorized, deleteAs(t, ts, real, ""),
		"deleting a backup must 401 without a session")
	assert.Equal(t, http.StatusForbidden, deleteAs(t, ts, real, plain.Access),
		"deleting a backup must 403 for a non-admin")

	// An admin, but no such backup on this host: a clean 404, not a 500 and not
	// a silent 200 that would let the console show a delete that never happened.
	assert.Equal(t, http.StatusNotFound, deleteAs(t, ts, real, boss.Access))

	// Nothing that is not a UTC second resolves. These are percent-encoded the
	// way the console's encodeURIComponent sends them, so chi routes them to the
	// handler as a single {stamp} segment and the parse is what refuses them —
	// the guard is in the code, not in the router's path cleaning.
	for _, bad := range []string{
		"..", "../../etc/passwd", "20260726-140311Z.zip", "20260726-140311",
		"20261326-140311Z", "not-a-stamp", "%2e%2e%2f%2e%2e%2fetc%2fpasswd",
	} {
		p := "/api/v1/admin/platform-archive/backups/" + url.PathEscape(bad)
		got := deleteAs(t, ts, p, boss.Access)
		require.Equal(t, http.StatusNotFound, got,
			"stamp %q must be refused as not-found, got %d", bad, got)
	}
}

func TestStatusReportsTheBackupRetentionPolicy(t *testing.T) {
	testkit.Cover(t, "arch-243-retention-reported")
	ts := testutil.New(t)
	boss := ts.Register("archivebackupstatus")
	promoteAdmin(t, ts, boss.ID)

	r := ts.Do(http.MethodGet, "/api/v1/admin/platform-archive/status", boss.Access, nil)
	require.Equal(t, http.StatusOK, r.Status, "status: %s", string(r.Raw))
	// The console builds its retention sentence from THESE numbers rather than
	// keeping a second copy, so their absence would silently turn the panel into
	// 「保留政策未知」 on a live host.
	assert.Contains(t, string(r.Raw), `"backupRetention"`)
	assert.Contains(t, string(r.Raw), `"ttlDays":90`)
	assert.Contains(t, string(r.Raw), `"minKeep":3`)
	assert.Contains(t, string(r.Raw), `"backupBytes"`)
}
