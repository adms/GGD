package gamelink_test

// standings_test.go —— 「MMR／賽季積分也吃真人倍率 + 真實的對戰紀錄」的承重守衛
// (owner 2026-08-17)。
//
// ⛔ 這裡**沒有任何出貨數字**。倍率與加成的每一格都是 operator 要調的,而它們已經有
// 三個住處 + drift 守衛在守。這個檔案守的是**機制**:
//   ① 打 bot 不加成  ② 兩個真人分屬敵對兩隊也算數  ③ 紀錄的鍵是對稱的
//   ④ ⭐ 重複贏同一個人,加成會遞減(這是「互相餵分」的唯一閘)

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/gamelink"
	"github.com/ggd/platform/internal/ranking"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

func pointsOf(t *testing.T, ts *testutil.TS, accountID string) int {
	t.Helper()
	p, err := ts.Srv.Accounts.GetByID(context.Background(), accountID)
	require.NoError(t, err)
	return p.SeasonPoints
}

// TestStandingsScaleWithTheWholeLobby 是 ①②:vs bot 那一場的名次分**沒有**被放大,
// 而同一組人分屬敵對兩隊時被放大了。分界線跟水晶那條完全一樣(整場 lobby 的真人數,
// ⛔ 不分隊)。
func TestStandingsScaleWithTheWholeLobby(t *testing.T) {
	testkit.Cover(t, "standings-human-multiplier")
	ts := testutil.New(t)
	solo, duoA, duoB := ts.Register("solo"), ts.Register("duoa"), ts.Register("duob")

	// ① 一個真人 + 十一隻 bot:倍率 1。
	settle(t, ts, lobby("m-solo-std", botsFilling(
		[]gamelink.ResultSeat{{AccountID: solo.ID, Team: 0}}, 11)))
	base := pointsOf(t, ts, solo.ID)

	// ② 兩個真人,**分屬敵對兩隊**,其餘全是 bot。第一名拿到的名次分必須比 ① 多。
	settle(t, ts, lobby("m-duo-std", botsFilling([]gamelink.ResultSeat{
		{AccountID: duoA.ID, Team: 0}, // place 1
		{AccountID: duoB.ID, Team: 1}, // place 2 —— 敵隊
	}, 10)))

	rules := ranking.DefaultStandingsRules()
	require.Greater(t, rules.SeasonPointsMulPct(rules.MaxMultiplier), 100,
		"夾具前提:出貨設定必須真的會放大名次分,否則下面那條斷言對壞掉的實作也會過")
	require.Greater(t, pointsOf(t, ts, duoA.ID), base,
		"同樣的第一名,lobby 裡有第二個真人就該拿得比獨自打 bot 多 —— 「獎勵大家多打真人賽」。"+
			"⛔ 兩人分屬敵對隊伍也算,分界線是整場的真人數")
	require.Equal(t, base, pointsOf(t, ts, solo.ID),
		"打 bot 那一場不受影響:倍率 1 就是原本的名次分")
}

// TestHeadToHeadIsOneSymmetricRow 是 ③:一場對戰只寫**一列**,而且兩個方向讀得到
// 同一列(A 1 勝 ⇔ B 1 敗)。存兩份會漂的列是這個功能唯一真正的失敗形態。
func TestHeadToHeadIsOneSymmetricRow(t *testing.T) {
	testkit.Cover(t, "head-to-head-symmetric-key")
	ts := testutil.New(t)
	alice, bob := ts.Register("alice"), ts.Register("bob")

	settle(t, ts, lobby("m-h2h", botsFilling([]gamelink.ResultSeat{
		{AccountID: alice.ID, Team: 0}, // place 1
		{AccountID: bob.ID, Team: 1},   // place 2
	}, 10)))

	ctx := context.Background()
	ab, err := ts.Srv.Ranking.HeadToHead(ctx, alice.ID, bob.ID)
	require.NoError(t, err)
	require.Equal(t, [2]int{1, 0}, [2]int{ab.Wins, ab.Losses}, "名次高的算贏")

	ba, err := ts.Srv.Ranking.HeadToHead(ctx, bob.ID, alice.ID)
	require.NoError(t, err)
	require.Equal(t, [2]int{0, 1}, [2]int{ba.Wins, ba.Losses},
		"(B,A) 必須讀到**同一列**的另一面 —— 鍵是排序後正規化的,⛔ 沒有第二份可以漂")

	// 同一場再送一次(WAL 重播的形狀)不可以重複累加。
	require.NoError(t, ts.Srv.Ranking.RecordHeadToHead(ctx, "m-h2h", alice.ID, bob.ID, ab.LastAt))
	again, err := ts.Srv.Ranking.HeadToHead(ctx, alice.ID, bob.ID)
	require.NoError(t, err)
	require.Equal(t, ab.Wins, again.Wins, "同一個 matchId 是冪等的:紀錄是累加式的,重播不可以算兩次")
}

// TestRivalryBonusDecaysOnRepeatWins 是 ④,⭐ 不可省:兩個帳號互相餵分的閘。
// A 一直贏 B,第 N 場的宿敵加成必須**嚴格小於**第 1 場。
//
// 這一條直接打規則的純函式,⛔ 不繞一整場結算:它驗的是那條算式的單調性,而不是
// 某一個出貨數字。
func TestRivalryBonusDecaysOnRepeatWins(t *testing.T) {
	testkit.Cover(t, "rivalry-anti-farm-decay")
	r := ranking.DefaultStandingsRules()

	first := r.RivalryBonusPct(ranking.H2H{})
	require.Greater(t, first, 0, "初次交手要拿得到宿敵加成,否則下面的遞減是空的")

	prev := first
	for n := 1; n <= 10; n++ {
		got := r.RivalryBonusPct(ranking.H2H{Wins: n})
		require.LessOrEqual(t, got, prev, "連勝同一個人,加成只能往下,⛔ 不可以回頭")
		prev = got
	}
	require.Less(t, prev, first,
		"⭐ 反刷分:輾壓同一個對手十場之後的加成必須嚴格小於第一場,否則兩個帳號互相餵分是無本生意")

	// 輪流贏(淨勝停在 0 附近)也要被擋 —— 那是「互相餵分」最自然的玩法,
	// 而擋住它的是**重複對戰次數**那一項,不是淨勝那一項。
	require.Less(t, r.RivalryBonusPct(ranking.H2H{Wins: 10, Losses: 10}), first,
		"⭐ 輪流讓對方贏會讓淨勝永遠是 0;擋住它的是「這一對打過幾場」那個遞減項")

	// ⭐ 2026-08-17 改寫：這裡原本斷言「贏一個過去壓著你打的對手加成更高」，
	// 而那條規則**已經被刻意換掉**（見 ranking/standings.go 檔頭）——
	// 舊版把「誰是弱勢」寫進加成本身，加成只掛贏家 ⇒ A 贏的比 B 輸的多 ⇒
	// 這一對可以無中生有製造 MMR，而重複項只能讓它變慢、擋不住「先刻意輸十場」。
	//
	// 新的性質是**對稱**：同一對的兩邊拿到同一個加成（`|淨勝|`），
	// 所以那一對的 Elo 變動零和，串通只能搬分不能造分。
	// 「誰該多拿」交給 Elo 自己的期望值項 —— ⛔ 不在這一支函式裡。
	require.Equal(t, r.RivalryBonusPct(ranking.H2H{Losses: 2}), r.RivalryBonusPct(ranking.H2H{Wins: 2}),
		"⭐ 反刷分的承重線：加成對一對的兩邊必須相同,否則這一對就能製造分數")
	require.Less(t, r.RivalryBonusPct(ranking.H2H{Losses: 5}), r.RivalryBonusPct(ranking.H2H{Losses: 1}),
		"一面倒的宿敵不值錢(owner:「欺負弱小並不值得」);勢均力敵的才是滿的")
}
