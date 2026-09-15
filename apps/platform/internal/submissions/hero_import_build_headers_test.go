package submissions

import (
	"bytes"
	"context"
	"net/http/httptest"
	"testing"
)

// GH#1229 —— 走出貨的路由與中介層：管理員拿到的位元組＝bridge 回的那一份，標頭＝不可嗅探、不可共用快取的 ZIP。
// ⚠️ 非管理員 403 已在 TestHeroHTTPIdentityAndReviewBoundaries 的 admin 閘迴圈驗過，⛔ 這裡不重複。
type takeoverBuildBridge struct {
	*workflowBridge
	workID   string
	returned []byte
}

func (b *takeoverBuildBridge) BuildTakeover(_ context.Context, workID string, source []byte) ([]byte, error) {
	b.workID = workID
	b.returned = append([]byte("PK\x03\x04compiled:"), source...)
	return b.returned, nil
}
func TestAdminHeroImportBuildReturnsBridgeZipAsPrivateBinary(t *testing.T) {
	svc, base := heroFixture(t)
	bridge := &takeoverBuildBridge{workflowBridge: base}
	svc.bridge = bridge
	enabled := true
	req := httptest.NewRequest("POST", "/api/v1/admin/hero-import/build", bytes.NewReader([]byte("PK\x03\x04source")))
	req.Header.Set("x-test-actor", "admin")
	req.Header.Set("Content-Type", "application/zip")
	req.Header.Set("x-ggd-work-id", "hero-proof")
	got := httptest.NewRecorder()
	heroHTTP(t, svc, &enabled).ServeHTTP(got, req)
	if got.Code != 200 || bridge.workID != "hero-proof" || !bytes.Equal(got.Body.Bytes(), bridge.returned) {
		t.Fatalf("admin build lost the bridge ZIP: %d work=%q body=%q", got.Code, bridge.workID, got.Body.String())
	}
	for header, want := range map[string]string{"Content-Type": "application/zip", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store"} {
		if got.Header().Get(header) != want {
			t.Errorf("%s = %q, want %q", header, got.Header().Get(header), want)
		}
	}
}
