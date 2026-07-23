package combatenv_test

import (
	"os"
	"path/filepath"
	"regexp"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/combatenv"
	"github.com/ggd/platform/pkg/testkit"
)

// sharedKeysRe pulls the quoted entries out of the COMBAT_ENV_KEYS array
// literal in the shared sim package.
var sharedKeysRe = regexp.MustCompile(`(?s)COMBAT_ENV_KEYS\s*=\s*\[(.*?)\]`)
var quotedRe = regexp.MustCompile(`"([a-zA-Z]+)"`)

// combatenv-keys-in-sync: this package's Keys must match COMBAT_ENV_KEYS in
// packages/shared/src/sim/combatEnv.ts, which the package doc already names as
// the source of truth.
//
// This guard exists because the lists SILENTLY DRIFTED. Task #136 added
// abilityRange (ability reach/AoE, shipped at 0.6) to the shared sim and to
// content/config/combat-env.json, but not to the Go list — so for the whole
// life of that feature the admin 戰鬥系統 page could neither display nor edit
// the multiplier, and the platform quietly dropped the key from every table it
// served. Nothing failed; the console just had a hole in it. A doc comment
// asking the next person to remember was not enough, so this asserts it.
func TestKeysMatchTheSharedSimList(t *testing.T) {
	testkit.Cover(t, "combatenv-keys-in-sync")

	// apps/platform/internal/combatenv -> repo root
	root, err := filepath.Abs(filepath.Join("..", "..", "..", ".."))
	require.NoError(t, err)
	path := filepath.Join(root, "packages", "shared", "src", "sim", "combatEnv.ts")

	raw, err := os.ReadFile(path)
	require.NoError(t, err, "the shared sim key list is the source of truth and must be readable at %s", path)

	m := sharedKeysRe.FindSubmatch(raw)
	require.Len(t, m, 2, "could not find the COMBAT_ENV_KEYS array literal in %s", path)

	var shared []string
	for _, q := range quotedRe.FindAllSubmatch(m[1], -1) {
		shared = append(shared, string(q[1]))
	}
	require.NotEmpty(t, shared, "parsed an empty key list from %s — the guard would be vacuous", path)

	assert.ElementsMatch(t, shared, combatenv.Keys,
		"combatenv.Keys has drifted from COMBAT_ENV_KEYS in %s. A key added to the sim must be added here "+
			"too, or the admin console cannot see or edit it and the platform drops it from every table it serves.",
		path)
}
