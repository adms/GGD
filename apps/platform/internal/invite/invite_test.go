package invite

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/pkg/testkit"
)

func newSvc(t *testing.T) *Service {
	t.Helper()
	st, err := jsonstore.New(t.TempDir())
	require.NoError(t, err)
	return New(st)
}

func mintOne(t *testing.T, s *Service, note string) string {
	t.Helper()
	rows, err := s.Mint(context.Background(), "admin-1", note, 1, 14)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	return rows[0].Code
}

// A code must survive being read aloud and retyped: case, spaces, hyphens and
// the full-width forms a phone IME produces all normalise to the same id.
func TestNormalizeToleratesHowHumansRetypeACode(t *testing.T) {
	s := newSvc(t)
	code := mintOne(t, s, "媽媽") // GGD-XXXX-XXXX
	canonical := Normalize(code)
	require.NotEmpty(t, canonical)
	require.Len(t, canonical, 11)

	body := canonical[3:]
	for _, variant := range []string{
		strings.ToLower(code),
		strings.ReplaceAll(code, "-", " "),
		strings.ReplaceAll(code, "-", ""),
		"  " + code + "  ",
		"ggd " + body[:4] + " " + body[4:],
	} {
		assert.Equal(t, canonical, Normalize(variant), "variant %q", variant)
	}

	// Anything that is not the minted shape normalises to "" and is answered
	// without ever touching the store.
	for _, bad := range []string{"", "GGD", "GGD-1234-5678" /* 0/1 not in the alphabet */, "ABC-7K2M-9QXA", canonical + "X"} {
		assert.Equal(t, "", Normalize(bad), "expected reject: %q", bad)
	}
}

// THE RACE. Two family members paste the same single-use code at the same
// instant: exactly one redemption may succeed, and the document must end up
// attributed to that one.
func TestConcurrentRedemptionBurnsTheCodeExactlyOnce(t *testing.T) {
	testkit.Cover(t, "invite-redeem-race")
	s := newSvc(t)
	code := mintOne(t, s, "雙胞胎")

	const racers = 24
	var wg sync.WaitGroup
	start := make(chan struct{})
	errs := make([]error, racers)
	for i := 0; i < racers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			errs[i] = s.Redeem(context.Background(), code, accountIDFor(i), "user")
		}(i)
	}
	close(start)
	wg.Wait()

	winners := []int{}
	for i, err := range errs {
		if err == nil {
			winners = append(winners, i)
			continue
		}
		assert.Same(t, ErrUsed, err, "a loser must be told the code is spent, got %v", err)
	}
	require.Len(t, winners, 1, "exactly one racer may burn a single-use code")

	doc, err := s.get(Normalize(code))
	require.NoError(t, err)
	assert.Equal(t, StatusRedeemed, doc.Status)
	assert.Equal(t, accountIDFor(winners[0]), doc.RedeemedBy, "the document must name the racer that won")
}

func accountIDFor(i int) string { return "acct-" + string(rune('A'+i%26)) + string(rune('0'+i/26)) }

// Every rejection reason, and the exact amount each one discloses.
func TestRedeemRejectionReasons(t *testing.T) {
	testkit.Cover(t, "invite-reject-reasons")
	s := newSvc(t)
	ctx := context.Background()

	t.Run("no code at all", func(t *testing.T) {
		assert.Same(t, ErrRequired, s.Redeem(ctx, "   ", "a1", "u"))
	})
	t.Run("unknown code", func(t *testing.T) {
		assert.Same(t, ErrInvalid, s.Redeem(ctx, "GGD-2345-6789", "a1", "u"))
	})
	t.Run("malformed code never touches the store", func(t *testing.T) {
		assert.Same(t, ErrInvalid, s.Redeem(ctx, "not-a-code", "a1", "u"))
	})
	t.Run("already used", func(t *testing.T) {
		code := mintOne(t, s, "哥哥")
		require.NoError(t, s.Redeem(ctx, code, "a1", "u1"))
		assert.Same(t, ErrUsed, s.Redeem(ctx, code, "a2", "u2"))
	})
	t.Run("revoked reads exactly like unknown", func(t *testing.T) {
		code := mintOne(t, s, "取消的")
		_, err := s.Revoke(ctx, "admin-1", code)
		require.NoError(t, err)
		assert.Same(t, ErrInvalid, s.Redeem(ctx, code, "a3", "u3"))
	})
	t.Run("expired reads exactly like unknown", func(t *testing.T) {
		code := mintOne(t, s, "過期的")
		s.SetNow(func() time.Time { return time.Now().AddDate(0, 0, 15) })
		defer s.SetNow(time.Now)
		assert.Same(t, ErrInvalid, s.Redeem(ctx, code, "a4", "u4"))
	})
}

// Release gives a code back ONLY to the registration that burned it — a stale
// or hostile rollback can never resurrect somebody else's spent code.
func TestReleaseIsCompareAndSetOnTheRedeemer(t *testing.T) {
	s := newSvc(t)
	ctx := context.Background()
	code := mintOne(t, s, "退回")
	require.NoError(t, s.Redeem(ctx, code, "acct-1", "u1"))

	require.NoError(t, s.Release(ctx, code, "acct-OTHER"))
	doc, err := s.get(Normalize(code))
	require.NoError(t, err)
	assert.Equal(t, StatusRedeemed, doc.Status, "somebody else's rollback must not un-burn the code")
	assert.Equal(t, "acct-1", doc.RedeemedBy)

	require.NoError(t, s.Release(ctx, code, "acct-1"))
	doc, err = s.get(Normalize(code))
	require.NoError(t, err)
	assert.Equal(t, StatusActive, doc.Status)
	assert.Empty(t, doc.RedeemedBy)
	require.NoError(t, s.Redeem(ctx, code, "acct-2", "u2"), "a released code is usable again")
}

// A redeemed code is the durable record of who got in — revoking it would erase
// that, so it is refused.
func TestRevokeRules(t *testing.T) {
	s := newSvc(t)
	ctx := context.Background()

	code := mintOne(t, s, "未使用")
	row, err := s.Revoke(ctx, "admin-1", code)
	require.NoError(t, err)
	assert.Equal(t, StatusRevoked, row.Status)
	_, err = s.Revoke(ctx, "admin-1", code)
	assert.Error(t, err, "revoking twice is a conflict, not a silent no-op")

	used := mintOne(t, s, "已使用")
	require.NoError(t, s.Redeem(ctx, used, "acct-9", "u9"))
	_, err = s.Revoke(ctx, "admin-1", used)
	assert.Error(t, err, "a redeemed code must not be revocable")

	_, err = s.Revoke(ctx, "admin-1", "GGD-2345-6789")
	assert.Error(t, err)
}

func TestMintValidation(t *testing.T) {
	s := newSvc(t)
	ctx := context.Background()

	_, err := s.Mint(ctx, "admin-1", "   ", 1, 14)
	assert.Error(t, err, "備註 is required — a list of random strings is useless without it")
	_, err = s.Mint(ctx, "admin-1", strings.Repeat("あ", MaxNoteRunes+1), 1, 14)
	assert.Error(t, err)
	_, err = s.Mint(ctx, "admin-1", "ok", MaxBatch+1, 14)
	assert.Error(t, err)
	_, err = s.Mint(ctx, "admin-1", "ok", 1, MaxTTLDays+1)
	assert.Error(t, err)

	rows, err := s.Mint(ctx, "admin-1", "十二個親戚", 12, 0)
	require.NoError(t, err)
	require.Len(t, rows, 12, "one action mints the whole batch")
	seen := map[string]bool{}
	for _, r := range rows {
		assert.False(t, seen[r.Code], "codes must be unique: %s", r.Code)
		seen[r.Code] = true
		assert.Equal(t, StatusActive, r.EffectiveStatus)
		// default TTL applied when ttlDays is omitted
		assert.WithinDuration(t, r.CreatedAt.AddDate(0, 0, DefaultTTLDays), r.ExpiresAt, time.Second)
	}
	all, err := s.List(ctx)
	require.NoError(t, err)
	assert.Len(t, all, 12)
}
