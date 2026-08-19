package gamelink_test

// GH#349 的守衛：練習房被回收時，戰績庫裡**不可以**多出一筆記錄。
//
// ⚠️ 這一條刻意走**完整的線**（HTTP 開練習房 → 平台真的訂了一場 → ReapStuck），
// ⛔ 不自己手寫一份 pending hash。旗標要從 room.Practice 一路傳到 pending 記錄
// 上才有用，而「被測的不是出貨的那個」正是這個 repo 的失敗形態⑤：手寫夾具會讓
// 中間任何一段斷掉都照樣綠。

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/presence"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

func TestPracticeReapWritesNoMatchRecord(t *testing.T) {
	testkit.Cover(t, "practice-reap-no-record")
	ts := testutil.New(t)
	ctx := context.Background()
	u := ts.Register("prac")

	r := ts.Do(http.MethodPost, "/api/v1/rooms/solo", u.Access, map[string]any{"practice": true})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	mid := r.Body["matchId"].(string)

	// 練習房永遠不會 finishMatch，所以它的結局**只有**這一條路。
	future := time.Now().Add(ts.Cfg.MatchPendingTTL + time.Minute)
	reaped, err := ts.Srv.Gamelink.ReapStuck(ctx, future)
	require.NoError(t, err)
	require.Equal(t, []string{mid}, reaped, "練習房仍然要被收掉，否則 pending 會漏")

	col := filepath.Join(ts.Cfg.DataDir, "matches",
		fmt.Sprintf("%04d", future.UTC().Year()), fmt.Sprintf("%02d", int(future.UTC().Month())))
	_, err = os.Stat(filepath.Join(col, mid+".json"))
	require.True(t, os.IsNotExist(err), "練習場不可以在戰績庫留下記錄（GH#349）")

	// ⭐ 另一半：不寫記錄 ⛔ 不等於不收尾。少了這兩條，「修好」的做法可以是
	// 「練習房整個不回收」——玩家卡在比賽中、pending 永遠不清。
	require.False(t, ts.Mini.Exists("match:pending:"+mid), "pending 鍵要清掉")
	st, _ := ts.Srv.Presence.Get(ctx, u.ID)
	require.Equal(t, presence.StateInLobby, st, "玩家要回到大廳")
}
