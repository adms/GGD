package gamelink_test

// 練習模式上線（GH#343）—— 這一條線的守衛。
//
// owner 2026-08-17:「練習模式也開放線上喔，只是完全沒有獎勵積分」。
// 在此之前線上根本開不起來：客戶端自己 joinOrCreate 帶 practice，而正式站的
// game shard 一定帶 shared secret，`MatchRoom` 會用 createToken 把所有非平台的
// 建房擋掉。所以練習房改走平台的 solo reservation，旗標從
// room.Room.Practice → gamelink.MatchRequest.Practice → `/_internal/matches`
// 的 JSON → game server 的 `InternalMatchRequest.practice`。
//
// ⚠️ 這裡**讀原始 JSON 的字串鍵**，⛔ 不 unmarshal 回 gamelink.MatchRequest。
// 那個 struct 自己就是 tag 的來源，用它讀回來的話 tag 打錯也會過（失敗形態⑤：
// 被測的不是出貨的那個）。線上真正在傳的是位元組，所以斷言也讀位元組。

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/testutil"
)

// lastWireBody 讀 game node 真的收到的最後一份 JSON body，解成字串鍵的 map。
func lastWireBody(t *testing.T, ts *testutil.TS) map[string]any {
	t.Helper()
	bodies := ts.Node.RawBodies()
	require.NotEmpty(t, bodies, "平台必須真的向 game node 訂了一場，否則後面驗什麼都沒意義")
	var m map[string]any
	require.NoError(t, json.Unmarshal(bodies[len(bodies)-1], &m))
	return m
}

// 練習房的旗標必須真的到得了 game node。少了它，玩家拿到的是一間會結算、
// 沒有測試碼、火圈照燒的普通房，而畫面上長得跟練習模式一模一樣。
func TestPracticeRoomShipsThePracticeFlagOnTheWire(t *testing.T) {
	ts := testutil.New(t)
	u := ts.Register("prac")

	r := ts.Do(http.MethodPost, "/api/v1/rooms/solo", u.Access, map[string]any{"practice": true})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))

	body := lastWireBody(t, ts)
	require.Equal(t, true, body["practice"],
		"送到 game node 的 JSON 必須帶 \"practice\":true —— 鍵名逐位元組要對上 InternalMatchRequest.practice")
}

// 而一間 listed 房**永遠**不可以是練習房。practice 同時是測試碼的鑰匙
// （MatchRoom 的 cheatsAllowed），所以「開一間 listed 練習房再邀朋友進來」
// 或「把一間有別人的房事後翻成練習房」都會做出「有旁人 · 開著測試碼 ·
// 而且不結算」的房間。room.Create() 主動把它清成 false，這一條證明那行還在。
func TestListedRoomCanNeverCarryPractice(t *testing.T) {
	ts := testutil.New(t)
	host := ts.Register("host")

	r := ts.Do(http.MethodPost, "/api/v1/rooms", host.Access,
		map[string]any{"name": "Sneaky", "practice": true})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	rid := r.Body["room"].(map[string]any)["id"].(string)

	r = ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/start", host.Access, nil)
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))

	body := lastWireBody(t, ts)
	_, present := body["practice"]
	require.False(t, present,
		"一般房間送出去的 body 不可以出現 practice 這個鍵：那是一間有旁人、開著測試碼、又不結算的房")
}
