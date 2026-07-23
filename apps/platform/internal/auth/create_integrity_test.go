// create_integrity_test.go pins the two properties that make account creation
// safe to build a privilege decision on: an account either lands COMPLETE or
// not at all, and a name is unique in the durable store rather than only in the
// rebuildable Redis cache.
//
// Both were exploitable, and both were exploitable specifically BECAUSE of the
// owner bootstrap: a half-created account that still carried the admin role, or
// a username that could be re-registered after a cache flush, each turned a
// plain registration into a way to take a deploy over.
package auth_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// auth-create-unkeyable-email: an address the JSON store cannot use as a file
// name must not half-create an account.
//
// "me+tag@example.com" is ordinary and RFC-valid; it passes auth's email rule
// and fails the store's key rule. Create used to write the account file and the
// by-username ref, then fail on by-email — leaving a fully loginable account
// that no by-username lookup could see, and (on a fresh deploy) one carrying the
// admin role and an approved status. The caller saw a 500 and assumed nothing
// had happened. The address is now keyed by an opaque hash instead, so the
// registration simply succeeds.
func TestPlusAddressedEmailCreatesOneCompleteAccount(t *testing.T) {
	testkit.Cover(t, "auth-create-unkeyable-email")
	ts := testutil.NewFreshDeploy(t)
	ctx := context.Background()

	r := ts.Do(http.MethodPost, "/api/v1/auth/register", "", map[string]string{
		"username": "founder", "email": "founder+ggd@example.com", "password": "correct-horse-founder",
	})
	require.Equal(t, http.StatusCreated, r.Status, string(r.Raw))
	id := r.Body["account"].(map[string]any)["id"].(string)

	// Complete: all three views of the account resolve to the same record.
	byID, err := ts.Srv.Accounts.GetByID(ctx, id)
	require.NoError(t, err)
	byName, err := ts.Srv.Accounts.GetByUsername(ctx, "founder")
	require.NoError(t, err, "a created account must be findable by username")
	byMail, err := ts.Srv.Accounts.GetByEmail(ctx, "founder+ggd@example.com")
	require.NoError(t, err, "a created account must be findable by email")
	assert.Equal(t, id, byName.ID)
	assert.Equal(t, id, byMail.ID)
	assert.Equal(t, []string{account.RoleAdmin}, byID.Roles)

	// And it can actually log in with either identifier.
	for _, ident := range []string{"founder", "founder+ggd@example.com"} {
		login := ts.Do(http.MethodPost, "/api/v1/auth/login", "",
			map[string]string{"username": ident, "password": "correct-horse-founder"})
		assert.Equal(t, http.StatusOK, login.Status, "login as %q: %s", ident, string(login.Raw))
	}

	ids, err := ts.Srv.Accounts.Admins(ctx)
	require.NoError(t, err)
	assert.Equal(t, []string{id}, ids, "exactly one admin, and it is the account that was created")
}

// auth-create-durable-uniqueness: username uniqueness must survive a Redis wipe.
//
// Uniqueness used to live only in the SETNX index. Flush Redis (or point the
// platform at a fresh one) and re-registering an existing username was accepted:
// Create overwrote accounts/by-username/<name>.json to point at the NEW account,
// so the original owner could no longer be resolved by name — they could not log
// in, and ADMIN_BOOTSTRAP_USERNAME would have rescued the impostor instead.
func TestUsernameUniquenessSurvivesARedisWipe(t *testing.T) {
	testkit.Cover(t, "auth-create-durable-uniqueness")
	ts := testutil.NewFreshDeploy(t)
	ctx := context.Background()

	owner := ts.Register("founder")
	ts.Mini.FlushAll() // the hot layer is rebuildable — the truth is on disk

	dup := ts.Do(http.MethodPost, "/api/v1/auth/register", "", map[string]string{
		"username": "founder", "email": "impostor@example.com", "password": "correct-horse-impostor",
	})
	assert.Equal(t, http.StatusConflict, dup.Status, "a duplicate username must be refused: %s", string(dup.Raw))

	// The name still resolves to the original account, which can still log in.
	resolved, err := ts.Srv.Accounts.GetByUsername(ctx, "founder")
	require.NoError(t, err)
	assert.Equal(t, owner.ID, resolved.ID, "the username must not have been repointed")

	login := ts.Do(http.MethodPost, "/api/v1/auth/login", "",
		map[string]string{"username": "founder", "password": "correct-horse-founder"})
	require.Equal(t, http.StatusOK, login.Status, string(login.Raw))
	assert.Equal(t, owner.ID, login.Body["account"].(map[string]any)["id"])

	// The email index is protected the same way.
	dupMail := ts.Do(http.MethodPost, "/api/v1/auth/register", "", map[string]string{
		"username": "otherguy", "email": "founder@example.com", "password": "correct-horse-other",
	})
	assert.Equal(t, http.StatusConflict, dupMail.Status, string(dupMail.Raw))

	admins, err := ts.Srv.Accounts.Admins(ctx)
	require.NoError(t, err)
	assert.Equal(t, []string{owner.ID}, admins)
}
