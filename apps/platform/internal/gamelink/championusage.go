package gamelink

// championusage.go — GH#645 大廳英雄排行榜：英雄「被選用次數」的排行榜。
//
// owner 2026-08-24（逐字）：
//
//	「大廳的英雄排行榜 是英雄被選用次數來排序的排行榜，只是額外會顯示勝率，
//	 所以不用選英雄來顯示」
//
// ⇒ 排序鍵＝被選用次數（picks desc），勝率是附帶欄；⛔ 不需要先選英雄。
//
// 資料來源刻意是結算路徑已經寫下的耐久事實 data/matches/YYYY/MM/<id>.json
// （settle.go 的 jsonstore.Put，以 matchId 為鍵、last-writer-wins），
// ⛔ 不是一組新的「結算時累加」計數器：Put 天生讓 WAL 重播／重複回呼收斂，
// 這裡完全沒有第二份要保持一致的狀態（第〇·四守則：同一個數字不開第二個住處），
// 而且歷史對戰從上線那一刻就已經算在榜上，不必等新資料累積。
//
// 計數規則（每一條都是可反駁的選擇，⛔ 不是漏想）：
//   - 只算 Status=="completed" —— abandoned 沒有可信的名次，讓它進分母
//     等於讓勝率說謊（第一·五守則）。
//   - ⛔ 不算 bot 席位 —— 「被『選用』」是玩家的選擇；bot 的英雄是系統填的。
//   - 勝 = 該席位隊伍 Place==1（與結算的 wins 計數同一個定義）。

import (
	"encoding/json"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/httpx"
)

// ChampionUsageRow is one row of the lobby 英雄榜: a champion, how many times
// human players picked it, and how it fared. Sorted picks-desc by Rows.
type ChampionUsageRow struct {
	ChampionID string `json:"championId"`
	// Picks counts completed-match human seats that played this champion —
	// the SORT KEY (owner 2026-08-24).
	Picks int `json:"picks"`
	Wins  int `json:"wins"`
	// WinRate is Wins/Picks in 0..1 (0 when Picks is 0). The auxiliary column.
	WinRate float64 `json:"winRate"`
}

// championUsageTTL bounds how often the matches tree is re-walked: the board
// is a lobby side panel, staleness of half a minute is invisible, and the walk
// reads every match record ever settled.
const championUsageTTL = 30 * time.Second

// ChampionUsage serves the pick-count champion board off the durable match
// records, with a small TTL cache in front of the tree walk.
type ChampionUsage struct {
	store *jsonstore.Store
	now   func() time.Time

	mu       sync.Mutex
	cached   []ChampionUsageRow
	cachedAt time.Time
}

// NewChampionUsage builds the board reader over the settlement store.
func NewChampionUsage(store *jsonstore.Store) *ChampionUsage {
	return &ChampionUsage{store: store, now: time.Now}
}

// MountPublic registers the unauthenticated board read. Public for the same
// reason /ranking/player is: it carries no player names, and the lobby panel
// renders it before any champion (or login) is chosen.
func (u *ChampionUsage) MountPublic(r chi.Router) {
	r.Get("/ranking/champion-usage", u.get)
}

func (u *ChampionUsage) get(w http.ResponseWriter, r *http.Request) {
	rows, err := u.Rows()
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"rows": rows})
}

// Rows returns the champion board, sorted by picks desc (wins desc, then
// championId asc so equal counts order deterministically), re-walking the
// matches tree at most once per championUsageTTL.
func (u *ChampionUsage) Rows() ([]ChampionUsageRow, error) {
	u.mu.Lock()
	defer u.mu.Unlock()
	if u.cached != nil && u.now().Sub(u.cachedAt) < championUsageTTL {
		return u.cached, nil
	}
	rows, err := u.aggregate()
	if err != nil {
		return nil, err
	}
	u.cached, u.cachedAt = rows, u.now()
	return rows, nil
}

func (u *ChampionUsage) aggregate() ([]ChampionUsageRow, error) {
	picks := map[string]int{}
	wins := map[string]int{}
	err := u.walkSettlements(func(st Settlement) {
		if st.Status != "completed" {
			return
		}
		placeOf := map[int]int{}
		for _, p := range st.Placements {
			placeOf[p.Team] = p.Place
		}
		for _, seat := range st.Seats {
			if seat.IsBot || seat.ChampionID == "" {
				continue
			}
			picks[seat.ChampionID]++
			if placeOf[seat.Team] == 1 {
				wins[seat.ChampionID]++
			}
		}
	})
	if err != nil {
		return nil, err
	}
	rows := make([]ChampionUsageRow, 0, len(picks))
	for id, n := range picks {
		row := ChampionUsageRow{ChampionID: id, Picks: n, Wins: wins[id]}
		if n > 0 {
			row.WinRate = float64(row.Wins) / float64(n)
		}
		rows = append(rows, row)
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].Picks != rows[j].Picks {
			return rows[i].Picks > rows[j].Picks
		}
		if rows[i].Wins != rows[j].Wins {
			return rows[i].Wins > rows[j].Wins
		}
		return rows[i].ChampionID < rows[j].ChampionID
	})
	return rows, nil
}

// walkSettlements reads every match record under data/matches. Same symlink
// confinement as admin.walkMatches (gosec G122): WalkDir lstats but ReadFile
// FOLLOWS a link, so every open goes through an *os.Root pinned to the tree.
// (admin imports gamelink, so the walker cannot be shared from there.)
func (u *ChampionUsage) walkSettlements(visit func(Settlement)) error {
	root := filepath.Join(u.store.Root(), "matches")
	rootDir, err := os.OpenRoot(root)
	if err != nil {
		if os.IsNotExist(err) {
			return nil // no matches yet — an empty board, not an error
		}
		return err
	}
	defer func() { _ = rootDir.Close() }()
	return filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil // tolerate a partial/racing tree, like admin.walkMatches
		}
		if d.IsDir() || !d.Type().IsRegular() {
			return nil
		}
		name := d.Name()
		if !strings.HasSuffix(name, ".json") || name == "_index.json" {
			return nil
		}
		rel, relErr := filepath.Rel(root, p)
		if relErr != nil {
			return nil
		}
		f, openErr := rootDir.Open(rel)
		if openErr != nil {
			return nil
		}
		data, readErr := io.ReadAll(f)
		_ = f.Close()
		if readErr != nil {
			return nil
		}
		var st Settlement
		if json.Unmarshal(data, &st) == nil && st.MatchID != "" {
			visit(st)
		}
		return nil
	})
}
