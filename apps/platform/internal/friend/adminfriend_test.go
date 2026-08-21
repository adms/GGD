package friend_test

// 管理員預設好友 (GH#499). Three things can silently make this feature zero, and
// each `it` below is one of them:
//   ① it links only ONE side, or leaves a pending request behind (= Request());
//   ② it never fires for the 198 accounts that already exist;
//   ③ the shipped document and the Go fuse drift, so the console edits a knob
//      the platform does not read.
// ⛔ Deliberately no assertion on any shipped VALUE — those live in
// content/config/admin-friend.json + the Zod DEFAULT + the console.

import (
	"context"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/friend"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// ① The load-bearing line: a registration through the REAL stack lands a
// two-sided friendship with the administrator and NO pending request.
func TestAdminFriendOnRegister(t *testing.T) {
	testkit.Cover(t, "friend-admin-auto")
	ts := testutil.NewFreshDeploy(t) // first registration claims the admin role
	admin, bob := ts.Register("owner"), ts.Register("bob")

	da, db := loadDoc(t, ts.Cfg.DataDir, admin.ID), loadDoc(t, ts.Cfg.DataDir, bob.ID)
	require.Contains(t, db.Friends, admin.ID, "the new account does not see the administrator")
	require.Contains(t, da.Friends, bob.ID, "the administrator does not see the new account")
	require.Empty(t, db.Incoming, "⛔ a pending request, not a friendship — this is Request(), not ForceFriend")
	require.Empty(t, db.Outgoing)
}

// ② The existing accounts. They were created with no admin in the system, so
// the hook correctly did nothing for them — the backfill is what makes owner's
// 「所有人」true rather than「今天以後註冊的人」.
func TestAdminFriendBackfillsExisting(t *testing.T) {
	testkit.Cover(t, "friend-admin-auto")
	ts := testutil.New(t) // ⛔ no owner bootstrap: nobody is an admin yet
	alice, bob := ts.Register("alice"), ts.Register("bob")
	// Negative control: with nobody carrying the admin role, the hook must have
	// linked nothing. (Read through the API — an account with no relations has
	// no file at all.)
	require.Empty(t, ts.Do(http.MethodGet, "/api/v1/friends", bob.Access, nil).Body["friends"])

	_, err := ts.Srv.Accounts.Update(context.Background(), alice.ID, func(a *account.Account) error {
		a.Roles = []string{account.RoleAdmin}
		return nil
	})
	require.NoError(t, err)

	r := ts.Do(http.MethodPost, "/api/v1/friends/admin-backfill", alice.Access, nil)
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
	require.Contains(t, loadDoc(t, ts.Cfg.DataDir, bob.ID).Friends, alice.ID)

	// The route is admin-only, and says nothing about itself to anybody else.
	require.Equal(t, http.StatusNotFound,
		ts.Do(http.MethodPost, "/api/v1/friends/admin-backfill", bob.Access, nil).Status)
}

// ③ The shipped document IS the fuse. Equality alone would also pass if the
// reader silently fell back (wrong schema tag, unreadable file), so the second
// half proves the file is really being read.
func TestAdminFriendShippedMatchesDefaults(t *testing.T) {
	testkit.Cover(t, "friend-admin-auto")
	repoContent := filepath.Join("..", "..", "..", "..", "content")
	require.Equal(t, friend.DefaultAdminPolicy(), friend.LoadAdminPolicy(repoContent))

	raw, err := os.ReadFile(filepath.Join(repoContent, "config", "admin-friend.json"))
	require.NoError(t, err)
	dir := t.TempDir()
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "config"), 0o755))
	flipped := strings.Replace(string(raw), `"enabled": true`, `"enabled": false`, 1)
	require.NoError(t, os.WriteFile(filepath.Join(dir, "config", "admin-friend.json"), []byte(flipped), 0o600))
	require.False(t, friend.LoadAdminPolicy(dir).Enabled, "the shipped document is not actually being read")
}
