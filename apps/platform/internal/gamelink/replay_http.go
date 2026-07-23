package gamelink

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/httpx"
)

// ReplayHandlers exposes the admin-gated replay surface (task #175). It is a
// thin proxy to the game server's private /_internal/replays API — the platform
// stores no recording, it only forwards an ADMIN's request with a fresh HMAC
// signature. Kept in the gamelink package because that is where the signed
// game-server client (Service) already lives; mounted from server.go behind the
// same AdminOnly gate the curation / combat-env consoles use, so no admin
// service wiring changes.
type ReplayHandlers struct {
	svc       *Service
	adminOnly func(http.Handler) http.Handler
}

// NewReplayHandlers wraps the gamelink service with an admin gate.
func NewReplayHandlers(svc *Service, adminOnly func(http.Handler) http.Handler) *ReplayHandlers {
	return &ReplayHandlers{svc: svc, adminOnly: adminOnly}
}

// Mount registers /admin/replays* on an already-authenticated subrouter.
func (h *ReplayHandlers) Mount(r chi.Router) {
	r.Route("/admin/replays", func(ar chi.Router) {
		ar.Use(h.adminOnly)
		ar.Get("/", h.list)
		ar.Get("/{id}", h.get)
		ar.Post("/{id}/ticket", h.ticket)
	})
}

func (h *ReplayHandlers) list(w http.ResponseWriter, r *http.Request) {
	raw, err := h.svc.ListReplays(r.Context())
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	writeRaw(w, raw)
}

func (h *ReplayHandlers) get(w http.ResponseWriter, r *http.Request) {
	raw, err := h.svc.GetReplay(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	writeRaw(w, raw)
}

func (h *ReplayHandlers) ticket(w http.ResponseWriter, r *http.Request) {
	raw, err := h.svc.MintReplayTicket(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	writeRaw(w, raw)
}

// writeRaw forwards the game server's JSON body verbatim (already an object).
func writeRaw(w http.ResponseWriter, raw []byte) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(raw)
}
