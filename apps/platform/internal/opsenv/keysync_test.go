package opsenv_test

import (
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/opsenv"
	"github.com/ggd/platform/pkg/testkit"
)

// ---------------------------------------------------------------- parsing ---

var (
	keysArrayRe = regexp.MustCompile(`(?s)SERVER_OPS_KEYS\s*=\s*\[(.*?)\]`)
	quotedRe    = regexp.MustCompile(`"([a-zA-Z]+)"`)
)

// parseKeys pulls the quoted entries out of a `SERVER_OPS_KEYS = [...]` array
// literal. Split out of the test body so the guard itself can be exercised
// against a synthetic source (TestDriftGuardIsNotVacuous) — a guard nobody has
// ever seen fail is a guard nobody knows works.
func parseKeys(src []byte) []string {
	m := keysArrayRe.FindSubmatch(src)
	if len(m) != 2 {
		return nil
	}
	var out []string
	for _, q := range quotedRe.FindAllSubmatch(m[1], -1) {
		out = append(out, string(q[1]))
	}
	return out
}

// numConst reads `NAME = <number>` out of a TS source.
func numConst(t *testing.T, src []byte, name, path string) float64 {
	t.Helper()
	re := regexp.MustCompile(name + `\s*=\s*([0-9]+(?:\.[0-9]+)?)`)
	m := re.FindSubmatch(src)
	require.Len(t, m, 2, "could not find `%s = <number>` in %s", name, path)
	v, err := strconv.ParseFloat(string(m[1]), 64)
	require.NoError(t, err)
	return v
}

func repoRoot(t *testing.T) string {
	t.Helper()
	// apps/platform/internal/opsenv -> repo root
	root, err := filepath.Abs(filepath.Join("..", "..", "..", ".."))
	require.NoError(t, err)
	return root
}

func mustRead(t *testing.T, path string) []byte {
	t.Helper()
	raw, err := os.ReadFile(path)
	require.NoError(t, err, "this file is a source of truth for the ops table and must be readable at %s", path)
	return raw
}

// -------------------------------------------------------------- the guard ---

// opsenv-keys-in-sync: the writable key set here must match SERVER_OPS_KEYS in
// apps/game-server/src/config/serverOps.ts, which the package doc names as the
// source of truth.
//
// This guard exists because the equivalent lists in combat-env SILENTLY
// DRIFTED. Task #136 added abilityRange to the shared sim and to the content
// tree but not to the Go list, so for the whole life of that feature the admin
// console could neither display nor edit the multiplier and the platform
// quietly dropped the key from every table it served. Nothing failed; the
// console just had a hole in it. Shipping the same shape of table without the
// same guard would be repeating a known bug on purpose.
func TestKeysMatchTheGameServerList(t *testing.T) {
	testkit.Cover(t, "opsenv-keys-in-sync")

	path := filepath.Join(repoRoot(t), "apps", "game-server", "src", "config", "serverOps.ts")
	keys := parseKeys(mustRead(t, path))
	require.NotEmpty(t, keys, "parsed an empty key list from %s — the guard would be vacuous", path)

	assert.ElementsMatch(t, keys, opsenv.Keys,
		"opsenv.Keys has drifted from SERVER_OPS_KEYS in %s. A knob added to the game-server must "+
			"be added here too, or the admin console cannot see or edit it and the platform drops "+
			"it from every table it serves.", path)

	// Every writable key must also carry a descriptor — the console renders
	// bounds and copy straight off the descriptor list, so a key with no
	// descriptor is a key the operator cannot see.
	var described []string
	for _, d := range opsenv.Descriptors {
		described = append(described, d.Key)
	}
	assert.ElementsMatch(t, opsenv.Keys, described, "every writable key needs a descriptor")
}

// opsenv-drift-guard-bites: the parse-and-compare above must actually FAIL when
// a knob is added on one side only. Run against a synthetic TS source so the
// guard is proven, not assumed.
func TestDriftGuardIsNotVacuous(t *testing.T) {
	testkit.Cover(t, "opsenv-drift-guard-bites")

	// A game-server file that grew a third knob nobody mirrored into Go.
	src := []byte(`export const SERVER_OPS_KEYS = ["maxRooms", "snapshotHz", "reconnectGraceSecs"] as const;`)
	keys := parseKeys(src)
	require.Len(t, keys, 3)
	assert.NotElementsMatch(t, keys, opsenv.Keys,
		"the guard would pass a TS list carrying a key Go does not know — it must not")

	// And the opposite direction: a knob dropped in TS while Go keeps it.
	src = []byte(`export const SERVER_OPS_KEYS = ["maxRooms"] as const;`)
	assert.NotElementsMatch(t, parseKeys(src), opsenv.Keys)

	// A file with no array literal at all parses to nothing, which the real test
	// rejects with require.NotEmpty rather than passing vacuously.
	assert.Empty(t, parseKeys([]byte("export const NOTHING = 1;")))
}

// opsenv-defaults-follow-constants: the defaults and bounds this package
// advertises must equal the numbers the game-server and the shared sim actually
// compile with.
//
// This is what makes "the ops table starts from whatever the netcode work
// lands" mechanical rather than a promise. A concurrent workflow moved
// SNAPSHOT_HZ 20 → 30 and INTERP_DELAY_MS 100 → 66 while this package was being
// written; nobody edits opsenv when that happens — either the advertised
// default already agrees, or this test goes red and names the file to fix.
func TestAdvertisedDefaultsMatchTheCompiledOnes(t *testing.T) {
	testkit.Cover(t, "opsenv-defaults-follow-constants")
	root := repoRoot(t)

	constsPath := filepath.Join(root, "packages", "shared", "src", "constants.ts")
	consts := mustRead(t, constsPath)

	tickHz := numConst(t, consts, "TICK_HZ", constsPath)
	assert.Equal(t, tickHz, float64(opsenv.TickHz),
		"opsenv.TickHz must mirror TICK_HZ in %s — the snapshot bounds are derived from it", constsPath)

	snapshotHz := numConst(t, consts, "SNAPSHOT_HZ", constsPath)
	assert.Equal(t, snapshotHz, float64(opsenv.DefaultSnapshotHz),
		"the console would advertise a snapshotHz default the server does not use (%s)", constsPath)

	interp := numConst(t, consts, "INTERP_DELAY_MS", constsPath)
	assert.Equal(t, interp, float64(opsenv.ClientInterpDelayMs),
		"the coupled snapshot rule is enforced against the interpolation delay shipped clients "+
			"compile with; a stale mirror would reject safe rates or accept stuttering ones (%s)",
		constsPath)

	// The snapshot bounds are DERIVED from TICK_HZ in snapshotRate.ts, so they
	// cannot be allowed to go stale underneath the validator.
	assert.Equal(t, tickHz/2, float64(opsenv.MinSnapshotHz))
	assert.Equal(t, tickHz, float64(opsenv.MaxSnapshotHz))

	regPath := filepath.Join(root, "apps", "game-server", "src", "rooms", "roomRegistry.ts")
	reg := mustRead(t, regPath)
	assert.Equal(t, numConst(t, reg, "DEFAULT_MAX_ROOMS", regPath), float64(opsenv.DefaultMaxRooms),
		"the shipped room ceiling (%s) and the one the console advertises must be the same number", regPath)
	assert.Equal(t, numConst(t, reg, "MIN_ROOM_CAPACITY", regPath), float64(opsenv.MinMaxRooms),
		"the platform validator and the game-server clamp must agree on the room-cap floor")
	assert.Equal(t, numConst(t, reg, "MAX_ROOM_CAPACITY", regPath), float64(opsenv.MaxMaxRooms),
		"the platform validator and the game-server clamp must agree on the room-cap ceiling")
}
