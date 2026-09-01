package submissions

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// ⭐⭐ 重驗的守衛。
//
// MUTATION LOG（落地前跑過）：
//   - baseURL 空字串改成回一個「總是通過」的鉤子 → 🔴
//   - `resp.StatusCode != 200` 那一條拿掉 → 🔴
//   - 連不上時改成回 nil error → 🔴

// ★★ ⭐ 沒設定 content-api ⇒ **不給鉤子**（⛔ 不是給一個總是通過的）。
func TestNoContentAPIMeansNoHook(t *testing.T) {
	if ContentAPIRevalidator("", nil) != nil {
		t.Fatal("⛔⛔ 沒設定 content-api 卻給了一個鉤子 ⇒ ⭐ 那個鉤子只可能是「總是通過」")
	}
	if ContentAPIRevalidator("   ", nil) != nil {
		t.Fatal("⛔ 空白字串也要當成沒設定")
	}
}

// ★★ ⭐ content-api 說 validated ⇒ 過，而 receipt 帶得回診斷。
func TestRevalidatePassesThrough(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/api/v1/content-import/validate") {
			t.Errorf("⛔ 打到了錯的路徑：%s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"validated","packageDigest":"sha256:aa","changedDocuments":[{"id":"x"}],"diagnostics":[]}`))
	}))
	defer srv.Close()
	rv := ContentAPIRevalidator(srv.URL, nil)
	if rv == nil {
		t.Fatal("⛔ 有設定卻沒給鉤子")
	}
	receipt, err := rv(Material{ID: "a1", Payload: `{"schema":"ggd-editor-import@1"}`})
	if err != nil {
		t.Fatalf("⛔ content-api 說 validated 而重驗卻失敗：%v", err)
	}
	if receipt["packageDigest"] != "sha256:aa" {
		t.Fatalf("⛔ receipt 沒帶回 packageDigest：%v", receipt)
	}
	if receipt["changedCount"] != 1 {
		t.Fatalf("⛔ receipt 的 changedCount 不對：%v", receipt["changedCount"])
	}
}

// ★★ ⭐ content-api 拒絕 ⇒ **拒絕 promote**，而且訊息要**指名那幾條診斷**。
func TestRevalidateRefusesAndNamesDiagnostics(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(422)
		_, _ = w.Write([]byte(`{"status":"rejected","diagnostics":[{"code":"REF_NOT_CLOSED"},{"code":"CAPABILITY_UNSUPPORTED"}]}`))
	}))
	defer srv.Close()
	_, err := ContentAPIRevalidator(srv.URL, nil)(Material{ID: "a1", Payload: "{}"})
	if err == nil {
		t.Fatal("⛔⛔ content-api 拒絕了而重驗說通過")
	}
	for _, want := range []string{"REF_NOT_CLOSED", "CAPABILITY_UNSUPPORTED"} {
		if !strings.Contains(err.Error(), want) {
			t.Fatalf("⛔ 訊息沒有指名 %s ⇒ ⭐ 審核的人看不到是哪一條：%v", want, err)
		}
	}
}

// ★★ ⭐⭐ **連不上 ⇒ 拒絕**（⛔ 不是「先讓它上」）。
func TestRevalidateRefusesWhenUnreachable(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	url := srv.URL
	srv.Close() // ⭐ 關掉它 —— 現在那個位址是死的。
	_, err := ContentAPIRevalidator(url, nil)(Material{ID: "a1", Payload: "{}"})
	if err == nil {
		t.Fatal("⛔⛔ content-api 掛了而 promote 過了 ⇒ ⭐ 這一格沒有安全的預設值")
	}
	if !strings.Contains(err.Error(), "拒絕 promote") {
		t.Fatalf("⛔ 訊息沒說清楚後果：%v", err)
	}
}

// ★ ⭐ 回 200 但 status 不是 validated ⇒ 也要拒。
func TestRevalidateRefusesNonValidatedStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"rejected","diagnostics":[]}`))
	}))
	defer srv.Close()
	if _, err := ContentAPIRevalidator(srv.URL, nil)(Material{ID: "a1", Payload: "{}"}); err == nil {
		t.Fatal("⛔ HTTP 200 但 status=rejected 被當成通過")
	}
}

// ★★ ⭐ HTTP 非 200 **而 body 說 validated** ⇒ 仍然要拒。
//
// ⚠️ ⭐ 這一條是**突變逼出來的**：把 `resp.StatusCode != 200` 拿掉之後全部還是綠的，
// 因為既有的夾具在 422 時 body 也寫著 `rejected` ⇒ 下一道檢查會接住它。
// ⇒ ⭐ 那代表**狀態碼那一條在測試裡不承重** —— 而它在真實世界承重：
//
//	一個 500（proxy 掛了、body 是快取的舊回應）配上一句 `"status":"validated"`
//	就會讓 promote 過。⛔ 補一條把它釘住。
func TestRevalidateRefusesNon200EvenIfBodySaysValidated(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(500)
		_, _ = w.Write([]byte(`{"status":"validated","diagnostics":[]}`))
	}))
	defer srv.Close()
	if _, err := ContentAPIRevalidator(srv.URL, nil)(Material{ID: "a1", Payload: "{}"}); err == nil {
		t.Fatal("⛔⛔ HTTP 500 而 body 說 validated 被當成通過 ⇒ ⭐ 狀態碼那一道沒有在守")
	}
}
