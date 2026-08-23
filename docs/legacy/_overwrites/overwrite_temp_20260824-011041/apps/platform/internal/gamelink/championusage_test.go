package gamelink

// GH#645 的薄守衛 —— 一條承重線：英雄榜從耐久對戰紀錄聚合、以被選用次數
// 排序（owner 2026-08-24 的排序鍵），勝率附帶；bot 席位與 abandoned 不算。
// 突變驗證：把 aggregate 的排序比較子 Picks> 改成 < → 紅（順序反轉）。

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
	// m1: hero-a (human, team 1, wins) vs hero-b (human) — plus a BOT on
	// hero-a whose seat must not count as a pick.
	put(Settlement{MatchID: "m1", Status: "completed", EndedAt: ended,
		Placements: []TeamPlace{{Team: 1, Place: 1}, {Team: 2, Place: 2}},
		Seats: []ResultSeat{
			{AccountID: "A", Team: 1, ChampionID: "hero-a"},
			{AccountID: "B", Team: 2, ChampionID: "hero-b"},
			{AccountID: "bot1", Team: 2, IsBot: true, ChampionID: "hero-a"},
		}})
	// m2 (a different YYYY/MM partition): hero-b picked again and wins.
	put(Settlement{MatchID: "m2", Status: "completed", EndedAt: ended.AddDate(0, -1, 0),
		Placements: []TeamPlace{{Team: 1, Place: 1}, {Team: 2, Place: 2}},
		Seats: []ResultSeat{
			{AccountID: "A", Team: 1, ChampionID: "hero-b"},
			{AccountID: "B", Team: 2, ChampionID: "hero-a"},
		}})
	// m3: abandoned — no trustworthy places, must not touch picks OR winrate.
	put(Settlement{MatchID: "m3", Status: "abandoned", EndedAt: ended,
		Seats: []ResultSeat{{AccountID: "A", Team: 1, ChampionID: "hero-c"}}})

	rows, err := NewChampionUsage(store).Rows()
	require.NoError(t, err)
	// hero-b: 2 picks 1 win leads the board (sort key = picks, NOT winrate —
	// hero-a's 100% must not outrank hero-b's 2 picks). hero-c never appears.
	require.Equal(t, []ChampionUsageRow{
		{ChampionID: "hero-b", Picks: 2, Wins: 1, WinRate: 0.5},
		{ChampionID: "hero-a", Picks: 2, Wins: 1, WinRate: 0.5},
	}[:1][0], rows[0])
	require.Len(t, rows, 2)
	require.Equal(t, ChampionUsageRow{ChampionID: "hero-a", Picks: 2, Wins: 1, WinRate: 0.5}, rows[1])
}
