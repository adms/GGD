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
//	           排名劇烈震盪。
//
// ⭐ 2026-08-17（owner 第二則）把這一段修正了一半：
//
//	「能打玩家還是有**更好的加成比較公平**，畢竟 **bot AI 的行為模式太容易被克制，
//	  並沒有太高的鑑別度**」
//
// ⚠️ 這句話的**正確讀法不是「真人賽的 K 要放大」，而是「bot 賽的 K 要縮小」。**
// 兩者在「相對」上等價，但在 Elo 的數學上完全不同：放大真人賽的 K 會讓估計值震盪
// （上一版擔心的正是這個），縮小 bot 賽的 K 只是說出一件真話 —— **一場資訊量低的
// 比賽本來就該少移動一點**。Elo 的 K 本來就是「這一場的資訊量」旋鈕。
//
//	⇒ 出貨改成兩格一起動：
//	  · BotKPct 出貨 40 —— 沒有達到 MinHumans 的場（＝純 bot 局）K 只算四成。
//	  · RatingSharePct 5 → 25 —— 真人賽仍然吃增幅，但吃的是「四分之一」而不是全部；
//	    13 人的 lobby 得 K ×4.0，再由 RatingMaxPct（200 → 300）夾在 3 倍。
//
// 這是一個**設計判斷**，不是偷懶做一半：三格都是後台欄位，operator 想讓 MMR 也吃
// 滿倍率就把 RatingSharePct 調到 100，想讓 bot 局完全不動 MMR 就把 BotKPct 調到 0。
//
// ── 宿敵加成（head-to-head）與它為什麼擋得住刷分 ─────────────────────────────
//
// 加成 = Base × HalfLife/(HalfLife+|淨勝|) × Repeat/(Repeat+已對戰場數)，兩個因子都
// **只會遞減**：
//
//	① 淨勝項  —— 勢均力敵的一對加成最高；一面倒的一對加成低。
//	② 重複項  —— 這一對**打過越多場**，加成越低，⛔ 不管勝負怎麼分。
//
// ⭐ ⚠️ 2026-08-17：淨勝項現在取**絕對值**，而這不是微調，是把「誰拿到多少」這件事
// 整個換了一個機制。owner 那一則講了兩半：
//
//	「加成通常是**我輸太多次，打贏一次就會加很多**，反過來**贏太多次就會越贏越少**，
//	  因為**欺負弱小並不值得**增加太多分數，**以小博大的逆轉勝值得更高評價**」
//	「但的確**刻意輸十場再來贏就沒辦法**，你可以有其他建議來彌補」
//
// ⛔ 上一版把「誰是弱勢」寫進**加成本身**（淨勝為負 → 分母變小 → 加成變大），而那正
// 是刷分漏洞的來源：加成只掛在贏家身上 ⇒ **A 贏的比 B 輸的多** ⇒ 這一對可以無中生有
// 地製造分數。重複項只能讓產出**變慢**，⛔ 擋不住「先刻意輸十場」——因為那十場把重複
// 項的分母墊高的同時，也把淨勝墊到了最有利的位置。
//
// ⭐ 現在的形狀是：**加成的大小對一對的兩邊完全相同（|淨勝| 是對稱的），
// 「誰拿到」交給 Elo 自己的期望值項。**
//
//	· 「輸太多次打贏一次加很多」 ✅ —— 你輸多 ⇒ 你的 rating 低 ⇒ 贏過高分的對手，
//	  Elo 的 (S−E) 本來就大。這是 Elo 的**原生**行為，⛔ 不需要第二套算式。
//	· 「欺負弱小不值得」 ✅ —— 同一項的反面，(S−E) 趨近 0。
//	· 「一面倒的宿敵不值錢」 ✅ —— |淨勝| 大 ⇒ 加成小；勢均力敵的宿敵才是滿的。
//	· **刻意輸十場再來贏** ✅ **結構上被擋掉了** —— 一對的兩邊 K 相同 ⇒ 這一對的
//	  Elo 變動是**零和**的。串通只能把分數在兩個帳號之間搬，⛔ 無法製造。A 能拿走的
//	  上限就是 B 身上的分，而 B 是一個要真的有分的帳號。
//
// ⚠️ 賽季積分**不是零和**（它是獎勵幣，不是估計值），所以那一半的反刷分閘仍然只有
// 重複項 ②：同一對打越多，這條路的產出越接近零。這是刻意的分工，⛔ 不是漏做。
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
	// RatingSharePct: MMR 的 K 值吃多少增幅（出貨 25，見檔頭）。
	RatingSharePct int
	// RatingMaxPct: K 值最多變成原本的百分之幾（出貨 300 = 3 倍）。宿敵加成也算在內。
	RatingMaxPct int
	// BotKPct: **沒有**達到 MinHumans 的那種場（純 bot 局）K 值只算百分之幾。
	// 出貨 40 —— owner:「bot AI 的行為模式太容易被克制，並沒有太高的鑑別度」。
	// ⚠️ 這是「資訊量低 ⇒ 少動一點」，⛔ 不是懲罰：0 = bot 局完全不動 MMR。
	BotKPct int

	// ── 宿敵加成
	// RivalryBasePct: 勢均力敵、初次交手時的加成百分比。
	RivalryBasePct int
	// RivalryHalfLife: |淨勝場| 每增加這麼多，加成大約砍半。
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
	DefaultRatingSharePct       = 25
	DefaultRatingMaxPct         = 300
	DefaultBotKPct              = 40

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
	// BotKPct 的下界是 0（bot 局完全不動 MMR），上界 100（bot 局跟真人局一樣重）。
	// ⛔ 上界刻意**不是** 1000：讓 bot 局比真人局還重是純打錯字，沒有設計會要它。
	BotKPctMin = 0
	BotKPctMax = 100

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
		BotKPct:               DefaultBotKPct,
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
// 一起夾在 RatingMaxPct；**沒有達到 MinHumans 的場再乘上 BotKPct**。
//
// ⚠️ humans 是這一場的真人數，而 mult 是由它算出來的倍率 —— 兩個都要傳是刻意的：
// 倍率把「1 個真人」與「0 個真人」壓成同一個值 1，而這兩者對 Elo 是不同的東西。
// ⛔ 不要改成從 mult == 1 反推，那會把「MaxMultiplier 被調成 1」也誤判成 bot 局。
//
// 順序也是刻意的：bot 折扣**乘在最後**、夾在 RatingMaxPct **之後**。RatingMaxPct 問
// 的是「真人賽最多能快幾倍」，⛔ 不該反過來把 bot 局的折扣抬回去。
func (r StandingsRules) RatingKMulPct(humans, mult, rivalryPct int) int {
	p := scaledPct(mult, r.RatingSharePct) + rivalryPct
	max := r.RatingMaxPct
	if max < 100 {
		max = 100
	}
	if p > max {
		p = max
	}
	if humans < r.MinHumans {
		bot := r.BotKPct
		if bot < BotKPctMin {
			bot = BotKPctMin
		}
		if bot > BotKPctMax {
			bot = BotKPctMax
		}
		p = p * bot / 100
	}
	return p
}

// RivalryBonusPct 是「這一對宿敵」在這一場的加成百分比。
// prior 是這一場**之前**的對戰紀錄。見檔頭對兩個遞減項的說明。
//
// ⭐ 這個數字對一對的**兩邊完全相同**（`|淨勝|` 是對稱的，`Played()` 本來就是），
// 而那正是它擋得住串通刷分的原因：兩邊的 K 相同 ⇒ 這一對的 Elo 變動是零和的。
// ⛔ 不要「順手」把絕對值改回帶號 —— 那一行就是漏洞本身，而且改壞了畫面上完全一樣。
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
	lopsided := prior.Net()
	if lopsided < 0 {
		lopsided = -lopsided
	}
	pct := r.RivalryBasePct * half / (half + lopsided)
	pct = pct * repeat / (repeat + prior.Played())
	if pct > r.RivalryMaxPct {
		pct = r.RivalryMaxPct
	}
	return pct
}

// RivalryTotalPct 把一場之內**每一個交手過的對手**的加成加起來，並套上總上限。
// ⚠️ 是「交手過」不是「打贏的」—— 見 RivalryBonusPct 的對稱性註解。
func (r StandingsRules) RivalryTotalPct(faced []H2H) int {
	total := 0
	for _, prior := range faced {
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
