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

func TestManualOnlySourcesRemainSelectableAndNeverBecomeAutomaticDefault(t *testing.T) {
	svc, _, dir := newSvcWithContent(t)
	digest := func(raw []byte) string { s := sha256.Sum256(raw); return hex.EncodeToString(s[:]) }
	binary := []byte("same preserved model bytes from separate sources")
	writeShippedDoc(t, dir, "assets/body.glb", string(binary))
	falseValue := false
	rows := []struct {
		name, tier, kind string
		eligible         *bool
	}{
		{"approved", "mba", "exact", nil},
		{"paid", "300heroes", "exact", &falseValue},
		{"legacy-proxy", "300heroes", "style-proxy", nil},
	}
	versions := []map[string]any{}
	models := []shippedEntry{}
	for _, row := range rows {
		id := "version.body." + row.name
		raw, _ := json.Marshal(map[string]any{"id": id, "schema": "model@1", "glbPath": "assets/body.glb"})
		writeShippedDoc(t, dir, "models/"+id+".json", string(raw))
		models = append(models, shippedEntry{ID: id, Path: "models/" + id + ".json", Hash: "sha256:" + digest(raw), Size: len(raw)})
		version := map[string]any{"modelKey": id, "modelSha256": digest(raw), "binarySha256": digest(binary), "source": map[string]any{"tier": row.tier, "kind": row.kind, "reference": row.name}}
		if row.eligible != nil {
			version["automaticEligible"] = *row.eligible
		}
		versions = append(versions, version)
	}
	writeShippedIndex(t, dir, "models", models)
	raw, _ := json.Marshal(map[string]any{"id": "hero", "schema": "champion@1", "name": "hero", "modelKey": "version.body.approved", "modelVersions": versions})
	writeShippedDoc(t, dir, "champions/hero.json", string(raw))
	writeShippedIndex(t, dir, "champions", []shippedEntry{{ID: "hero", Path: "champions/hero.json", Hash: "sha256:" + digest(raw), Size: len(raw)}})
	ctx := context.Background()
	initial, err := svc.ModelSelection(ctx, "hero")
	require.NoError(t, err)
	require.Equal(t, "version.body.approved", initial.PreferredModelKey)
	for _, id := range []string{"version.body.paid", "version.body.legacy-proxy"} {
		current, err := svc.ModelSelection(ctx, "hero")
		require.NoError(t, err)
		manual, err := svc.SelectModel(ctx, "hero", contentoverlay.ModelSelectionCommand{Action: "activate", ExpectedHash: current.ExpectedHash, ModelKey: id}, "operator")
		require.NoError(t, err)
		require.Equal(t, id, manual.ActiveModelKey)
		require.Equal(t, "manual", manual.SelectionMode)
		automatic, err := svc.SelectModel(ctx, "hero", contentoverlay.ModelSelectionCommand{Action: "automatic", ExpectedHash: manual.ExpectedHash}, "operator")
		require.NoError(t, err)
		require.Equal(t, "version.body.approved", automatic.ActiveModelKey)
		require.JSONEq(t, string(initial.Versions), string(automatic.Versions))
	}
}

func TestNineClassPriorityPreservesOriginalSourceTier(t *testing.T) {
	order := []string{"manual", "canonical-game", "community-mod", "retextured-proxy", "similar-proxy", "300heroes", "mba", "original", "w3x"}
	for start, expected := range order {
		t.Run(expected, func(t *testing.T) {
			svc, _, dir := newSvcWithContent(t)
			versions := []map[string]any{}
			for _, class := range order[start:] {
				versions = append(versions, map[string]any{"modelKey": "version.body." + class, "source": map[string]any{"kind": "exact", "tier": "300heroes", "selectionClass": class}})
			}
			raw, _ := json.Marshal(map[string]any{"id": "hero", "schema": "champion@1", "modelKey": "old", "modelVersions": versions})
			writeShippedDoc(t, dir, "champions/hero.json", string(raw))
			writeShippedIndex(t, dir, "champions", []shippedEntry{{ID: "hero", Path: "champions/hero.json", Size: len(raw)}})
			state, err := svc.ModelSelection(context.Background(), "hero")
			require.NoError(t, err)
			require.Equal(t, "version.body."+expected, state.PreferredModelKey)
			var retained []map[string]any
			require.NoError(t, json.Unmarshal(state.Versions, &retained))
			require.Len(t, retained, len(order)-start)
			for _, v := range retained {
				require.Equal(t, "300heroes", v["source"].(map[string]any)["tier"])
			}
		})
	}
}

func TestSourceGameReleaseOrderRetainsOlderVersionsAndManualSelection(t *testing.T) {
	svc, _, dir := newSvcWithContent(t)
	versions := []map[string]any{}
	for _, row := range []struct {
		key, class, date string
		eligible         bool
	}{
		{"switch", "canonical-game", "2018-12-07", true},
		{"wii", "canonical-game", "2008-01-31", true},
		{"unknown", "canonical-game", "", true},
		{"invalid", "canonical-game", "2026-02-31", true},
		{"mod", "community-mod", "2026-09-10", true},
		{"unapproved", "canonical-game", "2026-09-10", false},
	} {
		versions = append(versions, map[string]any{"modelKey": "version.body." + row.key, "automaticEligible": row.eligible, "source": map[string]any{"kind": "exact", "selectionClass": row.class, "sourceGameReleasedAt": row.date}})
	}
	raw, _ := json.Marshal(map[string]any{"id": "hero", "schema": "champion@1", "modelKey": "version.body.wii", "modelSelectionMode": "manual", "modelVersions": versions})
	writeShippedDoc(t, dir, "champions/hero.json", string(raw))
	writeShippedIndex(t, dir, "champions", []shippedEntry{{ID: "hero", Path: "champions/hero.json", Size: len(raw)}})
	state, err := svc.ModelSelection(context.Background(), "hero")
	require.NoError(t, err)
	require.Equal(t, "version.body.switch", state.PreferredModelKey)
	require.Equal(t, "version.body.wii", state.ActiveModelKey)
	require.Equal(t, "manual", state.SelectionMode)
	var retained []map[string]any
	require.NoError(t, json.Unmarshal(state.Versions, &retained))
	require.Len(t, retained, 6)
}
