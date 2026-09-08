package admin_test

import (
	"context"
	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/submissions"
	"github.com/ggd/platform/internal/testutil"
	"github.com/stretchr/testify/require"
	"net/http"
	"testing"
)

func TestPowerUserCertificationChangesLiveQuotaWithoutAdminAccess(t *testing.T) {
	ts := testutil.New(t)
	reviewer := ts.Register("reviewer")
	author := ts.Register("author")
	grantAdmin(t, ts, reviewer.ID)
	ts.Srv.HeroWorks.SetIntakePolicy(func() (submissions.HeroIntakePolicy, error) {
		return submissions.HeroIntakePolicy{Enabled: true, MaxPendingPerPlayer: 5, QuotaPerPlayerPerDay: 100, PowerUserQuotaPerDay: 200}, nil
	})
	path := "/api/v1/admin/accounts/" + author.ID + "/power-user"
	require.Equal(t, http.StatusUnauthorized, ts.Do(http.MethodPost, path, "", map[string]any{"certified": true}).Status)
	require.Equal(t, http.StatusForbidden, ts.Do(http.MethodPost, path, author.Access, map[string]any{"certified": true}).Status)
	quota := func(want int) {
		p, err := ts.Srv.HeroWorks.IntakePolicyForAccount(context.Background(), author.ID)
		require.NoError(t, err)
		require.Equal(t, want, p.QuotaPerPlayerPerDay)
		require.Equal(t, 5, p.MaxPendingPerPlayer)
		response := ts.Do(http.MethodGet, "/api/v1/hero-submissions/policy", author.Access, nil)
		require.Equal(t, http.StatusOK, response.Status)
		require.Equal(t, float64(want), response.Body["quotaPerPlayerPerDay"])

	}
	quota(100)
	require.Equal(t, http.StatusBadRequest, ts.Do(http.MethodPost, path, reviewer.Access, map[string]any{}).Status)
	for i := 0; i < 2; i++ {
		require.Equal(t, http.StatusOK, ts.Do(http.MethodPost, path, reviewer.Access, map[string]any{"certified": true}).Status)
	}
	quota(200)
	a, err := ts.Srv.Accounts.GetByID(context.Background(), author.ID)
	require.NoError(t, err)
	require.Equal(t, []string{account.RolePowerUser}, a.Roles)
	require.Equal(t, http.StatusForbidden, ts.Do(http.MethodGet, "/api/v1/admin/accounts", author.Access, nil).Status)
	require.Equal(t, http.StatusOK, ts.Do(http.MethodPost, path, reviewer.Access, map[string]any{"certified": false}).Status)
	quota(100)
	a, err = ts.Srv.Accounts.GetByID(context.Background(), author.ID)
	require.NoError(t, err)
	require.Empty(t, a.Roles)
}
