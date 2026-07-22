package friend

import (
	"net/http"
	"sort"

	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/httpx"
	"github.com/ggd/platform/internal/presence"
)

// Handlers exposes the friends REST surface (all routes require auth).
type Handlers struct {
	svc      *Service
	accounts *account.Repo
	presence *presence.Service
}

// NewHandlers wires the handlers.
func NewHandlers(svc *Service, accounts *account.Repo, pres *presence.Service) *Handlers {
	return &Handlers{svc: svc, accounts: accounts, presence: pres}
}

// Mount registers routes on an already-authenticated subrouter.
func (h *Handlers) Mount(r chi.Router) {
	r.Get("/friends", h.list)
	r.Post("/friends/requests", h.request)
	r.Post("/friends/requests/{accountId}/accept", h.accept)
	r.Post("/friends/requests/{accountId}/decline", h.decline)
	r.Delete("/friends/{accountId}", h.remove)
	r.Post("/friends/{accountId}/block", h.block)
}

type friendEntry struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	State    string `json:"state"`
}

type listResp struct {
	Friends  []friendEntry `json:"friends"`
	Incoming []friendEntry `json:"incoming"`
	Outgoing []friendEntry `json:"outgoing"`
	Blocked  []string      `json:"blocked"`
}

func (h *Handlers) entries(r *http.Request, ids map[string]Edge, withState bool) []friendEntry {
	out := make([]friendEntry, 0, len(ids))
	for id := range ids {
		e := friendEntry{ID: id}
		if a, err := h.accounts.GetByID(r.Context(), id); err == nil {
			e.Username = a.Username
		}
		if withState {
			if st, err := h.presence.Get(r.Context(), id); err == nil {
				e.State = st
			}
		}
		out = append(out, e)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

func (h *Handlers) list(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	doc, err := h.svc.Get(r.Context(), me.AccountID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	resp := listResp{
		Friends:  h.entries(r, doc.Friends, true),
		Incoming: h.entries(r, doc.Incoming, false),
		Outgoing: h.entries(r, doc.Outgoing, false),
		Blocked:  []string{},
	}
	for id := range doc.Blocked {
		resp.Blocked = append(resp.Blocked, id)
	}
	sort.Strings(resp.Blocked)
	httpx.WriteJSON(w, http.StatusOK, resp)
}

type requestReq struct {
	Username  string `json:"username,omitempty"`
	AccountID string `json:"accountId,omitempty"`
}

func (h *Handlers) resolveTarget(r *http.Request, req requestReq) (string, error) {
	if req.AccountID != "" {
		if _, err := h.accounts.GetByID(r.Context(), req.AccountID); err != nil {
			return "", httpx.NotFound("account not found")
		}
		return req.AccountID, nil
	}
	if req.Username != "" {
		a, err := h.accounts.GetByUsername(r.Context(), req.Username)
		if err != nil {
			return "", httpx.NotFound("account not found")
		}
		return a.ID, nil
	}
	return "", httpx.BadRequest("username or accountId required")
}

func (h *Handlers) request(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var req requestReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	target, err := h.resolveTarget(r, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	if err := h.svc.Request(r.Context(), me.AccountID, target); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handlers) action(w http.ResponseWriter, r *http.Request, fn func(actor, other string) error) {
	me := auth.MustIdentity(r.Context())
	other := chi.URLParam(r, "accountId")
	if other == "" {
		httpx.WriteError(w, httpx.BadRequest("accountId required"))
		return
	}
	if err := fn(me.AccountID, other); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handlers) accept(w http.ResponseWriter, r *http.Request) {
	h.action(w, r, func(actor, other string) error { return h.svc.Accept(r.Context(), actor, other) })
}

func (h *Handlers) decline(w http.ResponseWriter, r *http.Request) {
	h.action(w, r, func(actor, other string) error { return h.svc.Decline(r.Context(), actor, other) })
}

func (h *Handlers) remove(w http.ResponseWriter, r *http.Request) {
	h.action(w, r, func(actor, other string) error { return h.svc.Remove(r.Context(), actor, other) })
}

func (h *Handlers) block(w http.ResponseWriter, r *http.Request) {
	h.action(w, r, func(actor, other string) error { return h.svc.Block(r.Context(), actor, other) })
}
