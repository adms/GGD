package gamelink_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/gamelink"
	"github.com/ggd/platform/internal/gamelink/gamelinktest"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// resultWithChampions is the standard 4-team result with the champion each
// human seat played attached, so the per-champion boards get credited.
func resultWithChampions(matchID string, host, guest testutil.User, hostChamp, guestChamp string) gamelink.ResultRequest {
	res := result(matchID, host, guest)
	for i := range res.Seats {
		switch res.Seats[i].AccountID {
		case host.ID:
			res.Seats[i].ChampionID = hostChamp
		case guest.ID:
			res.Seats[i].ChampionID = guestChamp
		}
	}
	return res
}

// TestSettlementAwardsPoints is the end-to-end award: one ranked result credits
// the visible PLAYER board and the (account, champion) board of every human
// seat by team placement, alongside the untouched hidden MMR ladder.
func TestSettlementAwardsPoints(t *testing.T) {
	testkit.Cover(t, "rank-points-settlement")
	ts := testutil.New(t)
	ctx := context.Background()
	host, guest, _, matchID := startMatch(ts)

	resp, err := gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret,
		resultWithChampions(matchID, host, guest, "sela", "thorne"), 0)
	require.NoError(t, err)
	resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	// Account JSON is the durable truth: host placed 1st, guest 2nd.
	//
	// ⛔ 這裡以前寫死 100 / 40。2026-08-17 之後名次分會吃真人倍率與宿敵加成
	// (owner:「MMR 倍率跟賽季積分也是類似的規則」),而那些倍率是 operator 每週會調的
	// 後台欄位 —— 把它們的乘積抄進斷言等於在測試裡開第四個住處,而且它會用錯誤的訊息紅
	// (「積分結算壞了」,真相是有人調了一格倍率)。守的是**機制**:名次有差、四個面
	// (帳號檔 / 玩家榜 / 英雄榜 / 結算紀錄)講的是同一個數字。
	hostAcc, err := ts.Srv.Accounts.GetByID(ctx, host.ID)
	require.NoError(t, err)
	guestAcc, err := ts.Srv.Accounts.GetByID(ctx, guest.ID)
	require.NoError(t, err)
	require.Greater(t, guestAcc.SeasonPoints, 0, "第二名也要拿到分")
	require.Greater(t, hostAcc.SeasonPoints, guestAcc.SeasonPoints, "第一名拿得比第二名多")
	require.Equal(t, hostAcc.SeasonPoints, hostAcc.ChampionPoints["sela"], "英雄榜與玩家榜同一次入帳")
	require.Equal(t, guestAcc.SeasonPoints, guestAcc.ChampionPoints["thorne"])

	// Both visible boards agree with the record.
	rows, total, err := ts.Srv.Ranking.PlayerPage(ctx, "", 20, 0)
	require.NoError(t, err)
	require.EqualValues(t, 2, total)
	require.Equal(t, host.ID, rows[0].AccountID)
	require.Equal(t, hostAcc.SeasonPoints, rows[0].Points)
	require.NotEmpty(t, rows[0].Tier)
	sela, _, err := ts.Srv.Ranking.ChampionPage(ctx, "sela", 20, 0)
	require.NoError(t, err)
	require.Len(t, sela, 1, "only the host played sela")
	require.Equal(t, hostAcc.ChampionPoints["sela"], sela[0].Points)
	thorne, _, err := ts.Srv.Ranking.ChampionPage(ctx, "thorne", 20, 0)
	require.NoError(t, err)
	require.Len(t, thorne, 1)
	require.Equal(t, guest.ID, thorne[0].AccountID)
	require.Equal(t, guestAcc.ChampionPoints["thorne"], thorne[0].Points)

	// The hidden MMR ladder still moved, independently of the points track.
	require.Greater(t, hostAcc.MMR, 1000)
	require.Less(t, guestAcc.MMR, 1000)

	// The settlement record carries the ABSOLUTE cumulative points so a Redis
	// wipe (or a WAL replay) recovers exactly.
	rec := readMatchRecord(t, ts, matchID)
	require.Equal(t, hostAcc.SeasonPoints, rec.Ratings[host.ID].Points)
	require.Equal(t, "sela", rec.Ratings[host.ID].ChampionID)
	require.Equal(t, hostAcc.ChampionPoints["sela"], rec.Ratings[host.ID].ChampionPoints)
	require.Equal(t, guestAcc.SeasonPoints, rec.Ratings[guest.ID].Points)
}

// TestPointsAccumulateAcrossMatches proves the ladder is CUMULATIVE (not
// zero-sum) across matches and floors at 0 after enough last places.
func TestPointsAccumulateAcrossMatches(t *testing.T) {
	testkit.Cover(t, "rank-points-cumulative")
	ts := testutil.New(t)
	ctx := context.Background()
	host, guest, _, matchID := startMatch(ts)

	// Match 1: host 1st, guest 2nd.
	resp, err := gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret,
		resultWithChampions(matchID, host, guest, "sela", "sela"), 0)
	require.NoError(t, err)
	resp.Body.Close()
	afterOne, err := ts.Srv.Accounts.GetByID(ctx, host.ID)
	require.NoError(t, err)

	// Match 2 (same seats, fresh matchId): host 1st again, guest 2nd again.
	res2 := resultWithChampions(matchID+"-2", host, guest, "sela", "sela")
	resp, err = gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret, res2, 0)
	require.NoError(t, err)
	resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	hostAcc, err := ts.Srv.Accounts.GetByID(ctx, host.ID)
	require.NoError(t, err)
	require.Greater(t, hostAcc.SeasonPoints, afterOne.SeasonPoints, "分數跨場累加,不是每場重算")
	require.Equal(t, hostAcc.SeasonPoints, hostAcc.ChampionPoints["sela"])
	guestAcc, err := ts.Srv.Accounts.GetByID(ctx, guest.ID)
	require.NoError(t, err)
	require.Greater(t, guestAcc.SeasonPoints, 0)

	// 連續墊底直到跌破 0:0 是地板,分數永遠不會是負的。
	//
	// ⛔ 次數不寫死(以前是 3 場,因為以前的分數剛好是 80)。第四名的懲罰**不吃**真人
	// 倍率(加成只作用在正的名次分上,見 ranking/standings.go),所以每一場就是原本那個
	// 負值 —— 需要幾場由「現在有多少分 ÷ 一場扣多少」推出來。
	drop := -ts.Srv.Ranking.Ladder().PlacementDelta(4)
	require.Greater(t, drop, 0, "夾具前提:最後一名要真的扣分,否則下面的地板測試是空的")
	for i := 0; i <= guestAcc.SeasonPoints/drop; i++ {
		res := resultWithChampions(fmt.Sprintf("%s-drop-%d", matchID, i), host, guest, "sela", "sela")
		// Flip placements: the guest's team finishes 4th.
		res.Placements = []gamelink.TeamPlace{{Team: 0, Place: 1}, {Team: 1, Place: 4}, {Team: 2, Place: 2}, {Team: 3, Place: 3}}
		resp, err := gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret, res, 0)
		require.NoError(t, err)
		resp.Body.Close()
	}
	guestAcc, err = ts.Srv.Accounts.GetByID(ctx, guest.ID)
	require.NoError(t, err)
	require.Equal(t, 0, guestAcc.SeasonPoints, "扣到負的會被夾在 0")
	require.Equal(t, 0, guestAcc.ChampionPoints["sela"])

	hostAcc, err = ts.Srv.Accounts.GetByID(ctx, host.ID)
	require.NoError(t, err)
	rows, _, err := ts.Srv.Ranking.PlayerPage(ctx, "", 20, 0)
	require.NoError(t, err)
	require.Equal(t, host.ID, rows[0].AccountID)
	require.Equal(t, hostAcc.SeasonPoints, rows[0].Points, "榜上的數字就是帳號檔裡的數字")
	require.Equal(t, guest.ID, rows[1].AccountID)
	require.Equal(t, 0, rows[1].Points)
	// 段位讀的是**分數推出來的**那一層。⛔ 不讀 rows[1].Tier:菁英/宗師是按**名次比例**
	// 發的(tiers.go 刻意的設計),而這個夾具現在會打到 MinApexGames 以上,兩個人的榜上
	// 連 0 分的那一位都會被冠上宗師 —— 那是 apex 規則,不是這一條要守的地板。
	// ⭐ GH#352（owner 2026-08-17:「沒分數不應該有位階，這是底線」）——
	// 0 分現在回「未定級」（空字串），⛔ 不是鐵 IV。這一條同時守住了上面那句註解
	// 提到的 apex 問題：0 分連 apex 的候選都進不去了。
	tier, div := ts.Srv.Ranking.Ladder().BaseTier(rows[1].Points)
	require.Equal(t, "", tier, "0 分不是最低位階,是還沒進榜")
	require.Equal(t, "", div)
}

// TestSettlementPointsIdempotent is the double-delivery regression: a duplicate
// callback (and a WAL-style re-apply of the stored settlement) awards points
// exactly once, because the record stores absolute cumulative values.
func TestSettlementPointsIdempotent(t *testing.T) {
	testkit.Cover(t, "rank-points-idempotent")
	ts := testutil.New(t)
	ctx := context.Background()
	host, guest, _, matchID := startMatch(ts)
	res := resultWithChampions(matchID, host, guest, "sela", "thorne")

	resp, err := gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret, res, 0)
	require.NoError(t, err)
	resp.Body.Close()
	// 第一次結算之後的絕對值 —— 後面兩次交付都要收斂回這個數字。
	// ⛔ 不寫死:守的是「不會重複入帳」,不是「入帳多少」。
	once, err := ts.Srv.Accounts.GetByID(ctx, host.ID)
	require.NoError(t, err)
	require.Greater(t, once.SeasonPoints, 0, "夾具前提:第一次結算真的有入帳")

	// Duplicate delivery of the same matchId: acknowledged, awards nothing.
	resp, err = gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret, res, 0)
	require.NoError(t, err)
	// map[string]any: the result ack also carries the numeric settled/humanSeats
	// counts (resultAck in callback.go).
	var body map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	resp.Body.Close()
	require.Equal(t, "duplicate", body["status"])

	hostAcc, err := ts.Srv.Accounts.GetByID(ctx, host.ID)
	require.NoError(t, err)
	require.Equal(t, once.SeasonPoints, hostAcc.SeasonPoints, "duplicate callback must not double-award")
	require.Equal(t, once.ChampionPoints["sela"], hostAcc.ChampionPoints["sela"])

	// WAL replay: re-applying the stored settlement converges on the same
	// absolute values instead of awarding a second time.
	require.NoError(t, ts.Srv.Journal.AppendIntent(matchID, readMatchRecord(t, ts, matchID)))
	require.NoError(t, ts.Srv.Boot(ctx))

	hostAcc, err = ts.Srv.Accounts.GetByID(ctx, host.ID)
	require.NoError(t, err)
	require.Equal(t, once.SeasonPoints, hostAcc.SeasonPoints, "replayed settlement must not double-award")
	require.Equal(t, once.ChampionPoints["sela"], hostAcc.ChampionPoints["sela"])
	rows, total, err := ts.Srv.Ranking.PlayerPage(ctx, "", 20, 0)
	require.NoError(t, err)
	require.EqualValues(t, 2, total)
	require.Equal(t, once.SeasonPoints, rows[0].Points)
	sela, _, err := ts.Srv.Ranking.ChampionPage(ctx, "sela", 20, 0)
	require.NoError(t, err)
	require.Equal(t, once.ChampionPoints["sela"], sela[0].Points, "champion board is idempotent too")

	// 對戰紀錄是**累加**式的,所以它是這一整條路上唯一有機會被重播算兩次的東西。
	h2h, err := ts.Srv.Ranking.HeadToHead(ctx, host.ID, guest.ID)
	require.NoError(t, err)
	require.Equal(t, 1, h2h.Wins, "重複交付 + WAL 重播之後,對戰紀錄仍然只有一勝")
}

// TestPointsSkipGuestsAndBots: only HUMAN, non-guest seats earn ladder points —
// the same rule the hidden MMR ladder uses.
func TestPointsSkipGuestsAndBots(t *testing.T) {
	testkit.Cover(t, "rank-points-guests-excluded")
	ts := testutil.New(t)
	ctx := context.Background()
	host, guest := ts.Register("host"), ts.Register("guest")

	r := ts.Do(http.MethodPost, "/api/v1/rooms", host.Access, map[string]string{"name": "Couch"})
	rid := r.Body["room"].(map[string]any)["id"].(string)
	require.Equal(t, http.StatusOK,
		ts.Do(http.MethodPatch, "/api/v1/rooms/"+rid+"/local-players", host.Access, map[string]int{"count": 2}).Status)
	ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/join", guest.Access, nil)
	ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/ready", guest.Access, map[string]bool{"ready": true})
	start := ts.Do(http.MethodPost, "/api/v1/rooms/"+rid+"/start", host.Access, nil)
	require.Equal(t, http.StatusOK, start.Status, string(start.Raw))
	matchID := start.Body["matchId"].(string)

	guestID := host.ID + ":p2" // couch-guest pseudo-id: no account, earns nothing
	res := gamelink.ResultRequest{
		MatchID: matchID, Mode: "PairedDuels", MapID: "arena-default",
		Placements: []gamelink.TeamPlace{{Team: 0, Place: 1}, {Team: 1, Place: 2}, {Team: 2, Place: 3}, {Team: 3, Place: 4}},
		Seats: []gamelink.ResultSeat{
			{AccountID: host.ID, Team: 0, ChampionID: "sela"},
			{AccountID: guestID, Team: 0, ChampionID: "sela"},
			{AccountID: guest.ID, Team: 1, ChampionID: "thorne"},
			{AccountID: "bot-02", Team: 0, IsBot: true, ChampionID: "sela"},
			{AccountID: "bot-04", Team: 1, IsBot: true}, {AccountID: "bot-05", Team: 1, IsBot: true},
			{AccountID: "bot-06", Team: 2, IsBot: true}, {AccountID: "bot-07", Team: 2, IsBot: true},
			{AccountID: "bot-08", Team: 2, IsBot: true}, {AccountID: "bot-09", Team: 3, IsBot: true},
			{AccountID: "bot-10", Team: 3, IsBot: true}, {AccountID: "bot-11", Team: 3, IsBot: true},
		},
		EndedAt: time.Now().UnixMilli(),
	}
	resp, err := gamelinktest.SendResult(ts.HTTP.URL, testutil.GameSecret, res, 0)
	require.NoError(t, err)
	resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	// The owner earns the placement award exactly once — not once per couch seat.
	// ⛔ 不寫死數字(名次分現在會吃真人倍率):守的是「入帳一次」,而沙發客那一個座位
	// 沒有自己的紀錄列。
	hostAcc, err := ts.Srv.Accounts.GetByID(ctx, host.ID)
	require.NoError(t, err)
	require.GreaterOrEqual(t, hostAcc.SeasonPoints, ts.Srv.Ranking.Ladder().PlacementDelta(1))
	require.Equal(t, hostAcc.SeasonPoints, hostAcc.ChampionPoints["sela"], "一次入帳,兩個榜同一個值")
	require.Equal(t, hostAcc.SeasonPoints, readMatchRecord(t, ts, matchID).Ratings[host.ID].Points)

	// 沙發客推高全場真人數,但他沒有帳號 ⇒ ⛔ 沒有自己的對戰紀錄列。
	guestSeatH2H, err := ts.Srv.Ranking.HeadToHead(ctx, host.ID, guestID)
	require.NoError(t, err)
	require.Equal(t, 0, guestSeatH2H.Played(), "沙發客沒有帳號,不會有對戰紀錄")
	realH2H, err := ts.Srv.Ranking.HeadToHead(ctx, host.ID, guest.ID)
	require.NoError(t, err)
	require.Equal(t, 1, realH2H.Wins, "有帳號的那一位對手才進紀錄")

	// Neither the guest pseudo-id nor any bot reaches either board.
	rows, total, err := ts.Srv.Ranking.PlayerPage(ctx, "", 50, 0)
	require.NoError(t, err)
	require.EqualValues(t, 2, total, "two accounts on the board: the two humans")
	for _, row := range rows {
		require.NotContains(t, row.AccountID, ":p", "couch guests earn no ladder points")
		require.False(t, strings.HasPrefix(row.AccountID, "bot-"), "bots earn no ladder points")
	}
	sela, _, err := ts.Srv.Ranking.ChampionPage(ctx, "sela", 50, 0)
	require.NoError(t, err)
	require.Len(t, sela, 1, "the guest's and the bot's sela seats credit nobody")
	require.Equal(t, host.ID, sela[0].AccountID)
}
