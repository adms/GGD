package server

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/ggd/platform/internal/config"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/submissions"
)

// ⭐⭐ GH#1022 —— 接線的守衛（AC3 ＋ 開關的讀法）。
//
// ⚠️ 這裡量的是 `playercontent.go` **真的**組出來的 deps —— ⛔ 不是自己 new 一個
// Revalidator（那會是形態⑤：被測的不是出貨的那個）。

type notOwnedForTest struct{}

func (notOwnedForTest) IsGeneratorOwned(string, string) (bool, bool) { return false, true }

// ★★ ⭐⭐ AC3：`GGD_CONTENT_API_URL` 接上 ⇒ `Promote` **不再 503**，走到 revalidate.go。
func TestPromoteReachesRevalidateWhenContentAPIURLIsSet(t *testing.T) {
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/v1/content-import/validate":
			_, _ = w.Write([]byte(`{"status":"validated","packageDigest":"sha256:aa","changedDocuments":[],"diagnostics":[]}`))
		default:
			t.Errorf("⛔ 打到了錯的路徑：%s", r.URL.Path)
			w.WriteHeader(404)
		}
	}))
	defer api.Close()

	store, err := jsonstore.New(t.TempDir())
	if err != nil {
		t.Fatalf("jsonstore: %v", err)
	}
	svc := submissions.New(store)
	svc.SetGeneratorOwned(notOwnedForTest{})
	svc.SetDigestRecompute(func() bool { return false }) // 這一條只量 promote 那一半
	m := submissions.Material{
		ID: "a1", AccountID: "acct-1", Kind: "ability", Digest: "sha256:aa", Payload: `{"a":1}`,
		Target: &submissions.Target{Collection: "abilities", ID: "x"},
	}
	if _, err := svc.Submit(m); err != nil {
		t.Fatalf("submit: %v", err)
	}
	if _, err := svc.Decide("a1", submissions.StatusApproved, "", "admin-1"); err != nil {
		t.Fatalf("decide: %v", err)
	}

	// ⭐ 基線：沒設定 ⇒ 503 revalidator_missing（票文量到的今天）。
	t.Setenv("GGD_CONTENT_API_URL", "")
	s := &Server{}
	if d := s.submissionPromoteDeps(); d.Revalidate != nil || d.VerifyDigest != nil {
		t.Fatal("⛔ 沒設定 GGD_CONTENT_API_URL 卻有鉤子 ⇒ 那個鉤子只可能是「總是通過」")
	}
	if _, err := svc.Promote("a1", "admin-1", s.submissionPromoteDeps().Revalidate); err == nil {
		t.Fatal("儀器：沒設定時 Promote 應該 503")
	}

	// ⭐ 接上 ⇒ 走到 revalidate.go，⛔ 不再 503。
	t.Setenv("GGD_CONTENT_API_URL", api.URL)
	d := s.submissionPromoteDeps()
	if d.Revalidate == nil || d.VerifyDigest == nil {
		t.Fatal("⛔⛔ GGD_CONTENT_API_URL 設了而鉤子還是 nil ⇒ Promote 永遠 503")
	}
	got, err := svc.Promote("a1", "admin-1", d.Revalidate)
	if err != nil {
		t.Fatalf("⛔⛔ 接上 content-api 之後 Promote 仍然失敗：%v", err)
	}
	if !got.Promoted {
		t.Fatalf("⛔ Promote 回成功而 Promoted=false：%+v", got)
	}
}

// ★★ ⭐ 開關的讀法：出貨樹 on/off 讀得到；讀不到／壞掉／缺欄位 ⇒ **on**（fail-closed）。
func TestUgcDigestRecomputeReadsShippedAndFailsClosed(t *testing.T) {
	cases := map[string]struct {
		body string
		want bool
	}{
		"on":        {`{"id":"ugc","schema":"config.ugc@1","digestRecompute":true}`, true},
		"off":       {`{"id":"ugc","schema":"config.ugc@1","digestRecompute":false}`, false},
		"missing":   {`{"id":"ugc","schema":"config.ugc@1"}`, true},
		"garbage":   {`{not json`, true},
		"badtag":    {`{"id":"ugc","schema":"config.other@1","digestRecompute":false}`, true},
		"nofile":    {"", true},
		"nocontent": {"", true},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			dir := t.TempDir()
			if c.body != "" {
				if err := os.MkdirAll(filepath.Join(dir, "config"), 0o750); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(filepath.Join(dir, "config", "ugc.json"), []byte(c.body), 0o600); err != nil {
					t.Fatal(err)
				}
			}
			if name == "nocontent" {
				dir = ""
			}
			s := &Server{Cfg: config.Config{ContentDir: dir}}
			if got := s.ugcDigestRecompute(); got != c.want {
				t.Fatalf("⛔ %s：要 %v 得到 %v", name, c.want, got)
			}
		})
	}
}
