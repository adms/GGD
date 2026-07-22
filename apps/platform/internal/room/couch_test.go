package room_test

// Couch-play (local multiplayer): room members carry a localPlayers count
// (1..4); capacity everywhere is Σ localPlayers ≤ 12 seats.

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

func patchLocal(ts *testutil.TS, u testutil.User, rid string, count int) testutil.Resp {
	ts.T.Helper()
	return ts.Do(http.MethodPatch, "/api/v1/rooms/"+rid+"/local-players", u.Access, map[string]int{"count": count})
}

func memberLocal(t *testing.T, body map[string]any, accountID string) int {
	t.Helper()
	for _, m := range body["members"].([]any) {
		mm := m.(map[string]any)
		if mm["accountId"] == accountID {
			return int(mm["localPlayers"].(float64))
		}
	}
	t.Fatalf("member %s not found", accountID)
	return 0
}

func TestLocalPlayersBounds(t *testing.T) {
	testkit.Cover(t, "couch-localplayers-bounds")
	ts := testutil.New(t)
	host := ts.Register("host")
	rid := roomID(createRoom(ts, host, "Couch"))

	// Default is 1 local player.
	r := ts.Do(http.MethodGet, "/api/v1/rooms/"+rid+"/", host.Access, nil)
	require.Equal(t, 1, memberLocal(t, r.Body, host.ID))

	// Out-of-range counts are rejected.
	require.Equal(t, http.StatusBadRequest, patchLocal(ts, host, rid, 0).Status)
	require.Equal(t, http.StatusBadRequest, patchLocal(ts, host, rid, 5).Status)
	require.Equal(t, http.StatusBadRequest, patchLocal(ts, host, rid, -1).Status)

	// 1..4 are accepted and reflected in the member list.
	for n := 1; n <= 4; n++ {
		r := patchLocal(ts, host, rid, n)
		require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
		require.Equal(t, n, memberLocal(t, r.Body, host.ID))
	}

	// Non-members may not set a couch count.
	outsider := ts.Register("outsider")
	require.Equal(t, http.StatusForbidden, patchLocal(ts, outsider, rid, 2).Status)
}

func TestCapacitySumsLocalPlayers(t *testing.T) {
	testkit.Cover(t, "couch-capacity-sum")
	ts := testutil.New(t)
	host := ts.Register("host")
	rid := roomID(createRoom(ts, host, "Packed Couch"))

	// host ×4 + two joiners ×4 = 12 seats claimed by 3 members.
	require.Equal(t, http.StatusOK, patchLocal(ts, host, rid, 4).Status)
	for i := 0; i < 2; i++ {
		u := ts.Register(fmt.Sprintf("couch%02d", i))
		require.Equal(t, http.StatusOK, ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/join", u.Access, nil).Status)
		require.Equal(t, http.StatusOK, patchLocal(ts, u, rid, 4).Status)
	}

	// The lobby list reports SEATS, not members: 12/12.
	list := ts.Do(http.MethodGet, "/api/v1/lobby/rooms", host.Access, nil)
	rooms := list.Body["rooms"].([]any)
	require.Len(t, rooms, 1)
	require.Equal(t, float64(12), rooms[0].(map[string]any)["players"])

	// A 4th member cannot join: every seat is claimed although only 3
	// members are present.
	late := ts.Register("late")
	r := ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/join", late.Access, nil)
	require.Equal(t, http.StatusConflict, r.Status, "join must respect Σ localPlayers")

	// Raising a count past the remaining seats is rejected too.
	require.Equal(t, http.StatusOK, patchLocal(ts, host, rid, 3).Status) // Σ=11
	require.Equal(t, http.StatusOK, ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/join", late.Access, nil).Status) // Σ=12
	require.Equal(t, http.StatusConflict, patchLocal(ts, late, rid, 2).Status, "Σ would be 13")

	// Leaving frees the leaver's seats.
	require.Equal(t, http.StatusOK, ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/leave", late.Access, nil).Status)
	require.Equal(t, http.StatusOK, patchLocal(ts, host, rid, 4).Status) // Σ back to 12
}

func TestStartRejectsOverCapacity(t *testing.T) {
	testkit.Cover(t, "couch-start-overcap")
	ts := testutil.New(t)
	host := ts.Register("host")
	rid := roomID(createRoom(ts, host, "Overbooked"))

	users := []testutil.User{}
	for i := 0; i < 3; i++ {
		u := ts.Register(fmt.Sprintf("member%02d", i))
		require.Equal(t, http.StatusOK, ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/join", u.Access, nil).Status)
		require.Equal(t, http.StatusOK, ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/ready", u.Access, map[string]bool{"ready": true}).Status)
		users = append(users, u)
	}

	// Simulate a race the API-level checks cannot reach: all 4 members at 4
	// local players (Σ=16 > 12), seeded directly into Redis.
	ts.Mini.HSet("room:"+rid+":local", host.ID, "4")
	for _, u := range users {
		ts.Mini.HSet("room:"+rid+":local", u.ID, "4")
	}

	r := ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/start", host.Access, nil)
	require.Equal(t, http.StatusConflict, r.Status, "start must reject Σ localPlayers > 12: %s", string(r.Raw))
	require.Equal(t, "conflict", r.ErrCode())

	// Back within capacity, the same room starts fine.
	ts.Mini.HSet("room:"+rid+":local", host.ID, "3")
	for _, u := range users {
		ts.Mini.HSet("room:"+rid+":local", u.ID, "3")
	}
	r = ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/start", host.Access, nil)
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
}
