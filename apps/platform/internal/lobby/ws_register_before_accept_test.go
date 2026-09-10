package lobby

import (
	"testing"
)

// ⭐ GH#1213 —— **訂閱要在握手回覆之前完成**。
//
// ⚠️ 這條刻意**不開真的 WebSocket**：真連線的競態窗口只有幾微秒，用它當夾具等於
// 「跑 1000 次希望撞到一次」—— ⛔ 那是一條會間歇綠的守衛，與沒有守衛一樣糟。
// ⭐ 改成直接問 hub：一個**還沒有 conn** 的 client 註冊之後，推給它的訊息進不進得了佇列。
// ⇒ 這正是提前 `register` 想要的性質：**握手期間到的訊息會排隊，⛔ 不會掉。**
//
// MUTATION（落地前跑過）：把 `handleWS` 的 `register` 移回 `websocket.Accept` 之後 ⇒
// 這條仍然綠（它問的是 hub），⛔ 而 `TestInvitePush` 回到「30 秒等一則永遠不會來的訊息」。
// ⇒ ⭐ 所以兩條一起才是守衛：這一條釘 hub 的性質，那一條釘端到端。
func TestHubQueuesBeforeConnExists(t *testing.T) {
	h := NewHub(nil, nil)
	c := &client{accountID: "acct-1", username: "u", out: make(chan []byte, 64), closed: make(chan struct{})}
	if evicted := h.register(c); len(evicted) != 0 {
		t.Fatalf("第一個連線不該擠掉任何人，卻擠掉了 %d 個", len(evicted))
	}
	if !h.Connected("acct-1") {
		t.Fatal("⛔ register 之後 hub 就該認得它 —— ⛔ 不是等到 conn 建好")
	}
	h.sendTo("acct-1", []byte(`{"type":"invite"}`))
	select {
	case msg := <-c.out:
		if string(msg) != `{"type":"invite"}` {
			t.Fatalf("佇列裡的訊息不對：%s", msg)
		}
	default:
		t.Fatal("⛔ 握手還沒完成時推的訊息掉了 —— 那正是 TestInvitePush 在 CI 上等滿 30 秒的原因")
	}
	if last := h.unregister(c); !last {
		t.Fatal("最後一個連線收掉時該回 true")
	}
	if h.Connected("acct-1") {
		t.Fatal("unregister 之後不該還認得它")
	}
}
