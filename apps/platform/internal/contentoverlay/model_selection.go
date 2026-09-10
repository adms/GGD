package contentoverlay

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/httpx"
	"github.com/go-chi/chi/v5"
)

type ModelSelectionCommand struct {
	Action       string `json:"action"`
	ExpectedHash string `json:"expectedHash"`
	ModelKey     string `json:"modelKey,omitempty"`
}
type retainedModel struct {
	ModelKey          string `json:"modelKey"`
	ModelSHA256       string `json:"modelSha256"`
	BinarySHA256      string `json:"binarySha256"`
	AutomaticEligible *bool  `json:"automaticEligible,omitempty"`
	Source            struct {
		Kind    string `json:"kind"`
		Tier    string `json:"tier"`
		Library string `json:"library"`
	} `json:"source"`
}

func modelAutomaticEligible(v retainedModel) bool {
	if v.AutomaticEligible != nil {
		return *v.AutomaticEligible
	}
	return v.Source.Kind != "style-proxy"
}

type ModelSelectionState struct {
	ChampionID        string          `json:"championId"`
	ExpectedHash      string          `json:"expectedHash"`
	ActiveModelKey    string          `json:"activeModelKey"`
	PreferredModelKey string          `json:"preferredModelKey"`
	SelectionMode     string          `json:"selectionMode"`
	Versions          json.RawMessage `json:"versions"`
}

func modelDigest(raw []byte) string { sum := sha256.Sum256(raw); return hex.EncodeToString(sum[:]) }

var mbaModelLibrary = regexp.MustCompile(`(?i)\bmba\b|magical[-_ ]battle[-_ ]arena|魔法少女武鬥祭`)

func modelTier(v retainedModel) int {
	tier := v.Source.Tier
	if tier == "" {
		name := strings.ToLower(v.Source.Library)
		switch {
		case strings.Contains(name, "300heroes") || strings.Contains(name, "300英雄"):
			tier = "300heroes"
		case mbaModelLibrary.MatchString(name):
			tier = "mba"
		case strings.Contains(name, "w3x") || strings.Contains(name, "warcraft"):
			tier = "w3x"
		default:
			tier = "original"
		}
	}
	switch tier {
	case "300heroes":
		return 0
	case "mba":
		return 1
	case "w3x":
		return 3
	default:
		return 2
	}
}
func (s *Service) modelSelectionDoc(o Overlay, collection, id string) (json.RawMessage, error) {
	k := key(collection, id)
	if o.Deleted[k] {
		return nil, httpx.Err(404, "not_found", "內容已停用。")
	}
	if raw, ok := o.Docs[k]; ok {
		return raw, nil
	}
	return s.shipped.Doc(collection, id)
}
func selectionState(id string, raw json.RawMessage) (ModelSelectionState, []retainedModel, error) {
	canonical, err := canonicalModelJSON(raw)
	if err != nil {
		return ModelSelectionState{}, nil, err
	}
	raw = canonical
	var doc struct {
		ModelKey string          `json:"modelKey"`
		Mode     string          `json:"modelSelectionMode"`
		Versions json.RawMessage `json:"modelVersions"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return ModelSelectionState{}, nil, err
	}
	if doc.Mode == "" {
		doc.Mode = "automatic"
	}
	if len(doc.Versions) == 0 {
		doc.Versions = json.RawMessage(`[]`)
	}
	var versions []retainedModel
	if err := json.Unmarshal(doc.Versions, &versions); err != nil {
		return ModelSelectionState{}, nil, err
	}
	preferred := doc.ModelKey
	best := 5
	for _, v := range versions {
		if !modelAutomaticEligible(v) {
			continue
		}
		if rank := modelTier(v); rank <= best {
			best = rank
			preferred = v.ModelKey
		}
	}
	return ModelSelectionState{id, "sha256:" + modelDigest(raw), doc.ModelKey, preferred, doc.Mode, doc.Versions}, versions, nil
}
func (s *Service) ModelSelection(ctx context.Context, id string) (ModelSelectionState, error) {
	if err := validateKey("champions", id); err != nil {
		return ModelSelectionState{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	o, err := s.load()
	if err != nil {
		return ModelSelectionState{}, err
	}
	raw, err := s.modelSelectionDoc(o, "champions", id)
	if err != nil {
		return ModelSelectionState{}, err
	}
	state, _, err := selectionState(id, raw)
	return state, err
}

// Only activate retained, hash-pinned models. Source registration belongs to the Git/S3 release.
func (s *Service) SelectModel(ctx context.Context, id string, command ModelSelectionCommand, by string) (ModelSelectionState, error) {
	if err := validateKey("champions", id); err != nil {
		return ModelSelectionState{}, err
	}
	if command.Action != "activate" && command.Action != "automatic" {
		return ModelSelectionState{}, httpx.BadRequest("模型來源請經 Git/S3 發布；此處僅切換已登記版本。")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	o, err := s.load()
	if err != nil {
		return ModelSelectionState{}, err
	}
	raw, err := s.modelSelectionDoc(o, "champions", id)
	if err != nil {
		return ModelSelectionState{}, err
	}
	state, versions, err := selectionState(id, raw)
	if err != nil {
		return state, err
	}
	if command.ExpectedHash != state.ExpectedHash {
		return state, httpx.Err(409, "stale_model_selection", "英雄已更新，請重新載入。")
	}
	selected := command.ModelKey
	if command.Action == "automatic" {
		selected = state.PreferredModelKey
	}
	var version *retainedModel
	for i := range versions {
		if versions[i].ModelKey == selected {
			version = &versions[i]
			break
		}
	}
	if version == nil {
		return state, httpx.BadRequest("此英雄沒有該模型版本。")
	}
	if command.Action == "automatic" && !modelAutomaticEligible(*version) {
		return state, httpx.BadRequest("沒有核准自動選用的模型；候選仍保留供手動選用。")
	}
	model, err := s.modelSelectionDoc(o, "models", selected)
	if err != nil {
		return state, err
	}
	var body struct {
		GLBPath string `json:"glbPath"`
	}
	if err = json.Unmarshal(model, &body); err != nil {
		return state, err
	}
	canonical, err := canonicalModelJSON(model)
	if err != nil {
		return state, err
	}
	if modelDigest(canonical) != version.ModelSHA256 {
		return state, httpx.Err(409, "model_changed", "模型綁定已變更，未切換版本。")
	}
	if !strings.HasPrefix(body.GLBPath, "assets/") {
		return state, httpx.BadRequest("模型不在素材目錄。")
	}
	path, err := s.shipped.safeJoin(body.GLBPath)
	if err != nil {
		return state, err
	}
	realPath, err := filepath.EvalSymlinks(path)
	if err != nil {
		return state, err
	}
	root, err := filepath.EvalSymlinks(s.shipped.dir)
	if err != nil {
		return state, err
	}
	rel, err := filepath.Rel(root, realPath)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return state, httpx.BadRequest("模型路徑超出素材目錄。")
	}
	path = realPath
	info, err := os.Stat(path)
	if err != nil {
		return state, err
	}
	if !info.Mode().IsRegular() || info.Size() > 32*1024*1024 {
		return state, httpx.BadRequest("模型超過大小上限。")
	}
	// #nosec G304 -- path 已經過 filepath.Rel(root, realPath) 限制在素材根目錄內
	// （`..` 逃逸在上面回 BadRequest），並驗過 IsRegular() 與 32 MiB 上限。
	binary, err := os.ReadFile(path)
	if err != nil {
		return state, err
	}
	if modelDigest(binary) != version.BinarySHA256 {
		return state, httpx.Err(409, "model_changed", "模型位元組已變更，未切換版本。")
	}
	var doc map[string]json.RawMessage
	if err = json.Unmarshal(raw, &doc); err != nil {
		return state, err
	}
	doc["modelKey"], _ = json.Marshal(selected)
	mode := "manual"
	if command.Action == "automatic" {
		mode = "automatic"
	}
	doc["modelSelectionMode"], _ = json.Marshal(mode)
	next, err := json.Marshal(doc)
	if err != nil {
		return state, err
	}
	if err = s.validateDoc("champions", id, next); err != nil {
		return state, err
	}
	k := key("champions", id)
	if _, exists := o.Docs[k]; !exists && len(o.Docs) >= MaxDocs {
		return state, httpx.BadRequest("overlay is full")
	}
	o.Docs[k] = next
	delete(o.Deleted, k)
	o.Bases[k] = s.captureBase("champions", id, by)
	if _, err = s.commit(ctx, o, by, "model-selection", k); err != nil {
		return state, err
	}
	state, _, err = selectionState(id, next)
	return state, err
}
func (h *Handlers) modelSelection(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if r.Method == http.MethodGet {
		state, err := h.svc.ModelSelection(r.Context(), id)
		if err != nil {
			httpx.WriteError(w, err)
			return
		}
		httpx.WriteJSON(w, http.StatusOK, state)
		return
	}
	var command ModelSelectionCommand
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&command); err != nil {
		httpx.WriteError(w, httpx.BadRequest("模型選擇命令格式無效。"))
		return
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		httpx.WriteError(w, httpx.BadRequest("模型選擇命令必須是單一 JSON。"))
		return
	}
	state, err := h.svc.SelectModel(r.Context(), id, command, auth.MustIdentity(r.Context()).AccountID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, state)
}
