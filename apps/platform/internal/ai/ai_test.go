package ai_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"image/png"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/ai"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/pkg/testkit"
)

const testKey = "sk-test-SECRET-abcd1234"

// ptr builds the optional fields of an ai.Update. Every field is a pointer
// because a save is a PARTIAL update: what you do not pass keeps its stored
// value (see ai.Update).
func ptr[T any](v T) *T { return &v }

// newSvc builds an ai.Service over a temp jsonstore + miniredis, with a fixed
// clock so updatedAt is deterministic. It returns the store too so tests can
// inspect the durable file (to prove the raw key IS on disk but never in a
// client response).
func newSvc(t *testing.T) (*ai.Service, *jsonstore.Store, *miniredis.Miniredis) {
	t.Helper()
	dir := t.TempDir()
	store, err := jsonstore.New(dir)
	require.NoError(t, err)
	mr := miniredis.RunT(t)
	rdb := redisx.New(mr.Addr(), "")
	t.Cleanup(func() { _ = rdb.Close() })
	svc := ai.New(store, rdb)
	svc.SetNow(func() time.Time { return time.Date(2026, 7, 22, 12, 0, 0, 0, time.UTC) })
	return svc, store, mr
}

// ai-config-mask: the config round-trips, but the API key is MASKED on read
// (never returned in full) while the raw key lives server-side on disk. The
// write-only key semantics keep the stored key when a save omits it.
func TestConfigRoundTripMaskedKey(t *testing.T) {
	testkit.Cover(t, "ai-config-mask")
	svc, store, _ := newSvc(t)

	// Fresh install: disabled, no key, stub mode for both capabilities.
	pub, err := svc.GetConfig()
	require.NoError(t, err)
	assert.False(t, pub.Enabled)
	assert.False(t, pub.HasKey)
	assert.Equal(t, "", pub.APIKeyMasked)
	assert.False(t, pub.ImageReady)
	assert.False(t, pub.TextReady)

	// Save a full provider config WITH a key.
	pub, err = svc.SaveConfig(ai.Update{
		Enabled:      ptr(true),
		ImageBaseURL: ptr("https://api.example.com/v1"),
		ImageModel:   ptr("img-model-1"),
		TextBaseURL:  ptr("https://api.example.com/v1"),
		TextModel:    ptr("txt-model-1"),
		APIKey:       ptr(testKey),
	})
	require.NoError(t, err)

	// Read back: masked, never the raw key; both capabilities now "ready".
	assert.True(t, pub.Enabled)
	assert.True(t, pub.HasKey)
	assert.NotEqual(t, testKey, pub.APIKeyMasked, "the raw key must never be returned")
	assert.NotContains(t, pub.APIKeyMasked, "SECRET", "the mask must not leak the middle of the key")
	assert.True(t, strings.HasSuffix(pub.APIKeyMasked, "1234"), "mask keeps only the last 4: %q", pub.APIKeyMasked)
	assert.True(t, pub.ImageReady)
	assert.True(t, pub.TextReady)

	// The raw key IS on disk (server-side truth, admin-only file).
	path, err := store.Path(ai.Collection, ai.DocID)
	require.NoError(t, err)
	raw, err := os.ReadFile(path)
	require.NoError(t, err)
	assert.Contains(t, string(raw), testKey, "the raw key is persisted server-side")

	// Serializing the masked Public view NEVER contains the raw key.
	blob, err := json.Marshal(pub)
	require.NoError(t, err)
	assert.NotContains(t, string(blob), testKey)

	// Write-only semantics: saving again WITHOUT a key keeps the stored one.
	pub2, err := svc.SaveConfig(ai.Update{
		Enabled:      ptr(true),
		ImageBaseURL: ptr("https://api.example.com/v2"),
		ImageModel:   ptr("img-model-2"),
		TextBaseURL:  ptr("https://api.example.com/v2"),
		TextModel:    ptr("txt-model-2"),
		APIKey:       nil, // omitted → keep
	})
	require.NoError(t, err)
	assert.True(t, pub2.HasKey, "an omitted key keeps the stored secret")
	assert.Equal(t, "img-model-2", pub2.ImageModel)

	// And an explicit empty string CLEARS it (→ stub mode again).
	pub3, err := svc.SaveConfig(ai.Update{
		Enabled:      ptr(true),
		ImageBaseURL: ptr("https://api.example.com/v2"),
		ImageModel:   ptr("img-model-2"),
		TextBaseURL:  ptr("https://api.example.com/v2"),
		TextModel:    ptr("txt-model-2"),
		APIKey:       ptr(""),
	})
	require.NoError(t, err)
	assert.False(t, pub3.HasKey)
	assert.False(t, pub3.ImageReady, "no key → back to stub mode")
}

// ai-stub-png: with NO provider configured, GenerateIcon returns a deterministic
// placeholder PNG (real image bytes, right size) flagged stub:true — so the
// editor flow is fully testable without a key.
func TestStubIconPlaceholder(t *testing.T) {
	testkit.Cover(t, "ai-stub-png")
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	res, err := svc.GenerateIcon(ctx, "acct-1", "a fiery dragon knight", "voxel", 128)
	require.NoError(t, err)
	assert.True(t, res.Stub, "unconfigured → stub mode")
	require.NotEmpty(t, res.PNG)

	// Real PNG bytes: magic header + decodes to the requested size.
	assert.Equal(t, []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a}, res.PNG[:8], "PNG magic bytes")
	img, err := png.Decode(bytes.NewReader(res.PNG))
	require.NoError(t, err, "placeholder is a valid PNG")
	assert.Equal(t, 128, img.Bounds().Dx())
	assert.Equal(t, 128, img.Bounds().Dy())

	// Deterministic: the same prompt+style+size renders identical bytes.
	res2, err := svc.GenerateIcon(ctx, "acct-1", "a fiery dragon knight", "voxel", 128)
	require.NoError(t, err)
	assert.Equal(t, res.PNG, res2.PNG, "same seed → identical placeholder")

	// A different prompt renders different art.
	res3, err := svc.GenerateIcon(ctx, "acct-1", "a serene ice mage", "voxel", 128)
	require.NoError(t, err)
	assert.NotEqual(t, res.PNG, res3.PNG, "different seed → different placeholder")

	// An empty prompt is a 400 (never a silent blank icon).
	_, err = svc.GenerateIcon(ctx, "acct-1", "   ", "", 128)
	require.Error(t, err)
}

// ai-stub-text: with NO provider configured, GenerateText returns a canned,
// field-aware string flagged stub:true.
func TestStubTextCanned(t *testing.T) {
	testkit.Cover(t, "ai-stub-text")
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	res, err := svc.GenerateText(ctx, "acct-1", "生成一段英雄描述", "description", "name: 火龍騎士")
	require.NoError(t, err)
	assert.True(t, res.Stub)
	assert.NotEmpty(t, res.Text)

	// Field shapes the canned copy (a "name" reads differently from a "desc").
	name, err := svc.GenerateText(ctx, "acct-1", "取一個名字", "name", "")
	require.NoError(t, err)
	assert.True(t, name.Stub)
	assert.NotEqual(t, res.Text, name.Text)

	// Empty prompt → 400.
	_, err = svc.GenerateText(ctx, "acct-1", "", "description", "")
	require.Error(t, err)
}

// ai-provider-call: when configured, the proxy calls the provider, ATTACHES the
// server-side key to the outbound request, returns the provider result
// (stub:false), and NEVER logs the key (error paths included).
func TestConfiguredProviderCallAttachesKeyNeverLogs(t *testing.T) {
	testkit.Cover(t, "ai-provider-call")
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	// Capture slog output for the whole test to assert the key never appears.
	var logs bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })

	// A 1x1 PNG the fake image provider will hand back as base64.
	tinyPNG, err := ai.PlaceholderPNG("seed", 16)
	require.NoError(t, err)

	var sawImageAuth, sawTextAuth string
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, "/images/generations"):
			sawImageAuth = r.Header.Get("Authorization")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"data": []map[string]any{{"b64_json": base64.StdEncoding.EncodeToString(tinyPNG)}},
			})
		case strings.HasSuffix(r.URL.Path, "/chat/completions"):
			sawTextAuth = r.Header.Get("Authorization")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"choices": []map[string]any{{"message": map[string]any{"content": "A blazing dragon knight."}}},
			})
		default:
			http.Error(w, "not found", http.StatusNotFound)
		}
	}))
	t.Cleanup(provider.Close)

	_, err = svc.SaveConfig(ai.Update{
		Enabled:      ptr(true),
		ImageBaseURL: ptr(provider.URL + "/v1"),
		ImageModel:   ptr("img-1"),
		TextBaseURL:  ptr(provider.URL + "/v1"),
		TextModel:    ptr("txt-1"),
		APIKey:       ptr(testKey),
	})
	require.NoError(t, err)

	// Icon: real provider path, key attached, stub:false.
	icon, err := svc.GenerateIcon(ctx, "acct-1", "a fiery dragon knight", "voxel", 64)
	require.NoError(t, err)
	assert.False(t, icon.Stub)
	assert.Equal(t, tinyPNG, icon.PNG)
	assert.Equal(t, "Bearer "+testKey, sawImageAuth, "the server-side key is attached to the outbound image call")

	// Text: real provider path.
	txt, err := svc.GenerateText(ctx, "acct-1", "describe him", "description", "name: dragon knight")
	require.NoError(t, err)
	assert.False(t, txt.Stub)
	assert.Equal(t, "A blazing dragon knight.", txt.Text)
	assert.Equal(t, "Bearer "+testKey, sawTextAuth)

	// The key must never have been logged, on any path.
	assert.NotContains(t, logs.String(), testKey, "the API key must never be logged")
}

// ai-provider-error: a provider failure surfaces as a CLEAN 502 envelope (no key
// echo), never a silent stub fallback.
func TestProviderFailureCleanEnvelope(t *testing.T) {
	testkit.Cover(t, "ai-provider-error")
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "kaboom", http.StatusInternalServerError)
	}))
	t.Cleanup(provider.Close)

	_, err := svc.SaveConfig(ai.Update{
		Enabled:      ptr(true),
		ImageBaseURL: ptr(provider.URL + "/v1"),
		ImageModel:   ptr("img-1"),
		TextBaseURL:  ptr(provider.URL + "/v1"),
		TextModel:    ptr("txt-1"),
		APIKey:       ptr(testKey),
	})
	require.NoError(t, err)

	_, err = svc.GenerateIcon(ctx, "acct-1", "a dragon", "", 64)
	require.Error(t, err)
	assert.NotContains(t, err.Error(), testKey, "a provider error must not echo the key")
}

// ai-tts-stub: with NO TTS provider configured, GenerateTTS returns Stub=true
// with NO audio bytes (the client tooling keeps its local machine-VO clips) —
// and an empty text is a 400, never a silent empty clip.
func TestTTSStubNoAudio(t *testing.T) {
	testkit.Cover(t, "ai-tts-stub")
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	res, err := svc.GenerateTTS(ctx, "acct-1", "歡迎來到競技場", "zh-TW", "")
	require.NoError(t, err)
	assert.True(t, res.Stub, "unconfigured → stub mode")
	assert.Empty(t, res.MP3, "stub mode produces NO audio")

	// Empty text → 400.
	_, err = svc.GenerateTTS(ctx, "acct-1", "   ", "zh-TW", "")
	require.Error(t, err)

	// Oversized text → 400.
	_, err = svc.GenerateTTS(ctx, "acct-1", strings.Repeat("あ", 2000), "ja-JP", "")
	require.Error(t, err)
}

// ai-tts-provider-call: when a TTS provider is configured, the proxy calls the
// OpenAI-compatible /audio/speech endpoint, ATTACHES the server-side key,
// forwards text/voice, returns the raw MP3 bytes (stub:false), and never logs
// the key.
func TestTTSProviderCallAttachesKey(t *testing.T) {
	testkit.Cover(t, "ai-tts-provider-call")
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	var logs bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })

	fakeMP3 := append([]byte("ID3"), bytes.Repeat([]byte{0xAA}, 64)...)
	var sawAuth, sawPath string
	var sawBody map[string]any
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sawAuth = r.Header.Get("Authorization")
		sawPath = r.URL.Path
		_ = json.NewDecoder(r.Body).Decode(&sawBody)
		w.Header().Set("Content-Type", "audio/mpeg")
		_, _ = w.Write(fakeMP3)
	}))
	t.Cleanup(provider.Close)

	pub, err := svc.SaveConfig(ai.Update{
		Enabled:    ptr(true),
		TTSBaseURL: ptr(provider.URL + "/v1"),
		TTSModel:   ptr("tts-1"),
		TTSVoice:   ptr("shimmer"),
		APIKey:     ptr(testKey),
	})
	require.NoError(t, err)
	assert.True(t, pub.TTSReady, "enabled + key + endpoint + model → TTS ready")
	assert.False(t, pub.ImageReady, "image stays in stub mode (unconfigured)")

	res, err := svc.GenerateTTS(ctx, "acct-1", "請確認你的隊友是不是白目", "zh-TW", "")
	require.NoError(t, err)
	assert.False(t, res.Stub)
	assert.Equal(t, fakeMP3, res.MP3, "raw provider MP3 bytes pass through")
	assert.Equal(t, "Bearer "+testKey, sawAuth, "the server-side key is attached to the outbound TTS call")
	assert.True(t, strings.HasSuffix(sawPath, "/audio/speech"), "OpenAI-compatible speech path: %s", sawPath)
	assert.Equal(t, "tts-1", sawBody["model"])
	assert.Equal(t, "請確認你的隊友是不是白目", sawBody["input"])
	assert.Equal(t, "shimmer", sawBody["voice"], "config default voice used when the request names none")
	assert.Equal(t, "mp3", sawBody["response_format"])

	// A request-level voice overrides the config default.
	_, err = svc.GenerateTTS(ctx, "acct-1", "こんにちは", "ja-JP", "nova")
	require.NoError(t, err)
	assert.Equal(t, "nova", sawBody["voice"])
	assert.Equal(t, "ja-JP", sawBody["language"], "lang hint forwarded when present")

	assert.NotContains(t, logs.String(), testKey, "the API key must never be logged")
}

// ai-tts-provider-error: a TTS provider failure surfaces as a clean 502-style
// error (no key echo), never a silent stub fallback.
func TestTTSProviderFailure(t *testing.T) {
	testkit.Cover(t, "ai-tts-provider-error")
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "kaboom", http.StatusInternalServerError)
	}))
	t.Cleanup(provider.Close)

	_, err := svc.SaveConfig(ai.Update{
		Enabled:    ptr(true),
		TTSBaseURL: ptr(provider.URL + "/v1"),
		TTSModel:   ptr("tts-1"),
		APIKey:     ptr(testKey),
	})
	require.NoError(t, err)

	_, err = svc.GenerateTTS(ctx, "acct-1", "hello", "zh-TW", "")
	require.Error(t, err)
	assert.NotContains(t, err.Error(), testKey, "a provider error must not echo the key")
}

// ai-rate-limit: the per-account rate limit kicks in after the window budget is
// spent (shared by icon + text).
func TestRateLimit(t *testing.T) {
	testkit.Cover(t, "ai-rate-limit")
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	limited := false
	for i := 0; i < 40; i++ {
		_, err := svc.GenerateText(ctx, "spammer", "hi", "description", "")
		if err != nil {
			var e interface{ Error() string }
			e = err
			if strings.Contains(e.Error(), "rate") || strings.Contains(e.Error(), "too many") {
				limited = true
				break
			}
			require.NoError(t, err, "only a rate-limit error is expected")
		}
	}
	assert.True(t, limited, "per-account AI rate limit must kick in")
}

// ai-music-stub: with NO music provider configured, GenerateMusic returns
// Stub=true with NO audio (the caller falls back to tools/bgm-gen, which is what
// actually produced the shipped pack) — and an empty prompt is a 400, never a
// silent empty track.
func TestMusicStubNoAudio(t *testing.T) {
	testkit.Cover(t, "ai-music-stub")
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	res, err := svc.GenerateMusic(ctx, "acct-1", ai.MusicRequest{
		Prompt: "sacred choral battle theme in D minor", Scene: "combat", DurationSec: 45,
	})
	require.NoError(t, err)
	assert.True(t, res.Stub, "unconfigured → stub mode")
	assert.Empty(t, res.Audio, "stub mode produces NO audio")

	// Empty prompt → 400.
	_, err = svc.GenerateMusic(ctx, "acct-1", ai.MusicRequest{Prompt: "   "})
	require.Error(t, err)

	// Oversized prompt → 400.
	_, err = svc.GenerateMusic(ctx, "acct-1", ai.MusicRequest{Prompt: strings.Repeat("x", 5000)})
	require.Error(t, err)

	// Oversized tags → 400.
	_, err = svc.GenerateMusic(ctx, "acct-2", ai.MusicRequest{
		Prompt: "battle theme", Tags: strings.Repeat("taiko, ", 100),
	})
	require.Error(t, err)
}

// ai-music-provider-call: when a music provider is configured, the proxy calls
// the provider endpoint, ATTACHES the server-side key, forwards the shaped
// prompt + duration, returns the raw audio bytes (stub:false), and never logs
// the key. Duration is clamped into the supported range.
func TestMusicProviderCallAttachesKey(t *testing.T) {
	testkit.Cover(t, "ai-music-provider-call")
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	var logs bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })

	fakeMP3 := append([]byte("ID3"), bytes.Repeat([]byte{0x5A}, 128)...)
	var sawAuth, sawPath string
	var sawBody map[string]any
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sawAuth = r.Header.Get("Authorization")
		sawPath = r.URL.Path
		_ = json.NewDecoder(r.Body).Decode(&sawBody)
		w.Header().Set("Content-Type", "audio/mpeg")
		_, _ = w.Write(fakeMP3)
	}))
	t.Cleanup(provider.Close)

	pub, err := svc.SaveConfig(ai.Update{
		Enabled:      ptr(true),
		MusicBaseURL: ptr(provider.URL + "/v1"),
		MusicModel:   ptr("music-1"),
		APIKey:       ptr(testKey),
	})
	require.NoError(t, err)
	assert.True(t, pub.MusicReady, "enabled + key + endpoint + model → music ready")
	assert.False(t, pub.TTSReady, "TTS stays in stub mode (unconfigured)")
	assert.False(t, pub.ImageReady, "image stays in stub mode (unconfigured)")
	assert.Equal(t, "music-1", pub.MusicModel)

	res, err := svc.GenerateMusic(ctx, "acct-1", ai.MusicRequest{
		Prompt:       "sacred choral battle theme",
		Scene:        "combat",
		Tags:         "orchestral, taiko",
		DurationSec:  45,
		Instrumental: true,
		Seed:         5206,
	})
	require.NoError(t, err)
	assert.False(t, res.Stub)
	assert.Equal(t, fakeMP3, res.Audio, "raw provider audio bytes pass through")
	assert.Equal(t, "audio/mpeg", res.MIME)
	assert.Equal(t, "Bearer "+testKey, sawAuth, "the server-side key is attached to the outbound music call")
	assert.True(t, strings.HasSuffix(sawPath, "/audio/music"), "music path: %s", sawPath)
	assert.Equal(t, "music-1", sawBody["model"])
	assert.EqualValues(t, 45, sawBody["duration"])
	assert.Equal(t, true, sawBody["instrumental"])
	assert.EqualValues(t, 5206, sawBody["seed"])
	assert.Equal(t, "mp3", sawBody["response_format"])

	prompt, _ := sawBody["prompt"].(string)
	assert.Contains(t, prompt, "sacred choral battle theme", "caller's description leads the prompt")
	assert.Contains(t, prompt, "orchestral, taiko", "style tags forwarded")
	assert.Contains(t, prompt, "combat", "scene forwarded")
	assert.Contains(t, prompt, "no vocals", "instrumental asked for explicitly")
	assert.Contains(t, prompt, "loopable", "BGM must be loopable")

	// Duration is clamped, not rejected: an absurd request still produces a track.
	_, err = svc.GenerateMusic(ctx, "acct-1", ai.MusicRequest{Prompt: "x", DurationSec: 99999})
	require.NoError(t, err)
	assert.EqualValues(t, 300, sawBody["duration"], "duration clamped to the max")

	// Omitted duration falls back to the default.
	_, err = svc.GenerateMusic(ctx, "acct-1", ai.MusicRequest{Prompt: "x"})
	require.NoError(t, err)
	assert.EqualValues(t, 45, sawBody["duration"], "zero duration → default")

	assert.NotContains(t, logs.String(), testKey, "the API key must never be logged")
}

// ai-music-provider-error: a music provider failure surfaces as a clean
// 502-style error (no key echo), never a silent stub fallback.
func TestMusicProviderFailure(t *testing.T) {
	testkit.Cover(t, "ai-music-provider-error")
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "kaboom", http.StatusInternalServerError)
	}))
	t.Cleanup(provider.Close)

	_, err := svc.SaveConfig(ai.Update{
		Enabled:      ptr(true),
		MusicBaseURL: ptr(provider.URL + "/v1"),
		MusicModel:   ptr("music-1"),
		APIKey:       ptr(testKey),
	})
	require.NoError(t, err)

	_, err = svc.GenerateMusic(ctx, "acct-1", ai.MusicRequest{Prompt: "battle theme"})
	require.Error(t, err)
	assert.NotContains(t, err.Error(), testKey, "a provider error must not echo the key")
}

// ai-music-rate-limit: music has its OWN, much tighter budget than icon/text so
// an expensive per-track capability cannot drain the cheap one (or be drained
// by it). Spending the whole music budget leaves text generation working.
func TestMusicRateLimitIsSeparate(t *testing.T) {
	testkit.Cover(t, "ai-music-rate-limit")
	svc, _, _ := newSvc(t)
	ctx := context.Background()

	limited := false
	for i := 0; i < 12; i++ {
		_, err := svc.GenerateMusic(ctx, "composer", ai.MusicRequest{Prompt: "battle theme"})
		if err != nil {
			assert.Contains(t, err.Error(), "too many", "only a rate-limit error is expected")
			limited = true
			break
		}
	}
	assert.True(t, limited, "the per-account music budget must kick in")

	// The shared icon/text budget is untouched by the music spend.
	_, err := svc.GenerateText(ctx, "composer", "生成英雄描述", "description", "")
	require.NoError(t, err, "music must not drain the icon/text budget")
}

// ai-music-key-never-returned: the music endpoints are configured with the same
// server-side key as every other capability, and that key is never exposed by
// the masked config view even once music is fully configured.
func TestMusicConfigNeverLeaksKey(t *testing.T) {
	testkit.Cover(t, "ai-music-key-never-returned")
	svc, store, _ := newSvc(t)

	pub, err := svc.SaveConfig(ai.Update{
		Enabled:      ptr(true),
		MusicBaseURL: ptr("https://api.example.com/v1"),
		MusicModel:   ptr("music-1"),
		APIKey:       ptr(testKey),
	})
	require.NoError(t, err)
	assert.True(t, pub.MusicReady)
	assert.True(t, pub.HasKey)
	assert.NotEqual(t, testKey, pub.APIKeyMasked)

	blob, err := json.Marshal(pub)
	require.NoError(t, err)
	assert.NotContains(t, string(blob), testKey, "the raw key must never be in the public view")
	assert.Contains(t, string(blob), "musicBaseUrl", "music config is part of the public view")

	// The raw key DOES live server-side on disk (that is the whole design).
	var onDisk map[string]any
	require.NoError(t, store.Get("config", "ai-provider", &onDisk))
	assert.Equal(t, testKey, onDisk["apiKey"], "the key is stored server-side")
	assert.Equal(t, "music-1", onDisk["musicModel"])
}

// ai-image-dialect: the outbound IMAGE request must match the dialect the
// configured model actually speaks.
//
// This is a REGRESSION TEST FOR A TOTAL OUTAGE, not a nicety. The original
// request hard-coded the DALL·E shape — `response_format: "b64_json"` plus a
// size straight off the 16..1024 clamp (default 256). Against the current
// image models BOTH fields are hard 400s: the parameter is rejected outright
// and 256x256 is not a size they offer. Every icon generation failed, and no
// amount of configuring a key would have fixed it.
func TestImageRequestDialect(t *testing.T) {
	testkit.Cover(t, "ai-image-dialect")

	newProviderSvc := func(t *testing.T, model string, handler http.HandlerFunc) (*ai.Service, *httptest.Server) {
		t.Helper()
		svc, _, _ := newSvc(t)
		provider := httptest.NewServer(handler)
		t.Cleanup(provider.Close)
		_, err := svc.SaveConfig(ai.Update{
			Enabled:      ptr(true),
			ImageBaseURL: ptr(provider.URL + "/v1"),
			ImageModel:   ptr(model),
			APIKey:       ptr(testKey),
		})
		require.NoError(t, err)
		return svc, provider
	}

	tinyPNG, err := ai.PlaceholderPNG("seed", 16)
	require.NoError(t, err)

	t.Run("current models: no response_format, and a size they accept", func(t *testing.T) {
		var body map[string]any
		svc, _ := newProviderSvc(t, "gpt-image-1", func(w http.ResponseWriter, r *http.Request) {
			_ = json.NewDecoder(r.Body).Decode(&body)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"data": []map[string]any{{"b64_json": base64.StdEncoding.EncodeToString(tinyPNG)}},
			})
		})
		// ask for the 64px the game actually renders — the old code sent 64x64
		got, err := svc.GenerateIcon(context.Background(), "acct-1", "a dragon", "", 64)
		require.NoError(t, err)
		assert.False(t, got.Stub)
		assert.NotContains(t, body, "response_format", "the current models REJECT this parameter")
		assert.Equal(t, "1024x1024", body["size"], "the only square the current models accept")
	})

	t.Run("legacy DALL·E: response_format kept, size snapped UP to a supported edge", func(t *testing.T) {
		var body map[string]any
		svc, _ := newProviderSvc(t, "dall-e-3", func(w http.ResponseWriter, r *http.Request) {
			_ = json.NewDecoder(r.Body).Decode(&body)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"data": []map[string]any{{"b64_json": base64.StdEncoding.EncodeToString(tinyPNG)}},
			})
		})
		_, err := svc.GenerateIcon(context.Background(), "acct-1", "a dragon", "", 300)
		require.NoError(t, err)
		assert.Equal(t, "b64_json", body["response_format"], "the legacy models need it or they return an expiring URL")
		// snapped UP, never down: a caller must not silently get less than it asked for
		assert.Equal(t, "512x512", body["size"])
	})

	t.Run("a provider that answers with a URL still yields bytes", func(t *testing.T) {
		var images *httptest.Server
		images = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			assert.Empty(t, r.Header.Get("Authorization"), "the API key must never be sent to the image host")
			_, _ = w.Write(tinyPNG)
		}))
		t.Cleanup(images.Close)
		svc, _ := newProviderSvc(t, "some-other-model", func(w http.ResponseWriter, r *http.Request) {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"data": []map[string]any{{"url": images.URL + "/img.png"}},
			})
		})
		got, err := svc.GenerateIcon(context.Background(), "acct-1", "a dragon", "", 64)
		require.NoError(t, err)
		assert.Equal(t, tinyPNG, got.PNG)
	})

	t.Run("an empty data array is still a clean provider error", func(t *testing.T) {
		svc, _ := newProviderSvc(t, "gpt-image-1", func(w http.ResponseWriter, r *http.Request) {
			_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]any{}})
		})
		_, err := svc.GenerateIcon(context.Background(), "acct-1", "a dragon", "", 64)
		require.Error(t, err)
		assert.NotContains(t, err.Error(), testKey)
	})
}
