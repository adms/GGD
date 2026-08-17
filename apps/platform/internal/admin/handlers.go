package admin

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/httpx"
)

// Handlers exposes the admin REST surface.
type Handlers struct {
	svc *Service
}

// NewHandlers wires handlers around the service.
func NewHandlers(svc *Service) *Handlers { return &Handlers{svc: svc} }

// Mount registers every /admin/* route on an already-authenticated subrouter,
// wrapping them in the AdminOnly gate (auth.Middleware must run first).
func (h *Handlers) Mount(r chi.Router) {
	r.Route("/admin", func(ar chi.Router) {
		ar.Use(h.svc.AdminOnly)

		ar.Get("/accounts", h.searchAccounts)
		// The #126 approval QUEUE. It is a route of its own rather than only a
		// ?status=pending filter because it is the console's landing view and
		// its ordering differs (oldest first — see Service.PendingAccounts);
		// registered BEFORE /accounts/{id} so chi matches the literal segment.
		ar.Get("/accounts/pending", h.pendingAccounts)
		ar.Get("/accounts/{id}", h.getAccount)
		ar.Post("/accounts/{id}/mcoin", h.adjustMCoin)
		// 藍水晶 operator grants (task #225). They live HERE, not beside
		// /wallet/admin/grant-mcoin, for one reason: this subrouter carries
		// AdminOnly and this package owns the audit writer, and the brief
		// requires every crystal grant to be logged. internal/wallet cannot
		// write an audit line without an import cycle.
		ar.Post("/accounts/{id}/crystal", h.grantCrystal)
		// 一鍵發放所有帳號. A distinct first segment, so chi never confuses it
		// with an account id under /accounts/{id}.
		ar.Post("/crystals/grant-all", h.grantCrystalAll)
		ar.Post("/accounts/{id}/mmr", h.setMMR)
		ar.Post("/accounts/{id}/ban", h.ban)
		ar.Post("/accounts/{id}/unban", h.unban)
		// 「我 vs 某人 幾勝幾敗」(owner 2026-08-17)。唯讀,而且刻意只有 API ——
		// 前端那一頁是另一批的事,但沒有這條路 owner 就完全看不到那份紀錄,
		// 而看不到的資料等於沒有做。
		ar.Get("/accounts/{id}/head-to-head", h.headToHead)

		ar.Get("/matches", h.listMatches)
		ar.Get("/matches/{id}", h.getMatch)

		ar.Get("/announcements", h.listAnnouncements)
		ar.Post("/announcements", h.createAnnouncement)
		ar.Put("/announcements/{id}", h.updateAnnouncement)
		ar.Delete("/announcements/{id}", h.deleteAnnouncement)

		ar.Get("/audit", h.listAudit)
	})
}

// MountPublic registers the unauthenticated public announcement feed on the
// /api/v1 subrouter.
func (h *Handlers) MountPublic(r chi.Router) {
	r.Get("/announcements", h.publicAnnouncements)
}

func queryInt(r *http.Request, key string, def int) int {
	if v := r.URL.Query().Get(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

// ---- accounts ---------------------------------------------------------------

func (h *Handlers) searchAccounts(w http.ResponseWriter, r *http.Request) {
	page := queryInt(r, "page", 1)
	pageSize := queryInt(r, "pageSize", 20)
	// ?status= filters on the #126 approval state ("pending"/"approved"/
	// "denied"). Absent or empty means every account, so every existing caller
	// — including apps/admin's session probe — is unaffected.
	rows, total, err := h.svc.SearchAccountsByStatus(r.Context(),
		r.URL.Query().Get("query"), r.URL.Query().Get("status"), page, pageSize)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"accounts": rows, "page": page, "pageSize": pageSize, "total": total,
	})
}

// pendingAccounts serves the approval queue (oldest first). `total` is the
// full pending count, so the console can badge it without paging through.
func (h *Handlers) pendingAccounts(w http.ResponseWriter, r *http.Request) {
	page := queryInt(r, "page", 1)
	pageSize := queryInt(r, "pageSize", 20)
	rows, total, err := h.svc.PendingAccounts(r.Context(), page, pageSize)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"accounts": rows, "page": page, "pageSize": pageSize, "total": total,
	})
}

func (h *Handlers) getAccount(w http.ResponseWriter, r *http.Request) {
	profile, err := h.svc.GetProfile(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, profile)
}

type mcoinReq struct {
	Delta  int    `json:"delta"`
	Reason string `json:"reason"`
}

func (h *Handlers) adjustMCoin(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var req mcoinReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if req.Delta == 0 {
		httpx.WriteError(w, httpx.BadRequest("delta must be non-zero"))
		return
	}
	balance, err := h.svc.AdjustMCoin(r.Context(), me.AccountID, chi.URLParam(r, "id"), req.Delta, req.Reason)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"mcoin": balance})
}

// crystalReq is the body of BOTH crystal grant routes. The single-account one
// takes its target from the URL; the bulk one has no target at all.
type crystalReq struct {
	Amount int    `json:"amount"`
	Reason string `json:"reason"`
}

// grantCrystal grants 藍水晶 to one account. Amount validation is SERVER-side
// (the service re-checks it too): positive whole numbers only, capped at
// MaxCrystalGrant. A JSON body with no `amount` decodes to 0 and is rejected by
// the same rule, so an empty POST cannot grant anything.
func (h *Handlers) grantCrystal(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var req crystalReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	balance, err := h.svc.GrantCrystal(r.Context(), me.AccountID, chi.URLParam(r, "id"), req.Amount, req.Reason)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"crystal": balance})
}

// grantCrystalAll is the 一鍵發放所有帳號 bulk grant. It answers with the
// per-account outcome counts so the console can report "granted N of M" rather
// than a bare success — a partial failure is a real, reportable result here, not
// an error.
func (h *Handlers) grantCrystalAll(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var req crystalReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.GrantCrystalAll(r.Context(), me.AccountID, req.Amount, req.Reason)
	if err != nil {
		// Nothing was attempted (bad amount / unreadable account directory).
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

type mmrReq struct {
	MMR    int    `json:"mmr"`
	Reason string `json:"reason"`
}

func (h *Handlers) setMMR(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var req mmrReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if req.MMR < 0 || req.MMR > 100000 {
		httpx.WriteError(w, httpx.BadRequest("mmr out of range"))
		return
	}
	if err := h.svc.SetMMR(r.Context(), me.AccountID, chi.URLParam(r, "id"), req.MMR, req.Reason); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"mmr": req.MMR})
}

type banReq struct {
	Reason string `json:"reason"`
}

func (h *Handlers) ban(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var req banReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	row, err := h.svc.Ban(r.Context(), me.AccountID, chi.URLParam(r, "id"), req.Reason)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"account": row})
}

func (h *Handlers) unban(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	row, err := h.svc.Unban(r.Context(), me.AccountID, chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"account": row})
}

// headToHead 唯讀:列出這個帳號對每一個對手的累計勝負(owner 2026-08-17
// 「真實記錄 vs 特定玩家的幾勝幾敗」)。⛔ 沒有任何寫入 —— 那份紀錄只有結算路徑
// 可以動,而結算是 HMAC 驗過的伺服器對伺服器回呼。
func (h *Handlers) headToHead(w http.ResponseWriter, r *http.Request) {
	rows, err := h.svc.HeadToHead(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"accountId": chi.URLParam(r, "id"), "opponents": rows})
}

// ---- matches ----------------------------------------------------------------

func (h *Handlers) listMatches(w http.ResponseWriter, r *http.Request) {
	page := queryInt(r, "page", 1)
	pageSize := queryInt(r, "pageSize", 20)
	matches, total, err := h.svc.ListMatches(r.Context(), r.URL.Query().Get("accountId"), page, pageSize)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"matches": matches, "page": page, "pageSize": pageSize, "total": total,
	})
}

func (h *Handlers) getMatch(w http.ResponseWriter, r *http.Request) {
	m, err := h.svc.GetMatch(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"match": m})
}

// ---- announcements ----------------------------------------------------------

type announcementReq struct {
	Title  string `json:"title"`
	Body   string `json:"body"`
	Active bool   `json:"active"`
}

func (h *Handlers) listAnnouncements(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.ListAnnouncements(r.Context())
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"announcements": items})
}

func (h *Handlers) createAnnouncement(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var req announcementReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	a, err := h.svc.CreateAnnouncement(r.Context(), me.AccountID, req.Title, req.Body, req.Active)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"announcement": a})
}

func (h *Handlers) updateAnnouncement(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var req announcementReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	a, err := h.svc.UpdateAnnouncement(r.Context(), me.AccountID, chi.URLParam(r, "id"), req.Title, req.Body, req.Active)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"announcement": a})
}

func (h *Handlers) deleteAnnouncement(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	if err := h.svc.DeleteAnnouncement(r.Context(), me.AccountID, chi.URLParam(r, "id")); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handlers) publicAnnouncements(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.PublicFeed(r.Context())
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"announcements": items})
}

// ---- audit ------------------------------------------------------------------

func (h *Handlers) listAudit(w http.ResponseWriter, r *http.Request) {
	page := queryInt(r, "page", 1)
	pageSize := queryInt(r, "pageSize", 50)
	entries, total, err := h.svc.ListAudit(r.Context(), page, pageSize)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"entries": entries, "page": page, "pageSize": pageSize, "total": total,
	})
}
