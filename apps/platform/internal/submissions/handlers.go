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
//	POST /api/v1/submissions/{id}/promote   admin   — ⭐ **另一個明確授權動作**（上線那一半）
//
// ⚠️ ⭐ `decide` 與 `promote` **刻意分開**（規格 §4 / owner 2026-09-01）：
// 一個「通過」不等於「上線」。⛔ promote 不是 decide 的副作用 ——
// 它要**再按一次**，而且會在按下去的那一刻**重驗** base/schema/capability/asset。
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
	// isProposer 說「這個請求是 AI／編輯器憑證發的嗎」。⛔ nil ⇒ 一律當成玩家。
	isProposer func(*http.Request) bool
	// revalidate 是 promote 前的重驗。⛔ nil ⇒ `Promote` 一律拒絕（fail-closed）。
	revalidate Revalidator
	// audit 寫稽核行。⛔ nil ⇒ 不寫（⭐ 但 promote 仍然會發生 —— 見 Mount 的註解）。
	audit func(adminID, action string, detail map[string]any)
}

// PromoteDeps 是 promote 那一段的外部相依。
//
// ⚠️ ⭐ 刻意做成**一個結構**而不是三個參數：這三格是一起有意義的，
// ⛔ 而三個位置參數會讓下一個人把 nil 傳到錯的位置而型別仍然過。
type PromoteDeps struct {
	IsProposer func(*http.Request) bool
	Revalidate Revalidator
	Audit      func(adminID, action string, detail map[string]any)
}

// WithPromote 接上 ③ 那一段。⛔ 不呼叫它 ⇒ promote 路線仍在，但一律 503
// （`Promote` 沒有 revalidator 就拒絕）—— ⭐ 那是**刻意**的：
// 一條「看起來會動、實際上沒重驗」的上線路徑比沒有這條路徑危險得多。
func (h *Handlers) WithPromote(d PromoteDeps) *Handlers {
	h.isProposer = d.IsProposer
	h.revalidate = d.Revalidate
	h.audit = d.Audit
	return h
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
		ar.Post("/submissions/{id}/promote", h.promote)
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
	// ⭐ 同理，`origin` 取自**角色**，⛔ 不是 body：
	//   一份 AI 產的內容不可以自稱是玩家寫的（那會繞過批核那一層的理由）。
	in.Origin = OriginPlayer
	if h.isProposer != nil && h.isProposer(r) {
		in.Origin = OriginAIEditor
	}
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

// promote 是 ③ —— ⭐ 一個**獨立**的授權動作。
//
// ⛔ 它與 decide 分開的理由不是潔癖：owner 2026-09-01 逐字說八招通過只證明
// 「編輯器**做不做得出**」，⛔ 不證明「這一招**可以出貨**」。
// ⇒ 「審過了」與「可以上」是兩個決定，⭐ 而它們必須各按一次。
func (h *Handlers) promote(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var body struct {
		// ExpectedDigest 是**呼叫端看到的**那一份的指紋。
		// ⭐ 它讓「我按下去的跟我審的是同一份」變成一個**會擋下來**的條件，
		// ⛔ 不是「批核頁應該有重新整理」這種期待。
		ExpectedDigest string `json:"expectedDigest"`
		Confirm        bool   `json:"confirm"`
		Reason         string `json:"reason"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64*1024)).Decode(&body); err != nil {
		httpx.WriteError(w, httpx.BadRequest("promote body is not valid JSON"))
		return
	}
	if !body.Confirm {
		// ⭐ 明確授權 ＝ 一格必須是 true 的旗標。⛔ 不是「有呼叫就算」。
		httpx.WriteError(w, httpx.BadRequest("promotion requires an explicit confirm:true"))
		return
	}
	id := chi.URLParam(r, "id")
	if body.ExpectedDigest != "" {
		cur, err := h.svc.Get(id)
		if err != nil {
			httpx.WriteError(w, err)
			return
		}
		if cur.Digest != body.ExpectedDigest {
			httpx.WriteError(w, httpx.Err(http.StatusConflict, "candidate_changed",
				"candidate changed since you reviewed it; re-review before promoting"))
			return
		}
	}
	out, err := h.svc.Promote(id, me.AccountID, h.revalidate)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	if h.audit != nil {
		h.audit(me.AccountID, "submissions.promote", map[string]any{
			"id":     id,
			"digest": out.Digest,
			"kind":   out.Kind,
			"origin": out.Origin,
			"reason": body.Reason,
		})
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}
