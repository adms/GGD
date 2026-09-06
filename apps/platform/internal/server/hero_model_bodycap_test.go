package server

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/ggd/platform/internal/submissions"
)

func TestHeroModelBodyCapAllowsOnlyExactBinaryUploadRoute(t *testing.T) {
	path := "/api/v1/hero-model-assets/" + strings.Repeat("a", 64)
	for _, test := range []struct {
		method, path string
		allow        bool
	}{
		{"PUT", path, true}, {"POST", path, false}, {"GET", path, false},
		{"PUT", path + "/metadata", false}, {"PUT", path + "a", false},
		{"PUT", "/api/v1/hero-model-assets/not-a-hash", false},
	} {
		req := httptest.NewRequest(test.method, test.path, bytes.NewReader(bytes.Repeat([]byte("x"), 2<<20)))
		var readErr error
		capRequestBody(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, readErr = io.Copy(io.Discard, r.Body) })).ServeHTTP(httptest.NewRecorder(), req)
		if (readErr == nil) != test.allow {
			t.Fatalf("%s %s: %v", test.method, test.path, readErr)
		}
	}
	for _, size := range []int{submissions.MaxHeroModelAssetBytes, submissions.MaxHeroModelAssetBytes + 1} {
		req := httptest.NewRequest("PUT", path, bytes.NewReader(make([]byte, size)))
		var readErr error
		capRequestBody(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, readErr = io.Copy(io.Discard, r.Body) })).ServeHTTP(httptest.NewRecorder(), req)
		if (readErr == nil) != (size == submissions.MaxHeroModelAssetBytes) {
			t.Fatalf("boundary %d: %v", size, readErr)
		}
	}
}
