package contentoverlay_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/ggd/platform/internal/contentoverlay"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/stretchr/testify/require"
)

type catalogStub struct {
	captureErr error
	captured   []contentoverlay.Overlay
	prepare    func() []byte
	asset      []byte
}

func (b *catalogStub) Catalog(_ context.Context, action string, raw []byte) ([]byte, error) {
	var input struct {
		Overlay contentoverlay.Overlay `json:"overlay"`
	}
	_ = json.Unmarshal(raw, &input)
	if action == "capture" {
		b.captured = append(b.captured, input.Overlay)
		if b.captureErr != nil {
			return nil, b.captureErr
		}
		return []byte(`{"version":{"versionId":"sha256:` + strings.Repeat("a", 64) + `"}}`), nil
	}
	return b.prepare(), nil
}
func (b *catalogStub) File(context.Context, string, string, string) ([]byte, string, error) {
	return b.asset, "model/gltf-binary", nil
}
func catalogFixture(t *testing.T) (*contentoverlay.Service, *jsonstore.Store, *catalogStub, contentoverlay.CatalogCommand, map[string]any) {
	t.Helper()
	store, err := jsonstore.New(t.TempDir())
	require.NoError(t, err)
	b := &catalogStub{asset: []byte("immutable model")}
	svc := contentoverlay.New(store, nil, contentoverlay.WithCatalogBridge(b))
	initial := contentoverlay.EmptyOverlay()
	initial.Generation = 1
	initial.Docs["champions/hero-a"] = json.RawMessage(`{"id":"hero-a","schema":"champion@1","name":"current","baseStats":{"ad":99}}`)
	initial.Docs["champions/hero-b"] = json.RawMessage(`{"id":"hero-b","schema":"champion@1","name":"other"}`)
	require.NoError(t, store.Put(contentoverlay.Collection, contentoverlay.DocID, initial))
	command := contentoverlay.CatalogCommand{HeroPath: "catalog/champions/hero-a.json", VersionID: "sha256:" + strings.Repeat("b", 64), ExpectedCurrentVersion: "sha256:" + strings.Repeat("a", 64), PlanDigest: "sha256:" + strings.Repeat("c", 64)}
	owner := sha256.Sum256([]byte(command.HeroPath))
	id := "instance." + hex.EncodeToString(owner[:])[:12] + ".old.model"
	sum := sha256.Sum256(b.asset)
	path := "assets/hero-instances/" + hex.EncodeToString(sum[:]) + ".glb"
	plan := map[string]any{"schema": "ggd-catalog-overlay-plan@1", "workId": "ggd-existing-hero-instances", "versionId": "sha256:" + strings.Repeat("d", 64), "sourceVersion": command.VersionID, "previousVersion": command.ExpectedCurrentVersion, "currentVersion": command.ExpectedCurrentVersion, "planDigest": command.PlanDigest, "heroPath": command.HeroPath, "heroId": "hero-a", "contentVersion": "cv-test", "expectedGeneration": 1, "writes": []map[string]any{{"key": "champions/hero-a", "doc": map[string]any{"id": "hero-a", "schema": "champion@1", "name": "old", "baseStats": map[string]any{"ad": 34}, "modelKey": id}}, {"key": "models/" + id, "doc": map[string]any{"id": id, "schema": "model@1", "glbPath": path, "clipMap": map[string]any{"cast": "OldCast"}}}}, "assets": []map[string]any{{"path": path, "sha256": "sha256:" + hex.EncodeToString(sum[:]), "bytes": len(b.asset), "contentType": "model/gltf-binary"}}}
	b.prepare = func() []byte { raw, _ := json.Marshal(plan); return raw }
	return svc, store, b, command, plan
}
func TestCatalogRestoreCommitsHeroAndModelTogetherAndKeepsOtherHero(t *testing.T) {
	svc, store, _, command, plan := catalogFixture(t)
	ctx := context.Background()
	before, err := svc.Get(ctx)
	require.NoError(t, err)
	raw, err := svc.Catalog(ctx, "restore", command, "reviewer")
	require.NoError(t, err)
	require.Contains(t, string(raw), `"generation":2`)
	after, err := svc.Get(ctx)
	require.NoError(t, err)
	var hero struct {
		BaseStats struct {
			AD int `json:"ad"`
		} `json:"baseStats"`
	}
	require.NoError(t, json.Unmarshal(after.Docs["champions/hero-a"], &hero))
	require.Equal(t, 34, hero.BaseStats.AD)
	require.JSONEq(t, string(before.Docs["champions/hero-b"]), string(after.Docs["champions/hero-b"]))
	versions, err := svc.Versions(ctx, 10)
	require.NoError(t, err)
	require.Len(t, versions.Entries, 2)
	name := strings.TrimPrefix(plan["assets"].([]map[string]any)[0]["path"].(string), "assets/hero-instances/")
	reopened := contentoverlay.New(store, nil)
	body, kind, err := reopened.CatalogAsset(name)
	require.NoError(t, err)
	require.Equal(t, "immutable model", string(body))
	require.Equal(t, "model/gltf-binary", kind)
}
func TestCatalogCaptureFailureLeavesCurrentAndAuditUntouched(t *testing.T) {
	svc, store, b, _, _ := catalogFixture(t)
	ctx := context.Background()
	before, err := svc.Get(ctx)
	require.NoError(t, err)
	b.captureErr = errors.New("disk failed")
	_, err = svc.PutDoc(ctx, "champions", "hero-a", json.RawMessage(`{"id":"hero-a","schema":"champion@1","name":"must not apply"}`), "reviewer")
	require.ErrorContains(t, err, "未套用")
	after, err := svc.Get(ctx)
	require.NoError(t, err)
	require.Equal(t, before, after)
	require.Len(t, b.captured, 1)
	for key, doc := range before.Docs {
		require.JSONEq(t, string(doc), string(b.captured[0].Docs[key]))
	}
	lines, err := store.ReadLines(contentoverlay.LogCollection, "2026-09-08")
	require.NoError(t, err)
	require.Empty(t, lines)
}
func TestCatalogRestoreRejectsForeignWritesAndCorruptAssets(t *testing.T) {
	for _, which := range []string{"foreign", "asset", "receipt"} {
		t.Run(which, func(t *testing.T) {
			svc, _, b, command, plan := catalogFixture(t)
			before, err := svc.Get(context.Background())
			require.NoError(t, err)
			switch which {
			case "foreign":
				plan["writes"].([]map[string]any)[1]["key"] = "models/shared-model"
			case "asset":
				b.asset = []byte("bad")
			case "receipt":
				plan["sourceVersion"] = "sha256:" + strings.Repeat("f", 64)
			}
			_, err = svc.Catalog(context.Background(), "restore", command, "reviewer")
			require.Error(t, err)
			after, err := svc.Get(context.Background())
			require.NoError(t, err)
			require.Equal(t, before, after)
		})
	}
}
func TestCatalogRestoreDetectsConcurrentOverlayEdit(t *testing.T) {
	svc, _, b, command, _ := catalogFixture(t)
	original := b.prepare
	b.prepare = func() []byte {
		_, err := svc.PutDoc(context.Background(), "champions", "hero-b", json.RawMessage(`{"id":"hero-b","schema":"champion@1","name":"concurrent"}`), "other-reviewer")
		require.NoError(t, err)
		return original()
	}
	_, err := svc.Catalog(context.Background(), "restore", command, "reviewer")
	require.ErrorContains(t, err, "重新比較")
	after, err := svc.Get(context.Background())
	require.NoError(t, err)
	var hero struct {
		BaseStats struct {
			AD int `json:"ad"`
		} `json:"baseStats"`
	}
	require.NoError(t, json.Unmarshal(after.Docs["champions/hero-a"], &hero))
	require.Equal(t, 99, hero.BaseStats.AD)
	require.Contains(t, string(after.Docs["champions/hero-b"]), "concurrent")
}
