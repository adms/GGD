package httpx

import (
	"context"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
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

// ---------------------------------------------------------- trusted edge ---

// DefaultTrustedProxyCIDRs is the set of peers whose "X-Real-Ip" is believed
// when no operator override is given: loopback and the RFC1918 / ULA private
// ranges.
//
// WHY THIS SET AND NOT "everyone" (the pre-#724 behaviour). The platform never
// faces the internet directly — nginx fronts it on the compose network and the
// chart's networkpolicy is the in-cluster complement — so its RemoteAddr for a
// real player is always the edge's private container address (Docker's pool is
// 172.17–172.31, inside 172.16.0.0/12). Trusting private peers therefore costs
// a working deploy NOTHING while closing the case that mattered: a request that
// arrives from a PUBLIC address is, by construction, not from our edge, and its
// "X-Real-Ip" is a string the caller typed. Before this, that string became the
// login rate-limit bucket key, so one header per attempt bought an unlimited
// number of fresh buckets and the credential-stuffing throttle was decorative.
//
// It is deliberately a RANGE SET rather than the edge's exact address: that
// address is assigned by Docker at container start and changes on every
// recreate, so pinning it would produce a gate that silently reverts to
// "RemoteAddr only" (and would put every player in ONE bucket) the first time
// the stack is brought up again. Operators who can pin it should — see
// GGD_TRUSTED_PROXY_CIDRS.
var DefaultTrustedProxyCIDRs = []string{
	"127.0.0.0/8", "::1/128",
	"10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7",
}

var (
	trustedProxyMu   sync.RWMutex
	trustedProxyNets = parseCIDRs(DefaultTrustedProxyCIDRs)
)

// parseCIDRs turns textual CIDRs into networks, skipping unparseable entries.
func parseCIDRs(cidrs []string) []*net.IPNet {
	out := make([]*net.IPNet, 0, len(cidrs))
	for _, raw := range cidrs {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		if _, n, err := net.ParseCIDR(raw); err == nil {
			out = append(out, n)
		}
	}
	return out
}

// SetTrustedProxies replaces the trusted-edge set. It returns the CIDRs it
// could not parse so the caller can say so out loud — a mistyped CIDR that is
// silently dropped would shrink the trusted set without any symptom until the
// day someone wonders why every player shares one rate-limit bucket.
//
// An EMPTY list is meaningful and is honoured: trust nobody, i.e. always use
// the socket peer. That is the correct setting for a platform reached directly.
func SetTrustedProxies(cidrs []string) (bad []string) {
	nets := make([]*net.IPNet, 0, len(cidrs))
	for _, raw := range cidrs {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		_, n, err := net.ParseCIDR(raw)
		if err != nil {
			bad = append(bad, raw)
			continue
		}
		nets = append(nets, n)
	}
	trustedProxyMu.Lock()
	trustedProxyNets = nets
	trustedProxyMu.Unlock()
	return bad
}

// TrustedProxyCount reports how many CIDRs are currently believed. 0 means the
// forwarded header is never read.
func TrustedProxyCount() int {
	trustedProxyMu.RLock()
	defer trustedProxyMu.RUnlock()
	return len(trustedProxyNets)
}

// isTrustedProxy reports whether a socket peer may speak for someone else.
func isTrustedProxy(host string) bool {
	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}
	trustedProxyMu.RLock()
	defer trustedProxyMu.RUnlock()
	for _, n := range trustedProxyNets {
		if n.Contains(ip) {
			return true
		}
	}
	return false
}

// remoteHost is the SOCKET peer — the one address in a request that cannot be
// forged by whoever sent it.
func remoteHost(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// ClientIP extracts the caller IP for rate limiting.
//
// The forwarded header ("X-Real-Ip", written by our own edge) is believed ONLY
// when the socket peer is itself a trusted edge — see DefaultTrustedProxyCIDRs
// for why that check is the whole point. From anyone else the header is just
// text the caller chose, so the socket peer is used instead.
//
// It remains a BUCKET KEY and never a permission (see IPRateLimit and
// internal/server/devsurface_test.go's no-address-trust invariant).
func ClientIP(r *http.Request) string {
	host := remoteHost(r)
	if !isTrustedProxy(host) {
		return host
	}
	if ip := strings.TrimSpace(r.Header.Get("X-Real-Ip")); ip != "" {
		return ip
	}
	return host
}
