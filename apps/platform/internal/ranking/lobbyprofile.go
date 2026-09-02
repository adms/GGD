package ranking

import "context"

// LobbyProfile implements room.LobbyProfiles (GH#915).
//
// ⭐⭐ **它回的是 `PointsRow` 已經對外的那三格**（`Username` / `Tier` / `Division`）
// —— ⛔ 不是一份新的投影。理由：房間列表是**登入後可見的公開清單**，
// ⇒ ⭐ 「什麼可以出現在上面」這個問題**已經被排行榜回答過了**，
// ⛔ 而回答第二次就是給自己一次答錯的機會。
//
// ⚠️ 每一個錯誤都回 `ok=false`（⛔ 不是 error）：大廳輪詢很頻繁，而一個
// 查不到牌位的帳號**不該讓整個大廳壞掉** —— 呼叫端會把他當成「沒有牌位」列出來。
func (s *Service) LobbyProfile(
	ctx context.Context,
	accountID string,
) (username, tier, division string, ok bool) {
	if a, err := s.accounts.GetByID(ctx, accountID); err == nil {
		username = a.Username
	}
	me, found, err := s.PlayerMe(ctx, "", accountID)
	if err != nil || !found {
		// ⭐ 沒打過排位的人**仍然要被列出來**（有名字、沒牌位）——
		//   ⛔ 回 false 會讓他從房間清單裡消失，而他就在房間裡。
		return username, "", "", username != ""
	}
	return username, me.Tier, me.Division, true
}

// TierRank 回牌位在階梯上的位置（越大越高）。
//
// ⭐⭐ **唯一的住處** —— `divisionedTiers` ＋ 三個頂端牌位就是階梯本身。
// ⛔ `room` 那一側刻意不知道這個順序（見 `room.LobbyProfiles` 的註解）。
func (s *Service) TierRank(tier string) (int, bool) {
	for i, t := range divisionedTiers {
		if t == tier {
			return i, true
		}
	}
	// ⭐ 三個頂端牌位接在六階之後（⛔ 它們沒有 division，所以不在上面那個陣列裡）。
	switch tier {
	case TierMaster:
		return len(divisionedTiers), true
	case TierGrandmaster:
		return len(divisionedTiers) + 1, true
	case TierChallenger:
		return len(divisionedTiers) + 2, true
	}
	return 0, false
}
