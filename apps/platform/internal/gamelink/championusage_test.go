package gamelink

// GH#645 的薄守衛 —— 一條承重線：英雄榜從耐久對戰紀錄聚合、以被選用次數
// 排序（owner 2026-08-24 的排序鍵，⛔ 不是勝率），勝率附帶；bot 席位與
// abandoned 不算。夾具刻意讓「選最多」的英雄勝率最低 —— 按勝率排的實作
// 會把順序排反。突變驗證：aggregate 排序比較子 Picks > 改成 < → 紅。

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/data/jsonstore"
)

func TestChampionUsageBoard(t *testing.T) {
	store, err := jsonstore.New(t.TempDir())
	require.NoError(t, err)
	ended := time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC)
	put := func(st Settlement) {
		require.NoError(t, store.Put(MatchCollection(st.EndedAt), st.MatchID, st))
	}
	// m1: hero-a (human, wins) vs hero-b (human, loses) — plus a BOT on
	// hero-a whose seat must not count as a pick.
	put(Settlement{MatchID: "m1", Status: "completed", EndedAt: ended,
		Placements: []TeamPlace{{Team: 1, Place: 1}, {Team: 2, Place: 2}},
		Seats: []ResultSeat{
			{AccountID: "A", Team: 1, ChampionID: "hero-a"},
			{AccountID: "B", Team: 2, ChampionID: "hero-b"},
			{AccountID: "bot1", Team: 2, IsBot: true, ChampionID: "hero-a"},
		}})
	// m2 (a different YYYY/MM partition): a hero-b mirror — 2 more picks, 1 win.
	put(Settlement{MatchID: "m2", Status: "completed", EndedAt: ended.AddDate(0, -1, 0),
		Placements: []TeamPlace{{Team: 1, Place: 1}, {Team: 2, Place: 2}},
		Seats: []ResultSeat{
			{AccountID: "A", Team: 1, ChampionID: "hero-b"},
			{AccountID: "B", Team: 2, ChampionID: "hero-b"},
		}})
	// m3: abandoned — no trustworthy places, must not touch picks OR winrate.
	put(Settlement{MatchID: "m3", Status: "abandoned", EndedAt: ended,
		Seats: []ResultSeat{{AccountID: "A", Team: 1, ChampionID: "hero-c"}}})

	rows, err := NewChampionUsage(store).Rows()
	require.NoError(t, err)
	// hero-b (3 picks, 33% winrate) outranks hero-a (1 pick, 100% winrate):
	// the sort key is picks. hero-c (abandoned) never appears; the bot seat
	// did not inflate hero-a.
	require.Equal(t, []ChampionUsageRow{
		{ChampionID: "hero-b", Picks: 3, Wins: 1, WinRate: 1.0 / 3.0},
		{ChampionID: "hero-a", Picks: 1, Wins: 1, WinRate: 1},
	}, rows)
}
