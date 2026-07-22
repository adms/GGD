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
		ar.Get("/accounts/{id}", h.getAccount)
		ar.Post("/accounts/{id}/mcoin", h.adjustMCoin)
		ar.Post("/accounts/{id}/mmr", h.setMMR)
		ar.Post("/accounts/{id}/ban", h.ban)
		ar.Post("/accounts/{id}/unban", h.unban)

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
	rows, total, err := h.svc.SearchAccounts(r.Context(), r.URL.Query().Get("query"), page, pageSize)
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
