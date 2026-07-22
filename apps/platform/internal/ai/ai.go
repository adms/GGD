// Package ai is the platform's AI PROXY + provider configuration. It lets the
// editor generate an icon PNG from a description and AI-fill text fields WITHOUT
// ever seeing the provider API key: the key lives SERVER-SIDE in the durable
// config, the editor/client calls this platform proxy, and the proxy attaches
// the key to the outbound provider call.
//
// Design (matches the platform conventions):
//   - Durable truth is ONE JSON file, data/config/ai-provider.json, written
//     through the jsonstore (atomic tmp+rename, single writer). It holds the
//     provider endpoints/models, an enabled flag AND the API key. That file is
//     server-side only: the key is NEVER returned in full to any client — GET
//     returns it masked (e.g. "sk-…abcd").
//   - Ships DISABLED by default. Unconfigured (disabled / no key / no endpoint)
//     => STUB MODE: /ai/icon returns a deterministic placeholder PNG and
//     /ai/text a canned string, each flagged `stub:true`, so the whole editor
//     flow is testable WITHOUT a real key. /ai/tts and /ai/music have no
//     meaningful placeholder audio, so they answer 501 with `stub:true` and
//     name the local fallback the caller should use instead.
//   - Capabilities are configured INDEPENDENTLY (image / text / tts / music):
//     each has its own base URL + model and its own ready check, so one can be
//     live while the others stay in stub mode. A config save is therefore a
//     PARTIAL update — an omitted field keeps its stored value — so a client
//     that only knows about some capabilities cannot blank the others (see
//     Update).
//   - Provider-agnostic: OpenAI-compatible and Anthropic-compatible request
//     shapes are both handled (see provider.go), keyed off the base URL.
//   - The key is read from server config, attached to the outbound call, and
//     NEVER logged.
package ai

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/httpx"
)

// Storage identifiers. The document lives at data/config/ai-provider.json.
const (
	// Collection is the jsonstore collection (a directory under DATA_DIR).
	Collection = "config"
	// DocID is the single document id inside that collection.
	DocID = "ai-provider"
	// SchemaVersion is the doc version written by this build.
	SchemaVersion = 1
)

// Field/prompt bounds keep a malicious or buggy caller from blowing up the
// durable file or the outbound provider request.
const (
	maxPromptLen  = 4000
	maxFieldLen   = 64
	maxContextLen = 8000
	maxURLLen     = 512
	maxModelLen   = 128
	maxAPIKeyLen  = 512
	// maxTTSTextLen bounds one TTS utterance (VO lines are short; this is generous).
	maxTTSTextLen = 1000
	maxLangLen    = 32
	maxVoiceLen   = maxFieldLen
	// Music bounds. maxMusicTagsLen caps the free-form style/genre tag string;
	// the duration bounds bracket a game BGM cue (a sting up to a long loop).
	maxMusicTagsLen  = 256
	minMusicSec      = 5
	maxMusicSec      = 300
	defaultMusicSec  = 45
	maxMusicSceneLen = maxFieldLen
	// minSize / maxSize bound the requested icon edge in pixels. The stub caps
	// at maxStubSize for render cost; the real provider is sent the clamped W×H.
	minSize     = 16
	maxSize     = 1024
	defaultSize = 256
	maxStubSize = 512
)

// Rate limiting: per-account, fixed window, applied to the generation
// endpoints together (icon + text + tts share the budget).
const (
	rateLimit  int64 = 30
	rateWindow       = time.Minute
)

// Music gets its OWN, much tighter budget in a separate Redis bucket. A music
// generation is minutes of provider compute and is billed per track, so it must
// not be able to drain — or be drained by — the cheap icon/text budget.
const musicRateLimit int64 = 4

// providerTimeout bounds one outbound provider call.
const providerTimeout = 60 * time.Second

// Config is the DURABLE, server-side provider configuration. It is the truth
// written to disk; it is NEVER serialized to a client (the APIKey would leak) —
// handlers return a Public view instead.
type Config struct {
	Version      int       `json:"version"`
	UpdatedAt    time.Time `json:"updatedAt"`
	Enabled      bool      `json:"enabled"`
	ImageBaseURL string    `json:"imageBaseUrl"`
	ImageModel   string    `json:"imageModel"`
	TextBaseURL  string    `json:"textBaseUrl"`
	TextModel    string    `json:"textModel"`
	// TTS provider (OpenAI-compatible /audio/speech shape). TTSVoice is the
	// default provider voice used when a request does not name one.
	TTSBaseURL string `json:"ttsBaseUrl"`
	TTSModel   string `json:"ttsModel"`
	TTSVoice   string `json:"ttsVoice"`
	// MUSIC provider (BGM track generation). Separate from TTS: a music model
	// is a different endpoint, a different price class and a different latency
	// class, so an operator configures it independently and either capability
	// can run while the other stays in stub mode.
	MusicBaseURL string `json:"musicBaseUrl"`
	MusicModel   string `json:"musicModel"`
	// APIKey is the provider secret. Stored server-side in this same file
	// (admin-only read); the masked form is all a client ever sees.
	APIKey string `json:"apiKey"`
}

// DefaultConfig is the shipped state: DISABLED, no endpoints, no key => the
// proxy runs in stub mode until an operator configures a provider.
func DefaultConfig() Config {
	return Config{Version: SchemaVersion}
}

// Public is the masked, client-safe projection of Config. The raw key never
// appears — only a masked hint plus booleans the UI needs.
type Public struct {
	Version      int       `json:"version"`
	UpdatedAt    time.Time `json:"updatedAt"`
	Enabled      bool      `json:"enabled"`
	ImageBaseURL string    `json:"imageBaseUrl"`
	ImageModel   string    `json:"imageModel"`
	TextBaseURL  string    `json:"textBaseUrl"`
	TextModel    string    `json:"textModel"`
	TTSBaseURL   string    `json:"ttsBaseUrl"`
	TTSModel     string    `json:"ttsModel"`
	TTSVoice     string    `json:"ttsVoice"`
	MusicBaseURL string    `json:"musicBaseUrl"`
	MusicModel   string    `json:"musicModel"`
	// APIKeyMasked is a non-reversible hint like "sk-…abcd" ("" when unset).
	APIKeyMasked string `json:"apiKeyMasked"`
	// HasKey reports whether a key is stored (without revealing it).
	HasKey bool `json:"hasKey"`
	// ImageReady / TextReady / TTSReady / MusicReady report whether real
	// generation would run (enabled + key + endpoint + model), i.e. NOT stub
	// mode, per capability.
	ImageReady bool `json:"imageReady"`
	TextReady  bool `json:"textReady"`
	TTSReady   bool `json:"ttsReady"`
	MusicReady bool `json:"musicReady"`
}

// maskKey turns a secret into a client-safe hint: a short prefix, an ellipsis,
// and the last 4 characters (e.g. "sk-…abcd"). Short keys are fully starred so
// nothing meaningful leaks.
func maskKey(k string) string {
	k = strings.TrimSpace(k)
	if k == "" {
		return ""
	}
	r := []rune(k)
	if len(r) <= 8 {
		return strings.Repeat("•", len(r))
	}
	prefix := 3
	if idx := strings.IndexByte(k, '-'); idx > 0 && idx <= 5 {
		prefix = idx + 1 // keep a natural "sk-" / "anthropic-" style prefix
		if prefix > 6 {
			prefix = 6
		}
	}
	return string(r[:prefix]) + "…" + string(r[len(r)-4:])
}

// imageReady reports whether a real image call can run (else stub mode).
func (c Config) imageReady() bool {
	return c.Enabled && c.APIKey != "" && strings.TrimSpace(c.ImageBaseURL) != "" && strings.TrimSpace(c.ImageModel) != ""
}

// textReady reports whether a real text call can run (else stub mode).
func (c Config) textReady() bool {
	return c.Enabled && c.APIKey != "" && strings.TrimSpace(c.TextBaseURL) != "" && strings.TrimSpace(c.TextModel) != ""
}

// ttsReady reports whether a real TTS call can run (else stub mode).
func (c Config) ttsReady() bool {
	return c.Enabled && c.APIKey != "" && strings.TrimSpace(c.TTSBaseURL) != "" && strings.TrimSpace(c.TTSModel) != ""
}

// musicReady reports whether a real music call can run (else stub mode).
func (c Config) musicReady() bool {
	return c.Enabled && c.APIKey != "" && strings.TrimSpace(c.MusicBaseURL) != "" && strings.TrimSpace(c.MusicModel) != ""
}

// Public returns the masked projection.
func (c Config) Public() Public {
	return Public{
		Version:      orDefault(c.Version, SchemaVersion),
		UpdatedAt:    c.UpdatedAt,
		Enabled:      c.Enabled,
		ImageBaseURL: c.ImageBaseURL,
		ImageModel:   c.ImageModel,
		TextBaseURL:  c.TextBaseURL,
		TextModel:    c.TextModel,
		TTSBaseURL:   c.TTSBaseURL,
		TTSModel:     c.TTSModel,
		TTSVoice:     c.TTSVoice,
		MusicBaseURL: c.MusicBaseURL,
		MusicModel:   c.MusicModel,
		APIKeyMasked: maskKey(c.APIKey),
		HasKey:       c.APIKey != "",
		ImageReady:   c.imageReady(),
		TextReady:    c.textReady(),
		TTSReady:     c.ttsReady(),
		MusicReady:   c.musicReady(),
	}
}

func orDefault(v, def int) int {
	if v == 0 {
		return def
	}
	return v
}

// Repo is the durable store of the single provider config document.
type Repo struct {
	store *jsonstore.Store
}

// NewRepo builds the repository.
func NewRepo(store *jsonstore.Store) *Repo { return &Repo{store: store} }

// Load reads the JSON truth. A missing file is NOT an error — it is the shipped
// default (disabled, stub mode).
func (r *Repo) Load() (Config, error) {
	var c Config
	err := r.store.Get(Collection, DocID, &c)
	if errors.Is(err, jsonstore.ErrNotFound) {
		return DefaultConfig(), nil
	}
	if err != nil {
		return DefaultConfig(), err
	}
	if c.Version == 0 {
		c.Version = SchemaVersion
	}
	return c, nil
}

// Save writes the JSON truth atomically.
func (r *Repo) Save(c Config) error {
	return r.store.Put(Collection, DocID, c)
}

// Service applies provider policy on top of the repository plus the outbound
// provider client. The document is tiny and single-writer, so one mutex around
// the read-modify-write cycle is all the concurrency control needed.
type Service struct {
	repo  *Repo
	store *jsonstore.Store
	rdb   *redisx.Client
	http  *http.Client
	mu    sync.Mutex
	now   func() time.Time
}

// New builds the service. rdb may be nil (rate limiting then no-ops open).
func New(store *jsonstore.Store, rdb *redisx.Client) *Service {
	return &Service{
		repo:  NewRepo(store),
		store: store,
		rdb:   rdb,
		http:  &http.Client{Timeout: providerTimeout},
		now:   time.Now,
	}
}

// SetNow overrides the clock seam (tests inject a fixed clock so updatedAt is
// deterministic).
func (s *Service) SetNow(fn func() time.Time) { s.now = fn }

// SetHTTPClient overrides the outbound provider HTTP client (tests point it at
// a fake provider server).
func (s *Service) SetHTTPClient(c *http.Client) { s.http = c }

// GetConfig returns the current provider config as the masked Public view.
func (s *Service) GetConfig() (Public, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	c, err := s.repo.Load()
	if err != nil {
		return Public{}, err
	}
	return c.Public(), nil
}

// Update is the write payload, and every field is OPTIONAL: a nil pointer means
// the caller did NOT send that field, so the stored value survives; a non-nil
// pointer replaces it (an empty string clears it, dropping that capability back
// to stub mode). This is the same write-only rule the API key has always had,
// applied to every field — a save is a PARTIAL update, not a replacement.
//
// That matters because the capabilities are configured INDEPENDENTLY: a client
// that only knows about some of them (the admin console predates tts/music)
// must be able to save without silently blanking the endpoints another client
// configured.
type Update struct {
	Enabled      *bool
	ImageBaseURL *string
	ImageModel   *string
	TextBaseURL  *string
	TextModel    *string
	TTSBaseURL   *string
	TTSModel     *string
	TTSVoice     *string
	MusicBaseURL *string
	MusicModel   *string
	APIKey       *string
}

// apply writes one optional field: a nil pointer (field not sent) keeps the
// stored value, a non-nil one replaces it with the trimmed input.
func apply(dst *string, in *string) {
	if in != nil {
		*dst = strings.TrimSpace(*in)
	}
}

func validURL(u string) error {
	u = strings.TrimSpace(u)
	if u == "" {
		return nil // empty is allowed (that capability stays in stub mode)
	}
	if len(u) > maxURLLen {
		return httpx.BadRequest("base URL too long")
	}
	if !strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "https://") {
		return httpx.BadRequest("base URL must start with http:// or https://")
	}
	return nil
}

// SaveConfig validates and persists a PARTIAL update, returning the masked
// Public view. Omitted (nil) fields keep their stored value — see Update.
// version/updatedAt are server-owned.
func (s *Service) SaveConfig(in Update) (Public, error) {
	for _, u := range []*string{in.ImageBaseURL, in.TextBaseURL, in.TTSBaseURL, in.MusicBaseURL} {
		if u == nil {
			continue
		}
		if err := validURL(*u); err != nil {
			return Public{}, err
		}
	}
	for _, m := range []*string{in.ImageModel, in.TextModel, in.TTSModel, in.MusicModel} {
		if m != nil && len(*m) > maxModelLen {
			return Public{}, httpx.BadRequest("model name too long")
		}
	}
	if in.TTSVoice != nil && len(*in.TTSVoice) > maxVoiceLen {
		return Public{}, httpx.BadRequest("voice name too long")
	}
	if in.APIKey != nil && len(*in.APIKey) > maxAPIKeyLen {
		return Public{}, httpx.BadRequest("API key too long")
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	cur, err := s.repo.Load()
	if err != nil {
		return Public{}, err
	}
	// Start from the STORED truth so anything the caller omitted survives, then
	// overwrite only what was actually sent.
	next := cur
	next.Version = SchemaVersion
	next.UpdatedAt = s.now().UTC()
	if in.Enabled != nil {
		next.Enabled = *in.Enabled
	}
	apply(&next.ImageBaseURL, in.ImageBaseURL)
	apply(&next.ImageModel, in.ImageModel)
	apply(&next.TextBaseURL, in.TextBaseURL)
	apply(&next.TextModel, in.TextModel)
	apply(&next.TTSBaseURL, in.TTSBaseURL)
	apply(&next.TTSModel, in.TTSModel)
	apply(&next.TTSVoice, in.TTSVoice)
	apply(&next.MusicBaseURL, in.MusicBaseURL)
	apply(&next.MusicModel, in.MusicModel)
	apply(&next.APIKey, in.APIKey)
	if err := s.repo.Save(next); err != nil {
		return Public{}, err
	}
	return next.Public(), nil
}

// allow applies the per-account rate limit. A nil Redis client (or a Redis
// error) fails OPEN so a cache blip never bricks generation.
func (s *Service) allow(ctx context.Context, accountID string) (bool, error) {
	if s.rdb == nil {
		return true, nil
	}
	return s.rdb.RateAllow(ctx, "ai", accountID, rateLimit, rateWindow)
}

// allowMusic applies the separate, tighter per-account music budget. Same
// fail-open semantics as allow.
func (s *Service) allowMusic(ctx context.Context, accountID string) (bool, error) {
	if s.rdb == nil {
		return true, nil
	}
	return s.rdb.RateAllow(ctx, "ai-music", accountID, musicRateLimit, rateWindow)
}
