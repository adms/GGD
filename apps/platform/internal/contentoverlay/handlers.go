package contentoverlay

import (
	"io"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/httpx"
)

// publicMaxAgeSeconds is how long the overlay head/bundle may be cached by the
// edge / the client. Short on purpose: an admin edit should land in seconds, and
// the game-server keeps its own per-match cache anyway. The head endpoint is the
// cheap thing to poll for a divergence badge (docs/design/content-sync.md §4).
const publicMaxAgeSeconds = "5"

// readDocLimit bounds the request body for a doc write to a little over the
// per-doc cap, so an oversized body is rejected here rather than buffered whole.
const readDocLimit = MaxDocBytes + 4096

// logDays / logLimit bound the generation-history read. Two weeks is well past
// "what did I change before the deploy broke?" without paging.
const (
	logDays  = 14
	logLimit = 200
)

// Handlers exposes the content-overlay REST surface (task #189):
//
//	GET    /api/v1/content-overlay/head                          public, cacheable
//	GET    /api/v1/content-overlay/bundle                        public, cacheable
//	PUT    /api/v1/content-overlay/docs/{collection}/{id}        admin — upsert
//	DELETE /api/v1/content-overlay/docs/{collection}/{id}        admin — tombstone
//	DELETE /api/v1/content-overlay/entries/{collection}/{id}     admin — revert to shipped
//	GET    /api/v1/content-overlay/status                        admin — overlaid vs shipped
//	GET    /api/v1/content-overlay/log                           admin — generation history
//	GET    /api/v1/content-overlay/shipped/{collection}/{id}     admin — the repo's version
//
// The two reads at the top are public for the same reason /curation/whitelist
// is: the game server and the client both fetch the merged content without a
// token, and content JSON is not secret. Everything else is admin-gated —
// the writes because they change what every player sees, and status/log/shipped
// because they carry the EDITING OPERATOR'S ACCOUNT ID. That is why requirement
// 6's "when + by whom" landed on a new admin route rather than by un-blanking
// UpdatedBy on the public pair: the public endpoints must keep leaking nothing
// (see head() / bundle() and TestPublicEndpointsDoNotLeakUpdatedBy).
//
// /content-api (the dev-only localhost editor) is a SEPARATE surface and stays
// absent from the production edge — this overlay is the host's durable write
// path, reached with an admin JWT through the normal /api proxy.
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
		panic("contentoverlay: adminOnly middleware is required; an admin surface must never mount unguarded")
	}
	return &Handlers{svc: svc, adminOnly: adminOnly}
}

// MountPublic registers the unauthenticated read endpoints on /api/v1.
func (h *Handlers) MountPublic(r chi.Router) {
	r.Get("/content-overlay/head", h.head)
	r.Get("/content-overlay/bundle", h.bundle)
}

// Mount registers the admin-gated writes on an already-authenticated subrouter
// (auth.Middleware must run first).
func (h *Handlers) Mount(r chi.Router) {
	r.Group(func(ar chi.Router) {
		ar.Use(h.adminOnly)
		ar.Put("/content-overlay/docs/{collection}/{id}", h.put)
		ar.Delete("/content-overlay/docs/{collection}/{id}", h.delete)
		ar.Delete("/content-overlay/entries/{collection}/{id}", h.revert)
		ar.Get("/content-overlay/status", h.status)
		ar.Get("/content-overlay/log", h.log)
		ar.Get("/content-overlay/shipped/{collection}/{id}", h.shippedDoc)
		// ⭐ GH#326 版本回滾（owner 2026-08-14「往前 n 版都可以（下拉選單）」）。
		// ⚠️ 兩個 GET 是**下拉選單的內容**，兩個 POST 是**按下去的動作**；
		//    回滾都經過 `Service.commit`，所以一樣有 audit、一樣鑄新版本。
		ar.Get("/content-overlay/versions", h.versions)
		ar.Get("/content-overlay/versions/{collection}/{id}", h.docVersions)
		ar.Post("/content-overlay/restore/{hash}", h.restoreAll)
		ar.Post("/content-overlay/restore/{hash}/{collection}/{id}", h.restoreDoc)
	})
}

// status is requirement 6: what is overlaid, what the repo says, when, by whom,
// and which entries the shipped tree has moved underneath. Admin only.
func (h *Handlers) status(w http.ResponseWriter, r *http.Request) {
	st, err := h.svc.Status(r.Context())
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, st)
}

// log serves the generation history from data/content-overlay-log/. Admin only
// (it names the editing operator).
func (h *Handlers) log(w http.ResponseWriter, r *http.Request) {
	lines, err := h.svc.ReadLog(logDays, logLimit)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"entries": lines})
}

// shippedDoc returns the SHIPPED (repo) version of a doc so the console can put
// it side by side with the overlaid one. Read-only; never touches content/.
func (h *Handlers) shippedDoc(w http.ResponseWriter, r *http.Request) {
	collection := chi.URLParam(r, "collection")
	id := chi.URLParam(r, "id")
	doc, hash, err := h.svc.ShippedDoc(collection, id)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"collection": collection, "id": id,
		"present": doc != nil, "hash": hash, "doc": doc,
	})
}

// ---------------------------------------------------------- GH#326 回滾 ----
//
// ⚠️ 四個都在 admin 閘後面：版本清單帶著操作者的帳號 ULID，而回滾是一次寫入。

// versions 是「整批」下拉選單的內容 —— 每一次存檔一列。
func (h *Handlers) versions(w http.ResponseWriter, r *http.Request) {
	list, err := h.svc.Versions(r.Context(), atoiOr(r.URL.Query().Get("limit"), 0))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, list)
}

// docVersions 是「單支」下拉選單 —— ⚠️ 只列這一份文件**內容真的變過**的那幾版，
// 否則選單會塞滿一堆「跟現在一樣」的選項。
func (h *Handlers) docVersions(w http.ResponseWriter, r *http.Request) {
	list, err := h.svc.DocVersions(
		r.Context(), chi.URLParam(r, "collection"), chi.URLParam(r, "id"),
		atoiOr(r.URL.Query().Get("limit"), 0),
	)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, list)
}

// restoreAll 把整份 overlay 換回某一版。⭐ 鑄一個新版本，⛔ 不是倒退指標。
func (h *Handlers) restoreAll(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	hd, err := h.svc.RestoreAll(r.Context(), chi.URLParam(r, "hash"), me.AccountID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, hd)
}

// restoreDoc 只換一份文件，其餘不動 —— 但**一樣鑄一個新的批次版本**，
// 否則兩個下拉選單會互相矛盾，而且沒有辦法回答「線上現在跑的是什麼」。
func (h *Handlers) restoreDoc(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	hd, err := h.svc.RestoreDoc(
		r.Context(), chi.URLParam(r, "hash"),
		chi.URLParam(r, "collection"), chi.URLParam(r, "id"), me.AccountID,
	)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, hd)
}

// atoiOr 讀一個非負整數，讀不到就用預設值。⛔ 不報錯：一個亂填的 `?limit=`
// 應該退回預設，不是把整頁擋掉（上界由 Service 那一層夾）。
func atoiOr(s string, def int) int {
	n, err := strconv.Atoi(s)
	if err != nil || n < 0 {
		return def
	}
	return n
}

func (h *Handlers) head(w http.ResponseWriter, r *http.Request) {
	hd, err := h.svc.Head(r.Context())
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	// These endpoints are UNauthenticated (MountPublic). UpdatedBy is the editing
	// admin's account ULID — do not leak an operator's account id to any caller.
	// Head/Get return by value, so blanking touches only this response copy, not
	// the durable store (which keeps UpdatedBy for the audit trail).
	hd.UpdatedBy = ""
	w.Header().Set("Cache-Control", "public, max-age="+publicMaxAgeSeconds)
	httpx.WriteJSON(w, http.StatusOK, hd)
}

func (h *Handlers) bundle(w http.ResponseWriter, r *http.Request) {
	o, err := h.svc.Get(r.Context())
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	// public endpoint — see head(). PublicBundle blanks UpdatedBy AND drops the
	// per-entry `bases` provenance, which carries the same account id.
	w.Header().Set("Cache-Control", "public, max-age="+publicMaxAgeSeconds)
	httpx.WriteJSON(w, http.StatusOK, o.PublicBundle())
}

func (h *Handlers) put(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	collection := chi.URLParam(r, "collection")
	id := chi.URLParam(r, "id")
	body, err := io.ReadAll(io.LimitReader(r.Body, readDocLimit))
	if err != nil {
		httpx.WriteError(w, httpx.BadRequest("could not read request body"))
		return
	}
	hd, err := h.svc.PutDoc(r.Context(), collection, id, body, me.AccountID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	// NOTE: the audit line is NOT written here any more. It is written inside
	// Service.commit, BEFORE the durable write, and a failed append aborts the
	// mutation — so "every write leaves an audit line" is a guarantee of the
	// store rather than something each handler has to remember.
	httpx.WriteJSON(w, http.StatusOK, hd)
}

func (h *Handlers) delete(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	collection := chi.URLParam(r, "collection")
	id := chi.URLParam(r, "id")
	hd, err := h.svc.DeleteDoc(r.Context(), collection, id, me.AccountID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, hd) // audited inside commit — see put()
}

// revert drops the overlay's entry for a key entirely, so the merged tree falls
// back to the shipped doc. This is the non-destructive exit from a STALE entry:
// DELETE /docs would tombstone the doc (hiding the repo's new version too),
// DELETE /entries takes the repo's version.
func (h *Handlers) revert(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	collection := chi.URLParam(r, "collection")
	id := chi.URLParam(r, "id")
	hd, err := h.svc.RevertDoc(r.Context(), collection, id, me.AccountID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, hd) // audited inside commit — see put()
}
