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
//	POST /api/v1/curation/whitelist/reset    admin only — REPLACE the selected kinds
//	                                         with the starter bundle (see reset.go)
//	GET  /api/v1/curation/whitelist/snapshots admin only — the undo points
//	POST /api/v1/curation/whitelist/restore  admin only — undo, by snapshot id
type Handlers struct {
	svc *Service
	// adminOnly is the admin-role gate (admin.Service.AdminOnly), injected so
	// this package does not depend on the admin service to serve reads.
	adminOnly func(http.Handler) http.Handler
}

// NewHandlers wires handlers around the service. adminOnly must be the
// platform's admin-role middleware; it runs after auth.Middleware.
func NewHandlers(svc *Service, adminOnly func(http.Handler) http.Handler) *Handlers {
	// FAIL-CLOSED AT WIRING TIME. Until 2026-07-27 every one of these packages
	// wrote `if h.adminOnly != nil { ar.Use(h.adminOnly) }`, so passing nil here
	// SILENTLY mounted an admin surface with no authorization at all — it did not
	// fail to compile, and no test went red. A missing gate must be a crash on
	// boot, never a quietly open door.
	if adminOnly == nil {
		panic("curation: adminOnly middleware is required; an admin surface must never mount unguarded")
	}
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
		ar.Use(h.adminOnly)
		ar.Put("/curation/whitelist", h.replace)
		ar.Post("/curation/whitelist/bulk", h.bulk)
		ar.Post("/curation/whitelist/starter", h.applyStarter)
		// The reset family. NEVER on MountPublic: reset is the only route here
		// that turns content off without naming an id.
		ar.Post("/curation/whitelist/reset", h.reset)
		ar.Get("/curation/whitelist/snapshots", h.listSnapshots)
		// NOTE there is deliberately NO GET …/snapshots/{id}. The console lists
		// snapshots and restores by id; it never needs the stored document, and
		// internal/server/orphan_route_test.go fails a route no first-party UI
		// calls — correctly, since an unreachable route is a feature that does
		// not exist. Service.GetSnapshot stays as RestoreSnapshot's own read.
		ar.Post("/curation/whitelist/restore", h.restore)
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
	// Through the SEAM, not StarterSet() directly: the preview the console
	// diffs against must be the same bundle POST …/reset would apply, including
	// when a test injects a different one.
	set := h.svc.starter()
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

// reset — 回到原廠設定. Body is curation.ResetRequest; see reset.go for the
// contract and the three empty-whitelist guards.
//
// `dryRun: true` is the console's PREVIEW and runs the identical plan code, so
// the numbers the operator confirms are produced by the code that will do the
// write, not by a second implementation that can drift from it.
func (h *Handlers) reset(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var req ResetRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	req.Actor = me.AccountID
	res, err := h.svc.Reset(r.Context(), req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	if !res.DryRun {
		// Its OWN audit action, not curation.replace: after the fact, "the
		// operator pressed 回到原廠設定" and "the operator hand-edited 40 ids"
		// have to be tellable apart, and the snapshot id is the undo handle.
		h.svc.Audit(me.AccountID, "curation.reset", map[string]any{
			"scopes":     res.Scopes,
			"snapshotId": res.SnapshotID,
			"disabled": map[string]int{
				KindChampions: len(res.Disable[KindChampions]),
				KindItems:     len(res.Disable[KindItems]),
				KindAbilities: len(res.Disable[KindAbilities]),
			},
			"champions": len(res.Whitelist.Champions),
			"items":     len(res.Whitelist.Items),
			"abilities": len(res.Whitelist.Abilities),
		})
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

func (h *Handlers) listSnapshots(w http.ResponseWriter, r *http.Request) {
	list, err := h.svc.ListSnapshots()
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"snapshots": list})
}

type restoreReq struct {
	SnapshotID string `json:"snapshotId"`
}

func (h *Handlers) restore(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var req restoreReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	doc, undoID, err := h.svc.RestoreSnapshot(r.Context(), req.SnapshotID, me.AccountID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	h.svc.Audit(me.AccountID, "curation.restore", map[string]any{
		"snapshotId": req.SnapshotID, "undoSnapshotId": undoID,
		"champions": len(doc.Champions), "items": len(doc.Items), "abilities": len(doc.Abilities),
	})
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"whitelist": doc, "undoSnapshotId": undoID,
	})
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
