package wallet_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/config"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// seeded boots a deploy configured with the task-#204 welcome grant. testutil
// builds its Config by hand, so NewAccountCrystals is 0 unless a test opts in —
// which is exactly why every OTHER wallet/settlement test keeps its "a fresh
// wallet has zero crystals" baseline. This one opts in.
func seeded(t *testing.T, crystals int) *testutil.TS {
	t.Helper()
	return testutil.New(t, func(c *config.Config) { c.NewAccountCrystals = crystals })
}

// TestNewAccountSeededWithWelcomeCrystals: on a deploy that configures the
// welcome grant, a brand-new account starts with EXACTLY that many 藍水晶, and
// the balance is the durable JSON truth (it survives a Redis wipe).
func TestNewAccountSeededWithWelcomeCrystals(t *testing.T) {
	testkit.Cover(t, "meta-crystal-welcome-seed")
	ts := seeded(t, 1000)

	u := ts.Register("alice")
	require.EqualValues(t, 1000, wallet(ts, u.Access).Body["crystal"],
		"a new account must be seeded exactly the configured welcome grant")

	// Durable: the seed is written to the JSON store, not only the Redis mirror,
	// so it rebuilds after a cache wipe.
	ts.Mini.FlushAll()
	require.NoError(t, ts.Srv.Boot(context.Background()))
	require.EqualValues(t, 1000, wallet(ts, u.Access).Body["crystal"],
		"the welcome grant is durable, not a cache artefact")
}

// TestWelcomeSeedReconcilesWithUnlock: the seeded balance is spendable and the
// unlock debit reconciles exactly — 1000 seed − 900 price = 100 left, and the
// champion is now owned.
func TestWelcomeSeedReconcilesWithUnlock(t *testing.T) {
	testkit.Cover(t, "meta-crystal-welcome-unlock")
	ts := seeded(t, 1000)
	u := ts.Register("alice")

	r := ts.Do(http.MethodPost, "/api/v1/wallet/champions/unlock", u.Access,
		map[string]string{"champion": "vex"})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	require.EqualValues(t, 1000-vexCrystalPrice, r.Body["crystal"],
		"the unlock must debit exactly the champion price from the welcome grant")
	require.EqualValues(t, 100, wallet(ts, u.Access).Body["crystal"])
	require.Equal(t, []string{"sela", "thorne", "vex"}, strs(wallet(ts, u.Access).Body["ownedChampions"]))
}

// TestWelcomeSeedIsOncePerAccount: the seed is idempotent and never re-grants.
// Re-running it against an account that already has a meta record is a no-op,
// and an account that has already SPENT is not topped back up.
func TestWelcomeSeedIsOncePerAccount(t *testing.T) {
	testkit.Cover(t, "meta-crystal-welcome-idempotent")
	ts := seeded(t, 1000)
	u := ts.Register("alice")

	// A second, direct seed call grants nothing — the record already exists.
	granted, err := ts.Srv.Wallet.SeedNewAccountCrystals(context.Background(), u.ID)
	require.NoError(t, err)
	require.Equal(t, 0, granted, "a second seed must never re-grant")
	require.EqualValues(t, 1000, wallet(ts, u.Access).Body["crystal"])

	// Spend, then seed again: the balance is not restored toward the grant.
	r := ts.Do(http.MethodPost, "/api/v1/wallet/champions/unlock", u.Access,
		map[string]string{"champion": "vex"})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	granted, err = ts.Srv.Wallet.SeedNewAccountCrystals(context.Background(), u.ID)
	require.NoError(t, err)
	require.Equal(t, 0, granted, "a veteran with a meta record is never re-seeded")
	require.EqualValues(t, 100, wallet(ts, u.Access).Body["crystal"], "spending is not undone by a re-seed")
}

// TestWelcomeSeedOffByDefault: the default (0) test wiring seeds nothing, which
// is the property the settlement suite relies on. This documents it as a fact,
// not an accident.
func TestWelcomeSeedOffByDefault(t *testing.T) {
	testkit.Cover(t, "meta-crystal-welcome-default-off")
	ts := testutil.New(t) // no NewAccountCrystals override
	u := ts.Register("alice")
	require.EqualValues(t, 0, wallet(ts, u.Access).Body["crystal"],
		"with the grant unconfigured a new account starts at zero crystals")
}
