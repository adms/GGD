package auth

import (
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/httpx"
)

// Handlers exposes the auth REST surface.
type Handlers struct {
	svc *Service
	// refreshCookie mirrors the refresh token into an httpOnly cookie so a
	// console does not have to keep it in localStorage (#724/F-21). ON by
	// default; the composition root turns it off from GGD_AUTH_REFRESH_COOKIE.
	// See refresh_cookie.go for why this is additive rather than a swap.
	refreshCookie bool
}

// NewHandlers wires handlers around the service. The refresh cookie starts ON:
// a default that has to be switched on is a default that is off in production.
func NewHandlers(svc *Service) *Handlers { return &Handlers{svc: svc, refreshCookie: true} }

// Mount registers /auth/* and /me on the router. r is the /api/v1 subrouter.
func (h *Handlers) Mount(r chi.Router) {
	r.Post("/auth/register", h.register)
	// Public, unauthenticated: reports ONLY whether this deploy still needs its
	// first owner (and whether that claim needs the one-time token), so the
	// register UI can switch into first-owner mode instead of telling the person
	// who is meant to BECOME the admin to "ask an admin". Reveals no token and no
	// account — see Service.OwnerlessState.
	r.Get("/auth/bootstrap-state", h.bootstrapState)
	r.Post("/auth/login", h.login)
	r.Post("/auth/refresh", h.refresh)
	r.Post("/auth/logout", h.logout)
	// QR reverse-login for the keyboard-less handheld (#197/#199, RFC 8628).
	// /start and /poll are UNAUTH — the handheld has no session yet, that is the
	// whole point. /start is IP-throttled by a MIDDLEWARE that reads the caller
	// address in the httpx layer, NOT here: the auth package never reads an
	// address itself (see internal/server/devsurface_test.go). /poll is throttled
	// per device-code inside the service. See device.go.
	r.With(httpx.IPRateLimit(h.svc.RateLimiter(), "devstart", 5, time.Minute)).
		Post("/auth/device/start", h.deviceStart)
	r.Post("/auth/device/poll", h.devicePoll)
	r.Group(func(pr chi.Router) {
		pr.Use(h.svc.Middleware)
		pr.Get("/me", h.me)
		// Self-service credential rotation. Session-gated by the middleware AND
		// current-password-gated inside the service — a session alone can never
		// change a password (see password.go's header).
		pr.Post("/account/password", h.changePassword)
		// Phone-side QR approval (#197/#199). AUTHENTICATED: the approver's
		// existing session is the trust anchor, and the approving account comes
		// from MustIdentity — never the request body. A cross-site page cannot
		// attach the bearer token, so a forged navigation cannot silently
		// approve (the CSRF defense; see device.go's threat model).
		pr.Post("/auth/device/approve", h.deviceApprove)
	})
}

type registerReq struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
	// BootstrapToken claims ownership of a deploy that has no administrator yet
	// and was started with GGD_OWNER_BOOTSTRAP_TOKEN=1. Ignored in every other
	// case, so an ordinary client never has to send it. See bootstrap.go.
	BootstrapToken string `json:"bootstrapToken,omitempty"`
	// InviteCode is the registration invite code (#174), as the user typed it
	// (case / spaces / hyphens are normalised server-side). Required on a gated
	// deploy for every registration except the first-owner claim; ignored when
	// the gate is off. See internal/invite.
	InviteCode string `json:"inviteCode,omitempty"`
}

type sessionResp struct {
	Account account.Public `json:"account"`
	Tokens  TokenPair      `json:"tokens"`
	// RefreshCookie says the refresh token above is ALSO held in an httpOnly
	// cookie, so a browser client may skip persisting it (#724/F-21). Omitted
	// when false so the wire shape is unchanged for every existing caller.
	RefreshCookie bool `json:"refreshCookie,omitempty"`
}

func (h *Handlers) register(w http.ResponseWriter, r *http.Request) {
	var req registerReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	a, pair, err := h.svc.Register(r.Context(), req.Username, req.Email, req.Password,
		RegisterOptions{BootstrapToken: req.BootstrapToken, InviteCode: req.InviteCode})
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	planted := h.plantRefreshCookie(w, r, pair.RefreshToken)
	httpx.WriteJSON(w, http.StatusCreated, sessionResp{
		Account: h.svc.PublicAccount(r.Context(), a), Tokens: pair, RefreshCookie: planted})
}

// bootstrapStateResp is the first-owner probe the register UI reads on load.
type bootstrapStateResp struct {
	// NeedsOwner is true only while this deploy has no administrator — the
	// window in which the next registration claims ownership.
	NeedsOwner bool `json:"needsOwner"`
	// RequireToken is true when that claim must present the one-time owner token
	// (GGD_OWNER_BOOTSTRAP_TOKEN=1), so the UI knows to demand the token field.
	RequireToken bool `json:"requireToken"`
}

func (h *Handlers) bootstrapState(w http.ResponseWriter, r *http.Request) {
	needsOwner, requireToken := h.svc.OwnerlessState(r.Context())
	httpx.WriteJSON(w, http.StatusOK, bootstrapStateResp{NeedsOwner: needsOwner, RequireToken: requireToken})
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
	httpx.WriteJSON(w, http.StatusOK, sessionResp{Account: h.svc.PublicAccount(r.Context(), a), Tokens: pair})
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

type changePasswordReq struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

// changePasswordResp returns a FRESH token pair because a successful change
// revokes every refresh token of the account, the caller's included. Swapping
// these in keeps the operator signed in while every other session dies at its
// next rotation.
type changePasswordResp struct {
	Status          string    `json:"status"`
	Tokens          TokenPair `json:"tokens"`
	SessionsRevoked bool      `json:"sessionsRevoked"`
}

func (h *Handlers) changePassword(w http.ResponseWriter, r *http.Request) {
	id := MustIdentity(r.Context())
	var req changePasswordReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	pair, err := h.svc.ChangePassword(r.Context(), id.AccountID, req.CurrentPassword, req.NewPassword)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, changePasswordResp{Status: "ok", Tokens: pair, SessionsRevoked: true})
}

// deviceStart mints a QR device-login grant for the handheld. The handheld has
// no credentials to send; the only thing read off the request is the
// User-Agent (audit only). IP throttling is applied by the mount-time
// middleware, so nothing here reads a caller address.
func (h *Handlers) deviceStart(w http.ResponseWriter, r *http.Request) {
	grant, err := h.svc.DeviceStart(r.Context(), r.UserAgent())
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, grant)
}

type devicePollReq struct {
	DeviceCode string `json:"deviceCode"`
}

// devicePollResp is the RFC-8628-style discriminated union. The pending/slow
// states are HTTP 200 with the state in the body so the handheld polls one
// uniform endpoint; tokens/account appear only on the approved branch.
type devicePollResp struct {
	Status       string          `json:"status"`
	PollInterval int             `json:"pollInterval,omitempty"`
	Tokens       *TokenPair      `json:"tokens,omitempty"`
	Account      *account.Public `json:"account,omitempty"`
}

func (h *Handlers) devicePoll(w http.ResponseWriter, r *http.Request) {
	var req devicePollReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.DevicePoll(r.Context(), req.DeviceCode)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	resp := devicePollResp{Status: res.Status, PollInterval: res.PollInterval}
	if res.Status == devStatusApproved {
		pub := h.svc.PublicAccount(r.Context(), res.Account)
		tok := res.Tokens
		resp.Tokens = &tok
		resp.Account = &pub
	}
	httpx.WriteJSON(w, http.StatusOK, resp)
}

type deviceApproveReq struct {
	UserCode string `json:"userCode"`
	Decision string `json:"decision"` // "approve" | "deny"
}

func (h *Handlers) deviceApprove(w http.ResponseWriter, r *http.Request) {
	id := MustIdentity(r.Context()) // the authenticated approver — the trust anchor
	var req deviceApproveReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	err := h.svc.DeviceApprove(r.Context(), req.UserCode, id.AccountID, req.Decision == "approve")
	if err != nil {
		if errors.Is(err, redisx.ErrDeviceUnknown) {
			httpx.WriteError(w, httpx.NotFound("unknown or expired code"))
			return
		}
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handlers) me(w http.ResponseWriter, r *http.Request) {
	id := MustIdentity(r.Context())
	a, err := h.svc.Account(r.Context(), id.AccountID)
	if err != nil {
		httpx.WriteError(w, httpx.NotFound("account not found"))
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]account.Public{"account": h.svc.PublicAccount(r.Context(), a)})
}
