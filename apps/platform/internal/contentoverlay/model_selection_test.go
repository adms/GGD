package contentoverlay_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/ggd/platform/internal/contentoverlay"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/stretchr/testify/require"
)

func TestModelSelectionPriorityManualDurabilityAndTamper(t *testing.T) {
	svc, dataDir, dir := newSvcWithContent(t)
	digest := func(raw []byte) string { s := sha256.Sum256(raw); return hex.EncodeToString(s[:]) }
	binary := []byte("hash-pinned GLB fixture")
	writeShippedDoc(t, dir, "assets/body.glb", string(binary))
	versions := []map[string]any{}
	models := []shippedEntry{}
	for _, tier := range []string{"original", "300heroes", "mba", "w3x"} {
		id := "version.body." + tier
		raw, _ := json.Marshal(map[string]any{"id": id, "schema": "model@1", "glbPath": "assets/body.glb"})
		writeShippedDoc(t, dir, "models/"+id+".json", string(raw))
		models = append(models, shippedEntry{ID: id, Path: "models/" + id + ".json", Hash: "sha256:" + digest(raw), Size: len(raw)})
		versions = append(versions, map[string]any{"modelKey": id, "modelSha256": digest(raw), "binarySha256": digest(binary), "source": map[string]any{"tier": tier}})
	}
	writeShippedIndex(t, dir, "models", models)
	raw, _ := json.Marshal(map[string]any{"id": "hero", "schema": "champion@1", "name": "hero", "modelKey": "version.body.original", "modelVersions": versions, "baseStats": map[string]any{"ad": 37}})
	writeShippedDoc(t, dir, "champions/hero.json", string(raw))
	writeShippedIndex(t, dir, "champions", []shippedEntry{{ID: "hero", Path: "champions/hero.json", Hash: "sha256:" + digest(raw), Size: len(raw)}})
	ctx := context.Background()
	initial, err := svc.ModelSelection(ctx, "hero")
	require.NoError(t, err)
	require.Equal(t, "version.body.300heroes", initial.PreferredModelKey)
	selected, err := svc.SelectModel(ctx, "hero", contentoverlay.ModelSelectionCommand{Action: "automatic", ExpectedHash: initial.ExpectedHash}, "operator")
	require.NoError(t, err)
	require.Equal(t, "version.body.300heroes", selected.ActiveModelKey)
	_, err = svc.SelectModel(ctx, "hero", contentoverlay.ModelSelectionCommand{Action: "activate", ExpectedHash: initial.ExpectedHash, ModelKey: "version.body.mba"}, "operator")
	require.ErrorContains(t, err, "重新載入")
	selected, err = svc.SelectModel(ctx, "hero", contentoverlay.ModelSelectionCommand{Action: "activate", ExpectedHash: selected.ExpectedHash, ModelKey: "version.body.mba"}, "operator")
	require.NoError(t, err)
	require.Equal(t, "manual", selected.SelectionMode)
	store, err := jsonstore.New(dataDir)
	require.NoError(t, err)
	reopened := contentoverlay.New(store, nil, contentoverlay.WithContentDir(dir))
	restored, err := reopened.ModelSelection(ctx, "hero")
	require.NoError(t, err)
	require.Equal(t, selected, restored)
	overlay, err := reopened.Get(ctx)
	require.NoError(t, err)
	var saved map[string]any
	require.NoError(t, json.Unmarshal(overlay.Docs["champions/hero"], &saved))
	require.Equal(t, float64(37), saved["baseStats"].(map[string]any)["ad"])
	_, err = reopened.SelectModel(ctx, "hero", contentoverlay.ModelSelectionCommand{Action: "register", ExpectedHash: selected.ExpectedHash}, "operator")
	require.Error(t, err)
	require.NoError(t, os.WriteFile(filepath.Join(dir, "assets/body.glb"), []byte("corrupted"), 0600))
	_, err = reopened.SelectModel(ctx, "hero", contentoverlay.ModelSelectionCommand{Action: "automatic", ExpectedHash: selected.ExpectedHash}, "operator")
	require.ErrorContains(t, err, "位元組")
	after, err := reopened.ModelSelection(ctx, "hero")
	require.NoError(t, err)
	require.Equal(t, selected, after)
	require.NoError(t, os.Remove(filepath.Join(dir, "assets/body.glb")))
	outside := filepath.Join(t.TempDir(), "body.glb")
	require.NoError(t, os.WriteFile(outside, binary, 0600))
	require.NoError(t, os.Symlink(outside, filepath.Join(dir, "assets/body.glb")))
	_, err = reopened.SelectModel(ctx, "hero", contentoverlay.ModelSelectionCommand{Action: "automatic", ExpectedHash: selected.ExpectedHash}, "operator")
	require.ErrorContains(t, err, "超出")
}
