package submissions

import (
	"context"
	"encoding/json"
	"net/url"
	"testing"
)

type portraitTestBridge struct {
	*workflowBridge
	files []string
}

func (b *portraitTestBridge) File(_ context.Context, _, version, path string) ([]byte, string, error) {
	b.files = append(b.files, version+":"+path)
	return []byte("webp:" + version), "image/webp", nil
}

func TestHeroPortraitUsesTheDisplayedPublishedVersion(t *testing.T) {
	svc, base := heroFixture(t)
	bridge := &portraitTestBridge{workflowBridge: base}
	svc.bridge = bridge
	for _, v := range []string{"v1", "v2"} {
		inspection := base.inspections[v]
		inspection.Project = json.RawMessage(`{"projectId":"hero-proof","presentation":{"championIcon":"assets/icons/` + v + `.webp"}}`)
		base.inspections[v] = inspection
	}
	enabled := true
	router := heroHTTP(t, svc, &enabled)
	first := freezeHero(t, svc, "v1")
	publishHero(t, svc, first, "publish-v1")
	path := "/hero-works/hero-proof/portrait?version=" + url.QueryEscape(first.Version.PackageDigest)
	response := heroRequest(router, "GET", path, "", "")
	if response.Code != 200 || response.Body.String() != "webp:"+first.Version.VersionID {
		t.Fatalf("published portrait unavailable: %d %s", response.Code, response.Body.String())
	}
	if response.Header().Get("Cache-Control") != "no-store" || response.Header().Get("Content-Type") != "image/webp" {
		t.Fatal("portrait response lost its type or cache policy")
	}
	second := freezeHero(t, svc, "v2")
	publishHero(t, svc, second, "publish-v2")
	stale := heroRequest(router, "GET", path, "", "")
	if stale.Code != 409 || len(bridge.files) != 1 {
		t.Fatalf("old list fetched newer portrait: %d %s", stale.Code, stale.Body.String())
	}
	fresh := heroRequest(router, "GET", "/hero-works/hero-proof/portrait?version="+url.QueryEscape(second.Version.PackageDigest), "", "")
	if fresh.Code != 200 || fresh.Body.String() != "webp:"+second.Version.VersionID {
		t.Fatal("refreshed list cannot fetch its own portrait")
	}
	if _, err := svc.Unpublish("hero-proof", "down", "isolated test", "admin", controlOf(t, svc).Revision); err != nil {
		t.Fatal(err)
	}
	if response := heroRequest(router, "GET", path, "", ""); response.Code != 404 {
		t.Fatalf("unpublished portrait leaked: %d", response.Code)
	}
}
