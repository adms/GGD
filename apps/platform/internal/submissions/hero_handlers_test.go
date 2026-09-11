package submissions

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/ggd/platform/internal/auth"
	"github.com/go-chi/chi/v5"
)

func heroHTTP(t *testing.T, s *HeroService, enabled *bool) http.Handler {
	t.Helper()
	adminOnly := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if auth.MustIdentity(r.Context()).AccountID != "admin" {
				w.WriteHeader(403)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
	h := NewHeroHandlers(s, adminOnly, func() (bool, bool) { return *enabled, *enabled })
	router := chi.NewRouter()
	router.Route("/api/v1", func(r chi.Router) {
		h.MountPublic(r)
		r.Group(func(secure chi.Router) {
			secure.Use(func(next http.Handler) http.Handler {
				return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					id := r.Header.Get("x-test-actor")
					if id == "" {
						w.WriteHeader(401)
						return
					}
					next.ServeHTTP(w, r.WithContext(auth.WithIdentity(r.Context(), auth.Identity{AccountID: id})))
				})
			})
			h.Mount(secure)
			NewHandlers(New(s.store), adminOnly, func() (bool, bool) { return *enabled, *enabled }).Mount(secure)
		})
	})
	return router
}

func TestHeroHistoryDoesNotMasqueradeAsPendingLegacyMaterials(t *testing.T) {
	s, _ := heroFixture(t)
	first := freezeHero(t, s, "v1")
	publishHero(t, s, first, "publish-v1")
	second := freezeHero(t, s, "v2")
	if _, err := s.Withdraw(second.ID, "alice", controlOf(t, s).Revision); err != nil {
		t.Fatal(err)
	}
	third := freezeHero(t, s, "v3")
	legacy := New(s.store)
	legacy.SetDigestRecompute(func() bool { return false })
	m := mat("legacy-material", "digest")
	m.AccountID = "alice"
	if _, err := legacy.Submit(m); err != nil {
		t.Fatal(err)
	}
	enabled := true
	router := heroHTTP(t, s, &enabled)
	for _, test := range []struct{ path, actor string }{{"/submissions/mine", "alice"}, {"/submissions/pending", "admin"}} {
		response := heroRequest(router, "GET", test.path, test.actor, "")
		var rows []View
		if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &rows) != nil || len(rows) != 1 || rows[0].ID != m.ID {
			t.Fatalf("legacy queue contains false pending heroes: %s", response.Body.String())
		}
	}
	response := heroRequest(router, "GET", "/admin/hero-submissions", "admin", "")
	var page struct {
		Items []HeroListRow `json:"items"`
	}
	if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &page) != nil || len(page.Items) != 3 {
		t.Fatalf("hero history disappeared: %s", response.Body.String())
	}
	want := map[string]string{first.ID: "published", second.ID: "withdrawn", third.ID: "pending"}
	for _, row := range page.Items {
		if row.Status != want[row.ID] {
			t.Fatalf("wrong hero state: %+v", row)
		}
	}
}
func heroRequest(router http.Handler, method, path, actor, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, "/api/v1"+path, strings.NewReader(body))
	r.Header.Set("x-test-actor", actor)
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, r)
	return w
}
func TestHeroSourcePackageFollowsPublicationAndRemixRights(t *testing.T) {
	s, _ := heroFixture(t)
	snapshot, err := s.Submit(context.Background(), "alice", "hero-proof", "private-model", []byte("v1"), false)
	if err != nil {
		t.Fatal(err)
	}
	enabled := true
	router := heroHTTP(t, s, &enabled)
	path := "/hero-works/hero-proof/source/package"
	if got := heroRequest(router, "GET", path, "alice", "").Code; got != 404 {
		t.Fatalf("unpublished package: %d", got)
	}
	publishHero(t, s, snapshot, "publish-model")
	for actor, status := range map[string]int{"": 401, "bob": 403, "alice": 200} {
		got := heroRequest(router, "GET", path, actor, "")
		if got.Code != status {
			t.Fatalf("actor %q: %d %s", actor, got.Code, got.Body.String())
		}
		if status == 200 && (got.Body.String() != "v1" || got.Header().Get("X-GGD-Package-Digest") != snapshot.Version.PackageDigest || got.Header().Get("Cache-Control") != "private, no-store") {
			t.Fatal("immutable source receipt changed")
		}
	}
	shared := freezeHero(t, s, "v2")
	publishHero(t, s, shared, "allow-remix")
	if got := heroRequest(router, "GET", path, "bob", ""); got.Code != 200 || got.Body.String() != "v2" {
		t.Fatal("authorized remix cannot recover model package")
	}
	enabled = false
	if got := heroRequest(router, "GET", path, "alice", "").Code; got != 403 {
		t.Fatal("discovery rollback bypassed")
	}
	enabled = true
	if _, err := s.Unpublish("hero-proof", "hide-model", "needs review", "admin", controlOf(t, s).Revision); err != nil {
		t.Fatal(err)
	}
	if got := heroRequest(router, "GET", path, "alice", "").Code; got != 404 {
		t.Fatal("unpublished source remained available")
	}
}
func TestHeroHTTPIdentityAndReviewBoundaries(t *testing.T) {
	s, _ := heroFixture(t)
	snapshot := freezeHero(t, s, "v1")
	enabled := true
	router := heroHTTP(t, s, &enabled)
	for _, path := range []string{"/hero-works/mine", "/hero-submissions/" + snapshot.ID, "/admin/hero-submissions"} {
		if got := heroRequest(router, "GET", path, "", "").Code; got != 401 {
			t.Fatalf("anonymous %s: %d", path, got)
		}
	}
	if got := heroRequest(router, "GET", "/hero-submissions/"+snapshot.ID, "bob", "").Code; got != 403 {
		t.Fatalf("other author saw private snapshot: %d", got)
	}
	if got := heroRequest(router, "GET", "/hero-submissions/"+snapshot.ID, "alice", "").Code; got != 200 {
		t.Fatalf("owner cannot read: %d", got)
	}
	for _, actor := range []string{"bob", "alice", "editor-proposer"} {
		if got := heroRequest(router, "GET", "/admin/hero-submissions/"+snapshot.ID+"/package", actor, "").Code; got != 403 {
			t.Fatalf("private review package escaped admin boundary: %s %d", actor, got)
		}
	}
	if got := heroRequest(router, "GET", "/admin/hero-submissions/"+snapshot.ID+"/package", "admin", "").Code; got != 200 {
		t.Fatalf("admin cannot load frozen package: %d", got)
	}
	for _, actor := range []string{"alice", "editor-proposer"} {
		for _, path := range []string{"/admin/hero-import/build", "/admin/hero-import/inspect", "/admin/hero-submissions/takeover", "/admin/hero-submissions/" + snapshot.ID + "/publish", "/admin/hero-submissions/" + snapshot.ID + "/decide", "/admin/hero-works/hero-proof/unpublish"} {
			if got := heroRequest(router, "POST", path, actor, `{"reviewer":"admin"}`).Code; got != 403 {
				t.Fatalf("%s bypassed admin gate %s: %d", actor, path, got)
			}
		}
	}
	if got := heroRequest(router, "POST", "/admin/hero-submissions/"+snapshot.ID+"/publish", "admin", `{"reviewer":"another-admin","operationId":"forged"}`).Code; got != 400 {
		t.Fatalf("untrusted reviewer field accepted: %d", got)
	}
	control := controlOf(t, s)
	body, _ := json.Marshal(map[string]any{"operationId": "via-http", "action": "publish", "reason": "完整六槽檢查通過", "expectedRevision": control.Revision})
	response := heroRequest(router, "POST", "/admin/hero-submissions/"+snapshot.ID+"/publish", "admin", string(body))
	if response.Code != 200 {
		t.Fatalf("legitimate admin failed: %d %s", response.Code, response.Body.String())
	}
	view, err := s.Review(snapshot.ID)
	if err != nil || view.Decision.DecidedBy != "admin" || view.Status != "published" {
		t.Fatalf("actor was not session-bound: %+v %v", view, err)
	}
}

func TestHeroHTTPApprovedPublicationSurvivesIntakeClosure(t *testing.T) {
	s, b := heroFixture(t)
	snapshot := freezeHero(t, s, "v1")
	enabled := true
	router := heroHTTP(t, s, &enabled)
	list := func() []HeroListRow {
		t.Helper()
		response := heroRequest(router, "GET", "/hero-works/published", "", "")
		if response.Code != 200 {
			t.Fatal(response.Body.String())
		}
		var rows []HeroListRow
		if err := json.Unmarshal(response.Body.Bytes(), &rows); err != nil {
			t.Fatal(err)
		}
		return rows
	}
	if len(list()) != 0 {
		t.Fatal("pending work discoverable")
	}
	b.failPrepare = true
	_, _ = s.Publish(context.Background(), snapshot.ID, "failed", "publish", "checked", "admin", controlOf(t, s).Revision)
	if len(list()) != 0 {
		t.Fatal("approved but failed work discoverable")
	}
	b.failPrepare = false
	publishHero(t, s, snapshot, "success")
	if len(list()) != 1 {
		t.Fatal("published work absent")
	}
	enabled = false
	if len(list()) != 1 {
		t.Fatal("closing intake hid an already approved official hero")
	}
	enabled = true
	if _, err := s.Unpublish("hero-proof", "hide", "down", "admin", controlOf(t, s).Revision); err != nil {
		t.Fatal(err)
	}
	if len(list()) != 0 {
		t.Fatal("unpublished work remains discoverable")
	}
	if got := heroRequest(router, "GET", "/hero-submissions/"+snapshot.ID, "alice", "").Code; got != 200 {
		t.Fatal("unpublish destroyed private history")
	}
}
