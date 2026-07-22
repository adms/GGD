package friend_test

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/friend"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

func loadDoc(t *testing.T, dataDir, id string) friend.Doc {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(dataDir, "friends", id+".json"))
	require.NoError(t, err)
	var d friend.Doc
	require.NoError(t, json.Unmarshal(data, &d))
	return d
}

func TestRequestSend(t *testing.T) {
	testkit.Cover(t, "friend-request-send")
	ts := testutil.New(t)
	a, b := ts.Register("alice"), ts.Register("bob")

	r := ts.Do(http.MethodPost, "/api/v1/friends/requests", a.Access, map[string]string{"username": "bob"})
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))

	// Durable truth: outgoing on A, incoming on B.
	da, db := loadDoc(t, ts.Cfg.DataDir, a.ID), loadDoc(t, ts.Cfg.DataDir, b.ID)
	require.Contains(t, da.Outgoing, b.ID)
	require.Contains(t, db.Incoming, a.ID)

	// Visible over the API for the target.
	lst := ts.Do(http.MethodGet, "/api/v1/friends", b.Access, nil)
	require.Equal(t, http.StatusOK, lst.Status)
	incoming := lst.Body["incoming"].([]any)
	require.Len(t, incoming, 1)
}

func TestAcceptBidirectional(t *testing.T) {
	testkit.Cover(t, "friend-accept-bidirectional")
	ts := testutil.New(t)
	a, b := ts.Register("alice"), ts.Register("bob")
	ts.Do(http.MethodPost, "/api/v1/friends/requests", a.Access, map[string]string{"username": "bob"})

	r := ts.Do(http.MethodPost, "/api/v1/friends/requests/"+a.ID+"/accept", b.Access, nil)
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))

	// Write-through BOTH files.
	da, db := loadDoc(t, ts.Cfg.DataDir, a.ID), loadDoc(t, ts.Cfg.DataDir, b.ID)
	require.Contains(t, da.Friends, b.ID)
	require.Contains(t, db.Friends, a.ID)
	require.Empty(t, da.Outgoing)
	require.Empty(t, db.Incoming)
}

func TestDecline(t *testing.T) {
	testkit.Cover(t, "friend-decline")
	ts := testutil.New(t)
	a, b := ts.Register("alice"), ts.Register("bob")
	ts.Do(http.MethodPost, "/api/v1/friends/requests", a.Access, map[string]string{"username": "bob"})

	r := ts.Do(http.MethodPost, "/api/v1/friends/requests/"+a.ID+"/decline", b.Access, nil)
	require.Equal(t, http.StatusOK, r.Status)
	da, db := loadDoc(t, ts.Cfg.DataDir, a.ID), loadDoc(t, ts.Cfg.DataDir, b.ID)
	require.Empty(t, da.Outgoing)
	require.Empty(t, db.Incoming)
	require.Empty(t, da.Friends)
	require.Empty(t, db.Friends)
}

func TestRemoveBidirectional(t *testing.T) {
	testkit.Cover(t, "friend-remove-bidirectional")
	ts := testutil.New(t)
	a, b := ts.Register("alice"), ts.Register("bob")
	ts.Do(http.MethodPost, "/api/v1/friends/requests", a.Access, map[string]string{"username": "bob"})
	ts.Do(http.MethodPost, "/api/v1/friends/requests/"+a.ID+"/accept", b.Access, nil)

	r := ts.Do(http.MethodDelete, "/api/v1/friends/"+b.ID, a.Access, nil)
	require.Equal(t, http.StatusOK, r.Status)
	da, db := loadDoc(t, ts.Cfg.DataDir, a.ID), loadDoc(t, ts.Cfg.DataDir, b.ID)
	require.Empty(t, da.Friends, "removed on the actor side")
	require.Empty(t, db.Friends, "removed on the other side too")
}

func TestBlockPreventsRequests(t *testing.T) {
	testkit.Cover(t, "friend-block")
	ts := testutil.New(t)
	a, b := ts.Register("alice"), ts.Register("bob")

	r := ts.Do(http.MethodPost, "/api/v1/friends/"+b.ID+"/block", a.Access, nil)
	require.Equal(t, http.StatusOK, r.Status, string(r.Raw))

	// B can no longer send a request to A.
	r = ts.Do(http.MethodPost, "/api/v1/friends/requests", b.Access, map[string]string{"username": "alice"})
	require.Equal(t, http.StatusForbidden, r.Status)
	da := loadDoc(t, ts.Cfg.DataDir, a.ID)
	require.Contains(t, da.Blocked, b.ID)
	require.Empty(t, da.Incoming)
}

func TestSelfFriendRejected(t *testing.T) {
	testkit.Cover(t, "friend-self-reject")
	ts := testutil.New(t)
	a := ts.Register("alice")
	r := ts.Do(http.MethodPost, "/api/v1/friends/requests", a.Access, map[string]string{"username": "alice"})
	require.Equal(t, http.StatusBadRequest, r.Status)
}

func TestRequestDedupe(t *testing.T) {
	testkit.Cover(t, "friend-request-dedupe")
	ts := testutil.New(t)
	a, b := ts.Register("alice"), ts.Register("bob")
	for i := 0; i < 3; i++ {
		r := ts.Do(http.MethodPost, "/api/v1/friends/requests", a.Access, map[string]string{"username": "bob"})
		require.Equal(t, http.StatusOK, r.Status, "resends are idempotent")
	}
	db := loadDoc(t, ts.Cfg.DataDir, b.ID)
	require.Len(t, db.Incoming, 1, "exactly one pending request")

	// Also idempotent once already friends.
	ts.Do(http.MethodPost, "/api/v1/friends/requests/"+a.ID+"/accept", b.Access, nil)
	r := ts.Do(http.MethodPost, "/api/v1/friends/requests", a.Access, map[string]string{"username": "bob"})
	require.Equal(t, http.StatusOK, r.Status)
	db = loadDoc(t, ts.Cfg.DataDir, b.ID)
	require.Empty(t, db.Incoming)
	require.Contains(t, db.Friends, a.ID)
}

// TestIDORProtection: the acting account always comes from the token; C
// cannot accept/decline/remove on behalf of B, and unauthenticated calls are
// rejected outright.
func TestIDORProtection(t *testing.T) {
	testkit.Cover(t, "friend-authz-idor")
	ts := testutil.New(t)
	a, b := ts.Register("alice"), ts.Register("bob")
	mallory := ts.Register("mallory")
	ts.Do(http.MethodPost, "/api/v1/friends/requests", a.Access, map[string]string{"username": "bob"})

	// Mallory tries to accept A→B's request as herself: there is no request
	// addressed to her, so this must fail and B's state must be untouched.
	r := ts.Do(http.MethodPost, "/api/v1/friends/requests/"+a.ID+"/accept", mallory.Access, nil)
	require.Equal(t, http.StatusNotFound, r.Status)
	db := loadDoc(t, ts.Cfg.DataDir, b.ID)
	require.Contains(t, db.Incoming, a.ID, "B's pending request is untouched")
	require.Empty(t, db.Friends)

	// Mallory cannot remove A's friendship either.
	ts.Do(http.MethodPost, "/api/v1/friends/requests/"+a.ID+"/accept", b.Access, nil)
	r = ts.Do(http.MethodDelete, "/api/v1/friends/"+b.ID, mallory.Access, nil)
	require.Equal(t, http.StatusNotFound, r.Status)
	da := loadDoc(t, ts.Cfg.DataDir, a.ID)
	require.Contains(t, da.Friends, b.ID, "A/B friendship survives")

	// No token at all → 401.
	r = ts.Do(http.MethodGet, "/api/v1/friends", "", nil)
	require.Equal(t, http.StatusUnauthorized, r.Status)
}

// TestConcurrentMutations hammers accept/remove/request across goroutines and
// asserts both files stay valid JSON and mutually consistent (regression for
// the two-file write-through under the keyed locks).
func TestConcurrentMutations(t *testing.T) {
	testkit.Cover(t, "friend-concurrency")
	ts := testutil.New(t)
	svc := ts.Srv.Friends
	ctx := context.Background()

	a, b := ts.Register("alice"), ts.Register("bob")
	var wg sync.WaitGroup
	for i := 0; i < 25; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = svc.Request(ctx, a.ID, b.ID)
			_ = svc.Accept(ctx, b.ID, a.ID)
			_ = svc.Remove(ctx, a.ID, b.ID)
		}()
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = svc.Request(ctx, b.ID, a.ID)
			_ = svc.Remove(ctx, b.ID, a.ID)
		}()
	}
	done := make(chan struct{})
	go func() { wg.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(30 * time.Second):
		t.Fatal("deadlock in concurrent friend mutations")
	}

	// Files parse and are symmetric: A has B as friend iff B has A.
	da, db := loadDoc(t, ts.Cfg.DataDir, a.ID), loadDoc(t, ts.Cfg.DataDir, b.ID)
	_, aHasB := da.Friends[b.ID]
	_, bHasA := db.Friends[a.ID]
	require.Equal(t, aHasB, bHasA, "friendship must be symmetric after the dust settles")
	// Requests must also be mirrored.
	_, aOut := da.Outgoing[b.ID]
	_, bIn := db.Incoming[a.ID]
	require.Equal(t, aOut, bIn, "A→B request mirrored")
}
