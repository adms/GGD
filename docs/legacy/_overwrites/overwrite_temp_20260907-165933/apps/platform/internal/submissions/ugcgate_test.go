package submissions

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/auth"
)

// ⭐⭐ GH#991 —— `config.ugc@1` 的**總開關與配額真的管得到那條寫入路**。
//
// ── ⭐ 為什麼這一支存在（⛔ 不是「多一格欄位的測試」）─────────────────────────
// CLAUDE.md 記過 #1035 那一次：一格開關三個住處齊全、後台看得到、兩張票驗收全綠
// —— ⛔ 而**沒有任何一行 production 程式讀它**，活了 4 天。
// ⇒ 這一支問的是那一題：「這一格 config 開關的**呼叫點在哪一行**？」
//
// ── ⭐ 走真的 HTTP 路線（形態⑧／⑪）──────────────────────────────────────────
// ⛔ 直接呼叫 `Service.Submit` 證明不了什麼：總開關擋在 **handler** 那一層，
// 而那正是對外的那一面。
//
// MUTATION LOG（落地前跑過）：
//   - `handlers.go` 的 `if !policy.Enabled { … 403 }` 整段拿掉 ⇒ 第一條 🔴
func ugcRouter(t *testing.T, policy func() SubmitPolicy) *chi.Mux {
	t.Helper()
	h := NewHandlers(newSvc(t), func(next http.Handler) http.Handler { return next },
		func() (bool, bool) { return true, true }).
		WithPromote(PromoteDeps{Ugc: policy})
	r := chi.NewRouter()
	r.Group(func(pr chi.Router) {
		pr.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				next.ServeHTTP(w, req.WithContext(
					auth.WithIdentity(req.Context(), auth.Identity{AccountID: "acct-1"})))
			})
		})
		h.Mount(pr)
	})
	return r
}

func postSubmission(r *chi.Mux, m Material) *httptest.ResponseRecorder {
	body, _ := json.Marshal(m)
	req := httptest.NewRequest(http.MethodPost, "/submissions", strings.NewReader(string(body)))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func openPolicy(mutate func(*SubmitPolicy)) func() SubmitPolicy {
	return func() SubmitPolicy {
		p := ShippedSubmitPolicy()
		p.Enabled = true
		if mutate != nil {
			mutate(&p)
		}
		return p
	}
}

// ★★ ⭐ 兩個方向：關著 ⇒ 403 `UGC_DISABLED`；開著 ⇒ 收得下。
func TestUgcEnabledGatesTheSubmitRoute(t *testing.T) {
	// ── ⛔ 出貨那一邊（`enabled: false`）────────────────────────────────────
	// ⚠️ ⭐ 這裡刻意用 `ShippedSubmitPolicy()` 而不是自己寫 `Enabled: false`：
	//   ⛔ 抄一個字面值就是第二個住處，⭐ 而這一條要問的正是「出貨那一份說什麼」。
	closed := postSubmission(ugcRouter(t, ShippedSubmitPolicy), mat("s-closed", "d1"))
	if closed.Code != http.StatusForbidden {
		t.Fatalf("⛔⛔ 總開關關著而投稿被收下了（%d）—— 那一格是裝飾：%s",
			closed.Code, closed.Body.String())
	}
	if !strings.Contains(closed.Body.String(), "UGC_DISABLED") {
		t.Fatalf("⛔ 被拒了但沒說是哪一格關的 ⇒ 玩家與營運都查不到原因：%s", closed.Body.String())
	}

	// ── ⭐ 開著那一邊（⛔ 只驗一邊 = 一把單邊的尺）───────────────────────────
	open := postSubmission(ugcRouter(t, openPolicy(nil)), mat("s-open", "d1"))
	if open.Code != http.StatusOK {
		t.Fatalf("⛔ 總開關開著而誠實的投稿被拒（%d）：%s", open.Code, open.Body.String())
	}
}

// ★ ⭐ 配額三格真的**執行得到**（⛔ 不是「schema 收得下這個數字」）。
func TestUgcQuotasAreEnforced(t *testing.T) {
	// ① 每日配額：第 2 份就該被擋（⚠️ 改稿也算 —— 配額擋的正是磨佇列）。
	r := ugcRouter(t, openPolicy(func(p *SubmitPolicy) { p.QuotaPerPlayerPerDay = 1 }))
	if w := postSubmission(r, mat("q-1", "d1")); w.Code != http.StatusOK {
		t.Fatalf("儀器：第一份就被擋了（%d）：%s", w.Code, w.Body.String())
	}
	w := postSubmission(r, mat("q-2", "d1"))
	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "quota") {
		t.Fatalf("⛔⛔ 每日配額沒有執行到（%d）：%s", w.Code, w.Body.String())
	}

	// ② 位元組上限：⭐ 訊息要說出**真正生效的那個數字**（投稿者看不到後台）。
	small := ugcRouter(t, openPolicy(func(p *SubmitPolicy) { p.MaxBytes = 4096 }))
	big := mat("b-1", "d1")
	big.Payload = `{"a":"` + strings.Repeat("x", 8192) + `"}`
	if w := postSubmission(small, big); w.Code != http.StatusBadRequest ||
		!strings.Contains(w.Body.String(), "4096") {
		t.Fatalf("⛔⛔ `maxBytes` 沒有執行到、或訊息沒說生效值（%d）：%s", w.Code, w.Body.String())
	}
}
