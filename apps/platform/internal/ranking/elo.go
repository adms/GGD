// Package ranking implements Elo rating, the Redis leaderboard ZSET and the
// durable snapshot fallback.
package ranking

import "math"

// K factors: provisional accounts (<30 games) move faster.
const (
	KProvisional     = 32.0
	KSettled         = 24.0
	ProvisionalGames = 30
)

// KFor returns the K factor for an account with the given games played.
func KFor(games int) float64 {
	if games < ProvisionalGames {
		return KProvisional
	}
	return KSettled
}

// PlayerRating is one human's pre-match rating.
type PlayerRating struct {
	AccountID string
	MMR       int
	Games     int
	// KMulPct 是這一場專屬的 K 值百分比乘數（100 = 不動），由結算路徑算出來：
	// 真人倍率（打折過）加上宿敵加成，見 standings.go。
	//
	// ⭐ 0 也是「不動」。既有的呼叫端（後台工具、測試、AwardPlacement）不知道這一格
	// 存在，它們建出來的零值必須是**現狀行為** —— 否則加上這個欄位的那一刻，每一條
	// 不經過結算的路徑都會把 K 變成 0，而 MMR 從此再也不會動，且沒有任何東西會紅。
	KMulPct int
}

// kScale 把 KMulPct 翻成倍數。0（未設定）與負值都當成 1。
func (p PlayerRating) kScale() float64 {
	if p.KMulPct <= 0 {
		return 1
	}
	return float64(p.KMulPct) / 100
}

// TeamResult is one team's outcome: Place 1 is best. Bots carry no players.
type TeamResult struct {
	Team    int
	Place   int
	Players []PlayerRating
}

func teamAvg(t TeamResult) float64 {
	if len(t.Players) == 0 {
		return 0
	}
	sum := 0.0
	for _, p := range t.Players {
		sum += float64(p.MMR)
	}
	return sum / float64(len(t.Players))
}

func expected(a, b float64) float64 {
	return 1.0 / (1.0 + math.Pow(10, (b-a)/400.0))
}

// ComputeElo generalizes Elo to N teams: every pair of teams with human
// players is compared avg-vs-avg; each player's delta is
// K(player) * Σ_j (S_ij − E_ij) / (T−1), applied per player. The returned map
// holds ABSOLUTE post-match MMR per accountID (bots excluded).
func ComputeElo(teams []TeamResult) map[string]int {
	// Only teams with human players participate in rating math.
	rated := make([]TeamResult, 0, len(teams))
	for _, t := range teams {
		if len(t.Players) > 0 {
			rated = append(rated, t)
		}
	}
	out := map[string]int{}
	if len(rated) < 2 {
		for _, t := range rated {
			for _, p := range t.Players {
				out[p.AccountID] = p.MMR
			}
		}
		return out
	}
	n := float64(len(rated) - 1)
	for i, ti := range rated {
		avgI := teamAvg(ti)
		sum := 0.0
		for j, tj := range rated {
			if i == j {
				continue
			}
			e := expected(avgI, teamAvg(tj))
			var s float64
			switch {
			case ti.Place < tj.Place:
				s = 1
			case ti.Place == tj.Place:
				s = 0.5
			default:
				s = 0
			}
			sum += s - e
		}
		perTeamDelta := sum / n
		for _, p := range ti.Players {
			delta := KFor(p.Games) * p.kScale() * perTeamDelta
			out[p.AccountID] = int(math.Round(float64(p.MMR) + delta))
		}
	}
	return out
}
