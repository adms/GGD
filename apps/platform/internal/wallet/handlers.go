package wallet

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/httpx"
)

// Handlers exposes the wallet/store REST surface (all routes require auth;
// the acting wallet is ALWAYS the authenticated account — no id parameters).
type Handlers struct {
	svc *Service
}

// NewHandlers wires the handlers.
func NewHandlers(svc *Service) *Handlers { return &Handlers{svc: svc} }

// Mount registers routes on an already-authenticated subrouter.
func (h *Handlers) Mount(r chi.Router) {
	r.Get("/wallet", h.wallet)
	r.Get("/wallet/owns", h.owns)
	r.Get("/store/catalog", h.catalog)
	r.Post("/store/buy", h.buy)
	r.Post("/store/equip", h.equip)
}

func (h *Handlers) wallet(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	wal, err := h.svc.Get(r.Context(), me.AccountID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, wal)
}

func (h *Handlers) owns(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	champ := r.URL.Query().Get("champion")
	if champ == "" {
		httpx.WriteError(w, httpx.BadRequest("champion query parameter is required"))
		return
	}
	owns, err := h.svc.OwnsChampion(r.Context(), me.AccountID, champ)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"champion": champ, "owns": owns})
}

func (h *Handlers) catalog(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	champs, skins, err := h.svc.CatalogFor(r.Context(), me.AccountID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"champions": champs, "skins": skins})
}

type buyReq struct {
	Kind string `json:"kind"`
	ID   string `json:"id"`
}

func (h *Handlers) buy(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var req buyReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	wal, err := h.svc.Buy(r.Context(), me.AccountID, req.Kind, req.ID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, wal)
}

type equipReq struct {
	ChampionID string  `json:"championId"`
	SkinID     *string `json:"skinId"` // null clears the slot
}

func (h *Handlers) equip(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var req equipReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	wal, err := h.svc.Equip(r.Context(), me.AccountID, req.ChampionID, req.SkinID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, wal)
}
