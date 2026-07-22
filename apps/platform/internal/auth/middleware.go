package auth

import (
	"context"
	"net/http"
	"strings"

	"github.com/ggd/platform/internal/httpx"
)

type ctxKey int

const claimsKey ctxKey = 0

// Identity is the authenticated principal placed on the request context.
type Identity struct {
	AccountID string
	Username  string
}

// WithIdentity returns a context carrying the identity (used by tests and the
// WS handshake).
func WithIdentity(ctx context.Context, id Identity) context.Context {
	return context.WithValue(ctx, claimsKey, id)
}

// IdentityFrom extracts the authenticated identity, if any.
func IdentityFrom(ctx context.Context) (Identity, bool) {
	id, ok := ctx.Value(claimsKey).(Identity)
	return id, ok
}

// MustIdentity returns the identity or panics — only call under Middleware.
func MustIdentity(ctx context.Context) Identity {
	id, ok := IdentityFrom(ctx)
	if !ok {
		panic("auth: identity missing from context")
	}
	return id
}

// BearerToken extracts the access token from the Authorization header or the
// ?token= query param (the latter for WebSocket handshakes).
func BearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	return r.URL.Query().Get("token")
}

// Middleware enforces a valid access token and stashes the identity.
func (s *Service) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tok := BearerToken(r)
		if tok == "" {
			httpx.WriteError(w, httpx.Unauthorized("missing access token"))
			return
		}
		claims, err := s.VerifyAccess(tok)
		if err != nil {
			httpx.WriteError(w, err)
			return
		}
		ctx := WithIdentity(r.Context(), Identity{AccountID: claims.Subject, Username: claims.Username})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
