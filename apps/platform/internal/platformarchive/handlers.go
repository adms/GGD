package platformarchive

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/httpx"
)

// StagePath is the ONE route allowed to carry a large body. internal/server
// exempts exactly this path (exact match, never a prefix) from the global
// request-body cap, and nginx has a matching `location =` block. Exported so
// both sides can be pinned to the same constant in tests.
const StagePath = "/api/v1/admin/platform-archive/stage"

// ExportPath is the streaming download route (nginx turns response buffering
// off for it).
const ExportPath = "/api/v1/admin/platform-archive/export"

// Handlers exposes the archive REST surface. Everything is admin-gated, and
// the two DANGEROUS verbs (export, commit) additionally re-confirm the caller's
// own password.
//
//	POST   /admin/platform-archive/preview      size each group
//	POST   /admin/platform-archive/export       stream a zip  (password)
//	POST   /admin/platform-archive/stage        upload + verify
//	POST   /admin/platform-archive/plan         dry run
//	POST   /admin/platform-archive/commit       backup + write (password)
//	DELETE /admin/platform-archive/stage/{id}   drop the upload
//	DELETE /admin/platform-archive/backups/{stamp}  drop one pre-import backup
//	GET    /admin/platform-archive/status       stage / backups / disk
//
// EXPORT IS A POST, NOT A GET, deliberately: it carries a body (the scope and
// the password re-confirmation), it must not be cacheable, bookmarkable or
// prefetchable, and its parameters must not land in an nginx access log.
type Handlers struct {
	svc       *Service
	adminOnly func(http.Handler) http.Handler
}

// NewHandlers wires handlers around the service. adminOnly must be the
// platform's admin-role middleware; it runs after auth.Middleware.
func NewHandlers(svc *Service, adminOnly func(http.Handler) http.Handler) *Handlers {
	// FAIL-CLOSED AT WIRING TIME. Until 2026-07-27 every one of these packages
	// wrote `if h.adminOnly != nil { ar.Use(h.adminOnly) }`, so passing nil here
	// SILENTLY mounted an admin surface with no authorization at all — it did not
	// fail to compile, and no test went red. A missing gate must be a crash on
	// boot, never a quietly open door.
	if adminOnly == nil {
		panic("platformarchive: adminOnly middleware is required; an admin surface must never mount unguarded")
	}
	return &Handlers{svc: svc, adminOnly: adminOnly}
}

// Mount registers the routes on an already-authenticated subrouter.
func (h *Handlers) Mount(r chi.Router) {
	r.Route("/admin/platform-archive", func(ar chi.Router) {
		ar.Use(h.adminOnly)
		ar.Get("/status", h.status)
		ar.Post("/preview", h.preview)
		ar.Post("/export", h.export)
		ar.Post("/stage", h.stage)
		ar.Post("/plan", h.plan)
		ar.Post("/commit", h.commit)
		ar.Delete("/stage/{id}", h.discard)
		ar.Delete("/backups/{stamp}", h.deleteBackup)
	})
}

type scopeReq struct {
	Groups          []string `json:"groups"`
	ConfirmPassword string   `json:"confirmPassword"`
}

type stageRefReq struct {
	StageID           string   `json:"stageId"`
	Groups            []string `json:"groups"`
	AllowOverwrite    bool     `json:"allowOverwrite"`
	ResolveCollisions string   `json:"resolveCollisions"`
	PlanDigest        string   `json:"planDigest"`
	ConfirmPassword   string   `json:"confirmPassword"`
}

func (r stageRefReq) planOptions() PlanOptions {
	return PlanOptions{
		Groups:            r.Groups,
		AllowOverwrite:    r.AllowOverwrite,
		ResolveCollisions: r.ResolveCollisions,
	}
}

func (h *Handlers) status(w http.ResponseWriter, r *http.Request) {
	st, err := h.svc.Status()
	if err != nil {
		httpx.WriteError(w, httpx.Internal(err.Error()))
		return
	}
	noStore(w)
	httpx.WriteJSON(w, http.StatusOK, st)
}

func (h *Handlers) preview(w http.ResponseWriter, r *http.Request) {
	pv, err := h.svc.Preview()
	if err != nil {
		httpx.WriteError(w, httpx.Internal(err.Error()))
		return
	}
	noStore(w)
	httpx.WriteJSON(w, http.StatusOK, pv)
}

func (h *Handlers) export(w http.ResponseWriter, r *http.Request) {
	var req scopeReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if req.ConfirmPassword == "" {
		httpx.WriteError(w, httpx.BadRequest("請輸入你自己的登入密碼確認 —— 光有登入狀態不足以匯出全家人的密碼雜湊"))
		return
	}
	me := auth.MustIdentity(r.Context())

	// The response headers must go out BEFORE the zip starts streaming, and
	// the password check must happen BEFORE the headers — otherwise a wrong
	// password would arrive as a 200 attachment containing an error. onReady is
	// the seam: the service calls it once, after the re-auth and before the
	// first byte. Content-Length is deliberately unset (the zip is produced on
	// the fly); chunked transfer is what lets a large export start immediately
	// instead of being buffered whole in RAM.
	rec := &firstWriteObserver{ResponseWriter: w}
	_, err := h.svc.Export(r.Context(), me.AccountID, req.ConfirmPassword, req.Groups, rec, func() {
		host := h.svc.Hostname()
		w.Header().Set("Content-Type", "application/zip")
		w.Header().Set("Content-Disposition",
			`attachment; filename="`+ArchiveFileName(host, h.svc.now())+`"`)
		noStore(w)
		w.WriteHeader(http.StatusOK)
	})
	if err != nil {
		if rec.wrote {
			// Already streaming: the only honest thing left is to cut the
			// connection, so the client sees a truncated download rather than a
			// zip with a plausible-looking tail.
			panic(http.ErrAbortHandler)
		}
		httpx.WriteError(w, err)
		return
	}
}

// firstWriteObserver records whether any body byte has been written, so the
// error path can tell "nothing sent yet" from "already streaming".
type firstWriteObserver struct {
	http.ResponseWriter
	wrote bool
}

func (s *firstWriteObserver) Write(p []byte) (int, error) {
	s.wrote = true
	return s.ResponseWriter.Write(p)
}

func (h *Handlers) stage(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	res, err := h.svc.Stage(me.AccountID, r.Body, r.ContentLength)
	if err != nil {
		httpx.WriteError(w, stageError(err))
		return
	}
	noStore(w)
	httpx.WriteJSON(w, http.StatusOK, res)
}

func (h *Handlers) plan(w http.ResponseWriter, r *http.Request) {
	var req stageRefReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	me := auth.MustIdentity(r.Context())
	plan, err := h.svc.Plan(me.AccountID, req.StageID, req.planOptions())
	if err != nil {
		httpx.WriteError(w, stageError(err))
		return
	}
	noStore(w)
	httpx.WriteJSON(w, http.StatusOK, plan)
}

func (h *Handlers) commit(w http.ResponseWriter, r *http.Request) {
	var req stageRefReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if req.ConfirmPassword == "" {
		httpx.WriteError(w, httpx.BadRequest("請再輸入一次你自己的登入密碼"))
		return
	}
	me := auth.MustIdentity(r.Context())
	res, err := h.svc.Commit(r.Context(), me.AccountID, req.ConfirmPassword, req.StageID, req.PlanDigest, req.planOptions())
	if err != nil {
		httpx.WriteError(w, stageError(err))
		return
	}
	noStore(w)
	httpx.WriteJSON(w, http.StatusOK, res)
}

func (h *Handlers) discard(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	if err := h.svc.Discard(me.AccountID, chi.URLParam(r, "id")); err != nil {
		httpx.WriteError(w, stageError(err))
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "discarded"})
}

// deleteBackup removes ONE pre-import backup by its UTC stamp.
//
// No password re-confirmation, deliberately, and the asymmetry is the point:
// export and commit are gated because they MOVE credentials (out of the host,
// or into it). This one DESTROYS a copy of them, which is the direction the
// operator should never be discouraged from taking. It is admin-gated and
// audited, which is enough to answer "who removed the undo".
func (h *Handlers) deleteBackup(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	b, err := h.svc.DeleteBackup(me.AccountID, chi.URLParam(r, "stamp"))
	if err != nil {
		httpx.WriteError(w, stageError(err))
		return
	}
	noStore(w)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"status": "deleted", "stamp": b.Stamp, "bytes": b.Bytes,
	})
}

// stageError maps this package's sentinels onto the platform's error envelope.
// Each status is chosen so the console can say something true and specific:
// 422 = "this archive is not acceptable", 409 = "the target moved under you",
// 412 = "the plan refuses", 507 = "no room".
func stageError(err error) error {
	var noSpace *ErrNoSpace
	switch {
	case errors.Is(err, ErrNoStage):
		return httpx.NotFound("找不到這個暫存封存（可能已過期或被丟棄）")
	case errors.Is(err, ErrNoBackup):
		return httpx.NotFound("找不到這個備份（可能已被刪除或已過保留期限）")
	case errors.Is(err, ErrStageBusy):
		return httpx.Conflict(err.Error())
	case errors.Is(err, ErrRejected):
		return httpx.Err(http.StatusUnprocessableEntity, "archive_rejected", err.Error())
	case errors.Is(err, ErrPlanChanged):
		return httpx.Conflict(err.Error())
	case errors.Is(err, ErrBlocked):
		return httpx.Err(http.StatusPreconditionFailed, "plan_blocked", err.Error())
	case errors.As(err, &noSpace):
		return httpx.Err(http.StatusInsufficientStorage, "insufficient_storage", noSpace.Error())
	}
	var he *httpx.E
	if errors.As(err, &he) {
		return he
	}
	return httpx.Internal(err.Error())
}

// PlanBlockedStatus is the HTTP status a refusing plan produces, named so the
// console and the tests agree on it.
const PlanBlockedStatus = http.StatusPreconditionFailed

// noStore marks every response of this surface uncacheable. These payloads
// enumerate accounts and name backups; nothing about them may sit in a proxy.
func noStore(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
}
