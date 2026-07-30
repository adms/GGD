package wallet_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// fund sets an absolute M COIN balance directly through the wallet service
// (tests only — players earn through match settlement).
func fund(t *testing.T, ts *testutil.TS, accountID string, mcoin int) {
	t.Helper()
	require.NoError(t, ts.Srv.Wallet.SetMCoinAbsolute(context.Background(), accountID, mcoin))
}

func wallet(ts *testutil.TS, token string) testutil.Resp {
	return ts.Do(http.MethodGet, "/api/v1/wallet", token, nil)
}

func strs(v any) []string {
	out := []string{}
	for _, x := range v.([]any) {
		out = append(out, x.(string))
	}
	return out
}

func TestStarterChampionsSeeded(t *testing.T) {
	testkit.Cover(t, "mcoin-starter-seeded")
	ts := testutil.New(t)
	u := ts.Register("alice")

	// First wallet read seeds every freeChampionIds entry; vex (not free-listed,
	// so it pays the fixture's flat 900) is not
	// free and must NOT be seeded.
	r := wallet(ts, u.Access)
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	require.EqualValues(t, 0, r.Body["mcoin"])
	require.Equal(t, []string{"sela", "thorne"}, strs(r.Body["ownedChampions"]))
	require.Empty(t, strs(r.Body["ownedSkins"]))
	require.Empty(t, r.Body["equippedSkins"])

	// The seed is persisted on the account JSON truth (not just the cache).
	acc, err := ts.Srv.Accounts.GetByID(context.Background(), u.ID)
	require.NoError(t, err)
	require.Equal(t, []string{"sela", "thorne"}, acc.OwnedChampions)
	require.NotNil(t, acc.OwnedSkins)
	require.NotNil(t, acc.EquippedSkins)
}

func TestBuyOK(t *testing.T) {
	testkit.Cover(t, "mcoin-buy-ok")
	ts := testutil.New(t)
	u := ts.Register("alice")
	fund(t, ts, u.ID, 2000)

	// Buy a skin: deducted, owned, auto-equipped.
	r := ts.Do(http.MethodPost, "/api/v1/store/buy", u.Access,
		map[string]string{"kind": "skin", "id": "skin.thorne.barbarian"})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	require.EqualValues(t, 1250, r.Body["mcoin"])
	require.Equal(t, []string{"skin.thorne.barbarian"}, strs(r.Body["ownedSkins"]))
	equipped := r.Body["equippedSkins"].(map[string]any)
	require.Equal(t, "skin.thorne.barbarian", equipped["thorne"], "purchase auto-equips")

	// Buy a priced champion — 英雄解鎖 is paid in 藍水晶, NOT M COIN (#227).
	grantCrystals(t, ts, u.ID, vexCrystalPrice)
	r = ts.Do(http.MethodPost, "/api/v1/store/buy", u.Access,
		map[string]string{"kind": "champion", "id": "vex"})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	require.EqualValues(t, 0, r.Body["crystal"], "the champion price came out of crystals")
	require.EqualValues(t, 1250, r.Body["mcoin"], "a champion unlock must not touch M COIN")
	require.Equal(t, []string{"sela", "thorne", "vex"}, strs(r.Body["ownedChampions"]))

	// Durable: the account JSON carries the post-purchase state (M COIN shows
	// only the skin deduction).
	acc, err := ts.Srv.Accounts.GetByID(context.Background(), u.ID)
	require.NoError(t, err)
	require.Equal(t, 1250, acc.MCoin)
	require.Equal(t, []string{"skin.thorne.barbarian"}, acc.OwnedSkins)

	// Unknown items are 404s; bad kind is a 400.
	require.Equal(t, http.StatusNotFound, ts.Do(http.MethodPost, "/api/v1/store/buy", u.Access,
		map[string]string{"kind": "skin", "id": "skin.nope"}).Status)
	require.Equal(t, http.StatusNotFound, ts.Do(http.MethodPost, "/api/v1/store/buy", u.Access,
		map[string]string{"kind": "champion", "id": "nope"}).Status)
	require.Equal(t, http.StatusBadRequest, ts.Do(http.MethodPost, "/api/v1/store/buy", u.Access,
		map[string]string{"kind": "mount", "id": "skin.thorne.barbarian"}).Status)
}

func TestBuyInsufficient(t *testing.T) {
	testkit.Cover(t, "mcoin-buy-insufficient")
	ts := testutil.New(t)
	u := ts.Register("alice")
	fund(t, ts, u.ID, 749) // one short of the 750 skin

	r := ts.Do(http.MethodPost, "/api/v1/store/buy", u.Access,
		map[string]string{"kind": "skin", "id": "skin.thorne.barbarian"})
	require.Equal(t, http.StatusPaymentRequired, r.Status, string(r.Raw))
	require.Equal(t, "insufficient_mcoin", r.ErrCode())

	// Nothing changed: balance intact, nothing owned.
	w := wallet(ts, u.Access)
	require.EqualValues(t, 749, w.Body["mcoin"])
	require.Empty(t, strs(w.Body["ownedSkins"]))
}

func TestBuyDuplicate(t *testing.T) {
	testkit.Cover(t, "mcoin-buy-duplicate")
	ts := testutil.New(t)
	u := ts.Register("alice")
	fund(t, ts, u.ID, 2000)

	r := ts.Do(http.MethodPost, "/api/v1/store/buy", u.Access,
		map[string]string{"kind": "skin", "id": "skin.sela.rogue"})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))

	// Buying it again is a 409 and deducts nothing.
	r = ts.Do(http.MethodPost, "/api/v1/store/buy", u.Access,
		map[string]string{"kind": "skin", "id": "skin.sela.rogue"})
	require.Equal(t, http.StatusConflict, r.Status, string(r.Raw))
	require.Equal(t, "already_owned", r.ErrCode())
	w := wallet(ts, u.Access)
	require.EqualValues(t, 1250, w.Body["mcoin"], "duplicate buy must not deduct twice")

	// Same for an already-owned (starter) champion.
	r = ts.Do(http.MethodPost, "/api/v1/store/buy", u.Access,
		map[string]string{"kind": "champion", "id": "sela"})
	require.Equal(t, http.StatusConflict, r.Status)
	require.Equal(t, "already_owned", r.ErrCode())
}

// TestStoreBuyChampionSpendsCrystals is the REGRESSION GUARD for task #227's
// currency half: POST /store/buy with kind=champion must debit 藍水晶, never
// M幣. The lobby store rendered 「Ⓜ 300」 on champion rows precisely because
// this endpoint really did deduct M COIN, while champ-select's
// /wallet/champions/unlock charged crystals for the same champion. If someone
// re-splits the two paths, this fails.
func TestStoreBuyChampionSpendsCrystals(t *testing.T) {
	testkit.Cover(t, "mcoin-buy-ok")
	ts := testutil.New(t)
	u := ts.Register("alice")

	// Rich in M幣, broke in 藍水晶: the champion must NOT be purchasable.
	fund(t, ts, u.ID, 100000)
	r := ts.Do(http.MethodPost, "/api/v1/store/buy", u.Access,
		map[string]string{"kind": "champion", "id": "vex"})
	require.Equal(t, http.StatusPaymentRequired, r.Status, string(r.Raw))
	require.Equal(t, "insufficient_crystal", r.ErrCode(),
		"champions are unlocked with crystals — an M COIN pile must not buy one")
	require.Equal(t, false, ts.Do(http.MethodGet, "/api/v1/wallet/owns?champion=vex", u.Access, nil).Body["owns"])

	// With crystals it succeeds, and the M幣 pile is untouched.
	grantCrystals(t, ts, u.ID, vexCrystalPrice)
	r = ts.Do(http.MethodPost, "/api/v1/store/buy", u.Access,
		map[string]string{"kind": "champion", "id": "vex"})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	require.EqualValues(t, 0, r.Body["crystal"])
	require.EqualValues(t, 100000, r.Body["mcoin"], "M幣 is the cosmetic wallet — a champion unlock may not touch it")

	// Skins stay on M幣 (the other half of the rule).
	r = ts.Do(http.MethodPost, "/api/v1/store/buy", u.Access,
		map[string]string{"kind": "skin", "id": "skin.thorne.barbarian"})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	require.EqualValues(t, 100000-750, r.Body["mcoin"], "skins are bought with M幣")
	require.EqualValues(t, 0, r.Body["crystal"], "a skin purchase may not touch crystals")
}

func TestEquipNotOwnedRejected(t *testing.T) {
	testkit.Cover(t, "mcoin-equip-not-owned")
	ts := testutil.New(t)
	u := ts.Register("alice")

	// Equipping a skin that was never bought is rejected...
	r := ts.Do(http.MethodPost, "/api/v1/store/equip", u.Access,
		map[string]any{"championId": "thorne", "skinId": "skin.thorne.barbarian"})
	require.Equal(t, http.StatusForbidden, r.Status, string(r.Raw))
	require.Equal(t, "skin_not_owned", r.ErrCode())

	// ...and unknown skins / champion-skin mismatches are clean errors.
	r = ts.Do(http.MethodPost, "/api/v1/store/equip", u.Access,
		map[string]any{"championId": "thorne", "skinId": "skin.nope"})
	require.Equal(t, http.StatusNotFound, r.Status)
	r = ts.Do(http.MethodPost, "/api/v1/store/equip", u.Access,
		map[string]any{"championId": "sela", "skinId": "skin.thorne.barbarian"})
	require.Equal(t, http.StatusBadRequest, r.Status)

	// After buying, equip/unequip round-trips.
	fund(t, ts, u.ID, 750)
	require.Equal(t, http.StatusOK, ts.Do(http.MethodPost, "/api/v1/store/buy", u.Access,
		map[string]string{"kind": "skin", "id": "skin.thorne.barbarian"}).Status)
	r = ts.Do(http.MethodPost, "/api/v1/store/equip", u.Access,
		map[string]any{"championId": "thorne", "skinId": nil})
	require.Equal(t, http.StatusOK, r.Status)
	require.Empty(t, r.Body["equippedSkins"], "null skinId clears the slot")
	r = ts.Do(http.MethodPost, "/api/v1/store/equip", u.Access,
		map[string]any{"championId": "thorne", "skinId": "skin.thorne.barbarian"})
	require.Equal(t, http.StatusOK, r.Status)
	require.Equal(t, "skin.thorne.barbarian", r.Body["equippedSkins"].(map[string]any)["thorne"])
}

func TestWalletAuthz(t *testing.T) {
	testkit.Cover(t, "mcoin-wallet-authz")
	ts := testutil.New(t)
	rich, poor := ts.Register("rich"), ts.Register("poor")
	fund(t, ts, rich.ID, 5000)

	// No token → 401 on every wallet/store route.
	for _, path := range []string{"/api/v1/wallet", "/api/v1/store/catalog"} {
		require.Equal(t, http.StatusUnauthorized, ts.Do(http.MethodGet, path, "", nil).Status, path)
	}
	require.Equal(t, http.StatusUnauthorized,
		ts.Do(http.MethodPost, "/api/v1/store/buy", "", map[string]string{"kind": "skin", "id": "x"}).Status)

	// The wallet is ALWAYS the token's account: identity comes from the JWT,
	// and query-string account hints are ignored — poor can never see (or
	// spend) rich's balance.
	r := ts.Do(http.MethodGet, "/api/v1/wallet?accountId="+rich.ID, poor.Access, nil)
	require.Equal(t, http.StatusOK, r.Status)
	require.EqualValues(t, 0, r.Body["mcoin"], "another user's wallet must not be readable")

	r = ts.Do(http.MethodPost, "/api/v1/store/buy", poor.Access,
		map[string]string{"kind": "skin", "id": "skin.sela.rogue"})
	require.Equal(t, http.StatusPaymentRequired, r.Status, "poor cannot spend rich's balance")
	require.EqualValues(t, 5000, wallet(ts, rich.Access).Body["mcoin"])
}

func TestCatalogReflectsContent(t *testing.T) {
	testkit.Cover(t, "mcoin-catalog-content")
	ts := testutil.New(t)
	u := ts.Register("alice")

	r := ts.Do(http.MethodGet, "/api/v1/store/catalog", u.Access, nil)
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))

	champs := r.Body["champions"].([]any)
	require.Len(t, champs, 3)
	byID := map[string]map[string]any{}
	for _, c := range champs {
		row := c.(map[string]any)
		byID[row["id"].(string)] = row
	}
	require.EqualValues(t, 0, byID["sela"]["price"])
	require.Equal(t, true, byID["sela"]["owned"], "free champions are owned")
	require.EqualValues(t, 900, byID["vex"]["price"])
	require.Equal(t, false, byID["vex"]["owned"])

	skins := r.Body["skins"].([]any)
	require.Len(t, skins, 2)
	first := skins[0].(map[string]any) // sorted by id: skin.sela.rogue
	require.Equal(t, "skin.sela.rogue", first["id"])
	require.Equal(t, "sela", first["championId"])
	require.EqualValues(t, 750, first["price"])
	require.Equal(t, "champ.skin.rogue", first["modelKey"])
	require.Equal(t, false, first["owned"])
	require.Equal(t, false, first["equipped"])

	// Ownership flags flip after a purchase.
	fund(t, ts, u.ID, 750)
	require.Equal(t, http.StatusOK, ts.Do(http.MethodPost, "/api/v1/store/buy", u.Access,
		map[string]string{"kind": "skin", "id": "skin.sela.rogue"}).Status)
	r = ts.Do(http.MethodGet, "/api/v1/store/catalog", u.Access, nil)
	first = r.Body["skins"].([]any)[0].(map[string]any)
	require.Equal(t, true, first["owned"])
	require.Equal(t, true, first["equipped"])
}

func TestChampSelectOwnershipGate(t *testing.T) {
	testkit.Cover(t, "mcoin-champ-gate")
	ts := testutil.New(t)
	host, guest := ts.Register("host"), ts.Register("guest")

	r := ts.Do(http.MethodPost, "/api/v1/rooms", host.Access, map[string]string{"name": "Gate"})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	rid := r.Body["room"].(map[string]any)["id"].(string)
	require.Equal(t, http.StatusOK, ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/join", guest.Access, nil).Status)

	// The owns endpoint mirrors the same rule the start gate uses.
	r = ts.Do(http.MethodGet, "/api/v1/wallet/owns?champion=vex", guest.Access, nil)
	require.Equal(t, http.StatusOK, r.Status)
	require.Equal(t, false, r.Body["owns"])
	r = ts.Do(http.MethodGet, "/api/v1/wallet/owns?champion=sela", guest.Access, nil)
	require.Equal(t, true, r.Body["owns"], "free champions are always playable")

	// Guest readies up picking the priced champion they do not own.
	require.Equal(t, http.StatusOK, ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/ready", guest.Access,
		map[string]any{"ready": true, "champion": "vex"}).Status)
	r = ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/start", host.Access, nil)
	require.Equal(t, http.StatusConflict, r.Status, string(r.Raw))
	require.Equal(t, "champion_not_owned", r.ErrCode())

	// After unlocking the champion the same start succeeds. #227: the unlock is
	// paid in 藍水晶 — funding M幣 here would no longer buy anything.
	grantCrystals(t, ts, guest.ID, vexCrystalPrice)
	require.Equal(t, http.StatusOK, ts.Do(http.MethodPost, "/api/v1/store/buy", guest.Access,
		map[string]string{"kind": "champion", "id": "vex"}).Status)
	require.Equal(t, true,
		ts.Do(http.MethodGet, "/api/v1/wallet/owns?champion=vex", guest.Access, nil).Body["owns"])
	r = ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/start", host.Access, nil)
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
}

func TestRedisWipeRebuildIncludesWallet(t *testing.T) {
	testkit.Cover(t, "mcoin-redis-rebuild")
	ts := testutil.New(t)
	ctx := context.Background()
	u := ts.Register("alice")
	fund(t, ts, u.ID, 1000)
	require.Equal(t, http.StatusOK, ts.Do(http.MethodPost, "/api/v1/store/buy", u.Access,
		map[string]string{"kind": "skin", "id": "skin.thorne.barbarian"}).Status)

	// Redis wiped: wallet cache, everything.
	ts.Mini.FlushAll()
	require.False(t, ts.Mini.Exists("wallet:"+u.ID))
	require.NoError(t, ts.Srv.Boot(ctx))

	// The wallet comes back from the account JSON truth alone.
	r := wallet(ts, u.Access)
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	require.EqualValues(t, 250, r.Body["mcoin"])
	require.Equal(t, []string{"sela", "thorne"}, strs(r.Body["ownedChampions"]))
	require.Equal(t, []string{"skin.thorne.barbarian"}, strs(r.Body["ownedSkins"]))
	require.Equal(t, "skin.thorne.barbarian", r.Body["equippedSkins"].(map[string]any)["thorne"])
	require.True(t, ts.Mini.Exists("wallet:"+u.ID), "read re-warms the cache mirror")

	// Catalog ownership flags survive the wipe too.
	cat := ts.Do(http.MethodGet, "/api/v1/store/catalog", u.Access, nil)
	for _, s := range cat.Body["skins"].([]any) {
		row := s.(map[string]any)
		if row["id"] == "skin.thorne.barbarian" {
			require.Equal(t, true, row["owned"])
			require.Equal(t, true, row["equipped"])
		}
	}
}
