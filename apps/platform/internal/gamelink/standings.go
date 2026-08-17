package gamelink

// standings.go —— 結算時把「真人倍率」與「宿敵加成」算出來（owner 2026-08-17）。
//
//	「**MMR 倍率跟賽季積分也是類似的規則**，獎勵大家多打真人賽，
//	  並且**真實記錄 vs 特定玩家的幾勝幾敗**來影響 MMR & 賽季積分」
//
// 這個檔案只負責**算**，不負責寫：
//   - 規則與它的取捨（為什麼積分吃滿倍率而 MMR 只吃一小部分、宿敵加成怎麼擋刷分）
//     住在 internal/ranking/standings.go 的檔頭。
//   - 對戰紀錄的**寫入**在 settle.go 的 Apply（跟其他持久化寫在一起，冪等）。
//
// ⭐ 真人數 → 倍率那條算式**沒有**在這裡重打：它只有一個家，就是
// wallet.CrystalMultiplier。這裡把 ranking 的三格參數餵給同一支函式，所以水晶與
// 排名永遠是「同一條規則、不同一組參數」，而不是兩份會漂的算式。

import (
	"context"
	"log/slog"

	"github.com/ggd/platform/internal/ranking"
	"github.com/ggd/platform/internal/wallet"
)

// standingsSeat 是結算迴圈收集起來、要算加成的一個**有帳號的真人座位**。
// bot、沙發客、以及沒有帳號檔的座位都不會進來。
type standingsSeat struct {
	AccountID string
	Team      int
	Place     int
}

// standingsAward 是一個座位這一場拿到的兩個百分比乘數。
type standingsAward struct {
	// PointsPct 作用在**正的**名次分上（賽季積分與英雄積分共用）。
	PointsPct int
	// KMulPct 作用在 Elo 的 K 值上。
	KMulPct int
	// RivalryPct 是宿敵加成本身，留著給結算日誌，讓「這一場為什麼多給」看得見。
	RivalryPct int
}

// humanMultiplier 是 owner 的那條規則，⛔ 不重打：借 wallet 那一支唯一的實作，
// 只換一組參數（排名的三格與經濟的三格是分開的欄位）。
func humanMultiplier(humans int, sr ranking.StandingsRules) int {
	return wallet.CrystalMultiplier(humans, wallet.CrystalRules{
		MinHumans: sr.MinHumans, Offset: sr.Offset, MaxMultiplier: sr.MaxMultiplier,
	})
}

// standingsAwards 算出每一個真人座位的加成。
//
// 宿敵加成讀的是這一場**之前**的對戰紀錄（Apply 才會把這一場寫進去），所以同一場裡
// 每一對的加成都是拿賽前狀態算的 —— ⛔ 不會出現「先寫再讀」把自己這一場也算進去
// 的偏差。
func (s *Service) standingsAwards(ctx context.Context, sr ranking.StandingsRules,
	humans int, seats []standingsSeat) map[string]standingsAward {

	mult := humanMultiplier(humans, sr)
	pointsBase := sr.SeasonPointsMulPct(mult)

	out := make(map[string]standingsAward, len(seats))
	for _, me := range seats {
		faced := []ranking.H2H{}
		for _, other := range seats {
			// 同隊不算（沒有勝負）。⚠️ 名次**不再**過濾：見下面的對稱性註解。
			if other.AccountID == me.AccountID || other.Team == me.Team {
				continue
			}
			prior, err := s.rank.HeadToHead(ctx, me.AccountID, other.AccountID)
			if err != nil {
				// 讀不到一對紀錄不值得賠掉整場結算：這一對就沒有宿敵加成。
				slog.Warn("gamelink: 讀不到對戰紀錄 —— 這一對沒有宿敵加成",
					"me", me.AccountID, "opponent", other.AccountID, "err", err)
				continue
			}
			faced = append(faced, prior)
		}
		// ⭐ 2026-08-17：收集的是**交手過的每一個對手**，⛔ 不再是「我贏的那些」。
		// 這一行看起來只是放寬一個條件，實際上是刷分漏洞的修補點：
		//   舊：加成只掛在贏家 ⇒ A 贏的 > B 輸的 ⇒ 這一對可以無中生有製造 MMR。
		//   新：一對的兩邊拿到同一個加成 ⇒ 那一對的 Elo 變動零和 ⇒ 串通只能搬分。
		// 「誰該多拿」不是靠這裡決定的 —— Elo 的期望值項本來就會把分給以小博大的
		// 那一邊（見 ranking/standings.go 檔頭）。
		// ⛔ 不要因為「輸的人不該拿加成」而把 me.Place >= other.Place 加回來：
		// 賽季積分那一半已經由 AwardPointsScaled 只乘正的名次分擋掉了，而 K 值那一半
		// 加回去就等於把漏洞裝回去，且畫面上完全看不出來。
		rivalry := sr.RivalryTotalPct(faced)
		out[me.AccountID] = standingsAward{
			PointsPct:  pointsBase * (100 + rivalry) / 100,
			KMulPct:    sr.RatingKMulPct(humans, mult, rivalry),
			RivalryPct: rivalry,
		}
	}
	return out
}

// awardOf 讀出一個座位的加成。未登記的座位一律「不動」（100%）—— ⛔ 不是零值,
// 零會被 AwardPointsScaled 當成「別乘」而剛好沒事,卻會把 Elo 的 K 值歸零。
func awardOf(awards map[string]standingsAward, accountID string) standingsAward {
	if a, ok := awards[accountID]; ok {
		return a
	}
	return standingsAward{PointsPct: 100, KMulPct: 100}
}
