package admin

import (
	"net/http"

	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/httpx"
)

// AdminOnly gates a route on the authenticated account carrying the admin role.
// It runs AFTER auth.Middleware (which puts the identity on the context) and
// loads the account fresh on every request, so a role grant or revocation takes
// effect immediately without re-minting the caller's access token. A missing
// token is a 401 (auth.Middleware handles it); a valid non-admin token is a
// 403 admin_required.
func (s *Service) AdminOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, ok := auth.IdentityFrom(r.Context())
		if !ok {
			httpx.WriteError(w, httpx.Unauthorized("missing access token"))
			return
		}
		a, err := s.accounts.GetByID(r.Context(), id.AccountID)
		if err != nil || !a.HasRole(RoleAdmin) {
			httpx.WriteError(w, httpx.Err(http.StatusForbidden, "admin_required", "admin role required"))
			return
		}
		next.ServeHTTP(w, r.WithContext(r.Context()))
	})
}
