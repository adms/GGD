package server

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHeroTakeoverBodyCapAllowsOnlyExactAdminArchiveRoutes(t *testing.T) {
	for _, test := range []struct {
		path  string
		allow bool
	}{
		{"/api/v1/admin/hero-import/build", true},
		{"/api/v1/admin/hero-import/inspect", true},
		{"/api/v1/admin/hero-submissions/takeover", true},
		{"/api/v1/admin/hero-import/build/extra", false},
		{"/api/v1/admin/hero-submissions/takeover/extra", false},
		{"/api/v1/hero-import/admin/build", false},
	} {
		req := httptest.NewRequest(http.MethodPost, test.path, bytes.NewReader(bytes.Repeat([]byte("x"), 2<<20)))
		var readErr error
		capRequestBody(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
			_, readErr = io.Copy(io.Discard, r.Body)
		})).ServeHTTP(httptest.NewRecorder(), req)
		if (readErr == nil) != test.allow {
			t.Fatalf("POST %s: allow=%t, read error=%v", test.path, test.allow, readErr)
		}
	}
}
