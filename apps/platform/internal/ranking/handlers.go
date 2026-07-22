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
