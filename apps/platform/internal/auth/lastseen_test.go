// lastseen_test.go drives the #246 online light end-to-end over REAL HTTP and a
// REAL lobby WebSocket, through the fully-wired router.
//
// It is written at that level on purpose. The unit under test is not "a repo
// method sets a field" — it is "the admin console can tell who was around in the
// last hour", and that answer depends on two stamp sites in two different
// packages (auth.Middleware and lobby.Sessions.handleWS), one of which does NOT
// pass through the middleware at all. A green unit test on Repo.SetLastSeen
// would prove none of it.
package auth_test

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// seenAdmin registers an operator and gives it the admin role on the durable
// truth, so its EXISTING token can read /admin/accounts (AdminOnly re-reads the
// account per request).
func seenAdmin(t *testing.T, ts *testutil.TS) testutil.User {
	t.Helper()
	u := ts.Register("seenboss")
	_, err := ts.Srv.Accounts.Update(context.Background(), u.ID, func(a *account.Account) error {
		a.Roles = append(a.Roles, account.RoleAdmin)
		return nil
	})
	require.NoError(t, err)
	return u
}

// seenRow reads the admin console row for one account and returns its
// lastSeenAt string ("" when the field is absent, i.e. never seen).
func seenRow(t *testing.T, ts *testutil.TS, adminTok, id string) (string, map[string]any) {
	t.Helper()
	r := ts.Do(http.MethodGet, "/api/v1/admin/accounts?query="+id+"&page=1&pageSize=20", adminTok, nil)
	require.Equal(t, http.StatusOK, r.Status, "search: %s", string(r.Raw))
	rows, ok := r.Body["accounts"].([]any)
	require.True(t, ok, "accounts missing: %s", string(r.Raw))
	for _, raw := range rows {
		row := raw.(map[string]any)
		if row["id"] == id {
			seen, _ := row["lastSeenAt"].(string)
			return seen, row
		}
	}
	t.Fatalf("account %s not in the console listing: %s", id, string(r.Raw))
	return "", nil
}

// lastseen-stamped: ANY authenticated REST call marks the account as seen, and
// registration alone does not — the owner's rule is「有做任何 session 連線動作都
// 算」, so the light must be about ACTIVITY, not about having an account.
func TestLastSeenStampedOnAuthenticatedRequest(t *testing.T) {
	testkit.Cover(t, "lastseen-stamped")
	ts := testutil.New(t)
	boss := seenAdmin(t, ts)
	u := ts.Register("seenplayer")

	// Registration is NOT session activity: the register handler is public and
	// never passes through the middleware, so a freshly created account that has
	// not come back yet must read as never-seen rather than as live.
	before, _ := seenRow(t, ts, boss.Access, u.ID)
	assert.Empty(t, before, "a just-registered account must not already look active")

	// One ordinary authenticated call — deliberately a boring read, because
	// "importance" is exactly what the owner said NOT to filter on.
	r := ts.Do(http.MethodGet, "/api/v1/wallet", u.Access, nil)
	require.Equal(t, http.StatusOK, r.Status, "wallet: %s", string(r.Raw))

	after, row := seenRow(t, ts, boss.Access, u.ID)
	require.NotEmpty(t, after, "an authenticated request must stamp lastSeenAt")
	ts1, err := time.Parse(time.RFC3339Nano, after)
	require.NoError(t, err)
	assert.WithinDuration(t, time.Now(), ts1, time.Minute)

	// UpdatedAt must NOT be dragged along by the liveness ping. It means "the
	// account RECORD meaningfully changed" and the console surfaces it on the
	// profile; if a background poll moved it too, an operator could no longer
	// tell an edit from a page refresh. Take a baseline, let the throttle window
	// lapse, poke a read-only route, and require that only lastSeen moved.
	base, err := ts.Srv.Accounts.GetByID(context.Background(), u.ID)
	require.NoError(t, err)
	ts.Mini.FastForward(auth.LastSeenWindow + time.Second)
	require.Equal(t, http.StatusOK, ts.Do(http.MethodGet, "/api/v1/friends", u.Access, nil).Status)

	post, err := ts.Srv.Accounts.GetByID(context.Background(), u.ID)
	require.NoError(t, err)
	assert.True(t, post.LastSeenAt.After(base.LastSeenAt), "the second window must re-stamp lastSeen")
	assert.True(t, post.UpdatedAt.Equal(base.UpdatedAt),
		"stamping lastSeen must not touch updatedAt (before=%s after=%s)", base.UpdatedAt, post.UpdatedAt)

	// The live presence field is reported too, and reads offline for someone who
	// holds no lobby socket.
	assert.Equal(t, "offline", row["presence"])
}

// lastseen-throttled: the durable write is coalesced to at most one per account
// per minute. This is the load-bearing half of the feature — ungated, the
// client's own polling (2s/5s/10s REST + a 20s WS heartbeat) would rewrite the
// account file 18–48 times a minute PER PLAYER against a single-writer JSON
// store.
func TestLastSeenWriteIsThrottled(t *testing.T) {
	testkit.Cover(t, "lastseen-throttled")
	ts := testutil.New(t)
	boss := seenAdmin(t, ts)
	u := ts.Register("seenpoller")

	require.Equal(t, http.StatusOK, ts.Do(http.MethodGet, "/api/v1/wallet", u.Access, nil).Status)
	first, _ := seenRow(t, ts, boss.Access, u.ID)
	require.NotEmpty(t, first)

	// Simulate the client's poll storm inside one window. Every one of these is
	// real session activity; none of them may reach the store.
	for i := 0; i < 25; i++ {
		require.Equal(t, http.StatusOK, ts.Do(http.MethodGet, "/api/v1/wallet", u.Access, nil).Status)
	}
	still, _ := seenRow(t, ts, boss.Access, u.ID)
	assert.Equal(t, first, still, "25 requests inside one window must produce exactly one durable write")

	// Once the window lapses the next request stamps again — the light stays
	// live, it is only the WRITE that is rate-limited.
	ts.Mini.FastForward(auth.LastSeenWindow + time.Second)
	require.Equal(t, http.StatusOK, ts.Do(http.MethodGet, "/api/v1/wallet", u.Access, nil).Status)
	moved, _ := seenRow(t, ts, boss.Access, u.ID)
	assert.NotEqual(t, first, moved, "after the window lapses the stamp must advance again")
}

// lastseen-ws: the lobby WebSocket stamps too. It authenticates itself at the
// handshake and never passes through auth.Middleware, so without its own stamp a
// player sitting in a match with the socket open — and no REST polling at all —
// would silently go dark on the console.
func TestLastSeenStampedOverLobbySocket(t *testing.T) {
	testkit.Cover(t, "lastseen-ws")
	ts := testutil.New(t)
	boss := seenAdmin(t, ts)
	u := ts.Register("seensocket")

	before, _ := seenRow(t, ts, boss.Access, u.ID)
	require.Empty(t, before, "fixture invalid: this account must not have made any REST call yet")

	ws := ts.MustDialWS(u.Access)
	// The heartbeat round-trip is the synchronisation point: the ack can only
	// come back after the reader loop is running, which is after the connect-time
	// stamp has already executed.
	ws.Send(map[string]any{"type": "heartbeat"})
	msg, err := ws.Read(5 * time.Second)
	require.NoError(t, err)
	require.Equal(t, "heartbeat_ack", msg["type"])

	after, row := seenRow(t, ts, boss.Access, u.ID)
	assert.NotEmpty(t, after, "the lobby socket must stamp lastSeenAt without any REST call")

	// And the live presence line reports the REAL state rather than a vague
	// "connected": the socket is open but no match has started.
	assert.Equal(t, "in-lobby", row["presence"])
}
