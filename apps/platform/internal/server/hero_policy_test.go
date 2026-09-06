package server

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/ggd/platform/internal/config"
	"github.com/ggd/platform/internal/data/jsonstore"
)

func shippedHeroPolicy(t *testing.T) []byte {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "content", "config", "ugc.json"))
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func TestHeroIntakePolicyReadsMainConfigAndLiveOverlay(t *testing.T) {
	raw := shippedHeroPolicy(t)
	expected, err := parseHeroIntakePolicy(raw)
	if err != nil {
		t.Fatal("Main shipped config cannot be read", err)
	}
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "config"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "config", "ugc.json"), raw, 0600); err != nil {
		t.Fatal(err)
	}
	store, err := jsonstore.New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	s := &Server{Store: store, Cfg: config.Config{ContentDir: dir}}
	if got, err := s.heroIntakePolicy(); err != nil || got != expected {
		t.Fatalf("shipped: %+v %v", got, err)
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	doc["enabled"] = true
	doc["maxPendingPerPlayer"] = 3.
	doc["quotaPerPlayerPerDay"] = 8.
	if err := store.Put("content-overlay", "overlay", map[string]any{"docs": map[string]any{overlayUgcKey: doc}}); err != nil {
		t.Fatal(err)
	}
	if got, err := s.heroIntakePolicy(); err != nil || !got.Enabled || got.MaxPendingPerPlayer != 3 || got.QuotaPerPlayerPerDay != 8 {
		t.Fatalf("overlay not live: %+v %v", got, err)
	}
	if err := store.Put("content-overlay", "overlay", map[string]any{"docs": map[string]any{overlayUgcKey: map[string]any{"enabled": true}}}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.heroIntakePolicy(); err == nil {
		t.Fatal("invalid overlay fell back to permissive shipped values")
	}
	if err := store.Put("content-overlay", "overlay", map[string]any{"deleted": map[string]bool{overlayUgcKey: true}}); err != nil {
		t.Fatal(err)
	}
	if got, err := s.heroIntakePolicy(); err != nil || got != expected {
		t.Fatal("revert did not restore shipped policy", err)
	}
}

func TestHeroIntakePolicyRejectsMissingUnknownAndOutOfRangeConfig(t *testing.T) {
	for _, field := range []string{"enabled", "requireAuth", "autoPromote", "digestRecompute", "maxPendingPerPlayer", "quotaPerPlayerPerDay", "maxBytes"} {
		var doc map[string]any
		_ = json.Unmarshal(shippedHeroPolicy(t), &doc)
		delete(doc, field)
		raw, _ := json.Marshal(doc)
		if _, err := parseHeroIntakePolicy(raw); err == nil {
			t.Fatal("accepted missing", field)
		}
	}
	for _, change := range []map[string]any{{"enabled": "true"}, {"maxPendingPerPlayer": 0}, {"maxPendingPerPlayer": 201}, {"quotaPerPlayerPerDay": 501}, {"maxBytes": 4194305}, {"maxBytes": 2.5}, {"futurePolicy": true}, {"schema": "config.ugc@2"}} {
		var doc map[string]any
		_ = json.Unmarshal(shippedHeroPolicy(t), &doc)
		for k, v := range change {
			doc[k] = v
		}
		raw, _ := json.Marshal(doc)
		if _, err := parseHeroIntakePolicy(raw); err == nil {
			t.Fatal("accepted invalid policy", change)
		}
	}
	if _, err := (&Server{}).heroIntakePolicy(); err == nil {
		t.Fatal("missing config enabled intake")
	}
}
