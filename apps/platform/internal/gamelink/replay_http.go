package gamelink

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/httpx"
)

// ReplayHandlers exposes the admin-gated replay surface (task #175). It is a
// thin proxy to the game server's private /_internal/replays API — the platform
// stores no recording, it only forwards an ADMIN's request with a fresh HMAC
// signature. Kept in the gamelink package because that is where the signed
// game-server client (Service) already lives; mounted from server.go behind the
// same AdminOnly gate the curation / combat-env consoles use, so no admin
// service wiring changes.
type ReplayHandlers struct {
	svc       *Service
	adminOnly func(http.Handler) http.Handler
}

// NewReplayHandlers wraps the gamelink service with an admin gate.
func NewReplayHandlers(svc *Service, adminOnly func(http.Handler) http.Handler) *ReplayHandlers {
	return &ReplayHandlers{svc: svc, adminOnly: adminOnly}
}

// Mount registers /admin/replays* on an already-authenticated subrouter.
func (h *ReplayHandlers) Mount(r chi.Router) {
	r.Route("/admin/replays", func(ar chi.Router) {
		ar.Use(h.adminOnly)
		ar.Get("/", h.list)
		ar.Get("/{id}", h.get)
		ar.Post("/{id}/ticket", h.ticket)
	})
}

func (h *ReplayHandlers) list(w http.ResponseWriter, r *http.Request) {
	raw, err := h.svc.ListReplays(r.Context())
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	writeRaw(w, raw)
}

func (h *ReplayHandlers) get(w http.ResponseWriter, r *http.Request) {
	raw, err := h.svc.GetReplay(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	writeRaw(w, raw)
}

func (h *ReplayHandlers) ticket(w http.ResponseWriter, r *http.Request) {
	raw, err := h.svc.MintReplayTicket(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	writeRaw(w, raw)
}

// writeRaw forwards the game server's JSON body verbatim (already an object).
//
// The body DOES carry player-supplied text (recordings hold a displayName per
// seat), so the XSS question is real rather than rule noise. It is not XSS here
// because nothing ever puts these bytes in an HTML sink: the only consumer is the
// admin console, which renders them through React JSX interpolation
// (apps/admin/src/ui/ReplaysPage.tsx) and contains no dangerouslySetInnerHTML /
// innerHTML anywhere in apps/admin/src. The response is typed application/json,
// which browsers do not sniff into HTML, and the route is admin-gated.
//
// Two of those layers used to live outside this module, so they are made local:
// nosniff was set only by the edge (nginx.conf), which is absent in dev, on the
// LAN vite proxy, or on any direct :8080 exposure — this now sets its own header;
// and the body was forwarded without ever being checked to BE JSON, so a 200
// carrying HTML would have been relayed under a JSON content type. json.Valid
// closes that. Both are defense in depth: neither was exploitable on its own.
func writeRaw(w http.ResponseWriter, raw []byte) {
	if !json.Valid(raw) {
		httpx.WriteError(w, httpx.Err(http.StatusBadGateway, "game_rejected",
			"game server returned a non-JSON body"))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	// #nosec G705 -- see above: JSON-validated, typed application/json, nosniff
	// set here rather than borrowed from the edge, admin-gated, and the sole
	// renderer escapes via JSX with no innerHTML sink.
	_, _ = w.Write(raw)
}
