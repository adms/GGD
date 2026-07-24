package opsenv

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/httpx"
)

// publicMaxAgeSeconds bounds how stale a NEWLY created match's ops table may
// be. Short on purpose, and harmless: the only live-safe knob (maxRooms) is
// read at the create attempt, so "within 10 s" is the whole latency of an
// operator's edit reaching the shard.
const publicMaxAgeSeconds = "10"

// Handlers exposes the server-ops REST surface:
//
//	GET /api/v1/server-ops        public, cacheable — the game-server reads
//	                              the table without a token at match creation
//	                              (whitelist / combat-env precedent)
//	GET /api/v1/admin/server-ops  admin only — table + descriptors + the
//	                              read-only inventory
//	PUT /api/v1/admin/server-ops  admin only — replace (strict validation)
type Handlers struct {
	svc *Service
	// adminOnly is the admin-role gate (admin.Service.AdminOnly), injected so
	// this package does not depend on the admin service to serve reads.
	adminOnly func(http.Handler) http.Handler
}

// NewHandlers wires handlers around the service. adminOnly must be the
// platform's admin-role middleware; it runs after auth.Middleware.
func NewHandlers(svc *Service, adminOnly func(http.Handler) http.Handler) *Handlers {
	return &Handlers{svc: svc, adminOnly: adminOnly}
}

// MountPublic registers the unauthenticated read endpoint on /api/v1.
func (h *Handlers) MountPublic(r chi.Router) {
	r.Get("/server-ops", h.getPublic)
}

// Mount registers the admin-gated endpoints on an already-authenticated
// subrouter (auth.Middleware must run first).
func (h *Handlers) Mount(r chi.Router) {
	r.Group(func(ar chi.Router) {
		if h.adminOnly != nil {
			ar.Use(h.adminOnly)
		}
		ar.Get("/admin/server-ops", h.getAdmin)
		ar.Put("/admin/server-ops", h.put)
	})
}

// getPublic serves the table the game-server merges OVER its COMPILED defaults,
// stored keys winning per key. So an UNCONFIGURED platform must say "I have no
// opinion" — an empty values map — and NOT the defaults-filled table, which
// would push the platform's numbers over a shard that configured itself through
// GGD_MAX_ROOMS / GGD_SNAPSHOT_HZ. Once an operator saves anything the full
// table ships, because at that point every value is a deliberate choice (PUT
// semantics: omitted keys reset to the compiled default). Empty map, never nil:
// the game-server's parse rejects a null values object as malformed and would
// fail safe for the wrong reason.
func (h *Handlers) getPublic(w http.ResponseWriter, r *http.Request) {
	doc, stored, err := h.svc.GetStored()
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	if !stored {
		doc.Values = map[string]float64{}
	}
	w.Header().Set("Cache-Control", "public, max-age="+publicMaxAgeSeconds)
	httpx.WriteJSON(w, http.StatusOK, doc)
}

// adminResp is the console's whole payload: the saved table, whether it has
// ever been saved, the compiled defaults, the writable knob descriptors (bounds
// + zh-Hant copy + safety class) and the read-only inventory.
//
// The descriptors ship FROM THE SERVER on purpose. The bounds then exist
// exactly once, so the console cannot render a range the validator does not
// enforce — one level up from the drift guard, and the structural fix for the
// class of bug where a knob was editable in one place and invisible in another.
type adminResp struct {
	Doc Doc `json:"doc"`
	// Stored is false when no operator has ever saved. The console renders
	// 「尚未設定（使用內建預設值）」 rather than implying the defaults were chosen.
	Stored      bool               `json:"stored"`
	Defaults    map[string]float64 `json:"defaults"`
	Descriptors []Descriptor       `json:"descriptors"`
	Info        []InfoItem         `json:"info"`
	// ClientInterpDelayMs is the fleet fact behind the coupled snapshot rule, so
	// the console can show the derived line instead of a second editable field.
	ClientInterpDelayMs int `json:"clientInterpDelayMs"`
}

func (h *Handlers) getAdmin(w http.ResponseWriter, r *http.Request) {
	doc, stored, err := h.svc.GetStored()
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, adminResp{
		Doc:                 doc,
		Stored:              stored,
		Defaults:            Defaults(),
		Descriptors:         Descriptors,
		Info:                h.svc.Info(),
		ClientInterpDelayMs: ClientInterpDelayMs,
	})
}

// putReq is the PUT body. Values may be sparse — omitted keys reset to the
// compiled default (the body is the complete desired state).
type putReq struct {
	Values map[string]float64 `json:"values"`
}

func (h *Handlers) put(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var req putReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	doc, err := h.svc.Replace(r.Context(), req.Values)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	h.svc.Audit(me.AccountID, "opsenv.replace", map[string]any{
		"nonDefault": NonDefault(doc),
		"version":    doc.Version,
	})
	httpx.WriteJSON(w, http.StatusOK, adminResp{
		Doc:                 doc,
		Stored:              true,
		Defaults:            Defaults(),
		Descriptors:         Descriptors,
		Info:                h.svc.Info(),
		ClientInterpDelayMs: ClientInterpDelayMs,
	})
}
