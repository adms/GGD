package curation

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/httpx"
)

// publicMaxAgeSeconds is how long the whitelist may be cached by the edge /
// the client. Short on purpose: an operator toggling content in the console
// expects it to land in seconds, and the game-server keeps its own per-match
// cache anyway.
const publicMaxAgeSeconds = "10"

// Handlers exposes the curation REST surface:
//
//	GET  /api/v1/curation/whitelist          public, cacheable
//	GET  /api/v1/curation/whitelist/starter  public, cacheable (the bundle, not applied)
//	PUT  /api/v1/curation/whitelist          admin only — replace
//	POST /api/v1/curation/whitelist/bulk     admin only — enable/disable one kind
//	POST /api/v1/curation/whitelist/starter  admin only — union the starter bundle in
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

// MountPublic registers the unauthenticated read endpoints on /api/v1. The
// game-server and the client both read the whitelist without a token.
func (h *Handlers) MountPublic(r chi.Router) {
	r.Get("/curation/whitelist", h.get)
	r.Get("/curation/whitelist/starter", h.starter)
}

// Mount registers the admin-gated writes on an already-authenticated
// subrouter (auth.Middleware must run first).
func (h *Handlers) Mount(r chi.Router) {
	r.Group(func(ar chi.Router) {
		if h.adminOnly != nil {
			ar.Use(h.adminOnly)
		}
		ar.Put("/curation/whitelist", h.replace)
		ar.Post("/curation/whitelist/bulk", h.bulk)
		ar.Post("/curation/whitelist/starter", h.applyStarter)
	})
}

func (h *Handlers) get(w http.ResponseWriter, r *http.Request) {
	doc, err := h.svc.Get(r.Context())
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	w.Header().Set("Cache-Control", "public, max-age="+publicMaxAgeSeconds)
	httpx.WriteJSON(w, http.StatusOK, doc)
}

// starter returns the built-in starter bundle WITHOUT applying it, so the
// console can preview/diff it before the operator clicks the button.
func (h *Handlers) starter(w http.ResponseWriter, r *http.Request) {
	set := StarterSet()
	w.Header().Set("Cache-Control", "public, max-age="+publicMaxAgeSeconds)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"champions": set.Champions,
		"items":     set.Items,
		"abilities": set.Abilities,
	})
}

type replaceReq struct {
	Champions []string `json:"champions"`
	Items     []string `json:"items"`
	Abilities []string `json:"abilities"`
}

func (h *Handlers) replace(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var req replaceReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	doc, err := h.svc.Replace(r.Context(), Doc{
		Champions: req.Champions, Items: req.Items, Abilities: req.Abilities,
	})
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	h.svc.Audit(me.AccountID, "curation.replace", map[string]any{
		"champions": len(doc.Champions), "items": len(doc.Items), "abilities": len(doc.Abilities),
	})
	httpx.WriteJSON(w, http.StatusOK, doc)
}

type bulkReq struct {
	Kind    string   `json:"kind"`
	Enable  []string `json:"enable"`
	Disable []string `json:"disable"`
}

func (h *Handlers) bulk(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var req bulkReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	doc, err := h.svc.Bulk(r.Context(), req.Kind, req.Enable, req.Disable)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	h.svc.Audit(me.AccountID, "curation.bulk", map[string]any{
		"kind": req.Kind, "enabled": len(req.Enable), "disabled": len(req.Disable),
	})
	httpx.WriteJSON(w, http.StatusOK, doc)
}

func (h *Handlers) applyStarter(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	doc, err := h.svc.ApplyStarterSet(r.Context())
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	h.svc.Audit(me.AccountID, "curation.starter", map[string]any{
		"champions": len(doc.Champions), "items": len(doc.Items), "abilities": len(doc.Abilities),
	})
	httpx.WriteJSON(w, http.StatusOK, doc)
}
