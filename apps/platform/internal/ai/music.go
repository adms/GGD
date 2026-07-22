package ai

import (
	"context"
	"fmt"
	"strings"

	"github.com/ggd/platform/internal/httpx"
)

// music.go is the BGM-generation capability of the AI proxy: policy (rate
// limit, validation, stub-vs-real) plus the outbound provider call. It mirrors
// the TTS capability exactly — same server-side key handling, same stub
// contract, same clean provider errors — and differs only in what it asks for.
//
// STUB CONTRACT (the shipped default). Like TTS and unlike icon/text, there is
// no meaningful placeholder: a fake 45-second track would be worse than no
// track. So an unconfigured proxy returns Stub=true with NO audio and the
// handler answers 501 naming the local fallback — which for music is a real
// one: tools/bgm-gen synthesises the whole pack offline and deterministically,
// with no provider and no licence question. The shipped BGM was made that way.
//
// PROVIDER SEAM (task #53 — Suno / Stability / Replicate). Everything
// provider-specific is behind generateMusicAudio below. It currently speaks one
// shape: an OpenAI-compatible POST {base}/audio/music that returns the audio
// bytes synchronously, which is what the config's musicBaseUrl/musicModel
// describe. The real services differ in two ways that #53 has to absorb there
// and NOWHERE ELSE:
//
//   - They are ASYNC. Suno and Replicate return a job id; the audio is fetched
//     by polling. That polling belongs inside generateMusicAudio (or a
//     per-provider implementation selected the way isAnthropic selects the text
//     shape) so GenerateMusic keeps returning finished bytes.
//   - They need a LONGER deadline than the shared 60s providerTimeout on
//     s.http. A per-provider client with its own timeout is the intended fix;
//     s.http stays the injection point tests use.
//
// The request/response contract of GenerateMusic — prompt in, MP3 bytes out,
// flagged stub — is what the client and the handler depend on, so #53 can
// rewrite the adapter without touching either.

// MusicResult is the outcome of a music generation. Like TTSResult there is NO
// stub audio: in stub mode Audio is nil and Stub is true.
type MusicResult struct {
	// Audio is the raw encoded track from the provider (nil in stub mode).
	Audio []byte
	// MIME is the audio content type ("audio/mpeg" for MP3).
	MIME string
	// Stub reports that no music provider was configured (no audio produced).
	Stub bool
}

// MusicRequest is one BGM generation. Only Prompt is required; the rest shape
// the track so a generated cue can be dropped into the existing pack.
type MusicRequest struct {
	// Prompt describes the music to generate (required).
	Prompt string
	// Scene is the optional audio-map scene key the track is destined for
	// ("menu", "combat", …). It is a label for the prompt, not a lookup.
	Scene string
	// Tags is an optional free-form style/genre hint ("orchestral, taiko").
	Tags string
	// DurationSec is the requested length; clamped to [minMusicSec, maxMusicSec].
	DurationSec int
	// Instrumental asks for no vocals. Game BGM is normally instrumental, so
	// this defaults ON at the handler unless a caller says otherwise.
	Instrumental bool
	// Seed makes a provider run reproducible where the provider supports it
	// (0 = let the provider choose).
	Seed int
}

// clampDuration normalizes a requested track length in seconds.
func clampDuration(sec int) int {
	if sec == 0 {
		return defaultMusicSec
	}
	if sec < minMusicSec {
		return minMusicSec
	}
	if sec > maxMusicSec {
		return maxMusicSec
	}
	return sec
}

// GenerateMusic returns a generated BGM track. Unconfigured => Stub=true with
// NO audio (the caller falls back to tools/bgm-gen). Configured => the encoded
// track from the provider; a provider failure surfaces as a clean 502-style
// error, never a silent stub.
func (s *Service) GenerateMusic(ctx context.Context, accountID string, req MusicRequest) (MusicResult, error) {
	prompt, err := validatePrompt(req.Prompt)
	if err != nil {
		return MusicResult{}, err
	}
	req.Prompt = prompt

	req.Scene = strings.TrimSpace(req.Scene)
	if len(req.Scene) > maxMusicSceneLen {
		return MusicResult{}, httpx.BadRequest("scene name too long")
	}
	req.Tags = strings.TrimSpace(req.Tags)
	if len(req.Tags) > maxMusicTagsLen {
		return MusicResult{}, httpx.BadRequest("tags too long")
	}
	req.DurationSec = clampDuration(req.DurationSec)

	ok, err := s.allowMusic(ctx, accountID)
	if err != nil {
		return MusicResult{}, err
	}
	if !ok {
		return MusicResult{}, httpx.RateLimited("too many music generations, slow down")
	}

	cfg, err := s.repo.Load()
	if err != nil {
		return MusicResult{}, err
	}
	if !cfg.musicReady() {
		return MusicResult{Stub: true}, nil
	}

	audio, perr := s.generateMusicAudio(ctx, cfg, req)
	if perr != nil {
		return MusicResult{}, providerFailure(perr)
	}
	return MusicResult{Audio: audio, MIME: "audio/mpeg", Stub: false}, nil
}

// musicPrompt shapes the outbound prompt: the caller's description first, then
// the style tags, then the scene the cue is for, then the one instruction that
// makes a track usable as game BGM (loopable, no vocals when instrumental).
func musicPrompt(req MusicRequest) string {
	var b strings.Builder
	b.WriteString(req.Prompt)
	if req.Tags != "" {
		b.WriteString(". Style: ")
		b.WriteString(req.Tags)
	}
	if req.Scene != "" {
		b.WriteString(". For the ")
		b.WriteString(req.Scene)
		b.WriteString(" screen of a fantasy arena game")
	}
	if req.Instrumental {
		b.WriteString(". Instrumental only, no vocals, no lyrics")
	}
	b.WriteString(". Seamlessly loopable, consistent tempo, no fade-in and no fade-out.")
	return b.String()
}

// generateMusicAudio calls the configured music provider and returns the raw
// encoded track. THIS IS THE PROVIDER SEAM described at the top of the file:
// task #53 replaces the body with real Suno/Stability/Replicate adapters and
// nothing above it changes. The server-side key is attached by authHeaders and
// is never logged.
func (s *Service) generateMusicAudio(ctx context.Context, cfg Config, req MusicRequest) ([]byte, error) {
	url := joinURL(cfg.MusicBaseURL, "/audio/music")
	body := map[string]any{
		"model":           cfg.MusicModel,
		"prompt":          musicPrompt(req),
		"duration":        req.DurationSec,
		"response_format": "mp3",
	}
	if req.Instrumental {
		body["instrumental"] = true
	}
	if req.Seed != 0 {
		body["seed"] = req.Seed
	}
	return s.doBinary(ctx, url, cfg, isAnthropic(cfg.MusicBaseURL), body)
}

// musicStubMessage is the 501 body's human-readable half. It names the local
// generator on purpose: unlike the TTS fallback this one produces the real,
// shipped article, so "not configured" is not a broken state.
func musicStubMessage() string {
	return fmt.Sprintf(
		"no music provider configured; generate BGM locally instead: %s",
		"python3 tools/bgm-gen/src/render.py <scene>")
}
