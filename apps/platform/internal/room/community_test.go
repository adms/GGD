package room_test

import (
	"github.com/ggd/platform/internal/testutil"
	"github.com/stretchr/testify/require"
	"net/http"
	"testing"
)

func TestCommunityRoomSettingsAreHostOptInAndSurviveRedis(t *testing.T) {
	ts := testutil.New(t)
	host, guest := ts.Register("communityhost"), ts.Register("communityguest")
	id := roomID(createRoom(ts, host, "社群房間"))
	path := "/api/v1/rooms/" + id
	before := ts.Do(http.MethodGet, path+"/", host.Access, nil)
	require.NotEqual(t, true, before.Body["room"].(map[string]any)["allowCommunityHeroes"])
	settings := map[string]any{"allowCommunityHeroes": true, "communityWorkIds": []string{"hero-one", "hero-two"}}
	require.Equal(t, http.StatusOK, ts.Do(http.MethodPost, path+"/join", guest.Access, nil).Status)
	require.Equal(t, http.StatusForbidden, ts.Do(http.MethodPatch, path+"/settings", guest.Access, settings).Status)
	r := ts.Do(http.MethodPatch, path+"/settings", host.Access, settings)
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	require.Equal(t, http.StatusOK, ts.Do(http.MethodPatch, path+"/settings", host.Access, map[string]any{"name": "保留設定"}).Status)
	r = ts.Do(http.MethodGet, path+"/", host.Access, nil)
	require.Equal(t, true, r.Body["room"].(map[string]any)["allowCommunityHeroes"])
	require.Equal(t, []any{"hero-one", "hero-two"}, r.Body["room"].(map[string]any)["communityWorkIds"])
	require.Equal(t, http.StatusBadRequest, ts.Do(http.MethodPatch, path+"/settings", host.Access, map[string]any{"communityWorkIds": []string{"hero-one", "hero-one"}}).Status)
	require.Equal(t, http.StatusOK, ts.Do(http.MethodPatch, path+"/settings", host.Access, map[string]any{"allowCommunityHeroes": false}).Status)
	r = ts.Do(http.MethodGet, path+"/", host.Access, nil)
	require.Equal(t, false, r.Body["room"].(map[string]any)["allowCommunityHeroes"])
}
