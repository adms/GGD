package friend_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/presence"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// ---- GET /lobby/online — 大廳線上玩家列表 (owner 2026-08-03) -------------------
//
// Every assertion below reads the RESPONSE, i.e. the only thing the browser can
// ever see. Nothing here asserts "the handler exists" or "presence was called":
// the roster is a filtered, related, ordered projection, and each of those three
// verbs is checked by making the world differ and watching the response change.

const onlineTag = "friend-lobby-online"

// setOnline puts an account into a live presence state (what the lobby WS does
// on connect). Tests that want somebody OFFLINE simply never call this — an
// absent presence key IS offline.
func setOnline(t *testing.T, ts *testutil.TS, id, state string) {
	t.Helper()
	require.NoError(t, ts.Srv.Presence.Set(context.Background(), id, state))
}

func onlineRows(t *testing.T, r testutil.Resp) []map[string]any {
	t.Helper()
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	raw, ok := r.Body["players"].([]any)
	require.True(t, ok, "players missing: %s", string(r.Raw))
	out := make([]map[string]any, 0, len(raw))
	for _, e := range raw {
		out = append(out, e.(map[string]any))
	}
	return out
}

func usernames(rows []map[string]any) []string {
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		out = append(out, r["username"].(string))
	}
	return out
}

// TestOnlineListsOnlyOnlineOthers: the list is exactly "everybody else who is
// online" — an offline account is absent, the viewer is absent, and the live
// presence STATE travels with the row (the dot the panel draws).
//
// This is the filter, tested by making the world differ: carol is registered
// exactly like bob and differs only in having no presence key.
func TestOnlineListsOnlyOnlineOthers(t *testing.T) {
	testkit.Cover(t, onlineTag)
	ts := testutil.New(t)
	a, b := ts.Register("alice"), ts.Register("bob")
	carol := ts.Register("carol")

	setOnline(t, ts, a.ID, presence.StateInLobby)
	setOnline(t, ts, b.ID, presence.StateInMatch)
	// carol: never online.

	rows := onlineRows(t, ts.Do(http.MethodGet, "/api/v1/lobby/online", a.Access, nil))
	require.Equal(t, []string{"bob"}, usernames(rows),
		"only OTHER accounts with a live presence key are rows (alice is the viewer, carol is offline)")
	require.Equal(t, presence.StateInMatch, rows[0]["state"],
		"the row carries the live state, so the panel can draw 對戰中 rather than a generic dot")
	require.Equal(t, b.ID, rows[0]["id"])
	require.EqualValues(t, 1, r0(t, ts, a.Access)["total"], "total counts the same set")

	// …and the moment carol comes online she appears, without anything else
	// changing. (Without this the test above also passes on a handler that
	// hard-codes a single row.)
	setOnline(t, ts, carol.ID, presence.StateOnline)
	rows = onlineRows(t, ts.Do(http.MethodGet, "/api/v1/lobby/online", a.Access, nil))
	require.Equal(t, []string{"bob", "carol"}, usernames(rows), "sorted by username")
}

func r0(t *testing.T, ts *testutil.TS, token string) map[string]any {
	t.Helper()
	r := ts.Do(http.MethodGet, "/api/v1/lobby/online", token, nil)
	require.Equal(t, http.StatusOK, r.Status)
	return r.Body
}

// TestOnlineReportsRelation: the per-row `relation` is what decides whether the
// one-click add button does anything, so it must MOVE as the social graph
// moves. Same two accounts, three states, three answers.
func TestOnlineReportsRelation(t *testing.T) {
	testkit.Cover(t, onlineTag)
	ts := testutil.New(t)
	a, b := ts.Register("alice"), ts.Register("bob")
	setOnline(t, ts, a.ID, presence.StateInLobby)
	setOnline(t, ts, b.ID, presence.StateInLobby)

	rows := onlineRows(t, ts.Do(http.MethodGet, "/api/v1/lobby/online", a.Access, nil))
	require.Len(t, rows, 1)
	require.Equal(t, "none", rows[0]["relation"], "strangers start addable")

	// One-click add — BY ACCOUNT ID, which is the shape the lobby panel sends
	// (it has the id in hand and usernames are not what it displays-by).
	add := ts.Do(http.MethodPost, "/api/v1/friends/requests", a.Access,
		map[string]string{"accountId": b.ID})
	require.Equal(t, http.StatusOK, add.Status, string(add.Raw))

	rows = onlineRows(t, ts.Do(http.MethodGet, "/api/v1/lobby/online", a.Access, nil))
	require.Equal(t, "outgoing", rows[0]["relation"], "my own pending request is visible to me")

	// The other side sees the mirror image, from ITS token.
	rowsB := onlineRows(t, ts.Do(http.MethodGet, "/api/v1/lobby/online", b.Access, nil))
	require.Equal(t, "incoming", rowsB[0]["relation"])

	// Accept → both sides read "friend", which is what greys the button out.
	acc := ts.Do(http.MethodPost, "/api/v1/friends/requests/"+a.ID+"/accept", b.Access, nil)
	require.Equal(t, http.StatusOK, acc.Status, string(acc.Raw))
	rows = onlineRows(t, ts.Do(http.MethodGet, "/api/v1/lobby/online", a.Access, nil))
	require.Equal(t, "friend", rows[0]["relation"])
	require.Len(t, rows, 1, "owner: an existing friend STAYS on the list, greyed — it does not vanish")
}

// TestOnlineRequiresPlayableAccount is the #210 lesson applied to a roster: a
// valid access token is NOT authorization to read every player's name. A
// rejected/banned account keeps a working token until it expires, and this is
// the one endpoint where that would hand over the whole deploy's user list.
func TestOnlineRequiresPlayableAccount(t *testing.T) {
	testkit.Cover(t, onlineTag)
	ts := testutil.New(t)
	a, b := ts.Register("alice"), ts.Register("bob")
	setOnline(t, ts, a.ID, presence.StateInLobby)
	setOnline(t, ts, b.ID, presence.StateInLobby)

	// Baseline: the token works right now.
	require.Equal(t, http.StatusOK,
		ts.Do(http.MethodGet, "/api/v1/lobby/online", b.Access, nil).Status)

	// Ban bob durably; his ACCESS TOKEN IS UNCHANGED and still unexpired.
	_, err := ts.Srv.Accounts.Update(context.Background(), b.ID, func(acc *account.Account) error {
		acc.Banned = true
		acc.BanReason = "test"
		return nil
	})
	require.NoError(t, err)

	r := ts.Do(http.MethodGet, "/api/v1/lobby/online", b.Access, nil)
	require.Equal(t, http.StatusForbidden, r.Status,
		"a banned account must not be able to harvest the roster with a still-valid token")
	require.NotContains(t, string(r.Raw), "alice", "and no names leak in the error body")

	// No token at all → 401, not an anonymous roster.
	r = ts.Do(http.MethodGet, "/api/v1/lobby/online", "", nil)
	require.Equal(t, http.StatusUnauthorized, r.Status)
	require.NotContains(t, string(r.Raw), "alice")
}

// TestOnlineHidesBlockedAndUnapproved: two accounts that are technically online
// but must not be offered as "add me": one I blocked, and one still pending
// admin approval (#126) whose presence key outlived its status change.
func TestOnlineHidesBlockedAndUnapproved(t *testing.T) {
	testkit.Cover(t, onlineTag)
	ts := testutil.New(t)
	a, b := ts.Register("alice"), ts.Register("bob")
	pending := ts.Register("pending")
	for _, id := range []string{a.ID, b.ID, pending.ID} {
		setOnline(t, ts, id, presence.StateInLobby)
	}
	// Both are visible before anything else happens — otherwise the assertions
	// below could pass against a handler that returns nothing.
	require.ElementsMatch(t, []string{"bob", "pending"},
		usernames(onlineRows(t, ts.Do(http.MethodGet, "/api/v1/lobby/online", a.Access, nil))))

	require.Equal(t, http.StatusOK,
		ts.Do(http.MethodPost, "/api/v1/friends/"+b.ID+"/block", a.Access, nil).Status)
	_, err := ts.Srv.Accounts.SetStatus(context.Background(), pending.ID, account.StatusPending)
	require.NoError(t, err)

	rows := onlineRows(t, ts.Do(http.MethodGet, "/api/v1/lobby/online", a.Access, nil))
	require.Empty(t, usernames(rows),
		"blocked accounts and not-yet-approved accounts are not lobby players")
}
