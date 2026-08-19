package gamelink_test

// owner 2026-08-20「do it」—— 練習房**絕對不可以**被結算成貨幣。
//
// ⚠️ 今天這條路一次都不會被走到：game server 的 `MatchRoom.settleToPlatform`
// 對練習房整條 return。⛔ 但那是**另一個 repo 的另一個檔案裡的一行 early return** ——
// `endlessCombat` 一旦被關掉、或練習房長出任何結束條件，Settler.Apply 就會開始
// 發水晶／M 幣／MMR／賽季積分，而且**沒有任何東西會說**。水晶與 M 幣沒有回收路徑，
// ⇒ 錯發是**不可逆**的。
//
// ⚠️ 這一條刻意走**真的練習房**（HTTP 開房 → 出貨路徑自己在 pending hash 上蓋旗標），
// ⛔ 不手寫 pending 夾具 —— 失敗形態⑤：手寫的話中間任何一段斷掉都照樣綠。

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/gamelink"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

func TestPracticeSettlementRefusesToPayOut(t *testing.T) {
	testkit.Cover(t, "practice-settle-refuses")
	ts := testutil.New(t)
	ctx := context.Background()
	u := ts.Register("pracpay")

	// 出貨路徑：真的開一間練習房，旗標由 StartMatch 自己蓋上去。
	r := ts.Do(http.MethodPost, "/api/v1/rooms/solo", u.Access, map[string]any{"practice": true})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	mid := r.Body["matchId"].(string)

	before, err := ts.Srv.Wallet.Get(ctx, u.ID)
	require.NoError(t, err)

	// 模擬「上游不變式破掉」：一份會付錢的結算真的送進來了。
	settler := gamelink.NewSettler(ts.Srv.Store, ts.Srv.Rdb, ts.Srv.Accounts,
		ts.Srv.Presence, ts.Srv.Ranking, ts.Srv.Rooms, ts.Srv.Wallet)
	st := gamelink.Settlement{
		MatchID: mid, Mode: "Practice", Status: "completed",
		Placements: []gamelink.TeamPlace{{Team: 0, Place: 1}},
		Seats:      []gamelink.ResultSeat{{AccountID: u.ID, Team: 0}},
		Ratings: map[string]gamelink.RatingAfter{
			u.ID: {MMR: 9999, Games: 1, Wins: 1, MCoin: 12345, Crystal: 54321, Points: 777},
		},
		EndedAt: time.Now(),
	}
	require.NoError(t, settler.Apply(ctx, st), "拒絕付錢不等於回錯誤 —— 上游沒有重試的意義")

	// ① 一毛都不可以發
	after, err := ts.Srv.Wallet.Get(ctx, u.ID)
	require.NoError(t, err)
	require.Equal(t, before.Crystal, after.Crystal, "練習房不可以發水晶")
	require.Equal(t, before.MCoin, after.MCoin, "練習房不可以發 M 幣")

	// ② MMR / 戰績也不可以動
	acc, err := ts.Srv.Accounts.GetByID(ctx, u.ID)
	require.NoError(t, err)
	require.NotEqual(t, 9999, acc.MMR, "練習房不可以改 MMR")

	// ③ 但**仍然要收尾** —— 拒絕付錢不等於拒絕清理，否則 pending 會永遠被重收
	var rec gamelink.Settlement
	require.Error(t, ts.Srv.Store.Get(gamelink.MatchCollection(st.EndedAt), mid, &rec),
		"練習房不可以在戰績庫留下記錄")
}
