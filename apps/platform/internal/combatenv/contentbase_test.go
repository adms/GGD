package combatenv_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/combatenv"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/pkg/testkit"
)

// writeContentEnv lays down a content/config/combat-env.json carrying the same
// shape the real content tree ships, and returns the content dir.
func writeContentEnv(t *testing.T, body string) string {
	t.Helper()
	dir := t.TempDir()
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "config"), 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "config", "combat-env.json"), []byte(body), 0o644))
	return dir
}

func newSvc(t *testing.T, contentDir string) *combatenv.Service {
	t.Helper()
	store, err := jsonstore.New(t.TempDir())
	require.NoError(t, err)
	return combatenv.New(store, nil, contentDir)
}

// The real tuning as authored in content/config/combat-env.json: a fast arena
// with big health pools, halved damage and shortened ability reach.
const tunedContent = `{
  "schema": "config.combat-env@1",
  "multipliers": {
    "cooldown": 0.25,
    "damageDealt": 0.5,
    "maxHealth": 8.0,
    "abilityRange": 0.6
  }
}`

// combatenv-content-base: the operator edits a DELTA OVER CONTENT, never a
// blank table.
//
// The bug this pins is a silent data-loss trap, not a cosmetic one. The
// platform used to know only the neutral all-1.0 table, so:
//
//	1. the console's 戰鬥系統 page rendered every slider at 1.0, which is NOT
//	   what the game was running — the content tree said 0.25 / 0.5 / 8.0 / 0.6;
//	2. a PUT is complete-desired-state, so saving ONE changed slider wrote 1.0
//	   over all sixteen other keys;
//	3. nothing errored, no file was corrupted, and the tuning simply stopped
//	   applying — the worst kind of failure to notice.
//
// So: the base an operator sees and saves from must be the content table.
func TestContentDefaultsAreTheEditingBase(t *testing.T) {
	testkit.Cover(t, "combatenv-content-base")
	svc := newSvc(t, writeContentEnv(t, tunedContent))

	// 1. A fresh deploy reports the CONTENT values, not the neutral ones.
	doc, stored, err := svc.GetStored()
	require.NoError(t, err)
	assert.False(t, stored, "nothing has been saved yet")
	assert.Equal(t, 0.25, doc.Multipliers["cooldown"])
	assert.Equal(t, 0.5, doc.Multipliers["damageDealt"])
	assert.Equal(t, 8.0, doc.Multipliers["maxHealth"])
	assert.Equal(t, 0.6, doc.Multipliers["abilityRange"])
	assert.Equal(t, 1.0, doc.Multipliers["moveSpeed"], "keys content has no opinion on stay neutral")
	assert.Len(t, doc.Multipliers, len(combatenv.Keys), "the admin table is always complete")

	// 2. Saving ONE key must not flatten the other sixteen. This is the exact
	//    gesture that used to destroy the tuning.
	saved, err := svc.Replace(context.Background(), map[string]float64{"moveSpeed": 1.4})
	require.NoError(t, err)
	assert.Equal(t, 1.4, saved.Multipliers["moveSpeed"])
	assert.Equal(t, 0.25, saved.Multipliers["cooldown"], "content tuning survives an unrelated edit")
	assert.Equal(t, 0.5, saved.Multipliers["damageDealt"])
	assert.Equal(t, 8.0, saved.Multipliers["maxHealth"])
	assert.Equal(t, 0.6, saved.Multipliers["abilityRange"])

	// 3. It survives a reload from the durable store.
	reloaded, stored, err := svc.GetStored()
	require.NoError(t, err)
	assert.True(t, stored)
	assert.Equal(t, saved.Multipliers, reloaded.Multipliers)

	// 4. An operator can still deliberately override a content value.
	over, err := svc.Replace(context.Background(), map[string]float64{"damageDealt": 1.0})
	require.NoError(t, err)
	assert.Equal(t, 1.0, over.Multipliers["damageDealt"], "an explicit 1.0 is honoured")
	assert.Equal(t, 0.25, over.Multipliers["cooldown"], "and still does not disturb the rest")
	assert.Equal(t, 1.0, over.Multipliers["moveSpeed"], "omitted keys fall back to content/neutral, not to the last save")
}

// combatenv-content-base-missing: no content file, unreadable content file and
// junk content file must all degrade to the neutral table rather than failing
// the service — this is a read of an optional, externally-owned tree.
func TestContentDefaultsDegradeGracefully(t *testing.T) {
	testkit.Cover(t, "combatenv-content-base-missing")

	for name, dir := range map[string]string{
		"empty contentDir":   "",
		"nonexistent path":   filepath.Join(t.TempDir(), "nope"),
		"no combat-env file": t.TempDir(),
		"malformed json":     writeContentEnv(t, "{not json"),
		"junk multipliers":   writeContentEnv(t, `{"schema":"config.combat-env@1","multipliers":{"cooldown":"fast","bogusKey":3}}`),
	} {
		t.Run(name, func(t *testing.T) {
			svc := newSvc(t, dir)
			doc, _, err := svc.GetStored()
			require.NoError(t, err, "an unreadable content tree must never fail the service")
			assert.Len(t, doc.Multipliers, len(combatenv.Keys))
			for _, k := range combatenv.Keys {
				// SHIPPED default, not a bare 1.0 (task #248). The eight 三圍
				// coefficients are not ×factors — their neutral value is the
				// WC3/design number (str→hp 25, int→mana 15, …), and falling
				// back to 1 would hand every champion ~4% of its intended
				// health on any host with an unreadable content tree.
				assert.Equal(t, combatenv.DefaultFor(k), doc.Multipliers[k], "%s falls back to its shipped default", k)
			}
		})
	}
}

// combatenv-content-base-public: the PUBLIC read the game-server consumes must
// still say NOTHING when no operator has saved. The game-server applies the
// content tree itself and merges the platform body over it per key, so echoing
// the content values back would be redundant at best; the load-bearing part is
// that it must not carry sixteen unintended 1.0s.
func TestPublicReadStaysSilentWhileUnconfigured(t *testing.T) {
	testkit.Cover(t, "combatenv-content-base-public")
	svc := newSvc(t, writeContentEnv(t, tunedContent))

	_, stored, err := svc.GetStored()
	require.NoError(t, err)
	assert.False(t, stored, "an unsaved deploy is reported as unstored, which is what empties the public body")

	_, err = svc.Replace(context.Background(), map[string]float64{"moveSpeed": 1.4})
	require.NoError(t, err)

	_, stored, err = svc.GetStored()
	require.NoError(t, err)
	assert.True(t, stored, "after a save the platform does have an opinion, and the public read carries it")
}
