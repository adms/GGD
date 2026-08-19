package ranking

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/httpx"
)

// Handlers exposes the ranking REST surface.
type Handlers struct {
	svc *Service
}

// NewHandlers wires the handlers.
func NewHandlers(svc *Service) *Handlers { return &Handlers{svc: svc} }

// MountPublic registers unauthenticated routes.
func (h *Handlers) MountPublic(r chi.Router) {
	r.Get("/ranking/leaderboard", h.leaderboard)             // hidden MMR ladder (unchanged)
	r.Get("/ranking/player", h.playerBoard)                  // visible points PLAYER board
	r.Get("/ranking/champion/{championId}", h.championBoard) // visible points CHAMPION board
}

// MountAuthed registers authenticated routes.
func (h *Handlers) MountAuthed(r chi.Router) {
	r.Get("/ranking/me", h.me)                    // hidden MMR standing (unchanged)
	r.Get("/ranking/player/me", h.playerMe)       // caller's points/tier/division/rank
	r.Get("/ranking/me/champions", h.myChampions) // caller's per-champion standings
}

// MountPlayable registers routes that need auth AND the playable gate.
//
// ⭐ 宿敵榜住在這裡而不是 MountAuthed,理由跟 `/lobby/online` 一模一樣(#210):
// 它會**把別人的名字交出去**。範圍窄得多(只有呼叫者真的同場打過的人),但被封鎖
// 或還沒核准的帳號手上仍可能有一張沒過期的 token —— 那正是 #210 記錄下來的那次。
// ⛔ 不要為了少一個 Group 把它搬回上面。
func (h *Handlers) MountPlayable(r chi.Router) {
	r.Get("/ranking/me/nemesis", h.myNemesis) // caller's 宿敵排行榜 (GH#454)
}

func qint(r *http.Request, key string, def int) int {
	if v := r.URL.Query().Get(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func (h *Handlers) leaderboard(w http.ResponseWriter, r *http.Request) {
	page := qint(r, "page", 1)
	pageSize := qint(r, "pageSize", 20)
	entries, total, err := h.svc.Page(r.Context(), page, pageSize)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	if entries == nil {
		entries = []Entry{}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"season":  h.svc.Season(),
		"page":    page,
		"total":   total,
		"entries": entries,
	})
}

func (h *Handlers) me(w http.ResponseWriter, r *http.Request) {
	id := auth.MustIdentity(r.Context())
	rank, mmr, found, err := h.svc.Me(r.Context(), id.AccountID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	resp := map[string]any{"season": h.svc.Season(), "ranked": found}
	if found {
		resp["rank"] = rank + 1
		resp["mmr"] = mmr
		if around, err := h.svc.AroundMe(r.Context(), id.AccountID, 5); err == nil {
			resp["around"] = around
		}
	}
	httpx.WriteJSON(w, http.StatusOK, resp)
}

// playerBoard: GET /ranking/player?season=&limit=&offset= — the visible
// cumulative-points player board (public).
func (h *Handlers) playerBoard(w http.ResponseWriter, r *http.Request) {
	season := r.URL.Query().Get("season")
	limit := qint(r, "limit", 20)
	offset := qint(r, "offset", 0)
	entries, total, err := h.svc.PlayerPage(r.Context(), season, limit, offset)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	if entries == nil {
		entries = []PointsRow{}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"season": h.svc.seasonOr(season), "total": total, "limit": limit, "offset": offset,
		"entries": entries,
	})
}

// playerMe: GET /ranking/player/me — the caller's points/tier/division/rank
// and percentile on the player board (authed).
func (h *Handlers) playerMe(w http.ResponseWriter, r *http.Request) {
	id := auth.MustIdentity(r.Context())
	season := r.URL.Query().Get("season")
	me, found, err := h.svc.PlayerMe(r.Context(), season, id.AccountID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	resp := map[string]any{"season": h.svc.seasonOr(season), "ranked": found}
	if found {
		resp["points"] = me.Points
		resp["tier"] = me.Tier
		resp["division"] = me.Division
		resp["rank"] = me.Rank
		resp["percentile"] = me.Percentile
	}
	httpx.WriteJSON(w, http.StatusOK, resp)
}

// championBoard: GET /ranking/champion/{championId}?limit=&offset= — the
// visible per-champion points board (public).
func (h *Handlers) championBoard(w http.ResponseWriter, r *http.Request) {
	championID := chi.URLParam(r, "championId")
	limit := qint(r, "limit", 20)
	offset := qint(r, "offset", 0)
	entries, total, err := h.svc.ChampionPage(r.Context(), championID, limit, offset)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	if entries == nil {
		entries = []PointsRow{}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"season": h.svc.Season(), "championId": championID, "total": total,
		"limit": limit, "offset": offset, "entries": entries,
	})
}

// myChampions: GET /ranking/me/champions — the caller's per-champion standings
// (authed).
func (h *Handlers) myChampions(w http.ResponseWriter, r *http.Request) {
	id := auth.MustIdentity(r.Context())
	rows, err := h.svc.MyChampions(r.Context(), id.AccountID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	if rows == nil {
		rows = []ChampionRow{}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"season": h.svc.Season(), "champions": rows,
	})
}

// myNemesis: GET /ranking/me/nemesis?sort=&limit= — 大廳「宿敵排行榜」(GH#454)。
//
// ⭐ 它只回**呼叫者自己**的宿敵，帳號 id 來自 token 而不是查詢字串：一個人的對戰
// 紀錄是他跟誰打過的清單,⛔ 不該讓任何人拿別人的 id 換到。要看別人的那條路是
// 後台的 `/admin/accounts/{id}/headtohead`,而那條在 AdminOnly 後面。
//
// `sort` / `limit` 回寫進回應是刻意的:兩者都會被伺服器夾（見 ParseNemesisSort /
// NemesisBoard），而**被夾掉卻不說**正是 #279 的形狀。
func (h *Handlers) myNemesis(w http.ResponseWriter, r *http.Request) {
	id := auth.MustIdentity(r.Context())
	sortBy := ParseNemesisSort(r.URL.Query().Get("sort"))
	limit := qint(r, "limit", DefaultNemesisLimit)
	rows, err := h.svc.NemesisBoard(r.Context(), id.AccountID, sortBy, limit)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	if rows == nil {
		rows = []NemesisRow{}
	}
	if limit <= 0 {
		limit = DefaultNemesisLimit
	}
	if limit > MaxNemesisLimit {
		limit = MaxNemesisLimit
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"sort": string(sortBy), "limit": limit, "rivals": rows,
	})
}
