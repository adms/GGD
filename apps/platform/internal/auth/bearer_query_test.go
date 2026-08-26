package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

// #724/F-12. A URL is not a private place: nginx writes it to
// `access_log /dev/stdout`, the browser keeps it in history, and Referer hands
// it onward. Before this, EVERY authenticated REST route accepted the access
// token there, so one copied link or one curl example deposited a live
// credential into the log stream.
//
// The property is a SPLIT, not a removal — the browser's WebSocket constructor
// cannot send headers, so exactly one route keeps the fallback.
//
// MUTATION (verified): restore `return r.URL.Query().Get("token")` as
// BearerToken's tail → the REST case below fails.
func TestBearerTokenIgnoresQueryButTheWSHandshakeDoesNot(t *testing.T) {
	withQuery := func() *http.Request {
		return httptest.NewRequest(http.MethodGet, "/api/v1/me?token=live-access-token", nil)
	}

	assert.Equal(t, "", BearerToken(withQuery()),
		"REST routes must not accept a credential from the query string")
	assert.Equal(t, "live-access-token", BearerTokenWS(withQuery()),
		"the WS handshake keeps the fallback — a browser cannot set headers there")

	// The header path is unchanged for both, and wins over the query.
	hdr := withQuery()
	hdr.Header.Set("Authorization", "Bearer from-header")
	assert.Equal(t, "from-header", BearerToken(hdr))
	assert.Equal(t, "from-header", BearerTokenWS(hdr))
}
