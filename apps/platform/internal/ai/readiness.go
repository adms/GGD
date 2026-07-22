package ai

import (
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/httpx"
)

// PUBLIC PROVIDER READINESS (task #101).
//
// WHY THIS EXISTS AT ALL. The asset console (client `#assets`) has to answer
// "can anything actually be generated right now?" from the RUNNING system. The
// honest answer today is no — DATA_DIR/config/ai-provider.json has never been
// created, so Repo.Load falls through to DefaultConfig and every generation
// call takes the placeholder branch. Writing that sentence into the page as
// static text would be the exact failure the page exists to prevent: it would
// still say "no provider" on the day someone configures one.
//
// The existing masked projection (Public, GET /api/v1/admin/ai/config) already
// carries the booleans the console wants — but it is admin-gated and the codex
// family of pages is deliberately "no login, no match required". So this adds a
// SECOND, SMALLER projection on the unauthenticated router.
//
// WHAT IT MAY NOT CONTAIN. Public.APIKeyMasked is a real secret fragment (key
// prefix + last four) and must never leave an authenticated route; it is absent
// here and there is a test that fails if it ever reappears. Public.HasKey is a
// bare existence bit, but it is still deployment information, so it is folded
// into `reason` and `reason` is only filled in for LOOPBACK callers.
//
// THE LOOPBACK SPLIT mirrors what this repo already does for privileged reads
// (apps/content-api/src/guard.ts, and the dev-server guard in
// apps/client/vite.config.ts): the dev machine gets the operator detail —
// which model, which host, and the precise next action — and anyone else gets
// booleans and nothing else. RemoteAddr only; X-Forwarded-For is caller-
// supplied and is never consulted.

// ReasonReady and friends are the machine-readable operator action. They are
// the whole point of the endpoint: "not ready" is useless, "not ready because
// nothing is enabled" tells the operator which switch to throw.
const (
	ReasonReady      = "ready"       // real generation would run
	ReasonDisabled   = "disabled"    // the master toggle is off
	ReasonNoKey      = "no-key"      // enabled, but no key is stored
	ReasonNoEndpoint = "no-endpoint" // enabled + key, but no image base URL
	ReasonNoModel    = "no-model"    // enabled + key + endpoint, but no model
)

// Readiness is the client-safe projection: booleans for everyone, operator
// detail for the dev machine. NO key material in either form.
type Readiness struct {
	Version int `json:"version"`
	// Loopback reports which projection the caller got, so the page can say
	// "detail withheld (not the dev machine)" instead of guessing.
	Loopback bool `json:"loopback"`

	Enabled    bool `json:"enabled"`
	ImageReady bool `json:"imageReady"`
	TextReady  bool `json:"textReady"`
	TTSReady   bool `json:"ttsReady"`
	MusicReady bool `json:"musicReady"`

	// ---- loopback-only fields (zero-valued and omitted otherwise) ----

	// Reason is one of the Reason* constants above, for the IMAGE capability.
	Reason string `json:"reason,omitempty"`
	// ImageModel is the configured model id (e.g. "gpt-image-1"), never a key.
	ImageModel string `json:"imageModel,omitempty"`
	// ImageHost is the HOST of the image endpoint (e.g. "api.openai.com").
	// Deliberately not the full URL: a base URL can carry a path segment that
	// some deployments use as a routing token.
	ImageHost string `json:"imageHost,omitempty"`
	// UpdatedAt is when the provider config was last saved, RFC3339, or "" when
	// it never was. A STRING, not a time.Time: encoding/json's omitempty does
	// not apply to structs, so a time.Time field would serialise as
	// "0001-01-01T00:00:00Z" for off-loopback callers — visible noise that also
	// contradicts this projection's promise to withhold detail.
	UpdatedAt string `json:"updatedAt,omitempty"`
}

// imageReason explains the image capability in one token.
func (c Config) imageReason() string {
	switch {
	case c.imageReady():
		return ReasonReady
	case !c.Enabled:
		return ReasonDisabled
	case c.APIKey == "":
		return ReasonNoKey
	case strings.TrimSpace(c.ImageBaseURL) == "":
		return ReasonNoEndpoint
	default:
		return ReasonNoModel
	}
}

// hostOf extracts the host from a base URL, tolerating junk (returns "").
func hostOf(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return ""
	}
	return u.Host
}

// Readiness builds the public projection. `loopback` selects the detail level.
func (c Config) Readiness(loopback bool) Readiness {
	r := Readiness{
		Version:    c.Version,
		Loopback:   loopback,
		Enabled:    c.Enabled,
		ImageReady: c.imageReady(),
		TextReady:  c.textReady(),
		TTSReady:   c.ttsReady(),
		MusicReady: c.musicReady(),
	}
	if !loopback {
		return r
	}
	r.Reason = c.imageReason()
	r.ImageModel = strings.TrimSpace(c.ImageModel)
	r.ImageHost = hostOf(c.ImageBaseURL)
	if !c.UpdatedAt.IsZero() {
		r.UpdatedAt = c.UpdatedAt.UTC().Format(time.RFC3339)
	}
	return r
}

// isLoopbackAddr reports whether a net/http RemoteAddr ("host:port") is a
// loopback peer. Mirrors apps/content-api/src/guard.ts and the vite dev guard —
// three independent implementations of one rule, so none is a single point of
// failure.
func isLoopbackAddr(remoteAddr string) bool {
	host, _, err := net.SplitHostPort(strings.TrimSpace(remoteAddr))
	if err != nil {
		host = strings.TrimSpace(remoteAddr)
	}
	host = strings.TrimPrefix(strings.TrimSuffix(host, "]"), "[")
	if i := strings.IndexByte(host, '%'); i >= 0 {
		host = host[:i] // strip an IPv6 zone
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// MountPublic registers the UNAUTHENTICATED readiness read:
//
//	GET /api/v1/ai/readiness
//
// Mount it on the public api router (NOT the authed subrouter). The generation
// endpoints and the full masked config stay exactly where they were.
func (h *Handlers) MountPublic(r chi.Router) {
	r.Get("/ai/readiness", h.readiness)
}

func (h *Handlers) readiness(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.svc.repo.Load()
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	// A missing config file is NOT an error (Repo.Load returns DefaultConfig),
	// so the honest "nothing is configured" answer is a 200 with every boolean
	// false — the page can distinguish that from a dead platform, which is the
	// difference between "configure a provider" and "start the server".
	httpx.WriteJSON(w, http.StatusOK, cfg.Readiness(isLoopbackAddr(r.RemoteAddr)))
}
