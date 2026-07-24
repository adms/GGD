package gamelink_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/gamelink"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// The platform is the SOURCE OF TRUTH for what an account may select (task
// #201): it computes free ∪ unlocked and ships that set to the game-server,
// which enforces it authoritatively at champ-select. These two tests cover the
// derivation rule and its end-to-end propagation onto the match-create request.

func TestPlayableChampions(t *testing.T) {
	testkit.Cover(t, "seam-playable-champions")
	free := []string{"sela", "thorne"}

	// A nil owned slice = an unseeded account. It yields EXACTLY the free set —
	// the #130 floor: a brand-new account is never handed an empty roster.
	require.Equal(t, []string{"sela", "thorne"}, gamelink.PlayableChampions(free, nil))

	// free ∪ unlocked, sorted and de-duplicated. A champion in NEITHER list (a
	// priced champion the account has not bought) is simply absent — that is the
	// "locked" exclusion the game-server then enforces.
	require.Equal(t, []string{"sela", "thorne", "vex"},
		gamelink.PlayableChampions(free, []string{"vex", "sela"}))

	// Duplicates and empty ids are dropped; the result is stable/sorted.
	require.Equal(t, []string{"sela", "thorne", "vex"},
		gamelink.PlayableChampions(free, []string{"vex", "", "vex"}))

	// A champion the account does NOT own and that is NOT free never appears.
	require.NotContains(t, gamelink.PlayableChampions(free, nil), "vex")
}

// TestStartMatchStampsOwnership drives the real reservation path and asserts the
// outbound match-create request carries each HUMAN seat's playable set and that
// BOTS carry none (unenforced). The content fixture prices vex at 900 while
// sela/thorne are free, so a fresh account's owned set is exactly the free
// roster and the locked champion vex is absent — the wire proof that a locked
// champion is never offered to the game-server as selectable.
func TestStartMatchStampsOwnership(t *testing.T) {
	testkit.Cover(t, "seam-ownership-stamp")
	ts := testutil.New(t)
	startMatch(ts)

	reqs := ts.Node.Requests()
	require.Len(t, reqs, 1)
	seats := reqs[0].Seats
	require.Len(t, seats, 12)

	humans := 0
	for _, s := range seats {
		if s.IsBot {
			require.Nil(t, s.Owned, "a bot seat carries no ownership (fail-open / unenforced)")
			continue
		}
		humans++
		// Fresh accounts own exactly the free starter roster; the priced champion
		// vex is NOT owned and MUST be absent from the set the server enforces.
		require.Equal(t, []string{"sela", "thorne"}, s.Owned,
			"a human seat is stamped with the account's playable (free ∪ unlocked) set")
		require.NotContains(t, s.Owned, "vex", "a locked champion is never in the wire owned set")
	}
	require.Equal(t, 2, humans, "host + guest")
}
