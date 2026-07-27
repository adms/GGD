package ai

import (
	"encoding/base64"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/httpx"
)

// Handlers exposes the AI proxy + config REST surface:
//
//	POST /api/v1/ai/icon          authed (editor/dev) — generate an icon PNG
//	POST /api/v1/ai/text          authed (editor/dev) — AI-fill a text field
//	POST /api/v1/ai/tts           authed (tooling)    — synthesize speech (MP3)
//	POST /api/v1/ai/music         authed (tooling)    — generate a BGM track (MP3)
//	GET  /api/v1/admin/ai/config  admin only — masked provider config
//	PUT  /api/v1/admin/ai/config  admin only — save provider config
//
// The generation endpoints require only a valid access token: the editor/dev
// calls them and the platform attaches the server-side key. The config
// endpoints are admin-gated (the same AdminOnly middleware curation uses).
type Handlers struct {
	svc *Service
	// adminOnly is the admin-role gate (admin.Service.AdminOnly), injected so
	// this package does not depend on the admin service.
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
		panic("ai: adminOnly middleware is required; an admin surface must never mount unguarded")
	}
	return &Handlers{svc: svc, adminOnly: adminOnly}
}

// Mount registers the routes on an already-authenticated subrouter
// (auth.Middleware must run first).
//
// EVERY route here is admin-gated, generation included. Until 2026-07-27 the
// four generation routes sat OUTSIDE the group, on the merely-authenticated
// router — so any APPROVED PLAYER could spend the operator's paid AI quota by
// calling /ai/icon in a loop. The per-route limiter (ai.go, 30/min, music
// 4/min) bounds the rate, not the bill, and it is not an authorization control.
//
// There is no legitimate player caller: a repo-wide sweep found the game client
// touches only /ai/readiness (public, boolean-only); /ai/icon|text|tts|music
// are called solely from apps/admin and apps/editor, both operator tools.
func (h *Handlers) Mount(r chi.Router) {
	r.Group(func(ar chi.Router) {
		ar.Use(h.adminOnly)
		ar.Post("/ai/icon", h.icon)
		ar.Post("/ai/text", h.text)
		ar.Post("/ai/tts", h.tts)
		ar.Post("/ai/music", h.music)
		ar.Get("/admin/ai/config", h.getConfig)
		ar.Put("/admin/ai/config", h.putConfig)
	})
}

// ---- generation -------------------------------------------------------------

type iconReq struct {
	Prompt string `json:"prompt"`
	Style  string `json:"style"`
	Size   int    `json:"size"`
}

func (h *Handlers) icon(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var req iconReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.GenerateIcon(r.Context(), me.AccountID, req.Prompt, req.Style, req.Size)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	b64 := base64.StdEncoding.EncodeToString(res.PNG)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"pngBase64": b64,
		"dataUrl":   "data:image/png;base64," + b64,
		"mime":      "image/png",
		"stub":      res.Stub,
	})
}

type textReq struct {
	Prompt  string `json:"prompt"`
	Field   string `json:"field"`
	Context string `json:"context"`
}

func (h *Handlers) text(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var req textReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.GenerateText(r.Context(), me.AccountID, req.Prompt, req.Field, req.Context)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"text": res.Text,
		"stub": res.Stub,
	})
}

type ttsReq struct {
	Text  string `json:"text"`
	Lang  string `json:"lang"`
	Voice string `json:"voice"`
}

// tts synthesizes speech via the configured provider. UNLIKE icon/text there is
// no stub payload: with no TTS provider configured the endpoint answers
// 501 Not Implemented with `{stub:true, ...}` so client tooling knows to keep
// its local (machine-VO) clips instead of expecting audio.
func (h *Handlers) tts(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var req ttsReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.GenerateTTS(r.Context(), me.AccountID, req.Text, req.Lang, req.Voice)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	if res.Stub {
		httpx.WriteJSON(w, http.StatusNotImplemented, map[string]any{
			"stub":    true,
			"code":    "tts_not_configured",
			"message": "no TTS provider configured; keep using local clips",
		})
		return
	}
	b64 := base64.StdEncoding.EncodeToString(res.MP3)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"mp3Base64": b64,
		"dataUrl":   "data:audio/mpeg;base64," + b64,
		"mime":      "audio/mpeg",
		"stub":      false,
	})
}

type musicReq struct {
	Prompt      string `json:"prompt"`
	Scene       string `json:"scene"`
	Tags        string `json:"tags"`
	DurationSec int    `json:"durationSec"`
	Seed        int    `json:"seed"`
	// Instrumental is a POINTER so an omitted field can default to TRUE — game
	// BGM is instrumental, and a plain bool would silently default to false and
	// buy vocals nobody asked for. Send `false` explicitly to allow vocals.
	Instrumental *bool `json:"instrumental"`
}

// music generates a BGM track via the configured provider. Like /ai/tts and
// UNLIKE /ai/icon there is no stub payload: with no music provider configured
// the endpoint answers 501 Not Implemented with `{stub:true, ...}` pointing at
// tools/bgm-gen, the local generator that produced the shipped pack.
func (h *Handlers) music(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var req musicReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	instrumental := true
	if req.Instrumental != nil {
		instrumental = *req.Instrumental
	}
	res, err := h.svc.GenerateMusic(r.Context(), me.AccountID, MusicRequest{
		Prompt:       req.Prompt,
		Scene:        req.Scene,
		Tags:         req.Tags,
		DurationSec:  req.DurationSec,
		Instrumental: instrumental,
		Seed:         req.Seed,
	})
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	if res.Stub {
		httpx.WriteJSON(w, http.StatusNotImplemented, map[string]any{
			"stub":    true,
			"code":    "music_not_configured",
			"message": musicStubMessage(),
			"localGenerator": map[string]any{
				"tool":  "tools/bgm-gen",
				"entry": "python3 tools/bgm-gen/src/render.py <scene>",
			},
		})
		return
	}
	b64 := base64.StdEncoding.EncodeToString(res.Audio)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"mp3Base64": b64,
		"dataUrl":   "data:" + res.MIME + ";base64," + b64,
		"mime":      res.MIME,
		"stub":      false,
	})
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

// configReq is the PUT body. EVERY field is a POINTER so the handler can tell
// "not sent" from "sent empty": the PUT is a PARTIAL update — an omitted field
// keeps its stored value, a present empty string clears it. Plain fields would
// decode a missing key to the zero value and silently blank a capability this
// caller does not even know about (the admin console does not send tts/music).
type configReq struct {
	Enabled      *bool   `json:"enabled"`
	ImageBaseURL *string `json:"imageBaseUrl"`
	ImageModel   *string `json:"imageModel"`
	TextBaseURL  *string `json:"textBaseUrl"`
	TextModel    *string `json:"textModel"`
	TTSBaseURL   *string `json:"ttsBaseUrl"`
	TTSModel     *string `json:"ttsModel"`
	TTSVoice     *string `json:"ttsVoice"`
	MusicBaseURL *string `json:"musicBaseUrl"`
	MusicModel   *string `json:"musicModel"`
	APIKey       *string `json:"apiKey"`
}

func (h *Handlers) putConfig(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())
	var req configReq
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	cfg, err := h.svc.SaveConfig(Update{
		Enabled:      req.Enabled,
		ImageBaseURL: req.ImageBaseURL,
		ImageModel:   req.ImageModel,
		TextBaseURL:  req.TextBaseURL,
		TextModel:    req.TextModel,
		TTSBaseURL:   req.TTSBaseURL,
		TTSModel:     req.TTSModel,
		TTSVoice:     req.TTSVoice,
		MusicBaseURL: req.MusicBaseURL,
		MusicModel:   req.MusicModel,
		APIKey:       req.APIKey,
	})
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	// Audit the config change (never the key value) so it shows up in the
	// console's audit page next to every other operator action.
	h.svc.auditConfig(r.Context(), me.AccountID, cfg)
	httpx.WriteJSON(w, http.StatusOK, cfg)
}
