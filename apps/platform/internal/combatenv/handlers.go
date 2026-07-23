package combatenv

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/httpx"
)

// publicMaxAgeSeconds is how long the table may be cached by the edge / the
// game-server's HTTP layer. Short on purpose: an operator tuning 戰鬥系統 in
// the console expects the NEXT match to pick it up, and the game-server keeps
// its own short-TTL process cache anyway (curation publicMaxAgeSeconds
// pattern).
const publicMaxAgeSeconds = "10"

// Handlers exposes the combat-env REST surface:
//
//	GET /api/v1/combat-env        public, cacheable — the game-server reads
//	                              the table without a token at match creation
//	                              (whitelist precedent)
//	GET /api/v1/admin/combat-env  admin only — stored-or-default table
//	PUT /api/v1/admin/combat-env  admin only — replace (strict validation)
type Handlers struct {
	svc *Service
	// adminOnly is the admin-role gate (admin.Service.AdminOnly), injected so
	// this package does not depend on the admin service to serve reads.
	adminOnly func(http.Handler) http.Handler
}

// NewHandlers wires handlers around the service. adminOnly must be the
// platform's admin-role middleware; it runs after auth.Middleware.
func NewHandlers(svc *Service, adminOnly func(http.Handler) http.Handler) *Handlers {
	return &Handlers{svc: svc, adminOnly: adminOnly}
}

// MountPublic registers the unauthenticated read endpoint on /api/v1. The
// game-server reads the table without a token.
func (h *Handlers) MountPublic(r chi.Router) {
	r.Get("/combat-env", h.getPublic)
}

// Mount registers the admin-gated endpoints on an already-authenticated
// subrouter (auth.Middleware must run first).
func (h *Handlers) Mount(r chi.Router) {
	r.Group(func(ar chi.Router) {
		if h.adminOnly != nil {
			ar.Use(h.adminOnly)
		}
		ar.Get("/admin/combat-env", h.getAdmin)
		ar.Put("/admin/combat-env", h.put)
	})
}

// getPublic serves the table the game-server merges OVER the content defaults,
// admin keys winning per key. So an UNCONFIGURED platform must say "I have no
// opinion" — an empty multipliers map — and NOT the defaults-filled neutral
// table, which would silently reset every content-authored multiplier to 1.0.
// Once an operator saves anything the full table ships, because at that point
// the neutral values are a deliberate choice (PUT semantics: omitted keys
// reset to 1.0). Empty map, never nil: the game-server's parse rejects a null
// multipliers object as malformed.
func (h *Handlers) getPublic(w http.ResponseWriter, r *http.Request) {
	doc, stored, err := h.svc.GetStored()
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	if !stored {
		doc.Multipliers = map[string]float64{}
	}
	w.Header().Set("Cache-Control", "public, max-age="+publicMaxAgeSeconds)
	httpx.WriteJSON(w, http.StatusOK, doc)
}

func (h *Handlers) getAdmin(w http.ResponseWriter, r *http.Request) {
	doc, err := h.svc.Get()
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, doc)
}

// putReq is the PUT body. Multipliers may be sparse — omitted keys reset to
// the neutral 1.0 (the body is the complete desired state).
type putReq struct {
	Multipliers map[string]float64 `json:"multipliers"`
}

func (h *Handlers) put(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var req putReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	doc, err := h.svc.Replace(r.Context(), req.Multipliers)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	h.svc.Audit(me.AccountID, "combatenv.replace", map[string]any{
		"nonNeutral": NonNeutral(doc),
		"version":    doc.Version,
	})
	httpx.WriteJSON(w, http.StatusOK, doc)
}
