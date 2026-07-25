// Package approvelink white-box tests: the token model (#209) is the entire
// security of the click-to-approve link, so its four properties — signed,
// bound, expiring, single-use — plus the prefetch-safety split are proven here
// against the real Signer/Service, with the two external seams (the "set
// approved" approver and the single-use store) faked so the test needs no Redis.
package approvelink

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/redisx"
)

const testSecret = "test-approve-link-hmac-secret-value"

// ---- fakes ------------------------------------------------------------------

// memConsumer is an in-memory single-use store (the token model's Consumer),
// so single-use is proven without Redis. Its Consume is atomic under the mutex,
// mirroring Redis SETNX.
type memConsumer struct {
	mu   sync.Mutex
	used map[string]bool
}

func newMemConsumer() *memConsumer { return &memConsumer{used: map[string]bool{}} }

func (m *memConsumer) Consume(_ context.Context, key string, _ time.Duration) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.used[key] {
		return false, nil
	}
	m.used[key] = true
	return true, nil
}

func (m *memConsumer) Consumed(_ context.Context, key string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.used[key], nil
}

// fakeApprover records every SetApprovalFromLink call so a test can assert the
// "set approved" seam was (or was NOT) reached, and how.
type approveCall struct{ id, status, reason string }

type fakeApprover struct {
	mu    sync.Mutex
	calls []approveCall
	err   error
}

func (f *fakeApprover) SetApprovalFromLink(_ context.Context, id, status, reason string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.err != nil {
		return f.err
	}
	f.calls = append(f.calls, approveCall{id, status, reason})
	return nil
}

func (f *fakeApprover) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.calls)
}

// fakeAccounts is the read side.
type fakeAccounts struct{ accts map[string]account.Account }

func (f fakeAccounts) GetByID(_ context.Context, id string) (account.Account, error) {
	a, ok := f.accts[id]
	if !ok {
		return account.Account{}, account.ErrNotFound
	}
	return a, nil
}

// newTestService builds a Service with the two external seams faked and an
// in-memory single-use store, so Confirm/Act run with no Redis and no HTTP.
func newTestService(t *testing.T, accts map[string]account.Account) (*Service, *fakeApprover, *memConsumer) {
	t.Helper()
	store, err := jsonstore.New(t.TempDir())
	require.NoError(t, err)
	approver := &fakeApprover{}
	svc := New(store, redisx.New("127.0.0.1:0", ""), []byte(testSecret), approver,
		fakeAccounts{accts: accts}, Options{PublicURL: "https://ggd.example"})
	mem := newMemConsumer()
	svc.SetConsumer(mem)
	return svc, approver, mem
}

func pending(id, name string) account.Account {
	return account.Account{ID: id, Username: name, Email: name + "@ex.com", Status: account.StatusPending}
}

// ---- SIGNED + BOUND ---------------------------------------------------------

func TestSignVerifyRoundTrip(t *testing.T) {
	s := NewSigner([]byte(testSecret), 0)
	tok, err := s.Sign("acct-123", ActionApprove)
	require.NoError(t, err)

	claims, err := s.Verify(tok)
	require.NoError(t, err)
	assert.Equal(t, "acct-123", claims.AccountID)
	assert.Equal(t, ActionApprove, claims.Action)
	assert.NotEmpty(t, claims.consumeKey, "the single-use key must be derived")
	assert.NotEmpty(t, claims.Nonce)
}

func TestTwoTokensForSameAccountDiffer(t *testing.T) {
	// The nonce makes each mint unique, so approve and reject links (and two
	// approve links) have distinct single-use identities.
	s := NewSigner([]byte(testSecret), 0)
	a, err := s.Sign("acct-1", ActionApprove)
	require.NoError(t, err)
	b, err := s.Sign("acct-1", ActionApprove)
	require.NoError(t, err)
	assert.NotEqual(t, a, b, "two mints for the same account must differ (nonce)")

	ca, _ := s.Verify(a)
	cb, _ := s.Verify(b)
	assert.NotEqual(t, ca.consumeKey, cb.consumeKey, "distinct tokens must have distinct consume keys")
}

func TestSignRejectsBadAction(t *testing.T) {
	s := NewSigner([]byte(testSecret), 0)
	_, err := s.Sign("acct-1", "deleteEverything")
	require.Error(t, err)
}

func TestVerifyRejectsTamperedPayload(t *testing.T) {
	s := NewSigner([]byte(testSecret), 0)
	tok, err := s.Sign("victim", ActionApprove)
	require.NoError(t, err)

	// Flip the last byte of the base64url payload (before the '.').
	dot := strings.IndexByte(tok, '.')
	require.Positive(t, dot)
	b := []byte(tok)
	if b[dot-1] == 'A' {
		b[dot-1] = 'B'
	} else {
		b[dot-1] = 'A'
	}
	_, err = s.Verify(string(b))
	require.Error(t, err, "a tampered payload must not verify")
}

func TestVerifyRejectsForeignSecret(t *testing.T) {
	minter := NewSigner([]byte(testSecret), 0)
	tok, err := minter.Sign("acct-1", ActionApprove)
	require.NoError(t, err)

	attacker := NewSigner([]byte("a-completely-different-secret-value"), 0)
	_, err = attacker.Verify(tok)
	assert.ErrorIs(t, err, ErrBadSignature, "a token signed with another secret must be rejected")
}

func TestVerifyRejectsGarbage(t *testing.T) {
	s := NewSigner([]byte(testSecret), 0)
	for _, bad := range []string{"", "nodot", ".", "a.", ".b", "not-base64!.also!", "onlyonepart"} {
		_, err := s.Verify(bad)
		assert.Error(t, err, "garbage token %q must be rejected", bad)
	}
}

// ---- EXPIRING ---------------------------------------------------------------

func TestVerifyRejectsExpired(t *testing.T) {
	s := NewSigner([]byte(testSecret), 48*time.Hour)
	base := time.Now()
	s.now = func() time.Time { return base }
	tok, err := s.Sign("acct-1", ActionApprove)
	require.NoError(t, err)

	// Still valid at +47h.
	s.now = func() time.Time { return base.Add(47 * time.Hour) }
	_, err = s.Verify(tok)
	require.NoError(t, err, "a token inside its TTL must verify")

	// Expired at +49h.
	s.now = func() time.Time { return base.Add(49 * time.Hour) }
	_, err = s.Verify(tok)
	assert.ErrorIs(t, err, ErrExpiredToken, "a token past its TTL must be rejected")
}

func TestVerifyRejectsFutureDated(t *testing.T) {
	s := NewSigner([]byte(testSecret), 48*time.Hour)
	base := time.Now()
	// Mint 10 minutes in the future (well beyond the clock skew).
	s.now = func() time.Time { return base.Add(10 * time.Minute) }
	tok, err := s.Sign("acct-1", ActionApprove)
	require.NoError(t, err)

	s.now = func() time.Time { return base }
	_, err = s.Verify(tok)
	assert.ErrorIs(t, err, ErrExpiredToken, "a future-dated token must be rejected")
}

// ---- SINGLE-USE + PREFETCH SAFETY -------------------------------------------

// TestPrefetchSafetyGetHasNoSideEffect is the load-bearing property: a GET
// (Confirm) — which Slack and every link scanner perform automatically — must
// NOT approve anyone and must NOT spend the token. Only the human POST (Act)
// does. This is the whole reason the endpoint is split.
func TestPrefetchSafetyGetHasNoSideEffect(t *testing.T) {
	id := "acct-cousin"
	svc, approver, mem := newTestService(t, map[string]account.Account{id: pending(id, "cousin")})
	tok, err := svc.signer.Sign(id, ActionApprove)
	require.NoError(t, err)
	ctx := context.Background()

	// A prefetch bot GETs the link — potentially many times.
	for i := 0; i < 3; i++ {
		v, err := svc.Confirm(ctx, tok)
		require.NoError(t, err)
		assert.False(t, v.Done, "the confirm view must still offer the button")
		assert.Equal(t, "cousin", v.Username)
	}
	// NOTHING happened: no approval, token not consumed.
	assert.Zero(t, approver.count(), "GET/Confirm must NOT approve anyone")
	consumed, _ := mem.Consumed(ctx, mustKey(t, svc, tok))
	assert.False(t, consumed, "GET/Confirm must NOT consume the token")

	// The human POSTs. NOW it applies.
	res, err := svc.Act(ctx, tok)
	require.NoError(t, err)
	assert.Equal(t, account.StatusApproved, res.Status)
	require.Equal(t, 1, approver.count(), "POST/Act must approve exactly once")
	assert.Equal(t, id, approver.calls[0].id)
	assert.Equal(t, account.StatusApproved, approver.calls[0].status)
}

// TestSingleUse: a second POST of the same token is refused and does NOT
// re-apply — a leaked/forwarded link cannot be replayed.
func TestSingleUse(t *testing.T) {
	id := "acct-1"
	svc, approver, _ := newTestService(t, map[string]account.Account{id: pending(id, "cousin")})
	tok, err := svc.signer.Sign(id, ActionApprove)
	require.NoError(t, err)
	ctx := context.Background()

	_, err = svc.Act(ctx, tok)
	require.NoError(t, err)

	_, err = svc.Act(ctx, tok)
	assert.ErrorIs(t, err, ErrTokenUsed, "replaying a used token must be refused")
	assert.Equal(t, 1, approver.count(), "the decision must have run at most once")

	// And a later GET reports it as already used (no button).
	v, err := svc.Confirm(ctx, tok)
	require.NoError(t, err)
	assert.True(t, v.Done, "a consumed token's confirm page must not offer the button")
	assert.Contains(t, v.DoneMsg, "used")
}

func TestActReject(t *testing.T) {
	id := "acct-bad"
	svc, approver, _ := newTestService(t, map[string]account.Account{id: pending(id, "stranger")})
	tok, err := svc.signer.Sign(id, ActionReject)
	require.NoError(t, err)

	res, err := svc.Act(context.Background(), tok)
	require.NoError(t, err)
	assert.Equal(t, account.StatusDenied, res.Status)
	require.Equal(t, 1, approver.count())
	assert.Equal(t, account.StatusDenied, approver.calls[0].status)
}

func TestConfirmReflectsAlreadyDecided(t *testing.T) {
	id := "acct-done"
	svc, _, _ := newTestService(t, map[string]account.Account{
		id: {ID: id, Username: "already", Status: account.StatusApproved},
	})
	tok, err := svc.signer.Sign(id, ActionApprove)
	require.NoError(t, err)

	v, err := svc.Confirm(context.Background(), tok)
	require.NoError(t, err)
	assert.True(t, v.Done, "an already-approved account needs no action")
	assert.Contains(t, v.DoneMsg, "approved")
}

func TestConfirmUnknownAccount(t *testing.T) {
	svc, _, _ := newTestService(t, map[string]account.Account{})
	tok, err := svc.signer.Sign("ghost", ActionApprove)
	require.NoError(t, err)
	_, err = svc.Confirm(context.Background(), tok)
	assert.ErrorIs(t, err, account.ErrNotFound)
}

// mustKey re-derives a token's single-use key the way the service does, for the
// no-side-effect assertion.
func mustKey(t *testing.T, svc *Service, token string) string {
	t.Helper()
	claims, err := svc.signer.Verify(token)
	require.NoError(t, err)
	return claims.consumeKey
}
