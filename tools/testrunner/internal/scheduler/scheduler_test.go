package scheduler

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/testrunner/internal/config"
	"github.com/ggd/testrunner/internal/testkit"
)

func reg(t *testing.T) *config.Registry {
	t.Helper()
	// Deliberately listed with regression FIRST and categories shuffled: the
	// scheduler must still order by the fixed category order, regression last.
	r, err := config.Parse([]byte(`
suites:
  - {id: reg-golden, category: regression, cmd: ["true"], enabled: true}
  - {id: sec-authz, category: security, cmd: ["true"], enabled: true}
  - {id: unit-a, category: unit, cmd: ["true"], enabled: true}
  - {id: det-sim, category: determinism, cmd: ["true"], enabled: true}
  - {id: unit-b, category: unit, cmd: ["true"], enabled: true}
  - {id: int-api, category: integration, cmd: ["true"], enabled: true}
  - {id: unit-disabled, category: unit, cmd: ["true"], enabled: false, comment: "placeholder"}
`))
	require.NoError(t, err)
	return r
}

func ids(suites []config.Suite) []string {
	out := make([]string, len(suites))
	for i, s := range suites {
		out[i] = s.ID
	}
	return out
}

func TestRunAllOrdersCategoriesWithRegressionAlwaysLast(t *testing.T) {
	testkit.Cover(t, "infra-testrunner-regression-last") // docs/todo/infra.md infra-11

	plan, err := Plan(reg(t), Request{Mode: ModeAll})
	require.NoError(t, err)

	// Fixed category order, stable within category, regression pinned last,
	// disabled suites excluded.
	assert.Equal(t, []string{"unit-a", "unit-b", "int-api", "sec-authz", "det-sim", "reg-golden"}, ids(plan))
	assert.Equal(t, "regression", plan[len(plan)-1].Category)
}

func TestRegressionLastSurvivesCategoryListEdits(t *testing.T) {
	// Even if someone reorders config.Categories, CategoryRank hard-codes
	// regression to the max rank; Order must keep it last.
	suites := []config.Suite{
		{ID: "r", Category: "regression"},
		{ID: "u", Category: "unit"},
		{ID: "v", Category: "vuln"},
	}
	ordered := Order(suites)
	assert.Equal(t, "r", ordered[len(ordered)-1].ID)
}

func TestCategoryMode(t *testing.T) {
	plan, err := Plan(reg(t), Request{Mode: ModeCategory, Category: "unit"})
	require.NoError(t, err)
	assert.Equal(t, []string{"unit-a", "unit-b"}, ids(plan))

	_, err = Plan(reg(t), Request{Mode: ModeCategory, Category: "nope"})
	assert.Error(t, err)
}

func TestSuiteModeIsAllowListed(t *testing.T) {
	testkit.Cover(t, "infra-testrunner-allowlist") // docs/todo/infra.md infra-12

	// Known + enabled → planned.
	plan, err := Plan(reg(t), Request{Mode: ModeSuite, SuiteID: "unit-a"})
	require.NoError(t, err)
	assert.Equal(t, []string{"unit-a"}, ids(plan))

	// Unknown id → refused (nothing outside suites.yaml ever runs).
	_, err = Plan(reg(t), Request{Mode: ModeSuite, SuiteID: "rm -rf /"})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "allow-list")

	// Disabled suite → explicit error, not a silent skip.
	_, err = Plan(reg(t), Request{Mode: ModeSuite, SuiteID: "unit-disabled"})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "disabled")

	// Unknown mode → refused.
	_, err = Plan(reg(t), Request{Mode: "shell", SuiteID: "unit-a"})
	assert.Error(t, err)
}

func TestIDsModeForRerunFailed(t *testing.T) {
	plan, err := Plan(reg(t), Request{Mode: ModeIDs, IDs: []string{"det-sim", "unit-a"}})
	require.NoError(t, err)
	// Re-ordered by category even for explicit id lists.
	assert.Equal(t, []string{"unit-a", "det-sim"}, ids(plan))

	_, err = Plan(reg(t), Request{Mode: ModeIDs, IDs: []string{"unit-a", "ghost"}})
	assert.Error(t, err)
}
