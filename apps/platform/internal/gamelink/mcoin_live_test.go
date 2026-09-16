package gamelink_test

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/contentoverlay"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/gamelink"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/internal/wallet"
)

// TestMcoinRewardOverrideReachesTheNextSettlement is the load-bearing guard for
// GH#1177 追加 —— owner 2026-09-15（逐字）：「LoL 點數購買分級為一般 390/520/750/975、
// 史詩 1350、傳說 1820、終極 3250 => 對應打幾場的獎勵呢? 記得後台可動態參數設定」.
//
// Before this, the console could save `mcoinRewards` but settlement paid from
// gamelink's boot-time catalog copy: the field looked live and was not. The
// operator's save must reach the very next all-human match, no restart.
func TestMcoinRewardOverrideReachesTheNextSettlement(t *testing.T) {
	ts := testutil.New(t)
	ctx := context.Background()
	alice := ts.Register("alicemcoinlive")

	// A perfect lobby: twelve seats, no bots. Alice's team places first.
	seats := []gamelink.ResultSeat{{AccountID: alice.ID, Team: 0}}
	for i := 0; i < 11; i++ {
		seats = append(seats, gamelink.ResultSeat{AccountID: fmt.Sprintf("sofa-%02d:p2", i), Team: (i + 1) % 4})
	}
	mcoinOf := func() int {
		w, err := ts.Srv.Wallet.Get(ctx, alice.ID)
		require.NoError(t, err)
		return w.MCoin
	}

	shipped := ts.Srv.Wallet.Catalog().RewardFor(1)
	settle(t, ts, lobby("m-mcoin-shipped", seats))
	before := mcoinOf()
	require.Equal(t, shipped, before, "no override ⇒ first place pays the shipped table")

	// The operator raises first place (derived from shipped, never a literal).
	raised := shipped + 7
	store, err := jsonstore.New(ts.Cfg.DataDir)
	require.NoError(t, err)
	o := contentoverlay.EmptyOverlay()
	o.Docs[wallet.OverlayStoreKey] = json.RawMessage(fmt.Sprintf(`{
      "id": "store",
      "schema": "config.store@1",
      "championUnlockCost": 300,
      "freeChampionIds": [],
      "mcoinRewards": { "placement1": %d, "placement2": 0, "placement3": 0, "placement4": 0 }
    }`, raised))
	require.NoError(t, store.Put(wallet.OverlayCollection, wallet.OverlayDocID, o))

	settle(t, ts, lobby("m-mcoin-live", seats))
	require.Equal(t, before+raised, mcoinOf(),
		"⛔ 後台改的 M幣 名次獎勵沒有到下一場結算 —— 結算還在讀開機時的出貨表")
}
