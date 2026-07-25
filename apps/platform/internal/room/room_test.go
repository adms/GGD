package room_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

func createRoom(ts *testutil.TS, u testutil.User, name string) map[string]any {
	ts.T.Helper()
	r := ts.Do(http.MethodPost, "/api/v1/rooms", u.Access, map[string]string{"name": name})
	require.Equal(ts.T, http.StatusOK, r.Status, string(r.Raw))
	return r.Body
}

func roomID(body map[string]any) string {
	return body["room"].(map[string]any)["id"].(string)
}

func TestCreateRoom(t *testing.T) {
	testkit.Cover(t, "room-create")
	ts := testutil.New(t)
	u := ts.Register("host")
	body := createRoom(ts, u, "My Arena")
	rm := body["room"].(map[string]any)
	require.Equal(t, "My Arena", rm["name"])
	require.Equal(t, u.ID, rm["hostId"])
	require.Equal(t, "PairedDuels", rm["mode"])
	require.Equal(t, "open", rm["status"])
	members := body["members"].([]any)
	require.Len(t, members, 1)
	require.Equal(t, true, members[0].(map[string]any)["isHost"])

	// Settings knobs (map, bot difficulty) are settable at create.
	r := ts.Do(http.MethodPost, "/api/v1/rooms", u.Access, map[string]string{
		"name": "Custom", "mapId": "arena-lava", "botDifficulty": "hard",
	})
	require.Equal(t, "arena-lava", r.Body["room"].(map[string]any)["mapId"])
	require.Equal(t, "hard", r.Body["room"].(map[string]any)["botDifficulty"])
}

func TestJoinRoom(t *testing.T) {
	testkit.Cover(t, "room-join")
	ts := testutil.New(t)
	host, guest := ts.Register("host"), ts.Register("guest")
	rid := roomID(createRoom(ts, host, "Joinable"))

	r := ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/join", guest.Access, nil)
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	require.Len(t, r.Body["members"].([]any), 2)

	// Re-join is idempotent.
	r = ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/join", guest.Access, nil)
	require.Equal(t, http.StatusOK, r.Status)
	require.Len(t, r.Body["members"].([]any), 2)
}

func TestJoinFullRejected(t *testing.T) {
	testkit.Cover(t, "room-join-full")
	ts := testutil.New(t)
	host := ts.Register("host")
	rid := roomID(createRoom(ts, host, "Packed"))

	for i := 1; i < 12; i++ {
		u := ts.Register(fmt.Sprintf("player%02d", i))
		r := ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/join", u.Access, nil)
		require.Equal(t, http.StatusOK, r.Status, "seat %d should fit", i)
	}
	unlucky := ts.Register("thirteenth")
	r := ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/join", unlucky.Access, nil)
	require.Equal(t, http.StatusConflict, r.Status, "13th player must be rejected")
	require.Equal(t, "conflict", r.ErrCode())
}

func TestLeaveDisposes(t *testing.T) {
	testkit.Cover(t, "room-leave-dispose")
	ts := testutil.New(t)
	host, guest := ts.Register("host"), ts.Register("guest")
	rid := roomID(createRoom(ts, host, "Ephemeral"))
	ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/join", guest.Access, nil)

	// Host leaves: room survives, host migrates to the guest.
	r := ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/leave", host.Access, nil)
	require.Equal(t, http.StatusOK, r.Status)
	r = ts.Do(http.MethodGet, "/api/v1/rooms/"+rid+"/", guest.Access, nil)
	require.Equal(t, http.StatusOK, r.Status)
	require.Equal(t, guest.ID, r.Body["room"].(map[string]any)["hostId"])

	// Last member leaves: room fully disposed.
	ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/leave", guest.Access, nil)
	r = ts.Do(http.MethodGet, "/api/v1/rooms/"+rid+"/", guest.Access, nil)
	require.Equal(t, http.StatusNotFound, r.Status)
	// Redis keys are gone.
	require.False(t, ts.Mini.Exists("room:"+rid))
	require.False(t, ts.Mini.Exists("room:"+rid+":members"))
}

func TestHostOnlyControls(t *testing.T) {
	testkit.Cover(t, "room-host-authz")
	ts := testutil.New(t)
	host, guest := ts.Register("host"), ts.Register("guest")
	rid := roomID(createRoom(ts, host, "Locked"))
	ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/join", guest.Access, nil)

	// Guest may not change settings.
	r := ts.Do(http.MethodPatch, "/api/v1/rooms/"+rid+"/settings", guest.Access, map[string]string{"name": "Hacked"})
	require.Equal(t, http.StatusForbidden, r.Status)
	// Guest may not start.
	r = ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/start", guest.Access, nil)
	require.Equal(t, http.StatusForbidden, r.Status)
	// Non-member may not either.
	outsider := ts.Register("outsider")
	r = ts.Do(http.MethodPatch, "/api/v1/rooms/"+rid+"/settings", outsider.Access, map[string]string{"name": "X"})
	require.Equal(t, http.StatusForbidden, r.Status)

	// Host can.
	r = ts.Do(http.MethodPatch, "/api/v1/rooms/"+rid+"/settings", host.Access, map[string]string{"name": "Renamed"})
	require.Equal(t, http.StatusOK, r.Status)
	require.Equal(t, "Renamed", r.Body["room"].(map[string]any)["name"])
}

// TestRogueliteMobsToggle covers the #215 per-room 肉鴿殭屍模式 switch: absent on
// create means ON (the *bool is nil → key omitted from the response), an explicit
// false persists as false, and the host can flip it back ON via UpdateSettings.
// This is the "nil → ON, never a zero-value false" guarantee the design flagged
// as the highest-risk field-drift bug.
func TestRogueliteMobsToggle(t *testing.T) {
	testkit.Cover(t, "room-roguelite-toggle")
	ts := testutil.New(t)
	host := ts.Register("host")

	// (1) Absent on create → ON, i.e. the key is omitted (nil *bool), NOT false.
	body := createRoom(ts, host, "Default ON")
	rm := body["room"].(map[string]any)
	_, present := rm["rogueliteMobs"]
	require.False(t, present, "absent toggle must stay omitted (nil === ON), never serialize false")

	// (2) Explicit false on create persists as false.
	r := ts.Do(http.MethodPost, "/api/v1/rooms", host.Access, map[string]any{
		"name": "Mobs Off", "rogueliteMobs": false,
	})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	require.Equal(t, false, r.Body["room"].(map[string]any)["rogueliteMobs"])
	rid := roomID(r.Body)

	// (3) Host flips it back ON via UpdateSettings.
	r = ts.Do(http.MethodPatch, "/api/v1/rooms/"+rid+"/settings", host.Access, map[string]any{
		"rogueliteMobs": true,
	})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	require.Equal(t, true, r.Body["room"].(map[string]any)["rogueliteMobs"])

	// (4) A settings PATCH that omits the field leaves the current value intact
	// (a bare name change must not silently reset the toggle).
	r = ts.Do(http.MethodPatch, "/api/v1/rooms/"+rid+"/settings", host.Access, map[string]any{
		"name": "Renamed",
	})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	require.Equal(t, true, r.Body["room"].(map[string]any)["rogueliteMobs"], "omitted field must not reset the toggle")
}

func TestReadyTracking(t *testing.T) {
	testkit.Cover(t, "room-ready")
	ts := testutil.New(t)
	host, guest := ts.Register("host"), ts.Register("guest")
	rid := roomID(createRoom(ts, host, "ReadyCheck"))
	ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/join", guest.Access, nil)

	r := ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/ready", guest.Access, map[string]bool{"ready": true})
	require.Equal(t, http.StatusOK, r.Status)

	r = ts.Do(http.MethodGet, "/api/v1/rooms/"+rid+"/", host.Access, nil)
	for _, m := range r.Body["members"].([]any) {
		mm := m.(map[string]any)
		if mm["accountId"] == guest.ID {
			require.Equal(t, true, mm["ready"])
		} else {
			require.Equal(t, false, mm["ready"])
		}
	}

	// Un-ready flips back.
	ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/ready", guest.Access, map[string]bool{"ready": false})
	r = ts.Do(http.MethodGet, "/api/v1/rooms/"+rid+"/", host.Access, nil)
	for _, m := range r.Body["members"].([]any) {
		require.Equal(t, false, m.(map[string]any)["ready"])
	}

	// Non-members cannot ready.
	outsider := ts.Register("outsider")
	r = ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/ready", outsider.Access, map[string]bool{"ready": true})
	require.Equal(t, http.StatusForbidden, r.Status)
}

func TestStartPreconditions(t *testing.T) {
	testkit.Cover(t, "room-start-preconditions")
	ts := testutil.New(t)
	host, guest := ts.Register("host"), ts.Register("guest")
	rid := roomID(createRoom(ts, host, "Strict"))
	ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/join", guest.Access, nil)

	// Guest not ready → start blocked.
	r := ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/start", host.Access, nil)
	require.Equal(t, http.StatusConflict, r.Status)
	require.Empty(t, ts.Node.Requests(), "game server must not be called")

	// All humans ready → start succeeds with botFill = 12 − 2.
	ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/ready", guest.Access, map[string]bool{"ready": true})
	r = ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/start", host.Access, nil)
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	require.EqualValues(t, 10, r.Body["botFill"])
	require.NotEmpty(t, r.Body["matchId"])

	// Starting twice is blocked.
	r = ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/start", host.Access, nil)
	require.Equal(t, http.StatusConflict, r.Status)
}

func TestOpenRoomVisibility(t *testing.T) {
	testkit.Cover(t, "room-visibility")
	ts := testutil.New(t)
	host := ts.Register("host")
	rid := roomID(createRoom(ts, host, "Visible"))

	// Open room appears in the lobby list (rooms:open ZSET).
	r := ts.Do(http.MethodGet, "/api/v1/lobby/rooms", host.Access, nil)
	rooms := r.Body["rooms"].([]any)
	require.Len(t, rooms, 1)
	require.Equal(t, rid, rooms[0].(map[string]any)["id"])
	require.EqualValues(t, 1, rooms[0].(map[string]any)["players"])
	require.EqualValues(t, 12, rooms[0].(map[string]any)["max"])

	// Started (closed) room disappears from the list.
	r = ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/start", host.Access, nil)
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	r = ts.Do(http.MethodGet, "/api/v1/lobby/rooms", host.Access, nil)
	require.Empty(t, r.Body["rooms"].([]any))
	// ZSET no longer holds it.
	members, _ := ts.Mini.ZMembers("rooms:open")
	require.NotContains(t, members, rid)
}

func TestTemplateRoundtrip(t *testing.T) {
	testkit.Cover(t, "room-template-roundtrip")
	ts := testutil.New(t)
	u := ts.Register("host")

	r := ts.Do(http.MethodPost, "/api/v1/rooms/templates", u.Access, map[string]string{
		"name": "Weekly Lava", "mapId": "arena-lava", "botDifficulty": "hard",
	})
	require.Equal(t, http.StatusCreated, r.Status, string(r.Raw))
	tpl := r.Body["template"].(map[string]any)
	id := tpl["id"].(string)

	// Durable JSON exists on disk.
	path := filepath.Join(ts.Cfg.DataDir, "rooms", "templates", id+".json")
	data, err := os.ReadFile(path)
	require.NoError(t, err)
	var onDisk map[string]any
	require.NoError(t, json.Unmarshal(data, &onDisk))
	require.Equal(t, "Weekly Lava", onDisk["name"])

	// Loads back through the API identically.
	r = ts.Do(http.MethodGet, "/api/v1/rooms/templates/"+id, u.Access, nil)
	require.Equal(t, http.StatusOK, r.Status)
	got := r.Body["template"].(map[string]any)
	require.Equal(t, "arena-lava", got["mapId"])
	require.Equal(t, "hard", got["botDifficulty"])
	require.Equal(t, "PairedDuels", got["mode"])

	// And shows up in the index listing.
	r = ts.Do(http.MethodGet, "/api/v1/rooms/templates", u.Access, nil)
	require.Contains(t, r.Body["templates"].([]any), id)
}
