package submissions

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strings"

	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/httpx"
	"github.com/go-chi/chi/v5"
)

const MaxHeroModelAssetBytes = 32 * 1024 * 1024
const MaxHeroModelStorageBytes = 128 * 1024 * 1024
const MaxHeroModelStoredFiles = 100

// ⭐⭐ GH#1121 —— 匯出這兩個名字，因為**遷移範圍要指名得到它們**
// （`platformarchive/scope.go` 的 `Rules()`）。⛔ 不可以在那邊抄一份字串：
// 抄了就是第二個住處，而改名的那一天不會有任何東西紅（第〇·四守則）。
const (
	CollectionHeroModelAssets = "hero-private-model-assets"
	CollectionHeroModelQuotas = "hero-private-model-quotas"
)

const heroModelAssetCollection = CollectionHeroModelAssets
const heroModelLedgerCollection = CollectionHeroModelQuotas

var heroModelHashPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)
var heroModelAssetSlots = make(chan struct{}, 2)

// Match the entire upload route; neighbouring JSON routes retain their small cap.
func IsHeroModelAssetPath(path string) bool {
	const prefix = "/api/v1/hero-model-assets/"
	return strings.HasPrefix(path, prefix) && heroModelHashPattern.MatchString(strings.TrimPrefix(path, prefix))
}

type heroModelAsset struct {
	OwnerID string `json:"ownerId"`
	SHA256  string `json:"sha256"`
	Bytes   []byte `json:"bytes"`
}
type heroModelLedger struct {
	OwnerID string         `json:"ownerId"`
	Files   map[string]int `json:"files"`
}

func heroModelOwnerKey(accountID string) string {
	sum := sha256.Sum256([]byte(accountID))
	return hex.EncodeToString(sum[:])
}
func heroModelAssetKey(accountID, hash string) string {
	sum := sha256.Sum256([]byte(accountID + "\x00" + hash))
	return hex.EncodeToString(sum[:])
}

// Private draft bytes remain opaque and never become approved runtime assets.
// Main independently validates format, rig, selected clips, and budgets on build.
func (s *HeroService) SaveModelAsset(accountID, hash string, data []byte) error {
	if accountID == "" || !heroModelHashPattern.MatchString(hash) || len(data) < 20 || len(data) > MaxHeroModelAssetBytes || binary.LittleEndian.Uint32(data[:4]) != 0x46546c67 || binary.LittleEndian.Uint32(data[4:8]) != 2 || int(binary.LittleEndian.Uint32(data[8:12])) != len(data) {
		return httpx.BadRequest("模型原檔必須是最多 32 MiB 的完整 GLB。")
	}
	sum := sha256.Sum256(data)
	if hex.EncodeToString(sum[:]) != hash {
		return httpx.BadRequest("模型原檔與版本雜湊不符。")
	}
	policy, err := s.IntakePolicy()
	if err != nil {
		return err
	}
	if !policy.ModelUploadsEnabled {
		return httpx.Forbidden("目前未開放新的模型與動作庫上傳；本機原檔仍可保存。")
	}
	// Reserve before writing immutable bytes. A crash can retain a reservation,
	// but cannot leave uncounted assets; retrying the same digest is idempotent.
	err = s.store.Update(heroModelLedgerCollection, heroModelOwnerKey(accountID), func(raw json.RawMessage) (any, error) {
		ledger := heroModelLedger{OwnerID: accountID, Files: map[string]int{}}
		if len(raw) > 0 && (json.Unmarshal(raw, &ledger) != nil || ledger.OwnerID != accountID || ledger.Files == nil) {
			return nil, httpx.Err(503, "hero_model_quota_corrupt", "模型儲存額度無法驗證。")
		}
		if len(ledger.Files) > MaxHeroModelStoredFiles {
			return nil, httpx.Err(503, "hero_model_quota_corrupt", "模型儲存額度無法驗證。")
		}
		total := 0
		for key, size := range ledger.Files {
			if !heroModelHashPattern.MatchString(key) || size <= 0 || size > MaxHeroModelAssetBytes {
				return nil, httpx.Err(503, "hero_model_quota_corrupt", "模型儲存額度無法驗證。")
			}
			total += size
		}
		if total > MaxHeroModelStorageBytes {
			return nil, httpx.Err(503, "hero_model_quota_corrupt", "模型儲存額度無法驗證。")
		}
		if size, exists := ledger.Files[hash]; exists {
			if size != len(data) {
				return nil, httpx.BadRequest("同一模型版本不能改變大小。")
			}
			return ledger, nil
		}
		if len(ledger.Files) >= MaxHeroModelStoredFiles || total+len(data) > MaxHeroModelStorageBytes {
			return nil, httpx.Err(413, "hero_model_storage_full", "帳號的模型原檔儲存已達 128 MiB 或 100 份；原有資料保留，請先下載本機備份。")
		}
		ledger.Files[hash] = len(data)
		return ledger, nil
	})
	if err != nil {
		return err
	}
	return s.store.Put(heroModelAssetCollection, heroModelAssetKey(accountID, hash), heroModelAsset{OwnerID: accountID, SHA256: hash, Bytes: data})
}
func (s *HeroService) ModelAsset(accountID, hash string) ([]byte, error) {
	if accountID == "" || !heroModelHashPattern.MatchString(hash) {
		return nil, httpx.BadRequest("模型版本格式錯誤。")
	}
	var asset heroModelAsset
	if err := s.store.Get(heroModelAssetCollection, heroModelAssetKey(accountID, hash), &asset); err != nil {
		if errors.Is(err, jsonstore.ErrNotFound) {
			return nil, httpx.NotFound("找不到此帳號的模型原檔。")
		}
		return nil, err
	}
	sum := sha256.Sum256(asset.Bytes)
	if asset.OwnerID != accountID || asset.SHA256 != hash || hex.EncodeToString(sum[:]) != hash || len(asset.Bytes) > MaxHeroModelAssetBytes {
		return nil, httpx.Err(503, "hero_model_asset_corrupt", "模型原檔完整性檢查失敗。")
	}
	return asset.Bytes, nil
}
func (h *HeroHandlers) putModelAsset(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Content-Type") != "model/gltf-binary" {
		heroError(w, httpx.BadRequest("模型原檔需要 GLB 二進位傳輸。"))
		return
	}
	select {
	case heroModelAssetSlots <- struct{}{}:
		defer func() { <-heroModelAssetSlots }()
	default:
		heroError(w, httpx.Err(503, "hero_model_upload_busy", "模型上傳佇列已滿，請稍後重試。"))
		return
	}
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, MaxHeroModelAssetBytes))
	if err != nil {
		heroError(w, httpx.BadRequest("模型原檔超過 32 MiB 或傳輸不完整。"))
		return
	}
	hash := chi.URLParam(r, "sha256")
	if err := h.svc.SaveModelAsset(auth.MustIdentity(r.Context()).AccountID, hash, data); err != nil {
		heroError(w, err)
		return
	}
	httpx.WriteJSON(w, 200, map[string]any{"sha256": hash, "bytes": len(data)})
}
func (h *HeroHandlers) getModelAsset(w http.ResponseWriter, r *http.Request) {
	select {
	case heroModelAssetSlots <- struct{}{}:
		defer func() { <-heroModelAssetSlots }()
	default:
		heroError(w, httpx.Err(503, "hero_model_download_busy", "模型讀取佇列已滿，請稍後重試。"))
		return
	}
	data, err := h.svc.ModelAsset(auth.MustIdentity(r.Context()).AccountID, chi.URLParam(r, "sha256"))
	if err != nil {
		heroError(w, err)
		return
	}
	w.Header().Set("Content-Type", "model/gltf-binary")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(200)
	_, _ = w.Write(data)
}

// Validate every model reference before the small JSON draft can become current.
func (s *HeroService) checkDraftModelAssets(accountID string, payload json.RawMessage) error {
	var draft struct {
		ModelDraft *struct {
			Originals []struct {
				SHA256 string `json:"sha256"`
				Bytes  int    `json:"bytes"`
			} `json:"originals"`
			Working struct {
				SHA256 string `json:"sha256"`
				Bytes  int    `json:"bytes"`
			} `json:"working"`
		} `json:"modelDraft"`
		Project struct {
			Presentation struct {
				UploadedModel *struct {
					SHA256   string `json:"sha256"`
					ByteSize int    `json:"byteSize"`
				} `json:"uploadedModel"`
			} `json:"presentation"`
		} `json:"project"`
		ModelFiles json.RawMessage `json:"modelFiles"`
	}
	if err := json.Unmarshal(payload, &draft); err != nil {
		return httpx.BadRequest("模型草稿格式不符。")
	}
	if len(draft.ModelFiles) > 0 && strings.TrimSpace(string(draft.ModelFiles)) != "[]" {
		return httpx.BadRequest("雲端模型原檔應使用私人二進位通道，不能嵌入草稿 JSON。")
	}
	refs := map[string]int{}
	add := func(hash string, size int) error {
		if !heroModelHashPattern.MatchString(hash) || size <= 0 || size > MaxHeroModelAssetBytes {
			return httpx.BadRequest("草稿模型版本或大小不合法。")
		}
		if prior, exists := refs[hash]; exists && prior != size {
			return httpx.BadRequest("草稿中同一模型版本大小不一致。")
		}
		refs[hash] = size
		return nil
	}
	if draft.ModelDraft != nil {
		if len(draft.ModelDraft.Originals) < 1 || len(draft.ModelDraft.Originals) > 5 {
			return httpx.BadRequest("草稿最多保存模型與四份動作庫原檔。")
		}
		total := 0
		for _, ref := range draft.ModelDraft.Originals {
			total += ref.Bytes
			if err := add(ref.SHA256, ref.Bytes); err != nil {
				return err
			}
		}
		if total > 64*1024*1024 {
			return httpx.BadRequest("模型與動作庫原檔合計最多 64 MiB。")
		}
		if err := add(draft.ModelDraft.Working.SHA256, draft.ModelDraft.Working.Bytes); err != nil {
			return err
		}
	}
	if model := draft.Project.Presentation.UploadedModel; model != nil {
		if err := add(model.SHA256, model.ByteSize); err != nil {
			return err
		}
	}
	for hash, size := range refs {
		data, err := s.ModelAsset(accountID, hash)
		if err != nil {
			return err
		}
		if len(data) != size {
			return httpx.BadRequest("雲端模型原檔與草稿版本不符。")
		}
	}
	return nil
}
