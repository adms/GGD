package ranking

// headtohead.go —— 「我 vs 某人，幾勝幾敗」的真實紀錄（owner 2026-08-17）。
//
//	「並且**真實記錄 vs 特定玩家的幾勝幾敗**來影響 MMR & 賽季積分」
//
// ── 為什麼是「一對一列」而不是「一人一列」 ─────────────────────────────────
// 最直覺的形狀是每個帳號一份檔案、裡面掛一張 opponentId → 勝負的表。那會讓同一場
// 對戰寫進**兩份**檔案（A 的表和 B 的表），而那兩份會漂：任何一次半途失敗、任何一次
// 只補了其中一邊的修復腳本，都會留下「A 說 3 勝、B 說 2 敗」的狀態，而且**兩邊看起來
// 都很正常**。所以鍵是**對稱正規化**的（兩個 id 排序後接起來），一對帳號只有一列，
// 兩個方向都從同一列讀出來 —— 不可能不一致，因為沒有第二份。
//
// ⚠️ 沙發客（`:pN`）與 bot 進不到這裡：結算迴圈只把「真的有帳號檔」的座位交進來。
// 練習房也進不到 —— 它整條不回報結果（game server 的 MatchRoom.settleToPlatform
// 直接 return），所以這裡不需要、也不應該再放一道練習房的閘。

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/ggd/platform/internal/data/jsonstore"
)

// ColHeadToHead 是對戰紀錄的 jsonstore 集合（data/headtohead）。
const ColHeadToHead = "headtohead"

// pairSep 把兩個帳號 id 接成一個檔名。ULID 用的是 Crockford base32（大寫英數），
// 所以底線不可能出現在 id 裡，接起來不會有歧義。
const pairSep = "__"

// maxPairIDLen 是單一 id 在鍵裡的長度上限。jsonstore 的 id 上限是 128 個字元，
// 兩個 id 加一個分隔符要塞得下。
const maxPairIDLen = 62

// h2hDedupeWindow 是每一列記得的「最近幾場 matchId」。它讓 WAL 重播不會重複累加：
// 紀錄是**累加**的（不像 MMR/積分那樣寫絕對值），所以 boot 重播一份沒 commit 的
// intent 會把同一場算兩次。窗口不是無上限的清單，因為這一列會被讀進每一場結算的
// 加成計算裡，讓它隨對戰次數線性長大是在替自己造一個慢性效能問題。
const h2hDedupeWindow = 16

// PairRecord 是一對帳號的**唯一一列**累計紀錄。A 永遠是排序後較小的那個 id。
type PairRecord struct {
	A      string    `json:"a"`
	B      string    `json:"b"`
	AWins  int       `json:"aWins"`
	BWins  int       `json:"bWins"`
	LastAt time.Time `json:"lastAt"`
	// RecentMatchIDs 是最近 h2hDedupeWindow 場的 matchId（新的在前），用來讓
	// Record 對同一場冪等。
	RecentMatchIDs []string `json:"recentMatchIds,omitempty"`
}

// H2H 是**以某一方為主詞**讀出來的投影：「我對他幾勝幾敗」。
type H2H struct {
	// Opponent 是對手的帳號 id。
	Opponent string `json:"opponent"`
	// Wins/Losses 是主詞方的勝場與敗場。
	Wins   int `json:"wins"`
	Losses int `json:"losses"`
	// LastAt 是這一對最後一次對戰的時間（零值 = 從未對戰）。
	LastAt time.Time `json:"lastAt,omitempty"`
}

// Played 是這一對總共打過幾場。
func (h H2H) Played() int { return h.Wins + h.Losses }

// Net 是主詞方的淨勝場（負數 = 輸多贏少）。
func (h H2H) Net() int { return h.Wins - h.Losses }

// validPairID 檢查一個帳號 id 能不能安全地成為檔名的一半。jsonstore 自己也會擋，
// 但那是在寫入的當下才擋，而這裡回 false 讓呼叫端**跳過這一對**而不是讓整場結算失敗
// —— 一筆算不出來的宿敵加成不值得賠掉一場比賽的 MMR。
func validPairID(id string) bool {
	if id == "" || len(id) > maxPairIDLen || strings.Contains(id, pairSep) {
		return false
	}
	for i := 0; i < len(id); i++ {
		c := id[i]
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9':
		case c == '.', c == '-', c == '@':
		default:
			return false
		}
	}
	// jsonstore 的 idRe 要求首字元是英數。
	c := id[0]
	return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
}

// pairKey 把兩個帳號 id 正規化成一個對稱的鍵，並回報這一對能不能存。
// ⭐ 這是整個檔案的重點：(A,B) 與 (B,A) 得到**同一個字串**。
func pairKey(x, y string) (key, lo, hi string, ok bool) {
	if x == y || !validPairID(x) || !validPairID(y) {
		return "", "", "", false
	}
	lo, hi = x, y
	if hi < lo {
		lo, hi = hi, lo
	}
	return lo + pairSep + hi, lo, hi, true
}

// RecordHeadToHead 把「winner 在 matchID 這一場贏了 loser」累加進那一對的唯一一列。
//
// 對同一個 matchID 冪等（見 h2hDedupeWindow）：重複的結算回呼已經被 Redis 的
// idempotency latch 擋掉，真正會走第二次的是**開機 WAL 重播**，而那條路一定帶著
// 同一個 matchId。
func (s *Service) RecordHeadToHead(ctx context.Context, matchID, winner, loser string, at time.Time) error {
	key, lo, hi, ok := pairKey(winner, loser)
	if !ok || s.store == nil {
		return nil
	}
	unlock := s.h2hLocks.Lock(key)
	defer unlock()

	var rec PairRecord
	if err := s.store.Get(ColHeadToHead, key, &rec); err != nil && !errors.Is(err, jsonstore.ErrNotFound) {
		return err
	}
	for _, id := range rec.RecentMatchIDs {
		if id == matchID {
			return nil // 這一場已經算過了
		}
	}
	rec.A, rec.B = lo, hi
	if winner == lo {
		rec.AWins++
	} else {
		rec.BWins++
	}
	if at.After(rec.LastAt) {
		rec.LastAt = at
	}
	rec.RecentMatchIDs = append([]string{matchID}, rec.RecentMatchIDs...)
	if len(rec.RecentMatchIDs) > h2hDedupeWindow {
		rec.RecentMatchIDs = rec.RecentMatchIDs[:h2hDedupeWindow]
	}
	_ = ctx
	return s.store.Put(ColHeadToHead, key, rec)
}

// HeadToHead 讀出「subject 對 opponent 幾勝幾敗」。從未對戰過（或這一對存不了）
// 回零值，⛔ 不是錯誤 —— 大部分的對戰組合本來就沒有紀錄。
func (s *Service) HeadToHead(ctx context.Context, subject, opponent string) (H2H, error) {
	key, lo, _, ok := pairKey(subject, opponent)
	if !ok || s.store == nil {
		return H2H{Opponent: opponent}, nil
	}
	var rec PairRecord
	if err := s.store.Get(ColHeadToHead, key, &rec); err != nil {
		if errors.Is(err, jsonstore.ErrNotFound) {
			return H2H{Opponent: opponent}, nil
		}
		return H2H{}, err
	}
	_ = ctx
	return projectPair(rec, subject, lo), nil
}

// HeadToHeadFor 列出 subject 打過的每一個對手（勝場多的在前）。這是後台那條唯讀
// 查詢用的。
//
// 成本是「集合索引掃一遍字串 + 只讀真的相關的那幾份檔」。⛔ 不預先建一份 per-account
// 的索引：那就是這個檔案開頭拒絕的「兩份會漂的資料」，而這條路只有管理員會走。
func (s *Service) HeadToHeadFor(ctx context.Context, subject string) ([]H2H, error) {
	if s.store == nil || !validPairID(subject) {
		return []H2H{}, nil
	}
	keys, err := s.store.List(ColHeadToHead)
	if err != nil {
		return nil, err
	}
	out := []H2H{}
	for _, key := range keys {
		if !strings.HasPrefix(key, subject+pairSep) && !strings.HasSuffix(key, pairSep+subject) {
			continue
		}
		var rec PairRecord
		if err := s.store.Get(ColHeadToHead, key, &rec); err != nil {
			continue // 讀不出來的一列不該讓整張表消失
		}
		if rec.A != subject && rec.B != subject {
			continue
		}
		out = append(out, projectPair(rec, subject, rec.A))
	}
	sortH2H(out)
	_ = ctx
	return out, nil
}

// projectPair 把一列對稱紀錄翻成「以 subject 為主詞」的投影。
func projectPair(rec PairRecord, subject, lo string) H2H {
	if subject == lo {
		return H2H{Opponent: rec.B, Wins: rec.AWins, Losses: rec.BWins, LastAt: rec.LastAt}
	}
	return H2H{Opponent: rec.A, Wins: rec.BWins, Losses: rec.AWins, LastAt: rec.LastAt}
}

// sortH2H 給後台一個穩定的順序：打得最多的在前，同場次再比對手 id。
func sortH2H(rows []H2H) {
	for i := 1; i < len(rows); i++ {
		for j := i; j > 0; j-- {
			a, b := rows[j-1], rows[j]
			if a.Played() > b.Played() || (a.Played() == b.Played() && a.Opponent <= b.Opponent) {
				break
			}
			rows[j-1], rows[j] = b, a
		}
	}
}
