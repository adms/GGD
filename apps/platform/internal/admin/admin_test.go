package admin_test

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/admin"
	"github.com/ggd/platform/internal/config"
	"github.com/ggd/platform/internal/gamelink"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// grantAdmin promotes an account to the admin role directly on the JSON truth.
// Because AdminOnly loads the account fresh on every request, the account's
// EXISTING access token immediately gains admin capability (no re-login).
func grantAdmin(t *testing.T, ts *testutil.TS, id string) {
	t.Helper()
	_, err := ts.Srv.Accounts.Update(context.Background(), id, func(a *account.Account) error {
		if !a.HasRole(admin.RoleAdmin) {
			a.Roles = append(a.Roles, admin.RoleAdmin)
		}
		return nil
	})
	require.NoError(t, err)
}

// adminRoutes is the full admin surface, used by the role-gate table test.
func adminRoutes(targetID string) []struct{ method, path string } {
	return []struct{ method, path string }{
		{http.MethodGet, "/api/v1/admin/accounts"},
		{http.MethodGet, "/api/v1/admin/accounts/" + targetID},
		{http.MethodPost, "/api/v1/admin/accounts/" + targetID + "/mcoin"},
		{http.MethodPost, "/api/v1/admin/accounts/" + targetID + "/crystal"},
		{http.MethodPost, "/api/v1/admin/crystals/grant-all"},
		{http.MethodPost, "/api/v1/admin/accounts/" + targetID + "/mmr"},
		{http.MethodPost, "/api/v1/admin/accounts/" + targetID + "/ban"},
		{http.MethodPost, "/api/v1/admin/accounts/" + targetID + "/unban"},
		{http.MethodGet, "/api/v1/admin/matches"},
		{http.MethodGet, "/api/v1/admin/matches/some-id"},
		{http.MethodGet, "/api/v1/admin/announcements"},
		{http.MethodPost, "/api/v1/admin/announcements"},
		{http.MethodPut, "/api/v1/admin/announcements/some-id"},
		{http.MethodDelete, "/api/v1/admin/announcements/some-id"},
		{http.MethodGet, "/api/v1/admin/audit"},
	}
}

// admin-role-gate: a valid NON-admin token is rejected with 403 on every admin
// route (the gate is at the router group, before any handler runs).
func TestAdminRoleGate(t *testing.T) {
	testkit.Cover(t, "admin-role-gate")
	ts := testutil.New(t)
	normal := ts.Register("normal")

	for _, rt := range adminRoutes(normal.ID) {
		r := ts.Do(rt.method, rt.path, normal.Access, map[string]any{})
		assert.Equal(t, http.StatusForbidden, r.Status, "%s %s must 403 for a non-admin", rt.method, rt.path)
		assert.Equal(t, "admin_required", r.ErrCode(), "%s %s", rt.method, rt.path)
	}
}

// admin-authz-idor: admin routes are not reachable without a valid admin
// token. No token → 401; a normal user's token → 403; the same routes work
// only once the account holds the role.
func TestAdminAuthzIDOR(t *testing.T) {
	testkit.Cover(t, "admin-authz-idor")
	ts := testutil.New(t)
	normal := ts.Register("normal")

	// No token at all → 401 (auth middleware), never 200/403-leak.
	r := ts.Do(http.MethodGet, "/api/v1/admin/accounts", "", nil)
	assert.Equal(t, http.StatusUnauthorized, r.Status)

	// A normal token cannot ban another account through the admin surface.
	victim := ts.Register("victim")
	r = ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+victim.ID+"/ban", normal.Access, map[string]any{"reason": "x"})
	assert.Equal(t, http.StatusForbidden, r.Status)
	// The victim is NOT banned — a normal token had no effect.
	after, err := ts.Srv.Accounts.GetByID(context.Background(), victim.ID)
	require.NoError(t, err)
	assert.False(t, after.Banned)

	// Grant the role → the identical token now works.
	grantAdmin(t, ts, normal.ID)
	r = ts.Do(http.MethodGet, "/api/v1/admin/accounts", normal.Access, nil)
	assert.Equal(t, http.StatusOK, r.Status)
}

// admin-ban-blocks-login + admin-unban-restores: banning refuses login with a
// clear code+reason; unbanning restores it.
func TestBanUnbanLogin(t *testing.T) {
	ts := testutil.New(t)
	adminU := ts.Register("root")
	grantAdmin(t, ts, adminU.ID)
	target := ts.Register("player1")

	// Ban with a reason.
	r := ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+target.ID+"/ban", adminU.Access, map[string]any{"reason": "cheating"})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))

	// Login now refused: 403 account_banned, reason surfaced.
	testkit.Cover(t, "admin-ban-blocks-login")
	login := ts.Do(http.MethodPost, "/api/v1/auth/login", "", map[string]string{
		"username": "player1", "password": "correct-horse-player1",
	})
	assert.Equal(t, http.StatusForbidden, login.Status)
	assert.Equal(t, "account_banned", login.ErrCode())
	assert.Contains(t, strings.ToLower(errMessage(login)), "cheating")

	// Unban restores login.
	r = ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+target.ID+"/unban", adminU.Access, nil)
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))

	testkit.Cover(t, "admin-unban-restores")
	login = ts.Do(http.MethodPost, "/api/v1/auth/login", "", map[string]string{
		"username": "player1", "password": "correct-horse-player1",
	})
	assert.Equal(t, http.StatusOK, login.Status, string(login.Raw))
}

// admin-banned-no-refresh: a banned account cannot rotate a still-live refresh
// token (the Refresh guard fires even if the token was not revoked).
func TestBannedCannotRefresh(t *testing.T) {
	testkit.Cover(t, "admin-banned-no-refresh")
	ts := testutil.New(t)
	target := ts.Register("player2")

	// Ban directly on the truth (no token revocation) so the refresh token
	// survives — isolating the auth.Refresh ban guard.
	_, err := ts.Srv.Accounts.Update(context.Background(), target.ID, func(a *account.Account) error {
		a.Banned = true
		a.BanReason = "abuse"
		return nil
	})
	require.NoError(t, err)

	r := ts.Do(http.MethodPost, "/api/v1/auth/refresh", "", map[string]string{"refreshToken": target.Refresh})
	assert.Equal(t, http.StatusForbidden, r.Status, string(r.Raw))
	assert.Equal(t, "account_banned", r.ErrCode())
}

// admin-ban-survives-redis-wipe: the ban lives on the account JSON truth, so a
// wiped Redis (hot layer) still refuses the banned login after rebuild.
func TestBanSurvivesRedisWipe(t *testing.T) {
	testkit.Cover(t, "admin-ban-survives-redis-wipe")
	ts := testutil.New(t)
	adminU := ts.Register("root")
	grantAdmin(t, ts, adminU.ID)
	ts.Register("player3")
	targetID := mustAccountID(t, ts, "player3")

	r := ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+targetID+"/ban", adminU.Access, map[string]any{"reason": "botting"})
	require.Equal(t, http.StatusOK, r.Status)

	ts.Mini.FlushAll() // nuke the entire hot layer

	login := ts.Do(http.MethodPost, "/api/v1/auth/login", "", map[string]string{
		"username": "player3", "password": "correct-horse-player3",
	})
	assert.Equal(t, http.StatusForbidden, login.Status, "ban must survive a Redis wipe")
	assert.Equal(t, "account_banned", login.ErrCode())
}

// admin-mcoin-audited: an M COIN adjustment moves the wallet AND writes an
// audit line carrying the delta.
func TestMCoinAdjustAudited(t *testing.T) {
	testkit.Cover(t, "admin-mcoin-audited")
	ts := testutil.New(t)
	adminU := ts.Register("root")
	grantAdmin(t, ts, adminU.ID)
	target := ts.Register("rich")

	r := ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+target.ID+"/mcoin", adminU.Access, map[string]any{
		"delta": 500, "reason": "goodwill",
	})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	assert.EqualValues(t, 500, r.Body["mcoin"])

	// Reflected in the full profile.
	prof := ts.Do(http.MethodGet, "/api/v1/admin/accounts/"+target.ID, adminU.Access, nil)
	require.Equal(t, http.StatusOK, prof.Status)
	wallet := prof.Body["wallet"].(map[string]any)
	assert.EqualValues(t, 500, wallet["mcoin"])

	// Audit line present.
	audit := ts.Do(http.MethodGet, "/api/v1/admin/audit", adminU.Access, nil)
	require.Equal(t, http.StatusOK, audit.Status)
	assert.True(t, auditHas(audit, "mcoin_adjust", target.ID), "mcoin adjust must be audited")
}

// admin-mcoin-clamp: adjusting below zero clamps at zero (absolute-safe).
func TestMCoinClamp(t *testing.T) {
	testkit.Cover(t, "admin-mcoin-clamp")
	ts := testutil.New(t)
	adminU := ts.Register("root")
	grantAdmin(t, ts, adminU.ID)
	target := ts.Register("broke")

	r := ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+target.ID+"/mcoin", adminU.Access, map[string]any{
		"delta": -100, "reason": "clawback",
	})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	assert.EqualValues(t, 0, r.Body["mcoin"], "balance clamps at zero, never negative")
}

// admin-mmr-leaderboard: setting an absolute MMR re-ZADDs the ladder, so the
// player appears on the public leaderboard at the new rating.
func TestMMRReflectedInLeaderboard(t *testing.T) {
	testkit.Cover(t, "admin-mmr-leaderboard")
	ts := testutil.New(t)
	adminU := ts.Register("root")
	grantAdmin(t, ts, adminU.ID)
	target := ts.Register("climber")

	r := ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+target.ID+"/mmr", adminU.Access, map[string]any{
		"mmr": 2500, "reason": "seed",
	})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))

	lb := ts.Do(http.MethodGet, "/api/v1/ranking/leaderboard?page=1&pageSize=50", "", nil)
	require.Equal(t, http.StatusOK, lb.Status)
	entries := lb.Body["entries"].([]any)
	found := false
	for _, e := range entries {
		row := e.(map[string]any)
		if row["accountId"] == target.ID {
			found = true
			assert.EqualValues(t, 2500, row["mmr"])
		}
	}
	assert.True(t, found, "the re-rated player must appear on the leaderboard")
}

// admin-search-pagination + admin-no-hash-leak: search filters + paginates and
// never leaks the password hash.
func TestAccountSearchPaginationAndNoHashLeak(t *testing.T) {
	ts := testutil.New(t)
	adminU := ts.Register("root")
	grantAdmin(t, ts, adminU.ID)
	for _, u := range []string{"alpha", "alphabet", "beta"} {
		ts.Register(u)
	}

	testkit.Cover(t, "admin-search-pagination")
	// Filter by substring "alpha" → 2 matches, paginated to 1 per page.
	r := ts.Do(http.MethodGet, "/api/v1/admin/accounts?query=alpha&page=1&pageSize=1", adminU.Access, nil)
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	assert.EqualValues(t, 2, r.Body["total"])
	assert.Len(t, r.Body["accounts"].([]any), 1)

	r2 := ts.Do(http.MethodGet, "/api/v1/admin/accounts?query=alpha&page=2&pageSize=1", adminU.Access, nil)
	assert.Len(t, r2.Body["accounts"].([]any), 1)
	// The two pages are different accounts.
	id1 := r.Body["accounts"].([]any)[0].(map[string]any)["id"]
	id2 := r2.Body["accounts"].([]any)[0].(map[string]any)["id"]
	assert.NotEqual(t, id1, id2)

	testkit.Cover(t, "admin-no-hash-leak")
	// No password material anywhere in the search OR the single-account view.
	assert.NotContains(t, string(r.Raw), "passwordHash")
	assert.NotContains(t, string(r.Raw), "argon2")
	prof := ts.Do(http.MethodGet, "/api/v1/admin/accounts/"+adminU.ID, adminU.Access, nil)
	assert.NotContains(t, string(prof.Raw), "passwordHash")
	assert.NotContains(t, string(prof.Raw), "argon2")
}

// admin-announcement-crud: full lifecycle of an announcement.
func TestAnnouncementCRUD(t *testing.T) {
	testkit.Cover(t, "admin-announcement-crud")
	ts := testutil.New(t)
	adminU := ts.Register("root")
	grantAdmin(t, ts, adminU.ID)

	create := ts.Do(http.MethodPost, "/api/v1/admin/announcements", adminU.Access, map[string]any{
		"title": "Server Maintenance", "body": "Down at 3am UTC.", "active": true,
	})
	require.Equal(t, http.StatusCreated, create.Status, string(create.Raw))
	ann := create.Body["announcement"].(map[string]any)
	id := ann["id"].(string)
	assert.Equal(t, "Server Maintenance", ann["title"])
	assert.Equal(t, true, ann["active"])

	list := ts.Do(http.MethodGet, "/api/v1/admin/announcements", adminU.Access, nil)
	assert.Len(t, list.Body["announcements"].([]any), 1)

	upd := ts.Do(http.MethodPut, "/api/v1/admin/announcements/"+id, adminU.Access, map[string]any{
		"title": "Maintenance Complete", "body": "All good.", "active": false,
	})
	require.Equal(t, http.StatusOK, upd.Status, string(upd.Raw))
	assert.Equal(t, "Maintenance Complete", upd.Body["announcement"].(map[string]any)["title"])
	assert.Equal(t, false, upd.Body["announcement"].(map[string]any)["active"])

	del := ts.Do(http.MethodDelete, "/api/v1/admin/announcements/"+id, adminU.Access, nil)
	require.Equal(t, http.StatusOK, del.Status)
	list = ts.Do(http.MethodGet, "/api/v1/admin/announcements", adminU.Access, nil)
	assert.Empty(t, list.Body["announcements"].([]any))
}

// admin-announcement-notfound: updating/deleting a missing announcement is 404.
func TestAnnouncementNotFound(t *testing.T) {
	testkit.Cover(t, "admin-announcement-notfound")
	ts := testutil.New(t)
	adminU := ts.Register("root")
	grantAdmin(t, ts, adminU.ID)

	upd := ts.Do(http.MethodPut, "/api/v1/admin/announcements/ghost01", adminU.Access, map[string]any{"title": "x"})
	assert.Equal(t, http.StatusNotFound, upd.Status)
	del := ts.Do(http.MethodDelete, "/api/v1/admin/announcements/ghost01", adminU.Access, nil)
	assert.Equal(t, http.StatusNotFound, del.Status)
}

// admin-public-feed-active: the unauthenticated feed shows only ACTIVE
// announcements, newest first.
func TestPublicFeedActiveOnly(t *testing.T) {
	testkit.Cover(t, "admin-public-feed-active")
	ts := testutil.New(t)
	adminU := ts.Register("root")
	grantAdmin(t, ts, adminU.ID)

	ts.Do(http.MethodPost, "/api/v1/admin/announcements", adminU.Access, map[string]any{
		"title": "Live One", "body": "shown", "active": true,
	})
	ts.Do(http.MethodPost, "/api/v1/admin/announcements", adminU.Access, map[string]any{
		"title": "Draft One", "body": "hidden", "active": false,
	})

	// Public, no token.
	feed := ts.Do(http.MethodGet, "/api/v1/announcements", "", nil)
	require.Equal(t, http.StatusOK, feed.Status)
	items := feed.Body["announcements"].([]any)
	require.Len(t, items, 1, "only the active announcement is public")
	assert.Equal(t, "Live One", items[0].(map[string]any)["title"])
	// The public projection must not leak the active flag/operator metadata.
	assert.NotContains(t, string(feed.Raw), "\"active\"")
}

// admin-audit-append: mutations append audit entries (newest first) carrying
// the acting admin id.
func TestAuditAppend(t *testing.T) {
	testkit.Cover(t, "admin-audit-append")
	ts := testutil.New(t)
	adminU := ts.Register("root")
	grantAdmin(t, ts, adminU.ID)
	target := ts.Register("subject")

	ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+target.ID+"/mmr", adminU.Access, map[string]any{"mmr": 1500})
	ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+target.ID+"/ban", adminU.Access, map[string]any{"reason": "r"})

	audit := ts.Do(http.MethodGet, "/api/v1/admin/audit", adminU.Access, nil)
	require.Equal(t, http.StatusOK, audit.Status)
	entries := audit.Body["entries"].([]any)
	require.GreaterOrEqual(t, len(entries), 2)
	// Newest first: the ban is the most recent action.
	first := entries[0].(map[string]any)
	assert.Equal(t, "ban", first["action"])
	assert.Equal(t, adminU.ID, first["adminId"])
	assert.Equal(t, target.ID, first["targetId"])
	assert.EqualValues(t, 2, audit.Body["total"])
}

// admin-bootstrap-grant: the configured bootstrap username is granted the admin
// role idempotently on boot.
func TestBootstrapGrantsAdmin(t *testing.T) {
	testkit.Cover(t, "admin-bootstrap-grant")
	ts := testutil.New(t, func(c *config.Config) { c.AdminBootstrapUsername = "owner" })
	owner := ts.Register("owner")

	// Before bootstrap runs, the account is a normal player.
	r := ts.Do(http.MethodGet, "/api/v1/admin/accounts", owner.Access, nil)
	assert.Equal(t, http.StatusForbidden, r.Status)

	// Run bootstrap (this is what server.Boot calls on startup).
	require.NoError(t, ts.Srv.Admin.EnsureBootstrapAdmin(context.Background()))

	r = ts.Do(http.MethodGet, "/api/v1/admin/accounts", owner.Access, nil)
	assert.Equal(t, http.StatusOK, r.Status, "bootstrap must grant the admin role")

	// Idempotent: a second run does not duplicate the role.
	require.NoError(t, ts.Srv.Admin.EnsureBootstrapAdmin(context.Background()))
	acc, err := ts.Srv.Accounts.GetByID(context.Background(), owner.ID)
	require.NoError(t, err)
	assert.Equal(t, []string{"admin"}, acc.Roles)
}

// admin-match-history: settled match records are listable/gettable and
// filterable by account.
func TestMatchHistory(t *testing.T) {
	testkit.Cover(t, "admin-match-history")
	ts := testutil.New(t)
	adminU := ts.Register("root")
	grantAdmin(t, ts, adminU.ID)
	player := ts.Register("competitor")

	// Write a settled match record via the durable truth path (the same file
	// the settlement writer produces).
	ended := time.Date(2026, 7, 20, 12, 0, 0, 0, time.UTC)
	st := gamelink.Settlement{
		MatchID: "01J0MATCHADMIN0000000000AA", Mode: "pairedduels", Status: "completed",
		Placements: []gamelink.TeamPlace{{Team: 1, Place: 1}},
		Seats:      []gamelink.ResultSeat{{AccountID: player.ID, Team: 1}},
		Ratings:    map[string]gamelink.RatingAfter{player.ID: {MMR: 1032, Games: 1, Wins: 1, MCoin: 200}},
		EndedAt:    ended,
	}
	require.NoError(t, ts.Srv.Store.Put(gamelink.MatchCollection(ended), st.MatchID, st))

	// Unfiltered list.
	all := ts.Do(http.MethodGet, "/api/v1/admin/matches", adminU.Access, nil)
	require.Equal(t, http.StatusOK, all.Status, string(all.Raw))
	assert.EqualValues(t, 1, all.Body["total"])

	// Filter by the competitor's account.
	byAcct := ts.Do(http.MethodGet, "/api/v1/admin/matches?accountId="+player.ID, adminU.Access, nil)
	require.Equal(t, http.StatusOK, byAcct.Status)
	assert.EqualValues(t, 1, byAcct.Body["total"])

	// Filter by a different account → empty.
	byOther := ts.Do(http.MethodGet, "/api/v1/admin/matches?accountId="+adminU.ID, adminU.Access, nil)
	assert.EqualValues(t, 0, byOther.Body["total"])

	// Single match by id.
	one := ts.Do(http.MethodGet, "/api/v1/admin/matches/"+st.MatchID, adminU.Access, nil)
	require.Equal(t, http.StatusOK, one.Status, string(one.Raw))
	match := one.Body["match"].(map[string]any)
	assert.Equal(t, st.MatchID, match["matchId"])

	// Missing match id → 404.
	miss := ts.Do(http.MethodGet, "/api/v1/admin/matches/nope", adminU.Access, nil)
	assert.Equal(t, http.StatusNotFound, miss.Status)
}

// ---- helpers ----------------------------------------------------------------

func errMessage(r testutil.Resp) string {
	if e, ok := r.Body["error"].(map[string]any); ok {
		if m, ok := e["message"].(string); ok {
			return m
		}
	}
	return ""
}

func mustAccountID(t *testing.T, ts *testutil.TS, username string) string {
	t.Helper()
	a, err := ts.Srv.Accounts.GetByUsername(context.Background(), username)
	require.NoError(t, err)
	return a.ID
}

func auditHas(r testutil.Resp, action, targetID string) bool {
	entries, ok := r.Body["entries"].([]any)
	if !ok {
		return false
	}
	for _, e := range entries {
		row, ok := e.(map[string]any)
		if ok && row["action"] == action && row["targetId"] == targetID {
			return true
		}
	}
	return false
}
