package ranking

// nemesis.go —— 大廳「宿敵排行榜」的投影層（GH#454）。
//
// owner 2026-08-19：
//
//	「大廳新增 **宿敵排行榜**，把**最多輸贏的宿敵**列在**朋友列表跟積分排行榜之間**」
//
// ── 這裡**沒有**新的資料來源 ─────────────────────────────────────────────────
// ⛔ 這個檔案不寫任何東西，也不記任何東西。它把 headtohead.go 那份**唯一一列**的
// 對稱紀錄翻成「以我為主詞、可以排序、可以顯示」的樣子。理由與 headtohead.go 檔頭
// 拒絕 per-account 索引的理由是同一條：**第二份會漂的資料**比慢一點的查詢糟得多。
//
// ⚠️ 所以這一頁的成本是「讀一次集合索引 + 只讀我真的打過的那幾對」，⛔ 不是掃全表：
// `HeadToHeadFor` 先用字串前後綴挑掉不相關的鍵（`List` 只讀一份 `_index.json`），
// 只有命中的那幾份才真的開檔。一個從沒跟真人打過的帳號 = 一次索引讀，零次開檔。
//
// ── bot 為什麼不會出現在這個榜上 ────────────────────────────────────────────
// ⭐ 不需要在這裡放過濾器，而且**放了才是缺陷**（那會讓人以為閘在這裡）。
// 寫入端 `gamelink/settle.go::recordHeadToHead` 只把「非 bot **而且** `st.Ratings`
// 裡有這個 id」的座位配對起來 —— bot 兩個條件都不過，沙發客（`:pN`）過不了第二個。
// ⇒ `data/headtohead` 裡逐列都是兩個真人，這個榜自動就是真人榜。
//
// ⚠️ 代價是**新帳號的榜是空的**（現在多數對局是 bot 局）。空榜要顯示引導文案而不是
// 空白 —— 那是客戶端的事，見 apps/client/src/ui/platform/nemesis.ts 的
// `nemesisEmptyReason`：「還沒有真人對戰紀錄」與「讀不到」是兩件不同的事。

import (
	"context"
	"sort"
	"time"
)

// NemesisSort 是宿敵榜的排序方式。owner 沒有指定，所以這是一個**決策點**而不是
// 一條設計 —— 三種都做得出來，而且各自對應一種完全不同的情緒：
//
//	played  (a) 交手次數  —— 最中性：跟誰打得最多
//	rivalry (b) 恩怨值    —— 最有戲：五五開的排前面
//	bane    (c) 苦主/剋星 —— 最刺激也最傷人：對你贏最多的排前面
//
// 出貨走 (a)，而且每一列**同時**帶著 (b)(c) 需要的數字（W-L、勝率、恩怨值），
// 所以換排序不需要換 API，只換一個參數。
type NemesisSort string

const (
	// NemesisSortPlayed 依交手場次由多到少。
	NemesisSortPlayed NemesisSort = "played"
	// NemesisSortRivalry 依恩怨值由高到低（見 NemesisRow.Rivalry）。
	NemesisSortRivalry NemesisSort = "rivalry"
	// NemesisSortBane 依**淨敗場**由高到低 —— 對你贏最多的那個人排第一。
	NemesisSortBane NemesisSort = "bane"
)

// DefaultNemesisSort 是出貨排序（owner 未指定時的預設，見 NemesisSort 的說明）。
const DefaultNemesisSort = NemesisSortPlayed

// DefaultNemesisLimit / MaxNemesisLimit 界定一次回幾列。大廳那一格放不下十列以上，
// 而上界的存在是為了讓「limit=100000」變成一個被夾住的數字而不是一次全表開檔。
const (
	DefaultNemesisLimit = 10
	MaxNemesisLimit     = 50
)

// ParseNemesisSort 把查詢字串翻成排序方式。⭐ 認不得的值退回預設而不是報錯：
// 這是一個顯示偏好，⛔ 不值得讓大廳的一格面板變成一則錯誤訊息。
func ParseNemesisSort(raw string) NemesisSort {
	switch NemesisSort(raw) {
	case NemesisSortPlayed:
		return NemesisSortPlayed
	case NemesisSortRivalry:
		return NemesisSortRivalry
	case NemesisSortBane:
		return NemesisSortBane
	default:
		return DefaultNemesisSort
	}
}

// NemesisRow 是宿敵榜的一列，**以查詢者為主詞**：Wins 是「我贏他幾場」。
type NemesisRow struct {
	AccountID string `json:"accountId"`
	// Username 是對手當下的名稱。帳號被刪掉時是空字串 —— 客戶端退回顯示 id，
	// ⛔ 不是把這一列丟掉：那一場對戰真的發生過。
	Username string `json:"username"`
	// Played / Wins / Losses 是 (a) 與每一列都要顯示的 W-L。
	Played int `json:"played"`
	Wins   int `json:"wins"`
	Losses int `json:"losses"`
	// WinRate 是主詞方的勝率，0..1。Played 必 > 0，所以不會除以零。
	WinRate float64 `json:"winRate"`
	// Rivalry 是 (b) 恩怨值 = `2 × min(Wins, Losses)`。
	//
	// ⭐ 它是整數而不是「離 50% 多近」的浮點分數，因為那種分數會讓 1 勝 1 敗
	// （完美五五開，只打過兩場）壓過 9 勝 8 敗。這個式子同時吃進**接近程度**與
	// **場次**：10:0 是 0、5:5 是 10、9:8 是 16。
	Rivalry int `json:"rivalry"`
	// LastAt 是最後一次交手的時間（「最近一次交手」那一欄）。
	LastAt time.Time `json:"lastAt,omitempty"`
}

// NetLosses 是 (c) 苦主/剋星的排序鍵：淨敗場。
//
// ⭐ 用淨敗場而不是「對方勝率」，是為了不必發明一個「至少打過幾場才算」的門檻：
// 勝率會讓一場 1:0 的偶遇（100%）壓過 9:1 的長期壓制，於是就得補一個 minPlayed
// 常數 —— 而那個常數沒有任何人能說出它為什麼是 3 而不是 5。淨敗場自己就帶了份量：
// 1:0 是 +1，9:1 是 +8。
func (r NemesisRow) NetLosses() int { return r.Losses - r.Wins }

// NemesisBoard 讀出 subject 的宿敵榜。
//
// 從未跟真人對戰過回**空清單**，⛔ 不是錯誤 —— 那是新帳號的正常狀態，而客戶端要
// 分得出「空的」與「壞的」。
func (s *Service) NemesisBoard(ctx context.Context, subject string, sortBy NemesisSort, limit int) ([]NemesisRow, error) {
	if limit <= 0 {
		limit = DefaultNemesisLimit
	}
	if limit > MaxNemesisLimit {
		limit = MaxNemesisLimit
	}
	pairs, err := s.HeadToHeadFor(ctx, subject)
	if err != nil {
		return nil, err
	}
	rows := make([]NemesisRow, 0, len(pairs))
	for _, h := range pairs {
		played := h.Played()
		if played <= 0 {
			continue // 一列 0 勝 0 敗代表不了任何「宿敵」關係
		}
		row := NemesisRow{
			AccountID: h.Opponent,
			Played:    played,
			Wins:      h.Wins,
			Losses:    h.Losses,
			WinRate:   float64(h.Wins) / float64(played),
			Rivalry:   2 * min(h.Wins, h.Losses),
			LastAt:    h.LastAt,
		}
		if s.accounts != nil {
			if a, err := s.accounts.GetByID(ctx, h.Opponent); err == nil {
				row.Username = a.Username
			}
		}
		rows = append(rows, row)
	}
	sortNemesis(rows, sortBy)
	if len(rows) > limit {
		rows = rows[:limit]
	}
	return rows, nil
}

// sortNemesis 依排序方式重排。每一種都補到**全序**（最後用 accountId 收尾），
// 所以同一份資料不會因為 map 迭代或檔案系統順序而在兩次刷新之間跳動。
func sortNemesis(rows []NemesisRow, sortBy NemesisSort) {
	primary := func(r NemesisRow) int {
		switch sortBy {
		case NemesisSortRivalry:
			return r.Rivalry
		case NemesisSortBane:
			return r.NetLosses()
		default:
			return r.Played
		}
	}
	sort.SliceStable(rows, func(i, j int) bool {
		a, b := rows[i], rows[j]
		if pa, pb := primary(a), primary(b); pa != pb {
			return pa > pb
		}
		if a.Played != b.Played {
			return a.Played > b.Played // 同分時打得多的比較像宿敵
		}
		if !a.LastAt.Equal(b.LastAt) {
			return a.LastAt.After(b.LastAt) // 再同分時最近打過的優先
		}
		return a.AccountID < b.AccountID
	})
}
