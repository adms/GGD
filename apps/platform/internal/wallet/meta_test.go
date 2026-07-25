package wallet_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/admin"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// vexCrystalPrice mirrors the testutil content fixture's championPrices.vex.
// It is duplicated as a literal because the test file's own wallet() helper
// shadows the wallet package name, so the package cannot be imported here.
const vexCrystalPrice = 900

// grantCrystals seeds a crystal balance the only way production can — through
// the settlement-side absolute setter. There is deliberately no HTTP earn
// route to call (see TestNoClientCrystalEarnRoute).
func grantCrystals(t *testing.T, ts *testutil.TS, accountID string, crystal int) {
	t.Helper()
	require.NoError(t, ts.Srv.Wallet.SetCrystalAbsolute(context.Background(), accountID, crystal))
}

// grantAdmin promotes an account to the admin role directly on the JSON truth,
// so an existing access token immediately gains admin capability.
func grantAdmin(t *testing.T, ts *testutil.TS, id string) {
	t.Helper()
	_, err := ts.Srv.Accounts.Update(context.Background(), id, func(a *account.Account) error {
		if !a.HasRole(admin.RoleAdmin) {
			a.Roles = append(a.Roles, admin.RoleAdmin)
		}
		return nil
	})
	require.NoError(t, err)
}

// TestNoClientCrystalEarnRoute is the REGRESSION GUARD for the minting hole:
// crystals may only be granted by HMAC-authenticated match settlement, so no
// authenticated client route may hand them out. If someone re-adds an earn
// endpoint, this fails.
//
// The last two paths are the #225 trap. That task added OPERATOR crystal grants,
// and the obvious place to put them was next to the then-existing
// /wallet/admin/grant-mcoin — which was in THIS package, was gated only by an
// in-service role check, and could not write an admin audit line (admin imports
// wallet, so the edge back would be a cycle). #225 dodged that trap; task #214
// then deleted grant-mcoin itself for the same reason (see
// TestNoAdminMCoinRouteHere). The crystal routes live at
// /admin/accounts/{id}/crystal and
// /admin/crystals/grant-all instead, behind AdminOnly and the audit writer. These
// probes make that a tested property rather than a comment: this package's HTTP
// surface hands out crystals to NOBODY, admin or not.
func TestNoClientCrystalEarnRoute(t *testing.T) {
	testkit.Cover(t, "meta-crystal-no-earn-route")
	ts := testutil.New(t)
	u := ts.Register("alice")

	for _, path := range []string{
		"/api/v1/wallet/crystals/earn",
		"/api/v1/wallet/crystals",
		"/api/v1/wallet/admin/grant-crystal",
		"/api/v1/wallet/crystals/grant-all",
	} {
		r := ts.Do(http.MethodPost, path, u.Access, nil)
		require.Equal(t, http.StatusNotFound, r.Status,
			"%s must not exist: an authenticated self-grant with no per-match key can be looped to mint crystals", path)
	}
	require.EqualValues(t, 0, wallet(ts, u.Access).Body["crystal"])
}

// TestCrystalBalanceDurable: the settlement-granted balance is the JSON-store
// truth and rebuilds after a Redis wipe.
func TestCrystalBalanceDurable(t *testing.T) {
	testkit.Cover(t, "meta-crystal-accrue")
	ts := testutil.New(t)
	u := ts.Register("alice")

	// A fresh wallet starts with zero crystals.
	require.EqualValues(t, 0, wallet(ts, u.Access).Body["crystal"])

	// Three winning matches at CrystalPlace1 (120) — the value settlement
	// journals is ABSOLUTE, so this is what the third match would write.
	grantCrystals(t, ts, u.ID, 360)
	require.EqualValues(t, 360, wallet(ts, u.Access).Body["crystal"])

	// Durable across a Redis wipe: the crystal count rebuilds from JSON alone.
	ts.Mini.FlushAll()
	require.NoError(t, ts.Srv.Boot(context.Background()))
	require.EqualValues(t, 360, wallet(ts, u.Access).Body["crystal"])
}

// TestCrystalUnlockChampion: enough crystals unlock a priced champion, which
// then becomes owned + playable; underfunded is a clean 402. The amount spent
// is the champion's own store.json price (vex is 900 in the fixture), not a
// flat constant.
func TestCrystalUnlockChampion(t *testing.T) {
	testkit.Cover(t, "meta-crystal-unlock")
	ts := testutil.New(t)
	u := ts.Register("alice")

	// One crystal short — the unlock is refused and nothing is deducted.
	grantCrystals(t, ts, u.ID, vexCrystalPrice-1)
	require.EqualValues(t, vexCrystalPrice-1, wallet(ts, u.Access).Body["crystal"])
	r := ts.Do(http.MethodPost, "/api/v1/wallet/champions/unlock", u.Access, map[string]string{"champion": "vex"})
	require.Equal(t, http.StatusPaymentRequired, r.Status, string(r.Raw))
	require.Equal(t, "insufficient_crystal", r.ErrCode())
	require.EqualValues(t, vexCrystalPrice-1, wallet(ts, u.Access).Body["crystal"], "a refused unlock deducts nothing")
	require.Equal(t, false, ts.Do(http.MethodGet, "/api/v1/wallet/owns?champion=vex", u.Access, nil).Body["owns"])

	// Exactly the price → the unlock succeeds, spends exactly the price, and
	// grants ownership.
	grantCrystals(t, ts, u.ID, vexCrystalPrice)
	require.EqualValues(t, vexCrystalPrice, wallet(ts, u.Access).Body["crystal"])
	r = ts.Do(http.MethodPost, "/api/v1/wallet/champions/unlock", u.Access, map[string]string{"champion": "vex"})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	require.EqualValues(t, 0, r.Body["crystal"])
	require.Equal(t, []string{"sela", "thorne", "vex"}, strs(r.Body["ownedChampions"]))
	require.Equal(t, true, ts.Do(http.MethodGet, "/api/v1/wallet/owns?champion=vex", u.Access, nil).Body["owns"],
		"a crystal-unlocked champion is playable")

	// Owned account JSON carries the unlock (survives the wallet cache).
	acc, err := ts.Srv.Accounts.GetByID(context.Background(), u.ID)
	require.NoError(t, err)
	require.Contains(t, acc.OwnedChampions, "vex")

	// Re-unlocking is a 409 and never double-charges (balance already 0, but the
	// ownership gate rejects before any crystal maths).
	r = ts.Do(http.MethodPost, "/api/v1/wallet/champions/unlock", u.Access, map[string]string{"champion": "vex"})
	require.Equal(t, http.StatusConflict, r.Status)
	require.Equal(t, "already_owned", r.ErrCode())

	// Free champions can't be crystal-unlocked; unknown champions are 404.
	require.Equal(t, http.StatusConflict,
		ts.Do(http.MethodPost, "/api/v1/wallet/champions/unlock", u.Access, map[string]string{"champion": "sela"}).Status)
	require.Equal(t, http.StatusNotFound,
		ts.Do(http.MethodPost, "/api/v1/wallet/champions/unlock", u.Access, map[string]string{"champion": "nope"}).Status)
}

// TestFavouriteTogglePersists: pinning/unpinning a champion persists on the
// JSON truth and round-trips through a Redis wipe.
func TestFavouriteTogglePersists(t *testing.T) {
	testkit.Cover(t, "meta-favourite-toggle")
	ts := testutil.New(t)
	u := ts.Register("alice")

	require.Empty(t, strs(wallet(ts, u.Access).Body["favourites"]))

	// Pin two champions (stored sorted, deduped).
	r := ts.Do(http.MethodPost, "/api/v1/wallet/favourites", u.Access, map[string]any{"champion": "vex", "favourite": true})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	require.Equal(t, []string{"vex"}, strs(r.Body["favourites"]))
	r = ts.Do(http.MethodPost, "/api/v1/wallet/favourites", u.Access, map[string]any{"champion": "sela", "favourite": true})
	require.Equal(t, []string{"sela", "vex"}, strs(r.Body["favourites"]))
	// Idempotent: re-pinning does not duplicate.
	r = ts.Do(http.MethodPost, "/api/v1/wallet/favourites", u.Access, map[string]any{"champion": "vex", "favourite": true})
	require.Equal(t, []string{"sela", "vex"}, strs(r.Body["favourites"]))

	// Unpin one.
	r = ts.Do(http.MethodPost, "/api/v1/wallet/favourites", u.Access, map[string]any{"champion": "sela", "favourite": false})
	require.Equal(t, []string{"vex"}, strs(r.Body["favourites"]))

	// Unknown champion is a 404; missing champion is a 400.
	require.Equal(t, http.StatusNotFound,
		ts.Do(http.MethodPost, "/api/v1/wallet/favourites", u.Access, map[string]any{"champion": "nope", "favourite": true}).Status)
	require.Equal(t, http.StatusBadRequest,
		ts.Do(http.MethodPost, "/api/v1/wallet/favourites", u.Access, map[string]any{"favourite": true}).Status)

	// Durable across a Redis wipe.
	ts.Mini.FlushAll()
	require.NoError(t, ts.Srv.Boot(context.Background()))
	require.Equal(t, []string{"vex"}, strs(wallet(ts, u.Access).Body["favourites"]))
}

// TestAdminGrantMCoin: an admin can grant M COIN (造型幣) into an account and the
// player can then SPEND it; a non-admin cannot, and the target balance is
// unchanged on refusal.
//
// The route moved in task #214. It used to be POST /wallet/admin/grant-mcoin,
// which lived in THIS package: role-checked in-service, unbounded, and — because
// admin imports wallet — incapable of writing an audit line, so every operator
// M幣 grant vanished without a trace while the sibling door logged its own. That
// route is deleted; the audited door is POST /admin/accounts/{id}/mcoin
// (AdminOnly + bounds + `mcoin_adjust`), which internal/admin owns and tests for
// authz and audit. What is asserted HERE is the half only this package can see:
// the granted balance is real wallet money the player can spend.
//
// TestNoAdminMCoinRouteHere below is the guard that the deleted door stays shut.
func TestAdminGrantMCoin(t *testing.T) {
	testkit.Cover(t, "meta-admin-grant-mcoin")
	ts := testutil.New(t)
	boss, player, thief := ts.Register("boss"), ts.Register("player"), ts.Register("thief")
	grantAdmin(t, ts, boss.ID)
	route := "/api/v1/admin/accounts/" + player.ID + "/mcoin"

	// A non-admin caller is forbidden and grants nothing.
	r := ts.Do(http.MethodPost, route, thief.Access, map[string]any{"delta": 500})
	require.Equal(t, http.StatusForbidden, r.Status, string(r.Raw))
	require.EqualValues(t, 0, wallet(ts, player.Access).Body["mcoin"], "a forbidden grant changes nothing")

	// The admin grants 500, then tops up another 250 (adjustments are additive).
	r = ts.Do(http.MethodPost, route, boss.Access, map[string]any{"delta": 500, "reason": "test"})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	require.EqualValues(t, 500, r.Body["mcoin"])
	r = ts.Do(http.MethodPost, route, boss.Access, map[string]any{"delta": 250, "reason": "test"})
	require.EqualValues(t, 750, r.Body["mcoin"])

	// The player sees the granted balance and can spend it on a cosmetic skin.
	require.EqualValues(t, 750, wallet(ts, player.Access).Body["mcoin"])
	require.Equal(t, http.StatusOK, ts.Do(http.MethodPost, "/api/v1/store/buy", player.Access,
		map[string]string{"kind": "skin", "id": "skin.sela.rogue"}).Status)

	// No token → 401.
	require.Equal(t, http.StatusUnauthorized,
		ts.Do(http.MethodPost, route, "", map[string]any{"delta": 1}).Status)
}

// TestNoAdminMCoinRouteHere is the REGRESSION GUARD for task #214, the M幣 twin
// of TestNoClientCrystalEarnRoute above. This package's HTTP surface must expose
// NO operator M幣 door: one here could never be audited (admin imports wallet,
// so the edge back is an import cycle), which is exactly how the old
// /wallet/admin/grant-mcoin came to be role-checked but trail-less. A 404 here —
// even for a real admin — is the property being pinned.
func TestNoAdminMCoinRouteHere(t *testing.T) {
	testkit.Cover(t, "meta-admin-grant-mcoin")
	ts := testutil.New(t)
	boss, player := ts.Register("boss"), ts.Register("player")
	grantAdmin(t, ts, boss.ID)

	r := ts.Do(http.MethodPost, "/api/v1/wallet/admin/grant-mcoin", boss.Access,
		map[string]any{"accountId": player.ID, "amount": 500})
	require.Equal(t, http.StatusNotFound, r.Status,
		"the unaudited M幣 grant route must stay deleted: %s", string(r.Raw))
	require.EqualValues(t, 0, wallet(ts, player.Access).Body["mcoin"])
}
