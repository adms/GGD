package room_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/gamelink"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// 大廳集合令 (GH#492) — owner 2026-08-21:「創建房間最重要的就是拉人進來，請你將
// 所有線上在大廳的人都跳出確認視窗是否進入房間一起開始，同意後就一起進入開始遊戲，
// 最多等 10 秒，包含 vs bot」.
//
// ONE end-to-end assertion, because the failure this has to make impossible is
// end-to-end: 建房 → 廣播 → 一位接受 → 倒數到期 → 開始，而那位玩家真的坐在座位上、
// 空位由 bot 補。Every cheaper version of this test passes on a broadcast that
// reaches nobody.
//
// ⛔ 不可以打斷正在比賽中的人 is asserted in the same test rather than a second
// one: it is the same broadcast, and a separate test would let the two drift.

// rally fires the broadcast as the host.
func rally(ts *testutil.TS, host testutil.User, rid string, waitSec float64) testutil.Resp {
	ts.T.Helper()
	return ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/rally", host.Access,
		map[string]float64{"waitSec": waitSec})
}

func TestRallyCallsTheLobbyIntoTheMatch(t *testing.T) {
	testkit.Cover(t, "room-rally-broadcast")
	ts := testutil.New(t)
	host := ts.Register("host")
	joiner := ts.Register("joiner")
	busy := ts.Register("busy")

	// Presence is what makes an account 「在大廳」: the lobby WS handshake sets it
	// (lobby/ws.go). Dialling is therefore not test scaffolding — it is the exact
	// state the feature keys off, and the sockets are also how the pushes arrive.
	wsHost := ts.MustDialWS(host.Access)
	defer wsHost.Conn.CloseNow()
	wsJoiner := ts.MustDialWS(joiner.Access)
	defer wsJoiner.Conn.CloseNow()
	wsBusy := ts.MustDialWS(busy.Access)
	defer wsBusy.Conn.CloseNow()

	// `busy` is IN A MATCH — his own solo room. owner's rule is 「所有線上在大廳的
	// 人」, so he must NOT get a confirm dialog thrown over his fight.
	require.Equal(t, http.StatusOK,
		ts.Do(http.MethodPost, "/api/v1/rooms/solo", busy.Access, nil).Status)

	rid := roomID(createRoom(ts, host, "Rally Room"))

	r := rally(ts, host, rid, 10)
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	// One dialog: joiner. NOT the host (he is looking at the room) and NOT busy.
	require.EqualValues(t, 1, r.Body["invited"], "只有大廳裡的人收到集合令")
	require.Greater(t, r.Body["expiresAt"].(float64), float64(time.Now().UnixMilli()),
		"倒數截止時間是伺服器蓋的,⛔ 不是各自瀏覽器自己起算")

	// The push carries what the dialog has to SHOW (owner: 明顯提示姓名與積分).
	msg, err := wsJoiner.ReadUntil(5*time.Second, func(m map[string]any) bool { return m["type"] == "invite" })
	require.NoError(t, err)
	require.Equal(t, true, msg["broadcast"], "集合令要跟私人邀請分得出來,不然開不了確認視窗")
	require.Equal(t, "host", msg["fromName"], "主揪的名字")
	require.Contains(t, msg, "fromMmr", "主揪的積分")
	require.Equal(t, r.Body["expiresAt"], msg["expiresAt"], "每個人倒數到同一刻")

	// ⛔ busy must have received NOTHING but his own match_ready.
	_, err = wsBusy.ReadUntil(700*time.Millisecond, func(m map[string]any) bool { return m["type"] == "invite" })
	require.Error(t, err, "⛔ 比賽中的玩家不可以被集合令打斷")

	// 同意 → 一個 request 就進房而且是 ready 的（倒數在跑,⛔ 沒有第二趟的餘裕）。
	acc := ts.Do(http.MethodPost, "/api/v1/rooms/join-by-code", joiner.Access,
		map[string]any{"token": msg["token"], "ready": true})
	require.Equal(t, http.StatusOK, acc.Status, string(acc.Raw))

	// 10 秒到 → 主揪按下開始（客戶端倒數擁有這一刻）。
	st := ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/start", host.Access,
		map[string]any{"ignoreNotReady": true})
	require.Equal(t, http.StatusOK, st.Status, string(st.Raw))

	// ★ 兩個人真的在座位上,其餘 10 個位子由 bot 補。
	reqs := ts.Node.Requests()
	require.NotEmpty(t, reqs)
	req := reqs[len(reqs)-1]
	require.Len(t, req.Seats, gamelink.TotalSeats)
	humans := map[string]bool{}
	for _, s := range req.Seats {
		if !s.IsBot {
			humans[s.AccountID] = true
		}
	}
	require.True(t, humans[host.ID], "主揪在座位上")
	require.True(t, humans[joiner.ID], "接受集合令的玩家在座位上 —— 這是整張票的重點")
	require.Len(t, humans, 2)
	require.Equal(t, gamelink.TotalSeats-2, req.BotFill.Count, "空位由 bot 補")
}

// A rally start must not be blocked by somebody who wandered in from the room
// browser and never pressed ready — that turns 「最多等 10 秒」 into a start that
// fails forever, and the visible symptom is 「按了開始，什麼都沒發生」.
func TestRallyStartIsADeadlineNotAConsensus(t *testing.T) {
	testkit.Cover(t, "room-rally-deadline")
	ts := testutil.New(t)
	host, walkin := ts.Register("host"), ts.Register("walkin")
	rid := roomID(createRoom(ts, host, "Deadline"))
	require.Equal(t, http.StatusOK,
		ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/join", walkin.Access, nil).Status)

	// The ordinary start still demands readiness — the gate is lifted, not gone.
	require.Equal(t, http.StatusConflict,
		ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/start", host.Access, nil).Status)

	require.Equal(t, http.StatusOK,
		ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/start", host.Access,
			map[string]any{"ignoreNotReady": true}).Status)
}
