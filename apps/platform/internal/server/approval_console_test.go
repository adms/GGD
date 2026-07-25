// approval_console_test.go covers the operator-facing half of the #126
// approval gate — the endpoints an admin console calls to see and answer the
// pending queue — plus the properties that keep the gate from either being
// invisible (an unaudited decision) or fatal (an owner who denies himself).
//
// private_deploy_test.go already proves the PLAYER-facing half: pending on
// register, no session, 403 on login, approve/deny flips it. Everything here is
// about the operator's side of the same gate.
package server_test

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// gatedDeployWithOwner boots an approval-gated platform, registers `name` as
// the first account, and makes it a usable administrator out of band — exactly
// as the owner bootstrap does on a real fresh deploy, and as an operator would
// with ADMIN_BOOTSTRAP_USERNAME. Returns the owner's id and access token.
func gatedDeployWithOwner(t *testing.T, name string) (*testutil.TS, string, string) {
	t.Helper()
	t.Setenv("GGD_REQUIRE_APPROVAL", "1")
	ts := testutil.New(t)

	r := registerRaw(ts, name)
	require.Equal(t, http.StatusCreated, r.Status, string(r.Raw))
	id := r.Body["account"].(map[string]any)["id"].(string)
	grantAdminRole(t, ts, id)
	_, err := ts.Srv.Accounts.SetStatus(context.Background(), id, account.StatusApproved)
	require.NoError(t, err)

	login := loginRaw(ts, name)
	require.Equal(t, http.StatusOK, login.Status, string(login.Raw))
	return ts, id, login.Body["tokens"].(map[string]any)["accessToken"].(string)
}

// auditActions returns every audit action recorded against targetID.
func auditActions(t *testing.T, ts *testutil.TS, token, targetID string) []map[string]any {
	t.Helper()
	r := ts.Do(http.MethodGet, "/api/v1/admin/audit?page=1&pageSize=200", token, nil)
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	out := []map[string]any{}
	for _, e := range r.Body["entries"].([]any) {
		row := e.(map[string]any)
		if row["targetId"] == targetID {
			out = append(out, row)
		}
	}
	return out
}

// sec-infra-approval-queue: the console can SEE who is waiting. Without this
// the gate is unusable — an owner would have to guess that a relative had
// registered, and guess their account id to approve it.
func TestApprovalQueueIsListableAndOrdered(t *testing.T) {
	testkit.Cover(t, "sec-infra-approval-queue")
	ts, ownerID, ownerTok := gatedDeployWithOwner(t, "owner")

	first := registerRaw(ts, "cousin")
	require.Equal(t, http.StatusCreated, first.Status, string(first.Raw))
	firstID := first.Body["account"].(map[string]any)["id"].(string)
	second := registerRaw(ts, "nephew")
	require.Equal(t, http.StatusCreated, second.Status, string(second.Raw))
	secondID := second.Body["account"].(map[string]any)["id"].(string)

	q := ts.Do(http.MethodGet, "/api/v1/admin/accounts/pending?page=1&pageSize=20", ownerTok, nil)
	require.Equal(t, http.StatusOK, q.Status, string(q.Raw))
	assert.Equal(t, float64(2), q.Body["total"], "both pending accounts must be queued: %s", string(q.Raw))
	rows := q.Body["accounts"].([]any)
	require.Len(t, rows, 2)

	// OLDEST FIRST — the person who has been waiting longest is answered first.
	assert.Equal(t, firstID, rows[0].(map[string]any)["id"])
	assert.Equal(t, secondID, rows[1].(map[string]any)["id"])

	// The queue rows carry the fields a console needs to render a decision.
	row := rows[0].(map[string]any)
	assert.Equal(t, "cousin", row["username"])
	assert.Equal(t, account.StatusPending, row["status"])
	assert.Equal(t, false, row["approved"], "a pending account is not approved")

	// The approved owner is NOT in the queue.
	for _, r := range rows {
		assert.NotEqual(t, ownerID, r.(map[string]any)["id"], "an approved admin must not appear in the pending queue")
	}

	// Answering one takes it out of the queue.
	appr := ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+firstID+"/approve", ownerTok, nil)
	require.Equal(t, http.StatusOK, appr.Status, string(appr.Raw))
	q = ts.Do(http.MethodGet, "/api/v1/admin/accounts/pending", ownerTok, nil)
	require.Equal(t, http.StatusOK, q.Status)
	assert.Equal(t, float64(1), q.Body["total"], "an approved account leaves the queue")
	assert.Equal(t, secondID, q.Body["accounts"].([]any)[0].(map[string]any)["id"])
}

// The general account search exposes the approval state too, so a console can
// build "denied" / "approved" views without a second endpoint per state.
func TestAccountSearchExposesApprovalStatus(t *testing.T) {
	ts, _, ownerTok := gatedDeployWithOwner(t, "owner")
	pending := registerRaw(ts, "cousin")
	pendingID := pending.Body["account"].(map[string]any)["id"].(string)

	r := ts.Do(http.MethodGet, "/api/v1/admin/accounts?status=pending&page=1&pageSize=20", ownerTok, nil)
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	require.Equal(t, float64(1), r.Body["total"], "only the pending account matches: %s", string(r.Raw))
	assert.Equal(t, pendingID, r.Body["accounts"].([]any)[0].(map[string]any)["id"])

	// An unfiltered search is unchanged (owner + cousin) and every row carries
	// the status, so an older console keeps working and a new one has the data.
	r = ts.Do(http.MethodGet, "/api/v1/admin/accounts?page=1&pageSize=20", ownerTok, nil)
	require.Equal(t, http.StatusOK, r.Status)
	assert.Equal(t, float64(2), r.Body["total"])
	for _, row := range r.Body["accounts"].([]any) {
		_, has := row.(map[string]any)["status"]
		assert.True(t, has, "every account row must carry a status field: %s", string(r.Raw))
	}
}

// sec-infra-approval-audited: letting somebody into the owner's private deploy
// is the single most consequential operator action there is, and it was the one
// action that left no trace. Both directions must land in the append-only log,
// with the operator-supplied reason.
func TestApprovalDecisionsAreAudited(t *testing.T) {
	testkit.Cover(t, "sec-infra-approval-audited")
	ts, ownerID, ownerTok := gatedDeployWithOwner(t, "owner")

	good := registerRaw(ts, "cousin")
	goodID := good.Body["account"].(map[string]any)["id"].(string)
	bad := registerRaw(ts, "stranger")
	badID := bad.Body["account"].(map[string]any)["id"].(string)

	require.Equal(t, http.StatusOK,
		ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+goodID+"/approve", ownerTok, nil).Status)
	deny := ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+badID+"/deny", ownerTok,
		map[string]string{"reason": "不認識這個人"})
	require.Equal(t, http.StatusOK, deny.Status, string(deny.Raw))

	approved := auditActions(t, ts, ownerTok, goodID)
	require.Len(t, approved, 1, "the approval must be recorded exactly once")
	assert.Equal(t, "approval_approved", approved[0]["action"])
	assert.Equal(t, ownerID, approved[0]["adminId"], "the audit line names WHO approved")

	denied := auditActions(t, ts, ownerTok, badID)
	require.Len(t, denied, 1)
	assert.Equal(t, "approval_denied", denied[0]["action"])
	detail := denied[0]["detail"].(map[string]any)
	assert.Equal(t, "不認識這個人", detail["reason"], "the reason must survive the decision")
}

// sec-infra-approval-no-lockout: approval can be taken away, so it can be taken
// away from the LAST administrator who can still sign in — which leaves a
// deploy nobody can administer and nobody can approve back into. Refused, with
// the same 409 last_admin the role-revocation guard uses.
func TestApprovalCannotStrandTheDeploy(t *testing.T) {
	testkit.Cover(t, "sec-infra-approval-no-lockout")
	ts, ownerID, ownerTok := gatedDeployWithOwner(t, "owner")

	// The sole owner cannot deny himself. (A mis-click on his own row in a list
	// of accounts is the likeliest way this ever gets attempted, and before the
	// guard it would have taken cmd/ownerreset or hand-edited JSON to undo.)
	self := ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+ownerID+"/deny", ownerTok, nil)
	assert.Equal(t, http.StatusConflict, self.Status, string(self.Raw))
	assert.Equal(t, "last_admin", self.ErrCode())

	// He is still an administrator afterwards — a refused call must not have
	// half-applied.
	me := ts.Do(http.MethodGet, "/api/v1/admin/accounts/pending", ownerTok, nil)
	assert.Equal(t, http.StatusOK, me.Status, "the refused deny must not have cost the owner his access")

	// With a SECOND usable admin in place the same call is allowed: the guard
	// protects the deploy, it does not make approval irrevocable.
	deputy := registerRaw(ts, "deputy")
	deputyID := deputy.Body["account"].(map[string]any)["id"].(string)
	require.Equal(t, http.StatusOK,
		ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+deputyID+"/approve", ownerTok, nil).Status)
	grantAdminRole(t, ts, deputyID)

	now := ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+ownerID+"/deny", ownerTok, nil)
	assert.Equal(t, http.StatusOK, now.Status, string(now.Raw))
}

// sec-infra-approval-revokes-live-session: a denial must take effect NOW. An
// access token is a signed bearer token with its own TTL, so checking approval
// only at login left a denied administrator with full operator powers until it
// expired — including the power to re-approve himself.
func TestDenialImmediatelyRevokesLiveAccess(t *testing.T) {
	testkit.Cover(t, "sec-infra-approval-revokes-live-session")
	ts, _, ownerTok := gatedDeployWithOwner(t, "owner")

	// A second administrator, approved, signed in, holding a live token.
	deputy := registerRaw(ts, "deputy")
	deputyID := deputy.Body["account"].(map[string]any)["id"].(string)
	require.Equal(t, http.StatusOK,
		ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+deputyID+"/approve", ownerTok, nil).Status)
	grantAdminRole(t, ts, deputyID)
	login := loginRaw(ts, "deputy")
	require.Equal(t, http.StatusOK, login.Status, string(login.Raw))
	tokens := login.Body["tokens"].(map[string]any)
	deputyTok := tokens["accessToken"].(string)
	deputyRefresh := tokens["refreshToken"].(string)

	// The token works while approved.
	require.Equal(t, http.StatusOK,
		ts.Do(http.MethodGet, "/api/v1/admin/accounts/pending", deputyTok, nil).Status)

	// The owner denies him. The SAME token must stop working immediately.
	require.Equal(t, http.StatusOK,
		ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+deputyID+"/deny", ownerTok, nil).Status)

	after := ts.Do(http.MethodGet, "/api/v1/admin/accounts/pending", deputyTok, nil)
	assert.Equal(t, http.StatusForbidden, after.Status, "a denied admin's live token must be refused: %s", string(after.Raw))
	assert.Equal(t, "admin_required", after.ErrCode())

	// And he cannot mint a fresh pair from the refresh token he still holds.
	ref := ts.Do(http.MethodPost, "/api/v1/auth/refresh", "", map[string]string{"refreshToken": deputyRefresh})
	assert.Equal(t, http.StatusUnauthorized, ref.Status, "the refresh token was revoked with the denial: %s", string(ref.Raw))
}

// sec-infra-approval-blocks-play: the gate's actual promise is "cannot PLAY
// until approved". A player denied while already signed in must be stopped at
// the lobby door immediately — the access token in his browser is a signed
// bearer credential that would otherwise keep working for its whole TTL.
func TestDeniedPlayerCannotEnterTheLobbyWithALiveToken(t *testing.T) {
	testkit.Cover(t, "sec-infra-approval-blocks-play")
	ts, _, ownerTok := gatedDeployWithOwner(t, "owner")

	player := registerRaw(ts, "cousin")
	playerID := player.Body["account"].(map[string]any)["id"].(string)
	require.Equal(t, http.StatusOK,
		ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+playerID+"/approve", ownerTok, nil).Status)
	tok := loginRaw(ts, "cousin").Body["tokens"].(map[string]any)["accessToken"].(string)

	// Approved: the lobby lets him in.
	ws, _, err := ts.DialWS(tok)
	require.NoError(t, err, "an approved player must be able to enter the lobby")
	_ = ws.Conn.CloseNow()

	// Denied: the SAME token is refused at the handshake, before the upgrade.
	require.Equal(t, http.StatusOK,
		ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+playerID+"/deny", ownerTok, nil).Status)
	_, resp, err := ts.DialWS(tok)
	require.Error(t, err, "a denied player must not be able to enter the lobby")
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode, "the handshake must answer 403, not upgrade")

	// …and the REST match surface is closed to the same token: a client that
	// never opens the WebSocket must not be able to create or join a room.
	create := ts.Do(http.MethodPost, "/api/v1/rooms", tok, map[string]any{"name": "sneaky", "mode": "arena"})
	assert.Equal(t, http.StatusForbidden, create.Status, "a denied player must not create a room: %s", string(create.Raw))
	assert.Equal(t, "account_denied", create.ErrCode())

	list := ts.Do(http.MethodGet, "/api/v1/lobby/rooms", tok, nil)
	assert.Equal(t, http.StatusForbidden, list.Status, "a denied player must not browse the lobby: %s", string(list.Raw))

	// …including the one-click bot match (#188). It is the shortest path from a
	// browser to a running match — create and start in a single POST — so it is
	// exactly the route where a gate that lived in the client instead of the
	// router would be found out.
	solo := ts.Do(http.MethodPost, "/api/v1/rooms/solo", tok, nil)
	assert.Equal(t, http.StatusForbidden, solo.Status, "a denied player must not start a bot match: %s", string(solo.Raw))
	assert.Equal(t, "account_denied", solo.ErrCode())
	assert.Empty(t, ts.Node.Requests(), "and no match may be reserved on the game server for him")
}

// A banned administrator loses operator powers on the same beat, for the same
// reason (a live access token outliving the ban).
func TestBannedAdminLosesLiveAccessImmediately(t *testing.T) {
	ts, _, ownerTok := gatedDeployWithOwner(t, "owner")

	deputy := registerRaw(ts, "deputy")
	deputyID := deputy.Body["account"].(map[string]any)["id"].(string)
	require.Equal(t, http.StatusOK,
		ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+deputyID+"/approve", ownerTok, nil).Status)
	grantAdminRole(t, ts, deputyID)
	deputyTok := loginRaw(ts, "deputy").Body["tokens"].(map[string]any)["accessToken"].(string)
	require.Equal(t, http.StatusOK,
		ts.Do(http.MethodGet, "/api/v1/admin/accounts/pending", deputyTok, nil).Status)

	require.Equal(t, http.StatusOK,
		ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+deputyID+"/ban", ownerTok,
			map[string]string{"reason": "test"}).Status)

	after := ts.Do(http.MethodGet, "/api/v1/admin/accounts/pending", deputyTok, nil)
	assert.Equal(t, http.StatusForbidden, after.Status, "a banned admin's live token must be refused: %s", string(after.Raw))
}

// The approval queue and the decision routes are AdminOnly, like every other
// operator route. Registration data (who signed up, with what email) is exactly
// the kind of thing a private deploy must not leak to a logged-in stranger.
func TestApprovalQueueIsAdminOnly(t *testing.T) {
	ts := testutil.New(t) // gate off: ts.Register mints an ordinary player
	pleb := ts.Register("plebeian")

	for _, path := range []string{"/api/v1/admin/accounts/pending", "/api/v1/admin/accounts?status=pending"} {
		r := ts.Do(http.MethodGet, path, pleb.Access, nil)
		assert.Equal(t, http.StatusForbidden, r.Status, "%s: %s", path, string(r.Raw))
		assert.Equal(t, "admin_required", r.ErrCode(), path)

		r = ts.Do(http.MethodGet, path, "", nil)
		assert.Equal(t, http.StatusUnauthorized, r.Status, "%s unauthenticated", path)
	}
}

// sec-infra-no-monetization: the owner said 「我沒有要公開」 — this build must
// never grow a way to take money. The two in-game currencies are closed loops
// (M COIN is granted by an operator; crystals are earned by playing), and the
// check is written against the ROUTE TREE rather than a grep so a payment
// endpoint added in any package fails here.
func TestNoMonetizationSurfaceIsReachable(t *testing.T) {
	testkit.Cover(t, "sec-infra-no-monetization")
	ts := testutil.New(t)

	// Substrings that only appear in a real-money path. "purchase"/"buy" are
	// deliberately NOT here: /store/buy spends the closed-loop currency, which
	// is the whole point of #118, and banning the word would be theatre.
	forbidden := []string{"stripe", "paypal", "checkout", "payment", "billing",
		"subscribe", "subscription", "invoice", "topup", "top-up", "recharge"}

	routes, ok := ts.Srv.Router().(chi.Routes)
	require.True(t, ok, "the router must be walkable")
	seen := 0
	require.NoError(t, chi.Walk(routes, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		seen++
		low := strings.ToLower(route)
		for _, bad := range forbidden {
			assert.NotContains(t, low, bad, "a monetization route appeared: %s %s", method, route)
		}
		return nil
	}))
	require.Greater(t, seen, 20, "the walk must actually have visited the route tree")

	// The only way M COIN enters an account is an OPERATOR grant: a player
	// cannot grant himself any, at any price. Task #214 moved that grant off
	// the unaudited /wallet/admin/grant-mcoin (deleted — hence 404 on the old
	// path) and onto the AdminOnly, audited /admin/accounts/{id}/mcoin, so both
	// doors are probed: the retired one must not answer at all, and the live one
	// must refuse a non-admin.
	player := ts.Register("player")
	r := ts.Do(http.MethodPost, "/api/v1/wallet/admin/grant-mcoin", player.Access,
		map[string]any{"accountId": player.ID, "amount": 100000})
	assert.Equal(t, http.StatusNotFound, r.Status, "the unaudited M COIN grant route must stay deleted: %s", string(r.Raw))
	r = ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+player.ID+"/mcoin", player.Access,
		map[string]any{"delta": 100000, "reason": "self"})
	assert.Equal(t, http.StatusForbidden, r.Status, "a player must not be able to grant himself M COIN: %s", string(r.Raw))
}
