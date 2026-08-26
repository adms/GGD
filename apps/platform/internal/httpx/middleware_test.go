package httpx

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// #724/F-05. The MECHANISM under test is "does the trust check happen at all",
// not "which CIDRs ship" — the shipped set is a config knob with its own home
// (httpx.DefaultTrustedProxyCIDRs / GGD_TRUSTED_PROXY_CIDRS), so pinning its
// members here would just be a second住處 that goes stale.
//
// MUTATION (verified): delete the `if !isTrustedProxy(host)` early return in
// ClientIP → the "untrusted peer" case below fails, naming the forged address.
func TestClientIPTrustsTheForwardedHeaderOnlyFromATrustedEdge(t *testing.T) {
	t.Cleanup(func() { SetTrustedProxies(DefaultTrustedProxyCIDRs) })
	require.Empty(t, SetTrustedProxies([]string{"172.16.0.0/12"}))

	forged := func(remote string) *http.Request {
		r := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", nil)
		r.RemoteAddr = remote
		r.Header.Set("X-Real-Ip", "9.9.9.9") // what the caller CLAIMS to be
		return r
	}

	// From our own edge (private peer) the header is the caller's real address.
	assert.Equal(t, "9.9.9.9", ClientIP(forged("172.20.0.5:41234")),
		"a request relayed by the trusted edge must be attributed to the header")

	// From anywhere else the header is just text the caller typed. Attributing
	// to it is what let one attacker mint an unlimited number of fresh
	// login-throttle buckets, one per forged value.
	assert.Equal(t, "203.0.113.7", ClientIP(forged("203.0.113.7:52000")),
		"an untrusted peer must be bucketed by its SOCKET address, never by the header it sent")

	// Trusted edge, no header: fall back to the peer rather than to "".
	bare := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", nil)
	bare.RemoteAddr = "172.20.0.5:41234"
	assert.Equal(t, "172.20.0.5", ClientIP(bare))
}

// "none" must be expressible: a platform reached without a proxy trusts nobody.
func TestSetTrustedProxiesEmptyMeansTrustNobody(t *testing.T) {
	t.Cleanup(func() { SetTrustedProxies(DefaultTrustedProxyCIDRs) })
	require.Empty(t, SetTrustedProxies(nil))
	assert.Equal(t, 0, TrustedProxyCount())

	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = "127.0.0.1:9000"
	r.Header.Set("X-Real-Ip", "9.9.9.9")
	assert.Equal(t, "127.0.0.1", ClientIP(r))
}

// A mistyped CIDR must be REPORTED, not silently dropped — a quietly shrunken
// trusted set has no symptom until everyone shares one bucket.
func TestSetTrustedProxiesReportsUnparseableEntries(t *testing.T) {
	t.Cleanup(func() { SetTrustedProxies(DefaultTrustedProxyCIDRs) })
	bad := SetTrustedProxies([]string{"10.0.0.0/8", "172.16.0.0/99", "nonsense"})
	assert.ElementsMatch(t, []string{"172.16.0.0/99", "nonsense"}, bad)
	assert.Equal(t, 1, TrustedProxyCount())
}
