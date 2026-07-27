package invite

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/httpx"
)

// Handlers exposes the invite REST surface. EVERY route is admin-gated; there
// is deliberately no public read and no "check this code" endpoint (see the
// package header).
//
//	GET  /api/v1/admin/invites                  list every code + who redeemed it
//	POST /api/v1/admin/invites                  mint a batch
//	POST /api/v1/admin/invites/{code}/revoke    kill an unredeemed code
type Handlers struct {
	svc *Service
	// adminOnly is the admin-role gate (admin.Service.AdminOnly), injected so
	// this package does not depend on the admin service.
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
		panic("invite: adminOnly middleware is required; an admin surface must never mount unguarded")
	}
	return &Handlers{svc: svc, adminOnly: adminOnly}
}

// Mount registers the admin-gated endpoints on an already-authenticated
// subrouter (auth.Middleware must run first).
func (h *Handlers) Mount(r chi.Router) {
	r.Group(func(ar chi.Router) {
		ar.Use(h.adminOnly)
		ar.Get("/admin/invites", h.list)
		ar.Post("/admin/invites", h.mint)
		ar.Post("/admin/invites/{code}/revoke", h.revoke)
	})
}

// listResp carries the rows plus the limits the console renders its form from,
// so the bounds live on the server only and the page cannot offer a batch size
// the validator refuses.
type listResp struct {
	Invites []Row `json:"invites"`
	Limits  struct {
		MaxNoteRunes   int `json:"maxNoteRunes"`
		MaxBatch       int `json:"maxBatch"`
		DefaultTTLDays int `json:"defaultTtlDays"`
		MinTTLDays     int `json:"minTtlDays"`
		MaxTTLDays     int `json:"maxTtlDays"`
	} `json:"limits"`
}

func (h *Handlers) buildListResp(rows []Row) listResp {
	if rows == nil {
		rows = []Row{}
	}
	out := listResp{Invites: rows}
	out.Limits.MaxNoteRunes = MaxNoteRunes
	out.Limits.MaxBatch = MaxBatch
	out.Limits.DefaultTTLDays = DefaultTTLDays
	out.Limits.MinTTLDays = MinTTLDays
	out.Limits.MaxTTLDays = MaxTTLDays
	return out
}

func (h *Handlers) list(w http.ResponseWriter, r *http.Request) {
	rows, err := h.svc.List(r.Context())
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, h.buildListResp(rows))
}

// mintReq is the mint body. note is REQUIRED (it is what makes a list of random
// strings usable); count and ttlDays fall back to 1 and DefaultTTLDays.
type mintReq struct {
	Note    string `json:"note"`
	Count   int    `json:"count"`
	TTLDays int    `json:"ttlDays"`
}

// mintResp returns the freshly minted codes AND the whole refreshed list, so
// the console needs one round trip to both show the new codes and repaint.
type mintResp struct {
	Minted []Row `json:"minted"`
	listResp
}

func (h *Handlers) mint(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var req mintReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	minted, err := h.svc.Mint(r.Context(), me.AccountID, req.Note, req.Count, req.TTLDays)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	codes := make([]string, 0, len(minted))
	for _, m := range minted {
		codes = append(codes, m.Code)
	}
	h.svc.Audit(me.AccountID, "invite.mint", "batch", map[string]any{
		"note": req.Note, "count": len(minted), "codes": codes,
	})
	rows, err := h.svc.List(r.Context())
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, mintResp{Minted: minted, listResp: h.buildListResp(rows)})
}

func (h *Handlers) revoke(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	row, err := h.svc.Revoke(r.Context(), me.AccountID, chi.URLParam(r, "code"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	rows, listErr := h.svc.List(r.Context())
	if listErr != nil {
		httpx.WriteError(w, listErr)
		return
	}
	resp := struct {
		Invite Row `json:"invite"`
		listResp
	}{Invite: row, listResp: h.buildListResp(rows)}
	httpx.WriteJSON(w, http.StatusOK, resp)
}
