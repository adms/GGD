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
			delta := KFor(p.Games) * perTeamDelta
			out[p.AccountID] = int(math.Round(float64(p.MMR) + delta))
		}
	}
	return out
}
