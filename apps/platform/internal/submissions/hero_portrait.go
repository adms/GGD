package submissions

import (
	"encoding/json"
	"github.com/ggd/platform/internal/httpx"
	"github.com/go-chi/chi/v5"
	"net/http"
	"strings"
)

func (h *HeroHandlers) portrait(w http.ResponseWriter, r *http.Request) {
	if _, discover := h.enabled(); !discover {
		heroError(w, httpx.NotFound("社群作品目前未開放。"))
		return
	}
	control, err := h.svc.Control(chi.URLParam(r, "id"))
	if err != nil {
		heroError(w, err)
		return
	}
	if control.Published == nil {
		heroError(w, httpx.NotFound("沒有已發布英雄肖像。"))
		return
	}
	if expected := r.URL.Query().Get("version"); expected != "" && expected != control.Published.Version.PackageDigest {
		heroError(w, httpx.Conflict("作品已有新發布版本，請更新清單後再讀取肖像。"))
		return
	}
	view, err := h.svc.Review(control.Published.SubmissionID)
	if err != nil {
		heroError(w, err)
		return
	}
	if view.Status != "published" || view.Decision == nil || view.Decision.Status != StatusApproved {
		heroError(w, httpx.Conflict("英雄發布狀態已改變。"))
		return
	}
	var project struct {
		Presentation struct {
			ChampionIcon string `json:"championIcon"`
		} `json:"presentation"`
	}
	if json.Unmarshal(view.Snapshot.Inspection.Project, &project) != nil || project.Presentation.ChampionIcon == "" {
		heroError(w, httpx.NotFound("此英雄尚未選用肖像。"))
		return
	}
	path := project.Presentation.ChampionIcon
	if !strings.HasPrefix(path, "assets/") || !strings.HasSuffix(path, ".webp") || strings.Contains(path, "..") {
		heroError(w, httpx.NotFound("此英雄肖像不可分發。"))
		return
	}
	if h.svc.bridge == nil {
		heroError(w, httpx.Err(503, "hero_importer_unavailable", "英雄內容服務未設定。"))
		return
	}
	raw, mime, err := h.svc.bridge.File(r.Context(), view.Snapshot.WorkID, view.Snapshot.Version.VersionID, path)
	if err != nil {
		heroError(w, err)
		return
	}
	if mime != "image/webp" {
		heroError(w, httpx.Err(503, "hero_portrait_invalid", "英雄肖像格式不符。"))
		return
	}
	w.Header().Set("Content-Type", "image/webp")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(200)
	_, _ = w.Write(raw)
}
