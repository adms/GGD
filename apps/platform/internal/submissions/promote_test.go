package submissions

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/auth"
)

// ⭐⭐ §4「AI 內容必須先審後上」的守衛。
//
// MUTATION LOG（落地前跑過）：
//   - `Promotable` 的 fixture 那一條拿掉 → 🔴（八招夾具人工 pass 之後變成可上線）
//   - `Promote` 的 `rv == nil` 拒絕改成「當它過了」 → 🔴（沒有重驗就上線）
//   - `RejectReviewerClaims` 改成 `return nil` → 🔴（包裡自稱 reviewer 被收下）

func okRevalidator(Material) (map[string]any, error) {
	return map[string]any{"base": "ok", "schema": "ok", "capability": "ok", "assets": "ok"}, nil
}

// ★★ ⭐ **八招夾具永遠不可上線** —— ⛔ 即使人工 pass。
func TestCapabilityFixtureIsNeverPromotable(t *testing.T) {
	s := newSvc(t)
	m := mat("fixture-7", "d1")
	m.Kind = KindCapabilityFixture
	if _, err := s.Submit(m); err != nil {
		t.Fatalf("submit: %v", err)
	}
	// ⭐ 人工**真的**按了通過。
	v, err := s.Decide("fixture-7", StatusApproved, "編輯器做得出來", "admin-1")
	if err != nil {
		t.Fatalf("decide: %v", err)
	}
	if v.Status != StatusApproved {
		t.Fatalf("裁決沒生效: %+v", v)
	}
	if v.Promotable {
		t.Fatal("⛔⛔ 夾具在人工 pass 之後變成可上線 ⇒ owner 2026-09-01 逐字禁止的正是這件事：\n" +
			"   八招證明的是「編輯器做不做得出」，⛔ 不是「這一招可以出貨」")
	}
	if !strings.Contains(v.NotPromotableWhy, "editor-capability-fixture") {
		t.Fatalf("⛔ 灰掉了但說不出原因: %q", v.NotPromotableWhy)
	}
	// ⭐ 而**真的按下去**也要被擋（⛔ 只有旗標是不夠的 —— 失敗形態⑪）。
	if _, err := s.Promote("fixture-7", "admin-1", okRevalidator); err == nil {
		t.Fatal("⛔⛔ 旗標說不可以，而 Promote 讓它過了 ⇒ 兩條各自對的守衛，接縫是空的")
	}
}

// ★★ ⭐ 沒有重驗鉤子 ⇒ **拒絕**（⛔ 不是「當它過了」）。
func TestPromoteWithoutRevalidatorIsRefused(t *testing.T) {
	s := newSvc(t)
	if _, err := s.Submit(mat("a1", "d1")); err != nil {
		t.Fatalf("submit: %v", err)
	}
	if _, err := s.Decide("a1", StatusApproved, "", "admin-1"); err != nil {
		t.Fatalf("decide: %v", err)
	}
	if _, err := s.Promote("a1", "admin-1", nil); err == nil {
		t.Fatal("⛔⛔ 沒有重驗就上線了 ⇒ ⭐ 這一格沒有安全的預設值：\n" +
			"   「當它過了」＝ 把 base/schema/capability/asset 的漂移全部放行")
	}
	// ⭐ 有鉤子而鉤子說不行 ⇒ 也要擋。
	fail := func(Material) (map[string]any, error) { return nil, errors.New("asset hash 對不上") }
	if _, err := s.Promote("a1", "admin-1", fail); err == nil {
		t.Fatal("⛔ 重驗失敗還是上線了")
	}
	// ⭐ 儀器：鉤子過了就真的會上（⛔ 否則上面兩條永遠綠）。
	got, err := s.Promote("a1", "admin-1", okRevalidator)
	if err != nil {
		t.Fatalf("⛔ 儀器：一切正常時 Promote 應該成功: %v", err)
	}
	if !got.Promoted {
		t.Fatal("⛔ Promote 回報成功而 Promoted 是 false")
	}
}

// ★★ ⭐ candidate 換一個位元組 ⇒ 舊的 promote **立即失效**。
func TestPromotedDigestBindsToBytes(t *testing.T) {
	s := newSvc(t)
	if _, err := s.Submit(mat("a1", "d1")); err != nil {
		t.Fatalf("submit: %v", err)
	}
	if _, err := s.Decide("a1", StatusApproved, "", "admin-1"); err != nil {
		t.Fatalf("decide: %v", err)
	}
	if _, err := s.Promote("a1", "admin-1", okRevalidator); err != nil {
		t.Fatalf("promote: %v", err)
	}
	// ⭐ 換內容（重送同一個 id，指紋變了）。
	after, err := s.Submit(mat("a1", "d2"))
	if err != nil {
		t.Fatalf("resubmit: %v", err)
	}
	if after.Promoted {
		t.Fatal("⛔⛔ 換過內容之後舊的上線資格還在 ⇒ ⭐ 這正是「先送乾淨的、通過後換掉」那條路")
	}
	if after.Promotable {
		t.Fatal("⛔ 換過內容之後舊的裁決還算數")
	}
}

// ★★ ⭐ 包裡自稱的 reviewer **不是身分證明** ⇒ 拒絕（⛔ 不是靜靜忽略）。
func TestPackageReviewerClaimIsRejected(t *testing.T) {
	for _, k := range []string{"reviewer", "approvedBy", "verdict", "status", "promotable"} {
		m := mat("claim-"+k, "d1")
		m.Payload = `{"` + k + `":"admin-1","a":1}`
		if _, err := newSvc(t).Submit(m); err == nil {
			t.Fatalf("⛔⛔ 包裡自稱 %q 被收下了 ⇒ ⭐ 規格 §4 逐字：那不是身分證明", k)
		}
	}
	// ⭐ 儀器：巢狀深處的 `status` 是內容的一部分（一個狀態效果就叫 status）⇒ 放行。
	m := mat("nested", "d1")
	m.Payload = `{"effects":[{"kind":"applyStatus","status":"burn"}]}`
	if _, err := newSvc(t).Submit(m); err != nil {
		t.Fatalf("⛔ 誤殺了合法內容（巢狀 status）: %v", err)
	}
}

// ★★ ⭐⭐ **權限邊界的接縫** —— 只有 proposer 角色的帳號按 promote ⇒ 403。
//
// ⚠️ ⭐ 這一條刻意走**真的 HTTP 路線**（⛔ 不是直接呼叫 Service）：
// 「Service 會擋」與「路線上真的擋得到」是**兩件事**（失敗形態⑪）——
// 一條掛錯 router group 的路線，兩邊的單元測試都會是綠的。
func TestProposerRoleCannotDecideOrPromote(t *testing.T) {
	svc := newSvc(t)
	if _, err := svc.Submit(mat("a1", "d1")); err != nil {
		t.Fatalf("submit: %v", err)
	}

	// ⭐ 一個**只有** proposer 角色的帳號 —— ⛔ 沒有 admin。
	proposer := account.Account{ID: "ai-1", Roles: []string{RoleEditorProposer}}
	if proposer.HasRole(account.RoleAdmin) {
		t.Fatal("⛔ 儀器：proposer 竟然有 admin 角色 ⇒ 下面量的是空氣")
	}

	// ⭐ 用一個**真的** adminOnly（判準與出貨那支同一條：沒有 admin 角色 ⇒ 403）。
	adminOnly := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id, _ := auth.IdentityFrom(r.Context())
			if id.AccountID != "admin-1" {
				w.WriteHeader(http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
	h := NewHandlers(svc, adminOnly, func() (bool, bool) { return true, true }).
		WithPromote(PromoteDeps{Revalidate: okRevalidator})

	r := chi.NewRouter()
	r.Group(func(pr chi.Router) {
		pr.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				who := req.Header.Get("X-Test-Actor")
				next.ServeHTTP(w, req.WithContext(
					auth.WithIdentity(req.Context(), auth.Identity{AccountID: who})))
			})
		})
		h.Mount(pr)
	})

	for _, path := range []string{"/submissions/a1/decide", "/submissions/a1/promote"} {
		req := httptest.NewRequest(http.MethodPost, path,
			strings.NewReader(`{"status":"approved","confirm":true}`))
		req.Header.Set("X-Test-Actor", "ai-1")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusForbidden {
			t.Fatalf("⛔⛔ proposer 憑證打得到 %s（回 %d）⇒ ⭐ AI 可以自己核准自己的內容",
				path, w.Code)
		}
	}

	// ⭐ 儀器：admin 打得到（⛔ 否則上面那條可能是路線根本沒掛上）。
	req := httptest.NewRequest(http.MethodPost, "/submissions/a1/decide",
		strings.NewReader(`{"status":"approved"}`))
	req.Header.Set("X-Test-Actor", "admin-1")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("⛔ 儀器：admin 也打不到 decide（回 %d）⇒ 上面的 403 證明不了任何事", w.Code)
	}
}

// ★ ⭐ promote 少了 `confirm:true` ⇒ 400（明確授權 ＝ 一格必須是 true 的旗標）。
func TestPromoteRequiresExplicitConfirm(t *testing.T) {
	svc := newSvc(t)
	if _, err := svc.Submit(mat("a1", "d1")); err != nil {
		t.Fatalf("submit: %v", err)
	}
	if _, err := svc.Decide("a1", StatusApproved, "", "admin-1"); err != nil {
		t.Fatalf("decide: %v", err)
	}
	h := NewHandlers(svc, func(next http.Handler) http.Handler { return next },
		func() (bool, bool) { return true, true }).
		WithPromote(PromoteDeps{Revalidate: okRevalidator})
	r := chi.NewRouter()
	r.Group(func(pr chi.Router) {
		pr.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				next.ServeHTTP(w, req.WithContext(
					auth.WithIdentity(req.Context(), auth.Identity{AccountID: "admin-1"})))
			})
		})
		h.Mount(pr)
	})
	req := httptest.NewRequest(http.MethodPost, "/submissions/a1/promote",
		strings.NewReader(`{}`))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("⛔ 沒有 confirm 就上線了（回 %d）", w.Code)
	}
}
