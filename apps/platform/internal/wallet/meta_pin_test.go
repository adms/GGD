package wallet_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	walletpkg "github.com/ggd/platform/internal/wallet"
	"github.com/ggd/platform/pkg/testkit"
)

// ownerRuling is the owner's standing decision on the 藍水晶 payout rate, quoted
// verbatim so it travels with the failure message rather than living only in a
// task description nobody will find.
const ownerRuling = "「藍水晶本來就是獎勵 有人抱怨我們再來改」"

// TestCrystalGrantsAreTheOwnersDecision.
//
// WHY A TEST AND NOT JUST A COMMENT (#250). The per-match 藍水晶 grants look
// mathematically wrong to anyone who checks them, and they will keep looking
// wrong. #118 tuned 120/90/70/60 against a ~25-minute match; the 吃雞 doubling
// took first place to 240; then #132 and #153 cut the round down (combatMaxSec
// 240 -> 100, fireRing.startSec 180 -> 60, champ-select 40s -> 20s) so a match
// is now ~21 minutes. The grants did not move with it. Anybody re-deriving the
// economy from first principles lands on "these pay out roughly twice as fast
// as designed — cut them", and the arithmetic backing that conclusion is
// CORRECT. What it is missing is that the owner has already seen it and ruled:
//
//	「藍水晶本來就是獎勵 有人抱怨我們再來改」
//
// 藍水晶 is a REWARD, not a throttle. The faster payout is the intended feel
// until a player actually complains. A comment cannot defend that against a
// confident rebalancing pass, and the behavioural suites next door
// (gamelink/crystal_test.go and friends) all assert against these same
// constants — so lowering the constants moves the expectations with them and
// every one of those tests stays green. Nothing in the repo would notice the
// owner's decision being reversed.
//
// This test is the thing that notices. It pins the LITERAL values, so a
// rebalance has to delete an explicit owner ruling on purpose rather than
// discover it by accident.
//
// WHAT IT DOES NOT DO. It does not claim these numbers are balanced, and it is
// not a reason to avoid retuning. When the owner says the word: change the
// constants AND change this test in the same commit, and put the new ruling in
// this comment. A test that is edited deliberately, with the reason written
// down, is exactly what this is for. What must not happen is the numbers
// drifting because a spreadsheet said so.
func TestCrystalGrantsAreTheOwnersDecision(t *testing.T) {
	testkit.Cover(t, "opsenv-wallet-playrate")

	const explain = "\n\nThis is not drift — it is the owner's explicit ruling: " + ownerRuling +
		"\n(see the balance model at the top of internal/wallet/meta.go). If the owner has since " +
		"decided otherwise, change the constant AND this test together and record the new ruling " +
		"in that comment. Do not silently cut a reward."

	// The 吃雞 doubling is structural: first place is base x multiplier, so a
	// retune of the base carries the win bonus with it instead of the two
	// drifting apart. Pin both the shape and the product.
	assert.Equalf(t, 2, walletpkg.CrystalWinMultiplier,
		"CrystalWinMultiplier is the 吃雞 double the owner asked for "+
			"(「如果是該場次吃雞，水晶則 2 倍領取」).%s", explain)
	assert.Equalf(t, 240, walletpkg.CrystalPlace1,
		"first place must still grant 240 藍水晶 (120 base x 2 for 吃雞).%s", explain)
	assert.Equalf(t, 90, walletpkg.CrystalPlace2, "second place must still grant 90 藍水晶.%s", explain)
	assert.Equalf(t, 70, walletpkg.CrystalPlace3, "third place must still grant 70 藍水晶.%s", explain)
	assert.Equalf(t, 60, walletpkg.CrystalPlace4, "fourth place must still grant 60 藍水晶.%s", explain)

	// The one M幣 a 吃雞 earns, and the unlock cost the client mirrors. Both are
	// on the same "do not quietly retune" footing: MCoinWinGrant was already
	// cut once from a 200/120/80/50 table that contradicted #118's premise, and
	// CrystalUnlockCost is the denominator that decides what every grant above
	// is WORTH — halving the grants and halving the cost would leave every
	// per-place assertion green while changing nothing the owner agreed to.
	assert.Equalf(t, 1, walletpkg.MCoinWinGrant,
		"MCoinWinGrant is ONE coin, first place only (「並且可以領到 1 枚 M幣」).%s", explain)
	assert.Equalf(t, 300, walletpkg.CrystalUnlockCost,
		"CrystalUnlockCost is the price the grants are measured against, and the client mirrors "+
			"it in its 「解鎖 (N 水晶)」 label (apps/client/src/ui/panels/champselect/walletMeta.ts). "+
			"Moving it re-prices every grant above without touching one of them.%s", explain)

	// The lookup the settlement path actually calls must return those same
	// values — pinning the constants alone would not catch the map being
	// rewired, and gamelink/callback.go reaches the economy ONLY through here.
	for place, want := range map[int]int{1: 240, 2: 90, 3: 70, 4: 60} {
		assert.Equalf(t, want, walletpkg.CrystalRewardFor(place),
			"CrystalRewardFor(%d) is what gamelink/callback.go credits at settlement.%s",
			place, explain)
	}

	// Placement 0 is "unknown/absent", not "first" — the zero value of an int
	// must never fall through to a grant.
	for _, place := range []int{0, -1, 5, 99} {
		assert.Zerof(t, walletpkg.CrystalRewardFor(place),
			"an unknown placement (%d) must grant nothing; a zero-value int falling through to a "+
				"payout is a minting hole, not a rounding error", place)
	}

	// The ordering contract the comment states in prose: strictly descending,
	// every place positive, and still positive after gamelink's integer halving
	// for a bot-assisted team. If a retune ever inverts these, "placement
	// matters" and "last place still earns" both stop being true.
	places := []int{walletpkg.CrystalPlace1, walletpkg.CrystalPlace2, walletpkg.CrystalPlace3, walletpkg.CrystalPlace4}
	for i := 1; i < len(places); i++ {
		assert.Greaterf(t, places[i-1], places[i],
			"place %d must out-earn place %d — the spread is what makes placement matter", i, i+1)
	}
	for i, v := range places {
		require.Positivef(t, v, "place %d must earn something: 「水晶（打場免費賺）」 is free THROUGH "+
			"PLAY, not through winning", i+1)
		assert.Positivef(t, v/2, "place %d must still earn something after gamelink/callback.go "+
			"halves the grant for a bot-assisted team (integer division rounds down)", i+1)
	}
}
