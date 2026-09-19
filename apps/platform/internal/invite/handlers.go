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
//	PUT  /api/v1/admin/invites/policy           必填／選填 (GH#1274)
//
// The POLICY write is admin-gated like everything else here. Its read is NOT a
// route of its own: every response on this surface already carries it
// (listResp.Policy), so the console paints the switch and the codes from ONE
// round trip and can never show a mode that disagrees with the list beside it.
// The PUBLIC "which mode is this deploy in" read belongs to auth — it has to
// report what Register will actually do, so it is derived there rather than
// mirrored here. See policy.go.
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
		// GH#1274. Mounted BEFORE the {code} route would matter only if it
		// collided; it does not — "policy" is a distinct path segment under
		// /admin/invites and the revoke route is /{code}/revoke, two segments.
		ar.Put("/admin/invites/policy", h.putPolicy)
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
	// Policy is the GH#1274 必填／選填 setting as stored (or the compiled
	// default when nothing has been saved). PolicyStored says which of those
	// two it is, so the console can render 「尚未設定（使用內建預設值）」
	// instead of implying the owner chose it. PolicyDefault ships the compiled
	// default alongside, so the page's 還原預設 cannot drift from the server's
	// idea of what the default is — the same reason opsenv ships Defaults.
	Policy        Policy `json:"policy"`
	PolicyStored  bool   `json:"policyStored"`
	PolicyDefault string `json:"policyDefault"`
}

func (h *Handlers) buildListResp(rows []Row) (listResp, error) {
	if rows == nil {
		rows = []Row{}
	}
	out := listResp{Invites: rows}
	out.Limits.MaxNoteRunes = MaxNoteRunes
	out.Limits.MaxBatch = MaxBatch
	out.Limits.DefaultTTLDays = DefaultTTLDays
	out.Limits.MinTTLDays = MinTTLDays
	out.Limits.MaxTTLDays = MaxTTLDays
	// An unreadable policy is an ERROR here, not a silently-defaulted field.
	// The console's whole job on this page is to show the owner who can
	// register; a page that painted 「選填」 while Register was actually
	// failing closed to 「必填」 would be worse than a page that refused to
	// load. (Register itself still fails closed — see RegistrationRequiresCode.)
	p, stored, err := h.svc.PolicyStored()
	if err != nil {
		return listResp{}, err
	}
	out.Policy = p
	out.PolicyStored = stored
	out.PolicyDefault = DefaultCodeMode
	return out, nil
}

func (h *Handlers) list(w http.ResponseWriter, r *http.Request) {
	rows, err := h.svc.List(r.Context())
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	resp, err := h.buildListResp(rows)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, resp)
}

// policyReq is the PUT body: the whole desired state, one field.
type policyReq struct {
	InviteCode string `json:"inviteCode"`
}

// putPolicy saves 必填／選填 and hands the refreshed page back, so the console
// repaints from the SERVER's answer rather than from what it just sent.
func (h *Handlers) putPolicy(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var req policyReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if _, err := h.svc.SetCodeMode(r.Context(), me.AccountID, req.InviteCode); err != nil {
		httpx.WriteError(w, err)
		return
	}
	rows, err := h.svc.List(r.Context())
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	resp, err := h.buildListResp(rows)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, resp)
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
	list, err := h.buildListResp(rows)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, mintResp{Minted: minted, listResp: list})
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
	list, err := h.buildListResp(rows)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	resp := struct {
		Invite Row `json:"invite"`
		listResp
	}{Invite: row, listResp: list}
	httpx.WriteJSON(w, http.StatusOK, resp)
}
