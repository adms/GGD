package contentoverlay

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/ggd/platform/internal/httpx"
)

// CatalogBridge is the existing authenticated importer, not an arbitrary URL
// or a browser-supplied plan. Go owns activation; TS owns schema/ref validation.
type CatalogBridge interface {
	Catalog(context.Context, string, []byte) ([]byte, error)
	File(context.Context, string, string, string) ([]byte, string, error)
}

func WithCatalogBridge(bridge CatalogBridge) Option { return func(s *Service) { s.catalog = bridge } }

type CatalogCommand struct {
	HeroPath               string `json:"heroPath,omitempty"`
	VersionID              string `json:"versionId,omitempty"`
	ExpectedCurrentVersion string `json:"expectedCurrentVersion,omitempty"`
	PlanDigest             string `json:"planDigest,omitempty"`
	Cursor                 string `json:"cursor,omitempty"`
}

type catalogAsset struct {
	Path        string `json:"path"`
	SHA256      string `json:"sha256"`
	Bytes       int    `json:"bytes"`
	ContentType string `json:"contentType"`
	Body        []byte `json:"body,omitempty"`
}

type catalogPlan struct {
	Schema             string `json:"schema"`
	WorkID             string `json:"workId"`
	VersionID          string `json:"versionId"`
	SourceVersion      string `json:"sourceVersion"`
	PreviousVersion    string `json:"previousVersion"`
	CurrentVersion     string `json:"currentVersion"`
	PlanDigest         string `json:"planDigest"`
	HeroPath           string `json:"heroPath"`
	HeroID             string `json:"heroId"`
	ContentVersion     string `json:"contentVersion"`
	ExpectedGeneration int    `json:"expectedGeneration"`
	Writes             []struct {
		Key string          `json:"key"`
		Doc json.RawMessage `json:"doc"`
	} `json:"writes"`
	Assets []catalogAsset `json:"assets"`
}

var catalogDigestRE = regexp.MustCompile(`^sha256:[a-f0-9]{64}$`)
var catalogAssetRE = regexp.MustCompile(`^assets/hero-instances/([a-f0-9]{64})\.[a-z0-9]+$`)

func (s *Service) catalogCall(ctx context.Context, action string, command CatalogCommand, overlay Overlay) ([]byte, error) {
	if s.catalog == nil {
		return nil, httpx.Err(503, "catalog_unavailable", "完整英雄版本服務尚未設定。")
	}
	body, err := json.Marshal(struct {
		Overlay Overlay        `json:"overlay"`
		Command CatalogCommand `json:"command"`
	}{overlay.PublicBundle(), command})
	if err != nil {
		return nil, err
	}
	raw, err := s.catalog.Catalog(ctx, action, body)
	if err != nil {
		status := 503
		var upstream interface{ HTTPStatus() int }
		if errors.As(err, &upstream) && upstream.HTTPStatus() >= 400 && upstream.HTTPStatus() < 600 {
			status = upstream.HTTPStatus()
		}
		return nil, httpx.Err(status, "catalog_failed", err.Error())
	}
	return raw, nil
}

// Every configured overlay mutation captures its complete pre-edit catalog.
// The private service receives these exact bytes and does not call back into Go.
func (s *Service) captureCatalog(ctx context.Context, overlay Overlay) error {
	if s.catalog == nil {
		return nil
	}
	raw, err := s.catalogCall(ctx, "capture", CatalogCommand{}, overlay)
	if err != nil {
		return httpx.Err(503, "catalog_unavailable", "完整英雄版本保存失敗，未套用內容變更："+err.Error())
	}
	var result struct {
		Version struct {
			VersionID string `json:"versionId"`
		} `json:"version"`
	}
	if json.Unmarshal(raw, &result) != nil || !catalogDigestRE.MatchString(result.Version.VersionID) {
		return httpx.Err(503, "catalog_unavailable", "完整英雄版本保存收據不完整，未套用內容變更。")
	}
	return nil
}

func (s *Service) Catalog(ctx context.Context, action string, command CatalogCommand, by string) ([]byte, error) {
	current, err := s.Get(ctx)
	if err != nil {
		return nil, err
	}
	if action != "restore" {
		return s.catalogCall(ctx, action, command, current)
	}
	if !catalogDigestRE.MatchString(command.VersionID) || !catalogDigestRE.MatchString(command.ExpectedCurrentVersion) || !catalogDigestRE.MatchString(command.PlanDigest) {
		return nil, httpx.BadRequest("完整英雄版本要求不完整。")
	}
	raw, err := s.catalogCall(ctx, "prepare", command, current)
	if err != nil {
		return nil, err
	}
	var plan catalogPlan
	if json.Unmarshal(raw, &plan) != nil || plan.Schema != "ggd-catalog-overlay-plan@1" || plan.WorkID != "ggd-existing-hero-instances" || !catalogDigestRE.MatchString(plan.VersionID) || plan.HeroPath != command.HeroPath || plan.SourceVersion != command.VersionID || plan.PlanDigest != command.PlanDigest || plan.CurrentVersion != command.ExpectedCurrentVersion || plan.PreviousVersion != plan.CurrentVersion || plan.ExpectedGeneration != current.Generation || plan.HeroPath != "catalog/champions/"+plan.HeroID+".json" {
		return nil, httpx.Err(503, "catalog_plan_invalid", "完整英雄回復收據不符，未套用。")
	}
	if err = validateKey("champions", plan.HeroID); err != nil {
		return nil, err
	}
	if len(plan.Writes) == 0 || len(plan.Writes) > MaxDocs || len(plan.Assets) > 1000 {
		return nil, httpx.BadRequest("完整英雄回復範圍不合法。")
	}
	owner := sha256.Sum256([]byte(plan.HeroPath))
	prefix := "instance." + hex.EncodeToString(owner[:])[:12] + "."
	seen := map[string]bool{}
	champion := false
	for _, write := range plan.Writes {
		parts := strings.Split(write.Key, "/")
		if len(parts) != 2 || seen[write.Key] {
			return nil, httpx.BadRequest("完整英雄回復文件重複或路徑不符。")
		}
		seen[write.Key] = true
		if err = validateKey(parts[0], parts[1]); err != nil {
			return nil, err
		}
		if write.Key == "champions/"+plan.HeroID {
			champion = true
		} else if write.Key != "config/audio-map" && !strings.HasPrefix(parts[1], prefix) {
			return nil, httpx.BadRequest("回復包含其他英雄或共用模板，未套用。")
		}
		compact, e := compactObject(write.Doc)
		if e != nil {
			return nil, e
		}
		if len(compact) > MaxDocBytes {
			return nil, httpx.BadRequest("英雄回復文件過大。")
		}
		if err = s.validateDoc(parts[0], parts[1], compact); err != nil {
			return nil, err
		}
	}
	if !champion {
		return nil, httpx.BadRequest("回復缺少指定英雄。")
	}
	// Retain immutable bytes before switching any reference. A failed download
	// or disk write can leave unreferenced blobs, never an active broken model.
	for _, asset := range plan.Assets {
		m := catalogAssetRE.FindStringSubmatch(asset.Path)
		if m == nil || asset.SHA256 != "sha256:"+m[1] || asset.Bytes < 1 || asset.Bytes > 8<<20 {
			return nil, httpx.BadRequest("英雄回復素材身分不符。")
		}
		body, _, e := s.catalog.File(ctx, plan.WorkID, plan.VersionID, asset.Path)
		if e != nil {
			return nil, e
		}
		sum := sha256.Sum256(body)
		if len(body) != asset.Bytes || hex.EncodeToString(sum[:]) != m[1] {
			return nil, httpx.Err(503, "catalog_asset_invalid", "英雄素材不完整，未套用回復。")
		}
		asset.Body = body
		if err = s.store.Put("catalog-assets", strings.TrimPrefix(asset.Path, "assets/hero-instances/"), asset); err != nil {
			return nil, err
		}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	next, err := s.load()
	if err != nil {
		return nil, err
	}
	if next.Generation != current.Generation || next.fingerprint() != current.fingerprint() {
		return nil, httpx.Err(http.StatusConflict, "catalog_stale", "其他內容已更新，請重新比較後再回復。")
	}
	for _, write := range plan.Writes {
		if write.Key == "config/audio-map" {
			if err = s.validateCatalogAudio(next, write.Doc, prefix); err != nil {
				return nil, err
			}
		}
		if old, exists := next.Docs[write.Key]; exists && write.Key != "champions/"+plan.HeroID && write.Key != "config/audio-map" && !sameJSON(old, write.Doc) {
			return nil, httpx.BadRequest("獨立版本已有不同資料，未覆寫。")
		}
		parts := strings.Split(write.Key, "/")
		next.Docs[write.Key] = write.Doc
		delete(next.Deleted, write.Key)
		next.Bases[write.Key] = s.captureBase(parts[0], parts[1], by)
	}
	if len(next.Docs) > MaxDocs {
		return nil, httpx.BadRequest("overlay is full")
	}
	head, err := s.commitSaved(ctx, next, by, "restore-hero", plan.HeroID, true)
	if err != nil {
		return nil, err
	}
	return json.Marshal(map[string]any{"versionId": plan.VersionID, "restoredFrom": plan.SourceVersion, "previousVersion": plan.PreviousVersion, "contentVersion": plan.ContentVersion, "generation": head.Generation})
}

func sameJSON(a, b []byte) bool {
	var left, right any
	if json.Unmarshal(a, &left) != nil || json.Unmarshal(b, &right) != nil {
		return false
	}
	x, _ := json.Marshal(left)
	y, _ := json.Marshal(right)
	return bytes.Equal(x, y)
}

func (s *Service) validateCatalogAudio(current Overlay, raw json.RawMessage, prefix string) error {
	before := current.Docs["config/audio-map"]
	if before == nil {
		var err error
		before, err = s.shipped.Doc("config", "audio-map")
		if err != nil {
			return err
		}
	}
	var old, next map[string]json.RawMessage
	if json.Unmarshal(before, &old) != nil || json.Unmarshal(raw, &next) != nil {
		return httpx.BadRequest("音效設定無法比對。")
	}
	for k, v := range old {
		if k != "sfx" && !sameJSON(v, next[k]) {
			return httpx.BadRequest("回復不能變更共用音效設定。")
		}
	}
	for k := range next {
		if k != "sfx" && old[k] == nil {
			return httpx.BadRequest("回復不能新增共用音效設定。")
		}
	}
	var a, b map[string]json.RawMessage
	if json.Unmarshal(old["sfx"], &a) != nil || json.Unmarshal(next["sfx"], &b) != nil {
		return httpx.BadRequest("音效鍵缺少。")
	}
	for k, v := range a {
		if !sameJSON(v, b[k]) {
			return httpx.BadRequest("回復不能變更既有音效鍵。")
		}
	}
	for k := range b {
		if a[k] == nil && !strings.HasPrefix(k, prefix) {
			return httpx.BadRequest("回復只能新增本英雄的音效鍵。")
		}
	}
	return nil
}

func (s *Service) CatalogAsset(name string) ([]byte, string, error) {
	path := "assets/hero-instances/" + name
	m := catalogAssetRE.FindStringSubmatch(path)
	if m == nil {
		return nil, "", httpx.BadRequest("英雄素材身分不合法。")
	}
	var asset catalogAsset
	if err := s.store.Get("catalog-assets", name, &asset); err != nil {
		return nil, "", httpx.Err(404, "asset_missing", "找不到已保存的英雄素材。")
	}
	sum := sha256.Sum256(asset.Body)
	if asset.Path != path || len(asset.Body) != asset.Bytes || hex.EncodeToString(sum[:]) != m[1] {
		return nil, "", fmt.Errorf("saved hero asset is corrupt")
	}
	return asset.Body, asset.ContentType, nil
}
