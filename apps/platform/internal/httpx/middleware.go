package httpx

import (
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
