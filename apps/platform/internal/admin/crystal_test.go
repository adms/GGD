package admin_test

// 藍水晶 operator grants (task #225): a single-account grant beside the M幣
// grant, and 一鍵發放所有帳號 for every account at once. Both are admin-only,
// server-validated and audited — this file is the proof of all three.
//
// The tests live in internal/admin rather than internal/wallet on purpose: the
// audit writer and the AdminOnly middleware are here, and internal/wallet cannot
// import this package (admin imports wallet). They reuse admin_test.go's
// grantAdmin and auditHas helpers.

import (
	"context"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/admin"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// crystalOf reads an account's crystal balance off the admin profile — the same
// projection the console renders, so the test asserts what an operator sees.
func crystalOf(t *testing.T, ts *testutil.TS, adminAccess, id string) int {
	t.Helper()
	prof := ts.Do(http.MethodGet, "/api/v1/admin/accounts/"+id, adminAccess, nil)
	require.Equal(t, http.StatusOK, prof.Status, string(prof.Raw))
	w, ok := prof.Body["wallet"].(map[string]any)
	require.True(t, ok, "profile must carry a wallet: %s", string(prof.Raw))
	n, ok := w["crystal"].(float64)
	require.True(t, ok, "wallet must carry a crystal balance: %s", string(prof.Raw))
	return int(n)
}

// admin-crystal-grant: an admin grants 藍水晶 to ONE account. Grants are
// ADDITIVE (two grants stack), an unknown account is a clean 404, and every
// grant writes an audit line naming the target.
func TestCrystalGrantSingle(t *testing.T) {
	testkit.Cover(t, "admin-crystal-grant")
	ts := testutil.New(t)
	adminU := ts.Register("root")
	grantAdmin(t, ts, adminU.ID)
	target := ts.Register("player")

	require.Equal(t, 0, crystalOf(t, ts, adminU.Access, target.ID), "a fresh account starts at zero")

	r := ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+target.ID+"/crystal", adminU.Access,
		map[string]any{"amount": 500, "reason": "compensation"})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	assert.EqualValues(t, 500, r.Body["crystal"])

	// Additive, not absolute: a second grant tops the first one up.
	r = ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+target.ID+"/crystal", adminU.Access,
		map[string]any{"amount": 250})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	assert.EqualValues(t, 750, r.Body["crystal"])
	assert.Equal(t, 750, crystalOf(t, ts, adminU.Access, target.ID))

	// An unknown account is a 404 — and nothing was written for it.
	miss := ts.Do(http.MethodPost, "/api/v1/admin/accounts/nope/crystal", adminU.Access,
		map[string]any{"amount": 100})
	assert.Equal(t, http.StatusNotFound, miss.Status, string(miss.Raw))

	// Both successful grants are on the audit log.
	audit := ts.Do(http.MethodGet, "/api/v1/admin/audit", adminU.Access, nil)
	require.Equal(t, http.StatusOK, audit.Status)
	assert.True(t, auditHas(audit, "crystal_grant", target.ID), "every crystal grant must be audited")
	assert.Equal(t, 2, auditCount(audit, "crystal_grant", target.ID), "one audit line per grant")
}

// admin-crystal-grant-authz: the crystal routes are behind the SAME gate as
// every other admin route — no token is 401, a valid NON-admin token is 403, and
// a refused call moves no balance. This is the server-side-only guarantee: there
// is no client-reachable door to crystals.
func TestCrystalGrantRequiresAdmin(t *testing.T) {
	testkit.Cover(t, "admin-crystal-grant-authz")
	ts := testutil.New(t)
	adminU := ts.Register("root")
	grantAdmin(t, ts, adminU.ID)
	thief := ts.Register("thief")
	victim := ts.Register("victim")

	for _, rt := range []struct{ path string }{
		{"/api/v1/admin/accounts/" + victim.ID + "/crystal"},
		{"/api/v1/admin/crystals/grant-all"},
	} {
		// No token at all → 401 from auth.Middleware, never a 200.
		anon := ts.Do(http.MethodPost, rt.path, "", map[string]any{"amount": 100})
		assert.Equal(t, http.StatusUnauthorized, anon.Status, "%s with no token", rt.path)

		// A valid non-admin token → 403 admin_required from AdminOnly.
		r := ts.Do(http.MethodPost, rt.path, thief.Access, map[string]any{"amount": 100})
		assert.Equal(t, http.StatusForbidden, r.Status, "%s for a non-admin", rt.path)
		assert.Equal(t, "admin_required", r.ErrCode(), "%s", rt.path)
	}

	// Nothing moved: a refused grant is a no-op, not a partial one.
	assert.Equal(t, 0, crystalOf(t, ts, adminU.Access, victim.ID))
	assert.Equal(t, 0, crystalOf(t, ts, adminU.Access, thief.ID))
}

// admin-crystal-amount-validation: amounts are validated SERVER-side on BOTH
// routes. Zero, negative, missing and absurdly large are all 400, and none of
// them touches a balance.
//
// Negative is refused rather than clamped for a specific reason: the meta record
// floors crystals at 0, so accepting -999999 would silently WIPE a player's
// balance instead of failing.
func TestCrystalGrantAmountValidation(t *testing.T) {
	testkit.Cover(t, "admin-crystal-amount-validation")
	ts := testutil.New(t)
	adminU := ts.Register("root")
	grantAdmin(t, ts, adminU.ID)
	target := ts.Register("player")

	// Give the target a real balance first, so a rejected grant is provably a
	// no-op rather than "0 either way".
	seed := ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+target.ID+"/crystal", adminU.Access,
		map[string]any{"amount": 300})
	require.Equal(t, http.StatusOK, seed.Status, string(seed.Raw))

	bad := []map[string]any{
		{"amount": 0},                         // zero
		{"amount": -100},                      // negative — must not wipe the balance
		{"reason": "no amount at all"},        // missing → decodes to 0
		{"amount": admin.MaxCrystalGrant + 1}, // over the cap
	}
	for _, body := range bad {
		r := ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+target.ID+"/crystal", adminU.Access, body)
		assert.Equal(t, http.StatusBadRequest, r.Status, "single grant %v", body)

		bulk := ts.Do(http.MethodPost, "/api/v1/admin/crystals/grant-all", adminU.Access, body)
		assert.Equal(t, http.StatusBadRequest, bulk.Status, "bulk grant %v", body)
	}
	assert.Equal(t, 300, crystalOf(t, ts, adminU.Access, target.ID), "no rejected amount may move a balance")

	// The cap itself is accepted — the bound is a typo guard, not an off-by-one.
	ok := ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+target.ID+"/crystal", adminU.Access,
		map[string]any{"amount": admin.MaxCrystalGrant})
	require.Equal(t, http.StatusOK, ok.Status, string(ok.Raw))
	assert.EqualValues(t, 300+admin.MaxCrystalGrant, ok.Body["crystal"])
}

// admin-crystal-grant-bulk: 一鍵發放所有帳號 grants EVERY account, reports the
// per-account counts, is REPEATABLE (unlike the #204 welcome backfill, which
// skips anyone who already has a meta record), and writes exactly ONE audit line
// carrying the affected-account count.
func TestCrystalGrantAll(t *testing.T) {
	testkit.Cover(t, "admin-crystal-grant-bulk")
	ts := testutil.New(t)
	adminU := ts.Register("root")
	grantAdmin(t, ts, adminU.ID)
	a := ts.Register("alice")
	b := ts.Register("bob")

	// Alice already has a balance (and therefore a walletmeta record) — the case
	// the welcome-seed backfill would SKIP. A bulk grant must top her up anyway.
	seed := ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+a.ID+"/crystal", adminU.Access,
		map[string]any{"amount": 100})
	require.Equal(t, http.StatusOK, seed.Status, string(seed.Raw))

	r := ts.Do(http.MethodPost, "/api/v1/admin/crystals/grant-all", adminU.Access,
		map[string]any{"amount": 1000, "reason": "新春發放"})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	assert.EqualValues(t, 3, r.Body["accounts"], "root + alice + bob")
	assert.EqualValues(t, 3, r.Body["granted"])
	assert.EqualValues(t, 0, r.Body["failed"])

	assert.Equal(t, 1100, crystalOf(t, ts, adminU.Access, a.ID), "an account with an existing record is topped up, not skipped")
	assert.Equal(t, 1000, crystalOf(t, ts, adminU.Access, b.ID))
	assert.Equal(t, 1000, crystalOf(t, ts, adminU.Access, adminU.ID), "the operator's own account is an account too")

	// REPEATABLE: a second run grants everybody again (this is not the one-off,
	// skip-if-seeded #204 backfill).
	again := ts.Do(http.MethodPost, "/api/v1/admin/crystals/grant-all", adminU.Access,
		map[string]any{"amount": 1000})
	require.Equal(t, http.StatusOK, again.Status, string(again.Raw))
	assert.EqualValues(t, 3, again.Body["granted"])
	assert.Equal(t, 2100, crystalOf(t, ts, adminU.Access, a.ID))

	// Durable: the bulk-granted balances are the JSON truth, not a Redis artefact.
	ts.Mini.FlushAll()
	require.NoError(t, ts.Srv.Boot(context.Background()))
	assert.Equal(t, 2000, crystalOf(t, ts, adminU.Access, b.ID))

	// ONE audit line per bulk run, against the "*" sentinel, carrying the counts.
	audit := ts.Do(http.MethodGet, "/api/v1/admin/audit", adminU.Access, nil)
	require.Equal(t, http.StatusOK, audit.Status)
	require.True(t, auditHas(audit, "crystal_grant_all", "*"), "the bulk grant must be audited")
	assert.Equal(t, 2, auditCount(audit, "crystal_grant_all", "*"), "one line per bulk operation, not one per account")
	detail := auditDetail(audit, "crystal_grant_all", "*")
	require.NotNil(t, detail)
	assert.EqualValues(t, 1000, detail["amount"])
	assert.EqualValues(t, 3, detail["accounts"], "the affected-account count is on the line")
	assert.EqualValues(t, 3, detail["granted"])
}

// ---- helpers ----------------------------------------------------------------

func auditCount(r testutil.Resp, action, targetID string) int {
	entries, ok := r.Body["entries"].([]any)
	if !ok {
		return 0
	}
	n := 0
	for _, e := range entries {
		if row, ok := e.(map[string]any); ok && row["action"] == action && row["targetId"] == targetID {
			n++
		}
	}
	return n
}

// auditDetail returns the detail map of the NEWEST matching entry (ListAudit
// sorts newest first).
func auditDetail(r testutil.Resp, action, targetID string) map[string]any {
	entries, ok := r.Body["entries"].([]any)
	if !ok {
		return nil
	}
	for _, e := range entries {
		row, ok := e.(map[string]any)
		if !ok || row["action"] != action || row["targetId"] != targetID {
			continue
		}
		if d, ok := row["detail"].(map[string]any); ok {
			return d
		}
	}
	return nil
}
