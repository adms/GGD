// pending_cap_test.go pins the #126 pending-registration CAP (sec-154-11): the
// approval gate turns every non-owner registration into a durable pending
// account, so without a ceiling a scripted /auth/register flood grows account
// files + permanent Redis index keys without bound. Register must refuse once
// the queue is full, exempt the owner, and leave a refused caller's name free.
package auth_test

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/config"
	"github.com/ggd/platform/internal/testutil"
)

// TestPendingCapBoundsTheApprovalQueue drives the whole wire path: approval gate
// on, a cap of 2, on a fresh deploy whose first registration is the (exempt)
// owner.
func TestPendingCapBoundsTheApprovalQueue(t *testing.T) {
	t.Setenv("GGD_REQUIRE_APPROVAL", "1") // read by server.New at construction
	ts := testutil.NewFreshDeploy(t, func(c *config.Config) { c.MaxPending = 2 })

	// The owner is force-approved and never pending, so the cap must not count it.
	owner := ts.Register("owner")
	require.NotEmpty(t, owner.Access, "the first account must claim ownership with a session")

	// Two pending registrations fill the queue.
	r1 := ts.RegisterRaw("alice", nil)
	require.Equal(t, http.StatusCreated, r1.Status, string(r1.Raw))
	require.Equal(t, http.StatusCreated, ts.RegisterRaw("bob", nil).Status)

	// The third is refused — the cap, not a 409/403 — with a 429 rate_limited.
	full := ts.RegisterRaw("carol", nil)
	require.Equal(t, http.StatusTooManyRequests, full.Status, string(full.Raw))
	require.Equal(t, "rate_limited", full.ErrCode())

	// The refused registration left NOTHING in the queue: exactly the two remain.
	pending := ts.Do(http.MethodGet, "/api/v1/admin/accounts/pending", owner.Access, nil)
	require.Equal(t, http.StatusOK, pending.Status)
	require.Equal(t, float64(2), pending.Body["total"], string(pending.Raw))

	// Approving one frees a slot AND proves carol's refused attempt rolled its
	// reservation back: the name the 429 supposedly took is free, so she lands.
	aliceID := r1.Body["account"].(map[string]any)["id"].(string)
	appr := ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+aliceID+"/approve", owner.Access, nil)
	require.Equal(t, http.StatusOK, appr.Status, string(appr.Raw))

	retry := ts.RegisterRaw("carol", nil)
	require.Equal(t, http.StatusCreated, retry.Status, string(retry.Raw))
}
