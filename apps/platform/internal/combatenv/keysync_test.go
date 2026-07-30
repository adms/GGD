package combatenv_test

import (
	"os"
	"path/filepath"
	"regexp"
	"strconv"
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

var attrDefaultsRe = regexp.MustCompile(`(?s)ATTRIBUTE_ENV_DEFAULTS\s*=\s*\{(.*?)\}`)
var pairRe = regexp.MustCompile(`([a-zA-Z]+):\s*([0-9.]+)`)

// Each coefficient now carries a PROVENANCE comment naming the file and field
// it came from ("war3mapMisc.txt StrRegenBonus = 0.04 (Blizzard MiscGame.txt:
// 0.05)"), and `pairRe` cheerfully reads `txt: 0.05` out of one as a ninth
// coefficient. Strip comments before parsing — the alternative is banning
// comments from the literal, and a wrong-source comment is precisely what this
// whole change exists to stop.
var lineCommentRe = regexp.MustCompile(`(?m)//.*$`)
var blockCommentRe = regexp.MustCompile(`(?s)/\*.*?\*/`)

// stripTSComments removes // and /* */ comments so only the code is parsed.
func stripTSComments(src []byte) []byte {
	return lineCommentRe.ReplaceAll(blockCommentRe.ReplaceAll(src, []byte(" ")), []byte(""))
}

// combatenv-attr-defaults-in-sync: the eight 三圍 COEFFICIENTS (task #248) are
// not ×factors — their neutral value is the Warcraft III number (力量→生命 25,
// 智慧→魔力 15, …), not 1.0. combatenv.AttrDefaults is what the platform
// backfills a pre-#248 document with and what the console offers as 重設, so a
// drift from the sim is not cosmetic: filling `strToMaxHealth` with 1.0 would
// serve a roster at roughly 4% of its intended health, silently, with nothing
// failing. Assert the map against the shared literal, key AND value.
func TestAttributeDefaultsMatchTheSharedSimTable(t *testing.T) {
	testkit.Cover(t, "combatenv-attr-defaults-in-sync")

	root, err := filepath.Abs(filepath.Join("..", "..", "..", ".."))
	require.NoError(t, err)
	path := filepath.Join(root, "packages", "shared", "src", "sim", "combatEnv.ts")
	raw, err := os.ReadFile(path)
	require.NoError(t, err)

	m := attrDefaultsRe.FindSubmatch(stripTSComments(raw))
	require.Len(t, m, 2, "could not find the ATTRIBUTE_ENV_DEFAULTS object literal in %s", path)

	shared := map[string]float64{}
	for _, p := range pairRe.FindAllSubmatch(m[1], -1) {
		v, convErr := strconv.ParseFloat(string(p[2]), 64)
		require.NoError(t, convErr)
		shared[string(p[1])] = v
	}
	require.Len(t, shared, 9, "expected the nine 三圍/派生 coefficients, parsed %d from %s", len(shared), path)

	assert.Equal(t, shared, combatenv.AttrDefaults,
		"combatenv.AttrDefaults has drifted from ATTRIBUTE_ENV_DEFAULTS in %s", path)

	// and every one of them must be a KNOWN key, or Replace would 400 the very
	// value the platform itself backfills.
	for k := range combatenv.AttrDefaults {
		assert.True(t, combatenv.KnownKey(k), "%s is an attribute default but not a known key", k)
		lo, hi := combatenv.Bounds(k)
		assert.Equal(t, combatenv.MinAttrCoef, lo, "%s should use the coefficient lower bound", k)
		assert.Equal(t, combatenv.MaxAttrCoef, hi, "%s should use the coefficient upper bound", k)
		assert.GreaterOrEqual(t, combatenv.AttrDefaults[k], lo)
		assert.LessOrEqual(t, combatenv.AttrDefaults[k], hi)
	}
}
