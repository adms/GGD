package admin

import (
	"net/http"

	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/httpx"
)

// AdminOnly gates a route on the authenticated account being a USABLE admin:
// it carries the admin role, is not banned, and is approved under the #126
// private-deploy gate. It runs AFTER auth.Middleware (which puts the identity
// on the context) and loads the account fresh on every request, so a role
// grant, a ban or an approval change takes effect immediately without
// re-minting the caller's access token. A missing token is a 401
// (auth.Middleware handles it); a valid but insufficient token is a 403
// admin_required.
//
// WHY THE BAN AND APPROVAL CHECKS ARE HERE AND NOT ONLY IN LOGIN. Login and
// Refresh both refuse a banned or unapproved account, but an ACCESS token
// already minted stays valid for its whole TTL (15 minutes by default) — it is
// a signed bearer token, not a session lookup. Checking only the role meant an
// administrator who was banned or had their approval revoked one second ago
// kept full operator powers — including approving accounts and re-granting
// their own role — until that token happened to expire. The account load is
// already being paid for on every admin request, so the two extra field reads
// cost nothing and close the window completely. "Usable admin" is exactly the
// predicate account.Repo.UsableAdmins counts, so the middleware and the
// last-admin guards agree on who an administrator is.
func (s *Service) AdminOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, ok := auth.IdentityFrom(r.Context())
		if !ok {
			httpx.WriteError(w, httpx.Unauthorized("missing access token"))
			return
		}
		a, err := s.accounts.GetByID(r.Context(), id.AccountID)
		if err != nil || !a.HasRole(RoleAdmin) || a.Banned || !a.IsApproved() {
			httpx.WriteError(w, httpx.Err(http.StatusForbidden, "admin_required", "admin role required"))
			return
		}
		next.ServeHTTP(w, r.WithContext(r.Context()))
	})
}
