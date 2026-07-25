package httpx

import (
	"context"
	"log/slog"
	"net"
	"net/http"
	"time"
)

// Recoverer converts panics into 500 error envelopes instead of dropped
// connections.
func Recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				slog.Error("panic recovered", "panic", rec, "path", r.URL.Path)
				WriteError(w, Internal("internal server error"))
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// RateAllower is the throttle primitive an IPRateLimit needs: increment a
// counter for (scope, key) inside a window and report whether the caller is
// still under limit. redisx.Client satisfies it; the interface lives here so
// httpx never imports redisx (and so authorization packages can wire a
// per-IP throttle WITHOUT themselves reading a caller address — see
// internal/server/devsurface_test.go's no-address-trust invariant).
type RateAllower interface {
	RateAllow(ctx context.Context, scope, key string, limit int64, window time.Duration) (bool, error)
}

// IPRateLimit throttles a route by CALLER IP. The address is read HERE, in the
// http-plumbing layer that already owns ClientIP, and used only as a bucket
// key — never as a permission. That placement is deliberate: it lets the auth
// package apply an IP throttle to /auth/device/start (an unauthenticated,
// grant-minting endpoint that an attacker could flood) while the auth package
// itself stays free of any address read, which its own tests enforce. A forged
// header buys an attacker a fresh bucket — it degrades a throttle, it can never
// grant anything.
//
// On a Redis error the request is ALLOWED through (fail-open): a throttle
// backend outage must not take down login, and the downstream handler still
// enforces every real gate.
func IPRateLimit(rl RateAllower, scope string, limit int64, window time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ok, err := rl.RateAllow(r.Context(), scope, ClientIP(r), limit, window)
			if err == nil && !ok {
				WriteError(w, RateLimited("too many requests"))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequestLogger logs each request via slog.
func RequestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		slog.Debug("http", "method", r.Method, "path", r.URL.Path, "dur", time.Since(start))
	})
}

// ClientIP extracts the caller IP for rate limiting (X-Forwarded-For aware
// only for the first hop set by our own edge).
func ClientIP(r *http.Request) string {
	if ip := r.Header.Get("X-Real-Ip"); ip != "" {
		return ip
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
