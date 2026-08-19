package ranking_test

// 宿敵排行榜的唯一守衛（GH#454，體驗層 ⇒ 一條薄的）。
//
// 它驗的是**機制**：三場真的打過的比賽，在榜上要變成一列 `played=3` 而且 W-L 站在
// 正確的那一邊。⛔ 不驗排序的數字、不驗版面、不驗文案 —— 那些壞了玩家看得出來，
// 而且各自都有更便宜的守衛（版位在 lobbyLayout.test.ts，文案是純函式）。
//
// ⭐ 它走**真的 HTTP 端點**而不是直接呼叫 Service：這條路多驗到的東西剛好是最容易
// 悄悄壞掉的兩樣 —— 路由有沒有掛上、以及主詞是不是 token 裡的那個人（失敗形態⑤：
// 被測的不是出貨的那個）。

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

func TestNemesisBoardCountsRealMatches(t *testing.T) {
	testkit.Cover(t, "lobby-nemesis-board")
	ts := testutil.New(t)
	ctx := context.Background()
	svc := ts.Srv.Ranking
	alice, bob, carol := ts.Register("alice"), ts.Register("bob"), ts.Register("carol")
	at := time.Now().UTC()

	// alice 對 bob 打了三場：贏兩場、輸一場。⚠️ 每一場的 matchId 都不同 ——
	// 同一個 id 會被 RecordHeadToHead 的去重窗口吃掉（那是刻意的，見 headtohead.go）。
	require.NoError(t, svc.RecordHeadToHead(ctx, "m-1", alice.ID, bob.ID, at))
	require.NoError(t, svc.RecordHeadToHead(ctx, "m-2", alice.ID, bob.ID, at.Add(time.Minute)))
	require.NoError(t, svc.RecordHeadToHead(ctx, "m-3", bob.ID, alice.ID, at.Add(2*time.Minute)))
	// carol 只打過一場,所以她一定排在 bob 後面(預設排序 = 交手次數)。
	require.NoError(t, svc.RecordHeadToHead(ctx, "m-4", carol.ID, alice.ID, at))

	r := ts.Do(http.MethodGet, "/api/v1/ranking/me/nemesis", alice.Access, nil)
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	rivals, ok := r.Body["rivals"].([]any)
	require.True(t, ok, "rivals missing: %s", string(r.Raw))
	require.Len(t, rivals, 2)

	top := rivals[0].(map[string]any)
	require.Equal(t, bob.ID, top["accountId"], "打最多場的排第一")
	require.Equal(t, "bob", top["username"], "每一列要看得到名字,不是一串 id")
	require.EqualValues(t, 3, top["played"])
	require.EqualValues(t, 2, top["wins"], "以呼叫者為主詞:alice 贏了兩場")
	require.EqualValues(t, 1, top["losses"])

	// 反向：同一份紀錄從 bob 的 token 讀出來要是鏡像的。這一條擋掉「投影寫死成
	// 某一邊」——那種錯誤在單向斷言下完全看不出來。
	rb := ts.Do(http.MethodGet, "/api/v1/ranking/me/nemesis", bob.Access, nil)
	require.Equal(t, http.StatusOK, rb.Status, string(rb.Raw))
	bobTop := rb.Body["rivals"].([]any)[0].(map[string]any)
	require.Equal(t, alice.ID, bobTop["accountId"])
	require.EqualValues(t, 1, bobTop["wins"])
	require.EqualValues(t, 2, bobTop["losses"])
}
