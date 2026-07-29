package matchstats

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/gamelink"
	"github.com/ggd/platform/internal/httpx"
)

// IngestPath is the ONE route that carries a match ledger. internal/server
// exempts exactly this path (exact match, never a prefix) from the global 1 MiB
// request-body cap, so the constant is exported and both sides are pinned to it
// in TestIngestPathIsExemptFromTheGlobalBodyCap.
//
// ⚠️ IT HAS NO PATH PARAMETER, AND THAT IS THE REASON. The cap exemption in
// internal/server is an EXACT string match on purpose — a prefix exemption
// silently enlarges every future route added under the same subtree. A
// `/internal/matches/{matchId}/stats` shape could not be exempted that way, so
// the match id travels in the BODY and the id comparison happens between the
// body's own two copies (`matchId` vs `ledger.matchId`), which is the same
// check either way. See validate.go's checkEnvelopeMatchID.
const IngestPath = "/api/v1/internal/match-stats"

// listLimit bounds one page of the review index. 200 rows is roughly half a
// year of family play and keeps the response well inside a screen's worth of
// scrolling; the ledger bodies are not in it (see Summary).
const listLimit = 200

// IngestRequest is the inbound body from the game-server.
//
// EndedAt is unix ms and REQUIRED: it selects the storage partition, and it must
// be the SAME value the settlement callback carried, or the review screen's join
// between data/matches/YYYY/MM and data/match-stats/YYYY/MM lands in two
// different months. Defaulting it to "now" here would make that split silent,
// so a zero is refused instead.
type IngestRequest struct {
	MatchID string `json:"matchId"`
	// GameVersion is the game-server build stamp. Optional on the wire — an old
	// game-server does not send it — and NEVER invented on this side: an empty
	// stamp is an honest "unknown build", a guessed one poisons every
	// version-over-version comparison this data exists to make.
	GameVersion string          `json:"gameVersion"`
	EndedAt     int64           `json:"endedAt"`
	Ledger      json.RawMessage `json:"ledger"`
}

// IngestAck tells the game-server what the platform actually kept.
//
// `dropped` is on the wire for the same reason gamelink's resultAck carries
// `settled`: a bare {"status":"ok"} let a completely mis-shaped payload look
// healthy for the entire project. A game-server that logs "stored, 12 dropped"
// makes a schema drift visible on the day it starts, in the log of the process
// that produced the data.
type IngestAck struct {
	Status  string `json:"status"`
	MatchID string `json:"matchId"`
	Dropped int    `json:"dropped"`
	// Versions echoes what was stamped, so the sender can see that its own
	// build id arrived (an empty `game` here means the sender never sent one).
	Versions Versions `json:"versions"`
}

// Handlers exposes the match-stats surface (task #207):
//
//	POST /api/v1/internal/match-stats     HMAC — the game-server submits a ledger
//	GET  /api/v1/admin/match-stats        admin — the review index
//	GET  /api/v1/admin/match-stats/{id}   admin — one full ledger
//
// The reads are ADMIN-GATED, not public. A ledger names every seat's champion,
// every item bought and every 三選一 declined for identifiable accounts; it is
// player behaviour, not content. The same call internal/gamelink made for
// /admin/replays, and for the same reason.
type Handlers struct {
	svc       *Service
	adminOnly func(http.Handler) http.Handler
	secret    string
	skew      time.Duration
	now       func() time.Time
}

// NewHandlers wires handlers around the service. adminOnly must be the
// platform's admin-role middleware; secret/skew are the internal HMAC channel's
// (identical to the settlement callback's — same sender, same trust).
func NewHandlers(svc *Service, adminOnly func(http.Handler) http.Handler, secret string, skew time.Duration) *Handlers {
	// FAIL-CLOSED AT WIRING TIME. Wiring nil must crash on boot, never mount an
	// admin surface with no authorization; see internal/server/adminsurface_test.go.
	if adminOnly == nil {
		panic("matchstats: adminOnly middleware is required; an admin surface must never mount unguarded")
	}
	return &Handlers{svc: svc, adminOnly: adminOnly, secret: secret, skew: skew, now: time.Now}
}

// SetNow overrides the clock used by the HMAC skew guard (tests).
func (h *Handlers) SetNow(fn func() time.Time) { h.now = fn }

// MountInternal registers the HMAC-guarded ingest route. Never exposed through
// the public edge — same channel as the settlement callback.
func (h *Handlers) MountInternal(r chi.Router) {
	r.Post("/internal/match-stats", h.ingest)
}

// Mount registers the admin-gated read surface on an authenticated subrouter.
func (h *Handlers) Mount(r chi.Router) {
	r.Route("/admin/match-stats", func(ar chi.Router) {
		ar.Use(h.adminOnly)
		ar.Get("/", h.list)
		ar.Get("/{matchId}", h.get)
	})
}

func (h *Handlers) ingest(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, MaxRecordBytes+(1<<16)))
	if err != nil {
		httpx.WriteError(w, httpx.BadRequest("unreadable body"))
		return
	}
	if !gamelink.Verify(h.secret, r.Header.Get(gamelink.HeaderTimestamp), r.Header.Get(gamelink.HeaderAuth),
		body, h.now(), h.skew) {
		httpx.WriteError(w, httpx.Unauthorized("invalid internal signature"))
		return
	}
	var req IngestRequest
	if err := json.Unmarshal(body, &req); err != nil {
		httpx.WriteError(w, httpx.BadRequest("invalid JSON body"))
		return
	}
	if req.MatchID == "" {
		httpx.WriteError(w, httpx.BadRequest("matchId is required"))
		return
	}
	if req.EndedAt <= 0 {
		httpx.WriteError(w, httpx.BadRequest(
			"endedAt (unix ms) is required — it selects the storage partition and must be the SAME "+
				"value this match's settlement callback carried, or the review screen cannot join the two"))
		return
	}
	if len(req.Ledger) == 0 {
		httpx.WriteError(w, httpx.BadRequest("ledger is required"))
		return
	}

	clean, dropped, verr := Sanitize(req.MatchID, req.Ledger)
	if verr != nil {
		httpx.WriteError(w, verr)
		return
	}
	rec, err := h.svc.Put(Ingest{
		MatchID:     req.MatchID,
		GameVersion: req.GameVersion,
		EndedAt:     time.UnixMilli(req.EndedAt),
		Ledger:      clean,
		Dropped:     dropped,
	})
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	if len(dropped) > 0 {
		// Logged as a WARNING on the platform too, not only echoed: the sender
		// may not log its acks, and a schema drift that only ever shows up in a
		// JSON response nobody reads is a drift nobody notices.
		slog.Warn("matchstats: stored a ledger with refused elements",
			"matchId", rec.MatchID, "dropped", len(dropped), "detail", DropSummary(dropped))
	}
	httpx.WriteJSON(w, http.StatusOK, IngestAck{
		Status: "ok", MatchID: rec.MatchID, Dropped: len(dropped), Versions: rec.Version,
	})
}

// listResponse is the review index.
type listResponse struct {
	Matches []Summary `json:"matches"`
	// Unreadable counts records on disk that could not be decoded. Surfaced
	// rather than swallowed: "37 matches" when there are 39 files is the shape
	// of a silent data loss.
	Unreadable int `json:"unreadable"`
}

func (h *Handlers) list(w http.ResponseWriter, r *http.Request) {
	rows, unreadable := h.svc.List(listLimit)
	httpx.WriteJSON(w, http.StatusOK, listResponse{Matches: rows, Unreadable: unreadable})
}

func (h *Handlers) get(w http.ResponseWriter, r *http.Request) {
	rec, err := h.svc.Get(chi.URLParam(r, "matchId"))
	if err != nil {
		httpx.WriteError(w, httpx.NotFound("no match-stats record for that match"))
		return
	}
	httpx.WriteJSON(w, http.StatusOK, rec)
}
