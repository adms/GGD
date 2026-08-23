package gamelink

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/httpx"
)

// Damage-board proxying (#636). The board itself lives in Redis, written by the
// game server at each match's close (apps/game-server/src/stats/damageBoard.ts);
// the admin console reads it through this platform proxy so a single admin
// session gates the whole surface. Same posture as the replay proxy: the
// platform stores nothing, it forwards the admin's request with a fresh HMAC
// signature over the private /_internal channel. The response carries no
// player-supplied text (seat/champion/ability ids and numbers only), and the
// admin UI renders it through React JSX interpolation regardless.

// DamageBoard fetches one page of the board from the game server.
// offset/count are already-validated non-negative ints (the handler parses).
func (s *Service) DamageBoard(ctx context.Context, offset, count int) (json.RawMessage, error) {
	q := "/_internal/damage-board?offset=" + strconv.Itoa(offset)
	if count > 0 {
		q += "&count=" + strconv.Itoa(count)
	}
	return s.replayGet(ctx, q)
}

// DamageBoardHandlers exposes GET /admin/damage-board behind the same AdminOnly
// gate as the replay browser.
type DamageBoardHandlers struct {
	svc       *Service
	adminOnly func(http.Handler) http.Handler
}

func NewDamageBoardHandlers(svc *Service, adminOnly func(http.Handler) http.Handler) *DamageBoardHandlers {
	return &DamageBoardHandlers{svc: svc, adminOnly: adminOnly}
}

// Mount registers /admin/damage-board on an already-authenticated subrouter.
func (h *DamageBoardHandlers) Mount(r chi.Router) {
	r.Route("/admin/damage-board", func(ar chi.Router) {
		ar.Use(h.adminOnly)
		ar.Get("/", h.get)
	})
}

func (h *DamageBoardHandlers) get(w http.ResponseWriter, r *http.Request) {
	// Bound the two ints locally: negative or garbage collapses to 0 (first
	// page), count is capped so an admin typo cannot ask Redis for the world.
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if offset < 0 {
		offset = 0
	}
	count, _ := strconv.Atoi(r.URL.Query().Get("count"))
	if count < 0 || count > 1000 {
		count = 0
	}
	raw, err := h.svc.DamageBoard(r.Context(), offset, count)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	writeRaw(w, raw)
}
