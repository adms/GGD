package combatenv_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/admin"
	"github.com/ggd/platform/internal/combatenv"
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

func multipliers(t *testing.T, r testutil.Resp) map[string]any {
	t.Helper()
	m, ok := r.Body["multipliers"].(map[string]any)
	require.True(t, ok, "multipliers map missing: %s", string(r.Raw))
	return m
}

// combatenv-api-admin: the combat-env table is admin-gated for writes and
// admin reads. No token → 401, a normal user → 403, an admin → 200. The fresh
// install is the neutral all-1.0 table with every one of the 17 keys present.
func TestAPIAdminAuthAndDefaults(t *testing.T) {
	testkit.Cover(t, "combatenv-api-admin")
	ts := testutil.New(t)
	normal := ts.Register("normal")
	boss := ts.Register("boss")

	// GET: no token → 401; normal user → 403.
	r := ts.Do(http.MethodGet, "/api/v1/admin/combat-env", "", nil)
	assert.Equal(t, http.StatusUnauthorized, r.Status)
	r = ts.Do(http.MethodGet, "/api/v1/admin/combat-env", normal.Access, nil)
	assert.Equal(t, http.StatusForbidden, r.Status)
	assert.Equal(t, "admin_required", r.ErrCode())

	// PUT: no token → 401; normal user → 403.
	body := map[string]any{"multipliers": map[string]any{"cooldown": 2.0}}
	r = ts.Do(http.MethodPut, "/api/v1/admin/combat-env", "", body)
	assert.Equal(t, http.StatusUnauthorized, r.Status)
	r = ts.Do(http.MethodPut, "/api/v1/admin/combat-env", normal.Access, body)
	assert.Equal(t, http.StatusForbidden, r.Status)

	// Promote boss → admin GET shows the SHIPPED default: the full table, every
	// ×factor 1.0 and every 三圍 coefficient at its WC3/design value (#248 —
	// the coefficients join this table rather than getting a second config
	// surface, so the console tunes them alongside everything else).
	grantAdmin(t, ts, boss.ID)
	r = ts.Do(http.MethodGet, "/api/v1/admin/combat-env", boss.Access, nil)
	require.Equal(t, http.StatusOK, r.Status, "admin GET: %s", string(r.Raw))
	m := multipliers(t, r)
	assert.Len(t, m, len(combatenv.Keys))
	for _, k := range combatenv.Keys {
		assert.Equal(t, combatenv.DefaultFor(k), m[k], "default %s", k)
	}
	// …and the two kinds really are distinct: a coefficient's default is not 1.
	assert.Equal(t, 25.0, m["strToMaxHealth"], "力量 → 生命 ships at WC3's 25")
	assert.Equal(t, 1.0, m["cooldown"], "a ×factor still ships neutral")
}

// combatenv-api-bounds: strict PUT validation — an unknown key, a factor
// below 0.1, and a factor above 10 are each a 400 and nothing persists.
func TestAPIPutBounds(t *testing.T) {
	testkit.Cover(t, "combatenv-api-bounds")
	ts := testutil.New(t)
	boss := ts.Register("boss")
	grantAdmin(t, ts, boss.ID)

	put := func(m map[string]any) testutil.Resp {
		return ts.Do(http.MethodPut, "/api/v1/admin/combat-env", boss.Access, map[string]any{"multipliers": m})
	}

	// Unknown key → 400.
	r := put(map[string]any{"bogusKey": 1.5})
	assert.Equal(t, http.StatusBadRequest, r.Status)
	assert.Equal(t, "bad_request", r.ErrCode())

	// Below the floor / above the ceiling → 400. The exact bounds are legal.
	r = put(map[string]any{"cooldown": 0.05})
	assert.Equal(t, http.StatusBadRequest, r.Status)
	r = put(map[string]any{"damageDealt": 10.5})
	assert.Equal(t, http.StatusBadRequest, r.Status)
	r = put(map[string]any{"cooldown": 0.1, "damageDealt": 10.0})
	assert.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))

	// One bad key in an otherwise-valid body rejects the WHOLE write…
	r = put(map[string]any{"cooldown": 2.0, "healing": 99.0})
	assert.Equal(t, http.StatusBadRequest, r.Status)
	// …and the previously saved table is untouched.
	r = ts.Do(http.MethodGet, "/api/v1/admin/combat-env", boss.Access, nil)
	require.Equal(t, http.StatusOK, r.Status)
	m := multipliers(t, r)
	assert.Equal(t, 0.1, m["cooldown"])
	assert.Equal(t, 10.0, m["damageDealt"])
}

// combatenv-api-roundtrip: a sparse PUT persists — present keys keep their
// value, omitted keys reset to 1.0, version/updatedAt are server-owned, and
// the saved table survives a fresh GET (jsonstore round-trip).
func TestAPIPutRoundTrip(t *testing.T) {
	testkit.Cover(t, "combatenv-api-roundtrip")
	ts := testutil.New(t)
	boss := ts.Register("boss")
	grantAdmin(t, ts, boss.ID)

	// Edge: multipliers omitted entirely → the neutral table (PUT-replace), 200.
	r := ts.Do(http.MethodPut, "/api/v1/admin/combat-env", boss.Access, map[string]any{})
	require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))

	r = ts.Do(http.MethodPut, "/api/v1/admin/combat-env", boss.Access, map[string]any{
		"multipliers": map[string]any{"cooldown": 0.5, "damageDealt": 2.0},
	})
	require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))
	m := multipliers(t, r)
	assert.Equal(t, 0.5, m["cooldown"])
	assert.Equal(t, 2.0, m["damageDealt"])
	assert.Equal(t, 1.0, m["healing"], "omitted key backfilled to neutral")
	assert.Len(t, m, len(combatenv.Keys), "response is always the full table")
	assert.NotEmpty(t, r.Body["updatedAt"])
	assert.Equal(t, float64(combatenv.SchemaVersion), r.Body["version"])

	// Fresh GET returns the persisted truth.
	r = ts.Do(http.MethodGet, "/api/v1/admin/combat-env", boss.Access, nil)
	require.Equal(t, http.StatusOK, r.Status)
	m = multipliers(t, r)
	assert.Equal(t, 0.5, m["cooldown"])
	assert.Equal(t, 2.0, m["damageDealt"])

	// A later sparse PUT that omits cooldown resets it to 1.0 (PUT-replace).
	r = ts.Do(http.MethodPut, "/api/v1/admin/combat-env", boss.Access, map[string]any{
		"multipliers": map[string]any{"damageDealt": 3.0},
	})
	require.Equal(t, http.StatusOK, r.Status)
	m = multipliers(t, r)
	assert.Equal(t, 1.0, m["cooldown"])
	assert.Equal(t, 3.0, m["damageDealt"])
}

// combatenv-api-public: the game-server reads GET /api/v1/combat-env WITHOUT
// a token (whitelist precedent). It is cacheable (Cache-Control max-age=10)
// and reflects the admin's last save.
func TestAPIPublicRead(t *testing.T) {
	testkit.Cover(t, "combatenv-api-public")
	ts := testutil.New(t)
	boss := ts.Register("boss")
	grantAdmin(t, ts, boss.ID)

	// Unauthenticated GET → 200 neutral table.
	req, err := http.NewRequest(http.MethodGet, ts.HTTP.URL+"/api/v1/combat-env", nil)
	require.NoError(t, err)
	resp, err := ts.HTTP.Client().Do(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Contains(t, resp.Header.Get("Cache-Control"), "max-age=10")
	resp.Body.Close()

	// Admin saves; the public read reflects it.
	r := ts.Do(http.MethodPut, "/api/v1/admin/combat-env", boss.Access, map[string]any{
		"multipliers": map[string]any{"moveSpeed": 1.5},
	})
	require.Equal(t, http.StatusOK, r.Status)

	r = ts.Do(http.MethodGet, "/api/v1/combat-env", "", nil)
	require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))
	m := multipliers(t, r)
	assert.Equal(t, 1.5, m["moveSpeed"])
	assert.Equal(t, 1.0, m["cooldown"])
}

// combatenv-api-unconfigured: an UNCONFIGURED platform must serve an EMPTY
// multipliers map on the public read, not the defaults-filled neutral table.
//
// Why this is not cosmetic: the game-server merges this body OVER the content
// defaults with admin keys winning PER KEY. A defaults-filled body therefore
// carries 17 explicit 1.0s that beat every content-authored multiplier — the
// content tree's cooldown 0.25 / damageDealt 0.5 / maxHealth 8.0 /
// abilityRange 0.6 would all silently revert to neutral as soon as a
// game-server could reach a fresh platform. Nothing in the tuning is lost on
// disk; it just stops applying, which is the worst kind of failure to notice.
//
// The ADMIN read keeps the full table — the console needs every key present to
// render the editor — and once an operator saves, the full table ships on the
// public read too, because at that point 1.0 is a deliberate choice (PUT
// semantics: omitted keys reset to neutral).
func TestAPIPublicReadUnconfigured(t *testing.T) {
	testkit.Cover(t, "combatenv-api-unconfigured")
	ts := testutil.New(t)
	boss := ts.Register("boss")
	grantAdmin(t, ts, boss.ID)

	// Nothing saved yet: the public read must carry NO opinion.
	r := ts.Do(http.MethodGet, "/api/v1/combat-env", "", nil)
	require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))
	assert.Empty(t, multipliers(t, r),
		"an unconfigured platform must not override content defaults")

	// The admin read still gets the full editable table.
	r = ts.Do(http.MethodGet, "/api/v1/admin/combat-env", boss.Access, nil)
	require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))
	assert.Len(t, multipliers(t, r), len(combatenv.Keys))

	// After a save the public read carries the operator's full, deliberate table.
	r = ts.Do(http.MethodPut, "/api/v1/admin/combat-env", boss.Access, map[string]any{
		"multipliers": map[string]any{"moveSpeed": 1.5},
	})
	require.Equal(t, http.StatusOK, r.Status)

	r = ts.Do(http.MethodGet, "/api/v1/combat-env", "", nil)
	require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))
	m := multipliers(t, r)
	assert.Len(t, m, len(combatenv.Keys))
	assert.Equal(t, 1.5, m["moveSpeed"])
}
