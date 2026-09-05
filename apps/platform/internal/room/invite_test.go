package room_test

import (
	"encoding/hex"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

func invite(ts *testutil.TS, host testutil.User, rid, targetID string) testutil.Resp {
	ts.T.Helper()
	return ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/invite", host.Access,
		map[string]string{"accountId": targetID})
}

func TestInviteCreate(t *testing.T) {
	testkit.Cover(t, "invite-create")
	ts := testutil.New(t)
	host, target := ts.Register("host"), ts.Register("target")
	rid := roomID(createRoom(ts, host, "Inviting"))

	r := invite(ts, host, rid, target.ID)
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	token := r.Body["token"].(string)
	require.NotEmpty(t, token)

	// Token lives in Redis with a TTL close to 10 minutes.
	require.True(t, ts.Mini.Exists("invite:"+token))
	ttl := ts.Mini.TTL("invite:" + token)
	require.InDelta(t, (10 * time.Minute).Seconds(), ttl.Seconds(), 60)
}

func TestInviteAccept(t *testing.T) {
	testkit.Cover(t, "invite-accept")
	ts := testutil.New(t)
	host, target := ts.Register("host"), ts.Register("target")
	rid := roomID(createRoom(ts, host, "Inviting"))
	token := invite(ts, host, rid, target.ID).Body["token"].(string)

	r := ts.Do(http.MethodPost, "/api/v1/rooms/join-by-code", target.Access, map[string]string{"token": token})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	require.Equal(t, rid, r.Body["room"].(map[string]any)["id"])
	require.Len(t, r.Body["members"].([]any), 2)

	// A targeted invite is not redeemable by someone else.
	stranger := ts.Register("stranger")
	token2 := invite(ts, host, rid, target.ID).Body["token"].(string)
	r = ts.Do(http.MethodPost, "/api/v1/rooms/join-by-code", stranger.Access, map[string]string{"token": token2})
	require.Equal(t, http.StatusForbidden, r.Status)
}

func TestInviteExpired(t *testing.T) {
	testkit.Cover(t, "invite-expired")
	ts := testutil.New(t)
	host, target := ts.Register("host"), ts.Register("target")
	rid := roomID(createRoom(ts, host, "Slowpoke"))
	token := invite(ts, host, rid, target.ID).Body["token"].(string)

	ts.Mini.FastForward(10*time.Minute + time.Second)
	r := ts.Do(http.MethodPost, "/api/v1/rooms/join-by-code", target.Access, map[string]string{"token": token})
	require.Equal(t, http.StatusNotFound, r.Status, "expired token must be rejected")
}

func TestInviteSingleUse(t *testing.T) {
	testkit.Cover(t, "invite-single-use")
	ts := testutil.New(t)
	host, target := ts.Register("host"), ts.Register("target")
	rid := roomID(createRoom(ts, host, "OneShot"))
	token := invite(ts, host, rid, target.ID).Body["token"].(string)

	r := ts.Do(http.MethodPost, "/api/v1/rooms/join-by-code", target.Access, map[string]string{"token": token})
	require.Equal(t, http.StatusOK, r.Status)

	// Second redemption (even by the same account) fails: GETDEL burned it.
	ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/leave", target.Access, nil)
	r = ts.Do(http.MethodPost, "/api/v1/rooms/join-by-code", target.Access, map[string]string{"token": token})
	require.Equal(t, http.StatusNotFound, r.Status, "token must be single-use")
	require.False(t, ts.Mini.Exists("invite:"+token))
}

// TestInvitePush covers invite-05: the target's lobby WS receives the invite.
func TestInvitePush(t *testing.T) {
	testkit.Cover(t, "invite-push")
	ts := testutil.New(t)
	host, target := ts.Register("host"), ts.Register("target")
	rid := roomID(createRoom(ts, host, "Pushy"))

	ws := ts.MustDialWS(target.Access)
	token := invite(ts, host, rid, target.ID).Body["token"].(string)

	msg, err := ws.ReadUntil(testutil.WSWait, func(m map[string]any) bool { return m["type"] == "invite" })
	require.NoError(t, err)
	require.Equal(t, rid, msg["roomId"])
	require.Equal(t, host.ID, msg["from"])
	require.Equal(t, token, msg["token"], "pushed token must match the minted one")
}

func TestInviteAuthz(t *testing.T) {
	testkit.Cover(t, "invite-authz")
	ts := testutil.New(t)
	host, guest, target := ts.Register("host"), ts.Register("guest"), ts.Register("target")
	rid := roomID(createRoom(ts, host, "HostOnly"))
	ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/join", guest.Access, nil)

	// A non-host member cannot mint invites.
	r := invite(ts, guest, rid, target.ID)
	require.Equal(t, http.StatusForbidden, r.Status)
	// Neither can a complete outsider.
	r = invite(ts, target, rid, guest.ID)
	require.Equal(t, http.StatusForbidden, r.Status)
	// Nor for a room that does not exist.
	r = invite(ts, host, "r_nope", target.ID)
	require.Equal(t, http.StatusNotFound, r.Status)
}

func TestInviteEntropy(t *testing.T) {
	testkit.Cover(t, "invite-entropy")
	ts := testutil.New(t)
	host, target := ts.Register("host"), ts.Register("target")
	rid := roomID(createRoom(ts, host, "Entropy"))

	seen := map[string]bool{}
	for i := 0; i < 32; i++ {
		token := invite(ts, host, rid, target.ID).Body["token"].(string)
		// 256-bit hex: 64 chars, decodes cleanly.
		require.Len(t, token, 64, "token must be 256 bits hex-encoded")
		raw, err := hex.DecodeString(token)
		require.NoError(t, err)
		require.Len(t, raw, 32)
		require.False(t, seen[token], "tokens must never repeat")
		seen[token] = true
	}
}
