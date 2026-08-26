package auth

import (
	"net/http"
	"strings"
	"time"

	"github.com/ggd/platform/internal/httpx"
)

// ---------------------------------------------------------------------------
// #724 / F-21 — the refresh token stops living ONLY in localStorage.
//
// The finding: both consoles persist the whole token pair to localStorage, so
// one XSS walks off with a credential that keeps minting sessions for as long
// as the refresh TTL — days after the page that leaked it is gone.
//
// The fix here is the SERVER half, and it is deliberately ADDITIVE: every
// token-minting response still carries the pair in its body exactly as before,
// so a caller that knows nothing about this file (the game client) is byte-for
// byte unaffected. What changes is that the same response ALSO plants the
// refresh token in an httpOnly cookie and says so, via `"refreshCookie": true`.
// A caller that understands that flag (apps/admin/src/session.ts) can then stop
// writing the refresh token to disk and let the cookie carry it — a cookie that
// JavaScript, and therefore an XSS, cannot read.
//
// ⚠️ WHY A FLAG IN THE BODY AND NOT "the client just knows"
// httpOnly means the browser can never confirm the cookie exists. If the client
// guessed, one deploy with the knob off (or a browser refusing the cookie)
// would drop the refresh token on the floor and sign the operator out. The flag
// makes the SERVER the single source of truth for which mode is in force, so
// GGD_AUTH_REFRESH_COOKIE=0 rolls BOTH halves back to the pre-#724 behaviour
// with one env var and no front-end rebuild.
//
// ⚠️ WHY Path=/api/v1/auth
// The cookie is only ever read by /auth/refresh and /auth/logout. Scoping it
// there keeps it off every other request — including the static asset routes,
// where it would be pure risk and pure bytes.
//
// ⚠️ WHY SameSite=Strict
// It is the CSRF defence for the two routes that now accept the cookie as a
// credential: a cross-site POST to /auth/refresh does not carry a Strict
// cookie at all, so there is nothing to forge with. (The response body is
// unreadable cross-origin anyway, but "unreadable" is a weaker guarantee than
// "never sent".)
// ---------------------------------------------------------------------------

// RefreshCookieName is the cookie the refresh token rides in. Short and
// unprefixed on purpose: the __Host- prefix would force Path=/, which is
// exactly the scoping we do not want.
const RefreshCookieName = "ggd_rt"

// RefreshCookiePath scopes the cookie to the only two routes that read it.
const RefreshCookiePath = "/api/v1/auth"

// SetRefreshCookie turns the cookie half on or off (composition root only).
// Default ON — see NewHandlers.
func (h *Handlers) SetRefreshCookie(on bool) { h.refreshCookie = on }

// ⚠️ WHY THE Secure ATTRIBUTE IS ASKED FOR, NOT ASSUMED
// httpx.RequestIsHTTPS answers "will the browser keep a Secure cookie on this
// connection". Setting Secure over plain http makes the browser DISCARD the
// cookie outright — a silent sign-out on the next reload — and the LAN dev path
// the owner actually plays on is plain http. ⛔ The address reading behind that
// question lives in httpx and NOWHERE else: internal/auth may not read a caller
// address at all (internal/server/devsurface_test.go's no-address-trust
// invariant), and that rule is right — the trusted-proxy set is operator
// configurable and must have exactly one住處.

// plantRefreshCookie writes the cookie and reports whether it did. A false
// return is what the response body's refreshCookie flag carries, which is what
// keeps the client persisting the token the old way instead of losing it.
func (h *Handlers) plantRefreshCookie(w http.ResponseWriter, r *http.Request, refreshToken string) bool {
	if !h.refreshCookie || refreshToken == "" {
		return false
	}
	ttl := h.svc.RefreshTTL()
	if ttl <= 0 {
		return false
	}
	http.SetCookie(w, &http.Cookie{
		Name:     RefreshCookieName,
		Value:    refreshToken,
		Path:     RefreshCookiePath,
		MaxAge:   int(ttl / time.Second),
		HttpOnly: true,
		Secure:   httpx.RequestIsHTTPS(r),
		SameSite: http.SameSiteStrictMode,
	})
	return true
}

// clearRefreshCookie expires the cookie. Called on logout so that signing out
// really does hand back the credential — the whole point of moving it out of
// localStorage is defeated if it outlives the session that created it.
func (h *Handlers) clearRefreshCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     RefreshCookieName,
		Value:    "",
		Path:     RefreshCookiePath,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   httpx.RequestIsHTTPS(r),
		SameSite: http.SameSiteStrictMode,
	})
}

// refreshTokenFrom picks the credential for /auth/refresh and /auth/logout:
// the request body wins, and the cookie is the fallback for a caller that no
// longer holds one (a reloaded admin console in cookie mode).
//
// ⚠️ Body-first is deliberate. It keeps every existing caller on exactly the
// path it used yesterday, so this change cannot alter the behaviour of a client
// that was working — the cookie only ever fills a gap that would otherwise have
// been an immediate "not signed in".
func refreshTokenFrom(r *http.Request, body string) string {
	if strings.TrimSpace(body) != "" {
		return body
	}
	c, err := r.Cookie(RefreshCookieName)
	if err != nil || c == nil {
		return ""
	}
	return c.Value
}
