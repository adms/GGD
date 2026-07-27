package approvelink

import (
	"errors"
	"html"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/httpx"
)

// Handlers exposes the #209 REST surface:
//
//	GET  /api/v1/approve            token-gated — render a CONFIRM page (no side effect)
//	POST /api/v1/approve            token-gated — apply the decision (single-use)
//	GET  /api/v1/admin/slack-notify admin only — masked slack config
//	PUT  /api/v1/admin/slack-notify admin only — save slack config
//
// The /approve pair is NOT behind auth.Middleware: the owner clicks it from
// their phone while NOT logged into /admin, so the signed token is the ONLY
// gate. Everything sensitive is in the token; the endpoint reads who/what from
// it, never from a swappable query parameter.
type Handlers struct {
	svc *Service
	// adminOnly is the admin-role gate (admin.Service.AdminOnly), injected so
	// this package does not depend on the admin service. Guards the config routes.
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
		panic("approvelink: adminOnly middleware is required; an admin surface must never mount unguarded")
	}
	return &Handlers{svc: svc, adminOnly: adminOnly}
}

// MountPublic registers the token-gated approve endpoints on the PUBLIC
// (unauthenticated) subrouter. The GET is read-only and prefetch-safe; only the
// POST mutates.
func (h *Handlers) MountPublic(r chi.Router) {
	r.Get("/approve", h.confirm)
	r.Post("/approve", h.act)
}

// Mount registers the admin-gated slack config routes on the authenticated
// subrouter (auth.Middleware must run first).
func (h *Handlers) Mount(r chi.Router) {
	r.Group(func(ar chi.Router) {
		ar.Use(h.adminOnly)
		ar.Get("/admin/slack-notify", h.getConfig)
		ar.Put("/admin/slack-notify", h.putConfig)
	})
}

// tokenParam reads the token from the query string OR a posted form field, so
// the confirm-page form (which posts token in a hidden field) and a direct
// link both work.
func tokenParam(r *http.Request) string {
	if t := r.URL.Query().Get("token"); t != "" {
		return t
	}
	return r.FormValue("token")
}

// ---- GET /approve : confirm (read-only, prefetch-safe) ----------------------

func (h *Handlers) confirm(w http.ResponseWriter, r *http.Request) {
	view, err := h.svc.Confirm(r.Context(), tokenParam(r))
	if err != nil {
		writeErrorPage(w, err)
		return
	}
	if view.Done {
		writePage(w, http.StatusOK, donePageTitle(view.Action), html.EscapeString(view.DoneMsg))
		return
	}
	writeConfirmPage(w, view)
}

// ---- POST /approve : act (mutating, single-use) -----------------------------

func (h *Handlers) act(w http.ResponseWriter, r *http.Request) {
	res, err := h.svc.Act(r.Context(), tokenParam(r))
	if err != nil {
		writeErrorPage(w, err)
		return
	}
	who := html.EscapeString(res.Username)
	if res.NoChange {
		// #209: the account was already decided (in the console or by a sibling
		// link). The first decision stands — this link changed nothing.
		writePage(w, http.StatusOK, "已處理 / already decided",
			"<b>"+who+"</b> 的帳號稍早已由管理員處理過（目前："+html.EscapeString(res.Status)+"）。此連結未變更任何狀態。")
		return
	}
	if res.Action == ActionReject {
		writePage(w, http.StatusOK, "已拒絕 / rejected", "已拒絕 <b>"+who+"</b> 的註冊。")
		return
	}
	writePage(w, http.StatusOK, "已核准 / approved", "已核准 <b>"+who+"</b>，對方現在可以登入遊玩。")
}

// ---- admin config -----------------------------------------------------------

func (h *Handlers) getConfig(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.svc.GetConfig()
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, cfg)
}

type slackConfigReq struct {
	Enabled    *bool   `json:"enabled"`
	WebhookURL *string `json:"webhookUrl"`
}

func (h *Handlers) putConfig(w http.ResponseWriter, r *http.Request) {
	var req slackConfigReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	cfg, err := h.svc.SaveConfig(SlackUpdate{Enabled: req.Enabled, WebhookURL: req.WebhookURL})
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, cfg)
}

// ---- HTML rendering ---------------------------------------------------------

// pageShell wraps body in a minimal, mobile-first HTML document. The owner opens
// these on a phone, so it is deliberately tiny, self-contained (no external
// assets — a strict deploy blocks them) and readable in dark mode.
func pageShell(title, body string) string {
	return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">` +
		`<meta name="viewport" content="width=device-width, initial-scale=1">` +
		`<meta name="robots" content="noindex,nofollow">` +
		`<title>` + html.EscapeString(title) + `</title><style>` +
		`:root{color-scheme:light dark}` +
		`body{font-family:system-ui,-apple-system,"Noto Sans TC",sans-serif;margin:0;` +
		`min-height:100vh;display:flex;align-items:center;justify-content:center;` +
		`background:#0f1420;color:#e8ecf5;padding:24px}` +
		`.card{max-width:420px;width:100%;background:#1a2130;border:1px solid #2b3550;` +
		`border-radius:16px;padding:28px 24px;box-shadow:0 12px 40px rgba(0,0,0,.4)}` +
		`h1{font-size:20px;margin:0 0 14px}p{font-size:15px;line-height:1.6;margin:8px 0}` +
		`code{background:#0f1420;padding:2px 6px;border-radius:6px;font-size:13px}` +
		`button{width:100%;margin-top:20px;padding:14px;font-size:17px;font-weight:600;` +
		`border:0;border-radius:12px;cursor:pointer;color:#fff}` +
		`.approve{background:#2e8b57}.reject{background:#b04242}` +
		`.muted{color:#9aa6bd;font-size:13px}` +
		`</style></head><body><div class="card">` + body + `</div></body></html>`
}

func writePage(w http.ResponseWriter, status int, title, bodyHTML string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(pageShell(title, "<h1>"+html.EscapeString(title)+"</h1><p>"+bodyHTML+"</p>")))
}

// writeConfirmPage renders the confirm step: the account being decided and a
// single POST button. The token rides in a hidden field so the POST carries it;
// the button label and colour follow the action.
func writeConfirmPage(w http.ResponseWriter, v ConfirmView) {
	who := html.EscapeString(v.Username)
	id := html.EscapeString(v.AccountID)
	tok := html.EscapeString(v.Token)

	verb, cls := "核准 approve", "approve"
	if v.Action == ActionReject {
		verb, cls = "拒絕 reject", "reject"
	}
	title := verb + " ?"
	body := "<h1>" + html.EscapeString(title) + "</h1>" +
		"<p>要" + verb + " 以下註冊嗎？</p>" +
		"<p>使用者 / username: <b>" + who + "</b></p>" +
		"<p>帳號 ID: <code>" + id + "</code></p>" +
		`<form method="POST" action="/api/v1/approve">` +
		`<input type="hidden" name="token" value="` + tok + `">` +
		`<button type="submit" class="` + cls + `">` + html.EscapeString(verb) + `</button>` +
		`</form>` +
		`<p class="muted">此頁只是確認，按下按鈕後才會生效。</p>`
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(pageShell(title, body)))
}

func donePageTitle(action string) string {
	if action == ActionReject {
		return "拒絕 reject"
	}
	return "核准 approve"
}

// writeErrorPage maps a validation/verify error onto a friendly page. The HTTP
// status distinguishes an expired token (410 Gone) from a forged/garbage one
// (400) and a vanished account (404), which also keeps automated scanners from
// treating every /approve GET as a 200.
func writeErrorPage(w http.ResponseWriter, err error) {
	status, msg := http.StatusBadRequest, "連結無效 / invalid link"
	switch {
	case errors.Is(err, ErrExpiredToken):
		status, msg = http.StatusGone, "連結已過期，請再向管理員索取一次。/ link expired"
	case errors.Is(err, ErrTokenUsed):
		status, msg = http.StatusConflict, "這個連結已使用過。/ already used"
	case errors.Is(err, account.ErrNotFound):
		status, msg = http.StatusNotFound, "找不到這個帳號（可能已被刪除）。/ account not found"
	case errors.Is(err, ErrBadSignature), errors.Is(err, ErrMalformedToken):
		status, msg = http.StatusBadRequest, "連結無效或被竄改。/ invalid link"
	}
	writePage(w, status, "無法處理 / cannot process", html.EscapeString(msg))
}
