package curation_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/admin"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// grantAdmin promotes an account to the admin role on the JSON truth. AdminOnly
// reloads the account per request, so the existing token gains admin rights.
func grantAdmin(t *testing.T, ts *testutil.TS, id string) {
	t.Helper()
	_, err := ts.Srv.Accounts.Update(context.Background(), id, func(a *account.Account) error {
		if !a.HasRole(admin.RoleAdmin) {
			a.Roles = append(a.Roles, admin.RoleAdmin)
		}
		return nil
	})
	require.NoError(t, err)
}

// whitelist-api-public-read: GET is public (no token), cacheable, and returns
// the empty document on a fresh install.
func TestAPIPublicRead(t *testing.T) {
	testkit.Cover(t, "whitelist-api-public-read")
	ts := testutil.New(t)

	r := ts.Do(http.MethodGet, "/api/v1/curation/whitelist", "", nil)
	require.Equal(t, http.StatusOK, r.Status, "public read, no token: %s", string(r.Raw))
	assert.Equal(t, float64(1), r.Body["version"])
	assert.Empty(t, r.Body["champions"])
	assert.Empty(t, r.Body["items"])
	assert.Empty(t, r.Body["abilities"])

	// The starter bundle preview is also public.
	r = ts.Do(http.MethodGet, "/api/v1/curation/whitelist/starter", "", nil)
	require.Equal(t, http.StatusOK, r.Status)
	champs, _ := r.Body["champions"].([]any)
	assert.GreaterOrEqual(t, len(champs), 10)
}

// whitelist-api-admin-write: writes require the admin role. No token → 401; a
// normal user → 403; an admin → 200 and the change is durable + publicly read.
func TestAPIAdminWrite(t *testing.T) {
	testkit.Cover(t, "whitelist-api-admin-write")
	ts := testutil.New(t)
	normal := ts.Register("normal")
	boss := ts.Register("boss")

	body := map[string]any{"champions": []string{"godie-e001"}, "items": []string{}, "abilities": []string{}}

	// No token → 401.
	r := ts.Do(http.MethodPut, "/api/v1/curation/whitelist", "", body)
	assert.Equal(t, http.StatusUnauthorized, r.Status)

	// Normal user → 403 admin_required.
	r = ts.Do(http.MethodPut, "/api/v1/curation/whitelist", normal.Access, body)
	assert.Equal(t, http.StatusForbidden, r.Status)
	assert.Equal(t, "admin_required", r.ErrCode())

	// Bulk + starter are equally gated for a normal user.
	r = ts.Do(http.MethodPost, "/api/v1/curation/whitelist/bulk", normal.Access,
		map[string]any{"kind": "champions", "enable": []string{"godie-e001"}})
	assert.Equal(t, http.StatusForbidden, r.Status)
	r = ts.Do(http.MethodPost, "/api/v1/curation/whitelist/starter", normal.Access, nil)
	assert.Equal(t, http.StatusForbidden, r.Status)

	// Promote boss → the same PUT now works.
	grantAdmin(t, ts, boss.ID)
	r = ts.Do(http.MethodPut, "/api/v1/curation/whitelist", boss.Access, body)
	require.Equal(t, http.StatusOK, r.Status, "admin PUT: %s", string(r.Raw))
	champs, _ := r.Body["champions"].([]any)
	assert.Equal(t, []any{"godie-e001"}, champs)

	// Public read now reflects the change.
	r = ts.Do(http.MethodGet, "/api/v1/curation/whitelist", "", nil)
	champs, _ = r.Body["champions"].([]any)
	assert.Equal(t, []any{"godie-e001"}, champs)
}

// whitelist-api-bulk: the bulk endpoint enables/disables one kind for an admin.
func TestAPIBulk(t *testing.T) {
	testkit.Cover(t, "whitelist-api-bulk")
	ts := testutil.New(t)
	boss := ts.Register("boss")
	grantAdmin(t, ts, boss.ID)

	r := ts.Do(http.MethodPost, "/api/v1/curation/whitelist/bulk", boss.Access,
		map[string]any{"kind": "abilities", "enable": []string{"godie-e001.ex", "godie-e002.ex"}})
	require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))
	abilities, _ := r.Body["abilities"].([]any)
	assert.ElementsMatch(t, []any{"godie-e001.ex", "godie-e002.ex"}, abilities)

	r = ts.Do(http.MethodPost, "/api/v1/curation/whitelist/bulk", boss.Access,
		map[string]any{"kind": "abilities", "disable": []string{"godie-e001.ex"}})
	require.Equal(t, http.StatusOK, r.Status)
	abilities, _ = r.Body["abilities"].([]any)
	assert.Equal(t, []any{"godie-e002.ex"}, abilities)

	// Unknown kind → 400.
	r = ts.Do(http.MethodPost, "/api/v1/curation/whitelist/bulk", boss.Access,
		map[string]any{"kind": "weapons", "enable": []string{"x"}})
	assert.Equal(t, http.StatusBadRequest, r.Status)
	assert.Equal(t, "bad_request", r.ErrCode())
}

// whitelist-api-starter: the admin one-click starter set applies the bundle and
// is written to durable truth + audited.
func TestAPIStarter(t *testing.T) {
	testkit.Cover(t, "whitelist-api-starter")
	ts := testutil.New(t)
	boss := ts.Register("boss")
	grantAdmin(t, ts, boss.ID)

	r := ts.Do(http.MethodPost, "/api/v1/curation/whitelist/starter", boss.Access, nil)
	require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))
	champs, _ := r.Body["champions"].([]any)
	assert.GreaterOrEqual(t, len(champs), 10)

	// Landed on the public read.
	r = ts.Do(http.MethodGet, "/api/v1/curation/whitelist", "", nil)
	champs, _ = r.Body["champions"].([]any)
	assert.GreaterOrEqual(t, len(champs), 10)

	// Audited alongside every other operator action.
	r = ts.Do(http.MethodGet, "/api/v1/admin/audit", boss.Access, nil)
	require.Equal(t, http.StatusOK, r.Status)
	entries, _ := r.Body["entries"].([]any)
	found := false
	for _, e := range entries {
		if m, ok := e.(map[string]any); ok && m["action"] == "curation.starter" {
			found = true
		}
	}
	assert.True(t, found, "starter-set application is audited")
}

// whitelist-api-reset-admin-only: 回到原廠設定 is the only route in this package
// that turns content OFF without the caller naming an id, so it must be
// unreachable without the admin role AND absent from the public mount.
func TestAPIResetIsAdminOnly(t *testing.T) {
	testkit.Cover(t, "whitelist-api-reset-admin-only")
	ts := testutil.New(t)
	normal := ts.Register("normal")
	boss := ts.Register("boss")

	body := map[string]any{"scopes": []string{"champions"}, "dryRun": true}

	// No token → 401. A normal user → 403. Both BEFORE any admin exists, so a
	// pass cannot come from the route simply not being mounted: the admin call
	// below proves it is.
	r := ts.Do(http.MethodPost, "/api/v1/curation/whitelist/reset", "", body)
	assert.Equal(t, http.StatusUnauthorized, r.Status)
	r = ts.Do(http.MethodPost, "/api/v1/curation/whitelist/reset", normal.Access, body)
	assert.Equal(t, http.StatusForbidden, r.Status)
	assert.Equal(t, "admin_required", r.ErrCode())

	// The snapshot + restore routes are gated identically.
	r = ts.Do(http.MethodGet, "/api/v1/curation/whitelist/snapshots", normal.Access, nil)
	assert.Equal(t, http.StatusForbidden, r.Status)
	r = ts.Do(http.MethodPost, "/api/v1/curation/whitelist/restore", normal.Access,
		map[string]any{"snapshotId": "x"})
	assert.Equal(t, http.StatusForbidden, r.Status)

	grantAdmin(t, ts, boss.ID)
	// Give the install something to reset FROM (a fresh whitelist has no
	// champions, which guard ③ refuses on purpose).
	r = ts.Do(http.MethodPost, "/api/v1/curation/whitelist/starter", boss.Access, nil)
	require.Equal(t, http.StatusOK, r.Status)
	r = ts.Do(http.MethodPost, "/api/v1/curation/whitelist/bulk", boss.Access,
		map[string]any{"kind": "champions", "enable": []string{"not-in-starter"}})
	require.Equal(t, http.StatusOK, r.Status)

	// Admin dry run: 200, and it names the extra id.
	r = ts.Do(http.MethodPost, "/api/v1/curation/whitelist/reset", boss.Access, body)
	require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))
	disable, _ := r.Body["disable"].(map[string]any)
	champsOff, _ := disable["champions"].([]any)
	assert.Equal(t, []any{"not-in-starter"}, champsOff)
	assert.Equal(t, true, r.Body["dryRun"])

	// It is NOT still enabled-by-accident: the dry run wrote nothing.
	r = ts.Do(http.MethodGet, "/api/v1/curation/whitelist", "", nil)
	champs, _ := r.Body["champions"].([]any)
	assert.Contains(t, champs, "not-in-starter")

	// Real run WITHOUT the confirmation count → 400, still nothing written.
	r = ts.Do(http.MethodPost, "/api/v1/curation/whitelist/reset", boss.Access,
		map[string]any{"scopes": []string{"champions"}})
	assert.Equal(t, http.StatusBadRequest, r.Status)

	// With it → 200, the id is gone, an undo point exists and it is audited as
	// its own action.
	r = ts.Do(http.MethodPost, "/api/v1/curation/whitelist/reset", boss.Access,
		map[string]any{"scopes": []string{"champions"}, "expect": map[string]any{"champions": 1}})
	require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))
	snapID, _ := r.Body["snapshotId"].(string)
	assert.NotEmpty(t, snapID)

	r = ts.Do(http.MethodGet, "/api/v1/curation/whitelist", "", nil)
	champs, _ = r.Body["champions"].([]any)
	assert.NotContains(t, champs, "not-in-starter")

	r = ts.Do(http.MethodGet, "/api/v1/curation/whitelist/snapshots", boss.Access, nil)
	require.Equal(t, http.StatusOK, r.Status)
	snaps, _ := r.Body["snapshots"].([]any)
	require.Len(t, snaps, 1)

	r = ts.Do(http.MethodGet, "/api/v1/admin/audit", boss.Access, nil)
	entries, _ := r.Body["entries"].([]any)
	found := false
	for _, e := range entries {
		if m, ok := e.(map[string]any); ok && m["action"] == "curation.reset" {
			found = true
		}
	}
	assert.True(t, found, "reset is audited under its own action, not curation.replace")

	// And the undo really undoes it.
	r = ts.Do(http.MethodPost, "/api/v1/curation/whitelist/restore", boss.Access,
		map[string]any{"snapshotId": snapID})
	require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))
	r = ts.Do(http.MethodGet, "/api/v1/curation/whitelist", "", nil)
	champs, _ = r.Body["champions"].([]any)
	assert.Contains(t, champs, "not-in-starter", "restore puts the operator's own id back")
}
