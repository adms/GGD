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

// BearerToken extracts the access token from the Authorization header.
//
// IT DOES NOT READ ?token= (#724/F-12). A URL is not a private place: it is
// written to nginx's `access_log /dev/stdout`, kept in browser history, and
// handed to whatever the next page links to via Referer. Accepting a credential
// there meant EVERY authenticated REST route could be called with the access
// token in the query string — by a well-meaning client, by a copied curl
// command, by anyone who pasted a link — and each such call deposited a live
// 15-minute credential into the log stream.
//
// The one caller that has no alternative is the WebSocket handshake: the
// browser WebSocket constructor cannot set request headers. It calls
// BearerTokenWS instead, so the exemption is one named function on one route
// rather than a fallback the whole API silently shares.
func BearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	return ""
}

// BearerTokenWS is BearerToken plus the ?token= fallback, for the ONE surface
// that cannot send a header: the browser WebSocket handshake (see
// lobby.Sessions.handleWS). Do not call it from anything else — a REST route
// that reaches for this is asking for its credentials to be logged.
func BearerTokenWS(r *http.Request) string {
	if tok := BearerToken(r); tok != "" {
		return tok
	}
	return r.URL.Query().Get("token")
}

// PlayableOnly additionally requires that the authenticated account may still
// PLAY right now: not banned, and approved under the #126 private-deploy gate.
// It must run AFTER Middleware, which puts the identity on the context.
//
// Middleware alone cannot enforce this. It verifies a SIGNED BEARER TOKEN,
// which by construction keeps asserting whatever was true when it was minted
// for its whole TTL — so an operator's ban or denial would not reach a player
// who is already signed in until his access token happened to expire, up to 15
// minutes of playing after being told no. This re-reads the durable account, so
// the decision lands on the very next request.
//
// It is applied to the ROOM/MATCH routes and the lobby WS handshake — the
// surface that means "playing" — and deliberately NOT to auth.Middleware
// globally. Putting it everywhere would add a durable account read to every
// authenticated call (including /me, which a client polls) to re-answer a
// question that only matters where it can actually be acted on. See
// Service.AuthorizePlay for the check itself.
func (s *Service) PlayableOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, ok := IdentityFrom(r.Context())
		if !ok {
			httpx.WriteError(w, httpx.Unauthorized("missing access token"))
			return
		}
		if err := s.AuthorizePlay(r.Context(), id.AccountID); err != nil {
			httpx.WriteError(w, err)
			return
		}
		next.ServeHTTP(w, r)
	})
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
		// #246 liveness stamp. This is the natural home for it: the owner's rule
		// is that ANY authenticated session activity counts, and this is the one
		// place every authenticated REST call passes through. Throttled to one
		// durable write per account per minute and silent on every failure — see
		// TouchLastSeen. (The lobby WS authenticates itself and never reaches
		// here, so it stamps separately; see lobby.Sessions.handleWS.)
		s.TouchLastSeen(ctx, claims.Subject)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
