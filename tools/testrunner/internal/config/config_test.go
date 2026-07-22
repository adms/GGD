package config

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const goodYAML = `
suites:
  - id: shared-unit
    name: "shared tests"
    category: unit
    cwd: packages/shared
    cmd: ["pnpm", "test"]
    parallelSafe: true
    enabled: true
  - id: regression-golden
    category: regression
    cwd: .
    cmd: ["go", "test", "./..."]
    enabled: false
    comment: "placeholder"
`

func TestParseValid(t *testing.T) {
	reg, err := Parse([]byte(goodYAML))
	require.NoError(t, err)
	require.Len(t, reg.Suites, 2)

	s, ok := reg.ByID("shared-unit")
	require.True(t, ok)
	assert.Equal(t, "packages/shared", s.Cwd)
	assert.Equal(t, []string{"pnpm", "test"}, s.Cmd)
	assert.True(t, s.Enabled)

	// Defaults: name falls back to id, cwd to ".".
	r, ok := reg.ByID("regression-golden")
	require.True(t, ok)
	assert.Equal(t, "regression-golden", r.Name)
	assert.Equal(t, ".", r.Cwd)
	assert.False(t, r.Enabled)
}

func TestParseRejectsBadRegistries(t *testing.T) {
	cases := map[string]string{
		"duplicate id": `
suites:
  - {id: a, category: unit, cmd: ["true"], enabled: true}
  - {id: a, category: unit, cmd: ["true"], enabled: true}`,
		"invalid category": `
suites:
  - {id: a, category: smoke, cmd: ["true"], enabled: true}`,
		"empty cmd": `
suites:
  - {id: a, category: unit, cmd: [], enabled: true}`,
		"absolute cwd": `
suites:
  - {id: a, category: unit, cwd: /etc, cmd: ["true"], enabled: true}`,
		"cwd escapes repo": `
suites:
  - {id: a, category: unit, cwd: ../../outside, cmd: ["true"], enabled: true}`,
		"uppercase id": `
suites:
  - {id: NotKebab, category: unit, cmd: ["true"], enabled: true}`,
		"unknown field (typo cannot silently disable safety)": `
suites:
  - {id: a, category: unit, cmd: ["true"], enabld: true}`,
		"no suites": `suites: []`,
	}
	for name, y := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := Parse([]byte(y))
			assert.Error(t, err)
		})
	}
}

func TestCategoryRankPinsRegressionLast(t *testing.T) {
	for _, c := range Categories {
		if c == "regression" {
			continue
		}
		assert.Less(t, CategoryRank(c), CategoryRank("regression"),
			"category %q must rank before regression", c)
	}
}

func TestRefuseProduction(t *testing.T) {
	env := func(v string) func(string) string {
		return func(k string) string {
			if k == "APP_ENV" {
				return v
			}
			return ""
		}
	}
	assert.NoError(t, RefuseProduction(env("")))
	assert.NoError(t, RefuseProduction(env("dev")))
	assert.NoError(t, RefuseProduction(env("test")))
	for _, v := range []string{"production", "PRODUCTION", "prod"} {
		err := RefuseProduction(env(v))
		require.Error(t, err, v)
		assert.True(t, strings.Contains(err.Error(), "refuses"))
	}
}

func TestRealSuitesYamlIsValid(t *testing.T) {
	// The committed registry must always parse — it is a source of truth.
	reg, err := Load("../../suites.yaml")
	require.NoError(t, err)
	assert.NotEmpty(t, reg.Suites)
	// It must contain at least one regression entry so the "regression last"
	// phase is visible in the dashboard even while disabled.
	found := false
	for _, s := range reg.Suites {
		if s.Category == "regression" {
			found = true
		}
	}
	assert.True(t, found, "suites.yaml should declare a regression suite (may be disabled)")
}
