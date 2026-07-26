package auth_test

import (
	"os"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// THE STRUCTURAL HALF of task #237.
//
// referral_mirror_test.go proves the four account-bearing responses that exist
// TODAY tell the truth. It cannot prove anything about the fifth one somebody
// adds next month — and "somebody added a response that reads the raw stored
// field" is exactly how this bug arrived: #203 introduced the mirrored field and
// every existing reader silently started returning stale data.
//
// So the rule is enforced on the source, the same way hudLayout.test.ts scans
// its owners' files: inside internal/auth's HTTP layer, an account reaches the
// wire through auth.Service.PublicAccount (which reconciles the derived half
// against the invite store) and never through account.Account.Public() directly.
// The failure message names the fix rather than just the violation.
func TestHandlersNeverProjectAnAccountWithoutReconcilingIt(t *testing.T) {
	src, err := os.ReadFile("handlers.go")
	require.NoError(t, err)

	// `.Public()` on anything, EXCEPT as part of `svc.PublicAccount(`. The two
	// cannot be confused: PublicAccount is a different identifier, so a plain
	// regexp for the bare projection is exact.
	bare := regexp.MustCompile(`\.Public\(\)`)
	var offenders []string
	for i, line := range strings.Split(string(src), "\n") {
		if bare.MatchString(line) {
			offenders = append(offenders, strings.TrimSpace(line)+"  (handlers.go:"+strconv.Itoa(i+1)+")")
		}
	}
	assert.Empty(t, offenders,
		"an auth handler projects an account with account.Public() instead of "+
			"h.svc.PublicAccount(ctx, a). Public() is a pure struct copy: it cannot reach the "+
			"invite store, so it returns the account's STORED referral code even after a friend "+
			"burned it — task #237. Route it through PublicAccount.\n  %s",
		strings.Join(offenders, "\n  "))

	// …and the choke point is really used, so the assertion above cannot pass by
	// the handlers having stopped returning accounts at all.
	assert.GreaterOrEqual(t, strings.Count(string(src), "h.svc.PublicAccount("), 4,
		"register, login, device-poll and /me all return an account; each must go through PublicAccount")
}
