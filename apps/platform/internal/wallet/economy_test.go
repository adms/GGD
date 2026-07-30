package wallet_test

// economy_test.go — how the override reader behaves on documents it did NOT
// write: the pre-2026-07-30 `championPrices` shape that may still be sitting in
// `data/` on the family host, and the malformed cases an older build's ungated
// PUT endpoint (#283) could have accepted.
//
// The contract under test is one sentence: EVERY UNUSABLE OVERRIDE FALLS BACK
// TO THE SHIPPED PRICE, NEVER TO FREE. The champion-giveaway incidents
// (godie-e00s, godie-ucrl) all came from some path deciding that "I do not know
// what this costs" means 0, so each case below is checked against the shipped
// 900, not merely against "not the override's number".
//
// These write the durable file DIRECTLY, through contentoverlay's own exported
// Overlay type and jsonstore — deliberately, because the scenario IS "a file an
// older build left behind", and today's PUT gate would refuse some of them.

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/contentoverlay"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/testutil"
	walletpkg "github.com/ggd/platform/internal/wallet"
)

// writeLegacyOverlay drops raw bytes into the durable overlay under the
// config/store key, as an older build would have left them.
func writeLegacyOverlay(t *testing.T, ts *testutil.TS, body string) {
	t.Helper()
	store, err := jsonstore.New(ts.Cfg.DataDir)
	require.NoError(t, err)
	o := contentoverlay.EmptyOverlay()
	o.Docs[walletpkg.OverlayStoreKey] = json.RawMessage(body)
	require.NoError(t, store.Put(walletpkg.OverlayCollection, walletpkg.OverlayDocID, o))
}

// assertShippedPrices is the single expectation every rejection case shares.
func assertShippedPrices(t *testing.T, ts *testutil.TS, token string) {
	t.Helper()
	assert.Equal(t, 900, walletCost(t, ts, token),
		"an unusable override must serve the SHIPPED championUnlockCost")
	assert.Equal(t, 900, catalogPrice(t, ts, token, "vex"),
		"…and vex must still be priced. A 0 here is the giveaway bug: the operator's file was "+
			"unreadable and the store handed the champion out for free")
}

// THE MIGRATION CASE (openQuestion §3 of the task). A host that ran the
// pre-flat build may hold an override whose truth is a per-champion map. It has
// the right `schema` tag and no `championUnlockCost` at all.
//
// Decision: IGNORE IT WHOLE, loudly, and serve shipped until the operator saves
// 商店經濟 once. Applying the surviving half (`freeChampionIds`) would charge
// the shipped 300/900 for champions the old map had priced differently, and
// there is no way to collapse a 53-entry map into one flat number that is not a
// guess about the owner's intent.
func TestLegacyChampionPricesOverrideIsIgnoredWhole(t *testing.T) {
	ts := testutil.New(t)
	player := ts.Register("player")

	writeLegacyOverlay(t, ts, `{
      "id": "store",
      "schema": "config.store@1",
      "championPrices": { "sela": 0, "thorne": 0, "vex": 4321 },
      "mcoinRewards": { "placement1": 200, "placement2": 120, "placement3": 80, "placement4": 50 }
    }`)

	assertShippedPrices(t, ts, player.Access)
	assert.NotEqual(t, 4321, catalogPrice(t, ts, player.Access, "vex"),
		"the legacy per-champion map must NOT be honoured — the flat model has no field for it, and "+
			"half-reading the doc is how a champion gets mispriced")
}

// A legacy doc that carries a free list but no flat price is the same case: the
// free list is NOT applied on its own. Otherwise an old file could silently
// free a champion the current operator prices.
func TestLegacyDocFreeListAloneDoesNotApply(t *testing.T) {
	ts := testutil.New(t)
	player := ts.Register("player")

	writeLegacyOverlay(t, ts, `{
      "id": "store",
      "schema": "config.store@1",
      "freeChampionIds": ["sela", "thorne", "vex"]
    }`)

	assertShippedPrices(t, ts, player.Access)
}

// Some other config doc saved onto the config/store key (a mis-click in 內容管理)
// must not have its fields read as a price.
func TestWrongSchemaOverrideIsIgnored(t *testing.T) {
	ts := testutil.New(t)
	player := ts.Register("player")

	writeLegacyOverlay(t, ts, `{
      "id": "store",
      "schema": "config.arena-rules@1",
      "championUnlockCost": 7
    }`)

	assertShippedPrices(t, ts, player.Access)
}

// Out-of-range prices are REJECTED, not clamped. A clamp invents a number
// nobody chose and hides the bad write; shipped is at least a value the owner
// approved once. Negative is the dangerous one: UnlockChampion's `price == 0`
// branch would miss it and the "spend" would ADD crystals.
func TestOutOfRangePriceOverridesAreRejectedNotClamped(t *testing.T) {
	for name, body := range map[string]string{
		"negative": `{"id":"store","schema":"config.store@1","championUnlockCost":-5}`,
		"aboveMax": `{"id":"store","schema":"config.store@1","championUnlockCost":1000001}`,
	} {
		t.Run(name, func(t *testing.T) {
			ts := testutil.New(t)
			player := ts.Register("player")
			writeLegacyOverlay(t, ts, body)
			assertShippedPrices(t, ts, player.Access)
		})
	}
}

// The boundary values themselves ARE accepted — the bound is inclusive, and 0
// is a real setting (owner:「他隨時可以清空變成完全統一」, and a flat 0 means
// every champion free).
func TestBoundaryPricesAreAccepted(t *testing.T) {
	ts := testutil.New(t)
	player := ts.Register("player")

	writeLegacyOverlay(t, ts, `{"id":"store","schema":"config.store@1","championUnlockCost":0}`)
	assert.Equal(t, 0, walletCost(t, ts, player.Access))

	writeLegacyOverlay(t, ts, `{"id":"store","schema":"config.store@1","championUnlockCost":1000000}`)
	assert.Equal(t, 1000000, walletCost(t, ts, player.Access))
}

// Unparseable bytes under the key must not take the wallet down or zero a price.
func TestUnparseableOverrideDocFallsBackToShipped(t *testing.T) {
	ts := testutil.New(t)
	player := ts.Register("player")

	writeLegacyOverlay(t, ts, `"not an object"`)
	assertShippedPrices(t, ts, player.Access)
}

// A platform whose data dir holds no overlay at all (fresh install) serves
// shipped — and reads the file on every request without erroring about the
// missing one.
func TestNoOverlayServesShipped(t *testing.T) {
	ts := testutil.New(t)
	player := ts.Register("player")

	_, ok := ts.Srv.Wallet.EconomyOverride()
	assert.False(t, ok, "a fresh install has no override")
	assertShippedPrices(t, ts, player.Access)
}

// The SHIPPED catalog stays reachable and unmodified while an override is in
// force. gamelink holds a boot-time copy of it for the M COIN settlement
// rewards, so Catalog() must keep meaning "what content/ says" — if this ever
// starts returning the override, that copy silently diverges from this one.
func TestCatalogAccessorStaysTheShippedBase(t *testing.T) {
	ts := testutil.New(t)
	boss := ts.Register("boss")
	grantAdmin(t, ts, boss.ID)
	saveEconomy(t, ts, boss.Access, 111, []string{"sela"})

	assert.Equal(t, 900, ts.Srv.Wallet.Catalog().UnlockCost,
		"Catalog() is the boot-time base and must not move")
	assert.Equal(t, 111, ts.Srv.Wallet.EffectiveCatalog().UnlockCost,
		"EffectiveCatalog() is the one that carries the operator's edit")
	assert.Equal(t, 111, ts.Srv.Wallet.UnlockCost())
}

// The roster is content's answer, not the operator's: an override cannot invent
// a champion, so an unknown id must keep 404-ing on unlock/favourite even while
// a price override is live.
func TestOverrideCannotInventAChampion(t *testing.T) {
	ts := testutil.New(t)
	player := ts.Register("player")
	boss := ts.Register("boss")
	grantAdmin(t, ts, boss.ID)

	saveEconomy(t, ts, boss.Access, 111, []string{"sela", "ghost-hero"})

	r := ts.Do(http.MethodPost, "/api/v1/wallet/champions/unlock", player.Access,
		map[string]any{"champion": "ghost-hero"})
	assert.Equal(t, http.StatusNotFound, r.Status,
		"a free-list entry for an id the content tree does not ship must not become buyable: %s",
		string(r.Raw))

	r = ts.Do(http.MethodGet, "/api/v1/store/catalog", player.Access, nil)
	require.Equal(t, http.StatusOK, r.Status)
	assert.NotContains(t, string(r.Raw), "ghost-hero",
		"the store must list the CONTENT roster, never ids the price page happened to mention")
}
