package auth

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/httpx"
)

// Handlers exposes the auth REST surface.
type Handlers struct {
	svc *Service
}

// NewHandlers wires handlers around the service.
func NewHandlers(svc *Service) *Handlers { return &Handlers{svc: svc} }

// Mount registers /auth/* and /me on the router. r is the /api/v1 subrouter.
func (h *Handlers) Mount(r chi.Router) {
	r.Post("/auth/register", h.register)
	r.Post("/auth/login", h.login)
	r.Post("/auth/refresh", h.refresh)
	r.Post("/auth/logout", h.logout)
	r.Group(func(pr chi.Router) {
		pr.Use(h.svc.Middleware)
		pr.Get("/me", h.me)
	})
}

type registerReq struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type sessionResp struct {
	Account account.Public `json:"account"`
	Tokens  TokenPair      `json:"tokens"`
}

func (h *Handlers) register(w http.ResponseWriter, r *http.Request) {
	var req registerReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	a, pair, err := h.svc.Register(r.Context(), req.Username, req.Email, req.Password)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, sessionResp{Account: a.Public(), Tokens: pair})
}

type loginReq struct {
	Username string `json:"username"` // username or email
	Password string `json:"password"`
}

func (h *Handlers) login(w http.ResponseWriter, r *http.Request) {
	var req loginReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	a, pair, err := h.svc.Login(r.Context(), req.Username, req.Password, httpx.ClientIP(r))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, sessionResp{Account: a.Public(), Tokens: pair})
}

type refreshReq struct {
	RefreshToken string `json:"refreshToken"`
}

func (h *Handlers) refresh(w http.ResponseWriter, r *http.Request) {
	var req refreshReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	pair, err := h.svc.Refresh(r.Context(), req.RefreshToken)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]TokenPair{"tokens": pair})
}

func (h *Handlers) logout(w http.ResponseWriter, r *http.Request) {
	var req refreshReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if err := h.svc.Logout(r.Context(), req.RefreshToken); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handlers) me(w http.ResponseWriter, r *http.Request) {
	id := MustIdentity(r.Context())
	a, err := h.svc.Account(r.Context(), id.AccountID)
	if err != nil {
		httpx.WriteError(w, httpx.NotFound("account not found"))
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]account.Public{"account": a.Public()})
}
