package wallet_test

// economy_api_test.go — THE ACCEPTANCE GUARD FOR TASK #241.
//
// One sentence: SAVE A PRICE IN 後台 → 商店經濟, AND `GET /wallet` MUST RETURN
// THAT PRICE — no restart, no page reload, no cache flush.
//
// Everything here runs against testutil.New, which boots the REAL platform
// through internal/server's composition root and serves the REAL router. The
// operator's write goes through the very HTTP route the admin console calls
// (`PUT /api/v1/content-overlay/docs/config/store`, which is what
// apps/admin/src/api.ts putOverlayDoc hits), and the player's read is the very
// route the client calls. Nothing here hand-builds a service or a handler,
// because "被測的不是出貨的那個" is exactly how this shipped broken: the console
// page had four levels of unit tests and every one of them passed.
//
// Fixture prices (testutil.WriteContentFixture): championUnlockCost 900,
// freeChampionIds [sela thorne], roster [sela thorne vex]. So `vex` is the
// priced champion in every test below.

import (
	"context"
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

const overlayStoreRoute = "/api/v1/content-overlay/docs/config/store"

// grantAdmin / grantCrystals live in meta_test.go — same test package.

// storeDoc is the exact body 後台 → 商店經濟 sends: the WHOLE doc, mcoinRewards
// included (apps/admin/src/storeEconomy.ts storeDocFor).
func storeDoc(cost int, free []string) map[string]any {
	return map[string]any{
		"id":                 "store",
		"schema":             "config.store@1",
		"championUnlockCost": cost,
		"freeChampionIds":    free,
		"mcoinRewards": map[string]any{
			"placement1": 200, "placement2": 120, "placement3": 80, "placement4": 50,
		},
	}
}

// saveEconomy performs the operator's save exactly as the console does.
func saveEconomy(t *testing.T, ts *testutil.TS, adminToken string, cost int, free []string) {
	t.Helper()
	r := ts.Do(http.MethodPut, overlayStoreRoute, adminToken, storeDoc(cost, free))
	require.Equal(t, http.StatusOK, r.Status, "console save rejected: %s", string(r.Raw))
}

// walletCost reads the number the champ-select 「🔓 解鎖 (N 水晶)」 button prints.
func walletCost(t *testing.T, ts *testutil.TS, token string) int {
	t.Helper()
	r := ts.Do(http.MethodGet, "/api/v1/wallet", token, nil)
	require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))
	v, ok := r.Body["crystalUnlockCost"].(float64)
	require.True(t, ok, "crystalUnlockCost missing from GET /wallet: %s", string(r.Raw))
	return int(v)
}

func ownedChampions(t *testing.T, ts *testutil.TS, token string) []string {
	t.Helper()
	r := ts.Do(http.MethodGet, "/api/v1/wallet", token, nil)
	require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))
	raw, _ := r.Body["ownedChampions"].([]any)
	out := make([]string, 0, len(raw))
	for _, v := range raw {
		if s, ok := v.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

func catalogPrice(t *testing.T, ts *testutil.TS, token, champion string) int {
	t.Helper()
	r := ts.Do(http.MethodGet, "/api/v1/store/catalog", token, nil)
	require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))
	rows, _ := r.Body["champions"].([]any)
	for _, row := range rows {
		m, ok := row.(map[string]any)
		if !ok || m["id"] != champion {
			continue
		}
		p, ok := m["price"].(float64)
		require.True(t, ok, "price missing on %s: %s", champion, string(r.Raw))
		return int(p)
	}
	t.Fatalf("champion %s absent from /store/catalog: %s", champion, string(r.Raw))
	return 0
}

// ─────────────────────────────────────────────────────────────────────────────
// THE GUARD. This is the whole task.
//
// MUTATION (「請求時讀覆寫」→「用開機時載的」): in meta.go overlayMeta, change
//
//	w.CrystalUnlockCost = s.UnlockCost()   →   w.CrystalUnlockCost = s.cat.UnlockCost
//
// and this test fails at the "the price the player is told" assertion with
// 900 != 111 — i.e. exactly the shipped defect, reproduced.
//
// MUTATION (drop the persistence step): in economy.go EconomyOverride, return
// `Economy{}, false` unconditionally (or delete the s.store.Get call) and the
// same assertion fails the same way — proving the durable read, not just the
// in-memory hand-off, is load-bearing.
func TestOperatorPriceEditReachesGetWallet(t *testing.T) {
	ts := testutil.New(t)
	player := ts.Register("player")
	boss := ts.Register("boss")
	grantAdmin(t, ts, boss.ID)

	// Shipped state. This read also WARMS the Redis wallet mirror, so the
	// assertion after the save additionally proves a warm cache cannot hide an
	// operator's edit.
	require.Equal(t, 900, walletCost(t, ts, player.Access), "fixture ships championUnlockCost 900")
	require.Equal(t, 900, catalogPrice(t, ts, player.Access, "vex"))

	// The operator saves 111 — same route, same body, same token shape as the
	// console. Nothing is restarted and no client reloads.
	saveEconomy(t, ts, boss.Access, 111, []string{"sela", "thorne"})

	assert.Equal(t, 111, walletCost(t, ts, player.Access),
		"the price the player is told did not move. This is the #241 defect: the console saved, "+
			"answered ✓ 已寫入, and the platform went on charging the boot-time content value")
	assert.Equal(t, 111, catalogPrice(t, ts, player.Access, "vex"),
		"the lobby store still quotes the old price — /store/catalog must read the same effective "+
			"catalog the wallet does, or the two screens disagree about what a champion costs")
}

// Telling the player a new price and then charging the old one would be the same
// bug wearing a different hat, so the SPEND is pinned separately.
//
// MUTATION: in meta.go UnlockChampion, change `s.effective().ChampionPrice(...)`
// back to `s.cat.ChampionPrice(...)` — GET /wallet still says 111 (overlayMeta
// is a different call site), the player is charged 900, and this test fails on
// the balance.
func TestOperatorPriceEditChangesWhatIsActuallyCharged(t *testing.T) {
	ts := testutil.New(t)
	player := ts.Register("player")
	boss := ts.Register("boss")
	grantAdmin(t, ts, boss.ID)

	_, err := ts.Srv.Wallet.AddCrystal(context.Background(), player.ID, 500)
	require.NoError(t, err)

	// 500 crystals cannot afford the shipped 900.
	r := ts.Do(http.MethodPost, "/api/v1/wallet/champions/unlock", player.Access,
		map[string]any{"champion": "vex"})
	require.Equal(t, http.StatusPaymentRequired, r.Status, "%s", string(r.Raw))

	saveEconomy(t, ts, boss.Access, 111, []string{"sela", "thorne"})

	r = ts.Do(http.MethodPost, "/api/v1/wallet/champions/unlock", player.Access,
		map[string]any{"champion": "vex"})
	require.Equal(t, http.StatusOK, r.Status,
		"the same unlock that was 402 at 900 must succeed at 111: %s", string(r.Raw))
	assert.EqualValues(t, 389, r.Body["crystal"],
		"the DEDUCTION must be the operator's 111 (500-111=389). 500-900 floors at 0 and 500-300 "+
			"would be 200 — either number here means the charge is reading a different price than "+
			"the label")
}

// GUARD 1 OF THE TASK: 已解鎖的玩家不受影響.
//
// Ownership lives on the account JSON (OwnedChampions) and has nothing to do
// with price; the price only picks which BRANCH OwnsChampion takes. So an
// operator who triples the price must not repossess anybody's champion.
//
// MUTATION (「把 OwnsChampion 改成看價格」): in wallet.go OwnsChampion, replace
//
//	return contains(w.OwnedChampions, championID), nil
//
// with anything that consults the price, e.g.
//
//	return w.Crystal >= price, nil
//
// and the post-raise assertions fail: the unlocker (0 crystals left, price
// 90000) reads owns=false, and the second unlock attempt returns 402 instead of
// 409 already_owned.
func TestUnlockedPlayersSurviveAPriceChange(t *testing.T) {
	ts := testutil.New(t)
	player := ts.Register("player")
	stranger := ts.Register("stranger")
	boss := ts.Register("boss")
	grantAdmin(t, ts, boss.ID)

	saveEconomy(t, ts, boss.Access, 100, []string{"sela", "thorne"})
	_, err := ts.Srv.Wallet.AddCrystal(context.Background(), player.ID, 100)
	require.NoError(t, err)

	r := ts.Do(http.MethodPost, "/api/v1/wallet/champions/unlock", player.Access,
		map[string]any{"champion": "vex"})
	require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))
	require.EqualValues(t, 0, r.Body["crystal"], "the unlock spent everything he had")

	// The operator now makes vex 900x more expensive.
	saveEconomy(t, ts, boss.Access, 90000, []string{"sela", "thorne"})

	assert.Contains(t, ownedChampions(t, ts, player.Access), "vex",
		"a champion already on the account roster must survive any price change — ownership is "+
			"account state, not a function of what it costs today")

	r = ts.Do(http.MethodGet, "/api/v1/wallet/owns?champion=vex", player.Access, nil)
	require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))
	assert.Equal(t, true, r.Body["owns"],
		"the owner can no longer play the champion he paid for — OwnsChampion is consulting the "+
			"price instead of the roster")

	r = ts.Do(http.MethodPost, "/api/v1/wallet/champions/unlock", player.Access,
		map[string]any{"champion": "vex"})
	assert.Equal(t, http.StatusConflict, r.Status,
		"re-unlocking an owned champion must stay 409 already_owned at ANY price; a 402 here means "+
			"affordability is being checked before ownership")
	assert.Equal(t, "already_owned", r.ErrCode())

	// And the raise DID take effect for someone who does not own it.
	r = ts.Do(http.MethodGet, "/api/v1/wallet/owns?champion=vex", stranger.Access, nil)
	require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))
	assert.Equal(t, false, r.Body["owns"],
		"a player who never unlocked vex must not be handed it — otherwise the previous assertion "+
			"passes for the wrong reason (everybody owns everything)")
	assert.Equal(t, 90000, walletCost(t, ts, stranger.Access))
}

// The free list is live too: moving a champion onto it must free it for the
// NEXT read, and moving it off must re-price it. Both directions, because a
// one-way test passes on an implementation that only ever adds.
func TestFreeListIsLiveInBothDirections(t *testing.T) {
	ts := testutil.New(t)
	player := ts.Register("player")
	boss := ts.Register("boss")
	grantAdmin(t, ts, boss.ID)

	require.Equal(t, 900, catalogPrice(t, ts, player.Access, "vex"))

	saveEconomy(t, ts, boss.Access, 900, []string{"sela", "thorne", "vex"})
	assert.Equal(t, 0, catalogPrice(t, ts, player.Access, "vex"), "vex was put on the free list")

	saveEconomy(t, ts, boss.Access, 900, []string{"sela"})
	assert.Equal(t, 900, catalogPrice(t, ts, player.Access, "vex"), "vex was taken off the free list")
	assert.Equal(t, 900, catalogPrice(t, ts, player.Access, "thorne"),
		"thorne was ALSO taken off the free list — a starter hero must become priced when the "+
			"operator removes it, or the free list is append-only in practice")
}

// Reverting the overlay entry (後台 → 內容管理「還原成出貨版」, i.e.
// DELETE /content-overlay/entries/{c}/{id}) must put the shipped price back.
// A one-way override is a trap: the operator would have no way home.
func TestRevertingTheOverrideRestoresTheShippedPrice(t *testing.T) {
	ts := testutil.New(t)
	player := ts.Register("player")
	boss := ts.Register("boss")
	grantAdmin(t, ts, boss.ID)

	saveEconomy(t, ts, boss.Access, 111, []string{"sela", "thorne"})
	require.Equal(t, 111, walletCost(t, ts, player.Access))

	r := ts.Do(http.MethodDelete, "/api/v1/content-overlay/entries/config/store", boss.Access, nil)
	require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))

	assert.Equal(t, 900, walletCost(t, ts, player.Access),
		"reverting the overlay entry must fall back to content/config/store.json")
}

// A TOMBSTONE (DELETE /content-overlay/docs/...) means "this doc does not exist
// in the merged tree". For a price that must NOT read as free — it reads as
// shipped, which is the fail-safe direction and the one the free-champion
// giveaway bugs taught.
func TestTombstonedStoreDocFallsBackToShippedNotFree(t *testing.T) {
	ts := testutil.New(t)
	player := ts.Register("player")
	boss := ts.Register("boss")
	grantAdmin(t, ts, boss.ID)

	saveEconomy(t, ts, boss.Access, 111, []string{"sela", "thorne"})
	require.Equal(t, 111, walletCost(t, ts, player.Access))

	r := ts.Do(http.MethodDelete, overlayStoreRoute, boss.Access, nil)
	require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))

	assert.Equal(t, 900, walletCost(t, ts, player.Access))
	assert.Equal(t, 900, catalogPrice(t, ts, player.Access, "vex"),
		"a tombstoned store doc must never make every champion free")
}

// ─────────────────────────────────────────────────────────────────────────────
// DRIFT GUARD for the three strings economy.go copies out of
// internal/contentoverlay (it cannot import it: contentoverlay → admin → wallet
// is a cycle). The first two are compared directly; the third is proved by
// reading back a doc the console's own HTTP route just wrote.
//
// MUTATION: change any of wallet.OverlayCollection / OverlayDocID /
// OverlayStoreKey and this fails immediately — instead of every price silently
// reverting to shipped with a green suite, which is what a bare copy would do.
func TestOverlayStorageIdentifiersMatchContentOverlay(t *testing.T) {
	assert.Equal(t, contentoverlay.Collection, walletpkg.OverlayCollection)
	assert.Equal(t, contentoverlay.DocID, walletpkg.OverlayDocID)

	ts := testutil.New(t)
	boss := ts.Register("boss")
	grantAdmin(t, ts, boss.ID)
	saveEconomy(t, ts, boss.Access, 111, []string{"sela"})

	store, err := jsonstore.New(ts.Cfg.DataDir)
	require.NoError(t, err)
	var o contentoverlay.Overlay
	require.NoError(t, store.Get(walletpkg.OverlayCollection, walletpkg.OverlayDocID, &o))

	raw, ok := o.Docs[walletpkg.OverlayStoreKey]
	require.True(t, ok,
		"the console wrote config/store but wallet.OverlayStoreKey (%q) does not name it — "+
			"contentoverlay's map-key format changed and every operator price edit is being "+
			"silently ignored. Keys present: %v", walletpkg.OverlayStoreKey, o.Keys())

	var doc map[string]any
	require.NoError(t, json.Unmarshal(raw, &doc))
	assert.EqualValues(t, 111, doc["championUnlockCost"])
}
