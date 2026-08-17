package ranking

// standingsoverride.go —— 「排名獎勵」那一頁的後台覆寫，**每一場結算都重讀**。
//
// 形狀是照著 internal/wallet/economy.go 抄的，理由也一樣（見那個檔案的檔頭）：
// 一個只會寫、沒有人讀的後台頁會自我一致地說謊 —— 它存檔、它回「✓ 已寫入」、
// 它重新載入時還顯示你存的值，而玩家那一場一個字都沒變（#241）。所以覆寫是在
// **決策發生的當下**讀的，不是開機讀一次。
//
// ⚠️ 三個字串是**抄**的，不是 import 來的：contentoverlay → admin → ranking
// 已經是一條邊，反向 import 就是循環（同 wallet 的說明）。抄了就要釘 ——
// standings_test.go 用真的 jsonstore 寫進去再從這裡讀回來。
//
// ⚠️ 缺欄位 = 出貨值，⛔ 不是 0。0 倍率＝打完一場什麼都沒有，而**每一份既有的
// overlay 都沒有這個 doc**（這是 2026-08-17 才加的），所以「缺」是常態不是異常。

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"

	"github.com/ggd/platform/internal/data/jsonstore"
)

const (
	// OverlayCollection / OverlayDocID 是 contentoverlay 的儲存位置。
	OverlayCollection = "content-overlay"
	// OverlayDocID is contentoverlay.DocID.
	OverlayDocID = "overlay"
	// OverlayRankingKey 是後台「排名獎勵」頁存檔用的 doc 鍵。
	OverlayRankingKey = "config/ranking"
	// SchemaRanking 是那份 doc 的 schema tag。
	SchemaRanking = "config.ranking@1"
)

// overlayFile 是 contentoverlay.Overlay 這個套件用得到的那一小片。
type overlayFile struct {
	Docs    map[string]json.RawMessage `json:"docs"`
	Deleted map[string]bool            `json:"deleted"`
}

// rankingDoc 是後台存的那份文件。⭐ 每一格都是指標：沒寫的欄位保持出貨值。
type rankingDoc struct {
	Schema          string `json:"schema"`
	HumanMultiplier *struct {
		MinHumans     *int `json:"minHumans"`
		Offset        *int `json:"offset"`
		MaxMultiplier *int `json:"maxMultiplier"`
	} `json:"humanMultiplier"`
	Share *struct {
		SeasonPointsPct *int `json:"seasonPointsPct"`
		RatingPct       *int `json:"ratingPct"`
		RatingMaxPct    *int `json:"ratingMaxPct"`
	} `json:"share"`
	Rivalry *struct {
		BasePct        *int `json:"basePct"`
		HalfLife       *int `json:"halfLife"`
		RepeatHalfLife *int `json:"repeatHalfLife"`
		MaxPct         *int `json:"maxPct"`
	} `json:"rivalry"`
}

// StandingsRulesNow 是**這一刻**生效的排名獎勵規則：出貨值疊上 operator 的覆寫。
// 讀不到、格式不對、超出上下界 → 整份退回出貨值並吼一聲（⛔ 不夾：夾出來的數字
// 沒有人選過，而且它長得跟正常的一模一樣）。
func (s *Service) StandingsRulesNow() StandingsRules {
	shipped := DefaultStandingsRules()
	if s.store == nil {
		return shipped
	}
	var f overlayFile
	if err := s.store.Get(OverlayCollection, OverlayDocID, &f); err != nil {
		if !errors.Is(err, jsonstore.ErrNotFound) {
			slog.Warn("ranking: 讀不到內容覆寫層 —— 排名獎勵使用出貨值", "err", err)
		}
		return shipped
	}
	if f.Deleted[OverlayRankingKey] {
		return shipped // operator 明確還原成出貨值
	}
	raw, ok := f.Docs[OverlayRankingKey]
	if !ok {
		return shipped
	}
	var d rankingDoc
	if err := json.Unmarshal(raw, &d); err != nil {
		slog.Warn("ranking: 排名獎勵覆寫不是可讀的 JSON —— 使用出貨值", "key", OverlayRankingKey, "err", err)
		return shipped
	}
	if d.Schema != SchemaRanking {
		slog.Warn("ranking: 排名獎勵覆寫的 schema 對不上 —— 使用出貨值",
			"key", OverlayRankingKey, "schema", d.Schema, "want", SchemaRanking)
		return shipped
	}
	cand := shipped
	if m := d.HumanMultiplier; m != nil {
		putInt(&cand.MinHumans, m.MinHumans)
		putInt(&cand.Offset, m.Offset)
		putInt(&cand.MaxMultiplier, m.MaxMultiplier)
	}
	if sh := d.Share; sh != nil {
		putInt(&cand.SeasonPointsSharePct, sh.SeasonPointsPct)
		putInt(&cand.RatingSharePct, sh.RatingPct)
		putInt(&cand.RatingMaxPct, sh.RatingMaxPct)
	}
	if rv := d.Rivalry; rv != nil {
		putInt(&cand.RivalryBasePct, rv.BasePct)
		putInt(&cand.RivalryHalfLife, rv.HalfLife)
		putInt(&cand.RivalryRepeatHalfLife, rv.RepeatHalfLife)
		putInt(&cand.RivalryMaxPct, rv.MaxPct)
	}
	if err := ValidateStandingsRules(cand); err != nil {
		slog.Warn("ranking: 排名獎勵覆寫超出範圍 —— 整份退回出貨值", "key", OverlayRankingKey, "err", err)
		return shipped
	}
	return cand
}

// putInt 把一格「有寫才算」的覆寫蓋上出貨值。沒寫的欄位⛔不會變成 0。
func putInt(dst, src *int) {
	if src != nil {
		*dst = *src
	}
}

// ValidateStandingsRules 檢查**每一格的兩端**。匯出是為了讓後台／工具用同一份界線，
// 不要各自抄一份。
func ValidateStandingsRules(r StandingsRules) error {
	for _, c := range []struct {
		name     string
		v        int
		min, max int
	}{
		{"humanMultiplier.minHumans", r.MinHumans, StandingsMinHumansMin, StandingsMinHumansMax},
		{"humanMultiplier.offset", r.Offset, StandingsOffsetMin, StandingsOffsetMax},
		{"humanMultiplier.maxMultiplier", r.MaxMultiplier, StandingsMaxMultiplierMin, StandingsMaxMultiplierMax},
		{"share.seasonPointsPct", r.SeasonPointsSharePct, SharePctMin, SharePctMax},
		{"share.ratingPct", r.RatingSharePct, SharePctMin, SharePctMax},
		{"share.ratingMaxPct", r.RatingMaxPct, RatingMaxPctMin, RatingMaxPctMax},
		{"rivalry.basePct", r.RivalryBasePct, RivalryPctMin, RivalryPctMax},
		{"rivalry.halfLife", r.RivalryHalfLife, RivalryHalfLifeMin, RivalryHalfLifeMax},
		{"rivalry.repeatHalfLife", r.RivalryRepeatHalfLife, RivalryHalfLifeMin, RivalryHalfLifeMax},
		{"rivalry.maxPct", r.RivalryMaxPct, RivalryPctMin, RivalryPctMax},
	} {
		if c.v < c.min || c.v > c.max {
			return fmt.Errorf("%s = %d, want %d..%d", c.name, c.v, c.min, c.max)
		}
	}
	return nil
}
