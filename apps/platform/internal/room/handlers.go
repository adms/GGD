package room

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/httpx"
)

// Handlers exposes the rooms REST surface (all routes require auth).
type Handlers struct {
	svc       *Service
	templates *Templates
	inviteTTL time.Duration
}

// NewHandlers wires the handlers.
func NewHandlers(svc *Service, templates *Templates, inviteTTL time.Duration) *Handlers {
	return &Handlers{svc: svc, templates: templates, inviteTTL: inviteTTL}
}

// Mount registers routes on an already-authenticated subrouter.
func (h *Handlers) Mount(r chi.Router) {
	r.Get("/lobby/rooms", h.listOpen)
	r.Post("/rooms", h.create)
	r.Post("/rooms/join-by-code", h.joinByCode)
	r.Get("/rooms/templates", h.listTemplates)
	r.Post("/rooms/templates", h.saveTemplate)
	r.Get("/rooms/templates/{id}", h.getTemplate)
	r.Route("/rooms/{id}", func(rr chi.Router) {
		rr.Get("/", h.get)
		rr.Post("/join", h.join)
		rr.Post("/leave", h.leave)
		rr.Post("/ready", h.ready)
		rr.Patch("/local-players", h.localPlayers)
		rr.Patch("/settings", h.settings)
		rr.Post("/start", h.start)
		rr.Post("/invite", h.invite)
	})
}

type roomResp struct {
	Room    Room     `json:"room"`
	Members []Member `json:"members"`
}

func (h *Handlers) respondRoom(w http.ResponseWriter, r *http.Request, rm Room) {
	members, err := h.svc.Members(r.Context(), rm.ID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, roomResp{Room: rm, Members: members})
}

func (h *Handlers) listOpen(w http.ResponseWriter, r *http.Request) {
	rooms, err := h.svc.ListOpen(r.Context())
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	if rooms == nil {
		rooms = []OpenRoom{}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"rooms": rooms})
}

func (h *Handlers) create(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var st Settings
	if err := httpx.DecodeJSON(r, &st); err != nil {
		httpx.WriteError(w, err)
		return
	}
	rm, err := h.svc.Create(r.Context(), me.AccountID, st)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	h.respondRoom(w, r, rm)
}

func (h *Handlers) get(w http.ResponseWriter, r *http.Request) {
	rm, err := h.svc.Get(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	h.respondRoom(w, r, rm)
}

func (h *Handlers) join(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	rm, err := h.svc.Join(r.Context(), me.AccountID, chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	h.respondRoom(w, r, rm)
}

func (h *Handlers) leave(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	if err := h.svc.Leave(r.Context(), me.AccountID, chi.URLParam(r, "id")); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type readyReq struct {
	Ready bool `json:"ready"`
	// Champion optionally records the champ-select pick alongside readying
	// up; ownership of priced champions is enforced at room start.
	Champion string `json:"champion,omitempty"`
}

func (h *Handlers) ready(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var req readyReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if err := h.svc.SetReady(r.Context(), me.AccountID, chi.URLParam(r, "id"), req.Ready); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if req.Champion != "" {
		if err := h.svc.PickChampion(r.Context(), me.AccountID, chi.URLParam(r, "id"), req.Champion); err != nil {
			httpx.WriteError(w, err)
			return
		}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type localPlayersReq struct {
	Count int `json:"count"`
}

// localPlayers sets the caller's couch-player count (1..4) for the room.
func (h *Handlers) localPlayers(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var req localPlayersReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	roomID := chi.URLParam(r, "id")
	if err := h.svc.SetLocalPlayers(r.Context(), me.AccountID, roomID, req.Count); err != nil {
		httpx.WriteError(w, err)
		return
	}
	rm, err := h.svc.Get(r.Context(), roomID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	h.respondRoom(w, r, rm)
}

func (h *Handlers) settings(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var st Settings
	if err := httpx.DecodeJSON(r, &st); err != nil {
		httpx.WriteError(w, err)
		return
	}
	rm, err := h.svc.UpdateSettings(r.Context(), me.AccountID, chi.URLParam(r, "id"), st)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	h.respondRoom(w, r, rm)
}

func (h *Handlers) start(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	info, err := h.svc.Start(r.Context(), me.AccountID, chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, info)
}

type inviteReq struct {
	AccountID string `json:"accountId"`
}

func (h *Handlers) invite(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var req inviteReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	token, err := h.svc.CreateInvite(r.Context(), me.AccountID, chi.URLParam(r, "id"), req.AccountID, h.inviteTTL)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"token": token})
}

type joinByCodeReq struct {
	Token string `json:"token"`
}

func (h *Handlers) joinByCode(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var req joinByCodeReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	rm, err := h.svc.AcceptInvite(r.Context(), me.AccountID, req.Token)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	h.respondRoom(w, r, rm)
}

func (h *Handlers) saveTemplate(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var st Settings
	if err := httpx.DecodeJSON(r, &st); err != nil {
		httpx.WriteError(w, err)
		return
	}
	tpl, err := h.templates.Save(r.Context(), me.AccountID, st)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]Template{"template": tpl})
}

func (h *Handlers) getTemplate(w http.ResponseWriter, r *http.Request) {
	tpl, err := h.templates.Get(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]Template{"template": tpl})
}

func (h *Handlers) listTemplates(w http.ResponseWriter, r *http.Request) {
	ids, err := h.templates.List(r.Context())
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"templates": ids})
}
