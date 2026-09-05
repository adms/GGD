package submissions

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/httpx"
)

// ⭐⭐ GH#1022 —— 「投稿的 digest 是客戶端自己說的」的守衛。
//
// ── ⭐ 這一支量的是**接縫**：Go 拿到 content-api 的重算結果之後**怎麼比對** ────────
// 重算本身（JCS／語意投影）住在 TS（`apps/content-api/src/importRoutes.ts` 的
// `computeDigestReport` ← `packageDigest()`），它的守衛是那一邊的
// `importRoutesDigest.test.ts`（鍵順序打亂 · Unicode · 巢狀陣列 · 排除鍵）。
// ⛔ 這裡刻意**不**用一個真的 TS 行程 —— 這一側的問題是「回報說對不上時 Go 擋不擋、
// 指不指名文件、算不了時是不是 503 而不是放行」。假伺服器回的 JSON **逐字**是
// 那個端點的 wire shape（schema 字面值由 `DigestResultSchema` 兩邊釘住）。
//
// MUTATION LOG（落地前跑過）：
//   - `checkDigest` 的 `!report.Match` 與 `m.Digest != report.PackageDigest` 兩條比對拿掉
//     （永遠通過）→ 🔴 TestSwappedContentIsRefusedAndNamesTheDocument · TestStaleClaimIsRefused
//   - `ContentAPIDigestVerifier("")` 改成回一個「總是 match」的鉤子 → 🔴 TestNoContentAPIMeansNoDigestVerifier

const fixedDigest = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
const docPath = "authoring/abilities/hero.q.json"

// payload 造一份最小的 package 形狀（⭐ 頂層沒有 reviewer 自稱欄位）。
func payload(name string) string {
	return `{"schema":"ggd-editor-import@1","manifest":{"packageDigest":"` + fixedDigest + `"},` +
		`"documents":[{"path":"` + docPath + `","document":{"id":"hero.q","name":"` + name + `"}}]}`
}

// fakeContentAPI 模仿 `POST /api/v1/content-import/digest` 的**wire shape**：
// 文件 name 是 EVIL ⇒ 回「對不上」並指名那一份；沒有 documents ⇒ 422（解析不了）；
// 其餘 ⇒ match。
func fakeContentAPI(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/content-import/digest" {
			t.Errorf("⛔ 打到了錯的路徑：%s", r.URL.Path)
		}
		var body struct {
			Documents []struct {
				Path     string         `json:"path"`
				Document map[string]any `json:"document"`
			} `json:"documents"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		w.Header().Set("Content-Type", "application/json")
		if len(body.Documents) == 0 {
			w.WriteHeader(422)
			_, _ = w.Write([]byte(`{"schema":"ggd-content-import-error@1","code":"PACKAGE_INVALID",` +
				`"message":"not a package","retryable":false,"diagnostics":[{"code":"PACKAGE_INVALID"}]}`))
			return
		}
		if body.Documents[0].Document["name"] == "EVIL" {
			_, _ = w.Write([]byte(`{"schema":"` + DigestResultSchema + `","packageDigest":"` + fixedDigest + `",` +
				`"claimedDigest":"` + fixedDigest + `","match":false,"entries":1,"mismatches":[{"code":"ENTRY_HASH_MISMATCH",` +
				`"path":"` + body.Documents[0].Path + `","claimed":"sha256:aa","actual":"sha256:bb","message":"x"}]}`))
			return
		}
		_, _ = w.Write([]byte(`{"schema":"` + DigestResultSchema + `","packageDigest":"` + fixedDigest + `",` +
			`"claimedDigest":"` + fixedDigest + `","match":true,"entries":1,"mismatches":[]}`))
	}))
}

func recomputingSvc(t *testing.T, srvURL string) *Service {
	t.Helper()
	s := newSvc(t)
	s.SetDigestRecompute(func() bool { return true })
	s.SetDigestVerifier(ContentAPIDigestVerifier(srvURL, nil))
	return s
}

func submission(id, digest, name string) Material {
	return Material{
		ID: id, AccountID: "acct-1", Kind: "ability", Digest: digest, Payload: payload(name),
		Target: &Target{Collection: "abilities", ID: "手編的技能"},
	}
}

func httpStatus(t *testing.T, err error) (int, string) {
	t.Helper()
	var e *httpx.E
	if !errors.As(err, &e) {
		t.Fatalf("⛔ 不是 httpx.E：%v", err)
	}
	return e.Status, e.Code
}

// ★★ ⭐ 沒設定 content-api ⇒ **不給鉤子**（⛔ 不是給一個總是 match 的）。
func TestNoContentAPIMeansNoDigestVerifier(t *testing.T) {
	if ContentAPIDigestVerifier("", nil) != nil || ContentAPIDigestVerifier("  ", nil) != nil {
		t.Fatal("⛔⛔ 沒設定 content-api 卻給了一個鉤子 ⇒ ⭐ 那個鉤子只可能是「相信客戶端」")
	}
}

// ★★ ⭐⭐ 開關開著而沒有鉤子 ⇒ **503**（fail-loud），⛔ 不是退回「相信客戶端」。
func TestSubmitRefusesWithoutVerifierWhenRecomputeOn(t *testing.T) {
	s := newSvc(t)
	s.SetDigestRecompute(func() bool { return true })
	_, err := s.Submit(submission("a1", fixedDigest, "clean"))
	if err == nil {
		t.Fatal("⛔⛔ 開關開著、沒有 content-api，而投稿被收下了 ⇒ digest 又變成客戶端自己說的")
	}
	if st, code := httpStatus(t, err); st != 503 || code != "digest_verifier_missing" {
		t.Fatalf("⛔ 要 503 digest_verifier_missing，得到 %d %s", st, code)
	}
	// ⭐ 而 nil 的開關讀法要視為 **on**（fail-closed）。
	s2 := newSvc(t)
	s2.SetDigestRecompute(nil)
	if _, err := s2.Submit(submission("a2", fixedDigest, "clean")); err == nil {
		t.Fatal("⛔ 沒接上開關讀法卻被當成 off ⇒ 一條沒人決定過的路線預設成了放行")
	}
}

// ★★ ⭐⭐ AC1 ＋ AC2：**內容改過但沿用舊 digest ⇒ 400 並指名文件**；誠實的 ⇒ 照常通過。
func TestSwappedContentIsRefusedAndNamesTheDocument(t *testing.T) {
	srv := fakeContentAPI(t)
	defer srv.Close()
	s := recomputingSvc(t, srv.URL)

	// ⭐ 儀器（AC2）：誠實的投稿要過 —— ⛔ 否則下面的 400 可能只是「一律拒絕」。
	v, err := s.Submit(submission("a1", fixedDigest, "clean"))
	if err != nil {
		t.Fatalf("⛔ 誠實的投稿被拒：%v", err)
	}
	if v.Digest != fixedDigest {
		t.Fatalf("儀器：存下來的 digest 不是重算的那一個：%q", v.Digest)
	}
	if _, err := s.Decide("a1", StatusApproved, "", "admin-1"); err != nil {
		t.Fatalf("decide: %v", err)
	}

	// ⭐ 攻擊：換掉內容（name=EVIL），**沿用同一個 digest**。
	_, err = s.Submit(submission("a1", fixedDigest, "EVIL"))
	if err == nil {
		t.Fatal("⛔⛔ 內容改過而沿用舊 digest 的投稿被收下了 ⇒ 舊核准對這份新內容繼續有效")
	}
	st, code := httpStatus(t, err)
	if st != http.StatusBadRequest || code != "digest_mismatch" {
		t.Fatalf("⛔ 要 400 digest_mismatch，得到 %d %s：%v", st, code, err)
	}
	if !strings.Contains(err.Error(), docPath) {
		t.Fatalf("⛔ 訊息沒有指名是哪一份文件對不上：%v", err)
	}
	// ⭐ 而落地的仍然是乾淨的那一份 —— 核准對它**仍然有效**（⛔ 沒有被掉包）。
	got, err := s.Get("a1")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if strings.Contains(got.Payload, "EVIL") {
		t.Fatal("⛔⛔ 被拒的內容落地了")
	}
	if !got.Discoverable {
		t.Fatalf("⛔ 乾淨那一份的核准被一次失敗的掉包弄掉了：%+v", got)
	}
}

// ★★ ⭐ 投稿自稱的 digest 與伺服器重算的不同（manifest 本身完好）⇒ 400。
func TestStaleClaimIsRefused(t *testing.T) {
	srv := fakeContentAPI(t)
	defer srv.Close()
	s := recomputingSvc(t, srv.URL)
	other := "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
	_, err := s.Submit(submission("a1", other, "clean"))
	if err == nil {
		t.Fatal("⛔⛔ 自稱的 digest 與重算不同而被收下 ⇒ Discoverable 比對的還是客戶端的字串")
	}
	if st, code := httpStatus(t, err); st != 400 || code != "digest_mismatch" {
		t.Fatalf("⛔ 要 400 digest_mismatch，得到 %d %s", st, code)
	}
	if !strings.Contains(err.Error(), other) || !strings.Contains(err.Error(), fixedDigest) {
		t.Fatalf("⛔ 訊息要把宣稱與重算兩個值都說出來：%v", err)
	}
}

// ★ ⭐ 開關關掉 ＝ 一鍵回頭：回到只驗非空的舊行為（⛔ 不問 content-api）。
func TestRecomputeOffRestoresLegacyBehaviour(t *testing.T) {
	s := newSvc(t) // newSvc 已經把開關關掉；⛔ 沒有 verifier
	if _, err := s.Submit(submission("a1", "whatever-the-client-says", "EVIL")); err != nil {
		t.Fatalf("⛔ 開關關掉了還在擋 ⇒ 那不是一格可以回頭的開關：%v", err)
	}
}

// ★★ ⭐⭐ content-api 連不上 ⇒ **503**（⛔ 不是「相信客戶端」）。
func TestUnreachableContentAPIIs503(t *testing.T) {
	dead := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	url := dead.URL
	dead.Close()
	s := recomputingSvc(t, url)
	_, err := s.Submit(submission("a1", fixedDigest, "clean"))
	if err == nil {
		t.Fatal("⛔⛔ content-api 掛了而投稿被收下 ⇒ 這一格沒有安全的預設值")
	}
	if st, code := httpStatus(t, err); st != 503 || code != "digest_verifier_unavailable" {
		t.Fatalf("⛔ 要 503 digest_verifier_unavailable，得到 %d %s", st, code)
	}
}

// ★ ⭐ 包解析不了（不是一份 package）⇒ 400 並帶回診斷碼（投稿者的錯，⛔ 不是 503）。
func TestUnparsablePackageIs400(t *testing.T) {
	srv := fakeContentAPI(t)
	defer srv.Close()
	s := recomputingSvc(t, srv.URL)
	m := submission("a1", fixedDigest, "clean")
	m.Payload = `{"a":1}`
	_, err := s.Submit(m)
	if err == nil {
		t.Fatal("⛔ 不是 package 的 payload 被收下了 —— 它的 digest 根本算不出來")
	}
	if st, _ := httpStatus(t, err); st != 400 || !strings.Contains(err.Error(), "PACKAGE_INVALID") {
		t.Fatalf("⛔ 要 400 並帶診斷碼：%d %v", st, err)
	}
}

// ★ ⭐ 200 而 schema 不是這個端點的 ⇒ 拒（一個 proxy 的快取頁不可以被當成重算過）。
func TestWrongSchemaIsRefused(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"schema":"ggd-content-import-result@1","packageDigest":"` + fixedDigest + `","match":true}`))
	}))
	defer srv.Close()
	s := recomputingSvc(t, srv.URL)
	if _, err := s.Submit(submission("a1", fixedDigest, "clean")); err == nil {
		t.Fatal("⛔ schema 不對的 200 被當成重算過")
	}
}

// ★★ ⭐ 接縫（形態⑪）：走**真的 HTTP 路線**，`WithPromote` 接上的鉤子要真的管到 `POST /submissions`。
func TestHTTPSubmitRouteUsesTheDigestHook(t *testing.T) {
	srv := fakeContentAPI(t)
	defer srv.Close()
	svc := newSvc(t)
	h := NewHandlers(svc, func(next http.Handler) http.Handler { return next },
		func() (bool, bool) { return true, true }).
		WithPromote(PromoteDeps{
			Revalidate:      okRevalidator,
			VerifyDigest:    ContentAPIDigestVerifier(srv.URL, nil),
			DigestRecompute: func() bool { return true },
		})
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
	post := func(name string) *httptest.ResponseRecorder {
		body, _ := json.Marshal(submission("a1", fixedDigest, name))
		req := httptest.NewRequest(http.MethodPost, "/submissions", strings.NewReader(string(body)))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}
	if w := post("clean"); w.Code != http.StatusOK {
		t.Fatalf("儀器：誠實的投稿走 HTTP 被拒（%d）：%s", w.Code, w.Body.String())
	}
	w := post("EVIL")
	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), docPath) {
		t.Fatalf("⛔⛔ HTTP 路線上掉包沒被擋、或沒指名文件（%d）：%s", w.Code, w.Body.String())
	}
}
