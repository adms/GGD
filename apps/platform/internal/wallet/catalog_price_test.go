package wallet_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	walletpkg "github.com/ggd/platform/internal/wallet"
)

// The FLAT champion price (owner 2026-07-30:「所有英雄藍水晶都是統一價，新上架
// 預設也是一樣價格」).
//
// These tests exist because the shape they replaced failed SILENTLY and in the
// expensive direction. content/config/store.json used to carry one line per
// champion; a champion with no line was FREE on both sides (client lockStateOf:
// `price === undefined` → "free"; server OwnsChampion: `!priced` → true), so
// the single most likely human error — ship a hero, forget the store edit —
// gave that hero away to everybody. It happened to godie-e00s and godie-ucrl on
// the night they were whitelisted.
//
// So the property under test is not "the flat price is applied". It is
// "the DEFAULT is PAID": everything the catalog does not explicitly know to be
// free must cost the configured price. Each test below breaks one specific way
// of getting back to 0.

// writeTree materialises a throwaway content tree: a store doc with the given
// flat cost + free list, and a champions collection index naming `roster`.
func writeTree(t *testing.T, storeJSON string, roster []string) string {
	t.Helper()
	dir := t.TempDir()
	write := func(rel, body string) {
		full := filepath.Join(dir, filepath.FromSlash(rel))
		require.NoError(t, os.MkdirAll(filepath.Dir(full), 0o750))
		require.NoError(t, os.WriteFile(full, []byte(body), 0o600))
	}
	write("config/store.json", storeJSON)
	entries := ""
	for i, id := range roster {
		if i > 0 {
			entries += ",\n"
		}
		entries += `    { "id": "` + id + `", "path": "champions/` + id + `.json", "hash": "0", "size": 0 }`
	}
	write("champions/_index.json", "{\n  \"collection\": \"champions\",\n  \"hash\": \"0\",\n  \"entries\": [\n"+entries+"\n  ]\n}")
	return dir
}

const flatStoreDoc = `{
  "id": "store",
  "schema": "config.store@1",
  "championUnlockCost": 300,
  "freeChampionIds": ["godie-free1", "godie-free2"],
  "mcoinRewards": { "placement1": 1, "placement2": 0, "placement3": 0, "placement4": 0 }
}`

// THE regression guard for the whole redesign: onboarding a champion must
// require NO store edit, and the champion must not be free.
//
// The tree below is the real one with ONE id added to the champions index and
// store.json left exactly as shipped — i.e. precisely the state that gave two
// heroes away last night. MUTATION: change PriceOf's final `return unlockCost`
// to `return 0` (or drop the `cat.PriceOf(id)` call in LoadCatalog for a bare
// 0) and this fails on the very first assertion.
func TestNewChampionIsPricedWithoutAnyStoreEdit(t *testing.T) {
	dir := writeTree(t, flatStoreDoc, []string{"godie-free1", "godie-free2", "godie-old", "godie-brandnew"})
	cat, err := walletpkg.LoadCatalog(dir)
	require.NoError(t, err)

	price, known := cat.ChampionPrice("godie-brandnew")
	assert.True(t, known,
		"a champion present in champions/_index.json must be KNOWN to the store — an unknown one 404s "+
			"on POST /wallet/champions/unlock and can never be favourited")
	assert.Equal(t, 300, price,
		"a champion nobody added to store.json must cost the flat championUnlockCost. If this is 0, "+
			"the flat-price redesign has been undone and every newly onboarded hero is a giveaway again")
	assert.Equal(t, 300, cat.PriceOf("godie-brandnew"))
	assert.False(t, cat.IsFreeChampion("godie-brandnew"))
	assert.NotContains(t, cat.FreeChampions(), "godie-brandnew",
		"FreeChampions() seeds every NEW ACCOUNT's owned roster — a champion landing here is given to "+
			"everyone who registers from then on")
	assert.Contains(t, cat.UnlockableChampions(), "godie-brandnew")
}

// The free list is the ONLY route to 0, and it works.
func TestFreeChampionIdsIsTheOnlyRouteToZero(t *testing.T) {
	dir := writeTree(t, flatStoreDoc, []string{"godie-free1", "godie-free2", "godie-old"})
	cat, err := walletpkg.LoadCatalog(dir)
	require.NoError(t, err)

	assert.Equal(t, 0, cat.PriceOf("godie-free1"))
	assert.Equal(t, 0, cat.PriceOf("godie-free2"))
	assert.Equal(t, []string{"godie-free1", "godie-free2"}, cat.FreeChampions())
	assert.Equal(t, []string{"godie-old"}, cat.UnlockableChampions())
}

// An id the content tree has never heard of is PRICED, not free — PriceOf is
// total on purpose. Membership is a separate question and ChampionPrice's bool
// is the one that answers it.
func TestUnknownChampionIsPricedNotFree(t *testing.T) {
	dir := writeTree(t, flatStoreDoc, []string{"godie-free1", "godie-old"})
	cat, err := walletpkg.LoadCatalog(dir)
	require.NoError(t, err)

	assert.Equal(t, 300, cat.PriceOf("godie-never-heard-of-it"))
	_, known := cat.ChampionPrice("godie-never-heard-of-it")
	assert.False(t, known, "an id absent from the content tree must still 404, not become buyable")
}

// A typo on freeChampionIds must not free anybody, and must be VISIBLE: the
// authored list and the resolved list differ, which is what the content guard
// in internal/curation compares.
func TestFreeListTypoFreesNobodyAndStaysVisible(t *testing.T) {
	doc := `{
  "id": "store",
  "schema": "config.store@1",
  "championUnlockCost": 300,
  "freeChampionIds": ["godie-free1", "godie-fre2"],
  "mcoinRewards": { "placement1": 1, "placement2": 0, "placement3": 0, "placement4": 0 }
}`
	dir := writeTree(t, doc, []string{"godie-free1", "godie-free2"})
	cat, err := walletpkg.LoadCatalog(dir)
	require.NoError(t, err)

	assert.Equal(t, 300, cat.PriceOf("godie-free2"), "the champion the typo meant to free still pays")
	assert.Equal(t, []string{"godie-free1"}, cat.FreeChampions())
	assert.Equal(t, []string{"godie-fre2", "godie-free1"}, cat.FreeChampionIDs(),
		"FreeChampionIDs must report the list AS AUTHORED, including the ghost — that difference is "+
			"the only signal a typo leaves")
}

// The doc is the price; the constant is only a fallback.
//
// ⚠️ SCOPE. This test loads a CONTENT TREE, so it pins「the shipped doc beats
// the compiled-in constant」and nothing more. It used to claim it pinned「an
// operator edit in 後台 → 商店經濟 must actually change what is charged」, and
// it never could: the console does not write content/, it writes the durable
// overlay, and until #241 the wallet never read that. The test was green
// throughout the whole time the page was write-only — a textbook ④ (斷言方向跟
// 缺陷無關). The operator-edit claim is now pinned end-to-end, over HTTP, by
// TestOperatorPriceEditReachesGetWallet in economy_api_test.go.
func TestUnlockCostComesFromTheDocNotTheConstant(t *testing.T) {
	doc := `{
  "id": "store",
  "schema": "config.store@1",
  "championUnlockCost": 175,
  "freeChampionIds": [],
  "mcoinRewards": { "placement1": 1, "placement2": 0, "placement3": 0, "placement4": 0 }
}`
	dir := writeTree(t, doc, []string{"godie-a", "godie-b"})
	cat, err := walletpkg.LoadCatalog(dir)
	require.NoError(t, err)

	require.NotEqual(t, walletpkg.CrystalUnlockCost, 175, "fixture must differ from the fallback to mean anything")
	assert.Equal(t, 175, cat.UnlockCost,
		"Catalog.UnlockCost must be the doc's number. If this reads 300 the admin console is a "+
			"decoration and the price is hard-coded again")
	assert.Equal(t, 175, cat.PriceOf("godie-a"))
	assert.Empty(t, cat.PriceDrift(175))
	assert.Equal(t, []string{"godie-a", "godie-b"}, cat.PriceDrift(walletpkg.CrystalUnlockCost),
		"PriceDrift against the CLIENT's stale fallback must still report — that warning is the only "+
			"thing that tells an operator an offline client will print the wrong number")
}

// An EMPTY free list is legal (the owner may want a fully uniform store) and
// must not brick the catalog: everything is simply priced.
func TestEmptyFreeListPricesEveryChampion(t *testing.T) {
	doc := `{
  "id": "store",
  "schema": "config.store@1",
  "championUnlockCost": 300,
  "freeChampionIds": [],
  "mcoinRewards": { "placement1": 1, "placement2": 0, "placement3": 0, "placement4": 0 }
}`
	dir := writeTree(t, doc, []string{"godie-a", "godie-b"})
	cat, err := walletpkg.LoadCatalog(dir)
	require.NoError(t, err)

	assert.Empty(t, cat.FreeChampions(),
		"an empty freeChampionIds means a NEW ACCOUNT is seeded with NO champions — legal, but it is "+
			"the whole reason the welcome 藍水晶 grant has to cover at least one unlock")
	assert.Equal(t, []string{"godie-a", "godie-b"}, cat.UnlockableChampions())
}

// A content-less boot keeps the fallback rather than collapsing to free.
func TestEmptyCatalogKeepsTheFallbackCost(t *testing.T) {
	cat := walletpkg.EmptyCatalog()
	assert.Equal(t, walletpkg.CrystalUnlockCost, cat.UnlockCost)
	assert.Equal(t, walletpkg.CrystalUnlockCost, cat.PriceOf("anything"))
}

// A negative flat price is refused at load rather than clamped: a negative cost
// would make UnlockChampion's `price == 0` branch miss and the spend ADD
// crystals.
func TestNegativeUnlockCostIsRejected(t *testing.T) {
	doc := `{
  "id": "store",
  "schema": "config.store@1",
  "championUnlockCost": -5,
  "freeChampionIds": [],
  "mcoinRewards": { "placement1": 1, "placement2": 0, "placement3": 0, "placement4": 0 }
}`
	dir := writeTree(t, doc, []string{"godie-a"})
	_, err := walletpkg.LoadCatalog(dir)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "negative championUnlockCost")
}

// The roster comes from the champions collection, so a champion doc that is
// only on disk (no index entry) is still picked up by the directory-scan
// fallback — the same two-step loadSkins uses.
func TestRosterFallsBackToADirectoryScan(t *testing.T) {
	dir := t.TempDir()
	write := func(rel, body string) {
		full := filepath.Join(dir, filepath.FromSlash(rel))
		require.NoError(t, os.MkdirAll(filepath.Dir(full), 0o750))
		require.NoError(t, os.WriteFile(full, []byte(body), 0o600))
	}
	write("config/store.json", flatStoreDoc)
	write("champions/godie-free1.json", `{"id":"godie-free1"}`)
	write("champions/godie-scan.json", `{"id":"godie-scan"}`)

	cat, err := walletpkg.LoadCatalog(dir)
	require.NoError(t, err)
	assert.Equal(t, []string{"godie-free1", "godie-scan"}, cat.ChampionIDs())
	assert.Equal(t, 300, cat.PriceOf("godie-scan"))
	assert.Equal(t, 0, cat.PriceOf("godie-free1"))
}
