package lobby

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestClient(id string) *client {
	return &client{accountID: id, out: make(chan []byte, 1), closed: make(chan struct{})}
}

// #724/F-10. The mechanism: an account's socket set has a ceiling at all, and
// crossing it evicts the OLDEST rather than refusing the newest (refusing would
// lock a real player out of their own lobby — see DefaultMaxConnsPerAccount).
// The ceiling's VALUE is a knob and deliberately not asserted.
//
// MUTATION (verified): delete the eviction loop in Hub.register → this fails on
// the connection count, and no other test in the package notices.
func TestHubEvictsTheOldestSocketOverThePerAccountCap(t *testing.T) {
	h := NewHub(nil, nil)
	h.SetMaxConnsPerAccount(2)

	a, b, c := newTestClient("acct"), newTestClient("acct"), newTestClient("acct")
	require.Empty(t, h.register(a))
	require.Empty(t, h.register(b))

	evicted := h.register(c)
	require.Len(t, evicted, 1, "the third socket must push one out")
	assert.Same(t, a, evicted[0], "the OLDEST socket is the one evicted")

	h.mu.Lock()
	live := len(h.conns["acct"])
	_, aStillRouted := h.conns["acct"][a]
	h.mu.Unlock()
	assert.Equal(t, 2, live, "the account never holds more sockets than its ceiling")
	assert.False(t, aStillRouted, "an evicted socket stops receiving fan-out")

	// A DIFFERENT account is unaffected — the cap is per account, not global.
	other := newTestClient("other")
	assert.Empty(t, h.register(other))

	// 0 is the operator's way back to the pre-#724 unbounded behaviour.
	h.SetMaxConnsPerAccount(0)
	assert.Empty(t, h.register(newTestClient("acct")))
}

// A negative value means "not configured" and must leave the shipped default
// alone — otherwise the default would need a second home in the config package.
func TestSetMaxConnsPerAccountIgnoresTheUnsetSentinel(t *testing.T) {
	h := NewHub(nil, nil)
	h.SetMaxConnsPerAccount(-1)
	h.mu.Lock()
	defer h.mu.Unlock()
	assert.Equal(t, DefaultMaxConnsPerAccount, h.maxPerAccount)
}
