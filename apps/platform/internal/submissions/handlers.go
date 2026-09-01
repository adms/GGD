package submissions

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/httpx"
)

// Handlers exposes the player-content intake:
//
//	GET  /api/v1/submissions/discoverable   public  — 通過審核**而且內容沒被換過**的
//	POST /api/v1/submissions                auth    — 投稿（材料那一半）
//	GET  /api/v1/submissions/mine           auth    — 我的投稿與它們的狀態
//	GET  /api/v1/submissions/pending        admin   — 待審佇列
//	POST /api/v1/submissions/{id}/decide    admin   — 核准／否決（裁決那一半）
//
// ⭐ 兩個寫入端分在兩條路線上（`POST /submissions` 只寫材料、`/decide` 只寫裁決），
// 與底下兩個 collection 一一對應 —— owner 2026-08-27：「避免讀寫混淆」。
type Handlers struct {
	svc *Service
	// adminOnly is the admin-role gate. ⛔ nil 是開機當掉，⛔ 不是靜默放行
	// （curation 那一支的檔頭記著為什麼：一個 `if != nil` 曾經讓管理面完全沒有授權）。
	adminOnly func(http.Handler) http.Handler
	// enabled 讓這整條路線可以**一鍵關掉**（`config.ui-cues@1` 的 `playerContent`）。
	// ⭐ 出貨是**關**的：對外開放的東西不預設開。
	enabled func() (submit bool, discover bool)
}

// NewHandlers wires handlers around the service.
func NewHandlers(svc *Service, adminOnly func(http.Handler) http.Handler, enabled func() (bool, bool)) *Handlers {
	if adminOnly == nil {
		panic("submissions: adminOnly middleware is required; an admin surface must never mount unguarded")
	}
	if enabled == nil {
		// ⭐ 沒有接上開關 ⇒ **兩邊都關**。⛔ 不是「預設開」——
		//   一條沒有人決定過要不要開的對外路線，預設值只能是關。
		enabled = func() (bool, bool) { return false, false }
	}
	return &Handlers{svc: svc, adminOnly: adminOnly, enabled: enabled}
}

// MountPublic registers the unauthenticated read.
func (h *Handlers) MountPublic(r chi.Router) {
	r.Get("/submissions/discoverable", h.discoverable)
}

// Mount registers the authenticated routes on an already-authenticated
// subrouter (auth.Middleware must run first).
func (h *Handlers) Mount(r chi.Router) {
	r.Post("/submissions", h.submit)
	r.Get("/submissions/mine", h.mine)
	r.Group(func(ar chi.Router) {
		ar.Use(h.adminOnly)
		ar.Get("/submissions/pending", h.pending)
		ar.Post("/submissions/{id}/decide", h.decide)
	})
}

func (h *Handlers) discoverable(w http.ResponseWriter, r *http.Request) {
	if _, discover := h.enabled(); !discover {
		// ⭐ 關著的時候回**空清單**，⛔ 不是 404 ——「這個站有投稿功能」本身
		//   不是秘密，而一條會 404 的路線會讓客戶端寫出兩套程式碼。
		httpx.WriteJSON(w, http.StatusOK, []View{})
		return
	}
	out, err := h.svc.List(func(v View) bool { return v.Discoverable })
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *Handlers) submit(w http.ResponseWriter, r *http.Request) {
	if submit, _ := h.enabled(); !submit {
		httpx.WriteError(w, httpx.Forbidden("投稿目前沒有開放"))
		return
	}
	me := auth.MustIdentity(r.Context())
	var in Material
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, MaxPayloadBytes*2)).Decode(&in); err != nil {
		httpx.WriteError(w, httpx.BadRequest("submission body is not valid JSON"))
		return
	}
	// ⭐ 帳號**永遠**取自 token，⛔ 不是 body —— body 裡的 accountId 直接丟掉。
	in.AccountID = me.AccountID
	out, err := h.svc.Submit(in)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *Handlers) mine(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	out, err := h.svc.List(func(v View) bool { return v.AccountID == me.AccountID })
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *Handlers) pending(w http.ResponseWriter, r *http.Request) {
	out, err := h.svc.List(func(v View) bool { return v.Status == StatusPending })
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *Handlers) decide(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var body struct {
		Status string `json:"status"`
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64*1024)).Decode(&body); err != nil {
		httpx.WriteError(w, httpx.BadRequest("decide body is not valid JSON"))
		return
	}
	// ⚠️ 否決**必填原因**（owner 2026-08-24 對批次驗收頁的逐字要求：「追加原因的 HITL」）。
	if body.Status == StatusRejected && body.Reason == "" {
		httpx.WriteError(w, httpx.BadRequest("否決必須填原因"))
		return
	}
	out, err := h.svc.Decide(chi.URLParam(r, "id"), body.Status, body.Reason, me.AccountID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}
