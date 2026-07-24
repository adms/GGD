package contentoverlay

import (
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/httpx"
)

// publicMaxAgeSeconds is how long the overlay head/bundle may be cached by the
// edge / the client. Short on purpose: an admin edit should land in seconds, and
// the game-server keeps its own per-match cache anyway. The head endpoint is the
// cheap thing to poll for a divergence badge (docs/design/content-sync.md §4).
const publicMaxAgeSeconds = "5"

// readDocLimit bounds the request body for a doc write to a little over the
// per-doc cap, so an oversized body is rejected here rather than buffered whole.
const readDocLimit = MaxDocBytes + 4096

// Handlers exposes the content-overlay REST surface (task #189):
//
//	GET    /api/v1/content-overlay/head                       public, cacheable
//	GET    /api/v1/content-overlay/bundle                     public, cacheable
//	PUT    /api/v1/content-overlay/docs/{collection}/{id}     admin only — upsert
//	DELETE /api/v1/content-overlay/docs/{collection}/{id}     admin only — tombstone
//
// The reads are public for the same reason /curation/whitelist is: the game
// server and the client both fetch the merged content without a token, and
// content JSON is not secret. The writes are admin-gated because they change
// what every player sees. /content-api (the dev-only localhost editor) is a
// SEPARATE surface and stays absent from the production edge — this overlay is
// the host's durable write path.
type Handlers struct {
	svc       *Service
	adminOnly func(http.Handler) http.Handler
}

// NewHandlers wires handlers around the service. adminOnly must be the
// platform's admin-role middleware; it runs after auth.Middleware.
func NewHandlers(svc *Service, adminOnly func(http.Handler) http.Handler) *Handlers {
	return &Handlers{svc: svc, adminOnly: adminOnly}
}

// MountPublic registers the unauthenticated read endpoints on /api/v1.
func (h *Handlers) MountPublic(r chi.Router) {
	r.Get("/content-overlay/head", h.head)
	r.Get("/content-overlay/bundle", h.bundle)
}

// Mount registers the admin-gated writes on an already-authenticated subrouter
// (auth.Middleware must run first).
func (h *Handlers) Mount(r chi.Router) {
	r.Group(func(ar chi.Router) {
		if h.adminOnly != nil {
			ar.Use(h.adminOnly)
		}
		ar.Put("/content-overlay/docs/{collection}/{id}", h.put)
		ar.Delete("/content-overlay/docs/{collection}/{id}", h.delete)
	})
}

func (h *Handlers) head(w http.ResponseWriter, r *http.Request) {
	hd, err := h.svc.Head(r.Context())
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	// These endpoints are UNauthenticated (MountPublic). UpdatedBy is the editing
	// admin's account ULID — do not leak an operator's account id to any caller.
	// Head/Get return by value, so blanking touches only this response copy, not
	// the durable store (which keeps UpdatedBy for the audit trail).
	hd.UpdatedBy = ""
	w.Header().Set("Cache-Control", "public, max-age="+publicMaxAgeSeconds)
	httpx.WriteJSON(w, http.StatusOK, hd)
}

func (h *Handlers) bundle(w http.ResponseWriter, r *http.Request) {
	o, err := h.svc.Get(r.Context())
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	o.UpdatedBy = "" // public endpoint — see head() (don't leak the editor's account id)
	w.Header().Set("Cache-Control", "public, max-age="+publicMaxAgeSeconds)
	httpx.WriteJSON(w, http.StatusOK, o)
}

func (h *Handlers) put(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	collection := chi.URLParam(r, "collection")
	id := chi.URLParam(r, "id")
	body, err := io.ReadAll(io.LimitReader(r.Body, readDocLimit))
	if err != nil {
		httpx.WriteError(w, httpx.BadRequest("could not read request body"))
		return
	}
	hd, err := h.svc.PutDoc(r.Context(), collection, id, body, me.AccountID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	h.svc.Audit(me.AccountID, "content-overlay.put", map[string]any{
		"collection": collection, "id": id, "generation": hd.Generation,
	})
	httpx.WriteJSON(w, http.StatusOK, hd)
}

func (h *Handlers) delete(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	collection := chi.URLParam(r, "collection")
	id := chi.URLParam(r, "id")
	hd, err := h.svc.DeleteDoc(r.Context(), collection, id, me.AccountID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	h.svc.Audit(me.AccountID, "content-overlay.delete", map[string]any{
		"collection": collection, "id": id, "generation": hd.Generation,
	})
	httpx.WriteJSON(w, http.StatusOK, hd)
}
