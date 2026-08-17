package ranking

// standings.go —— 「真人倍率」與「宿敵加成」怎麼進到 MMR 與賽季積分（owner 2026-08-17）。
//
//	「**MMR 倍率跟賽季積分也是類似的規則**，獎勵大家多打真人賽，
//	  並且**真實記錄 vs 特定玩家的幾勝幾敗**來影響 MMR & 賽季積分」
//
// ⭐ 「類似的規則」＝ 真人數換算成倍率的**那條算式**與藍水晶共用同一支
// （wallet.CrystalMultiplier：`N >= MinHumans ? min(N+Offset, Max) : 1`）。
// ⛔ 這個檔案**沒有**重打那條算式 —— 它只提供三格參數，由 internal/gamelink 餵給
// 那一支唯一的實作。理由是第四個住處一定會漂走。
//
// ── ⚠️ 但 MMR 與賽季積分**不是同一種東西**，所以吃倍率的方式刻意不同 ────────────
//
//	賽季積分 是一個**可累加的分數**：它衡量「這一季你打了多少、打得多好」。
//	           把它乘上真人倍率是自然的 —— 獎勵就是要看得見，而且它不會影響配對。
//	           ⇒ SeasonPointsSharePct 出貨 100（＝完整的 N+1 倍）。
//
//	MMR/Elo  是一個**收斂到真實實力的估計值**。Elo 的整個數學前提是「每一場移動一個
//	           與 K 成比例的小量，長期收斂」。把一場真人賽的變動直接乘 13 倍，會讓
//	           排名劇烈震盪，而且**打一場 bot 局就把它拉回去**（bot 局倍率是 1，
//	           所以同樣的實力估計被兩種不同尺度輪流拉扯，估計值反而更差）。
//	           ⇒ RatingSharePct 出貨 5：13 倍的 lobby 只讓 K 變成 1.6 倍，
//	             再由 RatingMaxPct 硬夾在 2 倍。
//
// 這是一個**設計判斷**，不是偷懶做一半：兩者都是後台欄位，operator 想讓 MMR 也吃
// 滿倍率就把 RatingSharePct 調到 100。預設值是「積分獎勵大方、排名保守」。
//
// ── 宿敵加成（head-to-head）與它為什麼擋得住刷分 ─────────────────────────────
//
// 加成 = Base × HalfLife/(HalfLife+淨勝) × Repeat/(Repeat+已對戰場數)，兩個因子都
// **只會遞減**：
//
//	① 淨勝項  —— 贏一個過去輸多贏少的對手加成高（淨勝為負 → 分母變小），
//	              而重複輾壓同一個人時淨勝一路上升 → 加成一路掉。
//	② 重複項  —— 這一對**打過越多場**，加成越低，⛔ 不管勝負怎麼分。
//
// ⭐ ② 是「兩個帳號互相餵分」的唯一閘，而且它是必要的：只有 ① 的話，A 與 B 輪流讓
// 對方贏就能讓淨勝永遠停在 0 附近，加成就永遠是滿的。加上 ② 之後，同一對帳號打得
// 越多，這條路的產出越接近零，而**跟不同的人打**才拿得到加成 —— 這正是 owner 要的
// 「獎勵大家多打真人賽」。
//
// ⚠️ 加成只作用在**正的**名次分上（見 gamelink 的 standings.go）：把 −30 的懲罰乘上
// 13 倍不是獎勵，而 owner 的句子是「獎勵大家多打真人賽」。

// StandingsRules 是 MMR／賽季積分那一半的可調規則。每一格都是後台欄位，
// 每一格都有**上下界**（GH#277：只檢查 min 會讓 13 打成 130 靜靜過去）。
type StandingsRules struct {
	// ── 真人倍率的三格（與水晶同形狀、但獨立，經濟與排名不必一起調）
	MinHumans     int
	Offset        int
	MaxMultiplier int

	// ── 兩種東西各吃多少倍率
	// SeasonPointsSharePct: 100 = 完整 N+1 倍；50 = 只吃一半的增幅。
	SeasonPointsSharePct int
	// RatingSharePct: MMR 的 K 值吃多少增幅（出貨 5，見檔頭）。
	RatingSharePct int
	// RatingMaxPct: K 值最多變成原本的百分之幾（出貨 200 = 2 倍）。宿敵加成也算在內。
	RatingMaxPct int

	// ── 宿敵加成
	// RivalryBasePct: 勝負持平、初次交手時的加成百分比。
	RivalryBasePct int
	// RivalryHalfLife: 淨勝場每增加這麼多，加成大約砍半。
	RivalryHalfLife int
	// RivalryRepeatHalfLife: 同一對的總對戰場數每增加這麼多，加成大約砍半（反刷分）。
	RivalryRepeatHalfLife int
	// RivalryMaxPct: 一場之內所有對手的宿敵加成加起來的上限。
	RivalryMaxPct int
}

// ── 出貨值 ────────────────────────────────────────────────────────────────────
const (
	// 前三格與 wallet.DefaultCrystal* 出貨值一致（owner:「類似的規則」），
	// ⛔ 但**不是**同一組常數：operator 可以只調經濟不調排名。
	DefaultStandingsMinHumans     = 2
	DefaultStandingsOffset        = 1
	DefaultStandingsMaxMultiplier = 13

	DefaultSeasonPointsSharePct = 100
	DefaultRatingSharePct       = 5
	DefaultRatingMaxPct         = 200

	DefaultRivalryBasePct        = 20
	DefaultRivalryHalfLife       = 3
	DefaultRivalryRepeatHalfLife = 10
	DefaultRivalryMaxPct         = 60
)

// ── 上下界。⚠️ 兩端都要有。 ──────────────────────────────────────────────────
const (
	StandingsMinHumansMin     = 1
	StandingsMinHumansMax     = 12
	StandingsOffsetMin        = 0
	StandingsOffsetMax        = 12
	StandingsMaxMultiplierMin = 1
	StandingsMaxMultiplierMax = 50

	// Share 的下界是 0（＝這一半完全不吃倍率），上界 100（＝吃滿）。
	SharePctMin = 0
	SharePctMax = 100
	// K 值百分比：100 = 不動；上界 1000 是打錯字的閘，不是設計目標。
	RatingMaxPctMin = 100
	RatingMaxPctMax = 1000

	RivalryPctMin      = 0
	RivalryPctMax      = 500
	RivalryHalfLifeMin = 1
	RivalryHalfLifeMax = 1000
)

// DefaultStandingsRules 是出貨值。⚠️ 它必須跟 content/config 的出貨 JSON 以及
// 後台頁對得起來（第一守則的三個住處）。
func DefaultStandingsRules() StandingsRules {
	return StandingsRules{
		MinHumans:             DefaultStandingsMinHumans,
		Offset:                DefaultStandingsOffset,
		MaxMultiplier:         DefaultStandingsMaxMultiplier,
		SeasonPointsSharePct:  DefaultSeasonPointsSharePct,
		RatingSharePct:        DefaultRatingSharePct,
		RatingMaxPct:          DefaultRatingMaxPct,
		RivalryBasePct:        DefaultRivalryBasePct,
		RivalryHalfLife:       DefaultRivalryHalfLife,
		RivalryRepeatHalfLife: DefaultRivalryRepeatHalfLife,
		RivalryMaxPct:         DefaultRivalryMaxPct,
	}
}

// scaledPct 把一個整數倍率按 share 折算成百分比乘數。
// share=100 → 完整倍率（mult=13 得 1300）；share=5 → 只吃 5% 的增幅（得 160）。
// 結果永遠 ≥ 100：這是**獎勵**，沒有任何後台值可以讓打真人比打 bot 還虧。
func scaledPct(mult, sharePct int) int {
	if mult < 1 {
		mult = 1
	}
	if sharePct < 0 {
		sharePct = 0
	}
	p := 100 + (mult-1)*sharePct
	if p < 100 {
		p = 100
	}
	return p
}

// SeasonPointsMulPct 是賽季積分（含每位英雄的積分）要乘的百分比。
func (r StandingsRules) SeasonPointsMulPct(mult int) int {
	return scaledPct(mult, r.SeasonPointsSharePct)
}

// RatingKMulPct 是 Elo 的 K 值要乘的百分比：真人倍率（打折）加上宿敵加成（原值），
// 一起夾在 RatingMaxPct。宿敵加成不打折是刻意的 —— 它本來就小（上限 60%），
// 而且 Elo 是自我修正的：贏了宿敵多拿的分，下次輸給他會還回去。
func (r StandingsRules) RatingKMulPct(mult, rivalryPct int) int {
	p := scaledPct(mult, r.RatingSharePct) + rivalryPct
	max := r.RatingMaxPct
	if max < 100 {
		max = 100
	}
	if p > max {
		p = max
	}
	return p
}

// RivalryBonusPct 是「打贏這一個對手」在這一場拿到的加成百分比。
// prior 是這一場**之前**、以贏家為主詞的對戰紀錄。見檔頭對兩個遞減項的說明。
func (r StandingsRules) RivalryBonusPct(prior H2H) int {
	if r.RivalryBasePct <= 0 {
		return 0
	}
	half := r.RivalryHalfLife
	if half < 1 {
		half = 1
	}
	repeat := r.RivalryRepeatHalfLife
	if repeat < 1 {
		repeat = 1
	}
	den := half + prior.Net()
	if den < 1 {
		den = 1 // 淨勝為大負數時分母會翻負：夾在 1，加成由 RivalryMaxPct 收口
	}
	pct := r.RivalryBasePct * half / den
	pct = pct * repeat / (repeat + prior.Played())
	if pct > r.RivalryMaxPct {
		pct = r.RivalryMaxPct
	}
	return pct
}

// RivalryTotalPct 把一場之內**每一個被打敗的對手**的加成加起來，並套上總上限。
func (r StandingsRules) RivalryTotalPct(beaten []H2H) int {
	total := 0
	for _, prior := range beaten {
		total += r.RivalryBonusPct(prior)
	}
	if total > r.RivalryMaxPct {
		total = r.RivalryMaxPct
	}
	return total
}

// AwardPointsScaled 是 LadderConfig.AwardPoints 的加成版：名次分為正時乘上
// mulPct/100（真人倍率 × 宿敵加成已經合併在 mulPct 裡），為負時**原封不動**。
// 一樣是絕對值、一樣夾在 0。
func (c LadderConfig) AwardPointsScaled(current, place, mulPct int) int {
	delta := c.PlacementDelta(place)
	if delta > 0 && mulPct > 100 {
		delta = delta * mulPct / 100
	}
	return FloorPoints(current + delta)
}
