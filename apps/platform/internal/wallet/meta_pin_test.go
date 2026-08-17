package wallet_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	walletpkg "github.com/ggd/platform/internal/wallet"
	"github.com/ggd/platform/pkg/testkit"
)

// ── THE OWNER'S RULINGS ON THE 藍水晶 PAYOUT, IN ORDER ────────────────────────
//
// This file exists because the payout numbers look mathematically wrong to
// anyone who re-derives them, and they will keep looking wrong. The defence is
// not a comment — comments lose to a confident rebalancing pass — it is this
// test, which fails and QUOTES THE RULING at whoever moved them.
//
// 2026-08-01 (SUPERSEDED). Grants were 240/90/70/60, and gamelink HALVED them
// for any seat whose own team held a bot:
//
//	「全部玩家位置都真人才有 M幣；如果是自己隊伍 3 人都是真人那可以拿水晶，
//	  若有 bot 只能拿一半水晶」
//
// plus, on the rate itself:「藍水晶本來就是獎勵 有人抱怨我們再來改」.
//
// 2026-08-17 (CURRENT). The per-team halving is GONE, replaced by a whole-lobby
// multiplier:
//
//	「只要有兩真人(N≥2)參加，不論哪個陣營都可以，所有玩家都 (N+1) 倍，
//	  所以最大 13 倍」
//	「120 × 13 (MAX)、120 × 3 (N=2)、120 (N=1)」
//
// The base table was folded down to the values a bot lobby was ALREADY being
// paid (240/2, 90/2, 70/2, 60/2), so soloing bots pays exactly what it paid
// yesterday — that is the owner's 「120 (N=1)」 — while a lobby with people in it
// now multiplies instead of merely escaping a penalty. The old per-team rule
// punished two friends who drew opposite teams; the new one cannot, because it
// never asks which team you are on.
//
// WHAT THIS TEST DOES NOT DO. It does not claim the numbers are balanced, and it
// is not a reason to avoid retuning. When the owner says the word: change the
// values AND this test in the same commit, and ADD THE NEW RULING ABOVE rather
// than overwriting the old one — the history is the point. What must not happen
// is the numbers drifting because a spreadsheet said so.
const ownerRuling = "「只要有兩真人(N≥2)參加，不論哪個陣營都可以，所有玩家都 (N+1) 倍，所以最大 13 倍」"

func TestCrystalGrantsAreTheOwnersDecision(t *testing.T) {
	testkit.Cover(t, "opsenv-wallet-playrate")

	const explain = "\n\nThis is not drift — it is the owner's explicit ruling (2026-08-17): " + ownerRuling +
		"\n(see the balance model at the top of internal/wallet/meta.go). If the owner has since " +
		"decided otherwise, change the constant AND this test together and record the new ruling " +
		"in that comment. Do not silently cut a reward."

	// The 吃雞 doubling is structural: first place is base x multiplier, so a
	// retune of the base carries the win bonus with it instead of the two
	// drifting apart. Pin both the shape and the product.
	assert.Equalf(t, 2, walletpkg.CrystalWinMultiplier,
		"CrystalWinMultiplier is the 吃雞 double the owner asked for "+
			"(「如果是該場次吃雞，水晶則 2 倍領取」).%s", explain)
	assert.Equalf(t, 120, walletpkg.CrystalPlace1,
		"first place must grant 120 藍水晶 at the x1 (solo-vs-bot) floor — the owner named this "+
			"number himself: 「120 (N=1)」.%s", explain)
	assert.Equalf(t, 45, walletpkg.CrystalPlace2, "second place must grant 45 藍水晶.%s", explain)
	assert.Equalf(t, 35, walletpkg.CrystalPlace3, "third place must grant 35 藍水晶.%s", explain)
	assert.Equalf(t, 30, walletpkg.CrystalPlace4, "fourth place must grant 30 藍水晶.%s", explain)

	// The three multiplier knobs, quoted straight out of the ruling.
	assert.Equalf(t, 2, walletpkg.DefaultCrystalMinHumans,
		"the multiplier starts at TWO humans (「只要有兩真人(N≥2)參加」).%s", explain)
	assert.Equalf(t, 1, walletpkg.DefaultCrystalOffset,
		"the multiplier is N PLUS ONE (「所有玩家都 (N+1) 倍」).%s", explain)
	assert.Equalf(t, 13, walletpkg.DefaultCrystalMaxMultiplier,
		"the ceiling is THIRTEEN (「所以最大 13 倍」 = a full 12-human lobby).%s", explain)

	// The owner wrote three worked examples. They are the acceptance criteria,
	// so they are asserted as he wrote them: 120 x 13 (MAX), 120 x 3 (N=2), 120.
	rules := walletpkg.DefaultCrystalRules()
	for _, c := range []struct{ humans, want int }{{1, 120}, {2, 360}, {12, 1560}} {
		got := rules.RewardFor(1) * walletpkg.CrystalMultiplier(c.humans, rules)
		assert.Equalf(t, c.want, got,
			"with %d human(s) in the lobby, first place must take home %d 藍水晶 — the owner wrote "+
				"this row out himself (「120 × 13 (MAX)、120 × 3 (N=2)、120 (N=1)」).%s",
			c.humans, c.want, explain)
	}

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
	for place, want := range map[int]int{1: 120, 2: 45, 3: 35, 4: 30} {
		assert.Equalf(t, want, walletpkg.CrystalRewardFor(place),
			"CrystalRewardFor(%d) is the base gamelink/callback.go multiplies at settlement.%s",
			place, explain)
	}

	// Placement 0 is "unknown/absent", not "first" — the zero value of an int
	// must never fall through to a grant.
	for _, place := range []int{0, -1, 5, 99} {
		assert.Zerof(t, walletpkg.CrystalRewardFor(place),
			"an unknown placement (%d) must grant nothing; a zero-value int falling through to a "+
				"payout is a minting hole, not a rounding error", place)
	}

	// The ordering contract the comment states in prose: strictly descending and
	// every place positive. If a retune ever inverts these, "placement matters"
	// and "last place still earns" both stop being true.
	places := []int{walletpkg.CrystalPlace1, walletpkg.CrystalPlace2, walletpkg.CrystalPlace3, walletpkg.CrystalPlace4}
	for i := 1; i < len(places); i++ {
		assert.Greaterf(t, places[i-1], places[i],
			"place %d must out-earn place %d — the spread is what makes placement matter", i, i+1)
	}
	for i, v := range places {
		require.Positivef(t, v, "place %d must earn something: 「水晶（打場免費賺）」 is free THROUGH "+
			"PLAY, not through winning", i+1)
	}
}
